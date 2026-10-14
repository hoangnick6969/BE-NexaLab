# SRS NexaLab v1.1 — tóm tắt để tra cứu

- **Bản gốc:** `SRS Report NexaLab (1).pdf`, 136 trang, ngày 08/10/2026, bản nháp v1.1, tác giả @Suong.
- **Bản text trích từ PDF:** `srs-nexalab-v1.1.txt`. Dùng file này để `grep` theo ID (UC-, BR-, MSG-, SC-, NS-, CR-).
- **Quan hệ với tài liệu khác:** SRS bám theo PRD (`docs/product/prd.md`). **Khi hai tài liệu khác nhau thì PRD thắng.** Các SPEC của epic A1–A5 là hợp đồng chuẩn cho phạm vi của từng epic; SRS chỉ đi theo các SPEC đó.
- **Lưu ý:** bản tóm tắt này không phải bằng chứng là tính năng đã được làm.

## Quy ước ID

| Tiền tố | Nghĩa |
| --- | --- |
| UC-<module>-nn | Use case |
| FS-Lx-nn | Feature spec |
| BR-nn | Business rule (01–29) |
| CR-nn | Common requirement (01–13) |
| MSG-nn | Thông báo (01–47) |
| SC-nn | Màn hình (01–35) |
| NS-nn | Chức năng không có màn hình (01–17, F1–F3) |
| NFR-nn | Yêu cầu phi chức năng (theo Use Case Specs) |

**Module:** AUTH, LRN, CNT, CLS, PRG, PAR, ADM, LAB, 3D, CV, AI.

**Mức ưu tiên:** P0 không bao giờ cắt; P1 cắt từ dưới lên; P2 cắt đầu tiên.

**Increment:** Foundation, A, A-min (thao tác tối thiểu), B, C, R1-later (mắt 3D, lab hoá học), Future.

**Số lượng:** 59 use case. Trong đó 3 Foundation, 14 A, 11 A-min, 3 B, 5 C, 8 R1-later, 15 Future.

## Phạm vi Increment B (Teacher)

| UC / chức năng | Nội dung chính |
| --- | --- |
| UC-AUTH-05 / 3.7.5 / SC-18 | **Học sinh tham gia lớp bằng mã lớp (B, P0).** Mã sai không được lộ mã nào tồn tại; đã là thành viên thì không tạo bản ghi trùng; lớp bật chế độ duyệt thì để pending (MSG-34); nhập sai quá 10 lần trong 10 phút thì khoá 15 phút (MSG-33) |
| UC-CLS-02 / 3.7.3 | Duyệt hoặc xoá thành viên. Học sinh bị xoá mất quyền vào bài giao của lớp, **evidence vẫn được giữ** |
| UC-CLS-04 / 3.7.4 / SC-25, SC-26 | Bảng theo dõi lớp: trạng thái từng học sinh, điểm quiz, số attempt. **Mọi con số đều mở được bản ghi gốc**; số attempt phải khớp số bản ghi Attempt; nộp trễ được gắn nhãn overdue chứ không bị chặn; chỉ ra học sinh có thể cần hỗ trợ kèm bằng chứng; **giáo viên không sửa được điểm hay verdict** |
| UC-CLS-03 / 3.7.2 / SC-24 | Giao **lesson hoặc bài lab**, cho cả lớp hoặc một nhóm. **Hạn nộp không bắt buộc** (5a) và **không được ở quá khứ** (MSG-30). Nội dung nháp không được hiện (MSG-29). Thành công thì báo số học sinh nhận được (MSG-31) |
| UC-CLS-03 E2 / E3 | Nội dung bị archive sau khi giao: học sinh đã bắt đầu thì học tiếp, chưa bắt đầu thì thấy MSG-36. Bài giao bị archive thì rời hàng đợi nhưng vẫn còn trong lịch sử |
| UC-CLS-01 / 3.7.1 | Tên lớp không trùng trong các lớp của cùng giáo viên; mã tham gia ngẫu nhiên và tắt được |
| UC-CNT-01..07 / 3.6 / SC-22, SC-23 | Toàn bộ UX soạn nội dung thuộc B. Lesson Editor có các tab Metadata, Reading, Video, Study cards, Quiz, Lab. Publish chỉ khi đủ metadata theo BR-15 và mọi video bắt buộc có transcript (MSG-28). Chỉ tác giả hoặc admin được publish hay archive |
| BR-16 | **Override cổng quiz do giáo viên thực hiện thuộc Increment B, chỉ ở phía server** |
| BR-27 | Sửa quiz đã publish phải tạo revision mới, để attempt cũ vẫn giải thích được điểm của nó |
| Entity | `Enrollment.status` gồm pending, approved, removed; có entity `AssignmentTarget`; có `Chapter` |

## Phạm vi Increment C (Parent + Admin)

| UC / chức năng | Nội dung chính |
| --- | --- |
| UC-AUTH-06 / 3.8.1 / SC-28 | Mã liên kết **dùng 1 lần và có hạn** (MSG-35). Theo pre-condition, mã do **nhà trường hoặc giáo viên** cấp (khác với code hiện tại, nơi học sinh tự tạo mã). Mức ưu tiên P2 |
| UC-PAR-01 / 3.8.2 / SC-27, SC-29 | Chỉ đọc: bài đã hoàn thành, thời gian học, điểm quiz, số lần thí nghiệm. Truy cập học sinh không liên kết thì **403 kèm audit**. Không có nút ghi nào. P2 |
| UC-PAR-02 | Báo cáo tuần hoặc tháng tạo khi mở trang. **Câu hỏi mở:** PRD không nhắc tới. P2 |
| BR-11 | Phụ huynh chỉ đọc, chỉ thấy con đã liên kết, không bao giờ thấy hội thoại AI (chỉ thấy mức độ xin trợ giúp ở dạng tóm tắt) |
| UC-ADM-01 / 3.9.1 / SC-31 | Tìm, tạo, sửa, **vô hiệu hoá** user. **Không xoá user đã có evidence, thay bằng deactivate** (BR-22) |
| 3.9.2 / SC-32, SC-33 | CRUD subject, **chapter**, lab, challenge (successConditions, constraints). Lab chỉ publish sau khi đạt BR-12 |
| 3.9.3 / SC-34 / NS-14 | Validator asset 3D: glTF/GLB có Draco, 20k–50k tam giác, texture ≤ 2048 KTX2, LOD0–2, mỗi bộ phận một node (MSG-38) |
| UC-ADM-02 / 3.9.4 / SC-35 | Cấu hình khoảng tham số mô phỏng. Chỉ áp dụng cho các lần chạy sau; attempt cũ giữ simVersion. P1 |
| 3.9 AC-01 / CR-08 / NS-12 | **Mọi thay đổi của admin đều có AuditLog** ghi admin, hành động, tài nguyên, kết quả |

## Quy tắc chung áp dụng cho B và C

- **CR-01:** một format lỗi chung, có mã phân biệt validation, gate, ownership, conflict, rate limit, dependency.
- **CR-05:** thao tác phá huỷ phải hỏi xác nhận (MSG-41).
- **CR-08:** ghi audit.
- **CR-09:** danh sách dài phải phân trang.
- **CR-11:** ownership lấy từ người đang đăng nhập; route chi tiết trả cùng một not-found cho ID không tồn tại và ID không có quyền. **Ngoại lệ do PRD chốt cho parent child-progress:** mọi student ID không liên kết trả cùng 403 audited, dù ID tồn tại hay không, để không lộ việc học sinh có trong hệ thống.
- **NS-01:** từ chối 403 (MSG-11) và **ghi audit**. NS-12 Audit logger và NS-13 retention đều là **Foundation**.
- **BR-21:** mã lớp, mật khẩu tạm và mã liên kết phụ huynh là ba credential riêng biệt.
- **BR-22:** giữ evidence và audit 12 tháng sau lần hoạt động cuối của học sinh.

## Câu hỏi còn mở trong SRS (team phải xác nhận)

- Giáo viên có được tự đăng ký không (UC-AUTH-01, SC-06)? Hiện code chỉ cho phụ huynh tự đăng ký.
- Học sinh quên mật khẩu thì lấy lại thế nào? Đề xuất: giáo viên cấp mật khẩu tạm mới (code đã có).
- Có giữ UC-PAR-02 (báo cáo phụ huynh) không?
- Còn các điểm "to confirm" khác: thời hạn link reset, quy tắc mật khẩu, các trường của study card, giới hạn dung lượng upload, bài giao không có hạn nộp thì xếp ở đâu, ngôn ngữ giao diện.

## Chỗ SRS khác code hiện tại (ghi nhận ngày 2026-10-14)

- **Forgot password:** SRS dùng link reset dùng một lần (SC-04). Code đang gửi mật khẩu tạm qua email, còn route `auth/reset` không được dùng tới.
- **Đăng nhập:** SRS dùng một ô cho cả username và email (có `@` thì coi là email). Code dùng các endpoint riêng.
- **Mô hình dữ liệu:** SRS có Material, StudyCard, Quiz, QuizQuestion, Chapter, AssignmentTarget, LinkCode, AuditLog. Code lưu materials và questions dạng JSON trong Lesson, `studentIds` dạng JSON, `linkCode` ngay trên User, và chưa có AuditLog.
- **Enrollment:** SRS có trạng thái pending, approved, removed. Code dùng `approved: boolean`, còn khi xoá thành viên thì xoá luôn bản ghi.
