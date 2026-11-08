---
id: SPEC-student-ai-llm
status: review
decision: owner 2026-11-08 — "Hãy bỏ Human Rule Base mà sử dụng LLM"; clarified: "LLM chính, luật dự phòng", scope = Lab hints, quiz/exercise hints, result explanations (B2, B3), Socratic tutor chat (SAI-04); "Chỉ bật ở dev/test"
companions:
  - ../spec-student-ai-tutor/SPEC.md
  - ../spec-student-ai-checkpoint-hints/SPEC.md
  - ../spec-student-ai-lesson-hints/SPEC.md
  - ../spec-student-ai-tutor/student-ai-roadmap.md
  - ../../planning-artifacts/increment-sai-student-ai.md
---

# Student AI — LLM-First Wording with Rules as Plan and Fallback

## Decision

The LLM writes what the student reads. Rules stay underneath because FR-22, BR-06, BR-09 and BR-13 need them:

| Concern | Owner |
| --- | --- |
| Verdict, score, progress | Evaluators only (FR-22). Never the LLM. |
| Which step, which level, when to climb (BR-06) | Versioned rules (`tutor-rules@1`, `checkpoint-hints@6`, `lesson-hints@1`) |
| The text the student reads | LLM (`student-hint@1`, `tutor-chat@1`), from the rule text as grounding |
| Fallback when the LLM is off, fails, is over budget or is rejected | The rule text (never an empty hint) |
| Answer-leak protection | Output guard + catalog `forbidden` patterns + option-name check; the model never receives keys or drafts |

Enabled only when `APP_ENV` is `development` or `test` **and** `STUDENT_AI_LLM_ENABLED=true` (`studentAiConfig`).
Production, pilot and staging stay rules-only whatever the flag says until gate SG-2 (provider tier that does not train
on API data; legal basis for minors' data under Decree 13/2023) is decided in writing. SAI-04 also needs SG-4.

## Architecture

- Module `src/modules/student-ai`: `application/student-llm.ts` (port `StudentAiProvider`, token `STUDENT_AI_PROVIDER`,
  config, `phraseHint`, guard, cache, budget), `application/tutor-chat.ts` (SAI-04), `infrastructure/providers.ts`
  (`anthropic`, `fake`), `interface/tutor-chat.controller.ts`. `StudentAiModule` is global; Labs and Learning
  controllers inject the provider with `@Optional()` (null = rules only).
- Every hint flow: rules plan → LLM call outside any transaction (B0P-T4) → short transaction replans under the
  student's lock and persists only an unchanged plan (`409 HINT_CONTEXT_CHANGED` otherwise).
- `HintLog` provenance on every hint row: `provider` (`rules` | `rules-fallback` | `anthropic` | `fake` | `cache`),
  `model`, `promptVersion`, `fallbackReason`, `ruleVersion`, and `contextSnapshot.ruleHint` (the rule text, so the
  rule part stays replayable).
- Payload (`HintPayload`): `surface`, `context {title, objective?, step?}`, `level`, `levelType`, `mustAsk`,
  `ruleHint`, plus `question {prompt, options}` and masked `passage` for quiz/exercise, `engine {status, equation,
  limiting}` for legacy Labs. No user, class, attempt, run, key, draft or student answer.
- Guard `student-hint@1`: JSON `{hint}`, ≤ 400 chars, every number present in the payload, no blocked topic, no
  verdict/answer claim, no catalog `forbidden` pattern, no option text the rule text does not already show, ends with
  `?` when `mustAsk`.
- Cache `HintObservationCache` keyed by `sha256(promptVersion | model | payload)` (no student data), 30 days.
  Budget: 60 model calls per student per 24 h (`STUDENT_AI_DAILY_PROVIDER_CALLS`), counted from `HintLog` and
  `TutorMessage` rows that reached a model.

## Surfaces

| Surface | Route | LLM writes | Persisted |
| --- | --- | --- | --- |
| Legacy Lab hints (SAI-01) | `POST /attempts/:id/hint` | the hint (all levels) | HintLog |
| Checkpoint hints after submit (SAI-01A) | same route | the hint | HintLog |
| In-run hints, moments A/B | `POST /lab-runs/:runId/hints` | the hint / reflection | HintLog |
| Lesson quiz, basic exercise (SAI-03) | `POST /lessons/:id/quiz/hints`, `POST /open-curriculum/lessons/:id/exercises/:stepId/hints` | the hint | HintLog |
| B2 verdict explanation | `GET /attempts/:id/explanation` | `summary` only; unmet steps keep `why: null` | no (read-only), cache |
| B3 what-if | `POST /tutor/what-if/phrase` (FE sends the model's answer) | rewording of the model answer | no (read-only), cache |
| SAI-04 tutor chat | `POST /tutor/conversations`, `GET /tutor/conversations/:id`, `POST /tutor/conversations/:id/messages`, `GET /tutor/chat/status` | the reply | `TutorConversation`, `TutorMessage` |

## SAI-04 tutor chat

- Context: a Lab or lesson the student can open (released shared content or an applicable assignment), else
  `404 TUTOR_CONTEXT_NOT_FOUND`. Conversations are the student's own; parents and other students never see them.
- `tutor-chat-rules@1` refuses before any model call: prompt injection, unsafe topics, personal data (phone, email,
  password, address), answer seeking ("đáp án", "làm hộ", "A hay B", tests). Fixed, versioned replies.
- `tutor-chat@1`: the model gets context title and up to 1 500 chars of study text, the last 6 turns and the message,
  returns `{onTopic, reply}`; off topic → fixed redirect. Output guard as above (all catalog answer patterns except
  digit-only ones, grounded numbers, ≤ 600 chars).
- 500 chars per message, 20 messages per 10 minutes (`429 TUTOR_RATE_LIMITED`, `details.retryAfterSeconds`).
- Draft SG-4 safety set `content/student-ai/sai04-safety-eval-set.json` (201 prompts; proposed thresholds inside);
  the prefilter test covers every deterministic category. Model-dependent categories (on/off topic quality) need a
  real provider and the lecturer.

## Verification (2026-11-08)

BE Vitest 640 passed on isolated PostgreSQL (`student-llm.test.ts` 19, `tutor-chat.test.ts` 11,
`tutor-chat.integration.test.ts` 2, LLM blocks in `checkpoint-hints`, `exercise-hints` and `tutor-hints`
integration tests), lint, build, `check:layers`. `scripts/integration.mjs` 102/102 against an isolated API with
`STUDENT_AI_PROVIDER=fake STUDENT_AI_LLM_ENABLED=true`. FE `student-ai-llm.spec.ts` 2/2 (chat, 429 wait, AI chip, axe,
390 px), `legacy-lab-hints.spec.ts`, hint specs unchanged and passing; `legacy-hints-journey-live.spec.ts` 1/1 on the
isolated stack (LLM wording at every level, chat answer, answer request refused).

## Open

- SG-2 (provider tier, legal basis, payload approval) before any shared or production enablement.
- SG-4: lecturer approves the safety set and thresholds; run it against the chosen real provider.
- Lecturer review of LLM wording samples per surface (scientific accuracy, no answer leak).
- Retention of `TutorMessage` follows PO decision 6 (12 months after last activity); no purge job yet.
- The owner applies migrations `20261108090000_sai01_hint_provenance` and `20261108120000_sai04_tutor_conversation`
  to shared development.
