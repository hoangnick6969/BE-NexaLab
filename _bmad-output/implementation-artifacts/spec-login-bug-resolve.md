---
title: 'Login UX, remembered sessions and temporary-password flow'
type: 'bugfix'
created: '2026-11-07'
status: 'done'
baseline_commit: 'a606f652edd496e400c63e4e2028212ae5564f57'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent">

## Intent

Audit and resolve the three reported login problems: actionable errors, remembered sessions, and consistent mandatory temporary-password changes. Work on `feat/bug-resolve` in both repositories. This checkpoint delivers an audit and implementation plan; application changes follow separately.

## Boundaries & Constraints

Preserve student username versus adult/admin email entry, server authorization, existing username normalization, structured API errors and session revocation. Keep access tokens in memory and refresh tokens in HttpOnly cookies; never persist passwords. Reuse the existing 30-day remembered / 12-hour ordinary server-session policy. Browser session cookies may be restored by browser session-restore settings; do not promise unconditional deletion on browser close.

Use isolated loopback PostgreSQL and guarded npm scripts for all automated tests involving the backend, fixtures or mutations. No shared database tests, migrations, seeds, production config changes or deployment. Cookie policy changes require evidence from the actual failing origin/proxy arrangement and a CSRF assessment.

## I/O & Edge-Case Matrix

| Scenario | State/input | Expected behavior |
|---|---|---|
| Invalid username | Length outside 3–32, whitespace inside, unsupported characters, leading/trailing punctuation | Field guidance explains length, allowed characters and alphanumeric boundaries; no raw validator text |
| Username normalization | Uppercase or surrounding spaces | Preserve server trim/lowercase behavior |
| Failed login | Wrong credentials, 429, network failure, 5xx or non-JSON gateway response | Friendly localized guidance; retry remains possible; no account enumeration or technical exception text |
| Remembered session | Checked, then reload/reopen and refresh rotation | Persistent refresh cookie and valid server session restore login; access token stays in memory |
| Ordinary session | Unchecked, reload within current session | Restore works within the session; refresh cookie has no persistent expiry |
| Expired/revoked session | Expiry or logout, then restore | No authenticated UI; next login works |
| Valid temporary password | Login or restored flagged user | Mandatory change screen before protected content; direct links cannot bypass it |
| Expired temporary password | New login with expired temporary credential | Explain that the teacher must issue a replacement |
| Password change | Invalid current/new password, then valid submission | Actionable feedback and retry; success clears flag, rotates session and opens role-appropriate destination |

</frozen-after-approval>

## Audit Evidence & Code Map

Paths marked FE resolve under `D:/coding/NEXA/nexalab-fe`; BE paths are relative to this repository.

- FE `src/features/auth/Login.tsx:97–123,186–218`: sends boolean remember correctly; username has no format guidance; switching modes does not reset mutation errors.
- FE `src/components/ui.tsx:18–30`: ErrorBox displays Error.message; useAction delegates errors to the mutation. BE `src/common/errors.ts:68–79` concatenates Zod field paths/messages. Exception handling exists; the presentation is the confirmed defect.
- FE `src/lib/api.ts:121–132,263–333`: typed HTTP errors, credentialed fetch, in-memory auth, bootstrap refresh and single-flight restore already exist. Network failures are rethrown unchanged. FE `src/i18n/errors.ts` uses a generic English validation message instead of field details.
- BE `src/common/validation.ts:9–15`: trim/lowercase, 3–32 characters, internal `._-`, alphanumeric first/last characters. Current regex message omits length/boundary guidance.
- BE `src/modules/auth/application/session-policy.ts` and `src/modules/auth/interface/auth.controller.ts`: persistent/session cookies, rotation, logout and remember preservation already implemented. FE remember failure is not yet reproduced.
- FE `vite.config.ts` proxies `/api` locally. FE `vercel.json` contains an SPA rewrite and no explicit API proxy. BE `src/main.ts` enables credentialed allowlisted CORS. Actual deployment topology remains unverified; these files alone do not establish the failing cookie cause.
- FE `src/app/App.tsx:214–266` restores on startup and renders PasswordGate for flagged users. FE `src/app/PasswordGate.tsx` uses basic password fields without confirmation or sign-out recovery. It updates auth after success but has no explicit destination navigation.
- BE `src/modules/auth/interface/auth.ts:81–89` enforces PASSWORD_CHANGE_REQUIRED. The frontend lacks a global reconciliation path when this code arrives after local user state has become stale.
- BE `auth.controller.ts:155–183` already clears flag/expiry, revokes sessions and issues a replacement retaining remember. Temporary flow absence is not confirmed; synchronization and presentation gaps are confirmed.

## Tasks & Acceptance

- [x] Error UX: FE `Login.tsx`, `src/i18n/errors.ts`, `src/lib/api.ts`, and relevant shared UI only as necessary: add localized username guidance and field errors, friendly network/gateway fallbacks, and mutation reset on mode changes. Preserve server error codes; avoid catch-all controller wrappers. Adjust BE validation messages only if needed for accurate guidance.
- [x] Remember audit and regression verification (local only; deployed bug remains unverified): extend FE `tests/acc-remember-me-live.spec.ts` and inspect the actual failing browser cookie/request trace first. Check Set-Cookie acceptance, host/site/path/HTTPS, expiry, restore and rotation. Correct only the demonstrated defect in FE `api.ts`, `Login.tsx`, BE session policy/controller or proxy configuration. Do not mark fixed if it cannot be reproduced or verified.
- [x] Temporary password: FE `PasswordGate.tsx`, `App.tsx`, `api.ts`, shared PasswordField and localized copy: reuse Login form conventions, confirmation, actionable validation, sign-out recovery and role-appropriate completion navigation. On PASSWORD_CHANGE_REQUIRED reconcile authoritative user state and activate the gate; never replay failed mutations automatically. Preserve server gating.
- [x] Regression coverage: FE `tests/login-bug-resolve.spec.ts` for mocked errors and gate states; extend existing remembered-session coverage for authenticated reopen using persisted cookies. BE `src/modules/auth/interface/auth.test.ts` for flagged-user denial and allowed password endpoints. Reuse guarded integration scripts for password rotation/revocation and remember preservation.

Acceptance:
- Given invalid input or a failed request, when submitting then correcting the form, then accessible localized guidance appears and retry succeeds without stale errors.
- Given remember on/off, when restoring or rotating a session, then the existing lifetime choice survives; logout/revocation prevents restoration.
- Given a flagged account or PASSWORD_CHANGE_REQUIRED response, when navigating directly or reloading, then protected content stays blocked until a successful password change.

## Verification

During implementation, run FE and BE lint/build; run targeted Playwright and guarded backend/integration checks against an isolated loopback database. Verify mobile/desktop keyboard flows and VI/EN messages. Existing test source is coverage intent, not proof of a passing run. No tests, API login calls or database operations were run during this audit.

## Implementation Notes

Approved by the user on 2026-11-07 for implementation. The implementation agent owns the application/test changes listed above in both repositories. Other agents may be working in the workspace; preserve their changes and accommodate them rather than reverting them. Primary agent owns this spec and verification/review coordination.

Branches created from clean checkouts: BE `a606f652edd496e400c63e4e2028212ae5564f57`; FE `e28f460b946001842353b62e508573a21eded0f5`.

Implementation verification uses a fresh local PostgreSQL 18 cluster on `127.0.0.1:55441/nexalab_login_bug`, API port 4011 and frontend port 5181. Guarded migration and fixture seed completed. No shared database was used.

Parent added `scripts/login-auth-integration.mjs` and guarded `npm run test:auth`: 17 assertions passed, including expired temporary credentials, failed password-change retries, mandatory server gate, replacement and revocation of sessions, remember preservation and expired-session rejection. Both remembered and ordinary cookies retain their policy after successful password change and refresh. Existing `npm run test:integration` passed 99 assertions on the same isolated stack.

Remembered-session failure has not been reproduced in this local same-origin proxy topology. Preserve existing cookie policy; report deployed cross-site/proxy behavior as unverified rather than claim a production fix. Browser tests cover the existing policy, reopened contexts with persistent cookies, ordinary-session reload, logout and password-change rotation.

Additional caller coverage: FE `tests/a1-acceptance.cjs` and `tests/b1-teacher-live.spec.ts` require the new confirmation field. A stale PASSWORD_CHANGE_REQUIRED response must not modify a newer session; regression coverage protects this boundary. The new real-browser provisioned-account test exercises password change against the isolated API.

All three review layers completed. Verified patch findings were addressed: pending-login lock, expired access-token recovery for authenticated password/me only, explicit live test isolation guard, typed error envelope parsing and the delayed reconciliation race. New refresh recovery also preserves a newer account when either the original 401 or refresh response arrives late. The only remaining deployment question is the unreproduced reported remember failure; no production fix is claimed.

## Spec Change Log

Final verification (2026-11-07): FE lint and production build passed; BE lint and build passed; guarded auth/session unit suite passed 10 tests. Final combined Chrome run passed 29/29 tests in 49.8 seconds (26 mocked regressions and 3 real isolated API/browser journeys), with no skipped cases. Guarded auth integration passed 17 assertions and existing integration passed 99. Existing full a1/b1 suites were adapted for the confirmation field but not rerun; the targeted live provisioned-account journey covers the changed password form.

Matrix coverage: invalid usernames and normalization are exercised in VI/EN guidance tests; request failures and retry in localized error tests; remembered/ordinary restoration and logout in live cookie tests; expiry/revocation in test:auth; login/restored/deep-linked temporary accounts in mocked and live gate tests; failed and successful password changes in API, desktop/mobile and real-browser checks. Review-specific tests cover pending mutation state, malformed JSON, access-token expiry and both delayed auth/me/refresh account-switch boundaries.

## Review Triage Log

| Finding | Verdict | Evidence / action |
|---|---|---|
| Blind 1: username edit resets pending login | medium / patch | Field unconditionally resets the mutation; preserve pending state and block mode switches until it settles. |
| Blind 2: password-change access token expiry | medium / patch | Existing auth-path exclusion prevents recovery after 15 minutes; narrowly permit refresh for authenticated password/me endpoints and cover it. |
| Blind 3: live provisioning lacks isolation guard | medium / patch | New browser fixture mutation needs an explicit fail-closed loopback DB/API check. Current verification used an isolated stack; harden future execution. |
| Blind 4: provisioned browser fixture not removed | low / rejected | With a disposable, guarded isolated DB and unique fixture usernames, this cannot affect shared classroom data. Full API hard-delete is blocked by enrollment/audit history; adding a cross-repo DB cleanup layer is disproportionate for this local regression. Disposable cluster owns cleanup. |
| Blind 5: malformed JSON error envelope | medium / patch | Message objects are coerced into technical text and body status is trusted; validate string fields and use actual HTTP status. |
| Blind 6: dynamic test imports require Vite | low / direct clarification | These white-box regression checks run against the documented Vite dev verification stack, not a deployed bundle. Document this constraint explicitly; production verification remains unclaimed. |
| Blind 7: ordinary password-change cookie lacks test | medium / patch | Added ordinary password change and subsequent refresh assertions to guarded test:auth. |
| Edge 1: username edit resets pending state | medium / patch | Same demonstrated defect as Blind 1; fix once. Reviewer quoted the desired guard rather than current source; actual source is unconditional reset. |
| Verification 1: second reconciliation token check lacks regression | medium / patch | Existing race test only covers delayed 403. Add a delayed auth/me result after account switch to cover the inner guard. |
