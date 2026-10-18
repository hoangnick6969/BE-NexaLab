# Class Space authoring, assignment deadlines, and access contract

**Status:** Product scope updated 2026-10-18; implementation details remain open where identified. This contract covers direct authoring/import for study resources and tests, assigned-test deadlines and late handling, role-specific assignment status/notifications, and class-only custom-Lab access. AI generation is deferred to a later sprint.

## 1. Authoring and file import

- In this sprint a teacher may directly create decks, unscored study quizzes, and tests. A teacher-custom Lab remains a future Class Space capability and requires its own builder; do not infer builder delivery from the class-only access contract. Test content is scored only when explicitly assigned.
- File import in this delivery is limited to Quizlet/study-card decks, unscored study quizzes, and test question content using resource-specific structured templates. Proposed formats are CSV and XLSX; confirm the allowlist before story acceptance. Do not accept PDF or unstructured documents in this delivery.
- Lab creation is excluded from generic file import. There are two Lab builder tracks: (1) released curriculum Labs aligned to official chapter/topic/lesson context, starting with Grade 8 Natural Science; and (2) teacher-custom Labs linked to a Class Space lesson and that lesson's subject/grade/chapter/topic. Both need purpose-built authoring/build flows. This sprint does not implement either builder; it must preserve the taxonomy, ownership, access, versioning, and integration boundaries needed by both. Research the scientific/editorial model, simulation runtime, asset/parameter validation, preview, versioning, review, and publication before implementation. Class-only access rules in section 3 apply regardless of authoring workflow.
- Import validates the complete file before persistence. Show a preview with row-level field errors; require teacher confirmation; create one draft atomically. A file with invalid rows creates no partial resource. Directly authored and imported resources use the same domain validation and publication lifecycle.
- Limit file size, row count, MIME/type allowlist, and parsing time at the API boundary. Treat filename and browser MIME as untrusted. Never execute formulas/macros. Persist neither raw files nor imported text until authorization and validation pass.
- Imported content remains a teacher-owned draft until the teacher reviews and publishes it to the selected Class Space. The import audit records actor, class, template/version, source filename, validation result, and time.
- AI provider, prompting, model safety/evaluation, source attribution for generated output, and recoverable generation failures are out of scope and deferred to the following sprint.

## 2. Assigned-test deadline and late decision

- An assigned test has one `dueAt` instant stored in UTC and displayed in the teacher/student local timezone. `submittedAt <= dueAt` is on time; a later submission is late. Missing due date is invalid for an assigned scored test.
- A student may submit a late test with a required reason. Store the test attempt and reason, mark it `LATE_REVIEW_PENDING`, and do not finalize it as an accepted score until the owning teacher decides. The student sees that the late submission is awaiting review. This state remains unachieved in the subject rollup.
- Passing the due date without submitting does not automatically create a zero score. It remains overdue/unsubmitted until the teacher decides a late request or the assignment is otherwise closed under an explicit lifecycle rule. An in-app due-soon reminder is shown to the student; after expiry with no submission, an in-app notice is available to each explicitly linked/approved parent of that student. Parent notices are read-only and do not expose answer keys or grant assignment actions.
- Only the teacher who owns the class assignment may decide. The decision is one of: `REVISE_DEADLINE_FOR_CLASS` or `REJECT_ZERO`. Record decision, teacher, timestamp, and optional teacher note in an audit event.
- `REJECT_ZERO` records score 0 for that student's late submission, marks the current assignment outcome unachieved, and preserves the submitted attempt/reason. It does not reset other students.
- `REVISE_DEADLINE_FOR_CLASS` revises the due date on the same assignment in its owning Class Space for its complete assigned recipient set. It does not create a second assignment or grant access to students who were not targets. Notify all recipients of the new deadline. Preserve earlier attempts, scores, reasons, decisions, and deadline revisions; do not overwrite or delete them. A later late request may trigger another due-date revision.
- Every assigned recipient may submit again against the revised deadline, including students who had already submitted. Earlier attempts remain immutable and visible in history; the new submission is another attempt under the revised deadline revision.
- All attempt submissions and deadline/decision events are immutable. Link each attempt to the deadline revision that governed it. Server state, not client time or client status, determines late/on-time state and score. Use idempotency for submission and due-date revision commands.
- Preserve prior attempts and scores in history. When multiple submissions exist, the latest submitted file/attempt determines the current result. A late submission awaiting teacher review remains pending; explicit teacher rejection of that late submission records zero under the late-decision rule. An expired, unsubmitted recipient remains unscored unless the teacher explicitly rejects that student's late request; do not auto-score zero at expiry.

## 3. Custom-Lab access

- A custom Lab belongs to exactly one Class Space and links to its class lesson and stable subject/grade/chapter/topic IDs. Its access scope is the owning class, independent of assignment target.
- Every list, detail, launch, attempt-save, and result-read operation checks teacher ownership or active, approved student membership on the server. Pending, removed, and nonmember students are denied, including when they possess a URL, ID, cached link, or stale token. Denials do not disclose whether the Lab exists.
- An active, approved class member may run a class-shared custom Lab as unscored practice. If a scored assignment is created, only its snapshotted targets can submit or view scored assignment evidence. Class membership alone never grants a score or assignment record.
- Custom Labs never enter the Open Curriculum catalog or official course denominator.

## 4. Contract surfaces and acceptance

Map these domain commands to the repository's canonical API/OpenAPI conventions during story design; this document intentionally specifies behavior rather than inventing route names:

1. `previewImport(file, classId, resourceType, templateVersion)` → validation summary and row errors; no persisted resource.
2. `confirmImport(previewId)` → one authorized draft, idempotently, after a fresh server-side validation.
3. `submitTest(answers, reason?)` → on-time scored attempt or late pending-review attempt; reason is required after `dueAt`.
4. `decideLateSubmission(assignmentId, studentId, decision)` → authorized, audited zero decision or same-assignment due-date revision for all original targets; all recipients may create another immutable attempt against the revised deadline.
5. Assignment notification/status read models → student due-soon reminder, teacher upcoming/overdue and pending-review status, and parent overdue notice for an explicitly linked/approved child.
6. `launchCustomLab` / `saveCustomLabAttempt` → membership checked at each operation; score writes additionally require target membership.

Acceptance must cover CSV/XLSX valid and invalid imports for decks/study quizzes/tests, all-or-nothing behavior, duplicate/retry safety, malformed or oversized files, teacher ownership, on-time boundary/equality, late reason required, pending rollup, reject-to-zero, same-assignment due-date revision for its target set, no automatic zero at expiry, immutable attempts/deadline history, repeated revision, student/teacher/parent read models, approved parent-link authorization, outsiders on direct routes, pending/removed members, and target/non-target class members. Lab authoring is not covered by file-import acceptance; its 3D builder requires a separate design contract.
