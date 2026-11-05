---
id: SPEC-teacher-ai-essay-assessment
status: draft-blocked-on-tai2-t0-provider-and-legal-gate
companions:
  - implementation-contract.md
  - assessment-validation-and-evaluation.md
  - prompt-spec.md
  - tickets.md
  - ../spec-teacher-ai-authoring/job-runtime-and-failure-modes.md
  - ../spec-teacher-ai-authoring/provider-and-data-flow.md
  - ../spec-teacher-ai-authoring/teacher-ai-roadmap.md
  - ../spec-open-learning-catalog/class-space-assignment-contract.md
sources:
  - ../../../docs/product/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-02 — Written Tasks with Rubric Grading and AI Suggestions

## Why

Today Class Space can only test recall through server-scored single-choice tests. Teachers cannot assign explanation tasks ("Giải thích vì sao…"), and grading free text by hand across 40 students is slow and inconsistent. This spec adds a written task with a versioned rubric, graded by the teacher. An AI rubric assistant comes on top of that: it suggests points per criterion with quoted evidence. The teacher's grade stays the only official score, and student text is sent to a provider only after legal and provider gates pass.

## Capabilities

- **CAP-1 — Written task authoring:** the owning teacher creates, publishes and revises a `WRITTEN_TASK` resource with 1–5 prompts, each carrying a rubric (criteria, max points, anchors). **Success:** invalid rubrics are rejected with field-level errors, and published versions are immutable like other `ClassResource` kinds.
- **CAP-2 — Assign and submit:** the teacher assigns a published written task. Students submit text answers under the existing target snapshot, due date, late reason, `REJECT_ZERO` and deadline-revision rules. **Success:** written submissions follow every I3 lifecycle rule, and TEST assignments and their history are byte-for-byte unchanged.
- **CAP-3 — Teacher rubric grading:** the owning teacher grades each criterion, producing an append-only grade decision. **Success:** students see only the latest teacher grade and feedback. Ungraded work shows "awaiting grade". Late-pending work cannot be graded, and rejected-late work stays zero.
- **CAP-4 — AI rubric suggestion:** the teacher requests suggestions for gradeable, AI-eligible submissions. **Success:** only minimized/redacted text eligible under the approved legal and provider policy reaches the provider (consent is required where that approved path requires it). Each criterion suggestion is either verified (bounded points and verbatim evidence) or invalidated with a reason. Suspected prompt injection suppresses the suggestion.
- **CAP-5 — Shadow evaluation:** in shadow mode suggestions are stored but hidden from grading. **Success:** an evaluation report computes agreement with the lecturer's blind grades for a pinned prompt version and decides the release gate.
- **CAP-6 — Assisted grading:** in assist mode the teacher accepts, edits or rejects a suggestion, which becomes a grade decision. **Success:** every final score has a teacher actor and audit. AI never writes, finalizes or publishes a grade.

## Constraints

- TEST semantics do not change. Written work uses a new kind `WRITTEN_TASK` and assignment `contentType = "written"`, and reuses `AssignmentSubmission`, `AssignmentDeadlineRevision` and `LateDecision`.
- `AssignmentSubmission` gains `gradingMode` (`AUTO` | `TEACHER`). `score` and `correctCount` become nullable, and a database check keeps them non-null for `AUTO`. All existing rows are backfilled `AUTO`.
- The official score is the latest `WrittenGradeDecision` from the owning teacher. AI suggestions, shadow data and evaluation reports never enter student, parent, rollup or notification read models.
- AI tickets (TAI2-T4..T7) are blocked until TAI2-T0 records all of the following: a provider whose terms permit use in NexaLab's under-18 context and whose data-use/DPA terms are approved; the legal basis, age-specific notices/consents and cross-border handling under current law; a PRD amendment for written tasks; and TAI-01 shipped. The free Gemini tier is not acceptable for student text, and paid tier alone does not establish under-18 eligibility.
- Existing `ParentConsent` may support an approved consent-based policy, but it is not by itself proof of a sufficient legal basis for every student or use. Determine age verification, the required child/representative participation, exceptions and whether school authority applies with counsel before defining eligibility. Keep unapproved submissions manual-only; revise the proposed `NO_CONSENT` skip reason if the approved legal path is not per-student consent.
- Provider input is exactly the `AssessPromptPayload` in `prompt-spec.md`: the lesson title (as `topic`), each prompt's text, its optional teacher-only `referenceAnswer`, the rubric criteria with anchors, and the redacted response. TAI-03 similarity results are never sent. Student id, name, username, email, phone, enrollment and class name never leave the server. `referenceAnswer` is teacher-authored content and is never shown to students or parents.
- Redaction of known identifiers is not a guarantee against indirect identification or sensitive details in free text. Provider payload, retention, deletion and cross-border transfer require a documented review; do not enable AI suggestions until that review is complete.
- Model output is never silently corrected. Out-of-range points or unverifiable evidence invalidate that criterion suggestion.
- The assessment runs on the TAI-01 job runtime (purpose `ASSESS_SUBMISSION`) with its own daily limit. There is no second runner.

## Non-goals

- AI-finalized or auto-published scores. Bulk "accept all suggestions".
- Plagiarism or cheating verdicts (TAI-03 provides similarity evidence only).
- LLM auto-grading of short answers or of TEST questions.
- AI-drafted written tasks or rubrics (a later extension of the TAI-01 output schema).
- Showing AI text, AI scores or confidence numbers to students or parents.
- Training or fine-tuning on student responses.

## Success signal

On `class-pilot-a` the owner teacher publishes a two-prompt written task with a rubric and assigns it. `student.active` submits on time, and a second student submits late with a reason. The teacher grades the on-time submission manually. Then, with assist mode on, the teacher requests a suggestion, edits one criterion and saves. The student sees only the teacher's grade. An injection-laden response is suppressed, and a submission ineligible under the approved legal/provider policy stays manual-only. In shadow mode, ≥ 100 responses graded blind by the supervising lecturer meet the evaluation thresholds before assist mode is enabled.

## Implementation gate

- TAI2-T1..T3 (written tasks with manual grading) do not depend on the AI gates and can ship first. TAI2-T4..T7 require TAI2-T0.

## Assumptions

- Evaluation gate: ≥ 100 responses across ≥ 3 written tasks; total score on a 10-point scale with MAE ≤ 1.0 and ≥ 80% within ±1; ≥ 95% of AI evidence quotes verifiable.
- Limits: 1–5 prompts per task, prompt ≤ 2000 chars, per-prompt `maxChars` 100–5000, 1–6 criteria per prompt, `maxPoints` 1–10 in half points.
- Daily assessment limit is 200 submissions per teacher per rolling 24 h (`AI_DAILY_ASSESSMENT_LIMIT`).

## Open Questions

- Does a `WRITTEN_TASK` need a pass threshold for the subject rollup, or does any teacher grade count as achieved?
- Which provider explicitly permits this use in a service directed to or likely to be accessed by under-18s, and what data-use/DPA terms apply?
- What legal basis and age-specific consent/notice path applies to each student, and how will cross-border transfer and retention/deletion be handled? Do not assume the only choices are parental consent or school agreement.
- May AI draft the student-facing feedback text? In the current spec, rationale is teacher-only and feedback is written by the teacher.
