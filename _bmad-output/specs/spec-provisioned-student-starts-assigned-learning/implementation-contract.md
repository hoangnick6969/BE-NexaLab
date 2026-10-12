# A1 Implementation Contract

## Current evidence and required delta

Current source already exposes `POST /auth/student/login`, `POST /auth/password`, teacher-owned `POST /classes/:id/students`, `POST /classes/:id/assignments`, and student `GET /assignments`. Treat this as starting evidence, not completion. A1 must close direct-open authorization, deterministic ordering, archived state, idempotent seed behavior, stable errors, and real Supabase-backed runtime verification.

## Data contract

- Keep `User`, `Session`, `Classroom`, and approved `Enrollment` as the identity chain.
- Add `createdAt`, `updatedAt`, and validated `status: ACTIVE | ARCHIVED` to `Assignment`; existing rows migrate to `ACTIVE`.
- Preserve `contentType`/`contentId` for MVP, but validate the referenced published lesson/lab server-side on create and read.
- `studentIds=[]` means all approved students in the class; a non-empty list is an approved subset. Duplicate or out-of-class IDs fail the whole transaction.
- Seed identifiers are stable and rerunning the seed upserts the same pilot cohort rather than creating duplicates.

## Non-production seed personas

The guarded development/E2E seed creates stable IDs for these states while taking every password from environment variables:

| Persona key | Purpose | Required state |
| --- | --- | --- |
| `teacher-owner` | Provisions and assigns within the owned class | Active Teacher email account; owns `class-pilot-a` |
| `teacher-outsider` | Negative ownership tests | Active Teacher email account; owns no target resource |
| `student-temp` | Main first-login journey | Approved enrollment; username account; `mustChangePassword=true`; valid temporary-password expiry |
| `student-active` | Returning-student/session tests | Approved enrollment; permanent password; `mustChangePassword=false` |
| `student-outsider` | Cross-class/data-leak tests | Active Student in another class; no target assignment |

Use variables such as `SEED_TEACHER_OWNER_EMAIL`, `SEED_TEACHER_OWNER_PASSWORD`, `SEED_STUDENT_TEMP_USERNAME`, and `SEED_STUDENT_TEMP_PASSWORD`; `.env.example` contains obvious placeholders only. The seed may reset these fixture credentials only when the environment is explicitly non-production and `SEED_RESET_FIXTURES=true`. It never logs password hashes, database URLs, tokens, or production credentials. There is no account-picker/quick-login control in production UI.

## HTTP/UI contract

| Operation | Contract |
| --- | --- |
| `POST /classes/:id/students` | Teacher-owned class only; atomically creates Student + approved enrollment; temporary credential returned once. |
| `POST /auth/student/login` | Username/password only; returns role/session state and `mustChangePassword`; no identity enumeration. |
| `POST /auth/password` | Required before protected learning when flagged; rotates credentials and revokes other refresh sessions. |
| `POST /classes/:id/assignments` | Owned class + published content + approved target subset; creates `ACTIVE` assignment. |
| `GET /assignments` | Authenticated student only; returns applicable `ACTIVE` assignments sorted by `dueDate`, `createdAt`, `id`; includes actionable content summary and overdue flag. |
| `GET /assignments/:id` | Applicable student only; resolves the assignment and published content needed to open the first step; otherwise 404/403 without metadata leak. |

Student UI states are loading, assigned, no assignments, overdue, and recoverable error. Direct URLs never bypass applicability. The Continue action points to the server-returned first available lesson step.

Canonical student assignment item:

```ts
type StudentAssignment = {
  id: string;
  title: string;
  status: "ACTIVE";
  dueDate: string;
  overdue: boolean;
  class: { id: string; name: string };
  content: {
    id: string;
    type: "lesson";
    title: string;
    subject: { id: string; name: string };
    grade: number;
    chapter: string;
    topic: string;
    learningObjective: string;
    prerequisites: string;
    curriculum: string;
    firstStepId: string;
  };
};
```

The list response is `{ items: StudentAssignment[] }`; the detail response is `{ assignment: StudentAssignment }`. No `studentIds`, answer data, author-only fields, join code, or unrelated class metadata is returned.

## Supabase gate

- The current long-lived NestJS runtime uses the copied Supabase Session-pooler SSL URI as `DATABASE_URL`; migrations/seed use the server-only direct SSL URI as `DIRECT_URL` (Session pooler fallback only when the deployment network cannot reach the direct endpoint) through Prisma 6.19.
- Migration deploy and seed are separate commands. The seed refuses a production environment unless an explicit implementation-time safeguard permits a known non-production target.
- A1 runtime evidence records the Supabase environment, migration version, seed result, API health, and browser flow; secrets are redacted.

## Done boundary

A1 is done only when source checks and automated checks pass and the provision → password gate → assignment → assigned lesson path runs against real configured PostgreSQL/API/frontend/browser dependencies. Production stays unverified until separately deployed and exercised.
