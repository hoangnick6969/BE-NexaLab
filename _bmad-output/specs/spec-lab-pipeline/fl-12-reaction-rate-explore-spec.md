# Spec áp dụng Explore: FL-12 Tốc độ phản ứng và chất xúc tác

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 10), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md). Trạng thái: **đã làm trên dev (2026-11-16), chưa phát hành**. Mô hình là bản nháp (`reviewStatus: draft`) chờ reviewer Hóa duyệt; catalog ghi "model choice needs model review", nên cần duyệt trước khi bỏ nhãn "Dữ liệu chưa duyệt".

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

## Đã làm và các lựa chọn mặc định (cần owner và reviewer xác nhận)

Mô hình và config lấy đúng đề xuất của spec; năm câu mở được xử lý bằng mặc định dưới đây, có thể đổi mà không phải làm lại phần khung.

| Câu | Mặc định đã dùng | Ở đâu |
|---|---|---|
| 1. Mô hình | `v = k × [HCl] × S × (chất rắn còn lại / ban đầu)`, số nguyên nanomol mỗi giây; `k` = 33 nmol/s mỗi mmol/L, `S`: viên 1, bột 8 | `rateModel` trong `fl-12.config.ts`, `kineticSecond` trong sim |
| 2. Lát đầu | Nồng độ HCl (0,1 M và 0,2 M) và dạng chất rắn (viên và bột), nhiệt độ cố định 25 °C; nhiệt độ làm yếu tố để lát sau | Ba bình có sẵn 20 mL acid; thí nghiệm A: Bình 1 và 2, thí nghiệm B: Bình 1 và 3 |
| 3. Bước thời gian | 1 giây, học sinh chọn Chờ 5, 10, 30 hoặc 60 giây; tối đa 600 giây | `advance_time`, `maxSeconds` |
| 4. Chất xúc tác | Không đưa H₂O₂ và MnO₂ vào INC này (chờ review an toàn của FL-15) | Chưa làm |
| 5. Phiên bản engine | `wet-bench@1.2.0` (sim 1.13.0); FL-13, FL-14a, FL-10, FL-11 giữ nguyên | `WET_BENCH_ENGINES`, `modelRefOf` ở BE |

Ví dụ đường cong (golden): sau 30 giây Bình 1, 2, 3 thu 2,3 mL, 4,6 mL và 13,3 mL khí; Bình 3 (bột) đạt 24,5 mL, đúng lượng của 2 mmol HCl, sau khoảng 4 phút.

Điều khác với đề xuất ban đầu:
- Không thêm kind "bộ thu khí": bình tam giác có nút cao su được coi là có ống dẫn khí. Thể tích khí đọc từ khí giữ trong bình có nút, quy về 25 °C, 1 atm (24,5 L/mol). Bình hở thì khí thoát ra ngoài và không đọc được.
- Phản ứng `gas.caco3-hcl` của FL-10 vẫn tức thời ở mọi Lab không khai báo `rateModel`.
- Đồng hồ bấm giờ chỉ hiển thị thời gian; thời gian phản ứng trôi theo nút Chờ, kể cả khi đồng hồ không chạy.
- Nhiệt kế chỉ hiện 25,0 °C cố định, chưa là biến (lát 2).
- Thêm đồ thị thể tích khí theo thời gian (SVG, có chú thích chữ cho trình đọc màn hình).

Task: F12-1 reviewer duyệt mô hình (chờ), F12-2 sim 1.2.0 (xong), F12-3 FE bàn, đồng hồ, nhiệt kế, đồ thị, nhật ký (xong), F12-4 seed, phát hành, kiểm chỉ-SELECT (chờ reviewer và owner đồng ý). Chạy tại `/dev/lab-kits/k2?lab=fl-12`.
