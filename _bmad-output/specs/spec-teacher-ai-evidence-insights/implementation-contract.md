# TAI-04 Implementation Contract

## Current evidence and required delta

B2 computes support flags on read with the pure `supportFlags()` in `src/modules/reports/application/evidence-support.ts`. It serves them from `GET classes/:classId/assignments/:assignmentId/support` and evidence detail routes in `class-evidence.controller.ts`, applying owner and approved-enrollment checks and returning the same 404 for missing and unauthorized. `labs/application/tutor.ts misconceptions()` is a separate, teacher-report heuristic and stays unchanged. TAI-04 adds `src/modules/reports/application/insights/` (rules, evidence loader, fingerprint), new read routes and an acknowledgement table. No existing table, flag or route changes.

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

All routes use `@Roles("TEACHER")` and the existing owned-class check. A missing or unowned class, a non-member student or an unknown fingerprint returns 404 `NOT_FOUND`. An archived class returns an empty `insights` list with `classArchived: true`.

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
| 404 | `NOT_FOUND` | Class, student or fingerprint not visible to caller |
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
