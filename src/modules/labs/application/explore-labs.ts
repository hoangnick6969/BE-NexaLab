import { BadRequestException, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, type AuditActor } from "../../../common/audit";
import { reagentById, validateChemistryLabConfig, type ChemistryLabConfig } from "../../../../packages/sim/wet-bench";
import { activityDigest } from "./sim-packs";

/** Fields every Explore bench config carries (P0 C1). */
type ExploreConfig = { labId: string; kit: string; engine: string; title: string };
type BenchValidation = { ok: true; config: ExploreConfig } | { ok: false; errors: string[] };
type ExploreBench = {
  kit: string;
  modelRef: string;
  validate: (raw: unknown) => BenchValidation;
  /** PracticalActivityVersion.spec without `explore`, built from the validated config. */
  activitySpec: (config: any) => Record<string, unknown>;
};

function wetBenchSpec(config: ChemistryLabConfig) {
  const reagents = config.availableReagents.map((item) => reagentById(item.reagentId)!);
  return {
    objective: config.outcomeSummary.join(" "),
    outcomes: config.outcomeSummary,
    materials: {
      reagents: reagents.map((reagent) => ({ id: reagent.id, label: reagent.labelVi, hazard: reagent.hazard })),
      apparatus: config.enabledApparatus.map((item) => ({ id: item.id, kind: item.kind, label: item.labelVi ?? item.kind })),
    },
    setup: "Bàn hoá ướt K2: kệ hoá chất, vật chứa và dụng cụ đo theo cấu hình bộ Kit.",
    procedure: "Khám phá tự do: học sinh tự chọn hoá chất, vật chứa và dụng cụ đo; không có trình tự bắt buộc.",
    observations: (config.pedagogy.observationPrompts ?? []).map((prompt) => prompt.textVi),
    observationPrompts: config.pedagogy.observationPrompts ?? [],
    safety: {
      simulation: config.safetyBriefing.simulation,
      realLab: config.safetyBriefing.realLab,
      reagentNotes: reagents.map((reagent) => ({ id: reagent.id, sim: reagent.safetyNoteSim, realLab: reagent.safetyNoteRealLab })),
    },
    limitations: config.limitations,
    modality: "explore",
    scored: false,
    outcomeCodes: [],
    sources: [{ kind: "technical_draft", status: "unverified", description: "Dữ liệu hoá học K2 chờ reviewer môn Hoá duyệt." }],
    engine: config.engine,
    kit: config.kit,
    configVersion: config.configVersion,
  };
}

/** Server bench registry (P0 C2.3): only benches listed here can be published or resolved. */
export const EXPLORE_BENCHES: Record<string, ExploreBench> = {
  "k2-wet-bench@1": {
    kit: "k2-wet-bench@1",
    modelRef: "wet-bench@1.0.0",
    validate: (raw) => {
      const result = validateChemistryLabConfig(raw);
      if (!result.ok) return { ok: false, errors: result.errors };
      if (result.config.modes.guided) return { ok: false, errors: ["modes.guided: Explore-only Labs cannot declare a guided mode"] };
      return { ok: true, config: result.config };
    },
    activitySpec: wetBenchSpec,
  },
};

const line = z.string().min(1);
/** Explore-only activity spec. Guided specs keep using `activitySpecSchema`. */
export const exploreActivitySpecSchema = z
  .object({
    objective: line,
    outcomes: z.array(line).min(1),
    materials: z.object({ reagents: z.array(z.object({ id: line }).passthrough()), apparatus: z.array(z.object({ id: line }).passthrough()) }).strict(),
    setup: line,
    procedure: line,
    observations: z.array(line),
    observationPrompts: z.array(z.object({ id: line }).passthrough()),
    safety: z.object({ simulation: z.unknown(), realLab: z.unknown(), reagentNotes: z.array(z.object({ id: line }).passthrough()) }).strict(),
    limitations: z.unknown(),
    modality: z.literal("explore"),
    scored: z.literal(false),
    outcomeCodes: z.array(line).max(0),
    sources: z.array(z.object({ kind: line, status: line, description: line }).strict()).min(1),
    engine: line,
    kit: line,
    configVersion: z.number().int().positive(),
    /** Full bench config, validated by the bench validator before it is written. */
    explore: z.object({ labId: line, kit: line, engine: line }).passthrough(),
  })
  .strict();

export type PublishExploreInput = { config: unknown; topicCode: string; actor: NonNullable<AuditActor>; reason: string };

/**
 * The only write path for a Foundational Explore Lab (P0 C1.3). Seed and Admin API both call it.
 * Pins the full bench config in an immutable PracticalActivityVersion (reused when the digest is
 * unchanged) and points `Lab.config` at it.
 */
export async function publishExploreLab(db: PrismaClient, input: PublishExploreInput) {
  const kit = (input.config as { kit?: unknown } | null)?.kit;
  const bench = typeof kit === "string" ? EXPLORE_BENCHES[kit] : undefined;
  if (!bench) throw new UnprocessableEntityException({ code: "EXPLORE_KIT_UNSUPPORTED", message: `Bàn ${String(kit)} chưa có trong registry server` });
  const validation = bench.validate(input.config);
  if (!validation.ok) throw new UnprocessableEntityException({ code: "EXPLORE_CONFIG_INVALID", errors: validation.errors });
  const config = validation.config;
  const spec = exploreActivitySpecSchema.parse({ ...bench.activitySpec(config), explore: config });
  const digest = activityDigest(spec);
  const key = `${config.labId}-explore`;

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:explore-publish:" + config.labId);
    const existing = await tx.lab.findUnique({ where: { id: config.labId }, select: { simulationModelRef: true, _count: { select: { releases: true, challenges: true } } } });
    if (existing && (existing._count.challenges || existing._count.releases || existing.simulationModelRef !== bench.modelRef))
      throw new ConflictException({ code: "EXPLORE_LAB_HAS_GUIDED", message: "Lab đã có challenge, release hoặc mô hình khác; không ghi Explore lên Lab này" });
    if (await tx.foundationalCourseLesson.findFirst({ where: { foundationalLabId: config.labId, courseVersion: { status: "active" } }, select: { lessonId: true } }))
      throw new ConflictException({ code: "EXPLORE_LAB_IN_COURSE", message: "Lab đang là foundationalLabId của một khóa active" });
    const topic = await tx.curriculumTopic.findUnique({ where: { code: input.topicCode }, include: { chapter: true } });
    if (!topic) throw new BadRequestException({ code: "LAB_TOPIC_MAPPING_REQUIRED" });

    const found = await tx.practicalActivityVersion.findUnique({ where: { key_digest: { key, digest } }, select: { id: true, version: true } });
    const latest = found ? null : await tx.practicalActivityVersion.findFirst({ where: { key }, orderBy: { version: "desc" }, select: { version: true } });
    const activity = found ?? await tx.practicalActivityVersion.create({
      data: { key, version: (latest?.version ?? 0) + 1, digest, spec: spec as Prisma.InputJsonValue, reviews: [], createdById: input.actor.sub },
      select: { id: true, version: true },
    });
    const labConfig = { mode: "explore", kit: config.kit, engine: config.engine, activity: { id: activity.id, key, version: activity.version, digest } };
    const data = {
      subjectId: topic.chapter.subjectId, grade: topic.chapter.grade, title: config.title, topic: topic.title, topicCode: topic.code,
      learningObjective: spec.outcomes[0], status: "published", scope: "SHARED_LIBRARY" as const, releaseCleared: true, synthetic: false,
      simulationModelRef: bench.modelRef, config: labConfig,
    };
    await tx.lab.upsert({ where: { id: config.labId }, create: { id: config.labId, ...data }, update: data });
    await audit(tx, { actor: input.actor, action: "lab.explore.publish", targetType: "Lab", targetId: config.labId, reason: input.reason,
      after: { labId: config.labId, mode: "explore", version: activity.version, status: "published", scope: "SHARED_LIBRARY" } });
    return { labId: config.labId, activity: labConfig.activity, activityCreated: !found, labCreated: !existing };
  });
}
