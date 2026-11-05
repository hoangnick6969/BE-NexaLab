---
id: SPEC-student-ai-checkpoint-hints
status: in-progress
slice: SAI-01A (first Student AI slice; precedes SAI-01 legacy-lab hints in ../spec-student-ai-tutor)
ideas: B1 checkpoint hints + B8 checkpoint misconception rules; B2 post-verdict explanation; SAI-05 parent help-seeking summary (student-ai idea list, 2026-11-05)
companions:
  - ../spec-student-ai-tutor/SPEC.md
  - ../spec-student-ai-tutor/student-ai-roadmap.md
  - ../../planning-artifacts/increment-sai-student-ai.md
---

# SAI-01A — Rules-Only Hints for Checkpoint Foundational Labs

## Why

The Labs students actually open from the library are Foundational Lab releases. Four of them run as
checkpoint activities: `circuit-bulb-checkpoints` (FL-01), `em-induction-checkpoints` (FL-25),
`ecology-tolerance-checkpoints` (FL-20) and `food-web-checkpoints` (FL-21). A not-passed run lists
`assessment.unmetCriteria` (`prediction:<CHECKPOINT>` or `explanation`), but the student gets no
help beyond "incorrect". The existing tutor (`tutor.ts`) only knows legacy circuit, chemistry and eye
states. Each checkpoint already has a deterministic evaluator, so a versioned rule table can point the
student at the exact checkpoint they missed and climb Question → Concept → Action → Explanation without
any model call.

## Decisions (owner, 2026-11-05: "theo khuyến nghị")

- **D1 (SG-1, rules part):** FR-22 is activated for rules-only hints. The LLM stays off; SG-2 (provider
  tier, legal basis for minors) still gates any provider call and is out of scope here.
- **D2:** a `passed` attempt refuses a hint with `409 HINT_NOT_NEEDED`.
- **D3:** SAI-01 starts with checkpoint Foundational Labs. Legacy-lab work in `spec-student-ai-tutor` follows.

## Capabilities

- **CAP-1 — Target the first unmet checkpoint.** The hint is about the first unmet criterion of the
  latest attempt, in the activity's checkpoint order, then `explanation`. **Success:** a run that misses
  `prediction:HUNT` and `explanation` gets a hint for `HUNT`.
- **CAP-2 — Eligibility.** Only the student's own latest attempt on that challenge. **Success:** another
  student's attempt → 404; an older attempt → `400 HINT_NOT_LATEST_ATTEMPT`; a passed attempt → `409
  HINT_NOT_NEEDED`; asking twice for one attempt returns the stored hint and writes no second row.
- **CAP-3 — Escalation only after a real retry (BR-06).** For a criterion, the level rises from n to n+1
  only when the student's answer for that checkpoint (prediction and state, or the explanation choice)
  differs from the answer that received level n. **Success:** the same wrong answer again → same level,
  the other variant, `escalated: false`; a changed but still wrong answer → next level; levels never skip
  and stop at 4. A criterion hinted for the first time starts at level 1.
- **CAP-4 — Misconception-aware wording (B8).** `checkpoint-misconceptions@1` maps a wrong answer to a
  misconception id (for example FL-21 `HUNT` answered `DECREASE` → `FW_ALL_DECREASE`). Levels 1–2 use the
  misconception's wording when one matches; levels 3–4 are the same for everyone. **Success:** the id is
  stored in the hint log and never shown to the student (BR-09).
- **CAP-5 — No answer leak.** No template names the correct option or value: not the choice label, not the
  number. Level 4 explains the method or principle. **Success:** a unit test checks every template of every
  criterion against the expected answer tokens of that checkpoint.
- **CAP-6 — Traceable log (BR-13).** Every hint writes one `HintLog` whose `contextSnapshot` is exactly
  `{ kind, ruleVersion, rubricRef, criterion, checkpointId, misconception, answerDigest, escalated,
  variant, provider: "rules" }`. No user, class, `studentLevel` or free text. **Success:** replaying the
  rule version on the stored attempt reproduces the content.
- **CAP-7 — FR-22.** Hints never change verdict, result, score, assignment status or progress, except the
  existing `lastHintLevel` projection. **Success:** an integration test compares attempt and progress rows
  with and without a hint.

## API

`POST /api/attempts/:id/hint` (student, existing route and rate limit). For an attempt of a LabRun whose
pinned rubric has a hint catalog, the response is the `HintLog` row plus
`{ criterion, checkpointId, escalated, provider: "rules", ruleVersion }`. Attempts of other rubrics keep
today's behaviour.

## In-run hints (moments A and B, owner 2026-11-05: "đồng ý, làm theo thứ tự đề xuất")

After-submit hints alone came too late: students get stuck on one question, and in these predict→observe
Labs the observation already shows the answer before submitting. Two more moments run inside a LabRun:

- **A — before predicting** (`moment: "BEFORE_PREDICTION"`): level 1, then 2 on the next ask, then level 2
  with the other wording (`repeatReason: "TOP_LEVEL"`). Never above level 2. The request carries no draft
  and the wording never depends on one, so a hint cannot reveal whether a draft answer is right.
- **B — after observing** (`moment: "AFTER_OBSERVATION"`): the server scores that one checkpoint with the
  pinned activity's own evaluator (other checkpoints filled with valid placeholders); a matching
  prediction gets `409 HINT_NOT_NEEDED`, a mismatch gets a reflection (`level: 0`, outside the ladder),
  worded for the detected misconception when one matches. Not offered for observe-first steps (FL-20
  `LIMITS`) or the explanation.
- `POST /api/lab-runs/:runId/hints { criterion, moment, state?, prediction? }`, own run only, run not
  revoked or expired, 24 in-run hints per run (`429 RUN_HINT_LIMIT`), rate key `run-hint:` 30.
- Storage: migration `20261106090000_hint_log_lab_run` makes `HintLog.attemptId` nullable, adds
  `labRunId` (FK, cascade) and a check that one of the two is set. In-run rows have `attemptId = null`, so
  progress, teacher and parent read paths (all via `attempt.hints`) do not see them.
- After submitting, earlier moment-A levels count: a checkpoint hinted to level 2 in the run starts the
  after-submit ladder at level 3.
- Catalog version `checkpoint-hints@2` (adds the reflections; level 1–4 text unchanged from @1).

## Step 2 — station Labs (after-submit only)

FL-03 density, FL-27 gene to protein, FL-16 eye optics and FL-05 buoyancy get after-submit hints from
`station-hint-catalogs.ts` (part of `checkpoint-hints@3`). Their evaluators already return
`assessment.unmetCriteria`; a catalog `keyOf` groups raw entries into hint keys (density and gene by
criterion, keeping the concept questions apart; FL-16 `phase1` and the first phase-2 reason in the order
distance, focus, relaxedFar, glasses), and `answerOf` picks the evidence part each key depends on, so a
key escalates only when that part changed. No in-run hints (`inRun` only on predict-observe catalogs).
The FE shows the after-submit panel for renderers `density-bench`, `gene-expression`,
`eye-anatomy-optics`, `buoyancy-bench`.

## Step 3 — event-scored Labs (after-submit only)

FL-06 lever, FL-07 thermal energy and FL-10 mass conservation (`event-hint-catalogs.ts`,
`checkpoint-hints@4`). `unmetOf` reads their criteria maps (FL-06 rotation…application, FL-07 R2–R6,
FL-10 C1–C6); `withEvents` makes the API pass `{ labState, events }` (the run's LabRunEvent rows) so
`answerOf` compares the events behind each criterion. The FE floats a collapsible "Gợi ý từng bước"
panel beside their own layouts after a not-passed submission.

## Step 4 — B2 post-verdict explanation (owner 2026-11-05: "làm tiếp B2 và SAI-05")

`GET /api/attempts/:id/explanation` (student, own attempt; other → 404; rate key `explanation:` 60). For an
attempt whose pinned rubric has a hint catalog it returns `{ attemptId, verdict: "passed"|"not_passed", summary,
items: [{ criterion, label, met, why }], ruleVersion: "verdict-explanations@1", hintRules, provider: "rules" }`;
other rubrics → `409 EXPLANATION_UNAVAILABLE`. Built by `verdict-explanation.ts` from the stored evaluator result
only (same `unmetOf` / `unmetCriteria` + `keyOf` as the hint planner), one item per catalog key in order:

- A met step's `why` is the catalog's level-4 wording (variant a): the method or principle, already covered by the
  leak test. An unmet step has `why: null` and shows only its name, so a not-passed learner who can retry is not
  handed the answer. A passed verdict lists every step as met (FR-22: the verdict is official).
- Not passed with no catalog key unmet → one extra `other` item ("Yêu cầu chung của bài") instead of "all met".
- Read-only: no `HintLog`, no projection, attempt row unchanged (integration test).

FE: a "Vì sao em đạt? / Vì sao em chưa đạt?" toggle (`VerdictExplanationPanel`) under the guided result of
checkpoint and station Labs, and at the top of the floating panel of event Labs (now shown for passed runs too,
with the hint panel only when not passed). Fetched only when opened.

## SAI-05 — parent help-seeking summary (BR-11)

`GET /api/children/:studentId/help-seeking` (parent; `readableStudent` → `403 PARENT_LINK_REQUIRED` unless an
approved, unrevoked link) returns `{ labs: [{ labId, labTitle, total, byLevel: {1..4}, reflections, lastAt }] }`,
newest Lab first. It counts every `HintLog` of the child: after-submit rows via `attempt.studentId` (Lab from the
challenge) and in-run rows (`attemptId = null`) via `labRun.studentId`. Level-0 moment-B reflections are counted
apart. No content, criterion, label, misconception or conversation leaves the server (integration test checks the
JSON). FE: "Con đã xin gợi ý bao nhiêu lần" cards on the parent progress page (`HelpSeekingPanel`), one card per
Lab with wrapping level rows; the link-scope note now says hint text is never shown, only counts.

## Student UX

While working, a "Gợi ý" toggle in the Lab Space action dock opens a popover above the dock (the stage stays
clear; a dot marks an available reflection). It offers "Gợi ý cho câu “…”" for the step waiting for a
prediction and "Vì sao kết quả khác dự đoán của em?" for the last observed step. After submitting, in a
guided checkpoint result that is not passed, a hint panel shows "Nhận gợi ý" / "Get a hint", the level
and the checkpoint the hint is about. When `escalated` is false it says the hint stays at this level because
the answer did not change. `HINT_NOT_NEEDED` is never reachable from the panel (it is hidden when passed).

## Non-goals

- Any LLM call (SG-2), cache or provider budget.
- Teacher insight (SAI-02).

## Success signal

`student.active` submits FL-21 with `HUNT = DECREASE` and the wrong explanation, asks for a hint and gets a
level-1 question about `HUNT` worded for `FW_ALL_DECREASE`. Resubmitting the same answers and asking again
returns level 1 variant b with `escalated: false`. Changing `HUNT` to `NO_DIRECT_EFFECT` and asking returns
level 2. Answering `HUNT` correctly moves the next hint to `explanation` at level 1. Passing the run hides
the panel. The attempt verdicts and progress match a run without hints.
