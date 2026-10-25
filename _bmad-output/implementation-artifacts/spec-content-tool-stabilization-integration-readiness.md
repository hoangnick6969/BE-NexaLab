---
title: 'Content Tool stabilization and integration readiness'
type: 'bugfix'
created: '2026-10-22'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '99fca447081e95efcc369ca1ddaf1af52d395b53'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/integrations/content-tool-nexalab-contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** NexaLab Content Tool at HEAD `9ad5d0f00748b7df6d993433b90c446f06dd586f` has local workflow and release code, but test execution was obscured by sandbox cache/socket restrictions, the CLI can export an empty manifest while current Lesson drafts remain blocked, and BE release integration has not been exercised against an identified safe database.

**Approach:** Stabilize existing paths only: reproduce tests in a writable-cache/loopback-capable environment, fix confirmed export gating defects, verify the existing real local workspace through exact blockers, then exercise existing M2a/M2b and supported API/FE paths against a disposable loopback PostgreSQL target. Keep baseline release blocked.

## Boundaries & Constraints

**Always:** Preserve the current CLI, Studio UI, optional gated Gemini flow, BE-authoritative schema/materialization/release design, stable IDs, atomic apply, digest confirmation, and idempotent receipt behavior. Use latest fetched remote ancestry in all three repos. Bind the disposable database to loopback on a non-conflicting port, pass its URLs per process, and verify its identity before migration, seed, plan, or apply. Use only synthetic fixture releases for database writes. Record exact executed evidence separately from static claims.

**Never:** Connect to or mutate the unclassified Supabase project; release the real KHTN Lesson without valid curriculum mapping, publication rights, and real human reviews; add frameworks, services, schemas, migrations, release routes, or unrelated hardening; redesign completed M0a/M1/M2 architecture; fabricate reviewer identities; treat sandbox restrictions as product defects.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Tool suite | Writable uv cache and loopback socket access | All 19 existing tests pass without hanging | Attribute cache/realpath/socket denial to environment with reproducible evidence |
| Blocked real draft | Accepted OCR exists but outcome, subject, license, or reviews are missing | CLI/UI export returns the same exact release blockers and does not create a misleading empty manifest | Exit non-zero or return blocked status without publishing |
| Synthetic release | Valid fixture on verified disposable PostgreSQL | BE plan is unblocked; apply writes one release; same digest returns the original receipt | Digest mismatch or blocker prevents apply |
| Student integration | Applied synthetic BASIC_EXERCISE fixture | API/FE expose authored IDs and non-gating pathway behavior supported by current code | Unsupported runtime dependencies are reported as unverified, not inferred |

</frozen-after-approval>

## Code Map

- `D:\coding\nexalab-content-tool\src\nexalab_content_tool\cli.py` -- CLI dispatch currently calls `export_manifest` directly.
- `D:\coding\nexalab-content-tool\src\nexalab_content_tool\m1_workflow.py` -- `export_status` owns draft/release blocker aggregation and currently detects eight blockers in the real workspace.
- `D:\coding\nexalab-content-tool\src\nexalab_content_tool\manifest.py` -- deterministic manifest builder/exporter currently accepts an empty `packFiles` array.
- `D:\coding\nexalab-content-tool\tests\test_workflow.py` -- CLI/export and loopback Review Server regression coverage.
- `D:\coding\nexalab-content-tool\tests\test_m1_workflow.py` -- Book/OCR/review/draft/blocker behavior.
- `D:\coding\nexalab-be\src\modules\content\application\content-release.ts` -- authoritative plan/apply transaction and idempotent receipt.
- `D:\coding\nexalab-be\src\modules\content\application\content-foundation.test.ts` -- fixture release gates and BASIC_EXERCISE pack mapping.
- `D:\coding\nexalab-be\src\modules\lessons\application\pathway.ts` -- materialization and non-gating BASIC_EXERCISE pathway.
- `D:\coding\nexalab-be\scripts\content-release.ts` -- supported CLI plan/apply entrypoint.
- `D:\coding\nexalab-be\scripts\cf-integration.mjs` -- real database apply/idempotency and API integration harness.
- `D:\coding\nexalab-fe\src\features\lessons\LessonDetail.tsx` -- student BASIC_EXERCISE rendering path; change only if runtime evidence finds a defect.

## Tasks & Acceptance

**Execution:**
- [x] `D:\coding\nexalab-content-tool\tests\` -- preserve repo-local uv cache guidance and isolate loopback restrictions; add only regression coverage required by a confirmed defect.
- [x] `D:\coding\nexalab-content-tool\src\nexalab_content_tool\cli.py` and existing export helpers -- make CLI export honor current draft/release readiness and refuse empty or stale-success output.
- [x] `D:\coding\nexalab-content-tool\workspaces\m1-khtn8-acceptance` -- execute report/export status against the existing ignored real workspace and capture the exact blocker set; do not alter baseline metadata to force success.
- [x] `D:\coding\nexalab-be\.tmp\content-tool-pg` -- create a disposable PostgreSQL 18 cluster on loopback port `55432`, migrate and seed through per-command environment variables, and prove target identity before writes.
- [x] `D:\coding\nexalab-be` -- run focused M2a unit tests, synthetic release plan/apply/retry, receipt checks, and supported BE/API integration against only the disposable database.
- [x] `D:\coding\nexalab-fe` -- run the supported student integration/build path against the local API when dependencies permit; make no speculative FE changes.

**Acceptance Criteria:**
- Given the repository-local cache and loopback-capable execution context, when the full Tool suite runs, then 19/19 tests pass and no test is described as hanging.
- Given an incomplete real Lesson draft and no release pack, when CLI export runs, then it reports the same blockers as Studio and writes no successful empty manifest.
- Given a verified loopback database identity, when the synthetic fixture is planned, applied, and reapplied with the same digest, then the first apply is atomic and the second returns the same idempotent receipt without duplicate content.
- Given the synthetic BASIC_EXERCISE release, when supported API/FE checks run, then authored IDs survive and the exercise does not lock the next public step.
- Given missing real rights, curriculum authority, or human reviews, when real baseline release is attempted, then it remains blocked.

## Implementation Notes

- Full Content Tool suite passed 19/19 with repository-local uv/Python cache and loopback access. The isolated first test completed in 0.352 s; the earlier apparent hang was caused by sandbox socket/cache denial, not product code.
- Confirmed and fixed the export defect: an incomplete real draft now exits 2, prints the same eight Studio blockers, rejects empty `packFiles`, and removes a stale in-workspace manifest instead of reporting success.
- Real KHTN 8 workspace remains blocked by missing verified outcome code, subject ID, publication license and source URL, plus editorial, subject, rights, and accessibility reviews. No baseline metadata was changed.
- Verified PostgreSQL identity before writes as `postgres@127.0.0.1:55432/nexalab_content_tool`, applied 31 migrations, and seeded it. No unclassified Supabase connection was used.
- Synthetic plan/apply succeeded with digest `d577aa353617155850b71efd69a4758310c6a8d5fb715b892bad127170fa171a`; first receipt `cmvjs1fj00000lwn8xzf707rz` was APPLIED with two items, and retry returned the same receipt with `idempotent=true`. SQL confirmed one release, one version-1 fixture pack, and preserved BASIC_EXERCISE question/option IDs with pass threshold 60.
- Actual API health and both student/admin authentication passed. Open Curriculum correctly returned zero subjects because synthetic fixture content is excluded from public curriculum; admin release API exposed the applied receipt.
- FE build passed. Mocked BASIC_EXERCISE browser coverage passed 1/1. Live assigned-reading E2E initially exposed stale test assumptions: it omitted `assignmentId`, did not match progress URLs with a query string, and used the old tab name. After those test-only corrections, FE -> API -> disposable DB passed 1/1 through injected 503, retry, persistence, and reload.
- No BE route or production code moved; route manifest comparison was therefore not applicable.

## Spec Change Log

- 2026-10-22: Completed implementation and executable verification; recorded environment boundaries, exact release evidence, and the live FE test corrections.

## Review Triage Log

## Verification

**Commands:**
- `uv run --active --no-sync -- python -m unittest discover -s tests -q` -- passed 19/19 outside sandbox socket restrictions.
- `npm test -- src/modules/content/application/content-foundation.test.ts src/modules/lessons/application/pathway.test.ts src/modules/learning/interface/learning.controller.test.ts` -- passed 42/42.
- `npm run build` in BE and FE -- passed.
- Prisma migrate/seed plus `content:release plan/apply/apply` against the verified loopback target -- passed; retry was idempotent and SQL found no duplicate release.
- `npx playwright test tests/student-lessons-hub.spec.ts --grep "shared lesson details use foundational progress without requesting an assignment pathway"` -- passed 1/1.
- `npx playwright test tests/reading-completion.spec.ts --grep "assigned reading completion retries and resumes from server evidence"` -- passed 1/1 against the local FE/API/database after resetting only the disposable fixture progress row.



