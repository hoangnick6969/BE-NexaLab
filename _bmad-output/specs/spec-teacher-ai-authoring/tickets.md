# TAI-01 — Ordered Vertical Tickets

## TAI-T0 — Activate FR-21 scope (documentation only)

- Product owner approves activating FR-21 as a new increment. Amend PRD §10 item 17 and the ARCHITECTURE-SPINE "Deferred" bullet so they point to this spec instead of excluding AI work. Add `AD-17 — Teacher AI is a versioned suggestion layer` summarizing the SPEC constraints.
- Already decided in `.memlog.md`: provider is the Gemini API free tier (model id set in `GEMINI_MODEL`), the golden reviewer is the supervising lecturer, and the quota and quality thresholds stay as specified.
- **Accept when:** PRD, spine and this SPEC no longer contradict each other, and the scope approval is recorded in `.memlog.md`.

## TAI-T1 — AI module, provider port and prompt versioning

- Create `src/modules/ai` (Nest module) with `AiProvider` port, Gemini adapter (JSON schema output, usage metadata), fake adapter, env config (`AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_RUNNER_ENABLED`, `AI_DAILY_JOB_LIMIT`, `AI_CONCURRENT_JOB_LIMIT`, `AI_PROVIDER_MIN_INTERVAL_MS`) with placeholders in `.env.example`, and `generate-resource@1` prompt with pinned-digest test. `labs/infrastructure/llm.ts` is not modified.
- Boot guard: fake provider forbidden in production; missing config makes create return 503 `AI_PROVIDER_NOT_CONFIGURED`.
- **Accept when:** adapter error mapping is unit-tested for 200/429/5xx/abort/4xx; the existing tutor hint tests still pass; changing prompt text without a version bump fails the test.

## TAI-T2 — Job schema, create/list/get/cancel, runner

- Migration for `AiJob`, `AiJobItem`, `AiItemDecision` and the enums (expand-only). Snapshot builder with deterministic passages and digest.
- Routes `POST/GET classes/:id/ai-jobs`, `GET …/:jobId`, `POST …/:jobId/cancel`, `GET /me/ai-quota` per contract. Quota under advisory lock in the create transaction.
- Runner with lease claim, conditional persist and sweeper per `job-runtime-and-failure-modes.md`.
- **Accept when:** integration tests (fake provider) cover replay of the same key, key reuse 409, outsider teacher 404, student 403, archived class 409, quota 20/21 and concurrency 2/3 boundaries, two concurrent creates at limit (only one passes), cancel during run discards the result, lease expiry requeues once then fails, and the persist-after-reclaim race writes items once.

## TAI-T3 — Output parsing and validation pipeline

- `resource-items@1` Zod schema and pure `validateItems` implementing structural drop rules and VW-01..VW-07 warnings, plus the duplicate corpus loader.
- **Accept when:** fixture suite in `validation-rules.md` passes, including the 0.84/0.85 trigram boundary and the diacritic-distinct case; zero valid items yields `FAILED OUTPUT_VALIDATION_FAILED`; partial validity stores `droppedItems` reasons.

## TAI-T4 — Item decisions and materialization

- Decision route (append-only, latest wins), EDITED re-validation, exact/near duplicate warnings without an acceptance guard; materialize route mapping to `normalizeResourceContent`, DRAFT creation, `materializedResourceId`, and audit, in one transaction.
- **Accept when:** materialize with undecided items returns 409; second materialize returns 409 (same key replays); created resource is DRAFT, passes the existing publish/revise/assign flow unchanged, and students cannot see it before publish; TEST answer key reaches the resource, STUDY_QUIZ drops it; `ClassResource` rows created without AI are byte-for-byte unaffected.

## TAI-T5 — Teacher AI workspace (FE)

- Teacher AI panel in owned Class Space resources: generate form with quota, status polling, failure/cancel states, review list with flags and per-item decisions, materialize dialog, stale-lesson warning, then navigation to the existing draft editor.
- **Accept when:** Playwright journey covers happy path, provider failure (fake), duplicate-warning acceptance, and reload mid-review (decisions persist); no student route renders AI data.

## TAI-T6 — Golden evaluation and end-to-end proof

- Run the golden evaluation with the real provider per `validation-rules.md`; record results in `_bmad-output/implementation-artifacts/tai-01-golden-evaluation.md`.
- Execute the SPEC success-signal journey on seeded fixtures (`class-pilot-a`, `lesson-circuit`, `teacher.outsider`, `student.active`).
- **Accept when:** thresholds pass with the pinned prompt version; journey passes against a real API/database; measured token usage per job is documented as input for TAI-05.
