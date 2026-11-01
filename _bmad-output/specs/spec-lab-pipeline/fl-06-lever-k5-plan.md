# FL-06 — Moment lực và đòn bẩy (K5 Cơ học): kế hoạch đề xuất

> **Cập nhật quyết định 2026-11-01:** [Model Slice Spec FL-06](fl-06-lever-model-slice-spec.md) là contract mới nhất cho v1 và thay các câu hỏi/giả định trái ngược bên dưới: chỉ B18/B19, bỏ B31; chỉ copy `vi`; hằng số và mapping gắn nhãn **Technical Assumption**; không chờ reviewer độc lập ở Bước 0; owner ký `OWNER_SIGNOFF` exact digest. Code release gate trên nhánh FL-06 đã được đổi cho draft FL-06; chưa deploy lên môi trường đích. Phần dưới giữ lịch sử kế hoạch ban đầu để đối chiếu, không phải quyết định hiện hành khi khác spec mới.

> **Readback Supabase 2026-11-01:** mã outcome thực trong registry là `KHTN8-B18-O01`, `KHTN8-B18-O02`, `KHTN8-B19-O01`, `KHTN8-B19-O02`; `B18-O01`… trong kế hoạch là alias. Hai Lesson pack B18/B19 đã published trong SHARED_LIBRARY với đúng outcome tương ứng. FL-06 (`lever-equilibrium`) chưa có Lab/Challenge/Release. Migration `20261031130000_fl10_run_events` đã áp dụng; không có migration schema riêng cho FL-06. Không tạo release digest trước khi tuple và code đích được triển khai.

**Ngày:** 2026-11-01
**Nhánh:** `codex/fl-06-lever-equilibrium` ở BE và FE
**Trạng thái:** kế hoạch; chưa triển khai model, activity, kit, dữ liệu hay release. Người dùng đã xác nhận FL-06 là đòn bẩy K5 và yêu cầu dạy/chấm `M = F·d`, `F₁d₁ = F₂d₂` trong v1. Công thức, miền tham số, rubric và mapping vẫn cần review khoa học/chương trình trước phát hành.

## 1. Căn cứ và giới hạn chứng cứ

- `lab-catalog-and-shared-kits-khtn8-9.md` xếp FL-06 `KEEP`, slot 5, W3, thuộc **K5 Cơ học**, 2D là modality gốc; 3D ở kế hoạch này đáp ứng yêu cầu giao diện/animation của owner. `PhysicalLabEnvironment` là vỏ phòng dùng chung qua cả Vật lý và Hóa học; K5 sở hữu apparatus riêng. Không đưa dụng cụ K2 Hóa ướt vào FL-06.
- `lab-portfolio-20-slots-v1.md` đặt FL-06 sau FL-03 trong đề xuất ưu tiên, nhắc xác minh B18/B19 và không đồng nhất dự đoán ảo với kỹ năng thao tác dụng cụ thật.
- Source map KHTN8 hiện có Chương IV, Bài 18 “Tác dụng làm quay của lực. Moment lực” (trang in 76–78) và Bài 19 “Đòn bẩy và ứng dụng” (79–83). Đây là OCR **chưa đối chiếu ảnh trang**, locator trang là từ mục lục, không phải chứng cứ chính xác từng trang. Cần rà các Hình 18.1–18.4, 19.1–19.6 trên nguồn có quyền truy cập và lưu biên bản sửa OCR trước khi biên soạn lời giảng/câu hỏi.
- Outcome code `Bxx-Oxx` trong catalog là **candidate**, có lỗi OCR; chưa có artifact chương trình chính thức đã review để coi code/text/mapping là outcome được phê duyệt. Trạng thái release `ACTIVE` của Lab khác không cấp phép cho mapping FL-06.
- `lab-pipeline-phase-plan.md` vẫn ghi P3.5 gate **NOT MET**, P3.7 **gated**, tối đa hai track Lab đồng thời. Bốn release đang ACTIVE là lịch sử readback 2026-11-01, cần kiểm tra lại trước thao tác vận hành. Kế hoạch/technical slice không tự mở release.

## 2. Nội dung kiến thức và mapping đề xuất

| Knowledge unit cần biên soạn và review | Bài / topic ứng viên | Outcome ứng viên | Hoạt động/chứng cứ học sinh |
|---|---|---|---|
| Lực có thể làm quay vật quanh điểm/trục; lực qua điểm tựa không làm quay trong mô hình thanh ngang | KHTN 8 → Chương IV → Bài 18 / topic “Tác dụng làm quay của lực. Moment lực” | `B18-O01` chính | Treo cùng quả nặng ở bên trái, tại O, bên phải; dự đoán chiều quay rồi ghi hiện tượng. |
| Moment phụ thuộc độ lớn lực và cánh tay đòn vuông góc; đơn vị N·m; `M = F·d` | Bài 18 | `B18-O02` chính | Thay F hoặc d, so sánh/ghi M và giải thích; công thức được dạy và chấm theo quyết định của owner, chờ xác minh curriculum/model. |
| Cân bằng của thanh lý tưởng với hai lực tạo moment ngược chiều: `F₁d₁ = F₂d₂` | Bài 18 → Bài 19 | `B18-O02` và `B19-O02` **đề xuất**, cần reviewer quyết định độ phủ từng outcome | Dự đoán vị trí/lực cần để cân bằng; đọc lực kế và ghi bảng so sánh hai moment. |
| Điểm tựa, cánh tay đòn, hướng lực, lợi về lực/đổi hướng lực trong tình huống đơn giản | Bài 19 / topic “Đòn bẩy và ứng dụng” | `B19-O02` chính | Giải một tình huống nâng vật và giải thích chọn vị trí đặt lực. |
| Nhận diện ví dụ các loại đòn bẩy thực tiễn | Bài 19 | `B19-O01` hỗ trợ | Chọn ví dụ, chỉ điểm tựa/vị trí lực. Bản OCR của bài mô tả **hai loại chính**, loại 3 là cách gọi ở tài liệu khác; số loại/cách gọi cần reviewer chốt trước khi đưa vào copy/rubric. |
| Đòn bẩy trong hệ vận động | Bài 31, Chương VII | `B31-O02` mở rộng có điều kiện | Chỉ thêm sau khi chốt phạm vi v1 và xác minh nguồn B31; không nhận là outcome chính của activity cân bằng. |

Không báo “đã đạt outcome” chỉ từ việc xem animation hoặc tính đúng một phép toán. Cần mapping từ checkpoint/rubric đến phần **có thể quan sát**, ghi rõ những phần của outcome đòi thao tác vật lý/giáo viên quan sát ngoài Lab. Knowledge unit phải có nguồn, claim/source locator, reviewer và version; không sao chép OCR chưa review thành câu hỏi.

## 3. Blueprint v1 cần chốt trước khi code khoa học

- **Identity đề xuất:** Lab `lever-equilibrium`, model `lever-bench@1.0.0`, activity `lever-investigation@1`, rubric `lever-investigation@1.0.0`, renderer `lever-bench`, kit FE `physics/mechanics/kit`. Chỉ là tên làm việc; xác nhận registry và không đụng ID hiện hữu trước khi implement.
- **Checkpoint A — tác dụng làm quay:** thanh đòn chia vạch, điểm tựa O, quả nặng móc ở A/O/C như Bài 18. Học sinh dự đoán chiều quay/không quay, thao tác, ghi quan sát và giải thích vai trò của khoảng cách tới trục.
- **Checkpoint B — moment:** giữ d rồi đổi số quả nặng/lực; giữ F rồi đổi lỗ treo. Ghi F (N), d (m), `M = F·d` (N·m), chiều moment. Một nguồn model quyết định số đo; UI 2D/3D chỉ chiếu cùng kết quả.
- **Checkpoint C — cân bằng:** treo tải một bên, chọn vị trí/lực phía kia, đo bằng lực kế khi thanh cân bằng ngang. Dự đoán trước thao tác; ghi `F₁,d₁,F₂,d₂`, so sánh hai moment, giải thích lợi về lực và đổi hướng lực. Không chấm “đã thao tác lực kế thật”.
- **Checkpoint D — ứng dụng:** một tình huống đơn giản đã review (ví dụ nâng vật bằng đòn bẩy), xác định điểm tựa/cánh tay đòn và giải thích lựa chọn. Bài toán thực tế giữ ranh giới mô hình lý tưởng, không suy diễn an toàn tải trọng thực.
- **Rubric đề xuất:** dự đoán và đối chiếu hiện tượng; đúng chiều quay/không quay; tính M kèm đơn vị; thiết lập và tính cân bằng; giải thích lợi về lực/đổi hướng; ứng dụng. Tolerance theo độ chia lực kế, khoảng cách lỗ, và quy tắc làm tròn phải được reviewer duyệt. Phản hồi riêng từng checkpoint; invalid state không tạo attempt.
- **Model:** thanh cứng, trục cố định, trọng lượng thanh và ma sát trục bỏ qua hoặc được khai báo trong config; lực vuông góc thanh ở v1, cánh tay đòn là khoảng cách từ trục tới **giá lực**. Net moment quyết định chiều quay và điều kiện cân bằng; chuyển động về góc dừng chỉ là presentation, không giả làm động lực học `Iα = τ`. Cấm lực/khoảng cách âm, lỗ ngoài thanh, tải quá lực kế, trạng thái không thể đạt cân bằng; version hóa schema/config và golden/invalid cases.

## 4. Kit và trải nghiệm hình ảnh

- Tái sử dụng `LabSpace`, `PhysicsStage`, `PhysicalLabEnvironment`, renderer toggle và host launch/draft/submit. K5 chỉ thêm giá đỡ, trục, thanh có vạch/lỗ, quả nặng/móc và lực kế cần cho activity; không dựng lại phòng và không kéo đồ K1/K2/K3 vào kit. Không coi README `physics/mechanics/` là bằng chứng đã có scene sản phẩm.
- 3D procedural hoặc asset có provenance: tỷ lệ dụng cụ nhất quán, trục/giá lực đọc được, vạch đo rõ ở góc camera, vật liệu/ánh sáng/bóng cùng phong cách các scene đã phát hành. Góc camera desktop và mobile không che điểm tựa/vạch; có cận cảnh lực kế và reset view. Thumbnail chỉ chụp từ scene thật sau khi scene sẵn sàng.
- Animation theo **state/observation đã chốt**: móc quả nặng vào lỗ hợp lệ, thanh nghiêng theo chiều net moment rồi dừng tại chặn; khi cân bằng, thanh về ngang và lực kế ổn định sau dao động tắt dần. Không tạo chuyển động ngẫu nhiên làm thay đổi số đo, không dùng tốc độ/góc quay để ám chỉ định luật động lực học ngoài model. `prefers-reduced-motion` hiện trạng thái cuối ngay.
- 2D SVG có đầy đủ vị trí lỗ, lực, cánh tay đòn, trạng thái cân bằng và điều khiển tương đương. Mọi kéo/thả 3D có nút DOM, bàn phím và chạm tương đương; 3D mất WebGL vẫn làm/nộp được bằng 2D. Sổ thí nghiệm giữ đơn vị và giá trị đọc rõ; lỗi nhập hiện cạnh trường; kết quả server là nguồn chấm chính thức.
- Kiểm tra parity 2D/3D trên cùng pinned tuple, 390×844 và desktop, keyboard only, reduced motion, focus, WCAG AA/44 px, thiết bị trường học đại diện, FPS/memory/chunk tải thực tế. Không tuyên bố “chân thật” từ ảnh tĩnh: review bằng video thao tác và quan sát trực tiếp trên thiết bị mục tiêu.

## 5. Trình tự triển khai và nghiệm thu

| Bước | Sản phẩm có thể review | Điều kiện đi tiếp |
|---|---|
| 0. Nguồn và quyết định | Bản đối chiếu B18/B19 với ảnh trang; artifact outcome chính thức; quyết định phạm vi B31, cách gọi loại đòn bẩy, công thức/giới hạn model; reviewer ký mapping và blueprint | Không viết lời giảng/rubric như sự thật đã duyệt trước bước này. |
| 1. Contract/model | Schemas state/evidence/output, model deterministic, config, golden/boundary/invalid fixtures, rubric server và registry | Case độc lập cho `F=0`, `d=0`, hai moment bằng/khác, đổi bên, quá giới hạn; không phá replay/release cũ. |
| 2. K5 và UI | Dụng cụ 3D, view/camera, animation, stage 2D, sổ thí nghiệm, copy vi/en, result; reuse host | Cùng thao tác và bằng chứng trong 2D/3D; không hardcode kết quả khoa học tại renderer. |
| 3. Tích hợp riêng | Pack/config/activity tuple fixture, launch → draft → submit → replay, idempotency, assignment pinning, quyền và trạng thái quarantine | Chỉ guarded scripts trên PostgreSQL loopback cô lập; không seed/migrate/backfill shared Supabase. |
| 4. QA và handoff | Browser FE→BE→isolated PG, visual review cạnh các Lab ACTIVE, accessibility/device/performance report, rights manifest, source/reviewer receipts | Đạt gate P3.5/P3.7 còn mở và cap track; không tự suy ra từ test hoặc ảnh. |
| 5. Release riêng | Freeze digest tuple, ADMIN `DEV_APPROVAL` cho draft mới, binding Lesson/Outcome đã review, kiểm tra app/schema deployed và readback | Activation/shared-data change là bước vận hành riêng; kế hoạch này không thực hiện. |

## 6. Câu hỏi/điểm chưa chốt

1. V1 có gồm `B31-O02` (hệ vận động) hay chỉ B18/B19? Mặc định đề xuất B18/B19 trước.
2. Reviewer nào đối chiếu artifact chương trình chính thức, nguồn B18/B19, công thức/mô hình/rubric và cách gọi hai/ba loại đòn bẩy? Cần biên bản với phiên bản và locator; owner chỉ đạo dạy/chấm công thức không thay cho bước review này.
3. Với Bài 19, dùng một ví dụ ứng dụng nào đủ rõ quyền dùng hình/asset và giới hạn lực? Chọn sau source/rights review.
4. Thiết bị trường học và ngưỡng hiệu năng nào dùng làm acceptance cho 3D? Báo số đo thực, giữ 2D tương đương.
5. Khi bắt đầu Build, kiểm tra lại số track đang chạy và trạng thái P3.5/P3.7. Nếu gate chưa đạt, chỉ làm technical candidate riêng tư, không tạo release/shared-data mutation.
