---
id: SPEC-b1-teacher-operations
status: done  # 2026-10-15: T1–T6 done (T4 fixture lane); local + shared Supabase dev verified, production unverified; see implementation-artifacts/b1-teacher-operations-implementation.md
companions:
  - tickets.md
  - ../spec-b0-platform/SPEC.md
  - ../spec-content-foundation/SPEC.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../../../../nexalab-fe/docs/design/09-TEACHER-UX-DEFINITION.md
  - ../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md
sources:
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/increment-b-c-plan.md
---

# B1 — Teacher Operates an Owned Class and Assigns Learning

> **Open Curriculum/Class Space precedence (2026-10-18):** B1's completed assignment and class-ownership rules remain valid. The original B1 scope has no assignment-independent Class Space resource channel; class sharing is membership-scoped and separate from assignment. Teacher-created decks/study quizzes are unscored practice; explicitly assigned tests are scored work with due dates and a late-reason decision. The current follow-on scope supports direct authoring and structured-file import for decks/study quizzes/tests only; AI-generated content is deferred. Generic import does not create 3D Labs; teacher-authored Labs need a distinct simulation-authoring workflow and remain class-private for active, approved members. A teacher-approved deadline change revises the same assignment for its assigned recipients; expiry alone does not create zero, which is only recorded when the teacher rejects a late submission. Student/Teacher/Parent status and notice surfaces follow `../spec-open-learning-catalog/class-space-assignment-contract.md`; B1 tickets remain historical acceptance.

## Why

Teachers need to manage their own classes, enrollments, assignments, and teacher-specific learning variants while the platform supplies reviewed Grade 8–9 KHTN baseline content.

## Capabilities

- **CAP-1 — Owned class lifecycle:** teachers create, update, archive, and manage join settings only for their classes; success means archive immediately closes student access to that class's assignments while retaining enrollment, evidence, and history.
- **CAP-2 — Managed enrollment:** a teacher provisions students, enrolls existing student accounts, reviews join requests, and removes students; success means `pending`, `approved`, and `removed` status consistently governs access and never deletes evidence.
- **CAP-3 — Safe class join:** a student uses a teacher-issued join code and receives a pending or approved enrollment according to class policy; success means guessing is bounded, retries are idempotent, and public errors do not disclose whether a code/class exists.
- **CAP-4 — Teacher content and customization:** a teacher discovers released baseline content by grade/domain/chapter/topic/outcome and creates private variants; success means baseline and other assignments remain unchanged and science, rights, safety, and version gates are enforced.
- **CAP-5 — Assignment operations:** a teacher assigns a lesson or standalone lab to approved members or a selected subset, then updates/archives assignment metadata; success means only applicable active work appears to students and prior evidence remains traceable.
- **CAP-6 — Usable teacher workflow:** teacher screens support roster, content, assignment, loading/empty/error, and responsive states; success means each action explains its result and recoverable next step.

## Constraints

- Teacher authorization is role plus ownership of class/content; UI hiding is not authorization. A teacher may use published shared lessons in the same grade but may edit only content they own.
- Class enrollment uses `pending`, `approved`, `removed`; pending and removed students cannot access assignments. Removed-student historical evidence is not visible from that class to the teacher.
- Join code is displayed as `NL-LLLLLL-SSSSSSSSSS`, using uppercase Crockford Base32. `L` is a random opaque locator; `S` is a separate 10-character CSPRNG secret with 50 bits of entropy. Store the locator and key-versioned HMAC of the secret, never the raw secret. The code has no automatic TTL while the class is active; rotate, disable, or archive invalidates it immediately.
- Join throttling uses a shared expiring store: IP + normalized account allows 10 failures/10 minutes then locks that pair for 15 minutes; account aggregate allows 20 failures/10 minutes then locks 30 minutes; locator + IP allows 30 failures/10 minutes then locks that pair 15 minutes; endpoint + IP allows 60 attempts/10 minutes then locks 15 minutes. Never hard-lock a whole class. Success clears only the request's IP + account and locator + IP counters; aggregate abuse counters expire naturally. Invalid, disabled, rotated, and archived codes have the same public 404 body and dummy-HMAC path; any 429 remains independent of code validity.
- Archive is a closed class lifecycle state, not deletion. Evidence and history remain. Membership and assignment access close immediately.
- Teachers may customize quiz/test/question selection, approved simulation parameters/challenges, and private media. They do not edit shared baseline content. Teacher-private publish may self-review; shared/baseline publish requires editorial, subject, rights, and applicable model/safety review.
- Published structure cannot change while an active assignment or evidence depends on it; clone creates a draft with new step/question IDs, reused asset references, and `clonedFromId`.
- Assignment, join, class, enrollment, and other retryable mutations use `Idempotency-Key`; same key/payload replays the result, key reuse with different payload conflicts.
- Student only sees applicable active assignments. Archived assignment leaves the active queue but preserves history/evidence; archived content already started may continue, while not-started content follows MSG-36 behavior.
- Lesson and standalone lab assignment are both supported. Standalone lab progress counts as free practice unless assigned.
- Assignment recipients are snapshotted in normalized `AssignmentTarget` rows at creation. A later enrollment is not added automatically. An active assignment with the same class, immutable content version, identical target set, and due date is a conflict; an archived assignment or a different due date/target set may be assigned again.
- Baseline data follows the content foundation contract. Fixtures unblock UI/API development but cannot be represented as released corpus.

## Non-goals

- Parent linkage or read models; teacher evidence analytics/support flags and quiz-gate override; admin content management; AI authoring; corpus work performed by teachers; forced 3D for each topic.

## Success signal

With real dependencies, the owner teacher creates/archives a class, provisions/enrolls students, sees join requests, approves one, assigns lesson and standalone lab work, and the student sees only applicable assignments. A different teacher is denied at every class/content route; archive/removal revokes access immediately while preserving evidence; retries do not duplicate effects; changing a private variant cannot mutate a shared baseline or another assignment.

## Release gates

- Enrollment and assignment migrations require a preflight count/orphan/duplicate report. Apply the already-decided Q-B1-01 backfill and Q-B1-02 archive semantics; stop rather than guessing on unreconciled rows.
- Catalog release and coverage claim wait for Content Foundation T5; B1 class, join, assignment, and editor flows can use synthetic fixtures before then.
- Q-DATA-01 media budget, Q-DATA-02 flagship topic selection, Q-DATA-03 staffing, and Q-DATA-04 coverage acceptance remain external content-release gates.
