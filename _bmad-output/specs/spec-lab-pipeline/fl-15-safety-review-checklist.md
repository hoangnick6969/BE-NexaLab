# FL-15 — Bản ghi duyệt nội dung an toàn

Trạng thái bản v1 · Chờ admin ký duyệt. Các tình huống dùng cho mô phỏng quyết định của học sinh lớp 8.

## Đối chiếu nguồn

- SGK *Khoa học tự nhiên 8*, Kết nối tri thức với cuộc sống, Bài 1, mục I–III, tr. 6–8. Đối chiếu nhãn, quy tắc dùng hoá chất và cách giữ ống nghiệm. [Bản SGK Bài 1](https://www.sgkvn.com/lop-8-11/ket-noi-tri-thuc-voi-cuoc-song-3/loi-noi-dau-1928/bai-1-su-dung-mot-so-hoa-chat-thiet-bi-co-ban-trong-phong-thi-nghiem-6329.html), [SGV NXBGD](https://sachdientu.nxbgd.vn/thu-vien-so/doc-sach/sgv-khoa-hoc-tu-nhien.4492016197).
- SGK *Hoá học 11*, Kết nối tri thức với cuộc sống, Bài 8, mục I.2, tr. 49–50. Đối chiếu biện pháp bảo hộ và phạm vi giáo viên minh hoạ. [SGK Hoá học 11](https://partner.olm.vn/thu-vien-so/doc-sach/shs-hoa-hoc.4492586545).
- Dữ liệu hoá chất K2 trong [reagents.ts](../../../packages/sim/wet-bench/reagents.ts). Xác nhận mức và nhãn cảnh báo cho đúng nồng độ của `CuSO4_0_1M` và `H2SO4_0_05M` trước khi ký. Dữ liệu danh mục hiện mang trạng thái `unverified`.
- [Spec FL-15](fl-15-lab-safety-scenario-spec.md) và [config song ngữ](../../../packages/sim/safety-scenario/fl15-safety.data.ts). Mã nhánh dưới đây trùng ID trong config.

## Duyệt từng phản hồi

| Tình huống | Lựa chọn → Hệ quả | Nội dung cần xác nhận | Kết luận và trang/SDS |
|---|---|---|---|
| Nhận diện nguy hiểm | `ask → verified` | Để nguyên chai mất nhãn và báo giáo viên. | ☐ |
| Nhận diện nguy hiểm | `guess → unknown` | Màu không đủ để xác định dung dịch. | ☐ |
| Nhận diện nguy hiểm | `label → read` | Đọc phần cảnh báo bên cạnh tên chất. | ☐ |
| Nhận diện nguy hiểm | `ignore → miss` | Chỉ đọc tên có thể bỏ sót nguy hiểm. | ☐ |
| Chuẩn bị pha loãng axit | `check → ready` | Đọc nhãn và chuẩn bị bảo hộ theo hướng dẫn giáo viên trước khi thao tác. | ☐ |
| Chuẩn bị pha loãng axit | `start → pause` | Chữ “loãng” cần được đọc cùng tên, nồng độ và cảnh báo. Xác nhận với giáo viên. | ☐ |
| Đun ống nghiệm | `away → clear` | Dùng kẹp và hướng miệng ống ra xa người. | ☐ |
| Đun ống nghiệm | `toward → exposure` | Giải thích nguy cơ bị dung dịch nóng bắn khi hướng miệng ống về phía người. | ☐ |

- ☐ Cả hai ngôn ngữ diễn đạt cùng điều kiện, lựa chọn và phản hồi.
- ☐ Phạm vi an toàn phù hợp lớp 8 và thể hiện vai trò giám sát của giáo viên.
- ☐ Cảnh báo lấy từ nguồn K2 và khớp hóa chất, dạng và nồng độ đã nêu.

## Ký duyệt

| Vai trò | Họ tên | Ngày | Commit/digest đã duyệt | Kết luận |
|---|---|---|---|---|
| Admin phụ trách duyệt an toàn | | | | ☐ Duyệt ☐ Duyệt sau khi sửa ☐ Yêu cầu sửa |
| Owner xác nhận phát hành | | | | ☐ Đồng ý phát hành |

Đăng nhập admin trên FE 5191 tại `/login?admin`, rồi mở `/dev/lab-kits/safety-review` để xem bản nháp. Ghi lại kết luận và commit/digest ở trên. Sau khi có chữ ký, cập nhật `review.status` và ghi chú của config theo bản đã duyệt.
