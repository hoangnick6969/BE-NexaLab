# Epic A4 Implementation Spec & Plan: Verified Circuit Lab Challenge & Retry

**Date:** 2026-10-13  
**Status:** In Progress — Full Vertical Slice Implementation  
**Predecessor Gate:** Epic A3 runtime acceptance merged into `main` (`Merge PR #5 e9b6bf6`)  
**Scope:** Epic A4 (`A4-T1` through `A4-T4`) across `BE-NexaLab` and `FE-NexaLab`.

---

## 1. Executive Summary & Progression

### Trạng thái chuyển đổi
* **Giai đoạn trước (Downstream Phase):** Do nhánh A3 đang phát triển song song, nhóm A4 đã xây dựng trước toàn bộ giao diện người dùng (`CircuitPathwayStep.tsx`), bộ mock contract fixtures (`circuit-contract-fixtures.ts`) và bộ test vật lý (`a4-acceptance.test.ts`).
* **Hiện tại (Full Implementation Phase):** Nhánh A3 đã được merge chính thức vào `main` và rebase thành công. Rào cản database/route conflict đã được gỡ bỏ. Bây giờ chúng ta tiến hành triển khai toàn diện cả Backend, Database Migration và kết nối API thật.

---

## 2. Chi tiết 4 Vertical Tickets của Epic A4

### Ticket A4-T1 — Cổng bảo vệ mở phòng lab mạch điện (Authorized Circuit Workspace & Gate)
- **Mục tiêu:** Học sinh chỉ mở được bài thực hành mạch điện khi đã được giao bài và **đã vượt qua bài kiểm tra Quiz của Epic A3 (Điểm $\ge 50\%$)**.
- **Backend Implementation:**
  - Bổ sung / cập nhật endpoint: `GET /lessons/:lessonId/steps/:stepId/lab`.
  - Kiểm tra điều kiện tiên quyết: Truy vấn `StepProgress` hoặc `QuizAttempt` của học sinh cho bài học đó. Nếu bước QUIZ chưa `COMPLETED` hoặc điểm $< 50\%$, chặn truy cập với mã lỗi bảo mật `QUIZ_NOT_PASSED` (HTTP 403 / 400).
  - Trả về cấu hình thử thách mạch điện đã được làm sạch (sanitized challenge context, mục tiêu dòng điện $1 - 20\text{ mA}$).
- **Frontend Integration:**
  - `FE-NexaLab/src/pages.tsx`: Bước `LAB` hiển thị biểu tượng ổ khóa khi bước QUIZ chưa hoàn thành, và mở khóa hiển thị `CircuitPathwayStep` khi QUIZ đã đạt.

---

### Ticket A4-T2 — Lưu trữ Lượt thử Thẩm định từ Server (Authoritative Attempt & Idempotency)
- **Mục tiêu:** Database lưu vết từng lượt thử thực hành bất biến; Server dùng `packages/sim` tính toán lại kết quả vật lý, tuyệt đối không tin dữ liệu từ client.
- **Database Schema (`prisma/schema.prisma`):**
  - Cập nhật model `Attempt`:
    ```prisma
    model Attempt {
      id                     String       @id @default(cuid())
      studentId              String
      student                User         @relation(fields: [studentId], references: [id], onDelete: Cascade)
      challengeId            String
      challenge              Challenge    @relation(fields: [challengeId], references: [id])
      assignmentId           String?
      lessonStepId           String?
      labState               Json
      simulationResult       Json
      verdict                String       // "passed" | "partial" | "needs_practice"
      durationMs             Int
      simulationModelVersion String       @default("1.0.0")
      idempotencyKey         String?
      createdAt              DateTime     @default(now())
      hints                  HintLog[]

      @@unique([studentId, idempotencyKey])
      @@index([studentId, challengeId, createdAt])
      @@index([studentId, lessonStepId, createdAt])
    }
    ```
  - Tạo migration: `npx prisma migrate dev` (hoặc migration script phù hợp với guarded policy).
- **Backend Controller (`src/routes.ts` - `POST /attempts`):**
  - Zod validation cho request:
    ```ts
    const attemptSchema = z.object({
      lessonStepId: z.string().optional(),
      assignmentId: z.string().optional(),
      challengeId: z.string(),
      labState: z.record(z.unknown()),
      durationMs: z.number().int().min(0).max(86400000),
      idempotencyKey: z.string().uuid(),
    });
    ```
  - Kiểm tra cổng Quiz A3 trước khi cho phép nộp bài lab.
  - **Xử lý Idempotency:** Nếu cùng `studentId` và `idempotencyKey` đã tồn tại:
    - Nếu payload giống nhau: Trả về kết quả attempt ban đầu mà không tạo thêm dòng mới.
    - Nếu payload khác nhau: Trả về HTTP 409 Conflict.
  - **Thẩm định Server:** Gọi `simulate("circuit", body.labState)`. Kết quả `simulationResult` và `verdict` được gán trực tiếp từ output của engine server, bỏ qua mọi tham số client tự gửi.
  - **Transaction nguyên tử:** Ghi bản ghi `Attempt`, cập nhật `StepProgress` (`COMPLETED` nếu `verdict === "passed"`), và đồng bộ `Progress` trong cùng một transaction.

---

### Ticket A4-T3 — Hiển thị Kết quả Thẩm định & Thử lại Bảo toàn Trạng thái (UI/API Wiring)
- **Mục tiêu:** Kết nối Frontend `CircuitPathwayStep` với API thật; hiển thị phán quyết chính thức và cho phép học sinh làm lại mà không mất linh kiện đã vẽ.
- **Frontend Actions:**
  - Thay thế fallback tạm thời bằng API call thực: `POST /attempts`.
  - Hiển thị phản hồi sư phạm tích cực tương ứng với verdict (`passed`, `partial`, `needs_practice`).
  - **Zero State Loss:** Khi thử lại, giữ nguyên `labState` hiện tại trên canvas, chỉ sinh `idempotencyKey` mới và reset đồng hồ bấm giờ `startTimeRef`.
  - Khi `passed`: Tự động trigger `onReconciled` để cập nhật trạng thái lộ trình bài học sang `COMPLETED`.

---

### Ticket A4-T4 — Kiểm thử Tích hợp & Nghiệm thu (Verification & Parity)
- **Mục tiêu:** Xác nhận tính toàn vẹn của luồng từ Quiz đến Lab, kiểm tra tính tất định của engine mô phỏng và chạy kiểm thử tự động.
- **Tiêu chí nghiệm thu:**
  1. `packages/sim/a4-acceptance.test.ts` pass 100% (4/4 ca kiểm thử vật lý).
  2. Test API chặn truy cập lab khi chưa pass quiz của A3.
  3. Test nộp lab với cùng `idempotencyKey` không sinh duplicate attempt.
  4. Test nộp lab hợp lệ lưu bản ghi vào PostgreSQL/Supabase thật.
  5. `npm test` ở Backend và `npm run build` ở Frontend chạy qua không lỗi.

---

## 3. Kế hoạch Thực hiện Tuần tự

- [x] **Bước 1 (Đã xong):** Xây dựng UI `CircuitPathwayStep.tsx` và Frozen Contract Fixtures.
- [x] **Bước 2 (Đã xong):** Rebase code A3 vào nhánh `A4` ở cả 2 repository.
- [ ] **Bước 3:** Cập nhật Prisma Schema (model `Attempt`) & chạy migration database.
- [ ] **Bước 4:** Cập nhật endpoint `POST /attempts` và kiểm tra gate Quiz A3 trong Backend.
- [ ] **Bước 5:** Kết nối API thật giữa Frontend và Backend.
- [ ] **Bước 6:** Chạy toàn bộ kiểm thử nghiệm thu và cập nhật `sprint-status.yaml`.
