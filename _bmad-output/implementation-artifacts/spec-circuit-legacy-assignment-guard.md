---
title: 'Keep legacy Circuit assignments off the bulb candidate'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The two existing Circuit LED assignments have no execution pin, while the current active pack and config use the incompatible bulb model. Both LabRun launch and the legacy submit route can therefore select that bulb tuple for those LED assignments.

**Approach:** Reject new launches and direct submissions for unpinned Circuit assignments when they resolve to `circuit-bulb@1.0.0`. Preserve pinned assignment behavior, open Foundational Lab behavior, and all existing Assignment and Attempt rows.

</frozen-after-approval>

## Implementation Notes

- Live assignments: `pilot-a-circuit-assignment` and `cmv68v7zz00fllwdcdbhdz0hj`; both have `labExecution = NULL`.
- Current candidate tuple is `circuit-bulb@1.0.0`, release `cmvthyk9e0003lwes31d31nb0` remains DRAFT.
- Apply one shared compatibility guard to `LabsController.launchRun`, the legacy `/attempts` path, and submission of a previously created LabRun. Existing idempotent replay remains before the compatibility checks, preserving historical Attempt responses.
- Add focused route/helper compatibility coverage, including both live legacy assignment IDs, historical replay, open Foundational submission without an applicable assignment, and stale bulb LabRun submission. The guarded command `npm test -- src/modules/labs/application/assignment-lab-execution.test.ts` passed: 6 tests, loopback isolated database target.
- Do not mutate Supabase assignments or attempts, recreate the release, rerun migrations, or sign/activate. Stop at OWNER_SIGNOFF for the verified release digest.
