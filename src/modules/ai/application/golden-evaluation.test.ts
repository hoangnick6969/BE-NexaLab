import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { RUNNER_TIMINGS } from "./ai-job-runner";
import { GENERATE_RESOURCE_MAX_OUTPUT_TOKENS, GENERATE_RESOURCE_SYSTEM } from "./generate-resource-prompt";
import {
  computeGoldenMetrics,
  GOLDEN_PROVIDER_TIMEOUT_MS,
  goldenChecks,
  renderGoldenReport,
  runGoldenEvaluation,
  type GoldenItemResult,
  type GoldenSet,
} from "./golden-evaluation";

const SET_PATH = join(__dirname, "..", "..", "..", "..", "scripts", "fixtures", "tai01-golden-set.synthetic.json");
const loadSet = (): GoldenSet => JSON.parse(readFileSync(SET_PATH, "utf8"));
const fakeFor = (set: GoldenSet, mode: "ok" | "invalid_json" = "ok") =>
  new FakeAiProvider(mode, Object.fromEntries(set.lessons.map((lesson) => [lesson.lessonId, lesson.providerOutput])));

function items(n: number, patch: (index: number) => Partial<GoldenItemResult> = () => ({})): GoldenItemResult[] {
  const lessons = ["lesson-circuit", "lesson-chemistry", "lesson-eye"];
  return Array.from({ length: n }, (_, index) => ({
    lessonId: lessons[index % 3], position: index, prompt: `q${index}`, flags: [], generatedOption: 0, expectedOption: 0,
    answerKeyCorrect: true, scientificallyAccurate: true, grounded: true, decision: "ACCEPT" as const, ...patch(index),
  }));
}
const verdicts = (list: GoldenItemResult[], problems: string[] = []) => {
  const perLesson = Object.fromEntries(["lesson-circuit", "lesson-chemistry", "lesson-eye"].map((id) => [id, computeGoldenMetrics(list.filter((i) => i.lessonId === id))]));
  return Object.fromEntries(goldenChecks(computeGoldenMetrics(list), perLesson, problems).map((c) => [c.name, c.pass]));
};

describe("golden evaluation harness (TAI-T6)", () => {
  it("runs the synthetic set through the pinned prompt and the fake provider, and computes the metrics from the labels", async () => {
    const set = loadSet();
    expect(set.synthetic).toBe(true);
    const provider = fakeFor(set);
    const report = await runGoldenEvaluation(set, provider, "fake-model");
    expect(provider.calls).toHaveLength(3);
    for (const call of provider.calls) {
      expect(call.system).toBe(GENERATE_RESOURCE_SYSTEM);
      expect(call.maxTokens).toBe(GENERATE_RESOURCE_MAX_OUTPUT_TOKENS);
      expect(call.timeoutMs).toBe(RUNNER_TIMINGS.providerTimeoutMs);
    }
    expect(report).toMatchObject({ synthetic: true, provider: "fake", model: "fake-model", promptVersion: "generate-resource@2", outputSchemaVersion: "resource-items@1", labelProblems: [], pass: true });
    // Each lesson: 23 returned, 2 VR drops and 1 OVER_COUNT, 20 reviewed.
    expect(report.jobs.map((j) => [j.lessonId, j.returned, j.survived, j.dropped.map((d) => d.reasonCodes[0])])).toEqual([
      ["lesson-circuit", 23, 20, ["GROUNDING_REF_INVALID", "OPTION_PATTERN_FORBIDDEN", "OVER_COUNT"]],
      ["lesson-chemistry", 23, 20, ["OUTCOME_INVALID", "OPTION_PATTERN_FORBIDDEN", "OVER_COUNT"]],
      ["lesson-eye", 23, 20, ["GROUNDING_REF_INVALID", "OPTION_PATTERN_FORBIDDEN", "OVER_COUNT"]],
    ]);
    expect(report.overall).toMatchObject({ items: 60, answerKeyErrors: 1, scientificErrors: 2, ungrounded: 2, accepted: 45, acceptedAfterEdit: 7, rejected: 8 });
    expect(report.overall.acceptRate).toBeCloseTo(52 / 60, 10);
    expect(report.items.find((i) => !i.answerKeyCorrect)).toMatchObject({ lessonId: "lesson-circuit", position: 21, generatedOption: 0, expectedOption: 1 });
    expect(report.jobs.every((j) => j.inputTokens > 0 && j.outputTokens > 0)).toBe(true);
    const markdown = renderGoldenReport(report, "2026-11-09");
    expect(markdown.split("\n")[0]).toContain("SYNTHETIC GOLDEN SET");
    expect(markdown).toContain("not measured provider usage");
  });

  it("derives answer-key correctness from the generated key, not from a label", async () => {
    const set = loadSet();
    const circuit = set.lessons[0].providerOutput as { items: Array<{ correctOption: number }> };
    circuit.items[0].correctOption = 2; // the reviewer still expects option 0
    const report = await runGoldenEvaluation(set, fakeFor(set), "fake-model");
    expect(report.overall.answerKeyErrors).toBe(2);
    expect(report.checks.find((c) => c.name === "answer-key error")).toMatchObject({ pass: false, actual: "3.33%" });
    expect(report.pass).toBe(false);
  });

  it("applies the validation-rules.md thresholds at their boundaries", () => {
    expect(verdicts(items(60, (i) => ({ answerKeyCorrect: i >= 1 })))["answer-key error"]).toBe(true); // 1.67%
    expect(verdicts(items(100, (i) => ({ answerKeyCorrect: i >= 3 })))["answer-key error"]).toBe(true); // 3.00%
    expect(verdicts(items(100, (i) => ({ answerKeyCorrect: i >= 4 })))["answer-key error"]).toBe(false); // 4.00%
    expect(verdicts(items(60, (i) => ({ scientificallyAccurate: i >= 3 })))["scientific-accuracy error"]).toBe(true); // 5.00%
    expect(verdicts(items(60, (i) => ({ scientificallyAccurate: i >= 4 })))["scientific-accuracy error"]).toBe(false); // 6.67%
    expect(verdicts(items(60, (i) => ({ decision: i < 18 ? "REJECT" : i < 30 ? "ACCEPT_AFTER_EDIT" : "ACCEPT" })))["accept or accept-after-edit"]).toBe(true); // 70%
    expect(verdicts(items(60, (i) => ({ decision: i < 19 ? "REJECT" : "ACCEPT" })))["accept or accept-after-edit"]).toBe(false); // 68.3%
    expect(verdicts(items(59))["items reviewed"]).toBe(false);
    expect(verdicts(items(60))["items reviewed"]).toBe(true);
    const lopsided = items(60, (i) => ({ lessonId: i < 19 ? "lesson-eye" : i < 40 ? "lesson-circuit" : "lesson-chemistry" }));
    expect(verdicts(lopsided)["items from lesson-eye"]).toBe(false);
    expect(computeGoldenMetrics([])).toMatchObject({ items: 0, answerKeyErrorRate: 0, acceptRate: 0 });
  });

  it("fails when a reviewed item has no label, a label points at a dropped item, or an item is labelled twice", async () => {
    const set = loadSet();
    const labels = set.lessons[2].labels;
    labels.splice(labels.findIndex((l) => l.position === 0), 1);
    labels.push({ position: 7, expectedOption: 0, scientificallyAccurate: true, grounded: true, decision: "ACCEPT" });
    labels.push({ ...labels[0] });
    const report = await runGoldenEvaluation(set, fakeFor(set), "fake-model");
    expect(report.labelProblems).toEqual([
      expect.stringContaining("lesson-eye#1: labelled twice"),
      expect.stringContaining("lesson-eye#7: label for an item the reviewer never saw"),
      expect.stringContaining("lesson-eye#0: reviewed item has no label"),
    ]);
    expect(report.pass).toBe(false);
  });

  it("records a schema failure and fails the gate instead of scoring nothing as a pass", async () => {
    const set = loadSet();
    const report = await runGoldenEvaluation(set, fakeFor(set, "invalid_json"), "fake-model");
    expect(report.jobs.map((j) => j.failure)).toEqual(["OUTPUT_SCHEMA_INVALID", "OUTPUT_SCHEMA_INVALID", "OUTPUT_SCHEMA_INVALID"]);
    expect(report.overall.items).toBe(0);
    expect(report.pass).toBe(false);
  });

  it("refuses a golden set with an unknown lesson or label field", async () => {
    const set = loadSet() as any;
    set.lessons[0].lessonId = "lesson-other";
    await expect(runGoldenEvaluation(set, fakeFor(loadSet()), "fake-model")).rejects.toThrow();
    const extra = loadSet() as any;
    extra.lessons[0].labels[0].answerKeyCorrect = true;
    await expect(runGoldenEvaluation(extra, fakeFor(loadSet()), "fake-model")).rejects.toThrow();
  });

  it("uses the job runner's provider timeout", () => {
    expect(GOLDEN_PROVIDER_TIMEOUT_MS).toBe(RUNNER_TIMINGS.providerTimeoutMs);
  });
});
