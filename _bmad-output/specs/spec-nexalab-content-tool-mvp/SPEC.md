---
id: SPEC-nexalab-content-tool-mvp
companions:
  - master-plan.md
  - architecture-diagrams.md
sources:
  - C:/Users/FPT/Downloads/NexaLab_Content_Tool_Master_Plan_MVP.md
---

> **Hợp đồng chuẩn.** Đọc SPEC cùng hai companion. Bản kế hoạch cũ chỉ dùng để truy vết.

# NexaLab Standalone Content Tool MVP

## Why

Operator cần một ứng dụng cục bộ dễ dùng để nhập sách, trích xuất và sửa OCR, biên soạn Lesson có nguồn gốc rõ ràng, rồi đưa package qua backend NexaLab để kiểm tra và phát hành. OCR, Gemini và biên tập chạy trong Tool; BE là nguồn sự thật cho schema, quyền, persistence, release và serving.

## Capabilities

- **CAP-1 — Import và traceability:** Import nhiều PDF vào workspace riêng, nhận diện trang có native text và trang scan, giữ source/version/hash, số trang PDF vật lý, nhãn trang in và vùng nguồn cho nội dung được dùng. **Đạt khi:** mọi block/claim trong Lesson truy ngược được về PDF, trang, vùng, phương pháp và hash.
- **CAP-2 — OCR Workbench:** Chạy extraction cục bộ, xem trang cạnh text/layout, sửa block, chấp nhận hoặc đánh dấu cần sửa; lưu lịch sử, thời gian và hash mà không hỏi/ghi tên reviewer. **Đạt khi:** operator có thể import, review và khôi phục phiên làm việc local; review OCR không bị nhầm là phê duyệt phát hành.
- **CAP-3 — Lesson authoring:** Biên soạn và sửa Lesson trong UI với stable IDs, source evidence, outcome/curriculum mapping, nội dung và basic exercises. **Đạt khi:** không cần tự sửa JSON; export tạo manifest deterministic mà BE `plan` chấp nhận khi package hợp lệ.
- **CAP-4 — Foundational Lab sau Lesson pilot:** Có thể dùng Gemini đề xuất phân tích khoa học; designer cấu hình model hiện có và tạo test case. **Đạt khi:** nếu Lab được chọn, JSON/CLI validation, golden cases, renderer/version pin và science/safety review đều đạt trước phát hành.
- **CAP-5 — Media và publishing:** Quản lý media theo AssetVersion, xem BE plan/diff, sửa blockers và gọi đường apply BE được hỗ trợ. **Đạt khi pilot:** apply qua BE là atomic/idempotent và chỉ chạy trên target đã xác minh với quyền/review hợp lệ.
- **CAP-6 — Package contract:** Tool export đúng contract/version hiện hành và giữ IDs, hashes, references. **Đạt khi:** fixtures hợp lệ/không hợp lệ được BE validator phân loại đúng; không duy trì validator tổng quát thứ hai.
- **CAP-7 — Backend release an toàn:** NexaLab BE xác thực, materialize, release và serve nội dung; Tool không kết nối DB trực tiếp. **Đạt khi pilot:** dry-run không ghi, apply có operator identity thật, atomicity và idempotent receipt.
- **CAP-8 — Legacy transition:** Thay đường ingest cũ sau khi đường mới được nghiệm thu. **Đạt khi:** compatibility đã kiểm tra và dữ liệu/attempt chưa reconcile vẫn được bảo toàn.
- **CAP-9 — Pipeline progression:** UI hiển thị trạng thái theo từng sách từ import, extraction, OCR, review, authoring, validation, plan, apply tới verified; giữ checkpoint để mở lại workspace và nêu lỗi/blocker ở đúng bước. **Đạt khi:** không báo hoàn tất bước sau khi bước trước chưa đạt; tách pipeline status khỏi student/course progress.
- **CAP-10 — Gemini LaTeX assistance:** Khi được bật hợp lệ, đề xuất sửa LaTeX/công thức từ block được chọn, giữ bản gốc và cho operator xem/áp dụng/sửa/bỏ đề xuất. **Đạt khi:** không tự ghi đè OCR, tự duyệt hay phát hành; mặc định tắt cho tới khi quyền gửi và cấu hình provider được xác nhận.

## Constraints

- Tool là ứng dụng local có UI, CLI và file workspace; không chứa production credentials, không ghi DB trực tiếp, không chạy như service thường trực.
- Dùng MinerU local; spike KHTN 8 đã benchmark phiên bản 4.0.12. Runtime/model phải được pin và kiểm tra phiên bản; MinerU là cài đặt local riêng, không ngầm coi đã được đóng gói cùng Python package.
- Mẫu phân tầng dùng để kiểm tra trước; operator có thể chạy full PDF. OCR output không tự chảy vào Lesson nếu chưa qua bước review/chỉnh sửa.
- OCR Workbench không thu danh tính reviewer. Formal source, subject, accessibility và release approvals của BE vẫn tách biệt và dùng đúng identity/auth policy hiện hành.
- Gemini không được gửi dữ liệu cho tới khi quyền truyền nguồn, retention, training, region và cấu hình credentials được xác nhận. Tắt Gemini không được chặn import/OCR/manual edit.
- Không đặt `H_review_max` cố định; tối ưu thao tác và ghi thời gian thực tế. Không dùng agent time làm số đo reviewer.
- Course membership/order/progress là liên kết riêng. Lesson được release không tự chứng minh đã gắn vào course hoặc cập nhật student progress.
- Không rõ quyền xuất bản, curriculum authority, database environment, asset version hoặc digest thì không apply.

## Non-goals

- Auto-publish toàn bộ sách, AI tự duyệt nội dung, UI quản trị nhiều người, realtime collaboration hay workflow engine tổng quát.
- Lab Studio, engine mô phỏng mới, course binding tự động, concurrent publishing, generalized rollback hoặc destructive legacy cleanup trong Lesson pilot.
- OCR/Gemini trong backend runtime.

## Success signal

Operator có thể import KHTN 8 hoặc một PDF khác, xem tiến độ từng bước, chạy sample rồi full MinerU local, sửa OCR/LaTeX có bằng chứng nguồn, tạo 2–3 Lesson trong UI, export và nhận BE plan không blocker. Sau khi source/release gates và target staging được xác minh, apply qua BE, mở Lesson ở Open Curriculum và kiểm tra student pathway/attempt. Local flow vẫn chạy khi Gemini tắt; không gọi course progress hoàn tất nếu chưa có course binding và runtime evidence.

## Open questions

- Quyền xuất bản tài liệu KHTN 8 và authority/version curriculum nào được dùng cho Lesson đầu?
- Ai xác nhận policy quyền gửi Gemini, retention, training và region để bật LaTeX suggestions?
- Supabase/R2 staging target và quy trình recovery nào được phép dùng cho M2b/M3?
