# Lab 3D NexaLab — Research brief

**Status:** Discovery proposal, 2026-10-18. Not an approved feature specification and not sprint authorization. This document is separate from active sprint artifacts.

## 1. Executive summary

NexaLab should treat “builder” as a structured authoring workflow for a reviewed science activity and its presentation, not as a general-purpose 3D editor or file importer. Two product tracks share a runtime but have different publication, discovery, access, and progress rules:

1. **Foundational Lab:** NexaLab-owned, publicly discoverable only after release, mapped to a canonical official curriculum topic and applicable learning outcomes. It may contribute to official course progress only when the fixed curriculum version marks it required.
2. **Class Lab:** owned by one Class Space and teacher, linked to a class lesson and its subject/grade/chapter/topic context. Active approved members may use it as class practice. Only explicit assignment targets can submit scored evidence. It never enters the public catalog or official course denominator.

In both tracks, authoring should compose reviewed activity content, an allowlisted deterministic model, validated parameters, and a versioned visual asset/binding package. Authors must not upload executable simulation code or alter scientific formulas in the visual builder. The server owns scientific outputs and evaluation. A builder preview is a draft validation aid; release requires the relevant editorial, scientific/model, asset-rights, and safety gates.

The sprint boundary is preservation: keep current attempt, assignment, taxonomy, version-pinning and class authorization semantics stable. Do not infer implementation of either builder from the current `Lab` schema or admin simulation screen.

## 2. Evidence and certainty

### Recorded product direction

- The PRD says foundational Labs are shared and taxonomy-linked; teacher-created Labs are class-private, linked to a Class Space lesson and its subject/grade/chapter/topic, and scored only when explicitly assigned. The product amendment explicitly says this is direction, not implementation evidence.
- The PRD requires shared content review for editorial, scientific accuracy, and rights; teacher-private material cannot bypass sources/rights, child-safety, or the approved scientific-model gate for scored Labs. Admin may quarantine but may not attest correctness or force release.
- Open Learning contracts say no default quiz gate, custom Lab access is independent of assignment, server checks active approved membership on every list/detail/launch/save/read, and generic file import cannot create a Lab.
- Content Foundation specifies deterministic server models, golden cases, semantic visual maps, immutable pack versions, and independent accuracy and rights gates. Important claims require two independent references, including one authoritative science/education source. Automation cannot attest scientific validity.

### Verified implementation shape (source inspection)

- `Lab` currently has `id`, `subjectId`, free-text `topic`, `grade`, `learningObjective`, `status`, `simulationModelRef`, JSON `config` and `assets`; there are no first-class scope, owner, class, lesson, chapter/topic or outcome relations on it.
- `Lesson.labId` is a single optional pointer. `CurriculumChapter`, `CurriculumTopic`, and `CurriculumOutcome` exist, but Labs are not normalized into that taxonomy.
- `SimulationConfigVersion` pins a model ref, challenge parameters and golden cases. `SimulationPackVersion` pins a model ref, engine version, activity version, template, asset version, semantic map, bindings and challenge templates. Attempts record engine version plus nullable config/pack version IDs for backwards compatibility.
- Server simulation resolves only registered models. Current registry has `circuit@1.0.0`, `chemistry@1.0.0`, and `eye@1.0.0`. Pack validation checks model compatibility, parameter bounds, units, golden cases, required semantic IDs, GLB node/animation references, bindings, independent subject/model reviewers and (outside development/test) range approval.
- Current API surfaces include `GET /labs`, `POST /simulate/:labId`, student `POST /attempts`, lesson pathway/resource routes, and admin lab/pack management. Attempt submission recomputes result/verdict on the server, resolves an assignment or free-practice path, and pins current versions where available.
- Current app runtime is a fixed renderer/workspace selection keyed to known lab IDs and a catalog flow. The backend packs are more configurable than the student renderer currently appears to be; the general reusable 3D runtime and complete authoring UI are not evidenced by this inspection.
- KHTN8 source-map work exists, but memory and taxonomy artifacts mark the map `NEEDS_HUMAN_REVIEW`; printed-page ranges/OCR do not prove official outcomes or source page locators. Treat it as candidate evidence, not a release-ready alignment source.

### Assumptions for this proposal

- “Lab 3D” means an interactive visual lab; 2D/diagram fallback may be acceptable when it gives equivalent learning evidence or device performance requires it.
- Teacher custom Labs are reusable within the owning class, whether or not every member is an assignment target. This matches the Open Learning contract; assignment targets remain a separate scoring boundary.
- Initial pilot selection should be an activity-model pair whose science is tractable and independently reviewable. Existing circuit lab is a candidate, not an automatically approved builder exemplar.

## 3. Product flows and roles

### Foundational track

1. Content editor selects an approved KHTN8 taxonomy topic and outcomes from a versioned curriculum map; declares objective, prerequisite concepts, activity type, sources, rights and safety notes.
2. Author selects an existing allowlisted scientific model and a reviewed activity template. They configure only supported parameters, ranges and challenge variations; attach a licensed/original asset; map semantic controls to scene nodes and declare visual bindings.
3. Author runs server validation and student-mode preview. Validation reports broken mappings, out-of-range values, failing golden cases, missing alternative presentation, accessibility issues and absent evidence/reviews. Save as immutable draft version; edits create a new draft.
4. Subject reviewer checks curriculum fit, scientific claims, expected observations and limitations. Independent model reviewer checks equations/algorithm, domains, units, numeric stability and golden cases. Safety and rights reviewers check hazards, age-appropriate instructions, asset provenance/license and media constraints. Reviewer identity, role, evidence and decision are retained.
5. Release manager publishes only after all gates pass. Release enters the open catalog by stable taxonomy IDs; withdrawal/quarantine blocks new launch while preserving historical attempts and pinned versions.
6. Student opens a Lab from catalog or lesson context, predicts, changes allowed variables, observes server-verifiable results, explains evidence, retries. If marked required in the fixed curriculum, completion is recorded separately from assignment evidence.

Roles: content editor/author; subject reviewer; model reviewer; safety and rights reviewers; release manager (operational, cannot self-attest scientific validity); student; admin operator with quarantine-only emergency authority.

### Class Lab track

1. Teacher must own the Class Space and select a lesson belonging to that class, then confirm the inherited subject/grade/chapter/topic context. The contextual taxonomy is metadata, not a route into the public catalog.
2. Teacher starts from a released baseline Lab/model template or an allowed activity template; creates a private draft, sets bounded parameters and challenge intent, and previews it. Teacher cannot modify engine code/model truth or copy an unreleased model into a scored flow.
3. Teacher self-reviews pedagogical clarity and class suitability. For unscored practice, publish to active approved class members subject to source, rights, child-safety and approved-model constraints. Scoring requires a reviewed model/config and explicit assignment with an immutable target snapshot.
4. Student class membership is checked at every discover/read/launch/save operation. Scored evidence additionally checks assignment target membership. Removed/pending/outside students get a non-enumerating denial.
5. Teacher reviews attempts and learning evidence, then edits by creating a new version. Existing assignments and attempts keep their original content/model/asset version; assignment target changes follow existing snapshot semantics.

Roles: class owner teacher; active approved class member; assignment target; admin quarantine/operator. Membership and assignment-target permissions are distinct.

## 4. Authoring data boundaries (proposed)

Keep these identities separate; do not overload `Lesson`, `Assignment`, `Lab.config`, or the simulation pack as the whole authoring object.

| Concept | Responsibility | Stable links / invariants |
|---|---|---|
| Lab identity | Logical activity and track/scope | `FOUNDATIONAL` or `CLASS`; stable ID, owner/publisher; classId required only for class scope; no client-controlled scope escalation |
| Context mapping | Where users discover the Lab | Foundational: canonical curriculum version, topic, outcomes; class: class lesson and copied/validated subject/grade/chapter/topic context; chapter derives from topic |
| Activity version | Learning design and science-facing content | objective, prerequisites, procedure, variable roles/units, expected observations, explanation, limitations, safety, references, review receipts; immutable once published |
| Model/config version | Executable scientific behavior and allowed experiment state | allowlisted modelRef + engine version, schema, supported ranges, initial state, challenge parameters, golden cases, tolerance, approval; no uploaded executable code |
| Visual asset version | Geometry/media and semantic correspondence | immutable asset hash/provenance/license, scan status, semantic node map, bindings and fallback; cannot change underneath a published pack |
| Release/assignment snapshot | Availability and assessment scope | release points at exact component versions; assignment pins activity/model/asset release and target snapshot; attempts pin engine/config/pack versions |

Composition should use immutable references and content hashes, even if a future persistence design stores a materialized `LabRelease` aggregate. Keep activity editorial text separate from model config, and keep private Lab ownership separate from curriculum taxonomy membership.

## 5. Simulation runtime and model ownership

- **Server is authoritative:** server validates input state, runs a deterministic allowlisted model, calculates outputs/verdicts and persists them. Client sends learner controls/parameters and idempotency key, not a trusted result. Rendering may be local and approximate but cannot become score truth.
- **Model ownership:** NexaLab owns reviewed model implementations and schema/ranges. A teacher authors pedagogy, challenge constraints within approved ranges, and asset bindings. This is a constrained activity builder, not an arbitrary physics engine authoring environment.
- **Runtime contract:** identify model by immutable `modelRef`; declare input/output schema and units; validate every state; deterministic output for a given engine+model+input; explicit limitations; bounded execution/memory; versioned golden test corpus. Unknown model or engine fails closed.
- **Separation:** renderer consumes a declarative manifest and model outputs; it never evaluates untrusted scripts. Semantic IDs are stable logical identifiers, asset node names are version-local, and bindings are allowlisted effects. Renderer failure does not alter server verdict.
- **Scoring:** challenge evaluator remains a separate deterministic layer. A lab can be exploratory/unscored; teacher assignment adds target eligibility and scored outcome without making all class use an assignment.
- **Version retention:** attempts pin the exact model, engine, activity/config/pack and asset versions used. New releases affect future launches only; old assets/versions remain retrievable for evidence, subject to archival policy.

## 6. Curriculum alignment and scientific review

- Use reviewed stable IDs, not chapter/topic titles or free text, for canonical alignment. Curriculum map itself needs source/version/provenance and review status. Require one canonical topic per foundational Lab; add related topics only with evidence, without duplicating the Lab identity.
- Trace each Lab objective and claim to applicable official outcome codes and age-appropriate source evidence. Report coverage by grade/domain/topic and keep “mapped”, “reviewed”, and “released” as separate states.
- Candidate exemplar must match KHTN8 GDPT 2018, declared prerequisites, expected qualitative and quantitative observations, accepted simplifications and explicit boundaries. The current KHTN8 extraction is not sufficient for automatic curriculum attestation.
- Scientific gate: independent subject and model reviewers; source-backed equations/assumptions; input-domain analysis; dimensional/unit checks; boundary/edge cases; golden cases including invalid input; tolerances; deterministic regression; UI-output consistency; known limitations. For scored labs, require model-range approval.
- Safety gate: distinguish virtual-only from any real-world instructions; no unsafe material/procedure recommendations; label simulation limitations and never imply virtual output is a guarantee for real apparatus. Child-facing language, emergency/real-equipment caveats, accessibility and age-appropriate framing receive human review.
- Rights gate: asset and content provenance/license captured at item level, including derivative/third-party model components. Rights release is independent of scientific review.

## 7. Assets and parameter validation

- Accept only declared media formats and bounded file size/triangle count/texture dimensions/material count/animation count; scan and inspect uploads, compute SHA-256, store immutable private objects, retain source/license and attribution.
- GLB/3D validation should reject external URI/script references and malformed/oversized assets; inspect node and animation inventory; require semantic mapping for all model-required components; verify no binding points to unknown outputs/targets or dead behavior. Define mobile download and render budgets per released scene.
- Parameters are allowlisted per model with numeric type, unit, min/max, step/precision, default, dependencies and physically meaningful domain. Teacher ranges must be subsets of model-approved ranges; challenge ranges are subsets of the teacher/activity range. Reject NaN/infinity, coercion, unknown keys, overlong state, impossible combinations and cross-version schema mismatch.
- Builder UI derives controls from the validated schema. A file/import operation may attach an asset through a separate governed asset workflow; it must never synthesize a Lab or execute embedded code.
- Preview must use the same server model/version as eventual attempts and clearly label draft/non-scored output. Avoid client-side alternate equations that drift from server truth.

## 8. Preview, test, version, publish lifecycle

Suggested lifecycle: `DRAFT → VALIDATING → REVIEW_REQUIRED → APPROVED → PUBLISHED → RETIRED`; exceptional `QUARANTINED`/`WITHDRAWN` state with reason and audit. Do not permit in-place edits after approval/publication; fork to a new draft version. Class drafts can have a lighter author review for unscored practice, while scored use must meet scientific-model gate.

Validation before review: structure/schema, taxonomy/ownership consistency, asset security/provenance, model ranges, golden cases, semantic map/bindings, device/performance budget, preview smoke paths, keyboard/screen-reader labels and fallback. Human review receipts are distinct from automated validation. Publication records exact version manifest/hash and gate evidence. Rollback means retiring a release and repointing future discovery; it must not rewrite past attempts or assignment snapshots. Quarantine stops new access promptly and records why; historical evidence remains auditable.

## 9. Contracts to preserve during the current sprint

These are compatibility constraints, not a claim that every behavior is fully production-ready:

1. Keep `LessonStep` pathway resource identity (`labId`/`challengeId`) valid and preserve current `GET /lessons/:id/pathway` and `GET /lessons/:lessonId/steps/:stepId/lab` response semantics used by the student flow.
2. Keep `POST /attempts` as the authoritative submission boundary: client lab state is validated and recomputed by the backend; persist result/verdict, idempotency, assignment linkage, duration, engine version and pinned config/pack version identifiers. Do not make client-supplied `simulationResult` authoritative.
3. Preserve `POST /simulate/:labId` preview behavior for current clients and role checks; future builder preview can be additive and draft-aware without changing student simulation semantics.
4. Preserve assignment `contentType/contentId`, immutable `AssignmentTarget` snapshot, `contentVersion`, and current distinction between free practice and assignment-scoped evidence. Lab builder must not turn class membership into score eligibility.
5. Preserve `SimulationConfigVersion` and `SimulationPackVersion` immutability/version pinning, model allowlist, golden validation, and attempt fields `simulationModelVersion`, `configVersionId`, `packVersionId`. New fields/routes should be additive/migrated with old attempts remaining readable.
6. Keep `GET /labs` compatible for existing open-catalog consumers while future API distinguishes public foundational discovery from authorized class Lab discovery. Do not expose class Lab metadata by folding it into an unfiltered global list.
7. Keep generic file-import allowlist limited to study decks, unscored quizzes, and test question content. No Lab creation through CSV/XLSX/PDF imports.
8. Keep fixed official curriculum denominator separate from custom Labs and assignment evidence. Do not count class Labs as foundational course progress.

Before builder stories begin, reconcile existing free-practice attempt behavior and the proposed open catalog against current routes: source inspection shows assignment-first legacy constraints in some lesson flows, while current Open Learning direction calls shared content open. Resolve that in the planned catalog/access change, not by silently changing builder contracts mid-sprint.

## 10. MVP phasing and tradeoffs

**Discovery gate (now):** choose one KHTN8 exemplar and authoring ownership policy; review curriculum sources, model math and safety. No builder implementation implied.

**MVP 1 — foundational author/release lane:** admin/editorial internal tool using fixed allowlisted models, structured forms, 2D/approved existing visual, golden-case preview, review receipts, immutable release and catalog mapping. Highest leverage and consistent public quality. Tradeoff: content team remains bottleneck; no teacher flexibility.

**MVP 2 — constrained Class Lab builder:** teacher forks an eligible released template, edits bounded prompts/ranges/challenge settings and class-scoped assets; can publish unscored practice to active approved members. Scored assignment only after model and version gates, with explicit target snapshot. Tradeoff: more data/auth/version complexity and risk of private content quality variation.

**Later:** richer 3D scene composition, collaboration, user-created components, additional subjects/grades, model authoring DSL, AI drafting, arbitrary uploads and multi-class sharing. Defer arbitrary executable/model code indefinitely unless a sandbox and scientific governance case is proven; it expands security and correctness risk sharply.

Key tradeoff: maximize teacher freedom vs reproducible scientific truth. Recommendation is high freedom over learning prompt/activity sequencing, low freedom over model equations, parameter domains and scored evaluation.

## 11. Unanswered questions

1. What precise curriculum source/version is canonical for KHTN8 outcomes, and who signs off on its mappings? Can the existing content map graduate from human-review status?
2. Which first topic/activity has suitable scientific model maturity, learning value, asset rights and review capacity? Is existing circuit merely a demo or a candidate after independent verification?
3. Does every foundational Lab contribute to course progress, or only a versioned subset explicitly marked required? Who controls that flag and denominator change?
4. May a teacher create a Class Lab from any released foundational model, or only from teacher-authorized templates? Can teachers attach original assets, and what review is needed for unscored vs scored use?
5. Must class Lab author be class owner only, or may delegated co-teachers author? What happens on teacher transfer/class archive/lesson archive?
6. Should class-shared draft publication be immediately visible to all active approved members, and can an assignment reference an older version after a new release?
7. What is minimum acceptable 3D quality/performance and which mobile/browser matrix? Is an equivalent 2D fallback acceptable?
8. How long must old model code/assets remain executable for replay of evidence? What happens when an engine version is retired or a security quarantine prevents historical rendering?
9. Define review staffing, turnaround and conflict-of-interest rules; can one person fill subject or safety review roles in early pilot, and which independent reviews remain mandatory?
10. What are allowed real-world safety instructions vs virtual-only experiences, and who owns safety incident response and takedown authority?
11. What reports/artifacts should teachers see (attempt traces, parameters, predictions, explanations), and are student free-text explanations stored/scored in MVP?
12. What content ownership/licensing applies to teacher-provided assets and derivative works, especially after class ends?

## 12. Risk register

| Risk | Likelihood / impact | Early control |
|---|---|---|
| Scientific simplification presented as real-world fact | Medium / critical | explicit assumptions/limitations, independent reviewers, golden and boundary cases, student-facing “model” framing |
| Builder allows unsupported parameters or code injection | Medium / critical | allowlist schemas, strict server validation, no code, closed failure, adversarial payload review |
| Curriculum map is provisional or textbook-derived without rights | High / high | source/version gate; do not publish mapped claims from `NEEDS_HUMAN_REVIEW`; item-level rights evidence |
| Visual changes diverge from server calculation | Medium / high | semantic contract, server preview, binding tests, version pinning and output labels |
| Cross-class Lab data leaks through list/direct ID/cache | Medium / critical | scope-aware queries and auth at every read/write/launch; non-enumerating denial; cache partitioning |
| Assignment and class membership confused | Medium / high | separate access and score authorization; immutable target snapshots; non-target practice stays unscored |
| Version drift breaks past result interpretation | Medium / high | attempts pin activity/model/engine/asset manifest; replay/retention policy; immutable releases |
| 3D asset performance/accessibility excludes low-end phones | High / medium | budgets, device matrix, progressive load, keyboard/text/2D fallback, preview performance gate |
| Review process blocks content supply or becomes rubber stamp | Medium / high | name capacity and reviewer independence, track gate evidence/turnaround, narrow initial content slice |
| Existing contracts change accidentally during sprint | Medium / high | additive changes only, contract fixtures, scoped migration, review compatibility against active diffs |
| Teacher content creates unsafe real-world behavior | Low-medium / critical | clear virtual-only boundaries, reviewed templates and safety copy, quarantine/takedown audit |

## 13. Proposed discovery-to-delivery epic sequence

Do not add these to the current sprint. After discovery approval, sequence separate artifacts and explicit gates:

1. **Research/discovery:** source and outcome verification; candidate topic comparison; roles and governance; teacher/student interviews or prototype tasks; decide progress semantics, class reuse, asset rights and device budget.
2. **Product/design spec:** PRD amendment first; then focused Lab 3D spec with separate track requirements, lifecycle and acceptance matrix; authoring/student UX for desktop/mobile; taxonomy/content model and API compatibility contract. Record unresolved decisions instead of assuming them.
3. **Platform/model foundation:** versioned model schema and registry; engine compatibility; activity/asset/release persistence; server validation and golden corpus; migrations, audit, retention and rollback. Keep runtime packages deterministic.
4. **Foundational author/review/release:** internal author form, preview, review queues, release/quarantine and open catalog integration; curated exemplar and verified curriculum links.
5. **Student runtime integration:** generalized renderer/controls, responsive/accessibility behavior, prediction/observation/explanation evidence, free and assigned practice paths, exact version replay.
6. **Class Lab authoring and access:** teacher-owned class drafts, membership-scoped discovery and launch, class lesson/taxonomy consistency, assignment target enforcement and teacher evidence views.
7. **Release validation:** unit/model golden/property tests; API role/membership/target tests; DB migration/backfill/rollback; frontend rendered device and accessibility checks; real seeded integration; scientific and safety sign-off; performance and incident-recovery evidence.

Gate between research and design: explicit choice of exemplar, curriculum authority, model-authoring boundary, review capacity and progress rules. Gate before any scored Lab release: independent scientific/model approval, parameter/golden corpus, source/rights/safety receipts, immutable version pinning and authorization acceptance.

## 14. Source pointers

- Backend PRD: `docs/product/prd.md`, especially role/scope, release constraints, decisions 12 and 15–19, and implementation-evidence note.
- Product open questions: `docs/product/open-questions.md`, 3D Lab R&D and current-sprint non-goal.
- Open Learning contracts: `_bmad-output/specs/spec-open-learning-catalog/access-and-lab-discovery.md` and `class-space-assignment-contract.md`.
- Content and taxonomy governance: `_bmad-output/specs/spec-content-foundation/SPEC.md`, `_bmad-output/specs/spec-khtn8-taxonomy/brownfield.md`, `source-evidence.md`.
- Persistence/runtime: `prisma/schema.prisma`; `src/sim-packs.ts`; `src/simulation-versions.ts`; `src/routes.ts`; `packages/sim/index.ts`.
- Frontend runtime: `../nexalab-fe/src/labs/Lab.tsx`, `PracticalPathwayStep.tsx`, `CircuitPathwayStep.tsx`, `api.ts`, and `library.tsx`.
