# TAI-07 — Ordered Vertical Tickets

Each story is one vertical BE/FE/API/schema slice, implemented with `$bmad-build`, in this order. A story is done only
when its **Verify** steps pass and `sprint-status.yaml` (`development_status`, `teacher_ai_tracking.story_notes`) is
updated. Uncommitted work of other people in the tree is never reverted.

## TAI7-T1 — Assessment mode: graded types, timed sessions, retake, hidden results, 10-point scale

- **Scope:** `assessmentType` on test/written assignments; `AssessmentSession` (start/draft/submit/auto-submit,
  sweeper); `AssessmentRetakeGrant`; publish scores; result hiding on every student/parent read model; `toScale10`.
- **BE files:** `prisma/schema.prisma`; `prisma/migrations/20261115090000_tai07_assessment_mode/migration.sql`;
  new `src/modules/classes/application/assessment-policy.ts` (+ `.test.ts`), `assessment-session.ts`
  (+ `.test.ts`), `assessment-sweeper.ts`; `assignment-test-contract.ts` (partial scoring, hidden view, score10);
  `assignment-written-contract.ts` (empty responses for graded, hidden view, score10); `assignment-test-state.ts`
  (visibility); `assignments.service.ts` (assign input, retake, publish, status blocks); `classes/interface/assignments.controller.ts`;
  `classes/classes.module.ts`; `learning/interface/learning.controller.ts` (sessions, submit, detail, list);
  `reports/interface/class-progress.controller.ts`, `class-evidence.controller.ts` (`revealResults: true`);
  `notifications/application/notify.ts` (types).
- **FE files:** `features/classes/Assignments.tsx`, `TestAssignments.tsx`, `WrittenGrading.tsx`, `class-types.ts`;
  `features/assignments/AssignedTest.tsx`, `AssignedWritten.tsx`, `StudentAssignments.tsx`, new `assessment-timer.ts`
  (+ test).
- **Accept when:**
  - PRACTICE assignments (including every pre-existing row) behave exactly as before: I3 and TAI-02 unit suites pass
    unchanged.
  - A graded assignment cannot be created for lesson/lab (400 `ASSESSMENT_TYPE_UNSUPPORTED`) or with a duration outside
    the policy (400 `ASSESSMENT_DURATION_INVALID`); PRACTICE with a duration is 400.
  - Graded submit without `sessionId` is 400 `ASSESSMENT_SESSION_REQUIRED`; a second session after submission is 409
    `ASSESSMENT_ATTEMPT_USED`; a start at or after the due time is 409 `ASSESSMENT_CLOSED`; a submit or draft after
    `expiresAt + 30 s` is 409 `ASSESSMENT_SESSION_CLOSED`; a retake grant allows exactly one more session.
  - An expired open session is auto-submitted once from its draft (`autoSubmitted = true`, `submittedAt = expiresAt`),
    by both the lazy path and the sweeper, never twice.
  - Before publication, the student detail, list, submit response, parent child view and notifications contain no
    score, correctCount or grade for a graded assignment (key-scan test); the teacher status routes do; after
    publication the student sees score and `score10`.
  - `toScale10` boundary fixtures: 7/8 → 8.8, 1/3 → 3.3, 2/3 → 6.7, 17/40 → 4.3, 0.25/1 → 2.5 (half-up), max 0 → null.
- **Verify:** `npm run build`; `npx vitest run src/modules/classes src/modules/learning src/modules/reports`;
  `npx tsx scripts/route-manifest.ts src` (only the 4 new routes added); migration SQL reviewed for idempotency
  (guarded `npm run db:migrate` only on the isolated loopback DB); FE `npm run build` and `npx vitest run`.

## TAI7-T2 — Insights follow the teaching flow (`insights@4`)

- **Scope:** retire `insights@1 SCORE_CHANGE_UNUSUAL` from the active set (code untouched, replay keeps working);
  `insights@4` with `ASSESSMENT_TREND` (one representative score per assignment: graded = published/locked score,
  practice = first submission; compares different assignments only, same column family first; 10-point thresholds)
  and `READINESS_BEFORE_MIDTERM` (a MIDTERM_45M due within 7 days and a practice assignment of the same lesson not
  done or below 5.0).
- **BE files:** `reports/application/insights/index.ts` (retired rules), new `trend-rule.ts` (+ test), `insights-loader.ts`
  (assessment facts), `types.ts`, `messages.ts`, `insights-config.ts`; spec `insight-rules.md` (new section).
- **FE files:** `features/classes/insights-copy.ts`, `insights-view.ts`, `ClassInsights.tsx`.
- **Accept when:** 5 resubmissions of one practice test produce no trend insight; three REGULAR_15M columns near 8.0
  then a 4.0 produce `ASSESSMENT_TREND` DOWN with all four assignment ids as evidence; a midterm due in 3 days with an
  undone practice of its lesson produces `READINESS_BEFORE_MIDTERM`; previously acknowledged `insights@1` fingerprints
  replay unchanged; `SCORE_CHANGE_UNUSUAL` no longer appears in the open list; privacy scan passes.
- **Verify:** `npx vitest run src/modules/reports`; FE build + `insights-view.test.ts`.
- **Depends on:** TAI7-T1. Records the G-5 amendment (SCORE_CHANGE_UNUSUAL retired by the project owner 2026-11-15).

## TAI7-T3 — Class gradebook, AI quick-approve, similarity flags, lock and CSV export

- **Scope:** `GET …/gradebook` (rows in class-list order: student, status incl. **Vắng**, time used, MCQ/Lab 10-point,
  written AI suggestion / teacher final, similarity flag, total 10-point); `POST …/gradebook/quick-approve`
  (`ACCEPTED_AI` for VALID assist-mode suggestions through `assertGradeMatchesSuggestion`); `GradebookEntry` snapshot
  on `POST …/gradebook/lock`, `POST …/gradebook/unlock` (reason, new lock version); grade writes blocked while locked;
  `GET …/gradebook/export.csv` (UTF-8 BOM, `STT,Tên đăng nhập,Họ và tên,Điểm,Ghi chú`, comma decimal option).
- **BE files:** schema + migration `tai07_gradebook`; new `classes/application/gradebook.ts`, `gradebook-export.ts`
  (+ tests); `assignments.service.ts`, `assignments.controller.ts`; `similarity-runs.service.ts` read helper.
- **FE files:** new `features/classes/Gradebook.tsx`, `gradebook.css`; `teacher-ai-api.ts`; `Assignments.tsx` entry;
  `WrittenGrading.tsx` / `WrittenAiSuggestion.tsx` / `WrittenSimilarity.tsx` as drawers.
- **Accept when:** absent students show `Vắng` with no score; quick-approve writes one `ACCEPTED_AI` per VALID
  suggestion and skips PARTIAL/SUPPRESSED with a reason list; a grade after lock is 409 `GRADEBOOK_LOCKED`; the CSV
  starts with BOM, follows class-list order and round-trips Vietnamese names; outsider 403, student 403.
- **Depends on:** TAI7-T1.

## TAI7-T4 — Composite EXAM (MCQ + written + lab item in one session)

- **Scope:** `ClassResourceKind.EXAM`, `contentType: "exam"`, `GradingMode.MIXED`; `exam-contract.ts` (sections sum to
  10, rubric reuses the TAI-02 criterion schema, `cognitiveLevel` per item, student allowlist projection); exam submit
  (MCQ auto, lab = section points when a `passed` attempt exists inside the session, written graded by the teacher via
  TAI-02 grade route); AI assessment and similarity read the written part; gradebook columns filled.
- **Accept when:** an EXAM whose sections do not sum to 10 is 400 `EXAM_POINTS_INVALID`; the student projection has no
  answer key, anchors or reference answer (key-scan); total = MCQ + lab + written on raw points then `toScale10`;
  TEST/WRITTEN_TASK suites pass unchanged.
- **Depends on:** TAI7-T1, TAI7-T3.

## TAI7-T5 — AI paper and marking scheme by cognitive matrix (`GENERATE_ASSESSMENT`)

- **Scope (as built):** purpose `GENERATE_ASSESSMENT`, prompt `generate-assessment@1` (pinned digest), schema
  `assessment-items@1`. The server turns the teacher's matrix (Nhận biết / Thông hiểu / Vận dụng) and section counts into a
  blueprint of slots with fixed levels and point budgets; the model only writes content for each slot; points are allocated
  by the server so the paper is exactly 10,0; the result is gated through `normalizeExam`. The teacher picks the Lab (the
  model never does). Credits/quota per purpose. No materialize: the single job item is the draft, which the teacher loads
  into the EXAM editor and saves through the normal resources route. FE: "AI Gợi ý đề & biểu điểm" in the EXAM creation form.
- **Accept when:**
  - the fake-provider paper for a 15-minute (6 MCQ + 1 written) and a 45-minute (10 MCQ + 2 written + Lab) request totals
    exactly 10,0 (MCQ + Lab + rubric points), meets the requested matrix exactly, and `normalizeExam` accepts it;
  - a slot that fails checks (unsafe text, answer key, options, sources, rubric) is dropped with a reason code, the survivors
    are re-allocated to 10,0 and the teacher is warned (`SLOTS_DROPPED`, `MATRIX_DRIFT`); fewer than two surviving sections
    fails `OUTPUT_VALIDATION_FAILED`;
  - a rubric whose criteria do not add up to the question's budget is fitted on the half-point grid and flagged
    (`RUBRIC_RESCALED`), never stored wrong;
  - a Lab that is not eligible (unpublished, revoked, wrong release or challenge) is 400 `EXAM_LAB_UNAVAILABLE`;
  - item decisions and materialize are refused for this purpose; no `ClassResource` exists until the teacher saves;
  - quota per purpose, owner-only routes, credits reserve/settle (per surviving slot)/refund as for the other purposes;
  - the prompt digest is pinned.
- **Depends on:** TAI7-T4, TAI-01 runtime, TAI-05 credits.
