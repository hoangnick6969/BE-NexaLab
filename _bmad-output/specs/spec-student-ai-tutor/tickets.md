# SAI-01 — Ordered Vertical Tickets

## SAI-T0 — Activate FR-22 scope (documentation only)

_Status: done 2026-11-08 (PO approval)._

- Product owner approves activating FR-22 as increment SAI. Amend PRD §10 item 17 and the ARCHITECTURE-SPINE "Deferred" bullet so they point to this spec for student hints. Add `AD-18 — Student AI is an advisory, versioned hint layer` summarizing the SPEC constraints. Reconcile FE `docs/design/08-STUDENT-P0-UX-DEFINITION.md` with the existing Lab hint button: either keep the rules-only hint as P0 or hide it behind a flag.
- Record the answers to the SPEC open questions (passed-attempt behavior, SG-2 provider tier and legal basis) in `.memlog.md`.
- **Accept when:** PRD, spine, FE UX definition and this SPEC no longer contradict each other, and the approval is recorded.

## SAI1-T1 — Versioned rules, escalation and eligibility (rules-only)

_Status: review._

- Extract `tutor-rules@1` with `a`/`b` variants, `normalizeLabState`, `labDigest` and the escalation function into `labs/application`. Add `HINT_NOT_NEEDED` and `HINT_NOT_LATEST_ATTEMPT`. Run an expand-only migration for the new `HintLog` columns and write them for every hint.
- The provider path is unchanged in this ticket except for passing `provider` through to the new column.
- **Accept when:** all `hint-rules.md` escalation and eligibility fixtures pass; the pinned digest test fails on a text change without a version bump; existing labs and progress tests still pass; verdict, score and progress are unchanged by hints (assertion test).
- **Depends on:** SAI-T0.

## SAI1-T2 — Provider port, payload allowlist, guard and kill switch

_Status: review._

- `StudentTutorProvider` port, `anthropic` adapter (refactor of `llm.ts`) and `fake` adapter (boot fails if `fake` is used in production). Add `STUDENT_AI_LLM_ENABLED`, `STUDENT_AI_PROVIDER_TIMEOUT_MS` and `tutor-observation@1` prompt with pinned digest. Apply the guard rules and `fallbackReason`. Update `.env.example` placeholders.
- **Accept when:** payload key test passes; adapter maps 200/429/5xx/abort/invalid JSON to the right fallback; each guard rule has a rejecting fixture; kill switch off yields `DISABLED`; no provider call happens inside a transaction (spy test).
- **Depends on:** SAI1-T1.

## SAI1-T3 — Cache, DB rate window and provider budget

_Status: review._

- `HintObservationCache` migration and read/write; a rolling 10-minute request window counted from `HintLog` with `retryAfterSeconds`; a 24-hour provider budget falling back to rules.
- **Accept when:** integration boundaries 8/9 and 20/21 pass; a cache hit across two students makes zero provider calls (fake adapter counter); expired entries are ignored; two API instances (two Nest apps on one DB in test) respect the same window.
- **Depends on:** SAI1-T2.

## SAI1-T4 — Read-side narrowing and API contract

_Status: review._

- Response shape per contract; Zod and OpenAPI fixture; `GET tutor/status` update. Narrow teacher class-progress and evidence hint selects (no `contextSnapshot`). Add a parent no-hint-fields assertion.
- **Accept when:** OpenAPI fixture test passes; teacher and parent route snapshots contain no forbidden fields; FE types compile against the new contract.
- **Depends on:** SAI1-T1.

## SAI1-T5 — Student Lab hint UX

_Status: review._

- `Lab.tsx`: same-level copy when `escalated: false` ("Em chạy lại với cùng mạch nên gợi ý vẫn ở mức này — thử thay đổi rồi chạy lại"), a 429 countdown from `retryAfterSeconds`, `HINT_NOT_NEEDED` copy, and the AI chip for `anthropic` or `cache`. Use vi and en strings in the existing dictionary.
- **Accept when:** Playwright runs the SPEC success-signal journey with the fake provider; the axe check on the hint panel passes; the button is hidden when SAI-T0 decides on a flag and the flag is off.
- **Depends on:** SAI1-T3, SAI1-T4.

## SAI1-T6 — Evaluation and journey proof

_Status: in-progress: review set and isolated journey done; lecturer marks and SG-2 observations open._

- Hint review set: every `(key, level, variant)` template, plus 40 observations from the real provider (only if SG-2 is closed). The supervising lecturer marks each one for scientific accuracy and answer leakage.
- **Accept when:** templates have 0 scientific errors; observations have ≤ 5% rejected by the lecturer and 0 answer leaks; the journey passes against a real API and database; local versus shared-environment evidence is recorded separately.
- **Depends on:** SAI1-T5. The observation part also needs SG-2.
