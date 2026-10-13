---
title: 'A3-T4 Verify quiz contract, privacy, and performance'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
baseline_commit: '1fd4d039a7ddc2ddbb7c2a0280471bc0f9b542b6'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-student-quiz-learning-gates/tickets.md'
  - '{project-root}/docs/product/prd.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A3 quiz delivery and attempts now work across the backend and student UI, but their generated API contract is incomplete, raw internal errors can reach server logs, and no real-dependency latency or browser evidence has been recorded.

**Approach:** Make the published quiz request, response, and error contract explicit and consistent with frontend types; prevent sensitive values from entering client responses or error logs; add repeatable timing and duplicate-delivery evidence against the seeded non-production API/database and real browser app.

## Boundaries & Constraints

**Always:** Keep answer keys server-only; preserve the accepted Zod request validation and `{ message }` error envelope; retain idempotent attempt semantics; compare timing to PRD pilot targets of 500 ms read p95 and 1,000 ms mutation p95; report static, automated, local runtime, and production evidence separately.

**Never:** Deploy, point test traffic at production, expose credentials or raw database errors, introduce a second quiz contract, or claim that local measurements establish production performance.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Quiz read | Authenticated eligible student reads sanitized quiz | OpenAPI fixture and FE types agree on IDs, prompts, and options; no key fields | Ineligible access uses documented error envelope without internal detail |
| Attempt submit | Exact answers and UUID idempotency key | Contract documents created attempt and reconciled pathway; repeated identical network request yields one stored attempt | Invalid payload and changed-key reuse match documented 400/409 envelopes |
| Unexpected server error | Internal exception contains sentinel password/token/DB URL/answer key | Client receives generic error and captured log contains no sentinel | Preserve status and stable `{ message }` shape |
| Performance run | Seeded development API/database; repeated read and submit requests | Record sample count and p50/p95 against 500/1,000 ms pilot targets | Mark target misses honestly; never extrapolate to production |

</frozen-after-approval>

## Code Map

- `src/pathway.ts` -- strict `quizAttemptRequestSchema` and inferred backend request type; reuse as the validation source.
- `src/routes.ts` -- quiz GET, attempt-history GET, and attempt POST; currently hand-built response shapes and missing explicit Swagger body/response schemas.
- `src/main.ts` -- Swagger document setup and `{ message }` exception filter; the 500 branch currently logs the raw exception.
- `scripts/integration.mjs` -- authenticated seeded API/database harness, cleanup, and concurrent duplicate submission coverage; extend it for latency, envelope/privacy probes, and sanitized operational evidence.
- `src/api.ts` and `src/pages.tsx` in `D:\coding\nexalab-fe` -- quiz request/response types and consumers; history and pathway currently use `any`.
- `tests/quiz-learning.spec.ts` -- UI behavior test with mocked assignment/pathway/quiz/attempt resources; retain as component-flow evidence and add a separate real-dependency browser path.
- `playwright.config.ts` -- uses `TEST_WEB` and Chromium/MS Edge; configure local seeded FE/API for actual E2E.
- `docs/product/prd.md` -- pilot API targets: read p95 500 ms, mutation p95 1,000 ms.

## Tasks & Acceptance

**Execution:**
- [x] Backend contract/OpenAPI fixture -- describe quiz delivery, history, attempt submission, success responses, and known error envelopes; prove answer fields are absent.
- [x] Frontend API types -- type quiz history, pathways, and error envelope to match the fixture; replace quiz-flow `any` values.
- [x] Error privacy -- remove raw exception logging and add tests that sentinel credentials, tokens, database URLs, and answer-key fields are not emitted to clients or logs.
- [x] Integration evidence -- add quiz read/history/submission timing samples and explicit concurrent duplicate persistence count to the real API/database run.
- [x] Real browser evidence -- exercise the seeded student quiz using live FE, API, seeded database, and browser; name each dependency and keep the mocked UI test identified as mocked.
- [x] Tracking -- record exact command outcomes, sample count and p50/p95, dependencies that ran, and production as unverified.

**Acceptance Criteria:**
- Given the accepted quiz endpoints, when the OpenAPI/contract fixture and TypeScript types are inspected or checked, then request, success, and error shapes agree and contain no correct-answer fields.
- Given a server failure containing secret sentinels, when the error filter handles it, then neither the client response nor application log contains a password, token, database URL, or answer key.
- Given repeated real quiz reads and submissions in the seeded development runtime, when timing is collected, then sample count and p50/p95 are recorded against the PRD targets without claiming production results.
- Given concurrent identical delivery of one attempt, when API/database state is read afterward, then one immutable attempt exists and callers reconcile to its ID.
- Given the browser test, when it is reported as E2E, then it actually uses the local FE, API, non-production database, and browser; otherwise report it as mocked/UI-only.

## Implementation Notes

Planning confirmed the PRD supplies measurable targets and the ticket supplies the envelope, privacy, and dependency requirements. There are no unresolved product choices. Testing writes only disposable seeded development records with cleanup; no migration, deployment, or production data mutation is in scope.

Implementation completed on 2026-10-13. The generated OpenAPI document matched the checked-in fixture, sentinel privacy tests passed, identical concurrent submissions persisted one attempt, and a real browser completed failed-attempt, retry, exact-50%-pass, direct-practical-open, and reload flows. Development timing missed the pilot targets: quiz read 20 samples p50 1424.3 ms / p95 2461.9 ms (target 500 ms); history read 20 samples p50 1711.4 ms / p95 2103.1 ms (target 500 ms); submit 5 samples p50 2518.5 ms / p95 2908.0 ms (target 1000 ms). These are development Supabase measurements, not production results.

## Verification

**Commands:**
- Backend `npm run lint`, `npm test`, `npm run build`, `npm run test:integration` -- record actual pass/fail and integration sample output.
- Frontend `npm run lint`, `npm run build`, and focused Playwright -- report mocked and real-dependency runs separately.
- Contract check -- compare generated Swagger path schemas with the checked-in accepted fixture and FE types.
- `git diff --check` -- report only if Git can execute it successfully.

**Recorded results:** backend lint/build passed; Vitest 41/41 passed; frontend lint/build passed; final Supabase development integration completed 98/98 assertions; focused live Playwright completed 1/1 using local Vite, live Nest API, seeded development database, and Microsoft Edge (Chromium). Production was not deployed or verified.

**Manual checks:**
- Inspect the final diff for answer-key fields, credential-bearing output, unrelated files, and accurate separation of local runtime from production evidence.
