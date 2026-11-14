---
id: SPEC-lab-kit-assets-and-class-lab
status: proposed
date: 2026-11-14
---
# Hướng phát triển Foundational Lab, thư viện dụng cụ và Class Lab

## 1. Quyết định sản phẩm

**Giữ một mục danh mục cho mỗi Foundational Lab.** Một Lab có thể cung cấp Guided, Explore hoặc cả hai, tùy mục tiêu học. Ghi mode đã chạy, phạm vi đã làm và trạng thái review riêng trong portfolio. Hai mode của FL-10 vẫn thuộc slot 8. FL-13 là slot 11. FL-14a là phần đã làm của FL-14 trong slot 12. Danh mục 20 slot vẫn là danh sách đề xuất từ 30 ứng viên.

| Mode | Học sinh làm gì | Kết quả được ghi nhận |
|---|---|---|
| **Guided** | Thực hiện nhiệm vụ theo bước và nộp bằng chứng phù hợp với mục tiêu bài. | Server đánh giá theo rubric đã ghim và lưu attempt. Dùng khi cần xác nhận một kỹ năng hoặc cách giải thích cụ thể. |
| **Explore** | Quan sát, chọn dụng cụ, đổi điều kiện trong phạm vi mô hình hoặc so sánh các lần thử. Lab thuần quan sát có thể chỉ cần xoay, xem mặt cắt và chọn bộ phận. | Foundational Explore ghi quan sát cục bộ. Câu hỏi là tùy chọn. Explore của lớp có thể yêu cầu nộp kết quả để giáo viên nhận xét, với trạng thái riêng của bài lớp. |

Explore thuần quan sát có thể dùng scene và danh mục bộ phận của kit giải phẫu, như nhóm Explorer 3D trong [backlog](../../../docs/bmad/explore-labs-backlog-and-epics.md). Chỉ thêm Guided khi có mục tiêu đánh giá rõ. Giữ Explore-only ở diện tùy chọn trong curriculum khi tiến độ chính thức còn đòi một attempt `passed`. Thêm Explore cho Lab cũ theo từng activity, với golden cases cho các hiện tượng và ranh giới mới được hỗ trợ.

## 2. Thư viện dùng theo kit

| Lớp | Nội dung và nơi sở hữu |
|---|---|
| **Mô phỏng** | Engine và dữ liệu trong `packages/sim` sở hữu định danh dụng cụ/chất, đơn vị, dung tích, phép đo, luật tương tác, phản ứng và giới hạn mô hình. Luật phản ứng thuộc engine, áp dụng theo tổ hợp chất và điều kiện. |
| **Hiển thị và giới thiệu** | FE ánh xạ ID ổn định sang mesh/2D, hình xem trước, điểm gắn, vùng tương tác, tên và công dụng. Giữ các giá trị ảnh hưởng mô phỏng ở lớp trên. Mô hình giải phẫu có thể khai báo ID bộ phận gắn với mesh hiện có. |
| **Cấu hình của Lab** | Chọn tập con dụng cụ, chất, phép đo và điều kiện phù hợp với bài. Khai báo đồ bắt buộc, mức tùy chỉnh, giới hạn an toàn và các câu hỏi tương thích. Mỗi lựa chọn trỏ về phiên bản đã duyệt của kit/cấu hình. |

**Tách từ code đang có trước.** K2 đã có `apparatus-manifest.ts`, `apparatus3d.tsx`, danh mục hóa chất và phản ứng trong sim, cùng validator. Chọn cốc và cân làm ứng viên chia sẻ đầu tiên vì hai bàn FL-10 đang dựng chúng riêng. Kiểm tra số đo, vị trí và thao tác Guided trước/sau khi tách. Đăng ký các dụng cụ đã tách như bút đo pH và ống nhỏ giọt để dùng trong lát FL-13. Với thiết bị còn gắn vào scene hiện có, chỉ tách khi có Lab hoặc luồng giáo viên thực sự cần dùng lại. Thêm model/mesh mới khi bài thiếu dụng cụ hoặc bộ phận.

Học sinh có mục **Dụng cụ và thành phần** đọc từ cấu hình đang chạy. Mỗi mục có tên, công dụng và cảnh báo nếu có. Ở K2, mở rộng danh sách đã có trong màn giới thiệu. Với model quan sát, danh sách có thể bật chú thích hoặc làm nổi bật bộ phận theo ID. Giáo viên dùng cùng danh mục, với danh sách lựa chọn được lọc theo Lab nguồn và phạm vi bài học.

## 3. Cách tạo và vận hành Class Lab

1. **Chọn Lab nguồn và bài học của lớp.** Server xác thực quyền giáo viên, lớp, bài học, mode và nguồn đủ điều kiện. Dùng ID của topic/outcome hoặc cấu hình mẫu đã duyệt để xác định phạm vi; tên hiển thị chỉ phục vụ tìm kiếm.
2. **Chọn cấu hình mẫu và tùy chỉnh.** Giữ sẵn phần bắt buộc. Giáo viên chọn các mục tùy chọn và giá trị trong khoảng được phép, ví dụ mẫu, dụng cụ đo hoặc lượng ban đầu trong giới hạn. Hiển thị hiện tượng có thể khảo sát dựa trên tổ hợp đã chọn. Cấu hình gửi lên chỉ tham chiếu ID và các giá trị được phép.
3. **Chọn câu hỏi và yêu cầu nộp.** Với Explore, chọn câu hỏi quan sát có ID ổn định hoặc thêm câu hỏi của lớp. Với Guided, chỉ hỗ trợ sửa lời hỏi gốc khi activity khai báo checkpoint có thể chỉnh bằng ID và đã xác định binding với câu trả lời/rubric. Câu hỏi bổ sung dùng luồng trả lời và nhận xét riêng đang có.
4. **Xem như học sinh, lưu bản nháp rồi giao.** Preview dựng đúng cấu hình học sinh sẽ nhận. Publish/giao bài ghim nguồn, mode, phiên bản kit/engine, cấu hình hiệu lực, câu hỏi và đối tượng nhận bài. Lần sửa tạo phiên bản mới. Server tiếp tục kiểm quyền lúc mở và lúc nộp.
5. **Học sinh nộp, giáo viên xem.** Với Explore bản đầu, học sinh nhập hai giá trị pH theo tên hai mẫu trong bài giao và một nhận xét. Server kiểm tra định dạng số và trường bắt buộc. Bài nộp hiển thị là số đo do học sinh ghi lại. Giáo viên xem và nhận xét thủ công trong Class Space. Nếu đính kèm log sau này, xem đó là ghi chép của học sinh. Muốn tự chấm từ thao tác cần thiết kế bằng chứng và xác thực hoặc chạy lại trên server.

**Validator khi giao.** Server ghép cấu hình từ nguồn và các lựa chọn, rồi xác thực lại. Câu hỏi cần đo pH phải có bút đo. Một hiện tượng cần đủ chất và điều kiện trong phạm vi đã duyệt. Giới hạn dung tích, chú ý an toàn và trạng thái review cũng phải hợp lệ. Validator K2 đã hỗ trợ nhiều kiểm tra; một số tình huống thiếu chất để phản ứng xảy ra hiện chỉ trả warning, nên khi bài yêu cầu chính hiện tượng đó, thiếu phụ thuộc phải chặn giao.

**Tương thích với hiện tại.** Class Lab Guided đã dùng `ClassResource`, release/challenge, `customParams`, snapshot và luồng `reportPrompts`. Seed FL-13/14a hiện tạo cấu hình Explore, chưa tạo nguồn đủ điều kiện cho đường giao Guided. Lát Explore cần nguồn có phiên bản và hợp đồng nộp riêng cho mode này. Giữ mục giao và bài nộp Explore trong Class Space ở bản đầu. Trạng thái `Đã nộp`/nhận xét của lớp tách khỏi verdict, điểm mô phỏng và tiến độ Foundational. Gắn dữ liệu nháp Explore của lớp với học sinh, bài giao và phiên bản; khóa `labId@configVersion` hiện tại dùng cho Explore mở.

## 4. Lát triển khai đầu tiên

| Bước | Phạm vi và đầu ra |
|---|---|
| **A. Đăng ký dụng cụ K2** | Dùng lại các ID và component có sẵn. Học sinh FL-13 thấy đúng dụng cụ và chất của bài. Có thể thử giao diện với bản nháp ở môi trường cô lập. |
| **B. Kiểm tra dùng chung với FL-10** | Thử dùng chung phần hiển thị cốc/cân nếu tương thích, giữ số đo và chuỗi sự kiện Guided. Giữ FL-10 Explore ở phạm vi hiện hành cho tới quyết định F0-7 về chuyển mode. |
| **C. Một Class Lab Explore từ FL-13** | Dùng fixture cô lập để kiểm tra từ tạo bài đến nhận xét. Khi đưa cho lớp thật, nguồn FL-13 cần hoàn tất review F0-6 và được phép sử dụng theo quyết định hiển thị F0-7. Giáo viên chọn một cấu hình mẫu bài pH, hai mẫu đã duyệt và một câu quan sát. Bút đo là dụng cụ bắt buộc. Học sinh được giao nộp hai giá trị pH và một nhận xét. |
| **Sau lát đầu** | Mở rộng sang kit thứ hai theo F0-1 đến F0-5. Bổ sung tùy chỉnh Guided theo checkpoint ID, nhập thêm asset, nộp log đầy đủ hoặc tự chấm khi có nhu cầu và spec tương ứng. |

Giáo viên tùy chỉnh trên cấu hình mẫu. Công việc tạo model khoa học, viết phản ứng mới, sửa đáp án chuẩn/rubric và xây trình ghép asset tự do thuộc phạm vi riêng.

## 5. Nghiệm thu

- Danh sách học sinh và màn chọn của giáo viên đọc cùng ID. Mục ngoài phạm vi bài, cấu hình chưa đủ điều kiện, lựa chọn ngoài khoảng hoặc thiếu dụng cụ/chất cần thiết bị server từ chối.
- Cấu hình preview, bản giao và màn học sinh khớp. Học sinh ngoài lớp hoặc ngoài đối tượng giao không mở hoặc nộp được bằng đường dẫn trực tiếp.
- Học sinh được giao nộp hai số đo và nhận xét. Retry trả về cùng kết quả nộp. Hai bài giao dùng cùng FL-13 có dữ liệu nháp và bài nộp tách riêng.
- Sửa bản nháp hoặc cập nhật Lab nguồn không thay đổi cấu hình, câu hỏi và bài nộp đã ghim. Kết quả Explore của lớp không tạo verdict hay thay đổi tiến độ Foundational.
- Bài Guided cũ vẫn mở, nộp và chấm được. Kiểm tra với bản giao dùng phiên bản trước khi thay đổi. Chạy test tương thích BE/FE trên dữ liệu cô lập và golden cases cho mọi hành vi khoa học được thêm hoặc thay đổi.

## Tham chiếu

- [Portfolio 20 slot](lab-portfolio-20-slots-v1.md) · [Thiết kế K2](k2-wet-bench-explore-kit-design.md) · [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) · [Backlog F0](../../../docs/bmad/explore-labs-backlog-and-epics.md)
- [Spec UI dùng chung](lab-space-shared-ui-spec.md) · [Chỉnh câu hỏi gốc](../../../docs/product/class-lab-foundational-fork-direction.md) · [Câu hỏi bổ sung](../../../docs/product/class-lab-additional-questions.md)
- [Class Lab contract hiện tại](../../../src/modules/classes/application/class-lab-resource.ts) · [Validator K2](../../../packages/sim/wet-bench/validate-config.ts) · [Seed K2 Explore](../../../scripts/seed-k2-explore-labs.ts)
