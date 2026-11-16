# Spec áp dụng Explore: bàn năng lượng cơ học (FL-24 Cơ năng, công và công suất)

| | |
|---|---|
| Trạng thái | **Owner chấp nhận Q-1 đến Q-5 như đề xuất** (2026-11-16). **Đã merge vào `main`** (2026-11-16, BE PR #96, FE PR #80; sim 1.21.0, Playwright 4/4). **Owner duyệt dữ liệu và cho phát hành 2026-11-16** (bỏ chờ Q-6): config `review.status: reviewed`, sim 1.22.0. **Đã phát hành lên DB dev 2026-11-16** (`mechanical-energy`, topic `KHTN9-CH01-T01`, Admin API, 201). Quy ước `P = 10·m` theo SGK KHTN 8, **chưa đối chiếu SGK KHTN 9** |
| Người viết | Dev 1 (Kit Vật lý), task D1-3.2 |
| Cập nhật | 2026-11-16 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) · cùng khuôn [FL-04](fl-04-liquid-pressure-explore-spec.md), [FL-08](fl-08-heat-transfer-explore-spec.md) |
| Nguồn | Yêu cầu cần đạt KHTN 9 `9/nang-luong-co-hoc/1…6` ([catalog](lab-catalog-and-shared-kits-khtn8-9.md)) · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 17) · [P0](lab-mode-foundation-p0-spec.md) |

FL-24 là Lab mới, chưa có Guided, nên không chờ D-5. **Khác FL-04 và FL-08:** catalog ghi "K9 provenance conditional" và repo chưa có SGK KHTN 9. Spec này bám **yêu cầu cần đạt của chương trình 2018**; số liệu và cách trình bày phụ thuộc SGK (quy ước `P = 10m`, thí nghiệm minh hoạ) được ghi thành câu hỏi. **Không phát hành trước khi owner cung cấp SGK KHTN 9 để đối chiếu** (Q-6).

| Yêu cầu cần đạt | Vai trò | Trạm |
|---|---|---|
| `9/nang-luong-co-hoc/1` Viết được biểu thức động năng | chính | 1 |
| `9/nang-luong-co-hoc/2` Viết được biểu thức thế năng gần mặt đất | chính | 1 |
| `9/nang-luong-co-hoc/3` Cơ năng là tổng động năng và thế năng | hỗ trợ | 1 |
| `9/nang-luong-co-hoc/4` Phân tích chuyển hoá năng lượng trong trường hợp đơn giản | chính | 1 |
| `9/nang-luong-co-hoc/5` Công bằng lực nhân quãng đường theo hướng của lực | chính | 2 |
| `9/nang-luong-co-hoc/6` Tính công và công suất trong trường hợp đơn giản | chính | 2 |

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn năng lượng cơ học**, `kit = "k5-energy-bench@1"`, `group = "physics"`, thuộc Kit cơ K5 nhưng **khác bàn đòn bẩy** `k5-lever-bench@1`. FE `src/features/labs/physics/mechanics/energy/`. Sim `packages/sim/mechanics/energy/` (mới); `lever-bench.ts` không đổi |
| Lab đầu tiên | **FL-24**, Lab ID đề xuất `mechanical-energy`, topic K9 (mã chốt khi seed, Q-5). Mode Explore |
| Cách mở | Dev `/dev/lab-kits/energy-explore`; fixture và thật qua registry. Phát hành bằng `npm run publish:fl24-explore` (Admin API, P0 C1.3), chỉ sau Q-6 |
| Mô hình | `mechanical-energy@1.0.0`. Đơn vị số nguyên: g, mm, mN, ms, mJ, mW. Quy ước trọng lượng `P = 10·m` (Q-3), nên `Wt = m·h/100` mJ (m tính bằng g, h bằng mm). `reviewStatus: draft` |

## 2. Lát cắt Explore

### 2.1 Trạm 1: Động năng, thế năng, cơ năng (con lắc, Q-1)

- Con lắc đơn: quả nặng chọn 100–500 g (bước 100 g), thả từ độ cao `h₀` 0–300 mm (bước 10 mm) so với điểm thấp nhất. Không ma sát, không lực cản.
- Học sinh kéo con lắc tới `h₀`, thả, rồi dừng hoặc tua theo vị trí (5 mốc: điểm thả, giữa, thấp nhất, giữa bên kia, điểm cao bên kia).
- Bàn hiện **thanh năng lượng** Wđ, Wt, W tại mốc đang xem. Số mJ ẩn mặc định để học sinh tự tính (Q-2), bật được bằng config.
- Hiện tượng phải thấy được: đi xuống thì Wt giảm, Wđ tăng; tại điểm thấp nhất Wđ lớn nhất; W không đổi; con lắc lên tới đúng độ cao `h₀` ở phía bên kia.

### 2.2 Trạm 2: Công và công suất (tời kéo vật)

- Tời kéo vật nặng lên theo phương thẳng đứng: chọn vật 200–2 000 g, quãng đường 100–1 000 mm, và một trong hai động cơ (nhanh, chậm) với thời gian kéo khác nhau.
- Lực kéo đều bằng trọng lượng `F = 10·m` (mN khi m tính bằng g), cùng hướng dịch chuyển.
- Bàn hiện lực kế, thước, đồng hồ. Học sinh đọc F, s, t và tính `A = F·s`, `P = A/t`. Kết quả hiện sau khi bấm "Kiểm tra" (Q-2).
- So sánh: cùng vật và quãng đường, hai động cơ cho cùng công nhưng công suất khác nhau.

### 2.3 Ngoài phạm vi v1

Ma sát và lực cản; lực xiên góc với hướng dịch chuyển (công âm, công bằng 0); máng trượt (có thể thêm ở v1.1, Q-1); hiệu suất máy; thế năng đàn hồi; đơn vị kWh.

## 3. Config và sim

`packages/sim/mechanics/energy/`: `contracts.ts` (`ENERGY_KIT`, `ENERGY_ENGINE`, schema `k5-energy-config/1` mở rộng envelope), `energy.ts` (`evaluatePendulum`, `evaluateHoist`), `validate-config.ts`, `fl24-energy.data.ts`, golden và test validator. Bump sim lên **số trống kế tiếp sau `main`**: thực tế **1.21.0** (1.20.0 đã bị FL-14b/c của K2 dùng), theo quy trình đồng bộ một lần trong ghi chú `pack` của đợt.

### 3.1 Mô hình

- **Trạm 1.** `Wt(h) = m·h/100`, `W = Wt(h₀)`, `Wđ(h) = W − Wt(h)` (mJ, số nguyên vì m bội 100 g, h bội 10 mm). Mốc giữa đặt ở `h₀/2`. Vận tốc chỉ để hình ảnh (không đưa vào kết quả).
- **Trạm 2.** `F = 10·m` mN, `A = F·s / 1000` mJ, `P = A·1000 / t` mW, làm tròn số nguyên chỉ khi hiển thị; so sánh hai động cơ bằng nhân chéo.

### 3.2 Golden và ca lỗi

| ID | Đầu vào | Kết quả |
|---|---|---|
| G-01 | m 200 g, h₀ 300 mm, mốc thả | Wt 600, Wđ 0, W 600 mJ |
| G-02 | cùng G-01, mốc giữa (150 mm) | Wt 300, Wđ 300, W 600 mJ |
| G-03 | cùng G-01, điểm thấp nhất | Wt 0, Wđ 600, W 600 mJ |
| G-04 | cùng G-01, phía bên kia | lên tới đúng 300 mm |
| G-05 | m 500 g, h₀ 100 mm | W 500 mJ; gấp đôi m thì gấp đôi W |
| G-06 | vật 1 000 g, s 500 mm | F 10 000 mN, A 5 000 mJ |
| G-07 | G-06, động cơ chậm t 4 000 ms / nhanh 2 000 ms | P 1 250 mW / 2 500 mW; cùng A |
| E-01 | m không phải bội 100 g, h ngoài 0–300 mm | từ chối |
| E-02 | t = 0, s ngoài khoảng, động cơ ngoài config | từ chối |
| E-03 | `modes.guided`, trạm trùng, thiếu thiết lập trạm | config sai |

## 4–9. BE, FE, item, nhật ký, Class Explore, nghiệm thu

Theo đúng khuôn FL-04 và FL-08:
- **BE:** mục `EXPLORE_BENCHES` + `energyBenchSpec`; seed target trong `scripts/explore-targets.ts`; lệnh `publish:fl24-explore` giới hạn `--kit`.
- **FE:** registry, trang, cảnh 3D theo `APPARATUS_RENDERERS` (kind: `pendulum`, `energy_bars`, `hoist`, `spring_gauge`, `ruler`, `stopwatch`; dùng lại `stopwatch` chung, thước và lực kế riêng của bàn), sơ đồ 2D cùng trạng thái, nhật ký cục bộ `scored: false`.
- **Class Explore:** v1 chưa hỗ trợ; đề xuất sau yêu cầu `measure` (mJ, mW) và `explain`.
- **Nghiệm thu:** golden; BE trên Postgres cô lập; Playwright (registry, G-02, G-03, G-07, config sai, 2D/3D, 390 px); hồi quy `lever-explore`, `fl06-class-explore`.

### Kết quả nghiệm thu trên dev/fixture (2026-11-16)

| Hạng mục | Kết quả |
|---|---|
| Sim + BE | `packages/sim/mechanics/energy` golden G-01..G-07, E-01..E-03; vitest `packages/sim` + `src/modules/labs` 639 passed, tsc sạch (BE `8bc35d3`) |
| FE unit | `energy-explore.test.ts` 7/7 (kit item, đơn vị SGK, nhật ký con lắc và tời, so khớp số học sinh nhập) |
| FE Playwright | `tests/energy-explore.spec.ts` 4/4: mở qua registry, G-01..G-05 trên thanh năng lượng (số ẩn mặc định), G-06/G-07 lực kế, thước, đồng hồ, "Kiểm tra", so sánh hai động cơ, nhật ký giữ sau F5, xuất `scored: false`, không gọi API run; config chỉ trạm con lắc có số; config sai (`modes.guided`) dừng bàn; 2D, reduced motion; 390 px |
| Hồi quy FE | fluid-pressure, heat-transfer, lever-explore, fl06-class-explore, explore-pinned-config, biology-explore-benches, fl15-safety: 34 passed cùng FL-24, 3 skipped (ca FL-15 cần server live cô lập) |
| Cảnh 3D | Con lắc treo trên giá một trụ phía sau mặt phẳng dao động (thả tới h₀ = L/2, 60°, không chạm giá); con lắc và thanh năng lượng vẽ ở 1/2 tỉ lệ, tời ở 0,3; camera riêng cho từng trạm và cho màn hẹp |
| Phát hành (2026-11-16) | Owner duyệt, bỏ chờ Q-6. `npm run publish:fl24-explore -- --publish` qua API dev (code `main` + nhánh `feat/dev1-fl24-publish`): 201, activity `mechanical-energy-explore` v1. `GET /labs` của admin và `student.active` có `mechanical-energy`, `explore.ok: true`, `review.status: reviewed`. Trình duyệt thật với `student.active`: mở bàn `k5-energy-bench@1`, không có thông báo giả định, không gọi API run |
| Chưa làm | Đối chiếu SGK KHTN 9 khi có sách (quy ước `P = 10·m`, thí nghiệm minh hoạ); Class Explore (v1 chưa hỗ trợ); BE trên Postgres cô lập cho FL-24 chưa chạy riêng |

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| Nguồn K9 | Chưa có SGK KHTN 9 trong repo; quy ước `P = 10m`, ký hiệu và thí nghiệm minh hoạ phải đối chiếu trước khi phát hành |
| Bàn cơ K5 | Bàn mới cạnh bàn đòn bẩy; không sửa `lever-bench` nên FL-06 Guided và Explore không bị ảnh hưởng |
| Bump sim | Ba dev nâng song song; chọn số trống ngay trước khi pack, gom một lần đồng bộ FE |

## 11. Câu hỏi cho owner

Nếu đồng ý cả sáu đề xuất, chỉ cần trả lời "duyệt".

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-1 | Trạm 1 dùng con lắc hay máng trượt | Con lắc đơn ở v1 (thấy rõ chuyển hoá hai chiều, lên lại đúng độ cao); máng trượt để v1.1 |
| Q-2 | Hiện số mJ, mW cho học sinh không | Thanh năng lượng luôn hiện; số ẩn mặc định để học sinh tự tính, config bật được |
| Q-3 | Quy ước trọng lượng | `P = 10·m` như SGK KHTN 8 (đã dùng ở FL-04); đối chiếu lại với SGK KHTN 9 |
| Q-4 | ID bàn và engine | `k5-energy-bench@1`, `k5-energy-config/1`, `mechanical-energy@1.0.0`; độc lập với `lever-bench` |
| Q-5 | Lab ID và topic | `mechanical-energy`; mã topic K9 chốt khi seed (cần mã bài KHTN 9 trong DB) |
| Q-6 | Phát hành | Làm và nghiệm thu trên dev/fixture; **chỉ phát hành sau khi owner cung cấp SGK KHTN 9** để đối chiếu nguồn |
