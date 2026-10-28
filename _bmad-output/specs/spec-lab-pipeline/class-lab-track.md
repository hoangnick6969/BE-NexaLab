# Class Lab track: future teacher configuration

A Class Lab is a class-private, versioned teacher resource referencing an approved Foundational release and activity. A teacher selects an approved challenge, adds instructions and narrows approved parameter ranges; they cannot change model equations, constants, scientific outputs, rubric semantics, assets, release status or approve curriculum mappings. The future ClassResource LAB extension is a reuse candidate, not implemented capability.

## Access and evidence

Active approved class members may practice a published Class Lab; the owner may preview/manage it. A scored attempt requires a snapshotted assignment target and server-side membership/assignment eligibility. Parents see only the existing authorized child summary. Other users cannot enumerate it. Class practice and assignment evidence never enter the public catalog or official Foundational course denominator. Access is checked again on launch and submit.

## Version and retention policy

At Class Lab publication pin its exact approved release and permitted configuration. When an assignment is published, pin the exact Class Lab version, release, activity/rubric, effective params and target snapshot. Later teacher edits create a new version and do not alter existing assignments.

A newer Foundational release marks an old Class Lab stale and offers an explicit teacher update. Existing published class practice and assignments may continue using their pinned version while the class resource and assignment remain eligible under their respective close/archive rules; open practice runs still expire after 24 hours. New standalone Foundational launches use the current release. Assignment submissions remain eligible while class/assignment and membership/target are active; due date marks lateness but does not close Lab submission, and no due date gives no automatic cutoff. Explicit close/archive, withdrawal, membership removal or revocation stops new submissions. No universal two-hour replacement grace. Retain model and tuple needed to reproduce historical submissions. Do not infer assignment deadlines from a Lab release activation time.

Emergency scientific/safety revocation overrides the above: block new launches and evaluations immediately, show an actionable notice to the teacher and preserve drafts and historical records for review. Already committed idempotent submissions can still return the existing receipt. A reassign or replacement is an explicit teacher operation, never silent rescoring.

## Future implementation gate

Reuse existing ClassResource ownership, revision and membership facilities if the actual implementation satisfies this contract; add schema/API only where demonstrated necessary. Class Lab implementation begins after an approved, active Foundational release exists. Test member/nonmember/teacher/parent access, resource versions, assignment snapshots, old-version retention, revocation, replay and isolation from Foundational progress. Do not represent engineering fixtures or a teacher's typed identity as review approval.

## Access matrix for future acceptance

| Operation | Owner teacher | Approved active member | Assignment target | Other teacher, pending, removed or non-member | Parent |
|---|---|---|---|---|---|
| Draft list/detail | own class only | denied | denied | denied, non-enumerating | denied |
| Published list/detail | own class | allowed | allowed | denied, non-enumerating | denied |
| Class practice launch and submit | preview only | allowed, unscored | allowed, unscored | denied | denied |
| Assignment launch and scored submit | preview only | denied unless target | allowed if eligible | denied | denied |
| Assignment results | own class | own result only | own result only | denied | authorized child summary only |

A later assignment update or teacher edit never rewrites attempts, snapshots or past progress. A Class Lab result never contributes to Foundational course progress. The matrix is a target contract and must be verified against actual implementation before release.