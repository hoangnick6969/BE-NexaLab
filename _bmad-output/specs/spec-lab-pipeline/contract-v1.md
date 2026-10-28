# Minimal Lab contract v1

Identifier: lab-contract/1. This is a target contract, not a claim that current code implements it. Existing APIs remain compatible while an opt-in run-bound path is developed. Production authorization is separate.

## Ownership and scientific independence

The shared runtime/host owns authorization, launch, run identity, version resolution, validation dispatch, attempts, replay, idempotency and local draft recovery. Each model module owns its versioned deterministic function, state/output schema, valid domain, errors, assumptions and golden/invalid cases. Each activity owns an immutable rubric and evidence schema. Scientific observations are facts from the model; the activity evaluates them in the context of an instructional task. A valid OPEN_CIRCUIT is an observation, not automatically a failed activity.

An interaction archetype is a reuse hint, not a universal model schema. Renderer selection and 2D/3D modality are separate; no arbitrary code or scientific formula may be downloaded from a pack.

## Immutable launch tuple

A server-persisted LabRun binds student, context, challenge and creation/expiry to a snapshot of lab ID, modelRef and engine version, activity/rubric identity and version, pack version, config version, effective params, state/evidence schema versions, relevant state constraints and a canonical digest. IDs reference existing immutable versions where available; the exact evaluation parameters are snapshotted. For the isolated engineering slice a versioned fixture activity/rubric may be used; it is not a reviewed release.

Launch resolves and snapshots compatible components under existing activation locks. Request IDs narrow server-side authorization; they do not grant access. A missing model, incompatible config, missing required tuple field or unsupported model fails closed. Old attempts without launch snapshots remain readable and replay is labeled legacy_unverified where appropriate.

## Envelopes

Launch response: contract, runId, labId, modelRef, engineVersion, activity/rubric version, state/evidence schema versions, constraints, initial state, rendererKey, expiry and learner copy. The server owns the tuple; the client cannot replace it. Student-facing output need not expose internal review information.

Submission: contract, runId, idempotencyKey, stateSchemaVersion, checkpoints/evidence, duration. For Circuit the checkpoints contain two independent states and selected predictions plus one structured explanation answer, as defined in the pilot blueprint. BE validates every state, computes observations on the pinned model, then runs the pinned activity rubric; client preview, selected predictions and submitted observations cannot override model output.

Result: attemptId, runId, rubric version, scientific observations per checkpoint, assessment verdict and unmet criteria, retry guidance. Invalid state is a validation error and creates no attempt. Valid but incorrect learner evidence creates a failed attempt and can be retried.

### Concrete v1 pilot payload

Proposed launch route: POST /labs/:labId/runs with challengeId and a server-validated context; the authenticated user is derived from the session. Successful launch returns runId, contract, expiresAt, modelRef, engineVersion, activityVersion, rubricVersion, stateSchemaVersion, evidenceSchemaVersion, constraints and rendererKey. The private P3.2a fixture uses an authorized assignment context; public release is not required.

The opt-in POST /attempts body for the bulb activity has this shape:

~~~json
{
  "contract": "lab-contract/1",
  "runId": "server-generated-run-id",
  "idempotencyKey": "client-generated-uuid",
  "stateSchemaVersion": 1,
  "evidenceSchemaVersion": 1,
  "checkpoints": [
    {
      "id": "CLOSED",
      "state": {
        "nodes": [
          {"id":"battery","type":"battery"},
          {"id":"bulb","type":"bulb"},
          {"id":"switch","type":"switch","closed":true}
        ],
        "edges": [
          {"source":"battery","target":"bulb"},
          {"source":"bulb","target":"switch"},
          {"source":"switch","target":"battery"}
        ]
      },
      "prediction": "ON"
    },
    {
      "id": "OPEN",
      "state": {
        "nodes": [
          {"id":"battery","type":"battery"},
          {"id":"bulb","type":"bulb"},
          {"id":"switch","type":"switch","closed":false}
        ],
        "edges": [
          {"source":"battery","target":"bulb"},
          {"source":"bulb","target":"switch"},
          {"source":"switch","target":"battery"}
        ]
      },
      "prediction": "OFF"
    }
  ],
  "explanation": "A",
  "durationMs": 12000
}
~~~

The BE uses the run's server-owned context, challenge and version tuple. P3.2a may use a separate existing-model engineering fixture with its own schema; P3.2c adds the bulb schema and this activity evidence. Both share launch/submit envelopes. Legacy requests without runId continue on their current path without being silently presented as launch-pinned.
## Retention, expiry, revocation and idempotency

- Open practice: newly launched runs use current eligible tuple and expire 24 hours after server creation. On expiry reject new attempts with RUN_EXPIRED; preserve draft and allow a new launch. No silent switch of model in an open run.
- Assignment: publication pins its tuple and target snapshot. Eligible target submissions use it while the class and assignment are active and membership/target eligibility holds. A due date marks work late but does not itself close Lab submission; an absent due date has no automatic cutoff. Explicit closure/archive, withdrawal, membership removal or emergency revocation stops new submissions. No universal two-hour window. Historical tuples/models stay available for reproduction; any later storage retention policy must preserve accessible evidence and be explicit.
- Emergency scientific/safety revocation blocks launches and new evaluations against affected versions, including assignments; return RUN_REVOKED, preserve draft and evidence, notify the responsible teacher/admin and provide reassign/update guidance. Serialize revocation and submit on the run/release lock: a submit committed before revocation remains valid; no new submit may commit after revocation. Historical attempts remain readable and are flagged for review rather than silently rescored.
- Idempotency is scoped to student and key. Same canonical payload (run ID, challenge/context and checkpoint evidence, excluding timing and transport metadata) returns the previously committed result even if the run is now expired/revoked; changed payload returns IDEMPOTENCY_KEY_REUSED. Concurrent duplicates create at most one attempt and return that attempt. A new intentional try uses a new key.
- A new launch, preview, checkpoint editing or local draft never creates an attempt, progress or assignment evidence. Store a bounded local IndexedDB draft keyed by user, context, run and schema; use explicit restore after re-launch only if model/activity/schema compatibility is verified, not merely matching a schema number.

## Compatibility and test gates

The BE scientific result is authoritative; FE preview must identify the same model/version and is never evidence. A run pins semantic identities for rendering; model/renderer deployment compatibility is checked before production activation. Released model behavior is immutable; retain executable versions required by active assignments and historical replay. Unknown versions fail closed.

The first slice covers isolated BE launch, persisted tuple, activation change, submit/replay, authorization, expiry/revocation, idempotency and legacy compatibility. P3.2 completion also covers FE host/draft and accessibility. P3.5 requires another model with a genuinely different state/output shape through BE and FE shared contracts, a real persisted pilot attempt, and actual pilot curriculum and scientific/model approvals before opening a second Lab implementation track. Engineering fixture checks are not curriculum/science approvals.

## Shared host and independent release requirements

The FE host controls run identity, draft, submit, retry and authoritative result. A renderer receives a version-compatible launch description, state/change callbacks and advisory preview; unknown renderer or model versions show unavailable, with no fallback to another Lab. It must support accessible names, keyboard alternatives and status that does not depend on colour. It never imports executable code or formulas from a content manifest.

Before any production activation, independently verify exact reviewed model/engine, activity/rubric, pack/config, semantic asset bindings and renderer compatibility; scientific fixtures include boundary, invalid and observation-to-rubric cases with explicit numerical tolerances where applicable. Record authenticated human decisions for curriculum, scientific subject and distinct model review, plus safety/rights and range review as relevant. A release manager or admin cannot substitute a typed reviewer name for approval. Activation/quarantine is auditable and must not alter another Lab or historical attempt; recovery may reactivate a previously approved compatible version. Actual implementation of authenticated receipt storage is a later production-release slice.