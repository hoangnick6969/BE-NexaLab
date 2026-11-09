// TAI-T6 golden evaluation (validation-rules.md, "Golden evaluation"). Runs each golden lesson through the pinned
// generate-resource prompt, the provider port and the job runner's parse + VR/VW validation, joins the surviving items
// with the reviewer labels and computes answer-key error, scientific-accuracy error and accept rate against the
// release thresholds. Exit code 1 when any check fails.
//
// Provider: the existing deterministic FakeAiProvider, fed with each lesson's `providerOutput` (team lead decision
// 2026-11-09 for G-6: reproducible, no network, no data leaves the machine). There is no live-provider path here.
// No database is read or written.
//
//   npm run eval:tai01-golden                                   (synthetic set, report on stdout)
//   npm run eval:tai01-golden -- --set <golden.json> --out <report.md> [--json]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAiConfig } from "../src/modules/ai/application/ai-config";
import { goldenSetSchema, renderGoldenReport, runGoldenEvaluation } from "../src/modules/ai/application/golden-evaluation";
import { FakeAiProvider } from "../src/modules/ai/infrastructure/fake-provider";

const DEFAULT_SET = join(__dirname, "fixtures", "tai01-golden-set.synthetic.json");

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main() {
  const setPath = arg("--set") ?? DEFAULT_SET;
  const set = goldenSetSchema.parse(JSON.parse(readFileSync(setPath, "utf8")));
  const missing = set.lessons.filter((lesson) => lesson.providerOutput === undefined).map((lesson) => lesson.lessonId);
  if (missing.length) throw new Error(`providerOutput missing for ${missing.join(", ")}; this script only runs the deterministic fake provider`);

  // Same config path as the API (fake is refused when APP_ENV or NODE_ENV is production).
  const config = parseAiConfig({ AI_PROVIDER: "fake" } as NodeJS.ProcessEnv);
  const provider = new FakeAiProvider("ok", Object.fromEntries(set.lessons.map((lesson) => [lesson.lessonId, lesson.providerOutput])));
  const report = await runGoldenEvaluation(set, provider, config.model!);

  const markdown = renderGoldenReport(report, new Date().toISOString().slice(0, 10));
  const out = arg("--out");
  if (out) writeFileSync(out, markdown, "utf8");
  if (process.argv.includes("--json")) console.log(JSON.stringify({ ...report, items: undefined }, null, 2));
  else console.log(markdown);
  console.log(`${report.pass ? "PASS" : "FAIL"}: ${report.checks.filter((c) => c.pass).length}/${report.checks.length} checks${report.synthetic ? " (SYNTHETIC set: harness proof only, not release evidence)" : ""}${out ? `; report written to ${out}` : ""}`);
  if (provider.calls.length !== set.lessons.length) throw new Error(`expected one provider call per lesson, got ${provider.calls.length}`);
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
