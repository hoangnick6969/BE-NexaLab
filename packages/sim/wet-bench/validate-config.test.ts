import { describe, expect, it } from "vitest";
import { createBench } from "./engine";
import { validateChemistryLabConfig } from "./validate-config";

const base = () => ({
  schema: "k2-lab-config/1",
  labId: "acid-base-indicators",
  catalogId: "FL-13",
  configVersion: 1,
  kit: "k2-wet-bench@1",
  engine: "wet-bench@1.0.0",
  reactionCatalog: "k2-reactions@1",
  title: "Acid, base và chất chỉ thị",
  outcomeSummary: ["Nhận biết acid, base bằng chất chỉ thị."],
  safetyBriefing: { simulation: ["An toàn trong mô phỏng."], realLab: ["Đeo kính bảo hộ."], acknowledgeRequired: true },
  limitations: ["Không mô phỏng nhiệt độ."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "T1", kind: "test_tube", slot: "rack_1" },
    { id: "B1", kind: "beaker_100ml", slot: "bench_1", initial: { contents: [{ reagentId: "H2O_distilled", microliters: 5000 }] } },
    { id: "meter", kind: "digital_ph_meter", slot: "tool_ph" },
  ],
  availableReagents: [{ reagentId: "HCl_0_1M", shelfPosition: 1 }, { reagentId: "NaOH_0_1M", shelfPosition: 2 }],
  allowedReactions: ["acid-base.neutralization"],
  measurements: ["ph_meter"],
  dispensing: { liquidPresetsMicroliters: [50, 250, 1000] },
  pedagogy: { revealEquations: "after_observation", observationPrompts: [{ id: "p1", kind: "note", textVi: "Đo pH.", focus: { apparatusId: "meter" }, highlightWhen: { measurement: "ph_meter" } }] },
  review: { status: "draft" },
});

describe("validateChemistryLabConfig", () => {
  it("accepts a well-formed config and builds its bench", () => {
    const result = validateChemistryLabConfig(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bench = createBench(result.config);
    expect(Object.keys(bench.vessels)).toEqual(["T1", "B1"]);
    expect(bench.vessels.B1.solutionMicroliters).toBe(5000);
  });
  it("rejects unknown reagents and reactions, missing tools and dangling prompt references", () => {
    const config = base();
    config.availableReagents.push({ reagentId: "Mystery_acid", shelfPosition: 3 });
    config.allowedReactions.push("explode.everything");
    config.measurements = ["ph_meter", "litmus_paper"];
    config.pedagogy.observationPrompts[0].focus = { apparatusId: "nowhere" };
    const result = validateChemistryLabConfig(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      "availableReagents: unknown reagent Mystery_acid",
      "allowedReactions: unknown explode.everything",
      "measurements: litmus_paper needs litmus_strip_dispenser on the bench",
      "observationPrompts.p1: unknown apparatus nowhere",
    ]));
  });
  it("rejects duplicate ids and slots", () => {
    const config = base();
    config.enabledApparatus.push({ id: "T1", kind: "test_tube", slot: "rack_1" });
    const result = validateChemistryLabConfig(config);
    expect(!result.ok && result.errors).toEqual(expect.arrayContaining(["enabledApparatus: duplicate id T1", "enabledApparatus: two items in slot rack_1"]));
  });
  it("refuses to mark a config reviewed while its chemistry data is still a draft", () => {
    const config = { ...base(), review: { status: "reviewed" } };
    const result = validateChemistryLabConfig(config);
    expect(!result.ok && result.errors.join()).toMatch(/unreviewed inputs remain/);
  });
  it("rejects unknown fields (strict schema)", () => {
    expect(validateChemistryLabConfig({ ...base(), physicsEngine: "free" }).ok).toBe(false);
  });
  it("warns when an allowed reaction can never happen on this bench", () => {
    const config = { ...base(), allowedReactions: ["acid-base.neutralization", "metal-acid.zn-hcl"] };
    const result = validateChemistryLabConfig(config);
    expect(result.ok && result.warnings).toEqual(["allowedReactions: metal-acid.zn-hcl cannot happen (no Zn on the bench)"]);
  });
});
