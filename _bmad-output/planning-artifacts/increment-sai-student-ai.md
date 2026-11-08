---
increment: SAI
epics: SAI-01..SAI-06
status: draft
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
| SAI-04 Socratic free-text tutor | roadmap only | Typed questions with curriculum lock (UC-AI-08) | SAI-01 | SG-1, SG-2, SG-4 |
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
