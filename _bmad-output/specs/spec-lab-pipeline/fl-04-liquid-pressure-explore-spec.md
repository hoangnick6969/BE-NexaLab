# Spec áp dụng Explore: bàn chất lỏng (FL-04 Áp suất chất lỏng)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): chấp nhận Q-1 đến Q-6. **Đã làm trên dev/fixture** (F04-1 đến F04-5, §13); chưa seed, chưa phát hành |
| Người viết | Dev 1 (Kit Vật lý), task D1-3.2 |
| Cập nhật | 2026-11-16 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) |
| Nguồn | SGK KHTN 8 Kết nối tri thức, Bài 16 (tr. 67–71) · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 3) · [catalog](lab-catalog-and-shared-kits-khtn8-9.md) · [tracking](lab-kit-delivery-tracking.md) · [spec bàn cơ FL-06](fl-06-mechanics-bench-explore-spec.md) · [kế hoạch FL-03 K3](fl-03-density-k3-plan.md) |

FL-04 là Lab mới, chưa có Guided, nên **không chờ D-5**: sau nghiệm thu, owner phát hành qua `publishExploreLab` như FL-11 và FL-26. Đây cũng là lần đầu bàn chất lỏng K3 vào registry Explore (bàn thật thứ ba của Dev 1 sau bàn cơ).

**Lệch nguồn cần biết.** Catalog và portfolio ghi FL-04 gồm `p = F/S` và `p = d·h`. SGK Kết nối tri thức Bài 16 **không có công thức `p = d·h`**: cả bài là định tính (màng cao su biến dạng, truyền áp suất nguyên vẹn, áp suất khí quyển). `p = F/S` thuộc Bài 15 (Áp suất trên một bề mặt), không phải bài này. Spec bám SGK: mô hình bên trong tính áp suất đúng vật lí để điều khiển hiện tượng, còn giao diện mặc định chỉ cho thấy hiện tượng (Q-2).

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn chất lỏng**. ID bàn `kit = "k3-fluid-bench@1"`, `group = "physics"`. FE: `src/features/labs/physics/fluid/` (cảnh K3 có sẵn ở `kit/`, Lab mới ở `pressure/`). Sim: `packages/sim/fluid/` (mới) |
| Lab đầu tiên | **FL-04**, Lab ID đề xuất `liquid-pressure`, topic `KHTN8-L16` (xác nhận khi seed; FL-05 là `KHTN8-L17`). Chưa có Guided, mode triển khai Explore. Outcome chính B16-O01, B16-O02; B16-O03 để v2 (§2.3) |
| Cách mở | Dev: `/dev/lab-kits/fluid-explore` với config đóng gói. Fixture và thật: `/labs/:id` qua registry. Phát hành qua `publishExploreLab`, không phụ thuộc D-5 |
| Mô hình | `fluid-pressure@1.0.0` (mới). Đơn vị số nguyên: mm, Pa, mN, mm². Trọng lượng riêng nước `d = 10 000 N/m³` (cùng quy ước `P = 10m` của SGK), nên áp suất theo độ sâu là **10 Pa/mm**. Provenance `technical_assumption`, `reviewStatus: draft`, chờ reviewer Lý |

## 2. Lát cắt Explore

Hai trạm trong một bàn, học sinh chuyển trạm bằng tab như FL-03.

### 2.1 Trạm 1: Tác dụng của chất lỏng lên vật đặt trong nó (SGK Thí nghiệm 1)

- Bể trong suốt cao 300 mm, mực nước 280 mm (config).
- Bình trụ có đáy C và hai lỗ A, B ở thành, bịt màng cao su. Tâm A và B cao hơn đáy C 30 mm.
- Học sinh hạ hoặc nâng bình trụ theo độ sâu của đáy C: 0–250 mm, bước 10 mm (thanh trượt và nút ±10 mm). Học sinh dời bình ngang qua 5 vị trí, −100 đến 100 mm, bước 50 mm.
- Sau mỗi thay đổi, sim tính áp suất tại mỗi màng. Ba màng lõm vào trong theo **mức biến dạng 0–5**: A và B lõm từ hai bên vào, C lõm từ dưới lên. Có thước đo độ sâu dọc thành bể.
- Hiện tượng học sinh phải thấy được, khớp ba câu hỏi SGK:
  1. Màng lõm vào nên chất lỏng tác dụng lên bình theo mọi phương: từ dưới lên ở C, ngang ở A và B.
  2. Cùng độ sâu, dời ngang thì mức biến dạng không đổi.
  3. Sâu hơn (từ P đến Q) thì biến dạng lớn hơn.

### 2.2 Trạm 2: Sự truyền áp suất chất lỏng (SGK Thí nghiệm 2)

- Hai xi lanh thông nhau chứa nước. Pit-tông (1) có tiết diện gấp đôi pit-tông (2) (config: 2 000 mm² và 1 000 mm²). Mỗi pit-tông có đĩa đặt quả nặng.
- Có 12 quả nặng giống nhau, 1 N mỗi quả (config). Học sinh đặt hoặc gỡ quả nặng trên từng đĩa, tối đa 6 quả mỗi đĩa như Hình 16.3.
- Sim so áp suất hai bên bằng nhân chéo số nguyên. Kết quả là "Hai pit-tông cân bằng", "Pit-tông (1) đi xuống, (2) đi lên" hoặc ngược lại. Cảnh dời pit-tông một đoạn cố định theo hướng đó; không mô phỏng quãng đường.
- Ca SGK: 4 quả bên (1) cân với 2 quả bên (2); 2 quả bên (1) cân với 1 quả bên (2).
- Câu hỏi gợi quan sát (tùy chọn, chỉ vào nhật ký): "Từ kết quả, rút ra kết luận về sự truyền áp suất tác dụng vào chất lỏng theo mọi hướng."

### 2.3 Ngoài phạm vi v1

- **Áp suất khí quyển (B16-O03, Thí nghiệm 3 và Hình 16.8).** Đây là thí nghiệm minh hoạ có hoặc không có hiện tượng (nước không chảy, tấm nylon không rơi). Mô hình hoá có ý nghĩa cần thêm áp suất khí quyển và trạng thái kín/hở; đề xuất làm v2 (`fluid-pressure@1.1.0`) sau khi owner chốt (Q-1).
- Chất lỏng khác nước, công thức `p = d·h` hiện cho học sinh, đơn vị áp suất (B15), áp suất khí quyển cộng vào áp suất chất lỏng. Mô hình chỉ tính áp suất dư do cột nước.
- Bình có hình dạng khác nhau (nghịch lí thuỷ tĩnh), bình thông nhau chứa hai chất lỏng, máy nén thuỷ lực có số đo lực (Hình 16.5 chỉ dùng làm câu hỏi vận dụng).
- Độ đàn hồi thật của màng, ma sát pit-tông, khối lượng pit-tông, thể tích nước bị dời. Ghi trong `limitations`.

## 3. Config và sim

**Thư mục** `packages/sim/fluid/`, export `@nexalab/sim/fluid`:

| File | Nội dung |
|---|---|
| `contracts.ts` | `FLUID_KIT = "k3-fluid-bench@1"`, `FLUID_ENGINE = "fluid-pressure@1.0.0"`, `APPARATUS_KINDS`, `fluidLabConfigSchema` |
| `pressure.ts` | `evaluateDepthProbe(config, state)` và `evaluatePistons(config, state)`. Hàm thuần, số nguyên |
| `validate-config.ts` | `validateFluidLabConfig(raw) → { ok, config, warnings } \| { ok: false, errors, warnings }` |
| `fl04-pressure.data.ts` | Config đóng gói FL-04 |
| `fl04-pressure.golden.test.ts`, `validate-config.test.ts` | Golden và ca lỗi (§3.3) |

Thêm thư mục mới nên phải bump `@nexalab/sim` và đồng bộ tarball sang FE. Số dự kiến **1.16.0** (1.13.0 Dev 2 giữ cho FL-26; 1.14.0 và 1.15.0 là PR A/B của D1-3.1). Fetch `main` và chọn số trống kế tiếp ngay trước khi pack.

### 3.1 Schema `k3-fluid-config/1`

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `schema`, `labId`, `kit`, `engine` | chuỗi | `k3-fluid-config/1`, `liquid-pressure`, `k3-fluid-bench@1`, `fluid-pressure@1.0.0` |
| `liquid` | `{ id: "water", weightDensityNPerM3: 10000 }` | v1 chỉ nhận nước |
| `stations` | mảng 1–2 trạm, không trùng | `depth-probe`, `pistons` |
| `depthProbe` | `{ tankHeightMm: 300, waterLevelMm: 280, maxDepthMm: 250, depthStepMm: 10, sideHoleOffsetMm: 30, positionsMm: [-100,-50,0,50,100] }` | Bắt buộc khi có trạm `depth-probe` |
| `pistons` | `{ areasMm2: [2000, 1000], weightMilliNewtons: 1000, weightCount: 12, maxPerPan: 6 }` | Bắt buộc khi có trạm `pistons` |
| `display` | `{ pressureReading: boolean, deformationLevels: 5 }` | `pressureReading` mặc định `false` (Q-2) |
| `prompts` | mảng chuỗi, tối đa 3 | Câu hỏi gợi quan sát |
| `modes` | `{ explore: true }` | Khai báo `guided` bị từ chối (như K2) |

### 3.2 Mô hình

- **Trạm 1.** Độ sâu màng C là `h`; độ sâu màng A, B là `max(0, h − 30)`. Áp suất `p = 10 × độ sâu` (Pa, số nguyên). Mức biến dạng `k = ceil(p × 5 / (10 × maxDepthMm))`, giới hạn 0–5; màng ở trên mặt nước có `k = 0`. Vị trí ngang không vào công thức: cùng `h` thì cùng kết quả ở mọi vị trí.
- **Trạm 2.** Đặt `n₁, n₂` quả, trọng lượng mỗi quả `w`. So `n₁·w·S₂` với `n₂·w·S₁` (nhân chéo, không chia). Bằng nhau thì cân bằng; vế nào lớn hơn thì pit-tông đó đi xuống. Áp suất từng bên (Pa, làm tròn số nguyên) chỉ hiện khi `display.pressureReading = true`.
- Output có `limitations`: `gauge_pressure_only`, `ideal_membrane`, `pistons_massless_frictionless`, `direction_only`.

### 3.3 Golden và ca lỗi

| ID | Đầu vào | Kết quả |
|---|---|---|
| G-01 | `h = 0` | p_C = 0, p_A = p_B = 0, mọi màng mức 0 |
| G-02 | `h = 100`, x = 0 | p_C = 1 000 Pa (mức 2), p_A = p_B = 700 Pa (mức 2) |
| G-03 | `h = 100`, x = −100 và x = 100 | Giống hệt G-02 |
| G-04 | `h = 250` | p_C = 2 500 Pa (mức 5), p_A = p_B = 2 200 Pa (mức 5) |
| G-05 | `h = 20` | p_C = 200 Pa (mức 1), A/B ở trên mặt nước nên mức 0 |
| G-06 | n₁ = 4, n₂ = 2 | Cân bằng (SGK) |
| G-07 | n₁ = 2, n₂ = 1 | Cân bằng (SGK) |
| G-08 | n₁ = 4, n₂ = 1 | Pit-tông (1) đi xuống |
| G-09 | n₁ = 1, n₂ = 1 | Pit-tông (2) đi xuống |
| G-10 | n₁ = n₂ = 0 | Cân bằng |
| E-01 | `h = 255` hoặc `h = 260` | Từ chối: lệch bước hoặc vượt `maxDepthMm` |
| E-02 | `maxDepthMm ≥ waterLevelMm` | Config sai: đáy bình trụ chạm đáy bể |
| E-03 | n₁ = 7 hoặc n₁ + n₂ > 12 | Từ chối: vượt đĩa hoặc vượt bộ quả nặng |
| E-04 | `liquid.id ≠ "water"`, `modes.guided` có mặt, trạm trùng | Config sai |

## 4. BE

- `EXPLORE_BENCHES[FLUID_KIT]`: `modelRef = FLUID_ENGINE`, `validate = validateFluidLabConfig`, `activitySpec = fluidBenchSpec` (mục tiêu, outcome B16-O01/O02, vật liệu theo trạm, quy trình và an toàn ngắn). `deriveClass` chưa có ở v1 (§8).
- Seed: `scripts/seed-fluid-explore-labs.ts` theo mẫu bàn cơ, topic `KHTN8-L16`. Chạy `npm run db:seed:explore -- --kit k3-fluid-bench@1` trên DB cô lập: chạy lại giữ version, nội dung mới tạo version mới.
- Phát hành: `publishExploreLab` với `topicCode: "KHTN8-L16"`, owner chạy sau nghiệm thu. Kiểm chỉ-SELECT trên Supabase.
- Unit test: registry nhận config FL-04; config sai trả `EXPLORE_CONFIG_INVALID`; activity spec qua `exploreActivitySpecSchema`.

## 5. FE

| Phần | Nội dung |
|---|---|
| Registry | Mục `k3-fluid-bench@1` trong `runtime/explore-registry.ts`: `group: "physics"`, `validate`, `loadPage` (lazy), `listKitItems` |
| Trang | `physics/fluid/pressure/PressureExploreLabPage.tsx` trong `LabSpace`; tab trạm như FL-03; panel nhật ký và giới hạn mô hình dùng phần chung |
| Cảnh 3D | Dùng phòng và bàn K3 (`FluidBench3D`, camera preset). Item mới của bàn: bể cao `TallTank3D`, bình trụ màng `MembraneProbe3D` (màng lõm theo mức, spring giảm chấn, reduced motion thì đứng yên), hai xi lanh `PistonPair3D`, quả nặng `PanWeight3D`, thước độ sâu. Canvas là trang trí: mọi số và trạng thái có trong DOM |
| 2D | Sơ đồ mặt cắt cùng trạng thái (như `Density2DStage`): bể, thước, ba màng có mũi tên tỉ lệ mức; hai pit-tông với số quả nặng. Nút 2D/3D nhớ lựa chọn |
| Tương tác | Thanh trượt độ sâu, nút ±10 mm, 5 nút vị trí; +/− quả nặng mỗi đĩa. Bàn phím đầy đủ; vừa 390 px không cuộn ngang |

FL-03 và FL-05 Guided **không đổi**: item mới để trong `pressure/` hoặc `kit/apparatus/` dưới tên mới, không sửa component của FL-03/05.

## 6. Item

| Item | Nguồn | Ghi chú |
|---|---|---|
| Bể trong suốt, bình trụ màng, xi lanh thông nhau, quả nặng đĩa, thước độ sâu | Riêng của bàn K3 | Chưa có bàn thứ hai cần. Vào `shared/items/` chỉ khi bàn khác dùng, qua PR riêng cho K2 duyệt (C2.1) |
| `beaker`, `digital-scale` | `shared/items/` | Không dùng ở v1 |

`listKitItems` trả item theo trạm đã bật trong config: chỉ bật `pistons` thì không có bể và bình trụ.

## 7. Nhật ký

Khóa `liquid-pressure@<activity.id>`. Dòng mới:
- `probe`: "Bình trụ ở độ sâu 100 mm, vị trí giữa: màng C mức 2, A mức 2, B mức 2" (thêm Pa khi bật `pressureReading`).
- `pistons`: "Đĩa (1) 4 quả, đĩa (2) 2 quả: hai pit-tông cân bằng".
- `note`: câu trả lời tự do cho câu hỏi gợi ý.

`describeFluidChange()` chỉ mô tả hiện tượng; export có `scored: false`. Dùng phần lưu/đọc và export chung.

## 8. Class Explore

v1 chưa hỗ trợ. Đề xuất sau (cần quyết định riêng): mẫu `depth-and-direction` (giáo viên chọn trạm, bật số Pa, câu hỏi), yêu cầu `explain` và `measure` theo bảng đơn vị chung `explore/requirements.ts` của D1-3.1 (thêm `pascals`).

## 9. Nghiệm thu

- Sim: golden và ca lỗi §3.3 pass; test cũ của sim (gồm `buoyancy`, `lever-bench`, wet bench) pass.
- BE: unit test §4 pass; seed trên DB cô lập đúng version.
- FE: lint, build, regression; unit test `listFluidKitItems`.
- Playwright `tests/fluid-pressure-explore.spec.ts`, mock API, không ghi Supabase:
  1. dòng `GET /labs` mock có `mode: "explore"`, `kit: "k3-fluid-bench@1"`; `/labs/liquid-pressure` mở đúng trang qua registry;
  2. panel liệt kê đúng item của config, kể cả config chỉ một trạm;
  3. hạ bình trụ từ 20 mm lên 100 mm: mức màng tăng; dời ngang ở 100 mm: mức giữ nguyên (G-02, G-03);
  4. 4 quả bên (1), 2 quả bên (2): "Hai pit-tông cân bằng"; thêm một quả bên (1): pit-tông (1) đi xuống;
  5. nhật ký có dòng mới, còn sau F5, export có `scored: false`; không có request `/lab-runs` hay `/attempts`;
  6. config sai dừng mở bàn với `EXPLORE_CONFIG_INVALID`;
  7. 2D và 3D cùng trạng thái; vừa 390 px; reduced motion không có chuyển động.
- Hồi quy: `density-lab`, `buoyancy-*`, baseline D1-0.1, `k3-kit-preview`, `lever-explore` pass.
- Sau phát hành: thẻ Lab hiện trong danh mục với nhãn "Dữ liệu chưa duyệt", mở được bàn, kiểm chỉ-SELECT `ok: true`.

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| Lệch nguồn catalog | Catalog ghi `p = d·h` nhưng SGK Kết nối tri thức không có. Cần owner xác nhận bám SGK (Q-2) và sửa dòng FL-04 trong catalog sau khi duyệt |
| Bump sim | Phải đồng bộ tarball sang FE cùng PR; FE và BE lệch phiên bản sẽ hiện `EXPLORE_CONFIG_INVALID`. Số sim phụ thuộc thứ tự merge PR A/B của D1-3.1 |
| Cảnh K3 | Bàn K3 đang có PR cân chung (`feat/dev1-fl03-shared-scale`). FL-04 không dùng cân, nhưng nên merge PR đó trước để tránh xung đột ở `kit/index.ts` |
| Dữ liệu chưa duyệt | Mô hình là giả định kĩ thuật; cần reviewer Lý xác nhận quy ước 10 Pa/mm và cách hiện mức biến dạng trước khi bỏ nhãn |
| Phát hành sớm | Lab mới nên phát hành được ngay sau nghiệm thu, nhưng owner vẫn cần tự kiểm trên fixture như FL-11 |

## 11. Quyết định của owner

Owner duyệt ngày 2026-11-16, chấp nhận cả sáu đề xuất.

| ID | Câu hỏi | Quyết định |
|---|---|---|
| Q-1 | v1 gồm những thí nghiệm nào? | Trạm 1 (màng cao su theo độ sâu) và Trạm 2 (Pascal). Áp suất khí quyển (TN3, Hình 16.8) để v2 `fluid-pressure@1.1.0` |
| Q-2 | Có hiện số áp suất (Pa) cho học sinh không? | Mặc định **không**, bám SGK định tính: chỉ thấy mức biến dạng và hướng pit-tông. Config `display.pressureReading` bật được (sau này qua C3) |
| Q-3 | Quy ước trọng lượng riêng nước | `d = 10 000 N/m³` (10 Pa/mm), cùng quy ước `P = 10m` của SGK, số nguyên |
| Q-4 | Chất lỏng ở v1 | Chỉ nước. Nước muối hoặc dầu để sau, cần bảng số liệu đã duyệt |
| Q-5 | ID | Bàn `k3-fluid-bench@1`, schema `k3-fluid-config/1`, engine `fluid-pressure@1.0.0`, Lab `liquid-pressure`, topic `KHTN8-L16` |
| Q-6 | Phát hành | Phát hành qua `publishExploreLab` ngay sau nghiệm thu và owner tự kiểm, kèm nhãn "Dữ liệu chưa duyệt" như FL-11; không chờ reviewer Lý |

## 12. Việc theo task (sau khi duyệt)

| Task | Việc | File chính |
|---|---|---|
| F04-1 | Schema, mô hình, validator, config FL-04, golden; bump sim | `packages/sim/fluid/*`, `packages/sim/package.json` |
| F04-2 | `EXPLORE_BENCHES` + `fluidBenchSpec`, seed, unit test | `explore-labs.ts`, `scripts/seed-fluid-explore-labs.ts` |
| F04-3 | Registry FE, trang, cảnh 3D/2D, item, `listFluidKitItems`, dev preview | `runtime/explore-registry.ts`, `physics/fluid/pressure/*`, `App.tsx` |
| F04-4 | Nhật ký `describeFluidChange`, export | `physics/fluid/pressure/pressure-log.ts` |
| F04-5 | Playwright §9, hồi quy; phát hành qua Admin API và kiểm chỉ-SELECT | `tests/fluid-pressure-explore.spec.ts` |

## 13. Ghi chú triển khai (2026-11-16)

| Task | Kết quả |
|---|---|
| F04-1 | BE `packages/sim/fluid/` (`contracts.ts`, `pressure.ts`, `validate-config.ts`, `fl04-pressure.data.ts`, golden và test validator). Mức biến dạng `ceil(p × 5 / (10 × maxDepthMm))`; pit-tông so `n₁·w·S₂` với `n₂·w·S₁`. Sim **1.16.0**, tarball đồng bộ sang FE |
| F04-2 | `EXPLORE_BENCHES["k3-fluid-bench@1"]` + `fluidBenchSpec` (không có `deriveClass`). Seed target `scripts/fluid-explore-targets.ts`, `npm run db:seed:explore -- --kit k3-fluid-bench@1`, topic `KHTN8-L16` |
| F04-3 | FE `physics/fluid/pressure/`: `FluidExploreBench`, `PressureStage3D` (camera riêng cho mỗi trạm, màng lõm theo mức, pit-tông dời theo hướng), `PressureStage2D` (mặt cắt SVG, mũi tên theo mức), `listFluidKitItems`, trang `/labs/:id`, dev `/dev/lab-kits/fluid-explore`. FL-03/FL-05 không đổi |
| F04-4 | `pressure-log.ts`: dòng trạm 1 và trạm 2, kéo thanh trượt gộp một dòng, export `scored: false` |
| F04-5 | Playwright `tests/fluid-pressure-explore.spec.ts` 4/4 (registry, G-02/G-03/G-06/G-08, thao tác bị chặn, nhật ký sau F5 và export, không `/lab-runs`, config một trạm, `pressureReading`, config sai, 2D/3D cùng trạng thái, reduced motion, 390 px) |

Nhánh: BE `feat/dev1-fl04-liquid-pressure` (chồng lên `docs/dev1-fl04-explore-spec`, tức PR B của D1-3.1), FE `feat/dev1-fl04-liquid-pressure` (chồng lên PR B FE). Còn lại: merge PR A, PR B rồi PR này (BE và FE cùng lúc); owner seed trên DB cô lập, tự kiểm, rồi phát hành qua `publishExploreLab` (`topicCode: "KHTN8-L16"`) và kiểm chỉ-SELECT; xác nhận topic `KHTN8-L16` có trong DB; sửa dòng FL-04 trong catalog (bỏ `p = d·h`).

## 14. Phát hành theo P0 C1.3 (cập nhật 2026-11-16)

Chỉ có hai lối ghi, cả hai qua `publishExploreLab`:

| | Lệnh | Ghi chú |
|---|---|---|
| Seed, DB cô lập | `npm run db:seed:explore -- --kit k3-fluid-bench@1` | `assertIsolatedDatabase()` chạy trước mọi lệnh ghi |
| Phát hành, DB dùng chung | `npm run publish:fl04-explore` (dry run, ghi file request) rồi `npm run publish:fl04-explore -- --publish --reason "..."` với `NEXALAB_ADMIN_API_URL` và `NEXALAB_ADMIN_TOKEN` | Script `scripts/publish-explore.ts` gọi `POST /admin/labs/liquid-pressure/explore-versions` (ADMIN, Zod, audit); không ghi DB trực tiếp |

Dry run trên `main` (2026-11-16): config hợp lệ với validator của bàn và schema request của Admin API. Topic `KHTN8-L16` chưa đối chiếu được vì máy không có `NEXA-LAB_Content tool/catalog-registry.json`; owner kiểm topic có trong DB trước khi `--publish`.
