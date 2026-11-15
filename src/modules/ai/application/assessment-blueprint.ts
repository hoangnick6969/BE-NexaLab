import { z } from "zod";

/**
 * TAI-07 / TAI7-T5 `GENERATE_ASSESSMENT` (generate-assessment@1): the pure, deterministic part. The teacher's matrix
 * (Nhận biết / Thông hiểu / Vận dụng) and section counts become a BLUEPRINT of slots with a fixed cognitive level and a
 * fixed point budget; the model only writes content for each slot. Points are server-allocated in cents, so the total of
 * the paper is exactly 10,00 by construction and never depends on what the model returns (AM-G1: 10-point scale,
 * rounded once, at display).
 */
export const ASSESSMENT_PURPOSE = "GENERATE_ASSESSMENT" as const;
export const GENERATE_ASSESSMENT_PROMPT_VERSION = "generate-assessment@1";
export const ASSESSMENT_ITEMS_SCHEMA_VERSION = "assessment-items@1";
/** Output budget of one generate-assessment call (a 45-minute paper with rubrics is the largest case). */
export const GENERATE_ASSESSMENT_MAX_OUTPUT_TOKENS = 12_288;

export const COGNITIVE_LEVELS = ["RECALL", "UNDERSTAND", "APPLY"] as const;
export type CognitiveLevel = (typeof COGNITIVE_LEVELS)[number];
/** Vietnamese labels of the three levels of the Ministry matrix. */
export const LEVEL_LABEL: Record<CognitiveLevel, string> = { RECALL: "Nhận biết", UNDERSTAND: "Thông hiểu", APPLY: "Vận dụng" };

export const MAX_MCQ = 20;
export const MAX_WRITTEN = 3;
export const MAX_SLOTS = 24;

/** Default shape per grade column; the teacher can change every number (the FE mirrors these). */
export const ASSESSMENT_DEFAULTS = {
  REGULAR_15M: { mcqCount: 6, writtenCount: 1, matrix: { RECALL: 40, UNDERSTAND: 40, APPLY: 20 } },
  MIDTERM_45M: { mcqCount: 10, writtenCount: 2, matrix: { RECALL: 30, UNDERSTAND: 40, APPLY: 30 } },
} as const;

const identifier = z.string().trim().min(1).max(100);
const percent = z.number().int().min(0).max(100);

export const assessmentDraftObject = z
  .object({
    purpose: z.literal(ASSESSMENT_PURPOSE),
    lessonId: z.string().trim().min(1).max(64),
    assessmentType: z.enum(["REGULAR_15M", "MIDTERM_45M"]),
    matrix: z.object({ RECALL: percent, UNDERSTAND: percent, APPLY: percent }).strict(),
    sections: z
      .object({
        mcqCount: z.number().int().min(0).max(MAX_MCQ),
        writtenCount: z.number().int().min(0).max(MAX_WRITTEN),
        /** A Lab the teacher picked from the eligible list; the model never chooses one. */
        lab: z.object({ labId: identifier, releaseId: identifier, challengeId: identifier }).strict().nullable(),
      })
      .strict(),
    instruction: z.string().trim().max(1000).optional(),
    /** TAI-05: the estimate the teacher confirmed. Required while AI_CREDITS_ENABLED=true, ignored otherwise. */
    confirmedCredits: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

/** Cross-field rules, applied by the union in ai-job-contract and by `assessmentDraftBody`. */
export function refineAssessmentDraft(body: z.infer<typeof assessmentDraftObject>, ctx: z.RefinementCtx) {
    const { RECALL, UNDERSTAND, APPLY } = body.matrix;
    if (RECALL + UNDERSTAND + APPLY !== 100)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["matrix"], message: "Tỷ lệ ba mức nhận thức phải cộng đúng 100%" });
    const { mcqCount, writtenCount, lab } = body.sections;
    if ([mcqCount > 0, writtenCount > 0, lab !== null].filter(Boolean).length < 2)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "Đề cần ít nhất hai phần trong ba phần: trắc nghiệm, tự luận, Lab" });
    if (mcqCount + writtenCount + (lab ? 1 : 0) > MAX_SLOTS)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: `Đề tối đa ${MAX_SLOTS} câu` });
}
export const assessmentDraftBody = assessmentDraftObject.superRefine(refineAssessmentDraft);
export type AssessmentDraftBody = z.infer<typeof assessmentDraftObject>;

export const slotCount = (sections: AssessmentDraftBody["sections"]) => sections.mcqCount + sections.writtenCount + (sections.lab ? 1 : 0);

/** Normalized request stored on AiJob.request and hashed for idempotency. `itemCount` = slots, which prices the job. */
export function normalizeAssessmentBody(body: AssessmentDraftBody) {
  return {
    purpose: body.purpose,
    lessonId: body.lessonId,
    assessmentType: body.assessmentType,
    matrix: { RECALL: body.matrix.RECALL, UNDERSTAND: body.matrix.UNDERSTAND, APPLY: body.matrix.APPLY },
    sections: { mcqCount: body.sections.mcqCount, writtenCount: body.sections.writtenCount, lab: body.sections.lab },
    itemCount: slotCount(body.sections),
    instruction: body.instruction ? body.instruction : null,
  };
}
export type NormalizedAssessmentRequest = ReturnType<typeof normalizeAssessmentBody>;

// ---------- cognitive levels ----------

/**
 * Items per level for `total` items: floor of total x pct / 100 for each level, then the leftover items go to the largest
 * fractional remainders (ties: the earlier level). A level at 0% never receives an item.
 */
export function levelTargets(matrix: Record<CognitiveLevel, number>, total: number): Record<CognitiveLevel, number> {
  const raw = COGNITIVE_LEVELS.map((level, order) => ({ level, order, exact: (total * matrix[level]) / 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.level, Math.floor(r.exact + 1e-9)])) as Record<CognitiveLevel, number>;
  let left = total - COGNITIVE_LEVELS.reduce((sum, level) => sum + out[level], 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact + 1e-9) - (a.exact - Math.floor(a.exact + 1e-9)) || a.order - b.order)) {
    if (left <= 0) break;
    if (matrix[r.level] === 0) continue;
    out[r.level]++;
    left--;
  }
  return out;
}

export type Slot = { kind: "MCQ" | "WRITTEN" | "LAB"; index: number; cognitiveLevel: CognitiveLevel };

/**
 * Orders the slots MCQ, then written, then the Lab. The Lab is always APPLY (hands-on). Written answers take the highest
 * levels left (APPLY, then UNDERSTAND, then RECALL), multiple choice takes the rest from RECALL upwards, so each level of
 * the matrix is met exactly.
 */
export function buildSlots(sections: AssessmentDraftBody["sections"], matrix: Record<CognitiveLevel, number>): Slot[] {
  const total = slotCount(sections);
  const pool = levelTargets(matrix, total);
  if (sections.lab) {
    // The Lab takes an APPLY item from the pool; with no APPLY in the matrix it takes one from the most common level.
    const from = pool.APPLY > 0 ? "APPLY" : COGNITIVE_LEVELS.reduce((best, level) => (pool[level] > pool[best] ? level : best), "RECALL" as CognitiveLevel);
    pool[from]--;
  }
  const take = (order: readonly CognitiveLevel[]) => {
    const level = order.find((candidate) => pool[candidate] > 0) ?? order[0]!;
    pool[level] = Math.max(0, pool[level] - 1);
    return level;
  };
  const written = Array.from({ length: sections.writtenCount }, (_, index): Slot => ({ kind: "WRITTEN", index, cognitiveLevel: take(["APPLY", "UNDERSTAND", "RECALL"]) }));
  const mcq = Array.from({ length: sections.mcqCount }, (_, index): Slot => ({ kind: "MCQ", index, cognitiveLevel: take(["RECALL", "UNDERSTAND", "APPLY"]) }));
  return [...mcq, ...written, ...(sections.lab ? [{ kind: "LAB", index: 0, cognitiveLevel: "APPLY" } as Slot] : [])];
}

// ---------- points (cents) ----------

const spreadEvenly = (total: number, count: number) => {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
};

/**
 * Point budget in cents (1000 = 10,00 points). The Lab is worth 2,00, a written block 4,00 when there is also multiple
 * choice (otherwise the rest after the Lab), and multiple choice takes the remainder, split to the cent. Written budgets
 * move in half points because rubric criteria do. Null when fewer than two sections remain.
 */
export function allocatePoints(input: { mcq: number; written: number; lab: boolean }) {
  const sections = [input.mcq > 0, input.written > 0, input.lab].filter(Boolean).length;
  if (sections < 2) return null;
  const labUnits = input.lab ? 200 : 0;
  let writtenTotal = 0;
  let mcqTotal = 0;
  if (input.mcq > 0 && input.written > 0) {
    writtenTotal = 400;
    mcqTotal = 1000 - writtenTotal - labUnits;
  } else if (input.written > 0) writtenTotal = 1000 - labUnits;
  else mcqTotal = 1000 - labUnits;
  const halves = spreadEvenly(writtenTotal / 50, input.written);
  return {
    mcqUnits: input.mcq ? spreadEvenly(mcqTotal, input.mcq) : [],
    writtenUnits: halves.map((h) => h * 50),
    labUnits,
  };
}

// ---------- rubric normalization ----------

export type RubricCriterion = { code: string; description: string; maxPoints: number; anchors: Array<{ points: number; description: string }> };

const half = (value: number) => Math.round(value * 2) / 2;

/** Anchors keep their relative position when a criterion's maximum changes: first 0, last = max, strictly increasing halves. */
export function rescaleAnchors(anchors: Array<{ points: number; description: string }>, oldMax: number, newMax: number) {
  const mapped = anchors.map((anchor) => ({ points: oldMax > 0 ? half((anchor.points / oldMax) * newMax) : 0, description: anchor.description }));
  mapped[0]!.points = 0;
  mapped[mapped.length - 1]!.points = newMax;
  const out: typeof mapped = [];
  mapped.forEach((anchor, i) => {
    const last = i === mapped.length - 1;
    const previous = out[out.length - 1];
    if (previous && anchor.points <= previous.points) {
      if (last) out[out.length - 1] = anchor; // the top anchor always survives with its own description
      return;
    }
    out.push(anchor);
  });
  return out;
}

/** Normalizes a criterion code to the rubric contract `^[A-Z][A-Z0-9_]{1,31}$`, unique inside the question. */
export function criterionCode(raw: string, index: number, used: Set<string>) {
  let code = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "D").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28);
  if (!/^[A-Z]/.test(code) || code.length < 2) code = `TIEU_CHI_${index + 1}`;
  let unique = code;
  for (let n = 2; used.has(unique); n++) unique = `${code}_${n}`.slice(-32);
  used.add(unique);
  return unique;
}

/**
 * Fits a rubric to a point budget in half points: every criterion gets at least 1,0 point and the rest follows the
 * model's own weights (largest remainder). Returns null when the budget cannot hold a single criterion.
 * `changed` is true when anything differed from what the model returned, so the teacher is warned.
 */
export function fitRubric(criteria: RubricCriterion[], budgetUnits: number, maxCriteria: number) {
  const halves = budgetUnits / 50;
  const kept = criteria.slice(0, Math.max(1, Math.min(maxCriteria, Math.floor(halves / 2))));
  if (halves < 2 || kept.length === 0) return null;
  // A rubric that already adds up to the budget with valid half-point maxima is kept exactly as the model wrote it.
  const onGrid = (value: number) => Number.isFinite(value) && value >= 1 && value <= 10 && Math.round(value * 2) === value * 2;
  const exact = kept.length === criteria.length && kept.every((c) => onGrid(c.maxPoints)) && kept.reduce((sum, c) => sum + c.maxPoints * 2, 0) === halves;
  if (exact) {
    const used = new Set<string>();
    const fitted = kept.map((c, i): RubricCriterion => ({ ...c, code: criterionCode(c.code, i, used), anchors: rescaleAnchors(c.anchors, c.maxPoints, c.maxPoints) }));
    return { criteria: fitted, changed: JSON.stringify(fitted) !== JSON.stringify(criteria) };
  }
  const weights = kept.map((c) => (Number.isFinite(c.maxPoints) && c.maxPoints > 0 ? c.maxPoints : 1));
  const extras = halves - 2 * kept.length;
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w, i) => ({ i, exact: (extras * w) / totalWeight }));
  const extra = shares.map((s) => Math.floor(s.exact + 1e-9));
  let left = extras - extra.reduce((a, b) => a + b, 0);
  for (const s of [...shares].sort((a, b) => b.exact - Math.floor(b.exact + 1e-9) - (a.exact - Math.floor(a.exact + 1e-9)) || a.i - b.i)) {
    if (left <= 0) break;
    extra[s.i]!++;
    left--;
  }
  const used = new Set<string>();
  const fitted = kept.map((c, i): RubricCriterion => {
    const maxPoints = (2 + extra[i]!) / 2;
    const oldMax = Number.isFinite(c.maxPoints) && c.maxPoints > 0 ? c.maxPoints : maxPoints;
    return { code: criterionCode(c.code, i, used), description: c.description, maxPoints, anchors: rescaleAnchors(c.anchors, oldMax, maxPoints) };
  });
  const changed = JSON.stringify(fitted) !== JSON.stringify(criteria) || criteria.length !== fitted.length;
  return { criteria: fitted, changed };
}
