# TAI-01 Implementation Contract

## Current evidence and required delta

Current source has owner-only `ClassResource` CRUD (`POST/PUT classes/:id/resources`, `publish`, `revise`, `archive`, CSV import) validated by `normalizeResourceContent`, an `idempotent()` helper over `IdempotencyRecord` (24 h TTL), `audit()` with allowlisted fields (`AUDIT_FIELDS` must gain the new `after` keys listed under Audit), `ownedClass()` access (unknown and foreign class both throw 403 `CLASS_ACCESS_DENIED`, `class-access.ts`), a private `assertLesson` in `ClassResourcesService` (400 `LESSON_NOT_AVAILABLE`), and an Anthropic `fetch` adapter for student hints in `labs/infrastructure/llm.ts`. TAI-01 does not reuse that adapter; it adds its own planned Gemini adapter (not approved until G-6). There is no AI module, job table, queue or quota. TAI-01 adds a new `ai` domain module under `src/modules/ai` that depends on `classes` application functions. It never calls a controller, following `docs/architecture/project-structure.md`. TAI-T2 extracts the lesson check into an exported `classes/application` function (e.g. `assertClassLesson(db, lessonId, teacherId)`) with unchanged query and error, and `ClassResourcesService` calls it; existing resource tests must stay green.

## Data contract

New Prisma models (expand-only migration; no existing table changes):

```prisma
enum AiJobStatus { PENDING RUNNING SUCCEEDED FAILED CANCELLED }
enum AiItemDecisionKind { ACCEPTED EDITED REJECTED }

model AiJob {
  id                     String      @id @default(cuid())
  classId                String
  actorId                String
  purpose                String      // "GENERATE_RESOURCE" in TAI-01
  targetKind             ClassResourceKind
  lessonId               String
  request                Json        // normalized request body (instruction included)
  inputSnapshot          Json        // passages + outcome statements actually sent
  inputDigest            String      // sha256 of stableStringify(inputSnapshot)
  promptVersion          String      // e.g. "generate-resource@1"
  outputSchemaVersion    String      // e.g. "resource-items@1"
  provider               String      // "gemini" | "fake"
  model                  String
  status                 AiJobStatus @default(PENDING)
  failureCode            String?
  attemptCount           Int         @default(0)
  leaseUntil             DateTime?
  inputTokens            Int?
  outputTokens           Int?
  droppedItems           Json        @default("[]") // [{ position, reasonCodes[] }]
  materializedResourceId String?     @unique
  createdAt              DateTime    @default(now())
  startedAt              DateTime?
  completedAt            DateTime?
  cancelledAt            DateTime?
  items                  AiJobItem[]

  @@index([actorId, purpose, createdAt])
  @@index([status, leaseUntil])
  @@index([classId, createdAt])
}

/// Immutable validated item. Never updated after the job succeeds.
model AiJobItem {
  id        String           @id @default(cuid())
  jobId     String
  job       AiJob            @relation(fields: [jobId], references: [id], onDelete: Cascade)
  position  Int
  payload   Json             // item per the output schema below, sourceRefs included
  flags     Json             @default("[]") // warning codes, see validation-rules.md
  createdAt DateTime         @default(now())
  decisions AiItemDecision[]

  @@unique([jobId, position])
}

/// Append-only; the latest row per item is the current decision.
model AiItemDecision {
  id            String             @id @default(cuid())
  itemId        String
  item          AiJobItem          @relation(fields: [itemId], references: [id], onDelete: Cascade)
  actorId       String
  decision      AiItemDecisionKind
  editedPayload Json?              // required for EDITED, forbidden otherwise
  reasonCode    String?            // required for REJECTED
  createdAt     DateTime           @default(now())

  @@index([itemId, createdAt])
}
```

- `request`, `inputSnapshot`, `promptVersion`, `outputSchemaVersion`, `provider` and `model` are written once at creation and never changed.
- `AiJob` is shared by every Teacher AI purpose. Later specs extend it only through expand-only nullable columns: TAI-02 `submissionId` (with `targetKind = WRITTEN_TASK`), TAI-05 `pricingVersionId`/`estimatedCredits`/`chargedCredits`, and TAI-06 `appliedLessonId`/`appliedItemId` with `targetKind` made nullable. For `purpose = GENERATE_RESOURCE`, `targetKind` and `lessonId` remain required by the application schema.
- `AiJobItem` rows are written in the same transaction that moves the job to `SUCCEEDED`. There are no items for any other status.
- Provenance is `AiJob.materializedResourceId`. A resource list may join it to show an "AI-assisted" badge to the owner only.

## AI output schema (`resource-items@1`)

The provider must return JSON with exactly this shape. It is parsed with Zod `.strict()`, and any parse failure counts as a failed attempt (`OUTPUT_SCHEMA_INVALID`).

```ts
type ResourceItemsV1 = {
  items: Array<QuestionItem | CardItem>; // all items match the job's targetKind family
};
type QuestionItem = {
  type: "SINGLE_CHOICE";
  prompt: string;            // 1–500 chars
  options: string[];         // 2–6, each 1–500 chars
  correctOption: number;     // index into options
  explanation: string;       // 1–1000 chars, why the key is correct
  difficulty: "FOUNDATION" | "STANDARD" | "ADVANCED";
  outcomeCodes: string[];    // subset of the snapshot's outcome codes, may be empty
  sourceRefs: string[];      // ≥1 passage id from the snapshot, e.g. "P3"
};
type CardItem = {
  type: "CARD";
  front: string;             // 1–500 chars
  back: string;              // 1–500 chars
  sourceRefs: string[];      // ≥1 passage id
};
```

`STUDY_QUIZ` and `TEST` jobs expect `SINGLE_CHOICE` items. `DECK` jobs expect `CARD` items. A wrong item type is dropped as `ITEM_TYPE_MISMATCH`.

## Input snapshot

Built server-side at job creation from the lesson the teacher selected. It must pass the same shared lesson check used by `POST classes/:id/resources` (extracted from `assertLesson`): the lesson is a published `SHARED_LIBRARY` lesson or authored by the teacher, otherwise 400 `LESSON_NOT_AVAILABLE` and no job:

```ts
type InputSnapshotV1 = {
  lesson: { id: string; title: string; grade: number; domain: string | null; topic: string; learningObjective: string };
  passages: Array<{ id: string; text: string }>; // "P1".."Pn", ≤ 1200 chars each, ≤ 40 passages
  outcomes: Array<{ code: string; statement: string }>; // requested codes, else lesson.outcomeCodes
  constraints: { targetKind: string; itemCount: number; difficulty: string | null };
  instruction: string | null; // teacher text, ≤ 1000 chars
};
```

The `Lesson` model has no `sections` column. Passages are produced deterministically, in this order: (1) `learningObjective`; (2) `content` converted to plain text (HTML stripped with the same `textOf` rule used by `lessons.controller.ts`); (3) each `LessonStep` of type `READING`, ordered by `position`, using `config.html` converted to plain text. Other step types (`VIDEO`, `STUDY_CARDS`, `QUIZ`, `LAB`, `CHALLENGE`, `BASIC_EXERCISE`) are excluded so existing questions and answer keys are never sent. Text is whitespace-collapsed, split on paragraph boundaries and packed into passages of ≤ 1200 chars; empty segments are skipped; at most 40 passages are kept, in source order. If the unmerged `p2-vid` work that adds `Lesson.sections` in the shared database (see `sprint-status.yaml` DB audit) lands, the passage source must be revisited through `.memlog.md` before the prompt version is bumped. The same lesson state always yields the same passages and `inputDigest`. `GET` responses compute `lessonChangedSinceGeneration` by rebuilding the snapshot from the current lesson and comparing digests.

## HTTP contract

All routes use `@Roles("TEACHER")` (students and parents get 403 from the role guard). The class must be owned by the caller (`ownedClass`): a missing or not-owned class returns the same 403 `CLASS_ACCESS_DENIED`, matching every existing Class Space route. Inside an owned class, a missing job, a job of another class, or a missing item returns 404 `NOT_FOUND`. An inaccessible lesson returns 400 `LESSON_NOT_AVAILABLE`. Request bodies are validated with Zod `.strict()`.

| Operation | Contract |
| --- | --- |
| `POST /classes/:id/ai-jobs` | `Idempotency-Key` **required**. Body below. Checks class `ACTIVE`, lesson access, provider configured, quota for the body's `purpose`. Creates `PENDING` job and returns **202** `AiJobView`. Same key and body replays the stored response; same key with a different body returns 409 `IDEMPOTENCY_KEY_REUSED`. |
| `GET /classes/:id/ai-jobs` | Owner's jobs for this class, newest first, cursor-paginated (`limit` ≤ 50). Items omitted. |
| `GET /classes/:id/ai-jobs/:jobId` | `AiJobView` including items, current decisions, flags, `droppedItems` summary and `lessonChangedSinceGeneration`. |
| `POST /classes/:id/ai-jobs/:jobId/cancel` | Allowed from `PENDING` or `RUNNING`, transitions to `CANCELLED`. A result arriving later is discarded. From any other status returns 409 `AI_JOB_NOT_CANCELLABLE`. Idempotent. |
| `POST /classes/:id/ai-jobs/:jobId/items/:itemId/decisions` | Job must be `SUCCEEDED` and not materialized. Body `{ decision, editedPayload?, reasonCode? }`. Appends a decision. `EDITED` payload is re-validated with the structural rules. Exact and near duplicate flags are warnings; they do not block `ACCEPTED` or materialization. |
| `POST /classes/:id/ai-jobs/:jobId/materialize` | `Idempotency-Key` required. Body `{ title }`. Requires every item decided and ≥1 `ACCEPTED`/`EDITED`. In one transaction: maps items to the target kind, calls `normalizeResourceContent`, creates the `ClassResource` DRAFT with `lessonId` = job lesson, sets `materializedResourceId`, writes audit. Returns **201** with the resource. A second materialize with a different key returns 409 `AI_JOB_ALREADY_MATERIALIZED`. |
| `GET /me/ai-quota` | `?purpose=` (default `GENERATE_RESOURCE`). `{ purpose, dailyLimit, usedLast24h, activeJobs, concurrencyLimit, resetsAt }` computed from `AiJob` rows of that actor **and purpose**. |

Create body. From TAI-T2 the schema is a Zod discriminated union on `purpose`, each branch `.strict()`. TAI-01 ships only the `GENERATE_RESOURCE` branch; later specs add branches (TAI-06 `DRAFT_LAB_CHALLENGE`) without changing it. `purpose` is required, so an unknown or missing purpose is 400 `VALIDATION_FAILED`, and it is part of the idempotency request hash.

```ts
{
  purpose: "GENERATE_RESOURCE";
  targetKind: "DECK" | "STUDY_QUIZ" | "TEST";
  lessonId: string;
  itemCount: number;            // 1–20 questions, 1–30 cards
  difficulty?: "FOUNDATION" | "STANDARD" | "ADVANCED";
  outcomeCodes?: string[];      // each must be in lesson.outcomeCodes, ≤ 10
  instruction?: string;         // ≤ 1000 chars, trimmed
}
```

`AiJobView`:

```ts
{
  id: string; classId: string; lessonId: string; targetKind: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  failureCode: string | null;
  promptVersion: string; outputSchemaVersion: string; model: string;
  requestedCount: number; validCount: number | null; droppedCount: number | null;
  usage: { inputTokens: number | null; outputTokens: number | null };
  lessonChangedSinceGeneration: boolean;
  materializedResourceId: string | null;
  createdAt: string; completedAt: string | null;
  items?: Array<{ id: string; position: number; payload: object; flags: string[];
                  decision: null | { decision: string; editedPayload: object | null; reasonCode: string | null; at: string } }>;
}
```

Clients poll `GET …/:jobId` every 2 s while `PENDING`/`RUNNING` and stop after 120 s with a recoverable "still processing" state.

## Error codes

Messages are Vietnamese, following the existing envelope.

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Body fails Zod; `outcomeCodes` not in lesson; `itemCount` out of range |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Create or materialize without key |
| 400 | `LESSON_NOT_AVAILABLE` | Lesson not published-shared and not authored by the teacher (existing shared lesson check) |
| 400 | `AI_EDIT_INVALID` | `EDITED` payload fails structural rules (details list rule ids) |
| 403 | `CLASS_ACCESS_DENIED` | Missing or not-owned class (existing `ownedClass`, same body for both) |
| 403 | role guard | Student or parent calling any AI route |
| 404 | `NOT_FOUND` | Missing job or item inside an owned class, or a job of another class |
| 409 | `CLASS_ARCHIVED` | Class not `ACTIVE` (existing `classArchived()`) |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Existing helper behavior |
| 409 | `AI_JOB_NOT_CANCELLABLE` | Cancel from terminal status |
| 409 | `AI_JOB_NOT_REVIEWABLE` | Decision or materialize on a job that is not `SUCCEEDED` |
| 409 | `AI_REVIEW_INCOMPLETE` | Materialize with undecided items or zero accepted |
| 409 | `AI_JOB_ALREADY_MATERIALIZED` | Second materialization |
| 429 | `AI_QUOTA_EXCEEDED` | Daily or concurrency limit for the request's `purpose`; body includes `purpose` and `resetsAt` |
| 503 | `AI_PROVIDER_NOT_CONFIGURED` | No provider configured; no job is created |

Job `failureCode` values (job status, not HTTP): `PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `OUTPUT_SCHEMA_INVALID`, `OUTPUT_VALIDATION_FAILED`, `LESSON_UNAVAILABLE`, `INTERNAL_ERROR`.

## Audit

| Action | `after` allowlist |
| --- | --- |
| `ai_job.create` | `classId, purpose, lessonId, targetKind, itemCount, promptVersion, model` (never instruction text) |
| `ai_job.complete` | `status, failureCode, validCount, droppedCount, inputTokens, outputTokens` (actor = system) |
| `ai_job.cancel` | `fromStatus` |
| `ai_item.decide` | `jobId, position, decision, reasonCode` |
| `ai_job.materialize` | `resourceId, resourceKind, acceptedCount, editedCount, rejectedCount` |

## Frontend contract

`FE-NexaLab/src/features/classes/` gains a Teacher AI panel inside the owned Class Space resources view: generate form → job status (loading, still processing, failed with retry-as-new-request, cancelled) → review list with per-item flags, accept/edit/reject, progress "x/y decided" → materialize dialog (title) → navigate to the existing draft editor. Exact/near duplicate items show the matched resource title and a warning; Accept remains available. A lesson change after generation shows a non-blocking warning. Quota is shown before submit.
