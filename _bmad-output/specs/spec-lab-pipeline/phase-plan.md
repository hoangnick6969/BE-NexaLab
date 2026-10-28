# Canonical roadmap and first Build backlog

This file is the sole authority for P3.x phase names and gates. Stages in pipeline.md are process stages, not phase numbers. Work can overlap when dependencies allow.

| Phase | Goal / deliverable | Gate |
|---|---|---|
| P3.1 Define | Master spec, proposed portfolio, minimal contract, Circuit blueprint, Build backlog | DONE for technical Build; no human approval or release implied |
| P3.2 Platform Build | Launch-bound LabRun and server evaluation, shared host/registry, draft and idempotency; isolated fixtures | Contract integration checks pass; no public release required |
| P3.3 Curriculum and science | Source inventory and Circuit mapping; blueprint scientific review; portfolio refinement | Technical work does not wait; real curriculum and scientific/model approvals gate reviewed pilot and production claims |
| P3.4 Technical pilot | Internal Circuit activity, FE → BE → isolated DB → result, recovery and authorization | Real persisted test attempt and replay of the same tuple; independently assess actual reviewer status |
| P3.5 Compatibility gate | Different-model fixture through BE dispatch and FE renderer host | P3.4 persisted attempt + versioned contract + second-model fixture pass, and real curriculum/scientific-model reviewers approve the exact pilot mapping and model. Then at most two Lab implementation tracks |
| P3.6 Independent release and Class Lab | Reviewed per-Lab activation/operations; future Class Lab on active release | Exact tuple evidence and real review for each release; Class implementation needs an active release and access/assignment policy |
| P3.7 Portfolio expansion | Build and release prioritised Labs incrementally | Per-Lab blueprint, tests, reviewers and release evidence; ≤2 initial concurrent tracks |

### Numbering reconciliation

| Earlier reference | Canonical interpretation |
|---|---|
| Original P3.1 steps 0–4 | P3.1 Define; P3.2/P3.3 preparation; P3.4 pilot; P3.5 compatibility; P3.6 release |
| Earlier pipeline P3.1 Define, P3.2 platform, P3.3 register, P3.4 pilot, P3.5 gate | Same identifiers; P3.4 is technical verification, with approval/release separated |
| Earlier pipeline P3.6 factory, P3.7 Class Lab | P3.6 release operations and Class Lab; P3.7 portfolio expansion |
| Alternative proposal P3.1 Discovery, P3.2 Define, P3.3 Platform, P3.4 Pilot, P3.5 Parallel, P3.6 Release/Class, P3.7 Expansion | Discovery + Define are canonical P3.1; Platform is P3.2; parallel production follows P3.5 gate. Other phase names retain their intended ordering |

> Implementation status: P3.2a is **complete for the isolated BE slice**. New standalone Lab assignments pin a compatible pack/config/model/activity and all existing base-challenge parameters transactionally at publication; new LabRuns and legacy submits on that assignment use the pin. Creation of a new Lab assignment with an incomplete tuple fails with LAB_TUPLE_INCOMPLETE; previously existing unpinned assignments remain usable through legacy routes, and a new LabRun explicitly reports LEGACY_UNPINNED_LAUNCH rather than inventing publication history. Isolated PostgreSQL and HTTP-authorization tests do not constitute staging/production or curriculum/science approval. P3.2c, reviewed pilot and release gates remain open.
>
> P3.2b is **complete for the isolated FE contract slice**. A standalone Lab assignment now supplies its canonical challenge, links into the Lab with explicit assignment context, launches the P3.2a run, rejects unknown model/renderer pairs, submits with the run-bound envelope and keeps a bounded IndexedDB draft keyed by student/context/run/schema. Restoration is an explicit action after a new compatible launch; drafts never create evidence. Mocked-browser checks cover F5 restore, assignment context, run-bound retry/idempotency and incompatible renderer refusal. Lesson-pathway practicals remain on their backward-compatible legacy route because P3.2a does not bind those lesson assignments to LabRun; real FE-to-BE environment verification, device/accessibility review and P3.2c remain open, so P3.2 as a whole is not complete.
## First Build slice: P3.2a BE launch-bound pinning

**Ownership: BE platform agent.** Own BE labs API/application, model dispatch, the additive Prisma migration for LabRun, and isolated BE tests. Do not edit FE, published Lessons, seed data, historical attempts or public release flags. Shared integrator owns contract and reviews this slice.

1. Add a durable LabRun row with authenticated student, context/challenge, createdAt, expiresAt, revocation status and immutable JSON execution tuple/digest; snapshot pack/config/model/engine, activity/rubric identifier, effective params and state schema. Use existing version IDs as components; snapshot exact values needed for replay. Restrict mutation to revocation and expiry lifecycle. Existing attempt records remain untouched.
2. Add an authenticated launch operation for the existing standalone context. Reuse current access checks and activation advisory locks; atomically resolve one compatible active pack/config/model and capture the exact tuple. Fail closed if a required component is absent, invalid or mismatched. Use an isolated private, assignment-authorized fixture under current access checks; do not expose private prototypes publicly. The fixture activity/rubric is server allowlisted and versioned, never arbitrary client code.
3. Add an opt-in run-bound submission path with required run ID and idempotency key. Derive user/context from the server. Load and evaluate only the stored tuple; store the run ID and exact execution evidence on the new attempt, atomically with applicable progress. Keep the legacy API path unchanged.
4. Same key and same canonical payload returns the original attempt, including concurrent requests; same key and different payload returns 409. Canonical payload binds run ID, challenge/context and checkpoint evidence; timing/transport metadata does not change identity. Check committed idempotency result before expiry/revocation so a lost response is recoverable. An expired/revoked run cannot create a new attempt. No launch or local draft creates learning evidence.
5. Isolated PostgreSQL integration: activate tuple A, launch, activate compatible B, submit A and verify persisted/replayed A; mismatch/absent component; cross-user and unauthorized run; sequential and concurrent duplicate; changed payload; expiry; revocation versus concurrent submit with transaction ordering; legacy attempt and existing route compatibility. Assert actual persisted records and numeric outputs. Test runner must not silently skip when configured for CI.

Deliverable is a private engineering slice, not the full P3.2 gate and not a student release. If the existing Prisma model cannot reference the run without an additive nullable attempt field, add it in this migration. The immutable tuple may be duplicated in existing simulationResult for backward compatibility; document the single canonical source. No fabricated release or review receipt.

## Subsequent ownership and dependencies

| Work | Owner / boundaries | Dependency / handoff |
|---|---|---|
| P3.2b FE renderer host, run launch/submit, local IndexedDB draft | FE platform agent; owns FE host and small registry | DONE for isolated FE contract checks; real FE-to-BE environment, device and accessibility verification continue in P3.4 |
| P3.2c bulb model + checkpoint/rubric evaluation | Circuit agent owns model module and tests; no shared registry edits without integrator | Blueprint in P3.1; a stub may prove contract before review |
| Curriculum | Content/curriculum agent owns source register and mapping proposal; no published Lesson changes | Source authority, edition/locator and qualified reviewer; parallel with P3.2 |
| Science | Subject reviewer and distinct model reviewer | Review bulb assumptions, valid states, rubric and cases before reviewed pilot/release; real names and receipts required |
| P3.4 integration | Integrator owns small BE/FE registry changes and end-to-end tests | Platform + Circuit fixtures; verify launch, retry, F5, invalid state, mismatch and stored result |
| P3.5 second-model fixture | Platform integrator | P3.4 technical attempt + versioned contract; distinct model state/output; actual pilot curriculum and scientific/model approval before opening second implementation track; no full second Lab required |
| Class Lab and release | Separate future owner | Independent production release evidence, active Foundational release and explicit class access/version implementation |

## Define exit and outstanding reviews

Define exit is met: one canonical roadmap, reusable contract, version and assignment policy, documented first model/activity, nonblocking portfolio and actionable P3.2a exist. There are no unresolved high-level architecture decisions blocking P3.2a. The exact official authority document, approved Outcome/lesson mapping, bulb model and safety review, reviewer identities, production release evidence, device budgets, operational long-term retention and KHTN9 provenance remain open dependencies for later phases. They must not be fabricated or silently treated as complete.
