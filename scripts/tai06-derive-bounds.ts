// TAI6-T0 evidence: derives the default challenge-parameter bounds from the REAL code and sweeps every value the schema
// allows through the deterministic engine on the built-in reference states. Read-only: no database, no network, no write.
//
//   npx tsx scripts/tai06-derive-bounds.ts            (markdown on stdout)
//   npx tsx scripts/tai06-derive-bounds.ts --json
//
// Bounds source: CHALLENGE_PARAMETERS in src/modules/lessons/application/lesson-content.ts (min, max, step, options).
// Engine source: packages/sim (circuit limits, chemistry reactions, eye parts) through labs/application/simulation-versions.ts.
import { aiOfferedLabs, CHALLENGE_PARAMETERS } from "../src/modules/lessons/application/lesson-content";
import { builtinReferenceStates } from "../src/modules/ai/application/lab-reference-states";
import { engineResultsFor } from "../src/modules/ai/application/lab-challenge-validation";

type Params = Record<string, number | string>;
const values = (param: any): Array<number | string> =>
  param.kind === "number" ? Array.from({ length: Math.floor((param.max - param.min) / param.step) + 1 }, (_, i) => param.min + i * param.step) : param.options.map((o: any) => o.value);

function grid(labId: string): Params[] {
  const spec = CHALLENGE_PARAMETERS[labId];
  let out: Params[] = [{}];
  for (const [name, param] of Object.entries(spec.params)) out = out.flatMap((base) => values(param).map((v) => ({ ...base, [name]: v })));
  // Every single-parameter variant too (a variant may omit the others).
  for (const [name, param] of Object.entries(spec.params)) out.push(...values(param).map((v) => ({ [name]: v })));
  return out;
}

const report = aiOfferedLabs().map(([labId, spec]) => {
  const context = { labId, modelRef: spec.modelRef, packRanges: null, referenceStates: builtinReferenceStates(labId), referenceSource: "BUILTIN" as const };
  const rows = grid(labId).map((params) => {
    const results = engineResultsFor(context, labId, params);
    const passed = results.filter((r) => r.verdict === "passed").length;
    return { params, solvable: passed > 0, discriminating: passed > 0 && passed < results.length };
  });
  const ok = rows.filter((r) => r.solvable && r.discriminating);
  return {
    labId,
    modelRef: spec.modelRef,
    rangeReview: spec.rangeReview,
    bounds: Object.fromEntries(
      Object.entries(spec.params).map(([name, p]: [string, any]) => [name, p.kind === "number" ? { min: p.min, max: p.max, step: p.step, unit: p.unit } : { options: p.options.map((o: any) => o.value) }]),
    ),
    referenceStates: context.referenceStates.length,
    swept: rows.length,
    verified: ok.length,
    unsolvable: rows.filter((r) => !r.solvable).map((r) => r.params),
    notDiscriminating: rows.filter((r) => r.solvable && !r.discriminating).map((r) => r.params),
  };
});

if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else
  for (const lab of report) {
    console.log(`## ${lab.labId} (${lab.modelRef}, rangeReview=${lab.rangeReview})`);
    console.log(`bounds: ${JSON.stringify(lab.bounds)}`);
    console.log(`reference states: ${lab.referenceStates}; swept ${lab.swept} parameter sets; engine-verified (>=1 passed and >=1 not passed): ${lab.verified}`);
    console.log(`unsolvable (${lab.unsolvable.length}): ${JSON.stringify(lab.unsolvable.slice(0, 12))}${lab.unsolvable.length > 12 ? " ..." : ""}`);
    console.log(`not discriminating (${lab.notDiscriminating.length}): ${JSON.stringify(lab.notDiscriminating.slice(0, 12))}`);
    console.log("");
  }
