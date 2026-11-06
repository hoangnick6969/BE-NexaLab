# TAI-03 Implementation Contract

## Current evidence and required delta

TAI-01 `validateItems` checks VW-01/VW-02 against the current class only, and computes on the fly. CSV import rejects duplicate rows inside one file (`parseResourceCsv`). Shared-library lessons hold quiz questions in `Lesson.questions` and in `LessonStep` quiz configs (`pathway.ts` `quizConfigSchema`), with `scope = SHARED_LIBRARY` and `synthetic` marking fixtures. After TAI2-T2, written answers are `AssignmentSubmission.answers`, an array of `{ promptId, text }` (trimmed, NFC) with `gradingMode = TEACHER`. No similarity storage exists.

**Library question source (decided 2026-11-06):** Part A reads shared-library questions only from `LessonStep` rows of type `QUIZ` and `BASIC_EXERCISE` (their `config.questions[]`), which is what students actually see. `Lesson.questions` is ignored: the QUIZ step is materialized from it (`materializeQuizQuestions`), so reading both would count each question twice. The fingerprint `itemId` is `<stepId>:<questionId>`, because question ids are unique only within one step.

TAI-03 adds a fingerprint table (Part A) and similarity run/match/review tables (Part B), all in the `ai` module. The `qdup@1` function and the fingerprint sync live in `ai/application`; the `classes`, `lessons`, `content` and `users` modules call them through that application layer inside their own transactions (application-to-application imports are allowed by `check:layers`). No provider is involved.

## Data contract

```prisma
/// Part A. One row per live question/card; rebuilt on every lifecycle change of its source.
model QuestionFingerprint {
  id             String   @id @default(cuid())
  sourceKind     String   // "CLASS_RESOURCE" | "LIBRARY_LESSON"
  sourceId       String   // ClassResource.id or Lesson.id
  sourceVersion  Int      // resource version; 1 for lessons (rebuilt on publish)
  itemId         String   // question/card id inside the source
  ownerTeacherId String?  // class owner (Classroom.teacherId); null for library; kept in sync on class reassignment
  classId        String?
  normalizedText String
  normalizedHash String
  algorithm      String   // "qdup@1"
  createdAt      DateTime @default(now())

  @@unique([sourceKind, sourceId, sourceVersion, itemId, algorithm])
  @@index([ownerTeacherId, normalizedHash])
  @@index([sourceKind, normalizedHash])
}

/// Part B. Immutable result of one run over one assignment.
model SubmissionSimilarityRun {
  id               String   @id @default(cuid())
  assignmentId     String
  actorId          String
  algorithmVersion String   // "subsim@1"
  inputDigest      String   // sha256 of sorted (submissionId, resourceVersion) of current submissions
  submissionCount  Int
  skipped          Json     // [{ submissionId, promptId, reason: "SHORT_RESPONSE" }]
  createdAt        DateTime @default(now())
  matches          SubmissionSimilarityMatch[]

  @@unique([assignmentId, algorithmVersion, inputDigest])
  @@index([assignmentId, createdAt])
}

model SubmissionSimilarityMatch {
  id            String                  @id @default(cuid())
  runId         String
  run           SubmissionSimilarityRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  submissionAId String                  // lexicographically smaller id
  submissionBId String
  level         String                  // "HIGH" | "ELEVATED"
  maxContainment Float
  perPrompt     Json                    // [{ promptId, containment, shared, spansA[], spansB[] }]
  reviews       SimilarityMatchReview[]

  @@unique([runId, submissionAId, submissionBId])
}

/// Append-only; latest row per match is current.
model SimilarityMatchReview {
  id        String                    @id @default(cuid())
  matchId   String
  match     SubmissionSimilarityMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  actorId   String
  status    String                    // "NOTED" | "DISMISSED"
  note      String?                   // ≤ 1000, teacher-only
  createdAt DateTime                  @default(now())

  @@index([matchId, createdAt])
}
```

- Fingerprint maintenance runs inside the same transaction as every change of its source (decided 2026-11-06):
  - `ClassResource`: create, update-draft, CSV import, publish, revise (the new draft gets its own rows; the published source keeps its rows), archive (deletes its rows), and the TAI-01 materialize route, which also creates a DRAFT.
  - Shared-library lessons: every status change in code re-syncs the lesson — content release publish and rollback (the previous version is archived), admin lesson quarantine/release/archive, and the users ownership resolution for a disabled teacher's lessons. A lesson keeps fingerprints only while it is `scope = SHARED_LIBRARY`, `status = "published"` and `synthetic = false`; otherwise its rows are removed.
  - `scripts/backfill-question-fingerprints.ts` is idempotent (a rerun inserts and deletes nothing) and prints source and fingerprint counts. Its npm script is guarded by `scripts/assert-isolated-db.mjs` like other database scripts; running it, or the migration, on the shared database needs a separate PO approval.
- `ownerTeacherId` is denormalized for the `(ownerTeacherId, normalizedHash)` index, so the admin class reassignment (`users` ownership resolution, `class.reassign`) updates the fingerprints of that class in the same transaction.
- The submission FKs of a match cascade on submission deletion. Runs are never edited.

## HTTP contract

Teacher-owner only (`ownedClass`): a missing or not-owned class returns the same 403 `CLASS_ACCESS_DENIED`; a missing or foreign assignment, run or match inside an owned class returns 404. Students and parents have no route. Every mutation requires `Idempotency-Key`.

| Operation | Contract |
| --- | --- |
| `POST classes/:id/resources/duplicate-check` | Body `{ kind: "DECK"\|"STUDY_QUIZ"\|"TEST", items: [{ text }] (1–100), title? }`; `title` excludes the resource's own revise lineage (same class, kind and title). Returns 200 `{ algorithm: "qdup@1", warnings: [{ index, matches: [{ level, score, flag, source: { kind, resourceId\|lessonId, title, classId?, className?, itemId } }] }], code?: "CORPUS_TRUNCATED" }`, only items with matches. Read-only, unaudited. |
| `POST classes/:id/resources`, `PUT …/:resourceId`, `POST …/import/preview` | Unchanged behavior; responses gain `duplicateWarnings` (same shape). Never blocks. |
| TAI-01 `validateItems` | Duplicate corpus loader switches to `QuestionFingerprint` scoped to the actor plus the library. Same-class and new flags `EXACT_DUPLICATE`, `NEAR_DUPLICATE`, `EXACT_DUPLICATE_ELSEWHERE`, `NEAR_DUPLICATE_ELSEWHERE` are warnings only; none block a teacher decision. |
| `POST classes/:id/assignments/:aid/similarity-runs` | Written assignment only, ≥ 2 current submissions, ≤ 200. Computes synchronously. If the same `inputDigest` and algorithm already exist, it returns that run (200) and no new run is created; otherwise it returns 201. |
| `GET classes/:id/assignments/:aid/similarity-runs` | Runs newest first, with `stale: true` when the current input digest differs. |
| `GET classes/:id/assignments/:aid/similarity-runs/:runId` | Matches with spans, current review, and student display names (owner-only). |
| `POST classes/:id/assignments/:aid/similarity-runs/:runId/matches/:matchId/reviews` | Body `{ status, note? }`; appends. |

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Body shape |
| 403 | `CLASS_ACCESS_DENIED` | Missing or not-owned class (existing `ownedClass`) |
| 404 | `NOT_FOUND` | Missing assignment, run or match inside an owned class |
| 409 | `NOT_A_WRITTEN_ASSIGNMENT` | Run on lesson/lab/test assignment |
| 409 | `SIMILARITY_INPUT_TOO_SMALL` | Fewer than 2 current submissions |
| 413 | `SIMILARITY_INPUT_TOO_LARGE` | More than 200 current submissions |

## Audit

| Action | `after` allowlist |
| --- | --- |
| `similarity_run.create` | `assignmentId, algorithmVersion, submissionCount, matchCount, replayed` |
| `similarity_match.review` | `runId, matchId, status` (never note text) |

Duplicate checks are read-only and not audited.

## Frontend contract

- **Resource editor and import preview:** an inline "Câu tương tự đã có" warning with the source title and class. The TAI-01 review list adds badges for the `*_ELSEWHERE` flags.
- **Written-status board:** a "Kiểm tra nội dung tương đồng" action opens the run view. Pairs are listed with level badges, side-by-side responses with highlighted spans, and noted/dismissed controls with a note field. The copy explicitly states that similarity is evidence for teacher review only, not a conclusion. A stale-run banner offers a rerun.
