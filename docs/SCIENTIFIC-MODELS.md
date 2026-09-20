# Mô hình khoa học — version 1.0.0

Tài liệu này mô tả **giả định của phần mềm**, chưa phải biên bản phê duyệt của giáo viên bộ môn. Không dùng kết quả để lắp mạch thật, làm thí nghiệm thật hoặc chẩn đoán y khoa.

## Mạch điện

- Một nguồn lý tưởng, điện áp từ 1 đến 24 V; tối đa 24 linh kiện, 48 dây.
- Dây dẫn không có điện trở. Các nhánh nối tiếp/song song độc lập được hỗ trợ; mạch cầu và nhánh dùng chung linh kiện bị từ chối rõ ràng.
- Canvas coi linh kiện là node, dây là cạnh vô hướng. LED được giả định lắp đúng chiều; chưa mô phỏng cực âm/dương.
- LED đỏ: sụt áp không đổi 2 V. Bật khi 1 mA ≤ I ≤ 20 mA.
- Với mỗi nhánh: `I = max(0, U − 2 × số_LED) / tổng_R`.
- Nhánh R = 0 được đánh dấu quá dòng, current = null (UI hiện ∞); không dựng một con số dòng hữu hạn giả cho ngắn mạch lý tưởng.
- Dòng nguồn bằng tổng dòng các nhánh. Ngưỡng LED được kiểm tra trên **từng nhánh**, không dùng dòng tổng để chấm sai mạch song song.
- Chưa đạt: mạch hở, công tắc mở, thiếu LED hoặc dòng dưới ngưỡng sáng. Đạt một phần: có nhánh quá dòng. Đạt: có LED sáng và không có nhánh quá dòng.
- Ví dụ kiểm chứng: U=9 V, một LED, R=350 Ω → I=20 mA; R=330 Ω → I≈21.212 mA → đạt một phần.
- Engine chặn đồ thị có số bước duyệt >10.000 để giới hạn chi phí tính toán.

## Hóa học

Sáu phương trình cân bằng trong `packages/sim/index.ts`: Mg/HCl, CaCO3/HCl, NaOH/HCl, CuSO4/NaOH, NaCl/AgNO3, Fe/CuSO4.

Input là **số mol**, trong [0,2]. Với hai chất phản ứng A/B, mức tiến triển `ξ=min(nA/νA,nB/νB)`. Chất còn dư: `nA−νAξ` và `nB−νBξ`. Sản phẩm chính của sáu phương trình đều có hệ số 1 nên số mol bằng ξ. Không mô phỏng động học, nhiệt độ, trạng thái cân bằng, nồng độ pH hay truyền nhiệt. Hiện tượng là minh họa định tính có sẵn, không mô hình chất lỏng vật lý.

Đạt khi ξ>0 và không dư chất trong sai số 1e−9 mol; đạt một phần nếu có phản ứng nhưng còn chất dư; chưa đạt nếu không có phản ứng.

## Mắt người

Mô hình mesh hình học minh họa tám thành phần, dựng bằng code Three.js, không dùng asset bên ngoài. Màu, kích thước và vị trí được đơn giản hóa để chọn/tách các thành phần; chưa đủ độ chính xác để coi là mô hình giải phẫu đã duyệt. Canvas hỗ trợ xoay, zoom, pan, cắt và ẩn củng mạc. Chấm tên bằng chuỗi tiếng Việt chuẩn hóa NFC, không phân biệt chữ hoa/thường.

## Cơ sở & nghiệm thu nội dung

Blueprint NexaLab v1.1 do chủ dự án cung cấp là nguồn yêu cầu. Các trang SGK được nêu trong blueprint **chưa được kiểm chứng độc lập**, nên source không gắn nhãn “đã được giáo viên duyệt”. Trước sử dụng ở trường: giáo viên KHTN kiểm tra mô hình, đối chiếu SGK thực tế, xác nhận thuật ngữ giải phẫu và ghi biên bản. Test tự động xác nhận code thực hiện đúng các giả định trên, không thay thế phê duyệt sư phạm.

## Ranh giới Tutor

Server luôn tính lại kết quả, không tin verdict hoặc current từ client. Context lấy từ Attempt lưu trong PostgreSQL. Mỗi lượt thử chỉ có một gợi ý; cần lượt thử mới để tăng mức. Advisory lock khóa các yêu cầu đồng thời của cùng học sinh. Mức 1–2 dùng template. Khi có ANTHROPIC_API_KEY và ANTHROPIC_MODEL, mức 3–4 có thể thêm một câu hỏi định tính; giải thích engine vẫn được giữ nguyên. Timeout/lỗi/đầu ra không đúng định dạng → template. Các bộ lọc không phải cam kết loại bỏ mọi sai sót của LLM; cần rà soát HintLog trước triển khai với học sinh thật.
