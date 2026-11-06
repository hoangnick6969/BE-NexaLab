import { describe, expect, it } from "vitest";
import { CHECKPOINT_HINT_CATALOGS } from "./checkpoint-hint-rules";
import { explainVerdict } from "./verdict-explanation";

const FW = "food-web-checkpoints@1.0.0";

describe("B2 verdict explanation", () => {
  it("returns null for a rubric without a catalog", () => {
    expect(explainVerdict({ rubricRef: "unknown@1", verdict: "passed", result: {} })).toBeNull();
  });

  it("passed: every step met, each with the catalog's level-4 method wording", () => {
    const out = explainVerdict({ rubricRef: FW, verdict: "passed", result: { assessment: { unmetCriteria: [] } } })!;
    expect(out.verdict).toBe("passed");
    expect(out.items.map((item) => item.criterion)).toEqual(CHECKPOINT_HINT_CATALOGS[FW].order);
    for (const item of out.items) {
      expect(item.met).toBe(true);
      expect(item.why).toBe(CHECKPOINT_HINT_CATALOGS[FW].criteria[item.criterion].levels[3][0]);
    }
    expect(out).toMatchObject({ provider: "rules", ruleVersion: "verdict-explanations@1", hintRules: "checkpoint-hints@6" });
  });

  it("not passed: unmet steps carry only their name, no wording that could hold the answer", () => {
    const out = explainVerdict({ rubricRef: FW, verdict: "not_passed", result: { assessment: { unmetCriteria: ["prediction:HUNT", "explanation"] } } })!;
    const unmet = out.items.filter((item) => !item.met);
    expect(unmet.map((item) => item.criterion)).toEqual(["prediction:HUNT", "explanation"]);
    expect(unmet.every((item) => item.why === null)).toBe(true);
    expect(out.items.find((item) => item.criterion === "prediction:ROLES")).toMatchObject({ met: true });
    expect(out.summary).toContain("2 bước");
  });

  it("not passed with no catalog step unmet: a general item instead of claiming all met", () => {
    const out = explainVerdict({ rubricRef: FW, verdict: "not_passed", result: { assessment: { unmetCriteria: [] } } })!;
    expect(out.items.at(-1)).toMatchObject({ criterion: "other", met: false, why: null });
  });

  it("event Labs read their criteria map; a passed verdict never lists leftovers as unmet", () => {
    const result = { criteria: { rotation: true, moment: false, prediction: true, equilibrium: true, application: true } };
    const failed = explainVerdict({ rubricRef: "lever-investigation@1.0.0", verdict: "not_passed", result })!;
    expect(failed.items.filter((item) => !item.met).map((item) => item.criterion)).toEqual(["moment"]);
    const passed = explainVerdict({ rubricRef: "lever-investigation@1.0.0", verdict: "passed", result })!;
    expect(passed.items.every((item) => item.met)).toBe(true);
  });
});
