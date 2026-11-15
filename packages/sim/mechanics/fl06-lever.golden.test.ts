import { describe, expect, it } from "vitest";
import { evaluateLeverBench } from "../lever-bench";
import { FL06_LEVER_EXPLORE_CONFIG as base, validateLeverLabConfig, type LeverAttachment } from "./index";

const withStart = (initialAttachments: LeverAttachment[]) => ({ ...base, initialAttachments });
const run = (attachments: LeverAttachment[]) => {
  const result = evaluateLeverBench({ fixtureId: base.fixtureId, attachments });
  if (!result.ok) throw new Error(result.code);
  return result.value;
};

describe("FL-06 mechanics bench golden", () => {
  it("G-01 the packaged config is valid and flagged as draft", () => {
    const result = validateLeverLabConfig(base);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/^review\.status: draft/)]);
  });

  it("G-02 C1: 1 N at -100 mm and a 0.5 N gauge at 200 mm balance at 100 000 mN·mm a side", () => {
    const start: LeverAttachment[] = [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }, { kind: "GAUGE", positionMillimetres: 200, forceMilliNewtons: 500 }];
    expect(validateLeverLabConfig(withStart(start)).ok).toBe(true);
    expect(run(start)).toMatchObject({ balance: "BALANCED", displayState: "LEVEL", ccwMomentMilliNewtonMillimetres: 100_000, cwMomentMilliNewtonMillimetres: 100_000 });
  });

  it("G-03 C2: 2 N at 150 mm and a 3 N gauge at -100 mm balance", () => {
    const start: LeverAttachment[] = [{ kind: "WEIGHT", positionMillimetres: 150, forceMilliNewtons: 2000 }, { kind: "GAUGE", positionMillimetres: -100, forceMilliNewtons: 3000 }];
    expect(validateLeverLabConfig(withStart(start)).ok).toBe(true);
    expect(run(start)).toMatchObject({ balance: "BALANCED", netMomentMilliNewtonMillimetres: 0 });
  });

  it("G-04 one weight left of O tilts the bar left", () => {
    expect(run(base.initialAttachments)).toMatchObject({ balance: "UNBALANCED", displayState: "TILT_LEFT", netMomentMilliNewtonMillimetres: 100_000 });
  });

  it("G-05 a weight at O has no moment and the bar stays level", () => {
    const start: LeverAttachment[] = [{ kind: "WEIGHT", positionMillimetres: 0, forceMilliNewtons: 1000 }];
    expect(validateLeverLabConfig(withStart(start)).ok).toBe(true);
    expect(run(start)).toMatchObject({ displayState: "LEVEL", ccwMomentMilliNewtonMillimetres: 0, cwMomentMilliNewtonMillimetres: 0 });
  });
});
