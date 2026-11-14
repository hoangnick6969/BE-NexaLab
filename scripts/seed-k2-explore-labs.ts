/**
 * Seeds the K2 Explore-first Labs (FL-13 acid–base, FL-14a metals) so they appear in `GET /labs`
 * and open the K2 bench from the main Lab route. Explore Labs are unscored: no challenge, pack,
 * LabRelease or LabRun is created.
 *
 * Source of truth for content: the kit configs in the sibling frontend
 * (`../FE-NexaLab/src/features/labs/chemistry/wet-bench/labs/*.config.ts`), validated with
 * `validateChemistryLabConfig` before anything is written.
 *
 * Writes:
 *  - Lab rows `acid-base-indicators`, `metal-reactivity` (published, SHARED_LIBRARY, releaseCleared,
 *    topicCode, simulationModelRef `wet-bench@1.0.0`, `config.explore` = the kit config). Re-running
 *    updates these two rows only.
 *  - PracticalActivityVersion `<labId>-explore` v1 (immutable): a new version is created only when
 *    the spec digest changes.
 *
 * Safety: `--dry-run` only reads. Writing to a non-loopback database (e.g. the shared Supabase DB in
 * `.env`) requires K2_EXPLORE_SHARED_WRITE_APPROVED to equal the approval token below, because it
 * makes unreviewed draft chemistry visible to every student on that database.
 * `--unpublish` hides both Labs again (status draft, CLASS_PRIVATE, releaseCleared=false).
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import { reagentById, validateChemistryLabConfig, type ChemistryLabConfig } from "../packages/sim/wet-bench";

const APPROVAL = "owner-approved-k2-explore-shared-2026-11-14";
const ADMIN_ID = "admin";
const FE_LABS = resolve(__dirname, "../../FE-NexaLab/src/features/labs/chemistry/wet-bench/labs");

const TARGETS = [
  { file: "fl-13.config.ts", exportName: "fl13Config", topicCode: "KHTN8-L09", topic: "Base. Thang pH" },
  { file: "fl-14a.config.ts", exportName: "fl14aConfig", topicCode: "KHTN8-L11", topic: "Muối (kim loại tác dụng với acid và dung dịch muối)" },
] as const;

const canonical = (value: unknown): string =>
  Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object" ? `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`
      : JSON.stringify(value);
const digestOf = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** PracticalActivityVersion.spec shape used across the project, filled from the kit config. */
function activitySpec(config: ChemistryLabConfig) {
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

function targetHost() {
  const direct = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "");
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (direct.hostname !== database.hostname) throw new Error("DATABASE_URL and DIRECT_URL must name the same host");
  return { host: database.hostname, loopback: ["localhost", "127.0.0.1", "::1", "[::1]"].includes(database.hostname) };
}

async function loadConfigs() {
  if (!existsSync(FE_LABS)) throw new Error(`Frontend kit configs not found at ${FE_LABS} (FE-NexaLab must sit beside BE-NexaLab)`);
  const out: Array<{ config: ChemistryLabConfig; topicCode: string; topic: string }> = [];
  for (const target of TARGETS) {
    const module = await import(pathToFileURL(resolve(FE_LABS, target.file)).href);
    const result = validateChemistryLabConfig(module[target.exportName]);
    if (!result.ok) throw new Error(`${target.file} is invalid: ${result.errors.join("; ")}`);
    if (result.config.modes.guided) throw new Error(`${target.file} has a guided mode; this seed only handles Explore-only Labs`);
    out.push({ config: result.config, topicCode: target.topicCode, topic: target.topic });
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const unpublish = process.argv.includes("--unpublish");
  const { host, loopback } = targetHost();
  if (!dryRun && !loopback && process.env.K2_EXPLORE_SHARED_WRITE_APPROVED !== APPROVAL)
    throw new Error(`Refusing to write to shared database ${host}: set K2_EXPLORE_SHARED_WRITE_APPROVED to the owner approval token, or point DATABASE_URL/DIRECT_URL at a local database`);
  const items = await loadConfigs();
  const db = new PrismaClient();
  try {
    const admin = await db.user.findUnique({ where: { id: ADMIN_ID }, select: { role: true, status: true } });
    if (!admin || admin.role !== "ADMIN" || admin.status !== "active") throw new Error("Admin account not found or not active");
    const subject = await db.subject.findUnique({ where: { id: "khtn" }, select: { id: true } });
    if (!subject) throw new Error("Subject khtn is missing; run the base seed first");

    const report = [];
    for (const { config, topicCode, topic } of items) {
      const topicRow = await db.curriculumTopic.findUnique({ where: { code: topicCode }, select: { code: true, title: true } });
      if (!topicRow) throw new Error(`Curriculum topic ${topicCode} is missing`);
      const existing = await db.lab.findUnique({ where: { id: config.labId }, select: { id: true, status: true, scope: true, releaseCleared: true, simulationModelRef: true, _count: { select: { releases: true, challenges: true } } } });
      if (existing && existing.simulationModelRef !== "wet-bench@1.0.0") throw new Error(`Lab ${config.labId} already exists with model ${existing.simulationModelRef}; refusing to overwrite`);
      const spec = activitySpec(config);
      const digest = digestOf(spec);
      const key = `${config.labId}-explore`;
      const versions = await db.practicalActivityVersion.findMany({ where: { key }, orderBy: { version: "desc" }, select: { id: true, version: true, digest: true } });
      const sameActivity = versions.find((version) => version.digest === digest);

      if (dryRun) {
        report.push({ labId: config.labId, catalogId: config.catalogId, topicCode, labExists: Boolean(existing), current: existing, activityUpToDate: Boolean(sameActivity), wouldCreateActivityVersion: sameActivity ? null : (versions[0]?.version ?? 0) + 1 });
        continue;
      }
      if (unpublish) {
        if (existing) await db.lab.update({ where: { id: config.labId }, data: { status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false } });
        report.push({ labId: config.labId, unpublished: Boolean(existing) });
        continue;
      }
      const activity = sameActivity ?? await db.practicalActivityVersion.create({ data: {
        key, version: (versions[0]?.version ?? 0) + 1, digest, spec: spec as Prisma.InputJsonValue, reviews: [] as Prisma.InputJsonValue, createdById: ADMIN_ID,
      } });
      const labConfig = {
        mode: "explore", kit: config.kit, engine: config.engine, rendererKey: "wet-bench-explore",
        activity: { id: activity.id, key, version: (activity as { version: number }).version, digest },
        reviewStatus: config.review.status,
        explore: config,
      };
      const data = {
        subjectId: "khtn", title: config.title, grade: 8, topic, learningObjective: config.outcomeSummary[0],
        status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, topicCode, synthetic: false,
        simulationModelRef: "wet-bench@1.0.0", config: labConfig as unknown as Prisma.InputJsonValue,
      };
      await db.lab.upsert({ where: { id: config.labId }, create: { id: config.labId, ...data }, update: data });
      report.push({ labId: config.labId, catalogId: config.catalogId, topicCode, activityVersionId: activity.id, activityVersion: (activity as { version: number }).version, activityCreated: !sameActivity, labCreated: !existing });
    }
    console.log(JSON.stringify({ host, loopback, mode: dryRun ? "dry-run" : unpublish ? "unpublish" : "write", labs: report }, null, 1));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
