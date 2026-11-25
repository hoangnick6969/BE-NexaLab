---
id: SPEC-teacher-ai-prompt-workspace
status: draft (2026-11-25, Antigravity review applied) — P1/P2 ready to build on the fake provider; P3 blocked on G-6; P4 blocked on range approval
companions:
  - implementation-contract.md
  - tickets.md
  - review-antigravity.md
  - ../spec-teacher-ai-studio/SPEC.md
  - ../spec-teacher-ai-studio/prompt-workspace-plan.md
  - ../spec-idea-round-2/SPEC.md (I-1, FR-31, CAP-1.1 / CAP-1.3)
  - ../spec-teacher-ai-authoring/ (TAI-01: AiJob, quota, runner, provider gate)
  - ../spec-teacher-ai-credits/ (TAI-05: credits)
  - ../spec-teacher-ai-lab-drafting/ (TAI-06: lab proposals, range approval)
sources:
  - "Owner request 2026-11-24: prompt AI shown as its own prompt and Q&A interface, like current IDEs"
  - "Owner request 2026-11-25: define the specs for the new Teacher AI"
---

# Teacher AI Prompt Workspace (TAI-08) — prompt library and AI Q&A, IDE style

## Tóm tắt (VI)

Giáo viên có một **không gian prompt** riêng, bố cục giống các IDE có AI:

- **Thư viện prompt (cột trái):** lưu, đặt tên, sửa, ghim, nhân bản, lưu trữ prompt của riêng mình theo mục đích (soạn học liệu, soạn đề, thử thách lab). Mỗi lần lưu tạo một phiên bản không sửa được.
- **Trình soạn (giữa):** nhiều tab, biến `{bai_hoc}`, `{khoi}`, `{so_muc}`… tự điền theo lớp/bài đang chọn, xem trước đúng nội dung sẽ gửi, cảnh báo dữ liệu cá nhân trước khi chạy.
- **Hỏi đáp AI (cột phải):** hỏi AI để tinh chỉnh prompt; AI trả lời và có thể đề xuất prompt mới để "Chèn vào prompt" (xem khác biệt trước khi chèn).
- **Bảng kết quả (dưới):** "Chạy" tạo một `AiJob` qua đúng API hiện có; kết quả vẫn duyệt từng mục bằng giao diện Studio rồi mới thành bản nháp.

Không AI nào sinh mô phỏng mới (AD-7/AD-14). Không gọi nhà cung cấp AI thật trước gate G-6. Học sinh và phụ huynh không thấy gì mới.

## Why

TAI-01..07 give teachers one free-text `instruction` (≤ 1000 chars) per request and nothing to keep it. Teachers retype the same instructions, cannot compare what worked, and have no way to ask the AI how to phrase a request. Round-2 feedback (I-1) asks for "a Teacher AI space to create prompts", shown like the AI chat in current IDEs. The AI job pipeline (quota, credits, runner, review, materialize) is sound and stays the only path to student-facing content.

## Scope

**In (this spec):**
- **P1 — Prompt library + IDE shell** (round-2 CAP-1.1, CAP-1.3): private prompts with versions and variables; workspace page; "Run" creates an `AiJob` through the existing create endpoint; output panel reuses the Studio review.
- **P2 — Q&A pane** on the fake provider: chat threads bound to a class + lesson context, new AI purpose `TEACHER_PROMPT_ASSIST`, advisory answers and suggested prompt text.
- **P3 — Live provider for Q&A**: configuration only, after G-6 is recorded.

**Out:**
- **P4 — AI-assisted class lab setup** (round-2 CAP-1.2, purpose `DRAFT_CLASS_LAB`): stays in `spec-teacher-ai-lab-drafting`, blocked on range approval (TAI-06 Q-C2-04). The workspace only reserves an Explorer folder for it.
- Sharing prompts between teachers, prompt marketplace, admin prompt editing.
- Streaming answers (token by token). Answers arrive whole, through the existing job runner and polling.
- Any change to the code-owned system prompts (`ai/application/*-prompt.ts`) or to the existing create body.

## Users and access

- **Teacher:** full use of their own prompts and threads. Threads are bound to a class the teacher owns and a lesson available to that class.
- **Other teachers:** cannot see, list or guess another teacher's prompts or threads (same 404 for "not yours" and "does not exist").
- **Student, parent:** 403 on every route; no student or parent page links to the workspace.
- **Admin:** no access in this spec (owner question Q-P2).

## Functional requirements

- **FR-31a (prompt library):** A teacher can create, rename, edit, pin, duplicate, archive, unarchive and delete their own prompts. Each prompt has a purpose (`GENERATE_RESOURCE`, `GENERATE_ASSESSMENT`, `DRAFT_LAB_CHALLENGE`), a title, a body template and optional defaults for the request form. Every save that changes the title, body or defaults creates an immutable version; the teacher can view and restore an earlier version.
- **FR-31b (variables):** A body may use the allowlisted variables in `implementation-contract.md` (`{bai_hoc}`, `{khoi}`, `{mon}`, `{so_muc}`, `{muc_do}`, `{loai}`). They resolve from the selected class, lesson and request settings. An unknown variable, or a resolved text longer than 1000 characters, blocks "Run".
- **FR-31c (run):** "Run" sends the resolved text as `instruction` in the existing `POST classes/:id/ai-jobs` body for the prompt's purpose, with the prompt's defaults prefilled and editable. Quota, credits, validation, review and materialize behave exactly as today.
- **FR-31d (lint):** Before save and before run, the client warns about personal data (email, phone number, student username pattern, full Vietnamese names typed after "em", "học sinh"), prompt-injection phrases and unknown variables. The server rejects a prompt body that contains an email address or phone number, and a chat question or attached prompt draft that contains an email, a phone number, or the name or username of a student in the thread's class (`PROMPT_CONTAINS_PERSONAL_DATA`). Other lint rules are warnings.
- **FR-31e (Q&A):** In a thread bound to a class and lesson, the teacher asks a question about the current prompt draft. The AI returns an advisory answer and, optionally, a suggested prompt text. "Chèn vào prompt" shows a diff and replaces the editor text only after the teacher confirms; it never saves on its own. Answers are stored only in the teacher's thread and never on student-facing rows.
- **FR-31f (history and deletion):** The teacher can list their threads, rename one, delete one, and delete all threads. Messages older than the retention period (default 90 days, owner question Q-P2) are purged by a daily job.
- **FR-31g (workspace page):** Route `/teacher/ai-workspace` (full screen) with a context bar (class, lesson). The class "Trợ lý AI" tab gets a button "Mở không gian prompt" that opens the workspace with that class and lesson selected, and the Studio composer gets a "Chọn từ thư viện prompt" picker that fills its instruction field.

## Constraints and guardrails

- **Provider gate:** no live provider call before G-6 is recorded. `TEACHER_PROMPT_ASSIST` uses the existing provider factory; the fake provider returns deterministic canned answers, so P1 and P2 ship and are tested without a live model.
- **Input boundary:** the same as TAI-01. Only lesson passages and outcome statements, the teacher's prompt draft and question, and the last 6 turns of the same thread leave the server. Never student names, submissions, grades or class rosters.
- **Output is advisory:** a Q&A answer cannot create or change a class resource, lesson, lab or assignment. Only reviewed `AiJob` items reach a DRAFT `ClassResource` (TAI-01 rule), and only a teacher publishes it.
- **Engine authority (AD-7/AD-14):** no generated simulation code, here or in P4.
- **No change to existing AI contracts:** the create body, job statuses, quota for existing purposes, credits for existing purposes and the review flow are byte-for-byte unchanged. New tables and the new purpose are expand-only.
- **Database safety:** migrations and tests only against an isolated loopback database with the guarded npm scripts (AGENTS.md).

## Acceptance (fake provider, isolated DB, browser)

1. A teacher creates a prompt "Quiz Ohm cơ bản" (purpose GENERATE_RESOURCE) with `{bai_hoc}` and `{so_muc}`, saves it, edits it and saves again → versions 1 and 2 exist; restoring v1 creates v3 with v1's body.
2. With class 8A and lesson "Định luật Ohm" selected, the preview shows the resolved text; "Run" creates an `AiJob` whose `request.instruction` equals the preview; the output panel shows the Studio review; materialize creates a DRAFT resource.
3. A body with `{ten_hoc_sinh}` or resolving to 1001 characters cannot run; a body containing an email is rejected by the server on save with `PROMPT_CONTAINS_PERSONAL_DATA`.
4. In a thread for 8A / "Định luật Ohm", asking "Làm sao để câu hỏi khó hơn?" returns a canned answer with a suggested prompt; "Chèn vào prompt" shows a diff; confirming replaces the editor text and marks the tab unsaved.
5. Another teacher gets 404 on the first teacher's prompt and thread; a student gets 403 on `/me/prompts`.
6. The Q&A daily limit is enforced (`AI_QUOTA_EXCEEDED` at limit + 1) and does not consume the GENERATE_RESOURCE quota.
7. Layout works at 1440×900 (three panes, result bar), 1366×768 (library drawer, editor ≥ 320 px tall) and 390×844 (tabs Prompt / Hỏi đáp / Kết quả), light and dark, no horizontal scroll; keyboard: `Ctrl+S` save, `Ctrl+Enter` run, `Ctrl+K` palette with the 8 commands in the contract, every pane reachable by keyboard and named as a landmark.
8. Deleting a thread while its answer is still running cancels the job, refunds credits, leaves no PENDING message and no error in the runner log; the deleted text is no longer present in the job's `request` or `inputSnapshot`.
9. With credits enabled, a Q&A answer is estimated at 1 credit and settles at ≤ 1 credit (never silently 0 because of a missing `itemCount`).

## Open questions (owner)

- **Q-P1:** Prompts strictly private (this spec), or shareable within a school later?
- **Q-P2:** Thread retention (proposal 90 days) and whether admins may read threads for safety review.
- **Q-P3:** Q&A daily limit per teacher (proposal 50) and whether Q&A costs credits when `AI_CREDITS_ENABLED=true` (proposal: flat 1 credit per answer).
- **Q-P4:** Is the variable list in the contract enough, or are more context variables needed (for example learning outcomes)?
- **Q-P5 (from round-2 Q-1/Q-2):** P4 lab setup needs range approval; confirm it stays out of this spec.
