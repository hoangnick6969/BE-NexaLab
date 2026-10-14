# C2 — Ordered Vertical Tickets

## C2-T1 — User lifecycle and ownership resolution

- Add paginated/filterable user list, admin creation of teacher/parent/admin accounts, disable/reactivate, deletion eligibility, and conditional hard delete.
- Revoke sessions transactionally. Require explicit reassign/archive/quarantine actions for active owned classes/content/assets; forbid self-disable/delete and last-active-admin disable/delete.
- **Accept when:** every blocker is reported without destructive side effects; disabled user receives 401 on the next request; evidence/links/audit remain; an eligible empty user deletes with a reconciled dependency report.

## C2-T2 — Taxonomy and reviewed shared content

- Manage Subject/Domain, Chapter, Topic, Outcome mappings and shared/baseline content lifecycle. Duplicate ID/code returns 409 rather than upsert overwrite.
- Support inspect/quarantine/archive/reassign and publish only after all content-foundation gates pass; warn on active assignments and require reason.
- **Accept when:** taxonomy remains traceable to outcomes; admin cannot forge subject/rights review; immutable bodies/evidence remain unchanged; every operation audits actor/reason/outcome.

## C2-T3 — Practical, challenge, and simulation versions

- Manage technical availability and versioned activity/model/topic-pack/config/visual/binding/challenge records. Validate allowlisted model/version, units/ranges, golden cases, and semantic bindings.
- **Accept when:** unknown/out-of-range/mismatched/executable binding data rejects; future attempts pin the new complete version set; historical attempts still reproduce their original interpretation.

## C2-T4 — Adult reset and admin-login separation

- Implement generic forgot-password response, hashed single-use 60-minute token, reset completion, delivery adapter/dev mailbox, and all-session revocation. Remove temporary-password email for adults.
- Reject ADMIN at regular adult login and keep the dedicated admin login route. Preserve teacher-managed student reset.
- **Accept when:** missing email, expired/reused token, concurrent consume, and delivery failure do not disclose account existence or leave a reusable token; reset invalidates every prior session.

## C2-T5 — Asset and source operations

- Build the admin shared-library and SourceRegistry surfaces on Content Foundation: owner/scope/version/source/license/references, quarantine/reassign, ingestion run/item status, dry-run/release receipt, and immutable R2 asset versions.
- Enforce configured MIME/extension/size/signature/checksum/security and model-binding validators. Block delete/replace while any content/evidence reference exists.
- **Accept when:** private/shared permissions and admin overrides audit correctly; attribution persists; partial ingestion never publishes; no binary operation or source change orphans history.
- **Release gates:** approved Q-DATA-01/Q-C2-03 budgets and per-pack Q-C2-04 scientific ranges.

## C2-T6 — Admin console, audit explorer, and journey

- Build dashboard and user/taxonomy/content/simulation/asset/source/audit screens with loading/empty/error/stale states and confirmation for destructive actions.
- Paginate/filter AuditLog and audit each read; never render protected/redacted payloads. Use text + icon status and keyboard/touch-accessible actions.
- Verify create/disable/reactivate/delete-eligibility, ownership resolution, taxonomy conflict, reviewed publish, simulation version, reset link, asset quarantine/reassign, ingestion dry-run, and audit read.
- **Accept when:** teacher/parent/student receive 403 on every admin route; admin actions round-trip through real APIs; destructive dialogs name the access/history effect; API/database/browser and email/R2 dependencies are named; audit/evidence reconciliation passes; representative read/mutation p95 is reported with environment label.

## Dependencies

C2 consumes B0 audit/error contracts, Content Foundation data/R2/import/simulation contracts, and C1 consent/link records. Platform work may use development configuration, but production media and pack releases remain gated as listed in the SPEC.
