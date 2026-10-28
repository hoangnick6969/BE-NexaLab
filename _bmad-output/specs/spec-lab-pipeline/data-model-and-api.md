# Data and API direction for Build

The first implementation choice is an additive server-persisted LabRun, not a claim that a production LabRelease table or authenticated reviewer system already exists. Detailed tasks and acceptance are in phase-plan.md. Current Lab, SimulationConfigVersion, PracticalActivityVersion and SimulationPackVersion remain reusable component identities; existing attempts and legacy endpoints remain readable.

## P3.2a chosen minimal persistence

LabRun records ID, owner, context/challenge identity, timestamps, expiry, revocation status, immutable execution tuple and digest. The tuple contains modelRef/engine, activity/rubric identity and version, pack/config IDs, effective parameters and state/evidence schema. A nullable run relation/ID on Attempt is additive if needed. A migration and new opt-in launch/submit API are expected in Build because current submit-time selection alone cannot persist launch state. New routes reuse existing auth and activation locks; exact route names and validation schemas are local implementation details under the versioned envelope, not new product behavior.

Launch requires compatible components and never creates evidence. Server submit checks authorization and run status, recomputes observations and activity assessment and atomically persists attempt plus eligible context-specific progress. Idempotency replay is checked before expiry/revocation. Old submissions and historical results continue through the legacy path.

## Production and Class Lab follow-up

An immutable reviewed release identity must bind exact model, pack, config, activity/rubric and renderer compatibility and associate real reviewer decisions with exact digests. Whether this is a separate LabRelease table, a compatible existing version aggregate or another additive representation is a later implementation choice backed by a concrete migration/replay comparison; it does not block the first private run slice. Until a production release mechanism is accepted and built, public activation is blocked.

ClassResource LAB, class assignment version snapshots and new review-receipt persistence are future proposed changes. No teacher model authoring, public flag change, Lesson mutation, schema migration or DB write happens in Define. Run and assignment retention/revocation rules are normative in contract-v1.md and class-lab-track.md.