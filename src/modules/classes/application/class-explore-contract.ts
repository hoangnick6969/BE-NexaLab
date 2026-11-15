/**
 * Class Explore (P0 C3): a teacher's choice inside a Foundational Explore Lab template, pinned as a class resource, copied as
 * a snapshot onto each assignment, and answered by students with measurements and an explanation. Never a run, a verdict or progress.
 */
import { BadRequestException, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";
import { classSelectionSchema } from "../../../../packages/sim/wet-bench";
import { EXPLORE_BENCHES, loadPinnedExploreLab } from "../../labs/application/explore-labs";
import { digest } from "../../labs/application/lab-run";

const identifier = z.string().trim().min(1).max(100);
const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const exploreRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("measure"), itemId: identifier, measurement: z.literal("ph_meter"), unit: z.literal("tenthsPh") }).strict(),
  z.object({ kind: z.literal("explain") }).strict(),
]);
export type ExploreRequirement = z.infer<typeof exploreRequirementSchema>;

/** What the teacher sends: the Lab, ids picked inside one template, and optional instructions. */
export const exploreResourceInputSchema = z.object({
  source: z.object({ labId: identifier }).strict(),
  selection: classSelectionSchema,
  instructions: z.string().trim().max(10_000).default(""),
}).strict();

/** What the class resource pins (C3.4): the exact Lab version, the picked template and selection, the digest of the effective config. */
export const exploreResourceContentSchema = z.object({
  source: z.object({ mode: z.literal("explore"), labId: identifier, activityVersionId: identifier, activityDigest: hex64 }).strict(),
  templateId: identifier,
  selection: classSelectionSchema,
  effectiveConfigDigest: hex64,
  requirements: z.array(exploreRequirementSchema).min(1).max(12),
  instructions: z.string().max(10_000),
}).strict();

function derive(kit: string, config: unknown, selection: unknown) {
  const bench = EXPLORE_BENCHES[kit];
  if (!bench?.deriveClass) throw new UnprocessableEntityException({ code: "EXPLORE_CLASS_UNSUPPORTED", message: `Bàn ${kit} chưa hỗ trợ Class Explore` });
  const result = bench.deriveClass(config, selection);
  if (!result.ok) throw new UnprocessableEntityException({ code: "EXPLORE_SELECTION_INVALID", errors: result.errors });
  return result;
}

/** Draft or revise: validates the selection against the Lab's current pinned template and pins the result. */
export async function buildExploreResource(db: any, raw: unknown) {
  const input = exploreResourceInputSchema.parse(raw);
  const { resolved } = await loadPinnedExploreLab(db, input.source.labId);
  const derived = derive(resolved.kit, resolved.config, input.selection);
  return exploreResourceContentSchema.parse({
    source: { mode: "explore", labId: input.source.labId, activityVersionId: resolved.activity.id, activityDigest: resolved.activity.digest },
    templateId: derived.templateId,
    selection: input.selection,
    effectiveConfigDigest: digest(derived.config),
    requirements: derived.requirements,
    instructions: input.instructions,
  });
}

/** The same input a stored resource was built from, so publish can rebuild and compare. */
export const exploreInputOf = (content: z.infer<typeof exploreResourceContentSchema>) => ({
  source: { labId: content.source.labId }, selection: content.selection, instructions: content.instructions,
});

/** What an assignment carries (C3.4): students open and submit against this, never against the class resource. */
export const exploreSnapshotSchema = z.object({
  resourceId: identifier,
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  labId: identifier,
  activity: z.object({ id: identifier, key: identifier, version: z.number().int().positive(), digest: hex64 }).strict(),
  templateId: identifier,
  selection: classSelectionSchema,
  promptId: identifier,
  instructions: z.string().max(10_000),
  requirements: z.array(exploreRequirementSchema).min(1).max(12),
  effectiveConfig: z.record(z.string(), z.unknown()),
  effectiveConfigDigest: hex64,
  contentDigest: hex64,
}).strict();
export type ExploreSnapshot = z.infer<typeof exploreSnapshotSchema>;

/** Snapshot for assigning a published EXPLORE_LAB resource; refuses when the Lab has moved on since publication. */
export async function buildExploreSnapshot(db: any, resource: { id: string; version: number; title: string; content: unknown }): Promise<ExploreSnapshot> {
  const content = exploreResourceContentSchema.parse(resource.content);
  const { resolved } = await loadPinnedExploreLab(db, content.source.labId);
  if (resolved.activity.id !== content.source.activityVersionId || resolved.activity.digest !== content.source.activityDigest)
    throw new ConflictException({ code: "EXPLORE_SOURCE_CHANGED", message: "Lab nguồn đã có phiên bản mới; hãy tạo lại bài từ phiên bản hiện tại" });
  const derived = derive(resolved.kit, resolved.config, content.selection);
  const effectiveConfigDigest = digest(derived.config);
  if (effectiveConfigDigest !== content.effectiveConfigDigest) throw new ConflictException({ code: "EXPLORE_SOURCE_CHANGED" });
  const fields = {
    resourceId: resource.id, version: resource.version, title: resource.title, labId: content.source.labId,
    activity: resolved.activity, templateId: derived.templateId, selection: content.selection, promptId: derived.promptId,
    instructions: content.instructions, requirements: derived.requirements,
    effectiveConfig: derived.config as Record<string, unknown>, effectiveConfigDigest,
  };
  return exploreSnapshotSchema.parse({ ...fields, contentDigest: digest(fields) });
}

export function verifyExploreSnapshot(value: unknown): ExploreSnapshot {
  const parsed = exploreSnapshotSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException({ code: "EXPLORE_SNAPSHOT_INVALID" });
  const { contentDigest, ...fields } = parsed.data;
  if (digest(fields) !== contentDigest || digest(parsed.data.effectiveConfig) !== parsed.data.effectiveConfigDigest)
    throw new BadRequestException({ code: "EXPLORE_SNAPSHOT_INVALID" });
  return parsed.data;
}

/** The only student projection of a snapshot: no resource id, template or selection internals. */
export function studentExploreSnapshot(snapshot: ExploreSnapshot) {
  return {
    title: snapshot.title, labId: snapshot.labId, activity: snapshot.activity, instructions: snapshot.instructions,
    requirements: snapshot.requirements, effectiveConfig: snapshot.effectiveConfig, effectiveConfigDigest: snapshot.effectiveConfigDigest,
  };
}

export const EXPLORE_EXPLANATION_MAX = 2000;
export const exploreAnswersSchema = z.object({
  measures: z.array(z.object({ itemId: identifier, tenthsPh: z.number().int().min(0).max(140) }).strict()).max(12).default([]),
  explanation: z.string().trim().min(1).max(EXPLORE_EXPLANATION_MAX).optional(),
}).strict();
export type ExploreAnswers = z.infer<typeof exploreAnswersSchema>;

/** The answers must be exactly what the requirements ask: one value per measured item, an explanation when asked, nothing else. */
export function assertExploreAnswers(requirements: readonly ExploreRequirement[], answers: ExploreAnswers) {
  const details: Array<{ path: string; message: string }> = [];
  const wanted = requirements.flatMap((item) => (item.kind === "measure" ? [item.itemId] : []));
  const given = answers.measures.map((item) => item.itemId);
  for (const itemId of wanted) if (!given.includes(itemId)) details.push({ path: `measures.${itemId}`, message: "Thiếu số đo" });
  for (const itemId of new Set(given)) {
    if (!wanted.includes(itemId)) details.push({ path: `measures.${itemId}`, message: "Mẫu này không nằm trong bài" });
    if (given.filter((other) => other === itemId).length > 1) details.push({ path: `measures.${itemId}`, message: "Mỗi mẫu chỉ nộp một số đo" });
  }
  const explain = requirements.some((item) => item.kind === "explain");
  if (explain && !answers.explanation) details.push({ path: "explanation", message: "Cần viết lời giải thích" });
  if (!explain && answers.explanation) details.push({ path: "explanation", message: "Bài này không yêu cầu lời giải thích" });
  if (details.length) throw new UnprocessableEntityException({ code: "EXPLORE_ANSWER_INVALID", details });
}
