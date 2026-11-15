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

## T2–T5 contracts

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
