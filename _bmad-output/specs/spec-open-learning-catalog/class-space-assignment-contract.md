# Class Space authoring, assignment rounds, and access contract

**Status:** Scope is accepted; import formats and round-score details below are provisional where marked. This contract covers direct authoring, file import, assigned-test late handling, and class-only custom Labs. AI generation is deferred to a later sprint.

## 1. Authoring and file import

- A teacher may create a class deck, unscored study quiz, test, or custom Lab through direct authoring. Test content is scored only when explicitly assigned.
- A teacher may import structured source data using a resource-specific template. Proposed formats are CSV and XLSX; confirm the allowlist before story acceptance. Do not accept PDF or unstructured documents in this delivery.
- Import validates the complete file before persistence. Show a preview with row-level field errors; require teacher confirmation; create one draft atomically. A file with invalid rows creates no partial resource. Directly authored and imported resources use the same domain validation and publication lifecycle.
- Limit file size, row count, MIME/type allowlist, and parsing time at the API boundary. Treat filename and browser MIME as untrusted. Never execute formulas/macros. Persist neither raw files nor imported text until authorization and validation pass.
- Imported content remains a teacher-owned draft until the teacher reviews and publishes it to the selected Class Space. The import audit records actor, class, template/version, source filename, validation result, and time.
- AI provider, prompting, model safety/evaluation, source attribution for generated output, and recoverable generation failures are out of scope and deferred to the following sprint.

## 2. Assigned-test deadline and late decision

- An assigned test has one `dueAt` instant stored in UTC and displayed in the teacher/student local timezone. `submittedAt <= dueAt` is on time; a later submission is late. Missing due date is invalid for an assigned scored test.
- A student may submit a late test with a required reason. Store the test attempt and reason, mark it `LATE_REVIEW_PENDING`, and do not finalize it as an accepted score until the owning teacher decides. The student sees that the late submission is awaiting review. This state remains unachieved in the subject rollup.
- Only the teacher who owns the class assignment may decide. The decision is one of: `RESET_FOR_CLASS` or `REJECT_ZERO`. Record decision, teacher, timestamp, and optional teacher note in an audit event.
- `REJECT_ZERO` records score 0 for that student's late submission, marks the current assignment outcome unachieved, and preserves the submitted attempt/reason. It does not reset other students.
- `RESET_FOR_CLASS` starts a new round for the assignment's complete original target snapshot (the whole class when assigned to the whole class). It does not grant access to students who were not targets. Require a new due date for the round. Reopen the assignment for all those targets and notify that the class assignment was reset. Preserve all earlier attempts, scores, reasons, and decisions; do not overwrite or delete them. A later late request can trigger another reset round.
- All attempt submissions are immutable. A round identifier links each attempt and decision to the applicable class-wide reset. Server state, not client time or client status, determines late/on-time state and score. Use idempotency for submission and reset commands.
- Provisional score rule: the newest completed round is the active round; earlier scores remain history. If a target has no accepted attempt by the new round's due date, the active outcome is unresolved until the normal late decision closes it. Product confirmation is still required on whether an earlier score remains displayed during the reset and how an unanswered reset round closes.

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
4. `decideLateSubmission(assignmentId, studentId, decision)` → authorized, audited zero decision or class-wide reset with new due date.
5. `launchCustomLab` / `saveCustomLabAttempt` → membership checked at each operation; score writes additionally require target membership.

Acceptance must cover CSV/XLSX valid and invalid imports, all-or-nothing behavior, duplicate/retry safety, malformed or oversized files, teacher ownership, on-time boundary/equality, late reason required, pending rollup, reject-to-zero, reset for whole target snapshot, immutable history, repeated reset, outsiders on direct routes, pending/removed members, and target/non-target class members. No route/UI may bypass these rules.
