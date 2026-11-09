# TAI-04 — Ordered Vertical Tickets

## TAI4-T1 — Insight rule engine `insights@1`

- Pure functions for `INSUFFICIENT_EVIDENCE`, `SCORE_CHANGE_UNUSUAL`, `HIGH_HINT_DEPENDENCE` (plus `SUDDEN_UNAIDED_PASS`) and `OBJECTIVE_MASTERY_INCONSISTENT`. Also the fingerprint function, message templates and a ruleVersion registry, per `insight-rules.md`.
- **Accept when:** every boundary fixture in `insight-rules.md` passes; the forbidden-vocabulary test passes; identical input always yields identical fingerprints.
- **Depends on:** B2 (done). PO approval of thresholds is recorded in `.memlog.md`.

## TAI4-T2 — Evidence loader and insight read routes

- Class-scoped loader for `QUIZ` / `TEST` / `PRACTICAL` evidence (assignment-scoped, approved members only, late-pending and reject-zero excluded). Also the `GET classes/:classId/insights` and per-student routes.
- **Accept when:** an outsider teacher, student and parent are denied with the B2 denial contract (403 for the class or role, 404 for a missing student/fingerprint); removed students and free practice are excluded; values reconcile to source rows; p95 is measured on the B2 workload.
- **Depends on:** TAI4-T1.

## TAI4-T3 — Acknowledgements and replay

- `InsightAcknowledgement` migration, acknowledgement route with idempotency and audit, and replay route.
- **Accept when:** an acknowledged insight leaves the `open` list; a new attempt produces a new open insight; `INSIGHT_STALE` fires on a superseded fingerprint; replay reproduces evidence IDs; a replayed key returns the same row.
- **Depends on:** TAI4-T2.

## TAI4-T4 — Teacher insight UX

- Insights tab and evidence-sheet section, per the frontend contract.
- **Accept when:** a Playwright journey covers view → drill to evidence → dismiss → new evidence reappears; no student or parent bundle imports insight code; lists show no ordering by insight count.
- **Depends on:** TAI4-T2 (read) and TAI4-T3 (actions).

## TAI4-T5 — Explanation-mismatch rules (`insights@3`)

- `MCQ_EXPLANATION_MISMATCH` and `SIMULATION_EXPLANATION_MISMATCH` over TAI-02 teacher-final assessments, with thresholds fixed in `insight-rules.md` first.
- **Accept when:** boundary fixtures pass; AI `suggestedScore` is never read (test with a suggestion-only fixture); `insights@1` replay still reproduces old fingerprints.
- **Depends on:** TAI-02 shipped (teacher-final criterion scores available), TAI4-T3.

## TAI4-T6 — Similarity-backed insight

- `SUBMISSION_SIMILARITY_HIGH` from TAI-03 submission-similarity matches pending teacher review.
- **Accept when:** a reviewed match removes the insight; cross-assignment matches never appear; wording contains no cheating vocabulary.
- **Depends on:** TAI-03 submission similarity shipped, TAI4-T3.

## TAI4-T7 — Journey, privacy and performance proof

- Run the SPEC success-signal journey on seeded fixtures against a real API and database. Re-run it after T5/T6 when they land.
- **Accept when:** the journey passes; scores, progress and B2 flags are byte-for-byte unchanged before and after; latency is recorded; pilot/production claims stay separate.
- **Depends on:** TAI4-T4.
