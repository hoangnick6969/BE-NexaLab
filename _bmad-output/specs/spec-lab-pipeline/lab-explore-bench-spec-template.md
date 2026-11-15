# Mẫu spec áp dụng Explore cho một bàn

Điền một bản khi thêm bàn hoặc áp dụng P0 cho bàn hiện có. Dùng [P0 C1/C2](lab-mode-foundation-p0-spec.md#3-contract) và [bảng phân công](lab-kit-20-slot-delivery-spec.md) để chốt lát cắt đầu tiên.

| Phạm vi | Điền |
|---|---|
| Bàn và Kit | Tên bàn, ID `kit`, `group` (`chemistry`, `physics`, `biology`, `explore-support`), thư mục FE và sim |
| Lab đầu tiên | FL ID, Lab ID, mode hiện có, mode triển khai, topic/outcomes và phạm vi quan sát |
| Cách mở | `/labs/:id` với config đã ghim hoặc dev/fixture. Ghi phụ thuộc D-5 nếu Lab ID đang có Guided |
| Mô hình | Engine/version, đơn vị, nguồn và `reviewStatus`, hiện tượng hỗ trợ và giới hạn |

## Đăng ký và tái sử dụng

| Phần | Nội dung cần ghi |
|---|---|
| Config/sim | Schema riêng mở rộng `ExploreLabEnvelope`, validator, dữ liệu của Lab, ca golden và trường hợp ngoài phạm vi |
| BE | Mục registry `EXPLORE_BENCHES` với `kit`, validator, model và cách dựng activity spec. Loader seed và topic code cho bàn |
| FE | Mục registry `kit`, `group`, `validate`, `loadPage`, `listKitItems`. Cảnh, tương tác và component dùng lại từ `LabSpace` |
| Item | ID loại, ID instance, item dùng chung từ `shared/items/`, item riêng của bàn, điểm gắn và số đọc do bàn truyền vào |
| Nhật ký | Khóa `labId@activity.id`, kiểu dòng và mô tả hiện tượng của bàn. Dùng phần lưu/đọc và export chung |
| Class Explore | Ghi loại yêu cầu hỗ trợ (`measure`, `explain`, hoặc đề xuất sau) và phụ thuộc pilot C nếu có. Khi áp dụng C3, ghi mẫu, cấu hình được phép và câu hỏi tương thích |

## Nghiệm thu

- Lab xuất hiện trong danh mục nếu phát hành, mở đúng renderer qua registry và panel liệt kê các item của config đã ghim.
- Validator và golden test bao phủ số đo hay hiện tượng đã cam kết. Lỗi config dừng mở bàn. Explore ghi nhật ký cục bộ và giữ tính chất không chấm điểm.
- Seed theo `npm run db:seed:explore -- --kit <id-bàn>` trên DB cô lập. Chạy lại cùng nội dung giữ version, nội dung mới tạo version mới.
- Nếu bài đã có Guided, kiểm lại mở, nộp và chấm của Guided. Khi áp dụng C3, kiểm bản giao đã ghim, quyền nộp, retry và nhận xét theo P0 C3.
