---
id: SPEC-fl-21-food-web
status: in-progress
date: '2026-11-02'
branch: feat/fl-21-food-web (BE + FE, from main BE e424524, FE ab7776b)
companions:
  - lab-definition.md
  - implementation-plan.md
upstream:
  - ../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md
  - ../spec-lab-pipeline/lab-portfolio-20-slots-v1.md
  - ../spec-lab-pipeline/contract-v1.md
  - ../spec-fl-20-ecological-tolerance/SPEC.md
---
# FL-21 — Lưới thức ăn và cân bằng tự nhiên (K8 Cảnh nhẹ + HUD)

**Trạng thái:** owner chấp nhận toàn bộ khuyến nghị (2026-11-02); đã build và kiểm chứng local, chưa release. Đây không phải phê duyệt chương trình, khoa học hay release. Mọi outcome, model, số liệu minh hoạ và rubric dưới đây là `PROPOSED_UNAPPROVED`.

Tài liệu theo mẫu FL-20 gồm:
- `SPEC.md` (file này): audit nguồn và các quyết định;
- `lab-definition.md`: model, activity, rubric, golden cases;
- `implementation-plan.md`: ticket, file và cách kiểm chứng.

## 1. Audit

### 1.1 Nguồn chương trình đã xác minh

Đọc từ môi trường dùng chung ngày 2026-11-02, chỉ bằng GET admin qua API local cổng 4000, không ghi gì vào DB.

| Mục | Giá trị |
|---|---|
| Bài 43 | `KHTN8-L43` "Quần xã sinh vật", outcome `B43-O01..O03`; Lesson `pack-structured-b927cf8b5f1878c405a2cfec38da702597927030-v1` |
| Bài 44 | `KHTN8-L44` "Hệ sinh thái", outcome `B44-O01..O04`; Lesson `pack-structured-bad6c781d4a7acf408acdf249319f86758dbf66f-v1` |
| Bài 46 | `KHTN8-L46` "Cân bằng tự nhiên", outcome `B46-O01..O03`; Lesson `pack-structured-3ce4a56b56d1b1a1f85a8021ffdcd59159666ad8-v1` |
| Trạng thái chung | Cả ba bài: published, `SHARED_LIBRARY`, môn `khtn`, lớp 8. Mọi outcome: active, không synthetic. Chủ đề: active |
| Ba nhóm sinh vật | Sinh vật sản xuất dùng quang năng tổng hợp chất hữu cơ (thực vật, tảo). Sinh vật tiêu thụ lấy chất hữu cơ từ thức ăn. Sinh vật phân giải phân giải xác, chất thải thành chất vô cơ (nấm, hầu hết vi khuẩn). Nguồn: `p0182-b0019..21` |
| Chuỗi và lưới | Chuỗi gồm nhiều loài có quan hệ dinh dưỡng. Một loài tham gia nhiều chuỗi là "mắt xích chung" giữa các chuỗi. Nguồn: `p0184-b0008..12` |
| Tháp sinh thái | Dùng để đánh giá mức độ dinh dưỡng trong chuỗi và lưới thức ăn. Nguồn: `p0184-b0016` |
| Năng lượng | Năng lượng truyền vào quần xã qua sinh vật sản xuất, truyền một chiều qua các bậc dinh dưỡng, giảm dần và trả lại môi trường dưới dạng nhiệt. Nguồn: `p0185-b0002` |
| Cân bằng tự nhiên | Trạng thái ổn định tự nhiên của các cấp độ tổ chức sống; gồm hiện tượng khống chế sinh học trong quần xã. Nguồn: `p0190-b0010..11` |
| Nguyên nhân mất cân bằng | Khả năng tự điều chỉnh có hạn. Nguyên nhân chủ yếu do con người: phá rừng, săn bắt động vật hoang dã, khai thác tài nguyên quá mức, chất thải sinh hoạt và công nghiệp gây ô nhiễm. Nguồn: `p0192-b0005..06` |

### 1.2 Phát hiện

| # | Mức | Phát hiện | Hệ quả |
|---|---|---|---|
| C1 | Cao | Một release chỉ gắn được với một chủ đề, và bài học được gắn phải chứa mọi outcome của activity (đã gặp ở FL-20). `B44-O02`, `B44-O03` thuộc `KHTN8-L44`; `B46-O02` thuộc `KHTN8-L46`. | Release v1 gắn Bài 44 với `B44-O02` và `B44-O03`. Phần mất cân bằng (Bài 46) vẫn được chấm như luyện tập, nhưng không tính cho outcome (D-2). |
| C2 | Cao | Loài cụ thể trong Hình 44.3, 44.4 và 46.4 chỉ có trong hình, không có trong text. Text cũng không nêu hiệu suất 10 %; chỉ nói năng lượng "giảm dần" và mất dưới dạng nhiệt. | Lưới thức ăn là bộ dữ liệu **minh hoạ** do NexaLab soạn, có nhãn rõ. Con số 10 % là quy ước minh hoạ, không gán cho SGK (D-4). |
| C3 | Cao | Text trong DB có lỗi OCR: "quân xã", "quản xã", "thấp sinh thái", "mất xích chung", "chuỗi thúc ăn", "giám dẫn". | Copy trong Lab viết lại sạch; người duyệt chương trình sửa register (D-3). |
| C4 | Trung bình | Bài học và Lab phải cùng môn (`khtn`), như FL-20. | Lab dùng môn `khtn`, chủ đề `KHTN8-L44`. |
| C5 | Trung bình | Một loài bị mất kéo theo hiệu ứng dây chuyền phụ thuộc mô hình (bậc 2, bậc 3 trở đi). | v1 chỉ tính **hiệu ứng trực tiếp** lên con mồi và kẻ thù của loài bị mất. Câu hỏi chấm điểm chỉ dùng các trường hợp có đáp án rõ (D-5). |
| C6 | Thông tin | Nền tảng đã có registry evaluator (BE), registry renderer (FE), mẫu checkpoint từ FL-20, migration và script release. | Không cần ticket nền tảng. |

## 2. Quyết định cần owner

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| D-1 | Mở FL-21 khi FL-20 đã release? | Mở được. FL-20 đã xong phần phát triển (release v1 ACTIVE), nên FL-21 không làm vượt giới hạn ≤ 2 track. |
| D-2 | Gắn bài nào? | Bài 44, outcome `B44-O02` và `B44-O03`. Bài 46 là luyện tập bổ trợ. |
| D-3 | Sửa lỗi OCR trong register | Người duyệt chương trình sửa; Lab không phụ thuộc. |
| D-4 | Lưới thức ăn minh hoạ và hiệu suất 10 % | Dùng lưới 11 loài quen thuộc với học sinh Việt Nam, gắn nhãn "minh hoạ". Hiệu suất 10 % ghi là "quy ước minh hoạ"; phần SGK chỉ yêu cầu hiểu năng lượng giảm dần. |
| D-5 | Phạm vi hiệu ứng khi mất một loài | Chỉ hiệu ứng trực tiếp: con mồi của loài bị mất tăng, kẻ thù của nó giảm. Không mô phỏng số lượng theo thời gian. |
| D-6 | Rubric 7 tiêu chí, đạt = 7/7? | Đồng ý tạm thời, nhất quán với FL-20. |
| D-7 | Chuỗi thức ăn do học sinh tự dựng | Chấp nhận mọi chuỗi hợp lệ trong lưới, bắt đầu từ sinh vật sản xuất, có ít nhất 4 mắt xích. Máy chủ kiểm tra từng cặp liền kề. |

## 3. Phạm vi

**Trong phạm vi:**
- Model tất định `food-web@1.0.0`, gồm các setup: vai trò, chuỗi, năng lượng, loại bỏ loài, nguyên nhân tác động.
- Activity `food-web-checkpoints` v1.
- Renderer 2D: sa bàn lưới thức ăn có thể bấm chọn loài, tháp năng lượng, bảng nguyên nhân.
- Test BE và FE; diễn tập release trên DB cô lập, rồi release nếu owner yêu cầu.

**Ngoài phạm vi:**
- Động lực quần thể theo thời gian và hiệu ứng bậc 2 trở lên.
- Chu trình vật chất định lượng.
- Bài 45 Sinh quyển.
- Scene 3D.
- Đặc trưng quần xã (`B43-O02`) có chấm điểm; v1 chỉ đưa vào phần khám phá.

## 4. Định nghĩa hoàn thành của spec

Spec đạt khi:
- blueprint đủ để bắt đầu FL21-T2 mà không phải tự đoán;
- mọi số liệu đều có nguồn SGK hoặc nhãn "minh hoạ";
- các quyết định mở đều có khuyến nghị.
