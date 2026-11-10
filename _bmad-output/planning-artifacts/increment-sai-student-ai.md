---
increment: SAI
epics: SAI-01..SAI-06
status: in-progress
tracking: ../implementation-artifacts/sprint-status.yaml (section student_ai_tracking)
---

# SAI / Student AI Increment: Advisory, Traceable Hints

## Agent handoff

Read these before coding, in this order:
1. `docs/product/prd.md` (FR-22, PO decisions 6 and 17)
2. `docs/reference/srs-nexalab-v1.1.txt` module AI (UC-AI-01 to 09, BR-06, BR-09, BR-11, BR-13)
3. `_bmad-output/planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md`
4. This increment
5. The epic's spec folder: `SPEC.md`, then every file listed in its `companions:`

If a rule conflicts or a readiness gate below is unresolved, stop and report it. Do not invent a product decision.

Delegate one ticket per task, as a vertical BE/FE/API/schema slice. Keep NestJS/Zod/OpenAPI and FE types/UI aligned. Enforce authorization in the backend. Do not commit or push unless requested. At the end of each session, update `sprint-status.yaml` (`development_status` and `student_ai_tracking`).

## Relation to Teacher AI (TAI)

- SAI-01 is independent of TAI-01. It extends the existing `labs` tutor and does not need `src/modules/ai`.
- SAI-02 and TAI-04 must share one insight rule engine. Whichever starts second extends the other's rule registry.
- The TAI-01 pilot provider (Gemini free tier) may not receive student data. SAI uses its own provider configuration.

## Feature map

| Epic | Spec folder | Delivers | Depends on | Readiness gate |
| --- | --- | --- | --- | --- |
| SAI-01 Lab hint tutor | `../specs/spec-student-ai-tutor/` | Versioned 4-level hints, real-retry escalation, provider guard, cache, budget, full HintLog | Existing labs tutor | SG-1 (rules path); SG-1 + SG-2 (provider in production) |
| SAI-02 Teacher hint insights | `../specs/spec-student-ai-teacher-insight/` (SAI-02A descriptive part); threshold rule in TAI-04 | Class summary, trace, disagreement (UC-AI-05 to 07) | SAI-01, TAI-04 alignment | SG-1, SG-3 |
| SAI-03 Lesson and quiz hints | `../specs/spec-student-ai-lesson-hints/` (SAI-03A quiz questions) | Hints outside labs, never revealing keys | SAI-01 | SG-1 |
| SAI-04 Socratic free-text tutor | `../specs/spec-student-ai-llm/` (SAI-04 and B5 sections; dev/test only) | Typed questions with curriculum lock (UC-AI-08) | SAI-01 | SG-1, SG-2, SG-4 |
| SAI-05 Parent help-seeking summary | `../specs/spec-student-ai-checkpoint-hints/` (section SAI-05) | Hint counts by level (BR-11) | SAI-01A | SG-1 (rules part, D1) |
| SAI-06 Personalised wording | roadmap only | Variant choice from level and misconceptions | SAI-02 | SG-2, SG-3 |

## Readiness gates

| Gate | Decision required | Owner | Blocks |
| --- | --- | --- | --- |
| SG-1 | Activate FR-22 as increment SAI: amend PRD §10 item 17 and spine Deferred, add AD-18, reconcile FE Student P0 UX on the hint button (SAI-T0) | Product owner / supervising lecturer | All epics |
| SG-2 | Provider tier that does not train on API data; legal basis for minors' interaction data (NFR-07, Decree 13/2023/NĐ-CP); payload allowlist approved | Product owner | Provider path in production for SAI-01; SAI-04; SAI-06 |
| SG-3 | Insight rule thresholds approved jointly with TAI G-5 | Product owner / supervising lecturer | SAI-02, SAI-06 |
| SG-4 | Safety evaluation set and pass thresholds for free-text tutoring | Supervising lecturer | SAI-04 |

## Order

SAI-T0 → SAI1-T1 → SAI1-T2 → SAI1-T3 → (SAI1-T4 can run after T1) → SAI1-T5 → SAI1-T6. SAI1-T1 to T5 are valid with the provider disabled, so SG-2 blocks only production enablement and the observation part of T6.

## 2026-11-05 — SAI-01A first (owner: "theo khuyến nghị")

The first slice is SAI-01A, rules-only hints for the four checkpoint Foundational Labs (FL-01 circuit bulb,
FL-20, FL-21, FL-25), see `../specs/spec-student-ai-checkpoint-hints/SPEC.md`. Owner decisions recorded there:
D1 FR-22 activated for rules-only hints (SG-1 rules part; SG-2 still gates any provider), D2 passed attempt →
`409 HINT_NOT_NEEDED`, D3 checkpoint Labs before the legacy-lab SAI-01. Next in the idea order: B2 post-verdict
explanation and SAI-05 parent summary, then SAI-02 teacher insight.

2026-11-05 (later): B2 post-verdict explanation (`verdict-explanations@1`) and SAI-05 parent help-seeking
summary shipped on `research/student-ai`, both rules-only and read-only, specified in the SAI-01A SPEC (step 4
and SAI-05 section). Next: SAI-02 teacher insight.

2026-11-05 (later): SAI-02A shipped on `research/student-ai` (owner: "Phần mô tả trước"): class "where stuck"
summary with misconception hypotheses and teacher disagreement (migration `20261107090000_hint_insight_disagreement`).
`HIGH_HINT_DEPENDENCE` waits for G-5 / SG-3. Next: SAI-03 / B5.

2026-11-05 (later): SAI-03A shipped on `research/student-ai`: answer-blind rules hints on lesson quiz questions
(`lesson-hints@1`, migration `20261107120000_hint_log_lesson_step`). Basic exercises and B5 (needs SG-2) follow.

2026-11-06: B3 rules part shipped on `research/student-ai` (owner: "làm B3 bằng luật trước"): "Nếu… thì sao?" in
FL-21 and FL-20 free explore, answered from the pinned models (`what-if@1`, FE only), see
`../specs/spec-student-ai-what-if/SPEC.md`. SAI-04 (typed questions) still waits for SG-2.

2026-11-08: SAI-03-T3 shipped on `research/student-ai`: the same answer-blind hints on Open Curriculum basic
exercise questions (`POST /open-curriculum/lessons/:lessonId/exercises/:stepId/hints`, no migration), see the
SAI-03-T3 section of `../specs/spec-student-ai-lesson-hints/SPEC.md`. B5 (free-text textbook Q&A) still needs SG-2.

2026-11-08 (later): SAI-T0 approved by the product owner ("Tôi duyệt tiếp tục làm đi"), SG-1 closed (PRD §10.17,
AD-18, spine Deferred, FE Student P0 UX). SAI-01 T1–T5 built on `research/student-ai` with the provider path off
by default (fake adapter in tests only); T6 review set `../specs/spec-student-ai-tutor/hint-review-set.md` waits for
the lecturer. Migration `20261108090000_sai01_hint_provenance` must be applied to shared development by the owner.

2026-11-08 (later): owner decision "bỏ Human Rule Base mà sử dụng LLM" → LLM chính, luật dự phòng, for Lab hints,
quiz/exercise hints, B2/B3 explanations and the SAI-04 tutor chat, enabled only in dev/test until SG-2 (and SG-4 for
the chat). See `../specs/spec-student-ai-llm/SPEC.md`. Migrations to apply to shared development by the owner:
`20261108090000_sai01_hint_provenance`, `20261108120000_sai04_tutor_conversation`.

2026-11-08 (later): B5 shipped (dev/test only): "Hỏi AI" on a highlighted textbook passage, see the B5 section of
`../specs/spec-student-ai-llm/SPEC.md`. One more migration for the owner: `20261108150000_b5_textbook_passage`.

2026-11-09: SG-4 tooling and retention (owner: "Hoàn thiện các phần còn lại"): `npm run eval:student-ai` scores the
safety set through the same reply path as the API and writes a lecturer CSV; `npm run retention:student-ai` applies
the 12-month rule to tutor conversations (dry run by default). Everything else left is gated: SG-2 (provider tier,
legal basis), SG-3 (insight thresholds, sai-02-t3, SAI-06), SG-4 (lecturer approval of the set and a real-provider
run), lecturer marks on `hint-review-set.md` (sai-01-t6), owner applies the three Student AI migrations.

2026-11-09 (later): Gemini Flash became the default provider (owner: "Chuyển sang dùng Gemini Flash đi"; its terms
bar under-18 apps, so SG-2 stays open). The owner applied the three Student AI migrations to shared development;
the tutor chat answers there with Gemini in `APP_ENV=development`. `origin/main` merged into `research/student-ai`
(BE, FE). Tutor chat reads the relevant lesson part (`tutor-chat-rules@3`), then the whole lesson up to 12 000
characters (`tutor-chat-rules@4`).

2026-11-10 — progress: 30 of 33 SAI tickets built (3 done, 27 review), 2 in progress (sai-01-t6 lecturer marks,
sai-04-t2 lecturer approval and a real-provider eval), 1 backlog (sai-02-t3, waits for SG-3). SAI-06 not started.
No production enablement until SG-2 closes. Details: `student_ai_tracking` in `sprint-status.yaml`.

2026-11-10 (later): sai-04-t3 lesson passage Q&A (owner: "bôi đen phần đang thắc mắc ... Ok làm đi"): highlight in
the lesson Reading tab, "Hỏi AI về đoạn này", the docked tutor chat sends the passage with the question; the server
checks the passage is in the lesson (`tutor-chat-rules@5`, `lesson-passage-qa@1`). No migration; dev/test only. See
the lesson passage section of `../specs/spec-student-ai-llm/SPEC.md`. Now 31 of 34 tickets built.
