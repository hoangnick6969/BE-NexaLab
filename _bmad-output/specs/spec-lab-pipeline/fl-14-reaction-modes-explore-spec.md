# Spec áp dụng Explore: FL-14 Phản ứng vô cơ và kim loại (mode 14b, 14c)

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 12), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md) (FL-14), [thiết kế bàn ướt §6.2](k2-wet-bench-explore-kit-design.md). Task K2-3.1 trong INC-3.

Trạng thái: **SPLIT đã được chủ dự án duyệt (2026-11-16); đã làm trên dev, chưa phát hành.** Mọi dữ liệu hóa học dưới đây là bản nháp (`reviewStatus: draft`, hiển thị nhãn "Dữ liệu chưa duyệt"), chờ reviewer Hóa. FL-14a (`metal-reactivity`, topic `KHTN8-L11`) giữ nguyên làm ca hồi quy.

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | Bàn ướt K2, `kit = k2-wet-bench@1`, `group = chemistry`. Mỗi mode là một Lab riêng, mode Explore, chưa có Guided. |
| Cách mở | `/labs/:id` với config đã ghim. |
| Mô hình | Phản ứng tức thời theo quy tắc (đã ghi trong catalog là "reaction database", không cần trục thời gian). Số lượng theo tỷ lượng, như các phản ứng hiện có của `k2-reactions@1`. |
| Engine | Không mở engine mới và không đổi code engine: chỉ thêm dữ liệu (chất, phản ứng, cặp trơ, config). 14b chạy `wet-bench@1.0.0`; 14c chạy `wet-bench@1.1.0` chỉ vì dụng cụ cái thìa (`spatula`) thuộc 1.1.0. Golden của 1.0.0, 1.1.0, 1.2.0 không đổi. |

## Đề xuất SPLIT

Hiện trạng: FL-14a đã cover "kim loại + acid loãng" và "kim loại + dung dịch muối" (Zn, Fe, Cu; HCl, CuSO₄). Catalog còn thiếu hai mảng chính chưa có Lab: **muối** (B11-O02, B11-O03) và **oxide** (B10-O03).

### 14b — Phản ứng của muối: kết tủa, khí, trao đổi (`labId` `salt-reactions`, `catalogId` FL-14b, topic `KHTN8-L11` Muối)

- **Outcome:** chính B11-O02 (muối tan, không tan), B11-O03 (muối phản ứng với acid, base, muối; nêu hiện tượng); hỗ trợ B11-O01, B11-O04, B02-O05 (dấu hiệu có phản ứng).
- **Dụng cụ:** như FL-14a (giá, 4 ống nghiệm, ống nhỏ giọt, cốc thải), không có cân hay đồng hồ.
- **Hóa chất (dung dịch 0,1 M):** Na₂CO₃, HCl (đã có), AgNO₃, NaCl, FeCl₃, NaOH (đã có ở FL-13), CuSO₄ (đã có), BaCl₂ và Na₂SO₄ (đã có).
- **Phản ứng cho phép (5, 4 mới):**

| Id | Phương trình | Quan sát |
|---|---|---|
| `gas.na2co3-hcl` (mới) | Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂↑ | sủi bọt khí (muối + acid) |
| `precip.agno3-nacl` (mới) | AgNO₃ + NaCl → AgCl↓ + NaNO₃ | kết tủa trắng |
| `precip.fecl3-naoh` (mới) | FeCl₃ + 3NaOH → Fe(OH)₃↓ + 3NaCl | kết tủa nâu đỏ (muối + base) |
| `precip.cuso4-naoh` (mới) | CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄ | kết tủa xanh lam (muối + base) |
| `precip.bacl2-na2so4` (có sẵn) | BaCl₂ + Na₂SO₄ → BaSO₄↓ + 2NaCl | kết tủa trắng (muối + muối) |

- **Ngoài phạm vi / trơ:** cặp không có phản ứng (NaCl + Na₂SO₄, Na₂CO₃ + NaCl, FeCl₃ + NaCl…) ghi "không có hiện tượng"; cặp có thể phản ứng nhưng chưa duyệt (ví dụ Na₂CO₃ + BaCl₂, AgNO₃ + HCl, AgNO₃ + Na₂SO₄) bị engine báo ngoài phạm vi Lab, không tự suy "không phản ứng".
- **An toàn:** AgNO₃ làm bẩn da, độc với thủy sinh; BaCl₂ độc (đã có nhãn); NaOH ăn mòn.
- **Giới hạn khai báo:** kết tủa lẫn nhau không tính màu hỗn hợp; không mô phỏng lượng dư làm tan kết tủa (ví dụ NaOH dư với Cu(OH)₂); không mô phỏng độ tan thực của AgCl, chỉ "kết tủa" hay "tan".

### 14c — Oxide với acid, phân loại oxide (`labId` `oxide-reactions`, `catalogId` FL-14c, topic `KHTN8-L10` Oxide)

- **Outcome:** chính B10-O03 (oxide kim loại phản ứng với acid); hỗ trợ B10-O01 (phân loại oxide theo khả năng phản ứng với acid/base), B10-O02 (phương trình tạo oxide: chỉ viết phương trình, không mô phỏng), B11-O04.
- **Dụng cụ:** như FL-14a, thêm thìa lấy bột oxide (kind chỉ cần một muỗng mỗi lần).
- **Hóa chất:** CuO (bột đen), MgO (bột trắng), Fe₂O₃ (bột nâu đỏ); acid HCl 0,1 M (đã có) và H₂SO₄ loãng 0,1 M (thêm); NaOH 0,1 M (để thử oxide với base).
- **Phản ứng cho phép (3 mới):**

| Id | Phương trình | Quan sát |
|---|---|---|
| `oxide-acid.cuo-h2so4` | CuO + H₂SO₄ → CuSO₄ + H₂O | bột đen tan, dung dịch xanh lam |
| `oxide-acid.mgo-hcl` | MgO + 2HCl → MgCl₂ + H₂O | bột trắng tan, dung dịch không màu, không sủi |
| `oxide-acid.fe2o3-hcl` | Fe₂O₃ + 6HCl → 2FeCl₃ + 3H₂O | bột nâu đỏ tan, dung dịch vàng nâu |

- **Cặp trơ (phân loại oxide base, B10-O01):** CuO, MgO, Fe₂O₃ với NaOH loãng: không có hiện tượng.
- **Chưa làm (ghi trong `limitations`):** oxide phi kim với base (CO₂, SO₂ là khí, cần thiết bị khí và review an toàn, để FL-15/INC sau); Al₂O₃ lưỡng tính; CaO + nước (tỏa nhiệt, chưa có mô hình nhiệt); phản ứng oxy hóa kim loại với O₂ (B10-O02, chỉ nêu trong lời nhắc).
- **An toàn:** bột CuO, Fe₂O₃ không hít; acid ăn mòn, đeo kính và găng tay.

### Không nằm trong hai mode này (đề nghị để sau)

- **Dãy hoạt động mở rộng (Mg, Al, Ag, AgNO₃):** thuộc K9 (`9/kim-loai/3, 4`), catalog yêu cầu đạt chuẩn nguồn gốc K9 trước. Nếu chủ dự án muốn ưu tiên mảng này thì thay cho 14c: Mg + HCl, Al + HCl, Cu + AgNO₃ (Cu đẩy Ag), Ag + CuSO₄ (trơ).
- Phản ứng cần trục thời gian, nhiệt, khí mới (FL-12, FL-15).

## Đã làm và khác với đề xuất ban đầu

- **14b:** kệ tối đa 8 lọ nên cặp BaCl₂ và Na₂SO₄ được thay bằng CuSO₄ (kệ 7 lọ: Na₂CO₃, HCl, AgNO₃, NaCl, FeCl₃, NaOH, CuSO₄). Phản ứng có 4 (3 kết tủa và 1 khí, không còn `precip.bacl2-na2so4`), và Lab không còn muối barium độc. Liều ống nhỏ giọt 250, 500 và 1000 µL.
- **14c:** chất rắn là bột oxide lấy bằng thìa, mỗi thìa tương ứng 0,125 mmol CuO, 0,25 mmol MgO và 0,0625 mmol Fe₂O₃ (cỡ khoảng 10 mg, nhỏ hơn thí nghiệm thật để dùng ít acid). Acid H₂SO₄ 0,1 M là hóa chất mới. Một thìa vượt lượng acid một lần nhỏ, nên bột còn dư là bình thường.
- **Nhật ký quan sát (FE):** thêm tên màu cho kết tủa (trắng, nâu đỏ, xanh lam), và dòng "Chất rắn tan hết/một phần, dung dịch chuyển sang màu ..." khi bột oxide tan. Chỉ áp dụng cho trường hợp trước đây rơi vào dòng "Không thấy biến đổi rõ rệt", không đổi lời của FL-11, FL-12, FL-13, FL-14a.
- **Cặp chất chưa duyệt được báo ngoài phạm vi** thay vì đoán: ở 14b là Na₂CO₃ với AgNO₃, FeCl₃, CuSO₄ và AgNO₃ với HCl, FeCl₃, NaOH, CuSO₄, Na₂SO₄; ở 14c là các cặp oxide với acid ngoài ba phản ứng (CuO với HCl, MgO với H₂SO₄, Fe₂O₃ với H₂SO₄). HCl với NaOH ở 14b cần phản ứng acid–base, bài này không cho phép.
- **Cần reviewer Hóa:** toàn bộ 7 phản ứng và 11 chất (khối lượng mol quy ước KHTN 8 với Ag 108, N 14, Mg 24), màu minh họa, và danh sách cặp trơ.

## Đã duyệt (2026-11-16)

1. Chấp nhận cách tách 14b (muối) và 14c (oxide), hay muốn 14c là dãy hoạt động mở rộng.
2. Tên labId: `salt-reactions`, `oxide-reactions`; topic `KHTN8-L11` (14b, trùng topic FL-14a) và `KHTN8-L10` (14c).
3. Giữ `wet-bench@1.0.0` (chỉ thêm dữ liệu), nếu code cho thấy cần tính năng mới thì hỏi lại trước khi mở `1.3.0`.

## Nghiệm thu (sau khi duyệt)

- Golden cho từng phản ứng mới và từng ca ngoài phạm vi; validator từ chối config sai; test sim hiện có (1.0.0, 1.1.0, 1.2.0) pass.
- FL-13, FL-14a, FL-10 giữ nguyên kết quả (k2-baseline, kit-items-panel, kit-components, explore-lab-space).
- Mỗi Lab: thẻ trong `lab-info.ts` (vi, en), ảnh bìa, icon dụng cụ mới, mục seed `scripts/k2-explore-targets.ts`, kiểm bằng `student.active` và `student.outsider`, không có request tạo LabRun/Attempt.
- Reviewer Hóa duyệt dữ liệu trước khi bỏ nhãn "Dữ liệu chưa duyệt". Không phát hành khi chưa được chủ dự án đồng ý.
