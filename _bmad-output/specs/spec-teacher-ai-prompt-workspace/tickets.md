# TAI-08 — Ordered vertical tickets

Pipeline per ticket (owner rule): Antigravity reviews the ticket text → Codex implements logic/BE → Antigravity builds presentational UI → Claude reviews, runs checks and the browser flow. All tests on an isolated loopback database with guarded scripts; fake provider only.

## TAI8-T0 — Scope approval (documentation only)

- Owner answers Q-P1..Q-P5 in `SPEC.md` (at least Q-P2 retention and Q-P3 limit/credits). Record FR-31a..g in the PRD next to FR-31 and the decision in `.memlog.md`.
- **Accept when:** PRD, round-2 spec and this spec agree; open questions either answered or explicitly defaulted.

## TAI8-T1 — Prompt data model and lint (BE)

- Expand-only migration: `TeacherPromptPurpose`, `TeacherPrompt`, `TeacherPromptVersion`, plus the raw-SQL partial unique index on `("ownerId", lower("title")) WHERE "archivedAt" IS NULL`. Pure `prompt-lint@1` (`ai/application/prompt-lint.ts`) and `prompt-variables.ts` (allowlist, `{{`/`}}` escape, resolve, per-purpose `{so_muc}`/`{loai}`, PL-09 empty values) with unit tests, and a shared fixture file (`prompt-lint.fixtures.json`) that T3 copies to FE.
- **Accept when:** lint fixtures cover PL-01..PL-07 and PL-09, including false positives that must pass (`I = U/R`, `0,5 A`, `v1.2`, a lesson code like `8.3`); resolve tests cover every variable for all three purposes (assessment `{so_muc}` = `slotCount(sections)`), unknown variable, escapes and the 1000/1001 resolved boundary; migration through the guarded `npm run db:migrate` on an empty isolated DB and on one at current `main` both succeed; two concurrent creates with the same title → one 409.

## TAI8-T2 — Prompt routes (BE)

- `PromptsController` + `PromptsService` for every P1 route in the contract, `@Roles("TEACHER")`, Zod `.strict()` bodies, `expectedVersion` optimistic concurrency, versioning in one transaction, limits, `GET /ai/prompt-templates` summaries.
- **Accept when:** integration tests cover create/edit → versions 1..n; version restore creates a new version; unarchive creates none and answers 409 when the title is now taken; stale `expectedVersion` 409; pruned version 404 `PROMPT_VERSION_NOT_FOUND`; title taken 409 (case-insensitive, archived titles do not count); 200-prompt limit; email/phone body 400 without echoing the match; other teacher 404 on every `:id` route; student and parent 403; duplicate naming; `defaults` per purpose (assessment `matrix`/`sections` accepted, `itemCount` rejected); resolve checks class ownership and lesson availability exactly like `assertClassLesson`, and reads `{mon}` from `Lesson.subject.name`.

## TAI8-T3 — Workspace shell and library (FE)

- Route `/teacher/ai-workspace`, lazy chunk, responsive grid (≥ 1400 three panes; 1024–1399 library drawer; < 768 tabs) with splitters, context bar (class + lesson pickers from existing endpoints), library, editor with tabs, dirty state, `Ctrl+S`, variable chips + `{` autocomplete, preview, "Kiểm tra nội dung" list, version history sheet with "So sánh thay đổi" + "Dùng lại phiên bản này", `Ctrl+K` palette (8 commands), mobile tabs. FE copies of `prompt-lint.ts` / `prompt-variables.ts` with a test that runs the shared fixture file. Entry button in the class "Trợ lý AI" tab.
- **Accept when:** lint + build + `test:regression` (new `prompt-variables.test.ts`, `prompt-lint.test.ts`, `workspace-view.test.ts`) pass; Playwright: create, edit, conflict (second tab edits first), version restore, archive/unarchive, delete; screenshots at 1440×900, 1366×768 and 390×844 in light and dark, no horizontal scroll, editor ≥ 320 px tall at 1366×768; keyboard-only path through library → editor → save; no IDE jargon in visible text (Explorer, lint, diff).

## TAI8-T4 — Run from a prompt + Studio picker (FE)

- "Thiết lập chạy" strip (purpose settings prefilled from `defaults`; confirm sheet only for credits or warnings) → existing `POST classes/:id/ai-jobs` with resolved `instruction` → `POST /me/prompts/:id/runs` → "Kết quả" panel with the Studio review (reuse `TeacherAiStudio` review pieces and `useAiJob`/`useAiReview`, keyed by editor tab, not by `?aiJob=`). Studio composer "Chọn từ thư viện prompt" popover.
- **Accept when:** the created job's `request.instruction` equals the preview byte for byte; quota/credit errors render exactly as in Studio; materialize from the Output panel creates the DRAFT resource and "Xem bản nháp" opens it; picking a prompt in Studio fills instruction and defaults for the current lesson; a prompt with PL-06/PL-07 cannot run.

## TAI8-T5 — Q&A threads and `TEACHER_PROMPT_ASSIST` (BE)

- Migration: `PromptThread`, `PromptMessage`, `PromptMessageRole`. Add `TEACHER_PROMPT_ASSIST` to `AI_PURPOSES` (not to `createAiJobBody`), to `quotaQuery`, and to `PRICED_PURPOSES` / `BASELINE_PRICES` / the pricing-route enums. `ai-config.ts` reads `AI_DAILY_PROMPT_ASSIST_LIMIT` (default 50); `AiJobsService.quota()` gets the `{ daily, concurrency: 1 }` branch. Class job routes (`get`, `decide`, `apply`, `materialize`, `cancel`) answer 404 for this purpose. Thread routes incl. estimate, message transaction (PL-01/02/08 on question and draft, thread lock, `request.itemCount = 1`), shared `cancelAiJob`, snapshot builder with history guard, `prompt-assist@1` system prompt with pinned-digest test, `prompt-assist-output@1` parser, `processPromptAssist` runner branch, `PromptMessage.status` sync in success / `fail()` / `sweep()` / cancel, fake provider canned answer and `#fail` hook, retention sweep, redaction of `request` and `inputSnapshot` on delete.
- **Accept when:** integration tests (fake provider) cover: happy path PENDING → SUCCEEDED with answer and suggestion; replay of the same key; key reuse 409; quota 50/51 and concurrency 1/2 not counted against GENERATE_RESOURCE, and `GET /me/ai-quota?purpose=TEACHER_PROMPT_ASSIST` reports 50/1; credits enabled: estimate 1, settle ≤ 1 and > 0 when tokens were used, refund on failure and cancel; class archived after thread creation → 409; lesson withdrawn → 400; outsider teacher 404 thread; student 403; email, phone or an enrolled student's name in question or draft → 400; suggestion containing a phone number is dropped but answer kept; invalid output → FAILED `OUTPUT_VALIDATION_FAILED`; message status follows the job on success, failure, lease expiry and cancel; delete thread while RUNNING → job cancelled and refunded, runner finishes without error, `request` and `inputSnapshot` redacted; 199 messages + 1 question → `THREAD_FULL`; deleting a prompt leaves its threads with `promptId = null`; class routes 404 for a Q&A job; retention sweep deletes old messages and empty threads; snapshot contains no roster, submission or grade fields (key allowlist); existing AI and credits tests unchanged.

## TAI8-T6 — Chat pane (FE)

- `PromptChat` with thread list, composer, pending/failed/cancel states, polling, "Đính kèm prompt hiện tại", "Xem khác biệt" / "Chèn vào prompt" diff dialog, delete thread / delete all with confirm, mobile tab.
- **Accept when:** Playwright: ask → canned answer; insert suggestion → editor dirty, not saved; `#fail` question shows failure and "Hỏi lại"; reload keeps the thread; quota exhausted shows the quota message; screen reader announces new answers (`aria-live="polite"`); screenshots along the flow under `teacher-ai-screenshots/prompt-workspace/`.

## TAI8-T7 — Live provider for Q&A (after G-6)

- No code beyond configuration if T5 used the provider port correctly: enable `prompt-assist@1` for the approved model, run the golden set (20 teacher questions × 3 lessons, reviewed by the supervising lecturer) and record results.
- **Accept when:** G-6 is recorded for this purpose's input boundary; golden review ≥ 80 % "useful" and 0 answers containing invented student data or simulation code.

## Later (not in this spec)

- **P4 `DRAFT_CLASS_LAB`** — tracked in `spec-teacher-ai-lab-drafting` and round-2 CAP-1.2; needs range approval (TAI-06 Q-C2-04). The Explorer folder "Phòng lab (sắp có)" is the only placeholder.
- Prompt sharing within a school (Q-P1).
