---
id: SPEC-teacher-ai-evidence-insights
status: approved-g5-2026-11-06
companions:
  - implementation-contract.md
  - insight-rules.md
  - tickets.md
  - ../spec-b2-teacher-evidence/SPEC.md
  - ../spec-teacher-ai-authoring/teacher-ai-roadmap.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-04 — Teacher Sees Explainable Learning-Evidence Consistency Insights

## Why

Teachers want to know whether a result reflects what a student can actually do. That means spotting an unusual score change, heavy dependence on hints, or mastery that conflicts across evidence types. Doing this without labelling students or guessing "true ability" is what separates useful support from harm. B2 already gives teachers deterministic support flags that trace to evidence. TAI-04 adds a second family of versioned, rule-based insights on the same evidence, so the teacher gets a reason to look, never a verdict.

## Capabilities

- **CAP-1 — Class insight overview:** the owning teacher lists current insights for an active class and for one student. **Success:** every insight shows `ruleCode`, `ruleVersion`, `status`, a neutral Vietnamese message, the thresholds used and the evidence IDs. Each evidence ID opens the existing B2 evidence detail.
- **CAP-2 — First-wave rules:** `INSUFFICIENT_EVIDENCE`, `SCORE_CHANGE_UNUSUAL`, `HIGH_HINT_DEPENDENCE` (including the `SUDDEN_UNAIDED_PASS` pattern) and `OBJECTIVE_MASTERY_INCONSISTENT`, as defined in `insight-rules.md`. **Success:** boundary fixtures decide each rule exactly at and around its threshold.
- **CAP-3 — Acknowledge or dismiss:** the teacher acknowledges or dismisses one insight with an optional note. **Success:** the record is append-only and keyed by insight fingerprint. The insight leaves the open list, and new evidence produces a new fingerprint, so a dismissal never hides it.
- **CAP-4 — Replay:** any insight can be recomputed as of a past instant with its `ruleVersion`. **Success:** replaying a fingerprint against evidence created up to the acknowledgement time reproduces the same evidence IDs and thresholds.
- **CAP-5 — Second-wave rules:** `MCQ_EXPLANATION_MISMATCH` and `SIMULATION_EXPLANATION_MISMATCH` once TAI-02 ships, and `SUBMISSION_SIMILARITY_HIGH` once TAI-03 submission similarity ships. **Success:** these rules read only teacher-final assessment records and deterministic similarity output, never AI suggestions.

## Constraints

- Insights are computed on read by pure functions under an explicit `ruleVersion` (`insights@1`) over immutable evidence. Only teacher acknowledgements persist. A rule change requires a new `ruleVersion`, and the old version stays callable for replay.
- Scope matches B2. Only evidence whose `assignmentId` belongs to the class counts, and only for currently approved members. Free practice, other classes and removed students are excluded.
- Visible only to the owning teacher. A missing or not-owned class returns the same 403 `CLASS_ACCESS_DENIED` as B2 (`ownedClass`); a missing student or fingerprint inside an owned class returns 404, as B2 evidence detail does. Never shown to students or parents, and never included in parent reports, exports or notifications.
- Insights never change score, verdict, progress, gates, overrides or B2 flags.
- No LLM or provider call. A future model may run only in shadow mode, under a separate spec.
- No ranking. Lists are ordered by student display name, then rule code. There is no severity score, insight count leaderboard or "weak/strong" label. Rule codes and messages never say cheating, ability or talent.
- Read latency follows PRD QR-09 (p95 500 ms) on the B2 workload of 40 students × 6 steps.

## Non-goals

- Predicting a "true ability" score, grade forecasts, cheating detection, student ranking or risk scores.
- AI-generated interventions or messages to students or parents.
- Persisting insight snapshots or recomputing insights in background jobs.
- Model-based insights, including shadow mode.

## Success signal

On seeded fixtures, the owner teacher of `class-pilot-a` sees `SCORE_CHANGE_UNUSUAL` for a student whose fourth quiz attempt is 30 points above a stable three-attempt baseline, opens each linked attempt, and dismisses the insight. Adding a fifth attempt produces a new insight. The outsider teacher, the student and the linked parent are all denied. No score or progress value changes.

## Assumptions

- Quiz pass follows the existing schema-bound threshold of 50. A practical counts as passing only with verdict `passed`.
- The `insights@1` thresholds in `insight-rules.md` are product defaults pending approval.

## Open Questions

- Should `SUDDEN_UNAIDED_PASS` be shown in the pilot, given that a teacher can read it as suspicion of the student?
- Does the product owner accept the `SCORE_CHANGE_UNUSUAL` thresholds (|Δ| ≥ max(2σ, 25 points), baseline ≥ 3)?
