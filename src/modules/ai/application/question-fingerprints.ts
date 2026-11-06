import { createHash } from "node:crypto";
import { TX_LIMITS } from "../../../common/idempotency";
import { jaccard, normalizeText } from "./resource-items";

/**
 * TAI-03 Part A, `qdup@1` (similarity-algorithms.md): question/card duplicates across the teacher's own classes and
 * released shared-library lessons. Deterministic and local; nothing leaves the server. Changing a constant or step
 * needs a new algorithm version.
 */
export const QDUP_ALGORITHM = "qdup@1";
export const QDUP_NEAR_THRESHOLD = 0.85;
export const QDUP_MAX_MATCHES = 3;
/** Beyond this many corpus rows only exact matching runs and the caller reports CORPUS_TRUNCATED. */
export const QDUP_CORPUS_LIMIT = 10_000;

export type FingerprintSourceKind = "CLASS_RESOURCE" | "LIBRARY_LESSON";
export type FingerprintItem = { itemId: string; text: string };
export type QdupCorpusRow = {
  sourceKind: FingerprintSourceKind;
  sourceId: string;
  itemId: string;
  classId: string | null;
  normalizedText: string;
  normalizedHash: string;
  title: string;
};
export type QdupMatch = {
  level: "EXACT" | "NEAR";
  score: number;
  source: { kind: FingerprintSourceKind; resourceId?: string; lessonId?: string; title: string; classId?: string; itemId: string };
};

/** normalize from TAI-01 validation-rules.md (diacritics kept). */
export const qdupNormalize = (text: string) => normalizeText(text);
export const qdupHash = (normalized: string) => createHash("sha256").update(normalized).digest("hex");

/** Character trigrams of the normalized text padded with one space on each side (qdup@1 only). */
export function qdupTrigrams(normalized: string): Set<string> {
  const chars = Array.from(` ${normalized} `);
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i++) grams.add(chars.slice(i, i + 3).join(""));
  return grams;
}

/** Best matches first (exact before near, then score, then stable ids), at most QDUP_MAX_MATCHES. */
export function qdupMatch(text: string, corpus: QdupCorpusRow[], options: { exactOnly?: boolean } = {}): QdupMatch[] {
  const normalized = qdupNormalize(text);
  if (!normalized) return [];
  const hash = qdupHash(normalized);
  const grams = qdupTrigrams(normalized);
  const matches: Array<QdupMatch & { order: string }> = [];
  for (const row of corpus) {
    const exact = row.normalizedHash === hash;
    const score = exact ? 1 : options.exactOnly ? 0 : jaccard(grams, qdupTrigrams(row.normalizedText));
    if (!exact && score < QDUP_NEAR_THRESHOLD) continue;
    matches.push({
      level: exact ? "EXACT" : "NEAR",
      score: Math.round(score * 1000) / 1000,
      source: {
        kind: row.sourceKind,
        ...(row.sourceKind === "CLASS_RESOURCE" ? { resourceId: row.sourceId } : { lessonId: row.sourceId }),
        title: row.title,
        ...(row.classId ? { classId: row.classId } : {}),
        itemId: row.itemId,
      },
      order: `${row.sourceKind}:${row.sourceId}:${row.itemId}`,
    });
  }
  matches.sort((a, b) => (a.level === b.level ? 0 : a.level === "EXACT" ? -1 : 1) || b.score - a.score || a.order.localeCompare(b.order));
  return matches.slice(0, QDUP_MAX_MATCHES).map(({ order: _order, ...match }) => match);
}

/** Flag mapping: same class -> EXACT/NEAR_DUPLICATE; other own class or library -> *_ELSEWHERE. Warnings only. */
export function qdupFlag(match: QdupMatch, currentClassId: string | null) {
  const sameClass = match.source.kind === "CLASS_RESOURCE" && !!currentClassId && match.source.classId === currentClassId;
  if (match.level === "EXACT") return sameClass ? "EXACT_DUPLICATE" : "EXACT_DUPLICATE_ELSEWHERE";
  return sameClass ? "NEAR_DUPLICATE" : "NEAR_DUPLICATE_ELSEWHERE";
}

/** Questions (prompt) or cards (front) of a ClassResource content, keyed by their content ids. */
export function resourceFingerprintItems(kind: string, content: any): FingerprintItem[] {
  const rows = kind === "DECK" ? content?.cards ?? [] : content?.questions ?? [];
  return rows.flatMap((row: any) => {
    const text = kind === "DECK" ? row?.front : row?.prompt;
    return typeof row?.id === "string" && typeof text === "string" ? [{ itemId: row.id, text }] : [];
  });
}

/** Library questions students actually see: QUIZ and BASIC_EXERCISE step configs; Lesson.questions is never read. */
export function lessonFingerprintItems(steps: Array<{ id: string; type: string; config: any }>): FingerprintItem[] {
  return steps
    .filter((step) => step.type === "QUIZ" || step.type === "BASIC_EXERCISE")
    .flatMap((step) =>
      (Array.isArray(step.config?.questions) ? step.config.questions : []).flatMap((question: any) =>
        typeof question?.id === "string" && typeof question?.prompt === "string" ? [{ itemId: `${step.id}:${question.id}`, text: question.prompt }] : [],
      ),
    );
}

type DesiredRow = {
  sourceKind: FingerprintSourceKind;
  sourceId: string;
  sourceVersion: number;
  itemId: string;
  ownerTeacherId: string | null;
  classId: string | null;
  normalizedText: string;
  normalizedHash: string;
  algorithm: string;
};

function desiredRows(base: Omit<DesiredRow, "itemId" | "normalizedText" | "normalizedHash" | "algorithm">, items: FingerprintItem[]): DesiredRow[] {
  const seen = new Set<string>();
  const rows: DesiredRow[] = [];
  for (const item of items) {
    const normalizedText = qdupNormalize(item.text);
    if (!normalizedText || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    rows.push({ ...base, itemId: item.itemId, normalizedText, normalizedHash: qdupHash(normalizedText), algorithm: QDUP_ALGORITHM });
  }
  return rows;
}

/**
 * Diff-based so a rerun with unchanged sources inserts and deletes nothing (backfill no-op). A row whose text, owner or
 * class changed is replaced. Runs on the caller's transaction client.
 */
async function reconcile(tx: any, sourceKind: FingerprintSourceKind, sourceId: string, desired: DesiredRow[]) {
  const existing: Array<DesiredRow & { id: string }> = await tx.questionFingerprint.findMany({
    where: { sourceKind, sourceId, algorithm: QDUP_ALGORITHM },
  });
  const key = (row: { sourceVersion: number; itemId: string }) => `${row.sourceVersion}|${row.itemId}`;
  const same = (a: DesiredRow, b: DesiredRow) =>
    a.normalizedHash === b.normalizedHash && a.ownerTeacherId === b.ownerTeacherId && a.classId === b.classId;
  const wanted = new Map(desired.map((row) => [key(row), row]));
  const kept = new Set<string>();
  const stale: string[] = [];
  for (const row of existing) {
    const target = wanted.get(key(row));
    if (target && same(row, target)) kept.add(key(row));
    else stale.push(row.id);
  }
  const create = desired.filter((row) => !kept.has(key(row)));
  if (stale.length) await tx.questionFingerprint.deleteMany({ where: { id: { in: stale } } });
  if (create.length) await tx.questionFingerprint.createMany({ data: create });
  return { created: create.length, deleted: stale.length, total: desired.length };
}

/** Re-sync one ClassResource: archived or missing resources keep no rows. Call inside the resource's transaction. */
export async function syncClassResourceFingerprints(tx: any, resourceId: string) {
  const resource = await tx.classResource.findUnique({
    where: { id: resourceId },
    select: { id: true, version: true, classId: true, kind: true, status: true, content: true },
  });
  if (!resource || resource.status === "ARCHIVED") return reconcile(tx, "CLASS_RESOURCE", resourceId, []);
  const classroom = await tx.classroom.findUnique({ where: { id: resource.classId }, select: { teacherId: true } });
  return reconcile(
    tx,
    "CLASS_RESOURCE",
    resourceId,
    desiredRows(
      { sourceKind: "CLASS_RESOURCE", sourceId: resourceId, sourceVersion: resource.version, ownerTeacherId: classroom?.teacherId ?? null, classId: resource.classId },
      resourceFingerprintItems(resource.kind, resource.content),
    ),
  );
}

/** Re-sync one lesson: only SHARED_LIBRARY, published, non-synthetic lessons keep rows. Safe to call for any lesson. */
export async function syncLibraryLessonFingerprints(tx: any, lessonId: string) {
  const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, select: { id: true, scope: true, status: true, synthetic: true } });
  const eligible = !!lesson && lesson.scope === "SHARED_LIBRARY" && lesson.status === "published" && !lesson.synthetic;
  if (!eligible) return reconcile(tx, "LIBRARY_LESSON", lessonId, []);
  const steps = await tx.lessonStep.findMany({
    where: { lessonId, type: { in: ["QUIZ", "BASIC_EXERCISE"] } },
    select: { id: true, type: true, config: true },
    orderBy: { position: "asc" },
  });
  return reconcile(
    tx,
    "LIBRARY_LESSON",
    lessonId,
    desiredRows({ sourceKind: "LIBRARY_LESSON", sourceId: lessonId, sourceVersion: 1, ownerTeacherId: null, classId: null }, lessonFingerprintItems(steps)),
  );
}

/** Keeps ownerTeacherId in step with an admin class reassignment (same transaction). */
export async function reassignClassFingerprints(tx: any, classId: string, ownerTeacherId: string) {
  return tx.questionFingerprint.updateMany({ where: { sourceKind: "CLASS_RESOURCE", classId }, data: { ownerTeacherId } });
}

/**
 * The teacher's qdup corpus: their own classes plus released library lessons; other teachers' rows are never read.
 * Titles are resolved for the returned rows only. Over QDUP_CORPUS_LIMIT rows, only exact hashes are loaded.
 */
export async function loadQdupCorpus(db: any, teacherId: string, exactHashes?: string[]) {
  const scope = { algorithm: QDUP_ALGORITHM, OR: [{ sourceKind: "CLASS_RESOURCE", ownerTeacherId: teacherId }, { sourceKind: "LIBRARY_LESSON" }] };
  const size = await db.questionFingerprint.count({ where: scope });
  const truncated = size > QDUP_CORPUS_LIMIT;
  const rows = await db.questionFingerprint.findMany({
    where: truncated ? { ...scope, normalizedHash: { in: exactHashes ?? [] } } : scope,
    select: { sourceKind: true, sourceId: true, itemId: true, classId: true, normalizedText: true, normalizedHash: true },
  });
  const resourceIds = [...new Set(rows.filter((r: any) => r.sourceKind === "CLASS_RESOURCE").map((r: any) => r.sourceId))];
  const lessonIds = [...new Set(rows.filter((r: any) => r.sourceKind === "LIBRARY_LESSON").map((r: any) => r.sourceId))];
  const [resources, lessons] = await Promise.all([
    resourceIds.length ? db.classResource.findMany({ where: { id: { in: resourceIds } }, select: { id: true, title: true } }) : [],
    lessonIds.length ? db.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } }) : [],
  ]);
  const titles = new Map<string, string>([...resources, ...lessons].map((row: any) => [row.id, row.title]));
  const corpus: QdupCorpusRow[] = rows.map((row: any) => ({ ...row, title: titles.get(row.sourceId) ?? "" }));
  return { corpus, truncated };
}

/**
 * Backfill/reconcile every source (scripts/backfill-question-fingerprints.ts). One short transaction per source;
 * rows of deleted sources are removed. Idempotent: a second run reports created = deleted = 0.
 */
export async function backfillQuestionFingerprints(db: any) {
  const totals = { classResources: 0, libraryLessons: 0, orphanSources: 0, created: 0, deleted: 0 };
  /** Sources that could not be read (e.g. an enum value from an unmerged branch); reported, never fatal. */
  const failed: Array<{ sourceKind: FingerprintSourceKind; sourceId: string; error: string }> = [];
  const add = (result: { created: number; deleted: number }) => {
    totals.created += result.created;
    totals.deleted += result.deleted;
  };
  const run = async (sourceKind: FingerprintSourceKind, sourceId: string) => {
    try {
      add(
        await db.$transaction(
          (tx: any) => (sourceKind === "CLASS_RESOURCE" ? syncClassResourceFingerprints(tx, sourceId) : syncLibraryLessonFingerprints(tx, sourceId)),
          TX_LIMITS,
        ),
      );
    } catch (error) {
      failed.push({ sourceKind, sourceId, error: (error as { code?: string; name?: string })?.code ?? (error as Error)?.name ?? "ERROR" });
    }
  };
  const resources: Array<{ id: string }> = await db.classResource.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  for (const { id } of resources) await run("CLASS_RESOURCE", id);
  totals.classResources = resources.length;
  const lessons: Array<{ id: string }> = await db.lesson.findMany({ where: { scope: "SHARED_LIBRARY" }, select: { id: true }, orderBy: { id: "asc" } });
  for (const { id } of lessons) await run("LIBRARY_LESSON", id);
  totals.libraryLessons = lessons.length;
  const known = new Set([...resources.map((r) => `CLASS_RESOURCE:${r.id}`), ...lessons.map((l) => `LIBRARY_LESSON:${l.id}`)]);
  const sources: Array<{ sourceKind: FingerprintSourceKind; sourceId: string }> = await db.questionFingerprint.findMany({
    where: { algorithm: QDUP_ALGORITHM },
    distinct: ["sourceKind", "sourceId"],
    select: { sourceKind: true, sourceId: true },
  });
  for (const source of sources.filter((s) => !known.has(`${s.sourceKind}:${s.sourceId}`))) {
    totals.orphanSources++;
    await run(source.sourceKind, source.sourceId);
  }
  const fingerprints = await db.questionFingerprint.count({ where: { algorithm: QDUP_ALGORITHM } });
  return { ...totals, fingerprints, failed };
}
