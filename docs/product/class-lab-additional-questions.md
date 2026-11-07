# Class Lab: câu hỏi bổ sung và luồng học sinh trả lời

**Trạng thái:** Luồng nộp câu trả lời và giáo viên chấm đã được triển khai trong mã nguồn. Cần áp dụng migration qua pipeline an toàn và chạy kiểm thử tích hợp trên DB cô lập trước khi phát hành.

## Mục tiêu

Cho phép giáo viên thêm câu hỏi riêng cho lớp để học sinh suy nghĩ, thảo luận, quan sát thí nghiệm và gửi câu trả lời. Đây là phần trao đổi/bài tập bổ sung của lớp, tách khỏi bộ câu hỏi/checkpoint gốc của Foundational Lab.

Ví dụ phù hợp: Lab sinh học thiên về quan sát, nơi học sinh xem mô hình rồi viết điều đã quan sát hoặc giải thích hiện tượng.

## Ranh giới với việc fork câu hỏi Foundational

- Bộ câu hỏi/checkpoint Foundational được chỉnh trong Lab Space authoring và giữ liên kết với tương tác, response schema và rubric của activity nguồn. Xem [class-lab-foundational-fork-direction.md](class-lab-foundational-fork-direction.md).
- Câu hỏi bổ sung do giáo viên tự tạo không tự điều khiển mô phỏng, không thay checkpoint Foundational và không tự động được chấm bởi rubric nguồn.
- Hai chức năng có thể cùng tồn tại trên một Class Lab, nhưng cần UI và data contract riêng để giáo viên/học sinh không nhầm.

## Hiện trạng đã kiểm tra

Trước thay đổi này, Class Lab có trường `reportPrompts` để lưu và hiển thị câu hỏi bổ sung nhưng thiếu form trả lời, API lưu phản hồi và giao diện giáo viên. Phần triển khai hiện bổ sung các mắt xích còn thiếu như mô tả bên dưới.

Tham chiếu mã hiện tại: `src/modules/classes/application/class-resource-contract.ts`, `src/modules/classes/application/class-lab-resource.ts`, `src/modules/labs/interface/labs.controller.ts`, và `../nexalab-fe/src/features/labs/Lab.tsx`.

## Luồng mục tiêu

1. Giáo viên thêm/sắp xếp/sửa câu hỏi bổ sung trong bản nháp Class Lab.
2. Khi học sinh mở Lab được chia sẻ hoặc bài tập được giao, câu hỏi bổ sung xuất hiện ở khu vực riêng, có phân biệt với câu hỏi đang điều khiển mô phỏng.
3. Học sinh nhập câu trả lời cho từng câu rồi bấm nộp; mỗi lượt nộp được lưu thành một attempt riêng.
4. Server xác thực quyền truy cập, resource/assignment version và giới hạn nội dung; lưu phản hồi gắn với đúng học sinh và đúng snapshot.
5. Giáo viên có thể xem phản hồi đã nộp trong lớp/bài tập.

## Cách chấm và trạng thái bài

- Câu hỏi mở không tự động chấm. Giáo viên có thể chấm thủ công theo thang 0–100 và gửi nhận xét; điểm này được lưu riêng và không thay đổi verdict mô phỏng, rubric Foundational hay tiến độ Lab chính thức.
- Nếu cần chấm tự động, phải khai báo kiểu câu hỏi và rubric được hỗ trợ, rồi để server xác thực/chấm theo contract riêng. Không dùng kết quả client.
- Giáo viên có thể cập nhật điểm/nhận xét; lịch sử câu trả lời học sinh vẫn bất biến và thay đổi điểm được ghi audit.
- Thực hành Class Lab không chấm điểm vẫn có thể thu câu trả lời để giáo viên xem nếu chính sách sản phẩm cho phép; bài tập giao cần gắn phản hồi với đúng assignment target và hạn nộp.

## Dữ liệu và bảo toàn snapshot

Phản hồi lưu riêng trong `ClassLabAdditionalResponse`, chứa snapshot câu hỏi và câu trả lời, `resourceId`/`resourceVersion`, assignment (nếu có), học sinh, số lần nộp và điểm/nhận xét. ID prompt là `prompt-1` … theo thứ tự trong snapshot. Revision của giáo viên không viết lại câu hỏi/đáp án đã nộp.

Triển khai tận dụng vòng đời `ClassResource`/snapshot và quyền lớp hiện có, với entity riêng để lưu lịch sử nộp và chấm. Migration `20261106140000_class_lab_additional_responses` đã được áp dụng lên Supabase; bảng và trigger đã được xác minh. Kiểm thử tích hợp vẫn cần chạy trên DB cô lập trước khi phát hành tiếp.

## Phạm vi phiên bản đầu đề xuất

- Hỗ trợ câu trả lời văn bản ngắn/dài và thao tác nộp; phiên bản hiện tại không có lưu nháp phía server.
- Ràng buộc giới hạn độ dài, số câu, authorization và idempotency phía server.
- Lưu câu trả lời theo đúng phiên bản Class Lab hoặc assignment; cho giáo viên xem phản hồi theo học sinh.
- Không auto-score câu hỏi mở; cho phép chấm thủ công riêng; không sửa rubric Foundational.
- Bố trí câu hỏi bổ sung tách khỏi bộ câu hỏi tương tác trong Lab Space. Với Lab chỉ quan sát, có thể hiển thị song song với mô hình hoặc trong khu vực trả lời riêng.

## Tiêu chí hoàn thành

- Học sinh có trường nhập câu trả lời, lưu/nộp được và nhận xác nhận trạng thái.
- Server chỉ nhận phản hồi từ học sinh được phép trong lớp hoặc assignment tương ứng.
- Giáo viên xem được phản hồi theo đúng lớp/bài và phiên bản câu hỏi.
- Câu hỏi bổ sung không bị hiểu nhầm là checkpoint có chấm điểm hay làm thay đổi kết quả mô phỏng.
- Revision của Class Lab không sửa dữ liệu phản hồi đã nộp trước đó.

## Giới hạn triển khai

- Chỉ nhận câu trả lời văn bản cho tối đa 20 `reportPrompts`; mỗi câu tối đa 10.000 ký tự sau khi trim. Mỗi lượt phải gửi đúng một câu trả lời khác rỗng cho từng prompt.
- API gán ID ổn định trong snapshot `prompt-1` … `prompt-20` theo thứ tự prompt hiện tại. Prompt và câu trả lời được chụp cùng `resourceId`/`resourceVersion` lúc nộp; bản sửa sau đó không đổi lịch sử.
- Học sinh cần enrollment `approved`, lớp đang hoạt động và Class Lab đang `PUBLISHED`. Với bài được giao, assignment phải đang hoạt động, chứa đúng snapshot Class Lab và học sinh phải nằm trong target. Bài giao cả lớp dùng audience `CLASS`; bài giới hạn dùng danh sách target.
- Mỗi lần nộp mới tạo một attempt; gửi lại cùng `Idempotency-Key` và nội dung trả về attempt cũ, còn dùng lại key với payload khác bị từ chối. Không có khóa thì mỗi request được tính là lượt mới.
- Chủ lớp có thể xem lịch sử theo resource hoặc lọc theo assignment; mỗi phản hồi nhận điểm nguyên 0–100 và feedback tối đa 2.000 ký tự. Sửa điểm cập nhật trường chấm, không sửa prompt/đáp án đã nộp.
- Điểm/feedback này chỉ thuộc luồng Class Lab bổ sung; không thay đổi verdict, rubric, `AssignmentSubmission` hoặc tiến độ Foundational Lab.
- API: `POST /classes/:id/resources/:resourceId/additional-responses`, `GET .../additional-responses/mine`, `GET .../additional-responses`, và `PUT .../additional-responses/:responseId/grade`.
