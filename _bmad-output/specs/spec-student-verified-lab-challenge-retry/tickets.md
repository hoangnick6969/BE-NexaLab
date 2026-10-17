# Epic A4 Vertical Tickets

> Historical accepted-flow tickets. The quiz-gated assigned circuit path remains historical evidence; foundational Labs are open after release, and teacher-created Labs are class-linked to lesson/curriculum context with no default quiz prerequisite. New behavior follows the Open Curriculum PRD/spec.

## A4-T1 — Open only the unlocked circuit workspace

**Acceptance criteria**

- Circuit LAB/CHALLENGE step resolves to the seeded published lab, challenge, model ref/version, and assignment context.
- Server applies assignment applicability and passed-quiz gate on config/read and submission routes; direct URL and forged step/challenge combinations fail without metadata leak.
- UI shows ≥70%-height workspace where supported, accessible controls, loading >4s message, retry, and WebGL/static/text fallback; controls never cover verdict/primary action.
- Frontend records the exact sim artifact version it consumes and warns/fails safely on unsupported contract version.

**Verification:** ownership/gate/source trace; contract and negative tests; responsive keyboard/touch/fallback browser checks against real API.

## A4-T2 — Persist a server-recomputed official attempt

**Acceptance criteria**

- Migration adds trace/version/idempotency fields without deleting legacy attempts.
- Zod validates bounded circuit state/duration; backend calls deterministic sim and derives verdict, ignoring injected result/verdict fields.
- Attempt + source linkage + progress projection update commit atomically or roll back together.
- Same key/same payload returns original attempt; same key/different payload conflicts; concurrent duplicate delivery creates one attempt.

**Verification:** deterministic/property/tamper/rollback/concurrency tests; package unit tests; real Supabase attempt persistence and recomputation comparison.

## A4-T3 — Show official result and retry without losing state

**Acceptance criteria**

- UI renders only server verdict/evidence using approved supportive states; system errors alone use error styling.
- Failed save preserves student parameters and offers retry with the same key; no official check/progress appears before confirmation.
- Retry creates a fresh client idempotency key and new immutable attempt; prior attempts remain addressable.
- Passed attempt completes the configured step/unlocks its successor; partial/needs-practice keeps Retry primary.

**Verification:** frontend mutation/recovery tests; multi-attempt backend tests; real failure-recovery and partial → retry → passed browser flow.

## A4-T4 — Verify simulation parity, accessibility, and performance

**Acceptance criteria**

- Representative state corpus produces identical preview/backend numeric results within documented deterministic tolerance; persisted verdict always equals backend recomputation.
- Pilot device checks measure frame rate/input responsiveness and provide fallback when 30 FPS/WebGL support is not met.
- API latency, rate-limit behavior, invalid/oversized payloads, expired session, and temporary dependency failure are exercised.
- Integration/E2E pass only with actual sim package, Supabase, API, app, and browser dependencies.

**Verification:** backend lint/test/build, sim unit corpus, frontend lint/build/tests, timed real-dependency E2E; production separate.
