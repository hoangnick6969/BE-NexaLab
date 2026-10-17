---
title: Đánh giá Open Learning so với PRD, Architecture Spine, các SPEC đã duyệt và codebase
status: assessment for Product Owner — không sửa PRD hay SPEC
created: 2026-10-17
baseline: main bc66c8f (PR #19); dữ liệu đo trên Supabase development (chỉ đọc) và PostgreSQL local
assessed:
  - sprint-change-proposal-2026-10-16.md (Draft)
  - ../specs/spec-open-learning-catalog/SPEC.md (ready-for-story-breakdown)
  - ../specs/spec-open-learning-catalog/access-and-lab-discovery.md
  - ../specs/spec-open-learning-catalog/.memlog.md
against:
  - ../../docs/product/prd.md (PO-approved baseline, 2026-10-12)
  - architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md (AD-1..AD-14)
  - increment-b-c-plan.md (D1–D24), content-data-foundation.md
  - SPEC A1–A5, B1, B2, C1, Content Foundation
  - ../../docs/reference/srs-nexalab-v1.1.txt (SRS v1.1 draft, 08/10/2026, cập nhật 12/10/2026; PRD thắng khi khác nhau)
---

# Đánh giá Open Learning

## 1. Kết luận

**Hướng sản phẩm đúng, nhưng chưa sẵn sàng chia story.** Open Learning sửa một nhầm lẫn có thật: hiện "được xem bài", "thuộc lớp" và "được giao bài"
là một khái niệm (mục 6.1). Nó giữ được các nguyên tắc nền: server quyết định điểm/tiến độ, quyền sở hữu, governance nội dung, nội dung riêng
của giáo viên.

Năm điều chặn việc chia story:

| # | Vấn đề | Mục |
|---|---|---|
| B1 | SPEC `ready-for-story-breakdown` nhưng PRD và **Architecture Spine AD-4, AD-6** vẫn trói luồng học vào bài giao; quy tắc nguồn quyết định (PRD → Spine → SPEC) bị đảo | 4, 5 |
| B2 | Đề xuất và SPEC mâu thuẫn (quiz/thẻ nền) và SPEC chỉ phủ 5/9 hướng của đề xuất | 3 |
| B3 | **Tiến độ khoá học không có định danh an toàn:** B2 đã quy ước `assignmentId = NULL` là "legacy/free-practice"; trên dev có 32/43 `StepProgress` và 37/55 `Attempt` NULL; unique key không chặn trùng khi NULL | 6.3 |
| B4 | **Không có dữ liệu taxonomy để dựng catalog:** dev có 0 chapter, 0 topic, 8 outcome; 0/62 lesson map được chương/chủ đề; Lab chỉ có topic text | 6.4 |
| B5 | **Lỗ hổng media hiện có** sẽ thành lỗ hổng của TEACHER_PRIVATE khi mở catalog: asset của lesson riêng đọc được bởi mọi người đã đăng nhập biết version ID | 6.5 |

Khuyến nghị: PO ghi quyết định cho các mâu thuẫn (mục 4–5) trong PRD/Spine hoặc decision record được chúng tham chiếu; sửa B5 ngay vì đã tồn tại
trên main; thiết kế B3/B4 trong architecture trước story đầu tiên; viết SPEC riêng cho các hướng chưa có SPEC.

## 2. Nguồn được đánh giá

| Tài liệu | Trạng thái | Nội dung |
|---|---|---|
| Đề xuất 2026-10-16 | Draft for PO review; tự nêu "PRD phải sửa trước" (§2.1) | 9 hướng: (1) học liệu mở, (2) bỏ cổng quiz chung, (3) Class Space, (4) deck Quizlet theo lớp, (5) tách bài giao, (6) điều hướng phân cấp, (7) hiệu năng, (8) tiến độ ở dashboard + hồ sơ, (9) nhảy trang ebook |
| SPEC open-learning + companion | ready-for-story-breakdown; tự "narrow" A2/A3/B1 | CAP-1 catalog mở, CAP-2 tiến độ khoá học ở hồ sơ, CAP-3 hoạt động riêng của giáo viên qua bài giao, CAP-4 catalog Lab + Lab theo ngữ cảnh, CAP-5 kịch bản Lab riêng; checklist 15 mục |
| `.memlog.md` | — | Quyết định của user: quiz/thẻ nền SHARED; mẫu số theo course version cố định; tái dùng luật hoàn thành A2; Lab một topic chuẩn + outcome + related topics; giữ nguyên URL video hiện có; đổi nhãn "Bài đọc" → "Nội dung bài" |

## 3. Đề xuất ↔ SPEC

| Hướng của đề xuất | SPEC | Đánh giá |
|---|---|---|
| (1) Học liệu mở mọi khối/môn | CAP-1 | Có. Cả hai ghi "across subjects", rộng hơn PRD (mục 4.2) |
| (2) Bỏ cổng quiz ở học liệu chung; **không có quiz/thẻ nền** | Quiz/thẻ nền **SHARED**, không phải cổng; tính vào hoàn thành chỉ khi course version yêu cầu | **Mâu thuẫn.** Memlog cho thấy SPEC là quyết định mới hơn; đề xuất cần ghi chú đã bị thay thế ở điểm này |
| (3) Class Space — tài nguyên/file cho lớp, không phải bài giao | Không có | Khoảng trống. SPEC chỉ có kênh "bài giao riêng" |
| (4) Deck Quizlet theo lớp | Thẻ do giáo viên tạo = bài giao riêng (CAP-3) | **Khác mô hình:** tài nguyên lớp (đề xuất) vs bài giao (SPEC) |
| (5) Tách share và assign | Chỉ có assign | Phụ thuộc (3) |
| (6) Điều hướng môn → khối → chương → bài | Có (constraints, CAP-4) | Có |
| (7) Ngân sách hiệu năng catalog/video/PDF | Không có | Khoảng trống |
| (8) Tiến độ ở dashboard và hồ sơ | Hồ sơ (CAP-2) | Hẹp hơn |
| (9) Nhảy trang ebook theo edition | Không có | Khoảng trống |
| — | Đổi nhãn "Bài đọc" → "Nội dung bài" | Chỉ có ở SPEC; FE `ebook/ebook.tsx:123`, `lessons/library.tsx:310` |

## 4. So với PRD

### 4.1 Tương thích

| PRD | Open Learning |
|---|---|
| QR-01, QR-02 | Server chấm điểm, tiến độ từ evidence |
| QR-03, FR-02 | Ma trận truy cập theo persona; direct-ID cùng luật với list |
| QR-08, §10.1, D17 | Release gate Content Foundation giữ nguyên; fixture/OCR không phải học liệu phát hành |
| §10.12, D1 | Nội dung giáo viên tạo là TEACHER_PRIVATE |
| §10.5 | Video 90%/ended giữ nguyên |
| FR-09 | Điều hướng môn/khối/chương/chủ đề (bỏ chữ "assigned") |
| FR-23 | Link ebook giữ; đề xuất mở rộng |

### 4.2 Mâu thuẫn

| PRD | Hiện viết | Open Learning | Mức |
|---|---|---|---|
| §1, §3 Increment B, §10.1 | KHTN THCS; catalog MVP lớp 8–9 | "across subjects and grades" | Trung bình |
| §3 Shared Foundation | `Content → Assignment → Attempt → Progress` | Thêm `Content → Course progress` | Cao |
| §3 Increment A, §4 | `Bài học → Bài tập (quiz → lab → challenge)`; Lab khóa tới khi đạt quiz | Không cổng ở học liệu chung | Cao — đổi giả thuyết sư phạm Release 1 |
| FR-08, FR-09 | Học sinh chỉ mở nội dung được giao | Mọi học sinh mở nội dung đã phát hành | Cao |
| FR-11, FR-12, §10.3 | Quiz mở bước tiếp, ngưỡng 50%, bước khóa hiển thị | Chỉ trong bài giao riêng có cấu hình | Trung bình |
| FR-15 | Tiến độ theo bài giao | Thêm tiến độ khoá học | Cao |
| §9 | ≥ 70% assigned-path completion; ≥ 60% thử lại lab đại diện | Không định nghĩa lại | Cao — pilot đo sai sản phẩm |
| §10.4 | Lab mạch điện đại diện nằm sau cổng quiz | Lab nền mở | Trung bình |

### 4.3 Khoảng trống

| PRD | Open Learning chưa nói |
|---|---|
| FR-19, D8 | Phụ huynh có thấy tiến độ khoá học không (C1 tổng hợp theo bài giao) |
| FR-18 | Bảng giáo viên/cờ hỗ trợ có dùng tiến độ khoá học không |
| FR-20 | Admin quarantine bài giao riêng / kịch bản Lab riêng |
| BR-22 | Retention cho evidence khoá học |
| QR-04, QR-05 | Chuẩn a11y/responsive cho màn mới |
| QR-09 | Tải đọc tăng khi catalog mở cho mọi học sinh |

## 5. So với Architecture Spine và SPEC đã duyệt

### 5.1 Architecture Spine

| AD | Quy định | Open Learning | Trạng thái code |
|---|---|---|---|
| AD-4 | "Preserve `Content → Assignment → Attempt → Progress`"; evidence phải "identify the student, assigned content, step, and time" | Thêm đường không qua assignment | — **Phải sửa Spine** |
| AD-6 | "Backend determines assignment applicability, quiz outcome, unlocked step" | Cổng chỉ trong bài giao | — **Phải sửa Spine** |
| AD-11 | Step + evidence bất biến; `Progress` là projection rebuildable | Tương thích | Có |
| AD-12 | "Backend Zod schemas and generated OpenAPI are the canonical HTTP contract" | Mọi route mới cần contract | **Chưa thực hiện**: OpenAPI chỉ có schema quiz viết tay; 61 `body: unknown` |
| AD-13 | Asset scoped teacher-private / shared; signed access sau authorization | Tương thích | **Lệch**: `canReadVersion` không xét scope lesson (mục 6.5) |
| AD-14 | "Prevents … hardcoded lab IDs becoming the content model"; pack bound theo topic | CAP-4/5 cần đúng điều này | **Lệch**: 18 chỗ ID lab cứng; `Lab.topic` là text |

### 5.2 SPEC đã duyệt bị Open Learning thu hẹp

| SPEC | Quy tắc hiện có | Sau Open Learning |
|---|---|---|
| A2 core materials | `GET /lessons/:id/pathway` "authorizes assignment applicability"; FE dùng "assignment-authorized pathway" cho Bài học và Bài tập; response có `assignment: {id, dueDate, overdue}` | Cần hai pathway: shared (không có `assignment`) và assignment |
| A3 quiz gates | `GET /lessons/:lessonId/quiz` "only when assignment/path prerequisites are met" | Quiz nền shared không cần assignment; attempt tách |
| A4 lab | "an assigned student who passed the quiz opens the circuit step"; `Attempt.assignmentId` bắt buộc trong contract | Lab nền mở; attempt bài giao giữ nguyên |
| A5 progress | `/me/progress` = "active assignment summaries"; mẫu số = "assigned published required steps" | Endpoint tiến độ khoá học mới; `/me/progress` thành tiến độ bài giao |
| B2 evidence | "`assignmentId` … null is legacy/free-practice only" | **Xung đột ngữ nghĩa NULL** với tiến độ khoá học (mục 6.3) |
| C1 parent | "Progress is assignment-scoped" | Không đổi nếu PO chọn giữ (Q-3) |

## 6. So với codebase và dữ liệu

### 6.1 Route học sinh hiện tại

| Nhóm | Route | Gắn bài giao |
|---|---|---|
| Danh sách | `GET /lessons` (STUDENT lọc theo `applicableAssignmentWhere`), `GET /labs`, `GET /subjects` | `/lessons` có; `/labs`, `/subjects` không |
| Học bài | `GET /lessons/:id/pathway`, `PUT /lessons/:lessonId/steps/:stepId/progress`, `POST /lessons/:id/complete` | Có — `studentPathway` ném `ASSIGNMENT_NOT_FOUND` |
| Quiz | `GET /lessons/:lessonId/quiz`, `GET|POST /lessons/:lessonId/quiz-attempts`, `POST /lessons/:id/quiz` (legacy) | Có |
| Lab | `GET /lessons/:lessonId/steps/:stepId/lab` | Có |
| Lab tự do | `POST /simulate/:labId`, `POST /attempts` (`assignmentId` optional), `POST /attempts/:id/hint`, `GET/POST/DELETE /saved` | **Không** — luyện Lab tự do đã tồn tại |
| Bài giao, tiến độ | `GET /assignments`, `GET /assignments/:id`, `GET /me/progress`, `/me/activity`, `/me/quiz-attempts/:id`, `/me/attempts/:id` | Có |
| Media | `GET /assets/versions/:id/access`, `GET /files/:id` | Không (mục 6.5) |

Tổng cộng 29 lời gọi kiểm bài giao trong route học sinh (`learning` 14, `labs` 7, `hint` 2, `lessons` 2, `progress` 2, `classes` 2).
**CAP-4/CAP-5 nhỏ hơn SPEC gợi ý:** mọi `Lab` hiện do admin quản lý (thực chất là shared) và đã luyện tự do được; phần tuỳ biến của giáo viên
nằm ở `Lesson.challengeParams`.

### 6.2 Dữ liệu Supabase development (đọc ngày 2026-10-17)

| Bảng | Số đo |
|---|---|
| Lesson | 62: 50 SHARED_LIBRARY published (synthetic), 1 SHARED_LIBRARY archived (synthetic), **11 TEACHER_PRIVATE published** |
| CurriculumChapter / Topic / Outcome | **0 / 0 / 8** |
| Lesson map được chương/chủ đề theo text | **0/62** |
| Lab | 3 (`chemistry`, `circuit`, `eye`), lớp 8, topic dạng câu tiếng Việt |
| StepProgress `assignmentId` NULL | **32/43** (không có cặp trùng hiện tại) |
| Attempt `assignmentId` NULL | 37/55 |
| QuizAttempt `assignmentId` NULL | 0/3 |
| Lesson còn JSON `materials/questions` | 52/62 (tất cả đều có `LessonStep`) |
| Assignment còn `studentIds` | 7/31 (cả 31 có `AssignmentTarget`) |
| Người dùng | 17 học sinh, 4 giáo viên, 2 phụ huynh, 1 admin |
| Migration chưa áp | `20261016090000_cf_asset_versions`, `20261016100000_cf_sources_packs_releases`, `20261016110000_cf_simulation_packs` |

### 6.3 Định danh tiến độ khoá học (B3)

- `StepProgress @@unique([studentId, assignmentId, stepId])`; PostgreSQL coi các NULL là khác nhau, migration B2 không tạo partial index hay
  `NULLS NOT DISTINCT` → hai lần ghi tiến độ mở cùng bước có thể tạo hai dòng.
- B2 SPEC và code (`progress.controller.ts:265` `legacy: !item.assignmentId`) coi NULL là legacy. 32 dòng NULL đang có trên dev.
- Kết luận: tiến độ khoá học **không được** biểu diễn bằng `assignmentId IS NULL`. Cần một discriminator tường minh (bảng riêng, hoặc cột
  ngữ cảnh + course version + unique riêng) và quy tắc cho 32 dòng legacy (giữ là legacy, không tự chuyển thành tiến độ khoá học — đúng companion §3).

### 6.4 Taxonomy và course version (B4)

- Không có model course/course version; `ContentPackVersion`/`ContentRelease` là version gói nội dung.
- `Lesson.chapter/topic` là text; taxonomy trên dev rỗng; spec KHTN8 taxonomy vẫn chờ artifact chương trình chính thức.
- `Lab` có `grade` và `topic` text, không scope, `status` mặc định `published`; `Lesson.labId` một liên kết; `CurriculumTopic.outcomeCodes` JSON.
- Hệ quả: CAP-1 (catalog phân cấp), CAP-2 (mẫu số) và CAP-4 (Lab theo ngữ cảnh) đều phụ thuộc dữ liệu taxonomy chưa tồn tại. Phần code có thể làm
  với fixture, nhưng nghiệm thu thật cần taxonomy KHTN 8 được nhập và 62 lesson được gán (biên tập, không tự suy ra từ text).

### 6.5 Truy cập media (B5 — đang tồn tại trên main)

- `assets/asset-versions.ts` `canReadVersion`: ngoài admin/owner/staff, cho phép đọc nếu **bất kỳ** lesson `published|archived` hoặc Lab `published`
  chứa chuỗi `assetv:<id>` (`LIKE` trên `materials::text`/`config::text`). Không xét `Lesson.scope`, bài giao hay lớp.
- `assets/files.controller.ts` (legacy) tương tự: chỉ kiểm `status: "published"`.
- Trên dev có 11 lesson TEACHER_PRIVATE published → asset của chúng đọc được bởi mọi tài khoản biết version ID. ID là cuid/uuid nên khó đoán,
  nhưng lộ qua link chia sẻ là đủ.
- `LIKE` trên JSON ép kiểu text quét toàn bảng ở mỗi lần cấp URL (QR-09) và có thể khớp nhầm chuỗi con.

### 6.6 Tham chiếu tài liệu bị gãy

| Nơi tham chiếu | Đích | Thực tế |
|---|---|---|
| SPEC open-learning companions | `../../../../nexalab-fe/docs/design/08-STUDENT-P0-UX-DEFINITION.md` | File có ở `FE-NexaLab/docs/design/`; thư mục `nexalab-fe` không tồn tại |
| `increment-b-c-plan.md` | `09-TEACHER-UX-DEFINITION.md`, `10-PARENT-UX-DEFINITION.md` | Không tồn tại trong workspace |
| Đề xuất §4 | "Current open-learning SPEC … rederive it from `.memlog.md`" | SPEC đã được tạo sau đó (a356cee); câu này đã lỗi thời |

## 7. So với SRS v1.1

SRS v1.1 (136 trang, 59 use case) được viết ngày 08/10 và cập nhật 12/10/2026, **trước** các quyết định Increment B/C (D1–D24, 14/10) và trước
Open Learning (16/10). SRS tự quy định "khi khác PRD thì PRD thắng", nên SRS cũng phải đi theo khi PRD đổi.

### 7.1 Chỗ SRS mâu thuẫn với Open Learning

| SRS | Nội dung | Open Learning |
|---|---|---|
| UC-LRN-01, 3.3.1 | "Follow the **assigned** lesson path"; `GET /lessons/:id/pathway` "only if the assignment applies" | Pathway shared không cần bài giao |
| 3.1.3 Screen Authorization | SC-08 → SC-15 (Lesson Path, Reading, Video, Study Cards, Quiz, Circuit Lab, Challenge) là "✓ assigned" | Mở cho mọi học sinh với nội dung SHARED |
| UC-LAB-04, UC-LAB-05, 3.4.1 | Lab chỉ mở sau cổng quiz; AC-09 "server refuses" lab/attempt khi chưa qua quiz | Lab nền mở; cổng chỉ trong bài giao |
| 3.5.2, UC-PRG-03 | Mẫu số tiến độ = "assigned, published, required steps" | Thêm mẫu số theo course version |
| Entity 7 `Subject` | "Physics, Chemistry or Biology within Natural Science" | Spec KHTN8 taxonomy: một môn `KHTN`, Lý/Hoá/Sinh chỉ là tag — SRS mâu thuẫn cả với taxonomy đã chốt |

### 7.2 Chỗ SRS ủng hộ Open Learning

| SRS | Nội dung |
|---|---|
| UC-LAB-01 (Future, P0) | Sandbox: "experiment freely without a challenge or grading" — đã có trong code ("Thực hành tự do", `/simulate`, attempt không bắt buộc bài giao) |
| UC-PRG-01, SC-07 | Dashboard hiển thị "progress by subject" — gần với tiến độ khoá học của CAP-2 |
| SC-08..SC-15 "✓ preview" cho giáo viên; "A teacher's preview never creates student evidence" | Cùng nguyên tắc với tách evidence theo ngữ cảnh |

### 7.3 Chỗ SRS đã lỗi thời so với quyết định B/C

| SRS | Đã chốt sau đó |
|---|---|
| UC-AUTH-01, SC-06 đăng ký giáo viên (Foundation, P0) | D10: chỉ phụ huynh tự đăng ký; tài khoản giáo viên do admin tạo |
| UC-AUTH-06, entity 5 `ParentLink {verifiedAt}` | D8, C1: giáo viên cấp mã sau khi đối chiếu hồ sơ; trạng thái `pending → approved`; consent có version |
| UC-PAR-02, NS-15 báo cáo tuần/tháng | D8: không làm báo cáo tuần/tháng |
| UC-ADM-01 "create, view, update and delete users" | D9: chỉ xoá cứng khi chưa có dữ liệu, còn lại vô hiệu hoá |
| 3.2.1 một ô "username hoặc email" (có `@` là email) | Code dùng endpoint riêng theo vai trò (`student/login`, `admin/login`, `login`) |
| 4.1.3 tên repo `nexalab-fe`/`nexalab-be` | Repo thực tế `FE-NexaLab`/`BE-NexaLab` |

Độ phủ chi tiết SRS ↔ code theo từng use case nằm trong `next-development-plan.md` mục 2.3.

## 8. Khuyến nghị

1. **Sửa B5 ngay** (độc lập với quyết định sản phẩm): đọc asset phải đi qua cùng chính sách với nội dung tham chiếu nó; thay `LIKE` bằng bảng
   tham chiếu asset ↔ nội dung có index.
2. PO quyết định các dòng ở 4.2, 4.3, 5.1 (AD-4, AD-6) — trong PRD/Spine hoặc decision record được chúng tham chiếu — trước story đầu tiên.
3. Ghi chú trong đề xuất: điểm "không có quiz/thẻ nền" đã được SPEC thay thế; câu "rederive from memlog" đã lỗi thời.
4. Architecture note cho B3 (định danh tiến độ khoá học, xử lý 32 dòng legacy) và B4 (course version, taxonomy Lab/Lesson bằng FK) trước story.
5. Coi nhập taxonomy KHTN 8 + gán 62 lesson là **phụ thuộc dữ liệu** của CAP-1/2/4, có người chịu trách nhiệm biên tập.
6. Viết SPEC riêng cho Class Space, deck theo lớp, ebook locator, ngân sách hiệu năng; quyết định mô hình thẻ giáo viên (bài giao hay tài nguyên lớp).
7. Sửa các tham chiếu gãy ở 6.6.
8. Cập nhật SRS theo mục 7 (người phụ trách SRS), sau khi PRD/Spine được sửa; SRS không phải nguồn quyết định mới.
