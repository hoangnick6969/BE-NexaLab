# TAI-02 — Ordered Vertical Tickets

## TAI2-T0 — Provider, legal and scope gate (documentation and config)

- The product owner records provider/legal approval for the under-18 context, data-use/DPA terms, data minimization, age-appropriate legal basis/notice/consent, cross-border handling, and retention/deletion. Review against current law, including Law 91/2025/QH15, Decree 356/2025/NĐ-CP and Decree 330/2026/NĐ-CP; do not reuse the obsolete Decree 13/2023 reference as the current basis. The PRD gains a functional requirement for written tasks, and the spine gains an AD for teacher-only official grades.
- Add the `AI_ASSESSMENT_ENABLED` gate flag (default false) and `AI_ASSESSMENT_MODE` (`off|shadow|assist`, default `off`).
- **Accept when:** the decisions above are appended to `.memlog.md`, the open questions are answered or explicitly deferred, and the gate flag cannot be enabled without recorded provider/legal approval for the under-18 context (boot check). Paid/free tier alone is not treated as eligibility approval.
- **Blocks:** TAI2-T4..T7. Does not block T1..T3.

## TAI2-T1 — WRITTEN_TASK kind and rubric content contract

- Add the enum value, the `normalizeResourceContent` branch, the student view stripping anchors, and the CSV import rejection. Draft, publish, revise and archive reuse the existing lifecycle. The FE rubric editor is included.
- **Accept when:** fixtures cover every `RUBRIC_INVALID` rule (anchor order, first 0 and last = `maxPoints`, code uniqueness, limits); a published version is immutable and revise creates version n+1; students never receive anchors; DECK/STUDY_QUIZ/TEST tests remain green.

## TAI2-T2 — Assign and submit written tasks

- Migration: `gradingMode`, nullable `score`/`correctCount` with CHECK, backfill and preflight. Assignment `contentType: "written"` follows the test rules. A written branch in `POST assignments/:id/submissions`. An `autoScore` helper guards the TEST paths.
- **Accept when:** the migration preflight reports zero null AUTO rows; the I3 integration suite (`test:i3`) passes unchanged; written fixtures cover on-time, late without reason (400), late with reason, archive closes submission, `REJECT_ZERO`, extension makes pending work gradeable, and resubmission becomes current; outsider and non-target students are denied.
- **Depends on:** TAI2-T1.

## TAI2-T3 — Teacher rubric grading and role views

- `WrittenGradeDecision` table, grade route (`MANUAL` only at this stage), written-status board, submission detail, and student/parent statuses `AWAITING_GRADE` / `GRADED`.
- **Accept when:** a grade on a late-pending or rejected submission returns 409; points boundary fixtures pass; regrading appends and the latest decision is shown; the student sees score and feedback and never another student's data; the parent sees status only; the B2 board and subject rollup treat the assignment per the resolved pass-threshold question (or as achieved-on-grade if deferred).
- **Depends on:** TAI2-T2.

## TAI2-T4 — ASSESS_SUBMISSION job purpose

- Request route with skip reasons; redaction, injection detector and snapshot; `assessment-suggestion@1` prompt with pinned digest; verification (`VA-01..05`); `AiAssessmentSuggestion` persistence; `AiJob.submissionId` FK; separate daily limit.
- **Accept when:** the fixture suite in `assessment-validation-and-evaluation.md` passes; a provider spy proves that no student identity string and no suppressed response is ever sent; policy-ineligible and non-gradeable submissions are skipped; if the approved policy requires consent, missing-consent submissions are also skipped; retries and replays create one job per submission and prompt version; the TAI-01 runner, lease and failure tests pass for the new purpose.
- **Depends on:** TAI2-T0, TAI2-T3, TAI-01 shipped.

## TAI2-T5 — Shadow mode and evaluation report

- In shadow mode, suggestions are hidden on all teacher routes. Admin evaluation endpoint and report generator.
- **Accept when:** in shadow mode, teacher responses contain no suggestion fields (contract test); the report metrics match a hand-computed fixture of 10 submissions; the lecturer run of ≥ 100 responses is recorded in `tai-02-shadow-evaluation.md` with a pass/fail verdict.
- **Depends on:** TAI2-T4.

## TAI2-T6 — Assisted grading

- Suggestion panel with evidence highlighting through `offsetMap`; `ACCEPTED_AI` / `EDITED_AI` / `REJECTED_AI` grade kinds with `SUGGESTION_MISMATCH` guards; bulk request UI.
- **Accept when:** `ACCEPTED_AI` is only possible on `VALID` and stores exactly the suggested points; edits store teacher points with the reference; the student view is identical whether or not AI was used; assist mode cannot be enabled until T5 records a pass for the active prompt version.
- **Depends on:** TAI2-T5 pass.

## TAI2-T7 — End-to-end journey and negatives

- The SPEC success-signal journey on seeded fixtures, plus outsider teacher, student and parent probes, an injection response, a policy-ineligible submission (and missing consent if required by the approved policy), a provider outage (fake), and a replayed request.
- **Accept when:** a real API/database/browser journey passes; the grade audit trail reconciles; no AI artifact is reachable from student or parent routes.
- **Depends on:** TAI2-T6.
