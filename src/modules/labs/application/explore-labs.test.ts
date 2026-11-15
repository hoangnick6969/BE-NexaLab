import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { AdminLabsController } from "../interface/admin-labs.controller";
import { activityDigest } from "./sim-packs";
import { exploreConfig } from "../interface/explore-lab.fixture";
import { EXPLORE_BENCHES, exploreActivitySpecSchema, publishExploreLab, resolveExplore } from "./explore-labs";
import { FL06_LEVER_EXPLORE_CONFIG } from "../../../../packages/sim/mechanics";

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
    expect(Object.keys(EXPLORE_BENCHES)).toEqual(["k2-wet-bench@1", "k5-lever-bench@1"]);
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
