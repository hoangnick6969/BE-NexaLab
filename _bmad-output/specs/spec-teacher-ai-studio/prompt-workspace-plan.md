---
id: PLAN-teacher-ai-prompt-workspace
status: superseded by ../spec-teacher-ai-prompt-workspace/SPEC.md (TAI-08, 2026-11-25)
relates_to: SPEC-idea-round-2 I-1 (FR-31 proposal), SPEC-teacher-ai-studio
gates: G-6 (provider/legal) for any live LLM call; TAI-06 Q-C2-04 (range approval) for lab setup proposals
---

# Teacher AI Prompt Workspace — IDE-style prompt editor and Q&A (plan)

## Tóm tắt (VI)

Một không gian làm việc riêng cho giáo viên giống các IDE có AI (VS Code Chat, Cursor, Antigravity): **cột trái** là thư viện prompt (thư mục theo mục đích, prompt đã lưu, lịch sử); **giữa** là trình soạn prompt có tab, biến `{bai_hoc}`, `{khoi}`, `{so_muc}` và xem trước yêu cầu thật sẽ gửi; **bên phải** là khung hỏi đáp với AI để hỏi, tinh chỉnh và bấm "Dùng prompt này" → tạo `AiJob` như hiện tại; **dưới** là bảng Output (mục sinh ra, cảnh báo kiểm tra, tín dụng đã dùng). Kết quả AI vẫn phải qua bước duyệt từng mục; không AI nào sinh mô phỏng mới.

## Layout (desktop ≥ 1280 px; route `/teacher/ai-workspace`, also opened from the class "Trợ lý AI" tab)

```
┌───────────────┬──────────────────────────────────────┬──────────────────────┐
│ EXPLORER      │ EDITOR TABS  [Quiz Ohm ●] [Đề 15p]   │ CHAT  (Hỏi đáp AI)    │
│ ▸ Soạn học liệu│ ┌──────────────────────────────────┐ │ GV: Câu nào khó quá?  │
│   • Quiz Ohm  │ │ Prompt text with {bai_hoc}, {khoi}│ │ AI: Câu 3, 7 vì …     │
│ ▸ Đề kiểm tra │ │ …                                 │ │ [Áp dụng vào prompt]  │
│ ▸ Thử thách lab│ └──────────────────────────────────┘ │ [Dùng prompt → AiJob] │
│ ▸ Lịch sử     │ Context: Lớp 8A · Bài Định luật Ohm   │                      │
├───────────────┴──────────────────────────────────────┴──────────────────────┤
│ PANEL: Output · Kiểm tra · Tín dụng      (items, validation, credit used)   │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Explorer: tree by purpose (`GENERATE_RESOURCE`, `GENERATE_ASSESSMENT`, `DRAFT_LAB_CHALLENGE`, later `DRAFT_CLASS_LAB`), search, pin, duplicate, archive; "System templates" read-only folder showing the code-owned prompt version (text summary only, not the raw system prompt).
- Editor: tabs, dirty dot, `Ctrl+S` save, `Ctrl+Enter` run; variable chips resolved from the selected class/lesson; character counter (≤ 1000, same as `instruction`); lint warnings (personal data patterns, injection phrases, banned topics) before send.
- Chat: one thread per prompt; teacher asks/refines; AI replies are advisory text; buttons "Chèn vào prompt" (diff preview) and "Dùng prompt này" (creates an `AiJob` through the existing create endpoint with `instruction = resolved prompt`).
- Bottom panel: last job output with the Studio review components (reuse `TeacherAiStudio` review), validation messages, credit/quota.
- Keyboard and a11y: command palette (`Ctrl+K`), all panes resizable and collapsible, screen-reader landmarks, works in dark theme, mobile falls back to tabs (Prompt / Chat / Output).

## Data and API (new)

- `TeacherPrompt { id, ownerId, purpose, title, body (≤1000), variables Json, pinned, archivedAt, version, createdAt, updatedAt }` — private to owner; versions immutable on save (`TeacherPromptVersion`).
- `PromptThread { id, promptId, ownerId, classId?, createdAt }`, `PromptMessage { id, threadId, role: TEACHER|AI, body, tokens, createdAt }` with retention (e.g. 90 days) and delete-all.
- Routes: `GET/POST /me/prompts`, `PATCH/DELETE /me/prompts/:id`, `GET /me/prompts/:id/versions`, `POST /me/prompts/:id/threads`, `POST /prompt-threads/:id/messages` (LLM), `POST /me/prompts/:id/run` → validates and calls existing `classes/:id/ai-jobs`.
- New `AiJob` purpose `TEACHER_PROMPT_ASSIST` for chat turns (quota + credits counted like other purposes); output schema: plain advisory text, never stored on student-facing rows.

## Guardrails

- G-6 must be recorded before any live provider call; until then chat runs on the `fake` provider (deterministic canned replies) so the UI can ship and be tested.
- No student records in prompts or chat (same input boundary as TAI-01); lint blocks names/usernames/emails/phone numbers.
- Chat output is advisory; only reviewed `AiJob` items can become class resources (TAI-01 rule).
- Lab setup stays configuration of approved releases (AD-7/AD-14); no generated simulation code.

## Phases

| Phase | Content | Needs |
|---|---|---|
| P1 | Prompt library (CRUD, versions, variables, run → existing AiJob) + IDE shell (explorer, editor, output panel) | FE + small BE (2 tables, 6 routes); no new LLM call |
| P2 | Chat pane with `TEACHER_PROMPT_ASSIST` on fake provider; insert-into-prompt diff | BE purpose + quota/credits; FE chat |
| P3 | Live provider for chat | G-6 recorded |
| P4 | `DRAFT_CLASS_LAB` proposals from approved releases inside the workspace | Range approval (Q-C2-04) |

## Open questions

- Q-P1: Should prompts be shareable between teachers of the same school (later), or strictly private?
- Q-P2: Retention for chat threads (proposal 90 days) and whether admins can audit them.
- Q-P3: Separate route `/teacher/ai-workspace` (full-screen IDE) or a full-height mode inside the class "Trợ lý AI" tab? Proposal: both — tab shows Studio; "Mở không gian prompt" opens the full-screen route.
