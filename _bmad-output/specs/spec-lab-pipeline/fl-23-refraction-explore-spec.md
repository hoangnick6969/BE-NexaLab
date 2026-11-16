# Spec áp dụng Explore: bàn quang học, lát cắt khúc xạ (FL-23 Quang học)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): chấp nhận Q-1 đến Q-7 như đề xuất. **Đã làm trên dev/fixture** (sim 1.23.0, BE+FE `feat/dev1-fl23-refraction`, Playwright 4/4, §12). Config `review.status: reviewed` (Q-7). **Đã merge** (BE PR #100, FE PR #84) và **đã phát hành lên DB dev 2026-11-16** (`light-refraction`, topic `KHTN9-CH02-T01`, Admin API, 201). **v1.1 lăng kính và tán sắc: owner duyệt Q-8 đến Q-13 (2026-11-16); đã làm trên dev/fixture** (sim 1.24.0, BE+FE `feat/dev1-fl23-prism`, §13.5); phát hành config v2 sau khi merge |
| Người viết | Dev 1 (Kit Vật lý), task D1-3.2 |
| Cập nhật | 2026-11-16 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) · cùng khuôn [FL-04](fl-04-liquid-pressure-explore-spec.md), [FL-08](fl-08-heat-transfer-explore-spec.md), [FL-24](fl-24-mechanical-energy-explore-spec.md) |
| Nguồn | Yêu cầu cần đạt KHTN 9 `9/anh-sang/1…10` ([catalog](lab-catalog-and-shared-kits-khtn8-9.md), CAT-5) · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 16) · [P0](lab-mode-foundation-p0-spec.md) |

FL-23 là Lab mới, chưa có Guided, nên không chờ D-5. Catalog xếp FL-23 vào nhóm `SPLIT`: một candidate gộp khúc xạ, phản xạ toàn phần, lăng kính và thấu kính. Bảng phân công 20 slot chốt hướng đi: **"Đề xuất Explore cho một lát cắt khúc xạ. Chốt phạm vi `SPLIT` và nguồn K9 trước khi mở rộng"**. Spec này chỉ làm lát cắt đó.

Như FL-24, repo chưa có SGK KHTN 9 (file `sgk-khtn.pdf` ở thư mục gốc là SGK KHTN 8). Spec bám **yêu cầu cần đạt của chương trình 2018**. Những gì phụ thuộc SGK (chiết suất dùng cho thuỷ tinh và nước, cách bố trí thí nghiệm, ký hiệu) được ghi thành câu hỏi. DB dev đã có topic **`KHTN9-CH02-T01` "Ánh sáng"** (outcomes `anh-sang/1…10`, `active`), nên seed không cần mã placeholder.

| Yêu cầu cần đạt | Vai trò ở v1 | Trạm |
|---|---|---|
| `9/anh-sang/1` Thực hiện thí nghiệm để rút ra và phát biểu định luật khúc xạ ánh sáng | chính | 1 |
| `9/anh-sang/2` Chiết suất bằng tỉ số tốc độ ánh sáng trong không khí (chân không) và trong môi trường | chính | 1 |
| `9/anh-sang/3` Thí nghiệm rút ra điều kiện phản xạ toàn phần và xác định góc tới hạn | chính | 2 |
| `9/anh-sang/4` Vẽ đường truyền tia sáng qua lăng kính · `/5` tán sắc (định tính) | **ngoài v1** (v1.1, Q-1) | — |
| `9/anh-sang/6…10` Thấu kính, vẽ ảnh, đo tiêu cự, kính lúp, sơ đồ tỉ lệ | **ngoài v1** (Lab thấu kính riêng, Q-1) | — |

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn quang học**, `kit = "k6-optics-bench@1"`, `group = "physics"`, Kit K6. FE `src/features/labs/physics/optics/refraction/` (thư mục `physics/optics/` hiện chỉ có README). Sim `packages/sim/optics/` (mới). `eye-optics.ts` (FL-25 mắt) không đổi |
| Lab đầu tiên | **FL-23**, Lab ID đề xuất `light-refraction` (Q-2), topic `KHTN9-CH02-T01`. Mode Explore |
| Cách mở | Dev `/dev/lab-kits/refraction-explore`; fixture và thật qua registry. Phát hành bằng `npm run publish:fl23-explore` (Admin API, P0 C1.3) sau khi owner duyệt |
| Mô hình | `refraction@1.0.0`. Góc nhập theo **độ nguyên**, kết quả tính bằng số thực rồi làm tròn **0,1°** khi hiển thị. Chiết suất lưu dạng **phần nghìn** (không khí 1000, nước 1333, thuỷ tinh 1500; Q-3). Tốc độ ánh sáng trong không khí `c = 300 000 km/s`. `reviewStatus: draft` |

## 2. Lát cắt Explore

Cả hai trạm dùng cùng một bộ dụng cụ quen thuộc của thí nghiệm khúc xạ: **đĩa chia độ** nằm ngang, **khối bán trụ** trong suốt đặt mặt phẳng qua tâm đĩa, **đèn laser (hoặc đèn chiếu khe hẹp)** chiếu một tia sáng hẹp tới đúng tâm. Học sinh đọc góc trên vạch chia của đĩa. Đây là cách bố trí thường gặp; cần đối chiếu với thí nghiệm trong SGK KHTN 9 (Q-4).

### 2.1 Trạm 1: Định luật khúc xạ (ánh sáng đi từ không khí vào khối)

- Tia sáng đi trong không khí, tới mặt phẳng của khối bán trụ tại tâm đĩa. Tia khúc xạ đi theo bán kính nên ló ra mặt cong không bị lệch thêm.
- Học sinh chọn **môi trường của khối** (thuỷ tinh hoặc nước trong hộp bán trụ) và **góc tới** `i` 0–80° (bước 1°, nút ±5°).
- Bàn hiện **tia tới, tia khúc xạ và tia phản xạ yếu**, pháp tuyến tại điểm tới. Học sinh đọc góc khúc xạ `r` trên đĩa và ghi vào **bảng đo** (tối đa 6 lần đo mỗi môi trường).
- Bảng có cột `sin i`, `sin r`, `sin i / sin r`. Mặc định các cột này **ẩn số** để học sinh tự tính và thấy tỉ số gần như không đổi (Q-5); config bật được.
- Thẻ **"Tốc độ ánh sáng"**: với môi trường đang chọn, hiện `n` và `v = c/n` (thuỷ tinh 200 000 km/s, nước ≈ 225 000 km/s) để nối với `anh-sang/2`.
- Hiện tượng phải thấy được: `i = 0` thì tia đi thẳng; `i` tăng thì `r` tăng nhưng luôn `r < i`; tia khúc xạ lệch về phía pháp tuyến; cùng `i`, thuỷ tinh lệch nhiều hơn nước.

### 2.2 Trạm 2: Phản xạ toàn phần và góc tới hạn (ánh sáng đi từ khối ra không khí)

- Xoay đèn sang phía mặt cong: tia đi theo bán kính vào khối, tới mặt phẳng tại tâm, rồi **ló từ khối ra không khí**.
- Học sinh tăng dần góc tới `i` 0–89° (bước 1°). Tia khúc xạ lệch xa pháp tuyến (`r > i`) và **mờ dần**; tia phản xạ **sáng dần**.
- Khi `i ≥ i_gh` thì không còn tia khúc xạ: **phản xạ toàn phần**. Bàn ghi lại lần đầu học sinh gặp phản xạ toàn phần và góc lớn nhất còn tia khúc xạ, để học sinh tự xác định `i_gh` (thuỷ tinh ≈ 41,8°, nước ≈ 48,6°).
- Học sinh nhập góc tới hạn mình đo được rồi bấm **"Kiểm tra"**; bàn so với mô hình trong sai số ±1°.
- Ghi nhớ hai điều kiện: ánh sáng đi từ môi trường chiết quang hơn sang môi trường kém chiết quang hơn, và `i ≥ i_gh`. Ở Trạm 1 (không khí → khối) tăng `i` tới 80° vẫn **không bao giờ** có phản xạ toàn phần.

### 2.3 Ngoài phạm vi v1

Lăng kính và tán sắc (`anh-sang/4, 5`, đề xuất v1.1 trên cùng bàn, Q-1); thấu kính, vẽ ảnh, đo tiêu cự, kính lúp (`anh-sang/6…10`, đề xuất Lab riêng trên bàn K6, Q-1); chiết suất phụ thuộc màu; khối có hai mặt song song; sợi quang (có thể là "Em có biết" trong config, không mô phỏng).

## 3. Config và sim

`packages/sim/optics/`: `contracts.ts` (`OPTICS_KIT`, `REFRACTION_ENGINE`, schema `k6-optics-config/1` mở rộng envelope), `refraction.ts` (`refract`, `criticalAngle`, `evaluateStation`), `validate-config.ts`, `fl23-refraction.data.ts`, golden và test validator. Bump sim lên **số trống kế tiếp sau `main`** ngay trước khi pack (`main` hiện 1.22.0).

### 3.1 Mô hình

- **Định luật khúc xạ:** `n₁ sin i = n₂ sin r`, với `n` lấy từ config (phần nghìn). Nếu `n₁ sin i / n₂ > 1` thì phản xạ toàn phần, không có tia khúc xạ.
- **Góc tới hạn:** `sin i_gh = n₂ / n₁` (chỉ khi `n₁ > n₂`).
- **Tốc độ:** `v = c · 1000 / n` km/s, làm tròn tới 1 km/s khi hiển thị.
- **Độ sáng tia** (chỉ để vẽ, không đưa vào kết quả): hệ số phản xạ Fresnel cho ánh sáng không phân cực; tia phản xạ đạt 100 % khi phản xạ toàn phần.
- Góc nhập là độ nguyên; kết quả là số thực, làm tròn 0,1° khi hiển thị và khi ghi nhật ký. Ca golden so sánh với sai số 0,05°.

### 3.2 Golden và ca lỗi

Tính với không khí `n = 1,000`, thuỷ tinh `1,500`, nước `1,333` (Q-3).

| ID | Đầu vào | Kết quả |
|---|---|---|
| G-01 | Không khí → thuỷ tinh, i = 0° | r = 0°, tia đi thẳng |
| G-02 | Không khí → thuỷ tinh, i = 30° / 45° / 60° | r = 19,5° / 28,1° / 35,3° |
| G-03 | Như G-02 | `sin i / sin r` = 1,50 ở cả ba lần đo (sai số 0,01) |
| G-04 | Không khí → nước, i = 30° / 45° | r = 22,0° / 32,0°; cùng i, nước lệch ít hơn thuỷ tinh |
| G-05 | Không khí → thuỷ tinh, i = 80° | vẫn có tia khúc xạ (r = 41,0°), không phản xạ toàn phần |
| G-06 | Thuỷ tinh → không khí, i = 30° | r = 48,6° (r > i) |
| G-07 | Thuỷ tinh → không khí | i_gh = 41,8°; i = 41° còn tia khúc xạ (r = 79,8°); i = 42° phản xạ toàn phần |
| G-08 | Nước → không khí | i_gh = 48,6°; i = 45° còn khúc xạ (r = 70,5°); i = 49° phản xạ toàn phần |
| G-09 | Tốc độ | thuỷ tinh 200 000 km/s; nước 225 056 km/s (hiển thị ≈ 225 000) |
| E-01 | i ngoài 0–80° (Trạm 1) hoặc 0–89° (Trạm 2), i không nguyên | từ chối |
| E-02 | Môi trường không có trong config; `n` ≤ 1000 cho khối | từ chối / config sai |
| E-03 | `modes.guided`, trạm trùng, thiếu thiết lập trạm, quá 6 lần đo | config sai / từ chối |

## 4. BE

- Mục `EXPLORE_BENCHES["k6-optics-bench@1"]` với `refractionBenchSpec` (materials lấy từ `enabledApparatus`, setup lấy môi trường và khoảng góc từ config, như `energyBenchSpec`).
- Seed target `scripts/optics-explore-targets.ts` trên `KHTN9-CH02-T01`; thêm vào `scripts/explore-targets.ts`; lệnh `publish:fl23-explore` (`--kit k6-optics-bench@1 --lab light-refraction`).
- Sources: `curriculum` (yêu cầu cần đạt, `verified`) và `technical_assumption` (chiết suất, `c`, bố trí đĩa, `unverified` tới khi đối chiếu SGK KHTN 9).

## 5. FE

- Registry `k6-optics-bench@1`; trang `RefractionExploreLabPage`; route dev.
- **2D là cảnh chính** (catalog ghi FL-23 "2D-first"): nhìn từ trên xuống đĩa chia độ, vạch 1°, nhãn mỗi 10°, khối bán trụ, pháp tuyến, ba tia với độ đậm theo độ sáng. Đây là nơi học sinh đọc góc, nên vạch chia phải rõ ở 390 px (Q-6).
- **3D** dùng chung phòng vật lý, chế độ giảm sáng (portfolio K6), tia laser phát sáng trên bàn. 3D chỉ để quan sát; số đọc luôn có trong panel và 2D.
- Thiết bị theo `APPARATUS_RENDERERS`, kind: `protractor_disk`, `half_cylinder`, `light_source`, `measurement_table`, `speed_card`. Chưa có item dùng chung phù hợp trong `shared/items/`; nếu đèn laser hữu ích cho Lab khác thì đưa vào `shared/items/` sau.
- Nhật ký cục bộ `scored: false`: mỗi lần đổi môi trường, đổi hướng tia, ghi một lần đo, lần đầu gặp phản xạ toàn phần, kiểm tra góc tới hạn.

## 6–9. Item, nhật ký, Class Explore, nghiệm thu

- **Class Explore:** v1 chưa hỗ trợ. Đề xuất sau: yêu cầu `measure` góc khúc xạ tại một góc tới do giáo viên chọn, và `measure` góc tới hạn (đơn vị mới: phần mười độ).
- **Nghiệm thu:** golden; BE registry và publish; Playwright (registry, G-02 và bảng đo, G-04 so sánh nước và thuỷ tinh, G-05 không phản xạ toàn phần, G-07 tìm góc tới hạn và "Kiểm tra", config sai, 2D/3D, reduced motion, 390 px); hồi quy các bàn Explore vật lý (fluid-pressure, heat-transfer, lever-explore, energy-explore) và explore-pinned-config.

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| Nguồn K9 | Chưa có SGK KHTN 9. Chiết suất, bố trí thí nghiệm, ký hiệu (`i_gh` hay `i_th`) phải đối chiếu; FL-24 đã phát hành không chờ SGK theo quyết định owner, FL-23 cần quyết định riêng (Q-7) |
| Đọc góc | Kết quả quang học là số thực; nếu học sinh đọc trên đĩa với độ chia 1° thì sai lệch tự nhiên khoảng ±0,5°. "Kiểm tra" dùng sai số ±1° |
| Bàn K6 | Bàn mới, đầu tiên của Kit quang. Thiết kế contract đủ chỗ cho lăng kính (v1.1) mà không đổi schema v1: các trạm là một mảng enum |
| Bump sim | Nhiều dev nâng song song; chọn số trống ngay trước khi pack |

## 11. Câu hỏi cho owner

Nếu đồng ý cả bảy đề xuất, chỉ cần trả lời "duyệt".

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-1 | Tách `SPLIT` thế nào | v1 = khúc xạ + phản xạ toàn phần (`anh-sang/1, 2, 3`). Lăng kính và tán sắc = v1.1 trên cùng bàn. Thấu kính (`/6…10`) = một Lab riêng trên bàn K6, spec riêng (kèm CAT-5: dùng công thức thấu kính hay chỉ dựng hình) |
| Q-2 | Lab ID | `light-refraction` (FL-23a); thấu kính sau này dùng Lab ID khác |
| Q-3 | Chiết suất | Không khí 1,000 (bỏ qua chênh lệch với chân không), nước 1,333, thuỷ tinh 1,500. Hiển thị `n` với 2 chữ số thập phân (1,33 và 1,50) |
| Q-4 | Bố trí thí nghiệm | Đĩa chia độ + khối bán trụ + đèn laser chiếu vào tâm, hai trạm là hai hướng chiếu. Đối chiếu với SGK KHTN 9 khi có |
| Q-5 | Hiện số cho học sinh | Góc khúc xạ đọc trên đĩa luôn thấy. Cột `sin i`, `sin r`, tỉ số ẩn mặc định để học sinh tự tính; config bật được. Góc tới hạn chỉ hiện sau "Kiểm tra" |
| Q-6 | 2D hay 3D làm cảnh chính | 2D là cảnh chính (đọc góc chính xác, đúng "2D-first" của catalog); 3D giảm sáng để quan sát |
| Q-7 | Phát hành | Làm và nghiệm thu trên dev/fixture, rồi phát hành lên DB dev trên `KHTN9-CH02-T01` khi owner duyệt dữ liệu (như FL-24), **hoặc** chờ đối chiếu SGK KHTN 9. Đề xuất: theo cách của FL-24, ghi rõ "chưa đối chiếu SGK KHTN 9" trong `review.notes` |

## 12. Kết quả nghiệm thu trên dev/fixture (2026-11-16)

| Hạng mục | Kết quả |
|---|---|
| Sim | `packages/sim/optics`: golden G-01..G-09, E-01..E-02, bảng đo (tối đa 6 lần mỗi khối, một dòng mỗi góc), kiểm tra góc tới hạn ±1°; validator (E-03, trạm và dụng cụ, Trạm 2 phải tới được phản xạ toàn phần với mọi khối). Sim 1.23.0 chỉ thêm 5 file `optics/` so với 1.22.0 |
| BE | `EXPLORE_BENCHES["k6-optics-bench@1"]` + `refractionBenchSpec` (setup lấy môi trường và khoảng góc từ config), seed target `KHTN9-CH02-T01`, `npm run publish:fl23-explore`; dry run hợp lệ. Vitest `packages/sim` + `src/modules/labs` 665 passed, tsc sạch |
| FE | `physics/optics/refraction/`: 2D đĩa chia độ là cảnh mặc định (`useLabRendererMode` có thêm tham số mặc định, các bàn khác giữ 3D), 3D đĩa trong hộp tối với tia laser theo độ sáng Fresnel, bảng đo, thẻ tốc độ, "Kiểm tra" góc tới hạn, nhật ký cục bộ. Unit 7/7; Playwright `refraction-explore` 4/4 |
| Hồi quy FE | energy, fluid-pressure, heat-transfer, lever-explore, fl06-class-explore, explore-pinned-config, explore-lab-space, biology-explore-benches cùng FL-23: 39 passed; build OK |
| Phát hành (2026-11-16) | `npm run publish:fl23-explore -- --publish` từ `main` qua API dev: 201, activity `light-refraction-explore` v1. `GET /labs` của admin và `student.active` có `light-refraction`, `explore.ok: true`, `review.status: reviewed`. Trình duyệt thật với `student.active` (FE `main`): mở 2D mặc định, G-02 r = 19,5°, Trạm 2 ở 42° phản xạ toàn phần, không có thông báo giả định, không gọi API run |
| Chưa làm | Đối chiếu SGK KHTN 9; Class Explore; lăng kính và tán sắc (v1.1, Q-1); Lab thấu kính (spec riêng) |

## 13. Bổ sung v1.1: lăng kính và tán sắc (owner duyệt Q-8 đến Q-13, 2026-11-16)

Owner đã chốt ở Q-1 rằng lăng kính và tán sắc là **v1.1 trên cùng bàn K6**. Phần này mô tả v1.1 để owner duyệt trước khi code. Mọi phần của v1 (Trạm 1, Trạm 2, đã phát hành) giữ nguyên.

| Yêu cầu cần đạt | Vai trò ở v1.1 | Trạm |
|---|---|---|
| `9/anh-sang/4` Vẽ được sơ đồ đường truyền của tia sáng qua lăng kính | chính | 3 |
| `9/anh-sang/5` Giải thích định tính sự tán sắc ánh sáng Mặt Trời qua lăng kính | hỗ trợ | 3 |

### 13.1 Trạm 3: Lăng kính

- **Dụng cụ:** lăng kính thuỷ tinh tiết diện tam giác đều (góc chiết quang `A = 60°`) đặt trên cùng đĩa chia độ, đèn laser như hai trạm trước, thêm **màn hứng** phía sau lăng kính.
- **Ánh sáng một màu (laser):** học sinh chọn góc tới `i₁` ở mặt bên thứ nhất (35–80°, bước 1°). Bàn vẽ đường truyền: khúc xạ lần 1 (`r₁`), đi trong lăng kính tới mặt bên thứ hai (`r₂ = A − r₁`), khúc xạ lần 2 ló ra (`i₂`). Tia ló **luôn lệch về phía đáy** lăng kính so với tia tới; bàn hiện góc lệch `D = i₁ + i₂ − A` trên đĩa.
- **Vẽ trước rồi kiểm tra (Q-9):** mặc định bàn **ẩn đường truyền trong và sau lăng kính** cho tới khi học sinh chọn dự đoán hướng tia ló (lệch về đáy, lệch về đỉnh, đi thẳng) rồi bấm "Hiện đường truyền". Bản Explore không chấm điểm; dự đoán chỉ ghi vào nhật ký.
- **Ánh sáng trắng (tán sắc, định tính):** đổi nguồn sang "Ánh sáng trắng": bảy chùm màu tách ra từ mặt thứ hai và rơi thành **dải màu đỏ → tím** trên màn. Tím lệch nhiều nhất, đỏ lệch ít nhất. Bàn chỉ mô tả định tính (thứ tự màu, màu nào lệch nhiều hơn); không yêu cầu học sinh tính với chiết suất từng màu (Q-11).

### 13.2 Mô hình và contract

- **Engine `refraction@1.1.0`:** thêm `tracePrism(nMilli, apexDeg, i₁)` (trả `r₁, r₂, i₂, D` hoặc phản xạ toàn phần ở mặt thứ hai) và `traceSpectrum`. Kết quả của `refract`, `criticalAngleDeg`, `evaluateRay` không đổi.
- **Schema `k6-optics-config/1` mở rộng tương thích ngược:** `stations` thêm giá trị `"prism"`; thêm khối tuỳ chọn `prism` (`apexDeg` 30–70, `mediumId` trỏ tới một khối trong `media`, `minIncidenceDeg`, `maxIncidenceDeg`, `whiteLight` bật/tắt, `spectrum` 3–7 màu với `indexMilli`). `engine` nhận **cả** `refraction@1.0.0` và `refraction@1.1.0`; trạm `"prism"` chỉ hợp lệ với 1.1.0. Như vậy **config v1 đang chạy trên DB dev vẫn hợp lệ** sau khi FE và BE nâng lên (Q-10).
- **Validator:** góc tới nhỏ nhất của Trạm 3 phải đủ lớn để **mọi màu** đều ló ra ở mặt thứ hai (không phản xạ toàn phần trong lăng kính); với `A = 60°`, thuỷ tinh 1,500 cần `i₁ ≥ 27,9°`, màu tím 1,538 cần `i₁ ≥ 30,8°`, nên mặc định 35°.
- **Dụng cụ mới (kind):** `prism`, `screen`. Kit item và renderer 2D/3D theo `APPARATUS_RENDERERS`.
- **Lab:** cùng Lab `light-refraction`, **config version 2** gồm ba trạm. Phát hành tạo activity version mới; nhật ký học sinh theo `labId@activity.id` nên bản v2 bắt đầu nhật ký mới (Q-12).

### 13.3 Golden

Lăng kính thuỷ tinh `n = 1,500`, `A = 60°`.

| ID | Đầu vào | Kết quả |
|---|---|---|
| P-01 | i₁ = 40° | r₁ = 25,4°, r₂ = 34,6°, i₂ = 58,5°, D = 38,5° |
| P-02 | i₁ = 48,6° (đối xứng) | r₁ = r₂ = 30,0°, i₂ = 48,6°, D = 37,2° (góc lệch nhỏ nhất) |
| P-03 | i₁ = 60° | r₁ = 35,3°, r₂ = 24,7°, i₂ = 38,9°, D = 38,9° |
| P-04 | i₁ = 80° | i₂ = 29,2°, D = 49,2°; D luôn > 0 (lệch về đáy) với mọi i₁ trong khoảng |
| P-05 | i₁ = 25° | phản xạ toàn phần ở mặt thứ hai (ngoài khoảng mặc định; validator chặn config cho phép góc này) |
| P-06 | Ánh sáng trắng, i₁ = 50°, chiết suất minh hoạ đỏ 1,513 … tím 1,538 | D đỏ 38,3°, tím 40,5°; thứ tự lệch tăng dần đỏ, cam, vàng, lục, lam, chàm, tím |
| P-07 | Config v1 (engine 1.0.0, hai trạm) | vẫn hợp lệ; thêm trạm `prism` với engine 1.0.0 thì config sai |

### 13.4 Câu hỏi cho owner (v1.1)

Nếu đồng ý cả sáu đề xuất, chỉ cần trả lời "duyệt".

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-8 | Lăng kính | Tam giác đều, `A = 60°`, thuỷ tinh 1,500 (cùng khối của Trạm 1); config cho phép A 30–70° |
| Q-9 | Hỗ trợ "vẽ đường truyền" (`anh-sang/4`) | Ẩn đường truyền sau mặt thứ nhất cho tới khi học sinh chọn dự đoán hướng tia ló; dự đoán chỉ ghi nhật ký, không chấm. Phần vẽ có chấm (evidence) để cho Guided sau này |
| Q-10 | Tương thích với bản đã phát hành | Schema nhận cả `refraction@1.0.0` và `1.1.0`; config v1 trên DB dev tiếp tục chạy sau khi nâng code |
| Q-11 | Chiết suất theo màu | Bảy giá trị minh hoạ của thuỷ tinh crown (đỏ 1,513, cam 1,517, vàng 1,519, lục 1,523, lam 1,528, chàm 1,532, tím 1,538); chỉ dùng để vẽ dải màu và thứ tự lệch, không hiện số cho học sinh |
| Q-12 | Phát hành | Cùng Lab `light-refraction`, config version 2 (ba trạm), `reviewed` với ghi chú "chưa đối chiếu SGK KHTN 9", phát hành sau khi merge như v1 |
| Q-13 | Góc lệch D | Hiện D trên đĩa và trong panel (giúp thấy tia ló lệch về đáy); không đưa khái niệm góc lệch cực tiểu thành yêu cầu, chỉ là hiện tượng quan sát được |

### 13.5 Kết quả nghiệm thu v1.1 trên dev/fixture (2026-11-16)

| Hạng mục | Kết quả |
|---|---|
| Sim | Engine `refraction@1.1.0`: `tracePrism`, `minExitIncidenceDeg`, `evaluatePrism`; schema nhận cả 1.0.0 và 1.1.0, trạm `prism` chỉ với 1.1.0; validator (mọi màu phải ló ra ở mặt thứ hai, thứ tự spectrum, màn hứng khi bật ánh sáng trắng). Golden P-01..P-07; `packages/sim/optics` 31 test. Config FL-23 version 2 (ba trạm). Sim 1.24.0 chỉ đổi các file `optics/` so với 1.23.0 |
| BE | `refractionBenchSpec` mô tả Trạm 3 và lăng kính; `modelRefOf` theo engine của config. **Nâng model khi phát hành lại là tuỳ chọn theo bàn** (`allowModelUpgrade`, chỉ bàn K6 bật): Lab đã phát hành `refraction@1.0.0` được chuyển lên 1.1.0; khác tên model, khác major, hạ version, hoặc Lab có challenge/release vẫn bị từ chối. Wet-bench giữ chính sách cũ (test "refuses to move an existing 1.0.0 Lab" của K2 vẫn pass). Vitest `packages/sim` + `src/modules/labs` 677 passed; dry run hợp lệ |
| FE | Trạm 3: chọn góc tới 35–80°, đèn laser hoặc ánh sáng trắng, dự đoán hướng tia ló rồi mới hiện đường truyền, bảng r₁, r₂, i₂, D (chỉ với laser), dải màu với ô phóng to giữ đúng vị trí tương đối; 2D vẽ bằng dò tia vector (unit test đối chiếu D = i₁ + i₂ − A), 3D lăng kính đùn từ cùng tam giác, màn hứng, chùm màu. Unit 10/10; Playwright `refraction-explore` 5/5 (config v1 vẫn mở hai trạm; trạm lăng kính với engine 1.0.0 bị từ chối) |
| Chưa làm | Phát hành config v2 (sau merge); đối chiếu SGK KHTN 9; Lab thấu kính (spec riêng) |
