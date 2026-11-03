---
id: FL-16-SME-REVIEW
status: awaiting-sme-review
updated: 2026-11-02
companions:
  - fl-16-eye-anatomy-kit-plan.md
  - lab-catalog-and-shared-kits-khtn8-9.md
---
# FL-16 — Checklist cho chuyên gia (SME) sinh học / sư phạm

> Mục đích: SME xác nhận hoặc sửa từng giá trị dưới đây trước khi FL-16 được release. Mọi giá trị trong cột "Đang dùng" là **software assumption** của `eye-optics@1.0.0`, không phải dữ liệu đã duyệt. Tài liệu này **không** khẳng định nội dung SGK: các cột "Biến thể có thể gặp" chỉ là gợi ý để SME đối chiếu trang sách.

## 0. Câu hỏi phạm vi (trả lời trước)

| # | Câu hỏi | Trả lời SME |
|---|---|---|
| S-1 | Catalog ánh xạ cấu tạo mắt vào **KHTN 8, bài B37** (`KHTN8-B37-O04`). Yêu cầu nội bộ gọi là "SGK KHTN 9". Nội dung này thuộc lớp 8, lớp 9, hay cả hai (lớp 9 phần ánh sáng/thấu kính)? | ☐ Lớp 8 ☐ Lớp 9 ☐ Cả hai — ghi bài/trang: |
| S-2 | Bộ sách chuẩn để lấy danh pháp: Kết nối tri thức, Cánh Diều, hay Chân trời sáng tạo? Nếu khác nhau, chấp nhận nhiều cách gọi? | |
| S-3 | Phase 2 (cận/viễn thị và kính hiệu chỉnh) có nằm trong yêu cầu cần đạt của bài đã chọn không? Nếu không, giữ chỉ tình huống mắt bình thường? | ☐ Giữ cả 3 ☐ Chỉ mắt thường ☐ Khác: |
| S-4 | Chấm tên bộ phận: chỉ chấp nhận **đúng một** cách gọi (hiện tại), hay chấp nhận danh sách đồng nghĩa SME duyệt? | |

## 1. Danh pháp 8 bộ phận (phase 1)

Rubric hiện so khớp chính xác (bỏ khoảng trắng đầu/cuối, không phân biệt hoa thường, chuẩn hoá Unicode NFC). Có dấu khác = sai.

| # | Id | Đang dùng (đáp án) | Biến thể có thể gặp — SME đánh dấu tên SGK | Chức năng (copy hiện tại) | Xác nhận |
|---|---|---|---|---|---|
| 1 | `cornea` | Giác mạc | Màng giác | Lớp trong suốt phía trước, khúc xạ ánh sáng đi vào mắt | ☐ |
| 2 | `aqueous` | Thủy dịch | Thuỷ dịch (dấu đặt khác) | Dịch trong suốt giữa giác mạc và thể thủy tinh | ☐ |
| 3 | `pupil` | Đồng tử | Con ngươi | Lỗ ở giữa mống mắt cho ánh sáng đi qua | ☐ |
| 4 | `lens` | Thể thủy tinh | Thủy tinh thể; Thể thuỷ tinh | Điều tiết để hội tụ ánh sáng lên võng mạc | ☐ |
| 5 | `vitreous` | Dịch kính | Dịch thủy tinh; Thể kính | Khối gel trong suốt duy trì hình dạng nhãn cầu | ☐ |
| 6 | `retina` | Võng mạc | Màng lưới | Lớp cảm thụ ánh sáng, chuyển thành tín hiệu thần kinh | ☐ |
| 7 | `nerve` | Dây thần kinh thị giác | Thần kinh thị giác | Dẫn truyền tín hiệu từ võng mạc đến não | ☐ |
| 8 | `sclera` | Củng mạc | Màng cứng | Lớp vỏ bảo vệ và duy trì hình dạng mắt | ☐ |

**Đã xử lý (owner 2026-11-02):** rubric chấp nhận cả "Võng mạc" và "Màng lưới" cho `retina`, không phân biệt hoa thường, có hoặc không dấu. Giao diện hiển thị "Màng lưới (Võng mạc)". Bảy bộ phận còn lại vẫn yêu cầu đúng tên (không phân biệt hoa thường, **có** dấu). SME xác nhận: ☐ Giữ ☐ Mở rộng alias cho bộ phận khác (ghi rõ):

**Câu hỏi bổ sung:** Có cần thêm mống mắt, màng mạch, điểm vàng, điểm mù vào phase 1 không? (3D đã vẽ mống mắt và điểm vàng nhưng chưa chấm.)

## 2. Thông số quang học

Cột "Tham chiếu phổ biến" là giá trị thường gặp trong mắt sơ đồ Gullstrand/mắt rút gọn; SME xác nhận nguồn và có dùng cho học sinh hay không.

| Thông số | Đang dùng | Tham chiếu phổ biến | Câu hỏi cho SME | Xác nhận |
|---|---|---|---|---|
| Chiết suất giác mạc | 1,376 (chỉ dùng cho vật liệu 3D) | ≈ 1,376 | Đúng? Có cần nêu cho học sinh? | ☐ |
| Chiết suất thủy dịch | 1,336 | ≈ 1,336 | | ☐ |
| Chiết suất thể thủy tinh | 1,42 (vật liệu 3D) | ≈ 1,386 (vỏ) – 1,406 (nhân), có gradient | Dùng một giá trị trung bình được không? | ☐ |
| Chiết suất dịch kính | 1,336 (dùng trong công thức) | ≈ 1,336 | | ☐ |
| Độ tụ giác mạc | 43 D | ≈ 42–43 D | | ☐ |
| Độ tụ thể thủy tinh | 16 D (thư giãn) đến 26 D (điều tiết tối đa) | ≈ 19–20 D thư giãn; biên độ điều tiết người trẻ ≈ 8–12 D | Khoảng 16–26 D có chấp nhận cho mô hình rút gọn? | ☐ |
| Tổng độ tụ mắt thư giãn | ≈ 59 D | ≈ 58–60 D | | ☐ |
| Trục nhãn cầu (giải phẫu) | 3D vẽ ≈ 24 mm (giác mạc tới cực sau) | ≈ 24 mm | | ☐ |
| Khoảng cách dùng trong công thức (L) | 22,6 mm | Mắt rút gọn: ≈ 22,2–22,6 mm từ mặt khúc xạ tương đương tới võng mạc | **Xem câu hỏi O-1** | ☐ |
| Dung sai "ảnh rơi đúng võng mạc" | ±0,5 D (≈ ±0,25 mm) | Không có chuẩn SGK | Dung sai này có hợp lý về sư phạm? | ☐ |

**O-1 (quan trọng):** Học sinh thường học "nhãn cầu dài khoảng 24 mm". Công thức của mô hình dùng L = 22,6 mm vì L đo từ **mặt khúc xạ tương đương** (gần giác mạc) chứ không phải từ đỉnh giác mạc. Hai số không mâu thuẫn, nhưng có thể gây nhầm. SME chọn: ☐ Chỉ hiện 24 mm, giấu 22,6 mm ☐ Hiện cả hai kèm giải thích ☐ Đổi mô hình sang L = 24 mm (khi đó độ tụ thư giãn và các đáp án phase 2 phải tính lại).

**O-2:** Công thức P = n/L + 1/d bỏ qua khoảng cách từ kính tới mắt (≈ 12 mm). Với kính −2 D, sai số do bỏ qua khoảng cách này chỉ khoảng 0,05 D. Chấp nhận cho mục tiêu định tính? ☐ Có ☐ Không

## 3. Ba tình huống phase 2

| Tình huống | Trục (L) | Vật | Đáp án mẫu (rubric đạt) | Câu hỏi cho SME | Xác nhận |
|---|---|---|---|---|---|
| Mắt bình thường nhìn gần | 22,6 mm | 25 cm | Thể thủy tinh ≈ 20 D, không đeo kính | 25 cm có phải "khoảng nhìn rõ ngắn nhất" theo SGK? Có nên dùng điểm cực cận/cực viễn? | ☐ |
| Mắt cận thị nhẹ nhìn xa | 23,4 mm (mắt dài hơn) | Vô cực | Thể thủy tinh thư giãn (≤ 16,5 D), kính ≈ −2 D; với thể thủy tinh 16 D đạt từ −1,50 đến −2,25 D | Đã đổi từ −7,75 D sang mức cận học đường (owner 2026-11-02). Khoảng −1,50 đến −2,25 D có phù hợp? | ☐ |
| Mắt viễn thị nhìn gần | 21,5 mm (mắt ngắn) | 40 cm | Kính hội tụ dương (vd +3 D) với thể thủy tinh ≈ 18,75 D | SGK mô tả viễn thị là "nhìn gần không rõ"? Nên chọn vật ở 25 cm thay vì 40 cm? | ☐ |

Điều kiện đạt mỗi tình huống: ảnh lệch ≤ 0,5 D; khoảng cách vật đúng ±2 cm; dấu kính đúng (cận âm, viễn dương, mắt thường không kính); nhìn xa phải để thể thủy tinh thư giãn.

**Câu hỏi sư phạm:**
- P-1: Học sinh có nên thấy vị trí ảnh (trước/sau màng lưới, mm) khi đang chỉnh? Hiện có hiển thị; điều này giúp học nhưng cũng cho phép thử–sai tới đáp án. ☐ Giữ ☐ Chỉ hiện sau khi nộp
- P-2: Có cần câu hỏi giải thích (chọn A/B/C) như pilot FL-01, ví dụ "Vì sao người cận thị đeo kính phân kỳ?" ☐ Thêm ☐ Không
- P-3: Có cần nói rõ "đây là mô hình minh hoạ, không thay khám mắt" trong lời dẫn? (Hiện có disclaimer chung.) ☐ Đủ ☐ Cần thêm

## 4. Hình 3D

- V-1: Mặt cắt dọc hiện thấy củng mạc, giác mạc, mống mắt, thể thủy tinh, dịch kính, võng mạc, điểm vàng, dây thần kinh. Thiếu màng mạch và cơ thể mi. Có bắt buộc không? ☐
- V-2: Trục quang đang nằm ngang, ánh sáng đi từ phải sang trái. SGK vẽ từ trái sang phải? ☐ Đổi ☐ Giữ
- V-3: Nguồn hình tham chiếu để so tỉ lệ và màu (SME cung cấp, ghi quyền sử dụng):

## 5. Ký duyệt

| Vai trò | Họ tên | Ngày | Kết luận |
|---|---|---|---|
| SME sinh học | | | ☐ Duyệt ☐ Duyệt có sửa ☐ Không duyệt |
| SME sư phạm/chương trình | | | ☐ Duyệt ☐ Duyệt có sửa ☐ Không duyệt |
| Owner | | | ☐ Chuyển từ Showcase Pilot sang core slot |

Mọi thay đổi giá trị ở mục 2–3 phải sửa cùng lúc `packages/sim/eye-optics.ts` (BE) và kit FE; test `FE-NexaLab/tests/constants-parity.spec.ts` sẽ báo lỗi nếu hai bên lệch.
