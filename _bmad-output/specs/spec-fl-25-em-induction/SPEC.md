---
id: SPEC-fl-25-em-induction
status: released
date: '2026-10-31'
branch: feat/fl-25-electromagnetic-induction (BE + FE)
companions:
  - lab-definition.md
  - implementation-plan.md
upstream:
  - ../spec-lab-pipeline/SPEC.md
  - ../spec-lab-pipeline/lab-pipeline-phase-plan.md
  - ../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md
  - ../spec-lab-pipeline/contract-v1.md
  - ../spec-foundational-lab-p3-1/lab-definition.md
---
# FL-25 — Cảm ứng điện từ & dòng điện xoay chiều (K1 Bàn Điện–Từ)

**Trạng thái:** prototype riêng tư đã build và kiểm chứng local (2026-10-31), chờ review; D-3 và QA trên máy trường còn mở. Đây không phải phê duyệt chương trình, khoa học hay release. Mọi outcome, model, rubric dưới đây là `PROPOSED_UNAPPROVED`.

Tài liệu gồm 3 phần:
- `SPEC.md` (file này): kết quả audit spec, các xung đột cổng (gate) và quyết định cần chủ sở hữu (owner).
- `lab-definition.md`: blueprint của Lab (model khoa học, activity, rubric, evidence, golden cases), theo mẫu blueprint Circuit bulb.
- `implementation-plan.md`: ticket, thứ tự, file sẽ chạm, thiết kế 3D/animation/UI chi tiết và cách kiểm chứng.

## 1. Audit spec Foundational Lab (commit 61bc330 → adaee7f)

Nguồn đã đọc: `spec-lab-pipeline/*` (SPEC, phase plan, catalog §1–§7 và §6A, portfolio 20 slot, contract-v1, data model, pipeline, Circuit readiness), `spec-foundational-lab-p3-1/lab-definition.md`, code BE (`packages/sim/index.ts`, `labs/application/{sim-packs,lab-run}.ts`) và FE (`features/labs/**`).

### 1.1 Những gì pilot Circuit (FL-01) đã thiết lập và FL-25 phải tuân theo

| Bất biến | Nguồn | Áp dụng cho FL-25 |
|---|---|---|
| Lab = một model khoa học có version, không phải một Lesson | SPEC.md, foundational-lab-track.md | Model riêng `em-induction@1.0.0`, không tái dùng `circuit*` |
| Model trả observation; activity rubric chấm riêng | contract-v1 §Ownership | Observation (có/không dòng, chiều) tách khỏi rubric dự đoán/giải thích |
| Server tính lại mọi thứ; FE preview chỉ tham khảo | contract-v1, AGENTS.md | Renderer 3D/2D không bao giờ quyết định kết quả |
| LabRun ghim tuple bất biến lúc launch; idempotency; draft IndexedDB không phải evidence | contract-v1 §Retention | Dùng nguyên `lab-run-host.ts`, không đổi contract |
| State không hợp lệ → lỗi validation, không tạo attempt | lab-definition Circuit §Rubric | Áp dụng nguyên |
| Renderer 2D/3D là view hoán đổi được; mặc định 3D chỉ khi cả hai đã có và tương đương; lựa chọn view lưu cục bộ, không vào attempt | catalog §6A.5 | FL-25 có cả 2D schematic và 3D |
| Không tải code/công thức từ pack; renderer nằm trong allowlist | contract-v1 §Shared host | Thêm một entry vào registry FE |
| Release cần OWNER_SIGNOFF thật trên digest chính xác | SPEC.md, data-model | Không nằm trong plan này |

### 1.2 Phát hiện (findings)

| # | Mức | Phát hiện | Bằng chứng | Hệ quả cho plan |
|---|---|---|---|---|
| A1 | **Chặn** | Cổng P3.5 **chưa đạt**. Phase plan ghi rõ: "Do not open a second Lab implementation track yet". P3.7 (mở rộng portfolio) chưa được phép. | lab-pipeline-phase-plan.md, snapshot 2026-10-30; circuit-finalization-readiness.md §Phase status | Triển khai FL-25 bây giờ là mở track Lab thứ hai trái cổng. Cần owner quyết định (D-1). |
| A2 | Cao | FL-25 là **W4, K9 cond.**, điểm 14/30, xếp cuối thứ tự ưu tiên. Ứng viên được đề xuất sau Circuit là FL-03 rồi FL-06. | catalog §4.1, §5; portfolio "Priority after Circuit" | Chọn FL-25 là lệch roadmap; cần ghi nhận lý do (D-1). |
| A3 | Cao | Catalog ghi FL-25 **"2D-first (3D optional sau QA)"**, nhưng cũng xếp FL-25 vào **Tier A Scene-first**. Yêu cầu hiện tại là 3D chân thực. | catalog §6, §6A.1, §6A.3 | Plan dựng 2D và 3D song song trên cùng state; 3D làm mặc định chỉ sau kiểm tra tương đương. Cần owner chấp nhận độ lệch (D-2). |
| A4 | Cao | Outcome `9/dien-tu/1` trong register **bị cắt cụt** ("…dòng điện luân – Tác dụng của dòng đi") và có vẻ đã gộp hai yêu cầu. Không thấy outcome riêng về **điều kiện xuất hiện dòng điện cảm ứng**. Provenance KHTN 9 vẫn `CONDITIONAL`; 33 dòng KHTN 9 trùng lặp chưa xử lý. | catalog Appendix dòng 520–521, §1 defect 4–5 | Activity bám vào hai ý: (1) điều kiện xuất hiện dòng cảm ứng, (2) nguyên tắc tạo dòng xoay chiều. Cần curriculum reviewer xác nhận văn bản đầy đủ (D-3). Plan không truy vấn được DB để lấy câu đầy đủ (bị chặn đọc `.env`). |
| A5 | Cao | Runtime BE **chưa tổng quát cho activity thứ hai**: `rubricRef` là `z.enum` chỉ có 2 giá trị; `rubricRefForActivity` và evidence schema là nhánh if-else riêng cho Circuit bulb; `sim-packs.ts:282` có ngoại lệ verdict riêng cho `circuit-bulb@1.0.0`; `evaluateCircuitBulbActivity` gọi trực tiếp. | `lab-run.ts:47-75,134`; `sim-packs.ts:38,282`; `assignment-lab-execution.ts:17` | Cần ticket nền tảng (FL25-T2) tách thành registry activity/rubric trước khi thêm FL-25. Đây là thay đổi shared runtime, thuộc integrator. |
| A6 | Trung bình | FE dispatch renderer dùng điều kiện cứng (`isBulb`, so sánh `rendererKey` từng chuỗi) trong `Lab.tsx`; registry `renderers` trong `lab-run-host.ts` là map tĩnh. | `Lab.tsx:218,232,332-341`; `lab-run-host.ts:25-30` | Thêm entry `em-induction` và nhánh dispatch; nên gom dispatch thành bảng (FL25-T5). |
| A7 | Trung bình | `PhysicsStage` cố định camera, target, khoảng zoom và chỉ có đèn của phòng, không có environment map, nên kim loại (đồng, chrome) sẽ trông phẳng. | `physics/shared/PhysicsStage.tsx` | Thêm prop tuỳ chọn (camera preset, environment), giữ nguyên mặc định cho Circuit. |
| A8 | Trung bình | Mẫu 3D Circuit có anti-pattern hiệu năng: tạo `new THREE.Color()` mỗi frame trong `useFrame`; `pointLight` có `castShadow` (6 lượt render shadow cube); `<Canvas shadows>` dạng boolean. | `CircuitBulb3DStage.tsx` LightBulb3D | FL-25 không sao chép các mẫu này (theo skill threejs-performance). Sửa Circuit không thuộc phạm vi. |
| A9 | Thấp | Panel câu hỏi Circuit dùng nhãn chữ hoa nối bằng dấu chấm giữa ("VẬT LÝ · KHÁM PHÁ MẠCH"). Hallmark Floor 9–10 cấm nhãn chữ hoa giãn chữ và chuỗi meta nối bằng dấu chấm giữa. | `CircuitBulbActivity.tsx` | Panel FL-25 không dùng mẫu này. |
| A10 | Thấp | Gói `@nexalab/sim` được vendor sang FE dưới dạng `vendor/nexalab-sim-1.1.0.tgz`; model mới cần bump version tarball. | FE `package.json`; AGENTS.md | Có trong FL25-T3. |
| A11 | Thông tin | Các skill three.js nhắm tới three r186 / R3F 9 / React 19. Repo đang dùng three 0.170 / R3F 8.18 / drei 9.122 / React 18. | FE `package.json` | Không nâng cấp thư viện trong track này. Chỉ áp dụng các hướng dẫn tương thích r170/R3F 8 (useFrame delta, `MathUtils.damp`, không cấp phát trong vòng lặp, dispose, instancing). |
| A12 | Thông tin | Circuit `lab-definition` ghi "No 3D asset is required for the MVP", nhưng FE đã có 3D procedural. Spec catalog §6A.6 đã cập nhật điều này. | lab-definition §Required assets; catalog §6A.6 | FL-25 dùng 100% hình học procedural, không GLB, không texture tải ngoài, nên không phát sinh vấn đề bản quyền asset. |

## 2. Quyết định cần owner (chặn hoặc định hướng)

| ID | Câu hỏi | Khuyến nghị |
|---|---|---|
| D-1 | Mở FL-25 khi P3.5 chưa đạt? | **ĐÃ QUYẾT 2026-10-31 (owner, trong phiên làm việc):** "Ghi nhận ngoại lệ, làm FL-25 song song dạng thử nghiệm". FL-25 là *private engineering prototype*: dữ liệu synthetic, không vào catalog học sinh, không release, không binding Lesson, không ghi vào DB dùng chung, không tính vào cap ≤ 2 track. Ngoại lệ này không làm P3.5 đạt và không thay thế OWNER_SIGNOFF của Circuit. |
| D-2 | 3D là view chính ngay từ đầu (lệch "2D-first")? | Dựng 2D và 3D từ cùng một state và cùng event; mặc định 3D chỉ sau khi kiểm tra tương đương (FL25-T9). Ghi độ lệch vào catalog sau khi owner đồng ý. |
| D-3 | Văn bản outcome KHTN 9 Điện từ đầy đủ và provenance | Curriculum reviewer đối chiếu Chương trình GDPT 2018 môn KHTN lớp 9 (chủ đề Điện từ) và SGK, sửa register (cắt cụt/gộp), rồi mới map. |
| D-4 | Phạm vi model: có mô phỏng ảnh hưởng tốc độ chuyển động lên độ lệch kim không? | **Không** trong v1 (catalog: "No Faraday numerics"). Biên độ kim cố định, định tính; ghi rõ trong giới hạn model. |
| D-5 | Rubric 5 tiêu chí, đạt = 5/5 (giống Circuit đạt = 3/3)? | Đồng ý tạm thời; reviewer có thể đổi. |

## 3. Phạm vi

**Trong phạm vi:** blueprint FL-25; model định tính `em-induction@1.0.0`; activity `em-induction-checkpoints@1`; tổng quát hoá registry activity BE; renderer 3D và 2D trong K1; test BE/FE trên DB cô lập và mock; đo hiệu năng trên thiết bị.

**Ngoài phạm vi:** release, OWNER_SIGNOFF, ghi vào Supabase dùng chung, binding Lesson, Class Lab builder, định luật Faraday định lượng, quy tắc Lenz phát biểu thành lời, máy biến áp, tác dụng của dòng xoay chiều (outcome `9/dien-tu/2` chỉ là hỗ trợ, có thể là phần đọc ngoài Lab), nâng cấp three/R3F/React.

## 4. Định nghĩa hoàn thành của plan này

Plan đạt khi: blueprint đủ để implementer bắt đầu FL25-T2/T3 mà không phải tự đoán; mọi quyết định mở được liệt kê kèm khuyến nghị; không có khẳng định nào về phê duyệt, release hay hiệu năng chưa đo.
