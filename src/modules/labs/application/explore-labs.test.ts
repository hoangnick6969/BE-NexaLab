import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AdminLabsController } from "../interface/admin-labs.controller";
import { activityDigest } from "./sim-packs";
import { exploreConfig } from "../interface/explore-lab.fixture";
import { EXPLORE_BENCHES, exploreActivitySpecSchema, publishExploreLab, resolveExplore } from "./explore-labs";
import { FL06_LEVER_EXPLORE_CONFIG } from "../../../../packages/sim/mechanics";
import { FL15_SAFETY_CONFIG, SAFETY_SCENARIO_KIT } from "../../../../packages/sim/safety-scenario";
import { FL04_PRESSURE_EXPLORE_CONFIG } from "../../../../packages/sim/fluid";
import { loadFluidExploreTargets } from "../../../../scripts/fluid-explore-targets";
import { FL08_HEAT_TRANSFER_EXPLORE_CONFIG } from "../../../../packages/sim/thermal";
import { loadThermalExploreTargets } from "../../../../scripts/thermal-explore-targets";
import { FL24_ENERGY_EXPLORE_CONFIG } from "../../../../packages/sim/mechanics/energy";
import { FL24_TOPIC_CODE, loadEnergyExploreTargets } from "../../../../scripts/energy-explore-targets";

vi.mock("../../../common/audit", () => ({ audit: vi.fn(), changedFields: vi.fn(() => ({})) }));


/** In-memory stand-in for the rows publishExploreLab touches. */
function fakeDb(lab: any = null, inCourse = false) {
  const versions: any[] = [];
  const tx: any = {
    $executeRawUnsafe: vi.fn(),
    lab: { findUnique: vi.fn(async () => lab), upsert: vi.fn() },
    foundationalCourseLesson: { findFirst: vi.fn(async () => (inCourse ? { lessonId: "l1" } : null)) },
    curriculumTopic: { findUnique: vi.fn(async () => ({ code: "KHTN8-L09", title: "Base. Thang pH", chapter: { subjectId: "khtn", grade: 8 } })) },
    practicalActivityVersion: {
      findUnique: vi.fn(async ({ where }: any) => versions.find((v) => v.key === where.key_digest.key && v.digest === where.key_digest.digest) ?? null),
      findFirst: vi.fn(async ({ where }: any) => versions.filter((v) => v.key === where.key).sort((a, b) => b.version - a.version)[0] ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `pav-${versions.length + 1}`, ...data }; versions.push(row); return row; }),
    },
  };
  return { db: { $transaction: (work: any) => work(tx) } as any, tx, versions };
}
const actor = { sub: "admin", role: "ADMIN" };
const input = (config: unknown = exploreConfig()) => ({ config, topicCode: "KHTN8-L09", actor, reason: "test publish" });

describe("publishExploreLab (P0 C1.3)", () => {
  it("pins the full config, writes only the activity pointer, and reuses the version for the same input", async () => {
    const { db, tx, versions } = fakeDb();
    const first = await publishExploreLab(db, input());
    const second = await publishExploreLab(db, input());
    expect(versions).toHaveLength(1);
    expect(first).toMatchObject({ activityCreated: true, activity: { key: "acid-base-indicators-explore", version: 1 } });
    expect(second).toMatchObject({ activityCreated: false, activity: first.activity });
    const spec = versions[0].spec;
    expect(exploreActivitySpecSchema.parse(spec).explore).toMatchObject({ labId: "acid-base-indicators", kit: "k2-wet-bench@1" });
    expect(activityDigest(spec)).toBe(versions[0].digest);
    const written = tx.lab.upsert.mock.calls[0][0].update;
    expect(written.config).toEqual({ mode: "explore", kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: first.activity });
    expect(written).toMatchObject({ status: "published", scope: "SHARED_LIBRARY", releaseCleared: true, topicCode: "KHTN8-L09", simulationModelRef: "wet-bench@1.0.0" });
    expect(resolveExplore({ id: first.labId, config: written.config }, versions[0])).toMatchObject({ ok: true, kit: "k2-wet-bench@1", activity: first.activity });
  });

  it("creates a new version when a config value changes", async () => {
    const { db, versions } = fakeDb();
    await publishExploreLab(db, input());
    const changed = exploreConfig();
    changed.dispensing.liquidPresetsMicroliters = [50, 500, 1000];
    expect(await publishExploreLab(db, input(changed))).toMatchObject({ activityCreated: true, activity: { version: 2 } });
    expect(versions[0].digest).not.toBe(versions[1].digest);
  });

  it("pins class templates with the config: they are in spec.explore, change the digest, and a bad template is refused", async () => {
    const { db, versions } = fakeDb();
    const withTemplate = (count: number) => ({
      ...exploreConfig(),
      enabledApparatus: [{ id: "T1", kind: "test_tube", slot: "rack_1" }, { id: "T2", kind: "test_tube", slot: "rack_2" }, { id: "meter", kind: "digital_ph_meter", slot: "tool_ph" }],
      classTemplates: [{
        id: "ph-compare", titleVi: "So sánh pH", requiredApparatusIds: ["T1", "T2", "meter"],
        reagentGroups: [{ id: "samples", labelVi: "Mẫu", count, options: ["HCl_0_1M", "NaOH_0_1M"] }],
        promptChoices: [{ promptId: "p1" }], requirements: { measure: { measurement: "ph_meter", perGroup: "samples" }, explain: true },
      }],
    });
    await publishExploreLab(db, input(withTemplate(2)));
    const spec = versions[0].spec;
    expect(spec.explore.classTemplates[0]).toMatchObject({ id: "ph-compare", reagentGroups: [{ count: 2 }] });
    expect(resolveExplore({ id: "acid-base-indicators", config: { mode: "explore", kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: { id: "pav-1", key: "acid-base-indicators-explore", version: 1, digest: versions[0].digest } } }, versions[0]).ok).toBe(true);
    // Another allow-list is another digest, hence another version.
    const withOneSample = withTemplate(1);
    expect(await publishExploreLab(db, input(withOneSample))).toMatchObject({ activityCreated: true, activity: { version: 2 } });
    expect(versions[0].digest).not.toBe(versions[1].digest);
    // A template that points at an unknown prompt never reaches the database.
    const broken = withTemplate(2);
    broken.classTemplates[0].promptChoices = [{ promptId: "missing" }];
    await expect(publishExploreLab(db, input(broken))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    expect(versions).toHaveLength(2);
  });

  it("gives the same version and digest through the Admin API and the seed call", async () => {
    const seed = fakeDb();
    const api = fakeDb();
    const viaSeed = await publishExploreLab(seed.db, input());
    const viaApi = await new AdminLabsController(api.db, {} as any).publishExploreVersion("acid-base-indicators", { user: actor }, { config: exploreConfig(), topicCode: "KHTN8-L09", reason: "test publish" });
    expect(viaApi.activity.digest).toBe(viaSeed.activity.digest);
    expect(viaApi.activity.version).toBe(viaSeed.activity.version);
  });

  it("refuses a Lab with challenges, releases or another model, and a Lab used as foundationalLabId", async () => {
    for (const lab of [
      { simulationModelRef: "wet-bench@1.0.0", _count: { challenges: 1, releases: 0 } },
      { simulationModelRef: "wet-bench@1.0.0", _count: { challenges: 0, releases: 1 } },
      { simulationModelRef: "chemistry@1.0.0", _count: { challenges: 0, releases: 0 } },
    ]) {
      const { db, tx } = fakeDb(lab);
      await expect(publishExploreLab(db, input())).rejects.toMatchObject({ response: { code: "EXPLORE_LAB_HAS_GUIDED" } });
      expect(tx.lab.upsert).not.toHaveBeenCalled();
    }
    const { db, tx } = fakeDb(null, true);
    await expect(publishExploreLab(db, input())).rejects.toMatchObject({ response: { code: "EXPLORE_LAB_IN_COURSE" } });
    expect(tx.practicalActivityVersion.create).not.toHaveBeenCalled();
  });

  it("refuses an invalid config, a guided mode and an unknown bench before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    const invalid = { ...exploreConfig(), availableReagents: [{ reagentId: "nope", shelfPosition: 1 }] };
    const guided = { ...exploreConfig(), modes: { explore: true, guided: { rendererKey: "x" } } };
    await expect(publishExploreLab(db, input(invalid))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    await expect(publishExploreLab(db, input(guided))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    await expect(publishExploreLab(db, input({ ...exploreConfig(), kit: "k9@1" }))).rejects.toMatchObject({ response: { code: "EXPLORE_KIT_UNSUPPORTED" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(Object.keys(EXPLORE_BENCHES)).toEqual(expect.arrayContaining(["anatomy", SAFETY_SCENARIO_KIT, "k2-wet-bench@1", "k3-fluid-bench@1", "k4-thermal-bench@1", "k5-energy-bench@1", "k5-lever-bench@1", "k7-molecular", "k8-diorama", "k8-garden"]));
  });

  it("is ADMIN-only and validates the body against the route Lab", () => {
    expect(Reflect.getMetadata("roles", AdminLabsController)).toEqual(["ADMIN"]);
    const controller = new AdminLabsController(fakeDb().db, {} as any);
    expect(() => controller.publishExploreVersion("metal-reactivity", { user: actor }, { config: exploreConfig(), topicCode: "KHTN8-L09", reason: "test publish" })).toThrow(ZodError);
    expect(() => controller.publishExploreVersion("acid-base-indicators", { user: actor }, { config: exploreConfig(), topicCode: "KHTN8-L09", reason: "test", extra: 1 })).toThrow(ZodError);
  });
});

describe("mechanics bench k5-lever-bench@1 (FL-06 Explore, D1-1.3)", () => {
  const lever = (patch: object = {}) => ({ ...structuredClone(FL06_LEVER_EXPLORE_CONFIG), ...patch });
  const leverInput = (config: unknown) => ({ config, topicCode: "KHTN8-L18", actor, reason: "test publish" });

  it("validates the packaged config and builds a spec the Explore schema accepts", () => {
    const bench = EXPLORE_BENCHES["k5-lever-bench@1"];
    const result = bench.validate(lever());
    expect(result.ok).toBe(true);
    const spec = exploreActivitySpecSchema.parse({ ...bench.activitySpec(lever()), explore: lever() });
    expect(spec).toMatchObject({ modality: "explore", scored: false, engine: "lever-bench@1.0.0", materials: { reagents: [] } });
    expect(spec.materials.apparatus).toEqual(expect.arrayContaining([expect.objectContaining({ id: "weights", forces: ["0,5 N", "1,0 N", "2,0 N"] })]));
  });

  it("publishes on a Lab without Guided and pins the lever model", async () => {
    const { db, tx } = fakeDb();
    const result = await publishExploreLab(db, leverInput(lever({ labId: "lever-explore-fixture" })));
    expect(result).toMatchObject({ activity: { key: "lever-explore-fixture-explore", version: 1 } });
    expect(tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "lever-bench@1.0.0", config: { mode: "explore", kit: "k5-lever-bench@1" } });
  });

  it("refuses lever-equilibrium while it has the Guided release (waits for D-5)", async () => {
    const { db, tx } = fakeDb({ simulationModelRef: "lever-bench@1.0.0", _count: { challenges: 0, releases: 1 } });
    await expect(publishExploreLab(db, leverInput(lever()))).rejects.toMatchObject({ response: { code: "EXPLORE_LAB_HAS_GUIDED" } });
    expect(tx.lab.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid lever config before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    await expect(publishExploreLab(db, leverInput(lever({ initialAttachments: [{ kind: "WEIGHT", positionMillimetres: 75, forceMilliNewtons: 1000 }] })))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("FL-15 safety scenario bench", () => {
  const safetyInput = { ...input(FL15_SAFETY_CONFIG), topicCode: "KHTN8-L01" };

  const draftInput = { ...safetyInput, config: { ...FL15_SAFETY_CONFIG, review: { status: "draft" } } };

  it("blocks admin publication of a draft before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    const controller = new AdminLabsController(db, {} as any);
    await expect(controller.publishExploreVersion("lab-safety", { user: actor }, {
      config: draftInput.config, topicCode: draftInput.topicCode, reason: draftInput.reason,
    })).rejects.toMatchObject({ response: { code: "EXPLORE_SAFETY_REVIEW_REQUIRED" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("accepts the reviewed release through the admin controller", async () => {
    const { db, versions } = fakeDb();
    const controller = new AdminLabsController(db, {} as any);
    await controller.publishExploreVersion("lab-safety", { user: actor }, {
      config: safetyInput.config, topicCode: safetyInput.topicCode, reason: safetyInput.reason,
    });
    expect(versions[0].spec).toMatchObject({ modality: "explore", scored: false });
  });

  it("pins the isolated draft as an unscored activity without a Class Explore template", async () => {
    const { db, tx, versions } = fakeDb();
    const result = await publishExploreLab(db, { ...draftInput, isolatedFixture: true });
    const written = tx.lab.upsert.mock.calls[0][0].update;
    expect(versions[0].spec).toMatchObject({ modality: "explore", scored: false, engine: "safety-scenario@1.0.0" });
    expect(EXPLORE_BENCHES[SAFETY_SCENARIO_KIT].deriveClass).toBeUndefined();
    expect(resolveExplore({ id: result.labId, config: written.config }, versions[0])).toMatchObject({ ok: true, kit: SAFETY_SCENARIO_KIT });
  });
});

describe("fluid bench k3-fluid-bench@1 (FL-04 Explore, D1-3.2)", () => {
  const fluid = (patch: object = {}) => ({ ...structuredClone(FL04_PRESSURE_EXPLORE_CONFIG), ...patch });
  const fluidInput = (config: unknown) => ({ config, topicCode: "KHTN8-L16", actor, reason: "test publish" });

  it("validates the packaged config and builds a spec the Explore schema accepts", () => {
    const bench = EXPLORE_BENCHES["k3-fluid-bench@1"];
    expect(bench.validate(fluid()).ok).toBe(true);
    const spec = exploreActivitySpecSchema.parse({ ...bench.activitySpec(fluid()), explore: fluid() });
    expect(spec).toMatchObject({ modality: "explore", scored: false, engine: "fluid-pressure@1.0.0", kit: "k3-fluid-bench@1", materials: { reagents: [] } });
    expect(spec.materials.apparatus).toEqual(expect.arrayContaining([expect.objectContaining({ id: "weights", forces: ["1,0 N"], count: 12 })]));
    expect(spec.setup).toContain("Trạm 1");
    expect(spec.setup).toContain("Trạm 2");
    expect(bench.deriveClass).toBeUndefined();
  });

  it("publishes liquid-pressure as a new Lab (no Guided, no D-5) and pins the fluid model", async () => {
    const { db, tx } = fakeDb();
    const result = await publishExploreLab(db, fluidInput(fluid()));
    expect(result).toMatchObject({ activity: { key: "liquid-pressure-explore", version: 1 } });
    expect(tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "fluid-pressure@1.0.0", config: { mode: "explore", kit: "k3-fluid-bench@1" } });
  });

  it("rejects an invalid fluid config before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    const deep = fluid({ depthProbe: { ...FL04_PRESSURE_EXPLORE_CONFIG.depthProbe!, maxDepthMm: 280 } });
    await expect(publishExploreLab(db, fluidInput(deep))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    await expect(publishExploreLab(db, fluidInput(fluid({ modes: { explore: true, guided: { rendererKey: "fl04" } } })))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("seeds FL-04 on topic KHTN8-L16 through the fluid bench targets", async () => {
    expect(await loadFluidExploreTargets()).toEqual([{ config: expect.objectContaining({ labId: "liquid-pressure", kit: "k3-fluid-bench@1" }), topicCode: "KHTN8-L16" }]);
  });
});

describe("thermal bench k4-thermal-bench@1 (FL-08 Explore, D1-3.2)", () => {
  const thermal = (patch: object = {}) => ({ ...structuredClone(FL08_HEAT_TRANSFER_EXPLORE_CONFIG), ...patch });
  const thermalInput = (config: unknown) => ({ config, topicCode: "KHTN8-L28", actor, reason: "test publish" });

  it("validates the packaged config and builds a spec the Explore schema accepts, citing Bảng 28.1", () => {
    const bench = EXPLORE_BENCHES["k4-thermal-bench@1"];
    expect(bench.validate(thermal()).ok).toBe(true);
    const spec = exploreActivitySpecSchema.parse({ ...bench.activitySpec(thermal()), explore: thermal() });
    expect(spec).toMatchObject({ modality: "explore", scored: false, engine: "heat-transfer@1.0.0", kit: "k4-thermal-bench@1", materials: { reagents: [] } });
    expect(spec.materials.apparatus).toEqual(expect.arrayContaining([expect.objectContaining({ id: "rack", rods: ["Đồng", "Nhôm", "Thép", "Thuỷ tinh", "Gỗ"], maxRods: 3 })]));
    expect(spec.sources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "sgk", status: "verified" })]));
    for (const station of ["Trạm dẫn nhiệt", "Trạm đối lưu", "Trạm bức xạ"]) expect(spec.setup).toContain(station);
    expect(bench.deriveClass).toBeUndefined();
  });

  it("publishes heat-transfer as a new Lab (no Guided, no D-5) and pins the heat-transfer model", async () => {
    const { db, tx } = fakeDb();
    const result = await publishExploreLab(db, thermalInput(thermal()));
    expect(result).toMatchObject({ activity: { key: "heat-transfer-explore", version: 1 } });
    expect(tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "heat-transfer@1.0.0", config: { mode: "explore", kit: "k4-thermal-bench@1" } });
  });

  it("refuses to write Explore onto FL-07 (thermal-energy keeps its Guided release and model)", async () => {
    const { db, tx } = fakeDb({ simulationModelRef: "thermal-bench@1.0.0", _count: { challenges: 1, releases: 1 } });
    await expect(publishExploreLab(db, thermalInput(thermal({ labId: "thermal-energy" })))).rejects.toMatchObject({ response: { code: "EXPLORE_LAB_HAS_GUIDED" } });
    expect(tx.lab.upsert).not.toHaveBeenCalled();
  });

  it("rejects an invalid thermal config before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    const bad = thermal({ radiation: { ...FL08_HEAT_TRANSFER_EXPLORE_CONFIG.radiation!, absorptance: { black: 20, silver: 60 } } });
    await expect(publishExploreLab(db, thermalInput(bad))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("seeds FL-08 on topic KHTN8-L28 through the thermal bench targets", async () => {
    expect(await loadThermalExploreTargets()).toEqual([{ config: expect.objectContaining({ labId: "heat-transfer", kit: "k4-thermal-bench@1" }), topicCode: "KHTN8-L28" }]);
  });
});

describe("mechanical energy bench k5-energy-bench@1 (FL-24 Explore, D1-3.2)", () => {
  const energy = (patch: object = {}) => ({ ...structuredClone(FL24_ENERGY_EXPLORE_CONFIG), ...patch });
  const energyInput = (config: unknown) => ({ config, topicCode: "KHTN9-TEST", actor, reason: "test publish" });

  it("validates the packaged config and builds a spec the Explore schema accepts", () => {
    const bench = EXPLORE_BENCHES["k5-energy-bench@1"];
    expect(bench.validate(energy()).ok).toBe(true);
    const spec = exploreActivitySpecSchema.parse({ ...bench.activitySpec(energy()), explore: energy() });
    expect(spec).toMatchObject({ modality: "explore", scored: false, engine: "mechanical-energy@1.0.0", kit: "k5-energy-bench@1", materials: { reagents: [] } });
    expect(spec.materials.apparatus).toEqual(expect.arrayContaining([expect.objectContaining({ id: "hoist", motors: ["Động cơ chậm", "Động cơ nhanh"] })]));
    expect(spec.setup).toContain("Trạm 1");
    expect(spec.setup).toContain("Trạm 2");
    expect(spec.setup).toContain("quả nặng 100–500 g");
    expect(spec.setup).toContain("bằng động cơ chậm và động cơ nhanh");
    // The setup text follows the config, not a fixed range.
    const narrow = energy({ pendulum: { ...FL24_ENERGY_EXPLORE_CONFIG.pendulum!, massesG: [200, 300] }, hoist: { ...FL24_ENERGY_EXPLORE_CONFIG.hoist!, motors: [FL24_ENERGY_EXPLORE_CONFIG.hoist!.motors[1]] } });
    expect(bench.activitySpec(narrow).setup).toContain("quả nặng 200–300 g");
    expect(bench.activitySpec(narrow).setup).toContain("bằng động cơ nhanh;");
    expect(bench.deriveClass).toBeUndefined();
  });

  it("publishes mechanical-energy as a new Lab and pins the energy model, separate from the lever bench", async () => {
    const { db, tx } = fakeDb();
    const result = await publishExploreLab(db, energyInput(energy()));
    expect(result).toMatchObject({ activity: { key: "mechanical-energy-explore", version: 1 } });
    expect(tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "mechanical-energy@1.0.0", config: { mode: "explore", kit: "k5-energy-bench@1" } });
    expect(EXPLORE_BENCHES["k5-lever-bench@1"].modelRef).not.toBe("mechanical-energy@1.0.0");
  });

  it("rejects an invalid energy config before opening a transaction", async () => {
    const { db, tx } = fakeDb();
    const tall = energy({ pendulum: { ...FL24_ENERGY_EXPLORE_CONFIG.pendulum!, maxDropHeightMm: 600 } });
    await expect(publishExploreLab(db, energyInput(tall))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    await expect(publishExploreLab(db, energyInput(energy({ modes: { explore: true, guided: { rendererKey: "fl24" } } })))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("seeds FL-24 on the KHTN 9 Năng lượng cơ học topic with the owner-reviewed config", async () => {
    expect(FL24_TOPIC_CODE).toBe("KHTN9-CH01-T01");
    expect(await loadEnergyExploreTargets()).toEqual([{ config: expect.objectContaining({ labId: "mechanical-energy", kit: "k5-energy-bench@1", review: expect.objectContaining({ status: "reviewed" }) }), topicCode: FL24_TOPIC_CODE }]);
  });
});

describe("Explore seed CLI", () => {
  const root = resolve(__dirname, "../../../..");
  const isolated = "postgresql://u:p@127.0.0.1:5432/nexalab_k2_guard";
  const mismatches = {
    host: "postgresql://u:p@db.example.invalid:5432/nexalab_k2_guard",
    port: "postgresql://u:p@127.0.0.1:6543/nexalab_k2_guard",
    database: "postgresql://u:p@127.0.0.1:5432/nexalab_other",
  };
  const run = (args: string[] | string, databaseUrl: string) => {
    const env: NodeJS.ProcessEnv = { ...process.env, NEXALAB_ISOLATED_DATABASE_URL: isolated, DATABASE_URL: databaseUrl, DIRECT_URL: isolated };
    delete env.NEXALAB_PINNING_TEST_URL;
    const options = { cwd: root, env, encoding: "utf8" as const, timeout: 60_000 };
    return typeof args === "string" ? spawnSync(args, { ...options, shell: true }) : spawnSync(args[0], args.slice(1), options);
  };
  const tsx = [process.execPath, resolve(root, "node_modules/tsx/dist/cli.mjs")];
  const script = [...tsx, "scripts/seed-explore-labs.ts"];
  const selected = [...script, "--kit", "k2-wet-bench@1"];
  const legacy = [...tsx, "scripts/seed-k2-explore-labs.ts"];

  it("requires a registered --kit before connecting", () => {
    const missing = run(script, isolated);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("--kit <bench-id>");

    const unsupported = run([...script, "--kit", "other-bench@1"], isolated);
    expect(unsupported.status).toBe(1);
    expect(unsupported.stderr).toContain("No Explore seed targets for other-bench@1");
  }, 120_000);

  for (const [what, url] of Object.entries(mismatches)) {
    it(`blocks write, --unpublish and npm run on a ${what} mismatch`, () => {
      for (const args of [selected, [...selected, "--unpublish"], [...legacy, "--unpublish"]]) {
        const result = run(args, url);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/loopback|does not match NEXALAB_ISOLATED_DATABASE_URL/);
      }
      for (const command of ["db:seed:explore -- --kit k2-wet-bench@1 --unpublish", "db:seed:k2-explore -- --unpublish"]) {
        const viaNpm = run(`npm run -s ${command}`, url);
        expect(viaNpm.status).not.toBe(0);
        expect(viaNpm.stderr).toContain("Database safety guard");
      }
    }, 120_000);
  }
});

describe("publishExploreLab: wet-bench engine versions", () => {
  const solutionConfig = () => ({
    ...exploreConfig("solution-concentration"),
    catalogId: "FL-11",
    engine: "wet-bench@1.1.0",
    enabledApparatus: [
      { id: "B1", kind: "beaker_100ml", slot: "bench_1" },
      { id: "G1", kind: "graduated_cylinder_100ml", slot: "bench_2" },
      { id: "spoon", kind: "spatula", slot: "tool_1" },
    ],
    availableReagents: [{ reagentId: "NaCl_powder", shelfPosition: 1 }, { reagentId: "H2O_distilled", shelfPosition: 2 }],
    allowedReactions: [],
    measurements: ["volume"],
    solutes: [{ reagentId: "NaCl_powder", maxMilligramsPerMilliliter: 360, atCelsius: 20 }],
    pedagogy: { revealEquations: "never" },
  });

  it("records the engine of the config as the Lab's model: a 1.1.0 Lab is 1.1.0, FL-13 stays 1.0.0", async () => {
    const solution = fakeDb();
    await publishExploreLab(solution.db, input(solutionConfig()));
    expect(solution.tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "wet-bench@1.1.0", config: { engine: "wet-bench@1.1.0" } });
    const acid = fakeDb();
    await publishExploreLab(acid.db, input());
    expect(acid.tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "wet-bench@1.0.0" });
  });

  it("records wet-bench@1.2.0 for a rate Lab and refuses rate parts on older engines", async () => {
    const rateConfig = () => ({
      ...exploreConfig("reaction-rate"),
      catalogId: "FL-12",
      engine: "wet-bench@1.2.0",
      enabledApparatus: [
        { id: "F1", kind: "erlenmeyer_flask_100ml", slot: "bench_1", initial: { contents: [{ reagentId: "HCl_0_1M", microliters: 20000 }] } },
        { id: "clock", kind: "stopwatch", slot: "tool_1" },
        { id: "tongs", kind: "tongs", slot: "tool_2" },
      ],
      availableReagents: [{ reagentId: "CaCO3_chips", shelfPosition: 1 }],
      allowedReactions: ["gas.caco3-hcl"],
      measurements: ["time", "gas_volume"],
      rateModel: { kinetic: ["gas.caco3-hcl"], kNanomolesPerSecondPerMillimolar: 33, surface: { chips: 1 }, maxSeconds: 600, atCelsius: 25 },
      pedagogy: { revealEquations: "never" },
    });
    const rate = fakeDb();
    await publishExploreLab(rate.db, input(rateConfig()));
    expect(rate.tx.lab.upsert.mock.calls[0][0].update).toMatchObject({ simulationModelRef: "wet-bench@1.2.0", config: { engine: "wet-bench@1.2.0" } });
    const older = fakeDb();
    await expect(publishExploreLab(older.db, input({ ...rateConfig(), engine: "wet-bench@1.1.0" }))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
  });

  it("refuses to move an existing 1.0.0 Lab to 1.1.0, and a 1.1.0 config on 1.0.0 features is invalid", async () => {
    const existing = fakeDb({ simulationModelRef: "wet-bench@1.0.0", _count: { challenges: 0, releases: 0 } });
    await expect(publishExploreLab(existing.db, input(solutionConfig()))).rejects.toMatchObject({ response: { code: "EXPLORE_LAB_HAS_GUIDED" } });
    const wrongEngine = fakeDb();
    await expect(publishExploreLab(wrongEngine.db, input({ ...solutionConfig(), engine: "wet-bench@1.0.0" }))).rejects.toMatchObject({ response: { code: "EXPLORE_CONFIG_INVALID" } });
  });
});
