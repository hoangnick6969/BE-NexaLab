# BA review (Antigravity / Gemini), 2026-11-24

> Raw input to SPEC.md. Priorities here were adjusted after the code check (see SPEC.md).

Dưới đây là bản đánh giá nghiệp vụ (BA Review) cho 5 ý tưởng theo đúng cấu trúc yêu cầu:

---

### Ý tưởng 1: Teacher tạo không gian ảo AI để tạo prompt và tạo phòng lab theo ý muốn

* **Diễn giải lại yêu cầu:** Giáo viên sử dụng trợ lý AI nhập prompt để hệ thống tự động sinh cấu hình/kịch bản phòng lab ảo theo mục tiêu bài dạy mà không cần cấu hình thủ công.
* **Điểm mơ hồ / Câu hỏi:** 
  * AI sẽ sinh mã mô phỏng mới (Three.js/WebGL) hay chỉ ghép nối các dụng cụ/thông số từ thư viện thí nghiệm có sẵn?
  * Quy trình kiểm duyệt tính chính xác khoa học của lab do AI tạo trước khi học sinh thực hành là gì?
* **Rủi ro:** 
  * *An toàn AI & học thuật:* AI sinh ảo giác (hallucination), sai lệch hiện tượng Vật lý/Hóa học gây hiểu sai kiến thức căn bản cho học sinh.
  * *Chi phí:* Chi phí token LLM tăng cao nếu tạo kịch bản phức tạp.
* **Phạm vi MVP đề xuất:** 
  * *Làm trước:* AI gợi ý kịch bản và tự động điền thông số từ **thư viện bài lab/dụng cụ có sẵn**.
  * *Làm sau:* AI tự sinh logic tương tác và mô hình 3D hoàn toàn mới.
* **Tiêu chí chấp nhận:**
  * Giáo viên nhập chủ đề bài học, AI trả về kịch bản lab tương ứng trong ≤ 10 giây.
  * Giáo viên có thể xem trước (preview) và chỉnh sửa tham số trước khi lưu vào lớp.
  * Hệ thống chặn các prompt yêu cầu thí nghiệm nguy hiểm/bạo lực (prompt safety).
* **Mức ưu tiên:** **P2** (Giá trị cao nhưng cần chuẩn hóa khung lab trước để tránh sai lệch kiến thức).

---

### Ý tưởng 2: Student lab có âm thanh giọng nói gợi ý khi di chuột (hover) vào phần tử

* **Diễn giải lại yêu cầu:** Khi học sinh hover vào dụng cụ/thao tác trong bài lab, hệ thống phát âm thanh hướng dẫn/gợi ý ngắn giúp việc thực hành dễ hiểu hơn.
* **Điểm mơ hồ / Câu hỏi:** 
  * Dùng Text-to-Speech (TTS) động thời gian thực hay phát file audio thu sẵn theo từng tooltip?
  * Độ trễ hover (debounce) bao nhiêu để tránh phát âm thanh liên tục khi học sinh lia chuột nhanh?
* **Rủi ro:** 
  * *Accessibility & UX:* Gây ô nhiễm tiếng ồn trong phòng máy trường học; gây ức chế nếu lặp đi lặp lại.
  * *Chi phí:* Tốn chi phí API nếu gọi TTS liên tục.
* **Phạm vi MVP đề xuất:** 
  * *Làm trước:* File audio thu sẵn/cache sẵn cho dụng cụ chính; mặc định có nút **Tắt/Bật âm thanh**; áp dụng debounce hover 600ms.
  * *Làm sau:* TTS động cho mọi phần tử tùy biến; đa ngôn ngữ/giọng đọc.
* **Tiêu chí chấp nhận:**
  * Có nút toggle Bật/Tắt âm thanh gợi ý tại thanh điều khiển lab; lưu trạng thái người dùng.
  * Âm thanh chỉ phát khi hover cố định > 600ms; lia chuột nhanh không chồng chéo tiếng.
  * Rời chuột khỏi phần tử lập tức dừng phát âm thanh hiện tại.
* **Mức ưu tiên:** **P3** (Tính năng vi tương tác bổ trợ, dễ gây phản cảm nếu làm chưa tinh chỉnh; nên làm sau).

---

### Ý tưởng 3: Teacher tự đưa video mô phỏng vào lớp online; Admin quản lý bản quyền qua video tool

* **Diễn giải lại yêu cầu:** Giáo viên nhúng/tải video mô phỏng thực tế vào bài học mà không cần can thiệp code; Admin kiểm duyệt nguồn/bản quyền và quản trị danh mục video.
* **Điểm mơ hồ / Câu hỏi:** 
  * Cho phép nhúng link (YouTube, Vimeo, Drive) hay tải trực tiếp file video lên server?
  * "Video tool" là CMS phê duyệt/gắn thẻ bản quyền hay công cụ biên tập/cắt ghép video?
* **Rủi ro:** 
  * *Bản quyền/Pháp lý:* Giáo viên tải video vi phạm sở hữu trí tuệ lên nền tảng thương mại.
  * *Chi phí & An toàn:* Tốn dung lượng/băng thông streaming nếu upload trực tiếp; nguy cơ lọt nội dung không phù hợp lứa tuổi học sinh.
* **Phạm vi MVP đề xuất:** 
  * *Làm trước:* Hỗ trợ nhúng link từ YouTube/Vimeo kèm cam kết bản quyền; Admin có dashboard duyệt/từ chối video trước khi học sinh xem được.
  * *Làm sau:* Upload file video trực tiếp, nén video tự động, công cụ biên tập video nội bộ.
* **Tiêu chí chấp nhận:**
  * Giáo viên gửi link video vào bài học thành công, video hiển thị trạng thái "Chờ Admin duyệt".
  * Admin xem trước, phê duyệt hoặc từ chối (kèm lý do) trên CMS.
  * Học sinh chỉ xem được video sau khi Admin đã duyệt.
* **Mức ưu tiên:** **P1** (Nhu cầu thực tế cấp thiết cho giảng dạy online, giảm tải phụ thuộc vào lập trình viên).

---

### Ý tưởng 4: Teacher có tài liệu riêng đặt trong Class Space

* **Diễn giải lại yêu cầu:** Giáo viên có thể tải lên, quản lý và chia sẻ tài liệu học tập riêng (PDF, slide, tài liệu đọc) trong phạm vi không gian lớp học cụ thể.
* **Điểm mơ hồ / Câu hỏi:** 
  * Tài liệu gắn cứng theo từng lớp (Class Space) hay thuộc kho cá nhân của giáo viên có thể tái sử dụng qua nhiều lớp?
  * Giới hạn định dạng và dung lượng tối đa cho mỗi file / mỗi lớp là bao nhiêu?
* **Rủi ro:** 
  * *Bản quyền:* Giáo viên chia sẻ giáo trình scan có bản quyền.
  * *Bảo mật & Chi phí:* Rò rỉ tài liệu giữa các lớp nếu phân quyền sai; phát sinh chi phí lưu trữ đám mây.
* **Phạm vi MVP đề xuất:** 
  * *Làm trước:* Upload các định dạng chuẩn (PDF, DOCX, PPTX; tối đa 15MB/file); phân quyền chặt theo `class_id`.
  * *Làm sau:* Thư viện tài nguyên dùng chung của giáo viên; phân quyền nâng cao (chỉ đọc, chặn tải về).
* **Tiêu chí chấp nhận:**
  * Giáo viên lớp nào chỉ quản lý tài liệu trong Class Space của lớp đó.
  * Học sinh trong lớp tải/xem được; tài khoản ngoài lớp bị chặn truy cập URL file.
  * Hệ thống cảnh báo điều khoản bản quyền trước khi nhấn tải file lên.
* **Mức ưu tiên:** **P1** (Tính năng cơ bản, bắt buộc phải có của mọi LMS/Class Space; chi phí thấp, hiệu quả cao).

---

### Ý tưởng 5: Phụ huynh theo dõi độ hiểu bài của con và sự tâm huyết của giáo viên qua số liệu lab

* **Diễn giải lại yêu cầu:** Cung cấp bảng dữ liệu giúp phụ huynh theo dõi tiến độ/kết quả thực hành lab của con và mức độ tương tác, hỗ trợ của giáo viên phụ trách.
* **Điểm mơ hồ / Câu hỏi:** 
  * Đo "tâm huyết giáo viên" bằng chỉ số định lượng nào (thời gian chấm bài, số lượt nhận xét, tần suất phản hồi)? 
  * Cơ chế định danh và liên kết tài khoản Phụ huynh - Học sinh được thiết kế ra sao?
* **Rủi ro:** 
  * *Quan hệ đối tác & Văn hóa:* Đánh giá "tâm huyết" rất nhạy cảm, dễ gây bất bình hoặc phản kháng từ giáo viên; dẫn đến việc giáo viên đối phó số liệu.
  * *Quyền riêng tư học sinh:* Tiết lộ dữ liệu kết quả học tập của trẻ vị thành niên mà không có cơ chế xác thực thân nhân chặt chẽ (vi phạm Nghị định 13/2023/NĐ-CP).
* **Phạm vi MVP đề xuất:** 
  * *Làm trước:* Báo cáo định kỳ gửi qua Email/Zalo tóm tắt tiến độ làm lab và điểm số của con; hiển thị chỉ số hỗ trợ trung tính ("Số phản hồi từ GV: X") thay vì chấm điểm "tâm huyết".
  * *Làm sau:* Xây dựng Parent Portal riêng, biểu đồ năng lực học tập chuyên sâu.
* **Tiêu chí chấp nhận:**
  * Phụ huynh chỉ xem được dữ liệu của đúng học sinh đã được liên kết xác thực.
  * Không sử dụng các từ ngữ mang tính quy chụp đạo đức ("tâm huyết / không tâm huyết") trên UI.
* **Mức ưu tiên:** **P3** (Định hướng dài hạn; cần chuẩn hóa quy trình sư phạm và dữ liệu trước).

---

### Thứ tự triển khai đề xuất & Phụ thuộc

```
[Ý tưởng 4: Tài liệu Class Space]  ──┐ (Nền tảng học liệu lớp học)
                                    ├──> [Ý tưởng 1: AI cấu hình Lab] ──> [Ý tưởng 2: Âm thanh gợi ý Lab]
[Ý tưởng 3: Video bài giảng duyệt]  ──┘                                        │
                                                                               ▼
                                                            [Ý tưởng 5: Báo cáo kết quả Phụ huynh]
```

1. **Giai đoạn 1 (Ngay lập tức - P1):** Triển khai **Ý tưởng 4** và **Ý tưởng 3** để hoàn thiện không gian học tập Class Space (đầy đủ tài liệu + video bài giảng có kiểm duyệt bản quyền).
2. **Giai đoạn 2 (Tiếp theo - P2):** Triển khai **Ý tưởng 1** (AI sinh kịch bản lab từ template), dựa trên nền tảng các bài lab đã chạy ổn định.
3. **Giai đoạn 3 (Hoàn thiện trải nghiệm - P3):** Triển khai **Ý tưởng 2** (Âm thanh gợi ý trong phòng lab) như một cải tiến micro-UX.
4. **Giai đoạn 4 (Mở rộng hệ sinh thái - P3):** Triển khai **Ý tưởng 5** sau khi đã tích lũy đủ dữ liệu học tập và hoàn thiện khung pháp lý về tài khoản phụ huynh.

