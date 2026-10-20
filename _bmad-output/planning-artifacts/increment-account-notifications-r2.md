---
increment: account-notifications-r2
status: review
created: '2026-10-20'
branch: feat/account-notifications-r2 (BE and FE, from main 51d7f98 / e5bba7c)
---

# Account, preferences, notifications and R2

Scope from the product owner (2026-10-20): remember-me sessions, EN/VI and light/dark modes, profile settings with an
avatar, notifications synced with student/teacher activity (for example a teacher alert when a student submits), and R2 set-up.

## Current state (analysis 2026-10-20)

- **Sessions:** refresh token in an httpOnly cookie (`/api/auth`, SameSite strict) that rotates on every refresh, always 7 days. Login
  forms already carry `autocomplete`, so browsers can save passwords; the app never stores a password.
- **Theme / language:** neither exists. `styles.css` has ~606 hard-coded colours and 78 `var(--…)` uses. All copy is Vietnamese literals
  in ~50 FE files; BE error messages are Vietnamese with stable `code` fields.
- **Profile:** `User` has no avatar field and there is no self-service profile endpoint. Settings only changes the password.
  Pre-existing bug: the student "Tạo mã liên kết" button calls `POST /parent-code`, which does not exist.
- **Notifications:** no model or API. I3 decided derived, unstored notices (D-I3-03). Every candidate event already has an audit point
  (`assignment.create`, `assignment.submit`, `assignment.late_reject`, `assignment.deadline_revise`, `enrollment.*`,
  `class_resource.publish`, …).
- **R2:** working on the dev bucket (`npm run r2:check` 9/9, bucket `nexalab-dev`); assets (CF-T2) already use it.
- **Pre-existing bug on main:** `GET /me/foundational-progress` always returns no courses because the auth guard never sets
  `req.user.grade`.

## Decisions (product owner, 2026-10-20)

- **D-ACC-01 Remember me:** checked → persistent refresh cookie, 30-day server session, rotation keeps the flag. Unchecked → browser-session
  cookie (no `maxAge`) and a 12-hour server expiry. The box defaults to unchecked (shared school devices). Passwords are never stored by the app.
- **D-ACC-02 Notifications:** a stored `Notification` table written in the same transaction as the domain event, with read state and a dedup key;
  the FE polls the unread count every 30 s. In-app only, no email, no realtime push. Supersedes D-I3-03 (derived, unstored notices).
- **D-ACC-03 Avatar:** every role may upload an avatar; images are private (presigned GET for signed-in users only, never public URLs).
  A teacher (for members of an owned class) or an admin can remove an inappropriate student avatar.
- **D-ACC-04 Scope:** i18n covers UI copy. BE keeps Vietnamese messages with stable codes and the FE translates by code where needed; lesson content
  is not translated. R2 uses the existing dev bucket for avatars; pilot/production bucket creation is documented, not performed.

## Stories (proposed order)

1. **Remember-me sessions (BE+FE).** `Session.remember` + expiry by flag; login/student/admin login accept `remember`; refresh rotation preserves it;
   login form checkbox. Fix `req.user.grade` (and add `grade` to the guard's session select).
2. **Profile and avatar (BE+FE).** `GET/PATCH /me/profile` (editable fields per role), avatar upload via presigned PUT to `avatars/` with type/size
   checks and server finalisation, presigned GET, teacher/admin removal; Settings becomes a profile page; replace the broken `/parent-code` call.
3. **Notifications (BE+FE).** `Notification` model + migration; writers for: assignment created (students), submission and late submission
   (owning teacher), late rejection and deadline revision (affected students), enrollment request (teacher) and approval (student),
   class resource published (members), assignment overdue (linked parents; replaces the derived I3 parent notice). API: list, unread count,
   mark one/all read. FE bell with 30 s polling and a notification list.
4. **Theme tokens and dark mode (FE).** Replace hard-coded colours with tokens, add a dark palette, a System/Light/Dark switch persisted
   locally and in the profile.
5. **EN/VI (FE).** i18n library and `vi`/`en` dictionaries; shell, auth, settings and notifications first, then feature by feature; language
   switch persisted like the theme.
6. **R2 documentation.** Avatar key layout and lifecycle, CORS for the web origin, and the checklist for creating pilot/production buckets.

Each story is a vertical BE/FE slice with unit tests, `test:*` API checks where it touches the API, and Playwright coverage.
