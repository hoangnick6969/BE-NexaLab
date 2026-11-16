import { describe, expect, it } from "vitest";
import { safetyScenarioReagentById } from "../wet-bench/reagents";
import { FL15_SAFETY_CONFIG, listSafetyScenarioReagents, replaySafetyScenario, validateSafetyScenarioConfig } from ".";

const config = () => structuredClone(FL15_SAFETY_CONFIG);

describe("FL-15 table-driven scenarios", () => {
  it("reports a draft warning and rejects apparatus with no supported renderer", () => {
    expect(validateSafetyScenarioConfig({ ...config(), review: { status: "draft" } })).toMatchObject({ ok: true, warnings: [expect.stringContaining("safety review")] });
    const broken = { ...config(), enabledApparatus: [{ id: "goggles", kind: "unregistered", slot: "bench" }] };
    expect(validateSafetyScenarioConfig(broken)).toMatchObject({ ok: false, errors: [expect.stringContaining("enabledApparatus.0.kind")], warnings: [] });
  });
  const routes = [
    { id: "read-label", choices: ["ask", "label"], expected: ["verified", "read"] },
    { id: "read-label", choices: ["ask", "ignore"], expected: ["verified", "miss"] },
    { id: "read-label", choices: ["guess", "label"], expected: ["unknown", "read"] },
    { id: "read-label", choices: ["guess", "ignore"], expected: ["unknown", "miss"] },
    { id: "dilution", choices: ["check"], expected: ["ready"] },
    { id: "dilution", choices: ["start"], expected: ["pause"] },
    { id: "heat-tube", choices: ["away"], expected: ["clear"] },
    { id: "heat-tube", choices: ["toward"], expected: ["exposure"] },
  ];

  it.each(routes)("replays $id with $choices in order", ({ id, choices, expected }) => {
    const checked = validateSafetyScenarioConfig(config());
    if (!checked.ok) throw new Error(checked.errors.join("\n"));
    const scene = checked.config.scenes.find((item) => item.id === id)!;
    const result = replaySafetyScenario(scene, choices);
    if (!result.ok) throw new Error(`Rejected choice ${result.index}`);
    expect(result.step).toBeNull();
    expect(result.history.map((entry) => entry.choice.id)).toEqual(choices);
    expect(result.history.map((entry) => entry.consequence.id)).toEqual(expected);
    expect(result).toEqual(replaySafetyScenario(scene, choices));
  });

  it("rejects a choice from another step and choices after the end", () => {
    const scene = config().scenes[0];
    expect(replaySafetyScenario(scene, ["label"])).toEqual({ ok: false, index: 0 });
    expect(replaySafetyScenario(scene, ["ask", "label", "label"])).toEqual({ ok: false, index: 2 });
  });

  it("uses the exact reagent catalog entry for a warning", () => {
    const refs = config().scenes[1].consequences[0].hazardRefs;
    const [acid] = listSafetyScenarioReagents([...refs, ...refs]);
    expect(listSafetyScenarioReagents(refs)).toHaveLength(1);
    expect(acid).toBe(safetyScenarioReagentById("H2SO4_0_05M_6793"));
    expect(acid.hazard.tags).toEqual(["corrosive_to_metals"]);
    expect(listSafetyScenarioReagents(config().scenes[0].itemRefs)[0].hazard.tags).toEqual(["aquatic_long_lasting"]);
  });

  it("rejects an unreviewed label in a reviewed release and accepts it in a draft", () => {
    const legacy = config();
    legacy.scenes[0].itemRefs.push({ kind: "reagent", id: "CuSO4_0_1M" });
    expect(validateSafetyScenarioConfig(legacy)).toMatchObject({ ok: false, errors: [expect.stringContaining("unreviewed reagent reference")] });
    expect(validateSafetyScenarioConfig({ ...legacy, review: { status: "draft" } })).toMatchObject({ ok: true });
  });

  it.each(["reagent", "apparatus"] as const)("rejects an unknown %s in hazardRefs", (kind) => {
    const broken = config();
    broken.scenes[0].consequences[0].hazardRefs.push({ kind, id: "missing" });
    expect(validateSafetyScenarioConfig(broken)).toMatchObject({ ok: false, errors: [expect.stringContaining(`unknown ${kind} reference missing`)] });
  });

  it("rejects a choice without a registered consequence", () => {
    const broken = config();
    broken.scenes[0].steps[0].choices[0].consequenceId = "missing";
    expect(validateSafetyScenarioConfig(broken)).toMatchObject({ ok: false, errors: [expect.stringContaining("unknown consequence missing")] });
  });

  it("rejects a destination cycle even when another branch can end", () => {
    const broken = config();
    const scene = broken.scenes[0];
    scene.consequences[0].nextStepId = null;
    scene.consequences[2].nextStepId = "warning";
    scene.consequences[3].nextStepId = "warning";
    expect(validateSafetyScenarioConfig(broken)).toMatchObject({ ok: false, errors: [expect.stringContaining("steps.warning: cannot reach an ending")] });
  });

  it("rejects a step that can end yet has no path from the start", () => {
    const broken = config();
    const scene = broken.scenes[0];
    scene.consequences[0].nextStepId = null;
    scene.consequences[1].nextStepId = null;
    expect(validateSafetyScenarioConfig(broken)).toMatchObject({ ok: false, errors: [expect.stringContaining("steps.warning: unreachable from start")] });
  });
});
