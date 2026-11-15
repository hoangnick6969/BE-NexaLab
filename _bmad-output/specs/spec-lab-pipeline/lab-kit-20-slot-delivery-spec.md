---
id: SPEC-lab-kit-20-slot-delivery
status: proposed
date: 2026-11-15
depends_on: [SPEC-lab-mode-foundation-p0, SPEC-lab-kit-assets-and-class-lab]
---

# Phân công 20 slot Lab theo Kit và mode

## 1. Kit, bàn và dụng cụ

Áp dụng mô hình **một thư viện item dùng chung → bốn Kit → các bàn** của [P0 §2.1](lab-mode-foundation-p0-spec.md#21-tổ-chức-4-kit-các-bàn-một-thư-viện-item-dùng-chung). Kit là nhóm để học sinh và giáo viên duyệt Lab và dụng cụ. Bàn là nơi dev triển khai hoặc tái sử dụng scene, tương tác và mô hình. Giữ các thư mục hiện có. Trong registry, `group` là Kit hiển thị, còn `kit` là ID bàn tương thích với dữ liệu hiện có.

- **Kit Hóa học** có 6 slot, FL-10–15. K2 là bàn ướt cho FL-10–14 (`k2-wet-bench@1`). FL-15 thuộc cùng Kit và có kịch bản an toàn riêng.
- **Kit Vật lý** có 10 slot, gồm các bàn điện, chất lỏng, cơ, nhiệt và quang.
- **Kit Sinh học** có 4 slot, gồm các bàn sinh thái, di truyền và phân tử.
- **Kit Bổ trợ Explore** có bàn giải phẫu. FL-16 và FL-17 nằm ngoài 20 slot chính.

Item chung có ID loại, tên, công dụng và component hiển thị dùng lại. Hai vật cùng loại trên bàn vẫn có ID riêng. Component có thể có biến thể 2D/3D. Bàn cung cấp số đo, tương tác và trạng thái mô phỏng. Cốc và cân là hai item đầu tiên của pilot. Đưa thêm ống đong, nhiệt kế hoặc dụng cụ khác vào thư viện khi có cảnh thứ hai thật sự dùng cùng component.

- **Học sinh:** trong mỗi bàn có panel **Dụng cụ và thành phần**, hiển thị tên, công dụng và lưu ý an toàn nếu có của các item trong cấu hình đang mở. Duyệt Lab theo Kit giúp tìm bài. Trang duyệt toàn bộ item theo Kit là phần tùy chọn của C2.2.
- **Giáo viên:** chọn Kit và Lab trước, rồi xem mẫu Class Explore và các item được phép chọn trong mẫu đó. Màn chọn dùng cùng metadata dụng cụ với học sinh. Danh mục Kit giúp tìm bài, còn mẫu của từng Lab xác định cấu hình giao được.

## 2. 20 slot chính

Số slot và FL ID lấy từ [portfolio 20 slot](lab-portfolio-20-slots-v1.md). Hai cột trạng thái dựa trên mã FE và truy vấn chỉ đọc DB dùng chung ngày 2026-11-15. **ACTIVE** là release Guided trong DB. **Công bố cũ** là Explore đang dùng `Lab.config.explore`, với bản ghim chưa chứa `spec.explore`. **Dev** là config mở qua route phát triển. **Chưa có** nghĩa là chưa thấy luồng riêng trên nhánh đang kiểm. Trạng thái DB và mã nguồn chưa xác nhận việc mở bài trên môi trường FE đang triển khai.

Cột cuối là đề xuất giao việc. Với bài mới, chọn Explore nếu mục tiêu là thay đổi điều kiện và quan sát. Chọn Guided khi bài cần đánh giá bằng rubric. Lab Guided hiện có giữ release và rubric. Mở thêm Explore cho học sinh trên cùng Lab ID chờ D-5.

### Kit Hóa học

| Slot · Lab | Bàn | Guided hiện tại | Explore hiện tại | Ticket tiếp theo |
|---|---|---|---|---|
| 8 · FL-10 Mol và phương trình hóa học | Bàn ướt K2 | ACTIVE v1, bảo toàn khối lượng | Dev, phạm vi bảo toàn khối lượng | Nghiệm thu cốc/cân trên dev. Phần mol còn lại theo K và D-2. Công bố Explore chờ D-5 |
| 9 · FL-11 Dung dịch và nồng độ | Bàn ướt K2 | Chưa có | Chưa có | Explore trước với pha dung dịch và quan sát nồng độ. Dùng lại cốc hoặc ống đong phù hợp |
| 10 · FL-12 Tốc độ phản ứng | Bàn ướt K2 | Chưa có | Chưa có | Explore trước cho một yếu tố ảnh hưởng đến tốc độ. Chốt phép đo và giới hạn mô hình trước khi thêm nhiều yếu tố |
| 11 · FL-13 Acid–base, chỉ thị và pH | Bàn ướt K2 | Chưa có | Đã ghim v2 theo P0, dữ liệu `unverified` | Thêm panel dụng cụ ở A, rồi làm pilot Class Explore ở C |
| 12 · FL-14 Phản ứng vô cơ và kim loại | Bàn ướt K2 | Chưa có | FL-14a đã ghim v2 theo P0, giới hạn ở phản ứng kim loại | Giữ ca hồi quy FL-14a. Mở rộng Explore theo từng phản ứng con sau khi chốt phạm vi `SPLIT` |
| 13 · FL-15 An toàn phòng thí nghiệm | Kịch bản an toàn | Chưa có | Chưa có | Đề xuất Guided nếu đánh giá lựa chọn an toàn. Viết tình huống và rubric riêng, giữ yêu cầu review an toàn trong catalog |

### Kit Vật lý

| Slot · Lab | Bàn | Guided hiện tại | Explore hiện tại | Ticket tiếp theo |
|---|---|---|---|---|
| 1 · FL-01 Mạch điện một chiều | Điện | ACTIVE v2, activity bóng đèn | Chưa có | Giữ Guided v2. Thiết kế Explore trên bàn điện nếu nhận ticket mở rộng, công bố chờ D-5 |
| 2 · FL-03 Khối lượng riêng | Chất lỏng | ACTIVE v1 | Chưa có | Dùng lại cốc/cân từ K2 trong cảnh thật để nghiệm thu B. Đây là ticket FE trên Guided hiện có |
| 3 · FL-04 Áp suất chất lỏng và khí quyển | Chất lỏng | Chưa có | Chưa có | Đề xuất Explore trước với áp suất theo độ sâu. Chốt nguồn và lát cắt trước khi thêm khí quyển |
| 4 · FL-05 Lực đẩy Archimedes | Chất lỏng | ACTIVE v1 | Chưa có | Giữ Guided. Có thể dùng cảnh này để nghiệm thu asset nếu phù hợp với component chung |
| 5 · FL-06 Moment lực và đòn bẩy | Cơ | ACTIVE v1 | Có sandbox, chưa có luồng Explore riêng | Bàn đầu tiên nhận contract ngoài K2. Dùng lại thanh đòn và mô hình, làm Explore ở dev/fixture tới D-5 |
| 6 · FL-07 Năng lượng nhiệt | Nhiệt | ACTIVE v1 | Chưa có | Giữ Guided. Khi làm Explore, dùng lại readout và scene nếu phù hợp, công bố chờ D-5 |
| 7 · FL-08 Truyền nhiệt | Nhiệt | Chưa có | Chưa có | Đề xuất Explore trước với so sánh dẫn nhiệt. Dùng lại phần hiển thị nhiệt phù hợp và xây mô hình cho bài này |
| 16 · FL-23 Quang học | Quang | Chưa có | Chưa có | Đề xuất Explore cho một lát cắt khúc xạ. Chốt phạm vi `SPLIT` và nguồn K9 trước khi mở rộng sang các hoạt động quang học khác |
| 17 · FL-24 Cơ năng, công và công suất | Cơ | Chưa có | Chưa có | Đề xuất Explore trước cho một hiện tượng cơ năng. Chốt nguồn K9 và lát cắt, giữ mô hình độc lập với FL-06 |
| 18 · FL-25 Cảm ứng điện từ | Điện | ACTIVE v1 | Có phần thử tự do trong bài, chưa có luồng Explore riêng | Dùng lại cuộn dây, nam châm và thao tác thử tự do nếu nhận ticket Explore, công bố chờ D-5 |

### Kit Sinh học

| Slot · Lab | Bàn | Guided hiện tại | Explore hiện tại | Ticket tiếp theo |
|---|---|---|---|---|
| 14 · FL-20 Nhân tố và giới hạn sinh thái | Sinh thái | ACTIVE v1 | Chưa có | Ứng viên Explore từ cảnh hệ sinh thái hiện có. Công bố chờ D-5 |
| 15 · FL-21 Lưới thức ăn | Sinh thái | ACTIVE v1 | Chưa có | Giữ Guided. Nếu nhận ticket Explore, dùng lại sơ đồ và cho thử các quan hệ trong phạm vi mô hình |
| 19 · FL-26 Lai Mendel và di truyền | Di truyền | Chưa có. Thư mục FE mới có README | Chưa có | Đề xuất Explore trước với phép lai một tính trạng. Chốt nguồn K9 rồi mở rộng sau |
| 20 · FL-27 Từ gene đến protein | Phân tử | ACTIVE v1 | Chưa có | Giữ Guided theo trạm. Khi nhận ticket Explore, tái sử dụng hiển thị phân tử cho lát cắt đã chọn, công bố chờ D-5 |

### Kit Bổ trợ Explore · ngoài 20 slot chính

| Lab | Bàn | Guided hiện tại | Explore hiện tại | Ticket tiếp theo |
|---|---|---|---|---|
| FL-16 Cấu tạo mắt và điều tiết | Giải phẫu | ACTIVE v1 | Chưa có luồng Explore riêng | Đề xuất studio phần cấu tạo mắt qua dev/fixture. Công bố trên cùng Lab ID chờ D-5 |
| FL-17 Tuần hoàn và hô hấp | Giải phẫu | Chưa có | Chưa có | DEFER theo catalog |

FL-02 và FL-09 cũng giữ DEFER. FL-14a là phần đã có của slot 12. Một Lab có thêm mode vẫn nằm trong slot hiện có.

## 3. Mốc giao dev

P0 đạt `Contract done` ngày 2026-11-15 ([checklist P0](lab-mode-foundation-p0-checklist.md)). Việc giao chia theo hai trục:

- **Increment** (INC) là mốc **nối tiếp**. Một INC chỉ mở khi điều kiện mở của nó đạt. Không ai làm việc của INC sau trước khi INC đó mở.
- **Trong một INC**, ba người làm **song song**, mỗi người một bàn. Việc của **cùng một người** làm **theo thứ tự số**.

| Người | Phụ trách |
|---|---|
| **K2** (người phụ trách pilot) | Kit Hóa học, bàn ướt, thư viện `shared/items/`, Class Explore FL-13. Duyệt mọi PR item dùng chung |
| **Dev 1** (Vật lý) | Bàn cơ (FL-06), bàn chất lỏng (FL-03, FL-05) |
| **Dev 2** (Sinh học) | Bàn di truyền (FL-26), sau đó các bàn Sinh học khác |

| INC | Mở khi | K2 | Dev 1 | Dev 2 |
|---|---|---|---|---|
| **INC-0** Đóng rollout P0 | Ngay | Merge và deploy PR-2. Owner chốt D-2 và Q-1 | Chụp baseline ảnh và số đo FL-03, FL-05, FL-10 Guided | Chốt nguồn K9 và phạm vi FL-26 |
| **INC-1** Pilot A + bàn thứ hai | P0 Contract done (đã đạt). Phát hành lên Supabase chờ PR-2 deploy | **A**: cốc và cân vào `shared/items/`, registry renderer, panel dụng cụ. **K** song song khi D-2 đã chốt | **FL-06 Explore dev/fixture**: spec áp dụng, schema và validator, đăng ký registry FE và BE | **Chuẩn bị FL-26**: spec áp dụng, model Mendel trong sim kèm golden. Chưa làm bàn FE |
| **INC-2** Dùng lại asset + Class Explore | A nghiệm thu xong. Riêng Dev 2: FL-06 chạy qua registry | **C**: Class Explore FL-13, rồi phát hành | **B**: FL-03 (hoặc FL-05) và FL-10 Guided dùng cốc/cân chung | **FL-26 Explore 2D**: bàn FE, registry, seed, phát hành Lab mới |
| **INC-3** Mở rộng | C nghiệm thu xong. D-5 cho các Lab đã có Guided | FL-14, FL-10 mol, FL-11, FL-12, FL-15 | C3 cho FL-06; Explore FL-04, FL-08, FL-23, FL-24 | FL-20, FL-21, FL-27, FL-16 |

Danh sách task chi tiết, thứ tự và trạng thái nằm ở [tracking giao việc](lab-kit-delivery-tracking.md).

Quy tắc giữ nguyên:
- Mỗi ticket bàn ghi Lab ID, mode định giao, cảnh/engine dùng lại, item dùng chung và item riêng, cùng ca nghiệm thu. Ticket Lab công bố kiểm cả thẻ danh mục và route mở bài.
- Mỗi bàn dùng chung envelope, registry, seed (`db:seed:explore --kit`) và cơ chế ghim của P0.
- Lab đã có Guided (FL-06, FL-10, FL-03…) chỉ làm Explore trên dev/fixture tới khi có D-5. Lab mới (FL-26, FL-04, FL-08…) phát hành được qua `publishExploreLab`.
- **Giới hạn track.** [Phase plan](lab-pipeline-phase-plan.md) giữ tối đa hai track Lab đồng thời khi P3.5 chưa đạt. Ở INC-1, Dev 2 chỉ làm spec và model sim, không mở track Lab thứ ba. Từ INC-2, FL-26 là track thứ ba và cần owner xác nhận nới giới hạn này.

## 4. Class Lab Explore từ thí nghiệm đến câu hỏi

Luồng này đã có **kế hoạch** trong [P0 C3](lab-mode-foundation-p0-spec.md#c3-class-lab-explore-giáo-viên-customize-foundational-lab-trong-allow-list-của-bàn) và [pilot FL-13 §3](lab-kit-assets-and-class-lab-spec.md#3-class-lab-explore-từ-fl-13). Ở mã hiện tại, Class Lab đã có luồng Guided dựa trên `releaseId` và `challengeId`, kèm `reportPrompts`. Chưa thấy nhánh Class Explore dùng `classTemplates` và bảng bài nộp Explore trong FE/BE.

1. Giáo viên vào **Class Space**, lọc theo Kit hoặc bàn rồi chọn Lab Explore có mẫu đã ghim.
2. Chọn cấu hình thí nghiệm trong mẫu. FL-13 giữ dụng cụ bắt buộc và cho chọn đúng hai mẫu hóa chất theo allow-list. Bàn khác khai báo tham số và giới hạn tương ứng trong mẫu của mình.
3. Chọn câu hỏi tương thích với cấu hình. FL-13 cần hai số đo pH và một giải thích. Q-1 còn mở. Phạm vi tối thiểu đề xuất là một câu so sánh dùng được cho mọi cặp. Nếu dùng `strong-vs-weak`, chỉ cho phép khi cặp đã chọn là HCl và CH₃COOH. Câu hỏi tự do do giáo viên viết cần quyết định riêng về dữ liệu và quyền sửa.
4. Xem trước, lưu và giao. Học sinh mở đúng cấu hình và câu hỏi đã ghim bằng `assignmentId`, ghi số đo và gửi giải thích. Giáo viên nhận xét trong Class Space. Trạng thái đi từ **Đã nộp** đến **Đã nhận xét**, cùng quy tắc Explore không tính điểm hay tiến độ Foundational.

Mốc nghiệm thu pilot là một giáo viên chọn hai mẫu và một câu hỏi, giao bài, học sinh thuộc đối tượng giao nộp được và giáo viên gửi nhận xét. Bài đã giao giữ cấu hình và câu hỏi khi nguồn được cập nhật. Quyền truy cập và snapshot theo C3.4.

## Nguồn đối chiếu

- [P0 và mốc bàn giao](lab-mode-foundation-p0-spec.md) · [Pilot Kit Hóa học](lab-kit-assets-and-class-lab-spec.md)
- [Danh mục 20 slot](lab-portfolio-20-slots-v1.md) · [Catalog và tên bàn lịch sử](lab-catalog-and-shared-kits-khtn8-9.md) · [Backlog Explore](../../../docs/bmad/explore-labs-backlog-and-epics.md)
- Trạng thái kiểm từ `Lab`, `LabRelease` và `PracticalActivityVersion`; đối chiếu renderer FE `src/features/labs/runtime/activity-renderers.tsx`, định tuyến Explore `src/features/labs/runtime/explore-labs.ts` và config `src/features/labs/chemistry/wet-bench/labs/`.
