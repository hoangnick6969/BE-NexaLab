# Spec áp dụng: FL-15 An toàn phòng thí nghiệm (bàn kịch bản an toàn)

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md), có điều chỉnh vì đây **không phải bàn ướt**. Nguồn: [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) (slot 13), [lộ trình Kit Hóa học §5](lab-kit-assets-and-class-lab-spec.md), [catalog](lab-catalog-and-shared-kits-khtn8-9.md) (FL-15 KEEP, "Safety scenarios need a separate safety review and evidence rubric"). Trạng thái: **bản nháp chờ owner duyệt phạm vi; nội dung an toàn cần reviewer an toàn duyệt** (K2-3.4, 2026-11-15). Spec này chỉ định khung; tình huống và đáp án an toàn cuối cùng phải do reviewer cung cấp hoặc duyệt.

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | Bàn mới trong Kit Hóa học: `kit = k2-safety-scenario@1` (tên đề xuất), `group = chemistry`. FE `src/features/labs/chemistry/safety/`, sim `packages/sim/safety-scenario/`. Không dùng engine bàn ướt. |
| Lab đầu tiên | FL-15, Lab ID đề xuất `lab-safety`. Mode triển khai: **Explore không chấm điểm** ở v1; Guided có chấm chờ rubric được duyệt (câu hỏi 1). Outcome và chủ đề do owner chốt (catalog chưa có outcome riêng cho FL-15). |
| Cách mở | `/labs/:id` với config đã ghim. Lab mới, không phụ thuộc D-5. |
| Mô hình | Máy trạng thái tất định cho kịch bản: bước, lựa chọn, hệ quả theo `hazard.tags`. Không mô phỏng vật lý hay hóa học. `reviewStatus: draft`. |

## Hoạt động đề xuất (lát cắt đầu)

Nhận diện nguy hiểm và chọn biện pháp bảo hộ trước một thao tác.

1. Học sinh xem một cảnh phòng thí nghiệm (dụng cụ, hóa chất có nhãn) và chọn các nguy cơ nhìn thấy.
2. Với mỗi thao tác sắp làm (ví dụ pha loãng acid, đun ống nghiệm), học sinh chọn trang bị và cách làm.
3. Bàn phản hồi theo bảng `hazard.tags` đã có ở `reagents.ts` (ví dụ `toxic_if_swallowed`) và mức `level`, nêu vì sao lựa chọn an toàn hay không. Phản hồi là giải thích, không phải điểm.

Dùng lại dữ liệu nguy hiểm của hóa chất K2, nên một cảnh báo chỉ có một nguồn.

## Mô hình và giới hạn

- Kịch bản là dữ liệu: danh sách bước, mỗi bước có tập lựa chọn, mỗi lựa chọn có `consequence` (mã) và `hazardTags` liên quan. Engine chỉ tra bảng và ghi lại lựa chọn theo thứ tự, không suy diễn.
- Tính tất định, thuần dữ liệu, golden theo từng kịch bản.
- Giới hạn khai báo: đây là giáo dục an toàn mức mô phỏng, không thay thế hướng dẫn của giáo viên và quy định của trường.
- Chế độ chấm (Guided) cần rubric bằng chứng riêng: "đúng" của một lựa chọn an toàn phải do reviewer an toàn xác nhận từng mục, kể cả trường hợp có nhiều đáp án chấp nhận được.

## Đăng ký và tái sử dụng

| Phần | Nội dung |
|---|---|
| Config/sim | Schema `SafetyScenarioConfig` mở rộng `ExploreLabEnvelope`: `scenes`, `steps`, `choices`, `consequences`, `hazardRefs` (id hóa chất hoặc dụng cụ, lấy tag từ `reagents.ts`). Validator: mọi `hazardRef` phải tồn tại, mọi bước đều tới được kết thúc. Golden theo kịch bản. |
| BE | Mục `EXPLORE_BENCHES["k2-safety-scenario@1"]` với validator, model và dựng activity spec; loader seed và topic code. |
| FE | Mục registry `{ kit: "k2-safety-scenario@1", group: "chemistry", validate, loadPage, listKitItems }`. Trang kịch bản chủ yếu 2D, có thể dùng cảnh 3D phòng thí nghiệm chung (`PhysicalLabEnvironment`). |
| Item | `listKitItems` trả dụng cụ, hóa chất và trang bị bảo hộ xuất hiện trong kịch bản, lấy cảnh báo từ `reagents.ts`. Trang bị bảo hộ (kính, găng, áo) chưa có trong thư viện; thêm riêng của bàn trước, vào `shared/items/` chỉ khi bàn khác cần. |
| Nhật ký | Dòng mới theo bước và lựa chọn; `describeChange()` mô tả bằng lời của lựa chọn. Dùng lưu/đọc/export chung. |
| Class Explore | v1 chưa hỗ trợ. Đề xuất sau: yêu cầu `explain`; mẫu giáo viên chọn kịch bản. Cần quyết định riêng. |

## Nghiệm thu

- Lab hiện trong danh mục sau khi phát hành và reviewer an toàn đã ký duyệt kịch bản; mở đúng renderer qua registry; panel liệt kê item của config đã ghim.
- Validator và golden bao phủ mọi nhánh; kịch bản tham chiếu hóa chất không tồn tại bị từ chối.
- Explore không chấm điểm, không tạo `LabRun`, `Attempt`, `Progress`.
- Seed trên DB cô lập: chạy lại giữ version.
- Hồi quy: bàn ướt K2 và các Lab Hóa học khác không đổi.

## Câu hỏi mở cho owner

1. v1 chỉ Explore không chấm, hay cần Guided có chấm ngay? Guided kéo theo challenge, chấm điểm phía server và rubric riêng, tốn công hơn nhiều.
2. Danh sách tình huống của lát đầu (đề xuất 2 đến 3 tình huống, ví dụ nhận diện nguy hiểm trong phòng thí nghiệm, pha loãng acid, đun ống nghiệm). Owner hay reviewer cung cấp nội dung gốc?
3. Ai là reviewer an toàn, và mẫu bản ghi duyệt (như `fl-16-sme-review-checklist.md`)?
4. Outcome và topic code của FL-15 (catalog chưa có outcome riêng).
5. Có cần phiên bản tiếng Anh không?

## Task đề xuất sau khi duyệt

| ID | Task | Chờ |
|---|---|---|
| F15-1 | Viết checklist cho reviewer an toàn theo mẫu FL-16 | Duyệt spec |
| F15-2 | Sim: schema kịch bản, validator, golden | F15-1 (nội dung tình huống) |
| F15-3 | BE registry và seed; FE registry, trang kịch bản, nhật ký | F15-2 |
| F15-4 | Phát hành qua Admin API, kiểm chỉ-SELECT | F15-3, reviewer ký duyệt |
