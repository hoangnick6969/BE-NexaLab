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
| B5 textbook passage Q&A | same chat routes with `contextKind: "EBOOK"` (subject id) and `passage {text, prefix?, suffix?, pageNumber}` | explanation of the highlighted passage | `TutorMessage.passage`, `pageNumber` |
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
- SG-4 runner (2026-11-09, sai-04-t2): `npm run eval:student-ai` runs every prompt through `draftTutorReply`, the
  same prefilter → provider → guard path `sendMessage` uses (extracted, no behaviour change), scores each category
  against the proposed thresholds and writes `report.json` plus `lecturer-review.csv` (empty `lecturer_ok`/`lecturer_note`
  columns) under `test-results/student-ai-eval/<time>/`. Modes: no provider (prefilter categories only), `--provider
  fake` (pipeline check; model categories reported NOT_MEASURED), `--provider anthropic --allow-external` (real model;
  synthetic prompts only, explicit flag while SG-2 is open). Exit 1 when a measured category misses its threshold.
  Rules-only and fake runs: INJECTION 40/40, UNSAFE_TOPIC 30/30, PERSONAL_DATA 15/15, ANSWER_SEEKING 25/25.
- Retention (PO decision 6): `purgeTutorConversations` deletes conversations whose last turn is older than 12 months,
  messages by cascade; `npm run retention:student-ai` counts, `--apply` deletes. No in-process scheduler; the owner
  runs it on shared environments. "Last activity" is read per conversation (assumption, to confirm with the PO).

## B5 — ask about a highlighted textbook passage (owner 2026-11-08: "Làm tiếp B5")

- In the textbook reader a student switches to **Hỏi AI**, highlights up to 2 000 characters and asks. Shown only to
  students while the tutor chat is enabled (dev/test).
- `POST /tutor/conversations { contextKind: "EBOOK", contextId: <subjectId> }` (subject must have a textbook link, as
  for reading and annotating); messages carry `passage { text ≤ 2000, prefix ≤ 400, suffix ≤ 400, pageNumber }`.
  A passage is required for EBOOK and refused elsewhere (`400 TUTOR_PASSAGE_INVALID`).
- `tutor-chat-rules@2`: the message rules of @1, plus an injection check on the client-supplied passage (prefix, text,
  suffix). Safety words in the book itself ("điện lưới", warnings) are not refused.
- `textbook-qa@1`: explain the passage in simple words, only from the passage and grade-8 KHTN, never solve exercises,
  end with a check-understanding question; off topic → fixed redirect. Output guard as for the chat; numbers must
  appear in the passage, question or history; a catalog answer pattern that the passage itself states is not a leak.
- Logged as `TutorMessage` with `passage` and `pageNumber` (migration `20261108150000_b5_textbook_passage`,
  expand-only: EBOOK context kind, two nullable columns).
- Verified: `tutor-chat.integration.test.ts` B5 case (answer grounded in the passage, ungrounded number → fallback,
  injected passage refused without a model call, safety text not refused, passage required/refused, subject without
  textbook → 404), `tutor-chat.test.ts`; FE `textbook-ask.spec.ts` 2/2 (generated PDF with a text layer, highlight,
  ask, AI chip, page and quote, axe; hidden when off). Not run on a real stack (needs a textbook PDF URL on the
  isolated database).

## Provider switch to Gemini Flash (owner 2026-11-09: "Chuyển sang dùng Gemini Flash đi")

- `GeminiStudentProvider` (Gemini API `generateContent`, `x-goog-api-key`, system instruction, JSON response MIME type,
  +1 024 output tokens headroom for thinking, thought parts dropped; HTTP/parse/timeout map to the same fallback
  reasons). `STUDENT_AI_PROVIDER` defaults to `gemini` (needs `GEMINI_API_KEY`, `GEMINI_MODEL`; no model id in code);
  `anthropic` stays selectable. Provider value `gemini` added to HintLog provenance, the OpenAPI fixture enum and the FE
  AI chip. Eval runner: `--provider gemini --allow-external`.
- Risk recorded for SG-2: the Gemini API Additional Terms bar use in an app "directed towards or likely to be accessed
  by individuals under the age of 18" (NexaLab students are about 13–14), while Anthropic allows minors with
  safeguards. The owner chose Gemini knowing this; it does not change the dev/test-only rule. SG-2 must settle it
  (for example Vertex AI terms, or Anthropic) before any shared or production enablement.

## Verification (2026-11-08)

BE Vitest 640 passed on isolated PostgreSQL (`student-llm.test.ts` 19, `tutor-chat.test.ts` 11,
`tutor-chat.integration.test.ts` 2, LLM blocks in `checkpoint-hints`, `exercise-hints` and `tutor-hints`
integration tests), lint, build, `check:layers`. `scripts/integration.mjs` 102/102 against an isolated API with
`STUDENT_AI_PROVIDER=fake STUDENT_AI_LLM_ENABLED=true`. FE `student-ai-llm.spec.ts` 2/2 (chat, 429 wait, AI chip, axe,
390 px), `legacy-lab-hints.spec.ts`, hint specs unchanged and passing; `legacy-hints-journey-live.spec.ts` 1/1 on the
isolated stack (LLM wording at every level, chat answer, answer request refused).

## Open

- SG-2 (provider tier, legal basis, payload approval) before any shared or production enablement; includes the Gemini under-18 terms issue.
- SG-4: lecturer approves the safety set and thresholds; run `npm run eval:student-ai -- --provider anthropic
  --allow-external` against the chosen real provider and give the lecturer `lecturer-review.csv`.
- Lecturer review of LLM wording samples per surface (scientific accuracy, no answer leak).
- Retention job exists (`npm run retention:student-ai`); scheduling it on shared environments is the owner's call.
- The owner applies migrations `20261108090000_sai01_hint_provenance`, `20261108120000_sai04_tutor_conversation` and
  `20261108150000_b5_textbook_passage` to shared development.
