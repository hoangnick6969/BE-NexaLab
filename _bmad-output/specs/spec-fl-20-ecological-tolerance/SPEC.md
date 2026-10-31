---
id: SPEC-fl-20-ecological-tolerance
status: in-progress
date: '2026-10-31'
branch: feat/fl-20-ecological-tolerance (BE + FE, from main BE 0ac700a, FE 0a8cf73)
companions:
  - lab-definition.md
  - implementation-plan.md
upstream:
  - ../spec-lab-pipeline/SPEC.md
  - ../spec-lab-pipeline/lab-pipeline-phase-plan.md
  - ../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md
  - ../spec-lab-pipeline/lab-portfolio-20-slots-v1.md
  - ../spec-lab-pipeline/contract-v1.md
  - ../spec-fl-25-em-induction/SPEC.md
---
# FL-20 — Nhân tố và giới hạn sinh thái, đặc trưng quần thể (K8 Cảnh nhẹ + HUD)

**Trạng thái:** đã build và kiểm chứng local (2026-10-31), chờ review và owner duyệt; chưa release. Đây không phải phê duyệt chương trình, khoa học hay release. Mọi outcome, model, số liệu minh hoạ và rubric dưới đây là `PROPOSED_UNAPPROVED`.

Tài liệu gồm 3 phần, theo mẫu FL-25:
- `SPEC.md` (file này): audit nguồn và spec, các xung đột cổng và quyết định cần owner.
- `lab-definition.md`: blueprint của Lab (model, activity, rubric, evidence, golden cases).
- `implementation-plan.md`: ticket, thứ tự, file sẽ chạm, thiết kế cảnh 2D/HUD và cách kiểm chứng.

## 1. Audit

Nguồn đã đọc:
- `spec-lab-pipeline/*`: catalog §3 dòng FL-20, §6A K8, appendix outcome B41/B42; portfolio slot 14; phase plan.
- Spec FL-25 làm mẫu.
- Code BE: `checkpoint-activities.ts`, `sim-packs.ts`, `packages/sim/index.ts`.
- Nội dung bài học trên môi trường dùng chung: đọc **chỉ bằng GET admin** qua API local cổng 4000, gồm `/admin/taxonomy`, `/lessons` và `/open-curriculum/lessons/:id`. Không ghi gì vào DB.

### 1.1 Nguồn chương trình đã xác minh (đọc từ DB dùng chung, 2026-10-31)

| Mục | Giá trị |
|---|---|
| Bài 41 | `KHTN8-L41` "Môi trường và các nhân tố sinh thái", outcome `KHTN8-B41-O01..O03`; Lesson `pack-structured-03b2dcaf5fd4851dbd229b2d01c7d14ac8c1544c-v1` (published) |
| Bài 42 | `KHTN8-L42` "Quần thể sinh vật", outcome `KHTN8-B42-O01..O03`; Lesson `pack-structured-af15f30afc3eb10589e674f9e38bc5aee174860b-v1` (published) |
| Định nghĩa giới hạn sinh thái | "khoảng giá trị của một nhân tố sinh thái mà trong khoảng đó, sinh vật có thể tồn tại và phát triển ổn định theo thời gian" (block `sgk-khtn8-nxbgd-2026-p0174-b0009`) |
| Ví dụ chuẩn | Cá rô phi ở Việt Nam không tồn tại được dưới 5,6 °C và trên 42 °C; khoảng 5,6–42 °C là giới hạn sinh thái về nhiệt độ (Hình 41.3, cùng block) |
| Bài tập vận dụng | "Ở một địa phương, người ta có ý định nhập nội ba loài cá (A, B, C) về nuôi" (`p0175-b0002`); số liệu nằm trong hình, **không có trong text đã trích** |
| Đặc trưng quần thể | kích thước, mật độ, tỉ lệ giới tính, nhóm tuổi, phân bố (`p0178-b0011`) |
| Mật độ | "số lượng cá thể trên một đơn vị diện tích hay thể tích"; Bảng 42.1: lim xanh 11 250 cây / 15 ha, bắp cải 3 000 cây / 750 m², cá chép 120 000 con / 60 000 m³ (`p0177-b0008..9`) |
| Nhóm tuổi | ba nhóm tuổi; Hình 42.3 "các kiểu tháp tuổi", so sánh nhóm trước sinh sản với nhóm sinh sản (`p0177-b0013..19`); tên các kiểu tháp nằm trong hình, **không có trong text** |

### 1.2 Phát hiện

| # | Mức | Phát hiện | Bằng chứng | Hệ quả |
|---|---|---|---|---|
| B1 | **Chặn** | Hai tài liệu ghi trạng thái cổng mâu thuẫn nhau. `lab-pipeline-phase-plan.md` vẫn ghi P3.5 **NOT MET**. `sprint-status.yaml` ghi Circuit đã publish ở P3.6 (`p3-6-lab-factory-operations: done`, 2026-10-30) và `p3-7-class-lab: ready-for-dev`. Dù theo tài liệu nào, P3.7 vẫn giới hạn ≤ 2 track Lab đồng thời. Hiện đã có FL-10 (K2, đang làm) và FL-25 (đã release, T10 QA còn mở). | phase plan dòng 25, 34, 42; sprint-status dòng 125–127, 1055 | Mở FL-20 có thể là track thứ ba, nên cần owner quyết định (D-1). Cũng cần đồng bộ lại phase plan với sprint-status. |
| B2 | Cao | FL-20 là **W4**, điểm 18/30. | catalog §4.1, §5 | Cần ghi nhận lý do chọn (D-1). |
| B3 | Cao | Text bài học trong DB có **lỗi OCR**: "quản thể", "tôn tại", "Mặt độ", "thấp tuổi", "cá thể đục". Register cũng đã ghi lỗi `B42-O01` "quản thể". | text bài 41/42; catalog "Register defects" mục 1 | Copy cho học sinh phải viết lại sạch, không chép từ DB. Curriculum reviewer cần sửa register (D-3). |
| B4 | Cao | Hai dữ liệu quan trọng chỉ có trong hình: số liệu ba loài cá A, B, C (Hình 41.x) và tên các kiểu tháp tuổi (Hình 42.3). Khoảng thuận lợi của cá rô phi cũng không có trong text. | §1.1 | Không bịa số liệu SGK. v1 dùng loài giả định có nhãn "minh hoạ"; chỉ hiện khoảng thuận lợi khi reviewer cung cấp số liệu có nguồn (D-4). |
| B5 | Trung bình | FL-20 trải trên **hai bài** (B41 và B42). Binding release là mảng `lessonBindings`, nên hỗ trợ nhiều bài. | `lab-release-bindings.ts:29-40` | Một Lab bind cả hai bài, hoặc chỉ B41 (D-2). |
| B6 | Trung bình | Kit K8 chưa có scene production. Catalog chọn **2D (HUD)**, 3D tuỳ chọn. | catalog §6A dòng 240, 307 | Làm 2D SVG, không Three.js. Nhẹ hơn FL-25 nhiều. |
| B7 | Thấp | Ngưỡng phân loại tháp tuổi không có trong SGK; SGK chỉ yêu cầu so sánh định tính. | §1.1 | Model dùng ngưỡng tỉ lệ khai báo rõ. Dữ liệu checkpoint đặt xa ngưỡng để kết quả không phụ thuộc lựa chọn ngưỡng (D-5). |
| B8 | Thông tin | Nền tảng đã có registry checkpoint activity (từ FL-25), host LabRun, `checkpoint-views.tsx` FE và quy trình release qua migration và admin API. | `checkpoint-activities.ts`, `scripts/release-em-induction.mjs` | Không cần ticket nền tảng như FL25-T2. Chỉ thêm entry mới. |

## 2. Quyết định cần owner

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| D-1 | Mở FL-20 khi FL-10 đang làm và FL-25 chưa đóng T10? | **ĐÃ QUYẾT 2026-10-31 (owner, trong phiên làm việc):** "đồng ý D-1 theo khuyến nghị". FL-25 coi như xong phần phát triển (T10 chỉ còn QA), nên FL-20 là track thứ hai cùng FL-10, không cần ngoại lệ. Phase plan cần đồng bộ với sprint-status. |
| D-2 | Binding: một Lab cho cả B41 và B42, hay chỉ B41? | Mở; build theo khuyến nghị: một Lab, bind cả hai Lesson: outcome chính `B41-O03` + `B42-O02`, hỗ trợ `B41-O02`. Nếu owner muốn gọn, tách phần quần thể sang FL-20b sau. |
| D-3 | Sửa lỗi OCR trong register và text bài 41/42 | Curriculum reviewer sửa. Lab không phụ thuộc vào việc này vì copy Lab được viết riêng. |
| D-4 | Số liệu ngoài text: khoảng thuận lợi của cá rô phi, ba loài cá A/B/C | v1 chỉ dùng số liệu text đã xác minh (5,6 °C, 42 °C, Bảng 42.1). Loài A/B/C là giả định, có nhãn "minh hoạ", không gán là số liệu SGK. Reviewer cung cấp số từ hình nếu muốn bám sát SGK. |
| D-5 | Ngưỡng phân loại tháp tuổi | Tỉ lệ r = trước sinh sản / sinh sản: r ≥ 1,2 → phát triển; r ≤ 0,8 → suy giảm; còn lại → ổn định. Tên ba kiểu do reviewer đối chiếu Hình 42.3. |
| D-6 | Rubric 7 tiêu chí, đạt = 7/7? | Đồng ý tạm thời, nhất quán với Circuit (3/3) và FL-25 (5/5). |
| D-7 | Biên giới hạn có tính là "trong giới hạn" không (5,6 °C và 42 °C)? | Tính là trong giới hạn (đóng hai đầu). Checkpoint không đặt đúng biên, nên lựa chọn này không ảnh hưởng điểm. |

## 3. Phạm vi

**Trong phạm vi:**
- Blueprint FL-20.
- Model tất định `ecology-tolerance@1.0.0` với 4 setup: tolerance, tolerance-sweep, import-comparison, population (density + age-structure).
- Activity `ecology-tolerance-checkpoints@1`, đăng ký vào registry có sẵn.
- Renderer 2D: sa bàn ao cá + đồ thị giới hạn; sa bàn quần thể + tháp tuổi HUD.
- Test BE/FE trên DB cô lập và mock; một lượt thật FE → BE → DB cô lập.

**Ngoài phạm vi:**
- Release và OWNER_SIGNOFF. Làm sau khi owner duyệt, theo đúng quy trình FL-25.
- Ghi vào Supabase dùng chung.
- Mô phỏng động lực quần thể (tăng trưởng, biến động theo thời gian).
- Nhiều nhân tố đồng thời và tương tác giữa các nhân tố.
- Lưới thức ăn (thuộc FL-21).
- Phân loại nhân tố vô sinh/hữu sinh có chấm điểm (B41-O02 chỉ là hỗ trợ; v1 chỉ có phần khám phá không chấm).
- Scene 3D.

## 4. Định nghĩa hoàn thành của spec

Spec đạt khi:
- blueprint đủ để implementer bắt đầu FL20-T2/T3 mà không phải tự đoán;
- mọi số liệu đều ghi rõ nguồn (block SGK) hoặc được gắn nhãn "minh hoạ";
- mọi quyết định mở được liệt kê kèm khuyến nghị;
- không có khẳng định nào về phê duyệt, release hay hiệu năng chưa đo.
