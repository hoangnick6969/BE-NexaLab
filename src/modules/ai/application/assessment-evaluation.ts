/**
 * TAI2-T5 shadow evaluation (assessment-validation-and-evaluation.md, "Shadow evaluation"). Pure metrics over pairs of
 * (stored AI suggestion, teacher grade) for one pinned prompt version; the admin route and the synthetic harness both
 * call `evaluateShadow`. Nothing is hard-coded: every number comes from the rows passed in.
 *
 * - MAE: mean absolute error of the total on a 10-point scale (total / max * 10), over VALID suggestions (only they
 *   carry a point value for every criterion).
 * - Within ±1: share of those submissions where |AI - teacher| <= 1 point on that scale.
 * - Per-criterion agreement: share of valid criteria (VALID and PARTIAL suggestions) where AI and teacher differ by at
 *   most one anchor step; a value's step is the index of the highest anchor whose points are <= the value.
 * - Evidence verification rate: verified quotes / returned quotes, over all criteria of all suggestions.
 * - Suppression and partial rates over all suggestions.
 * Gate: >= 100 responses across >= 3 written tasks, MAE <= 1.0, within ±1 >= 80 %, evidence >= 95 %.
 */
export const SHADOW_GATE = { minResponses: 100, minTasks: 3, maxMae: 1.0, minWithinOne: 0.8, minEvidenceRate: 0.95 } as const;
const EPS = 1e-9;

export type EvalRubric = Array<{ promptId: string; criterionCode: string; maxPoints: number; anchors: number[] }>;
export type EvalSuggestion = {
  status: "VALID" | "PARTIAL" | "SUPPRESSED";
  criterionResults: Array<{ promptId: string; criterionCode: string; valid: boolean; suggestedPoints: number | null; returnedQuotes?: number; verifiedQuotes?: number }>;
};
export type EvalRow = {
  submissionId: string;
  taskId: string;
  rubric: EvalRubric;
  suggestion: EvalSuggestion;
  teacher: Array<{ promptId: string; criterionCode: string; points: number }>;
};

export type ShadowReport = {
  promptVersion: string;
  model: string | null;
  responses: number;
  tasks: number;
  statusCounts: { VALID: number; PARTIAL: number; SUPPRESSED: number };
  suppressionRate: number | null;
  partialRate: number | null;
  scoredResponses: number;
  mae: number | null;
  withinOneRate: number | null;
  criteriaCompared: number;
  perCriterionAgreement: number | null;
  returnedQuotes: number;
  verifiedQuotes: number;
  evidenceVerificationRate: number | null;
  checks: Array<{ name: string; value: number | null; threshold: string; pass: boolean }>;
  pass: boolean;
};

const round = (value: number | null, digits = 4) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

/** Index of the highest anchor whose points are <= value (anchors ascending; the first anchor is 0). */
export function anchorStep(anchors: number[], value: number) {
  const sorted = [...anchors].sort((a, b) => a - b);
  let step = 0;
  sorted.forEach((points, index) => {
    if (points <= value + EPS) step = index;
  });
  return step;
}

export function evaluateShadow(rows: EvalRow[], meta: { promptVersion: string; model?: string | null }): ShadowReport {
  const statusCounts = { VALID: 0, PARTIAL: 0, SUPPRESSED: 0 };
  let returnedQuotes = 0;
  let verifiedQuotes = 0;
  const errors: number[] = [];
  let compared = 0;
  let agreed = 0;
  for (const row of rows) {
    statusCounts[row.suggestion.status]++;
    for (const c of row.suggestion.criterionResults) {
      returnedQuotes += c.returnedQuotes ?? 0;
      verifiedQuotes += c.verifiedQuotes ?? 0;
    }
    const teacherPoints = (promptId: string, code: string) => row.teacher.find((t) => t.promptId === promptId && t.criterionCode === code)?.points;
    if (row.suggestion.status !== "SUPPRESSED")
      for (const c of row.suggestion.criterionResults) {
        const rubric = row.rubric.find((r) => r.promptId === c.promptId && r.criterionCode === c.criterionCode);
        const teacher = teacherPoints(c.promptId, c.criterionCode);
        if (!c.valid || c.suggestedPoints === null || !rubric || teacher === undefined) continue;
        compared++;
        if (Math.abs(anchorStep(rubric.anchors, c.suggestedPoints) - anchorStep(rubric.anchors, teacher)) <= 1) agreed++;
      }
    if (row.suggestion.status === "VALID") {
      const max = row.rubric.reduce((sum, r) => sum + r.maxPoints, 0);
      if (max <= 0) continue;
      const ai = row.suggestion.criterionResults.reduce((sum, c) => sum + (c.suggestedPoints ?? 0), 0);
      const teacher = row.rubric.reduce((sum, r) => sum + (teacherPoints(r.promptId, r.criterionCode) ?? 0), 0);
      errors.push(Math.abs((ai / max) * 10 - (teacher / max) * 10));
    }
  }
  const responses = rows.length;
  const tasks = new Set(rows.map((r) => r.taskId)).size;
  const mae = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
  const withinOneRate = errors.length ? errors.filter((e) => e <= 1 + EPS).length / errors.length : null;
  const perCriterionAgreement = compared ? agreed / compared : null;
  const evidenceVerificationRate = returnedQuotes ? verifiedQuotes / returnedQuotes : null;
  const checks = [
    { name: "responses", value: responses, threshold: `>= ${SHADOW_GATE.minResponses}`, pass: responses >= SHADOW_GATE.minResponses },
    { name: "written tasks", value: tasks, threshold: `>= ${SHADOW_GATE.minTasks}`, pass: tasks >= SHADOW_GATE.minTasks },
    { name: "MAE (10-point)", value: round(mae), threshold: `<= ${SHADOW_GATE.maxMae}`, pass: mae !== null && mae <= SHADOW_GATE.maxMae + EPS },
    { name: "within ±1", value: round(withinOneRate), threshold: `>= ${SHADOW_GATE.minWithinOne}`, pass: withinOneRate !== null && withinOneRate + EPS >= SHADOW_GATE.minWithinOne },
    { name: "evidence verification rate", value: round(evidenceVerificationRate), threshold: `>= ${SHADOW_GATE.minEvidenceRate}`, pass: evidenceVerificationRate !== null && evidenceVerificationRate + EPS >= SHADOW_GATE.minEvidenceRate },
  ];
  return {
    promptVersion: meta.promptVersion,
    model: meta.model ?? null,
    responses,
    tasks,
    statusCounts,
    suppressionRate: responses ? round(statusCounts.SUPPRESSED / responses) : null,
    partialRate: responses ? round(statusCounts.PARTIAL / responses) : null,
    scoredResponses: errors.length,
    mae: round(mae),
    withinOneRate: round(withinOneRate),
    criteriaCompared: compared,
    perCriterionAgreement: round(perCriterionAgreement),
    returnedQuotes,
    verifiedQuotes,
    evidenceVerificationRate: round(evidenceVerificationRate),
    checks,
    pass: checks.every((c) => c.pass),
  };
}

const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)} %`);

/** Markdown report for `_bmad-output/implementation-artifacts/tai-02-shadow-evaluation.md`. */
export function renderShadowReport(report: ShadowReport, meta: { date: string; source: "SYNTHETIC" | "LECTURER"; notes: string[] }) {
  const lines = [
    "# TAI-02 shadow evaluation",
    "",
    meta.source === "SYNTHETIC"
      ? "> **SYNTHETIC DATA.** Every response and every teacher grade below is generated by `scripts/tai02-shadow-eval.ts` with a fixed seed, and the AI side is the deterministic fake provider. This proves the evaluation harness and the pipeline only. **Real shadow data (blind lecturer grades on real submissions) has NOT been collected**, so this is not release evidence for assist mode in production."
      : "> Lecturer shadow run on real submissions.",
    "",
    `- Date: ${meta.date}`,
    `- Prompt version: \`${report.promptVersion}\``,
    `- Model: \`${report.model ?? "n/a"}\``,
    `- Source: ${meta.source}`,
    `- Verdict: **${report.pass ? "PASS" : "FAIL"}**${meta.source === "SYNTHETIC" ? " (synthetic)" : ""}`,
    "",
    "## Metrics",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Responses | ${report.responses} |`,
    `| Written tasks | ${report.tasks} |`,
    `| VALID / PARTIAL / SUPPRESSED | ${report.statusCounts.VALID} / ${report.statusCounts.PARTIAL} / ${report.statusCounts.SUPPRESSED} |`,
    `| Suppression rate | ${pct(report.suppressionRate)} |`,
    `| Partial rate | ${pct(report.partialRate)} |`,
    `| Responses with a full AI total (VALID) | ${report.scoredResponses} |`,
    `| MAE (10-point scale) | ${report.mae === null ? "n/a" : report.mae.toFixed(4)} |`,
    `| Within ±1 point | ${pct(report.withinOneRate)} |`,
    `| Per-criterion agreement (≤ 1 anchor step) | ${pct(report.perCriterionAgreement)} over ${report.criteriaCompared} criteria |`,
    `| Evidence verification rate | ${pct(report.evidenceVerificationRate)} (${report.verifiedQuotes}/${report.returnedQuotes} quotes) |`,
    "",
    "## Gate checks",
    "",
    "| Check | Value | Threshold | Result |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((c) => `| ${c.name} | ${c.value ?? "n/a"} | ${c.threshold} | ${c.pass ? "pass" : "FAIL"} |`),
    "",
    "## Notes",
    "",
    ...meta.notes.map((n) => `- ${n}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * Rows for the admin report from the database: shadow-mode suggestions of one prompt version joined with the latest
 * MANUAL teacher grade of the same submission and rubric version (in shadow mode the teacher never saw the suggestion).
 */
export async function loadShadowRows(db: any, promptVersion: string, model?: string) {
  const suggestions = await db.aiAssessmentSuggestion.findMany({
    where: { promptVersion, mode: "shadow", ...(model ? { job: { model } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, submissionId: true, resourceVersion: true, status: true, criterionResults: true, job: { select: { model: true } } },
  });
  const latestPerSubmission = new Map<string, any>();
  for (const s of suggestions) if (!latestPerSubmission.has(s.submissionId)) latestPerSubmission.set(s.submissionId, s);
  const ids = [...latestPerSubmission.keys()];
  if (!ids.length) return { rows: [] as EvalRow[], models: [] as string[] };
  const submissions = await db.assignmentSubmission.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, resourceVersion: true, assignment: { select: { contentId: true } },
      gradeDecisions: { where: { kind: "MANUAL" }, orderBy: { createdAt: "desc" }, take: 1, select: { criterionPoints: true, resourceVersion: true } },
    },
  });
  const resourceIds = [...new Set(submissions.map((s: any) => s.assignment.contentId))];
  const resources = await db.classResource.findMany({ where: { id: { in: resourceIds } }, select: { id: true, content: true } });
  const rows: EvalRow[] = [];
  for (const submission of submissions) {
    const grade = submission.gradeDecisions[0];
    const suggestion = latestPerSubmission.get(submission.id);
    if (!grade || grade.resourceVersion !== suggestion.resourceVersion) continue;
    const content = resources.find((r: any) => r.id === submission.assignment.contentId)?.content as any;
    const rubric: EvalRubric = (content?.prompts ?? []).flatMap((p: any) =>
      p.criteria.map((c: any) => ({ promptId: p.id, criterionCode: c.code, maxPoints: c.maxPoints, anchors: c.anchors.map((a: any) => a.points) })));
    rows.push({
      submissionId: submission.id,
      taskId: submission.assignment.contentId,
      rubric,
      suggestion: { status: suggestion.status, criterionResults: Array.isArray(suggestion.criterionResults) ? suggestion.criterionResults : [] },
      teacher: Array.isArray(grade.criterionPoints) ? grade.criterionPoints : [],
    });
  }
  return { rows, models: [...new Set(suggestions.map((s: any) => s.job?.model).filter(Boolean))] as string[] };
}
