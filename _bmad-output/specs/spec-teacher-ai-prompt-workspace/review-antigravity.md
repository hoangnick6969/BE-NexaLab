# Antigravity review of TAI-08 (2026-11-25)

Read-only review by Antigravity (`agy --mode plan`). Every claim was checked against the code by Claude; all 9 findings were confirmed and applied to SPEC.md, implementation-contract.md and tickets.md the same day.

---

Dưới đây là kết quả rà soát bộ spec `spec-teacher-ai-prompt-workspace`:

1. **[Blocker] Hỏng luồng tính giá, ước tính và tất toán tín dụng cho `TEACHER_PROMPT_ASSIST`**
   - **Vị trí:** [SPEC.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/SPEC.md#L88), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L12), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L187), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L212).
   - **Vấn đề:** (a) `TEACHER_PROMPT_ASSIST` chưa có trong `PRICED_PURPOSES` / `BASELINE_PRICES` ([ai-credits.ts](../../../src/config/ai-credits.ts#L13-L40)) và enum giá ([credits-contract.ts](../../../src/modules/ai/application/credits-contract.ts#L33-L41)), nên `credits.confirm()` sẽ lỗi `409 PRICING_NOT_ACTIVE`. (b) `POST classes/:id/ai-jobs/estimate` ([credits.service.ts](../../../src/modules/ai/application/credits.service.ts#L203-L214)) không nhận `TEACHER_PROMPT_ASSIST` và spec không có route estimate nào để FE lấy `confirmedCredits`. (c) `AiJob.request` của Q&A không có `itemCount`, dẫn tới `credits.service.ts:173` tính `requestedCount = 0` và `chargeCredits()` ([credits-pricing.ts](../../../src/modules/ai/application/credits-pricing.ts#L27-L29)) luôn trả về `0` (hoàn 100% credit).
   - **Cách sửa:** Bổ sung `TEACHER_PROMPT_ASSIST` vào `ai-credits.ts` và `credits-contract.ts`; thêm route/nhánh estimate cho Q&A; gán `itemCount: 1` vào `AiJob.request` hoặc xử lý riêng `TEACHER_PROMPT_ASSIST` trong [credits.service.ts](../../../src/modules/ai/application/credits.service.ts#L173).

2. **[Blocker] `PromptMessage.status` bị kẹt `PENDING`/`RUNNING` khi fail/timeout/cancel hoặc crash khi xóa thread**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L178), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L212-L214).
   - **Vấn đề:** Spec nói dùng lại luồng hiện có và cập nhật `PromptMessage.status` trong cùng transaction, nhưng `AiJobRunner.fail()` ([ai-job-runner.ts](../../../src/modules/ai/application/ai-job-runner.ts#L359-L377)), `sweep()` ([ai-job-runner.ts](../../../src/modules/ai/application/ai-job-runner.ts#L384-L404)), và `AiJobsService.cancel()` ([ai-jobs.service.ts](../../../src/modules/ai/application/ai-jobs.service.ts#L342-L364)) hiện không cập nhật `PromptMessage`. Ngoài ra `cancel()` gọi `this.get()` sẽ bị 404 nếu `get()` chặn `TEACHER_PROMPT_ASSIST`. Nếu giáo viên xóa thread lúc job đang chạy, runner cập nhật `PromptMessage` đã cascade-delete sẽ văng lỗi.
   - **Cách sửa:** Cập nhật `PromptMessage.status` bằng `updateMany({ where: { aiJobId } })` trong `fail()`, `sweep()`, và hàm cancel dùng chung; khi xóa thread/message, hủy và refund mọi `AiJob` chưa kết thúc trong cùng transaction.

3. **[Blocker] Schema `defaults` và `{so_muc}` của `GENERATE_ASSESSMENT` trái với `createAiJobBody`**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L105-L110), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L122), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L159).
   - **Vấn đề:** Spec cho phép `GENERATE_ASSESSMENT` lưu `defaults.itemCount`, nhưng `assessmentDraftObject` ([assessment-blueprint.ts](../../../src/modules/ai/application/assessment-blueprint.ts#L34-L52)) dùng `.strict()`, không nhận `itemCount`, và yêu cầu `matrix` + `sections`. Endpoint `/resolve` (`:159`) cũng thiếu `proposalCount` và `sections`.
   - **Cách sửa:** Đổi `defaults` của `GENERATE_ASSESSMENT` thành `{ assessmentType?, matrix?, sections? }`; bổ sung `proposalCount?`, `sections?` vào `/resolve`; tính `{so_muc}` qua `slotCount(sections)` ([assessment-blueprint.ts](../../../src/modules/ai/application/assessment-blueprint.ts#L68)).

4. **[Major] Lỗ hổng PII và sót redact `AiJob.inputSnapshot` khi xóa/retention**
   - **Vị trí:** [SPEC.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/SPEC.md#L68), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L101), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L140), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L188-L192).
   - **Vấn đề:** Server chỉ kiểm tra PL-01/PL-02 trên `prompt.body` và `question`, bỏ qua `promptDraft` (chưa lưu) và `history` 6 lượt gửi kèm trong `inputSnapshot`; chưa đối chiếu tên/username học sinh thật trong lớp như [assessment-privacy.ts](../../../src/modules/ai/application/assessment-privacy.ts). Khi xóa thread/message, spec chỉ redact `request.question`/`promptDraft`, để nguyên dữ liệu đó trong `AiJob.inputSnapshot` (cả `history`).
   - **Cách sửa:** Chạy PL-01/PL-02 và đối chiếu định danh học sinh của `classId` cho cả `promptDraft` và `history` trước khi gọi provider; khi xóa hoặc retention sweep, redact cả `AiJob.inputSnapshot`.

5. **[Major] Thiếu cấu hình quota Q&A và chặn route `AiJob` hiện tại**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L11), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L214).
   - **Vấn đề:** `AiJobsService.quota()` ([ai-jobs.service.ts](../../../src/modules/ai/application/ai-jobs.service.ts#L366-L371)) chưa có nhánh `TEACHER_PROMPT_ASSIST` (sẽ trả nhầm 20/2 thay vì 50/1), và `AI_PURPOSES` ([ai-job-contract.ts](../../../src/modules/ai/application/ai-job-contract.ts#L10)) chưa có purpose này. `get`/`decide`/`materialize` trong `ai-jobs.service.ts` chưa có nhánh 404 chặn `TEACHER_PROMPT_ASSIST`.
   - **Cách sửa:** Thêm `TEACHER_PROMPT_ASSIST` vào `AI_PURPOSES`, đọc `AI_DAILY_PROMPT_ASSIST_LIMIT` trong `ai-config.ts` và `AiJobsService.quota()`; chặn 404 sớm trong `get`, `decide`, `materialize`, và route `classes/:id/ai-jobs/:jobId/cancel`.

6. **[Major] Lỗ hổng concurrency, giới hạn tin nhắn và mâu thuẫn ngữ nghĩa "restore"**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L30), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L98-L99), [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L158).
   - **Vấn đề:** (a) Unique `title` không phân biệt hoa/thường thiếu partial unique index SQL (`WHERE "archivedAt" IS NULL`), dễ trùng khi tạo song song hoặc unarchive. (b) Dòng 98 ghi "restore do not create versions" (ý nói unarchive) mâu thuẫn trực tiếp với dòng 158 và `SPEC.md:76` (khôi phục v1 tạo v3). (c) Mỗi lượt hỏi chèn 2 `PromptMessage` nhưng chưa khóa theo `threadId` và kiểm tra `count + 2 <= 200`. (d) Thiếu mã lỗi 404 cho version đã bị prune (vượt 50 version).
   - **Cách sửa:** Tạo partial unique index + trả `409 PROMPT_TITLE_TAKEN` khi unarchive trùng tên; tách rõ tên `unarchive` vs `version restore`; khóa `lock(tx, "prompt-thread:" + threadId)` và check `count + 2 <= 200`; thêm mã lỗi `PROMPT_VERSION_NOT_FOUND`.

7. **[Major] Biến `{mon}` chưa có nguồn dữ liệu và thiếu fallback cho `{so_muc}`/`{loai}`**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L121-L124).
   - **Vấn đề:** `loadLessonSource()` ([lesson-source.ts](../../../src/modules/ai/application/lesson-source.ts#L5-L12)) không query `Subject.name`, còn `Lesson.domain` là `MATTER|ENERGY|LIVING|EARTH_SKY`. Chưa rõ `{loai}` xử lý sao với `DRAFT_LAB_CHALLENGE` (không có `targetKind`).
   - **Cách sửa:** Chỉ định rõ `{mon}` đọc từ `Lesson.subject.name` hay bảng map `domain`, và quy định chuỗi rỗng hoặc chặn `Run` nếu biến không có giá trị.

8. **[Major] Thứ tự ticket và tiêu chí kiểm thử còn vênh**
   - **Vị trí:** [tickets.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/tickets.md#L12), [tickets.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/tickets.md#L18), [tickets.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/tickets.md#L23), [tickets.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/tickets.md#L27), [SPEC.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/SPEC.md#L82).
   - **Vấn đề:** `TAI8-T1` ghi copy `prompt-lint`/`prompt-variables` sang FE ở **T4**, nhưng **T3** đã dùng và chạy test cho chúng. `TAI8-T2` chứa tiêu chí test "xóa prompt giữ thread (`promptId = null`)" vốn phụ thuộc **T5**. `SPEC.md:82` đòi test `Ctrl+K` command palette nhưng không có spec chi tiết lệnh. `TAI8-T4` tái dùng `teacher-ai-hooks.ts` vốn gắn với URL `?aiJob=` đơn lẻ thay vì trạng thái theo từng tab editor.
   - **Cách sửa:** Đưa bước sync FE lint/variables vào `T3`, chuyển test `promptId = null` sang `T5`, bỏ hoặc liệt kê rõ danh sách lệnh `Ctrl+K`, và tách hook chạy job theo `tabId` độc lập với URL `?aiJob=`.

9. **[Minor] Giao diện kiểu IDE quá tải với giáo viên phổ thông trên màn hình laptop**
   - **Vị trí:** [implementation-contract.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/implementation-contract.md#L246-L250), [SPEC.md](../../../_bmad-output/specs/spec-teacher-ai-prompt-workspace/SPEC.md#L82).
   - **Vấn đề:** Trên laptop `1366×768` (`≥ 1280px`), 3 cột cộng bảng dưới tối đa 50% chiều cao khiến vùng soạn bị ép còn ~250px. Thuật ngữ IDE (*Explorer*, *Lint*, *Diff*, `{{}}` escape), 2 bước nhập liệu (soạn xong bấm Chạy lại mở thêm form xác nhận), và nguy cơ gõ sai `{bài_học}` dễ làm giáo viên lúng túng.
   - **Cách sửa:** Đẩy layout 3 cột lên `≥ 1400px` (1280–1399px thu gọn Explorer thành drawer); Việt hóa thuật ngữ (*Thư viện mẫu*, *Kiểm tra nội dung*, *So sánh thay đổi*); chèn biến bằng nút/chip khóa chính tả; đưa các thiết lập `defaults` lên ngay thanh công cụ trình soạn thay vì mở form thứ hai.

---

**Kết luận (Verdict):** **Chưa sẵn sàng để dev implement (Hold — cần chỉnh spec trước).** Có 3 blocker trực tiếp làm gãy luồng credits, trạng thái Q&A trên runner, và schema `GENERATE_ASSESSMENT`, cùng nhiều khe hở về PII và thứ tự ticket. Cần sửa `SPEC.md`, `implementation-contract.md`, và `tickets.md` theo các điểm 1–8 trước khi giao `TAI8-T1`.
