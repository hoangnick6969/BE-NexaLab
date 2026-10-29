# Circuit finalization — evidence and remaining gates (2026-10-29)

## Security

Shared Supabase inspection was SELECT-only. anon/authenticated retain all seven table privileges on LabRelease, LabReviewerAuthorization and LabReleaseReview. Session pgrst.db_schemas is NULL; authenticator role and database settings do not reveal exposed schemas. Thus dashboard/Data API configuration remains unverified; absence of the GUC is not evidence that public is unexposed.

Forward-only migration: 20261029020000_lab_release_access. Enables RLS without client policies and revokes all table privileges from PUBLIC/anon/authenticated. Existing table owner and trusted BYPASSRLS server access remain. No FORCE RLS, global/default privileges or unrelated tables changed. Verify the deployed Nest connection role is owner/BYPASSRLS before shared application; never grant client roles server authority.

Applied ONLY to isolated PostgreSQL port 55490, database nexalab_pinning_test, schema p36_finish_1029. Regression: 2/2 release lifecycle tests passed after migration (draft/review/digest/activation/discovery/standalone attempt/persistence/replay/quarantine/rollback). SQL test simulates Supabase grants in a rollback-only transaction: 42 privilege checks and six actual role SELECT denials passed; owner still reads existing records. Shared migration NOT applied.

## Circuit scope and source

Re-read local official-programme PDF pages 48–49 using PyMuPDF: it explicitly requires drawing circuit symbols and assembling battery/switch/wires/bulb. The fixed-topology pilot assesses predictions for CLOSED/OPEN, observations and causal explanation only. It supports preparation for the assembly Outcome; it does not establish assembly or drawing competence.

Local structured B22 source src-lesson-2d84bedccb86 identifies chapter V, Điện, title Mạch điện đơn giản. Official source and textbook hashes, proposed page 93 and source block anchors are recorded in the Content Tool docs/curriculum/khtn8-electricity-review.md. Structured content/mapping are still needs_review. Current Ministry applicability/amendments and actual textbook page/block acceptance require a human reviewer; transcription is not approval.

## Release and Lesson binding

LabReleaseService freezes execution, model/config/activity and course-version/lesson binding identities into a snapshot before computing its digest. Review checks both snapshot digest and supplied digest; activation checks exact-digest receipts. Isolated tests passed; no real release candidate digest has been issued. Freeze the final scoped claim, model, activity, rubric and assets before circulating that digest.

Real CURRICULUM, SUBJECT, MODEL, SAFETY and RIGHTS review requirements remain. Reviewer authorizations must use real qualified identities and satisfy distinct-review rules. No synthetic receipt is transferable to production. Confirm source/asset rights and low-voltage-only safety language.

Course-version binding is captured in the release snapshot, but the real B22 binding is unapproved and has not been created. The focused lifecycle regression verifies synthetic catalog and standalone launch. It does not prove real B22 student navigation. The initial binding gap described here is closed by the engineering closure update below: activation, discovery and standalone launch now reject changed reviewed mappings. Do not silently infer this from assignment pinning.

Prior local browser verification covered teacher assignment, student submit, F5 draft recovery and 390px layout/keyboard smoke. Not rerun in this slice. Representative physical device/performance and full accessibility review remain unverified. No real public release or Lesson mutation performed.

## P3.7 readiness

Technical shared runtime is reusable; portfolio expansion remains gated by genuine pilot review and device evidence. portfolio-review-v1.md preserves all 20 provisional slots and original IDs/decisions. All 20 mappings remain unapproved; incomplete chapter/lesson labels are explicitly unresolved rather than fabricated. Proposed next candidates: FL-03 density, then FL-06 lever equilibrium. Scope and source review precede implementation.

## Engineering closure update

Reviewed binding guard now rejects a changed course-version/lesson/topic/order mapping at activation and standalone launch; student discovery hides mismatches. New Lesson navigation supplies releaseId and the launch rejects a changed active release. Historical assignment pins and attempts are unchanged. Isolated integration exercised mismatch before activation and after activation, successful restoration, wrong launch releaseId and positive Lesson lookup.

Actual configured Nest Prisma connection was inspected using SELECT only: current_user=postgres, rolsuper=false, rolbypassrls=true. Isolated release lifecycle passed using p36_nest_server (NOSUPERUSER BYPASSRLS with schema/table grants), including authorized operations and unauthorized review/incomplete approval rejection. Client denial remains verified by scripts/verify-lab-release-access.sql. The role name differs intentionally; its relevant privilege class matches the actual Nest connection.

Real FE→BE→DB browser test: persisted Lesson record p36-lesson-bd58a0a6 → release link cmvt5qaze000elwp0uen62c4e → standalone run cmvt5sy370004lwrkrpb2r3cz → passed attempt cmvt5uphb0006lwrkke9omg8v (3/3). All belong to schema p36_ui_close and carry TEST FIXTURE ONLY content/review labels. This proves stored Lesson navigation; it does not prove genuine B22 mapping approval. Keyboard Enter activated the Lesson link and switch; Space selected predictions/explanation. No horizontal overflow at 360/390/768/1366px. This is desktop Chromium viewport coverage, not a physical Android or screen-reader certification.

## Controlled deployment procedure (not executed)

1. Obtain explicit approval to change the named shared Supabase project, including the exact migration checksum. Confirm dashboard Integrations → Data API → Settings exposed schemas and whether Data API is enabled; record the result. SQL GUC absence does not answer this setting.
2. Reconfirm the deployed Nest role is trusted BYPASSRLS or table owner, migration history/checksum, grants, policies and current row counts. Capture access-control definitions and a backup before changing permissions. Do not reset or rollback schema/data.
3. Use the approved deployment operator/pipeline to apply only the forward migration transactionally, with a short lock timeout and stop-on-error. Run the versioned Prisma migration once and retain its migration ledger receipt. The local isolation guard must not be weakened; remote deployment requires a separately authorized deployment operation. Do not manually execute SQL and then leave Prisma migration history inconsistent.
4. Verify no anon/authenticated/PUBLIC table privileges, RLS enabled, no unintended client policies. Perform denied client queries and authorized Nest draft/list/review mechanics against an explicitly designated private test record; never insert fake production approvals. Verify historical attempt reads and unchanged row counts for protected data.
5. On authorization regression stop release traffic and inspect role/grants; apply a reviewed forward correction if required. Do not restore broad public grants or reset migration history.

Remaining external gates: actual Data API settings access; qualified curriculum/subject/model/safety/rights signoff for the final digest; physical representative-device check. No shared migration or real Circuit publication was performed.
