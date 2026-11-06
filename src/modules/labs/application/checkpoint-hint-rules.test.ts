import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_HINT_CATALOGS, CHECKPOINT_HINT_RULES, catalogTexts, detectMisconception, evaluateOneCheckpoint, hasRunHints, hasRunReflections, planCheckpointHint, planRunHint, runHintSteps,
  type PreviousCheckpointHint, type PreviousRunHint,
} from "./checkpoint-hint-rules";
import { CIRCUIT_BULB_RUBRIC } from "./evaluators/circuit-bulb-checkpoints.evaluator";
import { densityStationsEvaluator } from "./evaluators/density-stations.evaluator";
import { eyeOpticsEvaluator } from "./evaluators/eye-anatomy-optics.evaluator";
import { geneProteinStationsEvaluator } from "./evaluators/gene-protein-stations.evaluator";
import { buoyancyLabEvaluator } from "./evaluators/buoyancy-lab.evaluator";

const DENSITY_RUBRIC = densityStationsEvaluator.rubricRef, EYE_OPTICS_RUBRIC = eyeOpticsEvaluator.rubricRef;
const GENE_RUBRIC = geneProteinStationsEvaluator.rubricRef, BUOYANCY_RUBRIC = buoyancyLabEvaluator.rubricRef;
import { ECOLOGY_TOLERANCE_RUBRIC, FOOD_WEB_RUBRIC, evaluateFoodWebActivity } from "./checkpoint-activities";

const foodWeb = () => [
  { id: "ROLES" as const, state: { setup: "roles", webId: "W1" } as Record<string, unknown>, prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "DECOMPOSER" } as unknown },
  { id: "CHAIN" as const, state: { setup: "chain", webId: "W1", nodes: ["co", "chau-chau", "ech", "ran"] } as Record<string, unknown>, prediction: "CHAIN" as unknown },
  { id: "ENERGY" as const, state: { setup: "energy", webId: "W1", chain: ["co", "chau-chau", "ech", "ran"] } as Record<string, unknown>, prediction: { value: "10" } as unknown },
  { id: "HUNT" as const, state: { setup: "remove", webId: "W1", speciesId: "ran" } as Record<string, unknown>, prediction: "INCREASE" as unknown },
  { id: "DEFOREST" as const, state: { setup: "remove", webId: "W1", speciesId: "cay-xanh" } as Record<string, unknown>, prediction: "DECREASE" as unknown },
  { id: "CAUSES" as const, state: { setup: "causes", webId: "W1" } as Record<string, unknown>, prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat"] as unknown },
];
const answer = (patch: Partial<Record<"ROLES" | "CHAIN" | "ENERGY" | "HUNT" | "DEFOREST" | "CAUSES", unknown>>, explanation = "A") => {
  const checkpoints = foodWeb().map((checkpoint) => (checkpoint.id in patch ? { ...checkpoint, ...(patch as any)[checkpoint.id] } : checkpoint));
  const evidence = { checkpoints, explanation };
  return { evidence, result: evaluateFoodWebActivity(checkpoints as any, explanation).result };
};
const plan = (submission: ReturnType<typeof answer>, previous: PreviousCheckpointHint[] = []) =>
  planCheckpointHint({ rubricRef: FOOD_WEB_RUBRIC, evidence: submission.evidence, result: submission.result, previous });
const remember = (hint: NonNullable<ReturnType<typeof plan>>): PreviousCheckpointHint =>
  ({ criterion: hint.criterion, level: hint.level, variant: hint.variant, answerDigest: hint.answerDigest });

describe("SAI-01A checkpoint hint catalogs", () => {
  it.each(Object.keys(CHECKPOINT_HINT_CATALOGS))("%s: no template reveals the expected answer", (rubricRef) => {
    for (const { criterion, text, forbidden } of catalogTexts(rubricRef)) {
      for (const pattern of [...forbidden, /(?:[đĐ]áp án|[lL]ựa chọn|[pP]hương án|[cC]họn)\s+[ABC](?![\p{L}\p{N}])/u])
        expect({ criterion, text, leaks: pattern.test(text) }).toEqual({ criterion, text, leaks: false });
      expect(text.trim().length).toBeGreaterThan(20);
    }
  });

  it.each(Object.entries(CHECKPOINT_HINT_CATALOGS))("%s: the hint order covers exactly the catalog criteria", (_rubricRef, catalog) => {
    expect([...catalog.order].sort()).toEqual(Object.keys(catalog.criteria).sort());
    if (catalog.inRun) expect(catalog.order.at(-1)).toBe("explanation");
  });

  it("pins the template text to its rule version (bump CHECKPOINT_HINT_RULES when wording changes)", () => {
    const texts = Object.keys(CHECKPOINT_HINT_CATALOGS).sort().flatMap((rubricRef) => catalogTexts(rubricRef).map((item) => `${rubricRef}|${item.criterion}|${item.text}`));
    const digest = createHash("sha256").update(texts.join("\n")).digest("hex");
    expect({ version: CHECKPOINT_HINT_RULES, digest }).toEqual({ version: "checkpoint-hints@6", digest: PINNED_DIGEST });
  });
});

describe("SAI-01A in-run hints", () => {
  const run = (criterion: string, moment: "BEFORE_PREDICTION" | "AFTER_OBSERVATION", previous: PreviousRunHint[] = [], observation: any = null) =>
    planRunHint({ rubricRef: FOOD_WEB_RUBRIC, criterion, moment, previous, observation });
  const keep = (hint: ReturnType<typeof run>): PreviousRunHint => ({ criterion: hint.criterion, moment: hint.moment, level: hint.level, variant: hint.variant });

  it("before predicting: level 1, then 2, then stays at 2 with the other wording, and never tailors to a draft", () => {
    const first = run("prediction:HUNT", "BEFORE_PREDICTION");
    const second = run("prediction:HUNT", "BEFORE_PREDICTION", [keep(first)]);
    const third = run("prediction:HUNT", "BEFORE_PREDICTION", [keep(first), keep(second)]);
    expect([first, second, third].map((hint) => [hint.level, hint.variant, hint.repeatReason, hint.misconception]))
      .toEqual([[1, "a", null, null], [2, "a", null, null], [2, "b", "TOP_LEVEL", null]]);
    const ladder = CHECKPOINT_HINT_CATALOGS[FOOD_WEB_RUBRIC].criteria["prediction:HUNT"].levels;
    expect([first.content, second.content, third.content]).toEqual([ladder[0][0], ladder[1][0], ladder[1][1]]);
  });

  it("keeps moment A per checkpoint and allows it for the explanation", () => {
    const hunt = run("prediction:HUNT", "BEFORE_PREDICTION");
    expect(run("prediction:DEFOREST", "BEFORE_PREDICTION", [keep(hunt)]).level).toBe(1);
    expect(run("explanation", "BEFORE_PREDICTION")).toMatchObject({ level: 1, checkpointId: null });
  });

  it("after observing a mismatch: a reflection worded for the misconception, outside the 1-4 ladder", () => {
    const observation = evaluateOneCheckpoint(FOOD_WEB_RUBRIC, { id: "HUNT", state: { setup: "remove", webId: "W1", speciesId: "ran" }, prediction: "DECREASE" });
    expect(observation.predictionCorrect).toBe(false);
    const reflection = run("prediction:HUNT", "AFTER_OBSERVATION", [], observation);
    expect(reflection).toMatchObject({ level: 0, moment: "AFTER_OBSERVATION", misconception: "FW_ALL_DECREASE",
      content: CHECKPOINT_HINT_CATALOGS[FOOD_WEB_RUBRIC].criteria["prediction:HUNT"].reflections!.FW_ALL_DECREASE });
    expect(run("prediction:HUNT", "AFTER_OBSERVATION", [keep(reflection)], observation).variant).toBe("b");
  });

  it("rejects a reflection for the explanation or an unknown checkpoint", () => {
    expect(() => run("explanation", "AFTER_OBSERVATION")).toThrow("NO_REFLECTION");
    expect(() => run("prediction:NOPE", "BEFORE_PREDICTION")).toThrow("UNKNOWN_CHECKPOINT");
  });

  it.each([
    [FOOD_WEB_RUBRIC, { id: "HUNT", state: { setup: "remove", webId: "W1", speciesId: "ran" }, prediction: "INCREASE" }, true],
    [FOOD_WEB_RUBRIC, { id: "CHAIN", state: { setup: "chain", webId: "W1", nodes: ["co", "chau-chau", "ech", "ran"] }, prediction: "CHAIN" }, true],
    [CIRCUIT_BULB_RUBRIC, { id: "OPEN", state: { nodes: [{ id: "battery", type: "battery" }, { id: "bulb", type: "bulb" }, { id: "switch", type: "switch", closed: false }], edges: [{ source: "battery", target: "bulb" }, { source: "bulb", target: "switch" }, { source: "switch", target: "battery" }] }, prediction: "ON" }, false],
  ] as const)("scores one checkpoint with the activity evaluator (%s %j)", (rubricRef, checkpoint, correct) => {
    expect(evaluateOneCheckpoint(rubricRef, checkpoint as any).predictionCorrect).toBe(correct);
  });

  it("refuses a state or prediction the activity would reject", () => {
    expect(() => evaluateOneCheckpoint(FOOD_WEB_RUBRIC, { id: "HUNT", state: { setup: "remove", webId: "W1", speciesId: "dai-bang" }, prediction: "INCREASE" })).toThrow();
    expect(() => evaluateOneCheckpoint(FOOD_WEB_RUBRIC, { id: "HUNT", state: { setup: "remove", webId: "W1", speciesId: "ran" }, prediction: "MAYBE" })).toThrow();
    expect(() => evaluateOneCheckpoint(FOOD_WEB_RUBRIC, { id: "NOPE", state: {}, prediction: null })).toThrow();
  });
});

describe("SAI-01A station Labs (step 2)", () => {
  const station = (rubricRef: string, unmetCriteria: string[], evidence: unknown = {}, previous: PreviousCheckpointHint[] = []) =>
    planCheckpointHint({ rubricRef, evidence, result: { assessment: { unmetCriteria } }, previous });

  it("groups density stations by criterion and keeps the concept questions apart", () => {
    expect(station(DENSITY_RUBRIC, ["calculation:pebble", "cylinder:water", "concept:irregular"])).toMatchObject({ criterion: "cylinder", checkpointId: null, level: 1 });
    expect(station(DENSITY_RUBRIC, ["concept:irregular", "concept:explore"])).toMatchObject({ criterion: "concept:explore" });
  });

  it("maps FL-16 phase-2 reasons to one key in a fixed order", () => {
    expect(station(EYE_OPTICS_RUBRIC, ["phase2:myopia-far:glasses+focus"])).toMatchObject({ criterion: "phase2:focus" });
    expect(station(EYE_OPTICS_RUBRIC, ["phase2:myopia-far:glasses", "phase1:cornea"])).toMatchObject({ criterion: "phase1" });
  });

  it("escalates a station only when that station's answer changed", () => {
    const evidence = { block: { trials: [{ aMm: 1 }] }, water: { volumeMl: 50 }, pebble: { v1Ml: 50, v2Ml: 60 } };
    const first = station(DENSITY_RUBRIC, ["cylinder:pebble"], evidence)!;
    const keep = { criterion: first.criterion, level: first.level, variant: first.variant, answerDigest: first.answerDigest };
    const otherStationChanged = { ...evidence, block: { trials: [{ aMm: 2 }] } };
    expect(station(DENSITY_RUBRIC, ["cylinder:pebble"], otherStationChanged, [keep])).toMatchObject({ level: 1, repeatReason: "SAME_ANSWER" });
    expect(station(DENSITY_RUBRIC, ["cylinder:pebble"], { ...evidence, pebble: { v1Ml: 50, v2Ml: 62 } }, [keep])).toMatchObject({ level: 2, escalated: true });
  });

  it.each([[GENE_RUBRIC, ["translation:combinations"], "translation"], [BUOYANCY_RUBRIC, ["force"], "force"], [GENE_RUBRIC, ["concept:flow"], "concept:flow"]] as const)(
    "%s %j → %s", (rubricRef, unmet, criterion) => {
      expect(station(rubricRef, [...unmet])).toMatchObject({ criterion, level: 1 });
    });

  it("station and event Labs get moment-A hints (levels 1–2) but no reflections", () => {
    for (const rubricRef of [DENSITY_RUBRIC, GENE_RUBRIC, EYE_OPTICS_RUBRIC, BUOYANCY_RUBRIC,
      "lever-investigation@1.0.0", "thermal-energy-investigation@1.0.0", "mass-conservation-poea@1.0.0"]) {
      expect(hasRunHints(rubricRef)).toBe(true);
      expect(hasRunReflections(rubricRef)).toBe(false);
      const [first] = runHintSteps(rubricRef);
      expect(first).toEqual({ criterion: CHECKPOINT_HINT_CATALOGS[rubricRef].order[0], label: CHECKPOINT_HINT_CATALOGS[rubricRef].criteria[first.criterion].label });
      const a = planRunHint({ rubricRef, criterion: first.criterion, moment: "BEFORE_PREDICTION", previous: [] });
      expect(a).toMatchObject({ level: 1, checkpointId: null, content: CHECKPOINT_HINT_CATALOGS[rubricRef].criteria[first.criterion].levels[0][0] });
      const b = planRunHint({ rubricRef, criterion: first.criterion, moment: "BEFORE_PREDICTION", previous: [{ criterion: first.criterion, moment: "BEFORE_PREDICTION", level: 2, variant: "a" }] });
      expect(b).toMatchObject({ level: 2, variant: "b", repeatReason: "TOP_LEVEL" });
      expect(() => planRunHint({ rubricRef, criterion: first.criterion, moment: "AFTER_OBSERVATION", previous: [] })).toThrow();
    }
    expect(hasRunReflections(FOOD_WEB_RUBRIC)).toBe(true);
  });
});

describe("SAI-01A event Labs (step 3)", () => {
  const plan = (rubricRef: string, result: unknown, evidence: unknown, previous: PreviousCheckpointHint[] = []) =>
    planCheckpointHint({ rubricRef, evidence, result, previous });
  const keep = (hint: any): PreviousCheckpointHint => ({ criterion: hint.criterion, level: hint.level, variant: hint.variant, answerDigest: hint.answerDigest });

  it("reads FL-06 and FL-07 criteria maps and FL-10 assessment criteria", () => {
    expect(plan("lever-investigation@1.0.0", { criteria: { rotation: true, moment: false, prediction: false } }, { events: [] })).toMatchObject({ criterion: "moment", level: 1 });
    expect(plan("thermal-energy-investigation@1.0.0", { criteria: { R1: true, R2: true, R5: false } }, { events: [] })).toMatchObject({ criterion: "R5" });
    expect(plan("mass-conservation-poea@1.0.0", { assessment: { criteria: { C1: true, C3: false, C6: false } } }, { labState: {}, events: [] })).toMatchObject({ criterion: "C3" });
    expect(plan("lever-investigation@1.0.0", { criteria: { rotation: true, moment: true } }, { events: [] })).toBeNull();
  });

  it("escalates an event criterion only when its own events changed", () => {
    const result = { criteria: { moment: false } };
    const measured = (recordedForceMilliNewtons: number) => ({ events: [
      { type: "PREDICTED_ROTATION", predictions: [] }, { type: "MEASURED_MOMENT", recordedForceMilliNewtons },
    ] });
    const first = plan("lever-investigation@1.0.0", result, measured(100))!;
    const otherEventChanged = { events: [{ type: "PREDICTED_ROTATION", predictions: [1] }, { type: "MEASURED_MOMENT", recordedForceMilliNewtons: 100 }] };
    expect(plan("lever-investigation@1.0.0", result, otherEventChanged, [keep(first)])).toMatchObject({ level: 1, repeatReason: "SAME_ANSWER" });
    expect(plan("lever-investigation@1.0.0", result, measured(200), [keep(first)])).toMatchObject({ level: 2, escalated: true });
  });

  it("uses FL-10 labState answers alongside its events", () => {
    const result = { assessment: { criteria: { C5: false } } };
    const first = plan("mass-conservation-poea@1.0.0", result, { labState: { calculation: "30-and-35" }, events: [] })!;
    expect(plan("mass-conservation-poea@1.0.0", result, { labState: { calculation: "35-and-30" }, events: [] }, [keep(first)])).toMatchObject({ level: 2 });
  });
});

describe("SAI-01A planner", () => {
  it("targets the first unmet checkpoint before the explanation", () => {
    const hint = plan(answer({ HUNT: { prediction: "DECREASE" } }, "B"))!;
    expect(hint).toMatchObject({ criterion: "prediction:HUNT", checkpointId: "HUNT", label: "Khi mất rắn", level: 1, variant: "a", escalated: false, repeatReason: null });
  });

  it("returns null when nothing is unmet", () => {
    expect(plan(answer({}))).toBeNull();
  });

  it("words levels 1-2 for a detected misconception and keeps the id out of the content", () => {
    const first = plan(answer({ HUNT: { prediction: "DECREASE" } }))!;
    expect(first.misconception).toBe("FW_ALL_DECREASE");
    expect(first.content).toBe(CHECKPOINT_HINT_CATALOGS[FOOD_WEB_RUBRIC].criteria["prediction:HUNT"].misconceptions!.FW_ALL_DECREASE[0]);
    expect(first.content).not.toContain("FW_");
  });

  it("escalates only after the answer for that checkpoint changes (BR-06)", () => {
    const wrong = answer({ HUNT: { prediction: "DECREASE" } });
    const l1 = plan(wrong)!;
    const again = plan(wrong, [remember(l1)])!;
    expect(again).toMatchObject({ level: 1, variant: "b", escalated: false, repeatReason: "SAME_ANSWER" });
    // An unrelated wrong explanation does not change the HUNT answer digest.
    const sameHuntOtherExplanation = plan(answer({ HUNT: { prediction: "DECREASE" } }, "C"), [remember(l1), remember(again)])!;
    expect(sameHuntOtherExplanation).toMatchObject({ criterion: "prediction:HUNT", level: 1, repeatReason: "SAME_ANSWER" });
    const l2 = plan(answer({ HUNT: { prediction: "NO_DIRECT_EFFECT" } }), [remember(l1), remember(again)])!;
    expect(l2).toMatchObject({ level: 2, variant: "a", escalated: true, misconception: "FW_NO_LINK" });
  });

  it("never skips a level and stops at 4", () => {
    const answers = ["DECREASE", "NO_DIRECT_EFFECT", "DECREASE", "NO_DIRECT_EFFECT", "DECREASE"];
    const previous: PreviousCheckpointHint[] = [];
    const levels = answers.map((prediction) => {
      const hint = plan(answer({ HUNT: { prediction } }), previous)!;
      previous.push(remember(hint));
      return [hint.level, hint.repeatReason];
    });
    expect(levels).toEqual([[1, null], [2, null], [3, null], [4, null], [4, "TOP_LEVEL"]]);
  });

  it("starts a newly targeted checkpoint at level 1 once the previous one is fixed", () => {
    const hunt = plan(answer({ HUNT: { prediction: "DECREASE" } }, "B"))!;
    const next = plan(answer({}, "B"), [remember(hunt)])!;
    expect(next).toMatchObject({ criterion: "explanation", checkpointId: null, level: 1 });
  });

  it.each([
    [{ ROLES: { prediction: { co: "PRODUCER", ech: "CONSUMER", "nam-vi-khuan": "CONSUMER" } } }, "prediction:ROLES", "FW_DECOMPOSER_AS_CONSUMER"],
    [{ CHAIN: { state: { setup: "chain", webId: "W1", nodes: ["chau-chau", "ech", "ran", "dai-bang"] } } }, "prediction:CHAIN", "FW_CHAIN_NOT_FROM_PRODUCER"],
    [{ CHAIN: { state: { setup: "chain", webId: "W1", nodes: ["co", "ech", "ran", "dai-bang"] } } }, "prediction:CHAIN", "FW_CHAIN_BROKEN_LINK"],
    [{ ENERGY: { prediction: { value: "100" } } }, "prediction:ENERGY", "FW_ENERGY_STOP_EARLY"],
    [{ ENERGY: { prediction: { value: "10000" } } }, "prediction:ENERGY", "FW_ENERGY_NO_LOSS"],
    [{ DEFOREST: { prediction: "INCREASE" } }, "prediction:DEFOREST", "FW_ARROW_REVERSED"],
    [{ CAUSES: { prediction: ["khai-thac", "o-nhiem", "pha-rung", "san-bat", "trong-rung"] } }, "prediction:CAUSES", "FW_CAUSE_PROTECTIVE_INCLUDED"],
    [{ CAUSES: { prediction: ["o-nhiem", "pha-rung", "san-bat"] } }, "prediction:CAUSES", "FW_CAUSE_MISSING"],
  ] as const)("detects %j as %s / %s", (patch, criterion, misconception) => {
    expect(plan(answer(patch as any))).toMatchObject({ criterion, misconception });
  });

  it("rejects an unknown rubric", () => {
    expect(() => planCheckpointHint({ rubricRef: "nope@1", evidence: {}, result: {}, previous: [] })).toThrow();
  });

  it("covers the FL-20 catalog with the same planner", () => {
    const hint = planCheckpointHint({
      rubricRef: ECOLOGY_TOLERANCE_RUBRIC,
      evidence: { checkpoints: [{ id: "T_ABOVE", state: {}, prediction: "PERSISTS" }], explanation: "A" },
      result: { assessment: { unmetCriteria: ["prediction:T_ABOVE"] }, observations: [{ id: "T_ABOVE", prediction: "PERSISTS", predictionCorrect: false }] },
      previous: [],
    })!;
    expect(hint).toMatchObject({ criterion: "prediction:T_ABOVE", misconception: "ECO_NO_UPPER_LIMIT", level: 1 });
  });
});

const PINNED_DIGEST = "4103ca461d655454e88427d8b4db49cdf9f4c9e659f472ede124bdadfa19ee27";

describe("B8 for station and event Labs (checkpoint-misconceptions@3)", () => {
  const D = "density-stations@1.0.0";
  // Block 10×20×30 mm, 3,6 g → 0,6 g/cm³; water 50 mL, cup 40 g + 90 g; pebble 13 g, 40 → 45 mL.
  const density = (over: any = {}) => ({
    explore: { masses: [], conclusion: "A" },
    block: { specimenId: "b", trials: [{ aMm: 10, bMm: 20, cMm: 30, massG: 3.6 }], density: { value: 0.6, unit: "g/cm3" } },
    water: { pouredMl: 50, volumeMl: 50, m1G: 40, m2G: 90, density: { value: 1, unit: "g/cm3" } },
    pebble: { specimenId: "p", initialMl: 40, massG: 13, v1Ml: 40, v2Ml: 45, density: { value: 2.6, unit: "g/cm3" } },
    units: { woodKgm3: 600, irregularReason: "A" },
    ...over,
  });
  const m = (rubricRef: string, criterion: string, evidence: unknown, result: unknown = {}) => detectMisconception(rubricRef, criterion, result, evidence);

  it("FL-03 reads the learner's own numbers", () => {
    expect(m(D, "calculation", density({ pebble: { ...density().pebble, density: { value: 5 / 13, unit: "g/cm3" } } }))).toBe("DENS_DIVIDED_WRONG_WAY");
    expect(m(D, "calculation", density({ water: { ...density().water, density: { value: 1.8, unit: "g/cm3" } } }))).toBe("DENS_CUP_MASS_INCLUDED");
    expect(m(D, "calculation", density({ pebble: { ...density().pebble, density: { value: 13 / 45, unit: "g/cm3" } } }))).toBe("DENS_LEVEL_NOT_DIFFERENCE");
    expect(m(D, "calculation", density({ block: { ...density().block, density: { value: 0.9, unit: "g/cm3" } } }))).toBeNull();
    expect(m(D, "unitConversion", density({ units: { woodKgm3: 60, irregularReason: "A" } }))).toBe("DENS_UNIT_FACTOR");
    expect(m(D, "unitConversion", density({ units: { woodKgm3: 6000, irregularReason: "A" } }))).toBeNull();
    // Malformed evidence never throws.
    expect(m(D, "calculation", { block: null })).toBeNull();
  });

  it("FL-05 compares with the stored model output", () => {
    const B = "buoyancy-archimedes@1.0.0";
    const result = { expected: { weightN: 2.7, buoyantForceN: 1, springForceN: 1.7, overflowM3: 100e-6 } };
    expect(m(B, "force", { measuredBuoyantForceN: 2.7, submergedVolumeMl: 100 }, result)).toBe("BUOY_WEIGHT_AS_BUOYANT");
    expect(m(B, "force", { measuredBuoyantForceN: 1.7, submergedVolumeMl: 100 }, result)).toBe("BUOY_READING_IN_WATER");
    expect(m(B, "overflow", { measuredBuoyantForceN: 1, submergedVolumeMl: 60 }, result)).toBe("BUOY_NOT_FULLY_SUBMERGED");
  });

  it("FL-06 reads the run events", () => {
    const L = "lever-investigation@1.0.0";
    const events = (...list: any[]) => ({ labState: {}, events: list });
    const observations = [{ displayState: "TILT_LEFT" }, { displayState: "LEVEL" }, { displayState: "TILT_RIGHT" }];
    const predicted = (...p: string[]) => ({ type: "PREDICTED_ROTATION", predictions: p.map((prediction) => ({ positionMillimetres: 0, prediction })) });
    expect(m(L, "rotation", events(predicted("LEVEL", "LEVEL", "LEVEL")), { observations })).toBe("LEVER_ARM_IGNORED");
    expect(m(L, "rotation", events(predicted("TILT_RIGHT", "LEVEL", "TILT_RIGHT")), { observations })).toBe("LEVER_TILT_REVERSED");
    const measured = (force: number, arm: number, moment: number) => ({ type: "MEASURED_MOMENT", recordedForceMilliNewtons: force, recordedArmMillimetres: arm, recordedMomentMilliNewtonMillimetres: moment });
    expect(m(L, "moment", events(measured(1000, 100, 1100)))).toBe("LEVER_MOMENT_ADDED");
    expect(m(L, "moment", events(measured(1000, -100, 100000)))).toBe("LEVER_SIGNED_ARM");
    const applied = { type: "APPLIED_LEVER_CASE", forceAdvantage: "GAIN", changesForceDirection: true };
    expect(m(L, "application", events(applied), { application: { forceAdvantage: "NO_GAIN", changesForceDirection: true } })).toBe("LEVER_ALWAYS_GAIN");
    expect(m(L, "application", events({ ...applied, forceAdvantage: "NO_GAIN" }), { application: { forceAdvantage: "NO_GAIN", changesForceDirection: false } })).toBe("LEVER_DIRECTION_RULE");
  });

  it("FL-07 and FL-10", () => {
    const T = "thermal-energy-investigation@1.0.0";
    const observations = [{ riseMilliCelsius: 2000, thermometerReadingMilliCelsius: 27000 }, { riseMilliCelsius: 4000, thermometerReadingMilliCelsius: 29000 }];
    const ev = (...list: any[]) => ({ labState: {}, events: list });
    expect(m(T, "R3", ev({ type: "RECORDED_FIRST_MEASUREMENT", riseMilliCelsius: 27000 }), { observations })).toBe("TH_FINAL_AS_RISE");
    expect(m(T, "R5", ev({ type: "EXPLAINED_ENERGY_BOUNDARY", ratioChoice: "more_than_double", boundaryChoice: "equal_ideal_only" }), { observations })).toBe("TH_NOT_PROPORTIONAL");
    expect(m(T, "R6", ev({ type: "EXPLAINED_ENERGY_BOUNDARY", ratioChoice: "double", boundaryChoice: "always_equal" }), { observations })).toBe("TH_NO_HEAT_LOSS");
    const M = "mass-conservation-poea@1.0.0";
    const st = (labState: any) => ({ labState, events: [] });
    expect(m(M, "C3", st({ comparison: "compare.decrease" }))).toBe("MC_THINKS_MASS_DECREASES");
    expect(m(M, "C4", st({ explanationAttempts: ["explain.rearrange", "explain.solid_not_weighed"] }))).toBe("MC_PRECIPITATE_NOT_WEIGHED");
    expect(m(M, "C5", st({ calculation: "34-and-35" }))).toBe("MC_THINKS_MASS_INCREASES");
    expect(m(M, "C6", st({ applicationV1: "same", applicationV2: "same" }))).toBe("MC_OPEN_SYSTEM_GAS");
  });

  it("the planner words levels 1–2 for the hypothesis and stores it; the student never sees the id", () => {
    const plan = planCheckpointHint({
      rubricRef: "mass-conservation-poea@1.0.0", evidence: { labState: { comparison: "compare.increase" }, events: [] },
      result: { assessment: { criteria: { C1: true, C2: true, C3: false } } }, previous: [],
    })!;
    expect(plan).toMatchObject({ criterion: "C3", level: 1, misconception: "MC_THINKS_MASS_INCREASES", misconceptionRules: "checkpoint-misconceptions@3" });
    expect(plan.content).toBe(CHECKPOINT_HINT_CATALOGS["mass-conservation-poea@1.0.0"].criteria.C3.misconceptions!.MC_THINKS_MASS_INCREASES[0]);
    expect(plan.content).not.toMatch(/MC_/);
  });
});

describe("B8 for FL-27 gene and FL-16 eye (checkpoint-misconceptions@3)", async () => {
  const { geneExpression } = await import("../../../../packages/sim/gene-expression");
  const G = "gene-protein-stations@1.0.0";
  const m = (rubricRef: string, criterion: string, evidence: unknown) => detectMisconception(rubricRef, criterion, {}, evidence);
  const truth = geneExpression({ variantId: "gene-a-silent" }) as any;
  const gene = (over: any = {}) => ({
    variantId: "gene-a-silent",
    replication: { stageOrder: ["UNWIND", "SYNTHESIZE", "COMPLETE"], newStrand: [...truth.replication.newStrand], semiConservative: "A" },
    transcription: { mrna: [...truth.mrna] },
    translation: { aminoAcids: [...truth.aminoAcids, null].slice(0, 6), codonCombos: { n1: 4, n2: 16, n3: 64 } },
    mutation: { mutatedCodon: truth.mutation.codon, mutatedAminoAcid: truth.mutation.aminoAcid, effect: truth.mutation.effect },
    ...over,
  });

  it("FL-27 recomputes the expected values from the submitted variant", () => {
    expect(truth.mutation.effect).toBe("SILENT");
    expect(m(G, "replication", gene({ replication: { ...gene().replication, newStrand: [...truth.replication.templateSegment] } }))).toBe("GENE_COPIED_PARENT");
    expect(m(G, "replication", gene({ replication: { ...gene().replication, stageOrder: ["SYNTHESIZE", "UNWIND", "COMPLETE"] } }))).toBe("GENE_STAGE_ORDER");
    expect(m(G, "transcription", gene({ transcription: { mrna: [...truth.gene.template.replace(/T/g, "U")] } }))).toBe("GENE_COPIED_TEMPLATE_STRAND");
    expect(m(G, "translation", gene({ translation: { aminoAcids: ["Met", "Phe", "Gly", "Trp", "His", "Gly"], codonCombos: { n1: 4, n2: 16, n3: 64 } } }))).toBe("GENE_READ_PAST_STOP");
    expect(m(G, "translation", gene({ translation: { ...gene().translation, codonCombos: { n1: 4, n2: 8, n3: 12 } } }))).toBe("GENE_COMBINATIONS_ADDED");
    expect(m(G, "mutation", gene({ mutation: { ...gene().mutation, effect: "MISSENSE" } }))).toBe("GENE_EVERY_CHANGE_CHANGES_PROTEIN");
    expect(m(G, "mutation", gene({ mutation: { ...gene().mutation, mutatedCodon: truth.codons[truth.mutation.codonIndex] } }))).toBe("GENE_MUTATION_NOT_APPLIED");
    expect(m(G, "replication", gene())).toBeNull();
  });

  it("FL-16 compares the settings with each scenario's ametropia", () => {
    const E = "eye-anatomy-optics@1.0.0";
    const attempts = (glasses: Record<string, number>, lens = 16) => ({ phase1: { labels: {} }, phase2: ["normal-near", "myopia-far", "hyperopia-near"].map((scenarioId) => ({ scenarioId, objectDistanceM: null, lensPowerD: lens, glassesPowerD: glasses[scenarioId] ?? 0 })) });
    expect(m(E, "phase2:glasses", attempts({ "myopia-far": 2 }))).toBe("EYE_MYOPIA_CONVERGING");
    expect(m(E, "phase2:glasses", attempts({ "myopia-far": -2, "hyperopia-near": -1 }))).toBe("EYE_HYPEROPIA_DIVERGING");
    expect(m(E, "phase2:glasses", attempts({ "myopia-far": -2, "hyperopia-near": 1, "normal-near": 1 }))).toBe("EYE_GLASSES_FOR_NORMAL");
    expect(m(E, "phase2:relaxedFar", attempts({ "myopia-far": -2 }, 20))).toBe("EYE_FAR_ACCOMMODATION");
    expect(m(E, "phase1", { phase1: { labels: { cornea: "Thể thủy tinh", lens: "Giác mạc" } }, phase2: [] })).toBe("EYE_CORNEA_LENS_SWAP");
    expect(m(E, "phase1", { phase1: { labels: { cornea: "Giác mạc", lens: "Thể thủy tinh" } }, phase2: [] })).toBeNull();
  });
});
