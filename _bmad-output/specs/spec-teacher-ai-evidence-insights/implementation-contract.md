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
  studentId   String
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
- Rows are never updated or deleted, and they cascade only through class deletion.

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

