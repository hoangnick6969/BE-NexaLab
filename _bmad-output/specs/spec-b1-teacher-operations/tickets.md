# B1 — Ordered Vertical Tickets

## B1-T1 — Owned class lifecycle

- Create/list/update classes with grade, unique owner-scoped name, join-enabled and approval settings; archive and rotate/disable join codes.
- Every mutation is owner-authorized, audited, and idempotent where retryable. Archive rejects new enrollment/assignments and immediately closes student assignment access while retaining records.
- **Accept when:** owner can complete lifecycle; another teacher receives a non-leaking denial; archived class cannot accept writes; enrollment/evidence/history counts reconcile.

## B1-T2 — Enrollment and roster management

- Backfill enrollment status to `pending | approved | removed`; preflight duplicates/orphans and report reconciliation before applying constraints.
- Provision student accounts; enroll existing student usernames; approve/decline/remove with confirmation; define rejoin behavior using Q-B1-01.
- Pending/removed cannot read class assignments. Removed students' evidence remains but teacher cannot read it through the former class.
- **Accept when:** migration dry-run/reconciliation passes; role and ownership boundaries hold; each status maps to access policy; destructive removal has confirmation and audit.

## B1-T3 — Join-code lifecycle and student request

- Generate and display `NL-LLLLLL-SSSSSSSSSS` with uppercase Crockford Base32: random six-character locator plus separate 10-character/50-bit CSPRNG secret. Persist locator, key version, HMAC, state, and rotation metadata; show the full code only at issuance/rotation. It has no automatic TTL while the class is active.
- Implement the shared limiter exactly as the SPEC: 10 failures/10 minutes for IP + account (15-minute lock), 20/10 minutes per account (30-minute lock), 30/10 minutes per locator + IP (15-minute lock), and 60 attempts/10 minutes per endpoint + IP (15-minute lock). Never lock the whole class. Success clears only the two request-scoped counters.
- Join mutation supports idempotency. Public status/body/timing must not reveal invalid versus disabled versus archived code or class existence. Valid join resets only the corresponding counter as specified.
- **Accept when:** boundary, rotation, collision, replay, concurrency, lockout, dummy-HMAC, and abuse tests pass; account switching/IP changes do not bypass aggregate controls; no secret/hash appears in logs; UX states pending/approved clearly.

## B1-T4 — Teacher content discovery and private customization

- Query released content by grade, KHTN domain tags, chapter, topic, outcome, and release state; show coverage gaps separately, not as one misleading percentage.
- Create teacher-owned draft variants from a baseline; customize allowed quizzes/tests, challenge/parameter values, and private assets; preserve baseline/version references.
- Enforce claims/source/license/outcome/reviewer/safety/model/media gates and published-version rules. Provide preview with text/accessibility fallback and clear readiness blockers.
- **Accept when:** teacher cannot edit baseline or another owner's draft; clone IDs are new and asset references are intentionally reused; invalid scientific/range/review state blocks release; released content renders attribution and required captions/transcript.
- **Dependency:** synthetic fixtures are sufficient for implementation; actual catalog release waits on Content Foundation T5.

## B1-T5 — Assignment lifecycle and student queue

- Replace `studentIds` JSON with normalized assignment targets. Snapshot approved recipients for whole-class and selected-subset assignment; later enrollments are not added automatically. Validate optional due date; list/update/archive assignments.
- Reject an active duplicate with the same class, immutable content version, identical target set, and due date. Allow a new assignment after archive or when due date/targets differ.
- Persist assignment-scoped targets/evidence; accept idempotency key for retries. Student queue includes only applicable active assignments; archive preserves evidence/history.
- Started students may continue archived content; not-started students receive MSG-36 behavior. Class archive/removal immediately revokes applicable access.
- **Accept when:** whole-class/subset/invalid member/duplicate/retry/archive/due-date cases pass; lab evidence includes assignment identity; archived content behavior matches MSG-36; displayed assigned count matches accepted targets.

## B1-T6 — Teacher-to-student journey and negative access

- Exercise create class → provision/enroll student → request join → approve → assign → student opens only applicable work; include outsider teacher checks at every route.
- Verify teacher UX at 390, 768, 1024, and 1440 px with keyboard operation and loading/empty/error states.
- **Accept when:** API/database/browser are real and configured, all protected mutations are audited, no responsive overflow or dead-end state remains; report local versus pilot evidence distinctly.

## Dependencies

B0 Platform error/audit contracts are prerequisites. B1-T1–T3 can proceed independently of the corpus. B1-T4 can use fixtures; baseline publication waits for Content Foundation. B1-T5 needs B1-T2 status semantics. B2 consumes the assignment/evidence identities established here.
