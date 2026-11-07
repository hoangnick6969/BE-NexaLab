# TAI-04 Implementation Contract

## Current evidence and required delta

B2 computes support flags on read with the pure `supportFlags()` in `src/modules/reports/application/evidence-support.ts`. It serves them from `GET classes/:classId/assignments/:assignmentId/support` and evidence detail routes in `class-evidence.controller.ts`, applying owner (`ownedClass`, 403 `CLASS_ACCESS_DENIED` for a missing or not-owned class) and approved-enrollment checks, and returning 404 for missing evidence inside an owned class. `labs/application/tutor.ts misconceptions()` is a separate, teacher-report heuristic and stays unchanged. TAI-04 adds `src/modules/reports/application/insights/` (rules, evidence loader, fingerprint), new read routes and an acknowledgement table. No existing table, flag or route changes.

## Data contract

```prisma
enum InsightAckAction { ACKNOWLEDGED DISMISSED }

/// Append-only teacher response to one insight fingerprint. Insights themselves are never stored.
model InsightAcknowledgement {
  id          String           @id @default(cuid())
  classId     String
  classroom   Classroom        @relation(fields: [classId], references: [id], onDelete: Cascade)
  studentId   String
  student     User             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  fingerprint String
  ruleVersion String
  ruleCode    String
  evidenceIds Json             // sorted ids, kept for replay
  action      InsightAckAction
  note        String?          // ≤ 500 chars, teacher-only
  actorId     String
  createdAt   DateTime         @default(now())

  @@index([classId, studentId, createdAt])
  @@index([fingerprint, createdAt])
}
```

- The latest row per fingerprint is current. A later `ACKNOWLEDGED` after `DISMISSED` reopens nothing. Open means no row exists.
- Rows are never updated or deleted, and they cascade only through class deletion or deletion of the student. `classId` references `Classroom` and `studentId` references `User`, both `onDelete: Cascade`; `actorId` is a plain string. Append-only is enforced in code, not by a trigger.

## HTTP contract

All routes use `@Roles("TEACHER")` and the existing owned-class check. A missing or unowned class returns 403 `CLASS_ACCESS_DENIED` (same body). A non-member student or an unknown fingerprint inside an owned class returns 404 `NOT_FOUND`. An archived class returns an empty `insights` list with `classArchived: true`.

| Operation | Contract |
| --- | --- |
| `GET classes/:classId/insights?status=open\|all` | Approved students ordered by display name. Each has `{ studentId, displayName, insights: Insight[] }`, with insights ordered by `ruleCode`. The default `open` excludes fingerprints with an acknowledgement. No totals per student. |
| `GET classes/:classId/students/:studentId/insights?status=open\|all` | One student's insights, plus `acknowledgements` for fingerprints in the response. |
| `POST classes/:classId/students/:studentId/insights/:fingerprint/acknowledgements` | `Idempotency-Key` required. Body `{ action, note? }`. The fingerprint must be in the current computed set, or it returns 409 `INSIGHT_STALE`. Returns 201 with the row. |
| `GET classes/:classId/students/:studentId/insights/:fingerprint/replay` | Recomputes with the stored `ruleVersion`, using evidence created at or before the acknowledgement `createdAt`. Returns the insight, or 404 if nothing reproduces. |

`Insight` is defined in `insight-rules.md`. Responses never include other students' data, hint content or answer keys. Evidence entries carry kind, id and time only, and detail comes from the existing B2 routes.

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Bad `status` or body, or note over 500 chars |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Acknowledgement without key |
| 403 | `CLASS_ACCESS_DENIED` | Missing or not-owned class |
| 404 | `NOT_FOUND` | Student or fingerprint not visible inside an owned class |
| 409 | `CLASS_ARCHIVED` | Acknowledgement in an archived class (checked before the fingerprint) |
| 409 | `INSIGHT_STALE` | Fingerprint no longer computed (new evidence changed it) |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Existing helper |

## Audit

| Action | `after` allowlist |
| --- | --- |
| `insight.acknowledge` | `classId, studentId, ruleCode, ruleVersion, action` (never the note) |

Read routes write no audit except the existing denial policy.

## Performance

The evidence loader issues a bounded number of queries per class: one per evidence kind, plus `HintLog` max level per attempt via aggregate and lesson outcome codes. It never queries per student. Measure p95 on the B2 workload (40 students × 6 steps) and record it in the implementation artifact.

## Frontend contract

`FE-NexaLab/src/features/classes/` teacher evidence board gains an "Insights" tab and a per-student section in the evidence sheet. Each card shows the message, status chip (neutral colors only; no red/green), thresholds, evidence links into the existing B2 sheet, and Acknowledge/Dismiss with an optional note. Empty, loading, error and `NEEDS_MORE_EVIDENCE` states are explicit. The student and parent apps have no route or component for insights.

## TAI4-T2 decisions (PO, 2026-11-06)

- **No schema change in T2.** `status=open|all` both return the full computed list and `acknowledgements` is `[]` until TAI4-T3 adds `InsightAcknowledgement` and filters `open`.
- **Evidence scope.** Every assignment of the class counts, including `ARCHIVED` ones (results are immutable evidence). Only students whose enrollment is `approved` are listed and counted. Rows with a null `assignmentId` (free practice) and other classes never count.
- **TEST rows.** Every `AssignmentSubmission` with `gradingMode=AUTO` and a non-null `score` is one evidence item (resubmissions included, like each `QuizAttempt`). Rows whose status is `LATE_REVIEW_PENDING` or `REJECTED_ZERO` are dropped; `SCORED` and `ACCEPTED_BY_EXTENSION` count.
- **Outcome codes.** QUIZ through `QuizAttempt.lessonId`; PRACTICAL through `lessonStepId` → `LessonStep.lessonId`; TEST through `Assignment.contentId` → `ClassResource.lessonId`. All read `Lesson.outcomeCodes`.
- **Students without evidence** stay in the list with `INSUFFICIENT_EVIDENCE` (fewer than 3 scored items); collapsing that group is a T4 concern.
- **Archived class.** Approved students are listed with `insights: []` and `classArchived: true`; no evidence is loaded. The per-student route returns `insights: []` and `classArchived: true`.
- **Denial.** `@Roles("TEACHER")`; `ownedClass` returns 403 `CLASS_ACCESS_DENIED` for a missing or not-owned class; a student who is not an approved member returns 404 `NOT_FOUND`. B2's older evidence routes keep their `EVIDENCE_NOT_FOUND` code.
- **Visibility flag.** `INSIGHTS_SHOW_SUDDEN_UNAIDED_PASS` (`true` or `false`, default `false`, any other value stops boot) is parsed by `parseInsightsConfig` and applied by the service through `applyPatternVisibility`.
- **Loader cost.** At most two sequential stages of parallel queries (plus one lesson lookup only if a lesson is not already known), independent of the number of students. Measured in memory for 40 students × 6 steps; shared-database latency is not measured in T2.

## TAI4-T3 decisions (PO, 2026-11-07)

- **Repeated acknowledgement.** The same fingerprint may be acknowledged again with a different `Idempotency-Key`; each call appends one row and the newest row is current. There is no route to reopen an insight; it reopens only when new evidence produces a new fingerprint.
- **`status=open`** drops every insight whose fingerprint has at least one row, and the student route returns `acknowledgements: []`. **`status=all`** returns every insight with `latestAcknowledgement: { action, createdAt } | null`, and the student route returns all rows of the fingerprints in the response, newest first (fields `id, fingerprint, ruleVersion, ruleCode, action, note, createdAt`, no `actorId`).
- **POST checks, in order:** class owner (403), archived class (409 `CLASS_ARCHIVED`), `Idempotency-Key` present (400 `IDEMPOTENCY_KEY_REQUIRED`), strict body and 64-hex fingerprint (400 `VALIDATION_FAILED`), approved student (404 `NOT_FOUND`), then inside the idempotent callback the fingerprint must be in the student's current set after `applyPatternVisibility` (409 `INSIGHT_STALE`). A replayed key returns the stored row even if the insight has since changed.
- **Body** `{ action: "ACKNOWLEDGED" | "DISMISSED", note? }`, strict; `note` is trimmed and NFC-normalized, at most 500 characters, empty becomes `null`. The 201 body is the row without `actorId`.
- **Replay** uses the earliest row of `(classId, studentId, fingerprint)` as the instant. No row, an unknown `ruleVersion` or a fingerprint that is not reproduced returns 404 `NOT_FOUND`. The current pattern visibility flag applies as on the GET routes.
- **As-of evidence.** The loader takes `asOf` and keeps only evidence with `at <= asOf`, late-submission decisions with `createdAt <= asOf` (a later decision counts as absent) and hint levels from `HintLog.createdAt <= asOf`.
- **Cost.** The acknowledgement query joins stage 1 of the loader; still two stages, independent of the number of students.
- **Audit** `insight.acknowledge` with `classId, studentId, ruleCode, ruleVersion, action` (allowlist extended with `ruleCode, ruleVersion, action`); the note is never audited.
- **Migration** `20261107100000_tai04_insight_acknowledgement` is expand-only and idempotent; it is validated and generated but not deployed to the shared database until the PO approves.

## TAI4-T4 decisions (PO, 2026-11-07)

- **Placement.** A class tab "Gợi ý hỗ trợ" (`?tab=insights`) after "Theo dõi", hidden for an archived class, and a lazily loaded "insights for this student" section inside the open evidence block of the progress board. The list keeps the order the API returns; no per-student count is shown.
- **Filter and groups.** `open` is the default, `all` also shows handled insights with "Đã ghi nhận" or "Đã ẩn" and the time. Students whose insight is `INSUFFICIENT_EVIDENCE` are listed in one collapsed group; students without insights are not listed.
- **Card and copy.** Neutral wording per `ruleCode` in vi and en, neutral badge tones, thresholds, key values, evidence list and Acknowledge/Dismiss with an optional note (500 characters, counter). An unknown rule code shows the API `message`.
- **Submit flow.** One `Idempotency-Key` per opened note form. `409 INSIGHT_STALE` and `409 CLASS_ARCHIVED` show a notice and reload the list; after success the card leaves the `open` list.
- **Evidence.** QUIZ and PRACTICAL open the existing B2 detail routes and show only score or result and time. TEST has no B2 detail route: it shows kind and time and is not clickable. No backend route is added in T4.
- **Replay.** In `all`, a handled card has "Xem lại lúc ghi nhận" calling the replay route.
- **Verification.** Node tests for the pure view logic, the vi/en vocabulary scan and import isolation; browser verification on a temporary class after a separate PO approval of the data plan. No Playwright spec while live specs need seeded credentials.
