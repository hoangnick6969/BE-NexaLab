# Spec áp dụng Explore: FL-11 Dung dịch và nồng độ

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 9), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md). Trạng thái: **bản nháp chờ owner duyệt** (K2-3.3, 2026-11-15). Mọi con số hóa học dưới đây là giả định phần mềm, chờ reviewer Hóa.

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

## Câu hỏi mở cho owner

1. Giá trị mục tiêu cụ thể của lát cắt đầu (chất, thể tích, nồng độ, dung sai) và nguồn sách KHTN 8.
2. Gộp thay đổi sim này vào `wet-bench@1.1.0` cùng FL-12, hay tách `1.1.0` (FL-11) và `1.2.0` (FL-12)? Đề xuất: tách, mỗi lần một thay đổi additive để dễ bắt hồi quy.
3. Hiện nồng độ thực ngay hay sau "Kết luận"? Đề xuất: sau "Kết luận", để học sinh tự tính trước.
4. Có làm độ tan theo nhiệt độ ở INC sau không, và bảng độ tan do ai cung cấp và duyệt?
5. Reviewer Hóa cho dữ liệu `NaCl_powder`, `CuSO4_powder` và giới hạn tan.

## Task đề xuất sau khi duyệt

| ID | Task | Chờ |
|---|---|---|
| F11-1 | Sim: contract mở rộng, engine hòa tan, validator, golden, bump sim, đồng bộ tarball sang FE | Duyệt spec, câu hỏi 1–2 |
| F11-2 | FE: renderer 4 kind, nhập khối lượng chất rắn, HUD, nhật ký | F11-1 |
| F11-3 | Seed, phát hành qua Admin API, kiểm chỉ-SELECT | F11-2, reviewer (câu 5) |
