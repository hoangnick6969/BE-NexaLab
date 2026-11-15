# Spec áp dụng Explore: FL-12 Tốc độ phản ứng và chất xúc tác

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 10), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md). Trạng thái: **bản nháp chờ owner và reviewer Hóa duyệt mô hình** (K2-3.3, 2026-11-15). Không code engine trước khi mô hình được duyệt: catalog ghi rõ "model choice needs model review".

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | Bàn ướt K2, `kit = k2-wet-bench@1`, `group = chemistry`. FE `chemistry/wet-bench/`, sim `packages/sim/wet-bench/`. |
| Lab đầu tiên | FL-12, Lab ID đề xuất `reaction-rate` (chốt khi seed, topic code của B07). Chưa có Guided; mode triển khai là Explore. Outcome chính B07-O02 đến O05; hỗ trợ B07-O01, O06. |
| Cách mở | `/labs/:id` với config đã ghim. Không phụ thuộc D-5. |
| Mô hình | Engine thêm trục thời gian (`wet-bench@1.2.0` nếu FL-11 lấy `1.1.0`), thời gian mô phỏng nguyên theo giây, `reviewStatus: draft`. Bán định lượng, không phải số đo thực. |

## Hoạt động đề xuất (lát cắt đầu)

Theo delivery spec, mở một yếu tố trước rồi mới thêm các yếu tố khác.

- **Lát 1 (đề xuất):** CaCO₃ với HCl, thu khí CO₂, so sánh tốc độ khi đổi **nồng độ HCl** và **dạng chất rắn** (viên và bột). Dùng lại phản ứng `gas.caco3-hcl` và chất `CaCO3_chips` đã có; chỉ cần thêm dạng bột.
- **Lát 2 (sau):** nhiệt độ, dùng bể nước nóng và nhiệt kế.
- **Chưa làm:** chất xúc tác H₂O₂/MnO₂ cần review an toàn riêng, tách khỏi lát 1.

Học sinh đặt hai ống phản ứng, cho chất rắn vào cùng lúc, bấm đồng hồ, dùng ống đong úp thu khí và đọc thể tích khí theo thời gian. Có đường cong thể tích theo thời gian (tùy chọn, đồ thị bọt khí).

## Mô hình đề xuất và giới hạn (cần reviewer duyệt)

- **Quy luật tốc độ giản lược:** tốc độ tạo khí tỷ lệ với nồng độ axit hiện còn và hệ số bề mặt của chất rắn: `v = k × [HCl] × S`, với `S` bột lớn hơn viên (hệ số do config khai báo, ví dụ viên 1, bột 8, đều là giả định phần mềm).
- **Tính bằng số nguyên:** lặp từng bước 1 giây; lượng chất phản ứng trong bước = phần nguyên của `k × nồng độ × S × lượng còn lại`, cho tới khi hết chất hạn chế. Không dùng số thực, để golden cố định.
- Thể tích khí làm tròn 0,1 mL, từ lượng CO₂ sinh ra (cùng khối lượng mol và tỷ lượng như `gas.caco3-hcl`).
- Thời gian là **thời gian mô phỏng**, tăng theo thao tác "chờ" hoặc "chạy đồng hồ", không dùng đồng hồ trình duyệt. Giới hạn 600 giây.
- Giới hạn khai báo: không mô phỏng nhiệt phản ứng, bọt bám bề mặt, sai số đọc, hay đổi tốc độ khi axit cạn ngoài quy luật trên. Nhiệt độ phòng cố định 25 °C ở lát 1 (nhiệt kế chỉ hiện giá trị cố định, chưa là biến).
- Đây là mô hình minh họa xu hướng (nồng độ lớn hơn, bột mịn hơn thì nhanh hơn), không tuyên bố số liệu thực.

## Đăng ký và tái sử dụng

| Phần | Nội dung |
|---|---|
| Config/sim | Mở rộng `ChemistryLabConfig`: `rateModel` (hệ số k, S theo dạng chất rắn, thời gian tối đa). Action mới: `advance_time` (giây), `start_clock`, `stop_clock`, `collect_gas`. Phép đo mới `time`, `gas_volume`. Kind mới: `stopwatch`, `thermometer`, `gas_collection_set`, `water_bath` (lát 2). Reagent mới `CaCO3_powder`. Golden: đường cong cho từng cặp nồng độ và dạng chất rắn, ca chất hạn chế, ca vượt 600 giây; golden hiện có giữ nguyên. |
| BE | Dùng `k2-wet-bench@1`, validator mở rộng. Seed và phát hành như FL-13. |
| FE | Đăng ký renderer cho kind mới; `apparatus-manifest.ts` thêm kind với `sharedItem` cho đồng hồ và nhiệt kế. Đồ thị thể tích theo thời gian là thành phần riêng của bàn. |
| Item | Dùng chung từ `shared/items/`: `stopwatch`, `thermometer`, `graduated-cylinder` (K2-3.3, đã có), `beaker`. Riêng của bàn: bộ thu khí, bể nước nóng (lát 2). Bàn truyền số đọc đã định dạng và `fill`; item không tự tính thời gian hay nhiệt độ. |
| Nhật ký | Dòng mới: đặt ống, bắt đầu và dừng đồng hồ, đọc thể tích tại thời điểm. Mô tả hiện tượng bằng giây và mL. |
| Class Explore | v1 chưa hỗ trợ. Đề xuất sau: yêu cầu `measure` kiểu thời gian và thể tích khí, `explain`; mẫu giáo viên chọn yếu tố cần so sánh. |

## Nghiệm thu

- Lab hiện trong danh mục sau khi phát hành, mở đúng renderer, panel liệt kê đủ item.
- Golden bao phủ các ca nêu trên; xu hướng đúng: nồng độ lớn hơn và bột thì sinh khí nhanh hơn, cùng lượng chất hạn chế thì tổng thể tích bằng nhau.
- Hồi quy: FL-13, FL-14a, FL-10 và FL-11 (nếu đã có) giữ nguyên kết quả.
- Reviewer Hóa ký duyệt mô hình trước khi phát hành, bằng bản ghi `review` của activity.

## Câu hỏi mở cho owner và reviewer

1. Reviewer duyệt quy luật `v = k × [HCl] × S` và các hệ số, hay đổi sang mô hình khác? Đây là điều kiện chặn.
2. Lát đầu có đúng là nồng độ và dạng chất rắn, hay muốn nhiệt độ trước (cần bể nước nóng ngay)?
3. Số nguyên bước 1 giây có đủ mịn cho đường cong, hay cần bước 0,1 giây?
4. Có đưa H₂O₂/MnO₂ vào INC này không? Đề xuất: không, chờ review an toàn của FL-15.
5. Phiên bản engine: `1.2.0` sau FL-11 hay gộp chung `1.1.0`? (xem câu hỏi 2 của FL-11).

## Task đề xuất sau khi duyệt

| ID | Task | Chờ |
|---|---|---|
| F12-1 | Reviewer Hóa duyệt mô hình và hệ số | Duyệt spec |
| F12-2 | Sim: trục thời gian, mô hình tốc độ, validator, golden, bump sim, đồng bộ tarball | F12-1 |
| F12-3 | FE: bộ thu khí, đồng hồ và nhiệt kế vào bàn, đồ thị, nhật ký | F12-2 |
| F12-4 | Seed, phát hành, kiểm chỉ-SELECT | F12-3 |
