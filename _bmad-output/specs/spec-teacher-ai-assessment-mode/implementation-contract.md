# TAI-07 Implementation Contract

## Current evidence and required delta (checked 2026-11-15)

| Area | Today | Delta |
|---|---|---|
| `Assignment` (`prisma/schema.prisma`) | `contentType` `lesson｜lab｜test｜written`, `dueDate`, targets, deadline revisions | `assessmentType`, `durationMinutes`, `scoresPublishedAt/ById` (T1); `gradebookLockedAt/ById` (T3); `contentType: "exam"` (T4) |
| `AssignmentSubmission` | immutable; unlimited; latest is current; `score` 0–100 `Math.round`; `gradingMode` AUTO/TEACHER | `sessionId @unique`, `autoSubmitted` (T1); `autoPoints/autoMaxPoints`, `GradingMode.MIXED` (T4) |
| Student submit (`learning.controller.ts` `submitTest`/`submitWritten`) | scores and returns `state` with score at once; I3 late flow | graded: session required, one attempt, partial answers allowed, result hidden |
| Read models (`assignment-test-state.ts deadlineStates`) | single path for student, parent, notification, teacher progress | adds result visibility, fail-closed by default |
| Insights (`reports/application/insights`) | `insights@1 SCORE_CHANGE_UNUSUAL` uses every QUIZ attempt and TEST submission | retire it from the active set, add `insights@4` (T2) |
| AI drafting (`GENERATE_RESOURCE`) | DECK/STUDY_QUIZ/TEST MCQ only | `GENERATE_ASSESSMENT` purpose (T5) |

Naming follows the existing code: Prisma enums in PascalCase with UPPER_SNAKE values, error codes UPPER_SNAKE,
Vietnamese user messages, routes under `classes/:id/assignments/:assignmentId/...` (teacher) and `assignments/:id/...`
(student).

## Policy (pure, `src/modules/classes/application/assessment-policy.ts`)

| assessmentType | coefficient | default duration | allowed duration | attempts | result visible to student/parent |
|---|---|---|---|---|---|
| `PRACTICE` | — | none (null) | must be null | unlimited, latest current | always |
| `REGULAR_15M` | 1 | 15 min | 5–60 min | 1 + one per unused retake grant | after `scoresPublishedAt` |
| `MIDTERM_45M` | 2 | 45 min | 15–120 min | 1 + one per unused retake grant | after `scoresPublishedAt` |

- Graded types are allowed for `contentType ∈ {test, written}` in T1 and `exam` from T4; lesson/lab → 400
  `ASSESSMENT_TYPE_UNSUPPORTED`.
- `toScale10(raw, max)` = `roundHalfUp(raw / max × 10, 1)`; `max ≤ 0` → null. Half-up uses `Math.round(x × 10 + 1e-9) / 10`
  on the exact quotient. TEST raw = `correctCount / questionCount`; written raw = `totalPoints / maxPoints`.
- `assessmentType` and `durationMinutes` are fixed at creation (the update body does not accept them).

## Data contract (T1, migration `20261115090000_tai07_assessment_mode`)

```prisma
enum AssessmentType { PRACTICE REGULAR_15M MIDTERM_45M }
enum AssessmentSessionStatus { OPEN SUBMITTED }

model Assignment {
  // …existing
  assessmentType      AssessmentType @default(PRACTICE)
  durationMinutes     Int?
  scoresPublishedAt   DateTime?
  scoresPublishedById String?
  assessmentSessions  AssessmentSession[]
  retakeGrants        AssessmentRetakeGrant[]
}

model AssignmentSubmission {
  // …existing
  sessionId     String?            @unique
  session       AssessmentSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  autoSubmitted Boolean            @default(false)
}

/// One timed attempt. expiresAt = min(startedAt + duration, dueAt). The draft is the student's own answers only.
model AssessmentSession {
  id            String   @id @default(cuid())
  assignmentId  String   // FK Assignment, cascade
  studentId     String   // FK User, cascade
  attemptNo     Int
  startedAt     DateTime @default(now())
  expiresAt     DateTime
  draftAnswers  Json     @default("[]")
  draftSavedAt  DateTime?
  status        AssessmentSessionStatus @default(OPEN)
  retakeGrantId String?  @unique
  @@unique([assignmentId, studentId, attemptNo])
  @@index([status, expiresAt])
}

/// Append-only teacher permission for one extra attempt; consumed by the session it opens.
model AssessmentRetakeGrant {
  id           String   @id @default(cuid())
  assignmentId String   // FK Assignment, cascade
  studentId    String   // FK User, cascade
  grantedById  String
  reason       String
  createdAt    DateTime @default(now())
  consumedAt   DateTime?
  @@index([assignmentId, studentId, createdAt])
}
```

Existing rows get `assessmentType = PRACTICE` by default: no behaviour change for history.

## Session rules (T1)

- **Start** `POST assignments/:id/sessions` (STUDENT, target, graded only, `Idempotency-Key` honoured). Under lock
  `assignment-deadline:<id>`: finalize this student's expired sessions; if an `OPEN` unexpired session exists return
  it (200, resume); else allowed attempts = 1 + grants; used = sessions count; `used ≥ allowed` → 409
  `ASSESSMENT_ATTEMPT_USED`; `now ≥ dueAt` → 409 `ASSESSMENT_CLOSED`; the oldest unconsumed grant is consumed by the
  new session. Response: `{ session: { id, attemptNo, startedAt, expiresAt, draftAnswers, status }, serverNow, content }`.
- **Draft** `PUT assignments/:id/sessions/:sessionId/draft` body `{ answers }` (test: `[{questionId, optionId}]` ≤ 100;
  written: `[{promptId, text}]` ≤ 5, text ≤ 20 000). Only the owner's `OPEN` session before `expiresAt + 30 s`;
  otherwise 409 `ASSESSMENT_SESSION_CLOSED`. Stores `draftAnswers`, `draftSavedAt`. Client sends every 20 s and on
  every change after a 2 s debounce.
- **Submit** `POST assignments/:id/submissions` with `sessionId` (required for graded, forbidden for PRACTICE → 400
  `ASSESSMENT_SESSION_REQUIRED` / `ASSESSMENT_SESSION_NOT_ALLOWED`). Accepted while the session is `OPEN` and
  `now ≤ expiresAt + 30 s`; else 409 `ASSESSMENT_SESSION_CLOSED`. Graded TEST accepts unanswered questions (they score
  as wrong; unknown or repeated ids are still 400 `TEST_ANSWERS_INVALID`); graded written accepts empty responses
  (stored `""`, `maxChars` still enforced). `timing` is always `ON_TIME`, `lateReason` forbidden. The session becomes
  `SUBMITTED` in the same transaction.
- **Auto-submit** `finalizeExpiredSessions(tx, filter)`: every `OPEN` session with `now > expiresAt + 30 s` becomes a
  submission from its `draftAnswers` with `autoSubmitted = true`, `submittedAt = expiresAt`, then `SUBMITTED`.
  Idempotent through `AssignmentSubmission.sessionId @unique`. Runs (a) lazily before every student/teacher read or
  write of a graded assignment, (b) in `AssessmentSessionSweeper` every 60 s (disabled when `NODE_ENV=test` or
  `ASSESSMENT_SWEEPER_ENABLED=false`).

## Result visibility (T1)

`deadlineStates(db, assignments, studentIds, now, { revealResults? })` reads `assessmentType` and `scoresPublishedAt`
itself. Unless `revealResults === true` (teacher routes only), a graded unpublished assignment returns submissions with
`score = null`, `correctCount = null`, `grade = null` and `resultHidden = true`. Teacher callers:
`assignments.service` (test/written status), `class-progress.controller`, `class-evidence.controller`. Student and
parent callers keep the default. The student assignment detail of a hidden TEST never contains `correctOption` or
`explanation` (already true) nor per-question correctness.

Every state gains `assessment: { type, coefficient, durationMinutes, attemptsAllowed, attemptsUsed, openSession,
resultPublished }` (student routes) — absent for PRACTICE-only consumers is not allowed: PRACTICE returns
`{ type: "PRACTICE", ... }` too.

## Teacher routes (T1)

| Route | Body | Result / errors |
|---|---|---|
| `POST classes/:id/assignments` | + `assessmentType?` (default PRACTICE), `durationMinutes?` | 400 `ASSESSMENT_TYPE_UNSUPPORTED`, 400 `ASSESSMENT_DURATION_INVALID` |
| `POST classes/:id/assignments/:aid/retake-grants` | `{ studentId, reason (1–500) }` + Idempotency-Key | 201 grant; 404 non-target; 409 `ASSESSMENT_NOT_GRADED`; 409 `ASSESSMENT_RETAKE_PENDING` if an unconsumed grant exists; notifies the student `ASSESSMENT_RETAKE_GRANTED` |
| `POST classes/:id/assignments/:aid/publish-scores` | `{}` + Idempotency-Key | 200 `{ scoresPublishedAt }`; 409 `ASSESSMENT_NOT_GRADED`; already published → 200 same value; notifies targets with a submission `SCORES_PUBLISHED` |
| `GET …/test-status`, `GET …/written-status` | — | + `assessment` block and per-row `session: { startedAt, submittedAt, autoSubmitted, durationUsedSeconds }`, `retakePending` |

Audit actions: `assignment.create` (+ `assessmentType`, `durationMinutes`), `assessment.session.start`,
`assessment.submit` (`autoSubmitted`), `assessment.retake.grant`, `assessment.scores.publish`.

## TAI7-T1 decisions (2026-11-15, implementation)

- A session-less body on a graded assignment answers 400 `ASSESSMENT_SESSION_REQUIRED` even when it would also fail the
  PRACTICE schema (checked only after the schema fails, so PRACTICE error order is unchanged).
- Class-wide deadline revisions stay allowed on graded work (they move the start window); `LateDecision` never applies
  because graded submissions are always `ON_TIME`. SPEC constraint updated accordingly.
- A submission received inside the 30 s grace gets `submittedAt = expiresAt`; auto-submission also uses `expiresAt`.
- The paper (questions / prompts) is returned to the student only inside an open session or after publication.
- `publish-scores` first auto-submits expired sessions, then sets `scoresPublishedAt`; sessions still running when the
  teacher publishes show their result as soon as they are submitted.
- Every submission view carries `score10` (null when hidden) and `resultHidden`; the current one also carries
  `autoSubmitted`. Teacher routes pass `revealResults: true`; every other caller of `deadlineStates` is hidden by default.
- New notification types `ASSESSMENT_RETAKE_GRANTED`, `SCORES_PUBLISHED`; audit allowlist gains assessment fields.
- The sweeper (`AssessmentSessionSweeper`, 60 s) is off when `NODE_ENV=test`, under Vitest, or with
  `ASSESSMENT_SWEEPER_ENABLED=false`.

## TAI7-T2 decisions (2026-11-15, implementation)

- Rule text, thresholds and boundaries live in `../spec-teacher-ai-evidence-insights/insight-rules.md` ("insights@4").
- Retirement is applied in the service, not the engine: `evaluateActiveInsights` stays the pure union of every active
  version; `applyRetirement` hides `insights@1 SCORE_CHANGE_UNUSUAL` on the read and acknowledge paths; replay of a
  stored version is untouched. `InsightsConfig.includeRetired` is test-only (never parsed from the environment).
- The uncommitted `insights@1` retake label (`values.context`, `SCORE_CHANGE_RETAKE` copy, FE `insightBadge`) is kept:
  it changes no fingerprint and still applies when an acknowledged insight is replayed.
- `AssessmentFact` reuses the loader's queries (assignment select gains `status`, `assessmentType`,
  `scoresPublishedAt`, `dueDate`, `createdAt`, `targets`; quiz select gains `assignmentId`; test submissions gain
  `correctCount`/`questionCount`; written grades gain `totalPoints`/`maxPoints`). Query count and stages unchanged.
- Written practice uses the teacher grade of the current submission (only the current submission is gradeable), not
  the first submission.
- FE shows insights@4 evidence as "kind · title · type · 6,7/10" or "· chưa làm"; 10-point scores always show one
  decimal ("8,0/10"); averages up to two ("4,95/10").

## TAI7-T3 decisions (2026-11-15, implementation)

- Migration `20261115140000_tai07_gradebook` (expand-only, idempotent): `Assignment.gradebookLockedAt/ById`,
  `gradebookLockVersion` (default 0, CHECK lock ⇒ version ≥ 1); `GradebookEntry` (unique assignment + student +
  lockVersion; CHECK `ABSENT` ⇔ `score10` null, `GRADED`/`ZERO_REJECTED` score in [0, 10], `DECIMAL(3,1)`). Apply it
  together with `20261115090000_tai07_assessment_mode`.
- Routes (owner teacher, `GradebookController`): `GET …/gradebook`, `POST …/gradebook/quick-approve`
  (`{ submissionIds? }`), `POST …/gradebook/lock`, `POST …/gradebook/unlock` (`{ reason }` 1–500, in `AuditLog.reason`),
  `GET …/gradebook/export.csv?format=vn|standard`.
- Row status: `NOT_STARTED`, `IN_PROGRESS`, `AWAITING_GRADE`, `LATE_REVIEW_PENDING`, `GRADED`, `ZERO_REJECTED`,
  `ABSENT` (past due, nothing submitted, no open session; never an automatic zero). Total on the 10-point scale from raw
  points (T4 adds MCQ + lab + written).
- Class-list order = Vietnamese convention: given name (last word), then full name, then username (collator `vi`).
  Used by the table and the CSV.
- Quick-approve is a teacher action: only current, gradeable, ungraded written submissions with a VALID assist-mode
  suggestion of the answered version; each goes through `assertGradeable`, `buildWrittenGrade` and
  `assertGradeMatchesSuggestion` via the shared `appendWrittenGrade` (the manual grade route uses the same writer).
  Skips carry a reason (`ALREADY_GRADED`, `NO_SUGGESTION`, `SUGGESTION_NOT_VALID`, guard codes); nothing is written for
  a skipped row. One `gradebook.quick_approve` audit row plus one `written_grade.create` per grade.
- Similarity flag = strongest match (HIGH > ELEVATED) of the student's current submission in the newest run, with the
  other student and whether a teacher review exists. Teacher-only.
- Lock refuses with 409 `GRADEBOOK_NOT_READY` (details: student + status) while any row is `NOT_STARTED`,
  `IN_PROGRESS`, `AWAITING_GRADE` or `LATE_REVIEW_PENDING`; expired sessions are auto-submitted first. While locked:
  grade route, quick-approve and retake grants answer 409 `GRADEBOOK_LOCKED`. Unlock keeps the snapshot as history; the
  next lock writes version n+1.
- CSV reads only the current locked snapshot (409 `GRADEBOOK_NOT_LOCKED` otherwise): UTF-8 BOM, CRLF,
  `STT;Tên đăng nhập;Họ và tên;Điểm;Ghi chú`. `vn` (default) = `;` + decimal comma, which Vietnamese-locale Excel splits
  into columns; `standard` = `,` + decimal point. Absent = empty score + "Vắng"; rejected late = 0 + note. Cells starting
  with `= + - @` are prefixed with `'`. File name: ASCII fallback + RFC 5987 UTF-8 name.
- FE `Gradebook.tsx` (opened by "Bảng điểm" on test/written cards): summary chips (đã nộp, vắng, đang làm/chưa làm, TB
  lớp, chờ chấm, gợi ý AI sẵn sàng, cờ trùng lặp), filter (chờ chấm, AI hợp lệ, có cờ, theo trạng thái), sort (danh sách
  lớp, điểm ↑↓, trạng thái), diacritic-insensitive search, per-row Chấm/Sửa điểm, Duyệt AI, Cho làm lại; bulk "Duyệt
  nhanh gợi ý AI", "Chốt sổ điểm", "Mở khóa sổ", "Xuất bảng điểm CSV" (format choice).

## TAI7-T5 decisions (2026-11-15, implementation)

- **Request** (`POST classes/:id/ai-jobs`, strict union branch on `purpose`): `{ purpose: "GENERATE_ASSESSMENT", lessonId,
  assessmentType: REGULAR_15M | MIDTERM_45M, matrix: { RECALL, UNDERSTAND, APPLY } (integers, sum 100),
  sections: { mcqCount 0–20, writtenCount 0–3, lab: { labId, releaseId, challengeId } | null }, instruction?,
  confirmedCredits? }`. At least two sections, at most 24 slots. Stored `request.itemCount` = slots (prices the job).
  Defaults per column (the FE mirrors them, the teacher may change every number): 15 minutes = 6 MCQ + 1 written, 40/40/20;
  45 minutes = 10 MCQ + 2 written (+ Lab if wanted), 30/40/30.
- **Blueprint (server, pure, `assessment-blueprint.ts`)**: levels per item by largest remainder (a 0% level never gets an
  item); the Lab is always APPLY; written questions take the highest levels left; MCQ takes the rest. Points in cents:
  Lab 2,00; written 4,00 when there is also MCQ (otherwise the rest after the Lab); MCQ the remainder split to the cent;
  written budgets move in half points (rubric criteria do). Every combination sums to exactly 1000 cents (tested).
- **The model never decides levels, counts or points.** It writes one item per slot and echoes the slot number; levels and
  points are taken from the blueprint. Survivors of validation are re-allocated with the same function, so the total stays
  10,00 even when slots are dropped. Written rubrics are fitted to their question's budget (`fitRubric`: exact rubrics are
  kept as written; otherwise at least 1,0 per criterion and the rest by the model's own weights, anchors rescaled). The final
  gate is `normalizeExam` itself, so everything stored is accepted by the resources route.
- **Output**: one `AiJobItem` with `payload = { content: { questions, prompts, labs }, review: { matrix: { requested, target,
  actual }, totals, items[{ section, index, cognitiveLevel, points, sourceRefs, flags }] } }` and job-level `flags`
  (`SLOTS_DROPPED`, `MATRIX_DRIFT`, `RUBRIC_RESCALED`, `LAB_PROMPT_FALLBACK`, `BATCH_DUPLICATE`, `NUMERIC_REVIEW`,
  `ANSWER_LENGTH_CUE`, `NEGATIVE_STEM`). `validCount` in the job view counts surviving slots, `droppedCount` the dropped ones.
- **Lab**: chosen by the teacher from the same eligible list as the EXAM editor and the publisher (`eligible-labs.ts`,
  extracted unchanged from `assignableContent`); otherwise 400 `EXAM_LAB_UNAVAILABLE`. This replaces the ticket's "lab
  allowlist via TAI-06 selectLabContext": AI never picks a Lab. The model only writes the practical prompt; a missing or
  unsafe one falls back to the challenge objective (`LAB_PROMPT_FALLBACK`).
- **No materialize** (decision of this story): item decisions and materialize answer 400 `VALIDATION_FAILED`. The teacher
  loads the draft into the EXAM editor, edits it (levels, answers, rubric, points, questions) and saves through the normal
  `POST classes/:id/resources` route, which re-validates (`EXAM_POINTS_INVALID` when an edit breaks the 10,0 total). AI
  therefore never writes a `ClassResource` (AD-17).
- **Validation per slot**: MCQ reuses VR-02..VR-05 and VR-08 (`structuralDropReasons`) plus grounding in lesson passages;
  written needs a prompt, valid sources, a usable rubric and safe text; reason codes add `SLOT_MISSING` and `RUBRIC_INVALID`.
  Not JSON or not `assessment-items@1` = `OUTPUT_SCHEMA_INVALID` (retried once); fewer than two surviving sections or a paper
  `normalizeExam` rejects = `OUTPUT_VALIDATION_FAILED`.
- **Quota / credits**: per actor and purpose with the default AI config limits; `PRICED_PURPOSES` gains `GENERATE_ASSESSMENT`
  with the team-lead baseline 4 + 1 x slots (15 minutes, 7 slots = 11 credits; 45 minutes, 13 slots = 17), settled per
  surviving slot, refunded on failure and cancel; credits-contract enums and the estimate route accept the new purpose.
- **Schema**: no migration (`AiJob.purpose` and `PricingVersion.purpose` are free text, no CHECK); only a schema comment.
- **FE**: `ExamAiPanel` (lazy, teacher only) inside the EXAM creation form: grade column, counts, matrix with live level and
  point preview, Lab of the lesson, instruction, quota meter, credit estimate, polling, review (10,0 bar, matrix table,
  warnings) and "Nạp vào trình soạn đề" (confirm before replacing existing content). It is not a `<form>` (it sits inside the
  resource form) and swallows Enter in its inputs.
- **Not covered**: the written-task (`WRITTEN_TASK`) editor has no AI panel yet; golden evaluation with lecturer labels and a
  live provider run are not done (fake provider only); the Gemini response schema (`propertyOrdering`, `nullable` lab) has not
  been exercised against the real service.

## T4–T5 contracts

Detailed in each story of `tickets.md`; each story appends its decisions to this file under a `## TAI7-Tn decisions`
heading before it is marked done, as TAI-04 does.

## Frontend contract (T1)

- `classes/Assignments.tsx` assign modal: for test/written a "Loại đánh giá" radio (Luyện tập / Kiểm tra thường xuyên
  15 phút – hệ số 1 / Kiểm tra giữa kỳ 45 phút – hệ số 2) and a duration field prefilled from the policy; cards show a
  badge.
- `classes/TestAssignments.tsx`, `classes/WrittenGrading.tsx`: assessment banner, "Công bố điểm" button (confirm),
  per-student "Cho phép làm lại" (reason prompt), time used and auto-submitted marker.
- `assignments/AssignedTest.tsx`, `assignments/AssignedWritten.tsx`: start screen (1 lần làm, X phút), countdown from
  `expiresAt − (serverNow − clientNow)`, autosave 20 s, auto-submit at 0, `beforeunload` guard, "Đã nộp – chờ công bố
  điểm" when hidden.
- `assignments/StudentAssignments.tsx`: badge and hidden-result status.
