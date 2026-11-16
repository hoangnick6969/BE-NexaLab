# FL-15 — Bản ghi duyệt nội dung an toàn

Trạng thái bản v1 · Đối chiếu kỹ thuật ngày 2026-11-16 yêu cầu sửa cảnh báo của hai dung dịch trước khi ký duyệt. Kết quả dưới đây áp dụng cho BE `2de8a1e` và FE `47bd0eb`. Các tình huống dùng cho mô phỏng quyết định của học sinh lớp 8.

## Đối chiếu nguồn

- SGK *Khoa học tự nhiên 8*, Kết nối tri thức với cuộc sống, Bài 1, mục I–III, tr. 6–8. Đối chiếu nhãn, quy tắc dùng hoá chất và cách giữ ống nghiệm. [Bản SGK Bài 1](https://www.sgkvn.com/lop-8-11/ket-noi-tri-thuc-voi-cuoc-song-3/loi-noi-dau-1928/bai-1-su-dung-mot-so-hoa-chat-thiet-bi-co-ban-trong-phong-thi-nghiem-6329.html), [SGV NXBGD](https://sachdientu.nxbgd.vn/thu-vien-so/doc-sach/sgv-khoa-hoc-tu-nhien.4492016197).
- SGK *Hoá học 11*, Kết nối tri thức với cuộc sống, Bài 8, mục I.2, tr. 49–50. Đối chiếu biện pháp bảo hộ và phạm vi giáo viên minh hoạ. [SGK Hoá học 11](https://partner.olm.vn/thu-vien-so/doc-sach/shs-hoa-hoc.4492586545).
- Dữ liệu hoá chất K2 trong [reagents.ts](../../../packages/sim/wet-bench/reagents.ts). Xác nhận mức và nhãn cảnh báo cho đúng nồng độ của `CuSO4_0_1M` và `H2SO4_0_05M` trước khi ký. Dữ liệu danh mục hiện mang trạng thái `unverified`.
- **CuSO₄ 0,1 M** có nhãn “Độc khi nuốt” trong FL-15. SDS của Scharlab CO0102, mục 2, ghi phân loại H412 về tác hại lâu dài với sinh vật thủy sinh. Mẫu Flinn nồng độ 0,1 M trở xuống có mục 2 theo OSHA không phân loại nguy hại. Cần xác định mẫu nhãn FL-15 theo đúng sản phẩm và SDS trước khi gán cảnh báo. [SDS Scharlab CO0102](https://www.scharlabchina.com/documents/SDS/EN/CO0102_EN.pdf), [SDS Flinn 286.10](https://www.msdsdigital.com/system/files/Copper%28II%29SulfateSol0.1M-Less.pdf).
- **H₂SO₄ 0,05 M** có nhãn “Ăn mòn” trong FL-15. Carl Roth 6793, mục 2, ghi H290 cho ăn mòn kim loại. Thermo Fisher AC124230010, mục 2 theo OSHA, không yêu cầu nhãn nguy hại. SDS GB của ITW 181061 lại ghi H290 và H314 ở mục 2. Cần chốt sản phẩm và quy chuẩn mà chai mẫu đại diện, rồi dùng mô tả nêu rõ loại nguy cơ theo SDS tương ứng. [SDS Carl Roth 6793](https://www.carlroth.com/medias/SDB-6793-IE-EN.pdf?context=bWFzdGVyfHNlY3VyaXR5RGF0YXNoZWV0c3wzMjUwOTR8YXBwbGljYXRpb24vcGRmfGFHVm1MMmhrT1M4NU1qTTBOREl3TkRNeU9USTJMMU5FUWw4Mk56a3pYMGxGWDBWT0xuQmtaZ3w1MDQwNjY3MDI4Mjc1ZWIwZmYyY2I5NTk2NjFkYTFiODUzOWRiY2JlNTE4MDE4Mjc4YTcyNTE2NmFmZWExZmY0), [SDS Thermo Fisher AC124230010](https://www.fishersci.com/store/msds?countryCode=US&language=en&partNumber=AC124230010&productDescription=SULFURIC+ACID%2C+0.1N+STAN+1LT&vendorId=VN00033901), [SDS ITW 181061](https://www.itwreagents.com/download_file/sds/181061/gb/sds_181061_en.pdf).
- [Spec FL-15](fl-15-lab-safety-scenario-spec.md) và [config song ngữ](../../../packages/sim/safety-scenario/fl15-safety.data.ts). Mã nhánh dưới đây trùng ID trong config.

## Duyệt từng phản hồi

| Tình huống | Lựa chọn → Hệ quả | Nội dung cần xác nhận | Kết luận và trang/SDS |
|---|---|---|---|
| Nhận diện nguy hiểm | `ask → verified` | Để nguyên chai mất nhãn và báo giáo viên. | Phù hợp nguyên tắc xác minh bằng nhãn trước khi dùng, Bài 1 mục I–II. |
| Nhận diện nguy hiểm | `guess → unknown` | Màu không đủ để xác định dung dịch. | Phù hợp nguyên tắc xác minh bằng nhãn trước khi dùng, Bài 1 mục I–II. |
| Nhận diện nguy hiểm | `label → read` | Đọc phần cảnh báo bên cạnh tên chất. | Lời giải phù hợp, cần sửa cảnh báo CuSO₄ đi kèm theo mục 2 của SDS. |
| Nhận diện nguy hiểm | `ignore → miss` | Chỉ đọc tên có thể bỏ sót nguy hiểm. | Lời giải phù hợp, cần sửa cảnh báo CuSO₄ đi kèm theo mục 2 của SDS. |
| Chuẩn bị pha loãng axit | `check → ready` | Đọc nhãn và chuẩn bị bảo hộ theo hướng dẫn giáo viên trước khi thao tác. | Lời giải phù hợp, cần làm rõ cảnh báo H₂SO₄ đi kèm theo mục 2 của SDS. |
| Chuẩn bị pha loãng axit | `start → pause` | Chữ “loãng” cần được đọc cùng tên, nồng độ và cảnh báo. Xác nhận với giáo viên. | Lời giải phù hợp, cần làm rõ cảnh báo H₂SO₄ đi kèm theo mục 2 của SDS. |
| Đun ống nghiệm | `away → clear` | Dùng kẹp và hướng miệng ống ra xa người. | Phù hợp Bài 1, mục II.2a. |
| Đun ống nghiệm | `toward → exposure` | Giải thích nguy cơ bị dung dịch nóng bắn khi hướng miệng ống về phía người. | Phù hợp Bài 1, mục II.2a. |

- ☐ Cả hai ngôn ngữ diễn đạt cùng điều kiện, lựa chọn và phản hồi.
- ☐ Phạm vi an toàn phù hợp lớp 8 và thể hiện vai trò giám sát của giáo viên.
- ☐ Cảnh báo lấy từ nguồn K2 và khớp hóa chất, dạng và nồng độ đã nêu.

## Ký duyệt

| Vai trò | Họ tên | Ngày | Commit/digest đã duyệt | Kết luận |
|---|---|---|---|---|
| Admin phụ trách duyệt an toàn | | | | ☐ Duyệt ☐ Duyệt sau khi sửa ☐ Yêu cầu sửa |
| Owner xác nhận phát hành | | | | ☐ Đồng ý phát hành |

Đăng nhập admin trên FE 5191 tại `/login?admin`, rồi mở `/dev/lab-kits/safety-review` để xem bản nháp. Ghi lại kết luận và commit/digest ở trên. Sau khi có chữ ký, cập nhật `review.status` và ghi chú của config theo bản đã duyệt.
