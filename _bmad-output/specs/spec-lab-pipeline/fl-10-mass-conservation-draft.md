# FL-10: bảo toàn khối lượng — bản nháp hoạt động

Trạng thái: đề xuất để triển khai và review; chưa xác nhận nguồn SGK, nội dung khoa học hoặc release. Phạm vi này là một hoạt động thuộc ứng viên FL-10, không quyết định toàn bộ phân tách FL-10.

Lát cắt model, contract fixture, kiểm thử và các quyết định còn mở: [fl-10-k2-implementation-spec.md](fl-10-k2-implementation-spec.md). Tài liệu đó là backlog cho FL-10, không thay thế phase plan và gate của pipeline.

## Mục tiêu và bằng chứng

Ứng viên liên kết B05-O01: học sinh dự đoán, quan sát và giải thích sự bảo toàn khối lượng trong một hệ được xác định. Thao tác ảo hỗ trợ tìm hiểu tự nhiên; không chứng minh kỹ năng thao tác dụng cụ và an toàn trong phòng thí nghiệm thật. Mapping và mức độ bao phủ cần người có thẩm quyền review.

## Chuỗi hoạt động

1. **Dự đoán:** ghi lựa chọn tăng, giảm hoặc không đổi và lý do trước khi quan sát. Ghi nhận dự đoán trung thực; không chấm đúng sai chỉ vì dự đoán ban đầu khác kết quả.
2. **Quan sát:** học sinh xác định phạm vi được cân, cân trước, thực hiện phản ứng và đọc cân sau. Phương án hai cốc mở đang được xem xét cần mô tả rõ giả định không thất thoát và phạm vi cân; không gọi đó là bình kín. Thiết bị và quy trình còn chờ đối chiếu nguồn.
3. **Giải thích:** so sánh hai số đo và chọn lời giải thích: các nguyên tử được bảo toàn và sắp xếp lại. Phân biệt hình minh họa vi mô với quan sát trực tiếp.
4. **Vận dụng:** dự đoán số chỉ cân khi khí đi vào hoặc ra khỏi phạm vi được cân. Đây có thể là câu hỏi theo kịch bản, không mặc định model đầu tiên đã mô phỏng hệ hở.

## Ranh giới model và rubric

- Model có version xác định trạng thái hợp lệ, số đo và hiện tượng theo bộ tham số được duyệt. Không nhận khối lượng hoặc kết quả do client tự khai làm kết luận có thẩm quyền. Animation biểu diễn output của model.
- Activity điều phối trình tự và evidence; 2D và 3D cùng dùng trạng thái hoạt động. Rubric version riêng kiểm tra sự hoàn thành, so sánh bằng chứng và giải thích; phản hồi giúp sửa hiểu lầm. Không suy diễn chất lượng lý do tự do bằng quy tắc từ khóa.
- Bộ K2 chia sẻ khung cảnh, dụng cụ, bố cục và widget đo; mỗi lab giữ model, hoạt động, rubric và release độc lập.

## Cần xác nhận trước release

- Đối chiếu edition, Lesson, source block, Outcome và quyền sử dụng; phản ứng BaCl₂/Na₂SO₄ và cách bố trí chưa được xác minh là nội dung SGK. Nếu dùng phản ứng này cần review độc tính, xử lý chất thải và framing an toàn.
- Chốt phạm vi cân, giả định thí nghiệm, độ chính xác cân và các trường hợp hợp lệ; review golden cases, rubric, accessibility và thiết bị mục tiêu. Mọi giả định là giả định mô phỏng, không phải số đo thực.
- Phát hành mới cần evidence và OWNER_SIGNOFF cho digest thực tế. Không dùng trạng thái ACTIVE như bằng chứng riêng cho nội dung hoặc độ bao phủ Outcome.
