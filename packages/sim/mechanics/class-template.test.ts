import { describe, expect, it } from "vitest";
import { evaluateLeverBench } from "../lever-bench";
import { deriveLeverEffectiveConfig, findLeverBalance, FL06_LEVER_EXPLORE_CONFIG as config, validateLeverLabConfig } from "./index";

const pick = (over: Record<string, unknown> = {}) => ({
  templateId: "balance-the-lever", loadPresetId: "load-1n-left-100", weightOptionIndex: 0, gauge: false, momentTable: true, promptId: "explain-balance", ...over,
});
const errorsOf = (selection: unknown) => {
  const result = deriveLeverEffectiveConfig(config, selection);
  return result.ok ? [] : result.errors;
};

describe("FL-06 class template (spec fl-06-class-explore-spec.md §4)", () => {
  it("the packaged config with its template is valid", () => {
    expect(validateLeverLabConfig(config).ok).toBe(true);
  });

  it("CT-01 derives the student's bench: the chosen load fixed, the chosen weights, the switches, one prompt, no templates", () => {
    const result = deriveLeverEffectiveConfig(config, pick({ loadPresetId: "load-2n-right-150", weightOptionIndex: 1, gauge: true, momentTable: false }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.initialAttachments).toEqual([{ kind: "WEIGHT", positionMillimetres: 150, forceMilliNewtons: 2000 }]);
    expect(result.config.lockInitialAttachments).toBe(true);
    expect(result.config.weights.availableMilliNewtons).toEqual([1000]);
    expect(result.config.enabledApparatus.map((item) => item.kind)).toContain("spring_gauge");
    expect(result.config.measurements).toEqual(["ruler", "force_labels"]);
    expect(result.config.pedagogy.observationPrompts?.map((prompt) => prompt.id)).toEqual(["explain-balance"]);
    expect("classTemplates" in result.config).toBe(false);
    expect(result.requirements).toEqual([
      { kind: "measure", itemId: "moment-left", measurement: "moment", unit: "milliNewtonMetres" },
      { kind: "measure", itemId: "moment-right", measurement: "moment", unit: "milliNewtonMetres" },
      { kind: "explain" },
    ]);
    expect(validateLeverLabConfig(result.config).ok).toBe(true);
  });

  it("CT-02 the gauge off takes the spring gauge off the bench", () => {
    const result = deriveLeverEffectiveConfig(config, pick());
    expect(result.ok && result.config.enabledApparatus.some((item) => item.kind === "spring_gauge")).toBe(false);
  });

  it("CT-03 golden: every load × weight set × gauge is levelled, except 0.5 N at 250 mm with 1 N weights and no gauge", () => {
    const refused: string[] = [];
    for (const preset of config.classTemplates![0].loadPresets)
      for (const weightOptionIndex of [0, 1])
        for (const gauge of [false, true]) {
          const errors = errorsOf(pick({ loadPresetId: preset.id, weightOptionIndex, gauge }));
          if (errors.length) refused.push(`${preset.id}/${weightOptionIndex}/${gauge}: ${errors.join("; ")}`);
        }
    expect(refused).toEqual(["load-05n-left-250/1/false: measure moment: the starting load cannot be levelled with these weights without the gauge"]);
  });

  it("CT-04 the balance found is a real one: the lever model says LEVEL", () => {
    for (const preset of config.classTemplates![0].loadPresets)
      for (const gauge of [false, true]) {
        const added = findLeverBalance(preset.attachments, [500, 1000, 2000], 4, gauge)!;
        const model = evaluateLeverBench({ fixtureId: config.fixtureId, attachments: [...preset.attachments, ...added] });
        expect(model.ok && model.value.displayState).toBe("LEVEL");
      }
  });

  it("CT-05 refuses choices outside the template", () => {
    expect(errorsOf(pick({ loadPresetId: "load-9n" }))).toEqual(["load preset load-9n is not in template balance-the-lever"]);
    expect(errorsOf(pick({ weightOptionIndex: 3 }))).toEqual(["weight option 3 is not in template balance-the-lever"]);
    expect(errorsOf(pick({ promptId: "farther" }))).toEqual(["prompt farther is not offered by template balance-the-lever"]);
    expect(errorsOf(pick({ templateId: "other" }))).toEqual(["unknown template other"]);
    expect(errorsOf({ ...pick(), extra: 1 })[0]).toMatch(/^selection/);
  });

  it("CT-06 a switch the template leaves to the teacher must be sent; a fixed one must not", () => {
    const { gauge: _gauge, ...noGauge } = pick();
    expect(errorsOf(noGauge)).toEqual(["gauge: template balance-the-lever leaves it to the teacher, so it must be sent"]);
    const fixed = { ...config, classTemplates: [{ ...config.classTemplates![0], gauge: "off" as const }] };
    const result = deriveLeverEffectiveConfig(fixed, pick({ gauge: true }));
    expect(result.ok ? [] : result.errors).toEqual(["gauge: template balance-the-lever fixes it to off"]);
  });

  it("CT-07 measuring moments needs the ruler and force labels", () => {
    const noRuler = { ...config, measurements: ["force_labels", "moment_table"] as const };
    const result = deriveLeverEffectiveConfig({ ...noRuler, measurements: [...noRuler.measurements] }, pick());
    expect(result.ok ? [] : result.errors).toContain("measure moment: the ruler is needed to read lever arms");
  });

  it("CT-08 template rules are checked with the config: prompts, weights and loads", () => {
    const template = config.classTemplates![0];
    const broken = {
      ...config,
      classTemplates: [{
        ...template,
        promptChoices: [{ promptId: "missing" }],
        weightOptions: [[1500]],
        loadPresets: [{ id: "bad", labelVi: "Ở lỗ không có", attachments: [{ kind: "WEIGHT" as const, positionMillimetres: 75, forceMilliNewtons: 1000 }] }],
      }],
    };
    const result = validateLeverLabConfig(broken);
    expect(result.ok ? [] : result.errors).toEqual(expect.arrayContaining([
      "classTemplates.balance-the-lever: prompt missing is not in pedagogy.observationPrompts",
      "classTemplates.balance-the-lever.weightOptions.0: 1500 mN is not in weights.availableMilliNewtons",
      "classTemplates.balance-the-lever.bad: the load does not fit the lever model",
    ]));
  });
});
