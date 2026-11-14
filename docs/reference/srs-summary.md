# SRS NexaLab v1.2 — tóm tắt để tra cứu

- **Bản hiện hành:** `SRS Report NexaLab v1.2.docx`, bản nháp v1.2, ngày 14/11/2026, theo template SRS của capstone (Report 3). Người cập nhật: Võ Hà Đông.
- **Bản text để grep:** `srs-nexalab-v1.2.txt`, trích từ file docx: heading có `#`, mỗi hàng bảng một dòng, các ô cách nhau bằng ` | `. Dùng file này để `grep` theo ID (UC-, BR-, MSG-, SC-, NS-, CR-).
- **Bản cũ giữ làm lịch sử:** `SRS Report NexaLab (1).pdf` và `srs-nexalab-v1.1.txt` (v1.1, 136 trang, 08/10/2026, tác giả @Suong). Các SPEC viết trước 14/11/2026 trỏ tới v1.1; nội dung v1.1 vẫn đúng cho phạm vi Foundation, A, B, C.
- **Quan hệ với tài liệu khác:** SRS bám theo PRD (`docs/product/prd.md`). **Khi hai tài liệu khác nhau thì PRD thắng.** SPEC của từng epic là hợp đồng chuẩn cho phạm vi epic đó; SRS chỉ đi theo các SPEC.
- **Lưu ý:** bản tóm tắt này không phải bằng chứng là tính năng đã được làm.

## Thay đổi trong v1.2 (14/11/2026)

Đối chiếu với code trên `main` và nhánh `research/student-ai` ngày 14/11/2026.

| Mục SRS | Thay đổi |
| --- | --- |
| Document Information | Version 1.2; điền tên thành viên (Đoàn Trọng Lực – Leader, Võ Hà Đông, Nguyễn Vũ Hoàng) và GVHD Lê Thiện Nhật Quang |
| Release increments, 1 | Thêm I1–I3 (Open Learning, Class Space, Assigned Test), R2 (Account và Notifications), CF (Content Foundation), FL (Foundational Labs), TAI (Teacher AI), SAI (Student AI). Mắt 3D: đã có lab FL-16 Eye Optics, nhưng viewer có nhãn bộ phận vẫn là R1-later. Hoá học: đã có lab pH quỳ tím, 6 phản ứng cố định vẫn là R1-later |
| 2.2.2 Use case catalogue | UC-AI-01..05, 08, 09 chuyển sang SAI; UC-AI-06, 07 chuyển sang SAI, TAI |
| 3.1.2, 3.1.3 | SC-05 thêm avatar, theme, ngôn ngữ; thêm SC-36..SC-53 kèm phân quyền |
| 3.1.4 | Thêm NS-18..NS-27: lab run pinning, evaluator registry, textbook ingest, notification sync, parent overdue notice, AI job runner, AI credit ledger, insight rule engine, Student AI provider guard, tutor retention |
| 3.1.5 | Thêm khoảng 20 nhóm entity theo `prisma/schema.prisma` (curriculum, ebook, class resource, submission/late, notification, content pack, lab release/run, HintLog, tutor, AI job, similarity, credit) |
| 3.10 | Teacher AI, Student AI, Teacher AI insights chuyển từ Future sang đã làm |
| 3.11–3.16 (mới) | Open Curriculum và Ebooks; Class Space, Assigned Tests và Class Labs; Foundational Labs (danh mục 10 lab); Account, Notifications và Settings; Teacher AI (TAI-01..06); Student AI (SAI). Mỗi chức năng có Function trigger / description / details |
| 5.3, 5.4.5 | Thêm MSG-48..MSG-54 và các hàng truy vết cho 3.11–3.16 |

## Quy ước ID

| Tiền tố | Nghĩa |
| --- | --- |
| UC-<module>-nn | Use case |
| FS-Lx-nn | Feature spec |
| BR-nn | Business rule (01–29) |
| CR-nn | Common requirement (01–13) |
| MSG-nn | Thông báo (01–54; 48–54 thêm ở v1.2) |
| SC-nn | Màn hình (01–53; 36–53 thêm ở v1.2) |
| NS-nn | Chức năng không có màn hình (01–27, F1–F3; 18–27 thêm ở v1.2) |
| NFR-nn | Yêu cầu phi chức năng (theo Use Case Specs) |

**Module:** AUTH, LRN, CNT, CLS, PRG, PAR, ADM, LAB, 3D, CV, AI.

**Mức ưu tiên:** P0 không bao giờ cắt; P1 cắt từ dưới lên; P2 cắt đầu tiên.

**Increment:** Foundation, A, A-min (thao tác tối thiểu), B, C, R1-later (viewer mắt 3D, 6 phản ứng hoá học), Future; từ v1.2 thêm I1–I3, R2, CF, FL, TAI, SAI.

**Số lượng:** 59 use case. Trong đó 3 Foundation, 14 A, 11 A-min, 3 B, 5 C, 8 R1-later, 7 SAI, 2 SAI và TAI, 6 Future (v1.1: 15 Future).

Các phần bên dưới tóm tắt phạm vi B và C từ v1.1 và vẫn đúng ở v1.2.

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
