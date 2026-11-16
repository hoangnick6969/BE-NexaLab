# Spec áp dụng Explore: bàn quang học, lát cắt khúc xạ (FL-23 Quang học)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): chấp nhận Q-1 đến Q-7 như đề xuất. **Đã làm trên dev/fixture** (sim 1.23.0, BE+FE `feat/dev1-fl23-refraction`, Playwright 4/4, §12). Config `review.status: reviewed` (Q-7); **chưa phát hành**: cần merge để API dev có bàn `k6-optics-bench@1` |
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
| Chưa làm | Phát hành (sau merge); đối chiếu SGK KHTN 9; Class Explore; lăng kính (v1.1) |
