# Class Lab track: assignment-level Foundational release reuse

## Minimal P3.6 implementation

P3.6 implements Class Lab reuse through the existing class `Assignment` and LabRun routes; it does not create a separate reusable `ClassResource` Lab entity. A teacher selects a currently active, eligible Foundational release and one challenge contained in that release. New Lab assignments persist an immutable execution snapshot and digest, including release ID/digest, model, pack/config/activity versions, effective parameters and selected challenge. Assignment `contentVersion` is the release digest. Later activations or edits do not change that assignment's tuple.

The teacher may choose the released activity/challenge and set ordinary assignment details/targets. They cannot change model equations, constants, scientific outputs, rubric semantics, assets, release status, effective scientific parameters or approve curriculum mappings. No extra Lab-specific configuration editor is part of this slice.

Legacy Lab assignments remain unpinned and are not backfilled. Their existing compatibility route is preserved and explicitly identified at launch as `LEGACY_UNPINNED_LAUNCH`; new assignments require a complete active release snapshot. The release itself must remain available and not quarantined/revoked for a new launch/evaluation. Attempt replay uses the persisted execution tuple and does not consult current active versions.

This is assignment-scoped Class Lab reuse, not a class-private resource library. A later `ClassResource` LAB extension remains a separate product decision and must not be inferred from the current implementation.

## Access and evidence

Active approved class members may practice a published Class Lab; the owner may preview/manage it. A scored attempt requires a snapshotted assignment target and server-side membership/assignment eligibility. Parents see only the existing authorized child summary. Other users cannot enumerate it. Class practice and assignment evidence never enter the public catalog or official Foundational course denominator. Access is checked again on launch and submit.

## Version and retention policy

At Class Lab publication pin its exact approved release and permitted configuration. When an assignment is published, pin the exact Class Lab version, release, activity/rubric, effective params and target snapshot. Later teacher edits create a new version and do not alter existing assignments.

A newer Foundational release marks an old Class Lab stale and offers an explicit teacher update. Existing published class practice and assignments may continue using their pinned version while the class resource and assignment remain eligible under their respective close/archive rules; open practice runs still expire after 24 hours. New standalone Foundational launches use the current release. Assignment submissions remain eligible while class/assignment and membership/target are active; due date marks lateness but does not close Lab submission, and no due date gives no automatic cutoff. Explicit close/archive, withdrawal, membership removal or revocation stops new submissions. No universal two-hour replacement grace. Retain model and tuple needed to reproduce historical submissions. Do not infer assignment deadlines from a Lab release activation time.

Emergency scientific/safety revocation overrides the above: block new launches and evaluations immediately, show an actionable notice to the teacher and preserve drafts and historical records for review. Already committed idempotent submissions can still return the existing receipt. A reassign or replacement is an explicit teacher operation, never silent rescoring.

## Verified implementation boundary and remaining gate

The assignment pin uses the existing nullable `Assignment.labExecution` JSON and digest; no new Class Lab table or migration was added. The isolated integration test covers teacher assignment creation, selected challenge pinning, several students/runs inheriting tuple A after later pack/config/model activation, run-bound submission, persisted attempts and reproduction, unauthorized target rejection, expiry/due-date eligibility, explicit archive, pack revocation, idempotent replay, and compatibility for historical unpinned assignments.

The test uses synthetic local release data and is technical evidence only. It does not satisfy the prerequisite of a genuinely approved active Foundational release. Real review, production activation, real-browser assignment flow, and class membership/access checks remain independent gates. Class practice without an assignment is not part of this slice.

## Access matrix for future acceptance

| Operation | Owner teacher | Approved active member | Assignment target | Other teacher, pending, removed or non-member | Parent |
|---|---|---|---|---|---|
| Draft list/detail | own class only | denied | denied | denied, non-enumerating | denied |
| Published list/detail | own class | allowed | allowed | denied, non-enumerating | denied |
| Class practice launch and submit | preview only | allowed, unscored | allowed, unscored | denied | denied |
| Assignment launch and scored submit | preview only | denied unless target | allowed if eligible | denied | denied |
| Assignment results | own class | own result only | own result only | denied | authorized child summary only |

A later assignment update or teacher edit never rewrites attempts, snapshots or past progress. A Class Lab result never contributes to Foundational course progress. The matrix is a target contract and must be verified against actual implementation before release.

## Class resources implementation evidence — 2026-11-05

Class Space supports versioned private LAB, DOCUMENT, REPORT_TEMPLATE and LINK resources alongside cards/quizzes/tests. LAB authoring supplements an approved release with teacher objectives, instructions and report prompts; the server constructs and pins the scientific execution. Published versions and assignment/run pedagogical snapshots are immutable. Revisions create drafts; source upgrades are explicit. Assignment identity remains contentType=lab and contentId=source.labId.

Approved active members may launch unscored CLASS_PRACTICE runs with a 24-hour lifetime. Resource/class archival or membership withdrawal blocks new practice access; issued assignments retain their independent eligibility lifecycle. Class practice is excluded from Foundational and official Lab projections. Documents/templates use owned READY PDF/PNG/JPEG/MP4 versions or HTTPS links. Native Office uploads, URL fetching, Google OAuth, new report grading and public release changes are excluded. Drive permissions remain external.

Both additive migrations were applied to dedicated loopback PostgreSQL. Focused class/asset/progress/event suites passed (54 tests, including synthetic lifecycle integration); BE and FE lint/build passed. These establish contract mechanics, not scientific approval, production scanning/storage readiness, deployment or rendered mobile/keyboard acceptance. Teacher private preview renders the compatible pinned source activity and teacher content without a student run or simulation request. Full-file Hallmark lint identifies existing committed CSS failures outside the added resource styles; browser verification remains a separate gate.

This evidence extends the prior assignment-only slice described above; earlier statements excluding standalone class practice describe that earlier slice.

Local browser verification also completed against TEST ONLY loopback fixtures: teacher created/published a Drive-linked report template, forked a customized Circuit activity and assigned it; a student launched and completed CLASS_PRACTICE with server receipt and persisted passed attempt without assignmentId. At 390x844, inspected Class Lab and practice pages had no horizontal overflow; Space operated the switch. This is local technical evidence, not representative-device or production acceptance.
