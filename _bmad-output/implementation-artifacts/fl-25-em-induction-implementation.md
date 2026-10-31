# FL-25 em-induction — implementation record

Spec: `../specs/spec-fl-25-em-induction/` (SPEC, lab-definition, implementation-plan).
Branch: `feat/fl-25-electromagnetic-induction` in BE (from `adaee7f`) and FE (from `0d63fb8`). Nothing committed or pushed in this session.

## Authorisation boundary

Owner decision D-1, 2026-10-31, in the working session: "Ghi nhận ngoại lệ, làm FL-25 song song dạng thử nghiệm". FL-25 is a **private engineering prototype**: synthetic data only, no student catalog, no release, no Lesson binding, no shared database write, not counted in the ≤2 track cap. The P3.5 gate stays NOT MET and Circuit still needs its genuine OWNER_SIGNOFF. D-2..D-5 use the SPEC recommendations; D-3 (KHTN 9 outcome text and provenance) remains open with the curriculum reviewer.

## Session 2026-10-31

### BE
- `packages/sim/index.ts`: `emInductionSchema` + `emInduction` (`em-induction@1.0.0`, qualitative). Engine `VERSION` stays `1.0.0` so existing pinned tuples are unaffected; package bumped to `1.2.0` and packed into FE `vendor/`.
- New `src/modules/labs/application/checkpoint-activities.ts`: registry of checkpoint activities (activity key/version → model, rubric, renderer key, submission schema, evaluator). Circuit bulb moved into it unchanged; `lab-run.ts` re-exports its old names.
- `lab-run.ts`: run submission union, `rubricRef` enum and `rubricRefForActivity` now come from the registry.
- `labs.controller.ts` (launch `rendererKey`, submit evaluation) and `admin-labs.controller.ts` (reproduction) use the registry instead of comparing to the bulb rubric.
- `sim-packs.ts`: `observationOnly` flag on models; `em-induction@1.0.0` registered. `simulation-versions.ts` uses the flag; the bulb's admin message text is unchanged.
- `lesson-content.ts`: `CHALLENGE_PARAMETERS["em-induction"]` with no parameters (observation-only).
- Tests: 18 golden cases EM-01…EM-11/X in `packages/sim/sim.test.ts`; 8 rubric/envelope tests in `lab-run.test.ts`; new `em-induction.integration.test.ts` (isolated DB, mirrors the bulb suite).
- Design change during build: checkpoint STILL uses `magnetPosition: OUTSIDE` (was INSIDE in the first blueprint draft) so the scene can move OUTSIDE → INSIDE → OUTSIDE without an unshown repositioning that would itself induce current. Blueprint updated.

### FE
- `@nexalab/sim` → `vendor/nexalab-sim-1.2.0.tgz` (old 1.1.0 tarball removed; lockfile change limited to this package).
- `runtime/lab-run-host.ts`: renderer `em-induction`; any non-legacy rubric submits `checkpoints` + `explanation` only (UI progress stays in the draft).
- New `runtime/checkpoint-views.tsx`; `Lab.tsx` dispatches checkpoint activities through it instead of `isBulb` checks. The Circuit bulb result line now reads "Công tắc đóng: Bóng đèn sáng, dự đoán đúng" (comma instead of a middle dot).
- `physics/shared/PhysicsStage.tsx`: optional `view`, `reflections`, `viewResetSignal` props; defaults keep the Circuit framing.
- New `physics/electricity/induction/`: evidence/phase machine, shared choreography, procedural 3D apparatus (enamelled two-layer copper coil, N/S bar magnet on a carriage rail, RK4-traced closed field lines, zero-centre galvanometer with damped needle, inverse-parallel LED pair with glow, crank generator), equivalent 2D SVG view, activity panel and CSS.

## Verification (local only)

| Check | Result |
|---|---|
| BE `npx vitest run` | 40 files passed, 7 skipped; 285 tests passed, 8 skipped (DB integration suites, including the new FL-25 one, skip without `NEXALAB_PINNING_TEST_URL`) |
| BE `npm run build`, `check:layers` | pass; layers ok (113 files) |
| BE route manifest before/after | identical |
| FE `tsc --noEmit` | clean except 2 errors that already exist on `main` in the unused duplicate `src/features/labs/CircuitBulbActivity.tsx` |
| FE `tests/em-induction-lab.spec.ts` (route-mocked, system Chrome) | 3/3 passed: 2D full flow with keyboard, F5 draft restore, exact checkpoint payload without `observed`/`labState`; 3D mount at 390×844 with no horizontal overflow and named buttons; 3D desktop push shows needle, LED A and observation |
| FE existing lab specs (`lab-run-host`, `circuit-lab`, `lesson-lab-navigation`) | 12 passed, 10 failed — **identical per-test results on unmodified `main`** (stash comparison), so no regression from this branch; the 10 failures pre-exist |
| Hallmark sloplint (panel CSS/TSX, scope app) | 0 FAIL, 0 REFLEX, 1 WARN (29 glass panel) waived in the CSS stamp for consistency with the Circuit bulb panel |

Items left open at this point were closed in the follow-up session below.

## Session 2026-10-31 (follow-up): missing parts

### Isolated database
- No credentials for the machine's existing PostgreSQL were available or read. A throwaway cluster was created with `initdb` in the session scratchpad (PostgreSQL 18.4, `127.0.0.1:55432` only, trust auth, no Unix socket) with two databases: `nexalab_pinning_test` (integration suites) and `nexalab_fl25` (dev run). Migrations through the guarded `npm run db:migrate`; seed through `npm run db:seed` with `APP_ENV=development`, `SEED_TARGET=127.0.0.1/nexalab_fl25` and synthetic local-only passwords. The cluster was stopped afterwards. Shared Supabase was never touched.
- FL-25 dev fixture (scratchpad script, refuses any host other than the throwaway cluster): Lab `em-induction` (`CLASS_PRIVATE`, `synthetic: true`, `releaseCleared: false`), challenge `em_001`, activity `em-induction-checkpoints` v1 marked test-fixture-only, active config v1 and pack `em-local`, assignment `assignment-em` for `student.active` in `class-pilot-a`.

### BE
- `em-induction.integration.test.ts` and every other DB suite ran against `nexalab_pinning_test`.
- Fix (`catalog.controller.ts`): `GET /lessons/:id/foundational-labs` returned 500 for teachers and admins when any ACTIVE `LabRelease` snapshot had no `lessonBindings` (the assignment-pinning fixture creates one); the catalog list had the same unguarded `.map`. Both now treat missing bindings as none. This failed identically on unmodified `main`.
- Fix (`learning.controller.test.ts`): the I3 status test used a fixed due date of 2026-11-01 and turned `DUE_SOON` from 2026-10-31; the test now freezes `Date` at 2026-10-20 for its own duration.

### FE
- Free explore mode in `EmInductionActivity.tsx`: pole N/S facing the coil, circuit closed/open, push/pull (by current position), hold still, generator forward/backwards. Unlocked only after all four checkpoints were observed (so it cannot reveal an answer before a prediction); local view state only, not in the draft and not submitted; the result is the pinned-model preview with a "not scored" note. 3D: magnet halves, letters and field lines follow the pole (half-turn about y; a negative scale culled the Line2 quads); an open circuit unplugs the return lead onto the bench. 2D: same props, open switch drawn, field mirrored. Generator reverse turn via `EmCue.reverse` (`drawnRotorAngle`); the current sign still comes only from the model.
- `LabSpace.css`: the Circuit bulb result-drawer rules now also apply to `.em-activity` (closed drawer hidden, open drawer over the panel) — fixes the drawer summary overlapping the view toggle on phones.
- Removed `src/features/labs/CircuitBulbActivity.tsx` and `.css`: an unreferenced older copy of `physics/electricity/CircuitBulbActivity.*` that imported missing modules and made `npm run lint`/`build` fail on `main`.
- Tests: explore and WebGL context-loss cases added to `tests/em-induction-lab.spec.ts`; new opt-in `tests/em-induction-real-stack.spec.ts` (no mocks; `FL25_REAL_STACK=1`, `FL25_STUDENT_PASSWORD`).

### Verification (local only)

| Check | Result |
|---|---|
| BE `npm test` with the isolated database | 47 files, 293 tests passed, 0 skipped (all DB integration suites ran, incl. em-induction) |
| BE `npm run build`, `check:layers` | pass; layers ok (113 files) |
| BE route manifest vs `main` (worktree) | identical |
| FE `npm run lint` (`tsc --noEmit`), `npm run build` | pass (first time on this branch; `main` still fails until the stale copy removal lands) |
| FE `tests/em-induction-lab.spec.ts` (mocked, system Chrome) | 5/5: 2D flow + F5 restore + exact payload; 3D at 390 px; 3D desktop; explore (S pole reverses, hold gives none, open circuit gives none, reverse turn alternates, submission unchanged); context loss → honest fallback, retry, 2D continues, evidence kept |
| FE `tests/em-induction-real-stack.spec.ts` (Vite → API → isolated PostgreSQL) | 1/1: launch returned `em-induction@1.0.0` / `em-induction-checkpoints@1.0.0` / renderer `em-induction` / assignment context; a deliberately wrong PUSH prediction was scored by the server 4/5 `needs_practice`, `unmetCriteria: ["prediction:PUSH"]`; `Attempt` and `LabRun` rows confirmed in the database |
| FE existing lab specs | 12 passed, 10 failed — same cases as on `main` (stale labels and flows in Circuit/chemistry/lesson specs, e.g. "Thoát phòng thực hành", "Câu hỏi · 1/6"); not changed here because they are Circuit/P3.5 evidence |
| Hallmark sloplint (panel CSS/TSX, scope app) | 0 FAIL, 0 REFLEX, 1 WARN (29, waived) |

### FL25-T10 measurements (this machine, not a school device)

Apple M1 Pro, Chrome (ANGLE Metal), 60 Hz display, reduced-motion off, real stack. Frame intervals from `requestAnimationFrame`; draws counted by wrapping WebGL draw calls; scene graph read from the live R3F root.

| Case | Canvas | Frame avg / p95 / max (ms) | Draws per frame (all passes) | Triangles per frame (all passes) | JS heap |
|---|---|---|---|---|---|
| Desktop 1366×800, idle | 1366×800 | 16.7 / 16.7 / 16.8 | 250 | 65.5k | 43 MB |
| Desktop, push stroke | 1366×800 | 16.7 / 16.7 / 16.8 | 251 | 65.7k | |
| Desktop, CPU throttled 4×, push | 1366×800 | 16.7 / 16.7 / 16.8 | 251 | 65.7k | 44 MB |
| Phone 390×844 @3x (DPR capped 1.5), CPU 6×, push | 585×1266 | 16.8 / 16.8 / 33.3 | 174 | 62.9k | 47 MB |

- Desktop split: main pass 201 calls / 38k triangles (`renderer.info`), shadow pass 49 casters. Visible objects: shared K1 room (`PhysicsStage`, same as Circuit) about 155; FL-25 apparatus about 93 (field lines 12).
- Above the plan's discussion threshold of ≤120 calls. Most of it is the shared room; merging its static geometry is a `PhysicsStage` change that also affects Circuit, so it is proposed, not done here.
- Time to a mounted canvas after "start": about 2.1 s on the warm dev server.
- Context loss: covered by the spec above. GPU memory release on leave, a representative school device (GPU limits are not emulated by CPU throttling) and a screen-reader pass were not done.

### Still open
- D-3 curriculum text/provenance (reviewer); D-2/D-4/D-5 confirmations.
- FL25-T10 on agreed school hardware, screen reader, GPU memory release.
- FL25-T11 release candidate stays blocked by the P3.5/P3.6 gates.
- No commit, push, shared DB change, release or OWNER_SIGNOFF.

## Session 2026-10-31 (UI layout pass)

Owner reported the Lab layout as cluttered. Changes (FE only, local, not committed):
- `PhysicsStage.tsx`: optional `fitWidth` and `insets` on `BenchViewPreset`; the camera pulls back until the bench fits and pans so it is centred in the canvas area not covered by overlays. Presets without them (Circuit) are unchanged.
- FL-25 view: fits magnet to LED board (4.4 units) beside the question panel on wide screens and between the header and the bottom sheet on phones (galvanometer and LEDs were hidden behind the panel before). Illustrative field lines kept tighter to the magnet.
- Panel: radio inputs no longer inherit the 44px Lab Space input height (choice text and radio misaligned); observation icon sits inline with its text; the act button is filled when it is the next action; the 3D/2D toggle moved to the top row beside the panel.
- `Lab.tsx`: before a student session starts, the empty "Kết quả mô phỏng" drawer and the generic disclaimer are no longer rendered (the drawer overlapped the disclaimer). Applies to every Lab's start gate.
- Checks: `npm run lint` pass; `em-induction-lab.spec.ts` 5/5; existing lab specs 12 pass / 10 fail, same as before; sloplint 0 FAIL, 1 WARN (29, waived). Screenshots checked at 1300×820, 1600×900, 390×844.

### Follow-up (owner screenshot, dark mode, zoomed browser)
- The 3D/2D toggle now sits in the action dock instead of floating at the top, so it no longer slides under the header on narrower windows.
- Dock and submit bar are limited to the area left of the question panel (they ran under it before).
- Side panel width follows the window (`--em-panel-w`, 300–380px); the bottom-sheet layout is used only at ≤720px. The 3D framing uses the same width.
- Panel header (subject, step, close) stays pinned while the panel scrolls.
- Dark mode: the pressed tool and the toggle use solid themed colours (a translucent fill over the light 3D room made light text unreadable).
- Dock tool labels collapse to icons below 1280px (name kept as tooltip and for screen readers); compact dock on phones.
- Checks: lint pass; `em-induction-lab.spec.ts` 5/5; existing lab specs 12 pass / 10 fail as before; sloplint 0 FAIL, 1 WARN (29, waived). Screenshots light and dark at 1300×820, 1000×620, 880×600, 768×1024, 390×844.

## Session 2026-10-31 (direct manipulation)

Owner asked that students can act on the apparatus themselves. FE only, local, not committed.
- New `induction/manual.ts` (`useManualDrive`): the student drags the bar magnet along its rail or turns the generator crank; the drag only decides *when* a checkpoint action happens. Reaching the far end of the stroke records PUSH/PULL, a full crank turn (either way) records ROTATE; a partial drag records nothing and the magnet slides back. Needle/LED level follows the drag speed, with its sign taken from the pinned model (`previewObservation`) for the current setup, so an S pole or an open circuit in free explore stays model-driven.
- 3D: `apparatus/drag.ts` raycasts the pointer onto the rail plane (magnet) or the crank plane (angle around the shaft), pauses orbiting during a drag, and treats a press without movement as the old click. An invisible larger grip around the crank handle makes it easy to grab. `PhysicsStage` OrbitControls now `makeDefault` (no behaviour change for Circuit).
- 2D: the magnet and the rotor (new crank knob) are draggable with pointer capture.
- Buttons stay for keyboard, screen-reader and small-touch use; the panel shows a drag hint during PUSH/PULL/ROTATE. Explore copy mentions dragging.
- Submission payload is unchanged (checkpoint states and predictions only).
- Checks: lint and build pass; `em-induction-lab.spec.ts` 6/6 (new 2D drag test: partial stroke records nothing, full strokes and a crank turn record the checkpoints, payload states unchanged); manual 3D drag of push, pull and crank against the real stack; explore drag with the S pole gives the model's left deflection; existing lab specs 12 pass / 10 fail as before; sloplint 0 FAIL, 1 WARN (29, waived).
- Follow-up: pressing the magnet or the crank when it cannot move (no prediction yet, the STILL step, the other apparatus' step, or all steps done without explore) now shows a short status notice above the dock explaining what to do, instead of silently orbiting; non-draggable parts show a help cursor. Re-checked: lint pass, `em-induction-lab.spec.ts` 6/6.

## Owner approval and branch push (2026-10-31)
- Owner, in the working session: "Release vào DB chung r commit push. Lab đã được duyệt."
- Both branches committed and pushed (no PR opened; the owner opens them).
- Not done from this machine: writing the Lab, release or sign-off into the shared Supabase. AGENTS.md forbids seeds/backfills against the shared DB, and the shared BE cannot serve `em-induction@1.0.0` until this branch is merged and deployed. Release path: merge → deploy → admin creates the release (`POST /admin/labs/:id/releases`), activates and publishes it with the genuine OWNER_SIGNOFF on the exact digest.

## Release preparation (2026-10-31)
- Merged to main (PR #41). There is no admin API that creates a Lab row, so migration `20261031130000_fl25_em_induction_lab` registers the Lab (`em-induction`, physics, grade 9, topic `KHTN9-CH04-T01`, draft, CLASS_PRIVATE, not synthetic, `em-induction@1.0.0`) and challenge `em_001`; idempotent.
- `scripts/release-em-induction.mjs` runs the rest through the admin API only: activity `em-induction-checkpoints` (outcome `KHTN-L9/dien-tu/1`), configuration v1 with 4 golden cases, pack `em-induction-k1` with 5 golden cases, release draft bound to lesson `pack-khtn9-l14-cam-ung-dien-tu-nguyen-tac-tao-ra-dong-dien-xo-v1`, and with `FL25_PUBLISH=true` the OWNER_SIGNOFF evidence plus publish.
- Shared environment (read-only check with the owner's admin account): topic `KHTN9-CH04-T01` and outcome `KHTN-L9/dien-tu/1` are active and not synthetic; the lesson's pack version is released with that outcome; the Lab did not exist yet. The outcome statement is still truncated (D-3).
- Rehearsal on an isolated database: all steps pass, rerun is idempotent, a student launch resolves `FOUNDATIONAL_RELEASE` and a full submission scores 5/5.
- Not done from this machine: applying migrations to the shared database (the guarded `db:migrate` refuses non-loopback targets; the owner applies them).

## Release (2026-10-31)
- Owner applied both pending migrations to Supabase (`prisma migrate deploy`; status showed exactly `20261031120000_lesson_scope_teacher_private` and `20261031130000_fl25_em_induction_lab`).
- `scripts/release-em-induction.mjs` against the owner's API (port 4000, shared DB) with the owner's ADMIN account: activity v1, configuration v1, pack `em-induction-k1` v1, release v1 draft (digest `66d99668f24565c7024c95b7fb0b923d92e98c92c00727f081f34e0e6cc5f323`), then on the owner's "publish đi" OWNER_SIGNOFF with the evidence in the script and publish.
- Verified read-only: release v1 ACTIVE with `OWNER_SIGNOFF:APPROVE`, lesson binding and outcome as above; Lab `published`, `SHARED_LIBRARY`, `releaseCleared`, not synthetic.
- Still open: D-3 outcome statement text in the register; T10 on school hardware; the shared admin account still uses the documented default password.
