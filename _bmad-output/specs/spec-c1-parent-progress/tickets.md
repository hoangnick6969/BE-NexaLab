# C1 — Ordered Vertical Tickets

## C1-T1 — Teacher-issued link code, consent, and lifecycle

- Replace `User.linkCode` and student code issuance with `ParentLinkCode`; migrate existing `ParentLink` rows to approved historical links only after a reconciliation report.
- Record teacher/class/student verification metadata, generate the 100-bit show-once code, apply seven-day expiry, revocation, HMAC verification, encrypted 10-minute idempotency replay, and the SPEC rate limits.
- Add parent email verification and append-only consent acceptance with purpose/version/content hash/actor/timestamps. Keep exact copy in versioned product configuration.
- Redeem to a pending link, then approve atomically when verified-email and current-consent prerequisites hold. Parent, responsible teacher, and admin may unlink; relink requires a new code.
- Re-evaluate pending links transactionally when verification or consent completes; withdrawal/revocation removes access without deleting learning evidence.
- **Accept when:** wrong teacher/admin/student cannot issue; raw code is absent from DB/log/audit; invalid states are indistinguishable; retries do not consume twice or duplicate links; unverified/stale-consent/pending/revoked links cannot read progress; current prerequisites approve exactly once.
- **Release gate:** approved Vietnamese consent copy/version is required before pilot activation.

## C1-T2 — Parent read model and limited evidence

- Implement `GET /children`, `/children/:id/progress`, and `/children/:id/activity` with A5/B2 derivation and cursor rules. Add limited quiz/practical detail routes only for records represented in those responses.
- Apply exact latest/best/count/verdict/activity semantics from the SPEC. Exclude answers, selected options, question snapshots, hints, raw `labState`, simulation payloads, and teacher notes.
- Remove Parent access through generic `GET /progress/:studentId`. Return 403 `PARENT_LINK_REQUIRED` for every unlinked/nonexistent child ID.
- **Accept when:** values reconcile to student/teacher evidence for the same assignment; archived history and active denominator stay separate; probing cannot reveal a child or hidden fields.

## C1-T3 — Parent UI

- Build registration/verification/consent, code redemption, children list, progress, limited evidence detail, and unlink states from the Parent UX definition.
- Clear protected child data after 403/revocation; support loading, empty, pending, stale, denied, retry, keyboard/touch, and 390/768/1024/1440 px layouts.
- **Accept when:** there is no learning-data mutation control or horizontal page overflow; pending never renders progress; every metric links only to permitted evidence.

## C1-T4 — Parent journey and negative access

- Verify teacher issue → parent redeem → prerequisite activation → read progress/activity → unlink → immediate denial, plus other parent, guessed ID, replay, expired code, stale consent, and concurrent redemption negatives.
- **Accept when:** API/database/browser dependencies are real and named; audit entries reconcile; read p95 is measured with the approved workload and environment label.

## Dependencies

C1 starts after B2 assignment-scoped evidence is complete. C1-T1 precedes read access; UI may use typed fixtures but runtime acceptance requires the real link and read models.
