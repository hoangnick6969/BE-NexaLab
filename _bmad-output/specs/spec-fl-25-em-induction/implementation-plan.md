# FL-25 implementation plan

Nhánh: `feat/fl-25-electromagnetic-induction` ở cả BE-NexaLab và FE-NexaLab (tạo từ `main` ngày 2026-10-31: BE `adaee7f`, FE `0d63fb8`).

**Điều kiện bắt đầu build:** owner quyết định SPEC D-1. Trước đó chỉ làm FL25-T1. Mọi dữ liệu dùng trong test là synthetic, nằm trong PostgreSQL cô lập, gắn nhãn TEST FIXTURE ONLY; không ghi vào Supabase dùng chung.

## 1. Ticket và thứ tự

| Ticket | Nội dung | Repo / owner | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FL25-T0 | Owner chốt D-1…D-5; curriculum reviewer xử lý D-3 | Owner, curriculum | — | D-1 đã quyết (2026-10-31); D-3 còn mở |
| FL25-T1 | Blueprint (`lab-definition.md`) được review; sửa theo góp ý | Docs | T0 (một phần) | review (STILL đổi sang OUTSIDE) |
| FL25-T2 | Tổng quát hoá registry activity/rubric ở BE, không đổi hành vi Circuit | BE, integrator | T0 | done (unit + route manifest) |
| FL25-T3 | Model `em-induction@1.0.0` + golden tests; bump `@nexalab/sim` 1.2.0 và vendor sang FE | BE (sim) | T1 | done |
| FL25-T4 | Evaluator activity, đăng ký model/pack/config, test integration cô lập | BE | T2, T3 | done (chạy trên PostgreSQL cô lập dùng một lần) |
| FL25-T5 | FE: registry renderer + dispatch dạng bảng; `PhysicsStage` thêm prop tuỳ chọn | FE, integrator | T3 | done |
| FL25-T6 | FE: bộ apparatus 3D procedural | FE | T5 | done (prototype) |
| FL25-T7 | FE: biên đạo animation, reduced-motion, hiệu năng | FE | T6 | done (đo ở T10) |
| FL25-T8 | FE: panel activity + view 2D schematic + accessibility | FE | T5 | done (có chế độ khám phá tự do, mở sau 4 checkpoint) |
| FL25-T9 | Test Playwright (mock) + 1 lượt thật FE→BE→DB cô lập; kiểm tra tương đương 2D/3D | FE + BE | T4, T7, T8 | done (mock 5/5; real stack 1/1, attempt + LabRun xác nhận trong DB) |
| FL25-T10 | QA thiết bị: đo hiệu năng, a11y, checklist độ chân thực | QA | T9 | in-progress (đo trên M1 Pro + CPU throttle; còn máy trường, screen reader, giải phóng bộ nhớ GPU) |
| FL25-T11 | Gói ứng viên release (candidate JSON, digest) | Owner | P3.6 gate + T10 | blocked |

T3 và T8 có thể chạy song song với T2. T6 và T8 song song sau T5.

## 2. BE

### FL25-T2 — registry activity/rubric (shared runtime)

Hiện trạng: `lab-run.ts` dùng `z.enum(["legacy-challenge@1.0.0", CIRCUIT_BULB_RUBRIC])`, `rubricRefForActivity` và schema evidence rẽ nhánh riêng cho Circuit bulb; `sim-packs.ts:282` có ngoại lệ verdict; `assignment-lab-execution.ts:17` kiểm tra `circuit-bulb@1.0.0`.

Việc cần làm:
1. Tạo `ACTIVITY_REGISTRY` (file mới `src/modules/labs/application/activity-registry.ts`): mỗi entry gồm `activityKey`, `version`, `modelRef`, `rubricRef`, `evidenceSchema` (Zod), `evaluate(checkpoints, explanation)`.
2. Đăng ký Circuit bulb vào registry bằng chính code hiện tại. `rubricRef` được kiểm bằng registry thay cho enum; tuple cũ vẫn parse được.
3. Thay ngoại lệ ở `sim-packs.ts:282` và `assignment-lab-execution.ts:17` bằng tra registry ("model này có activity checkpoint không").
4. Không đổi route; chạy `npx tsx scripts/route-manifest.ts src` trước và sau, kết quả phải giống hệt.
5. Test hồi quy: toàn bộ test Circuit bulb hiện có (unit + integration) pass không sửa kỳ vọng.

### FL25-T3 — model

- `packages/sim/index.ts`: `emInductionSchema` (Zod strict, discriminated union theo `setup`) và `emInduction(raw)` theo đúng quy tắc §3 của blueprint; export trong `VERSION`.
- `packages/sim/sim.test.ts`: EM-01…EM-11, EM-X1…X3.
- Bump version gói lên 1.2.0, đóng tarball, thay `FE-NexaLab/vendor/nexalab-sim-1.1.0.tgz` bằng `nexalab-sim-1.2.0.tgz` và cập nhật `package.json` FE (theo AGENTS.md: "version its tarball when syncing it to the frontend").

### FL25-T4 — activity, đăng ký và integration

- `sim-packs.ts`: thêm `"em-induction@1.0.0"` vào `MODEL_REGISTRY` (`labId: "em-induction"`, outputs, `requiredSemanticIds: ["coil", "magnet", "galvanometer", "led-pair", "generator"]`).
- Registry activity: entry `em-induction-checkpoints` v1, evaluator theo §5 blueprint.
- `simulation-versions.ts`: nhánh validate pack/config cho model mới (golden cases của pack = EM-01…EM-11).
- Fixture Lab `em-induction` chỉ được tạo trong test integration cô lập (không seed vào `prisma/seed.ts`, không chạm DB dùng chung).
- `src/modules/labs/interface/em-induction.integration.test.ts` (mẫu theo `circuit-bulb.integration.test.ts`): launch → submit đúng → PASS 5/5, lưu attempt và replay ra cùng observation; một dự đoán sai → NEEDS_PRACTICE; state lệch checkpoint → 400 và không có attempt; trùng idempotency key; đổi tuple sau khi launch vẫn chấm theo tuple cũ.
- Lệnh: `npm run lint`, `npm test`, `npm run build`, `npm run test:integration` với `NEXALAB_ISOLATED_DATABASE_URL` trỏ loopback.

## 3. FE

### FL25-T5 — tích hợp runtime

- `runtime/lab-run-host.ts`: thêm `"em-induction": { labId: "em-induction", modelRefs: ["em-induction@1.0.0"] }`.
- `Lab.tsx`: thay chuỗi điều kiện `isBulb`/so sánh `rendererKey` bằng bảng `rendererKey → { Component, defaultEvidence, evidenceReady }`. Circuit giữ nguyên hành vi (test `circuit-lab.spec.ts`, `lab-run-host.spec.ts` phải pass không sửa).
- `physics/shared/PhysicsStage.tsx`: thêm prop tuỳ chọn `view?: { position; target; minDistance; maxDistance }` và `environment?: boolean`. Không truyền thì giữ đúng giá trị hiện tại cho Circuit.

### Cấu trúc file mới

```text
src/features/labs/physics/electricity/induction/
  EmInductionActivity.tsx      panel, phase machine, evidence, chọn view
  EmInductionActivity.css
  EmInduction3DStage.tsx       ghép apparatus vào PhysicsStage
  EmInduction2DView.tsx        sơ đồ SVG tương đương
  apparatus/
    Coil3D.tsx                 cuộn dây trên ống nhựa, 2 cọc đấu dây
    BarMagnet3D.tsx            nam châm thẳng N/S, trượt trên ray
    Galvanometer3D.tsx         điện kế 0 ở giữa, kim có giảm chấn
    LedPair3D.tsx              2 LED mắc song song ngược chiều
    Generator3D.tsx            nam châm quay trong lòng cuộn dây + tay quay
    FieldLines3D.tsx           đường sức từ minh hoạ (tính một lần)
    CurrentFlow3D.tsx          mũi tên chiều dòng điện chạy dọc dây (instanced)
    Leads3D.tsx                dây nối (dùng lại Wire từ CircuitBulb3DStage)
  choreography.ts              trạng thái hoạt cảnh → mục tiêu tween, hằng thời gian
  dial-texture.ts              vẽ mặt điện kế lên CanvasTexture một lần
```

`physics/electricity/README.md` và `features/labs/README.md` cập nhật dòng FL-25 từ "reserved" sang "private prototype" (chỉ khi D-1 cho phép).

### FL25-T6 — apparatus 3D (độ chân thực)

Quy ước tỉ lệ: 1 đơn vị = 10 cm, đặt trên mặt bàn chung của `LabRoomEnvironment` (mặt bàn y ≈ 0.02), cụm thiết bị trong khoảng x ∈ [−1.6, 1.6] như Circuit.

| Thiết bị | Hình học | Vật liệu | Chi tiết chân thực |
|---|---|---|---|
| Cuộn dây | Ống nhựa trong (cylinder r 0.30, dài 0.9) + dây quấn là **một** `TubeGeometry` chạy theo đường xoắn ốc (~28 vòng, 2 lớp, r dây 0.012) | Đồng tráng men: `meshPhysicalMaterial` màu ~#b8642f, metalness 1, roughness 0.3, clearcoat 0.6 | Mép bích hai đầu ống, hai cọc đấu dây bằng đồng thau có đai ốc; đầu dây men đi ra cọc |
| Nam châm thẳng | Hộp bo cạnh 1.2 × 0.22 × 0.22 | Thép sơn: nửa N đỏ, nửa S xanh, roughness 0.45 | Chữ N/S dập nổi (CanvasTexture hoặc decal, không phụ thuộc font CDN); đặt trên ray trượt có vạch |
| Điện kế 0 ở giữa | Vỏ hộp 0.7 × 0.55 × 0.25, mặt số cong nhẹ | Vỏ nhựa đen nhám; mặt số `CanvasTexture` vẽ một lần (vạch chia, số 0 ở giữa, chữ G); kính phủ bằng opacity (không dùng `transmission`) | Kim mảnh có đối trọng, ốc chỉnh 0, hai cọc đấu dây |
| Cặp LED | 2 LED 5 mm trên đế nhỏ, mắc song song ngược chiều; nhãn "A" và "B" | Vỏ epoxy hơi đục; phát sáng bằng `emissive` + sprite quầng sáng blending cộng | Không dùng `pointLight` có bóng cho LED |
| Máy phát mô hình | Nam châm quay trên trục vuông góc với trục cuộn dây; tay quay có núm | Trục thép, ổ đỡ đồng thau | Bánh răng hoặc puli đơn giản cho cảm giác cơ khí |
| Dây nối | Dùng lại `Wire` (Bezier có độ võng) | Như Circuit | Màu đỏ/đen, đầu cắm banana |
| Đường sức từ (bật/tắt) | Truy vết ~20 đường của hai "cực" ở hai đầu nam châm (RK4, tính **một lần** trong hệ toạ độ của nam châm), gộp thành một `LineSegments2` (drei `<Segments>`/`Line` nét đứt) gắn làm con của nam châm | `LineMaterial` nét đứt; tăng `dashOffset` thể hiện hướng N → S (`LineDashedMaterial` lõi không có `dashOffset`) | Đoạn nằm trong tiết diện cuộn dây được tô sáng (kiểm tra trong shader hoặc theo đoạn); có nhãn "minh hoạ" |
| Chiều dòng điện | ~24 mũi tên nhỏ trong **một** `InstancedMesh`, chạy dọc dây quấn và dây nối | Unlit, màu trung tính | Chỉ hiện khi có dòng; chiều theo D1/D2 |

Ánh sáng: giữ đèn của phòng; thêm `<Environment resolution={64}>` với 2–3 `Lightformer` (không tải HDR từ mạng) để đồng và đồng thau có phản xạ thật. Đổ bóng: một `directionalLight` với khung shadow camera bó sát cụm thiết bị, `shadow-mapSize` 1024.

### FL25-T7 — biên đạo animation

Nguyên tắc: state khoa học thay đổi theo bước rời rạc (đúng như evidence); animation chỉ là cách trình bày chuyển giữa các bước. Renderer nhận `observation` từ preview `@nexalab/sim` (tham khảo) và không tự suy luận vật lý.

| Hành động | Hoạt cảnh (thời lượng đề xuất, đo lại khi thử) | Ánh xạ từ observation |
|---|---|---|
| Giữ yên | Nam châm đứng yên ngay ngoài miệng cuộn dây, cực N hướng vào; kim ở 0; LED tắt | ABSENT → kim 0 |
| Đẩy vào | Nam châm trượt ra → vào trong ~0.9 s (ease in-out); trong lúc trượt kim lệch sang phải (D1) có giảm chấn, LED A sáng, mũi tên chạy; dừng lại thì kim dao động tắt dần về 0 | PRESENT + D1 trong lúc chuyển động |
| Kéo ra | Ngược lại; kim lệch trái (D2), LED B sáng | PRESENT + D2 |
| Quay 1 vòng | Tay quay quay 360° trong ~2.4 s; kim dao động trái–phải đồng bộ với 8 mẫu pha; LED A và B sáng luân phiên; trên HUD (DOM/SVG, ngoài canvas) vẽ dần đường cong dấu của dòng theo góc, ghi rõ "dạng minh hoạ, không phải số đo" | `phaseDirections` |

Kỹ thuật (theo skill threejs-animation, threejs-react-three-fiber, threejs-performance):
- Mọi chuyển động trong `useFrame((_, delta) => …)`, dùng `THREE.MathUtils.damp`/lò xo giảm chấn tới hạn cho kim; không `setState` trong `useFrame`; ref để thay đổi object.
- Không cấp phát trong vòng lặp: `Color`, `Vector3`, `Matrix4` tạo một lần ngoài vòng lặp (khác mẫu `LightBulb3D` hiện tại).
- Hình học tạo một lần (`useMemo`), dispose khi unmount; đường sức từ và đường xoắn không tính lại mỗi frame.
- Chuỗi nhiều bước dùng máy trạng thái nhỏ trong `choreography.ts` (pha, thời điểm bắt đầu, thời lượng); không thêm GSAP. Nếu cần tween DOM thì dùng `motion` đã có trong `package.json`.
- `prefers-reduced-motion`: theo dõi bằng `matchMedia(...).addEventListener("change")` (không đọc một lần). Khi bật: không chạy dash đường sức, không chạy mũi tên; nam châm nhảy thẳng tới vị trí cuối; kim hiện ở vị trí lệch tĩnh kèm chữ "trong lúc nam châm chuyển động" trong ~1.5 s rồi về 0; máy phát hiện 8 khung tĩnh có thể bấm qua từng khung.
- Tương tác trực tiếp: kéo nam châm dọc ray bằng pointer capture (chạm và chuột), ràng buộc một trục. Kéo chỉ dùng ở chế độ khám phá; checkpoint được ghi bằng hành động rời rạc để evidence luôn khớp state hợp lệ.
- Camera: preset riêng cho FL-25 qua prop của `PhysicsStage`; khoá pan; giới hạn góc như Circuit; có nút "Đặt lại góc nhìn".

### FL25-T8 — panel, 2D và accessibility

- Phase machine giống `CircuitBulbActivity`: dự đoán → thao tác → quan sát → … → giải thích → sẵn sàng nộp. Bước hiện tại hiển thị dạng "Bước 3/9".
- Nút DOM cho mọi hành động: "Quan sát khi giữ yên", "Đẩy nam châm vào", "Kéo nam châm ra", "Quay tay quay một vòng", "Hiện/ẩn đường sức từ", "Đặt lại góc nhìn". Chỉ nút của bước hiện tại được bật.
- Kết quả quan sát là văn bản + icon trong `aria-live`, ví dụ "Kim điện kế lệch sang phải. Đèn LED A sáng." và "Không có dòng điện: kim đứng ở vạch 0."
- View 2D (`EmInduction2DView.tsx`): SVG cuộn dây, nam châm (N/S có chữ), ký hiệu điện kế, 2 LED, mũi tên chiều dòng; cùng props, cùng nút. Đây vừa là view thay thế vừa là fallback khi WebGL lỗi.
- Hallmark Floor áp dụng cho CSS của panel (scope: app screen, giữ hệ thiết kế Lab Space hiện có thay vì "deal" theme mới): mọi màu/font qua token; không `transition: all`, chỉ animate `transform`/`opacity`; `:focus-visible` cho mọi control; có fallback reduced-motion; không nhãn chữ hoa giãn chữ, không chuỗi meta nối bằng dấu chấm giữa, không chấm trạng thái trang trí; không emoji làm icon (dùng `lucide-react`). Chạy `node ~/.claude/skills/hallmark/scripts/sloplint.mjs <css/tsx> --scope app` trước khi bàn giao.
- ui-ux-pro-max: vùng chạm ≥ 44×44 px; tương phản ≥ 4.5:1; không phụ thuộc hover; tối đa 1–2 phần tử chuyển động gây chú ý cùng lúc; không cuộn ngang ở 360/390/768/1366 px.
- Copy song ngữ qua `defineText` (vi chính, en phụ). Ghi chú giới hạn model luôn hiển thị.

## 4. Kiểm chứng

### FL25-T9

- BE: các lệnh ở T4, kèm route manifest không đổi.
- FE: `npm run lint`, `npm run build`; spec mới `tests/em-induction-lab.spec.ts` (API mock, theo mẫu `lab-run-host.spec.ts`): đi hết 9 bước bằng bàn phím; F5 khôi phục draft; nộp gửi đúng evidence JSON; hiển thị kết quả server; WebGL lỗi thì vẫn làm được ở 2D.
- Tương đương 2D/3D: cùng một chuỗi thao tác cho ra cùng evidence payload byte-for-byte; đổi view giữa chừng không mất trạng thái.
- Một lượt thật trên trình duyệt: FE → BE → PostgreSQL cô lập, attempt PASS 5/5 lưu cùng run/tuple; ghi rõ đây là Chromium desktop, không phải thiết bị đại diện.

### FL25-T10 — đo, không suy diễn

| Chỉ số | Cách đo | Ngưỡng đề xuất (chỉ để thảo luận, phải đo trên máy mục tiêu) |
|---|---|---|
| Draw calls, triangles | `renderer.info.render` sau `render()` | ≤ 120 calls, ≤ 150k triangles |
| Frame time | Trung bình theo giây trong lúc quay máy phát | ổn định ở tần số màn hình trên Chromebook/Celeron mục tiêu |
| Bộ nhớ GPU | `renderer.info.memory`, trước và sau khi rời Lab | trở về mức ban đầu (dispose đủ) |
| Thời gian đến tương tác | Lần tải lạnh và ấm | ghi baseline thực tế |
| Mất context WebGL | Giả lập `webglcontextlost` | rơi về 2D, giữ evidence |

Kết quả đo 2026-10-31 (Apple M1 Pro, Chrome, không phải máy trường; chi tiết trong implementation record): khung hình ổn định 16,7 ms kể cả khi CPU chậm 4×/6×; 250 draw call/khung hình trên desktop (pass chính 201, bóng 49), 174 trên điện thoại; vượt ngưỡng thảo luận 120 chủ yếu do phòng K1 dùng chung (khoảng 155 object) — đề xuất gộp hình học tĩnh của `PhysicsStage` thành ticket riêng vì ảnh hưởng Circuit. Mất context WebGL đã có test tự động.

Checklist độ chân thực (reviewer nhìn ảnh chụp ở 3 góc): tỉ lệ thiết bị hợp lý; đồng/đồng thau có phản xạ; bóng tiếp xúc trên mặt bàn; kim có quán tính và tắt dần; LED sáng không làm cháy sáng cả cảnh; chữ N/S đọc được; không có hình học xuyên nhau khi nam châm vào cuộn dây.

## 5. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Hiểu nhầm hình ảnh minh hoạ (đường sức, biên độ kim, đường cong AC) là số đo | Nhãn "minh hoạ" cố định; giới hạn model luôn hiển thị; không hiển thị con số |
| Dịch chuyển kéo tự do tạo trạng thái không hợp lệ | Kéo chỉ ở chế độ khám phá; checkpoint dùng hành động rời rạc |
| Thay đổi registry làm hỏng Circuit | T2 có test hồi quy Circuit không đổi kỳ vọng; route manifest giống hệt |
| Máy yếu | DPR [1, 1.5], một đèn đổ bóng, instancing, hạ chất lượng khi `PerformanceMonitor` báo tụt; 2D luôn sẵn |
| Lệch roadmap (A1–A3) | Chỉ build khi owner cho phép D-1; mọi bản ghi là synthetic/private |
