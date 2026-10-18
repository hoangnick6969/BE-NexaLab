---
title: Kế hoạch phát triển tiếp theo — Open Learning trên nền kỹ thuật được làm lại
status: draft — chờ PO/team duyệt thứ tự và các quyết định ở mục 8
created: 2026-10-17
baseline:
  main: bc66c8f (PR #19)
  measured_on: refactor/project-structure (= main bc66c8f + tách Nest module, chưa commit); Supabase development (chỉ đọc)
inputs:
  - open-learning-prd-assessment.md
  - sprint-change-proposal-2026-10-16.md
  - ../specs/spec-open-learning-catalog/SPEC.md, access-and-lab-discovery.md
  - ../../docs/product/prd.md, architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md (không sửa trong plan này)
  - increment-b-c-plan.md, content-data-foundation.md, ../specs/spec-khtn8-taxonomy/SPEC.md
  - ../../docs/reference/srs-nexalab-v1.1.txt (SRS v1.1: 59 use case, BR-01..29, CR-01..13, MSG-01..47, NS-01..17)
  - ../implementation-artifacts/sprint-status.yaml, deferred-work.md, project-structure-refactor.md
---

# Kế hoạch phát triển tiếp theo

## 1. Tóm tắt

Plan có ba mạch chạy cùng nhau:

1. **Sửa ngay những gì đang sai trên main**: lỗ hổng đọc media của nội dung riêng, engine mô phỏng FE lệch BE, drift schema, test đỏ, CI thiếu.
2. **Làm Open Learning theo lát dọc** (SPEC open-learning CAP-1..CAP-5), sau khi PO chốt các mâu thuẫn với PRD/Spine và architecture giải quyết
   định danh tiến độ khoá học, course version, taxonomy.
3. **Chuyển dần sang khuôn kỹ thuật mới** (contract dùng chung, service/repository, query hook FE) — mỗi story chuyển domain nó chạm, không làm
   một đợt refactor riêng kéo dài.

Đường găng không phải code mà là **dữ liệu taxonomy KHTN 8** (dev đang có 0 chương, 0 chủ đề) và quyết định của PO.

## 2. Hiện trạng

### 2.1 Sản phẩm

Release 1 A1–A5, B0, B1, B2, C1, C2 `done`; Content Foundation CF-T1..T4 `review`, CF-T5 `backlog`. Bằng chứng local + Supabase dev; chưa có
pilot/production. Open Learning có đề xuất (Draft) và SPEC (ready-for-story-breakdown) trên main. Đánh giá chi tiết: `open-learning-prd-assessment.md`.

### 2.2 Kỹ thuật (đo 2026-10-17)

| # | Vấn đề | Số đo | Quy định bị lệch |
|---|---|---|---|
| T1 | Controller truy vấn Prisma trực tiếp, không service/repository | 232 `this.db.*` trong controller; 4 `@Injectable` | — |
| T2 | Validation trong handler, không DTO/pipe; field trùng rule khác nhau | 61 `body: unknown`; 32 `z.object` inline; `text`×4, `username`×3, `email`/`password`/`reason`×2 | AD-5, AD-12 |
| T3 | OpenAPI chỉ có schema quiz viết tay; FE tự khai type (24 type / 140 route) | — | **AD-12** ("generated OpenAPI is the canonical contract") |
| T4 | Kiểu yếu | BE 436 `any`, 119 `req: any`; FE 173 `any` | — |
| T5 | Lỗi không có danh mục | 199 `new XxxException`, 111 mã, message viết thẳng | AD-5 |
| T6 | ID lab cứng | 18 chỗ | **AD-14** |
| T7 | FE gọi API trực tiếp, component lớn, CSS một file | 90 `api(` vs 32 hook; 6 file > 400 dòng (`Admin.tsx` 1522); `styles.css` 5813 dòng | — |
| T8 | Engine FE ≠ BE dù cùng `1.0.0` | tarball FE thiếu thí nghiệm pH, schema hoá học cũ | **AD-8**, QR-01 |
| T9 | Đọc media không xét scope nội dung; `LIKE` trên JSON text | `canReadVersion`, `files.controller` | **AD-13**, QR-03 |
| T10 | Mô hình song song | `materials/questions` JSON (52/62 lesson) ↔ `LessonStep`; `studentIds` (7/31) ↔ `AssignmentTarget`; `AssetFile` ↔ `AssetVersion`; `SimulationConfigVersion` ↔ `SimulationPackVersion`; `Progress` projection ↔ dẫn xuất; 22 field status/scope String | AD-11, AD-13, AD-14 |
| T11 | Drift: `TextbookSource*` thiếu trong `schema.prisma`; drift B2; 3 migration CF chưa áp lên dev | `prisma migrate diff`, `_prisma_migrations` | AD-10 |
| T12 | Test và CI | B1, `test:integration` đỏ; 6–8 Playwright đỏ; CI chỉ chạy `test:integration`; script tích hợp 5048 dòng | AD-9 |
| T13 | Hiệu năng | attempt có chấm điểm ~5 s, join ~2 s trên dev (~30 truy vấn tuần tự) | QR-09 |

### 2.3 Độ phủ SRS v1.1 (đối chiếu code 2026-10-17)

Ký hiệu: **Có** = đã implement và có test/acceptance; **Một phần** = có nhưng thiếu luồng/quy tắc SRS nêu; **Thiếu** = chưa có; **Đã làm sớm** =
SRS xếp R1-later/Future nhưng code đã có, chưa có acceptance; **Khác SRS** = làm theo quyết định B/C mới hơn SRS.

| Module | Use case / chức năng | Trạng thái | Bằng chứng / chỗ hở |
|---|---|---|---|
| AUTH | UC-AUTH-01 đăng ký giáo viên | Khác SRS | D10: không cho giáo viên tự đăng ký; `auth/register` chỉ nhận `PARENT` |
| AUTH | UC-AUTH-02 cấp tài khoản học sinh (P0, A-min) | **Một phần** | Cấp từng người có; **cấp hàng loạt thiếu** (SC-21 "one or many", 3.2.6 mục 4 "bulk creation reports each row") |
| AUTH | UC-AUTH-03 đăng nhập/đăng xuất | Có, khác SRS | Endpoint riêng theo vai trò thay vì một ô "có `@` là email" (3.2.1) |
| AUTH | UC-AUTH-04 quên/đổi mật khẩu | Có | C2-T4; password-flow 6/6 |
| AUTH | UC-AUTH-05 vào lớp bằng mã | Có | B1-T3 |
| AUTH | UC-AUTH-06 liên kết phụ huynh | Có, khác SRS | C1 `pending → approved`, consent có version |
| AUTH | UC-AUTH-07 đổi mật khẩu tạm | Có | A1 |
| LRN | UC-LRN-01..04 lộ trình bài, đọc, video, thẻ học | Có | A2; gắn bài giao — Open Learning đổi |
| PRG | UC-PRG-01..03 dashboard, quiz, tiến độ/lịch sử | Có | A1, A3, A5 |
| PRG | UC-PRG-04/05 lưu và mở lại thí nghiệm (Future) | Đã làm sớm | `/saved` (`labs.controller`) |
| CNT | UC-CNT-01..07 soạn bài, upload, rich text, quiz, gắn lab, lifecycle, thẻ học | Có | B1-T4 (publish gate chặt hơn SRS theo D1/D7) |
| CLS | UC-CLS-01..04 lớp, thành viên, giao bài, bảng theo dõi | Có | B1, B2 |
| ADM | UC-ADM-01 quản lý user/môn/lab/asset | Có, khác SRS | C2; xoá → vô hiệu hoá theo D9 |
| ADM | UC-ADM-02 cấu hình tham số mô phỏng | Có | C2-T3 + CF-T4 (hai cơ chế song song — T10) |
| ADM | UC-ADM-03 dữ liệu tối thiểu | Có | seed + NS-11 |
| PAR | UC-PAR-01 xem tiến độ con | Có | C1 |
| PAR | UC-PAR-02, NS-15 báo cáo tuần/tháng | Thiếu (có chủ đích) | D8: không làm; SRS vẫn để câu hỏi mở |
| LAB | UC-LAB-01 sandbox (Future) | Đã làm sớm | "Thực hành tự do", `/simulate`, `POST /attempts` không cần bài giao |
| LAB | UC-LAB-02 dựng mạch | **Một phần** | **Thiếu giới hạn 20 linh kiện** (E1, MSG-20) — không tìm thấy trong FE/sim |
| LAB | UC-LAB-03, 07 tham số, chặn ngoài khoảng | Có | A4 |
| LAB | UC-LAB-04 chạy mô phỏng | **Một phần** | 4a: **không ghi log khi kết quả client ≠ server** (BR-04); 4b: **không có trạng thái "chưa được ghi nhận"/đồng bộ lại** (MSG-22) |
| LAB | UC-LAB-05 thử thách tự chấm | Có | A4 |
| LAB | UC-LAB-08 xem trước client, chấm server | **Một phần** | Tiền điều kiện "client và server cùng version" bị vi phạm (T8) |
| LAB | UC-LAB-06 Lab hoá học 6 phản ứng (R1-later) | Đã làm sớm | Đủ 6 phản ứng (`mg-hcl`, `caco3-hcl`, `naoh-hcl`, `cuso4-naoh`, `nacl-agno3`, `fe-cuso4`) + thí nghiệm pH ngoài SRS; B1 đang đỏ ở bước hoá học |
| 3D | UC-3D-01..07 mô hình mắt (R1-later) | Đã làm sớm | `labs/eye.tsx`: tách lớp (explode), cắt (clip), chế độ quiz, nhãn; chưa đo NFR-03 (tải < 3 s, ≥ 30 fps); NS-16 LOD chưa xác minh |
| 3D | NS-14 kiểm định asset 3D | **Một phần** | `inspectGlb` kiểm glTF 2.0 + JSON + node; **thiếu ngân sách** tam giác 20k–50k, Draco, KTX2 ≤ 2048, LOD0–2 (3.9.3) |
| CV | UC-CV-01..03 điều khiển bằng cử chỉ (Future) | Đã làm sớm | `labs/HandControl.tsx` import động `@mediapipe/tasks-vision`, dùng trong Lab mắt; chưa kiểm NFR-05 (không khung hình nào rời thiết bị) và BR-10 |
| AI | UC-AI-01..04 ngữ cảnh, gợi ý 4 mức, leo mức, HintLog (Future) | Đã làm sớm | `labs/hint.ts` (mức 1–4, provider ngoài transaction, fallback template), `HintLog`; **cần kiểm BR-06** — code tăng mức theo lịch sử gợi ý, SRS chỉ cho leo mức khi học sinh đã đổi `labState` và chạy lại |
| AI | UC-AI-05 phát hiện hiểu lầm | Đã làm sớm | `labs/tutor.ts` `misconceptions()` (3 attempt gần nhất), hiện ở báo cáo giáo viên; BR-09 (không hiện cho học sinh) cần kiểm |
| AI | UC-AI-06..09 tổng hợp lớp, truy vết, chặn ngoài chương trình, rate limit/cache | Chưa xác minh | Không có bằng chứng riêng; cần R.02 |
| AI | Teacher AI Content Assistant (FR-21) | Thiếu | Future |
| NS | NS-13 lưu giữ 12 tháng (Foundation) | **Thiếu** | Không có job |
| NS | NS-17 rebuild/check projection | Có | `progress:check`, `progress:rebuild` |
| CR | CR-01 lỗi một định dạng; MSG-01..47 | **Một phần** | Envelope có (B0-T1); 111 mã, message viết thẳng, không map MSG |
| CR | CR-03 ngày `dd/mm/yyyy`, giờ Việt Nam | Chưa xác minh | — |
| CR | CR-05 xác nhận thao tác phá huỷ | **Một phần** | Hộp xác nhận chỉ thấy ở `classes.tsx` (1) và `AssignedLearning.tsx` (3); admin/assets cần kiểm |
| NFR | NFR-07 Nghị định 13/2023/NĐ-CP (dữ liệu trẻ dưới 16) | Chưa xác minh | Consent phụ huynh có (C1); căn cứ pháp lý cho tài khoản học sinh do trường cấp chưa có tài liệu |
| BR | BR-12 lab chỉ publish sau test theo số liệu SGK + review | Một phần | Golden case có (C2-T3/CF-T4); review chuyên môn có tên chưa có quy trình |
| BR | BR-27 sửa quiz cần revision, attempt giữ đủ bằng chứng | Có | `QuizAttempt.questionSnapshot` |

## 3. Nguyên tắc

1. **Hai đường truy cập** theo SPEC companion §1–2: `shared` (audience + lifecycle + release gate) và `assignment` (lớp + target). Một
   `AccessPolicy` quyết định cho list, detail, attempt và media. Không nới lỏng 29 chỗ kiểm bài giao từng cái.
2. **Không dùng NULL làm ngữ nghĩa.** Tiến độ khoá học, evidence bài giao và luyện tự do có định danh tường minh.
3. **Expand → migrate → contract** cho mọi thay đổi schema; preflight đếm/hash; dữ liệu mơ hồ được báo cáo, không đoán.
4. **Lát dọc theo domain**: mỗi story chuyển domain nó chạm sang khuôn mục 4 trong cùng PR, kèm test đặc tả hành vi trước khi sửa.
5. **Contract trước code**: route mới có Zod schema dùng chung và OpenAPI sinh ra (AD-12) ngay từ PR đầu.
6. **Không ghi lên Supabase dùng chung** khi chưa được duyệt; không sửa PRD/Spine trong plan này — đó là quyết định của PO (mục 8).

## 4. Khuôn kiến trúc đích

```text
BE  <domain>/<domain>.controller.ts   route + @Roles + ZodValidationPipe + @CurrentUser → service; không Prisma
        <domain>.service.ts           use case: transaction, audit, idempotency, gọi AccessPolicy
        <domain>.repository.ts        truy vấn Prisma có tên, select tối thiểu
        <domain>.rules.ts             hàm thuần + unit test (pathway, progress, admin-policy… đã có)
        <domain>.errors.ts            mã + message
    common/access/access-policy.ts    canReadShared, canUseAssignment, canReadAsset — một chỗ quyết định
    packages/contracts                Zod request/response → validation BE, OpenAPI, type FE (tarball có checksum như packages/sim)
FE  features/<domain>/api.ts           gọi API có type từ contracts
        queries.ts                    query key factory + hook; invalidation tập trung
        components/, <Page>.tsx, *.test.ts (Vitest)
```

## 5. Phác thảo dữ liệu và API cho Open Learning (đề xuất cho architecture note N1-2, chưa phải quyết định)

### 5.1 Dữ liệu

| Khái niệm | Đề xuất | Lý do |
|---|---|---|
| Course version | `CourseVersion(id, subjectId, grade, curriculumRef, contentReleaseId?, status)` + `CourseVersionItem(courseVersionId, lessonId | labPackId, required, position)` | Mẫu số cố định (SPEC constraints); tách khỏi `ContentRelease` vì một release có thể chứa nhiều khoá |
| Tiến độ khoá học | Bảng riêng `CourseStepProgress(studentId, courseVersionId, stepId, status, progressValue, lastPosition, visitedCardIds, …)` unique `(studentId, courseVersionId, stepId)` | Không đụng ngữ nghĩa NULL của B2; 32 dòng `StepProgress` NULL giữ nguyên là legacy; luật hoàn thành A2 dùng chung qua `rules` |
| Ngữ cảnh attempt | `QuizAttempt`/`Attempt` thêm `context` (`ASSIGNMENT` / `COURSE` / `FREE_PRACTICE`) + `courseVersionId?`; check constraint khớp context; backfill: có `assignmentId` → ASSIGNMENT, còn lại → FREE_PRACTICE | 37 `Attempt` NULL hiện là luyện tự do; không tự chuyển thành tiến độ khoá học |
| Audience | Enum `Audience { SHARED, TEACHER_PRIVATE }` cho Lesson (map từ `scope` String: `SHARED_LIBRARY` → SHARED) và Lab/pack; lifecycle enum riêng | Companion §1 tách audience khỏi lifecycle |
| Taxonomy Lesson | `Lesson.topicCode` FK `CurriculumTopic` (chapter suy từ topic) + `LessonOutcome` bảng nối; expand: cột nullable, giữ `chapter/topic` text tới khi gán xong | 0/62 lesson map được tự động; gán bằng biên tập |
| Taxonomy Lab | `canonicalTopicCode` FK + `LabOutcome` + `LabRelatedTopic` trên Lab (hoặc `SimulationPackVersion` theo quyết định Q-7) | SPEC: một topic chuẩn + related links, không nhân bản pack |
| Tham chiếu asset | `AssetReference(assetVersionId, ownerType, ownerId)` có index, ghi khi lưu nội dung | Thay `LIKE` quét JSON; cho phép kiểm scope của nội dung tham chiếu |

### 5.2 API (route mới; route bài giao hiện có giữ nguyên)

| Route | Mục đích |
|---|---|
| `GET /catalog/subjects` → `GET /catalog/subjects/:subjectId/grades/:grade` | Chương + số bài + số Lab theo course version |
| `GET /catalog/chapters/:code` | Chủ đề → bài theo thứ tự, trạng thái tiến độ của học sinh |
| `GET /catalog/lessons/:id/pathway` | Pathway shared (không có `assignment`, không khóa) |
| `PUT /catalog/lessons/:id/steps/:stepId/progress` | Ghi `CourseStepProgress` theo luật A2 |
| `GET /catalog/lessons/:id/quiz`, `GET|POST /catalog/lessons/:id/quiz-attempts` | Quiz nền shared; attempt `context = COURSE` |
| `GET /catalog/labs?subject&grade&chapter&topic&outcome&q` | Tab Lab theo môn; cùng quan hệ taxonomy với Lab theo ngữ cảnh |
| `GET /me/course-progress?subject&grade` | Tiến độ khoá học cho hồ sơ/dashboard; tách `/me/progress` (bài giao) |

## 6. Lộ trình

### Giai đoạn 0 — Sửa cái đang sai và dựng nền (tuần 1–2)

| Ticket | Nội dung | Nghiệm thu |
|---|---|---|
| N0-1 | Commit + PR `refactor/project-structure` (BE+FE); rebase stash `feat/textbook-lesson-extract` | Route manifest 140/140; suite như hiện tại |
| N0-2 | **Sửa T9:** `canReadVersion` và `files` kiểm scope/quyền của nội dung tham chiếu; thêm `AssetReference` (expand) và backfill từ nội dung hiện có; bỏ `LIKE` | Test persona: học sinh ngoài lớp không lấy được URL asset của lesson TEACHER_PRIVATE; asset của lesson shared vẫn đọc được; số tham chiếu backfill = số khớp `LIKE` trước đó |
| N0-3 | **Sửa T8:** build lại tarball FE từ `packages/sim`, tăng version; CI so checksum | Checksum khớp; chạy lại B1, ghi nguyên nhân lỗi hoá học |
| N0-4 | **Sửa T11:** thêm `TextbookSource*` vào schema; chốt drift B2 | `prisma migrate diff` rỗng trên DB trắng |
| N0-5 | Làm xanh B1, `test:integration` (fixture tự tạo); phân loại Playwright đỏ | Hai suite xanh trên DB mới và DB cũ |
| N0-6 | CI chạy đủ suite BE (B0, B1, B2, C2, CF, password-flow) + Playwright FE | Mọi PR chạy đủ |
| N0-7 | Nền contract: `packages/contracts`, `ZodValidationPipe`, `@CurrentUser`, error catalog khung, OpenAPI sinh từ schema; field dùng chung hợp nhất; áp mẫu cho `auth` | OpenAPI có schema cho route auth; FE dùng type auth từ contracts |
| N0-8 | Đổi nhãn "Bài đọc" → "Nội dung bài" (2 chỗ FE) | Không đổi ID nội bộ |
| N0-9 | **Cần duyệt:** áp 3 migration CF + contract migration N0-4 lên Supabase dev; dry-run `cf:migrate-assets` | `migrate status` sạch; reconcile asset |
| N0-10 | Chỗ hở SRS nhỏ, sửa ngay: giới hạn 20 linh kiện (T6.01), log lệch kết quả client/server (T6.02), rà hộp xác nhận thao tác phá huỷ (T6.05) | Theo từng task |

### Giai đoạn 1 — Quyết định và hợp đồng (tuần 2–3)

| Ticket | Nội dung | Nghiệm thu |
|---|---|---|
| N1-1 | PO trả lời Q-1..Q-8; ghi decision record được PRD/Spine tham chiếu (người có quyền sửa PRD/Spine thực hiện) | Không còn dòng mâu thuẫn chưa quyết trong assessment §4–5 |
| N1-2 | Architecture note theo mục 5: course version, `CourseStepProgress`, `context` attempt, audience, taxonomy Lesson/Lab, `AccessPolicy`, `AssetReference`; kế hoạch migration expand/migrate/contract cho từng mục | Được duyệt |
| N1-3 | Ma trận test từ companion §7 → API/DB/E2E với persona: không lớp, ngoài lớp, target, non-target, removed/pending, giáo viên chủ, giáo viên khác, admin | Được duyệt |
| N1-4 | **Phụ thuộc dữ liệu:** nhập taxonomy KHTN 8 (chương/chủ đề/outcome từ artifact chương trình chính thức — spec KHTN8 taxonomy), gán topic/outcome cho 62 lesson và 3 Lab; người biên tập chịu trách nhiệm | Báo cáo gán: số đã gán / chưa gán / mơ hồ |
| N1-5 | Sửa tham chiếu tài liệu gãy (assessment §6.6); ghi chú đề xuất đã bị SPEC thay thế ở điểm quiz/thẻ nền | Không còn link gãy |
| N1-6 | Quyết định và tài liệu theo SRS: rà Nghị định 13/2023 (T6.08), kiểu đăng nhập (T6.10), cập nhật SRS sau khi PRD/Spine đổi (T6.11) | Theo từng task |

### Giai đoạn 2 — Open Learning theo lát dọc (tuần 3–9)

| Story | SPEC | Nội dung | Domain chuyển khuôn | Nghiệm thu |
|---|---|---|---|---|
| OL-1 Taxonomy + audience | constraints, CAP-1, CAP-4 | Expand schema: `Lesson.topicCode`, `LessonOutcome`, Lab topic/outcome/related, enum audience; backfill từ N1-4; API taxonomy cho admin dùng | `curriculum` | Không lesson/Lab nào mất dữ liệu; báo cáo dòng chưa gán |
| OL-2 AccessPolicy + đường shared | CAP-1, companion §2 | `AccessPolicy` dùng ở list/detail/attempt/media; pathway shared tách pathway bài giao (`progress/student-access.service` tách hai phần) | `learning`, `progress` | Ma trận companion §2 xanh ở API, kể cả direct-ID và media |
| OL-3 Catalog mở | CAP-1 | `/catalog/*` (mục 5.2) có phân trang/index; FE catalog môn → khối → chương → bài trên khuôn query hook | `lessons`, FE `lessons` | Học sinh không lớp mở bài khác khối; draft/quarantine/rights-blocked/TEACHER_PRIVATE bị chặn; đo p95 catalog |
| OL-4 Course version + tiến độ khoá học | CAP-2 | `CourseVersion`, `CourseStepProgress`, `context` attempt (backfill ASSIGNMENT/FREE_PRACTICE); luật A2 dùng chung; quiz nền tính khi bắt buộc; `/me/course-progress`; hồ sơ + dashboard | `progress` | Reload/đa thiết bị khớp; 32 dòng legacy không đổi; evidence bài giao đếm/hash trước-sau khớp; khoá học không "hoàn thành" khi còn mục bắt buộc chưa phát hành |
| OL-5 Catalog Lab + Lab theo ngữ cảnh | CAP-4 | `/catalog/labs`; chương/chủ đề đang học tự hiện Lab khớp; thay 18 ID cứng bằng registry (AD-14) | `labs` | Hai view cùng quan hệ taxonomy; 0 so khớp tiêu đề; 0 ID lab cứng trong controller |
| OL-6 Hoạt động riêng của giáo viên | CAP-3, CAP-5 | Quiz/thẻ/bài tập/kịch bản Lab do giáo viên tạo là TEACHER_PRIVATE qua bài giao; kịch bản tham chiếu pack/model chung (chọn một trong `challengeParams`/`SimulationConfigVersion`/`SimulationPackVersion`) | `classes` (assignments), `labs` | Non-target bị chặn ở list + direct-ID + media; kịch bản không sửa pack chung |
| OL-7 Hồi quy và nghiệm thu | companion §7 | Checklist 15 mục; hồi quy A2/A3/A4/B1/B2/C1 | — | 15/15; suite cũ xanh |

Song song với OL trong giai đoạn 2: cấp tài khoản hàng loạt (T5.01, SRS P0), trạng thái "chưa được ghi nhận" khi mất mạng (T6.03), và sau R.02:
kiểm BR-06/BR-09 của gợi ý AI (T6.07), đo Lab mắt 3D và điều khiển cử chỉ (T6.09).

Ghi chú phạm vi: luyện Lab tự do đã có (`/labs`, `/simulate`, `POST /attempts` không bắt buộc bài giao), nên OL-5 chủ yếu là taxonomy, catalog và
registry, không phải mở quyền.

### Giai đoạn 3 — Hướng chưa có SPEC (viết SPEC trước khi lập lịch)

| Mục | Nguồn | Phụ thuộc |
|---|---|---|
| Class Space: tài nguyên/file đăng cho lớp, không phải bài giao | Đề xuất (3), (5) | OL-2 (`AccessPolicy`), N0-2 (`AssetReference`) |
| Deck Quizlet theo lớp | Đề xuất (4) | Class Space; Q-4 |
| Ebook locator theo edition | Đề xuất (9) | OL-1; Q-5; pipeline `nexalab-data` chỉ cung cấp ứng viên mapping |
| Ngân sách hiệu năng catalog/video/PDF | Đề xuất (7), QR-09 | Đo baseline khi OL-3 có API |
| Tiến độ khoá học cho phụ huynh/giáo viên | Assessment §4.3 | Q-3 |

### Giai đoạn 4 — Khuôn mới cho phần còn lại (song song giai đoạn 2–3)

| Ticket | Nội dung | Nghiệm thu |
|---|---|---|
| N4-1 | Domain OL không chạm (`users`, `assets`, `content`, `parents`, `reports`, `admin`) sang service/repository + contracts | 0 `this.db` trong controller; route có schema OpenAPI |
| N4-2 | Giảm round-trip attempt có chấm điểm và join (T13) | Số truy vấn và p95 trước/sau, workload 40 HS × 6 bước |
| N4-3 | Hợp nhất T10: `studentIds` → `AssignmentTarget` (7 assignment); `materials/questions` → `LessonStep` (52 lesson); `AssetFile` → `AssetVersion`; một cơ chế version tham số mô phỏng; quyết định `Progress` projection; String → enum | Mỗi mục có preflight và đối chiếu |
| N4-4 | FE: query hook cho mọi feature, tách file lớn, Vitest, CSS theo feature, guard vai trò tập trung (T7) | 0 `api(` trong component; không file > ~400 dòng |
| N4-5 | Tách script tích hợp lớn thành test theo domain trên harness chung | Mỗi file < ~400 dòng; chạy song song được |
| N4-6 | Chỗ hở SRS gắn với domain đang chuyển khuôn: ngân sách asset 3D (T6.04, cùng `assets`), định dạng ngày/giờ (T6.06, cùng FE query hook) | Theo từng task |

### Giai đoạn 5 — Sẵn sàng vận hành (trước pilot)

| Ticket | Nội dung |
|---|---|
| N5-1 | Cấp tài khoản học sinh hàng loạt — **đã kéo lên GĐ2** (T5.01, SRS P0) |
| N5-2 | Job retention 12 tháng có dry-run và audit, gồm evidence khoá học |
| N5-3 | Đối chiếu verdict hàng loạt; telemetry crash tối thiểu không PII |
| N5-4 | Môi trường pilot (BE cùng region DB, Supabase pilot có backup, R2 pilot), migration là bước CI có duyệt, observability |
| N5-5 | Báo cáo chỉ tiêu pilot theo định nghĩa ở Q-2 |

## 7. Thứ tự, phụ thuộc, ước lượng

```text
Tuần 1–2  N0-1..N0-8 (N0-2, N0-3 trước) + N0-10 (T6.01, T6.02, T6.05)      N0-9 khi được duyệt
Tuần 2–3  N1-1 (PO) → N1-2 → N1-3; N1-6 (T6.08, T6.10)                     N1-4 dữ liệu ── chặn nghiệm thu OL-1/3/4/5
Tuần 3–9  OL-1 → OL-2 → OL-3 → OL-4 → OL-5 → OL-6 → OL-7
          song song: T5.01 (tuần 3–5), T6.03 (tuần 3–5), R.02 → T6.07, T6.09
Song song N4-* (gồm T6.04, T6.06), viết SPEC giai đoạn 3; T6.11 sau T1.02; sau OL-7: N5-* (T6.08 phải xong trước T5.05)
```

Ước lượng sơ bộ cho 2–3 dev: giai đoạn 0 khoảng 2 tuần; giai đoạn 1 khoảng 1 tuần phía kỹ thuật (N1-4 tùy năng lực biên tập); giai đoạn 2 khoảng
6–7 tuần; giai đoạn 4 song song 4–5 tuần; giai đoạn 5 khoảng 2–3 tuần. Chốt lại sau OL-2.

## 8. Quyết định cần PO/team

| ID | Câu hỏi | Cần trước | Đề xuất |
|---|---|---|---|
| Q-1 | "Mở cho mọi môn/khối": chỉ KHTN 8–9 đã phát hành hay rộng hơn PRD §1 | OL-3 | KHTN 8–9 qua release gate |
| Q-2 | Chỉ tiêu pilot cho mô hình mới; Lab đại diện đo ở luồng nào | N5-5 | Báo riêng bài giao và khoá học; giữ ≥ 70% cho bài giao; Lab đại diện đo trong bài giao |
| Q-3 | Phụ huynh, bảng giáo viên, cờ hỗ trợ có dùng tiến độ khoá học không | OL-4 | Chưa; giữ C1/B2 theo bài giao |
| Q-4 | Thẻ do giáo viên tạo: bài giao riêng (SPEC) hay tài nguyên lớp (đề xuất) | SPEC Class Space | Bài giao riêng cho tới khi có SPEC Class Space |
| Q-5 | Ebook: chỉ liên kết ngoài hay host PDF có rights record | SPEC ebook locator | Không host PDF SGK khi chưa có quyền (D17) |
| Q-6 | Course version: model mới hay dùng `ContentRelease` | N1-2 | Model mới tham chiếu release |
| Q-7 | Taxonomy Lab gắn vào `Lab` hay `SimulationPackVersion` | N1-2 | `SimulationPackVersion` (AD-14), `Lab` giữ làm điểm vào |
| Q-8 | Ai sửa PRD/Spine cho AD-4, AD-6, §3–4, FR-08..15, §9 | N1-1 | PO hoặc người được PO giao; plan này không sửa |
| Q-9 | Chia sẻ `packages/contracts`: tarball có checksum, npm private, hay monorepo | N0-7 | Tarball có checksum như `packages/sim` |
| Q-10 | Dừng tính năng ngoài Open Learning trong giai đoạn 0–1 | Ngay | Có, trừ sửa lỗi |

## 9. Chỉ số theo dõi

| Chỉ số | Hiện tại | Đích |
|---|---|---|
| Asset của nội dung TEACHER_PRIVATE đọc được bởi người ngoài | có | không (test persona) |
| Engine FE = BE (checksum) | lệch | khớp, kiểm trong CI |
| Suite chạy trong CI | 1 BE | toàn bộ BE + Playwright |
| Lời gọi kiểm bài giao trên đường nội dung shared | 29 | 0 (chỉ còn ở đường bài giao) |
| `this.db.*` trong controller | 232 | 0 |
| `body: unknown` / `req: any` | 61 / 119 | 0 |
| Route có schema OpenAPI | nhóm quiz | toàn bộ |
| ID lab cứng | 18 | 0 |
| `api(` trong component FE | 90 | 0 |
| Lesson có topic FK / Lab có topic chuẩn | 0/62, 0/3 | 62/62, 3/3 |
| Checklist SPEC open-learning | 0/15 | 15/15 |

## 10. Rủi ro

| Rủi ro | Kiểm soát |
|---|---|
| Lộ nội dung/asset riêng khi mở catalog | N0-2 trước OL-2; `AccessPolicy` một chỗ; ma trận persona ở API |
| Trộn tiến độ khoá học với 32 dòng legacy/luyện tự do | Bảng `CourseStepProgress` riêng; `context` attempt tường minh; không backfill legacy thành khoá học |
| Catalog rỗng vì thiếu taxonomy | N1-4 là phụ thuộc có chủ; nghiệm thu OL-1/3/4/5 cần dữ liệu thật, không chỉ fixture |
| Đổi giả thuyết sư phạm làm pilot đo sai | Q-2 trước khi lập lịch pilot |
| Làm lại kỹ thuật kéo dài | Chuyển khuôn theo story; chỉ số ở mỗi PR |
| Quyết định PRD/Spine bị bỏ qua | N1-1 chặn OL-2 trở đi |

## 11. Danh sách task để chia việc

Mục này gom mọi ticket ở mục 6 thành task giao được cho một người. Mỗi task ứng với một PR (hoặc một tài liệu), có tiêu chí xong riêng.

**Quy ước**

- **Vai trò:** `BE` backend, `FE` frontend, `FS` cả hai trong cùng PR, `DATA` biên tập/nội dung, `PO` Product Owner, `ARCH` người viết architecture
  note/SPEC, `OPS` CI/hạ tầng, `QA` kiểm thử.
- **Cỡ:** `S` ≤ 2 ngày, `M` 3–5 ngày, `L` 6–10 ngày. Task `L` nên được tách nhỏ hơn khi bắt đầu.
- **Phụ thuộc:** mã task phải xong trước. Task không có phụ thuộc có thể nhận ngay.
- **Trạng thái ban đầu:** mọi task `todo`. Khi nhận task, ghi tên người và chuyển `in-progress` trong `sprint-status.yaml`.
- **Mọi task code:** có test cho phần đổi; suite liên quan xanh; route manifest không đổi trừ khi task ghi route mới; không ghi Supabase dùng
  chung khi chưa được duyệt.

### 11.1 Giai đoạn 0 — Sửa cái đang sai và dựng nền

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T0.01 | Commit + mở PR `refactor/project-structure` BE và FE | BE, FE | S | — | PR mở, CI xanh như hiện tại |
| T0.02 | Rebase stash `feat/textbook-lesson-extract` lên nhánh mới, đổi import sang `src/infra/*` | BE | S | T0.01 | Nhánh build được, 5 test của tool xanh |
| T0.03 | Viết test persona tái hiện lỗ hổng đọc asset của lesson TEACHER_PRIVATE (đang fail) | BE | S | — | Test đỏ trên code hiện tại |
| T0.04 | Thêm bảng `AssetReference` (expand) + backfill từ `materials`/`LessonStep.config`/`Lab.assets`; báo cáo đối chiếu với kết quả `LIKE` | BE | M | T0.03 | Số tham chiếu backfill = số khớp `LIKE` |
| T0.05 | `canReadVersion` và `GET /files/:id` kiểm scope/quyền của nội dung tham chiếu qua `AssetReference`; bỏ `LIKE` | BE | M | T0.04 | T0.03 xanh; asset của lesson shared vẫn đọc được; C2/CF suite xanh |
| T0.06 | Build lại tarball `packages/sim` cho FE, tăng version, cập nhật `FE vendor/` và `package.json` | FS | S | — | Checksum tarball = source BE |
| T0.07 | Bước CI so checksum `packages/sim` ↔ tarball FE | OPS | S | T0.06 | CI fail khi lệch |
| T0.08 | Chạy lại B1 sau T0.06; sửa hoặc ghi nguyên nhân lỗi "chemistry lab step" | BE | S | T0.06 | B1 xanh hoặc nguyên nhân ghi vào implementation record |
| T0.09 | Thêm `TextbookSource*` vào `schema.prisma`; quyết định nguồn chuẩn cho drift B2; contract migration | BE | M | — | `prisma migrate diff` rỗng trên DB trắng |
| T0.10 | `test:integration`: tự tạo học sinh mật khẩu tạm trong suite thay vì dựa seed hết hạn | BE | S | — | Xanh trên DB mới và DB đã chạy lâu |
| T0.11 | Phân loại 6–8 Playwright đỏ trên main; sửa spec hoặc ghi lý do loại; gồm A1-BUG-001..003 đã ghi trong `AGENTS.md` (mật khẩu/port hardcode trong `a1-acceptance.cjs`, selector sai trong `flagship.spec.ts`) | FE, QA | M | — | Không còn spec đỏ chưa phân loại |
| T0.12 | Quyết định `video-completion` đếm 2 hay 3 request `/files`; sửa test hoặc client | FE | S | — | Spec xanh, quyết định ghi lại |
| T0.13 | CI BE chạy B0, B1, B2, C2, CF, password-flow (Postgres service, mailbox, storage local, giãn cách rate limit) | OPS | M | T0.08, T0.10 | Mọi PR chạy đủ; thời gian CI ghi lại |
| T0.14 | CI FE chạy Playwright với API seed | OPS | M | T0.11, T0.13 | Playwright chạy trên mọi PR FE |
| T0.15 | Tạo `packages/contracts` (Zod) + cơ chế phát hành tarball có checksum sang FE | BE | M | Q-9 | FE import được schema từ contracts |
| T0.16 | `ZodValidationPipe` + `@CurrentUser` + error catalog khung (`<domain>.errors.ts`) dựa trên danh mục SRS MSG-01..47 (CR-01) | BE | M | T0.15 | Dùng được ở một controller mẫu; mã có map tới MSG khi SRS có |
| T0.17 | Sinh OpenAPI từ schema contracts; snapshot OpenAPI trong CI | BE, OPS | M | T0.15 | Swagger có schema cho route đã chuyển; CI so snapshot |
| T0.18 | Hợp nhất field dùng chung (`text`, `username`, `email`, `password`, `reason`, phân trang cursor) vào contracts | BE | S | T0.15 | Không còn định nghĩa trùng trong `src/` |
| T0.19 | Áp mẫu cho domain `auth` (controller/service/repository/contracts) và FE `lib/api.ts` phần auth | FS | M | T0.16, T0.17, T0.18 | 0 `this.db` trong `auth.controller`; FE dùng type auth từ contracts |
| T0.20 | Đổi nhãn "Bài đọc" → "Nội dung bài" (`ebook/ebook.tsx`, `lessons/library.tsx`) | FE | S | — | Playwright liên quan xanh |
| T0.21 | **Cần duyệt:** áp 3 migration CF + contract migration T0.09 lên Supabase dev; dry-run rồi apply `cf:migrate-assets` | BE | S | T0.09, duyệt | `migrate status` sạch; reconcile asset |

### 11.2 Giai đoạn 1 — Quyết định, hợp đồng, dữ liệu

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T1.01 | Trả lời Q-1..Q-10 (mục 8); ghi decision record | PO | S | — | Mỗi câu có quyết định và ngày |
| T1.02 | Cập nhật PRD/Spine theo decision record (AD-4, AD-6, PRD §3–4, FR-08..15, §9) | PO hoặc người được giao | M | T1.01 | Không còn mâu thuẫn trong assessment §4–5 |
| T1.03 | Architecture note Open Learning theo mục 5 (course version, `CourseStepProgress`, `context` attempt, audience, taxonomy Lesson/Lab, `AccessPolicy`) + kế hoạch migration từng mục | ARCH | M | T1.01 | Được duyệt |
| T1.04 | Ma trận test từ companion §7 → API/DB/E2E, 8 persona | QA, ARCH | S | T1.03 | Được duyệt |
| T1.05 | Xác định artifact chương trình KHTN 8 chính thức có version (câu hỏi mở của spec KHTN8 taxonomy) | DATA, PO | S | — | Artifact và version được chốt |
| T1.06 | Nhập chương/chủ đề/outcome KHTN 8 vào taxonomy (qua importer hoặc admin) trên DB local và dev (dev cần duyệt) | DATA, BE | M | T1.05 | Số chương/chủ đề/outcome khớp artifact |
| T1.07 | Gán chủ đề/outcome cho 62 lesson và 3 Lab; báo cáo đã gán/chưa gán/mơ hồ | DATA | M | T1.06, T2.01 | Báo cáo gán được duyệt |
| T1.08 | Sửa tham chiếu tài liệu gãy (`nexalab-fe` → `FE-NexaLab`, UX 09/10 không tồn tại); ghi chú trong đề xuất các điểm đã bị SPEC thay thế | ARCH | S | — | Không còn link gãy |

### 11.3 Giai đoạn 2 — Open Learning

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T2.01 | Schema expand: `Lesson.topicCode` FK, `LessonOutcome`, enum `Audience` + lifecycle; backfill `scope` → audience | BE | M | T1.03 | Preflight/backfill đối chiếu khớp |
| T2.02 | Schema expand cho Lab/pack: topic chuẩn, `LabOutcome`, `LabRelatedTopic`, audience (theo Q-7) | BE | M | T1.03 | Như trên |
| T2.03 | API admin quản lý gán topic/outcome cho lesson và Lab (dùng cho T1.07) | FS | M | T2.01, T2.02 | Admin gán được; audit ghi lại |
| T2.04 | `AccessPolicy` (`canReadShared`, `canUseAssignment`, `canReadAsset`) + unit test theo ma trận T1.04 | BE | M | T1.04, T0.05 | Ma trận unit xanh |
| T2.05 | Tách `StudentAccessService` thành phần shared và phần assignment; pathway shared không cần bài giao | BE | M | T2.04 | Pathway bài giao hiện có không đổi (suite A2/A3 xanh) |
| T2.06 | API `GET /catalog/subjects`, `/catalog/subjects/:id/grades/:grade`, `/catalog/chapters/:code` (phân trang, index) + contracts | BE | M | T2.01, T2.04 | Persona "không lớp" xem được; TEACHER_PRIVATE/draft/quarantine bị chặn |
| T2.07 | API `GET /catalog/lessons/:id/pathway` + quiz nền shared (`GET quiz`, `GET/POST quiz-attempts`, `context = COURSE`) | BE | M | T2.05, T2.10 | Đáp án vẫn ở server; persona test xanh |
| T2.08 | FE trang catalog môn → khối → chương → bài (query hook, contracts) | FE | L | T2.06 | Duyệt được ở 390/768/1024/1440 px |
| T2.09 | FE trang bài học shared dùng pathway shared (không khóa, không bài giao) | FE | M | T2.07, T2.08 | Học sinh không lớp học trọn một bài |
| T2.10 | Schema `CourseVersion`, `CourseVersionItem`, `CourseStepProgress`; `context` + `courseVersionId` cho `QuizAttempt`/`Attempt`; backfill `ASSIGNMENT`/`FREE_PRACTICE` | BE | L | T1.03 | 32 `StepProgress` legacy không đổi; đếm/hash evidence bài giao trước-sau khớp |
| T2.11 | Ghi tiến độ khoá học `PUT /catalog/lessons/:id/steps/:stepId/progress` dùng chung luật A2 trong `rules` | BE | M | T2.10, T2.07 | Reload/đa thiết bị khớp; không ghi trùng |
| T2.12 | `GET /me/course-progress` (môn/khối → chương → chủ đề → bài), không "hoàn thành" khi còn mục bắt buộc chưa phát hành | BE | M | T2.11 | Khớp tay trên fixture |
| T2.13 | FE tiến độ khoá học ở hồ sơ và dashboard, tách tiến độ bài giao | FE | M | T2.12 | Hai màn khớp nhau sau reload |
| T2.14 | Lab registry thay 18 ID cứng (`circuit`/`chemistry`/`eye`) bằng tra cứu pack/model | BE | M | T2.02 | 0 ID lab cứng trong controller; A4/B1 xanh |
| T2.15 | API `GET /catalog/labs?subject&grade&chapter&topic&outcome&q` | BE | M | T2.02, T2.04 | Lọc theo cùng quan hệ taxonomy |
| T2.16 | FE tab Lab theo môn + Lab theo chương/chủ đề đang học, route Lab ổn định | FE | M | T2.15, T2.08 | Hai view ra cùng kết quả; 0 so khớp tiêu đề |
| T2.17 | Quiz/thẻ/bài tập do giáo viên tạo là TEACHER_PRIVATE qua bài giao (BE quyền + FE soạn/giao) | FS | L | T2.04 | Non-target bị chặn ở list, direct-ID, media |
| T2.18 | Kịch bản Lab riêng của giáo viên tham chiếu pack/model chung; chọn một cơ chế version tham số | FS | L | T2.14, T2.17 | Kịch bản không sửa được pack chung; attempt pin version |
| T2.19 | Chạy checklist companion §7 + hồi quy A2/A3/A4/B1/B2/C1; ghi implementation record | QA | M | T2.09, T2.13, T2.16, T2.18 | 15/15; suite cũ xanh |
| T2.20 | Contract migration: bỏ cột `scope` String và `chapter`/`topic` text sau khi mọi đọc/ghi đã chuyển | BE | S | T2.19, T1.07 | Preflight không còn dòng dùng cột cũ |

### 11.4 Giai đoạn 3 — Viết SPEC cho hướng chưa có SPEC

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T3.01 | SPEC Class Space (tài nguyên/file đăng cho lớp, không phải bài giao; share tách assign; quyền theo thành viên) | ARCH, PO | M | T1.01 (Q-4), T2.04 | SPEC duyệt, có ma trận persona |
| T3.02 | SPEC deck Quizlet theo lớp (soạn thủ công trước, AI sau) | ARCH, PO | S | T3.01 | SPEC duyệt |
| T3.03 | SPEC ebook locator theo edition (trang in tách chỉ số PDF, chỉ nhảy khi đã xác minh) | ARCH | M | T1.01 (Q-5), T2.01 | SPEC duyệt |
| T3.04 | Đo baseline hiệu năng catalog, chi tiết bài, video bắt đầu phát, trang PDF đầu tiên, dung lượng truyền; đề xuất ngân sách | BE, FE | M | T2.06 | Bảng số đo + ngân sách được duyệt |
| T3.05 | SPEC tiến độ khoá học cho phụ huynh/giáo viên (nếu Q-3 chọn có) | ARCH | S | T1.01 | SPEC duyệt hoặc ghi "không làm" |

### 11.5 Nghiên cứu chức năng (đầu vào để bổ sung task sau)

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| R.01 | Kiểm kê chức năng hiện có theo vai trò (học sinh, giáo viên, phụ huynh, admin): dùng thử app với tài khoản seed ở 390/1440 px, ghi lỗi chức năng/UX/chỗ thiếu có mức ưu tiên | QA, FE | M | — | Bảng kiểm kê; lỗi mới thành task |
| R.02 | Kiểm kê chức năng Future/R1-later đã làm sớm (mục 2.3): AI hint/tutor so UC-AI-01..09 (đặc biệt BR-06, BR-09, UC-AI-08/09); điều khiển cử chỉ `HandControl.tsx` (NFR-05, BR-10); Lab mắt 3D (NFR-03, NS-16); Lab hoá học + pH; sandbox; lưu thí nghiệm | BE, FE | M | — | Mỗi mục có kết luận: giữ (viết acceptance), hoàn thiện, hay tắt sau feature flag |
| R.03 | Tham khảo UX cho Class Space, deck, catalog Lab (Google Classroom, Quizlet, PhET) | FE, ARCH | S | — | Ghi chú đính kèm T3.01–T3.02 |
| R.04 | Luồng sản xuất nội dung: nối pipeline OCR `nexalab-data`, stash textbook-lesson-extract, crawler NXBGD/seed chương 1 với importer Content Foundation và taxonomy (trong ranh giới D17) | DATA, BE | M | T1.05 | Sơ đồ luồng + danh sách task nội dung |

### 11.6 Giai đoạn 4 — Khuôn mới cho phần còn lại

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T4.01 | `users` sang service/repository + contracts | BE | M | T0.19 | 0 `this.db` trong controller; route có schema |
| T4.02 | `assets` sang khuôn mới | BE | M | T0.19, T0.05 | Như trên |
| T4.03 | `content` sang khuôn mới | BE | M | T0.19 | Như trên |
| T4.04 | `parents`, `reports`, `admin` sang khuôn mới | BE | M | T0.19 | Như trên |
| T4.05 | `classes` (classes, enrollments; phần assignments làm trong T2.17) sang khuôn mới | BE | M | T0.19 | Như trên |
| T4.06 | Giảm round-trip attempt có chấm điểm và join | BE | M | T2.14 | Số truy vấn và p95 trước/sau, workload 40 HS × 6 bước |
| T4.07 | `studentIds` → chỉ `AssignmentTarget` (7 assignment trên dev) | BE | S | T4.05 | Đếm target trước/sau khớp |
| T4.08 | `materials/questions` JSON → chỉ `LessonStep` (52 lesson); bỏ `materializeLegacySteps` | BE | M | T2.05 | Pathway/quiz/evidence không đổi |
| T4.09 | `AssetFile` → `AssetVersion`; `files` chỉ còn adapter | BE | S | T0.21 | Reconcile số file/checksum |
| T4.10 | Field status/scope/contentType String còn lại → enum | BE | M | T2.20 | Preflight không có giá trị lạ |
| T4.11 | Quyết định và thực hiện `Progress` projection (giữ + `progress:check` trong CI, hoặc bỏ) | BE | S | T2.12 | Quyết định ghi lại; drift = 0 |
| T4.12 | FE: query hook cho các feature còn lại (admin, classes, ebook, progress, labs, saved) | FE | L | T0.19 | 0 `api(` trong component |
| T4.13 | FE: tách `Admin.tsx`, `classes.tsx`, `ebook.tsx`, `Lessons.tsx`, `Dashboard.tsx`, `progress.tsx` | FE | L | T4.12 | Không file > ~400 dòng |
| T4.14 | FE: Vitest cho logic thuần + chạy trong CI | FE, OPS | S | — | Có test trong CI |
| T4.15 | FE: CSS theo feature; guard vai trò tập trung; gỡ phụ thuộc thật sự không dùng (`zod` ở FE; giữ `@mediapipe/tasks-vision` vì `HandControl.tsx` import động) | FE | M | R.02 | `styles.css` chỉ còn token/layout chung |
| T4.16 | Tách script tích hợp lớn thành test theo domain trên harness chung | BE, QA | L | T0.13 | Mỗi file < ~400 dòng; chạy song song được |

### 11.7 Giai đoạn 5 — Sẵn sàng vận hành

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Xong khi |
|---|---|---|---|---|---|
| T5.01 | Cấp tài khoản học sinh hàng loạt (SRS UC-AUTH-02 **P0**, SC-21, 3.2.6): CSV/nhiều dòng, dry-run, kết quả từng dòng, idempotent, mật khẩu tạm hiển thị một lần. **Làm sớm ở GĐ2 (tuần 3–5)** vì là P0 | FS | M | T0.19 | 80 học sinh một thao tác; dòng lỗi không chặn dòng khác; chạy lại không trùng |
| T5.02 | Job retention 12 tháng (SRS NS-13 Foundation, BR-22, BR-29) có dry-run và audit, gồm evidence khoá học | BE | M | T2.10 | Test với thời gian giả lập |
| T5.03 | Đối chiếu verdict hàng loạt theo version đã pin | BE | S | T2.14 | 0 mismatch trên dữ liệu test |
| T5.04 | Telemetry crash tối thiểu, không PII | FS | M | Q-2 | Tính được tỉ lệ phiên không crash |
| T5.05 | Hạ tầng pilot: BE cùng region DB, Supabase pilot có backup, R2 pilot, secret manager | OPS | L | PO chọn hosting | Hai môi trường tách biệt |
| T5.06 | Pipeline deploy: migration là bước CI có duyệt, preflight, smoke test, rollback | OPS | M | T5.05 | Deploy lặp lại được |
| T5.07 | Observability: log có request id (redact), error reporting, uptime, cảnh báo | OPS | M | T5.05 | Lỗi giả lập hiện trên dashboard < 5 phút |
| T5.08 | Báo cáo chỉ tiêu pilot theo Q-2 | BE | M | T2.12, Q-2 | Số khớp kiểm tay; drill-down tới evidence |

### 11.8 Task bổ sung từ SRS v1.1 (mục 2.3)

Các task này được xếp vào giai đoạn ở cột "Giai đoạn" và đã nằm trong lộ trình mục 6–7; mã giữ nguyên `T6.xx` để dễ truy vết về SRS.

| Mã | Task | Vai trò | Cỡ | Phụ thuộc | Giai đoạn | Xong khi |
|---|---|---|---|---|---|---|
| T6.01 | Giới hạn 20 linh kiện trên canvas mạch điện, cấu hình theo bài (UC-LAB-02 E1, MSG-20); chặn ở cả client và server | FS | S | T0.06 | GĐ0 · tuần 2 | Linh kiện thứ 21 bị chặn với thông báo; server từ chối `labState` vượt giới hạn |
| T6.02 | Ghi log khi kết quả xem trước client khác kết quả server (UC-LAB-04 4a, BR-04) — client gửi digest preview, server so và ghi | FS | S | T0.06 | GĐ0 · tuần 2 | Lệch có log/metric; không ảnh hưởng verdict |
| T6.03 | Trạng thái "chưa được ghi nhận" khi mất mạng, giữ `labState`, gửi lại cùng idempotency key (UC-LAB-04 4b, MSG-22, CR-12) | FE | M | — | GĐ2 · tuần 3–5 | Mất mạng không mất bài; gửi lại không tạo attempt trùng |
| T6.04 | Kiểm định ngân sách asset 3D: tam giác 20k–50k/scene, Draco, texture ≤ 2048 KTX2/Basis, LOD0–2, một node mỗi bộ phận (NS-14, 3.9.3, MSG-38) | BE | M | T4.02 | GĐ4 | Asset vượt ngân sách bị chặn publish với lý do |
| T6.05 | Rà CR-05: mọi thao tác xoá/lưu trữ/xoá thành viên/vô hiệu hoá có hộp xác nhận (MSG-41) — Admin, assets, classes, lessons | FE | S | — | GĐ0 · tuần 1–2 | Danh sách thao tác phá huỷ và trạng thái xác nhận; chỗ thiếu được sửa |
| T6.06 | Rà CR-03 định dạng ngày/giờ (`dd/mm/yyyy`, `HH:mm`, giờ Việt Nam) trên toàn FE | FE | S | — | GĐ4 (cùng T4.12) | Một helper định dạng dùng chung |
| T6.07 | Kiểm BR-06 (chỉ leo mức gợi ý sau khi đổi `labState` và chạy lại) và BR-09 (hiểu lầm không hiện cho học sinh) trong `hint.ts`/`tutor.ts` | BE | S | R.02 | GĐ2 · sau R.02 | Test cho cả hai quy tắc |
| T6.08 | Rà NFR-07 (Nghị định 13/2023/NĐ-CP) và NFR-06: căn cứ thu thập dữ liệu học sinh do trường cấp, consent, tối thiểu hoá dữ liệu; lập danh sách việc cần làm | PO, BE | M | — | GĐ1 · xong trước T5.05 | Tài liệu rà soát được PO/pháp lý duyệt |
| T6.09 | Đo NFR-03 cho Lab mắt 3D (tải < 3 s ở 10 Mbps, ≥ 30 fps đồ hoạ tích hợp) và NFR-05 cho điều khiển cử chỉ (không khung hình rời thiết bị) | FE, QA | S | R.02 | GĐ2 · sau R.02 | Số đo + kiểm network không có dữ liệu ảnh |
| T6.10 | Quyết định đăng nhập một ô "có `@` là email" (SRS 3.2.1) hay giữ endpoint theo vai trò; ghi vào SRS | PO | S | — | GĐ1 · tuần 2 | Quyết định ghi lại |
| T6.11 | Cập nhật SRS v1.1 theo các quyết định B/C (D8, D9, D10), Open Learning sau khi PRD/Spine đổi, entity `Subject` theo taxonomy KHTN, tên repo | PO hoặc người giữ SRS | M | T1.02 | GĐ1 · sau T1.02 | SRS không còn mâu thuẫn trong assessment mục 7 |

### 11.9 Gợi ý chia việc cho 3 người

**Tuần 1–2**

| Người | Task |
|---|---|
| Dev 1 (BE) | T0.01 → T0.03 → T0.04 → T0.05, rồi T0.09 |
| Dev 2 (FS) | T0.06 → T0.07 → T0.08 → T6.01 → T6.02, T0.20, rồi T0.15 → T0.16 |
| Dev 3 (FE/QA/OPS) | T0.10, T0.11, T0.12, T6.05 → T0.13 → T0.14 |
| PO / DATA | T1.01, T1.05, T1.08, T6.08, T6.10; R.01, R.02 làm song song |

**Tuần 3–4** (giả định T1.01 và T1.03 đã xong)

| Người | Task |
|---|---|
| Dev 1 (BE) | T0.17 → T0.18 → T2.01 → T2.02 → T2.04 |
| Dev 2 (FS) | T0.19 → T5.01 (cấp tài khoản hàng loạt, SRS P0) |
| Dev 3 (FE/QA/OPS) | T1.04 (cùng ARCH), T6.03, T4.14; sau R.02: T6.09 |
| PO / DATA / ARCH | T1.02, T1.03, T1.06 → T1.07, T6.11; BE nhận T6.07 khi R.02 xong |

Tổng: 21 task giai đoạn 0, 8 task giai đoạn 1, 20 task giai đoạn 2, 5 task giai đoạn 3, 4 task nghiên cứu, 16 task giai đoạn 4, 8 task giai đoạn 5,
11 task bổ sung từ SRS (11.8, đã xếp vào giai đoạn) — 93 task.
