# TAI-02 Implementation Contract

## Current evidence and required delta

`ClassResourceKind` is `DECK | STUDY_QUIZ | TEST`. Assignments accept `contentType` `lesson | lab | test` (`assignments.service.ts`). The student endpoint `POST assignments/:id/submissions` (`learning.controller.ts`) accepts only TEST. It scores with `scoreTest`, decides timing under the `assignment-deadline:<id>` lock, and writes an immutable `AssignmentSubmission` with non-null `score`/`correctCount`. `LateDecision` and `AssignmentDeadlineRevision` reference that row, and `submissionView`/`testStates` derive the role statuses. `ParentConsent` stores purpose, version and withdrawal. Nothing models free-text answers, rubrics or teacher grades.

TAI-02 adds the written kind on top of these rows, a grade decision table, and an `ASSESS_SUBMISSION` purpose plus suggestion tables in the `ai` module from TAI-01.

## Data contract

```prisma
enum ClassResourceKind { DECK STUDY_QUIZ TEST WRITTEN_TASK }   // expand
enum GradingMode { AUTO TEACHER }
enum WrittenGradeKind { MANUAL ACCEPTED_AI EDITED_AI REJECTED_AI }
enum AiSuggestionStatus { VALID PARTIAL SUPPRESSED }

model AssignmentSubmission {
  // existing fields unchanged except:
  score        Int?          // non-null when gradingMode = AUTO (DB CHECK)
  correctCount Int?          // non-null when gradingMode = AUTO (DB CHECK)
  gradingMode  GradingMode   @default(AUTO)
  gradeDecisions WrittenGradeDecision[]
}

/// Append-only teacher grade for one TEACHER-mode submission; latest row is current.
model WrittenGradeDecision {
  id                  String               @id @default(cuid())
  submissionId        String
  submission          AssignmentSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  actorId             String
  kind                WrittenGradeKind
  basedOnSuggestionId String?              // required for *_AI kinds
  criterionPoints     Json                 // [{ promptId, criterionCode, points }]
  totalPoints         Float
  maxPoints           Float
  score               Int                  // round(totalPoints / maxPoints * 100), same 0–100 scale as TEST
  feedback            String?              // teacher-written, ≤ 2000, student-visible
  resourceVersion     Int                  // rubric version graded against
  createdAt           DateTime             @default(now())

  @@index([submissionId, createdAt])
}

/// Immutable AI suggestion produced by one ASSESS_SUBMISSION AiJob.
model AiAssessmentSuggestion {
  id               String             @id @default(cuid())
  jobId            String             @unique
  submissionId     String
  resourceVersion  Int
  mode             String             // "shadow" | "assist" at creation
  status           AiSuggestionStatus
  criterionResults Json               // see output mapping below
  flags            Json               @default("[]") // e.g. INJECTION_SUSPECTED
  createdAt        DateTime           @default(now())

  @@index([submissionId, createdAt])
}
```

- Migration order: add enums and `gradingMode` with default `AUTO`, backfill, add the CHECK `("gradingMode" <> 'AUTO') OR ("score" IS NOT NULL AND "correctCount" IS NOT NULL)`, then relax NOT NULL. A preflight counts rows and stops on any null.
- TEST code keeps reading `score` as a number. A single helper `autoScore(row)` throws when it meets a `TEACHER` row, so mixing kinds fails loudly instead of rendering `null`.
- `AiJob.purpose = "ASSESS_SUBMISSION"`: `lessonId` is the resource's lesson, `targetKind = WRITTEN_TASK`, and `request = { submissionId }`. `AiJob` gains a nullable `submissionId` FK (`onDelete: Cascade`), set only for this purpose. That way the redacted text in `inputSnapshot` is deleted together with its submission.

## WRITTEN_TASK content contract

Validated by a new `normalizeResourceContent("WRITTEN_TASK", …)` branch:

```ts
type WrittenTaskContent = {
  prompts: Array<{
    id: string;                  // server-generated
    prompt: string;              // 1–2000 chars
    maxChars: number;            // 100–5000
    referenceAnswer?: string;    // 0–2000; teacher-only; sent to the provider as grading guidance
    commonPhrases?: string[];    // 0–20, each 1–200; teacher-only; excluded by TAI-03 similarity
    criteria: Array<{
      code: string;              // /^[A-Z][A-Z0-9_]{1,31}$/, unique within prompt
      description: string;       // 1–500
      maxPoints: number;         // 1–10, multiple of 0.5
      anchors: Array<{ points: number; description: string }>; // 2–5, points ascending, first 0, last = maxPoints
    }>;                          // 1–6
  }>;                            // 1–5
};
```

Teacher-only fields are `anchors`, `referenceAnswer` and `commonPhrases`. Every student- or parent-facing projection builds written content with one allowlist helper, `studentWrittenTaskContent(content)` in `classes/application`, returning only `{ prompts: [{ id, prompt, maxChars, criteria: [{ code, description, maxPoints }] }] }`. Stripping by denylist is not allowed, because `studentResource` currently returns non-TEST content unchanged. The helper is the only source for:

- `studentResource("WRITTEN_TASK", …)` (class resource reads by members).
- The student assignment detail and submit response in `learning.controller.ts` (the written counterpart of `studentTestContent`).
- The student `AWAITING_GRADE` / `GRADED` view, which shows score and teacher feedback against the graded resource version.
- Parent views, which return status only and no content.

A contract test serializes every student and parent response for a written assignment and asserts that the keys `referenceAnswer`, `anchors` and `commonPhrases` appear nowhere in the body.

CSV import does not support `WRITTEN_TASK` (`IMPORT_KIND_UNSUPPORTED`).

**TAI2-T1 decisions (2026-11-06):**

- Migration is only `ALTER TYPE "ClassResourceKind" ADD VALUE IF NOT EXISTS 'WRITTEN_TASK'`; `schema.prisma` adds only `WRITTEN_TASK`. The shared dev database also carries `LAB`, `DOCUMENT`, `REPORT_TEMPLATE` and `LINK` from another branch; they are not added here.
- Members of the class read a published `WRITTEN_TASK` through `studentWrittenTaskContent` (as specified). Submitting before an assignment exists is prevented by `contentType: "written"` in TAI2-T2.
- `savePractice` rejects `WRITTEN_TASK` like `TEST`; written tasks are not practice.
- `qdup@1` fingerprints and `duplicateWarnings` exclude `WRITTEN_TASK` explicitly (empty list).
- Item counts (audit, views, FE) use `content.prompts.length` for `WRITTEN_TASK`.
- Rubric rules beyond the type above: anchor `points` are multiples of 0.5 within `[0, maxPoints]` and strictly ascending, first 0 and last `maxPoints`; anchor `description` 1–300 chars; `maxChars` is an integer. Violations return `400 RUBRIC_INVALID` with `details: [{ path, message }]`.
- CSV preview and import return `400 IMPORT_KIND_UNSUPPORTED` for `WRITTEN_TASK`, and the FE import tab does not offer it. Assignments, submissions and the Teacher AI panel are unchanged in T1.

## Student answer contract

`POST assignments/:id/submissions` branches on `contentType`. Written body:

```ts
{ responses: Array<{ promptId: string; text: string }>; lateReason?: string } // .strict()
```

- Every prompt is answered exactly once. Text is trimmed, at least 1 char and at most that prompt's `maxChars`. Otherwise `400 WRITTEN_RESPONSES_INVALID`.
- Stored in `answers`, with `gradingMode = TEACHER`, `score = null`, `correctCount = null`, `questionCount = prompts.length`, and the same timing, late-reason, lock, idempotency, audit and notification behavior as TEST.

## Status derivation

| Submission state | Student/parent status | Score shown |
| --- | --- | --- |
| `LATE` without decision | `LATE_REVIEW_PENDING` | none |
| `REJECT_ZERO` | `REJECTED` | 0 |
| gradeable, no grade decision | `AWAITING_GRADE` (new) | none |
| gradeable, latest grade decision | `GRADED` (new) | latest decision `score` + `feedback` |

Gradeable means `ON_TIME` or `ACCEPTED_BY_EXTENSION`. The latest submission remains current, as for TEST. A new submission resets the current status to `AWAITING_GRADE`, while earlier grades stay in history.

## HTTP contract

All teacher routes require owner (`ownedClass`): a missing or not-owned class returns the same 403 `CLASS_ACCESS_DENIED`; a missing or foreign row inside an owned class (assignment, submission, job, suggestion) returns 404. Every mutation requires `Idempotency-Key`.

| Operation | Contract |
| --- | --- |
| `POST/PUT classes/:id/resources` with `kind: WRITTEN_TASK` | Existing routes; new content branch. |
| `POST classes/:id/assignments` with `contentType: "written"` | Published `WRITTEN_TASK` of the class; `dueDate` required; targets immutable; deadline revision 1 written. Same rules as `test`. |
| `POST assignments/:id/submissions` | Student; written body above. |
| `GET classes/:id/assignments/:aid/written-status` | Recipients with current submission, status, latest grade, and (assist mode only) latest suggestion summary. |
| `GET classes/:id/assignments/:aid/submissions/:sid` | Full responses, rubric with anchors, grade history, suggestions (assist mode only). |
| `POST classes/:id/assignments/:aid/submissions/:sid/grades` | Body `{ kind, criterionPoints, feedback?, basedOnSuggestionId? }`. Submission must be gradeable and current. Every criterion of the graded resource version gets points in `[0, maxPoints]` on the half-point grid. `*_AI` kinds require a suggestion of this submission in assist mode; `ACCEPTED_AI` must equal the suggestion's valid points exactly. |
| `POST classes/:id/assignments/:aid/ai-assessments` | Body `{ submissionIds: string[] }` (1–50). Creates one `ASSESS_SUBMISSION` job per eligible submission (gradeable, current, eligible under the approved legal/provider policy, consented where that policy requires consent, AI mode not `off`). Returns `{ created: AiJobView[], skipped: [{ submissionId, reason }] }`. Idempotent per key. |
| `GET classes/:id/ai-jobs/:jobId` | TAI-01 route; for this purpose returns the suggestion (hidden fields in shadow mode, see below). |
| `GET /admin/ai-assessment/evaluation?promptVersion=` | Admin-only shadow report: count, MAE (10-point), within-±1 rate, per-criterion agreement, evidence verification rate. |

Skip reasons: `NOT_GRADEABLE`, `NOT_CURRENT`, `AI_POLICY_INELIGIBLE`, `CONSENT_REQUIRED` (only when the approved legal path requires it), `AI_MODE_OFF`, `ALREADY_SUGGESTED` (same submission and prompt version). Final eligibility rules and reason codes are blocked on TAI2-T0; `ParentConsent` must not be treated as a universal legal-basis switch.

In shadow mode, teacher routes never return suggestion content or existence. The evaluation report is the only reader.

## AI output schema (`assessment-suggestion@1`)

```ts
type AssessmentSuggestionV1 = {
  criteria: Array<{
    promptId: string;
    criterionCode: string;
    suggestedPoints: number;      // half-point grid
    rationale: string;            // 1–500, teacher-only
    evidenceQuotes: string[];     // 0–3, each 5–300 chars, verbatim from the response
    uncertainty: string | null;   // ≤ 300
  }>;
};
```

Mapping and verification rules are in `assessment-validation-and-evaluation.md`. The prompt (`assess-submission@1`), provider JSON Schema and KaTeX/backslash rule `KX-01` are in `prompt-spec.md`.

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `RUBRIC_INVALID` | Content contract violation (details list fields) |
| 400 | `IMPORT_KIND_UNSUPPORTED` | CSV import for `WRITTEN_TASK` |
| 400 | `WRITTEN_RESPONSES_INVALID` | Missing, repeated, unknown or over-length response |
| 400 | `GRADE_POINTS_INVALID` | Missing criterion, out of range, off grid |
| 400 | `LATE_REASON_REQUIRED` | Existing |
| 404 | `NOT_FOUND` / `ASSIGNMENT_NOT_FOUND` | Existing denial contracts |
| 409 | `SUBMISSION_NOT_GRADEABLE` | Late pending, rejected zero, or not current |
| 409 | `SUGGESTION_MISMATCH` | `*_AI` kind without valid suggestion or `ACCEPTED_AI` points differ |
| 409 | `AI_ASSESSMENT_DISABLED` | Mode `off` or TAI2-T0 gate flag not set |
| 429 | `AI_QUOTA_EXCEEDED` | Assessment daily limit |

## Audit

| Action | `after` allowlist |
| --- | --- |
| `assignment.submit` | existing fields + `gradingMode` |
| `written_grade.create` | `submissionId, kind, score, resourceVersion, basedOnSuggestionId` (never feedback or responses) |
| `ai_assessment.request` | `assignmentId, createdCount, skippedCount` |
| `ai_job.complete` | TAI-01 fields + `suggestionStatus` |

## Frontend contract

- **Teacher:** a rubric editor in the resource editor (prompts, criteria, anchors, live max-points total). A written-status board per assignment. A grading sheet: response text beside the rubric with anchors, grade history, and in assist mode a suggestion panel with highlighted evidence quotes, invalidated criteria shown as "AI không đưa ra gợi ý hợp lệ", and accept / edit / reject actions. A "Gợi ý AI" bulk request with skipped reasons.
- **Student:** a written answer form with a per-prompt character counter, the late-reason form, and status `AWAITING_GRADE` / `GRADED` with teacher feedback only.
- **Parent:** existing read-only status, with no responses or feedback.
