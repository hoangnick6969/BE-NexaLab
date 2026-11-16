# Tracking giao việc sau P0: Kit, bàn và Class Explore

Nguồn: [phân công 20 slot §3](lab-kit-20-slot-delivery-spec.md#3-mốc-giao-dev) · [pilot Kit Hóa học §4–§6](lab-kit-assets-and-class-lab-spec.md) · [P0](lab-mode-foundation-p0-spec.md) · [mẫu spec áp dụng](lab-explore-bench-spec-template.md). Cập nhật: 2026-11-15.

## Cách đọc

- **INC** (increment) là mốc **nối tiếp**. Chỉ bắt đầu task của một INC khi dòng "Mở khi" của INC đó đạt.
- **Trong một INC**, ba người làm **song song**. Không ai chờ ai, trừ chỗ ghi ở cột **Chờ**.
- **Task của cùng một người** làm **theo thứ tự ID** (K2-1.1 rồi K2-1.2…).
- Trạng thái: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong và đã nghiệm thu. Ghi commit hoặc PR ở cuối dòng khi xong.

| Người | Phụ trách |
|---|---|
| **K2** | Kit Hóa học (bàn ướt), thư viện `shared/items/` (duyệt mọi PR item chung), Class Explore FL-13 |
| **Dev 1** | Kit Vật lý: bàn cơ (FL-06), bàn chất lỏng (FL-03, FL-05) |
| **Dev 2** | Kit Sinh học: bàn di truyền (FL-26), sau đó các bàn Sinh học khác |
| **Owner** | Quyết định sản phẩm, merge, deploy, phát hành lên Supabase |

Quy tắc chung cho mọi task:
- Không chạy test, seed hay migration ghi lên Supabase. Kiểm Supabase chỉ bằng SELECT (P0 D-6). Phát hành lên Supabase chỉ qua `POST /admin/labs/:id/explore-versions`.
- Đổi hành vi sim thì bump `@nexalab/sim`, đồng bộ tarball sang FE và thêm golden test.
- Item dùng chung đi bằng PR riêng, do K2 duyệt. PR của bàn không sửa `shared/items/`.

## INC-0: đóng rollout P0

**Mở khi:** ngay. **Xong khi:** PR-2 đã deploy; D-2 và Q-1 đã chốt.

| ID | Người | Task | Xong khi | Chờ |
|---|---|---|---|---|
| [ ] O-0.1 | Owner | Merge PR-2 ở BE và FE | Cả hai PR merge vào `main` | — |
| [ ] O-0.2 | Owner | Deploy PR-2 cùng lúc BE và FE | Học sinh mở FL-13, FL-14a; giáo viên không thấy mã lỗi | O-0.1 |
| [ ] O-0.3 | Owner | Chốt **D-2**: bảng khối lượng mol KHTN 8, ghi sách và trang | Bảng ghi trong spec pilot | — |
| [ ] O-0.4 | Owner | Chốt **Q-1**: prompt cho mẫu pH FL-13 | Phương án ghi trong spec pilot §3 | — |
| [ ] O-0.5 | Owner | Xác nhận số track Lab đồng thời từ INC-2 (phase plan giới hạn 2) | Ghi quyết định vào phân công §3 | — |
| [x] K2-0.1 | K2 | Chụp baseline ảnh và số đo: FL-13 (pH), FL-14a (dụng cụ), FL-10 Explore route dev (cốc, cân) | FE `tests/k2-baseline.spec.ts` và snapshot: danh sách dụng cụ, pH 6 hoá chất FL-13, số cân FL-10 (120,00 g → 120,05 g sau HCl), ảnh 3 bàn. FE `1b30091` | — |
| [x] D1-0.1 | Dev 1 | Chụp baseline ảnh và số đo: FL-03, FL-05, FL-10 Guided. FE `tests/baseline-d1-fluid-wetbench.spec.ts`, kết quả ở `tests/baseline/d1-0.1/` (3 JSON số đo, 22 ảnh 3D/2D ở 1440 và 390 px). Chạy không có `BASELINE_UPDATE` để so số đo khi nghiệm thu D1-2.4. Ghi nhận trước bước B: cốc trên cân FL-03 (3D) hiển thị bị cắt | Ảnh và số đo lưu trong repo test | — |
| [ ] D2-0.1 | Dev 2 | Chốt nguồn K9, phạm vi FL-26 (phép lai một tính trạng, bảng Punnett), ca kiểm thử | Ghi vào spec áp dụng FL-26 (D2-1.1) | — |

## INC-1: pilot A + bàn thứ hai

**Mở khi:** P0 Contract done (đã đạt 2026-11-15). Code được, **chưa phát hành** gì lên Supabase trước O-0.2.
**Xong khi:** K2-1.5 và D1-1.5 nghiệm thu xong.

### K2: bước A (thư viện item, panel) và bước K (dữ liệu)

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [x] K2-1.1 | PR riêng: thêm **cốc** và **cân** vào `shared/items/` (lấy từ `apparatus3d.tsx`), có anchor `mouth`, `inside`, `base`, `pan`. Kích thước, mức chất lỏng, số đọc truyền qua props | Bàn ướt Explore render cốc/cân từ thư viện. **Xong** (FE `daad35d`): `shared/items/` có `Beaker3D`, `DigitalScale3D`, `glass.tsx`, `catalog.ts`; bàn ướt Explore render cốc, cốc thải và cân từ thư viện. | — |
| [x] K2-1.2 | Registry renderer theo `ApparatusKind`, bỏ if/else chọn mesh ở `WetBenchKitStage.tsx` | Không còn chuỗi if/else chọn mesh. **Xong** (FE `0396bb1`, `1538131`): `apparatus-renderers.tsx` tra theo `ApparatusKind` và `HeldTool`; stage không còn if/else chọn mesh hay offset. | K2-1.1 |
| [x] K2-1.3 | Mở rộng `listKitItems`: mỗi item trỏ tới renderer, cảnh báo lấy từ `reagents.ts` | Unit test `kit-items` pass. **Xong** (FE `96b9bb1`): `KitItem` có `rendererKey` và `sharedItemId`; cảnh báo vẫn lấy từ `reagents.ts`. | K2-1.2 |
| [x] K2-1.4 | Panel "Dụng cụ và thành phần" cố định trong bàn, đọc `listKitItems` | Panel hiện đúng item của config đã ghim. **Đã có** `shared/LabKitItemsPanel.tsx` dùng chung mọi bàn, đọc `listKitItems` hiện tại (tên, công dụng, cảnh báo); Playwright `kit-items-panel.spec.ts` khớp danh sách màn giới thiệu trên FL-13/14a/10 (FE `7998d9d`). Panel chỉ hiện chữ (tên, công dụng, cảnh báo); spec không yêu cầu hình, nên coi là xong | K2-1.3 |
| [x] K2-1.5 | Nghiệm thu A: so baseline K2-0.1 (pH FL-13, cốc/cân FL-10 Explore, dụng cụ FL-14a) | Ảnh và số đo trước/sau khớp, Playwright pass. **Xong**: baseline K2-0.1 khớp (danh sách, pH, số cân, ảnh 3 bàn); 23 Playwright, 8 unit test, lint và build pass. | K2-1.4, K2-0.1 |
| [x] K2-1.6 | **Bước K** (song song với K2-1.1→1.5): sửa `species.ts` theo D-2, cập nhật golden và `engine.test.ts`, giữ `mass-conservation@1.0.0`, bump sim, đồng bộ tarball | Golden pass; nghiệm thu K theo nhánh D-2. **Xong** (BE `14fa2d2` nhánh `feat/k-wet-bench-molar-mass`; FE `chore` sync tarball 1.9.0): theo mặc định của D-2 là quy ước KHTN 8, 13/22 chất đổi sang khối lượng nguyên (Fe 56, Cu 64, Zn 65, Ba 137, Cl 35,5), bàn ướt khớp `mass-conservation@1.0.0` (BaCl₂ và BaSO₄ trước lệch 0,3–0,4); test mới kiểm đủ 22 chất. **Owner đã xác nhận bảng (2026-11-15)** | O-0.3 |

### Dev 1: FL-06 Explore trên dev/fixture

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [x] D1-1.1 | Viết spec áp dụng **bàn cơ** theo mẫu, dùng lại `lever-bench.ts` và `LeverInvestigationActivity.tsx`. [Spec](fl-06-mechanics-bench-explore-spec.md), owner duyệt 2026-11-15 | Spec được owner duyệt | — |
| [x] D1-1.2 | Sim: schema config đòn bẩy mở rộng `ExploreLabEnvelope`, validator, golden | Test sim pass, envelope không đổi | D1-1.1 |
| [x] D1-1.3 | BE: mục `EXPLORE_BENCHES` cho bàn cơ. FE: mục registry `{ kit, group: "physics", validate, loadPage, listKitItems }` và trang Explore | Lint, build, unit test pass | D1-1.2 |
| [x] D1-1.4 | Nhật ký: kiểu dòng và `describeChange()` của bàn cơ, dùng lưu trữ chung F0-4 | Nhật ký lưu và export được | D1-1.3 |
| [x] D1-1.5 | Nghiệm thu: `/labs/:id` mở FL-06 Explore qua registry trên dev/fixture; Guided FL-06 vẫn mở, nộp, chấm được. Không phát hành (FL-06 có Guided, chờ D-5) | Playwright pass. Đây là bàn thứ hai thật của registry | D1-1.4 |

D1-1.2…D1-1.5 nghiệm thu 2026-11-15 trên nhánh `feat/dev1-physics-bench` (FE và BE), chưa merge. Bằng chứng ở `sprint-status.yaml` mục `fl06-mechanics-bench-explore`.

### Dev 2: chuẩn bị FL-26 (chưa mở track Lab)

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [ ] D2-1.1 | Viết spec áp dụng **bàn di truyền** FL-26 theo mẫu: nguồn K9, phạm vi, item, nhật ký, loại yêu cầu | Spec được owner duyệt | D2-0.1 |
| [ ] D2-1.2 | Sim: model Mendel tất định (phép lai một tính trạng, tỉ lệ kiểu gen và kiểu hình, số nguyên), `reviewStatus` | Golden test pass | D2-1.1 |
| [ ] D2-1.3 | Sim: schema config FL-26 mở rộng envelope và validator | Test sim pass | D2-1.2 |

Dev 2 không làm bàn FE và không seed ở INC-1, theo phân công §3 (Sinh học tích hợp sau khi P0 chạy ở Hóa và Vật lý).

## INC-2: dùng lại asset + Class Explore

**Mở khi:** K2-1.5 xong (cho K2 và Dev 1). Riêng Dev 2: D1-1.5 xong và O-0.5 đã chốt.
**Xong khi:** K2-2.8, D1-2.4 và D2-2.5 nghiệm thu xong.

### K2: bước C, Class Explore FL-13

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [x] K2-2.1 | `classTemplates` trong `spec` của FL-13 (mẫu pH, allow-list 6 mẫu, chọn đúng 2, prompt theo Q-1) | Ghim cùng digest. **Xong, chưa phát hành** (FE nhánh `feat/k2-c-class-templates`): mẫu `ph-compare-two-samples` trong `fl-13.config.ts` (chọn đúng 2 trong 6 mẫu; câu `compare-two-samples` mới và `strong-vs-weak` chỉ với HCl + CH₃COOH); `configVersion` 2. Bản ghim v2 trên Supabase chưa đổi, owner phát hành ở K2-2.8 thì thành v3. Mẫu "1 câu quan sát của lớp" chưa làm (cần quyết định riêng). Chưa có `ranges` (khoảng giá trị): FL-13 không dùng, thêm khi có bàn cần | O-0.4 |
| [x] K2-2.2 | Sim: `deriveWetBenchEffectiveConfig` và validator strict | Golden pass; từ chối đủ các ca ở pilot §6. **Xong** (BE nhánh `feat/k2-c-class-templates`, sim 1.10.0): `deriveWetBenchEffectiveConfig`, `validateWetBenchEffectiveConfig`, `classSelectionSchema`; 16 test sim + 1 test BE ghim mẫu vào digest. Chưa có `effectiveConfigDigest` (làm ở K2-2.3 cùng chỗ ghim) | K2-2.1 |
| [x] K2-2.3 | BE: nhánh `source.mode = "explore"` trong `ClassResource`, ghim theo C3.4 | Unit test pass. **Xong** (BE `2c75e03`): `ClassResourceKind` thêm `EXPLORE_LAB` (migration riêng); nội dung dựng ở server từ lựa chọn, ghim version Lab, mẫu, digest cấu hình hiệu lực; `assign()` nhận `contentType: "explore_lab"` + `exploreResourceId`, chép snapshot kiểm digest vào cột mới `Assignment.exploreSnapshot`, không cần hạn nộp; publish từ chối `EXPLORE_SOURCE_CHANGED` khi Lab đã có version mới. Học sinh trong lớp chỉ thấy id Lab và lời dặn của resource | K2-2.2 |
| [x] K2-2.4 | BE: bảng bài nộp Explore (migration), idempotency, trạng thái `Đã nộp` → `Đã nhận xét` | Migration và unit test có trong PR; agent không chạy migration trên Supabase, owner áp ở K2-2.8. **Xong** (BE `2c75e03`): bảng `ClassExploreSubmission` (unique học sinh + bài giao), `POST assignments/:id/explore-submissions`, `GET` và `PUT .../review` cho giáo viên chủ lớp; nộp lại cùng đáp án trả bài đã lưu, khác đáp án thì 409. Sau đó đổi theo quy tắc owner: nộp lại tới hạn, nộp trễ đánh dấu, khóa sau nhận xét (BE `d264504`, FE `c30e682`) | K2-2.3 |
| [x] K2-2.5 | FE: màn giáo viên chọn mẫu, câu hỏi, xem trước, giao bài | Preview và bản giao cùng `effectiveConfigDigest`. **Xong** (FE `7ea2589`): nút "Giao bài Explore" ở trang bài giao; chọn đúng 2 mẫu, câu hỏi `strong-vs-weak` chỉ mở khi đúng HCl + CH₃COOH, xem trước (yêu cầu, dụng cụ, mở bàn thật), lưu, xuất bản và giao một lần; thử lại dùng tiếp bản đã lưu. Chỉ giao cả lớp (chưa chọn nhóm) | K2-2.3 |
| [x] K2-2.6 | FE: màn học sinh mở và nộp theo `assignmentId` | Ngoài đối tượng giao bị từ chối, kể cả qua `resourceId`. **Xong** (FE `d243855`): `/assignments/:id` → `/labs/:labId?assignmentId=..&explore=1`; chỉ cờ `explore=1` mới vào trang Explore nên mọi link Guided giữ nguyên; kiểm cấu hình lại bằng schema bàn, nộp có Idempotency-Key, bài đã nộp chỉ đọc | K2-2.4, K2-2.5 |
| [x] K2-2.7 | FE: giáo viên nhận xét trong Class Space | Trạng thái chuyển `Đã nhận xét`. **Xong** (FE `7ea2589`): "Xem bài nộp" cho giáo viên: số đo, lời giải thích, ai chưa nộp, nhận xét chuyển bài sang "Đã nhận xét", sửa được | K2-2.6 |
| [x] K2-2.8 | Nghiệm thu C (pilot §6), owner áp migration và phát hành qua Admin API | Supabase chỉ-SELECT khớp; không có `LabRun`/`Attempt`/`Progress`. **Xong 2026-11-16 (owner đóng)**: hai migration đã áp và ghi nhận; FL-13 v3 đã phát hành qua Admin API (mẫu `ph-compare-two-samples`), resolver `ok: true`, 0 `LabRun`/`Attempt`; một vòng giao, nộp, nhận xét đã chạy qua API (dữ liệu thử còn trên DB dùng chung); PR INC-2 đã merge ở BE và FE | K2-2.7, O-0.2 |

### Dev 1: bước B, cảnh thật dùng cốc/cân chung

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [x] D1-2.1 | FL-03 (hoặc FL-05) dùng cốc/cân của `shared/items/`; chỉ đổi hiển thị. Làm trên FL-03 (FL-05 không dùng cốc K3): vỏ cốc K3 là `Beaker3D` của `shared/items/` (scale từ đơn vị item sang mm); cột nước, dòng rót, dâng mực khi chìm vẫn của bàn chất lỏng. Sửa luôn lỗi nước nhuộm màu bàn trong baseline. **Cân giữ `DigitalBalance3D` của K3** (lý do theo D1-2.3: cân chung chưa có vật trên đĩa qua `children`, nút trừ bì, đĩa lún theo tải và số chạy rồi dừng); đề xuất mở rộng `digital-scale` bằng PR riêng cho K2 duyệt. Baseline D1-0.1 FL-03 khớp, `density-lab` pass | Số đo bàn chất lỏng không đổi | K2-1.5 |
| [x] D1-2.2 | FL-10 Guided `WetBenchStage.tsx` dùng cốc/cân chung; số đo vẫn do server tính (mg). `WetBenchStage.tsx` vẽ `DigitalScale3D` (phóng 2,4× để đĩa đặt vừa hai cốc 250 mL) và hai `Beaker3D` chung; vạch 50–250 mL, mỏ rót, lớp BaSO₄ lắng và nhãn hoá chất là `children` của bàn. Số cân vẫn là chuỗi server (435,0 g). Sửa kèm: cốc rót được nhấc qua miệng cốc kia rồi mới nghiêng (trước đây cắt xuyên cốc 2 và đĩa cân), đáy cốc cách đĩa một khe để hết z-fighting. `fl-10-k2` và baseline D1-0.1 FL-10 pass | Chuỗi sự kiện giữ nguyên | D1-2.1 |
| [x] D1-2.3 | Nếu props không phủ được hình dạng cần: giữ component riêng, ghi lý do; item mới vào thư viện qua PR riêng cho K2 duyệt. Lý do giữ component riêng (2026-11-15): (1) FL-03 `DigitalBalance3D`: cân chung chưa có vật trên đĩa qua `children`, nút trừ bì, đĩa lún theo tải, số chạy rồi dừng (LCD vẽ canvas); FL-03 cần cả bốn. (2) FL-05 bình tràn, cốc hứng có thang 5 mL, lực kế lò xo, giá đỡ: chỉ bàn chất lỏng dùng, giữ trong bàn theo C2.1. (3) Ống đong FL-03: chỉ bàn chất lỏng dùng. Đề xuất mở rộng `digital-scale` (children ở anchor `pan`, `onTare` tùy chọn) đã đẩy lên nhánh riêng FE `feat/shared-scale-pan-load` (`e2eba2f`) cho K2 duyệt; FL-03 chuyển sang cân chung sau khi PR đó merge | Ghi lý do trong PR | D1-2.2 |
| [x] D1-2.4 | Nghiệm thu B: `fl-10-k2`, `density-lab`, `buoyancy-*` pass; so baseline D1-0.1. Nghiệm thu 2026-11-15 trên nhánh `feat/dev1-physics-bench` sau khi merge main (K2 PR #62, BE #74; sim của bàn cơ thành 1.11.0): `fl-10-k2` 1/1, `density-lab` 11/11, `buoyancy-labrun` 1/1, `buoyancy-manipulation` 3/3, `buoyancy-state-sync` 1/1, baseline D1-0.1 3/3 (số đo FL-03, FL-05, FL-10 khớp), `k3-kit-preview` 2/2, `k2-baseline` 8/8, `lever-explore` 3/3, `fl-06-k5` 1/1, test:regression 64/64. Ảnh 3D/2D đối chiếu bằng mắt với `tests/baseline/d1-0.1/`: cốc FL-03 và cân, cốc FL-10 đổi sang item chung, bố cục và số đọc giữ nguyên | Ảnh và số đo khớp | D1-2.3, D1-0.1 |

### Dev 2: FL-26 Explore 2D (track Lab thứ ba)

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [ ] D2-2.1 | FE: trang bàn 2D, phép lai một tính trạng, bảng Punnett | Chạy trên route dev | D1-1.5, O-0.5 |
| [ ] D2-2.2 | Registry FE (`group: "biology"`, `listKitItems`) và `EXPLORE_BENCHES` BE | Lint, build, unit test pass | D2-2.1 |
| [ ] D2-2.3 | Nhật ký: kiểu dòng và `describeChange()` | Lưu và export được | D2-2.2 |
| [ ] D2-2.4 | Seed loader cho kit di truyền trong `seed-explore-labs.ts` và topic code | Unit/CLI test của seed pass (guard chặn mọi DB không cô lập) | D2-2.3 |
| [ ] D2-2.5 | Nghiệm thu và phát hành FL-26 qua Admin API (Lab mới, không chờ D-5) | Thẻ Lab hiện, mở bàn, thử phép lai; Supabase chỉ-SELECT `ok: true` | D2-2.4, O-0.2 |

## INC-3: mở rộng

**Mở khi:** K2-2.8 xong. Các Lab đã có Guided còn chờ D-5.

| ID | Người | Task | Chờ |
|---|---|---|---|
| [ ] O-3.1 | Owner | Contract hai mode **D-5** (gộp F0-7b) | — |
| [ ] K2-3.1 | K2 | FL-14 mở rộng (14b/14c sau khi chốt `SPLIT`) | — |
| [ ] K2-3.2 | K2 | FL-10 phần mol | K2-1.6, O-3.1 |
| [~] K2-3.3 | K2 | FL-11 (ống đong vào thư viện chung), FL-12 (nhiệt kế, đồng hồ bấm giờ vào thư viện chung). **FL-11 xong 2026-11-16**: ba item chung (ống đong, nhiệt kế, đồng hồ bấm giờ) và bàn FL-11 (`wet-bench@1.1.0`, sim 1.11.0) đã merge (BE #79, #80; FE #66); Lab `solution-concentration` v1 đã phát hành, resolver `ok: true`; dữ liệu là bản nháp chờ reviewer Hóa. Thẻ trên /labs, ảnh bìa, bài học liên quan và danh mục "Dụng cụ theo bộ Kit" chờ merge ở FE `fix/lab-library-fl-11-card` và BE `fix/explore-lab-lesson-links`. **FL-12 đã làm trên dev, chưa phát hành** ([spec](fl-12-reaction-rate-explore-spec.md); sim 1.13.0, `wet-bench@1.2.0`, nhánh `feat/fl-12-reaction-rate`): chờ reviewer Hóa duyệt mô hình tốc độ trước khi phát hành | — |
| [~] K2-3.4 | K2 | FL-15 bàn kịch bản an toàn. Owner chốt Explore không chấm, ba tình huống tham chiếu SGK, VI/EN, outcome `KHTN8-B01-O01`, topic `KHTN8-L01`. Lab `lab-safety` có cảnh 2D/3D, ảnh bìa và panel dụng cụ theo P0. [Duyệt nội dung v2](fl-15-safety-review-checklist.md) theo uỷ quyền Owner và kiểm phát hành bằng Admin API trên fixture cục bộ. [Spec FL-15](fl-15-lab-safety-scenario-spec.md) | — |
| [ ] D1-3.1 | Dev 1 | C3 cho FL-06 (template Class Explore đã ghim) | K2-2.8 |
| [ ] D1-3.2 | Dev 1 | Explore Lab mới: FL-04, FL-08, FL-23, FL-24 (mỗi Lab một spec áp dụng) | — |
| [ ] D1-3.3 | Dev 1 | Công bố FL-06 Explore cho học sinh | O-3.1 |
| [ ] D2-3.1 | Dev 2 | FL-20, FL-21 (sinh thái), FL-27 (phân tử) Explore | O-3.1 |
| [ ] D2-3.2 | Dev 2 | Studio FL-16 (giải phẫu, Kit Bổ trợ) | O-3.1 |


## Ghi chú bàn giao (2026-11-15, cuối phiên làm INC-2 lane K2)

**Trạng thái.** K2-2.1 → K2-2.7 xong và đã push. BE: nhánh `feat/k2-c-class-templates` (`2c75e03`). FE: cùng tên nhánh (`e4aa02a`, `d243855`, `7ea2589`). Sim 1.10.0 và mẫu FL-13 đã nằm trên `main`. Mô tả PR soạn sẵn cho BE và FE (INC-2). Lane Dev 1 (bước B) và Dev 2 (FL-26) là của hai dev kia, chưa được kiểm ở đây.

**Còn lại cho K2-2.8 (owner, ghi lên Supabase dùng chung).**
1. Hai migration đã áp trên Supabase (kiểm chỉ-SELECT: cột `Assignment.exploreSnapshot`, bảng `ClassExploreSubmission` với 4 index và 2 FK, giá trị enum `EXPLORE_LAB` đều có). **Nhưng `_prisma_migrations` chưa có dòng cho cả hai** (áp bằng tay). Cần đánh dấu đã áp, nếu không lần `migrate deploy` sau sẽ cố áp lại và lỗi ở `ADD COLUMN`: `prisma migrate resolve --applied 20261115120000_class_explore_kind` rồi `... 20261115120100_class_explore_submission`.
2. Merge PR BE và FE, deploy cùng lúc.
3. Phát hành FL-13 có mẫu (v3) qua `POST /admin/labs/:id/explore-versions`. Tới lúc đó nút "Giao bài Explore" báo chưa có Lab có mẫu. Lưu ý `scripts/k2-explore-targets.ts` tìm config ở `../../FE-NexaLab`; thư mục FE trên máy này tên `nexalab-fe`.
4. Kiểm chỉ-SELECT sau phát hành: `PracticalActivityVersion` v3 có `spec.explore.classTemplates`; resolver `ok: true`; 0 `LabRun`/`Attempt`/`Progress` trên Lab Explore.
5. Chạy thử một vòng với server thật (chưa từng chạy; toàn bộ Playwright dùng API mock): giáo viên giao, học sinh nộp, giáo viên nhận xét.

**Quyết định đã tự đặt, cần owner xác nhận hoặc đổi.**
- Các quy tắc nộp bài dưới đây chỉ áp dụng cho **Class Explore** (bài giáo viên giao), không áp dụng cho Foundational Explore mở tự do. **Owner đã chốt (2026-11-15):**
  - Học sinh sửa và nộp lại được cho tới hạn giáo viên đặt (hoặc bất cứ lúc nào nếu không có hạn) và tới khi giáo viên nhận xét; bản mới thay bản cũ. Cùng đáp án gửi lại là thử lại, trả bài đã lưu.
  - Quá hạn vẫn được nộp lần đầu nhưng đánh dấu "Nộp trễ"; sau đó không nộp lại được. Dấu trễ tính từ `submittedAt` so với hạn hiện tại của bài giao (không có cột mới), nên giáo viên gia hạn thì dấu trễ mất.
  - Bài giáo viên đã nhận xét thì học sinh không ghi đè được, kể cả trước hạn.
  - Chỉ giao cả lớp (mọi học sinh trong lớp); không làm giao nhóm, tránh làm thừa. Đã bỏ task đó.
- Q-1: dùng mặc định của spec (hai câu hỏi). Câu "một câu quan sát của lớp" chưa làm (cần quyết định riêng về dữ liệu và quyền sửa). `ranges` (khoảng giá trị) của spec C3.1 chưa làm vì FL-13 không dùng.
- D-2: bảng khối lượng mol KHTN 8 đã được owner xác nhận (2026-11-15); không còn việc chờ.

**Việc đề xuất cho INC-3, chưa duyệt.** Trang duyệt dụng cụ theo Kit cho học sinh (C2.2, tùy chọn) và lọc Lab theo Kit ở `/labs`; hình minh hoạ nhỏ cho từng dụng cụ. Nên làm sau khi FL-06 chạy, vì khi đó Kit Vật lý mới có bàn thứ hai thật.

**Lưu ý môi trường.**
- `main` cục bộ của hai repo lệch xa origin; tạo nhánh mới từ `origin/main`.
- Không chạy `git stash` trần (kho stash dùng chung giữa các worktree/phiên). Dev server cũ của Vite có thể giữ module cũ sau khi sửa file; xoá `node_modules/.vite` rồi chạy lại.
- Fail sẵn, không liên quan: 2 ca của `tests/lab-run-host.spec.ts` (FE), và `.local/browser-fixture.test.ts` (BE, cần DB cô lập).
- Máy này không có GitHub CLI (`gh`); khung trình duyệt của app chưa đăng nhập GitHub, nên PR được tạo thủ công.
