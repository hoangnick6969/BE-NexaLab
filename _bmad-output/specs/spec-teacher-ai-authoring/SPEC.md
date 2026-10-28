---
id: SPEC-teacher-ai-authoring
status: draft-awaiting-tai-t0-scope-approval
companions:
  - implementation-contract.md
  - job-runtime-and-failure-modes.md
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
- **CAP-4 — Duplicate detection:** each item is checked against the class's non-archived resources and the rest of the batch. **Success:** `EXACT_DUPLICATE` cannot be accepted unedited. `NEAR_DUPLICATE` warns only. Fixture tests cover both thresholds.
- **CAP-5 — Per-item human decision and materialization:** the teacher accepts, edits or rejects every item, then materializes the accepted items into a normal `ClassResource` DRAFT. **Success:** materialization requires all items decided and at least one accepted. It runs through the existing content contract, happens once per job and links the job to the resource. Students see nothing until the existing publish step.
- **CAP-6 — Bounded usage:** per-teacher daily quota, concurrency cap and per-job token usage are enforced and recorded. **Success:** over-limit requests return `AI_QUOTA_EXCEEDED`. `GET /me/ai-quota` reports limit, used count and reset time from stored jobs.

## Constraints

- AI output never writes, publishes or edits a `ClassResource` directly. It never touches attempts, submissions, scores, verdicts, progress or assignments. Materialization calls `normalizeResourceContent` and creates a DRAFT, so the `ClassResource` schema and content contract stay unchanged.
- No provider call runs inside a database transaction. Job creation, the provider call and result persistence are separate steps (`job-runtime-and-failure-modes.md`).
- This slice sends no student data to the provider. Input is limited to lesson text, outcome statements and the teacher instruction.
- The pilot provider is the Gemini API free tier. Under its unpaid terms, Google may use submitted content to improve its products, so only non-personal content may be sent. TAI-01 qualifies. Any later slice that sends student data needs a paid tier or another provider.
- Free-tier rate limits are low and can change. The runner spaces provider calls (`AI_PROVIDER_MIN_INTERVAL_MS`) and treats provider quota exhaustion as `PROVIDER_UNAVAILABLE`, without charging the teacher's quota.
- Only the owning teacher of the class can use AI routes. Missing and unauthorized resources return the same 404, matching existing Class Space denial. Students, parents and outsider teachers have no AI route.
- Output must parse against the pinned output schema. Free text is never stored as an item. The raw provider response is not persisted.
- Prompt templates live in code with explicit versions. A pinned-digest test fails when template text changes without a version bump.
- Item types are limited to what the existing contract supports: single-choice questions with 2–6 options and study cards. Multi-select, short-answer, essay and simulation items are excluded.
- Quota defaults: 20 jobs per teacher per rolling 24 h, 2 concurrent active jobs, and a maximum of 20 questions or 30 cards per job. All are env-configurable.
- The golden-evaluation reviewer is the supervising lecturer. Release thresholds are fixed in `validation-rules.md`.
- No new infrastructure (queue, Redis, vector store). The runner uses PostgreSQL lease claims and must stay correct with more than one API instance.

## Non-goals

- Essay or short-answer grading, rubric scoring, submission similarity, learning-evidence or "true ability" prediction, cheating verdicts, student ranking. These are future specs in `teacher-ai-roadmap.md`.
- Credits, pricing, payment or billing. This slice logs token usage only.
- AI-generated simulation code or Lab configuration.
- Fine-tuning or training on teacher or student data. Retrieval from sources outside the selected lesson.
- Automatic recomputation of numeric answers. Numeric items are flagged for teacher review instead.
- Student-facing AI changes. The existing tutor hint path is untouched.

## Success signal

On `class-pilot-a`, the owner teacher generates a 10-question TEST from `lesson-circuit`, sees validation flags, edits one item, rejects one, materializes, publishes and assigns through the existing flow. A student then takes the test with server scoring unchanged. The outsider teacher, a student and a replayed request are each denied or replayed per contract. On the golden set of at least 60 TEST items from the seeded KHTN lessons, the supervising lecturer records answer-key error ≤ 3%, scientific-accuracy error ≤ 5%, and at least 70% accepted or accepted-after-edit.

## Assumptions

- The Gemini adapter reads `GEMINI_API_KEY` / `GEMINI_MODEL`, with the model id set by env rather than code. A deterministic fake adapter is allowed only outside production. The existing Anthropic tutor-hint adapter in `labs` is untouched.
- STUDY_QUIZ materialization drops `correctOption`, as the current STUDY_QUIZ contract does. AI still produces it so the teacher can judge correctness during review.
- KHTN is one integrated subject. "Physics / Chemistry / Biology" maps to the lesson's `domain` strand (ENERGY / MATTER / LIVING).

## Open Questions

- PRD §10 item 17 and the ARCHITECTURE-SPINE Deferred section exclude AI from the current delivery. Does the product owner approve activating FR-21 as a new increment (TAI-T0) before implementation?
