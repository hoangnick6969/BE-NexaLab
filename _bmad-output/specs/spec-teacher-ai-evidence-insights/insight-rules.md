# Insight Rules — `insights@1`

Each rule is a pure function `(evidence, now) → Insight[]`, unit-tested without a database.

## Evidence model (input)

Built per class and student from records with `assignmentId` in the class's assignments:

| Kind | Source | Fields used | Counts as scored |
| --- | --- | --- | --- |
| `QUIZ` | `QuizAttempt` | id, createdAt, score (0–100), passed, lessonId | yes |
| `TEST` | `AssignmentSubmission` | id, submittedAt, score (0–100), resource lesson | yes, except `timing=LATE` without decision and `LateDecision=REJECT_ZERO` |
| `PRACTICAL` | `Attempt` | id, createdAt, verdict, lesson via `lessonStepId`, max `HintLog.level` (0 if none) | no |

An evidence item maps to outcome codes through its lesson's `outcomeCodes`.

## First wave

### INSUFFICIENT_EVIDENCE — status `NEEDS_MORE_EVIDENCE`

- Fires when the student has fewer than 3 scored evidence items in scope.
- When it fires, `SCORE_CHANGE_UNUSUAL` is not evaluated for that student. Other rules still apply on their own minimums.
- Boundaries: 2 items → fires; 3 → does not.

### SCORE_CHANGE_UNUSUAL — status `TEACHER_REVIEW_RECOMMENDED`

- Order scored items by time. `latest` is the newest item. The baseline is the up to 10 items before it, and needs at least 3.
- Compute μ as the mean and σ as the population standard deviation of the baseline.
- Fires when |latest − μ| ≥ max(2σ, 25). The `direction` field is `UP` or `DOWN`. The message is neutral: "Kết quả gần nhất khác đáng kể so với các lần trước".
- Evidence IDs are the baseline items plus the latest.
- Boundaries:
  - Baseline [60, 60, 60], latest 85 → fires (Δ 25). Latest 84 → does not.
  - Baseline [40, 60, 80] has μ = 60, σ ≈ 16.33 and 2σ ≈ 32.66, so the σ term governs. Latest 92 (Δ 32) → does not fire. Latest 93 (Δ 33) → fires.
  - Baseline of only 2 items → never fires.

### HIGH_HINT_DEPENDENCE — status `INFORMATIONAL`, pattern `SUDDEN_UNAIDED_PASS` → `TEACHER_REVIEW_RECOMMENDED`

- Base rule: at least 3 `PRACTICAL` items, and 3 × count(maxHintLevel ≥ 3) ≥ 2 × total.
  - Boundaries: 2 of 3 → fires; 1 of 3 → does not; 4 of 6 → fires; 3 of 6 → does not.
- Pattern: the 3 practicals before the latest each have maxHintLevel ≥ 3, and the latest has verdict `passed` with maxHintLevel 0.
  - Boundary: the latest used level 1 → no pattern.
- Evidence IDs are the practical attempts considered.

### OBJECTIVE_MASTERY_INCONSISTENT — status `INFORMATIONAL`

- Evaluated per outcome code `c`. Take the items linked to `c`, which must number at least 3.
- A passing item is `QUIZ.passed`, `TEST.score ≥ 50` or `PRACTICAL.verdict = passed`.
- Fires when there is at least one passing item of kind K1 and at least 2 non-passing items of a different kind K2.
- The payload carries `outcomeCode`, `passingKind` and `nonPassingKind`. Evidence IDs are the items involved.
- Boundaries: 1 pass + 1 non-pass of the other kind → does not fire; 1 + 2 → fires; passes and failures of the same kind only → does not fire.

## Second wave (not in `insights@1`; ships as `insights@2`)

| Rule | Depends on | Definition sketch | Status |
| --- | --- | --- | --- |
| `MCQ_EXPLANATION_MISMATCH` | TAI-02 teacher-final assessment | Same assignment or lesson: MCQ score ≥ 80 and the teacher-final reasoning criterion ≤ 40% of its max, or the inverse | `TEACHER_REVIEW_RECOMMENDED` |
| `SIMULATION_EXPLANATION_MISMATCH` | TAI-02 written explanation linked to a practical | Practical `passed` and the explanation criterion ≤ 40%, or `needs_practice` and the explanation ≥ 80% | `TEACHER_REVIEW_RECOMMENDED` |
| `SUBMISSION_SIMILARITY_HIGH` | TAI-03 submission similarity | A match above the TAI-03 high threshold that the teacher has not yet reviewed; disappears once reviewed | `TEACHER_REVIEW_RECOMMENDED` |

Second-wave rules read only official records: teacher-final grades, never `suggestedScore`. Exact thresholds are fixed in this file when `insights@2` is specified.

## Insight output

```ts
type Insight = {
  fingerprint: string;          // sha256(ruleVersion|ruleCode|classId|studentId|sorted evidenceIds)
  ruleVersion: "insights@1";
  ruleCode: string;
  pattern?: "SUDDEN_UNAIDED_PASS";
  status: "INFORMATIONAL" | "NEEDS_MORE_EVIDENCE" | "TEACHER_REVIEW_RECOMMENDED";
  studentId: string;
  message: string;              // neutral Vietnamese, from a fixed template per rule
  thresholds: Record<string, number>;
  values: Record<string, number | string>;
  evidence: Array<{ kind: "QUIZ" | "TEST" | "PRACTICAL"; id: string; at: string }>;
  computedAt: string;
};
```

## Forbidden vocabulary

Templates and codes must not contain `gian lận`, `năng lực thật`, `yếu kém`, `xếp hạng`, `nghi ngờ`, or their English equivalents. A unit test scans every template.
