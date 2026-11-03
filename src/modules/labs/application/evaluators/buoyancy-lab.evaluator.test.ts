import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { labEvaluators } from "./registry";
import { MODEL_REGISTRY, packInputSchema, packValidation } from "../sim-packs";
import { digestOf, packGateErrors } from "../../../content/application/content-pack";

const bundle = JSON.parse(readFileSync(resolve("content/fl05/release-candidate.json"), "utf8"));
const config = { labId: "buoyancy", modelRef: "buoyancy@1.0.0", engineVersion: "1.0.0", params: {}, template: bundle.pack.template };
const evidence = { specimenId: "iron-1v", submergedVolumeMl: 10, overflowMl: 10, measuredBuoyantForceN: 0.0981 };
const grade = (value: unknown, runtime = config) => labEvaluators.evaluate("buoyancy-archimedes@1.0.0", "fl05-test-run", value, runtime);

describe("FL-05 pinned LabRun", () => {
  it("pins the model, activity, renderer and immutable candidate digest", () => {
    expect(labEvaluators.rubricRefForActivity("buoyancy-archimedes", 1, "buoyancy@1.0.0")).toBe("buoyancy-archimedes@1.0.0");
    expect(labEvaluators.resolve("buoyancy-archimedes@1.0.0").rendererKey).toBe("buoyancy-bench");
    const hashes = JSON.parse(readFileSync(resolve("content/fl05/digests.json"), "utf8"));
    expect(digestOf(bundle)).toBe(hashes.candidateDigest);
    const pack = packInputSchema.parse(bundle.pack);
    expect(packValidation(pack, { labModelRef: config.modelRef, activity: { spec: bundle.activity }, glb: null, visualReady: false }).errors).toEqual([]);
    // Mapping is simulated here; real mapping and human reviews remain release gates.
    const errors = packGateErrors(bundle.content, { namespace: "baseline", outcomes: new Map([["KHTN8-B17-O01", { code: "KHTN8-B17-O01", grade: 8, domain: "MATTER", status: "active", synthetic: false }]]), assetVersions: new Map(), reviewers: new Set(), labs: new Set(["buoyancy"]) });
    expect(errors).toEqual(["thiếu duyệt editorial", "thiếu duyệt subject", "thiếu duyệt rights", "thiếu duyệt accessibility"]);
  });
  it("grades correct full immersion and rejects zero, oversized or incorrect readings", () => {
    expect(grade(evidence)).toMatchObject({ verdict: "passed", result: { assessment: { score: 2, maximumScore: 2 } } });
    expect(grade({ ...evidence, submergedVolumeMl: 0, overflowMl: 0, measuredBuoyantForceN: 0 }).verdict).toBe("needs_practice");
    expect(grade({ ...evidence, submergedVolumeMl: 500 }).verdict).toBe("needs_practice");
    expect(grade({ ...evidence, overflowMl: 15 })).toMatchObject({ result: { assessment: { unmetCriteria: ["overflow"] } } });
    expect(grade({ ...evidence, measuredBuoyantForceN: 0.5 })).toMatchObject({ result: { assessment: { unmetCriteria: ["force"] } } });
  });
  it("uses the run snapshot rather than preview constants and fails closed on missing config", () => {
    const brine = { ...config, template: { ...config.template, buoyancy: { ...config.template.buoyancy, fluidDensityKgM3: 1200 } } };
    expect(grade({ ...evidence, measuredBuoyantForceN: 0.11772 }, brine).verdict).toBe("passed");
    expect(() => grade(evidence, { ...config, template: {} })).toThrow();
    expect(() => grade({ ...evidence, specimenId: "invented" })).toThrow();
    expect(() => grade({ ...evidence, overflowMl: NaN })).toThrow();
    expect(() => MODEL_REGISTRY[config.modelRef].simulate({ massKg: 0.078, volumeM3: 1e-5, submergedVolumeM3: 2e-5, fluidDensityKgM3: 1000 })).toThrow();
  });
});
