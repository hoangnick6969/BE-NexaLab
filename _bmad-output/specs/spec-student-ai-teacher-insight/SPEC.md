---
id: SPEC-student-ai-teacher-insight
status: review
slice: SAI-02A (descriptive part of SAI-02; the threshold rule waits for G-5 / SG-3)
ideas: SAI-02 teacher hint insights (student-ai idea list, 2026-11-05)
companions:
  - ../spec-student-ai-checkpoint-hints/SPEC.md
  - ../spec-student-ai-tutor/student-ai-roadmap.md
  - ../spec-teacher-ai-evidence-insights/SPEC.md
  - ../../planning-artifacts/increment-sai-student-ai.md
---

# SAI-02A — Where the Class Is Stuck (teacher, rules-only, no thresholds)

## Why

SAI-01A gives students rule hints and B8 misconception hypotheses on all Foundational Labs, but the teacher
cannot see them. The roadmap's SAI-02 has two parts: a class summary of where students are stuck (UC-AI-05/06)
and per-student hint dependence (`HIGH_HINT_DEPENDENCE`, shared with TAI-04). The second needs thresholds that
gate G-5 / SG-3 has not approved, so this slice ships only what needs no threshold.

## Decision (owner, 2026-11-05: "Phần mô tả trước (Khuyến nghị)")

- **D1:** ship the descriptive class summary and teacher disagreement now; `HIGH_HINT_DEPENDENCE` and
  `SUDDEN_UNAIDED_PASS` stay in TAI-04 `insights@1` until G-5 closes, and will extend the same rule registry.

## Capabilities

- **CAP-1 — Stuck steps.** For one Lab assignment of the owning teacher, from each targeted, still-enrolled
  student's latest attempt: per catalog step (catalog order) the number of students who have not met it and the
  attempt IDs (evidence). Totals: targeted, submitted, passed, not passed, not submitted.
- **CAP-2 — Hint use per step.** Hints of those students on this assignment (after-submit and in-run), by step:
  total, distinct students, levels 1–4, level-0 reflections.
- **CAP-3 — Misconception hypotheses (UC-AI-06).** For each stuck step, B8 `detect` on the stored observation
  groups students by misconception id, with a teacher-facing label (`misconception-labels.ts`, one per id the
  catalogs can produce; unit test). Labelled "Giả thuyết", never a diagnosis.
- **CAP-4 — Disagreement (UC-AI-07).** The teacher marks or withdraws "không đồng ý" with an optional note (≤ 500)
  on one hypothesis of one step. Stored in `HintInsightDisagreement` with the misconception rule version. Feedback
  on the rule only: no verdict, hint, progress or student/parent view changes.
- **CAP-5 — Privacy.** No names or student IDs in the response (only attempt IDs), no per-student ranking, no
  hint text. Students and parents never see this (BR-09, BR-11).

## API

- `GET /api/classes/:classId/assignments/:assignmentId/hint-insight` (teacher, `ownedClass`; non-lab or unknown
  assignment → `404 ASSIGNMENT_NOT_FOUND`) → `{ assignmentId, ruleVersion: "hint-insights@1", hintRules,
  misconceptionRules, provider: "rules", totals, rubrics: [{ rubricRef, submitted, steps: [{ criterion, label,
  studentsUnmet, evidence, hints, misconceptions: [{ id, label, students, evidence, disagreement }] }] }] }`.
- `PUT …/hint-insight/disagreements { rubricRef, criterion, misconception, note? }` (upsert) and
  `DELETE …/hint-insight/disagreements?rubricRef&criterion&misconception` → `{ withdrawn }`. A key outside the
  catalogs or label table → `400 INSIGHT_KEY_INVALID`.
- Migration `20261107090000_hint_insight_disagreement` (additive: one table, unique per assignment + rubric +
  step + misconception, FK to Assignment with cascade).

## Teacher UX

Class → "Theo dõi" tab → choose a Lab assignment: "Lớp đang vướng ở đâu" shows the totals, then only the steps
with stuck students or hints: a bar of students not met / submitted, hint counts by level, and each hypothesis with
its student count and a "Không đồng ý" action (note form; "Rút lại" once marked). Footer: hypotheses come from
fixed rules, students and parents never see them, disagreeing changes no result; rule versions shown.

## Non-goals

- `HIGH_HINT_DEPENDENCE`, `SUDDEN_UNAIDED_PASS`, any threshold or per-student flag (G-5 / SG-3, TAI-04).
- Wording changes from disagreements (SAI-06), any LLM call.
- Station and event Labs have no misconception rules yet: they show stuck steps and hint counts only.

## Success signal

FL-21 integration fixture: the teacher sees DEFOREST stuck for 1 of 1 submitted student with the latest attempt
as evidence and hypothesis `FW_ARROW_REVERSED`, hint counts including the in-run levels, no student id or name
in the JSON; marks and withdraws a disagreement; another teacher is refused.
