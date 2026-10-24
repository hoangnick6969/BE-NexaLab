# NexaLab Content Tool — Master Plan MVP v3

> **Trạng thái:** Hợp đồng scope đã đồng bộ ngày 2026-10-22; luồng book-to-Lesson chưa hoàn tất.  
> **Pilot:** Import sách trong UI → OCR/review local → biên soạn Lesson trong UI → BE plan → release và kiểm tra student pathway sau khi các gate được xác minh.

## 1. Hướng sản phẩm

Xây Content Tool thành repository độc lập, chạy cục bộ, có local web UI tập trung vào review, CLI cho xử lý lặp lại và workspace dạng file. Tool trích xuất nguồn đã được phép xử lý, giữ evidence, hỗ trợ duyệt và xuất package. NexaLab BE xác thực, lưu, materialize, release và phục vụ nội dung. Tool không ghi trực tiếp Supabase, không giữ production credential và không phải service chạy thường trực.

Pilot ưu tiên một operator và nội dung Lesson. Course/package release vẫn là snapshot có nhiều `ContentPackVersion`; apply phải atomic và idempotent. Các ràng buộc chống publish cạnh tranh, stale-base và rollback được hoãn tới sau khi Lesson pilot hoạt động.

Lab Authoring là hướng mở rộng, không phải điều kiện cho Lesson pilot. Nếu tới bước Lab, bản đầu chỉ cần JSON versioned và CLI chạy validator/golden cases. Chỉ làm UI hoặc mở rộng simulation engine khi kết quả pilot chứng minh cần.

## 2. Gate và công việc tách biệt

| Gate | Cần trước khi | Điều kiện |
|---|---|---|
| Quyền xử lý mẫu | Extraction spike | Được phép đọc/xử lý cục bộ; không cần quyền gửi Gemini |
| Quyền gửi Gemini | Bật Gemini | Quyết định rõ dữ liệu được gửi, retention và cấu hình dịch vụ |
| Reviewer và rights owner | Duyệt/phát hành nội dung | Có người chịu trách nhiệm editorial, subject, source rights và accessibility; Lab cần thêm science/safety review |
| Curriculum authority | Gán mã chính thức | Authority/version xác định cho chapter/topic/outcome |
| Environment và recovery | Mọi DB/R2 mutation | Supabase project, `APP_ENV`, R2, quyền/grant/RLS được xác minh; backup restore được |

**Ưu tiên riêng trước đầu tư thêm vào Content Tool:** xác minh production `studentFacing=false` cho 47 chunk và Supabase access/RLS; xử lý lỗi `StepProgress`; sửa mapping trang in với `pdfPageIndex`/số trang PDF. Đây là workstream riêng, không được coi là đã hoàn thành nếu chưa kiểm chứng trên môi trường tương ứng.

## 3. Sản phẩm tối thiểu

### 3.1 Extraction spike và Review Workbench

- Operator import PDF trong UI; workspace hỗ trợ nhiều sách, hash/version và resume. UI cho chạy mẫu phân tầng trước hoặc full book, chọn tier, và hiển thị trạng thái theo chặng/page count khi engine cung cấp; không giả lập phần trăm.
- Dùng PyMuPDF cho phân loại/native text và **MinerU local** cho trang scan/layout. KHTN 8 đã benchmark MinerU 4.0.12; phiên bản/runtime/model phải được kiểm tra và pin. Spike không gửi trang ra ngoài.
- Hiển thị trang/crop cạnh block OCR; cho sửa/chấp nhận/đánh dấu cần sửa và ghi action, elapsed time, source/result hash. Không yêu cầu hoặc lưu tên reviewer cho OCR QA. Đây không phải baseline approval.
- Tạo tín hiệu lỗi/uncertain blocks để tập trung review; thử uncovered-ink heuristic trên mẫu và giữ lại chỉ khi hữu ích. CER/WER chỉ tính khi có gold/native text phù hợp. Công thức/bảng/hình giữ source crop khi cấu trúc không chắc.
- Gemini có thể đề xuất sửa LaTeX/công thức cho block được operator chọn. Giữ original/proposal, hiển thị diff và chỉ thay output khi operator áp dụng. Tắt mặc định cho tới khi quyền truyền source và policy retention/training/region được phê duyệt; manual edit luôn dùng được.

### 3.2 Lesson authoring

Author 2–3 Lesson đầu trong UI, không đòi operator tự viết JSON: stable package/lesson/question/option key, source locator, outcome, `curriculumChapterCode`, `curriculumTopicCode`, `curriculumOrder`, media và basic exercises. UI lưu draft local, chỉ export khi các trường/evidence cần thiết đủ. Chưa xây CMS tổng quát. `ContentPackVersion.manifest` là nội dung chuẩn; BE materialization phải giữ question/option ID. Exercise phải map vào BASIC_EXERCISE, không thành public QUIZ.

### 3.3 Publishing & NexaLab Integration

Pilot dùng BE **`plan`** (dry-run, validation, diff và blocker) và **`apply`** (import/publish). UI có thể hiển thị kết quả `plan`; apply vẫn đi qua đường CLI BE hiện có, không thêm Publishing Console/apply HTTP route.

- BE cấp presigned R2 upload; xác minh byte, MIME, size, hash, quyền và ownership trước khi resolve `AssetVersion` READY.
- Package là full course snapshot, có mọi pack được giữ lại; omission không xóa pack. Retirement phải khai báo rõ.
- `ContentRelease` đại diện cho course/package và `ContentReleaseItem` tham chiếu nhiều immutable `ContentPackVersion`.
- BE kiểm tra authenticated operator thật, source version, rights, review, curriculum, asset và renderer/Lab compatibility. Không tin `--approved-by` hay `reviewed=true` tự khai.
- Pilot chỉ có một operator, chạy tuần tự. `apply` là một transaction nguyên tử; cùng idempotency key + digest là no-op/trả receipt cũ, cùng key khác digest là conflict.
- Release được chọn theo environment/package, không dựa riêng vào global `ContentPackVersion.status`.

### 3.4 Foundational Lab — chỉ sau Lesson pilot

Gemini có thể phân tích outcome và dữ liệu khoa học sau khi quyền gửi được xác nhận; đây là đề xuất, không phải phê duyệt. Người thiết kế chọn model có sẵn, cấu hình trong capability hiện hành, xây independent reference case và chạy server golden case. Reviewer khoa học/safety duyệt trước khi phát hành.

Pilot Lab, nếu đáng làm, là file JSON versioned + CLI validate/run golden cases, ánh xạ vào `PracticalActivityVersion`, `SimulationPackVersion` và `Lab` hiện có. Không làm Studio UI. Circuit engine hiện tại giới hạn một nguồn 1–24V, LED drop cố định và các nhánh độc lập; tại Phase Lab phải đánh giá lại xem giới hạn này có đủ giá trị sư phạm. Nếu không, hoãn Lab hoặc đề xuất engine project riêng.

## 4. Contract và thay đổi dữ liệu tối thiểu

Package đầu chỉ cần manifest, sources, curriculum, lessons, media, review report và asset files; `labs.json` chỉ có khi Lab pilot được chọn. File và asset có SHA-256; stable IDs không phụ thuộc wording/page offset. BE là validator có thẩm quyền. Không xây hai validator độc lập mặc định: chỉ thêm fixture cross-language nếu thực tế phải duy trì hai schema implementation.

Giữ các domain table hiện có. Migration pilot giới hạn ở course/package release boundary:

- `ContentRelease`: thêm `packageId`, `idempotencyKey` và authenticated initiator/approver relation cần thiết.
- `ContentReleaseItem`: thêm typed `packKey`, `packVersionNumber` và composite FK tới version hiện có.
- Enforce pack key không lặp trong một release. Giữ các field legacy (`kind/refId/action`) cho tới khi consumer reconcile.
- Backfill release cũ vào explicit legacy namespace; không suy đoán course từ display name.
- Không thêm `ContentCourse`, `ContentChapter`, OCR/LLM, release hoặc Lab table mới.
- Không migration question/option ID hay curriculum ordering; sửa materialization dùng đúng dữ liệu hiện có.

Sau pilot mới cân nhắc `expectedBaseReleaseId`, package lock, partial unique active head, rollback target/receipt và các constraint concurrency. Chỉ cần chúng trước khi mở cho nhiều operator hoặc yêu cầu rollback vận hành.

## 5. Kế hoạch theo thứ tự

Các mốc trước đây chia phần kỹ thuật theo thành phần, khiến OCR spike/UI import, pack CLI và pathway được mô tả như có thể nghiệm thu riêng. Chúng chưa cùng tạo thành luồng người dùng hoàn chỉnh. Từ bản này, M1 là một vertical flow từ PDF đến package được BE chấp nhận; các phần đã có chỉ được tái sử dụng sau khi tích hợp theo thứ tự dưới đây.

| Mốc | Luồng | Đạt khi |
|---|---|---|
| **M0a — OCR feasibility** | Benchmark MinerU local trên KHTN 8, sample phân tầng, source/hash/runtime, OCR Workbench | **Xong cho feasibility một sách:** MinerU standard, mẫu 20/200 trang chạy end-to-end qua UI. Chưa có human review-time calibration/gold-text CER-WER; không phải book-to-Lesson. |
| **M1 — Local book-to-Lesson workflow** | Import PDF → stage progress/resume → native text/MinerU sample/full → OCR correction → optional rights-gated Gemini LaTeX proposals → Lesson authoring UI → stable evidence/IDs → deterministic export → BE plan | Operator tạo 2–3 Lesson từ nguồn được phép trong UI, không sửa manifest JSON bằng tay; package có evidence/IDs đúng và BE `plan` không blocker. Manual flow chạy khi Gemini tắt. |
| **M2a — Pack/pathway integration** | `basicExercises` schema/mapping và student pathway | Code hiện có; kiểm chứng end-to-end bằng Lesson do M1 UI tạo, IDs giữ nguyên, exercise không khóa bước sau, QUIZ/assignment không đổi. |
| **M2b — Release** | BE CLI plan/apply tới database đã xác minh | Rights/review/approver gates đúng, apply atomic, cùng digest trả receipt cũ; không suy target từ tên môi trường. |
| **M3 — Staging E2E** | 2–3 Lesson qua Open Curriculum, attempts và version update | FE phục vụ Lesson đúng; student mở/hoàn thành pathway; version cũ/attempt được bảo toàn; retry không duplicate. |

#### Cách đo OCR và review

Không đặt `H_review_max`. Giảm review effort bằng sample phân tầng, gắn cờ block khó, cải thiện layout/OCR và theo dõi thời gian/rework thực tế. Chỉ ngoại suy khi operator đã review mẫu; không dùng agent time hoặc tên reviewer giả. KHTN 8 là sách đầu tiên; sách kế tiếp được import sau.

#### Release approval và quyền

Tên reviewer không thuộc OCR Workbench. Formal release review/authentication vẫn theo BE contract hiện hành; không dùng local OCR action thay subject, rights, accessibility hay approver approval. Source chỉ có quyền xử lý cục bộ thì chỉ chạy local; không gửi Gemini hoặc publish cho đến khi quyền tương ứng được xác nhận.

### Sau pilot: hardening có điều kiện

Trước khi có nhiều operator hoặc concurrent publishing, thêm stale-base, lock/unique active head và test cạnh tranh. Thêm rollback dạng release mới có rights/compatibility revalidation khi có nhu cầu khôi phục vận hành. Chưa cần các phần này để chứng minh Lesson pilot.

### Bước 6 — Quyết định Lab, rồi legacy transition

Đánh giá giá trị sư phạm của Lab circuit hiện có. Nếu có, thử JSON + CLI và review độc lập; UI/engine mới là quyết định riêng. Sau khi replacement được nghiệm thu, vô hiệu hóa legacy writer, giữ dữ liệu/migrations cho reconciliation. Cleanup phá hủy nằm ngoài pilot.

## 6. Verification tối thiểu

| Thời điểm | Kiểm tra |
|---|---|
| Import/OCR | PDF metadata/hash, chọn sample/full, MinerU version/tier, stage state, resume, trang/block traceability, lỗi encoding và OCR timeout |
| Review/AI assist | OCR edits/history/time without identity; Gemini off when gated; LaTeX proposals preserve original and require explicit operator apply |
| Lesson package | 2–3 UI-authored Lessons, stable IDs, source evidence, curriculum codes, exercise mapping; BE `plan` blockers and deterministic re-export |
| Package/import | Hash và reference hợp lệ, source version/rights/review, curriculum code/order, stable question/option IDs, dry-run không ghi, cùng key/digest retry no-op, key/digest conflict |
| Staging Lesson | FE hiển thị đúng, asset access, scoring attempt, import lặp không nhân đôi |
| Lab nếu chọn | Unsupported config bị từ chối, independent reference cases, golden mismatch block, science/safety review, renderer binding và version pin |
| Hardening sau pilot | Stale base, concurrent apply, một active head, rollback/revalidation, lịch sử attempt không đổi |

## 7. Ranh giới để tránh over-engineering

Trong pilot không làm CMS nhiều người, workflow engine tổng quát, realtime editing, dashboard phân tích, Publishing Console UI, Lab Studio UI, Gemini bắt buộc, hai bộ validator độc lập, engine mô phỏng mới, concurrent publishing hoặc destructive legacy cleanup. Stage tracker cho tiến độ một sách và Lesson editor hẹp là phạm vi cần thiết của user flow, không phải dashboard/CMS tổng quát.

Đầu tư UI cho import/progress, review evidence và Lesson authoring; đây là các bước người dùng phải đi qua để hoàn thành luồng. Dùng CLI BE cho `plan`/`apply`; dùng JSON + CLI cho Lab nếu tới bước đó. Giữ atomicity, idempotency, authenticated operator và dry-run vì chúng là ranh giới an toàn trực tiếp của phát hành; hoãn cơ chế bảo vệ cạnh tranh và rollback tới sau pilot.

## 8. GO / NO-GO

Extraction spike chỉ GO nếu mẫu được phép xử lý cục bộ, engine/configuration có so sánh chất lượng/tốc độ và review có traceability. Theo chỉ đạo hiện tại, không yêu cầu `H_review_max` cố định. Gemini không phải điều kiện.

Lesson pilot chỉ GO nếu rights/reviewer/curriculum owner đã được chỉ định, environment/recovery/RLS/R2 được xác minh trước mutation, `plan` không ghi, authenticated `apply` nguyên tử và idempotent, đồng thời FE hiển thị đúng Lesson với IDs/taxonomy/media/scoring đúng.

Lab GO là quyết định riêng sau Lesson pilot; model không đủ giá trị hoặc chưa được kiểm chứng thì hoãn Lab, không mở rộng engine trong phạm vi Content Tool.
