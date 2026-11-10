import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../../../db/db";
import { audit } from "../../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../../common/idempotency";
import { ownedClass } from "../../../classes/application/class-access";
import { classArchived } from "../../../classes/application/class-common";
import { applyPatternVisibility, engineFor, evaluateActiveInsights, type Insight, type ExplanationFact, type InsightEvidence, type SimilarityFact } from "./index";
import { INSIGHTS_CONFIG, type InsightsConfig } from "./insights-config";
import { loadClassEvidence, type AckRow } from "./insights-loader";

export const insightsQuerySchema = z.object({ status: z.enum(["open", "all"]).default("open") }).strict();
export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

const noteSchema = z
  .string()
  .transform((value) => value.trim().normalize("NFC"))
  .refine((value) => [...value].length <= 500, "note too long")
  .transform((value) => (value === "" ? null : value));
export const acknowledgementBodySchema = z
  .object({ action: z.enum(["ACKNOWLEDGED", "DISMISSED"]), note: noteSchema.nullish().transform((value) => value ?? null) })
  .strict();

const collator = new Intl.Collator("vi");
const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Không tìm thấy học sinh hoặc insight trong lớp" });
const keyRequired = () => new BadRequestException({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Cần Idempotency-Key cho thao tác này" });
const stale = () => new ConflictException({ code: "INSIGHT_STALE", message: "Insight đã thay đổi do có bằng chứng mới; hãy tải lại danh sách" });

type Actor = { sub: string; role: string };

/** The teacher-facing view of one acknowledgement row: never the actor. */
const ackView = (row: AckRow) => ({ id: row.id, fingerprint: row.fingerprint, ruleVersion: row.ruleVersion, ruleCode: row.ruleCode, action: row.action, note: row.note, createdAt: row.createdAt });

/**
 * Teacher side of TAI-04. Insights are computed on read from immutable evidence by the versioned pure engine; only the
 * teacher's acknowledgements persist (append-only, keyed by fingerprint, newest row current).
 */
@Injectable()
export class InsightsService {
  // Explicit tokens: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(Db) private readonly db: Db, @Inject(INSIGHTS_CONFIG) private readonly config: InsightsConfig) {}

  /** Without `version` every active rule version runs; replay passes the stored version and runs only that one. */
  private compute(classId: string, studentId: string, evidence: InsightEvidence[], similarity: SimilarityFact[], explanations: ExplanationFact[], now: Date, version?: string): Insight[] {
    const input = { classId, studentId, evidence, similarity, explanations, now };
    const insights = version ? engineFor(version)?.(input) ?? [] : evaluateActiveInsights(input);
    return applyPatternVisibility(insights, this.config.showSuddenUnaidedPass);
  }

  /** Newest first when `desc`; the loader returns rows oldest first. */
  private static byFingerprint(rows: AckRow[]) {
    const map = new Map<string, AckRow[]>();
    for (const row of rows) map.set(row.fingerprint, [...(map.get(row.fingerprint) ?? []), row]);
    return map;
  }

  async classInsights(classId: string, query: unknown, actor: Actor) {
    const { status } = insightsQuerySchema.parse(query ?? {});
    const classroom = await ownedClass(this.db, classId, actor);
    const archived = classroom.status !== "ACTIVE";
    const { members, evidenceByStudent, similarityByStudent, explanationsByStudent, acknowledgements } = await loadClassEvidence(this.db, classId, { withEvidence: !archived });
    const acked = InsightsService.byFingerprint(acknowledgements);
    const now = new Date();
    const students = [...members]
      .sort((a, b) => collator.compare(a.displayName, b.displayName) || (a.id < b.id ? -1 : 1))
      .map((m) => {
        const all = archived ? [] : this.compute(classId, m.id, evidenceByStudent.get(m.id) ?? [], similarityByStudent.get(m.id) ?? [], explanationsByStudent.get(m.id) ?? [], now);
        const insights = status === "open"
          ? all.filter((i) => !acked.has(i.fingerprint))
          : all.map((i) => {
              const latest = acked.get(i.fingerprint)?.at(-1);
              return { ...i, latestAcknowledgement: latest ? { action: latest.action, createdAt: latest.createdAt } : null };
            });
        return { studentId: m.id, displayName: m.displayName, insights };
      });
    return { classId, status, classArchived: archived, students };
  }

  async studentInsights(classId: string, studentId: string, query: unknown, actor: Actor) {
    const { status } = insightsQuerySchema.parse(query ?? {});
    const classroom = await ownedClass(this.db, classId, actor);
    const archived = classroom.status !== "ACTIVE";
    const { members, evidenceByStudent, similarityByStudent, explanationsByStudent, acknowledgements } = await loadClassEvidence(this.db, classId, { studentId, withEvidence: !archived });
    const member = members[0];
    if (!member) throw notFound();
    const acked = InsightsService.byFingerprint(acknowledgements);
    const all = archived ? [] : this.compute(classId, member.id, evidenceByStudent.get(member.id) ?? [], similarityByStudent.get(member.id) ?? [], explanationsByStudent.get(member.id) ?? [], new Date());
    const insights = status === "open"
      ? all.filter((i) => !acked.has(i.fingerprint))
      : all.map((i) => {
          const latest = acked.get(i.fingerprint)?.at(-1);
          return { ...i, latestAcknowledgement: latest ? { action: latest.action, createdAt: latest.createdAt } : null };
        });
    const rows = status === "open" ? [] : all.flatMap((i) => [...(acked.get(i.fingerprint) ?? [])].reverse().map(ackView));
    return { classId, studentId: member.id, displayName: member.displayName, status, classArchived: archived, insights, acknowledgements: rows };
  }

  /**
   * Appends one acknowledgement row. Order of checks: class owner (403), archived class (409), Idempotency-Key (400),
   * body and fingerprint format (400), approved student (404); inside the idempotent callback the fingerprint must be in
   * the student's current set (409 INSIGHT_STALE), so a replayed key still returns the stored row.
   */
  async acknowledge(classId: string, studentId: string, fingerprint: string, req: any, body: unknown) {
    const actor: Actor = req.user;
    const classroom = await ownedClass(this.db, classId, actor);
    if (classroom.status !== "ACTIVE") throw classArchived();
    const key = readIdempotencyKey(req);
    if (!key) throw keyRequired();
    const input = acknowledgementBodySchema.parse(body ?? {});
    const hash = fingerprintSchema.parse(fingerprint);
    const { members } = await loadClassEvidence(this.db, classId, { studentId, withEvidence: false });
    if (!members.length) throw notFound();
    return idempotent(
      this.db,
      { actorId: actor.sub, key, scope: `POST insights-acknowledgement:${classId}:${studentId}:${hash}`, payload: input },
      async (tx) => {
        const { evidenceByStudent, similarityByStudent, explanationsByStudent } = await loadClassEvidence(tx, classId, { studentId, acknowledgements: false });
        const hit = this.compute(classId, studentId, evidenceByStudent.get(studentId) ?? [], similarityByStudent.get(studentId) ?? [], explanationsByStudent.get(studentId) ?? [], new Date()).find((i) => i.fingerprint === hash);
        if (!hit) throw stale();
        const row = await tx.insightAcknowledgement.create({
          data: {
            classId,
            studentId,
            fingerprint: hash,
            ruleVersion: hit.ruleVersion,
            ruleCode: hit.ruleCode,
            evidenceIds: hit.evidence.map((e) => e.id).sort(),
            action: input.action,
            note: input.note,
            actorId: actor.sub,
          },
        });
        await audit(tx, {
          actor,
          action: "insight.acknowledge",
          targetType: "InsightAcknowledgement",
          targetId: row.id,
          after: { classId, studentId, ruleCode: hit.ruleCode, ruleVersion: hit.ruleVersion, action: input.action },
        });
        return { id: row.id, classId, studentId, fingerprint: hash, ruleVersion: row.ruleVersion, ruleCode: row.ruleCode, evidenceIds: row.evidenceIds, action: row.action, note: row.note, createdAt: row.createdAt };
      },
    );
  }

  /** Recomputes an insight as it stood at its earliest acknowledgement, with the stored rule version. */
  async replay(classId: string, studentId: string, fingerprint: string, actor: Actor) {
    await ownedClass(this.db, classId, actor);
    if (!fingerprintSchema.safeParse(fingerprint).success) throw notFound();
    const { members } = await loadClassEvidence(this.db, classId, { studentId, withEvidence: false });
    if (!members.length) throw notFound();
    const first = await this.db.insightAcknowledgement.findFirst({
      where: { classId, studentId, fingerprint },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!first || !engineFor(first.ruleVersion)) throw notFound();
    const { evidenceByStudent, similarityByStudent, explanationsByStudent } = await loadClassEvidence(this.db, classId, { studentId, acknowledgements: false, asOf: first.createdAt });
    const hit = this.compute(classId, studentId, evidenceByStudent.get(studentId) ?? [], similarityByStudent.get(studentId) ?? [], explanationsByStudent.get(studentId) ?? [], first.createdAt, first.ruleVersion).find((i) => i.fingerprint === fingerprint);
    if (!hit) throw notFound();
    return hit;
  }
}
