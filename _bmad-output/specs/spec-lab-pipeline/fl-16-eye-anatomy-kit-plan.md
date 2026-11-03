---
id: PLAN-FL-16-EYE-OPTICS
status: owner-approved-release-pending-activation
updated: 2026-11-02
companions:
  - lab-catalog-and-shared-kits-khtn8-9.md
  - lab-portfolio-20-slots-v1.md
  - lab-pipeline-phase-plan.md
  - fl-05-buoyancy-k3-plan.md
  - foundational-lab-track.md
---
# FL-16 Cấu tạo mắt và quang sinh học — Lab identity, rubric, phase gate và shared kit EX-A

> **PROPOSED / UNAPPROVED.** Owner đã quyết định 2026-11-01 chuyển FL-16 từ NO LAB/Explorer sang **LAB**. Quyết định này không phải signoff khoa học, curriculum hay release. Hằng số giải phẫu, mapping Outcome, phạm vi cận/viễn và rubric chưa được reviewer phê duyệt. Không có release, không có assignment, không có DB write.

## 0. Quyết định và phạm vi

- **Trạng thái catalog:** FL-16 đổi từ `NO LAB` sang `LAB` (đã cập nhật Table 1 và §6A.3 trong `lab-catalog-and-shared-kits-khtn8-9.md`). Lý do chính: code `Eye.tsx` đã có chấm điểm qua run-host, và §5 đã xếp W4.
- **Shared kit:** `EX-A — Giải phẫu & Quang sinh học`, tách hoàn toàn khỏi K3 (Bàn chất lỏng). Gồm FL-16 và FL-17 (DEFER, chưa triển khai). Tên `K-BIO` và `EX-A` là một kit; dùng `EX-A` trong code để tránh trùng số K1–K8.
- **Shared kit chia sẻ:** studio/lighting, camera rig với smooth focus vào callout, callout DOM (3D pin), mặt cắt dọc (sagittal clipping plane), mesh nhãn cầu procedural, và hình học/optics thuần. **Không** chia sẻ rubric, state khoa học, identity hay evidence.
- **Lab identity:** lab `eye-optics` (`labId: "eye-optics"`, tách khỏi Lab `eye` cũ, xem §8B), activity `eye-anatomy-optics` v1, model `eye-optics@1.0.0`, rubric `eye-anatomy-optics@1.0.0`, envelope `evidence`, renderer `eye-anatomy-optics`.
- **Giữ nguyên:** `eye@1.0.0` / activity `eye` và legacy challenge đang gắn bài học. Activity mới là **song song**, không thay thế released binding. Không đổi tuple đã phát hành.

## 1. Audit nền (tóm tắt)

| Bằng chứng | Kết luận |
|---|---|
| Catalog §5 (W4), §6A.3 (EX-A Explorer, NO LAB) | Mâu thuẫn đã được owner quyết định; catalog đã sửa cho khớp. |
| `Eye.tsx` + `runtime/activity-renderers.tsx` + `PracticalPathwayStep.tsx` | Eye đang chấm đúng/sai tên bộ phận (legacy `eye@1.0.0`, `minScore`). Giữ nguyên cho bài học; Lab mới là đường riêng. |
| `fl-05-buoyancy-k3-plan.md` ghi không thấy skill | **Sai**: `hallmark`, `threejs-skills`, `ui-ux-pro-max-skill` nằm trong `FE-NexaLab/.codex-skills/`. |
| `threejs-skills` nhắm r186 + R3F 9.8 | Repo dùng `three@^0.170`, `@react-three/fiber@^8.18`, `@react-three/drei@^9.122`. Code đã viết theo API của repo, không dùng API r186 (vd `Timer`, `HDRLoader`, `WebGPURenderer`). |
| FL-01 Circuit pilot | Mẫu: lab-evaluator registry, `checkpoints`/`evidence` envelope, rubric pin, release gate. Mẫu này được áp dụng; phần release chưa làm. |

## 2. Lab identity và scope khoa học

Phạm vi: cấu tạo mắt (phase 1) và đường truyền tia qua giác mạc–thể thủy tinh tới màng lưới, điều tiết và kính hiệu chỉnh (phase 2). Không bao gồm bệnh lý, thị lực đo được, chẩn đoán hay phẫu thuật.

**Outcome liên quan (đề xuất, chưa duyệt):** `B37-O04` (chính: kể tên bộ phận mắt và sơ đồ đơn giản thu nhận ánh sáng); `B31-O01` và `B30-O01` (hỗ trợ). **Cần reviewer:** cận/viễn thị và điều tiết không nằm rõ trong nội dung OCR của B37-O04. Phase 2 hiện mở rộng sang cận/viễn; nếu reviewer không chấp nhận, bỏ hai tình huống đó và giữ điều tiết cho mắt bình thường.

**Hằng số (software assumption, không phải dữ liệu đo):**

| Thông số | Giá trị | Ghi chú |
|---|---|---|
| Chiết suất dịch kính/thủy dịch | 1.336 | |
| Độ tụ giác mạc | 43 D | reduced eye |
| Thể thủy tinh | 16–26 D | độ tụ điều tiết, bước 0,25 D |
| Trục nhãn cầu bình thường / cận / viễn | 22,6 / 26,0 / 21,5 mm | |
| Công thức | P_req = n/L + 1/d (d = ∞ → 1/d = 0) | thin-element, bỏ khoảng cách đỉnh |
| Dung sai tiêu điểm | ±0,5 D | ≈ ±0,25 mm trên màng lưới ở thang hình |

## 3. Data model

**Evidence (`evidence` envelope)** — schema trong `packages/sim/eye-optics.ts`:

```text
{
  phase1: { labels: { [cornea|aqueous|pupil|lens|vitreous|retina|nerve|sclera]: string(≤100) } },
  phase2: [ 3 phần tử, mỗi scenarioId đúng một lần:
    { scenarioId: normal-near | myopia-far | hyperopia-near,
      objectDistanceM: number∈[0.1,6] | null (= vô cực),
      lensPowerD: number∈[16,26] bước 0,25,
      glassesPowerD: number∈[-10,10] bước 0,25 } ]
}
```

Local draft (FE) khôi phục theo từng trường; dữ liệu hỏng quay về mặc định. Server tính lại mọi thứ.

**Scenario (hằng số server, FE sao chép để hiển thị):** `normal-near` (trục 22,6 mm, vật 0,25 m), `myopia-far` (trục 26,0 mm, vô cực), `hyperopia-near` (trục 21,5 mm, vật 0,40 m).

## 4. Rubric `eye-anatomy-optics@1.0.0`

Tổng 11 tiêu chí, tách hai phase, chấm độc lập trên server:

| Phase | Tiêu chí | Điều kiện đạt |
|---|---|---|
| 1 Giải phẫu | `phase1:<partId>` × 8 | Tên khớp chính xác tên tiếng Việt của bộ phận (chuẩn hoá trim, lowercase vi, NFC) |
| 2 Quang sinh học | `phase2:<scenarioId>` × 3 | Đồng thời: (a) lệch tiêu điểm ≤ 0,5 D; (b) khoảng cách vật đúng ±0,02 m; (c) dấu kính đúng (cận: âm; viễn: dương; bình thường: |kính| ≤ 0,25 D); (d) với vật xa, thể thủy tinh thư giãn ≤ 16,5 D |

**Verdict:** `passed` = 11/11; `partial` = điểm ≥ 6; còn lại `not_passed` (chuẩn hoá thành `needs_practice`). Lý do ghi trong `unmetCriteria`.

**Phase gate:**
- Server: hai phase chấm song song, không khoá điểm.
- FE: phase 2 mở khi đủ 8 tên (`eyeOpticsEvidenceReady`), để học sinh nhớ bộ phận trước khi làm quang học.
- Renderer không chấm điểm; màn kết quả chỉ hiển thị `result` từ server.

**Test hiện có (BE, vitest):** 81 test pass trong `src/modules/labs/application/evaluators` và `packages/sim`, gồm: điểm tối đa, lỗi tiêu điểm + dấu kính, điều tiết khi nhìn xa, từ chối trùng scenario và bước lệch, verdict không có bằng chứng, công thức P_req. Registry test cập nhật rubric mới.

## 5. Kiểm chứng ray trace (FE, chỉ hiển thị)

`kit/optics.ts` vẽ đường tia bằng định luật Snell tại mặt cầu có độ tụ bằng tổng độ tụ đưa vào. Đã kiểm bằng script: tại công suất yêu cầu, tia chính và tia biên gặp nhau trên màng lưới trong **0,05 mm** cho cả ba tình huống; lệch ±0,5 D cho ±0,22–0,24 mm. Điểm dùng công thức (server); đường tia chỉ minh hoạ và phải khớp dấu.

## 6. UI/UX và accessibility

- Nút DOM cho mọi thao tác 3D: chọn bộ phận (danh sách 8 dòng có "Xem"), chọn tình huống, khoảng cách (select), điều tiết và kính (range), bật/tắt đường tia và mặt cắt. Không chỉ kéo thả.
- Callout 3D là `button` (keyboard); focus camera mượt bằng `FocusRig`, tắt animation khi `prefers-reduced-motion`.
- `frameloop="demand"`; yêu cầu render khi đổi camera, độ tụ, kính hoặc khoảng cách.
- Readout kết quả dùng `role="status" aria-live="polite"`, nói vị trí ảnh (trước/sau/đúng màng lưới) và vệt loang bằng mm.
- Token CSS, không `transition: all`, `:focus-visible` rõ, responsive ở 760 px, không cuộn ngang.
- Tiếng Việt chính, `defineText` vi/en; disclaimer minh hoạ luôn hiển thị.

## 7. Kỹ thuật 3D (realism bar)

- Hình học procedural bằng `LatheGeometry` từ profile mm: cornea cap R 7,8 mm, mở củng mạc tại 5,75 mm, sclera ellipsoid sau theo trục, lens ellipsoid thay đổi độ dày theo điều tiết, iris annulus có texture radial procedural (canvas, không tải file), retina và dịch kính sau, đĩa vàng, dây thần kinh.
- Vật liệu PBR: cornea `MeshPhysicalMaterial` `transmission 1`, `ior 1.376`, `thickness 0,52`, clearcoat; aqueous `ior 1.336`; lens `ior 1.42`; vitreous `ior 1.336`; sclera và retina opaque.
- Mặt cắt: `clippingPlanes` mặt phẳng z = 0, `DoubleSide`, camera đặt phía −z để thấy mặt cắt.
- Không tải GLB/HDR từ CDN; `Environment` preset bị bỏ để không phụ thuộc mạng.
- **Chưa đo**: FPS, số tam giác, chunk size và đối chiếu ảnh với hình giải phẫu tham chiếu. Chưa có reviewer chọn hình.

## 8. Ngân sách và tệp đã thay đổi

**BE (`BE-NexaLab`):**
- Mới: `packages/sim/eye-optics.ts`, `src/modules/labs/application/evaluators/eye-anatomy-optics.evaluator.ts`, `…/eye-anatomy-optics.evaluator.test.ts`.
- Sửa: `src/modules/labs/application/sim-packs.ts` (đăng ký `eye-optics@1.0.0`), `…/evaluators/registry.ts` (đăng ký rubric), `…/evaluators/registry.test.ts` (danh sách rubric).
- Không đổi controller, route, Prisma schema, migration hay seed.

**FE (`FE-NexaLab`):**
- Mới: `src/features/labs/biology/anatomy/kit/` (`optics.ts`, `eye-geometry.ts`, `EyeModel.tsx`, `AnatomyStage.tsx`), `…/eye-optics/` (`eye-optics-evidence.ts`, `EyeOpticsActivity.tsx`, `EyeOpticsResult.tsx`, `eye-optics.css`, `dev/EyeOpticsPreview.tsx`).
- Sửa: `src/features/labs/runtime/activity-renderers.tsx` (đăng ký renderer, giữ CRLF), `src/app/App.tsx` (route dev `/dev/lab-kits/eye-optics`, giữ CRLF).
- `Eye.tsx` không sửa (legacy resource vẫn chạy).

**Kiểm thử đã chạy:**
- BE: `npx tsc --noEmit` không có lỗi trong file mới; `vitest` 81 test pass (evaluator, registry, packages/sim).
- FE: `npx tsc --noEmit` không có lỗi trong `anatomy/`, `activity-renderers.tsx`, `App.tsx`. Lỗi còn lại trong `ecology/tolerance` đã có trước đó (gói `@nexalab/sim` tgz cũ, không liên quan).
- Preview `/dev/lab-kits/eye-optics`: trang render, canvas WebGL mount, không có lỗi console liên quan 3D. Điền 8 tên, mở phase 2, đổi tình huống và độ tụ đều cho readout đúng (0,25 m + 20 D → "đúng màng lưới"; 19,5 D → "sau màng lưới 0,2 mm").
- **Chưa kiểm**: ảnh chụp 3D (cửa sổ preview ẩn nên screenshot không chụp được), FPS/perf, Playwright e2e, chạy qua Lab run host với backend thật.

## 8A. Cập nhật 2026-11-02: parity, E2E, benchmark, portfolio

**Single source of truth.** Server `packages/sim/eye-optics.ts` là nguồn duy nhất. FE chưa import trực tiếp được: gói `@nexalab/sim` trong `FE-NexaLab/vendor/nexalab-sim-1.3.0.tgz` được đóng từ nhánh khác (đã có `ecologyTolerance` mà nhánh BE hiện tại không có), nên đóng lại tgz từ nhánh này sẽ làm mất export của FL-20. Thay vào đó:
- `FE-NexaLab/tests/constants-parity.spec.ts` (Playwright, chỉ chạy Node) import cả hai phía và so: chiết suất, độ tụ giác mạc, dung sai ±0,5 D, bước 0,25 D, khoảng thể thủy tinh và kính, 3 tình huống (id, trục, khoảng cách, loại tật), danh sách khoảng cách, tên 8 bộ phận, công thức P_req, schema chấp nhận draft mặc định, và đường tia hiển thị hội tụ đúng màng lưới tại công suất server yêu cầu. Bỏ qua có lý do nếu không có checkout BE bên cạnh.
- Đã thử đổi `VITREOUS_INDEX` và `FOCUS_TOLERANCE_D` ở FE: spec báo đỏ, sau đó hoàn lại.
- Readout FE giờ dùng cùng dung sai dioptre với rubric (`FOCUS_TOLERANCE_D`), nên "đúng màng lưới" trên màn hình trùng với tiêu chí server.
- Việc tiếp theo cho SSOT thật: khi hợp nhất nhánh FL-20, thêm `eye-optics.ts` vào `files` của `packages/sim`, tăng version, đóng tgz và cho FE import.

**E2E.** `FE-NexaLab/tests/eye-optics-lab.spec.ts` trên `/dev/lab-kits/eye-optics`: phase 2 bị khoá → điền 8 tên → mở phase 2 → đặt 3 tình huống (readout xác nhận ảnh trên màng lưới) → nộp → lấy đúng payload đã nộp, parse bằng schema server và chấm bằng `evaluateEyeOpticsActivity` thật (không mock) → `passed`, 11/11, phase1 8/8, phase2 3/3 → đưa kết quả về trang và kiểm "Em đã đạt tất cả tiêu chí." Kết quả: **pass** (7/7 cùng parity).
- Lưu ý môi trường: khi bật trace (`retain-on-failure` mặc định), Playwright trên máy này lỗi `ENOENT … .trace` lúc đóng context. Spec có sẵn `k3-kit-preview.spec.ts` cũng gặp lỗi này, nên không riêng FL-16. Chạy với `--trace=off` để xác nhận.

**Benchmark (Chromium headless, viewport mặc định 1280×720, DPR 1, phase 2, sau khi sửa):**

| Chỉ số | Giá trị | Ghi chú |
|---|---|---|
| Draw calls / frame | 28 | gồm lượt render transmission của three.js |
| Triangles / frame | 61 288 | gồm lượt transmission; dưới ngân sách tham chiếu 80k |
| Vertices (mesh hiển thị) | 14 117 | 14 mesh |
| Geometries trên GPU | 13 | không tăng khi đổi độ tụ (trước sửa: tăng mỗi lần đổi) |
| Textures / programs | 2 / 19 | |
| Frame khi đứng yên 1,5 s | **0** | `frameloop="demand"` ngắt render loop thật |
| Frame sau một lần kéo thanh trượt | +1 | chỉ render khi có thay đổi |

Trước khi tối ưu: 133 648 triangles và 21→22 geometries mỗi lần đổi độ tụ (rò GPU). Đã sửa: lathe 64 đoạn quay × 32 điểm profile, và giải phóng geometry cũ khi profile đổi.
- **Chưa đo**: FPS trên thiết bị học sinh thật, bộ nhớ GPU thực, thời gian tải chunk.

**Hình 3D (ảnh chụp headless).** Đã chỉnh sau khi xem ảnh: trục quang nằm ngang, camera gần hơn, camera về giữa nhãn cầu khi mở phase 2, chùm 3 tia nhìn rõ (tia hiển thị dùng Snell gần trục, hội tụ đúng điểm ảnh của công thức; readout vẫn dùng trace Snell chính xác ở 0,5 mm).

**Portfolio.** FL-16 ghi là **Showcase Pilot (Kit EX-A)** trong catalog (Table 1, §6A.3, §6A.6), ngoài 20 core slot, chờ SME và owner ký.

**SME.** Checklist ở [fl-16-sme-review-checklist.md](fl-16-sme-review-checklist.md). Có một vấn đề nhất quán cần SME chọn: phase 1 dùng "Võng mạc", readout phase 2 dùng "màng lưới".

## 8B. Cập nhật 2026-11-02 (chốt code, seed)

- **Lab riêng `eye-optics`.** Nền tảng chọn config/pack theo `labId` + `status: "active"`. Nếu gắn `eye-optics@1.0.0` vào Lab `eye`, launch của bài `eye@1.0.0` cũ sẽ bị đổi. Vì vậy FL-16 có Lab id `eye-optics` (model, renderer, catalog FE đều đổi theo); Lab `eye` và dữ liệu cũ không bị đọc hay ghi.
- **Alias màng lưới.** `isAcceptedPartName`: `retina` nhận "Võng mạc" và "Màng lưới", bỏ qua hoa thường và dấu; các bộ phận khác giữ quy tắc cũ. Nhãn UI "Màng lưới (Võng mạc)". Parity test so cả danh sách alias.
- **Cận nhẹ.** Trục 23,4 mm; với thể thủy tinh thư giãn 16 D, kính đạt từ −1,50 đến −2,25 D (−2,50 D đạt khi thể thủy tinh 16,25–16,5 D). Test khoá đúng khoảng này.
- **Sửa lộ đáp án.** Phase 1 trước đây hiện "Đang xem: Giác mạc" (lộ tên). Nay hiện "Đang xem: bộ phận N".
- **Model observation-only.** `eye-optics@1.0.0` khai báo observation-only giống `density-bench`; golden case cấu hình kiểm trạng thái hợp lệ, verdict rubric nằm ở `Lab.config.rubricGoldenCases` và được test.
- **Seed.** `scripts/seed-fl16-eye-optics-shared.ts` + `src/modules/labs/interface/eye-optics-tuple.seed.ts`: chỉ tạo mới (upsert, `update: {}`), cần token `FL16_SHARED_WRITE_APPROVED`, có `--dry-run`. Activity spec và pack template qua đúng validator strict của luồng release (có test). Không tạo LabRelease, không ghi OWNER_SIGNOFF, không gắn lesson.
- **Gắn bài học.** Gắn Lab vào lesson đi qua `FoundationalCourseLesson.foundationalLabId` và chỉ hợp lệ sau release có OWNER_SIGNOFF thật (luồng duyệt release trong Admin). Seed không ghi thẳng binding để không vượt cổng release.

## 8C. Bàn giao 2026-11-02 — commit, test, seed thủ công

**Commit (nhánh `feat/fl16-eye-optics`, đã push):**

| Repo | Commit | Nội dung |
|---|---|---|
| BE | `dba9021` | model `eye-optics@1.0.0`, rubric `eye-anatomy-optics@1.0.0`, registry, seed tuple + script, test, catalog/plan/checklist SME |
| BE | (commit tài liệu này) | cập nhật §8C |
| FE | `4ff9e6f` | kit EX-A, activity/result, renderer, dev preview, catalog Lab `eye-optics`, parity + E2E spec |
| FE | `581a585` | đánh dấu tiêu điểm thật (điểm đỏ) khi ảnh không rơi trên màng lưới |

Thay đổi FL-03/K3 chưa commit của người khác vẫn nằm nguyên trên working tree, không nằm trong các commit này.

**Kiểm thử tại thời điểm bàn giao:**
- BE `npx vitest run`: 343/343 pass (11 test integration skip vì không có DB cô lập). `npm run build` pass.
- FE `npm run build` (tsc -b + vite) pass; chunk FL-16 12 kB (gzip 5 kB), dev preview không vào bản production.
- Parity `tests/constants-parity.spec.ts`: 7/7 pass.
- E2E `tests/eye-optics-lab.spec.ts`: pass; rubric server chấm 11/11. Chạy với `--trace=off` (lỗi trace Playwright của máy dev, cũng gặp ở `k3-kit-preview`).

**Seed thủ công cho admin (Supabase chung).** Agent không ghi vào DB chung; admin tự chạy từ máy có `.env` trỏ tới DB đích:

```bash
cd BE-NexaLab
git switch feat/fl16-eye-optics
# 1. Chỉ đọc: kiểm admin, lớp class-pilot-a, học sinh student-active, outcome KHTN8-B37-O04, và record FL-16 đã có hay chưa
npx tsx scripts/seed-fl16-eye-optics-shared.ts --dry-run
# 2. Ghi (chỉ tạo mới; chạy lại không đổi gì)
FL16_SHARED_WRITE_APPROVED=owner-approved-fl16-shared-2026-11-02 npx tsx scripts/seed-fl16-eye-optics-shared.ts
```

Record được tạo: Lab `eye-optics` (CLASS_PRIVATE, releaseCleared=false, config có kitId EX-A), challenge `eye_optics_001`, activity `eye-anatomy-optics` v1, config v1 (active), pack `eye-optics-ex-a` v1 (active), 1 assignment cho `student-active` ở `class-pilot-a`. Không tạo LabRelease, không ghi OWNER_SIGNOFF, không gắn lesson; Lab `eye` cũ không bị chạm. Script in JSON chứa id các record để đối chiếu.

**Cổng còn lại:** SME trả lời checklist; owner duyệt release qua Admin (OWNER_SIGNOFF thật); sau đó mới gắn lesson. Phase plan vẫn ghi P3.5 chưa đạt.

## 8D. Owner sign-off và seed (2026-11-03)

**Quyết định owner.** Owner phê duyệt release FL-16 trong phiên làm việc ngày 2026-11-03, trên BE `dba9021` (tài liệu bàn giao `7a4c1a1`) và FE `814b158`. Kết quả test tại thời điểm duyệt: BE 343/343, parity 7/7, E2E được rubric server chấm 11/11. Checklist SME **chưa** được ký; owner duyệt dựa trên thẩm quyền owner, và bằng chứng sign-off ghi rõ điều này.

**Seed đã chạy trên DB chung** (chạy từ worktree sạch của `7a4c1a1`, token owner, chỉ tạo mới):

| Record | Id |
|---|---|
| Lab | `eye-optics` (CLASS_PRIVATE, releaseCleared=false, kit EX-A) |
| Challenge | `eye_optics_001` |
| Activity `eye-anatomy-optics` v1 | `cmw0b94ie0000nmfo8xs52oqx` |
| Config v1 (active, `eye-optics@1.0.0`) | `cmw0b94sr0001nmfo68803ssk` |
| Pack `eye-optics-ex-a` v1 (active) | `cmw0b95390002nmfojgxk7f6u` |
| Assignment (class-pilot-a → student-active) | `cmw0b95jl0004nmfo90hv385t` |

Kiểm tra chỉ đọc sau seed: launch chọn config v1 + pack `eye-optics-ex-a` → rubric `eye-anatomy-optics@1.0.0` → renderer `eye-anatomy-optics`; Lab `eye` cũ không có config nào bị thêm; 0 LabRelease, 0 binding.

**Kích hoạt release (owner tự chạy).** OWNER_SIGNOFF trong nền tảng ghi lại tài khoản ADMIN đã đăng nhập, nên phải do owner thực hiện bằng tài khoản của mình. Màn Admin "Duyệt phát hành Lab" hiện không dùng được cho release này: giao diện chỉ hiện nút duyệt cho policy `DEV_APPROVAL_V1` và gửi `{developerCheck, agentCheck}`, còn BE yêu cầu `OWNER_SIGNOFF_V1` với 6 trường bằng chứng; giao diện cũng không có nút tạo bản nháp. Vì vậy dùng script gọi đúng API:

```bash
cd BE-NexaLab
export NEXALAB_API=<url API>/api NEXALAB_ADMIN_EMAIL=<email admin của owner> NEXALAB_ADMIN_PASSWORD=<mật khẩu>
node scripts/release-fl16-eye-optics.mjs draft      # tạo bản nháp, gắn bài học, in digest
node scripts/release-fl16-eye-optics.mjs publish <releaseId> <digest>   # OWNER_SIGNOFF + kích hoạt
```

**Gắn bài học.** Bản nháp gắn trực tiếp (DIRECT_LESSON) bài "Hệ thần kinh và các giác quan ở người" (`pack-structured-224cf04f147bbd206755a21b6189dda45903460d-v1`, topic `KHTN8-L37`, pack đã released, có outcome `KHTN8-B37-O04`). Kiểm tra chỉ đọc ngày 2026-11-03 cho thấy điều kiện tạo bản nháp đã đủ. Không ghi tay `foundationalLabId`: luồng release hiện tại dùng binding trực tiếp trong snapshot.

Khi `publish` chạy xong, đổi `status` của tài liệu này sang `released-owner-approved` và ghi id release, digest.

## 9. Phase gates và việc còn lại

| Gate | Việc | Trạng thái |
|---|---|---|
| G0 Quyết định | Owner chọn LAB (2026-11-01) | Xong |
| G1 Nội dung | Reviewer sinh học xác nhận hằng số §2, thuật ngữ, phạm vi cận/viễn, nguồn hình | **Chờ** |
| G2 Portfolio | Tạm ghi Showcase Pilot (Kit EX-A), ngoài 20 core slot; reviewer chọn slot sau signoff | Tạm xong, chờ signoff |
| G3 Kit | Dev gallery và QA 3D: ảnh, FPS, chunk, WebGL fallback, bàn phím, mobile | Một phần: parity + E2E pass, draw calls/triangles/demand loop đã đo; FPS thiết bị thật, chunk, WebGL fallback, mobile chưa đo |
| G4 Release | DB seed, release lifecycle, owner signoff digest, binding lesson, assignment | **Chưa làm** |
| G5 Phase gate P3.5 | Pipeline chưa đạt P3.5; theo `lab-pipeline-phase-plan.md` không mở track Lab mới khi gate đóng | **Chặn** |

**Lưu ý G5:** Phase plan hiện ghi P3.5 NOT MET. Việc viết code và test không vi phạm gate, nhưng release và gán bài cần đợi gate hoặc ngoại lệ văn bản của owner.

## 10. Câu hỏi mở

1. Chấp nhận phạm vi cận/viễn ở phase 2 hay chỉ điều tiết mắt bình thường?
2. Slot portfolio cho FL-16 (thay slot nào, hay mở slot 21)?
3. Eye legacy (`eye@1.0.0`) có giữ song song hay chuyển toàn bộ sang Lab mới?
4. Nguồn hình giải phẫu tham chiếu và người duyệt thuật ngữ?

## 11. Rủi ro

- Đường tia và dung sai dùng hằng số đơn giản hoá; reviewer có thể đổi, cần cập nhật BE và FE cùng lúc. Hai nơi sao chép hằng số (`packages/sim/eye-optics.ts` và `kit/optics.ts`), không có test parity tự động giữa chúng.
- Hình 3D đẹp có thể bị hiểu là đã được khoa học duyệt → disclaimer và trạng thái PROPOSED trên mọi màn.
- Lệch phiên bản skill (r186) với repo (three 0.170) → mọi mẫu code đã kiểm theo API của repo.
