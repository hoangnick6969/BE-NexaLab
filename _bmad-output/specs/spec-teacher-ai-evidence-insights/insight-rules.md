# Insight Rules — `insights@1`

Each rule is a pure function `(evidence, now) → Insight[]`, unit-tested without a database.

## Evidence model (input)

Built per class and student from records with `assignmentId` in the class's assignments:

| Kind | Source | Fields used | Counts as scored |
| --- | --- | --- | --- |
| `QUIZ` | `QuizAttempt` | id, createdAt, score (0–100), passed, lessonId | yes |
| `TEST` | `AssignmentSubmission` | id, submittedAt, score (0–100), resource lesson | yes, only when `gradingMode=AUTO` and `score` is not null; excluded: `timing=LATE` without decision and `LateDecision=REJECT_ZERO`. Teacher-graded written submissions are left for `insights@2` (PO 2026-11-06). |
| `PRACTICAL` | `Attempt` | id, createdAt, verdict, lesson via `lessonStepId`, max `HintLog.level` (0 if none) | no |

An evidence item maps to outcome codes through its lesson's `outcomeCodes`.

The loader (TAI4-T2) filters and normalizes evidence; the engine receives the list as `{ kind, id, at, score?, passed?, verdict?, maxHintLevel?, outcomeCodes }` and never reads the database. Items are ordered by time, then by id. `latest` is taken over QUIZ and TEST together. All numeric comparisons use a tolerance of 1e-9. Approved by the PO on 2026-11-06 (gate G-5): the thresholds below are unchanged.

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
- The pattern needs at least 4 practicals. "The 3 practicals before the latest" are the 3 immediately before it.
- The pattern can hold without the base rule (for example many unaided attempts, then 3 high-hint attempts, then a clean pass). One `HIGH_HINT_DEPENDENCE` insight is emitted when the base rule or the pattern holds, with `values.baseRuleMet` of 1 or 0.
- Pilot visibility (PO, 2026-11-06): `SUDDEN_UNAIDED_PASS` is always computed and tested, but the service hides it unless `INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS=true` (default false). Hidden, the insight drops to plain `HIGH_HINT_DEPENDENCE` (`INFORMATIONAL`, no `pattern`) when `baseRuleMet` is 1 and disappears when it is 0. The fingerprint does not change.
- Evidence IDs are all practical attempts in scope.

### OBJECTIVE_MASTERY_INCONSISTENT — status `INFORMATIONAL`

- Evaluated per outcome code `c`. Take the items linked to `c`, which must number at least 3.
- A passing item is `QUIZ.passed`, `TEST.score ≥ 50` or `PRACTICAL.verdict = passed`.
- Fires when there is at least one passing item of kind K1 and at least 2 non-passing items of a different kind K2.
- The payload carries `outcomeCode`, `passingKind` and `nonPassingKind`, in `values`.
- Each outcome code produces at most one insight. When several (K1, K2) pairs qualify, the first pair in alphabetical order of (`passingKind`, `nonPassingKind`) is used (kinds: `PRACTICAL`, `QUIZ`, `TEST`). Evidence IDs are all passing items of K1 plus all non-passing items of K2. An item linked to several outcomes counts for each.
- Boundaries: 1 pass + 1 non-pass of the other kind → does not fire; 1 + 2 → fires; passes and failures of the same kind only → does not fire.

## Second wave (not in `insights@1`)

Each wave is its own rule version holding only its new rules, so a released version is never edited and the fingerprints of acknowledged insights stay valid (the fingerprint contains `ruleVersion`). `SUBMISSION_SIMILARITY_HIGH` is `insights@2`; the explanation-mismatch rules of TAI4-T5 are `insights@3`. The service runs every active version (`insights@1`, `insights@2`, `insights@3`), and replay runs only the version stored on the acknowledgement row.

| Rule | Depends on | Definition sketch | Status |
| --- | --- | --- | --- |
| `MCQ_EXPLANATION_MISMATCH` | TAI-02 teacher-final assessment | Same assignment or lesson: MCQ score ≥ 80 and the teacher-final reasoning criterion ≤ 40% of its max, or the inverse | `TEACHER_REVIEW_RECOMMENDED` |
| `SIMULATION_EXPLANATION_MISMATCH` | TAI-02 written explanation linked to a practical | Practical `passed` and the explanation criterion ≤ 40%, or `needs_practice` and the explanation ≥ 80% | `TEACHER_REVIEW_RECOMMENDED` |
| `SUBMISSION_SIMILARITY_HIGH` | TAI-03 submission similarity | A match above the TAI-03 high threshold that the teacher has not yet reviewed; disappears once reviewed | `TEACHER_REVIEW_RECOMMENDED` |

Second-wave rules read only official records: teacher-final grades, never `suggestedScore`. The exact thresholds of the explanation-mismatch rules are fixed below (`insights@3`).

### MCQ_EXPLANATION_MISMATCH and SIMULATION_EXPLANATION_MISMATCH — `insights@3`, status `TEACHER_REVIEW_RECOMMENDED` (TAI4-T5)

> **Team-lead decision 2026-11-09, pending PO/lecturer confirmation (not an approval).** The thresholds, the criterion codes and the lesson link below are conservative, deterministic choices made so the rules could be built and tested; they are not yet approved by the PO or the supervising lecturer and may change in a later rule version (never by editing `insights@3` once acknowledged fingerprints exist).

Input (prepared by the loader, `ExplanationFact`): for each approved student and each written assignment, the **newest `WrittenGradeDecision`** (teacher-final points; the `*_AI` kinds store the teacher's points too) of the student's **current** submission, reduced to the explanation criteria. `AiAssessmentSuggestion` and `AiJob` are never queried and `suggestedScore` never read; an AI suggestion without a teacher grade produces nothing.

- **Explanation criteria:** the rubric criteria whose `code` is `EXPLANATION` or `REASONING`, summed over all prompts. `explanationPercent = points / maxPoints × 100` of those criteria only (maxPoints comes from the rubric the assignment pins). A rubric with no such criterion, a grade missing one of them, or a zero maximum gives no fact. Teachers mark a criterion as the explanation by using one of these codes.
- **Link:** by lesson. A written fact belongs to the lesson of its resource (`ClassResource.lessonId`); the answer side is the student's **newest** (time, then id) scored `QUIZ` or `TEST` (MCQ rule) or `PRACTICAL` attempt (simulation rule) of the same lesson within the class assignments. No lesson, or no such item, gives no insight.
- **Current submission only:** the fact exists only while the newest submission of the student is graded and is `SCORED` or `ACCEPTED_BY_EXTENSION` (late-pending and reject-zero submissions give nothing; an older submission never stands in for a newer ungraded one).
- **MCQ_EXPLANATION_MISMATCH** fires per graded written submission when (answer score ≥ 80 and `explanationPercent` ≤ 40) or (answer score ≤ 40 and `explanationPercent` ≥ 80). `values.direction` is `ANSWER_HIGH_EXPLANATION_LOW` or `ANSWER_LOW_EXPLANATION_HIGH`. Thresholds: `answerHighMin: 80`, `answerLowMax: 40`, `explanationHighMin: 80`, `explanationLowMax: 40`.
- **SIMULATION_EXPLANATION_MISMATCH** fires per graded written submission when (practical verdict `passed` and `explanationPercent` ≤ 40) or (verdict `needs_practice` and `explanationPercent` ≥ 80); any other verdict gives nothing. `values.direction` is `PASSED_EXPLANATION_LOW` or `NEEDS_PRACTICE_EXPLANATION_HIGH`. Thresholds: `explanationHighMin: 80`, `explanationLowMax: 40`.
- Comparisons use the 1e-9 tolerance; the shown `explanationPercent` is rounded to one decimal, the decision uses the exact value.
- **Evidence** (fingerprint input): the answer item (`QUIZ`, `TEST` or `PRACTICAL`), the written submission (`WRITTEN`) and the grade decision (`WRITTEN_GRADE`), so a regrade, a newer answer or a newer submission gives a new fingerprint. `values` also carry `assignmentId`, `assignmentTitle`, `lessonId`, `explanationPercent`, plus `mcqScore` or `verdict`.
- Boundaries (explanation out of 100): MCQ 80/40 fires, 79/40 and 80/41 do not; MCQ 40/80 fires, 41/80 and 40/79 do not; practical `passed`/40 fires, `passed`/41 does not; `needs_practice`/80 fires, `needs_practice`/79 does not.
- Neutral messages (fixed, no raw codes): MCQ: "Điểm trắc nghiệm và phần giải thích bằng văn bản của cùng một bài học chưa tương xứng với nhau. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận."; simulation: "Kết quả thực hành và phần giải thích bằng văn bản của cùng một bài học chưa tương xứng với nhau. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận."
- Teacher-only, no ranking, no effect on scores or progress, no provider call anywhere; acknowledgement, replay (as-of grades, submissions and late decisions) and `INSIGHT_STALE` work as for the other versions.

### SUBMISSION_SIMILARITY_HIGH — `insights@2`, status `TEACHER_REVIEW_RECOMMENDED` (TAI4-T6, PO 2026-11-07)

Input: for each approved student, one fact per `HIGH` match of the newest similarity run of each written assignment, `{ assignmentId, assignmentTitle, submissionId, submittedAt, matchId, runAt, level, reviewed }`, prepared by the loader.

- Only `HIGH` counts (`ELEVATED` never does). A match is `reviewed` once it has any review row (`NOTED` or `DISMISSED`) with `createdAt <= asOf`; a reviewed match is not counted, for both students of the pair.
- The loader uses only the newest run of each written assignment. A match is valid while both of its submissions are still the latest submissions of their students and both students are approved members. A run that is `stale` is not dropped as a whole.
- One insight per `(student, assignment)` with at least one unreviewed valid match. `evidence` is the student's own current submission (`WRITTEN`, at the submission time) plus one `SIMILARITY_MATCH` entry per unreviewed match (at the run time), so the fingerprint changes with a new run or when a pair is reviewed.
- `values` are `assignmentId`, `assignmentTitle`, `level: "HIGH"`, `pairCount`; `thresholds` are `highContainmentPercent: 80` and `minSharedShingles: 8` (the TAI-03 `subsim@1` values). Nothing identifies the other student of a pair: no name, no student id, no submission id, no text.
- Message (neutral): "Bài làm có nội dung trùng khá nhiều với bài của học sinh khác trong cùng bài giao. Đây là bằng chứng để giáo viên đối chiếu, không phải kết luận."
- The pair review of TAI-03 and the per-student acknowledgement of TAI4-T3 are independent: reviewing a pair removes the insight for both students, acknowledging a card hides only that student's card.

## Insight output

```ts
type Insight = {
  fingerprint: string;          // sha256(ruleVersion|ruleCode|classId|studentId|sorted evidenceIds); OBJECTIVE_MASTERY_INCONSISTENT also includes outcomeCode after studentId
  ruleVersion: "insights@1" | "insights@2" | "insights@3";
  ruleCode: string;
  pattern?: "SUDDEN_UNAIDED_PASS";
  status: "INFORMATIONAL" | "NEEDS_MORE_EVIDENCE" | "TEACHER_REVIEW_RECOMMENDED";
  studentId: string;
  message: string;              // neutral Vietnamese, from a fixed template per rule
  thresholds: Record<string, number>;
  values: Record<string, number | string>;
  evidence: Array<{ kind: "QUIZ" | "TEST" | "PRACTICAL" | "WRITTEN" | "SIMILARITY_MATCH" | "WRITTEN_GRADE"; id: string; at: string }>;
  computedAt: string;
};
```

## Fingerprint, ordering and messages

- The fingerprint is `sha256` of the parts joined by `|`: `ruleVersion`, `ruleCode`, `classId`, `studentId`, then (only for `OBJECTIVE_MASTERY_INCONSISTENT`) `outcomeCode`, then the sorted evidence IDs joined by `,`. The outcome code keeps two outcomes that share one evidence set from colliding (PO, 2026-11-06). The pattern is not part of it.
- `INSUFFICIENT_EVIDENCE` uses the scored items present as evidence, so the fingerprint is fixed while a student has no scored item and changes with the first one.
- Insights are ordered by rule code, then outcome code. Each rule has one fixed Vietnamese template, and the pattern has its own. Messages never contain a raw rule code.

## Forbidden vocabulary

Templates and codes must not contain `gian lận`, `năng lực thật`, `yếu kém`, `xếp hạng`, `nghi ngờ`, or their English equivalents. A unit test scans every template.

## insights@4 (TAI-07 / TAI7-T2, project owner 2026-11-15)

Spec of record: `../spec-teacher-ai-assessment-mode/` (tickets TAI7-T2, `.memlog.md`). Thresholds approved by the PO on 2026-11-15. Code: `trend-rule.ts`,
`assessment-facts.ts`. Additive version; `insights@1..3` code and fingerprints are unchanged.

### G-5 amendment: `insights@1 SCORE_CHANGE_UNUSUAL` retired from the read routes

- The rule compared every QUIZ attempt and TEST submission, so resubmissions of one practice test fired it (the
  uncommitted `RETAKE_SAME_ASSIGNMENT` label only reworded it). It is removed from the list, open and all views, by the
  service (`applyRetirement`, `RETIRED_RULES`). Its engine still runs inside `insights@1` and replay of an acknowledged
  fingerprint uses it unchanged; an acknowledgement of it can no longer be created (the read routes do not list it).
- `InsightsConfig.includeRetired` exists only for the TAI-04 mechanics tests; production never sets it.
- Requested by the project owner on 2026-11-15; the G-5 PO approval of `insights@1` thresholds is otherwise unchanged.

### Representative result per assignment (`AssessmentFact`)

One row per (assignment, target student) of the class, from rows the loader already reads (no extra query):

| Assignment | Representative | Not counted |
|---|---|---|
| TEST, `REGULAR_15M` / `MIDTERM_45M` | current submission, only once `scoresPublishedAt` (≤ as-of) | unpublished → `PENDING` |
| TEST, `PRACTICE` | **first** submission that is on time, accepted by extension or rejected (0) | later resubmissions |
| WRITTEN (any type) | newest teacher grade of the current submission (graded types: once published) | AI suggestions, ungraded |
| lesson | first quiz attempt of the assignment | later attempts; no attempt → no row |

Score on the 10-point scale = `toScale10(raw, max)` (half-up, one decimal). An active test/written assignment with no
submission is `NOT_DONE`; archived work never is.

### ASSESSMENT_TREND — status `TEACHER_REVIEW_RECOMMENDED`

- Series: scored facts ordered by the representative's time; the graded columns when there are at least 4, otherwise
  every scored fact (`values.family` = `GRADED` | `ALL`).
- Latest vs the 3–5 assignments before it: fires when |latest − μ| ≥ max(2σ, 2.0 points), population σ.
- Values: `latest10`, `mean10`, `delta10`, `threshold10`, `direction`, `family`, `latestAssignmentId`, `latestTitle`,
  `latestAssessmentType`. Evidence: the baseline and latest representatives, each with `label`, `score10`,
  `assessmentType`.
- Boundaries: 6,6,6 → 8 fires; 6,6,6 → 7.9 does not; five resubmissions of one practice test never fire.

### READINESS_BEFORE_MIDTERM — status `INFORMATIONAL`

- For each `MIDTERM_45M` of the student due within 7 days and still `NOT_DONE`: the prep work is the `PRACTICE` and
  `REGULAR_15M` assignments created by now, of the midterm's lesson (all lessons when the midterm has none).
- Fires when at least one prep assignment is `NOT_DONE`, or the scored prep average is < 5.0 (`average10` keeps two
  decimals, so 4.95 never displays as 5.0). `values.reason`: `NOT_DONE`, `LOW_AVERAGE`, `NOT_DONE_AND_LOW`.
- Evidence: the midterm (`ASSIGNMENT`, status `UPCOMING`), every not-done prep (`ASSIGNMENT`, `NOT_DONE`) and every
  scored prep representative with its 10-point score. New evidence (work done) gives a new fingerprint.

### Evidence entry (insights@4 additions)

`{ kind, id, at, label?, score10?, assessmentType?, status? }`; kind adds `ASSIGNMENT`. Display fields are never part
of the fingerprint (ids only).
