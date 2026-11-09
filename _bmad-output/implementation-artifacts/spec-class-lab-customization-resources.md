---
title: 'Custom Class Labs and richer class resources'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_commit: 'ffcacc7611d6e006bd4f8b1829ccf83da7e83d81'
frontend_baseline_commit: '2cf384f70032d9ee6d7c5b1fdad5d5fcc40170cd'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Class Lab currently assigns a released challenge with a title/deadline; teachers cannot retain and customize a reusable private activity. Class resources only support cards, quizzes and tests.

**Approach:** Add versioned class-private LAB resources forked from approved Foundational releases, and DOCUMENT, REPORT_TEMPLATE and LINK resources. Preserve the existing design system while making purpose, source and preview explicit.

## Boundaries & Constraints

**Always:** Enforce owner/active-class/approved-membership checks server-side. Labs retain their exact approved model, release, parameters, activity and rubric. Teachers customize title, learning objective, instructions, report prompts and released challenge selection. These pedagogical fields are displayed to students and pinned when assigned. Published versions are immutable; revisions create drafts. Shared class practice is unscored and excluded from official Foundational progress; scored submission additionally requires assignment targeting. The companion [data contract](class-lab-resource-contract.md) defines the required schemas, identifiers and lifecycle rules.

**Always:** Documents/templates accept a validated uploaded PDF, PNG, JPEG or MP4 through existing asset infrastructure, or an HTTPS link, including Google Drive/Docs/Slides. Office documents can be linked through Drive; native Office file uploads are outside this implementation. Show this distinction before file selection. Reuse current file budgets, scan and environment gates. A Drive link does not grant Drive permissions.

**Never:** Change scientific equations/parameters, public releases, grading semantics or historical attempts; import a Lab through CSV; fetch arbitrary external URLs on the server; embed untrusted HTML. No new report-submission/grading engine or Google OAuth integration. No shared database migration, deployment or publication in this task.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
|---|---|---|---|
| Fork | Owner selects eligible release/challenge and class lesson | Private draft, source thumbnail, editable pedagogy, pinned tuple | Reject invalid/revoked source |
| Share / assign | Published LAB | Members practice; targets submit assigned work with copied pedagogy/version | Recheck authorization on launch, events and submit |
| Revise | Published v1 already assigned | New draft v2; v1 assignments/history unchanged | Reject direct published edits |
| Attachment | Owned READY asset or valid HTTPS URL | Draft preview then publish; member opens authorized file/link | Reject foreign/quarantined asset, unsafe URL, unsupported file |
| Withdrawal | Archived class/resource or removed member | Block new class-practice reads/runs/download grants; existing assignments follow their independent lifecycle | Non-enumerating denial; retain history |
| Source update | New release activated | Existing pins retained; show stale source and explicit new-version action | Never silently upgrade/rescore |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma`: ClassResource JSON/version lifecycle; extend kind enum. LabRun context currently distinguishes assignment/open practice.
- `class-lab-resource-contract.md`: normative payloads, CLASS_PRACTICE context, assignment source identifiers and snapshot retention.
- `src/modules/classes/application/class-resource-contract.ts`, `class-resources.service.ts`: validation, owner/member checks, publish/revise/archive; replace non-test fallbacks with explicit kinds.
- `src/modules/classes/application/assignments.service.ts`: eligible release list and immutable assignment snapshot; retain legacy assignments.
- `src/modules/labs/application/assignment-lab-execution.ts`, `lab-run.ts`: strict execution schemas and release equality checks; retain scientific tuple validation.
- `src/modules/labs/interface/labs.controller.ts`: launch/events/submit authorization; class practice needs explicit resource context throughout.
- `src/modules/assets/application/asset-versions.ts`: common read authorization and deletion references currently omit ClassResource.
- `../nexalab-fe/src/features/classes/{ClassSpaceResources,ResourceEditor,Assignments,ClassLabs,StudentClasses}.tsx`: creation, resource rendering, assignments and thumbnail consumers.
- `../nexalab-fe/src/features/labs/lab-info.ts`, `runtime/lab-run-host.ts`, `src/lib/api.ts`: reuse thumbnails, runtime and upload/access helpers.

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, `prisma/migrations/`: add LAB/DOCUMENT/REPORT_TEMPLATE/LINK enum values, nullable LabRun resource relation and assignment/run pedagogical snapshots per companion; preserve existing rows.
- [x] Class-resource contract/service/controller: LAB fork validation, immutable publication/revisions, attachment kinds and explicit practice eligibility.
- [x] Assignment service and Lab execution/run/controller: copy private resource version/pedagogy; member-only unscored launches; consistent event/submit/revocation checks and no Foundational projection.
- [x] Asset versions and admin reference consumers: exact attachment matching, attach-owner checks, member downloads, dependency retention.
- [x] FE files in Code Map, class types and `teacher-operations.css`: purpose-first creation, source selection, preview, lab editor, student instructions, inherited thumbnails, loading/errors and keyboard/mobile states. Preserve committed UI work.
- [x] Domain tests and isolated integration: cover matrix, idempotency, target isolation, expiry/revocation, old pin compatibility, source activation changes and companion contract edge cases.
- [x] `docs/product/prd.md`, `_bmad-output/specs/spec-lab-pipeline/class-lab-track.md`: document the expanded contract and exact verified limits.

**Acceptance Criteria:**
- Given an owner, when they fork, edit, publish and assign a Lab, then students see the customized activity and inherited thumbnail while scientific evaluation remains pinned.
- Given a published document/template/link, when an approved member opens it, then the correct source opens without quiz controls or a scored assignment.
- Given an outsider or removed member, when they use resource, run, event or asset IDs, then access is denied server-side.
- Given a later revision/release, when an existing assignment is reopened, then its content, tuple and historical evidence remain unchanged.

## Implementation Notes

Planning baseline: existing FE changes committed as `2cf384f`; both repositories use `codex/class-lab-customization-resources`. Current parameter-review contracts are pending; numeric customization is not authorized by those contracts.

- 2026-11-06: Review patches verified: official parent/activity exclusion, upload completion races, blocked popups, explicit stale-source upgrade, pinned teacher renderer, localization, assignable cache refresh, batched attachments, and lock ordering. Targeted BE suite: 10 files / 50 tests passed. Browser regressions: 5 tests passed against local frontend with mocked API. Earlier real local browser walkthrough persisted a passed CLASS_PRACTICE attempt without assignmentId; no shared database writes occurred.

## Spec Change Log

- 2026-11-05: User-provided assessment identified unspecified run context, JSON schemas and assignment identifiers. Added companion contract; preserved base Lab IDs, separated pedagogical snapshots from scientific tuples, and clarified resource archival versus assignment eligibility. Keep existing immutable science validation and committed UI changes.

## Review Triage Log

| Reviewer | Finding | Verdict / evidence | Action |
|---|---|---|---|
| blind | Parent practical summary includes class practice | medium: parentProgress reads all attempts and counts passed verdicts | Patch using existing context exclusion |
| blind | Official activity lists lack unscored context | medium: existing readers expose these attempts as ordinary practical history | Patch official readers to exclude class practice |
| blind | Upload completion overwrites newer editor values | medium: handler closes over value before await | Patch latest-value and source-generation handling |
| blind | Stale draft challenge list belongs to latest release | medium: current choices can be absent from pinned release | Patch disable challenge editing until explicit upgrade |
| blind | Teacher preview stops at source metadata | medium: early return prevents existing renderer from appearing | Patch reuse pinned teacher renderer without attempts |
| blind | New strings bypass locale | medium: English locale displays new controls in Vietnamese | Patch defineText consumers |
| blind | Assignable choices cache stays stale | medium: mutations invalidate only class-resources | Patch related query invalidations |
| blind | Uploaded resource list metadata uses N queries | medium: each uploaded resource triggers findUnique | Patch batch list metadata |
| blind | Event/write/hint withdrawal regression absent | false: class-practice-access.test.ts invokes fl10Events, recordFl10Event and requestHint and fails if authorization is removed | Rejected |
| blind | Isolated integration fixture rows are retained | low: test uses unique IDs in dedicated loopback DB; cleanup adds deletion complexity and existing pinning tests retain reproducibility fixtures | Rejected under low-finding complexity rule |
| edge | Upload source/kind changes corrupt completion | medium: same captured-value race confirmed above | Patch with shared upload fix |
| edge | Blocked popup silently discards attachment open | medium: opened may be null and handler requests grant without navigation/error | Patch actionable error |
| edge | Private release resolved before lock wait | medium: quarantine may occur before acquired publication locks | Patch resolve after existing locks |
| verification | No automated resource-selector browser regression | medium: current browser tests assert assignment selector only; manual local browser evidence passes but cannot detect later regressions | Patch browser launch assertion |

## Verification

- BE/FE `npm run lint` and `npm run build` must pass.
- Run focused unit/integration tests through guarded npm scripts with identical isolated loopback database URLs; never remote migration/seed/test commands.
- Verify additive migration on isolated PostgreSQL; report infrastructure blockers separately from passes.
- Exercise teacher fork/revise/assign, student practice, attachment access, outsider denial and mobile/keyboard flows in a real browser when the local stack is available.
- Run Hallmark sloplint on changed UI scope; distinguish static checks from rendered verification.
