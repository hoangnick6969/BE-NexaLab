import { z } from "zod";
import type { AiProvider } from "./ai-provider";
import {
  buildGenerateResourceUser,
  GENERATE_RESOURCE_MAX_OUTPUT_TOKENS,
  GENERATE_RESOURCE_PROMPT_VERSION,
  GENERATE_RESOURCE_SYSTEM,
  generateResourcePromptDigest,
  RESOURCE_ITEMS_JSON_SCHEMA,
  RESOURCE_ITEMS_SCHEMA_VERSION,
} from "./generate-resource-prompt";
import { buildInputSnapshot, snapshotDigest } from "./input-snapshot";
import { resourceItemsV1, type QuestionItem } from "./resource-items";
import { validateItems, type DroppedItem } from "./validate-items";

/**
 * TAI-T6 golden evaluation (validation-rules.md, "Golden evaluation"). For each golden lesson one GENERATE_RESOURCE
 * TEST request runs through the pinned prompt, the provider port and the same parse + VR/VW validation as the job
 * runner. The surviving items are what a teacher would review; each one is joined with the reviewer's label and the
 * release metrics are computed from those labels. Nothing here talks to a database, and this file imports no adapter:
 * the caller chooses the provider (the TAI-T6 script wires the deterministic FakeAiProvider).
 *
 * Answer-key correctness is not a label: the reviewer records the option they consider correct (`expectedOption`) and
 * the code compares it with the generated `correctOption`.
 */
export const GOLDEN_LESSONS = ["lesson-circuit", "lesson-chemistry", "lesson-eye"] as const;
/** Same provider timeout as the job runner (RUNNER_TIMINGS.providerTimeoutMs; pinned by golden-evaluation.test.ts). */
export const GOLDEN_PROVIDER_TIMEOUT_MS = 60_000;
export const GOLDEN_THRESHOLDS = { answerKeyErrorMax: 0.03, scientificErrorMax: 0.05, acceptRateMin: 0.7, minItems: 60, minItemsPerLesson: 20 } as const;

const decisionSchema = z.enum(["ACCEPT", "ACCEPT_AFTER_EDIT", "REJECT"]);
export type GoldenDecision = z.infer<typeof decisionSchema>;

const labelSchema = z
  .object({
    /** 0-based position in the provider output (the order the provider returned the items in). */
    position: z.number().int().min(0),
    expectedOption: z.number().int().min(0),
    scientificallyAccurate: z.boolean(),
    grounded: z.boolean(),
    decision: decisionSchema,
    note: z.string().max(500).optional(),
  })
  .strict();

const lessonSchema = z
  .object({
    lessonId: z.enum(GOLDEN_LESSONS),
    source: z
      .object({
        title: z.string().min(1),
        grade: z.number().int(),
        domain: z.string().nullable(),
        topic: z.string().min(1),
        learningObjective: z.string(),
        content: z.string(),
        outcomeCodes: z.array(z.string()),
        readingSteps: z.array(z.object({ position: z.number().int(), html: z.string() }).strict()),
      })
      .strict(),
    outcomeStatements: z.record(z.string(), z.string()),
    request: z.object({ itemCount: z.number().int().min(1).max(20), difficulty: z.enum(["FOUNDATION", "STANDARD", "ADVANCED"]).nullable(), instruction: z.string().nullable() }).strict(),
    /** Only read by a deterministic provider (fake or scripted); a live provider would generate its own output. */
    providerOutput: z.unknown().optional(),
    labels: z.array(labelSchema),
  })
  .strict();

export const goldenSetSchema = z
  .object({
    /** true for an invented set; its numbers only prove the harness, never the release gate. */
    synthetic: z.boolean(),
    description: z.string(),
    reviewer: z.string().min(1),
    labelledAt: z.string(),
    lessons: z.array(lessonSchema).min(1),
  })
  .strict();

export type GoldenSet = z.infer<typeof goldenSetSchema>;
export type GoldenLesson = z.infer<typeof lessonSchema>;

export type GoldenItemResult = {
  lessonId: string;
  position: number;
  prompt: string;
  flags: string[];
  generatedOption: number;
  expectedOption: number;
  answerKeyCorrect: boolean;
  scientificallyAccurate: boolean;
  grounded: boolean;
  decision: GoldenDecision;
};

export type GoldenJobResult = {
  lessonId: string;
  inputDigest: string;
  requested: number;
  returned: number;
  survived: number;
  dropped: DroppedItem[];
  failure: "OUTPUT_SCHEMA_INVALID" | "OUTPUT_VALIDATION_FAILED" | null;
  inputTokens: number;
  outputTokens: number;
};

export type GoldenMetrics = {
  items: number;
  answerKeyErrors: number;
  scientificErrors: number;
  ungrounded: number;
  accepted: number;
  acceptedAfterEdit: number;
  rejected: number;
  answerKeyErrorRate: number;
  scientificErrorRate: number;
  acceptRate: number;
  groundedRate: number;
};

export type GoldenCheck = { name: string; pass: boolean; actual: string; required: string };

export type GoldenReport = {
  synthetic: boolean;
  description: string;
  reviewer: string;
  labelledAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  promptDigest: string;
  outputSchemaVersion: string;
  jobs: GoldenJobResult[];
  items: GoldenItemResult[];
  perLesson: Record<string, GoldenMetrics>;
  overall: GoldenMetrics;
  checks: GoldenCheck[];
  /** Label/item mismatches; any entry fails the evaluation (every reviewed item needs exactly one label). */
  labelProblems: string[];
  pass: boolean;
};

/** Pure metric computation over labelled items (rates are fractions in [0, 1]; 0 items gives rates of 0). */
export function computeGoldenMetrics(items: GoldenItemResult[]): GoldenMetrics {
  const count = (predicate: (item: GoldenItemResult) => boolean) => items.filter(predicate).length;
  const n = items.length;
  const rate = (value: number) => (n === 0 ? 0 : value / n);
  const answerKeyErrors = count((item) => !item.answerKeyCorrect);
  const scientificErrors = count((item) => !item.scientificallyAccurate);
  const ungrounded = count((item) => !item.grounded);
  const accepted = count((item) => item.decision === "ACCEPT");
  const acceptedAfterEdit = count((item) => item.decision === "ACCEPT_AFTER_EDIT");
  return {
    items: n,
    answerKeyErrors,
    scientificErrors,
    ungrounded,
    accepted,
    acceptedAfterEdit,
    rejected: count((item) => item.decision === "REJECT"),
    answerKeyErrorRate: rate(answerKeyErrors),
    scientificErrorRate: rate(scientificErrors),
    acceptRate: rate(accepted + acceptedAfterEdit),
    groundedRate: rate(n - ungrounded),
  };
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/** Release gate: thresholds from validation-rules.md, plus coverage (>= 60 items, >= 20 per golden lesson) and clean labels. */
export function goldenChecks(overall: GoldenMetrics, perLesson: Record<string, GoldenMetrics>, labelProblems: string[]): GoldenCheck[] {
  const t = GOLDEN_THRESHOLDS;
  return [
    { name: "items reviewed", pass: overall.items >= t.minItems, actual: String(overall.items), required: `>= ${t.minItems}` },
    ...GOLDEN_LESSONS.map((lessonId) => {
      const items = perLesson[lessonId]?.items ?? 0;
      return { name: `items from ${lessonId}`, pass: items >= t.minItemsPerLesson, actual: String(items), required: `>= ${t.minItemsPerLesson}` };
    }),
    { name: "answer-key error", pass: overall.answerKeyErrorRate <= t.answerKeyErrorMax, actual: pct(overall.answerKeyErrorRate), required: `<= ${pct(t.answerKeyErrorMax)}` },
    { name: "scientific-accuracy error", pass: overall.scientificErrorRate <= t.scientificErrorMax, actual: pct(overall.scientificErrorRate), required: `<= ${pct(t.scientificErrorMax)}` },
    { name: "accept or accept-after-edit", pass: overall.acceptRate >= t.acceptRateMin, actual: pct(overall.acceptRate), required: `>= ${pct(t.acceptRateMin)}` },
    { name: "every reviewed item labelled once", pass: labelProblems.length === 0, actual: String(labelProblems.length) + " problem(s)", required: "0" },
  ];
}

/**
 * Runs one golden lesson through the pinned prompt and the provider, then parses and validates exactly like the job
 * runner (strict resource-items@1, then validateItems; no class corpus, so duplicate flags come from the batch only).
 */
export async function runGoldenJob(lesson: GoldenLesson, provider: AiProvider) {
  const snapshot = buildInputSnapshot(
    { id: lesson.lessonId, ...lesson.source },
    { targetKind: "TEST", itemCount: lesson.request.itemCount, difficulty: lesson.request.difficulty, outcomeCodes: null, instruction: lesson.request.instruction },
    new Map(Object.entries(lesson.outcomeStatements)),
  );
  const result = await provider.generate({
    system: GENERATE_RESOURCE_SYSTEM,
    user: buildGenerateResourceUser(snapshot),
    maxTokens: GENERATE_RESOURCE_MAX_OUTPUT_TOKENS,
    timeoutMs: GOLDEN_PROVIDER_TIMEOUT_MS,
    responseSchema: RESOURCE_ITEMS_JSON_SCHEMA as unknown as Record<string, unknown>,
  });
  const job: GoldenJobResult = {
    lessonId: lesson.lessonId, inputDigest: snapshotDigest(snapshot), requested: lesson.request.itemCount, returned: 0, survived: 0,
    dropped: [], failure: null, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
  };
  let raw: unknown;
  try {
    raw = JSON.parse(result.text);
  } catch {
    return { job: { ...job, failure: "OUTPUT_SCHEMA_INVALID" as const }, survivors: [] };
  }
  const parsed = resourceItemsV1.safeParse(raw);
  if (!parsed.success) return { job: { ...job, failure: "OUTPUT_SCHEMA_INVALID" as const }, survivors: [] };
  const { items, dropped } = validateItems(snapshot, parsed.data.items, []);
  return {
    job: { ...job, returned: parsed.data.items.length, survived: items.length, dropped, failure: items.length === 0 ? ("OUTPUT_VALIDATION_FAILED" as const) : null },
    survivors: items,
  };
}

/** Full evaluation: every lesson's job, the label join, per-lesson and overall metrics, and the release checks. */
export async function runGoldenEvaluation(rawSet: unknown, provider: AiProvider, model: string): Promise<GoldenReport> {
  const set = goldenSetSchema.parse(rawSet);
  const jobs: GoldenJobResult[] = [];
  const items: GoldenItemResult[] = [];
  const labelProblems: string[] = [];
  for (const lesson of set.lessons) {
    const { job, survivors } = await runGoldenJob(lesson, provider);
    jobs.push(job);
    const labels = new Map<number, GoldenLesson["labels"][number]>();
    for (const label of lesson.labels) {
      if (labels.has(label.position)) labelProblems.push(`${lesson.lessonId}#${label.position}: labelled twice`);
      labels.set(label.position, label);
    }
    const surviving = new Set(survivors.map((s) => s.position));
    for (const position of labels.keys())
      if (!surviving.has(position)) labelProblems.push(`${lesson.lessonId}#${position}: label for an item the reviewer never saw (dropped or missing)`);
    for (const survivor of survivors) {
      const label = labels.get(survivor.position);
      if (!label) {
        labelProblems.push(`${lesson.lessonId}#${survivor.position}: reviewed item has no label`);
        continue;
      }
      const question = survivor.payload as QuestionItem;
      if (label.expectedOption >= question.options.length) labelProblems.push(`${lesson.lessonId}#${survivor.position}: expectedOption is not an option index`);
      items.push({
        lessonId: lesson.lessonId,
        position: survivor.position,
        prompt: question.prompt,
        flags: survivor.flags,
        generatedOption: question.correctOption,
        expectedOption: label.expectedOption,
        answerKeyCorrect: question.correctOption === label.expectedOption,
        scientificallyAccurate: label.scientificallyAccurate,
        grounded: label.grounded,
        decision: label.decision,
      });
    }
  }
  const perLesson = Object.fromEntries(GOLDEN_LESSONS.map((lessonId) => [lessonId, computeGoldenMetrics(items.filter((item) => item.lessonId === lessonId))]));
  const overall = computeGoldenMetrics(items);
  const checks = goldenChecks(overall, perLesson, labelProblems);
  return {
    synthetic: set.synthetic, description: set.description, reviewer: set.reviewer, labelledAt: set.labelledAt,
    provider: provider.name, model, promptVersion: GENERATE_RESOURCE_PROMPT_VERSION, promptDigest: generateResourcePromptDigest(),
    outputSchemaVersion: RESOURCE_ITEMS_SCHEMA_VERSION, jobs, items, perLesson, overall, checks, labelProblems,
    pass: checks.every((check) => check.pass),
  };
}

/** Markdown in the shape of tai-01-golden-evaluation.md; a synthetic set is marked on the first line. */
export function renderGoldenReport(report: GoldenReport, date: string): string {
  const lines: string[] = [];
  if (report.synthetic)
    lines.push("> **SYNTHETIC GOLDEN SET. These numbers only prove the harness. They are not a lecturer review and do not close the TAI-01 release gate.**", "");
  lines.push(
    "# TAI-01 golden evaluation",
    "",
    `- Date: ${date}`,
    `- Golden set: ${report.description}`,
    `- Reviewer: ${report.reviewer} (labelled ${report.labelledAt})`,
    `- Provider / model: ${report.provider} / ${report.model}`,
    `- Prompt: ${report.promptVersion} (digest ${report.promptDigest.slice(0, 16)}…), output schema ${report.outputSchemaVersion}`,
    `- Result: **${report.pass ? "PASS" : "FAIL"}**`,
    "",
    "## Release checks",
    "",
    "| Check | Actual | Required | Result |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((c) => `| ${c.name} | ${c.actual} | ${c.required} | ${c.pass ? "pass" : "FAIL"} |`),
    "",
    "## Per lesson",
    "",
    "| Lesson | Items | Answer-key errors | Scientific errors | Ungrounded | Accept | Accept after edit | Reject | Accept rate |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...[...Object.entries(report.perLesson), ["overall", report.overall] as const].map(
      ([name, m]) => `| ${name} | ${m.items} | ${m.answerKeyErrors} (${pct(m.answerKeyErrorRate)}) | ${m.scientificErrors} (${pct(m.scientificErrorRate)}) | ${m.ungrounded} | ${m.accepted} | ${m.acceptedAfterEdit} | ${m.rejected} | ${pct(m.acceptRate)} |`,
    ),
    "",
    "## Jobs and token usage (input for TAI-05)",
    "",
    "| Lesson | Input digest | Requested | Returned | Reviewed | Dropped (reason codes) | Input tokens | Output tokens |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.jobs.map(
      (j) => `| ${j.lessonId} | ${j.inputDigest.slice(0, 12)} | ${j.requested} | ${j.returned} | ${j.survived} | ${j.dropped.map((d) => `#${d.position} ${d.reasonCodes.join("+")}`).join(", ") || "none"}${j.failure ? ` (${j.failure})` : ""} | ${j.inputTokens} | ${j.outputTokens} |`,
    ),
  );
  if (report.provider === "fake")
    lines.push("", "Token counts come from the fake provider (characters / 4). They are not measured provider usage and must not be used to set a PricingVersion.");
  const misses = report.items.filter((item) => !item.answerKeyCorrect || !item.scientificallyAccurate || item.decision === "REJECT");
  if (misses.length)
    lines.push(
      "",
      "## Items with an error or a rejection",
      "",
      "| Item | Key generated / expected | Scientific | Grounded | Decision | Flags |",
      "| --- | --- | --- | --- | --- | --- |",
      ...misses.map((i) => `| ${i.lessonId}#${i.position} | ${i.generatedOption} / ${i.expectedOption}${i.answerKeyCorrect ? "" : " (wrong)"} | ${i.scientificallyAccurate ? "ok" : "error"} | ${i.grounded ? "yes" : "no"} | ${i.decision} | ${i.flags.join(", ") || "-"} |`),
    );
  if (report.labelProblems.length) lines.push("", "## Label problems", "", ...report.labelProblems.map((p) => `- ${p}`));
  return lines.join("\n") + "\n";
}
