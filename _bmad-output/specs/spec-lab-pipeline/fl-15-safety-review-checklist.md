# FL-15 — Bản ghi duyệt nội dung an toàn

Cấu hình v2 đã duyệt ngày 2026-11-16 theo uỷ quyền của Owner trong chat FL-15. Tôi đối chiếu 8 nhánh VI/EN với SGK và đối chiếu cảnh báo từng chai mẫu với mục 2 SDS. Các tình huống mô phỏng quyết định cho học sinh lớp 8.

## Đối chiếu nguồn

- SGK *Khoa học tự nhiên 8*, Kết nối tri thức với cuộc sống, Bài 1, mục I–III, tr. 6–8. Đối chiếu nhãn, quy tắc dùng hoá chất và cách giữ ống nghiệm. [Bản SGK Bài 1](https://www.sgkvn.com/lop-8-11/ket-noi-tri-thuc-voi-cuoc-song-3/loi-noi-dau-1928/bai-1-su-dung-mot-so-hoa-chat-thiet-bi-co-ban-trong-phong-thi-nghiem-6329.html), [SGV NXBGD](https://sachdientu.nxbgd.vn/thu-vien-so/doc-sach/sgv-khoa-hoc-tu-nhien.4492016197).
- SGK *Hoá học 11*, Kết nối tri thức với cuộc sống, Bài 8, mục I.2, tr. 49–50. Đối chiếu biện pháp bảo hộ và phạm vi giáo viên minh hoạ. [SGK Hoá học 11](https://partner.olm.vn/thu-vien-so/doc-sach/shs-hoa-hoc.4492586545).
- Dữ liệu hoá chất K2 trong [reagents.ts](../../../packages/sim/wet-bench/reagents.ts) chứa hai mã chai mẫu riêng cho FL-15, `CuSO4_0_1M_CO0102` và `H2SO4_0_05M_6793`. Validator từ chối hoá chất chưa đối chiếu trong cấu hình đã duyệt.
- **CuSO₄ 0,1 M** mô phỏng nhãn Scharlab CO0102, SDS mục 2, H412 “Có hại lâu dài đối với sinh vật thủy sinh”. [SDS Scharlab CO0102](https://www.scharlabchina.com/documents/SDS/EN/CO0102_EN.pdf).
- **H₂SO₄ 0,05 M** mô phỏng nhãn Carl Roth 6793, SDS mục 2, H290 “Có thể ăn mòn kim loại”. Các nhà cung cấp có thể công bố phân loại khác cho sản phẩm của họ. [SDS Carl Roth 6793](https://www.carlroth.com/medias/SDB-6793-IE-EN.pdf?context=bWFzdGVyfHNlY3VyaXR5RGF0YXNoZWV0c3wzMjUwOTR8YXBwbGljYXRpb24vcGRmfGFHVm1MMmhrT1M4NU1qTTBOREl3TkRNeU9USTJMMU5FUWw4Mk56a3pYMGxGWDBWT0xuQmtaZ3w1MDQwNjY3MDI4Mjc1ZWIwZmYyY2I5NTk2NjFkYTFiODUzOWRiY2JlNTE4MDE4Mjc4YTcyNTE2NmFmZWExZmY0).
- [Spec FL-15](fl-15-lab-safety-scenario-spec.md) và [config song ngữ](../../../packages/sim/safety-scenario/fl15-safety.data.ts). Mã nhánh dưới đây trùng ID trong config.

## Duyệt từng phản hồi

| Tình huống | Lựa chọn → Hệ quả | Nội dung cần xác nhận | Kết luận và trang/SDS |
|---|---|---|---|
| Nhận diện nguy hiểm | `ask → verified` | Để nguyên chai mất nhãn và báo giáo viên. | Phù hợp nguyên tắc xác minh bằng nhãn trước khi dùng, Bài 1 mục I–II. |
| Nhận diện nguy hiểm | `guess → unknown` | Màu không đủ để xác định dung dịch. | Phù hợp nguyên tắc xác minh bằng nhãn trước khi dùng, Bài 1 mục I–II. |
| Nhận diện nguy hiểm | `label → read` | Đọc phần cảnh báo bên cạnh tên chất. | Phù hợp nguyên tắc đọc nhãn, cảnh báo H412 đã đối chiếu SDS Scharlab. |
| Nhận diện nguy hiểm | `ignore → miss` | Chỉ đọc tên có thể bỏ sót nguy hiểm. | Phù hợp nguyên tắc đọc nhãn, cảnh báo H412 đã đối chiếu SDS Scharlab. |
| Chuẩn bị pha loãng axit | `check → ready` | Đọc nhãn và chuẩn bị bảo hộ theo hướng dẫn giáo viên trước khi thao tác. | Phù hợp quy tắc chuẩn bị, cảnh báo H290 đã đối chiếu SDS Carl Roth. |
| Chuẩn bị pha loãng axit | `start → pause` | Chữ “loãng” cần được đọc cùng tên, nồng độ và cảnh báo. Xác nhận với giáo viên. | Phù hợp quy tắc chuẩn bị, cảnh báo H290 đã đối chiếu SDS Carl Roth. |
| Đun ống nghiệm | `away → clear` | Dùng kẹp và hướng miệng ống ra xa người. | Phù hợp Bài 1, mục II.2a. |
| Đun ống nghiệm | `toward → exposure` | Giải thích nguy cơ bị dung dịch nóng bắn khi hướng miệng ống về phía người. | Phù hợp Bài 1, mục II.2a. |

- ☑ Cả hai ngôn ngữ diễn đạt cùng điều kiện, lựa chọn và phản hồi.
- ☑ Phạm vi an toàn phù hợp lớp 8 và thể hiện vai trò giám sát của giáo viên.
- ☑ Cảnh báo lấy từ nguồn K2 và khớp hóa chất, dạng và nồng độ đã nêu.

## Xác nhận duyệt và kiểm thử phát hành

- Owner xác nhận uỷ quyền duyệt FL-15 trong chat ngày 2026-11-16.
- Đối chiếu kỹ thuật theo uỷ quyền hoàn tất cho cấu hình v2. Admin API xác thực bằng tài khoản quản trị và phát hành activity v2 trên fixture cục bộ.
- Digest của activity v2 trên fixture là `fda89f2bfd576d42662c125f0ea49a586dcf457dca283d9555b57a386be26625`.
