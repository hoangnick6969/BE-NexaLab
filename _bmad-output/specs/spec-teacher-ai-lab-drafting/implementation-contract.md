# TAI-06 Implementation Contract

## Current evidence and required delta

These pieces exist today:

- `CHALLENGE_PARAMETERS` in `src/modules/lessons/application/lesson-content.ts` allowlists `circuit`, `chemistry` and `eye`. Each has typed number/choice parameters with ranges and steps, and `rangeReview: "pending"`.
- `challengeParamErrors(labId, params)` validates the parameters, and `challengeObjective(labId, params)` writes the student objective.
- `lessons.controller.ts` validates the parameters in `assertTaxonomy` and upserts a variant `Challenge` in `writeSteps` on publish. A lesson with attempts is structure-locked.
- `labs/application/simulation-versions.ts evaluate()` runs the allowlisted model server-side. `SimulationPackVersion.template` carries `ranges` and `goldenCases` (`state`, `expectedVerdict`), and `SimulationConfigVersion.goldenCases` carries `labState`.

The required delta:

1. Extract the challenge-variant validation and write logic from `lessons.controller.ts` into a lessons application function. The `ai` module never imports a controller, and the existing route behavior is unchanged (route manifest identical).
2. Add the `DRAFT_LAB_CHALLENGE` purpose to the TAI-01 runtime.

## Data contract (delta to TAI-01)

- `AiJob.targetKind` becomes nullable (expand-only). Non-resource purposes store null.
- `AiJob.appliedLessonId String?` and `AiJob.appliedItemId String? @unique` record the single apply.
- Proposals are `AiJobItem` rows (`payload` per the schema below, `flags` containing engine results). Decisions reuse `AiItemDecision` with `ACCEPTED` meaning applied and `REJECTED`. `EDITED` is not allowed. A teacher who wants different values edits the lesson through the existing editor.
- No change to `Lesson`, `Lab`, `Challenge` or simulation tables.

## Input snapshot (`lab-challenge-input@1`)

```ts
{
  lesson: { id, title, grade, domain, topic, learningObjective };
  passages: Array<{ id: string; text: string }>;     // TAI-01 passage builder
  outcomes: Array<{ code: string; statement: string }>;
  models: Array<{                                     // only rangeReview === "approved"
    labId: string; modelRef: string;
    params: Record<string, { kind: "number"; min: number; max: number; step: number; unit: string; label: string }
                         | { kind: "choice"; options: Array<{ value: string; label: string }>; label: string }>;
    packRanges?: Record<string, { min: number; max: number }>;
  }>;
  instruction: string | null;                         // ≤ 1000 chars
}
```

When `models` is empty, create returns 409 `AI_NO_APPROVED_MODELS` and no job is created.

## AI output schema (`lab-challenge-proposals@1`)

```ts
type LabChallengeProposalsV1 = {
  proposals: Array<{
    labId: string;                                  // must be in snapshot.models
    challengeParams: Record<string, number | string>;
    rationale: string;                              // 1–500 chars, teacher-only
    outcomeCodes: string[];                         // ⊆ snapshot outcomes
    sourceRefs: string[];                           // ≥1 passage id
  }>;                                               // 1–3
};
```

## Validation (drop rules, in order)

| Id | Rule | Reason code |
| --- | --- | --- |
| LV-01 | `labId` in snapshot models | `MODEL_NOT_ALLOWED` |
| LV-02 | `challengeParamErrors(labId, params)` empty | `PARAMS_OUT_OF_RANGE` |
| LV-03 | Every numeric param inside `packRanges` when present | `PARAMS_OUTSIDE_PACK_RANGE` |
| LV-04 | `sourceRefs` exist; `outcomeCodes` ⊆ snapshot | `GROUNDING_REF_INVALID` / `OUTCOME_INVALID` |
| LV-05 | Reference states available for the lab | `NO_REFERENCE_STATES` |
| LV-06 | `evaluate(labId, state, params)` gives `passed` for ≥1 reference state | `CHALLENGE_UNSOLVABLE` |
| LV-07 | … and a non-`passed` verdict for ≥1 reference state | `CHALLENGE_NOT_DISCRIMINATING` |
| LV-08 | Not identical (same `labId` and params) to another proposal or to the lesson's current `challengeParams` | `DUPLICATE_PROPOSAL` |
| LV-09 | `rationale` passes the TAI-01 safety patterns (VR-08) | `SAFETY_REJECTED` |

The kept item's `flags` holds `engineResults: [{ label, verdict }]`, the `objectivePreview` from `challengeObjective`, and the `engineVersion` and `modelRef` used. Zero kept proposals fail the job with `OUTPUT_VALIDATION_FAILED`.

## HTTP contract

Routes reuse the TAI-01 job routes (`GET`, `cancel`) and their denial rules (403 `CLASS_ACCESS_DENIED` for a missing or not-owned class, 404 for a missing job inside an owned class).

| Operation | Contract |
| --- | --- |
| `POST classes/:id/ai-jobs` | Body `{ purpose: "DRAFT_LAB_CHALLENGE", lessonId, proposalCount (1–3), instruction? }`. The lesson must be caller-authored, `TEACHER_PRIVATE`, `draft`, not structure-locked, and pass the TAI-01 class-lesson check. Otherwise 400 `LESSON_NOT_AVAILABLE` or 409 `LESSON_NOT_EDITABLE`. This is the `DRAFT_LAB_CHALLENGE` branch of the TAI-01 discriminated-union create body. Quota is counted for this purpose only; credits follow TAI-05. |
| `POST classes/:id/ai-jobs/:jobId/items/:itemId/decisions` | `{ decision: "REJECTED", reasonCode }` only. Apply uses the route below. |
| `POST classes/:id/ai-jobs/:jobId/items/:itemId/apply` | `Idempotency-Key` required. In one transaction: re-check that the lesson is editable, re-run LV-01..LV-03 against the current allowlist, set the lesson's `labId` and `challengeParams` through the lessons application function, record an `ACCEPTED` decision, and set `appliedLessonId` and `appliedItemId`. Returns the updated lesson summary and `objectivePreview`. A second apply returns 409 `AI_JOB_ALREADY_APPLIED`. |

## Error codes (added to TAI-01)

| HTTP | Code | When |
| --- | --- | --- |
| 409 | `AI_NO_APPROVED_MODELS` | No model has approved ranges |
| 409 | `LESSON_NOT_EDITABLE` | Lesson not draft, not private, not caller-authored, quarantined or structure-locked |
| 409 | `AI_PROPOSAL_NO_LONGER_VALID` | Apply-time re-validation fails (ranges or allowlist changed) |
| 409 | `AI_JOB_ALREADY_APPLIED` | Second apply |

## Audit

| Action | `after` allowlist |
| --- | --- |
| `ai_job.create` (TAI-01) | adds `purpose` |
| `ai_proposal.apply` | `jobId, lessonId, labId, challengeParams, modelRef, engineVersion` |
| `lesson.update` (existing) | unchanged, emitted by the lessons function |

## Frontend contract

The teacher lesson editor (draft, private lessons with an approved model) gets a "Gợi ý thử thách bằng AI" action that opens a panel. The panel shows the request form, job status, and proposal cards. Each card shows the lab, parameters with units, the deterministic objective preview, the engine result per reference state, the rationale marked "chỉ giáo viên thấy", and Reject or Apply. After Apply the editor reloads the lesson. The existing teacher preview (`teacher/content/:id/preview`) shows the variant. Disabled states explain "chưa có mô hình được duyệt phạm vi" and "bài học đã có bài làm".
