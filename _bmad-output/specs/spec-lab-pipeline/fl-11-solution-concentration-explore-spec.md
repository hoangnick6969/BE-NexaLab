# Spec áp dụng Explore: FL-11 Dung dịch và nồng độ

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 9), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md). Trạng thái: **đã duyệt phạm vi và làm trên dev** (K2-3.3, 2026-11-16); chưa phát hành. Mọi con số hóa học dưới đây là giả định phần mềm, chờ reviewer Hóa.

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | Bàn ướt K2, `kit = k2-wet-bench@1`, `group = chemistry`. FE `src/features/labs/chemistry/wet-bench/`, sim `packages/sim/wet-bench/`. Không tạo bàn mới. |
| Lab đầu tiên | FL-11, Lab ID đề xuất `solution-concentration` (chốt khi seed, cùng topic code của B04). Chưa có Guided, mode triển khai là Explore. Outcome chính B04-O03, B04-O04; hỗ trợ B04-O01, B04-O02. |
| Cách mở | `/labs/:id` với config đã ghim. Không phụ thuộc D-5 vì Lab mới, chưa có Guided. |
| Mô hình | `wet-bench@1.1.0`, đơn vị nguyên: khối lượng mg, thể tích µL, nồng độ làm tròn theo bảng dưới. `reviewStatus: draft`. |

## Hoạt động đề xuất (lát cắt đầu)

Pha một dung dịch theo nồng độ cho trước, rồi đọc nồng độ đạt được.

1. Lab đưa mục tiêu, ví dụ "100 mL dung dịch NaCl 0,10 M" hoặc "dung dịch CuSO₄ có C% xấp xỉ 5%" (giá trị cụ thể do owner chốt).
2. Học sinh cân chất rắn trên cân điện tử, cho vào cốc, thêm nước, khuấy bằng đũa, chuyển sang bình định mức và thêm nước đến vạch. Ống đong dùng để lấy nước theo thể tích.
3. Bàn cho xem màu và thể tích. Nồng độ thực (C% và CM) chỉ hiện sau thao tác "Kết luận", để học sinh tự tính trước (xem câu hỏi mở 3).

Ngoài phạm vi v1: độ tan theo nhiệt độ và dung dịch bão hòa (cần bảng độ tan đã duyệt), độ cồn (chế độ phần trăm thể tích), pha loãng, hiệu ứng thay đổi thể tích khi hòa tan.

## Mô hình và giới hạn

- Chất tan tan hết nếu khối lượng nằm dưới giới hạn tan mà config khai báo; vượt giới hạn thì thao tác bị từ chối kèm lý do (không mô phỏng bão hòa ở v1).
- Khối lượng dung dịch = khối lượng chất tan + khối lượng nước, với khối lượng riêng nước 1 g/mL. Thể tích dung dịch ở bình định mức là thể tích đến vạch. Đây là giả định lý tưởng, ghi trong `limitations`.
- `C% = m_ct / m_dd × 100`; `CM = n / V`, với `n` tính từ khối lượng mol KHTN 8 trong `species.ts` (đã được owner xác nhận ở D-2). Làm tròn bằng số nguyên: C% theo phần mười, CM theo phần nghìn mol/L.
- Không mô phỏng sai số cân, bay hơi, sai số đọc vạch hay thời gian tan.
- Chỉ NaCl và CuSO₄ ở v1 (CuSO₄ có `hazard` mức `warning`, giữ cảnh báo từ `reagents.ts`).

## Đăng ký và tái sử dụng

| Phần | Nội dung |
|---|---|
| Config/sim | Mở rộng `ChemistryLabConfig`: `targets` (loại mục tiêu, giá trị, dung sai), `solutes` (chất, giới hạn tan). Action mới: `add_solid_mass` (khối lượng mg, thay cho `pieces` vốn chỉ hợp với hạt, viên), `stir`, `fill_to_mark`. Phép đo mới `volume` cho ống đong. Kind mới: `graduated_cylinder_100ml`, `volumetric_flask_100ml`, `glass_rod`, `spatula`. Reagent chất rắn mới `NaCl_powder`, `CuSO4_powder`. Golden: nồng độ đạt được cho các ca cân đúng, thiếu, thừa, quá giới hạn tan; golden hiện có của `mass-conservation@1.0.0`, FL-13, FL-14a phải giữ nguyên. |
| BE | Không có mục `EXPLORE_BENCHES` mới: dùng `k2-wet-bench@1` và validator mở rộng. Seed: thêm FL-11 vào `scripts/k2-explore-targets.ts` và `seed-k2-explore-labs.ts`, topic code B04. Phát hành qua Admin API như FL-13. |
| FE | Mục registry `k2-wet-bench@1` giữ nguyên. Cảnh bàn ướt: đăng ký renderer cho 4 kind mới trong `apparatus-renderers.tsx`; `apparatus-manifest.ts` thêm kind kèm `sharedItem`. |
| Item | Dùng chung từ `shared/items/`: `graduated-cylinder` (K2-3.3, đã có), `beaker`, `digital-scale`. Riêng của bàn (chưa có bàn thứ hai dùng): bình định mức, đũa thủy tinh, thìa. Vào thư viện chung chỉ khi bàn khác cũng cần, qua PR riêng cho K2 duyệt. Số đọc cân và vạch ống đong do bàn truyền vào qua props. |
| Nhật ký | Khóa `labId@activity.id`, dòng mới: cân chất tan, thêm nước, khuấy, đến vạch, kết luận. `describeChange()` mô tả bằng khối lượng và thể tích. |
| Class Explore | v1 chưa hỗ trợ. Đề xuất sau: yêu cầu `measure` kiểu khối lượng và thể tích, `explain`; mẫu giáo viên chọn chất và nồng độ mục tiêu. Cần quyết định riêng. |

## Nghiệm thu

- Lab hiện trong danh mục sau khi owner phát hành, mở đúng renderer, panel liệt kê đủ item của config đã ghim (kể cả ống đong).
- Golden bao phủ các ca nêu trên; config sai (chất ngoài danh sách, mục tiêu vượt giới hạn tan) dừng mở bàn.
- Seed trên DB cô lập: chạy lại giữ version, nội dung mới tạo version mới.
- Hồi quy: FL-13 pH, FL-14a, FL-10 Explore và Guided giữ nguyên kết quả; số đo bàn chất lỏng của Dev 1 không bị ảnh hưởng (item chung không đổi).

## Quyết định đã chốt (owner, 2026-11-16) và cách triển khai

| # | Quyết định | Triển khai |
|---|---|---|
| 1 | Hai mục tiêu bám SGK KHTN 8: (a) 100 mL NaCl 0,10 M (585 mg NaCl, M = 58,5), dung sai ±5 % (0,095 đến 0,105 M); (b) 50 g CuSO₄ 5 % (2 500 mg CuSO₄ + 47,5 mL nước), dung sai ±0,2 % | `targets` trong `fl-11.config.ts`: `molarity` (100 mM, ±5 mM) và `mass_percent` (5,0 %, ±0,2 %). So sánh dung sai bằng số nguyên, không làm tròn: 556 mg đạt, 555 mg không đạt (ca golden) |
| 2 | Tách phiên bản sim: `wet-bench@1.1.0` cho FL-11, `1.2.0` cho FL-12 | `WET_BENCH_ENGINES` nhận cả 1.0.0 và 1.1.0. Bộ phận của 1.1.0 (bột, độ tan, ống đong, bình định mức, đọc thể tích) bị từ chối trong config 1.0.0. BE ghi engine của config làm model của Lab (`modelRefOf`), nên FL-13 và FL-14a vẫn là 1.0.0. Gói sim lên 1.11.0 |
| 3 | Chỉ hiện nồng độ thực sau "Kết luận" | `assessSolution` ở sim; HUD chỉ hiện C% và CM khi học sinh bấm Kết luận. Thể tích ở cốc chỉ hiện "khoảng X mL" (làm tròn 10 mL), bình định mức chỉ cho biết đã đến vạch hay chưa, ống đong đọc đến 1 mL, để học sinh phải dùng ống đong và tự tính |
| 4 | Độ tan theo nhiệt độ hoãn sang INC sau FL-12 | Chưa làm |
| 5 | Giới hạn tan ở 20 °C làm hằng số, `reviewStatus: draft`: NaCl 360 mg/mL, CuSO₄ 200 mg/mL | `solutes` trong config. Lab mở được cho học sinh kèm nhãn "Dữ liệu chưa duyệt" như FL-13 |

Ba điểm kỹ thuật owner nêu thêm, và cách đã chốt trong code:

1. **Hai cách pha, hai dụng cụ.** CM dùng bình định mức: `fill_to_mark` thêm đúng lượng nước còn thiếu để đủ 100 mL (thể tích chất rắn bỏ qua, nên 100 mL dung dịch ứng với 100 g nước và C% với CM nhất quán). C% dùng cốc và ống đong (đong nước bằng ống đong, đổ sang cốc, khuấy). Bàn luôn tính cả hai giá trị khi kết luận.
2. **Khuấy và chuyển bình.** Không thêm cờ `isDissolved`: trạng thái này suy ra từ lượng bột chưa tan (`powders`) trong bình. `stir` hòa tan tới giới hạn tan của lượng nước đang có, phần dư vẫn là bột. Chuyển bình (`pour_all`) hoặc Kết luận khi còn bột bị từ chối với "Chất rắn chưa tan hết, cần thêm nước và khuấy đều" (mã `NOT_DISSOLVED`).
3. **Nhập khối lượng.** Học sinh chọn thìa, chọn lọ bột, nhập số mg (1 đến 50 000) hoặc bấm +0,1 g, +0,5 g, +1,0 g, rồi chọn vật chứa; một lần chọn là xong. Cân điện tử có nút "Về 0" (chỉ là hiển thị, không đổi mô hình) để đọc đúng khối lượng bột. Số cân làm tròn 0,01 g theo số nguyên, nên 585 mg hiện 0,59 g.

Điều khác với đề xuất ban đầu của spec này:
- Thêm chai nước rót trực tiếp `H2O_pour` (`dispenser: "pour"`): ống nhỏ giọt chỉ hút 1 mL một lần nên không dùng được để đong 47,5 mL.
- Vượt giới hạn tan không bị từ chối ngay lúc thêm bột: bột chỉ tan tới giới hạn khi khuấy, phần còn lại ở đáy.
- Ống đong có 20 vạch (mỗi vạch 5 mL), đọc làm tròn đến 1 mL. Đong 47,5 mL qua nấc rót cho kết quả 4,95 % (đạt dung sai ±0,2 %).

Trạng thái: **đã làm và đã phát hành lên Supabase (2026-11-16, owner đã tự kiểm trên fixture UI local)**; PR chưa merge, dữ liệu vẫn là bản nháp chờ reviewer Hóa. FE `e44562f` (nhánh `feat/fl-11-solution-bench`, chồng lên PR item chung), BE `493721b`, `aa7ef76`, `191e838` (nhánh `feat/fl-11-solution-sim`). Xem tại `/dev/lab-kits/k2?lab=fl-11`. Còn: reviewer Hóa duyệt dữ liệu (câu 5 của bản nháp), owner phát hành qua Admin API (`publish-k2-explore.ts --lab solution-concentration --apply`).

## Task

| ID | Task | Trạng thái |
|---|---|---|
| F11-1 | Sim: hợp đồng, engine hòa tan, validator, golden, bump sim 1.11.0, đồng bộ tarball | Xong |
| F11-2 | FE: renderer, nhập khối lượng, HUD, nhật ký, config, test | Xong |
| F11-3 | Seed, phát hành qua Admin API, kiểm chỉ-SELECT | Phát hành xong (Lab v1, resolver ok, 0 LabRun). Còn: merge PR và deploy, reviewer Hóa duyệt dữ liệu |
