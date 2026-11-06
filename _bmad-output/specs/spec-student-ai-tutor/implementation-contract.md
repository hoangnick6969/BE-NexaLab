# SAI-01 Implementation Contract

## Current evidence and required delta

| Area | Current source | SAI-01 delta |
| --- | --- | --- |
| Context | `labs/application/tutor.ts` `buildContext()` includes `studentLevel` and the last 5 attempts' state and result | Keep for `HintLog.contextSnapshot`. Add `labDigest`. Build a separate allowlisted `providerPayload` |
| Templates | `tutorHint()` has one variant per `(status, level)`, plus `SAFE` | Move into `labs/application/tutor-rules.ts` as `tutor-rules@1` with `a`/`b` variants and a pinned digest; drop `SAFE` from hint keys |
| Level | `hint.ts`: `level = min(4, 1 + max previous level)` on every new attempt | Escalation per `hint-rules.md`. The recheck transaction compares the full escalation input, not only `previousLevel` |
| Eligibility | Latest attempt only; no verdict check | Add `409 HINT_NOT_NEEDED` for `passed`; rename the 400 to code `HINT_NOT_LATEST_ATTEMPT` |
| Provider | `labs/infrastructure/llm.ts` calls Anthropic when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set and level ≥ 3; 10 s timeout; sends `studentLevel` | `StudentTutorProvider` port in `labs/application`; adapters `anthropic` and `fake` (non-production only) in `labs/infrastructure`; kill switch; allowlisted payload; guard per `hint-rules.md` |
| Rate limit | `limiter.rate("hint:" + sub, 8)` in memory, 60 s window, generic 429 message | DB-counted window with `retryAfterSeconds`; keep the in-memory limiter as a front guard |
| Logging | `HintLog {attemptId, level, content, contextSnapshot, triggeredBy}`; provider stored inside `contextSnapshot` | New nullable columns below |
| Status | `GET tutor/status` → `{provider: "anthropic" \| "rules"}` from env presence | Returns `{ provider, llmEnabled, ruleVersion }`; `llmEnabled` reflects the kill switch |
| FE | `Lab.tsx` hint button, level badge, rule-guide label | Show `escalated: false` copy, the 429 wait time, and an "AI" chip only when `provider` is `anthropic` or `cache` |

`labs` stays the owning module. SAI-01 does not depend on `src/modules/ai` (TAI-01), which does not exist yet. If TAI-01 lands first, SAI may reuse its provider abstraction, but it must not share its Gemini free-tier configuration.

## Data contract (expand-only migration)

```prisma
model HintLog {
  // existing fields unchanged
  contextDigest   String?   // sha256(stableStringify(contextSnapshot without provider fields))
  labDigest       String?
  ruleVersion     String?   // "tutor-rules@1"
  promptVersion   String?   // "tutor-observation@1" when a provider or cache was used
  provider        String?   // "rules" | "rules-fallback" | "anthropic" | "fake" | "cache"
  model           String?
  fallbackReason  String?
  escalated       Boolean?
  variant         String?   // "a" | "b" ...
  @@index([attemptId])
}

/// Validated provider observations only. No student data in key or value.
model HintObservationCache {
  key           String   @id   // see hint-rules.md
  observation   String
  promptVersion String
  model         String
  createdAt     DateTime @default(now())
  expiresAt     DateTime
  @@index([expiresAt])
}
```

Existing rows keep nulls. Readers treat a null `ruleVersion` as `legacy`. The per-student window counts need an index on `Attempt (studentId, createdAt)` joined to `HintLog.createdAt`. Add `@@index([createdAt])` on `HintLog` if the measured query plan needs it.

The provider-call budget is counted from `HintLog` rows with `provider IN ("anthropic", "fake")` and no cache hit, joined to the student's attempts in the last 24 h. There is no separate counter table.

## Provider payload (exact keys)

```json
{
  "challengeObjective": "string",
  "labState": {},
  "engine": { "status": "string?", "equation": "string?", "limiting": "string?" },
  "hintLevel": 3,
  "templateHint": "string"
}
```

Numeric engine fields are omitted from the payload, so the model has nothing to quote. The system prompt states that context strings are data, never instructions.

## API

`POST /attempts/:id/hint`, role `STUDENT`, empty body (any field → 400 `VALIDATION_FAILED`).

```json
{
  "id": "cuid",
  "attemptId": "cuid",
  "level": 2,
  "content": "string",
  "escalated": true,
  "provider": "rules",
  "createdAt": "iso"
}
```

The response never includes `contextSnapshot`, `fallbackReason`, `model` or digests. Errors are listed in `hint-rules.md` (Eligibility). Zod schema and OpenAPI fixture are updated, and FE types follow.

`GET tutor/status` → `{ "provider": "rules" | "anthropic", "llmEnabled": boolean, "ruleVersion": "tutor-rules@1" }`.

## Read-side exposure

| Reader | May see |
| --- | --- |
| Student, `GET me/attempts/:id` | hint levels and timestamps (existing). Content only for their own attempts |
| Owning teacher, class progress and evidence | hint level, content, provider, `escalated`. Not the raw `contextSnapshot` (narrow the current `include: { hints: true }` to a select) |
| Parent | no hint fields (assert in test) |
| Admin | via audit and DB only; no new route |

## Tests

- Unit: `tutor-rules@1` pinned digest; template coverage over all engine statuses; escalation table (no prev, changed digest, same digest, level 4 cap); `normalizeLabState` fixtures; guard rules, one fixture per rule; payload key allowlist; cache key stability.
- Integration (fake provider): replay returns the same row; concurrent double request writes one row; identical re-run stays at level n with variant b; `passed` → 409; outsider student → 404; window 8/9 boundary with `retryAfterSeconds`; budget 20/21 falls back to rules with no error; cache hit across two students without a provider call; kill switch on → `provider: "rules"` with `fallbackReason: "DISABLED"`; verdict, score and assignment rows unchanged; parent routes contain no hint fields; teacher route has no `contextSnapshot`.
- E2E (Playwright, FE): the SPEC success-signal journey on seeded fixtures.
