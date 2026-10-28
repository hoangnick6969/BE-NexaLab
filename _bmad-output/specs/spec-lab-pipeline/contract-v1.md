# Lab Platform Contract v1

Version identifier: `lab-contract/1`. Every envelope below carries `contract: "lab-contract/1"`. A breaking change creates `lab-contract/2`. BE accepts both during an announced overlap.

## Ownership split

| Platform owns (shared, changed only by the platform integrator) | Each Lab owns (its module) |
|---|---|
| Envelopes, error codes, verdict vocabulary, LabRelease lifecycle, receipts | Model function, descriptor contents, fixtures |
| BE `MODEL_REGISTRY` entry format, FE renderer registry format | One registry line in each |
| Renderer host (launch, draft, submit, result, a11y shell, limitation banner) | Renderer component, assets, localized copy |
| Contract test runner (runs every Lab's fixtures on server + FE preview) | Scoring map from raw outputs to verdict |

Target module layout (proposed):

```
BE packages/sim/models/<lab>/<version>/{model.ts, descriptor.ts, fixtures.json}
BE src/modules/labs/application/model-registry.ts        # one line per modelRef
FE src/features/labs/renderers/<rendererKey>/{Renderer.tsx, copy.ts}
FE src/features/labs/renderer-registry.ts                 # one line per rendererKey
```

## 1. ModelDescriptor

```ts
type ModelDescriptor = {
  modelRef: string;              // "circuit@1.1.0" — immutable behaviour identity
  engineVersion: string;         // per model, not one global VERSION
  labKey: string;                // logical Lab family; a model may serve several Labs/Class Labs
  stateSchemaVersion: number;    // bump on any labState shape change
  stateSchema: JsonSchema;       // strict; unknown keys rejected
  stateConstraints: Constraint[];// release-level ranges on state (U, R, N, B...), narrowable, never widenable
  params: ParamSpec[];           // challenge params (number|choice) with unit, min, max, step, default
  outputs: Record<string, { type: "number"|"string"|"array"|"null"; unit?: string }>;
  rawVerdicts: string[];         // model's own statuses
  errors: Record<string, string>;// stable error codes → message key (e.g. UNSUPPORTED_TOPOLOGY)
  limitations: string;           // learner-facing
  modality: "2d" | "3d" | "2d+3d";
};
```

Rules:
- `simulate(state)` is pure and deterministic. It does not read time, randomness, the environment or I/O.
- Invalid state fails closed with a declared error code. It is never coerced into a plausible result.
- `stateConstraints` and `params` are the **only** narrowing surface for packs, releases and Class Labs.

## 2. LabRelease

```ts
type LabRelease = {
  id: string; labId: string; version: number;
  modelRef: string; engineVersion: string; stateSchemaVersion: number;
  activityVersionId: string; packVersionId: string;
  params: Record<string, ParamRange|ChoiceSet>;       // pinned config (replaces separately activated config)
  stateConstraints: Constraint[];                      // ⊆ descriptor constraints
  challengeTemplates: ChallengeTemplate[];             // from pack
  rendererKey: string; minFeRenderer: string;          // FE compatibility
  digest: string;                                      // sha256 over all of the above
  status: "DRAFT"|"VALIDATED"|"APPROVED"|"ACTIVE"|"SUPERSEDED"|"QUARANTINED"|"RETIRED";
  receipts: ReviewReceipt[];
};
```

## 3. LaunchEnvelope (BE → FE)

```json
{
  "contract": "lab-contract/1",
  "labReleaseId": "…", "labId": "circuit", "rendererKey": "circuit-2d",
  "modelRef": "circuit@1.1.0", "stateSchemaVersion": 2,
  "context": { "kind": "FOUNDATIONAL|LESSON_STEP|CLASS_PRACTICE|ASSIGNMENT", "lessonStepId": null, "classLabId": null, "assignmentId": null },
  "challenge": { "id": "…", "objective": "…", "params": { "maxCurrentMa": 20 } },
  "stateConstraints": [ … ], "initialState": { … },
  "copy": { "title": "…", "objective": "…", "limitations": "…", "safety": "…" },
  "scored": false,
  "launchedAt": "ISO-8601"
}
```

## 4. SubmitEnvelope (FE → BE, `POST /attempts`)

```json
{
  "contract": "lab-contract/1",
  "labReleaseId": "…", "idempotencyKey": "uuid (required)",
  "stateSchemaVersion": 2, "labState": { … },
  "challengeId": "…", "lessonStepId": null, "classLabId": null, "assignmentId": null,
  "durationMs": 12345
}
```

Server rules:
1. **Idempotency.** `(studentId, idempotencyKey)` is unique. A same-payload replay, including a concurrent duplicate that hits the unique violation, returns the stored attempt. A different payload returns 409 `IDEMPOTENCY_KEY_REUSED`.
2. **Release check.** Lock the Lab's activation key, then load the release.
   - `ACTIVE` → accept.
   - `SUPERSEDED` and `now - activatedAt(successor) ≤ grace` → accept under the pinned release.
   - Otherwise → 409 `LAB_RELEASE_CHANGED`. Same for a `stateSchemaVersion` mismatch.
3. **Authorization** per context (see `class-lab-track.md` matrix). The context is derived on the server. Client IDs only narrow it.
4. **Validation** order: schema → `stateConstraints` → evaluate → scoring map. Constraint failure returns 422 `LAB_STATE_OUT_OF_RANGE` and records no attempt.
5. **Persist** in one transaction: attempt with `labReleaseId`, `context`, `executionTuple`, plus the progress projection for that context only.
6. Legacy clients without `labReleaseId` are served the active release for one compatibility window and recorded with `releaseResolution: "server_latest"`. After the window they receive 400 `LAB_RELEASE_REQUIRED`.

## 5. ResultEnvelope (BE → FE)

```json
{
  "contract": "lab-contract/1",
  "attemptId": "…", "attemptNumber": 3, "labReleaseId": "…",
  "verdict": "passed|partial|needs_practice",
  "rawStatus": "SAFE", "outputs": { "branches": [ … ], "currentA": 0.0149 },
  "score": { "rule": "…", "unmet": [] },
  "retryGuidance": "…", "hintAvailable": true,
  "pathway": null
}
```

`executionTuple` (`modelRef`, `engineVersion`, `labReleaseId`, `params`, `stateSchemaVersion`) is stored server-side and exposed only to admin replay. It is not returned in `outputs` and not copied into saved experiments.

## 6. Renderer interface (FE)

```ts
type RendererProps = {
  launch: LaunchEnvelope;
  state: unknown; onChange(next: unknown): void;   // host owns state, draft and reset
  preview: unknown | null;                         // advisory, same modelRef
  result: ResultEnvelope | null;                   // authoritative; replaces preview
  disabled: boolean;
};
// Registry: rendererKey → lazy(() => import(...)). Unknown key → host shows "unavailable", never a fallback Lab.
```

The host provides, so renderers do not re-implement them: draft persistence, submit with idempotency, retry, 409 relaunch flow, limitation/safety banner, verdict badge, hint panel, keyboard focus order shell and a text result table.

Each renderer must:
- give every interactive element an accessible name;
- encode state with text/icon and not by colour alone;
- support the keyboard alternative to drag;
- stay within the modality budget (`foundational-lab-track.md` §2D/3D).

## 7. Draft persistence (FE host)

- Key: `nexalab:lab-draft:v1:{userId}:{contextKind}:{contextId|labId}:{labReleaseId}:{stateSchemaVersion}`.
- Written on change, debounced 500 ms. Cleared on a `passed` result in scored contexts. Kept on 409 `LAB_RELEASE_CHANGED`, so after relaunch the host offers "restore earlier setup" only if the new `stateSchemaVersion` is equal.
- Wrapped in try/catch. If storage is unavailable, the Lab works without restore.
- Never sent to the server automatically. Never counts as evidence.

## 8. Fixture format (shared BE test + FE parity)

```json
{
  "modelRef": "circuit@1.1.0",
  "cases": [
    { "id": "GC-03", "state": { … }, "params": { "maxCurrentMa": 20 },
      "expect": { "rawStatus": "SAFE", "verdict": "passed",
                  "outputs": { "branches[0].currentA": 0.014893617 }, "tolerance": 1e-6 } },
    { "id": "GC-12", "state": { … }, "expect": { "error": "UNSUPPORTED_TOPOLOGY" } },
    { "id": "GC-14", "state": { … }, "release": "pilot", "expect": { "error": "LAB_STATE_OUT_OF_RANGE" } }
  ],
  "digest": "sha256 of cases"
}
```

- CI fails if the fixture digest of a model that has an `APPROVED`+ release changes. A behaviour change requires a new `modelRef` version.
- Golden cases run **with params**, so narrowed teacher thresholds are tested numerically, not only by verdict.

## 9. ReviewReceipt

```ts
type ReviewReceipt = {
  kind: "curriculum" | "subject" | "model" | "safety" | "rights" | "range";
  reviewerUserId: string;     // authenticated session user, never a typed name/email
  role: string;               // reviewer role granted by admin, audited
  subjectDigest: string;      // digest of exactly what was reviewed
  decision: "approved" | "changes_requested";
  note?: string; at: string;
};
```

Invariants:
- subject reviewer ≠ model reviewer;
- the creator of a component cannot sign its subject or model receipt;
- a receipt on an old digest does not carry over to a new draft.

## 10. Error codes (stable)

`LAB_NOT_FOUND`, `LAB_RELEASE_REQUIRED`, `LAB_RELEASE_CHANGED`, `LAB_STATE_INVALID`, `LAB_STATE_OUT_OF_RANGE`, `UNSUPPORTED_TOPOLOGY` (model-specific codes namespaced `<labKey>.<CODE>`), `IDEMPOTENCY_KEY_REUSED`, `STEP_LOCKED`, `CLASS_LAB_UNAVAILABLE`, `ASSIGNMENT_TARGET_REQUIRED`, `RENDERER_UNAVAILABLE` (FE only).

## Contract acceptance (P3.2 gate)

1. Circuit fixtures and one **mock second model with a different state/output shape** (for example a 1-D numeric slider model) pass the server runner and FE preview parity.
2. Integration tests on an isolated database:
   - activation during an open session (within/after grace);
   - concurrent duplicate submit → one attempt;
   - F5 restore without an attempt;
   - network retry with same key;
   - legacy client within/after the window;
   - replay of a new attempt;
   - legacy attempt labelled `legacy_unverified`.
3. FE builds with no `labId === "circuit" | "eye" | "chemistry"` dispatch in the host. Unknown `rendererKey` shows unavailable.
