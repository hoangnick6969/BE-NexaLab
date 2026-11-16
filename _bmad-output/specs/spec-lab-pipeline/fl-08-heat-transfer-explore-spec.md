# Spec áp dụng Explore: bàn nhiệt (FL-08 Sự truyền nhiệt)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): chấp nhận Q-1 đến Q-6. **Đã làm trên dev/fixture** (F08-1 đến F08-5, §13); chưa seed, chưa phát hành |
| Người viết | Dev 1 (Kit Vật lý), task D1-3.2 |
| Cập nhật | 2026-11-16 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) |
| Nguồn | SGK KHTN 8 Kết nối tri thức, Bài 28 (tr. 112–117), **Bảng 28.1** · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 7) · [catalog](lab-catalog-and-shared-kits-khtn8-9.md) · [thiết kế FL-07](fl-07-thermal-energy-design.md) · [spec FL-04](fl-04-liquid-pressure-explore-spec.md) (cùng khuôn) |

FL-08 là Lab mới, chưa có Guided, nên **không chờ D-5**: sau nghiệm thu, owner phát hành qua `publishExploreLab` như FL-04. Đây là lần đầu bàn nhiệt K4 vào registry Explore. FL-07 Guided (`thermal-bench`) giữ nguyên: FL-08 có mô hình, activity và nhật ký riêng, đúng ranh giới trong thiết kế FL-07 ("không nhập dẫn nhiệt, đối lưu, bức xạ vào cùng rubric").

**Nguồn số liệu.** Khác FL-04, SGK Bài 28 có số liệu dùng được: **Bảng 28.1** cho khả năng dẫn nhiệt của 8 chất so với không khí (Len 2, Gỗ 7, Nước 25, Thuỷ tinh 44, Đất 65, Thép 2 860, Nhôm 8 770, Đồng 17 370). Trạm dẫn nhiệt bám bảng này. Số liệu của trạm đối lưu và bức xạ là giả định kỹ thuật (Q-4).

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn nhiệt**. ID bàn `kit = "k4-thermal-bench@1"`, `group = "physics"`. FE: `src/features/labs/physics/thermal/` (Lab mới ở `transfer/`, không đụng `ThermalEnergyActivity` của FL-07). Sim: `packages/sim/thermal/` (mới; `thermal-bench.ts` của FL-07 không đổi) |
| Lab đầu tiên | **FL-08**, Lab ID đề xuất `heat-transfer`, topic `KHTN8-L28` (xác nhận khi seed). Chưa có Guided, mode triển khai Explore. Outcome chính B28-O01, B28-O02; hỗ trợ B28-O04 |
| Cách mở | Dev: `/dev/lab-kits/thermal-explore` với config đóng gói. Fixture và thật: `/labs/:id` qua registry. Phát hành qua `publishExploreLab`, không phụ thuộc D-5 |
| Mô hình | `heat-transfer@1.0.0` (mới). Đơn vị số nguyên: mm, giây, phần mười độ C. Trạm 1 bám Bảng 28.1 (`source: sgk-khtn8-kntt-b28-t28.1`); trạm 2 và 3 là quy tắc và hằng số kỹ thuật. `reviewStatus: draft`, chờ reviewer Lý |

## 2. Lát cắt Explore

Ba trạm trong một bàn, chuyển bằng tab như FL-04. Mỗi trạm có **đồng hồ mô phỏng** riêng: chạy, dừng, làm lại, tốc độ ×1, ×10, ×30, tối đa 600 giây (10 phút) quan sát. Đồng hồ bấm giây là item chung `stopwatch`.

### 2.1 Trạm 1: Dẫn nhiệt (SGK Hình 28.1, Bảng 28.1)

- Giá đỡ có **tối đa 3 thanh** đặt song song, dài 300 mm. Học sinh chọn vật liệu cho từng giá từ danh sách của config: Đồng, Nhôm, Thép, Thuỷ tinh, Gỗ (Q-3).
- Mỗi thanh có 5 đinh a, b, c, d, e gắn bằng sáp, cách đầu A lần lượt 50, 100, 150, 200, 250 mm.
- Bấm "Đốt đầu A" thì đèn cồn đặt dưới đầu A của cả ba thanh cùng lúc và đồng hồ chạy. Đinh rơi khi sáp ở vị trí đó chảy.
- Học sinh thấy được, khớp ba câu hỏi SGK: đinh rơi (năng lượng truyền dọc thanh), rơi lần lượt từ a đến e, và thanh dẫn nhiệt tốt hơn thì đinh rơi sớm hơn. Thanh thuỷ tinh và gỗ không có đinh nào rơi trong 10 phút, nên học sinh nhận ra vật cách nhiệt.
- Panel hiện Bảng 28.1 (8 chất) và bảng thời điểm rơi của từng đinh đã quan sát.

### 2.2 Trạm 2: Đối lưu (SGK Hình 28.2, 28.3)

- Hai ống nghiệm đựng nước như SGK: ống (1) có viên sáp ở **đáy**, ống (2) có viên sáp ở **miệng**. Học sinh chọn chỗ đặt đèn cồn cho từng ống: gần miệng hoặc dưới đáy.
- Kết quả theo quy tắc: sáp chảy khi được đun **ở dưới** viên sáp (dòng đối lưu mang nước nóng lên trên), sau 40 giây; đun ở trên viên sáp thì sáp không chảy trong 10 phút (nước dẫn nhiệt kém, Bảng 28.1: 25).
- Ca SGK: ống (1) đun gần miệng thì sáp ở đáy không chảy; ống (2) đun dưới đáy thì sáp ở miệng chảy.
- Tuỳ chọn "Thả thuốc tím" (Hình 28.3): bình nước đun ở đáy cho thấy vòng dòng đối lưu (nước nóng lên, nước lạnh xuống). Chỉ là hình minh hoạ, không có số đo.

### 2.3 Trạm 3: Bức xạ nhiệt (SGK Hình 28.5)

- Đèn dây tóc chiếu vào bình thuỷ tinh có nhiệt kế (item chung `thermometer`). Học sinh bật hoặc tắt đèn, đặt hoặc bỏ **tấm gỗ** chắn giữa đèn và bình, và chọn mặt ngoài bình: **phủ đen** hoặc **tráng bạc** (phần "Khả năng hấp thụ và phản xạ tia nhiệt" của SGK).
- Nhiệt kế đọc đến 0,1 °C. Khi đèn chiếu tới bình, nhiệt độ tăng dần; khi chắn hoặc tắt đèn, nhiệt độ giảm dần về ban đầu. Bình tráng bạc nóng lên ít hơn bình phủ đen.
- Khớp hai câu hỏi SGK: vì sao nhiệt độ tăng ở Hình 28.5a và giảm ở 28.5b; truyền nhiệt từ đèn tới bình không phải dẫn nhiệt hay đối lưu (tấm gỗ chắn thì dừng).

### 2.4 Ngoài phạm vi v1

- Hiệu ứng nhà kính (mục tiêu 3 của Bài 28), phích (Hình 28.6) và cánh quạt trên nến (Hình 28.4): chỉ dùng làm câu hỏi gợi ý, không mô phỏng.
- Mô hình truyền nhiệt thật (phương trình nhiệt, khuếch tán nhiệt, khối lượng riêng và nhiệt dung). Trạm 1 dùng Bảng 28.1 làm thước đo tương đối (§3.2), không phải hệ số khuếch tán.
- Nhiệt độ của từng điểm trên thanh, đồ thị nhiệt độ theo thời gian (có thể dùng lại widget đồ thị của FL-07 ở bản sau), mất nhiệt ra môi trường ở trạm 1 và 2.
- Len, nước, đất trong Bảng 28.1 không làm thanh (vẫn hiện trong bảng để so sánh).

## 3. Config và sim

**Thư mục** `packages/sim/thermal/`, export `@nexalab/sim/thermal`:

| File | Nội dung |
|---|---|
| `contracts.ts` | `THERMAL_KIT = "k4-thermal-bench@1"`, `THERMAL_ENGINE = "heat-transfer@1.0.0"`, `CONDUCTIVITY_TABLE` (Bảng 28.1, 8 chất), `APPARATUS_KINDS`, `thermalLabConfigSchema` |
| `transfer.ts` | `evaluateConduction`, `evaluateConvection`, `evaluateRadiation`. Hàm thuần theo thời gian mô phỏng, số nguyên |
| `validate-config.ts` | `validateThermalLabConfig(raw)` |
| `fl08-heat-transfer.data.ts` | Config đóng gói FL-08 |
| `fl08-heat-transfer.golden.test.ts`, `validate-config.test.ts` | Golden và ca lỗi (§3.3) |

Bump `@nexalab/sim` lên **1.17.0** (1.16.0 là FL-04). Fetch `main` và chọn số trống kế tiếp ngay trước khi pack.

### 3.1 Schema `k4-thermal-config/1`

| Trường | Ghi chú |
|---|---|
| `schema`, `labId`, `kit`, `engine` | `k4-thermal-config/1`, `heat-transfer`, `k4-thermal-bench@1`, `heat-transfer@1.0.0` |
| `stations` | 1–3 trạm, không trùng: `conduction`, `convection`, `radiation` |
| `clock` | `{ maxSeconds: 600, speeds: [1, 10, 30] }` |
| `conduction` | `{ rodLengthMm: 300, pinPositionsMm: [50,100,150,200,250], materials: ["copper","aluminium","steel","glass","wood"], maxRods: 3, timeConstant: 16 }` |
| `convection` | `{ meltSeconds: 40, dye: true }` |
| `radiation` | `{ startTenthsC: 250, riseTenthsC: 80, tauSeconds: 60, absorptance: { black: 100, silver: 25 } }` (phần trăm) |
| `enabledApparatus`, `measurements`, `prompts` | Theo envelope; `modes.guided` bị từ chối |

### 3.2 Mô hình

- **Trạm 1.** Với vật liệu có khả năng dẫn nhiệt `K` (Bảng 28.1) và đinh cách đầu A một đoạn `x` mm, sáp chảy tại `t = round(timeConstant × x² / K)` giây. Đinh rơi nếu `t ≤ maxSeconds`. Thứ tự a → e luôn đúng vì `t` tăng theo `x`; thanh dẫn tốt hơn rơi sớm hơn vì `t` giảm theo `K`. `x²` giữ dáng của sự truyền nhiệt (xa gấp đôi thì lâu gấp bốn). Đây là thang thời gian minh hoạ, ghi trong `limitations`.
- Bảng thời điểm rơi với `timeConstant = 16` (giây):

| Vật liệu (K) | a 50 mm | b 100 | c 150 | d 200 | e 250 |
|---|---|---|---|---|---|
| Đồng (17 370) | 2 | 9 | 21 | 37 | 58 |
| Nhôm (8 770) | 5 | 18 | 41 | 73 | 114 |
| Thép (2 860) | 14 | 56 | 126 | 224 | 350 |
| Thuỷ tinh (44) | không rơi (909) | không | không | không | không |
| Gỗ (7) | không rơi | không | không | không | không |

- **Trạm 2.** `melted(t) = heatBelowWax && t ≥ meltSeconds`. Không có nhiệt độ, chỉ có trạng thái sáp.
- **Trạm 3.** Nhiệt độ tiến dần về đích theo hằng số thời gian `τ`: khi được chiếu, đích là `start + rise × absorptance`; khi chắn hoặc tắt, đích là `start`. Trong mỗi đoạn giữa hai lần đổi đèn, tấm gỗ hay mặt ngoài, `T(t) = đích + (T₀ − đích)·e^(−t/τ)` tính dạng đóng; số đọc làm tròn phần mười độ. Vì không cộng dồn theo bước, tua nhanh và chạy từng giây cho cùng kết quả (G-10).
- `limitations`: `illustrative_time_scale`, `no_heat_loss`, `rule_based_convection`, `radiation_constants_assumed`.

### 3.3 Golden và ca lỗi

| ID | Đầu vào | Kết quả |
|---|---|---|
| G-01 | Đồng, t = 60 s | Cả 5 đinh đã rơi, theo thứ tự a, b, c, d, e tại 2, 9, 21, 37, 58 s |
| G-02 | Đồng, Nhôm, Thép cùng đốt, t = 120 s | Đồng 5 đinh, Nhôm 5 đinh, Thép 2 đinh (a, b) |
| G-03 | Thuỷ tinh hoặc Gỗ, t = 600 s | Không đinh nào rơi |
| G-04 | Thép, t = 600 s | Cả 5 đinh rơi; đinh e lúc 350 s |
| G-05 | Ống (1): sáp ở đáy, đun gần miệng, t = 600 s | Sáp không chảy |
| G-06 | Ống (2): sáp ở miệng, đun dưới đáy | t = 39 s chưa chảy, t = 40 s chảy |
| G-07 | Phủ đen, chiếu 60 s từ 25,0 °C | 30,1 °C; tăng đơn điệu |
| G-08 | Tráng bạc, chiếu 60 s | 26,3 °C; tối đa 27,0 °C |
| G-09 | G-07 rồi đặt tấm gỗ 120 s | 25,7 °C; giảm đơn điệu |
| G-10 | Chạy 600 lần × 1 s và nhảy thẳng 600 s | Cùng trạng thái ở cả 3 trạm |
| E-01 | Vật liệu ngoài Bảng 28.1, hai thanh trùng giá, quá `maxRods` | Từ chối |
| E-02 | Đinh ngoài thanh hoặc không tăng dần | Config sai |
| E-03 | `absorptance` ngoài 0–100, `tauSeconds = 0` | Config sai |
| E-04 | `modes.guided`, trạm trùng, thiếu thiết lập của trạm đã bật | Config sai |

## 4. BE

- `EXPLORE_BENCHES[THERMAL_KIT]`: `modelRef = THERMAL_ENGINE`, `validate = validateThermalLabConfig`, `activitySpec = thermalBenchSpec`; chưa có `deriveClass`. Nguồn trong spec gồm Bảng 28.1 (`sgk`) và hằng số trạm 2, 3 (`technical_assumption`).
- Seed: `scripts/thermal-explore-targets.ts`, `npm run db:seed:explore -- --kit k4-thermal-bench@1`, topic `KHTN8-L28`.
- Phát hành qua `publishExploreLab`; FL-07 (`thermal-energy`, Guided) không bị đụng vì khác Lab ID và khác mô hình.

## 5. FE

| Phần | Nội dung |
|---|---|
| Registry | Mục `k4-thermal-bench@1` (`physics`), `loadPage` lazy, `listKitItems` |
| Trang | `physics/thermal/transfer/ThermalExploreBench.tsx` trong `LabSpace`, tab ba trạm, thanh đồng hồ (chạy, dừng, làm lại, ×1/×10/×30) |
| Cảnh 3D | Phòng vật lý chung (`PhysicsStage`), camera riêng mỗi trạm như FL-04. Item riêng của bàn: giá 3 thanh có đinh gắn sáp (đinh rơi có trọng lực đơn giản, reduced motion thì đổi trạng thái ngay), đèn cồn (ngọn lửa động), hai ống nghiệm trên giá, bình thuốc tím, đèn dây tóc, bình phủ đen hoặc tráng bạc, tấm gỗ. Item chung: `thermometer`, `stopwatch` |
| 2D | Sơ đồ mỗi trạm cùng trạng thái: thanh có 5 đinh (đã rơi hay chưa), hai ống nghiệm, đèn–tấm chắn–bình với số nhiệt kế |
| Tương tác | Chọn vật liệu cho 3 giá, "Đốt đầu A"; chọn chỗ đun cho từng ống; bật đèn, tấm gỗ, mặt ngoài. Bàn phím đầy đủ; vừa 390 px |

## 6. Item

| Item | Nguồn |
|---|---|
| `thermometer`, `stopwatch` | `shared/items/` (K2-3.3); số đọc do bàn truyền vào |
| Giá thanh dẫn nhiệt, đèn cồn, ống nghiệm có sáp, bình thuốc tím, đèn dây tóc, bình phủ màu, tấm gỗ | Riêng của bàn K4. Đèn cồn và giá đỡ có thể vào thư viện chung sau (K2 cũng dùng đèn cồn), qua PR riêng cho K2 duyệt |

## 7. Nhật ký

Khóa `heat-transfer@<activity.id>`. Dòng mới:
- `conduction`: "Đốt đầu A của thanh Đồng, Nhôm, Thép" và từng sự kiện "Đinh c của thanh Nhôm rơi lúc 41 s".
- `convection`: "Ống (2): đun dưới đáy, sáp ở miệng chảy lúc 40 s"; "Ống (1): sau 600 s sáp ở đáy vẫn chưa chảy".
- `radiation`: bật hoặc tắt đèn, đặt tấm gỗ, đổi mặt ngoài, kèm số nhiệt kế lúc đó.

Sự kiện đinh rơi khi tua nhanh vẫn ghi đủ, theo thời điểm mô phỏng. Export `scored: false`.

## 8. Class Explore

v1 chưa hỗ trợ. Đề xuất sau: mẫu "So sánh dẫn nhiệt" (giáo viên chọn 3 vật liệu, yêu cầu `measure` thời điểm rơi của một đinh theo đơn vị `seconds`, và `explain`).

## 9. Nghiệm thu

- Sim: golden và ca lỗi §3.3 pass; `thermal-bench` (FL-07) và các test sim cũ pass.
- BE: unit test registry, spec, seed target; toàn bộ test BE trên Postgres cô lập như FL-04.
- FE: lint, build, regression; unit test `listThermalKitItems` và nhật ký.
- Playwright `tests/heat-transfer-explore.spec.ts`, mock API:
  1. `/labs/heat-transfer` mở đúng trang qua registry; panel liệt kê item theo config;
  2. trạm 1: Đồng, Nhôm, Thép, tua ×30 tới 120 s, số đinh rơi đúng G-02; thanh Thuỷ tinh không rơi đinh nào ở 600 s;
  3. trạm 2: ca G-05 và G-06;
  4. trạm 3: chiếu thì nhiệt độ tăng, đặt tấm gỗ thì giảm, tráng bạc tăng ít hơn phủ đen;
  5. nhật ký có dòng sự kiện, còn sau F5, export `scored: false`; không có `/lab-runs`;
  6. config sai dừng mở bàn với `EXPLORE_CONFIG_INVALID`;
  7. 2D và 3D cùng trạng thái; reduced motion; 390 px.
- Hồi quy: FL-07 Guided (`thermal-energy` Playwright), `fluid-pressure-explore`, `lever-explore`.

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| Thang thời gian trạm 1 | Dùng khả năng dẫn nhiệt làm đại lượng so sánh, không phải hệ số khuếch tán. Thứ tự đúng với 5 vật liệu đã chọn; con số giây là minh hoạ. Cần reviewer Lý chấp nhận cách diễn đạt trong `limitations` |
| Số liệu trạm 2, 3 | Giả định kỹ thuật, nhãn "Dữ liệu chưa duyệt" |
| An toàn | Thí nghiệm thật dùng đèn cồn và đèn dây tóc nóng: `safetyBriefing.realLab` nhắc đậy nắp đèn cồn để tắt, không chạm thanh và bóng đèn khi đang nóng, có người lớn giám sát |
| Hiệu năng | Đinh rơi và ngọn lửa là chuyển động liên tục; dùng frameloop theo yêu cầu, chỉ chạy khung hình khi đồng hồ chạy hoặc vật đang rơi |
| Bump sim | 1.17.0 phụ thuộc thứ tự merge sau FL-04 |

## 11. Quyết định của owner

Owner duyệt ngày 2026-11-16, chấp nhận cả sáu đề xuất.

| ID | Câu hỏi | Quyết định |
|---|---|---|
| Q-1 | v1 gồm những trạm nào? | Cả ba: dẫn nhiệt (bám Bảng 28.1), đối lưu và bức xạ (theo quy tắc). Bài 28 yêu cầu ví dụ cả ba cách truyền nhiệt (B28-O01). Phương án nhỏ hơn: chỉ trạm 1, hai trạm kia để v1.1 |
| Q-2 | Thời gian rơi đinh tính từ đâu? | `t = 16 × x² / K` với K của Bảng 28.1: thứ tự và vật cách nhiệt đúng SGK, giây là minh hoạ. Không dùng hệ số khuếch tán (cần số liệu ngoài SGK) |
| Q-3 | Vật liệu làm thanh | Đồng, Nhôm, Thép, Thuỷ tinh, Gỗ; tối đa 3 thanh cùng lúc. Bảng 28.1 vẫn hiện đủ 8 chất |
| Q-4 | Hằng số trạm 2, 3 | Sáp chảy sau 40 s; nhiệt kế từ 25,0 °C, tăng tối đa 8,0 °C, τ = 60 s, tráng bạc hấp thụ 25 %. Ghi là giả định kỹ thuật |
| Q-5 | ID | Bàn `k4-thermal-bench@1`, schema `k4-thermal-config/1`, engine `heat-transfer@1.0.0`, Lab `heat-transfer`, topic `KHTN8-L28` |
| Q-6 | Phát hành | Như FL-04: phát hành qua `publishExploreLab` sau nghiệm thu và owner tự kiểm, nhãn "Dữ liệu chưa duyệt"; không chờ reviewer Lý |

## 12. Việc theo task (sau khi duyệt)

| Task | Việc | File chính |
|---|---|---|
| F08-1 | Schema, Bảng 28.1, ba mô hình, validator, config FL-08, golden; bump sim | `packages/sim/thermal/*` |
| F08-2 | `EXPLORE_BENCHES` + `thermalBenchSpec`, seed, test | `explore-labs.ts`, `scripts/thermal-explore-targets.ts` |
| F08-3 | Registry FE, trang, đồng hồ mô phỏng, cảnh 3D/2D ba trạm, item | `physics/thermal/transfer/*`, `App.tsx` |
| F08-4 | Nhật ký sự kiện theo thời điểm mô phỏng, export | `physics/thermal/transfer/transfer-log.ts` |
| F08-5 | Playwright §9, hồi quy, toàn bộ test BE; phát hành qua Admin API | `tests/heat-transfer-explore.spec.ts` |

## 13. Ghi chú triển khai (2026-11-16)

| Task | Kết quả |
|---|---|
| F08-1 | BE `packages/sim/thermal/` (`contracts.ts` với `CONDUCTIVITY_TABLE` = Bảng 28.1, `transfer.ts`, `validate-config.ts`, `fl08-heat-transfer.data.ts`, golden và test validator). Trạm 3 dùng dạng đóng theo đoạn (§3.2). Sim **1.17.0**, tarball đồng bộ sang FE |
| F08-2 | `EXPLORE_BENCHES["k4-thermal-bench@1"]` + `thermalBenchSpec` (nguồn: Bảng 28.1 `verified`, thang thời gian và hằng số `unverified`; không có `deriveClass`). Seed target `scripts/thermal-explore-targets.ts`, topic `KHTN8-L28`. FL-07 bị từ chối làm đích Explore (`EXPLORE_LAB_HAS_GUIDED`) |
| F08-3 | FE `physics/thermal/transfer/`: `ThermalExploreBench` (ba trạm, đồng hồ riêng mỗi trạm với Chạy/Dừng, ×1/×10/×30, "Tua thêm 60 s"), `ThermalStage3D` (camera riêng mỗi trạm, đinh rơi, ngọn lửa, ống nghiệm, bình thuốc tím trên kiềng, đèn, bình phủ đen hoặc tráng bạc, tấm gỗ; `thermometer` và `stopwatch` của thư viện chung), `ThermalStage2D`, `listThermalKitItems`, trang `/labs/:id`, dev `/dev/lab-kits/thermal-explore`. FL-07 không đổi |
| F08-4 | `transfer-log.ts`: dòng thao tác và dòng sự kiện theo thời điểm mô phỏng (đinh rơi, sáp chảy, hết 600 s), ghi đủ khi tua; export `scored: false` |
| F08-5 | Playwright `tests/heat-transfer-explore.spec.ts` 4/4; toàn bộ test BE trên Postgres cô lập |

Nhánh: BE `feat/dev1-fl08-heat-transfer` (chồng lên `docs/dev1-fl08-explore-spec`, tức FL-04), FE `feat/dev1-fl08-heat-transfer` (chồng lên FE `feat/dev1-fl04-liquid-pressure`). Còn lại: merge sau FL-04 (BE và FE cùng lúc); owner seed `--kit k4-thermal-bench@1`, tự kiểm, phát hành qua `publishExploreLab` (`topicCode: "KHTN8-L28"`), xác nhận topic có trong DB.

## 14. Phát hành theo P0 C1.3 (cập nhật 2026-11-16)

Chỉ có hai lối ghi, cả hai qua `publishExploreLab`:

| | Lệnh | Ghi chú |
|---|---|---|
| Seed, DB cô lập | `npm run db:seed:explore -- --kit k4-thermal-bench@1` | `assertIsolatedDatabase()` chạy trước mọi lệnh ghi |
| Phát hành, DB dùng chung | `npm run publish:fl08-explore` (dry run, ghi file request) rồi `npm run publish:fl08-explore -- --publish --reason "..."` với `NEXALAB_ADMIN_API_URL` và `NEXALAB_ADMIN_TOKEN` | Script `scripts/publish-explore.ts` gọi `POST /admin/labs/heat-transfer/explore-versions` (ADMIN, Zod, audit); không ghi DB trực tiếp |

Dry run trên `main` (2026-11-16): config hợp lệ với validator của bàn và schema request của Admin API. Topic `KHTN8-L28` chưa đối chiếu được vì máy không có `NEXA-LAB_Content tool/catalog-registry.json`; owner kiểm topic có trong DB trước khi `--publish`.
