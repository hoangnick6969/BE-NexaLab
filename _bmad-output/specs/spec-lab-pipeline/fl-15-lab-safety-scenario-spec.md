# Spec áp dụng: FL-15 An toàn phòng thí nghiệm (bàn kịch bản an toàn)

Theo [mẫu spec áp dụng](lab-explore-bench-spec-template.md) cho bàn kịch bản của Kit Hóa học, slot 13 trong [phân công 20 slot](lab-kit-20-slot-delivery-spec.md). Owner đã chốt phạm vi v1. Cấu hình song ngữ v2 có trạng thái `reviewed` theo uỷ quyền của Owner, với [bản ghi duyệt an toàn](fl-15-safety-review-checklist.md).

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | Bàn mới trong Kit Hóa học: `kit = k2-safety-scenario@1` (tên đề xuất), `group = chemistry`. FE `src/features/labs/chemistry/safety/`, sim `packages/sim/safety-scenario/`. Không dùng engine bàn ướt. |
| Lab đầu tiên | FL-15, Lab ID `lab-safety`. Explore không chấm điểm. Outcome `KHTN8-B01-O01`, topic `KHTN8-L01`. Bài liên quan đã phát hành có cùng topic code. |
| Cách mở | `/labs/:id` với config đã ghim. Lab mới, không phụ thuộc D-5. |
| Mô hình | Máy trạng thái tất định cho bước, lựa chọn và hệ quả của kịch bản. Cảnh báo ở hệ quả đọc từ `hazard.tags`. Không mô phỏng vật lý hay hóa học. `review.status: reviewed` cho v2. |

## Hoạt động v1

Nhận diện nguy hiểm và chọn biện pháp bảo hộ trước một thao tác.

1. Học sinh xem một cảnh phòng thí nghiệm (dụng cụ, hóa chất có nhãn) và chọn các nguy cơ nhìn thấy.
2. Ba tình huống gồm đọc nhãn và nhận diện nguy hiểm, chuẩn bị trước minh hoạ pha loãng axit, chọn kẹp và hướng miệng khi đun ống nghiệm.
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
| Config/sim | Schema `SafetyScenarioConfig` mở rộng `ExploreLabEnvelope`: `scenes`, `steps`, `choices`, `consequences`, `hazardRefs` (id hóa chất hoặc dụng cụ, lấy tag từ `reagents.ts`). Validator trả cảnh báo trạng thái nháp theo P0 C2.3, kiểm kind dụng cụ, tham chiếu và đường tới kết thúc. Golden theo kịch bản. |
| BE | Mục `EXPLORE_BENCHES["k2-safety-scenario@1"]` với validator, model và dựng activity spec; loader seed và topic code. |
| FE | Mục registry `{ kit: "k2-safety-scenario@1", group: "chemistry", validate, loadPage, listKitItems }`. 2D là mặc định. Nút chuyển 2D/3D của `LabSpace` giữ nguyên cảnh và lượt lựa chọn. 3D dùng phòng `PhysicalLabEnvironment` qua `PhysicsStage`, chai và ống nghiệm từ Kit Hóa học, cốc từ `shared/items/`. Ảnh bìa `lab-safety.webp` chụp từ cảnh nhận diện nguy hiểm 3D. |
| Item | `listKitItems` cấp thông tin dụng cụ, hóa chất và trang bị bảo hộ cho panel dùng chung “Dụng cụ và thành phần” (P0 C2.2) và danh mục Kit. Cảnh báo lấy từ `reagents.ts`. Kính, găng, áo, kẹp ống nghiệm và đèn cồn có mô hình riêng của FL-15. Cảnh 2D và 3D đọc cùng tập item của tình huống. |
| Nhật ký | Khóa `labId@activity.id`. Mỗi lựa chọn thêm một dòng với bước, lựa chọn và giải thích từ bảng hệ quả. Dùng lưu/đọc/export chung. |
| Class Explore | v1 chưa hỗ trợ. Đề xuất sau: yêu cầu `explain`; mẫu giáo viên chọn kịch bản. Cần quyết định riêng. |

## Nghiệm thu

- Lab hiện trong danh mục sau khi phát hành và reviewer an toàn đã ký duyệt kịch bản; mở đúng renderer qua registry; panel liệt kê item của config đã ghim.
- Học sinh đổi 2D/3D giữa hai bước và tiếp tục cùng kịch bản. Kiểm ảnh bìa, mục dụng cụ và liên kết bài học sau khi tải mới trang danh mục.
- Validator và golden bao phủ mọi nhánh; kịch bản tham chiếu hóa chất không tồn tại bị từ chối.
- Explore không chấm điểm, không tạo `LabRun`, `Attempt`, `Progress`.
- Seed trên DB cô lập: chạy lại giữ version.
- Hồi quy: bàn ướt K2 và các Lab Hóa học khác không đổi.

## Duyệt và kiểm thử

- Cấu hình song ngữ diễn giải SGK và spec. Nguồn theo từng nội dung ở [bản ghi duyệt](fl-15-safety-review-checklist.md) theo mẫu [FL-16](fl-16-sme-review-checklist.md). Các nhánh lựa chọn và cảnh báo theo mã sản phẩm đã được đối chiếu trước khi phát hành qua Admin API trên fixture.
- Trên DB loopback cô lập đã migrate và seed tài khoản, chạy `npm run db:seed:explore -- --kit k2-safety-scenario@1`. Chạy lại cùng nội dung phải giữ nguyên version. Bản kiểm thử mở bằng BE 4011 và FE 5191.
- Lệnh preflight theo Lab là `npx tsx scripts/publish-k2-explore.ts --lab lab-safety`. Admin API kiểm `review.status` trước khi ghi. Sau khi admin ký và owner đồng ý phát hành, chạy lại preflight trước bước apply.
- Mẫu tích hợp bàn độc lập và tarball là [FL-06 của Dev 1](../../../packages/sim/mechanics/). Mẫu config và kiểm hồi quy Kit Hóa học là [FL-11](fl-11-solution-concentration-explore-spec.md).
