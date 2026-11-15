import { describe, expect, it } from "vitest";
import { deriveWetBenchEffectiveConfig, validateWetBenchEffectiveConfig, type EffectiveRequirement } from "./class-template";
import type { ChemistryLabConfig } from "./contracts";
import { validateChemistryLabConfig } from "./validate-config";

const SAMPLES = ["HCl_0_1M", "H2SO4_0_05M", "CH3COOH_0_1M", "H2O_distilled", "NaOH_0_1M", "CaOH2_0_01M"];

/** Shaped like the FL-13 Explore config, with the pH sample template of the Kit Hóa học pilot. */
const fl13Like = (patch: Record<string, unknown> = {}, template: Record<string, unknown> = {}) => ({
  schema: "k2-lab-config/1", labId: "acid-base-indicators", catalogId: "FL-13", configVersion: 2,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", reactionCatalog: "k2-reactions@1",
  title: "Acid – base, chỉ thị và pH",
  outcomeSummary: ["Đo pH và so sánh độ acid."],
  safetyBriefing: { simulation: ["An toàn trong mô phỏng."], realLab: ["Đeo kính bảo hộ."], acknowledgeRequired: true },
  limitations: ["Mô hình ở 25 °C."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "rack", kind: "test_tube_rack_6", slot: "rack_base" },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `T${n}`, kind: "test_tube", slot: `rack_${n}` })),
    { id: "B1", kind: "beaker_100ml", slot: "bench_1" },
    { id: "waste", kind: "waste_beaker", slot: "waste_slot" },
    { id: "dropper", kind: "dropper_pipette", slot: "tool_1" },
    { id: "litmus", kind: "litmus_strip_dispenser", slot: "tool_2" },
    { id: "meter", kind: "digital_ph_meter", slot: "tool_3" },
  ],
  availableReagents: [...SAMPLES, "phenolphthalein_indicator"].map((reagentId, index) => ({ reagentId, shelfPosition: index + 1 })),
  allowedReactions: ["acid-base.neutralization"],
  measurements: ["ph_meter", "litmus_paper"],
  dispensing: { liquidPresetsMicroliters: [50, 250, 500] },
  pedagogy: {
    revealEquations: "after_observation",
    observationPrompts: [
      { id: "compare-two-samples", kind: "free_text", textVi: "Đo pH của hai mẫu. Mẫu nào acid mạnh hơn? Vì sao?", focus: { apparatusId: "meter" }, highlightWhen: { measurement: "ph_meter" } },
      { id: "strong-vs-weak", kind: "free_text", textVi: "So sánh HCl 0,1 M và CH₃COOH 0,1 M. Vì sao pH khác nhau?", focus: { apparatusId: "meter" }, highlightWhen: { measurement: "ph_meter" } },
      { id: "indicator-compare", kind: "free_text", textVi: "Chất chỉ thị nào phân biệt nước cất với dung dịch base?" },
    ],
  },
  review: { status: "draft" },
  classTemplates: [{
    id: "ph-compare-two-samples", titleVi: "So sánh pH của hai mẫu",
    requiredApparatusIds: ["rack", "T1", "T2", "dropper", "waste", "meter"],
    reagentGroups: [{ id: "samples", labelVi: "Hai mẫu cần đo", count: 2, options: SAMPLES }],
    promptChoices: [{ promptId: "compare-two-samples" }, { promptId: "strong-vs-weak", onlyWithReagents: ["HCl_0_1M", "CH3COOH_0_1M"] }],
    requirements: { measure: { measurement: "ph_meter", perGroup: "samples" }, explain: true },
    ...template,
  }],
  ...patch,
});
const config = (patch?: Record<string, unknown>, template?: Record<string, unknown>) => {
  const result = validateChemistryLabConfig(fl13Like(patch, template));
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.config;
};
const pick = (reagents: string[], promptId = "compare-two-samples") => ({ templateId: "ph-compare-two-samples", reagents: { samples: reagents }, promptId });
const errorsOf = (result: ReturnType<typeof deriveWetBenchEffectiveConfig>) => (result.ok ? [] : result.errors);

describe("class template: config validation", () => {
  it("accepts the pilot template and an old config without templates", () => {
    expect(validateChemistryLabConfig(fl13Like()).ok).toBe(true);
    const { classTemplates: _gone, ...plain } = fl13Like();
    expect(validateChemistryLabConfig(plain).ok).toBe(true);
  });
  it("refuses a template that points at things the config does not have", () => {
    const bad = (template: Record<string, unknown>) => {
      const result = validateChemistryLabConfig(fl13Like({}, template));
      return result.ok ? [] : result.errors.join(" | ");
    };
    expect(bad({ requiredApparatusIds: ["meter", "ghost"] })).toContain("unknown apparatus ghost");
    expect(bad({ reagentGroups: [{ id: "samples", labelVi: "Mẫu", count: 2, options: ["HCl_0_1M", "Zn_granule"] }] })).toContain("option Zn_granule is not on the shelf");
    expect(bad({ reagentGroups: [{ id: "samples", labelVi: "Mẫu", count: 3, options: ["HCl_0_1M", "NaOH_0_1M"] }] })).toContain("count 3 exceeds the 2 options");
    expect(bad({ promptChoices: [{ promptId: "no-such-prompt" }] })).toContain("prompt no-such-prompt is not in observationPrompts");
    expect(bad({ promptChoices: [{ promptId: "strong-vs-weak", onlyWithReagents: ["CuSO4_0_1M"] }] })).toContain("is in no reagent group");
    expect(bad({ requirements: { measure: { measurement: "ph_meter", perGroup: "other" }, explain: true } })).toContain("unknown reagent group other");
    expect(bad({ requiredApparatusIds: ["rack", "T1", "T2", "dropper", "waste"] })).toContain("needs digital_ph_meter among requiredApparatusIds");
    expect(bad({ requirements: { explain: false } })).toContain("at least one requirement");
    expect(bad({ requiresReactions: ["nope"] })).toContain("unknown reaction nope");
  });
});

describe("class template: derive the effective config", () => {
  it("keeps only the required apparatus, the two chosen samples, the pH pen and the chosen prompt", () => {
    const result = deriveWetBenchEffectiveConfig(config(), pick(["CH3COOH_0_1M", "HCl_0_1M"], "strong-vs-weak"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const effective = result.config;
    // Config order, not the order the template lists them.
    expect(effective.enabledApparatus.map((item) => item.id)).toEqual(["rack", "T1", "T2", "waste", "dropper", "meter"]);
    // Shelf order, renumbered, however the teacher ordered the pick.
    expect(effective.availableReagents).toEqual([{ reagentId: "HCl_0_1M", shelfPosition: 1 }, { reagentId: "CH3COOH_0_1M", shelfPosition: 2 }]);
    expect(effective.measurements).toEqual(["ph_meter"]);
    expect(effective.pedagogy.observationPrompts?.map((prompt) => prompt.id)).toEqual(["strong-vs-weak"]);
    expect(effective.classTemplates).toBeUndefined();
    expect(result.requirements).toEqual<EffectiveRequirement[]>([
      { kind: "measure", itemId: "HCl_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
      { kind: "measure", itemId: "CH3COOH_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
      { kind: "explain" },
    ]);
  });
  it("gives the same result for the same pair in either order, and does not change the input", () => {
    const source = config();
    const before = JSON.stringify(source);
    const a = deriveWetBenchEffectiveConfig(source, pick(["NaOH_0_1M", "H2O_distilled"]));
    const b = deriveWetBenchEffectiveConfig(source, pick(["H2O_distilled", "NaOH_0_1M"]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(source)).toBe(before);
  });
  it("accepts every pair of the allow-list for the general comparison prompt", () => {
    const source = config();
    for (let i = 0; i < SAMPLES.length; i++) for (let j = i + 1; j < SAMPLES.length; j++)
      expect(deriveWetBenchEffectiveConfig(source, pick([SAMPLES[i], SAMPLES[j]])).ok, `${SAMPLES[i]} + ${SAMPLES[j]}`).toBe(true);
  });
});

describe("class template: what the server must refuse", () => {
  const source = config();
  it("refuses a reagent outside the allow-list", () => {
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M", "phenolphthalein_indicator"]))).join()).toContain("phenolphthalein_indicator is not in the allow-list");
  });
  it("refuses a wrong number of samples or the same sample twice", () => {
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M"]))).join()).toContain("select exactly 2, got 1");
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M", "NaOH_0_1M", "H2O_distilled"]))).join()).toContain("select exactly 2, got 3");
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M", "HCl_0_1M"]))).join()).toContain("selected twice");
  });
  it("refuses an unknown template, an unknown group, a missing group and a malformed selection", () => {
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, { ...pick(["HCl_0_1M", "NaOH_0_1M"]), templateId: "other" }))).toEqual(["unknown template other"]);
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, { ...pick(["HCl_0_1M", "NaOH_0_1M"]), reagents: { samples: ["HCl_0_1M", "NaOH_0_1M"], extra: ["H2O_distilled"] } })).join()).toContain("reagent group extra: not in template");
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, { ...pick([]), reagents: {} })).join()).toContain("nothing selected");
    expect(deriveWetBenchEffectiveConfig(source, { templateId: "ph-compare-two-samples" }).ok).toBe(false);
    expect(deriveWetBenchEffectiveConfig(source, { ...pick(["HCl_0_1M", "NaOH_0_1M"]), surprise: 1 }).ok).toBe(false);
  });
  it("refuses a prompt the template does not offer", () => {
    expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M", "NaOH_0_1M"], "indicator-compare"))).join()).toContain("is not offered by template");
  });
  it("allows strong-vs-weak only for exactly HCl and CH₃COOH", () => {
    expect(deriveWetBenchEffectiveConfig(source, pick(["HCl_0_1M", "CH3COOH_0_1M"], "strong-vs-weak")).ok).toBe(true);
    for (const pair of [["HCl_0_1M", "NaOH_0_1M"], ["H2SO4_0_05M", "CH3COOH_0_1M"], ["H2O_distilled", "HCl_0_1M"]])
      expect(errorsOf(deriveWetBenchEffectiveConfig(source, pick(pair, "strong-vs-weak"))).join(), pair.join()).toContain("only valid when");
  });
});

describe("class template: strict validation", () => {
  const requirements: EffectiveRequirement[] = [{ kind: "measure", itemId: "HCl_0_1M", measurement: "ph_meter", unit: "tenthsPh" }, { kind: "explain" }];
  const effective = () => {
    const result = deriveWetBenchEffectiveConfig(config(), pick(["HCl_0_1M", "NaOH_0_1M"]));
    if (!result.ok) throw new Error(result.errors.join());
    return result.config;
  };
  it("passes the derived config", () => {
    expect(validateWetBenchEffectiveConfig(effective(), requirements).ok).toBe(true);
  });
  it("refuses a measure requirement without a measuring tool", () => {
    const noPen = { ...effective(), enabledApparatus: effective().enabledApparatus.filter((item) => item.id !== "meter"), measurements: [], pedagogy: { revealEquations: "after_observation" as const, observationPrompts: [] } };
    const result = validateWetBenchEffectiveConfig(noPen, requirements);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.errors.join(" | ")).toContain("ph_meter is not enabled");
    expect(result.ok ? "" : result.errors.join(" | ")).toContain("digital_ph_meter is not on the bench");
  });
  it("refuses to measure a reagent that is not on the shelf or whose pH the model does not cover", () => {
    expect(validateWetBenchEffectiveConfig(effective(), [{ kind: "measure", itemId: "H2O_distilled", measurement: "ph_meter", unit: "tenthsPh" }]).ok).toBe(false);
    const withCopper = { ...effective(), availableReagents: [{ reagentId: "CuSO4_0_1M", shelfPosition: 1 }] };
    const result = validateWetBenchEffectiveConfig(withCopper, [{ kind: "measure", itemId: "CuSO4_0_1M", measurement: "ph_meter", unit: "tenthsPh" }]);
    expect(result.ok ? "" : result.errors.join()).toContain("pH is not modelled");
  });
  it("turns 'cannot happen' into an error for a reaction a requirement needs, and only for that", () => {
    const withReaction = config({}, { requiresReactions: ["acid-base.neutralization"] });
    expect(deriveWetBenchEffectiveConfig(withReaction, pick(["HCl_0_1M", "NaOH_0_1M"])).ok).toBe(true);
    expect(errorsOf(deriveWetBenchEffectiveConfig(withReaction, pick(["HCl_0_1M", "CH3COOH_0_1M"]))).join()).toContain("needs an acid and a base");
    expect(errorsOf(deriveWetBenchEffectiveConfig(withReaction, pick(["NaOH_0_1M", "CaOH2_0_01M"]))).join()).toContain("needs an acid and a base");
    // Without the requirement the same two acids are a perfectly good pH comparison.
    expect(deriveWetBenchEffectiveConfig(config(), pick(["HCl_0_1M", "CH3COOH_0_1M"])).ok).toBe(true);
  });
  it("refuses a reaction the effective config does not allow", () => {
    const noReactions = { ...effective(), allowedReactions: [] };
    expect(validateWetBenchEffectiveConfig(noReactions, requirements, ["acid-base.neutralization"]).ok).toBe(false);
  });
});

describe("class template: typing", () => {
  it("derive takes a validated config", () => {
    const source: ChemistryLabConfig = config();
    expect(source.classTemplates?.[0].reagentGroups[0].count).toBe(2);
  });
});
