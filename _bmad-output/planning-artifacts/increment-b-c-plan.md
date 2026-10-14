---
title: Increment B + C Implementation Plan (B1, B2, C1, C2)
status: decisions-locked — sẵn sàng viết SPEC cho B1
created: 2026-10-14
updated: 2026-10-14
source:
  - ../../docs/product/prd.md
  - ../../docs/reference/srs-summary.md
  - release-1-epics.md
  - architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
  - ../implementation-artifacts/sprint-status.yaml
  - ../implementation-artifacts/deferred-work.md
---

# Increment B + C — Plan triển khai

Thứ tự build theo `release-1-epics.md`: `B0 → B1 → B2 → C1 → C2`. Mỗi epic có `SPEC.md` và `tickets.md` riêng trong `_bmad-output/specs/`, giống Increment A. File này là plan cấp increment, dùng để viết các spec đó; nó không thay thế spec.

**Thứ tự ưu tiên giữa các tài liệu:** PRD → SPEC của epic → plan này → SRS v1.1. Nếu một quyết định ở mục 3 mâu thuẫn với PRD, phải cập nhật PRD trước rồi mới triển khai.

## 1. Gate trước khi bắt đầu B1

| # | Việc | Trạng thái 2026-10-14 | Cách xử lý đã chốt |
| --- | --- | --- | --- |
| G1 | A5-T5: p95 đọc chưa đạt (`/me/progress` khoảng 1.1–1.3 s, mục tiêu 500 ms); chưa thử mất kết nối DB thật | Mở | **Không chặn B1.** Spike tối ưu auth guard nằm trong B0-T5; đo lại QR-09 ở môi trường pilot. A5-T5 giữ `in-progress` cho tới khi đo xong |
| G2 | Merge PR A5 của BE và FE | **Xong** (BE PR #7, FE PR #10) | — |
| G3 | 11 spec Playwright cũ fail vì vẫn vào `/` để đăng nhập (sau PR #9 form ở `/login`) | Fail (12 fail / 2 pass) | Sửa trong B0-T4 |
| G4 | `sprint-status.yaml` có key trùng trong `story_notes` (`epic-a5`, `a4-t1..t4`), do commit `77de47b` | Lỗi | Sửa trong B0-T4 |

## 2. Hiện trạng code liên quan tới B và C

### 2.1 Đã có (scaffold, chưa đủ để nghiệm thu)

- **Lớp học:** tạo lớp, roster, cấp tài khoản học sinh (mật khẩu tạm 24 h), cấp lại mật khẩu, duyệt hoặc xoá thành viên, giao bài (cả lớp hoặc nhóm), `POST classes/join`, `GET classes/:id/analytics`.
- **Nội dung:** teacher và admin tạo, sửa lesson. Lesson đã publish vẫn sửa trực tiếp được.
- **Phụ huynh:** học sinh tạo `linkCode`; phụ huynh liên kết bằng mã (dùng 1 lần); `GET children`; `GET progress/:studentId` (kiểm tra `ParentLink`).
- **Admin:** CRUD subject, sửa lab, xem danh sách user, sửa họ tên và khối, cấp lại mật khẩu người lớn, xoá user, upload asset.

### 2.2 Lỗi và lệch chuẩn tìm thấy khi review (2026-10-14)

Mức độ: **H** là cao (bảo mật, dữ liệu, hợp đồng), **M** là trung bình, **L** là thấp.

| ID | Mức | Vị trí | Vấn đề | Ticket |
| --- | --- | --- | --- | --- |
| R1 | H | `BE src/errors.ts` | Filter lỗi chỉ trả `{ message }`, mất `code` và `statusCode`; trái AD-12 và CR-01. Đã kiểm trên API thật: `ASSIGNMENT_PATHWAY_REQUIRED`, `EVIDENCE_NOT_FOUND`, `INVALID_CURSOR` không tới được client | B0-T1 |
| R2 | H | `BE routes.ts deleteUser` | Admin xoá cứng user, cascade xoá Attempt, QuizAttempt, StepProgress, Progress. Vi phạm BR-22 (giữ 12 tháng). Không có audit | C2-T1 |
| R3 | H | `BE routes.ts auth/login` | Người lớn đăng nhập được bằng mật khẩu tạm đã quá `temporaryPasswordExpiresAt` | B0-T3 |
| R4 | M | `BE routes.ts parent-code` | `linkCode` không có hạn; do học sinh tự tạo (SRS yêu cầu giáo viên hoặc nhà trường cấp); không huỷ liên kết được | C1-T1 |
| R5 | M | `BE GET progress/:studentId`, `GET children` | Teacher và parent đọc thẳng projection `Progress` và attempt thô, không qua derivation của A5 | B2-T1, C1-T2 |
| R6 | M | `BE GET classes/:id/analytics` | Trả attempt thô (`simulationResult`, hint), không có quiz hay step; misconception chỉ cho `circuit_001` | B2-T4 |
| R7 | M | `BE GET classes` (role STUDENT) | Không lọc `status: ACTIVE`; FE link sang `/lessons` thay vì `/assignments/:id` | B1-T5 |
| R8 | M | `FE pages.tsx Classes` | Nút "Tham gia bằng mã" đã hiện nhưng luồng chưa đủ theo UC-AUTH-05 | B1-T3 |
| R9 | M | `BE/FE assign` | Modal giao bài hardcode 3 lab, `contentType` bị đoán từ ID; bài giao lab không có trong `/me/progress` | B1-T5, B2-T1 |
| R10 | M | Thiếu route | Không có route sửa hoặc archive assignment và lớp, không ghi danh được học sinh đã có tài khoản | B1-T1, B1-T2, B1-T5 |
| R11 | M | `BE subjects POST` | `upsert` ghi đè subject trùng ID mà không báo | C2-T2 |
| R12 | M | Toàn hệ thống | Chưa có AuditLog (NS-12 là Foundation); A5 chỉ log ra stdout | B0-T2 |
| R13 | L | `BE attempts/:id/hint` | Gọi LLM trong transaction có advisory lock, giữ connection tới 20 s | B0-T5 |
| R14 | L | `BE auth/reset` + `FE App.tsx` | Route reset bằng token không được dùng; `forgot` lại gửi mật khẩu tạm | C2-T4 |
| R15 | L | `BE auth/login` | `auth/login` nhận cả ADMIN, nên `auth/admin/login` không tách biệt được gì | C2-T4 |
| R16 | L | `FE Classes` | "Xóa khỏi lớp" không hỏi xác nhận (CR-05); analytics in JSON thô | B1-T2, B2-T4 |
| R17 | L | `BE classes/join` | Chưa có chế độ duyệt, chưa có rate limit, không tắt được mã | B1-T3 |

## 3. Quyết định đã chốt (2026-10-14)

Nguồn: **SRS** là SRS v1.1 (`docs/reference/srs-summary.md`); **User** là quyết định user chọn ngày 2026-10-14; **Đề xuất** là phương án mặc định user đồng ý áp dụng. Muốn đổi quyết định nào thì sửa bảng này và các ticket liên quan trước khi viết spec.

| # | Chủ đề | Quyết định | Nguồn |
| --- | --- | --- | --- |
| D1 | Nội dung giáo viên được giao | Lesson và lab **đã published** trong thư viện chung (mọi tác giả) và của chính mình. Giáo viên chỉ sửa, publish, archive được nội dung do mình tạo; admin làm được với mọi nội dung | SRS UC-CLS-03, 3.6.7 |
| D2 | Học sinh vào lớp bằng mã | **Làm ở B1.** Lớp có `joinCodeEnabled` và `requiresApproval`. Mã sai trả lỗi chung (MSG-32), không lộ mã nào tồn tại. Sai quá 10 lần trong 10 phút thì khoá 15 phút (MSG-33). Đã là thành viên thì không tạo bản ghi trùng. Lớp cần duyệt thì để `pending` (MSG-34). Lớp đã archive không nhận thành viên mới | SRS UC-AUTH-05, 3.7.5 |
| D3 | Bài giao dạng lab độc lập | **Giữ.** Bài giao lab tính hoàn thành khi có Attempt `passed` của challenge thuộc lab đó, gắn `assignmentId`. Hiện trong `/me/progress` (bổ sung cho A5) và trong bảng của giáo viên | SRS UC-CLS-03 |
| D4 | Giáo viên mở khoá cổng quiz | **Làm ở B2.** Chỉ mở khoá bước LAB cho một học sinh, phải ghi lý do, thu hồi được, có audit. Không sửa điểm, verdict hay attempt nào | SRS BR-16, 3.7.4 |
| D5 | Tiêu chí "cần hỗ trợ" | Gắn cờ khi có một trong các điều kiện: (a) quá hạn mà còn bước bắt buộc chưa xong; (b) trượt quiz ≥ 2 lần mà chưa đạt; (c) ≥ 3 practical attempt mà chưa `passed`; (d) có bài giao đang mở nhưng 7 ngày không có hoạt động. Mỗi cờ kèm `evidenceIds`. Không AI, không xếp hạng. Ngưỡng để trong một hằng số cấu hình | Đề xuất |
| D6 | Học sinh bị xoá khỏi lớp | Enrollment chuyển sang `status: removed` thay vì xoá bản ghi. Học sinh mất quyền vào bài giao của lớp; evidence được giữ. Giáo viên **không** xem evidence của học sinh đã rời lớp; admin vẫn xem được | SRS 3.7.3 + Đề xuất |
| D7 | Sửa lesson hoặc quiz đã published | Khi lesson có bài giao ACTIVE hoặc đã có bất kỳ evidence nào, **khoá phần cấu trúc bước, tài nguyên và câu hỏi quiz** (metadata vẫn sửa được). Muốn thay đổi thì **clone** thành bản nháp mới (`clonedFromId`) rồi publish và giao lại. Versioning đầy đủ để sau, không thuộc Release 1 B và C | User |
| D8 | Liên kết phụ huynh | **Giáo viên (lớp của mình) hoặc admin cấp mã** cho từng học sinh. Mã dùng 1 lần, hạn 7 ngày, chỉ hiện một lần. Bỏ route học sinh tự tạo mã. Giáo viên, admin và phụ huynh đều huỷ được liên kết. Phụ huynh thấy: bài đã xong, bước còn lại, điểm quiz (mới nhất và cao nhất), số lần và verdict thí nghiệm, thời điểm hoạt động. **Không** thấy đáp án, labState hay nội dung hint. **Không** làm báo cáo tuần/tháng (UC-PAR-02) | User |
| D9 | Admin xoá user | User đã có evidence hoặc đang sở hữu lớp hay nội dung thì chỉ được **vô hiệu hoá** (`status: disabled`, thu hồi mọi session). Chỉ xoá cứng được user chưa có dữ liệu nào. Không tự khoá chính mình, không khoá admin cuối cùng | SRS 3.9.1, BR-22 |
| D10 | Tự đăng ký tài khoản | **Chỉ phụ huynh** tự đăng ký (giữ `auth/register` role PARENT, có rate limit và consent). Tài khoản giáo viên do admin tạo. Không làm SC-06 | User |
| D11 | Hiệu năng màn hình teacher, parent, admin | Cùng mục tiêu QR-09: đọc p95 500 ms, ghi 1.000 ms, đo ở pilot. Tải chuẩn để đo: lớp 40 học sinh × 6 bước | Đề xuất |
| D12 | Quên mật khẩu (người lớn) | **Link reset dùng 1 lần**, hạn 60 phút, gửi qua email (SC-03, SC-04). Luôn trả MSG-09 để không lộ email nào tồn tại. Đặt lại xong thì thu hồi mọi session. Bỏ cách gửi mật khẩu tạm qua email. Học sinh quên mật khẩu thì giáo viên cấp mật khẩu tạm mới (route đã có) | User |
| D13 | Mô hình dữ liệu | Chỉ thêm những gì B và C cần: `AuditLog`, `Enrollment.status`, `Classroom.status / joinCodeEnabled / requiresApproval`, `Lesson.clonedFromId`, bảng `ParentLinkCode`, `Chapter` (C2). Giữ `studentIds` dạng JSON, materials và questions dạng JSON. Chưa tách Material, StudyCard, Quiz | Đề xuất |
| D14 | Phản hồi khi truy cập ngoài phạm vi | Route chi tiết evidence (`/me/*`, route của giáo viên): **404 `EVIDENCE_NOT_FOUND`**, không lộ thông tin (CR-11). Phụ huynh truy cập con không liên kết: **403 `PARENT_LINK_REQUIRED`**. Mọi lần bị từ chối đều ghi AuditLog | SRS 3.8.2, CR-11 |

## 4. Kế hoạch theo epic

Quy ước: mỗi ticket là một lát dọc BE và FE, gồm Zod schema, OpenAPI, FE types, mã lỗi và test cùng lúc (AD-12). Mức kiểm chứng ghi riêng: source, automated, runtime, production (AD-9). Mọi thao tác ghi của teacher và admin đều gọi `audit()` trong cùng transaction. Mọi thao tác phá huỷ đều có hộp xác nhận ở FE (CR-05).

### B0 — Nền chung (spec gộp vào B1, làm trước B1-T1)

| Ticket | Nội dung | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| B0-T1 Error envelope | `Errors` trả `{statusCode, code, message, details?}`, giữ `message` để tương thích ngược; bảng mã lỗi chung (VALIDATION, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, STEP_LOCKED, DEPENDENCY_FAILURE); `api.ts` FE đọc `code` *(R1)* | Unit test cho HttpException-object, Zod, P2002, P2025, 500; `integration.mjs` và `a5-integration.mjs` kiểm `code` |
| B0-T2 AuditLog | Model `AuditLog {id, actorId, actorRole, action, targetType, targetId, outcome, before?, after?, reason?, createdAt}` có index `(targetType, targetId, createdAt)`; helper `audit(tx, …)`; AuthGuard và các lỗi `evidence_access_denied` ghi vào bảng *(R12)* | Mỗi lần bị 403 hoặc 404 vì ownership có 1 dòng audit; audit fail thì thay đổi rollback |
| B0-T3 Auth vá | Đăng nhập người lớn kiểm tra hạn mật khẩu tạm (MSG-08) *(R3)* | Mật khẩu tạm quá hạn trả 401 với `code: TEMP_PASSWORD_EXPIRED` |
| B0-T4 Test harness | Sửa 11 spec Playwright cũ sang `/login`; helper đăng nhập theo role `tests/fixtures/login.ts` dùng biến môi trường; sửa key trùng trong `sprint-status.yaml`; thêm `epic-b0..c2` với trạng thái `backlog` *(G3, G4)* | Toàn bộ Playwright FE pass với backend thật |
| B0-T5 Perf spike | Gộp truy vấn session và user trong AuthGuard thành một round-trip; đưa lệnh gọi LLM của hint ra khỏi transaction *(G1, R13)* | p95 của `/auth/me` và `/me/progress` giảm so với baseline ghi trong sprint-status |

### B1 — Teacher vận hành lớp sở hữu và giao bài (FR-16, FR-17)

| Ticket | Nội dung | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| B1-T1 Class lifecycle | `PUT classes/:id` (tên không trùng trong lớp của giáo viên, khối, `joinCodeEnabled`, `requiresApproval`), `POST classes/:id/archive`, `POST classes/:id/join-code/rotate`; danh sách lớp kèm trạng thái và số liệu | Teacher khác nhận 403; lớp archive không nhận bài giao hay thành viên mới; học sinh không thấy bài giao của lớp đã archive |
| B1-T2 Membership | Enrollment `status` gồm `pending`, `approved`, `removed` (migration từ `approved: boolean`); duyệt, từ chối, xoá có xác nhận; ghi danh học sinh đã có tài khoản bằng username; giáo viên cấp lại mật khẩu tạm (đã có) *(R10, R16)* | Xoá thành viên xong thì học sinh mất quyền vào bài giao, Attempt vẫn còn (D6); không ghi danh được tài khoản không phải học sinh |
| B1-T3 Join class (UC-AUTH-05) | `POST classes/join` theo D2; màn SC-18 cho học sinh; giáo viên thấy danh sách chờ duyệt *(R8, R17)* | Sai 11 lần trong 10 phút trả 429 MSG-33; mã đã tắt trả MSG-32; lớp cần duyệt thì học sinh không thấy bài giao cho tới khi được duyệt |
| B1-T4 Content library + editor | `GET teacher/content` theo D1 (lọc theo môn, khối, chương, trạng thái); Lesson Editor SC-23 với các tab Metadata, Reading, Video (bắt buộc transcript), Study cards, Quiz, Lab; publish chặn khi thiếu (MSG-28); khoá cấu trúc theo D7 và `POST lessons/:id/clone` | Không sửa được lesson của người khác; sửa câu hỏi của lesson đã có evidence trả 409 `CONTENT_LOCKED`; clone tạo bản nháp có `clonedFromId` |
| B1-T5 Assignment ops | Giao lesson hoặc lab (D3), hạn nộp không bắt buộc và không ở quá khứ (MSG-30), báo số học sinh nhận (MSG-31); `GET/PUT classes/:id/assignments/:aid`, `POST …/archive`; chống giao trùng; modal lấy dữ liệu từ B1-T4; học sinh link tới `/assignments/:id`, chỉ ACTIVE; bài giao lab vào `/me/progress` *(R7, R9, R10)* | Đổi nhóm học sinh thì bài giao hiện hoặc ẩn đúng; bài archive còn trong lịch sử A5; bài không có hạn xếp sau bài có hạn; thứ tự theo BR-19 |
| B1-T6 Journey + negative | `scripts/b1-integration.mjs` tự tạo và dọn fixture: tạo lớp → cấp tài khoản → học sinh khác vào bằng mã → duyệt → giao bài → học sinh thấy bài; teacher.outsider bị chặn ở mọi route; Playwright ở 390, 768, 1024, 1440 px | Script và Playwright thật pass; mọi thay đổi có AuditLog |

### B2 — Teacher hành động dựa trên evidence truy vết được (FR-18)

| Ticket | Nội dung | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| B2-T1 Class tracking board | `GET classes/:id/assignments/:aid/progress`: mỗi học sinh × mỗi bước (lesson) hoặc verdict (lab), tính bằng `deriveLesson`/`withDerivedCompletion` của A5, có nhãn overdue; SC-25 *(R5, R9)* | Số liệu khớp `/me/progress` của từng học sinh (test so sánh); số attempt khớp số bản ghi Attempt; p95 ≤ 500 ms theo D11 |
| B2-T2 Needs-support flags | Quy tắc D5, mỗi cờ có `evidenceIds` và lý do bằng ngôn ngữ trung tính | Mỗi cờ mở ra đúng attempt hoặc bước; không có xếp hạng |
| B2-T3 Student evidence | SC-26: `GET classes/:id/students/:sid/evidence`, `…/quiz-attempts/:qid`, `…/attempts/:id`; tái dùng builder chi tiết của A5; giáo viên thấy đáp án đúng và nội dung hint | Teacher khác hoặc học sinh đã rời lớp nhận 404 `EVIDENCE_NOT_FOUND` kèm AuditLog (D14) |
| B2-T4 Thay analytics cũ | Bỏ màn "Phân tích quá trình thực hành", thay bằng board, cờ và evidence sheet (tái dùng `EvidenceSheet` A5); misconception ghi "giả thuyết cần xác minh" *(R6, R16)* | FE teacher không còn gọi `classes/:id/analytics` và `progress/:id` |
| B2-T5 Quiz-gate override | `POST/DELETE classes/:id/students/:sid/steps/:stepId/override` có lý do (D4); pathway coi override là evidence loại `TEACHER_OVERRIDE`; projection rebuild hiểu override | Học sinh thấy LAB mở kèm nhãn "giáo viên mở khoá"; thu hồi override thì LAB khoá lại nếu chưa có attempt; client không giả lập được; có AuditLog |
| B2-T6 Journey + negative | Học sinh làm bài → teacher thấy cờ → mở đúng attempt → override → học sinh vào LAB | Script integration và Playwright thật pass |

### C1 — Phụ huynh theo dõi con đã liên kết (FR-19)

| Ticket | Nội dung | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| C1-T1 Link code + lifecycle | Bảng `ParentLinkCode {codeHash, studentId, issuedById, expiresAt, usedAt}`; giáo viên (lớp của mình) hoặc admin cấp mã theo D8; bỏ `POST parent-code` và `User.linkCode`; phụ huynh liên kết (MSG-35), có rate limit; huỷ liên kết bởi phụ huynh, giáo viên, admin *(R4)* | Mã hết hạn hoặc đã dùng bị từ chối; huỷ liên kết xong thì request đọc kế tiếp trả 403; AuditLog |
| C1-T2 Parent read model | `GET children`, `GET children/:id/progress`, `GET children/:id/activity`: tái dùng derivation và cursor của A5, chỉ trả các trường theo D8; bỏ quyền PARENT trên `progress/:studentId` *(R5)* | Con không liên kết trả 403 `PARENT_LINK_REQUIRED` kèm audit (D14); mọi method ghi trả 403; số liệu khớp màn của học sinh |
| C1-T3 Parent UI | SC-27 (danh sách con), SC-28 (nhập mã), SC-29 (tiến độ chỉ đọc, drill-down tới attempt ở dạng rút gọn); loading, rỗng, lỗi; responsive | Không có nút ghi dữ liệu học tập; 390 px không tràn ngang; dùng được bằng bàn phím |
| C1-T4 Journey + negative | Giáo viên cấp mã → phụ huynh liên kết → xem tiến độ → huỷ liên kết → phụ huynh mất quyền; phụ huynh khác bị chặn | Script và Playwright thật pass |

### C2 — Admin vận hành nền tảng không bypass kiểm soát (FR-20)

| Ticket | Nội dung | Tiêu chí nghiệm thu chính |
| --- | --- | --- |
| C2-T1 User lifecycle | SC-31: danh sách phân trang, tìm kiếm, lọc theo role; tạo giáo viên, phụ huynh, admin (D10); vô hiệu hoá hoặc kích hoạt lại; xoá cứng chỉ khi chưa có dữ liệu (D9) *(R2)* | User bị khoá nhận 401 ở request kế tiếp; evidence còn nguyên; AuditLog có before và after |
| C2-T2 Subjects, chapters, content | SC-32: `POST subjects` trả 409 khi trùng; CRUD `Chapter`, lesson metadata chọn chapter; admin archive lesson của mọi tác giả, có lý do *(R11)* | Archive không xoá evidence; cảnh báo nếu còn bài giao ACTIVE (MSG-36 cho học sinh chưa bắt đầu) |
| C2-T3 Labs, challenges, simulation config | SC-33: trạng thái lab và challenge, successConditions và constraints (publish theo BR-12); SC-35: khoảng tham số mô phỏng (UC-ADM-02, P1), chỉ áp dụng cho lần chạy sau | Attempt cũ giữ `simulationModelVersion` và kết quả; config sai bị từ chối |
| C2-T4 Auth cleanup | Link reset dùng 1 lần theo D12 (SC-03, SC-04, kích hoạt lại `auth/reset`); `auth/login` không nhận ADMIN, admin chỉ dùng `auth/admin/login` *(R14, R15)* | Link dùng lần 2 hoặc quá hạn bị từ chối; reset thu hồi mọi session; không lộ email tồn tại |
| C2-T5 Assets | SC-34: danh sách asset kèm chỗ tham chiếu; chặn xoá asset đang dùng; validator 3D (NS-14) để **P2, cắt đầu tiên** vì mắt 3D là R1-later | Không xoá được asset của lesson published |
| C2-T6 Admin UI + journey | SC-30 và các màn trên; xác nhận cho thao tác phá huỷ; negative: teacher hoặc parent gọi route admin nhận 403 | Script và Playwright thật pass; đối chiếu AuditLog |

## 5. Rủi ro và phụ thuộc

- **Hiệu năng:** màn giáo viên đọc nhiều hơn màn học sinh. Nếu B0-T5 không đủ thì B2-T1 sẽ trượt QR-09. Phương án dự phòng: đọc projection `Progress` đã có kiểm tra drift (NS-17) thay vì derive lại toàn bộ.
- **Migration dữ liệu thật:** chuyển `Enrollment.approved` sang `status`, chuyển `User.linkCode` sang `ParentLinkCode`, thêm `Classroom.status`. Mỗi migration cần backfill và rollback, chạy `prisma migrate deploy` trên DB dev dùng chung.
- **DB dev dùng chung:** script integration của B và C phải tự tạo và tự dọn fixture như `a5-integration.mjs`. Không dùng `SEED_RESET_FIXTURES`.
- **Email:** D12 cần SMTP thật hoặc mailbox dev (`scripts/mailbox.mjs`) để test link reset.
- **Ownership:** mọi route mới phải có test cho actor ngoài phạm vi (teacher khác, phụ huynh khác, học sinh khác, role sai).

## 6. Bước tiếp theo

1. Commit plan này cùng `docs/reference/` (SRS) lên một branch docs mới tạo từ `main`.
2. Viết `specs/spec-teacher-owned-class-assignment-ops/{SPEC.md,tickets.md}` cho B0 + B1 theo các quyết định ở mục 3.
3. Triển khai B0 → B1 trên branch `feat/b1-teacher-class-ops` ở cả hai repo. Viết spec B2, C1, C2 khi epic trước đã được nghiệm thu runtime.
