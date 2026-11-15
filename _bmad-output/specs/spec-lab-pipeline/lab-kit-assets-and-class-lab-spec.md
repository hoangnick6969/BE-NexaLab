---
id: SPEC-lab-kit-assets-and-class-lab
status: proposed
date: 2026-11-15
revision: 4 (pilot Kit Hóa học theo mô hình 4 Kit + bàn + thư viện item dùng chung của P0)
depends_on: [SPEC-lab-mode-foundation-p0]
---
# Pilot Kit Hóa học: bàn ướt, thư viện item và Class Lab Explore từ FL-13

## 1. Vai trò của spec

Spec này **áp dụng** [contract chung P0](lab-mode-foundation-p0-spec.md) cho **bàn ướt của Kit Hóa học**. Bàn ướt trước đây được gọi là K2. Các quy tắc chung đã có ở P0, ở đây không nhắc lại:

- tổ chức 4 Kit, bàn và thư viện item dùng chung (§2.1);
- hai trục mode; Explore không tạo verdict hay tiến độ (§2.2);
- mode, ghim, seed (C1);
- Kit, bàn và thư viện item phải cung cấp gì (C2);
- cấu hình mẫu, loại yêu cầu và bài nộp (C3).

Spec này chỉ ghi phần riêng của bàn ướt:
- bàn ướt đã có những gì;
- hai item đầu tiên của thư viện dùng chung: cốc và cân;
- cấu hình mẫu FL-13;
- thứ tự làm;
- lộ trình 6 Lab của Kit Hóa học.

Quyết định sản phẩm giữ nguyên:
- **Mỗi Foundational Lab có một mục danh mục.** Lab đó có thể có Guided, Explore hoặc cả hai.
- Hai mode của FL-10 cùng thuộc slot 8. FL-13 là slot 11. FL-14a là phần đã làm của FL-14 trong slot 12.
- Danh mục 20 slot vẫn là danh sách đề xuất từ 30 ứng viên.

**Foundational Explore là open curriculum** (P0 §2.2, D-1). Học sinh mở tự do, kèm nhãn khi dữ liệu còn `unverified`. Chỉ thêm Guided khi bài có mục tiêu đánh giá rõ. Thêm Explore cho một Lab Guided sẵn có theo từng activity, kèm golden test, và chỉ khi mô hình cho phép đổi điều kiện tự do.

## 2. Bàn ướt và thư viện item: gộp cái đã có, không tạo lại

Bàn ướt đã có đủ các lớp C2 nhưng đang nằm rải rác. Bước A gộp chúng lại.

| Lớp (P0 C2) | Bàn ướt đang có | Bước A làm |
|---|---|---|
| Hạ tầng chung (P0 §5.2) | F0-1, F0-2, F0-4, F0-5 làm trong P0, với bàn ướt là bàn đầu tiên dùng | Không làm lại ở pilot |
| sim (C2.3) | `wet-bench/contracts.ts` (11 `APPARATUS_KINDS`, 3 `MEASUREMENTS`, `VESSEL_SPECS`), `reagents.ts` (14 thuốc thử, có `hazard` và `safetyNote*`), `species.ts` (22 species), `reactions.ts` (neutralization + 6 luật), `validate-config.ts` | Giữ nguyên ID. Không đổi dữ liệu khoa học, trừ bước K (khối lượng mol) |
| Thư viện item dùng chung (C2.1) | Khung tạo ở P0 §5.2. Cốc và cân đang được vẽ riêng ở 3 nơi: `chemistry/wet-bench/kit/apparatus3d.tsx` (`Beaker3D`, `Scale3D`), `chemistry/wet-bench/WetBenchStage.tsx` (`Vessel` và cân viết thẳng trong file, FL-10 Guided), `physics/fluid/kit/apparatus/Beaker3D.tsx` và `two-d/K3Apparatus2D.tsx` (`Balance2D`) | Tạo `src/features/labs/shared/items/` với **cốc** và **cân** lấy từ bàn ướt Explore. Mỗi item gồm tên, công dụng, component, anchor. Kích thước, mức chất lỏng và số đọc truyền qua props. Bàn ướt Explore dùng thư viện này |
| Danh mục item của bàn (C2.3) | `kit/apparatus-manifest.ts` (`labelVi`, `purposeVi`, `role`, `tool`), các mesh còn lại trong `apparatus3d.tsx`, offset ở `WetBenchKitStage.tsx:32-33`, `kit/bench-layout.ts` | Gộp thành một registry theo `ApparatusKind`. Mỗi kind trỏ tới item dùng chung (cốc, cân) hoặc item riêng (ống nghiệm, bút pH, ống nhỏ giọt…). Bỏ chuỗi if/else chọn mesh. Thêm `listKitItems(config)` trả dụng cụ và hóa chất, kèm cảnh báo lấy từ `reagents.ts` |
| Đăng ký runtime (C2.3) | `runtime/explore-labs.ts` chỉ đọc `k2LabConfigs` | Đăng ký bàn ướt theo dạng `{ kit: "k2-wet-bench@1", group: "chemistry", validate, loadPage, listKitItems }` (F0-2) |

- Học sinh có panel **"Dụng cụ và thành phần"** cố định trong bàn, đọc từ `listKitItems` của config đã ghim. Panel này mở rộng danh sách đang chỉ có ở màn giới thiệu (`shared/LabIntroOverlay.tsx`).
- Màn chọn của giáo viên dùng cùng hàm, lọc theo `classTemplates`.
- Trang thư viện theo Kit chưa làm trong pilot (P0 C2.2).
- Lab mới của Kit Hóa học **bổ sung item vào cùng danh mục** (xem §5). Item nào bàn khác của Kit Vật lý hoặc Kit Sinh học cũng dùng thì đưa vào thư viện dùng chung. Ví dụ nhiệt kế và đồng hồ bấm giờ khi làm FL-12.

## 3. Class Lab Explore từ FL-13

Phần này áp dụng C3 với một cấu hình mẫu duy nhất:

| Thành phần | Giá trị FL-13 (theo `labs/fl-13.config.ts` hiện có) |
|---|---|
| Item bắt buộc | `digital_ph_meter` (bút đo pH), ống nghiệm, ống nhỏ giọt, cốc thải |
| Nhóm tùy chọn "mẫu" | Chọn **đúng 2** trong allow-list: `HCl_0_1M`, `H2SO4_0_05M`, `CH3COOH_0_1M`, `H2O_distilled`, `NaOH_0_1M`, `CaOH2_0_01M` |
| Prompt | Chọn 1 trong các prompt có ID của FL-13 (ví dụ `strong-vs-weak`), hoặc 1 câu quan sát của lớp |
| Yêu cầu | `measure` × 2 (pH của từng mẫu đã chọn, dạng `tenthsPh`) + `explain` × 1 |

Luồng làm bài:

1. **Giáo viên tạo bài.**
   - Chọn FL-13, cấu hình mẫu pH, 2 mẫu và 1 câu hỏi.
   - Preview gọi `deriveWetBenchEffectiveConfig` và validator strict (C3.2) trong sim, đúng hàm server dùng.
2. **Lưu bản nháp và giao bài.** `ClassResource` ghim theo C3.4: `activityVersionId`, digest, `templateId`, `selection`, `effectiveConfigDigest`, `requirements`.
3. **Học sinh làm bài.**
   - Mở bàn với config hiệu lực đã ghim.
   - Đo pH, rồi nộp 2 giá trị theo tên 2 mẫu cùng 1 nhận xét.
   - Server kiểm hai mẫu đúng là hai mẫu trong cấu hình ghim, kiểm định dạng và khoảng giá trị.
   - Bài nộp hiển thị là **số đo do học sinh ghi lại**.
4. **Giáo viên nhận xét** trong Class Space. Trạng thái `Đã nộp` → `Đã nhận xét`, tách khỏi verdict và tiến độ.

Validator strict của bàn ướt phải thêm một việc: cảnh báo "phản ứng không xảy ra" ở `validate-config.ts:44-55` trở thành lỗi khi một yêu cầu cần hiện tượng đó. Hiện check này cũng bỏ qua phản ứng loại `acid_base`. Không có cổng review bộ môn (P0 D-4).

Liên quan đến code hiện có:
- Class Lab Guided (`class-lab-resource.ts`) yêu cầu release và challenge. Vì vậy Explore đi nhánh `source.mode = "explore"` riêng.
- Câu hỏi bổ sung (`ClassLabAdditionalResponse`) chỉ nhận văn bản. Bài nộp có `measure` dùng bảng riêng theo C3.4.
- Ở bản đầu, bài giao và bài nộp Explore nằm trong Class Space.

## 4. Thứ tự làm

| Bước | Phạm vi và đầu ra | Phụ thuộc |
|---|---|---|
| **P0** | Contract chạy bài C1: mode, ghim, seed cô lập | — |
| **A. Bàn ướt + thư viện item** | Thêm cốc và cân vào khung `shared/items/` đã tạo ở P0 §5.2. Registry dụng cụ theo §2, `listKitItems`, panel "Dụng cụ và thành phần", đăng ký runtime. Hình ảnh và số đo trước/sau phải giống nhau (so ảnh + Playwright FL-13) | P0 |
| **K. Dữ liệu bàn ướt** | Thống nhất khối lượng mol theo D-2: sửa `species.ts`, cập nhật golden và `engine.test.ts`, giữ nguyên `mass-conservation@1.0.0`, bump sim | D-2. Làm song song với A |
| **C. Class Lab Explore FL-13** | `classTemplates` trong `spec`, `deriveWetBenchEffectiveConfig` + validator strict, nhánh `source.mode = "explore"`, bảng bài nộp, màn giáo viên, màn học sinh, nhận xét. Fixture trên DB cô lập qua seed có guard | P0, A |
| Phát hành | Thủ tục phát hành owner lên DB dùng chung (P0 C1.3) | C |
| **B. Bàn khác dùng cốc/cân chung** | FL-10 Guided (`WetBenchStage.tsx`) và bàn chất lỏng chuyển sang cốc/cân của `shared/items/`. Chỉ đổi hiển thị: số đo FL-10 vẫn do server tính (mg), chuỗi sự kiện giữ nguyên, số đo bàn chất lỏng giữ nguyên. Nếu một bàn cần hình dạng khác mà props không phủ được thì giữ component riêng và ghi lý do | A. FL-10 D5 (UI/K2). Chốt chặn: `tests/fl-10-k2.spec.ts` và so ảnh |

## 5. Lộ trình 6 Lab Kit Hóa học

Trạng thái theo code ngày 2026-11-15. Mọi Lab sau pilot đều bổ sung vào danh mục bàn ướt, hoặc vào thư viện dùng chung nếu Kit khác cũng cần.

| Slot | Lab | Guided | Explore | Cần thêm vào thư viện hoặc engine | Thứ tự |
|---|---|---|---|---|---|
| 11 | **FL-13** Acid–base, chỉ thị, pH | ❌ | ✅ (dữ liệu `unverified`) | Không. Pilot Class Lab | **Pilot** |
| 12 | **FL-14** Phản ứng vô cơ & kim loại | ❌ | 🟡 FL-14a | Chất Mg, Al, Ag, AgNO₃, FeCl₃, Na₂CO₃…; luật kết tủa/khí/thế; chốt cách tách 14a/14b/14c | 1 |
| 8 | **FL-10** Mol & PTHH | 🟡 Bảo toàn khối lượng (ACTIVE) | 🟡 Chỉ ở route dev | Dụng cụ và phép đo thể tích khí, Mg/MgCl₂, HUD mol. Phụ thuộc bước K; chuyển mode phụ thuộc F0-7b | 2 |
| 9 | **FL-11** Dung dịch & nồng độ | ❌ | ❌ | Engine: mô hình hòa tan, thao tác khuấy. Dụng cụ: bình định mức, đũa khuấy, thìa, **ống đong** (dùng chung với bàn chất lỏng). Chất rắn NaCl, CuSO₄ | 3 |
| 10 | **FL-12** Tốc độ phản ứng | ❌ | ❌ | Engine: trục thời gian (`wet-bench@1.1.0`), dạng bột, bể nhiệt, **nhiệt kế** và **đồng hồ bấm giờ** (dùng chung với bàn nhiệt), thu khí; H₂O₂/MnO₂ cần lưu ý an toàn | 4 |
| 13 | **FL-15** An toàn PTN | ❌ | ❌ | **Bàn riêng trong Kit Hóa học**, không dùng engine bàn ướt. Cần mô hình kịch bản; dùng lại `hazard.tags` | Riêng |

**Sau pilot, Kit áp dụng tiếp theo là Kit Vật lý, bắt đầu từ bàn cơ (FL-06 Đòn bẩy).** Lý do:
- Lab Guided đã phát hành.
- Đã có sandbox chạy trên trình duyệt (`LeverInvestigationActivity.tsx` gọi `evaluateLeverBench`).
- Item ít.
- Không có phản ứng hóa học, nên kiểm được C2/C3 không phụ thuộc hóa học.

Bàn này cần một spec áp dụng riêng, viết theo mẫu ở P0 §5.2. Dev Kit Vật lý bắt đầu được sau mốc "Contract done" (P0 §5.3), song song với pilot. Phần C3 của bàn này chờ pilot xong bước C. Kit Sinh học và Kit Bổ trợ Explore làm sau, khi contract đã chạy ở hai Kit.

## 6. Nghiệm thu pilot

Tất cả chạy trên DB cô lập.

- [ ] **A:**
  - Cốc và cân của bàn ướt Explore render từ `shared/items/`.
  - Panel học sinh và màn chọn giáo viên đọc cùng `listKitItems` và cùng ID.
  - Mesh tra theo ID.
  - Hình ảnh, số đo pH và số cân của FL-13/FL-14a trước và sau bước A giống nhau.
- [ ] **C, giao bài:**
  - Server từ chối mẫu ngoài allow-list, số mẫu khác 2, thiếu bút đo, prompt không có trong mẫu, hoặc lựa chọn ngoài khoảng.
  - Preview, bản giao và màn học sinh có cùng `effectiveConfigDigest`.
- [ ] **C, truy cập:** học sinh ngoài lớp hoặc ngoài đối tượng giao không mở hay nộp được bằng link trực tiếp, và không nhận được ngữ cảnh qua tutor.
- [ ] **C, nộp bài:**
  - Học sinh nộp 2 số đo và 1 nhận xét.
  - Retry của cùng học sinh trên cùng bài giao trả lại bài đã lưu.
  - Mẫu ngoài cấu hình ghim hoặc thiếu mẫu bị từ chối.
  - Hai bài giao dùng cùng FL-13 có nháp và bài nộp tách riêng.
- [ ] **C, ghim:**
  - Sửa bản nháp hoặc seed một version FL-13 mới không làm đổi cấu hình, câu hỏi hay bài nộp đã ghim.
  - Không tạo `LabRun`, `Attempt`, verdict hay `Progress`.
- [ ] **B:** FL-10 Guided và bàn chất lỏng dùng cốc/cân chung. `tests/fl-10-k2.spec.ts` pass, ảnh trước/sau khớp, số đo không đổi.
- [ ] **Tương thích:** bài Class Guided cũ vẫn mở, nộp và chấm được, kể cả bản giao trước thay đổi.
- [ ] **K:** nghiệm thu theo nhánh D-2.
  - Chọn quy ước KHTN 8: hai engine trả cùng khối lượng mol cho các chất chung.
  - Chọn IUPAC: test ghi nhận độ lệch đã biết.
- [ ] Golden test cho mọi hành vi khoa học được thêm hoặc đổi. Lint, test và build ở BE và FE.

## Tham chiếu

- [Contract chung P0](lab-mode-foundation-p0-spec.md) · [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) · [Thiết kế K2 (bàn ướt)](k2-wet-bench-explore-kit-design.md) · [Backlog F0](../../../docs/bmad/explore-labs-backlog-and-epics.md) · [Portfolio 20 slot](lab-portfolio-20-slots-v1.md) · [Danh mục kit cũ](lab-catalog-and-shared-kits-khtn8-9.md)
- [Spec UI dùng chung](lab-space-shared-ui-spec.md) · [Chỉnh câu hỏi gốc](../../../docs/product/class-lab-foundational-fork-direction.md) · [Câu hỏi bổ sung](../../../docs/product/class-lab-additional-questions.md)
- Code: [Class Lab hiện tại](../../../src/modules/classes/application/class-lab-resource.ts) · [validator bàn ướt](../../../packages/sim/wet-bench/validate-config.ts) · [seed bàn ướt](../../../scripts/seed-k2-explore-labs.ts)
