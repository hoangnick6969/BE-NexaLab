---
id: SPEC-teacher-ai-authoring
status: approved
companions:
  - implementation-contract.md
  - job-runtime-and-failure-modes.md
  - provider-and-data-flow.md
  - validation-rules.md
  - teacher-ai-roadmap.md
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../spec-open-learning-catalog/class-space-assignment-contract.md
sources:
  - ../../../docs/product/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-01 — Teacher AI Drafts Grounded Class Space Content

## Why

Teachers spend most authoring time writing study cards, practice questions and tests that restate an existing lesson. FR-21 allows Teacher AI to produce structured drafts only, with a human reviewing and publishing. Class Space already has owned classes, immutable versioned `ClassResource` drafts, server-scored single-choice tests, idempotency and audit, so AI can enter as a suggestion layer in front of the existing authoring path. The only new source of truth is the teacher's per-item decision. This slice also builds the shared AI job runtime that later Teacher AI specs (`teacher-ai-roadmap.md`) reuse.

## Capabilities

- **CAP-1 — Grounded generation request:** the owning teacher requests a draft for one lesson of an owned, active class, choosing the target kind (`DECK`, `STUDY_QUIZ`, `TEST`), item count, optional outcome codes, difficulty and instruction. **Success:** invalid, unauthorized, over-quota or unconfigured requests are rejected with the documented code and create no job. A valid request creates exactly one job per `Idempotency-Key`.
- **CAP-2 — Asynchronous, replayable job:** the job runs outside the request against an immutable input snapshot, with pinned prompt and output-schema versions. **Success:** the teacher can poll status, failure code and usage. Retries, duplicate submits and runner restarts never create a second job, second item set or second provider charge for the same attempt.
- **CAP-3 — Deterministic validation before review:** every generated item passes the structural, grounding, safety and content rules in `validation-rules.md` before a teacher sees it. **Success:** failing items are dropped with reason codes. Surviving items carry warning flags. Zero surviving items fails the job with `OUTPUT_VALIDATION_FAILED`.
- **CAP-4 — Duplicate warnings:** each item is checked against the class's non-archived resources and the rest of the batch. **Success:** exact and near duplicates are warnings; the teacher may keep, edit or reject each item. No duplicate flag blocks acceptance or materialization.
- **CAP-5 — Per-item human decision and materialization:** the teacher accepts, edits or rejects every item, then materializes the accepted items into a normal `ClassResource` DRAFT. **Success:** materialization requires all items decided and at least one accepted. It runs through the existing content contract, happens once per job and links the job to the resource. Students see nothing until the existing publish step.
- **CAP-6 — Bounded usage:** per-teacher daily quota, concurrency cap and per-job token usage are enforced and recorded. **Success:** over-limit requests return `AI_QUOTA_EXCEEDED`. `GET /me/ai-quota` reports limit, used count and reset time from stored jobs.

## Constraints

- AI output never writes, publishes or edits a `ClassResource` directly. It never touches attempts, submissions, scores, verdicts, progress or assignments. Materialization calls `normalizeResourceContent` and creates a DRAFT, so the `ClassResource` schema and content contract stay unchanged.
- No provider call runs inside a database transaction. Job creation, the provider call and result persistence are separate steps (`job-runtime-and-failure-modes.md`).
- The request does not query or serialize student records; its intended inputs are lesson text, outcome statements and teacher instruction. Those text fields may still contain personal or confidential data, so they are not guaranteed non-personal until the input safeguards in `provider-and-data-flow.md` are approved.
- The planned pilot adapter is Gemini (`GEMINI_API_KEY` / `GEMINI_MODEL`), but provider selection is not approved for live use. Google's current Gemini API terms include an age-related restriction for services directed to or likely to be accessed by people under 18. NexaLab's child-facing context requires written provider/legal review before any API call, including TAI-01; a paid tier alone must not be assumed to resolve this restriction. The free tier also allows submitted content to be used to improve Google products, so it must not receive personal data. See `provider-and-data-flow.md`.
- The request does not contain student-record fields by design, but lesson passages and the teacher's free-text instruction can still contain personal or confidential material. The claim “no student data is sent” is not verified until the input policy, safeguards and provider eligibility are approved.
- If a provider-approved free-tier pilot is ever used, its rate limits may change. The planned runner spaces calls (`AI_PROVIDER_MIN_INTERVAL_MS`) and treats provider quota exhaustion as `PROVIDER_UNAVAILABLE`, without consuming the teacher's daily quota.
- Only the owning teacher of the class can use AI routes. A missing or not-owned class returns the same 403 `CLASS_ACCESS_DENIED` as existing Class Space routes (`ownedClass`); a missing job or item inside an owned class returns 404 `NOT_FOUND`; an inaccessible lesson returns 400 `LESSON_NOT_AVAILABLE` like `POST classes/:id/resources`. Students and parents are rejected by the role guard (403). Students, parents and outsider teachers have no AI route.
- Output must parse against the pinned output schema. Free text is never stored as an item. The raw provider response is not persisted.
- Prompt templates live in code with explicit versions. A pinned-digest test fails when template text changes without a version bump.
- Item types are limited to what the existing contract supports: single-choice questions with 2–6 options and study cards. Multi-select, short-answer, essay and simulation items are excluded.
- Quota is counted per teacher **and per `purpose`** (`GENERATE_RESOURCE` here), so later purposes such as TAI-02 `ASSESS_SUBMISSION` keep separate limits. Defaults: 20 jobs per teacher per rolling 24 h, 2 concurrent active jobs, and a maximum of 20 questions or 30 cards per job. All are env-configurable.
- The golden-evaluation reviewer is the supervising lecturer. Release thresholds are fixed in `validation-rules.md`.
- No new infrastructure (queue, Redis, vector store). The runner uses PostgreSQL lease claims and must stay correct with more than one API instance.

## Non-goals

- Essay or short-answer grading, rubric scoring, submission similarity, learning-evidence or "true ability" prediction, cheating verdicts, student ranking. These are future specs in `teacher-ai-roadmap.md`.
- Credits, pricing, payment or billing are outside the TAI-01 build scope, but launch sequencing is unresolved: the product direction says each AI action costs credits and shows an estimate before execution. Resolve whether TAI-01 is a restricted internal pilot without credits or whether the TAI-05 estimate/reserve ledger is a launch prerequisite.
- AI-generated simulation code or Lab configuration.
- Fine-tuning or training on teacher or student data. Retrieval from sources outside the selected lesson.
- Automatic recomputation of numeric answers. Numeric items are flagged for teacher review instead.
- Student-facing AI changes. The existing tutor hint path is untouched.

## Success signal

On `class-pilot-a`, the owner teacher generates a 10-question TEST from `lesson-circuit`, sees validation flags, edits one item, rejects one, materializes, publishes and assigns through the existing flow. A student then takes the test with server scoring unchanged. The outsider teacher, a student and a replayed request are each denied or replayed per contract. On the golden set of at least 60 TEST items from the seeded KHTN lessons, the supervising lecturer records answer-key error ≤ 3%, scientific-accuracy error ≤ 5%, and at least 70% accepted or accepted-after-edit.

## Assumptions

- The planned Gemini adapter reads `GEMINI_API_KEY` / `GEMINI_MODEL`, with the model id set by env rather than code. This is a specification, not an implemented or provider-approved integration. A deterministic fake adapter is allowed only outside production. The existing Anthropic tutor-hint adapter in `labs` is untouched.
- STUDY_QUIZ materialization drops `correctOption`, as the current STUDY_QUIZ contract does. AI still produces it so the teacher can judge correctness during review.
- KHTN is one integrated subject. "Physics / Chemistry / Biology" maps to the lesson's `domain` strand (ENERGY / MATTER / LIVING).

## Open Questions

- Scope is approved (TAI-T0, 2026-10-30): PRD FR-21 and §10 item 17 and the ARCHITECTURE-SPINE Deferred section point here, and AD-17 records the constraints. The questions below remain open under gate G-6 and block only live provider calls; T1–T5 are built and tested with the fake provider.
- Does Google confirm in writing that the planned Gemini API use is eligible when called by teachers inside an application directed to or likely to be accessed by under-18 students? If not, select a provider whose terms permit this context.
- Which safeguards prevent lesson passages or teacher instructions from carrying personal/confidential data to a provider, and who approves retention, deletion and cross-border processing?
- How is `sourceRefs` and AI-origin provenance retained after accepted items are materialized, published, edited, reused or removed under retention policy? Who confirms the source license permits provider processing?
- Is TAI-01 a limited provider-approved pilot with quota only, or must credit estimate/reserve be available before any teacher-facing launch?
