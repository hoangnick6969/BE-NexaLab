# B0 Platform — Ordered Tickets

## B0P-T1 — Stable error envelope

- Normalize framework, Zod, Prisma, and unexpected errors to `{ statusCode, code, message, details? }` while preserving legacy `message`.
- Map validation, unauthenticated, forbidden, not-found, conflict, rate-limited, step-locked, and dependency failures to stable codes. Do not leak stack traces or database details.
- Update shared FE API parsing where consumed; keep status semantics and existing A behavior compatible.
- **Accept when:** representative exception classes and integration responses expose the expected code/status; 500 responses contain no internals; A error consumers remain functional.

## B0P-T2 — Allowlisted AuditLog foundation

- Add indexed `AuditLog` persistence and a transaction-aware audit helper with actor, action, target, outcome, reason, and allowlisted/redacted before/after diffs.
- Write the audit event in the same transaction as each protected mutation. Record ownership denial only where D14/D15 require it without disclosing resource existence.
- Admin-only paginated read is delivered by C2-T6; this ticket establishes the model and write contract.
- **Accept when:** sensitive sentinel values never persist; audit failure rolls back mutation; rollback and duplicate/idempotent mutation behavior are specified; only intended denial events are written.

## B0P-T3 — B/C real-dependency verification harness

- Repair only fixtures/helpers needed by B/C journeys; use environment-driven accounts and URLs, never committed credentials or mock login.
- Keep cleanup isolated to generated fixtures and preserve historical sprint evidence.
- **Accept when:** journey output identifies API/database/browser dependencies and evidence tier; setup failure is reported as such rather than a product pass.

## B0P-T4 — Hint provider transaction boundary

- Call the optional provider outside database transactions/advisory locks; after the call, revalidate authorization/context and persist only valid output under the existing hint contract.
- Handle timeout, provider failure, and revoked access without false evidence or stale disclosure.
- **Accept when:** a deliberately delayed provider call does not hold a DB transaction/lock; provider failure is recoverable; authorization is checked again before persistence and response.

## Dependencies and gates

T1 is a prerequisite for consistent B/C client handling. T2 is a prerequisite for audited mutations in B1/B2/C1/C2. T3 supports each vertical journey. T4 is isolated and may proceed independently. Do not claim pilot/production acceptance from this spec's local checks.
