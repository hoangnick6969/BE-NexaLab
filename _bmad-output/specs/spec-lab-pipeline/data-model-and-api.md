# Proposed Data Model and API (additive)

All changes are **proposals for ADR-LAB-01**. None exist in code. Each one is additive. Old rows stay readable, and old columns are kept until a later contract migration.

## Schema additions

```prisma
/// Immutable runnable tuple; students always run a LabRelease (D-LP-02).
model LabRelease {
  id                 String   @id @default(cuid())
  labId              String
  version            Int
  modelRef           String
  engineVersion      String
  stateSchemaVersion Int
  activityVersionId  String           // → PracticalActivityVersion
  packVersionId      String           // → SimulationPackVersion
  params             Json             // pinned configuration (supersedes independent config activation)
  stateConstraints   Json
  rendererKey        String
  minFeRenderer      String
  digest             String
  status             String   @default("DRAFT") // DRAFT|VALIDATED|APPROVED|ACTIVE|SUPERSEDED|QUARANTINED|RETIRED
  validation         Json?
  createdById        String
  createdAt          DateTime @default(now())
  activatedAt        DateTime?
  supersededAt       DateTime?
  retiredAt          DateTime?
  quarantineReason   String?
  receipts           LabReviewReceipt[]
  @@unique([labId, version])
  @@unique([labId, digest])
  @@index([labId, status])
}
model LabReviewReceipt {
  id            String   @id @default(cuid())
  releaseId     String?
  release       LabRelease? @relation(fields: [releaseId], references: [id], onDelete: Restrict)
  kind          String   // curriculum|subject|model|safety|rights|range
  subjectType   String   // LabRelease|PracticalActivityVersion|SimulationPackVersion|Blueprint|CurriculumOutcome
  subjectDigest String
  reviewerId    String   // authenticated User.id
  role          String
  decision      String   // approved|changes_requested
  note          String?
  createdAt     DateTime @default(now())
  @@index([subjectType, subjectDigest])
}
```

Attempt (additive nullable columns):

```prisma
  labReleaseId      String?   // null = legacy
  context           String?   // FOUNDATIONAL|LESSON_STEP|CLASS_PRACTICE|ASSIGNMENT; null = legacy
  classResourceId   String?   // Class Lab version row
  execution         Json?     // {modelRef, engineVersion, params, stateSchemaVersion, releaseResolution}
```

Other small changes:
- `ClassResourceKind` adds `LAB`.
- `Lab.topicCode` gets a relation to `CurriculumTopic.code`. This needs a data check before adding the FK.
- `FoundationalCourseLesson.foundationalLabId` gets a relation to `Lab.id`.

Compatibility with existing tables:
- `SimulationConfigVersion` and `SimulationPackVersion` stay as component versions.
- Their independent `activate` endpoints become "create release draft". They remain callable for development but no longer affect student runs once a Lab has any `LabRelease`.

## API

| Route | Who | Purpose | Status |
|---|---|---|---|
| `GET /labs` | all | Catalog. Students see Labs with an ACTIVE release | exists (`src/modules/curriculum/interface/catalog.controller.ts:96-105`), filter changes |
| `GET /labs/:labId/launch` | student, teacher | LaunchEnvelope for `FOUNDATIONAL` | new |
| `GET /lessons/:lessonId/steps/:stepId/lab` | student | LaunchEnvelope for `LESSON_STEP`/`ASSIGNMENT` | exists (`src/modules/learning/interface/learning.controller.ts:390-427`), response extended |
| `GET /open-curriculum/lessons/:id` | student | Include `LAB` steps (D-LP-06) | exists (`learning.controller.ts:42-48`), filter changes |
| `GET /classes/:classId/resources/:id/launch` | member, teacher | LaunchEnvelope for `CLASS_PRACTICE`/`ASSIGNMENT` | new |
| `POST /attempts` | student | SubmitEnvelope | exists (`src/modules/labs/interface/labs.controller.ts:76-252`), contract v1 |
| `POST /simulate/:labId` | teacher, student | Preview. Accepts optional `labReleaseId` | exists (`labs.controller.ts:60-75`) |
| `POST /admin/lab-releases` | content admin | Create DRAFT from components | new |
| `POST /admin/lab-releases/:id/validate` | content admin | Run fixtures, schema, bindings, budget checks | new |
| `POST /lab-releases/:id/receipts` | reviewer role | Sign receipt on digest | new |
| `POST /admin/lab-releases/:id/activate` | release manager | APPROVED → ACTIVE, sets Lab public flags (audited) | new |
| `POST /admin/lab-releases/:id/quarantine` | admin | Block launches | new |
| `GET /admin/attempts/:id/reproduce` | admin | Replay by `labReleaseId` + `execution` | exists (`src/modules/labs/interface/admin-labs.controller.ts:191-217`), rework |
| `POST /classes/:classId/resources` kind `LAB` | owner teacher | Class Lab create/revise/publish/archive | exists for other kinds (`class-resources.service.ts:48-108`), add kind |
| `POST /classes/:classId/assignments` contentType `class_lab` | owner teacher | Scored assignment | exists for lesson/lab/test (`assignments.service.ts:35`), add type |

## Backfill / migration plan

1. Add columns and tables (no data change). Old code paths keep working.
2. For each Lab, when its first LabRelease is activated, new attempts carry `labReleaseId`/`context`. No backfill of old attempts: they stay `legacy_unverified`.
3. Extract the nested `_execution` snapshot written by the unmerged fl branch (`brownfield.md` E-03), if merged, into `Attempt.execution` by a one-off copy. Keep the JSON as written.
4. Retire the legacy-client compatibility window after FE contract v1 is deployed everywhere (date decided by PO).
