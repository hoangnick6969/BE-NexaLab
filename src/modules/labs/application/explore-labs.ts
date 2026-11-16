import { BadRequestException, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit, type AuditActor } from "../../../common/audit";
import { deriveWetBenchEffectiveConfig, reagentById, validateChemistryLabConfig, type ChemistryLabConfig } from "../../../../packages/sim/wet-bench";
import { deriveLeverEffectiveConfig, LEVER_ENGINE, LEVER_KIT, validateLeverLabConfig, type LeverLabConfig } from "../../../../packages/sim/mechanics";
import type { ExploreRequirement } from "../../../../packages/sim/explore/requirements";
import { fl26MendelConfigSchema, type Fl26MendelConfig } from "../../../../packages/sim/mendel-config";
import { MENDEL_VERSION } from "../../../../packages/sim/mendel-cross";
import { dioramaExploreSchema, fl16ExploreSchema, fl27ExploreSchema } from "../../../../packages/sim/explore-kits";
import { activityDigest } from "./sim-packs";

/** Fields every Explore bench config carries (P0 C1). */
type ExploreConfig = { labId: string; kit: string; engine: string; title: string };
type BenchValidation = { ok: true; config: ExploreConfig } | { ok: false; errors: string[] };
/** What a bench derives for Class Explore (P0 C3.2): the config a student works in and what they must hand in. */
export type ClassDerivation =
  | { ok: true; config: unknown; requirements: ExploreRequirement[]; templateId: string; promptId: string }
  | { ok: false; errors: string[] };
type ExploreBench = {
  kit: string;
  /** One model per bench, or a function when one kit holds Labs on different models (k8-diorama). */
  modelRef: string | ((config: any) => string);
  /** The model a validated config runs on, when a kit has more than one engine version (the wet bench: 1.0.0 and 1.1.0). */
  modelRefOf?: (config: any) => string;
  validate: (raw: unknown) => BenchValidation;
  /** Absent when the bench has no Class Explore templates yet. */
  deriveClass?: (config: unknown, selection: unknown) => ClassDerivation;
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

const newtons = (milliNewtons: number) => `${(milliNewtons / 1000).toFixed(1).replace(".", ",")} N`;

function leverBenchSpec(config: LeverLabConfig) {
  return {
    objective: config.outcomeSummary.join(" "),
    outcomes: config.outcomeSummary,
    materials: {
      reagents: [],
      apparatus: config.enabledApparatus.map((item) => ({
        id: item.id, kind: item.kind, label: item.labelVi ?? item.kind,
        ...(item.kind === "weight_set" ? { forces: config.weights.availableMilliNewtons.map(newtons) } : {}),
      })),
    },
    setup: "Bàn cơ K5: thanh đòn 11 lỗ móc cách nhau 50 mm, điểm tựa O ở giữa, bộ quả nặng và lực kế theo cấu hình.",
    procedure: "Khám phá tự do: học sinh treo quả nặng, gắn lực kế và quan sát thanh; không có trình tự bắt buộc.",
    observations: (config.pedagogy.observationPrompts ?? []).map((prompt) => prompt.textVi),
    observationPrompts: config.pedagogy.observationPrompts ?? [],
    safety: { simulation: config.safetyBriefing.simulation, realLab: config.safetyBriefing.realLab, reagentNotes: [] },
    limitations: config.limitations,
    modality: "explore",
    scored: false,
    outcomeCodes: [],
    sources: [{ kind: "technical_assumption", status: "unverified", description: "Hằng số mô hình đòn bẩy (lever-bench-reference-v1) là giả định kỹ thuật, không phải số liệu SGK." }],
    engine: config.engine,
    kit: config.kit,
    configVersion: config.configVersion,
  };
}

/** Shared Explore spec for the INC-3 benches: the same fields as the wet bench, with no reagents. */
function benchSpec(config: any, setup: string, procedure: string, sourceText: string) {
  const prompts: Array<{ textVi: string }> = config.pedagogy?.observationPrompts ?? [];
  return {
    objective: config.outcomeSummary.join(" "),
    outcomes: config.outcomeSummary,
    materials: { reagents: [], apparatus: config.enabledApparatus.map((item: any) => ({ id: item.id, kind: item.kind, label: item.labelVi ?? item.kind })) },
    setup, procedure,
    observations: prompts.map((prompt) => prompt.textVi),
    observationPrompts: prompts,
    safety: { simulation: config.safetyBriefing.simulation, realLab: config.safetyBriefing.realLab, reagentNotes: [] },
    limitations: config.limitations,
    modality: "explore",
    scored: false,
    outcomeCodes: [],
    sources: [{ kind: "technical_draft", status: "unverified", description: sourceText }],
    engine: config.engine,
    kit: config.kit,
    configVersion: config.configVersion,
  };
}

function mendelSpec(config: Fl26MendelConfig) {
  const prompts = config.pedagogy.observationPrompts ?? [];
  return {
    objective: config.outcomeSummary.join(" "),
    outcomes: config.outcomeSummary,
    materials: {
      reagents: [],
      apparatus: config.enabledApparatus.map((item) => ({ id: item.id, kind: item.kind, label: item.labelVi ?? item.kind })),
    },
    setup: "Bàn di truyền: vườn thực nghiệm đậu Hà Lan mô phỏng và ma trận Punnett.",
    procedure: "Khám phá tự do: chọn cặp bố mẹ trong danh sách cho phép, quan sát ma trận Punnett và tỉ lệ đời con.",
    observations: prompts.map((prompt) => prompt.textVi),
    observationPrompts: prompts,
    safety: { simulation: config.safetyBriefing.simulation, realLab: config.safetyBriefing.realLab, reagentNotes: [] },
    limitations: config.limitations,
    modality: "explore",
    scored: false,
    outcomeCodes: [],
    sources: [{ kind: "technical_draft", status: "unverified", description: `Lai Mendel một tính trạng (${MENDEL_VERSION}); chờ reviewer sinh học duyệt và kiểm tra provenance K9.` }],
    engine: config.engine,
    kit: config.kit,
    configVersion: config.configVersion,
  };
}

/** Server bench registry (P0 C2.3): only benches listed here can be published or resolved. */
export const EXPLORE_BENCHES: Record<string, ExploreBench> = {
  "k8-garden": {
    kit: "k8-garden",
    modelRef: `mendel-cross@${MENDEL_VERSION}`,
    validate: (raw) => {
      const result = fl26MendelConfigSchema.safeParse(raw);
      if (!result.success) return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
      return { ok: true, config: result.data };
    },
    activitySpec: mendelSpec,
  },
  "k8-diorama": {
    kit: "k8-diorama",
    /** One kit, two models (FL-20 ecology-tolerance, FL-21 food-web): the config names the one it runs on. */
    modelRef: "food-web@1.0.0",
    modelRefOf: (config) => config.spec.model,
    validate: (raw) => {
      const result = dioramaExploreSchema.safeParse(raw);
      if (!result.success) return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
      return { ok: true, config: result.data };
    },
    activitySpec: (config) => config.catalogId === "FL-21"
      ? benchSpec(config, "Bàn sinh thái: lưới thức ăn mô phỏng với 11 loài.", "Khám phá tự do: bỏ một loài có trong danh sách cho phép và xem các loài bị ảnh hưởng trực tiếp.", "Lưới thức ăn minh hoạ; quan hệ và vai trò theo SGK KHTN 8 (food-web@1.0.0), chờ reviewer sinh học duyệt.")
      : benchSpec(config, "Bàn sinh thái: giới hạn nhiệt độ của một loài.", "Khám phá tự do: đặt nhiệt độ và xem vùng sống của loài.", "Giới hạn nhiệt độ minh hoạ (ecology-tolerance@1.0.0), chờ reviewer sinh học duyệt."),
  },
  "k7-molecular": {
    kit: "k7-molecular",
    modelRef: "gene-expression@1.0.0",
    validate: (raw) => {
      const result = fl27ExploreSchema.safeParse(raw);
      if (!result.success) return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
      return { ok: true, config: result.data };
    },
    activitySpec: (config) => benchSpec(config, "Bàn phân tử: một gene mô phỏng với mạch khuôn và mRNA.", "Khám phá tự do: chọn biến thể gene và xem đột biến đổi codon và axit amin như thế nào.", "Gene minh hoạ, không phải gene thật (gene-expression@1.0.0), chờ reviewer sinh học duyệt."),
  },
  anatomy: {
    kit: "anatomy",
    modelRef: "eye-optics@1.0.0",
    validate: (raw) => {
      const result = fl16ExploreSchema.safeParse(raw);
      if (!result.success) return { ok: false, errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
      return { ok: true, config: result.data };
    },
    activitySpec: (config) => benchSpec(config, "Studio cấu tạo mắt: mô hình quang học của mắt.", "Khám phá tự do: chọn một kịch bản và xem độ tụ cần có của thể thuỷ tinh.", "Mô hình quang học rút gọn (eye-optics@1.0.0), chờ SME duyệt theo checklist FL-16."),
  },
  "k2-wet-bench@1": {
    kit: "k2-wet-bench@1",
    modelRef: "wet-bench@1.0.0",
    modelRefOf: (config) => config.engine,
    validate: (raw) => {
      const result = validateChemistryLabConfig(raw);
      if (!result.ok) return { ok: false, errors: result.errors };
      if (result.config.modes.guided) return { ok: false, errors: ["modes.guided: Explore-only Labs cannot declare a guided mode"] };
      return { ok: true, config: result.config };
    },
    deriveClass: (config, selection) => {
      const checked = validateChemistryLabConfig(config);
      return checked.ok ? deriveWetBenchEffectiveConfig(checked.config, selection) : { ok: false, errors: checked.errors };
    },
    activitySpec: wetBenchSpec,
  },
  [LEVER_KIT]: {
    kit: LEVER_KIT,
    modelRef: LEVER_ENGINE,
    validate: (raw) => {
      const result = validateLeverLabConfig(raw);
      return result.ok ? { ok: true, config: result.config } : { ok: false, errors: result.errors };
    },
    deriveClass: (config, selection) => {
      const checked = validateLeverLabConfig(config);
      return checked.ok ? deriveLeverEffectiveConfig(checked.config, selection) : { ok: false, errors: checked.errors };
    },
    activitySpec: leverBenchSpec,
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
  const modelRef = bench.modelRefOf?.(config) ?? (typeof bench.modelRef === "function" ? bench.modelRef(config) : bench.modelRef);

  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "nexalab:explore-publish:" + config.labId);
    const existing = await tx.lab.findUnique({ where: { id: config.labId }, select: { simulationModelRef: true, _count: { select: { releases: true, challenges: true } } } });
    if (existing && (existing._count.challenges || existing._count.releases || existing.simulationModelRef !== modelRef))
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
      simulationModelRef: modelRef, config: labConfig,
    };
    await tx.lab.upsert({ where: { id: config.labId }, create: { id: config.labId, ...data }, update: data });
    await audit(tx, { actor: input.actor, action: "lab.explore.publish", targetType: "Lab", targetId: config.labId, reason: input.reason,
      after: { labId: config.labId, mode: "explore", version: activity.version, status: "published", scope: "SHARED_LIBRARY" } });
    return { labId: config.labId, activity: labConfig.activity, activityCreated: !found, labCreated: !existing };
  });
}

/** P0 C1.1: the mode a Lab declares on the library route. Never parses the config. */
export const declaredMode = (lab: { config: unknown }): "guided" | "explore" =>
  (lab.config as { mode?: unknown } | null)?.mode === "explore" ? "explore" : "guided";

export type ExploreResolveError = "EXPLORE_VERSION_MISSING" | "EXPLORE_IDENTITY_MISMATCH" | "EXPLORE_DIGEST_MISMATCH" | "EXPLORE_KIT_UNSUPPORTED" | "EXPLORE_CONFIG_INVALID";
export type ExploreResolution =
  | { ok: true; kit: string; engine: string; activity: { id: string; key: string; version: number; digest: string }; config: unknown }
  | { ok: false; code: ExploreResolveError };
type PinnedVersion = { id: string; key: string; version: number; digest: string; spec: unknown };

const pointerSchema = z.object({
  kit: z.string(),
  engine: z.string(),
  activity: z.object({ id: z.string(), key: z.string(), version: z.number().int(), digest: z.string() }),
});

/** P0 C1.2 ordered checks for one Explore Lab; stops at the first failure and never throws. */
export function resolveExplore(lab: { id: string; config: unknown }, version: PinnedVersion | undefined): ExploreResolution {
  const fail = (code: ExploreResolveError) => ({ ok: false as const, code });
  const pointer = pointerSchema.safeParse(lab.config);
  if (!pointer.success || !version || version.id !== pointer.data.activity.id) return fail("EXPLORE_VERSION_MISSING");
  const { kit, engine, activity } = pointer.data;
  if (version.key !== `${lab.id}-explore` || version.key !== activity.key || version.version !== activity.version) return fail("EXPLORE_IDENTITY_MISMATCH");
  try {
    if (activityDigest(version.spec) !== version.digest || version.digest !== activity.digest) return fail("EXPLORE_DIGEST_MISMATCH");
    const bench = EXPLORE_BENCHES[kit];
    if (!bench) return fail("EXPLORE_KIT_UNSUPPORTED");
    const validation = bench.validate((version.spec as { explore?: unknown } | null)?.explore);
    if (!validation.ok) return fail("EXPLORE_CONFIG_INVALID");
    const config = validation.config;
    if (config.labId !== lab.id || config.kit !== kit || config.engine !== engine) return fail("EXPLORE_IDENTITY_MISMATCH");
    return { ok: true, kit, engine, activity, config: (version.spec as { explore: unknown }).explore };
  } catch {
    return fail("EXPLORE_CONFIG_INVALID");
  }
}

/** Resolves every Explore Lab in `labs` with one version query (P0 C1.2). */
export async function resolveExploreLabs(db: Pick<PrismaClient, "practicalActivityVersion">, labs: Array<{ id: string; config: unknown }>) {
  const explore = labs.filter((lab) => declaredMode(lab) === "explore");
  const ids = explore.map((lab) => (lab.config as any)?.activity?.id).filter((id): id is string => typeof id === "string");
  const versions = ids.length
    ? await db.practicalActivityVersion.findMany({ where: { id: { in: ids } }, select: { id: true, key: true, version: true, digest: true, spec: true } })
    : [];
  const byId = new Map(versions.map((version) => [version.id, version]));
  return new Map(explore.map((lab) => [lab.id, resolveExplore(lab, byId.get((lab.config as any)?.activity?.id))]));
}

/**
 * The Lab a Class Explore resource is built on (P0 C3): published, shared, an Explore Lab whose pinned version resolves,
 * with the pinned config. Throws 409 with the resolve error code when it does not.
 */
export async function loadPinnedExploreLab(db: Pick<PrismaClient, "lab" | "practicalActivityVersion">, labId: string) {
  const lab = await db.lab.findFirst({
    where: { id: labId, status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, synthetic: false, topicCode: { not: null } },
    select: { id: true, title: true, grade: true, config: true },
  });
  if (!lab || declaredMode(lab) !== "explore") throw new ConflictException({ code: "LAB_SOURCE_NOT_ELIGIBLE" });
  const resolved = (await resolveExploreLabs(db, [lab])).get(lab.id)!;
  if (!resolved.ok) throw new ConflictException({ code: resolved.code });
  return { lab, resolved };
}
