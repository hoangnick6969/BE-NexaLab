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
| [x] K2-1.6 | **Bước K** (song song với K2-1.1→1.5): sửa `species.ts` theo D-2, cập nhật golden và `engine.test.ts`, giữ `mass-conservation@1.0.0`, bump sim, đồng bộ tarball | Golden pass; nghiệm thu K theo nhánh D-2. **Xong** (BE `14fa2d2` nhánh `feat/k-wet-bench-molar-mass`; FE `chore` sync tarball 1.9.0): theo mặc định của D-2 là quy ước KHTN 8, 13/22 chất đổi sang khối lượng nguyên (Fe 56, Cu 64, Zn 65, Ba 137, Cl 35,5), bàn ướt khớp `mass-conservation@1.0.0` (BaCl₂ và BaSO₄ trước lệch 0,3–0,4); test mới kiểm đủ 22 chất. **Còn chờ owner**: đối chiếu cả bảng với sách (spec D-2 chỉ xác nhận Fe = 56, CaCO₃ = 100) | O-0.3 |

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
| [ ] K2-2.1 | `classTemplates` trong `spec` của FL-13 (mẫu pH, allow-list 6 mẫu, chọn đúng 2, prompt theo Q-1) | Ghim cùng digest | O-0.4 |
| [ ] K2-2.2 | Sim: `deriveWetBenchEffectiveConfig` và validator strict | Golden pass; từ chối đủ các ca ở pilot §6 | K2-2.1 |
| [ ] K2-2.3 | BE: nhánh `source.mode = "explore"` trong `ClassResource`, ghim theo C3.4 | Unit test pass | K2-2.2 |
| [ ] K2-2.4 | BE: bảng bài nộp Explore (migration), idempotency, trạng thái `Đã nộp` → `Đã nhận xét` | Migration và unit test có trong PR; agent không chạy migration trên Supabase, owner áp ở K2-2.8 | K2-2.3 |
| [ ] K2-2.5 | FE: màn giáo viên chọn mẫu, câu hỏi, xem trước, giao bài | Preview và bản giao cùng `effectiveConfigDigest` | K2-2.3 |
| [ ] K2-2.6 | FE: màn học sinh mở và nộp theo `assignmentId` | Ngoài đối tượng giao bị từ chối, kể cả qua `resourceId` | K2-2.4, K2-2.5 |
| [ ] K2-2.7 | FE: giáo viên nhận xét trong Class Space | Trạng thái chuyển `Đã nhận xét` | K2-2.6 |
| [ ] K2-2.8 | Nghiệm thu C (pilot §6), owner áp migration và phát hành qua Admin API | Supabase chỉ-SELECT khớp; không có `LabRun`/`Attempt`/`Progress` | K2-2.7, O-0.2 |

### Dev 1: bước B, cảnh thật dùng cốc/cân chung

| ID | Task | Xong khi | Chờ |
|---|---|---|---|
| [x] D1-2.1 | FL-03 (hoặc FL-05) dùng cốc/cân của `shared/items/`; chỉ đổi hiển thị. Làm trên FL-03 (FL-05 không dùng cốc K3): vỏ cốc K3 là `Beaker3D` của `shared/items/` (scale từ đơn vị item sang mm); cột nước, dòng rót, dâng mực khi chìm vẫn của bàn chất lỏng. Sửa luôn lỗi nước nhuộm màu bàn trong baseline. **Cân giữ `DigitalBalance3D` của K3** (lý do theo D1-2.3: cân chung chưa có vật trên đĩa qua `children`, nút trừ bì, đĩa lún theo tải và số chạy rồi dừng); đề xuất mở rộng `digital-scale` bằng PR riêng cho K2 duyệt. Baseline D1-0.1 FL-03 khớp, `density-lab` pass | Số đo bàn chất lỏng không đổi | K2-1.5 |
| [x] D1-2.2 | FL-10 Guided `WetBenchStage.tsx` dùng cốc/cân chung; số đo vẫn do server tính (mg). `WetBenchStage.tsx` vẽ `DigitalScale3D` (phóng 2,4× để đĩa đặt vừa hai cốc 250 mL) và hai `Beaker3D` chung; vạch 50–250 mL, mỏ rót, lớp BaSO₄ lắng và nhãn hoá chất là `children` của bàn. Số cân vẫn là chuỗi server (435,0 g). Sửa kèm: cốc rót được nhấc qua miệng cốc kia rồi mới nghiêng (trước đây cắt xuyên cốc 2 và đĩa cân), đáy cốc cách đĩa một khe để hết z-fighting. `fl-10-k2` và baseline D1-0.1 FL-10 pass | Chuỗi sự kiện giữ nguyên | D1-2.1 |
| [ ] D1-2.3 | Nếu props không phủ được hình dạng cần: giữ component riêng, ghi lý do; item mới vào thư viện qua PR riêng cho K2 duyệt | Ghi lý do trong PR | D1-2.2 |
| [ ] D1-2.4 | Nghiệm thu B: `fl-10-k2`, `density-lab`, `buoyancy-*` pass; so baseline D1-0.1 | Ảnh và số đo khớp | D1-2.3, D1-0.1 |

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
| [ ] K2-3.3 | K2 | FL-11 (ống đong vào thư viện chung), FL-12 (nhiệt kế, đồng hồ bấm giờ vào thư viện chung) | — |
| [ ] K2-3.4 | K2 | FL-15 bàn kịch bản an toàn | — |
| [ ] D1-3.1 | Dev 1 | C3 cho FL-06 (template Class Explore đã ghim) | K2-2.8 |
| [ ] D1-3.2 | Dev 1 | Explore Lab mới: FL-04, FL-08, FL-23, FL-24 (mỗi Lab một spec áp dụng) | — |
| [ ] D1-3.3 | Dev 1 | Công bố FL-06 Explore cho học sinh | O-3.1 |
| [ ] D2-3.1 | Dev 2 | FL-20, FL-21 (sinh thái), FL-27 (phân tử) Explore | O-3.1 |
| [ ] D2-3.2 | Dev 2 | Studio FL-16 (giải phẫu, Kit Bổ trợ) | O-3.1 |
