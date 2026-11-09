# Class Lab: fork Foundational Lab và chỉnh sửa câu hỏi trong Lab Space

**Trạng thái:** Hướng sản phẩm được thống nhất trong trao đổi ngày 2026-11-06; chưa phải đặc tả kỹ thuật đã duyệt.

## Mục tiêu

Giáo viên tạo một Lab riêng cho lớp bằng cách fork một Foundational Lab đã phát hành. Giáo viên mở chính Lab Space ở chế độ authoring để chỉnh các câu hỏi thuộc hoạt động nguồn. Học sinh làm hoạt động và trả lời các câu hỏi đó ngay trong Lab Space.

Đây là chỉnh sửa trên bản fork của lớp. Không sửa Foundational Lab gốc và không làm thay đổi các bản phát hành, bài đã giao hoặc kết quả lịch sử.

## Phân biệt với câu hỏi bổ sung

Chức năng này chỉnh câu hỏi vốn thuộc hoạt động Foundational Lab: câu hỏi gắn với bước/checkpoint, câu trả lời, tương tác mô phỏng và rubric hiện có.

Câu hỏi giáo viên tự thêm để học sinh phản hồi là luồng riêng, mô tả tại [class-lab-additional-questions.md](class-lab-additional-questions.md). Không gộp hai luồng thành một question builder.

## Hiện trạng đã kiểm tra

- Foundational Labs có activity version, model/pack và rubric được ghim. Một số hoạt động đã có câu hỏi/checkpoint và kiểu trả lời, nhưng cấu trúc cụ thể hiện được định nghĩa riêng theo từng activity ở renderer FE và evaluator BE.
- `PracticalActivityVersion.spec` là JSON có version, nhưng hiện chưa đóng vai trò một catalog câu hỏi chung mà Class Lab có thể fork và chỉnh.
- Class Lab hiện lưu `reportPrompts`; với FL-05 chúng chỉ thay lời hỏi hiển thị. Chúng không thay checkpoint, câu trả lời học sinh nộp hay rubric.
- Vì vậy, framework hiện tại có thể tái sử dụng phần phát hành bất biến, simulation tuple, renderer, evaluator, quyền truy cập, snapshot và vòng đời ClassResource. Chưa có framework chỉnh câu hỏi Foundational tổng quát.

Tham chiếu mã hiện tại: `prisma/schema.prisma` (`PracticalActivityVersion`), `src/modules/labs/application/evaluators/`, `src/modules/labs/application/checkpoint-activities.ts`, `src/modules/classes/application/class-resource-contract.ts`, và `../nexalab-fe/src/features/labs/`.

## Luồng mục tiêu

1. Giáo viên chọn một Foundational Lab/release/challenge đủ điều kiện từ lớp.
2. Lab Space tải activity và các câu hỏi/checkpoint đã được phiên bản hóa của release đó; mở giao diện authoring, không mở giao diện như học sinh.
3. Giáo viên chỉnh câu hỏi được activity cho phép. Chỉnh sửa được gắn bằng stable question/checkpoint ID, không dựa vào thứ tự hoặc câu chữ.
4. Giáo viên xem thử câu hỏi trong đúng bước mô phỏng, lưu bản nháp Class Lab, rồi xuất bản hoặc giao bài.
5. Khi học sinh mở Lab, renderer ghép activity nguồn với các override đã ghim. Học sinh trả lời qua kiểu tương tác của activity; server xác thực và chấm theo rubric được ghim.

## Ranh giới khoa học và chấm điểm

- Foundational release, model, engine, pack/config, activity identity và rubric tiếp tục được ghim bất biến.
- Class Lab được phép thay nội dung câu hỏi được đánh dấu là editable; không được đổi tùy ý state schema, answer type, đáp án chuẩn, cách tính điểm, phương trình khoa học hay model.
- Câu hỏi dùng để chấm phải tiếp tục khớp với answer contract/rubric của activity. Thay đổi làm đổi ngữ nghĩa chấm cần một rubric/activity version được review, không được ngầm sửa rubric của release.
- Quan hệ câu hỏi với mô phỏng phải dùng stable IDs/semantic bindings. Chỉ sửa câu chữ không tự làm mô hình 3D thay đổi.
- Snapshot Class Lab và assignment phải lưu đầy đủ override để chỉnh sửa sau này không đổi bài đã giao hoặc attempt cũ.

## Cách triển khai để tránh làm lại từng Lab

Xây một contract và authoring flow dùng chung cho question overrides, nhưng không giả định mọi Lab có cùng kiểu câu hỏi. Mỗi activity đăng ký metadata/adapter về stable IDs, phần nào được sửa, response schema và rubric binding. Renderer/evaluator hiện có được nối vào contract đó theo từng activity hoặc nhóm activity.

Không cần viết lại toàn bộ Lab. Tuy nhiên, một Lab chỉ hỗ trợ chỉnh câu hỏi sau khi các câu hỏi và answer contract hiện đang hardcode của nó được khai báo/adapter hóa. Các Lab chưa được nối vẫn giữ nguyên hành vi Foundational, và UI phải thể hiện rõ chưa hỗ trợ tùy biến câu hỏi.

## Phạm vi phiên bản đầu đề xuất

- Chọn một activity có luồng hỏi/đáp và evaluator rõ ràng làm vertical slice.
- Fork câu hỏi hiện có; cho sửa prompt/label trong giới hạn không làm đổi ý nghĩa đáp án hay rubric.
- Hiển thị câu hỏi đã sửa trong đúng Lab Space step và dùng response controls hiện có.
- Lưu/publish/revise theo snapshot bất biến; kiểm tra server vẫn đánh giá theo contract đã ghim.
- Hoãn tạo question type tùy ý, sửa đáp án chuẩn/rubric, và tự do lắp ghép mô hình/linh kiện.

## Tiêu chí hoàn thành

- Giáo viên nhìn thấy và sửa được câu hỏi Foundational thật trong Lab Space authoring; không phải chỉ thêm `reportPrompts`.
- Học sinh thấy câu hỏi sửa trong đúng bước và có thể trả lời bằng control tương ứng.
- Bản fork không thay đổi Foundational release hay rubric; server chấm chính xác theo tuple/rubric được ghim.
- Bài đã xuất bản/giao và attempt lịch sử không đổi khi giáo viên tạo revision mới.
- Lab chưa hỗ trợ adapter vẫn chạy tương thích ngược và không hiển thị nhầm rằng câu hỏi đã được tùy biến.
