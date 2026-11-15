---
id: SPEC-teacher-ai-assessment-mode
epic: TAI-07
status: approved-am-g1-2026-11-15
companions:
  - implementation-contract.md
  - tickets.md
  - ../spec-teacher-ai-essay-assessment/SPEC.md
  - ../spec-teacher-ai-similarity/SPEC.md
  - ../spec-teacher-ai-evidence-insights/SPEC.md
  - ../spec-teacher-ai-evidence-insights/insight-rules.md
  - ../spec-teacher-ai-authoring/job-runtime-and-failure-modes.md
  - ../../implementation-artifacts/spec-i3-assigned-test-lifecycle.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the contract for TAI-07. `tickets.md` holds the
> ordered stories with **Accept when** criteria; copy them into a `$bmad-build` prompt, never paraphrase them.

# TAI-07 — Teacher Runs Graded Assessments (Assessment Mode)

## Why

The Teacher AI engines (TAI-01 drafting, TAI-02 essay suggestions, TAI-03 similarity, TAI-04 insights, TAI-06 lab
challenges) work today as isolated tools for homework practice. A Vietnamese lower-secondary teacher's core duty is
different: build a test from a cognitive-level matrix, run it under exam conditions, and record a grade column
(*đánh giá thường xuyên* 15-minute tests, coefficient 1; *đánh giá giữa kỳ* 45-minute tests, coefficient 2) on a
10-point scale that goes into the school gradebook (VnEdu/SMAS). TAI-07 keeps every engine and rewires the flow around
that duty.

## Capabilities

- **CAP-1 — Assessment type on an assignment:** a test, written or exam assignment carries `assessmentType`
  `PRACTICE | REGULAR_15M | MIDTERM_45M`. **Success:** PRACTICE behaves exactly like I3/TAI-02 today (unlimited
  resubmission, result visible at once). REGULAR_15M / MIDTERM_45M allow one attempt per student, run in a timed
  server session that auto-submits at expiry, and hide score, answers and grade from student and parent until the
  teacher publishes scores. The teacher can grant one extra attempt to one student.
- **CAP-2 — Insights that follow the teaching flow:** consecutive resubmissions of one practice assignment never raise
  a "sudden change" insight; trend insights compare different graded assignments over time, and a readiness insight
  warns before a midterm.
- **CAP-3 — Class gradebook:** one table per graded assignment with submission status, time used, MCQ/Lab score,
  written score (AI suggestion / teacher final), similarity flag and 10-point total; bulk "approve AI suggestion",
  lock the column (immutable snapshot) and export CSV in class-list order.
- **CAP-4 — Composite EXAM:** one timed paper with an MCQ part, a written part (TAI-02 rubric) and an optional lab
  challenge item, total 10 points.
- **CAP-5 — AI-drafted paper and marking scheme:** from a source lesson, assessment type and a
  Nhận biết / Thông hiểu / Vận dụng matrix, AI drafts an EXAM (questions + rubric to 10 points, optional embedded lab
  challenge) that enters the normal draft → review → publish flow.

## Decisions (gate AM-G1, closed 2026-11-15 by the project owner in the planning session)

1. Composite `EXAM` is built (CAP-4). `TEST` and `WRITTEN_TASK` stay unchanged and gain assessment mode too.
2. 10-point scale is computed from raw points (`raw / max × 10`) and rounded half-up to one decimal **only** when shown
   or locked. Stored 0–100 `score` columns keep their meaning; nothing is rounded twice.
3. Gradebook export is CSV, UTF-8 with BOM `﻿`, opened directly by Microsoft Excel. No `exceljs` dependency.
4. Session autosave every 20 s; 30 s network grace after `expiresAt`.
5. A graded assignment past its due time without a submission shows **Vắng** (absent) in the gradebook, never an
   automatic zero. The teacher reopens it per student with "Cho phép làm lại" (`AssessmentRetakeGrant`).
6. Order: TAI7-T1 assessment mode → T2 insights → T3 gradebook → T4 EXAM → T5 AI paper drafting. Each story ends with
   BE build + tests and FE build green.

## Constraints

- Server is authoritative (AD-6): session start, expiry, attempt count, scoring and result visibility are decided by
  the server; the client clock is display only.
- Graded assignments do not use the I3 late-submission flow: a session can start only before the due time and ends at
  `min(startedAt + duration, dueAt)`. Late reasons, `LateDecision` and deadline revisions stay for PRACTICE only.
  Reopening is the per-student retake grant. This is the documented exception to FR-25 recorded as FR-26.
- Hidden results are hidden on every student and parent read model (assignment detail, list, submit response,
  notifications, parent child view). Teacher routes always see them.
- AI output stays a suggestion (AD-17): AI never writes a grade, publishes scores or locks a gradebook. "Duyệt nhanh"
  is a teacher action that records `ACCEPTED_AI` decisions through the existing `assertGradeMatchesSuggestion` guard.
- Insight rule changes are additive (TAI-04 constraint): `insights@1` code is not edited; a rule is only retired from
  the active set and stays callable for replay; new rules ship as `insights@4`.
- Prompts are versioned with a pinned digest (`generate-assessment@1`, schema `assessment-items@1`).
- Migrations are expand-only and idempotent, named `YYYYMMDDHHMMSS_tai07_<topic>`; schema and migration commands run
  only against the isolated loopback database through the guarded npm scripts.
- Same denial contract as Class Space: missing or not-owned class 403 `CLASS_ACCESS_DENIED`, missing row inside an
  owned class 404, non-target student 404 `ASSIGNMENT_NOT_FOUND`.

## Non-goals

- Proctoring, webcam, browser lock-down or cheating verdicts (similarity stays evidence for teacher review).
- Direct VnEdu/SMAS API integration; the CSV is imported by the teacher.
- Term averages (*điểm trung bình môn*) and multi-assignment weighting beyond showing the coefficient.
- Changing scores of PRACTICE work or of assignments created before TAI-07 (they are PRACTICE by default).

## Success signal

The owner teacher of `class-pilot-a` asks AI for a 15-minute paper from `lesson-circuit` (40/30/30), edits and
publishes it, assigns it as REGULAR_15M. `student.active` starts, lets the timer run out and is auto-submitted from the
last draft; a second start is refused. The student sees "Đã nộp – chờ công bố điểm". The teacher opens the gradebook,
bulk-approves valid AI suggestions, sees a HIGH similarity flag on a seeded pair, publishes, locks and exports a CSV
that Excel opens with correct Vietnamese names and one-decimal scores. Outsider teacher, other student and parent
probes are denied or see no score before publication.

## Open questions

- Should the gradebook show the coefficient-weighted contribution, or only the coefficient label? (Default: label.)
- Should unlocking a locked gradebook require a reason? (Default: yes, ≤ 500 chars, audited.)
