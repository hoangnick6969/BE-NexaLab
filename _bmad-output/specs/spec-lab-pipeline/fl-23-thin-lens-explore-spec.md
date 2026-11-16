# Spec áp dụng Explore: bàn quang học, Lab thấu kính (FL-23, phần thấu kính)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): chấp nhận Q-1 đến Q-8 như đề xuất (CAT-5: chỉ dựng hình, công thức sau cờ config). **Đã làm trên dev/fixture** (sim 1.25.0, BE+FE `feat/dev1-fl23-lens`, §12); config `reviewed`. **Đã merge (BE #103, FE #86) và phát hành lên DB dev 2026-11-16** (`thin-lens`, topic `KHTN9-CH02-T01`, Admin API, 201) |
| Người viết | Dev 1 (Kit Vật lý), task D1-3.2 |
| Cập nhật | 2026-11-16 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) · cùng khuôn [FL-23 khúc xạ](fl-23-refraction-explore-spec.md), [FL-24](fl-24-mechanical-energy-explore-spec.md) |
| Nguồn | Yêu cầu cần đạt KHTN 9 `9/anh-sang/6…10` ([catalog](lab-catalog-and-shared-kits-khtn8-9.md), CAT-5) · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 16) · [P0](lab-mode-foundation-p0-spec.md) |

FL-23 trong catalog là nhóm `SPLIT`. Owner đã chốt ở FL-23 Q-1: khúc xạ, phản xạ toàn phần và lăng kính là Lab `light-refraction` (đã phát hành, config v2); **thấu kính là một Lab riêng trên bàn K6, spec riêng**. Đây là spec đó. Lab mới, chưa có Guided, nên không chờ D-5.

Như các Lab K9 trước, repo chưa có SGK KHTN 9 (`sgk-khtn.pdf` là SGK KHTN 8). Spec bám **yêu cầu cần đạt của chương trình 2018**; những gì phụ thuộc SGK được ghi thành câu hỏi, trong đó quan trọng nhất là **CAT-5: dùng công thức thấu kính hay chỉ dựng hình** (Q-3). Topic đã có trên DB dev: **`KHTN9-CH02-T01` "Ánh sáng"** (outcomes `anh-sang/1…10`).

| Yêu cầu cần đạt | Vai trò | Trạm |
|---|---|---|
| `9/anh-sang/6` Nêu được quang tâm, trục chính, tiêu điểm chính, tiêu cự | hỗ trợ | 1 |
| `9/anh-sang/7` Vẽ được ảnh qua thấu kính | chính | 1, 2 |
| `9/anh-sang/10` Vẽ sơ đồ tỉ lệ để giải bài tập đơn giản về thấu kính hội tụ | chính | 2 |
| `9/anh-sang/8` Đo được tiêu cự của thấu kính hội tụ bằng dụng cụ thực hành | chính | 3 |
| `9/anh-sang/9` Mô tả cấu tạo và sử dụng được kính lúp | chính | 4 |

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn thấu kính** (giá quang học), `kit = "k6-lens-bench@1"`, `group = "physics"`, thuộc Kit quang K6 nhưng **khác bàn khúc xạ** `k6-optics-bench@1` (registry giữ một validator cho mỗi kit, như K5 có bàn đòn bẩy và bàn năng lượng; Q-2). FE `src/features/labs/physics/optics/lens/`. Sim `packages/sim/optics/lens/` (mới); `refraction.ts` không đổi |
| Lab | Lab ID đề xuất `thin-lens`, `catalogId` `FL-23` (Q-1), topic `KHTN9-CH02-T01`. Mode Explore |
| Cách mở | Dev `/dev/lab-kits/lens-explore`; fixture và thật qua registry. Phát hành bằng `npm run publish:fl23-lens-explore` sau khi owner duyệt và merge |
| Mô hình | `thin-lens@1.0.0`. Đơn vị số nguyên: **mm** cho khoảng cách và tiêu cự. Thấu kính mỏng, tia gần trục; tiêu cự âm cho thấu kính phân kì. `reviewStatus` theo quyết định Q-8 |

## 2. Lát cắt Explore

Bàn là một **giá quang học** có thước chia mm: đèn hoặc vật sáng hình mũi tên (chữ F) ở một đầu, thấu kính đặt trên giá, màn hứng di chuyển được. Sơ đồ 2D có **lưới tỉ lệ** (1 ô = 10 mm) để học sinh đọc khoảng cách và chiều cao như khi vẽ trên giấy kẻ ô.

### 2.1 Trạm 1: Ba tia sáng đặc biệt

- Chọn **thấu kính hội tụ** hoặc **phân kì**, tiêu cự trong bộ (đề xuất 100 mm và 150 mm; Q-4).
- Bàn vẽ thấu kính, **quang tâm O**, **trục chính**, **tiêu điểm F và F′**, và nhãn **tiêu cự f** (`anh-sang/6`).
- Học sinh bật/tắt từng tia đặc biệt: tia qua quang tâm truyền thẳng; tia song song trục chính ló qua F′ (hội tụ) hoặc có đường kéo dài qua F′ (phân kì); tia qua F (hội tụ) ló song song trục chính.
- Mặc định tia ló **ẩn** cho tới khi học sinh chọn dự đoán hướng tia ló cho từng tia; dự đoán chỉ ghi nhật ký, không chấm (như trạm lăng kính).

### 2.2 Trạm 2: Dựng ảnh và sơ đồ tỉ lệ

- Đặt vật AB (cao 20 mm) trước thấu kính, khoảng cách `d` 20–400 mm (bước 10 mm; Q-4).
- **Dựng hình:** học sinh chọn hai trong ba tia đặc biệt từ đỉnh B, bàn vẽ hai tia ló (hoặc đường kéo dài, nét đứt) và giao điểm B′, rồi ảnh A′B′.
- Panel ghi **tính chất ảnh**: thật hay ảo, cùng chiều hay ngược chiều, lớn hơn hay nhỏ hơn vật. Học sinh **đọc `d′` và `h′` trên lưới tỉ lệ** và tự điền; bấm "Kiểm tra" để so với mô hình (sai số một nửa ô, 5 mm; Q-5).
- Trường hợp riêng: vật **tại tiêu điểm** (`d = f`) không cho ảnh (hai tia ló song song); bàn ghi đúng như vậy.
- Công thức `1/f = 1/d + 1/d′` chỉ hiện nếu owner chọn ở CAT-5 (Q-3); mặc định chỉ dựng hình và tam giác đồng dạng.

### 2.3 Trạm 3: Đo tiêu cự thấu kính hội tụ

- Phương pháp đề xuất (Q-6): đặt **vật và màn đối xứng qua thấu kính**, dịch đồng thời cho tới khi ảnh rõ nét và **cao bằng vật**; khi đó `d = d′ = 2f`, khoảng cách vật–màn `L = 4f`, nên `f = L/4`.
- Học sinh dịch vật (và màn đi theo đối xứng) bằng thanh trượt; bàn hiện **ảnh trên màn nhoè hay nét** theo độ lệch giữa màn và vị trí ảnh thật, và chiều cao ảnh trên màn.
- Học sinh đọc `L` trên thước, tính `f` rồi bấm "Kiểm tra" (sai số ±5 mm).
- Thấu kính đo có tiêu cự **ẩn** (ghi "thấu kính chưa biết tiêu cự"), chọn một trong bộ của config.

### 2.4 Trạm 4: Kính lúp

- Kính lúp là thấu kính hội tụ tiêu cự ngắn (đề xuất 50 mm và 100 mm). Vật đặt **trong khoảng tiêu cự**: ảnh ảo, cùng chiều, lớn hơn vật.
- Học sinh dịch kính lúp lại gần hoặc xa vật; bàn hiện ảnh ảo (nét đứt) và **ô nhìn qua kính** (hình vật được phóng to).
- Ghi **số bội giác** khắc trên kính `G = 25/f` (f tính bằng cm, quy ước SGK; Q-7): kính f = 50 mm ghi 5×, f = 100 mm ghi 2,5×.
- Nếu vật ra ngoài tiêu cự, ảnh qua kính là ảnh thật ngược chiều ở phía bên kia, không nhìn được như kính lúp; bàn nói rõ điều này.

### 2.5 Ngoài phạm vi v1

Thấu kính dày, quang sai; công thức số phóng đại góc ngoài `G = 25/f`; hệ hai thấu kính; mắt và kính cận/viễn (đã có ở FL-25); máy ảnh.

## 3. Config và sim

`packages/sim/optics/lens/`: `contracts.ts` (`LENS_KIT`, `LENS_ENGINE`, schema `k6-lens-config/1` mở rộng envelope), `lens.ts` (`imageOf`, `specialRays`, `sharpness`, `magnifierPower`), `validate-config.ts`, `fl23-lens.data.ts`, golden và test validator. Bump sim lên số trống kế tiếp sau `main` (hiện 1.24.0).

### 3.1 Mô hình

- **Ảnh:** `d′ = d·f / (d − f)` (quy ước: `d′ > 0` ảnh thật sau thấu kính, `d′ < 0` ảnh ảo cùng phía vật; `f < 0` thấu kính phân kì). Số phóng đại `k = −d′/d`, chiều cao ảnh `h′ = k·h`. `d = f` không có ảnh.
- **Dựng hình:** ba tia đặc biệt tính từ cùng mô hình nên giao điểm luôn trùng `(d′, h′)` của công thức; nếu không hiện công thức (Q-3), số chỉ đọc trên lưới.
- **Độ nét trên màn** (chỉ để vẽ): bán kính vệt nhoè tỉ lệ với `|x_màn − d′| / d′` nhân bán kính thấu kính.
- **Kính lúp:** `G = 250 / f` với f tính bằng mm (tức `25/f` với f tính bằng cm).

### 3.2 Golden và ca lỗi

| ID | Đầu vào | Kết quả |
|---|---|---|
| L-01 | Hội tụ f = 100, d = 300 | d′ = 150, k = −0,5: ảnh thật, ngược chiều, nhỏ hơn vật |
| L-02 | f = 100, d = 200 (= 2f) | d′ = 200, k = −1: ảnh thật, ngược chiều, bằng vật |
| L-03 | f = 100, d = 150 | d′ = 300, k = −2: ảnh thật, ngược chiều, lớn hơn vật |
| L-04 | f = 100, d = 100 (= f) | không có ảnh (tia ló song song) |
| L-05 | f = 100, d = 50 | d′ = −100, k = 2: ảnh ảo, cùng chiều, lớn hơn vật |
| L-06 | Phân kì f = −100, d = 200 | d′ ≈ −66,7, k ≈ 0,33: ảnh ảo, cùng chiều, nhỏ hơn vật; mọi d đều cho ảnh ảo nhỏ hơn |
| L-07 | Đo tiêu cự f = 100, vật và màn đối xứng | ảnh nét và bằng vật khi d = d′ = 200, L = 400 = 4f; L nhỏ nhất (d = 180 hay 220 đều cho L > 400) |
| L-08 | Kính lúp f = 50 và f = 100 | G = 5× và 2,5×; vật trong tiêu cự cho ảnh ảo lớn hơn |
| E-01 | d ngoài khoảng, d không chia hết bước, f = 0 | từ chối / config sai |
| E-02 | Thấu kính không có trong config, trạm kính lúp với thấu kính phân kì | từ chối / config sai |
| E-03 | `modes.guided`, trạm trùng, thiếu thiết lập trạm | config sai |

## 4. BE

- Mục `EXPLORE_BENCHES["k6-lens-bench@1"]` với `lensBenchSpec` (setup lấy thấu kính, khoảng d và các trạm từ config).
- Seed target trên `KHTN9-CH02-T01`; lệnh `publish:fl23-lens-explore` (`--kit k6-lens-bench@1 --lab thin-lens`).
- Sources: `curriculum` (`verified`), `technical_assumption` (tiêu cự trong bộ, phương pháp đo, quy ước dấu, `unverified` tới khi đối chiếu SGK KHTN 9).

## 5. FE

- Registry `k6-lens-bench@1`; trang `LensExploreLabPage`; route dev.
- **2D là cảnh chính** (catalog: FL-23 có yêu cầu "vẽ" `anh-sang/7, 10`): giá quang học nhìn ngang, lưới tỉ lệ, trục chính, F, F′, O, vật, tia, ảnh. Dùng lại cách vẽ và quy ước màu của bàn khúc xạ.
- **3D**: giá quang học trong phòng vật lý (dùng lại hộp tối của bàn K6), thấu kính, đèn chữ F, màn hứng có ảnh nhoè/nét; chỉ để quan sát.
- Dụng cụ theo `APPARATUS_RENDERERS`, kind: `optical_bench`, `lens`, `object_lamp`, `screen`, `magnifier`, `grid`. Đèn laser và màn có thể đưa vào `shared/items/` dùng chung với bàn khúc xạ (đề xuất làm khi code, không đổi bàn đã phát hành).
- Nhật ký cục bộ `scored: false`: đổi thấu kính, dự đoán tia, dựng ảnh, kiểm tra d′ và h′, đo tiêu cự, dùng kính lúp.

## 6–9. Item, nhật ký, Class Explore, nghiệm thu

- **Class Explore:** v1 chưa hỗ trợ. Đề xuất sau: `measure` tiêu cự (mm), `measure` d′ tại d do giáo viên chọn.
- **Nghiệm thu:** golden; BE registry và publish; Playwright (registry, trạm 1 dự đoán rồi hiện tia, L-01/L-03/L-05 tính chất ảnh và kiểm tra d′ trên lưới, L-04 không có ảnh, L-07 đo tiêu cự, L-08 kính lúp, config sai, 2D/3D, 390 px); hồi quy các bàn Explore vật lý.

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| CAT-5 | Mức KHTN 9 có dùng công thức thấu kính hay chỉ dựng hình và tam giác đồng dạng: ảnh hưởng tới việc hiện công thức (Q-3), không ảnh hưởng mô hình |
| Nguồn K9 | Phương pháp đo tiêu cự, ký hiệu (F, F′, d, d′), quy ước G = 25/f phải đối chiếu SGK KHTN 9 |
| Hai bàn trên Kit K6 | Bàn mới, không sửa bàn khúc xạ đã phát hành; chỉ dùng chung hộp tối và có thể chung item |
| Bump sim | Nhiều dev nâng song song; chọn số trống ngay trước khi pack |

## 11. Câu hỏi cho owner

Nếu đồng ý cả tám đề xuất, chỉ cần trả lời "duyệt".

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-1 | Lab ID và catalogId | `thin-lens`, `catalogId` vẫn là `FL-23` (cùng slot với `light-refraction`) |
| Q-2 | Bàn và engine | Bàn riêng `k6-lens-bench@1`, schema `k6-lens-config/1`, engine `thin-lens@1.0.0`; bàn khúc xạ không đổi |
| Q-3 | CAT-5: công thức hay dựng hình | Mặc định **chỉ dựng hình** và đọc số trên lưới tỉ lệ; config có cờ bật công thức `1/f = 1/d + 1/d′` nếu SGK KHTN 9 dùng |
| Q-4 | Bộ thấu kính và khoảng d | Hội tụ 100 mm và 150 mm, phân kì −100 mm; kính lúp 50 mm và 100 mm; d 20–400 mm bước 10 mm; vật cao 20 mm |
| Q-5 | Kiểm tra số đọc trên lưới | Học sinh tự điền d′, h′; "Kiểm tra" chấp nhận sai số 5 mm (nửa ô); không chấm điểm |
| Q-6 | Phương pháp đo tiêu cự | Vật và màn đối xứng, ảnh nét và bằng vật thì f = L/4; tiêu cự của thấu kính đo được ẩn |
| Q-7 | Kính lúp | Ghi số bội giác G = 25/f (f tính bằng cm), không yêu cầu học sinh tính G |
| Q-8 | Phát hành | Như FL-23 và FL-24: owner duyệt dữ liệu thì `reviewed` với ghi chú "chưa đối chiếu SGK KHTN 9", phát hành sau khi merge |

## 12. Kết quả nghiệm thu trên dev/fixture (2026-11-16)

| Hạng mục | Kết quả |
|---|---|
| Sim | `packages/sim/optics/lens`: `imageOf`, `blurRadiusMm`, `magnifierPower`, `evaluateRays/Image/Focal/Magnifier`; validator (thấu kính hội tụ và 2f với tới được cho trạm đo tiêu cự, kính lúp hội tụ và đặt được trong tiêu cự, dụng cụ theo trạm). Golden L-01..L-08, E-01..E-03; 17 test. Sim 1.25.0 chỉ thêm 5 file `optics/lens/` |
| BE | `EXPLORE_BENCHES["k6-lens-bench@1"]` + `lensBenchSpec` (setup từ config, công thức chỉ khi bật cờ), seed target `KHTN9-CH02-T01`, `npm run publish:fl23-lens-explore`; không bật `allowModelUpgrade`. Vitest `packages/sim` + `src/modules/labs` 698 passed; dry run hợp lệ |
| FE | `physics/optics/lens/`: 2D giá quang học với lưới tỉ lệ thật (1 ô = 10 mm), bốn trạm (tia đặc biệt sau dự đoán; dựng ảnh bằng hai trong ba tia, tính chất ảnh, kiểm tra d′ và h′ ±5 mm; đo tiêu cự với thấu kính ẩn tên A/B; kính lúp với ô nhìn qua kính và G); 3D giá quang học trong hộp tối. Unit 6/6 (giao điểm hai tia bất kỳ trùng ảnh của công thức); Playwright `lens-explore` 4/4 |
| Phát hành (2026-11-16) | `publish:fl23-lens-explore -- --publish` từ `main`: 201, activity `thin-lens-explore` v1. `GET /labs` của admin và `student.active`: `thin-lens`, `explore.ok: true`, bốn trạm, `reviewed`. Trình duyệt thật với `student.active` (FE `main`): bốn tab, L-01 ảnh thật ngược chiều nhỏ hơn vật, L-07 L = 400 mm rõ nét và bằng vật, không có thông báo giả định, không gọi API run |
| Chưa làm | Đối chiếu SGK KHTN 9; Class Explore |
