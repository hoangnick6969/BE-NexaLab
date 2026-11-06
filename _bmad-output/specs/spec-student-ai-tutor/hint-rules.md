# SAI-01 Hint Rules (`tutor-rules@1`, `tutor-observation@1`)

## Levels (BR-06)

| Level | Type | Source | Provider allowed |
| --- | --- | --- | --- |
| 1 | Observation question | template | no |
| 2 | Concept hint | template | no |
| 3 | Action hint | template, optionally preceded by one observation | yes |
| 4 | Explanation grounded in engine numbers | template, optionally preceded by one observation | yes |

Numbers in a level-4 explanation come only from the engine result (`minimumResistance`, `extent`, `limiting`) through the template, never from the provider.

## Template selection

- Domain key: `simulation.status` for circuits (`OPEN_CIRCUIT`, `SWITCH_OPEN`, `LED_OVERLOAD`, `NO_LED`, `LOW_CURRENT`); `CHEMISTRY` when `simulation.equation` exists; otherwise `EYE`.
- An unknown circuit status falls back to `OPEN_CIRCUIT`, as it does today. A test lists every status the engine (`packages/sim`) can return and fails when a new status has no template set.
- `SAFE` is the passed state and is not a hint key in `tutor-rules@1` (see SPEC open question).
- Each `(key, level)` has at least two variants: `a` is today's text and `b` is a rephrasing. The variant index is `sameLevelRepeats mod variants`, where `sameLevelRepeats` counts earlier hints at this level on this challenge. Writing the `b` variants is part of SAI1-T2. Wording stays non-labelling: no "em hiểu sai", no grade or ability words.

## Escalation (UC-AI-03)

Let `prev` be the student's most recent `HintLog` on this challenge, at level n, attached to attempt `A_prev`.

- No `prev`: level 1.
- `labDigest(current) ≠ labDigest(A_prev)` and current attempt is newer than `A_prev`: level `min(4, n + 1)`, `escalated: true`.
- Otherwise: level n, next variant, `escalated: false`.

`labDigest = sha256(stableStringify(normalizeLabState(labState)))`. `normalizeLabState` removes canvas coordinates, selection and UI-only fields and keeps components, values, connections and switch states. Fixtures cover moving a component without rewiring (same digest) and changing a resistor value (different digest).

## Eligibility

| Condition | Response |
| --- | --- |
| Attempt not owned by the caller | 404 (existing) |
| Attempt is not the newest on its challenge | 400 `HINT_NOT_LATEST_ATTEMPT` |
| Attempt verdict is `passed` | 409 `HINT_NOT_NEEDED` |
| Assignment no longer applicable (recheck) | 403 `ASSIGNMENT_ACCESS_REVOKED` (existing) |
| Context changed during provider call | 409 `HINT_CONTEXT_CHANGED` (existing) |
| Request rate over limit | 429 `HINT_RATE_LIMITED`, `retryAfterSeconds` |
| Hint already stored for this attempt | 200 with the stored hint (replay) |

## Provider observation guard (`tutor-observation@1`)

The provider must return JSON `{"observation": string}`. The observation is dropped, and the template alone is returned, when any of these is true:

- not parseable, not a string, empty, or longer than 250 characters;
- contains a digit or any of `= < > ≤ ≥ × ÷ Ω`;
- contains a blocked topic term (current list: `ngoài đời`, `uống`, `nếm`, `điện lưới`, `tự chế`, `trộn hóa chất`), kept in one exported constant;
- does not end with `?` (it must be a question);
- contains a verdict claim: `đúng rồi`, `sai rồi`, `đã đạt`, `chưa đạt`, `điểm`.

Every drop records `provider: "rules-fallback"` and `fallbackReason` (`TIMEOUT`, `HTTP_ERROR`, `PARSE`, `GUARD:<rule>`, `BUDGET`, `DISABLED`).

## Cache

- Key: `sha256(challengeId | labDigest | engineStatusKey | level | promptVersion | model)`.
- Value: the validated observation only. Templates are never cached because they are recomputed.
- Written only after the guard passes. TTL 30 days (`STUDENT_AI_CACHE_TTL_DAYS`). Not scoped to a student, because the key holds no student data.

## Limits (env, defaults)

| Env | Default | Meaning |
| --- | --- | --- |
| `STUDENT_AI_LLM_ENABLED` | `false` | Kill switch for the provider path |
| `STUDENT_AI_HINTS_PER_10_MIN` | `8` | Hint requests per student per rolling 10 minutes, counted from `HintLog` |
| `STUDENT_AI_DAILY_PROVIDER_CALLS` | `20` | Provider calls (cache misses) per student per rolling 24 h; over it falls back to rules |
| `STUDENT_AI_PROVIDER_TIMEOUT_MS` | `8000` | Abort the provider call |
| `STUDENT_AI_CACHE_TTL_DAYS` | `30` | Cache entry lifetime |

`retryAfterSeconds` = seconds until the oldest counted `HintLog` in the window leaves it, rounded up.
