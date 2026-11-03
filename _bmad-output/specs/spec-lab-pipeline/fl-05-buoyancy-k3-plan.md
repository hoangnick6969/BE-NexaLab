---
id: PLAN-FL-05-K3
status: proposed-technical-plan-unapproved
updated: 2026-11-01
companions:
  - SPEC.md
  - lab-pipeline-phase-plan.md
  - lab-catalog-and-shared-kits-khtn8-9.md
  - lab-portfolio-20-slots-v1.md
  - fl-03-density-k3-plan.md
  - foundational-lab-track.md
---
# FL-05 Lực đẩy Archimedes + Shared Kit K3 "Bàn chất lỏng" — audit và kế hoạch triển khai

> **PROPOSED / UNAPPROVED.** Tài liệu lập kế hoạch dựa trên catalog, specs pipeline, blueprint pilot FL-01 Circuit và technical candidate FL-03/K3. Outcome B17-O01, lesson mapping, thông số, mô hình, rubric, assets và release FL-05 đều chưa được reviewer phê duyệt. Đây không phải bằng chứng implementation hay signoff.

## Cách đọc và trạng thái audit

- Đây là audit tài liệu theo commit gần đây trên checkout BE `feat/fl03-runtime-registry`; `HEAD=ad26747` (`docs(spec): align FL-03 plan and phase plan with technical candidate state`, 2026-10-31). FE đang ở nhánh `codex/foundational-lab-platform` tại snapshot được kiểm tra. BE working tree đã có bốn file sửa chưa commit liên quan FL-03; plan này không suy diễn nội dung hoặc xem các file đó là bằng chứng đã tích hợp.
- Tập commit được rà: `ad26747`, `32ba598`, `b7d4e8e`, `b4c8380`, `505b487`, cùng các commit nền `d1ae271`, `75ebad1`, `aca658c`, `829a2c7`, `8ecf89e`, `1836120`, `ea2f5b7`, `9a08c2d`, `690319e`, `61bc330`.
- Các commit FL-03 gần nhất mở rộng evaluator registry, model/evaluator density, tuple mẫu theo run, seed và release-chain fixture trong PostgreSQL cô lập; cập nhật §13–§16 của `fl-03-density-k3-plan.md`. Đây là chứng cứ kỹ thuật riêng cho FL-03, không tự động chứng minh K3 3D đã hoàn tất hay cho phép FL-05 bắt đầu.
- Không tìm thấy ba skill `three-js`, `ui-ux-pro-max`, `hallmark` trong thư mục skill/plugin cài đặt của Codex. Các yêu cầu cụ thể dưới đây được lấy từ chuẩn 3D, UI/UX và Hallmark đã ghi trong FL-03 plan và catalog §6A.6; không tuyên bố đã chạy các skill đó.

## 0. Tóm tắt quyết định

- FL-05 là Lab riêng **"Lực đẩy Archimedes, nổi/chìm"**, catalog SHARE/W2, gắn đề xuất với B17-O01. Dạng thiết kế ban đầu: một thực nghiệm lực kế so sánh trọng lượng biểu kiến của vật ngoài/trong chất lỏng, rồi giải thích trạng thái nổi/chìm.
- FL-05 thuộc **Shared Kit K3 — Bàn chất lỏng**, cùng FL-03/FL-04. K3 chỉ sở hữu phòng/bàn và apparatus/widgets trình bày có contract chung. FL-05 tự sở hữu identity, model, scientific state/output, activity, evidence, rubric, config và nội dung. Có thể tái dùng bể nước, cơ cấu nhúng vật, giá giữ vật và interaction/accessibility/performance primitives sau khi kiểm tra contract; không tái dùng evaluator density hoặc dữ liệu FL-03 như đáp án ngầm.
- FL-03 plan mô tả K3 là ranh giới presentation-only nhưng trạng thái code của K3 3D chưa có bằng chứng hoàn tất: FL-03 evidence nói renderer đang 2D và 3D chưa nối vào activity. FL-05 plan phải làm rõ, chuẩn hóa và hoàn thiện shared kit K3 như một deliverable riêng trước khi coi 3D là thật.
- Catalog hiện xếp fluid family sau FL-10/FL-13 và yêu cầu P3.5; phase plan ghi P3.5 NOT MET, P3.7 chưa mở. Vì vậy chỉ làm audit, blueprint/source review và chuẩn bị kit không gắn release trong lúc gate đóng. Không bắt đầu track Lab FL-05 cho đến khi điều kiện phase gate được đáp ứng hoặc có ngoại lệ bằng văn bản theo chính sách.
- Sản phẩm mô hình: procedural Three.js chất lượng cao, chân thực về kích thước/tỷ lệ/vật liệu/động lực học nhìn thấy được, không giả vờ mô phỏng CFD. 2D accessible phải cho cùng hành động và evidence. Mọi animation chỉ diễn giải state/observation đã chốt, không tạo dữ liệu hay verdict.

## 1. Audit specs và commit gần đây

| Bằng chứng | Kết luận dùng cho FL-05 |
|---|---|
| `SPEC.md`, `foundational-lab-track.md`, `contract-v1.md`, `lab-pipeline-phase-plan.md` | Server là authority; model deterministic và độc lập; rubric/activity tách khỏi observation; run snapshot pin tuple; draft local; release phải có owner signoff digest thật; P3.5 hiện chưa đạt, P3.7 chưa mở. |
| Catalog §4, §5, §6A.3–6A.6 và portfolio | FL-05 thuộc fluid family W2/K3, Tier B, 2D-first; B17-O01 là mapping đề xuất; hỗ trợ density có thể dùng sau review; model/activity/identity riêng. Catalog có output mô tả ngắn, chưa có lesson/source binding đầy đủ. |
| `fl-03-density-k3-plan.md` §3–§12 | FL-01 pilot pattern: dự đoán → thao tác → quan sát → giải thích; dùng LabSpace, run-host, local draft, renderer registry; thao tác DOM tương đương; instrument phải đo/đọc được; demand rendering, perf tiers, motion tokens, material thật, i18n/Hallmark. K3 không sở hữu khoa học. |
| FL-03 plan §13–§16, bổ sung qua `b4c8380`, `b7c8380`? / `b7d4e8e`, `32ba598`, `ad26747` | Có density model/evaluator và fixture release-chain trên isolated PostgreSQL; fixture không phải owner approval. Evidence gần nhất nêu FE FL-03 hiện 2D, 3D chưa wired. Dùng hạ tầng registry/runtime làm mẫu sau khi xác nhận trạng thái code, không chép giả định cũ trong audit lịch sử. |
| Circuit readiness và phase plan | FL-01 là pilot đầu tiên, bằng chứng tương tác/3D chỉ ở mức presentation; genuine curriculum/model signoff và thiết bị đại diện vẫn còn gate. Không diễn giải mô hình 3D đẹp là science approval. |
| K3 catalog và FL-03 §6 | K3 là family kit cho FL-03/04/05, nhưng một số mô tả cũ còn gọi `fluid-bench-2d`; chuẩn hóa thành K3 shared apparatus với modality có fallback 2D, 3D tùy QA. K2 Wet Bench và K3 Fluid Bench không tự động chia sẻ vật liệu/dụng cụ. |

## 2. Nguồn nội dung và open questions

### 2.1 Mapping proposal

| Trường | Đề xuất để review |
|---|---|
| Candidate | FL-05, KHTN 8, Chương III “Khối lượng riêng và …” (tên đầy đủ cần xác minh trong nguồn chính thức) |
| Primary Outcome | `B17-O01`; catalog trích: “Thực hiện thí nghiệm khảo sát tác dụng của chất lỏng lên vật đặt trong chất lỏng, rút ra được: điều kiện …” — nội dung bị cắt/OCR, phải lấy nguyên văn và provenance chuẩn trước khi viết lesson copy/rubric. |
| Concept proposal | Lực đẩy của chất lỏng; quan hệ giữa trọng lượng vật, lực đẩy và trạng thái chuyển động/cân bằng; điều kiện nổi/chìm theo đúng chương trình/lesson được duyệt. |
| Lesson/video | Chưa xác định lesson released, source block, edition/page, ảnh/thí nghiệm và video tương ứng. Không suy ra từ B17 chỉ số bài. |
| Prerequisite relation | Có thể tham chiếu kết quả FL-03 về khối lượng riêng nếu release/mapping đã review; v1 nên có số liệu/config riêng để chạy độc lập và không phụ thuộc FL-03 release. |

### 2.2 Bắt buộc trước freeze blueprint

1. Lấy Outcome nguyên văn, phiên bản chương trình, PDF/trang/anchor, hình dụng cụ và lesson đã released từ nguồn có provenance; ghi source ID và digest.
2. Xác nhận cách diễn đạt chính xác: lực đẩy (F_A), trọng lượng (P), thể tích phần chìm, khối lượng riêng vật/chất lỏng, và tiêu chí nổi/lơ lửng/chìm. Không chốt phương trình hoặc điều kiện nổi/chìm từ catalog OCR.
3. Xác nhận thí nghiệm SGK dùng lực kế và bể/chất lỏng nào, thứ tự đo, vật liệu/vật mẫu và câu hỏi kết luận. Kế hoạch không tự thêm muối, chất lỏng khác nước, hiệu ứng bọt hay “trọng lượng riêng” nếu không có nguồn.
4. Reviewer khoa học xác nhận hằng số/config và golden cases; reviewer curriculum xác nhận coverage; rights/safety review xác nhận assets/copy.

## 3. Identity, ranh giới và reuse

| Thuộc tính | Giá trị đề xuất |
|---|---|
| Lab key | `buoyancy` (private, không discovery cho tới release hợp lệ) |
| modelRef | `buoyancy-bench@1.0.0` (đề xuất mới, registry allowlist) |
| activity | `buoyancy-investigation@1` |
| rubricRef | `buoyancy-investigation@1.0.0` |
| rendererKey | `buoyancy-bench` |
| Kit | `physics/fluid/kit` K3; apparatus dùng theo activity đã review |
| Presentation | 2D parity bắt buộc; 3D procedural opt-in cho tới khi benchmark/device/accessibility parity đạt |
| Outcome | B17-O01 `PROPOSED_UNAPPROVED` |

### K3 sở hữu

- K3 bench/stage adapter, camera rig và quality tiers dùng chung; không sở hữu phòng nền. `PhysicalLabEnvironment` vẫn là room shell xuyên kit và thay đổi cần kiểm tra K1/K2/K3 consumers.
- Các primitive trình bày và tương tác có thể dùng lại sau khi chuẩn hóa: bể trong suốt, mặt chất lỏng, giỏ/giá giữ vật, móc treo, dynamometer housing/scale, support arm, vật mẫu procedural, camera presets, DOM action mapping, reduced-motion, asset manifest.
- Shared schema chỉ mô tả presentation events (ví dụ `SUBMERGE_TO_DEPTH`, `READ_DYNAMOMETER`, `REMOVE_SPECIMEN`, `RESET_SCENE`); BE activity/model vẫn diễn giải state và trả observations. Event bus không được thành model khoa học.

### FL-05 sở hữu

- Luật mô hình Archimedes, valid ranges/assumptions, vật mẫu và fluid configuration, checkpoint sequencing, evidence schema, rounding/readout interpretation, rubric, result feedback, copy/Outcome/lesson references, variant selection và test fixtures.
- Không kế thừa density rubric, S1–S5 notebook, specimen choices, KLR hằng số hoặc cách chấm của FL-03. Có thể cung cấp “đã học khối lượng riêng” như liên hệ phụ trợ, không là prerequisite kỹ thuật.

### Reuse contract

Mỗi K3 apparatus phải có dimensions/unit convention, range/scale resolution, accessible action, visual value mapping, lifecycle/disposal, low-tier appearance, test target và asset provenance. Không đưa logic scoring vào apparatus. Mỗi consumer khai báo subset apparatus và actions cần thiết; K3 không ép tất cả Labs dùng chung một cảnh hay một workflow.

## 4. Activity blueprint đề xuất

Giữ chu trình pilot Circuit “dự đoán → thao tác → quan sát → giải thích”, chuyển sang một phép khảo sát có đối chiếu. Mẫu checkpoint cần được đối chiếu lesson thật trước khi đóng băng.

| Checkpoint | Tác vụ dự kiến | Evidence (proposal) | Mục tiêu |
|---|---|---|---|
| C1 — Dự đoán | Xem một vật và điều kiện ban đầu; dự đoán số chỉ lực kế khi nhúng một phần/toàn phần | `prediction: INCREASES\|DECREASES\|SAME` (enum chốt theo câu hỏi nguồn) | Nêu giả thuyết trước quan sát |
| C2 — Đo ngoài chất lỏng | Đặt vật vào móc lực kế, chờ kim ổn định, đọc số chỉ | `airReading` + unit; thao tác log/sequence do run-state quản lý | Đọc lực kế đúng độ chia |
| C3 — Nhúng có kiểm soát | Hạ vật đến vạch/độ sâu yêu cầu, tránh chạm đáy/thành; chọn thể tích chìm nếu lesson yêu cầu | `submergedFraction` hoặc `submergedVolume` chỉ dùng nếu nguồn/chỉ thị dụng cụ cho phép | Phân biệt mức nhúng và kết quả |
| C4 — Đo trong chất lỏng | Đọc lực kế khi vật đứng yên trong chất lỏng; có thể có các mức nhúng được duyệt | `liquidReadings[]` + unit + depth/station ID | Đối chiếu trọng lượng biểu kiến |
| C5 — Tính/giải thích | Tính chênh lệch số chỉ, gắn với lực đẩy; trả lời quan hệ lực và nổi/chìm trong đúng khung Outcome | `calculatedBuoyantForce`, unit, explanation choice/text ngắn | Kết luận từ số liệu, nêu giới hạn mô hình |

**Scope v1 chưa chốt:** có đánh giá cân bằng nổi/chìm trên bề mặt hay chỉ lực kế khi nhúng; có nhiều vật liệu/mật độ không; có đồ thị lực đẩy–thể tích chìm không. Chốt sau khi đọc đúng lesson/hình. Tránh biến activity thành sandbox nhiều chất lỏng hoặc nhiệm vụ tính mật độ lặp của FL-03.

## 5. Scientific model và assessment contract (đề xuất review)

### 5.1 Nguyên tắc mô hình

- BE tính observations deterministically từ tuple đã pin: fluid/specimen config, kích thước/khối lượng, instrument resolution, checkpoint state và phiên bản model. FE/Three.js không tự tính verdict.
- Equation/UI proposal supplied for review: `F_A = P_0 - P_submerged = d * V_displaced`. Before implementation, confirm the source's symbol `d` means specific weight (N/m³), not mass density `ρ` (kg/m³); if `d` means mass density, the factor `g` is required dimensionally. Keep the requested KaTeX expression visible only after the science reviewer resolves this notation. Server output is the sole numeric truth.
- Dùng SI nội bộ (N, m³, kg/m³) hoặc quy ước đơn vị khác được reviewer phê duyệt; mọi conversion hiển thị phải tường minh. Không trộn `d` (trọng lượng riêng) với `ρ` (khối lượng riêng) do catalog OCR dùng ký hiệu chưa thống nhất.
- Nếu dùng quan hệ (F_A = \rho_{fluid} g V_{displaced}), reviewer phải xác nhận phạm vi lớp học và giá trị `g`/làm tròn. Trọng lượng biểu kiến `T = P - F_A` chỉ là candidate model relation, cần validate với bài học.
- “Nổi/lơ lửng/chìm” không được kết luận chỉ từ ảnh động. Mô hình phân loại cần điều kiện cân bằng và initial conditions được nêu rõ; phải tránh nhập nhằng vật đang rơi/chìm chuyển động với vật cân bằng.
- Chất lỏng lý tưởng, vật cứng, không nén, nhiệt độ cố định, không dòng chảy, không lực cản/mao dẫn. Đây là giả định đề xuất, cần ghi trong student-facing limitation.

### 5.2 State/evidence envelope phác thảo

```ts
type BuoyancyStateV1 = {
  variantId: string; // do BE chọn và pin cho run
  steps: Array<{
    checkpointId: "air" | "submerge" | "interpret";
    action: "PLACE_SPECIMEN" | "SET_SUBMERGED_LEVEL" | "READ_SCALE";
    levelId?: string;
  }>;
};

type BuoyancyEvidenceV1 = {
  variantId: string;
  prediction?: "INCREASES" | "DECREASES" | "SAME"; // enum cần chốt từ prompt
  readings: Array<{ checkpointId: string; value: number; unit: "N" }>;
  calculation?: { value: number; unit: "N" };
  explanation?: "..."; // enum do reviewer/curriculum chốt
};
```

Schema strict, giới hạn số bước, finite numbers only, range theo dụng cụ; từ chối variant lạ, thứ tự checkpoint sai, reading ngoài scale, đơn vị sai hoặc thiếu evidence bắt buộc; invalid submission không tạo attempt. Final schema phụ thuộc nguồn và UX review.

### 5.3 Rubric draft

1. Procedure/sequence: phép đo ngoài và trong đúng thứ tự theo lesson.
2. Instrument reading: mỗi đọc khớp server observation trong tolerance theo ĐCNN được duyệt.
3. Difference/calculation: tính lực đẩy từ chênh số chỉ hoặc công thức đúng theo prompt, dùng chính số đọc của học sinh để không phạt dây chuyền.
4. Concept explanation: kết luận phù hợp dữ liệu/điều kiện, phân biệt force, apparent weight và trạng thái cân bằng.
5. Units and communication: đơn vị/độ chính xác hợp lệ, giới hạn mô hình được hiển thị; không chấm văn phong dài.

Rubric độc lập activity version; tiêu chí/tolerance là PROPOSED, owner/science reviewer chốt trước release. Sai số đọc không bị trừ hai lần trong calculation.

### 5.4 Fixtures bắt buộc

- Golden: vật đứng yên ngoài chất lỏng; cùng vật nhúng hoàn toàn cho lực kế giảm; nhúng một phần nếu cho phép; vật không chạm thành/đáy; giá trị ở biên vạch dụng cụ; chênh lực khớp lực đẩy theo config đã duyệt.
- Scientific boundary: (V_{displaced}=0), vật chạm đáy (loại/invalid nếu không mô hình), vật chạm thành, lực đẩy vượt trọng lượng, vật neutral buoyancy, mực chất lỏng/scale max.
- Assessment: reading đúng/sai 1 division, phép tính từ chính số đọc đúng, explanation sai nhưng data đúng, sequence thiếu/sai, đơn vị lạ.
- Runtime: variant mismatch, stale tuple, duplicate idempotency, expiry/relaunch, revoke/quarantine, replay, malformed/NaN/Infinity/negative/overscale.
- Expected numbers chỉ đóng băng khi reviewer xác nhận constants, source và round-half policy.

## 6. Shared Kit K3 — scope để hoàn thiện

### 6.0 Existing FE scaffold and extension tree (audit 2026-11-01)

The earlier tree below is a target map, not current reality. FE already has `src/features/labs/physics/fluid/kit/` with `FluidBench3D.tsx`, `Beaker3D.tsx`, `k3-config.ts`, `k3-geometry.ts`, `k3-motion.ts`, `K3Hud.tsx`, apparatus for balance/cylinder/specimen/pour stream, 2D apparatus and a K3 preview. FL-03 has `physics/fluid/density/Density3DStage.tsx` and `DensityWaterScene.tsx`; its `Settle` helper currently uses `THREE.MathUtils.damp` (exponential easing), and the beaker uses simple column/cap/ring meshes. Do not duplicate these paths or describe these existing pieces as the new FL-05 contract.

Extend this scaffold in place, after checking current FE branch/worktree before coding:

```text
FE-NexaLab/src/features/labs/physics/fluid/
  kit/
    kit/apparatus/Beaker3D.tsx         # current path; extend material/liquid interfaces compatibly with density
    apparatus/OverflowCan3D.tsx        # NEW Eureka vessel, spout and capacity datum
    apparatus/Dynamometer3D.tsx        # NEW calibrated spring scale/readout
    apparatus/Specimen3D.tsx           # extend with buoyancy-specific dimensions/mass presentation
    effects/MeniscusSurface3D.tsx      # NEW shared interface mesh + ripple shader (density currently has geometry meniscus)
    effects/DisplacementSurface3D.tsx  # NEW FL-05 visual volume/level adapter
    physics/useDampedSpring.ts         # NEW reusable deterministic presentation spring
    physics/useBuoyancyPresentation.ts # NEW frame-sampled geometry outputs; no evidence/scoring
    cameras/fl05-camera-presets.ts     # NEW overview/eye-level/dynamometer views
    hud/BuoyancyHud.tsx                # NEW composition/extension of existing K3Hud DOM guide/readout
    overlays/BuoyancyVectorOverlay.tsx # NEW P and F_A vectors, calibrated to BE output
  buoyancy/
    BuoyancyActivity.tsx               # NEW activity orchestration and accessible DOM actions
    Buoyancy3DStage.tsx                # NEW composition of existing LabSpace/PhysicsStage + K3
    Buoyancy2DStage.tsx                # NEW equivalent actions/readings/diagram
    BuoyancyNotebook.tsx               # NEW evidence inputs/table/KaTeX
    buoyancy-evidence.ts
    buoyancy-copy.ts
```

Keep the current `shared/PhysicalLabEnvironment.tsx`, `physics/shared/PhysicsStage.tsx` and `physics/fluid/kit/FluidBench3D.tsx` as the room, canvas/camera host and K3 frame. Extend `StageView`/`FluidBench3D` via a backward-compatible view API or place the FL-05 camera controls within its existing host; do not mount a second Canvas or room. The BE scaffold belongs in `BE-NexaLab/packages/sim/` for deterministic model + schemas/golden cases, `src/modules/labs/application/evaluators/` for a separate evaluator registration, and existing Lab tuple/pack interfaces for version-pinned config. No schema migration should be assumed until current model interfaces prove it necessary.

### 6.1 Three.js material, interface shader and geometry contract

All numeric values in this subsection are requested **presentation/config defaults**, pending review against apparatus source and Three.js version. Shared component props must expose profile/material variants so changing K3 glass does not silently alter FL-03 density visuals or evidence.

| Surface | Required contract |
|---|---|
| Beaker/overflow vessel glass | `MeshPhysicalMaterial({ color: #ffffff, transmission: 0.95, ior: 1.47, thickness: 0.12, roughness: 0.05, metalness: 0, transparent: false, depthWrite: true })`; real inner/outer wall geometry and rim/base; wall thickness is a physical scene parameter in metres, distinct from optical `thickness` if the chosen Three.js semantics require it. Do not set `opacity` to fake transmission. Test transmission cost per quality tier. |
| Fresh water | `ior: 1.333`; attenuation/tint subtle and energy-conserving within renderer; surface uses dedicated meniscus interface. |
| Brine | `ior: 1.37`; fluid density/composition is a separate versioned scientific config from optical IOR. Do not infer buoyancy from IOR or hardcode a concentration. Enable only after source/reviewer scope permits brine. |
| Liquid-air interface | `MeniscusSurface3D`: mesh conforms to tank/beaker wall, concave meniscus in cylindrical vessels and edge rise bounded by reviewed visual parameter; rectangular tank uses a compatible edge curve. Vertex displacement/normal perturbation is visual only; geometric liquid volume and server reading remain authoritative. |
| Surface ripple | Deterministic shader/mesh ripple at the gas-liquid boundary, with amplitude and frequency driven by interaction impulse and decaying to zero. No frame-random noise, no ripple-derived measurement, no autonomous motion when idle. Low tier uses flat surface + optional static highlight. |

Render in the existing R3F `frameloop="demand"`; request frames only while spring, flow, surface settling, camera transition or interaction is active. Avoid per-frame object/material/geometry allocations. Dispose owned resources on unmount; shared cached geometry/materials use ref-counted ownership. Calibrate transparent draw order/depth and test the selected R3F/Three version's transmission implementation before adopting shader hooks.

### 6.2 Per-frame displaced volume, level and Eureka overflow contract

Presentation derives geometry continuously from the current interaction target; it does not update BE state or produce evidence. Use SI internally (m, m³, s, kg, N); convert to mm/mL only at defined boundaries.

For a vertical-sided specimen with horizontal cross-section `A_specimen(y)` and bottom `y0`, compute submerged volume using clipped cross-section integration:

```text
V_submerged(y) = integral[y0 .. clamp(y, y0, y_top)] A_specimen(z) dz
```

For a cuboid this is `A_specimen * clamp(y-y0, 0, height)`. For cylinders or approved irregular specimens use a precomputed deterministic volume-vs-height lookup table generated from the same versioned geometry dimensions; interpolate monotonically. Never estimate displaced volume from shader-deformed vertices.

For a tank of constant internal area `A_beaker`, below the overflow lip:

```text
Δh = V_submerged / A_beaker
h_liquid = h_initial + Δh
```

Clamp against tank capacity and keep beaker shape/scale, graduations and meniscus lookup in one K3 config. For non-constant cross-sections solve/invert the reviewed `V_liquid(h)` curve with a deterministic monotone lookup; do not apply the constant-area shortcut.

For an Eureka/overflow can, `Q_in(t)` and displaced volume may exceed brim capacity; compute the overflow target from volume conservation and a fixed reviewed outlet datum. Visual flow uses a damped first-order presentation filter, not a linear lerp:

```text
Q_visual += (Q_target - Q_visual) * (1 - exp(-dt / tau_flow))
V_out_visual += Q_visual * dt
```

Use bounded `tau_flow` and stop thresholds from versioned visual config; surface and stream settle deterministically. The science model computes the expected collected/displaced volume and readings on BE, independently. The shader cannot determine a pass result.

### 6.3 Damped spring physics contract

All specimen drag/placement, dynamometer spring extension and fluid surface settling use an explicit damped spring integrator; do not use linear interpolation or `THREE.MathUtils.damp` as a substitute for the requested physical spring. Integrate in `useFrame` with `dt` clamped (e.g. ≤1/60 s substeps when a frame stalls), refs only, no React state update per frame. For position `x`, velocity `v`, target `x*`:

```text
a = (k * (x* - x) - c * v) / m
v_next = v + a * dt
x_next = x + v_next * dt
```

Use semi-implicit Euler with bounded substeps or an analytically stable damped-spring solution. Clamp max velocity/displacement and snap when position and velocity tolerances are both met. Reduced motion sets final position immediately and suppresses oscillation; same scientific reading/evidence remains.

| Motion | Required behavior |
|---|---|
| Drag/drop specimen | Pointer/keyboard/DOM action sets a target anchor; spring mass scales with configured specimen mass (with a visual minimum/maximum), stiffness and damping are kit motion tokens. Collision/allowed-position validation comes from activity state, not spring overshoot. No free throwing. |
| Dynamometer | Extension `x = F/k_spring` from the pinned server observation and reviewed instrument spring constant; visual spring obeys `m_s x'' + c x' + k x = F(t)`. The final pointer/readout snaps to the exact server value after settling; physics feel cannot change numeric reading. |
| Liquid surface | Damped spring oscillator response to displacement/impact impulse with deterministic initial velocity; amplitude tied to interaction event, mass/viscosity-like visual damping is presentation-only. No waves while idle. |
| Eureka stream | Flow rate follows §6.2 damping; outlet rate cannot overshoot conservation target, and collected volume shown to student comes from the BE observation. |

Motion defaults: `k`/`c`/visual mass are versioned presentation tokens, not physical constants; calibrate for no more than small visible overshoot. Actual sample mass controls relative inertial feel, not model physics. Record all tokens and equations in the component README and test reduced-motion/interrupt/reset behavior.

### 6.4 Camera presets and transition

Provide three named presets, responsive wide/narrow transforms, accessible buttons and current-preset announcement:

| Preset | Target/framing | Purpose |
|---|---|---|
| `overview` | Three-quarter view containing tank, stand and dynamometer; no controls/HUD cover measurement area | Context and specimen movement |
| `eye-level-meniscus` | Camera optical axis at target meniscus height, near-horizontal viewing ray, orthographic or low-distortion close framing; graduations and bottom of meniscus share a readable plane | Reduce parallax for mL/level reading; camera height must be tied to liquid datum, not arbitrary orbit |
| `dynamometer-close-up` | Front-on near-orthographic framing of scale and pointer, enough margin for tick labels and DOM readout | Scale division reading and spring movement |

Transition uses the same damped spring integrator (or controls' critically damped/verified spring API) for camera position and target, interruptible by user; no linear lerp. Duration target 500–800 ms, reduced-motion immediate. Lock/limit free orbit during reading steps, expose Reset/View buttons, and keep focus in DOM while the scene changes. Never animate camera to conceal a reading.

```text
src/features/labs/
  shared/
    PhysicalLabEnvironment.tsx       # phòng nền xuyên kit; consumer hiện có cần regression QA
    stage/FluidBenchStage.tsx        # Canvas/camera/lifecycle host, không sở hữu model
    stage/fluid-bench-quality.ts     # low/mid/high; measured adaptive tiers
    stage/useCameraRig.ts            # preset bàn, close-up, eye-level; reduced-motion
    motion/lab-motion.ts             # motion tokens chung
  physics/fluid/
    kit/                            # K3 presentation-only
      k3-contract.ts                 # apparatus manifest, units, dimensions, actions
      k3-events.ts                   # typed interaction events, no scoring/model logic
      apparatus/TransparentTank3D.tsx
      apparatus/Dynamometer3D.tsx
      apparatus/SupportStand3D.tsx
      apparatus/SpecimenBasket3D.tsx
      specimens/BuoyancySpecimen3D.tsx
      effects/WaterDisplacement.tsx  # only visual displacement cue; no solver
      readout/ScaleLoupe.tsx
      two-d/                          # semantically and interactively equivalent SVG
      k3-asset-manifest.ts
      README.md
  physics/fluid/buoyancy/           # FL-05 model-facing FE activity
      BuoyancyActivity.tsx
      Buoyancy3DStage.tsx
      Buoyancy2DStage.tsx
      BuoyancyNotebook.tsx
      buoyancy-evidence.ts
      buoyancy-copy.ts
```

Paths are targets, not assertions about existing files. First audit current FE tree, reuse proven LabSpace/PhysicsStage/renderer registry, add only abstractions justified by K3 consumers FL-03/04/05. Avoid introducing duplicate room-shell components.

### 6.5 Apparatus requirements

| Asset | Realism/detail contract |
|---|---|
| Tank/Beaker/Eureka can | Transparent rectangular tank and optional calibrated Eureka overflow can; glass contract §6.1, actual inner/outer dimensions, rim, base, datum, graduations and outlet geometry. Water/brine IOR is optical only; fluid density and capacity come from reviewed config. |
| Dynamometer | Vertical analog spring scale unless source says otherwise: clear housing, internal spring/link, calibrated N scale with major/minor divisions, pointer, zero adjust/hook; division spacing and displayed value derive from same reviewed scale config. No decorative scale with unrelated numbers. |
| Stand/hook | Stable metal retort stand, clamp, horizontal arm, hook and thread; dimensions/load plausible; visible line of action and clearance from tank. |
| Specimen | One or more source-approved regular bodies (metal block/cylinder) with accurate dimensions/volume and visible material identity; mass config separate from rendered material. Do not infer density from color/appearance. |
| Water/brine | Meniscus mesh/shader and gas-liquid ripple contract §6.1; displacement/level and overflow follow §6.2. Brine remains gated by curriculum/source review. |
| Camera/readout | Macro views readable at device sizes; eye-level scale view with loupe; no perspective/parallax ambiguity when reading. 2D table/readout is always available. |

Scene unit = 1 m; actual scale dimensions and values derive from one config. Physical realism means calibrated proportions, coherent materials/lighting, readable instruments and deterministic motion—not claiming full optical/fluid simulation. All assets procedural in v1, manifest with generator/version/parameter digest; external GLB/HDR/font only with provenance/license and measured budget.

## 7. 3D animation and rendering bar

- Use Three.js/React Three Fiber patterns already compatible with FE; no CDN preset assets. One shared Canvas/stage lifecycle per LabSpace; lazy-load K3 chunk. Reuse geometry/material/texture; dispose on unmount without disposing shared assets still in use.
- Physically based materials, calibrated color space and tone mapping; procedural room environment/soft key fill; contact shadow baked/one-shot where possible. Avoid per-frame allocations, always-running frame loop, realtime point-light shadows and hundreds of room meshes.
- `frameloop="demand"` for static state. During transitions, update refs only and invalidate while active; reduced-motion jumps to final state. No React `setState` every frame.
- Sequence: place/load apparatus → instrument zero check → lower specimen in controlled increments → stabilize readout → compare air/liquid readings → extract specimen. All object, spring and surface transitions use the damped-spring/flow contracts in §6.2–§6.3, never linear lerp. Do not autoplay scientifically meaningful measurements.
- Water motion uses bounded visual cues (surface displacement/settling), not a Navier–Stokes claim. Use deterministic phase/seed and no stochastic variation in displayed readings. Apply the three camera presets in §6.4; transitions are spring-damped, interruptible and focus remains in DOM interaction layer.
- High/mid/low quality tiers adapt DPR/effects/transmission from measured frame rate and honor user setting. Low tier remains readable with opaque/low-cost fallback; WebGL failure switches to 2D with preserved run draft.
- Proposed budgets inherit FL-03 as measurement targets only: ≤150k triangles, ≤80 draw calls, ≤32 MB GPU texture; K3+FL-05 chunk ≤180 KB gzip excluding Three/Drei; first interaction ≤3s on agreed mid-tier device. Record actual devices, browser, DPR, FPS, memory proxy and cold-load results before declaring pass.

## 8. UI/UX, accessibility and Hallmark floor

### 8.1 Compact HUD, vectors and pedagogical synchronization

- Place a compact glassmorphism HUD in a clear scene corner: translucent neutral panel, backdrop blur only where supported, opaque/contrast fallback in low tier, thin border and restrained shadow. Keep the scene and tick marks readable through it; panel is DOM, not a CanvasTexture.
- HUD displays current server-provided observation, units, checkpoint label and status. A live trial may show a clearly labelled **predicted/local presentation** preview but must not imply server grading; once submitted, show pinned observation/result.
- `BuoyancyVectorOverlay` renders vector arrows for weight `P` downward and buoyant force `F_A` upward. Vector length uses a single calibrated scale in px/N (or world units/N), with arrow values/units also present in DOM. Direction and magnitude derive from the same observation used by the notebook and equation; no separate client formula. For screen-reader/2D, use labelled SVG/DOM equivalent.
- `BuoyancyNotebook` and HUD share one typed view model `{ observationId, P0N, PsubmergedN, buoyantForceN, displacedVolumeM3, units, checkpointId }` from BE observation or a locally marked ungraded prediction. Update atomically per observation; prevent stale values across run/variant changes.
- Render the requested KaTeX expression `F_A = P_0 - P_submerged = d * V_displaced` in a DOM formula panel and highlight terms only when their corresponding values are present. This formula is a proposal requiring D8 notation/science signoff; dimensional review must establish whether `d` is specific weight or whether formula should use `ρ g V`. Provide readable linear text fallback and never put critical formula in a 3D texture.
- Reduced motion disables visual spring/ripple but vectors, measurements, formula values and evidence remain synchronized and identical.

- Follow FL-03 Hallmark rules: design tokens for color/type; no `transition: all`; animate transform/opacity; visible immediate `:focus-visible`; reduced-motion path; no widely tracked uppercase labels; no dot-separated meta strings; Lucide or equivalent icon set; avoid nested cards; concise guidance; Vietnamese primary with `defineText`/component-scoped `text()` and no hardcoded text inside canvas/SVG.
- Desktop: LabSpace scene plus fixed, non-obscuring experiment notebook/readout panel; checkpoint progress shown with text and icon as well as color. Instrument values remain DOM text for zoom/screen readers.
- Mobile: stacked scene/readout/controls without horizontal scroll; touch targets suitable for school devices; bottom-sheet transitions respect safe areas; 2D instrument mode reachable without precision dragging.
- Every 3D action has a visible DOM button/action equivalent; drag-only controls prohibited. Keyboard: Tab, Enter/Space, arrow adjustment only where meaningful, Escape for overlays; focus return to invoking control. Screen-reader announcements are concise and occur after stable readings, not every animation frame.
- Provide high-contrast/large-readout option; do not grade purely perceptual/drag timing; provide a supported accessible route if measurement skill cannot be accessed and record criterion applicability explicitly.
- Copy must state this is an idealized virtual apparatus and what the model omits, without claiming real experimental competence.

## 9. Implementation phases and acceptance

| Phase | Work | Deliverable / gate |
|---|---|---|
| 0. Source and audit | Resolve exact Outcome, source edition/page, released lesson, experiment diagram, review mappings. Reconcile K3/FL-03 current file tree with latest commits and dirty working tree; no DB writes. | Evidence table and blueprint with all unresolved science/constants visibly open; P3.5 status retained. |
| 1. Shared K3 contract | Define apparatus manifest/units/dimensions/events; inventory what FL-03 currently implements vs only plans; select genuine reusable pieces; add K3 dev gallery. | Each asset has visual contract, accessible DOM action, 2D counterpart, lifecycle and provenance; no scientific scoring in kit. |
| 2. K3 apparatus + 2D parity | Tank, stand, dynamometer, specimen primitives; readout/scale loupe; keyboard/touch controls; quality tier and WebGL fallback. | K3 preview is interaction-complete without any Lab-specific evaluator; 2D and 3D trigger same semantic events. |
| 3. FL-05 blueprint freeze | Curriculum/science reviewers close source and scope decisions, values/units/tolerances, state/evidence/rubric, golden/boundary cases, safety/rights. | Immutable proposed tuple specification; remains private/unapproved until actual receipt. |
| 4. BE model/runtime | Add deterministic `buoyancy-bench@1.0.0`, strict schema, independent activity/rubric registry, config/pack/variant pinning. Keep FL-03/Circuit tuples unchanged. | Unit/golden/invalid tests plus evaluator contract; isolated PostgreSQL only for integration. |
| 5. FE activity | Build notebook, renderer registration, local draft/recovery, 2D and 3D stages using K3; server observation rendered verbatim; i18n and copy. | Run launch→manipulate→submit→result/replay uses pinned contract; no renderer state enters scientific evidence unless explicitly part of activity. |
| 6. QA and readiness | 2D/3D evidence parity, mobile/keyboard/screen-reader/reduced-motion/WebGL failure, representative devices, performance/assets review, FE→BE→isolated DB. | Reproducible evidence report, actual metrics and open defects. No production write. |
| 7. Release | Freeze digest; bind reviewed Lesson/Outcome; genuine authenticated OWNER_SIGNOFF covering mapping/science/rubric/safety/rights; release and assignment gates. | Only after required phase gate and actual review; fixtures are never approvals. |

Phases 0–2 may prepare shared presentation only within platform scope and owner priorities. Lab-specific track phases 3+ wait for P3.5 and rollout order decision (W2 currently places FL-10/FL-13 ahead of fluid family) or written exception. Keep ≤2 concurrent Lab tracks. Never run seed/migration/tests against shared Supabase; integration uses guarded isolated loopback only.

## 10. QA acceptance matrix

| Area | Acceptance evidence |
|---|---|
| Curriculum/science | Exact source/lesson binding; independently calculated golden cases; equations, units, assumptions and boundaries signed against digest. |
| Runtime | Tuple immutability, allowlisted versions, invalid payload no attempt, retry/idempotency, draft recovery, expiry/revoke and replay. |
| Kit reuse | FL-03/04/05 consumer contract checks; apparatus selection explicit per activity; no shared model/evaluator leakage; room shell regression across existing K1/K2/K3. |
| Visual fidelity | Physical dimensions and dial markings measured from single config; readable loupe at 390×844 and desktop; no visual value contradicts BE observation. |
| Animation | User-triggered, state-derived, deterministic endpoints; interruption/reset; no state mutation by animation; reduced-motion equivalence. |
| Accessibility | Keyboard-only, screen-reader semantics, visible focus, non-drag alternatives, contrast/zoom, mobile touch; assessment does not penalize inaccessible operation. |
| Performance | Cold-load, first action, FPS/tier transitions, GPU/chunk footprint measured on named target Chromebook/Celeron/tablet/phone and browser. Proposed limits are not pass until measured. |
| Rights/safety | Asset manifest and generated/procured provenance; virtual-lab limitation; reviewer safety framing. |
| Release | Authentic owner review of exact digest, active release lifecycle, lesson binding and access/assignment checks; no synthetic receipt accepted. |

## 11. Open decisions

| ID | Decision | Suggested handling |
|---|---|---|
| D1 | Exact B17-O01 text, source edition/page, Lesson and experiment image | Resolve in Phase 0 before learner-facing content. |
| D2 | Apparatus type, scale range/resolution, specimen, fluid and levels | Derive from source and reviewer-approved config; no assumed constants. |
| D3 | Does Outcome cover force measurement, buoyancy calculation, or floating condition? | Split checkpoint/rubric only to match explicit source; do not overclaim coverage. |
| D4 | Whether FL-05 consumes reviewed FL-03 density result | v1 independent tuple; optional conceptual relation only after compatibility/version contract. |
| D5 | Is 3D needed beyond Tier B realism, given catalog 2D-first? | Build 2D-complete first; 3D opt-in until parity, accessibility and device QA pass. |
| D6 | W2 order vs FL-10/13 and P3.5 gate | Keep catalog order unless owner explicitly changes it; do not infer permission from FL-03 fixture. |
| D7 | Tolerance, rounding and accessible alternate for scale-reading criterion | Science/accessibility reviewer decides and documents criterion applicability. |
| D8 | Formula notation and dimensional contract for requested `F_A = P_0 - P_submerged = d * V_displaced` | Science reviewer establishes meaning/units of `d`; correct to `ρgV` if `d` is mass density; KaTeX is not frozen until then. |
| D9 | Brine and Eureka apparatus are in Outcome scope | Curriculum/source review first; otherwise retain as K3 dev-gallery variants and exclude from FL-05 v1. |

## 12. Risks and controls

| Risk | Control |
|---|---|
| Catalog OCR truncation leads to wrong target | Phase 0 source provenance and exact lesson binding; freeze no paraphrase before review. |
| Apparatus looks realistic but scale values are decorative | One versioned config drives dimensions, scale marks, pointer, readout and BE observations; calibrate golden cases. |
| Visual animation teaches an unreviewed law/phenomenon | Animate only pinned state/observation, no autonomous float/sink or generated force values. |
| Shared K3 becomes shared science | Explicit separation of kit events/assets from Lab model, rubric and identity; cross-consumer contract review. |
| 3D degrades accessibility/device support | Fully usable 2D, semantic DOM controls, low tier, reduced motion, WebGL fallback and measured benchmark. |
| FL-05 starts before gate/priority | Phase-plan and W2 rollout gate; isolated work only until authorization state changes. |
| Model overlap with density | FL-03 model cannot be imported as FL-05 evaluator; shared constants only through reviewed versioned interface. |

## 13. Proposed deliverable checklist

- [ ] Source evidence and exact Outcome/lesson mapping, with review status
- [ ] Frozen FL-05 model/activity/evidence/rubric blueprint, golden/invalid fixtures
- [ ] K3 shared contract, apparatus gallery, asset manifest, 2D counterparts and interaction docs
- [ ] Realistic procedural 3D assets with calibrated geometry/readout, deterministic animation and quality tiers
- [ ] Glass/water/brine material parameters; meniscus/ripple shader; displaced-volume/level/Eureka flow contract
- [ ] Mass-dependent damped springs for specimen, dynamometer and liquid; three camera presets; synchronized DOM HUD/vector/KaTeX
- [ ] Independent BE model/evaluator/registry and versioned pack/config
- [ ] FE 2D/3D activity integration, run recovery, i18n, keyboard/screen-reader/reduced-motion
- [ ] Cross-Kit/room regression, parity and actual device/performance report
- [ ] Genuine review receipt on exact digest and release evidence after gates

## References

- `SPEC.md` — canonical pipeline and release policy
- `lab-pipeline-phase-plan.md` — P3.1–P3.7 gates and status
- `lab-catalog-and-shared-kits-khtn8-9.md` — FL-05/W2/K3 catalog and Tier B/2D-first proposal
- `lab-portfolio-20-slots-v1.md` — stable FL-05 slot and reuse boundary
- `fl-03-density-k3-plan.md` — K3 architecture, 3D, UX, accessibility and technical-candidate evidence
- `foundational-lab-track.md` — blueprint and QA template
- `../spec-foundational-lab-p3-1/lab-definition.md` and `circuit-finalization-readiness.md` — first Circuit pilot boundaries
