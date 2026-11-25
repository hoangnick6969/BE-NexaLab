---
id: SPEC-idea-round-2
status: draft-awaiting-owner-decisions
verified_against:
  be: origin/main c1735ae (2026-11-17)
  fe: origin/main e1e620d (2026-11-17)
companions:
  - ba-review-antigravity.md
  - codex-fact-check.md
  - ../../../docs/product/prd.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../spec-teacher-ai-authoring/implementation-contract.md
  - ../spec-teacher-ai-lab-drafting/SPEC.md
  - ../spec-c1-parent-progress/
  - ../../../../NEXA-LAB_Content tool/specs/P2_VIDEO_SYSTEM_FULL_SPEC.md
sources:
  - "Góp ý dự án đợt 2 (2/về idea dự án), 2026-11-24"
  - "Antigravity BA review of the 5 ideas, 2026-11-24"
  - "Codex read-only fact check against main, 2026-11-24 (3 corrections + 3 design notes applied)"
---

# Idea round 2 — Teacher AI space, voice hints, teacher video, class materials, parent view

## Tóm tắt (VI)

Spec này kiểm chứng 5 ý tưởng góp ý đợt 2 với code `main` hiện tại và chốt phạm vi phát triển. Kết luận chính:

| # | Ý tưởng | Hiện trạng trên `main` | Kết luận |
|---|---|---|---|
| I-1 | Teacher: không gian AI tạo prompt + phòng lab theo ý GV | Teacher AI TAI-01..07 đã có (sinh deck/quiz/test/đề, chấm bài viết, đề xuất tham số lab). GV chỉ có 1 ô `instruction` ≤ 1000 ký tự, không lưu prompt. Lab tùy biến trong lớp (FR-24) đã có nhưng chỉ sửa ≤ 10 `customParams` trên lab đã duyệt. TAI-06 đang bị chặn vì mọi range = `pending`. | **Mở rộng**: thêm thư viện prompt của GV + trợ lý AI cấu hình lab lớp từ lab đã duyệt. **Không** cho AI sinh mã mô phỏng mới (vi phạm AD-7/AD-14). |
| I-2 | Student lab: giọng nói gợi ý khi hover | **Chưa có gì**: không có audio/TTS/`speechSynthesis` trong FE. Tooltip hover chỉ có ở vài kit 3D (wet-bench). | **Mới hoàn toàn**. MVP dùng Web Speech API, mặc định TẮT, có debounce. |
| I-3 | Teacher tự đưa video mô phỏng; Admin quản lý, "video tool" | Bước VIDEO của bài học (YouTube + file trực tiếp) đã có; `Asset` loại `video` ≤ 300 MB có `license/source/attribution`; Admin có quarantine/release. Content tool đã có spec P2 video (mapping, phát, tiến độ). **Thiếu**: hàng chờ Admin duyệt video do GV gửi, liên kết video ↔ Lab, khai báo bản quyền bắt buộc. | **Mở rộng** quy trình Asset sẵn có, không xây kho video mới. |
| I-4 | GV có tài liệu riêng trong class space | **Phần lớn đã có**: tab "Tài liệu & Báo cáo" trong class space; `ClassResource` loại `DOCUMENT` (upload hoặc link HTTPS), `REPORT_TEMPLATE`, `LINK`; asset `TEACHER_PRIVATE`; `GET assets/mine`; HS chỉ đọc được khi là thành viên lớp đã duyệt. Trình soạn chỉ nhận PDF/PNG/JPEG/MP4 ≤ 20 MB. **Thiếu**: chọn lại tài liệu cũ cho lớp khác (thư viện GV), DOCX/PPTX, video > 20 MB, khai báo bản quyền. | **Mở rộng nhỏ** (P1, rẻ nhất). |
| I-5 | Phụ huynh xem kết quả lab của con + mức "tâm huyết" của GV | **Góp ý ghi "chưa triển khai" là SAI một phần**: role `PARENT`, liên kết PH–HS bằng mã do GV cấp, đồng thuận (consent), xác thực email, dashboard PH với tiến độ / hoạt động / số lần xin gợi ý / bài tập đã có (spec-c1-parent-progress, FR-25). **Thiếu**: tóm tắt kết quả lab theo lớp/môn, điểm đã công bố, chỉ số hỗ trợ của GV. | **Mở rộng**; KHÔNG chấm "tâm huyết" GV, chỉ hiển thị chỉ số trung tính. |

Thứ tự đề xuất: **I-4 → I-3 → I-5 → I-2 → I-1** (lý do ở mục Delivery order). Các câu hỏi cần chủ dự án chốt nằm ở mục Open questions.

## Why

Round-2 feedback asks for more teacher autonomy (own AI prompts, own videos, own materials), a friendlier student lab (spoken hints) and a parent view of learning results. Most of the plumbing already exists on `main`; the risk is rebuilding it or breaking the guarantees it already enforces (engine authority, class-membership access, provider gate G-6, teacher-only AI output, under-18 privacy). This spec states, per idea, what exists, what is new, and the smallest change that delivers the feedback.

## Verified baseline (main, 2026-11-17)

Facts checked directly in code; paths relative to each repo.

- **Roles:** `enum Role { STUDENT TEACHER PARENT ADMIN }` — `BE/prisma/schema.prisma:11`. RBAC via `@Roles()`/`@Public()` with ownership checks in application code.
- **Teacher AI:** `AiJob` purposes GENERATE_RESOURCE, ASSESS_SUBMISSION, DRAFT_LAB_CHALLENGE, GENERATE_ASSESSMENT; teacher `instruction` ≤ 1000 chars; per-item review (ACCEPTED/EDITED/REJECTED) then materialize to a DRAFT `ClassResource`. Prompts are versioned code templates (`ai/application/*-prompt.ts`), no prompt table. Live providers wait for gate G-6; `fake` provider otherwise.
- **TAI-06 lab drafting:** `specs/spec-teacher-ai-lab-drafting/SPEC.md` status `draft-blocked-on-range-approval-and-lab-builder-scope`; non-goal "Teacher custom Lab builder".
- **Class lab customization (FR-24):** `labResourceInputSchema` — `classes/application/class-resource-contract.ts:21-28`: source `{labId, releaseId, challengeId}`, objective, instructions, ≤ 20 report prompts, ≤ 10 numeric `customParams`.
- **Class resources:** `ClassResourceKind` = DECK, STUDY_QUIZ, TEST, LAB, DOCUMENT, REPORT_TEMPLATE, LINK, WRITTEN_TASK, EXPLORE_LAB, EXAM. `DOCUMENT` source = `upload {assetVersionId}` | `link {https url}` (`class-resource-contract.ts:30-33`).
- **Class materials view:** the student/teacher class space already has a "Tài liệu & Báo cáo" category tab listing document resources (`FE/src/features/classes/ClassSpaceResources.tsx:904`). The class resource editor accepts `.pdf,.png,.jpg,.jpeg,.mp4` (`RichResourceEditor.tsx:158`) and rejects files > 20 MB client-side (`RichResourceEditor.tsx:59`).
- **Assets:** `Asset` (`schema.prisma:1302`) scope `TEACHER_PRIVATE | SHARED_LIBRARY`, kind `pdf|image|video|caption|model`, status `ACTIVE|QUARANTINED|ARCHIVED` (no review state), optional `license/source/attribution`; immutable `AssetVersion`; private storage via presigned URLs; admin quarantine/release with audit. Accepted types are only PDF, PNG, JPEG, MP4, WebVTT, GLB (`assets/application/asset-versions.ts:250`); per-type caps in `assets/application/media.ts` (video `ASSET_MAX_VIDEO_MB` default 300, PDF 20, image 10; env-overridable). The form route `POST files` caps at 20 MB (`assets/interface/files.controller.ts:24`); the multipart route `POST assets/uploads` follows the per-type caps.
- **Lesson video:** `FE/src/features/lessons/VideoLearningStep.tsx` plays YouTube (IFrame API) or a direct file in `<video>`; publisher pages open as links. Heartbeat/ended recorded on `StepProgress`. Content tool spec `P2_VIDEO_SYSTEM_FULL_SPEC.md` covers mapping, segment progress and teacher video insight (P2-D..F not implemented).
- **Student lab UI:** no audio, TTS or `speechSynthesis` anywhere in `FE/src` (search returned nothing). Hover tooltips only in some 3D kits (e.g. `labs/chemistry/wet-bench/kit/WetBenchKitStage.tsx`). Text uses `defineText({vi, en})`; `User.preferences` holds `theme` and `locale` (`users/.../preferences.ts`).
- **Parent:** `ParentLink`, `ParentLinkCode`, `ParentConsent`; routes in `parents/interface/parents.controller.ts` — teacher issues link code (`:33`), parent email verify + consent (`:46-62`), `children/link|link-status|children|unlink` (`:71-123`), `children/:id/progress|activity|help-seeking|assignment-notices|assignments/:assignmentId` (`:128-201`). FE `features/dashboard/ParentDashboard.tsx`. `AiAssessmentSuggestion` is barred from parent read models (`schema.prisma:1736-1738`).
- **PRD numbering:** highest is FR-26 (`docs/product/prd.md:114`); highest AD is AD-19.

## Capabilities

### I-4 — Teacher materials in Class Space (P1)

- **CAP-4.1 — Materials tab improvements:** extend the existing "Tài liệu & Báo cáo" tab with grouping by optional topic/lesson link and an inline viewer (PDF, MP4). **Success:** a teacher adds a PDF/MP4 upload or HTTPS link in ≤ 3 steps; an approved member sees it after publish; a non-member gets 403/404 on both the resource and its asset URL (existing `asset-versions.ts` rule, regression-tested).
- **CAP-4.1b — More file types and larger videos (owner decision Q-7):** DOCX/PPTX need new entries in `media.ts` (ZIP signature plus Office content-type check) and must never be rendered inline; MP4 above 20 MB needs the class editor to switch from the 20 MB form route to the multipart `assets/uploads` route. **Success:** rejected types return `ASSET_TYPE_REJECTED`; limits come from `media.ts`, not a hard-coded FE constant.
- **CAP-4.2 — Personal library reuse:** a teacher picks an existing `TEACHER_PRIVATE` asset from `GET assets/mine` when creating a DOCUMENT in any class they own, without re-uploading. **Success:** the same `assetVersionId` is pinned by two classes; archiving the resource in one class does not affect the other.
- **CAP-4.3 — Rights declaration:** uploading a material requires the teacher to tick a rights statement and optionally fill `source`/`attribution`. **Success:** upload is rejected without the declaration; the values are stored on `Asset`.

### I-3 — Teacher-submitted simulation videos with admin approval (P1)

- **CAP-3.1 — Submit:** a teacher submits a video as an HTTPS link (YouTube/Vimeo/Drive) or an MP4 upload (existing asset pipeline), with title, related lab or lesson, `license`, `source`, `attribution` and a rights declaration ("own work" / "licensed" / "permission obtained, evidence attached"). **Success:** the video enters `PENDING_REVIEW`; it is visible to the submitting teacher only. **Design note:** `Asset.status` has no review state today and an `ACTIVE` asset with a `READY` version is readable by its owner and, once in a published class resource, by members. Add a separate `Asset.reviewStatus` (`NOT_REQUIRED | PENDING_REVIEW | APPROVED | REJECTED`, migration default `NOT_REQUIRED`) and enforce `APPROVED` (when review is required) both when publishing a class resource / lab attachment and in the student branch of `canReadVersion` (`asset-versions.ts:163-170`), so a later re-review also hides it. That student branch today only matches published `DOCUMENT`/`REPORT_TEMPLATE` resources with an `upload` source; attaching a video to a Lab (CAP-3.3) needs a new, equally membership-scoped branch.
- **CAP-3.2 — Admin review queue:** admins see pending videos with preview, rights data and submitter, and approve or reject with a reason. **Success:** decisions are audited (`AuditLog`); a rejected video shows the reason to the teacher; an approved one can be published.
- **CAP-3.3 — Use in class / lab:** an approved video can be attached to a class (as a resource) and/or to a Lab as a "simulation demo". **Success:** students see only approved videos of classes they belong to; quarantining the asset hides it everywhere it is used.
- **CAP-3.4 — "Video tool" scope:** v1 means the governance tool above (submit → review → publish), reusing the Content tool's P2 video contract for playback and progress. In-app video editing/recording is out of scope (see Non-goals).

### I-5 — Parent view of lab results (P2)

- **CAP-5.1 — Lab results summary:** for a linked, consented child, the parent sees per subject/class: labs assigned, completed, latest verdict, and graded scores that the teacher has **published** (`GradebookEntry.score10`). **Success:** unpublished grades, AI suggestions, other students' data and class-practice runs never appear; an unlinked parent gets 403.
- **CAP-5.2 — Neutral teacher-support indicators:** the parent sees factual counts for the child's class, e.g. "Bài đã được chấm và trả", "Số nhận xét của GV cho con", "Thời gian trả bài trung bình". **Success:** no UI text rates or ranks a teacher ("tâm huyết", stars, scores); indicators are computed server-side from existing records only.
- **CAP-5.3 — Periodic digest (optional):** weekly in-app notification summarising CAP-5.1. Email/Zalo delivery is a later decision.

### I-2 — Spoken hints on hover in the student lab (P3)

- **CAP-2.1 — Opt-in voice hints:** a "Giọng đọc gợi ý" toggle in the lab toolbar and in Settings, stored in `User.preferences` (new key `voiceHints: boolean`, default `false`). This changes the preferences contract (today only `theme` and `locale`; `users/.../preferences.ts` `preferencesUpdateSchema`/`readPreferences`) — add the key there with tests, missing key reads as `false`. **Success:** with the toggle off, no audio ever plays.
- **CAP-2.2 — Hover speech:** when enabled, hovering (or keyboard-focusing) a labelled apparatus/control for ≥ 600 ms speaks its short label/hint via `window.speechSynthesis` using a `vi-VN` voice when available. **Success:** moving away or focusing another element cancels current speech; quick sweeps produce no overlapping audio; if no Vietnamese voice exists the toggle shows "Thiết bị chưa hỗ trợ giọng tiếng Việt" and stays usable as visual tooltip.
- **CAP-2.3 — Shared hint registry:** labs register hover targets through one hook (`useHoverHint(id, text)`) reusing existing `defineText` strings, so voice and visual tooltip read the same text. **Success:** at least the wet-bench kit and one physics lab use it; `prefers-reduced-motion` is respected for the visual part.

### I-1 — Teacher AI workspace: prompt library and AI-assisted class lab setup (P2, after G-6)

- **CAP-1.1 — Prompt library:** a teacher saves, names, edits and reuses their own instructions (≤ 1000 chars each, same limit as `instruction`) per purpose (resource, assessment, lab challenge). **Success:** choosing a saved prompt fills the `instruction` of a new `AiJob`; prompts are private to the teacher; system prompt templates stay code-owned and versioned.
- **CAP-1.2 — AI-assisted class lab setup:** from a lesson goal, the AI proposes a class LAB resource draft built only from an **approved** lab release: objective, instructions, report prompts and `customParams` inside allowlisted ranges. **Success:** proposals go through the existing per-item review; apply re-validates with the server contract; nothing reaches students before the teacher publishes. **Design note:** `AiJob` rows are class- and lesson-bound (`classId`, `lessonId` both required) and keep an immutable request/input snapshot (`schema.prisma:1676-1690`); this needs a new purpose (e.g. `DRAFT_CLASS_LAB`) whose snapshot pins the source `releaseId` and allowlisted ranges, rather than reusing `DRAFT_LAB_CHALLENGE` (which targets a teacher lesson).
- **CAP-1.3 — Workspace page:** one teacher page groups AI jobs, saved prompts, quota/credits and drafts. **Success:** reuses existing endpoints; no new provider path.

## Constraints

- **Engine authority (AD-7, AD-14):** AI never writes simulation code, formulas, engine state or new Lab/Challenge/Simulation rows. "Tạo phòng lab theo ý GV" is limited to configuring approved releases.
- **Provider gate G-6** (and SG-2 for students) applies unchanged to every new AI call; only the `fake` provider runs until it is recorded. I-2 uses on-device browser speech and sends nothing to a provider.
- **Class membership** is the only path for students to see teacher materials and videos (FR-24 rule; `asset-versions.ts` check).
- **Under-18 privacy:** parent data only through an approved `ParentLink` plus current `ParentConsent`; follow Nghị định 13/2023/NĐ-CP principles (purpose limitation, minimum data). No new student data leaves the platform.
- **Copyright:** every teacher-supplied video or material carries a rights declaration; admins can quarantine at any time; the platform never auto-downloads third-party videos.
- **Teacher-only AI output:** AI suggestions stay out of student and parent read models (existing rule, `schema.prisma:1736-1738`).

## Non-goals

- AI-generated 3D models, simulations or brand-new lab types; a general Lab builder.
- In-app video editing, recording, transcoding or a video hosting CDN.
- Rating, ranking or scoring teachers ("tâm huyết") in any UI.
- Parent–teacher chat, Zalo/SMS delivery, payment.
- Cloud TTS voices and per-element pre-recorded audio (possible later if Web Speech quality is not enough).
- Teacher sharing materials with other teachers / school-wide library.

## Proposed PRD entries (not yet added to `prd.md`)

- **FR-27 (I-4):** A teacher can reuse their private materials across owned classes and present them in a class materials view; access stays limited to approved members.
- **FR-28 (I-3):** Teacher-submitted videos require a rights declaration and admin approval before any student can view them; approved videos can be attached to a class or a lab.
- **FR-29 (I-5):** A linked, consented parent can view the child's lab results and published grades plus neutral teacher-support indicators; no teacher rating.
- **FR-30 (I-2):** Students can opt in to spoken hover hints in labs; off by default; device speech only.
- **FR-31 (I-1):** Teachers can keep a private prompt library and get AI-proposed class lab configurations from approved releases, subject to G-6.

## Delivery order

1. **I-4** — smallest change on existing `ClassResource`/`Asset`; immediately useful for online classes.
2. **I-3** — adds one review state and admin queue on the same `Asset` pipeline; depends on I-4 UI patterns.
3. **I-5** — read-only projections over existing records; needs owner decision on indicators (Q-5).
4. **I-2** — FE-only; independent, can run in parallel with I-3/I-5 if a FE dev is free.
5. **I-1** — last: AI value is blocked by G-6 and, for lab setup, by range approval (TAI-06 Q-C2-04).

Suggested ticket slices (to expand into `tickets.md` after owner decisions): I4-T1 materials view, I4-T2 library picker + rights tick; I3-T1 asset review state + migration, I3-T2 admin queue, I3-T3 lab/class attach + student player; I5-T1 parent lab-results endpoint, I5-T2 indicators endpoint, I5-T3 FE cards; I2-T1 preference + toolbar toggle, I2-T2 `useHoverHint` + wet-bench; I1-T1 prompt library, I1-T2 lab setup proposals.

## Open questions (owner)

- **Q-1 (I-1):** Is configuring approved labs enough for "tạo phòng lab theo ý GV", or do you expect teachers to create brand-new labs? (The latter is a separate, large epic.)
- **Q-2 (I-1/I-3):** Who approves lab parameter ranges (TAI-06 Q-C2-04) and when? Without it CAP-1.2 cannot pass.
- **Q-3 (I-3):** MP4 upload in v1, or links only? Upload costs storage/bandwidth (limit 300 MB/file today).
- **Q-4 (I-3):** Must every teacher video be admin-approved, or only videos that go to a Lab / shared library while class-only videos are teacher-responsible?
- **Q-5 (I-5):** Which neutral indicators are acceptable to show parents? Proposal: assignments returned, teacher comments count, median grading turnaround.
- **Q-6 (I-2):** Hover hint text: reuse existing labels only, or write dedicated spoken hints per apparatus (content work)?
- **Q-7 (I-4):** Allow DOCX/PPTX (needs new validation) or require teachers to export PDF? Per-file and per-class storage limits? Today: class editor 20 MB; asset policy PDF 20 MB, video 300 MB (env-overridable).

## Success signal

Each idea ships behind its own slice with BE build/tests and FE build green, and the access rules above covered by tests: non-member denied (I-4, I-3), pending video invisible to students (I-3), unlinked or unconsented parent denied and no AI suggestion in parent payloads (I-5), no audio with toggle off (I-2), no live provider call without G-6 (I-1).
