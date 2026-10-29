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


## Final Circuit candidate handoff — 2026-10-29

Owner instruction: keep the existing review policy; do not add reviewer accounts, generate approvals or implement OWNER_SIGNOFF in this task. Owner intends personal MVP review, but the current distinct CURRICULUM/SUBJECT/MODEL rule still applies until separately changed. Signoff and production activation remain pending.

Frozen content review candidate: circuit-release-candidate.json. Content digest `fe8f3954e37675790f39f5024976910dbc89196530d6dbe0c764be64b869eee0`. Verify offline with `npx tsx scripts/verify-circuit-candidate.ts`. It validates hashes of existing code, the activity contract without review receipts, two science golden cases and four rubric cases. This digest identifies the proposed content, not an API LabRelease. Database config/pack/activity IDs and course-version binding do not exist for this real candidate yet; authentic releaseDigest remains null. Do not copy synthetic fixture IDs or digests into this package.

Exact source target, confirmed by read-only shared DB lookup: B22 Lesson `pack-structured-38f03d31878e58fc0d8a31b8c8aa9fab4af866f7-v1`, topic `KHTN8-L22`, chapter `KHTN8-CH05`, pack `cmvmmp8fo000hlw142uxqx2lr` v1 digest `47ff7ffca8749f9cd7970ff177d6c6b2f306481ca74e9ea4ad320db1c6c21af3`. Do not select legacy `dev-khtn8-ch05-lesson-22`, which has no pack/mapping. Existing B22 Outcomes carry owner `approved_internal` content provenance; this must be acknowledged, but is not an exact Circuit release approval. O02 currently says “dây nổi”; the curriculum source says “dây nối”. Record a proposed correction only; no published content changed. O01 drawing and O03 protective-device claims are excluded. O02 is SUPPORTING_ONLY: fixed topology cannot prove independent assembly. The current activity schema carries outcomeCodes, not a coverage-strength field, so reviewers must retain the bounded objective and limitation and must not interpret a passed attempt as complete practical competence.

Review checklist (all pending owner/expert decisions, not attestations):
- Curriculum: verify current official authority/amendments and B22 source block p0093-b0005; approve supporting-only scope and proposed wording correction.
- Subject/model: bulb, not LED; ideal continuity; CLOSED→ON, OPEN→OFF; no I/U, brightness, heating, short circuits or branches. Review invalid topology rejection and checkpoint sequencing. A valid OPEN state is an observation, not a failed experiment.
- Rubric: ON prediction, OFF prediction, explanation A; 1 point each, pass 3/3. Incorrect prediction/explanation loses its own criterion; malformed/missing evidence creates no Attempt.
- Safety: virtual only; no household mains, no promise of real electrical safety, teacher supervision for any physical practical.
- Rights: public URL/attribution does not establish reuse rights. Verify programme/textbook excerpts, any distributable source content, existing 2D code renderer and dependency licenses. No new 3D/GLB/media assets requested or created.
- QA: desktop/mobile viewport keyboard smoke exists; physical representative device and assistive-technology validation remain pending. Do not relabel emulation as actual-device evidence.

API handoff after approvals/authorization: existing admin practical/config/pack APIs require real preliminary subject/safety/model review data; do not fill mandatory reviews with placeholders. Resolve version IDs and approved course binding, then POST /api/admin/labs/circuit/releases with a reason. Capture its actual snapshot and digest, compare against the frozen content and exact Lesson mapping, then collect authenticated receipts via POST /api/lab-releases/:id/reviews (verify controller path before use). Authorization uses PUT /api/admin/lab-reviewers/:userId. Activation uses POST /api/admin/labs/circuit/releases/:releaseId/activate only after all required receipts and QA. Any content change requires a fresh digest/review; none of these writes is authorized by this document.

Security handoff: project eiotlkegrejjhldsvaqp, NexaLab's Project, ap-southeast-1, PostgreSQL 17.11. Shared ledger contains lifecycle migration, not access-hardening migration. Migration checksum `96702ea4503719d3f071590bb5b500b8151e84204c370b789d854e25f5197004`. Direct client grants still exist. Dashboard redirected to sign-in, so Data API enablement/exposed schemas and backup timestamps/PITR are UNVERIFIED. No claim that public is or is not exposed follows from a NULL GUC.

Exact deployment command AFTER separate explicit approval and completed preflight (NOT RUN): from the pinned BE checkout, with approved production credentials already present, `node node_modules/prisma/build/index.js migrate status` then `node node_modules/prisma/build/index.js migrate deploy`. Abort unless migration status shows only 20261029020000_lab_release_access pending, checksums match, owner/BYPASSRLS Nest role is reconfirmed, backup/restore readiness and exposed schemas are recorded. This uses the existing Prisma migration ledger, not ad-hoc SQL plus inconsistent history. Local test/migration safety scripts remain intact. After execution read ledger/grants/RLS and run authorized Nest read checks and denied client checks; do not create fake production review records. If the migration fails, inspect transaction/ledger before retry, do not reset or use migrate resolve blindly. If role compatibility fails, stop activation and prepare a narrowly scoped forward role-grant correction for separate approval; never restore client-wide grants. No migration rollback or broad database restore is part of this change.

Private preview: existing isolated p36_ui_close PostgreSQL data, ports 4112/5202. It remains TEST FIXTURE ONLY release-mechanics data, authenticated as a test student. It demonstrates the real UI and model without production review bypass; it is not the frozen candidate's final persisted version. Existing shared students/Lessons/assignments/attempts were not written or migrated in this task.

Phase status: P3.1 technical Define complete; P3.2 runtime complete for verified scope; P3.3 source evidence prepared, final signoff pending; P3.4 isolated pilot passed; P3.5 technical compatibility passed but full review gate pending; P3.6 release/Class assignment engineering verified, production security/real candidate signoff/device gates pending. P3.6 NOT DONE. P3.7 implementation not authorized by current gates.
