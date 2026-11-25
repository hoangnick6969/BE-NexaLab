---
id: SPEC-teacher-ai-studio
status: implemented-uncommitted (verified 2026-11-24, see Verification)
branch: feat/teacher-ai-ux (FE and BE worktrees under _tai-ux/)
companions:
  - audit.md
  - prompt-workspace-plan.md
  - ../spec-teacher-ai-authoring/implementation-contract.md
  - ../spec-idea-round-2/SPEC.md
sources:
  - "Owner request 2026-11-24: redo Teacher AI UI/UX, keep brand colours, Antigravity = UI, Codex = logic, Claude = browser test + review"
---

# Teacher AI Studio — UX redesign of the existing Teacher AI (TAI-01 authoring)

## Tóm tắt (VI)

Đưa Teacher AI ra khỏi chế độ thứ 3 bị "giấu" trong tab *Tài nguyên lớp* thành một tab riêng **"Trợ lý AI"** của lớp, bố cục 2 cột kiểu studio: cột trái soạn yêu cầu + lịch sử yêu cầu, cột phải là không gian duyệt có thanh tiến độ, bộ lọc và dải điều hướng từng mục. Không đổi API, không đổi quy tắc duyệt từng mục, giữ màu chủ đạo (`--brand #1f6f78`, `--green #245b47`, nền `--bg`, nhấn vàng amber). Phần "prompt & hỏi đáp kiểu IDE" chỉ lên kế hoạch ở `prompt-workspace-plan.md` (cần gate G-6).

## Why

The browser audit (`audit.md`) found the AI flow is hard to find and hard to work in: it is the third mode of the resource creation card, the review list is one long column under a long form, progress and quota are text blocks, and after "Tạo bản nháp" the teacher has to scroll to find the draft. The server contract (TAI-01) is sound; only the client experience changes.

## Scope

In: the TAI-01 authoring flow (`features/classes/TeacherAiPanel.tsx` and its API `teacher-ai-api.ts`), quota/credit meters as used by it, and its entry points in `ClassDetail.tsx` / `ClassSpaceResources.tsx`.
Out (unchanged this round): written-grading AI suggestions, Exam AI panel, lab challenge panel, insights tab, `/credits` page, backend.

## Contract

### Routing (logic — Codex)

- **R-1** `ClassDetail` gains tab `{ id: "ai", label: "Trợ lý AI" / "AI assistant", icon: Sparkles }`, placed after `resources`, hidden when the class is archived. URL `?tab=ai`; the open job stays in `?aiJob=<id>` (existing `JOB_PARAM`).
- **R-2** The resource creation card keeps modes *Tạo trực tiếp* and *Nhập CSV*. Its AI mode button is replaced by a link-style button "Soạn bằng Trợ lý AI" that switches to `?tab=ai` (no AI form is rendered inside resources any more).
- **R-3** After materialize, "Xem bản nháp" navigates to `?tab=resources&focus=<resourceId>`; `ClassSpaceResources` reads `focus` once, clears filters and focuses/scrolls that resource (reuse `setFocusedResourceId`), then removes `focus` from the URL.
- **R-4** Deep link `?tab=resources&aiJob=<id>` (old links) redirects to `?tab=ai&aiJob=<id>`.

### State (logic — Codex)

- **S-1** Move data/state logic out of `TeacherAiPanel.tsx` into `features/classes/teacher-ai-hooks.ts` with no behaviour change: `useAiJobs(classId)`, `useAiRequestForm(classId)` (fields, validation, credit estimate, quota, create mutation with the same idempotency key handling and `CREDIT_ERROR_CODES`), `useAiJob(classId, jobId)` (same polling cadence and cancel), `useAiReview(classId, job)` (decide, keep-all with partial-failure report, materialize).
- **S-2** Pure helpers in `features/classes/teacher-ai-view.ts` + `teacher-ai-view.test.ts` (added to `test:regression`): `decisionCounts(items)`, `filterItems(items, filter)` with filter `ALL | PENDING | KEPT | EDITED | REJECTED`, `canMaterialize(job, items)` (same rule as today), `jobStatusTone(status)` → `neutral | running | ready | done | failed`.
- **S-3** `TeacherAiPanel` keeps exporting the leaf components it already has (`ItemView`, `ItemEditor`, `MaterializeDialog`, `AiReviewItem` behaviour) so the new UI can reuse them.

### Layout (UI — Antigravity)

- **U-1 Studio shell** `features/classes/TeacherAiStudio.tsx` + `teacher-ai-studio.css`. Desktop ≥ 1100 px: grid `minmax(320px, 380px) 1fr`, gap 20 px. Below 1100 px: one column, composer first and collapsible.
- **U-2 Composer card (left):** eyebrow "TRỢ LÝ AI · CHỈ GIÁO VIÊN", title, one-line rule text. Fields in order: Bài học (select), Loại nội dung as a 3-button segmented control with icons (Quiz / Thẻ ghi nhớ / Bài kiểm tra, mapped to existing `AiTargetKind`), Số mục as a − / + stepper (1..20), Mức độ as segmented control (Không chỉ định / Cơ bản / Vừa / Nâng cao), Chỉ dẫn thêm textarea with live `n/1000` counter and the existing privacy hint. Footer: compact usage meter (quota bar + credit estimate line) and full-width primary button "Tạo bản nháp bằng AI". Disabled reasons shown under the button, never only as a disabled state.
- **U-3 Recent requests (left, below composer):** list of job cards (kind icon, lesson, relative time, status chip, `x/y mục`). Selected card has brand border and tinted background. Empty: short muted text.
- **U-4 Empty workspace (right, no job):** illustration-free card with 3 numbered steps (Chọn bài học → AI soạn nháp → Bạn duyệt từng mục) and the rule "Học sinh chỉ thấy nội dung sau khi bạn tạo bản nháp và xuất bản".
- **U-5 Running state:** header with spinner, elapsed time, cancel button; 3 skeleton item cards.
- **U-6 Review workspace (right, job ready):** sticky header (kind · lesson, status chip, progress bar "Đã quyết định x/y", buttons "Giữ tất cả mục chưa quyết định" and primary "Tạo bản nháp"); filter chips with counts (Tất cả / Chưa quyết định / Đã giữ / Đã sửa / Đã bỏ); navigator strip of numbered chips coloured by decision (pending neutral, kept green, edited brand, rejected red) that scrolls to the item; item cards reuse `ItemView` / `ItemEditor` with actions Giữ / Sửa / Bỏ; warnings (data, similarity) as amber tags.
- **U-7 Done/failed states:** materialized notice with "Xem bản nháp" (R-3); failed/cancelled card with reason and "Tạo lại với cùng thiết lập" (prefills composer).
- **U-8 Visual rules:** only existing tokens from `src/tokens.css` (`--brand`, `--brand-hover`, `--green`, `--dark`, `--muted`, `--line`, `--bg`, amber `--fill-amber-*` for warnings); radius and shadows like existing `.panel`; Be Vietnam Pro; icons from `lucide-react`; must work in the existing dark theme (`[data-theme="dark"]` token overrides) without new hard-coded colours; focus rings use `--focus`; all buttons ≥ 36 px tall; text via `defineText({vi, en})`.

## Constraints

- No backend, API, schema or AI-prompt change. All server rules stay authoritative (ownership, quota 402/429, credits, idempotency, per-item decisions, materialize to DRAFT only).
- Students and parents see nothing new.
- `npm run lint`, `npm run build` and `npm run test:regression` stay green.

## Acceptance (browser, fake provider, isolated DB)

1. Teacher opens class → tab "Trợ lý AI" visible; resources tab shows the link button instead of the AI form.
2. Create a Quiz for "Định luật Ohm" → running state → review workspace with 10 items, progress 0/10.
3. Navigator chip jumps to item; Giữ / Sửa / Bỏ update chips, filter counts and progress.
4. "Giữ tất cả" → 10/10 → "Tạo bản nháp" dialog → notice → "Xem bản nháp" opens resources with the draft focused.
5. Reload with `?tab=ai&aiJob=<id>` restores the same job; old `?tab=resources&aiJob=<id>` redirects.
6. Layout at 1440×900 and 390×844, light and dark, no horizontal scroll; screenshots saved under `teacher-ai-screenshots/studio-v2/`.

## Verification (2026-11-24)

- Who did what: Codex — R-1..R-4, S-1..S-3 (hooks, view helpers + test, routing). Antigravity — U-1..U-8 (`TeacherAiStudio.tsx`, `teacher-ai-studio.css`). Claude — browser audit, review, fixes below, flow capture.
- Fixes after review: level control 2×2 (label "Không chỉ định" was clipped); empty-state steps in 3 columns; job cards `aria-pressed` instead of `aria-selected`; segmented controls `radiogroup/radio`, filter chips `aria-pressed` (were fake tabs); switching tab while a job is open no longer bounces back to AI (`aiJob` dropped outside the AI tab); polling error shown in running state; navigator chip of a filtered-out item resets the filter then scrolls; materialize dialog suggests a unique title (kind · lesson (AI, time)) and explains a 409 duplicate title (previously the default "Quiz (AI)" always collided after the first draft and showed only "Dữ liệu đã tồn tại").
- Checks: `npm run lint` pass, `npm run build` pass, `npm run test:regression` 95/95 pass. Playwright flow capture: 21 steps pass (acceptance 1–6), mobile overflow 0 px. Screenshots and index: `teacher-ai-screenshots/studio-v2/`.
- Known limits: on phones the recent-requests list still sits above the review (composer folds automatically); quota meter reuses the existing `AiQuotaMeter` text block.
