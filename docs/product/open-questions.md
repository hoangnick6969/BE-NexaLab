# Product Owner decisions

**Status:** Release 1 Increment A decisions closed on 2026-10-12.

The authoritative decisions are recorded in `docs/product/prd.md` Section 10 and bound into the A1–A5 specs. They cover curriculum/content, provision-only enrollment, the 50% quiz gate, the circuit representative lab, video completion, 12-month pilot evidence retention, pilot matrix and targets, assignment ordering, minimal operations, authentication-first delivery, non-production seed personas, and Supabase managed PostgreSQL.

There are no open Product Owner decisions blocking A1–A5 implementation planning. A change to any approved item requires updating the PRD, affected spec, architecture spine when cross-epic, and dependent ticket acceptance criteria.

## Deliberately deferred decisions

- Legal/launch policy for export and deletion after the 12-month pilot retention window.
- Teacher override workflow and audit UX in Increment B.
- Detailed Admin UX and the remaining Teacher/Parent implementation interaction details. Role UX definitions are in `../../../nexalab-fe/docs/design/09-TEACHER-UX-DEFINITION.md` and `../../../nexalab-fe/docs/design/10-PARENT-UX-DEFINITION.md`; unresolved consent, link activation, and evidence aggregation rules remain open in the Increment B/C plan.
- Production scale tier, final hosting region, disaster-recovery RPO/RTO, and paid Supabase backup/PITR options before pilot launch.

Teacher AI Content Assistant and Student AI Tutor are Future scope. Their provider, review, audit, and safety decisions are intentionally deferred until Release 1 foundations are validated.
