---
id: SPEC-lab-space-shared-ui
status: proposed
date: 2026-11-14
---
# Chuẩn hóa giao diện Lab Space

## 1. Mục tiêu và phạm vi

Học sinh gặp cùng cách bố trí nút Quay về, tiêu đề, các kiểu hiển thị và panel câu hỏi khi mở Guided, Explore hoặc Class Lab. Bản đầu áp dụng cho **FL-10 Guided, FL-13 Explore và một Class Lab Guided có câu hỏi bổ sung**. Dùng bản Class Lab thử nghiệm trên dữ liệu cô lập. Có thể chọn FL-10 làm nguồn nếu fixture tương thích với luồng hiện có.

Đây là refactor giao diện FE. Mỗi activity tiếp tục sở hữu state, checkpoint, phép đo và hành vi nộp. Vòng đời LabRun, rubric, API, dữ liệu đã giao và điều kiện mở Lab giữ theo hợp đồng hiện tại.

## 2. Thiết kế dùng chung

| Thành phần | Phần dùng chung | Phần do nơi gọi quyết định |
|---|---|---|
| Header | Dùng `LabSpace` hiện có cho Quay về, tiêu đề và vùng nút. Header tự xuống dòng trên mobile. Giữ nút Quay về sử dụng được khi tải, lỗi hoặc mất WebGL. | Truyền đích quay lại theo nơi vào hợp lệ: bài học, bài giao, lớp hoặc danh mục. Lab mở ngay trong lesson dùng `AssignedLabSpace` để đóng và trả focus về nút mở trong khi giữ state lesson. |
| Toggle 2D/3D | Dùng `LabRendererToggle` hiện có với cùng vị trí trong header khi ở Lab Space. Hiện toggle khi activity có hai view tương đương về thao tác cần thiết. | Activity khai báo view khả dụng và xử lý fallback. Chuyển view chỉ đổi cách hiển thị, giữ câu trả lời, phép đo và run hiện tại. Lab một view vẫn có thể đưa HUD vào vùng thao tác. |
| Panel câu hỏi | Cùng vị trí, kiểu tiêu đề, mở/gập, nhóm lựa chọn, ô văn bản, focus và lỗi. Panel ở cạnh scene trên desktop. Trên mobile có thể gập và cuộn, với vùng số đo và thao tác chính vẫn tiếp cận được. | Guided giữ trình tự, khóa bước và nút nộp hiện có. Explore mở gợi ý khi cần và vẫn thao tác được trên bàn. Câu hỏi lớp dùng form nộp, lịch sử và nhận xét riêng. |
| Lab thuần quan sát | Dùng header và vùng hiển thị chung. Chỉ render panel câu hỏi nếu có nội dung. | Activity có thể cung cấp danh sách bộ phận, chú thích hoặc điều khiển mặt cắt. |

Dùng lại component hiện có trước. Phần trình bày câu hỏi chỉ nhận nội dung, giá trị và callback. Chọn radio native hoặc hành vi bàn phím tương đương. Để renderer quyết định các thành phần đặc thù như nút thực hiện thí nghiệm, thước đo và phản hồi theo bước.

## 3. Quy tắc theo luồng

| Nội dung | Cách hiển thị và lưu |
|---|---|
| **Bước thí nghiệm** | Guided lưu nháp và nộp theo hợp đồng LabRun hiện tại. Gập panel, chuyển 2D/3D hoặc mở lại Lab ngay trong lesson không được tạo bước hoặc đổi câu trả lời. |
| **Gợi ý quan sát** | Explore giữ câu trả lời và log cục bộ như hiện tại. Câu hỏi và số đo có thể dùng cùng lúc. Màn xác nhận an toàn vẫn đứng trước thao tác nếu cấu hình yêu cầu. |
| **Bài trả lời cho giáo viên** | Thông báo rõ khi nào đã gửi. Nút gửi, lịch sử và điểm/nhận xét riêng tiếp tục dựa vào API hiện có. Với câu hỏi thực sự là bổ sung, mỗi prompt chỉ hiện một lần trong khu vực trả lời. Phần mục tiêu và hướng dẫn lớp vẫn có vùng riêng. |

FL-05 hiện dùng `reportPrompts` theo vị trí để đổi lời hỏi hiển thị ở một số bước. Khi mở rộng sang FL-05, đối chiếu fixture và hợp đồng hiện có trước khi bỏ bất kỳ chỗ render prompt nào. Phần chỉnh câu hỏi gốc bằng ID ổn định thuộc [spec hướng phát triển](lab-kit-assets-and-class-lab-spec.md).

**Quy tắc phím Esc.** Khi focus nằm trong panel có thể gập, Esc gập panel và trả focus về nút mở. Khi focus ở bàn và đang cầm dụng cụ, Esc thả dụng cụ. Trong hộp xác nhận an toàn, bàn nằm ngoài thứ tự Tab cho tới khi học sinh xác nhận hoặc quay về. Chỉ một hành động được xử lý cho mỗi lần nhấn. Khi một Lab Space nhúng đã đóng, phím tắt của nó ngừng hoạt động dù cây hoạt động vẫn giữ state.

## 4. Thứ tự triển khai

1. **Ghi nhận hiện trạng** ở ba mẫu. Chạy các ca hiện có cho navigation, FL-10 và LabRun; ghi lại lỗi có sẵn nếu có. Chụp layout desktop và mobile để so trước/sau.
2. **Chuẩn hóa header và toggle** trong `LabSpace` và các nơi gọi của ba mẫu. Giữ renderer tải theo route hoặc activity như hiện tại.
3. **Chuẩn hóa panel** bằng cách dùng chung phần trình bày cho FL-10, FL-13 và câu hỏi lớp. Kiểm tra phím Esc, focus, xác nhận an toàn và form nộp trước khi áp dụng sang các Lab còn lại.
4. **Mở rộng theo nhóm UI** sau khi ba mẫu đạt tiêu chí. Chọn thêm một Lab chỉ quan sát để xác nhận shell hoạt động khi panel và toggle vắng mặt.

## 5. Nghiệm thu

- Quay về đúng bài học, bài giao hoặc lớp từ đường vào tương ứng. Lesson nhúng mở lại đúng state. Nút Quay về còn dùng được trên màn tải và lỗi.
- FL-10 Guided vẫn ghi đúng chuỗi dự đoán, cân trước, trộn và cân sau. Payload nộp và rubric có cùng nghĩa như baseline. 2D/3D giữ câu trả lời, không tạo run mới. Khi mất WebGL, fallback và đường thoát còn dùng được.
- FL-13 Explore mở rộng/gập gợi ý mà vẫn thao tác được. Esc chỉ đóng panel hoặc thả dụng cụ theo focus. Xác nhận an toàn hoạt động với pointer và bàn phím. Explore không sinh request nộp attempt.
- Class Lab gửi câu trả lời theo đúng lớp, tài nguyên và bài giao. Câu hỏi bổ sung xuất hiện một lần. Mở/gập panel giữ câu đang nhập. Retry không tạo bài nộp trùng.
- Kiểm tra bàn phím và kích thước desktop 1440 px, mobile 390 px. Header, nút nộp, số đo và thao tác trên scene còn tiếp cận được. FE lint, build và các Playwright liên quan đạt. Dùng bài test hiện có trước, bổ sung ca Explore hoặc Class Lab nếu baseline chưa bao phủ.

## Tham chiếu

- [Spec Lab Space hiện có](../../implementation-artifacts/spec-lab-space.md) · [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) · [Câu hỏi bổ sung Class Lab](../../../docs/product/class-lab-additional-questions.md)
- [LabSpace FE](../../../../FE-NexaLab/src/features/labs/shared/LabSpace.tsx) · [ObservationDrawer FE](../../../../FE-NexaLab/src/features/labs/shared/ObservationDrawer.tsx) · [Form trả lời Class Lab FE](../../../../FE-NexaLab/src/features/classes/ClassLabAdditionalResponses.tsx)
- [Kiểm tra LabRun và shell](../../../../FE-NexaLab/tests/lab-run-host.spec.ts) · [Điều hướng từ lesson](../../../../FE-NexaLab/tests/lesson-lab-navigation.spec.ts) · [FL-10 Guided](../../../../FE-NexaLab/tests/fl-10-k2.spec.ts)
