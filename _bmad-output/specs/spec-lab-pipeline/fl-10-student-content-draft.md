# FL-10 / K2 — nội dung học sinh ứng viên D3/D4

Trạng thái: **bản nháp do chủ dự án cung cấp 2026-10-31**. Gắn ứng viên B05-O01, SGK KHTN 8 Bài 5 trang in 24–27 theo mô tả của chủ dự án; chưa đối chiếu edition, source block, quyền sử dụng, độ tan hay an toàn với nguồn độc lập. Đây không phải OWNER_SIGNOFF, activity/rubric đã pin hoặc permission phát hành.

## Mô hình thí nghiệm

Hai cốc thủy tinh mở được đặt sẵn trên cân trong cả view 2D và 3D. Cốc 1 chứa dung dịch barium chloride, cốc 2 chứa dung dịch sodium sulfate. Học sinh dự đoán trước khi đọc số, đọc tổng khối lượng, rót cốc 1 vào cốc 2 và lắc nhẹ; hoạt cảnh đưa cốc rỗng trở lại cân trước khi học sinh đọc số sau. Kết tủa trắng chỉ là hình minh họa. Không gọi hai cốc mở là hệ kín; giả định mô phỏng không bắn, bay hơi hoặc thất thoát.

Tham số học sinh **đề xuất, chưa duyệt**: cốc rỗng 100,0 g mỗi cốc, dung môi 100,0 g mỗi cốc; khối lượng chất của fixture tham chiếu tổng 35,0 g. Model cho 435,0 g trước và sau. Server phải lấy bốn tham số từ cấu hình đã review và pin theo digest; học sinh không được gửi khối lượng tùy ý. Golden test 50,0 g dung môi vẫn chỉ là kiểm thử số học. D4 phải kiểm tra độ tan BaCl₂, Na₂SO₄ và NaCl ở nhiệt độ được chọn trước khi dùng tham số này cho học sinh.

Hai cốc luôn nằm trong phạm vi cân ở các trạng thái đọc số; số chỉ được che cho đến event `READ_BEFORE` hoặc `READ_AFTER` hợp lệ, rồi hiển thị giá trị model làm tròn 0,1 g cùng nhãn `Số liệu mô phỏng`. Số 20,8 + 14,2 → 23,3 + 11,7 g chỉ xuất hiện ở phần giải thích với nhãn `Ví dụ tính toán`; không đặt vào cảnh cân hay nhận là số đo SGK. Rót và lắc là một hoạt cảnh có thể bỏ qua. Làm lại tạo lượt mới sau xác nhận, không hoàn tác trong lượt.

## Chuỗi học tập và mã lựa chọn

1. **An toàn:** hiển thị trước khi học sinh thao tác hoặc đọc cân. Muối barium tan độc; đây là mô phỏng, không tự làm tại nhà. Nếu làm thật phải có giáo viên, kính và găng tay, không nếm/chạm trực tiếp, xử lý theo quy định của phòng thí nghiệm. Nút `Em đã đọc` chỉ xác nhận đã xem, không chứng minh năng lực thực hành.
2. **Dự đoán:** hỏi số cân sau khi rót/lắc và đặt lại hai cốc so với lần đầu. `predict.increase`, `predict.decrease`, `predict.same` lần lượt là lớn hơn, nhỏ hơn, bằng nhau. Lý do tự do tùy chọn, lưu nhưng không chấm từ khóa. Sau gửi, phản hồi chung: đã ghi nhận dự đoán, không chấm đúng sai, hãy kiểm tra.
3. **Quan sát:** xác định hai cốc trên cân, đọc cân trước, rót/lắc, quan sát chất rắn trắng và cốc rỗng trở lại cân, rồi đọc sau. Số chỉ lấy từ output model, không hardcode trong nội dung; chưa nêu kết luận ở bước này.
4. **Giải thích:** so sánh số trước/sau bằng `compare.increase|decrease|same` dựa trên output model. Chọn `explain.rearrange` (nguyên tử bảo toàn, sắp xếp lại, mọi chất vẫn được cân), `explain.new_substance_heavier` (sai: chất mới làm tăng cân) hoặc `explain.solid_not_weighed` (sai: chất rắn lắng xuống không được cân). Phản hồi riêng cho từng mã sau trả lời; cho chọn lại và ghi số lần thử, không phạt điểm. Hiện dự đoán gốc bên cạnh quan sát, cho ghi chú điều chỉnh riêng không ghi đè dự đoán.
5. **Ví dụ tính toán:** nhãn `Ví dụ tính toán`; 20,8 g BaCl₂ + 14,2 g Na₂SO₄ → 23,3 g BaSO₄ + 11,7 g NaCl. Hỏi tổng hai phía; đáp án `35,0 g và 35,0 g`, các cặp nhiễu dùng mã ổn định. Sơ đồ nguyên tử có nhãn `Hình minh hoạ, không phải quan sát trực tiếp`: mỗi vế có 1 Ba, 2 Cl, 2 Na, 1 S, 4 O.
6. **Vận dụng:** nhãn `Tình huống giả định`; V1 khí thoát khỏi cốc hở đặt trên cân → nhỏ hơn; V2 khí ở trong bình kín cùng trên cân → bằng nhau; V3 hai cốc mở vẫn bằng nhau vì mô phỏng không có chất rời phạm vi cân. V3 phản tư, quyết định tính điểm còn mở. Model v1 không mô phỏng các tình huống khí.
7. **Tổng kết:** trong trường hợp lý tưởng này khối lượng trên cân trước/sau bằng nhau vì mọi chất vẫn ở trong phạm vi cân. Thí nghiệm thật có sai số; lab ảo không thay thực hành thật.

Nhãn bắt buộc dùng đúng ngữ cảnh: `Số liệu mô phỏng` cho số cân, `Hình minh hoạ` cho vị trí chất/kết tủa/sơ đồ nguyên tử, `Tình huống giả định` cho V1–V3, `Ví dụ tính toán` cho số phản ứng định lượng. Không đưa khóa chấm/đáp án vào payload dự đoán; kiểm tra payload và quyền truy cập, không coi giấu dữ liệu client là bảo mật tuyệt đối.

## Rubric ứng viên và gate

C1: đã gửi dự đoán hợp lệ, không chấm đúng sai. C2: đã đọc số trước/sau hợp lệ theo D1. C3: so sánh khớp output model. C4: cuối cùng chọn `explain.rearrange`, giữ số lần thử và không phạt. C5: tính tổng ví dụ đúng. C6: V1/V2 đúng. V3 phản tư, việc tính điểm còn mở. **Chưa có trọng số hay ngưỡng đỗ**; không đưa rubric này vào LabRun. Outcome B05-O01 chỉ được ghi hỗ trợ một phần vì thao tác ảo không chứng minh kỹ năng dụng cụ thật.

Trước tích hợp: chốt D1 sự kiện theo bước hay replay (replay không chứng minh thứ tự thời gian), D2 tuple/rubric và tham số pin, D4 đối chiếu trang in và độ tan/an toàn, D5 thiết kế 2D/3D và kiểm thử thiết bị. Release cần review và OWNER_SIGNOFF đúng digest.
