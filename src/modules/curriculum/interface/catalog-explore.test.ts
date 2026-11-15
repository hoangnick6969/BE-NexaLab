import { describe, expect, it, vi } from "vitest";
import { CatalogController } from "./catalog.controller";
import { activityDigest } from "../../labs/application/sim-packs";
import { exploreConfig } from "../../labs/interface/explore-lab.fixture";

/** A pinned Explore Lab built the way publishExploreLab writes it. */
function pinned(labId: string, explore: unknown = exploreConfig(labId)) {
  const spec = { modality: "explore", explore };
  const version = { id: `pav-${labId}`, key: `${labId}-explore`, version: 1, digest: activityDigest(spec), spec };
  const lab = { id: labId, status: "published", challenges: [], config: { mode: "explore", kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: { id: version.id, key: version.key, version: 1, digest: version.digest } } };
  return { lab, version };
}
const guided = { id: "density", status: "published", challenges: [], config: null };

async function catalog(role: string, items: Array<{ lab: any; version?: any }>, extra: any[] = [guided]) {
  const findMany = vi.fn(async () => items.flatMap((item) => (item.version ? [item.version] : [])));
  const db: any = {
    lab: { findMany: async () => [...items.map((item) => item.lab), ...extra] },
    labRelease: { findMany: async () => [], groupBy: async () => [] },
    practicalActivityVersion: { findMany },
  };
  const rows = await new CatalogController(db).labs({ user: { role } });
  return { rows, byId: new Map(rows.map((row: any) => [row.id, row])), versionQueries: findMany.mock.calls.length };
}

/** Breaks one pinned Lab so exactly one C1.2 check fails. */
const broken: Record<string, (p: ReturnType<typeof pinned>) => void> = {
  EXPLORE_VERSION_MISSING: (p) => { p.lab.config.activity.id = "gone"; },
  EXPLORE_IDENTITY_MISMATCH: (p) => { p.lab.config.activity.version = 2; },
  EXPLORE_DIGEST_MISMATCH: (p) => { (p.version.spec as any).modality = "edited"; },
  EXPLORE_KIT_UNSUPPORTED: (p) => { p.lab.config.kit = "k9-bench@1"; },
  EXPLORE_CONFIG_INVALID: (p) => {
    p.version.spec = { modality: "explore", explore: { ...exploreConfig(p.lab.id), availableReagents: [] } };
    p.version.digest = p.lab.config.activity.digest = activityDigest(p.version.spec);
  },
};

describe("GET /labs Explore contract (P0 C1.2)", () => {
  it("adds mode to every row and the pinned config to valid Explore rows, with one version query", async () => {
    const fl13 = pinned("acid-base-indicators");
    const { rows, byId, versionQueries } = await catalog("STUDENT", [fl13]);
    expect(rows.map((row: any) => row.mode).sort()).toEqual(["explore", "guided"]);
    expect(byId.get("density")).not.toHaveProperty("explore");
    expect(byId.get("acid-base-indicators").explore).toEqual({
      ok: true, kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", activity: fl13.lab.config.activity, config: exploreConfig("acid-base-indicators"),
    });
    expect(versionQueries).toBe(1);
  });

  for (const [code, breakIt] of Object.entries(broken)) {
    it(`reports ${code} to teachers, hides the row from students, and keeps other rows`, async () => {
      const bad = pinned("acid-base-indicators");
      breakIt(bad);
      const good = pinned("metal-reactivity");
      const teacher = await catalog("TEACHER", [bad, good]);
      expect(teacher.byId.get("acid-base-indicators").explore).toEqual({ ok: false, code });
      expect(teacher.byId.get("metal-reactivity").explore.ok).toBe(true);
      expect(teacher.byId.get("density").mode).toBe("guided");
      const student = await catalog("STUDENT", [bad, good]);
      expect(student.byId.has("acid-base-indicators")).toBe(false);
      expect(student.byId.get("metal-reactivity").explore.ok).toBe(true);
    });
  }

  it("rejects a config with valid schema and digest that belongs to another Lab", async () => {
    const stolen = pinned("acid-base-indicators", exploreConfig("metal-reactivity"));
    const { byId } = await catalog("ADMIN", [stolen]);
    expect(byId.get("acid-base-indicators").explore).toEqual({ ok: false, code: "EXPLORE_IDENTITY_MISMATCH" });
  });

  it("treats a missing or malformed activity pointer as EXPLORE_VERSION_MISSING without failing the request", async () => {
    const malformed = { lab: { id: "x-lab", status: "published", challenges: [], config: { mode: "explore", activity: "nope" } } };
    const none = { lab: { id: "y-lab", status: "published", challenges: [], config: { mode: "explore" } } };
    const { byId } = await catalog("TEACHER", [malformed, none]);
    expect(byId.get("x-lab").explore).toEqual({ ok: false, code: "EXPLORE_VERSION_MISSING" });
    expect(byId.get("y-lab").explore).toEqual({ ok: false, code: "EXPLORE_VERSION_MISSING" });
  });
});
