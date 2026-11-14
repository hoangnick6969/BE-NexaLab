# K2 Wet Bench Kit — Explore-First, Optional Questions (thiết kế chờ duyệt)

**Trạng thái:** Đề xuất thiết kế 2026-11-13. Chưa duyệt, chưa code. Không thay thế `lab-catalog-and-shared-kits-khtn8-9.md`, `fl-10-k2-implementation-spec.md` hay các gate release. Mọi dữ liệu hoá học trong tài liệu (nồng độ, màu, ngưỡng pH, danh sách phản ứng) là **bản nháp kỹ thuật `unverified`**, cần reviewer môn Hoá/an toàn trước khi học sinh thấy ngoài dev route.

## 0. Đính chính phạm vi

Trong yêu cầu ban đầu, FL-06 và FL-07 được nêu làm ví dụ lab Hoá. Hai lab này không thuộc nhóm Hoá:

- FL-06 là đòn bẩy, thuộc K5 Cơ học.
- FL-07 là năng lượng nhiệt, thuộc K4 Bàn nhiệt.

Theo §6A.3 của catalog, kit Hoá là **K2 Bàn hoá ướt**, gồm FL-10 đến FL-15:

| ID | Nội dung | Quyết định catalog | Hiện trạng |
|---|---|---|---|
| FL-10 | Mol và PTHH | SPLIT | Activity Bảo toàn khối lượng v1 đang ACTIVE (guided, chấm server) |
| FL-11 | Dung dịch và nồng độ | KEEP | Chưa làm |
| FL-12 | Tốc độ phản ứng | KEEP | Chưa làm (cần mô hình theo thời gian) |
| FL-13 | Acid–base, chỉ thị, pH | SHARE | Chưa làm (chỉ có fixture quỳ `chemistry@1.0.0` TECHNICAL_FIXTURE_ONLY) |
| FL-14 | Phản ứng vô cơ, kim loại | SPLIT | Chưa làm |
| FL-15 | An toàn phòng thí nghiệm | KEEP | Chưa làm |

Ba lab áp thử ở §6 là **FL-13**, **FL-14a** (một mode hẹp đề xuất của FL-14) và **FL-10 Explore** (chế độ khám phá cạnh activity guided hiện có).

---

## 1. Khảo sát codebase (Bước 1)

### 1.1 Tái sử dụng được ngay

| Thành phần | Vị trí | Dùng cho |
|---|---|---|
| Phòng nền 3D | `FE-NexaLab/src/features/labs/shared/PhysicalLabEnvironment.tsx` | Nền của bàn K2, không sửa |
| Shell fullscreen | `shared/LabSpace.tsx` | Khung Stage 1–3 |
| Mesh cốc thuỷ tinh và cân | `chemistry/wet-bench/WetBenchStage.tsx` (`Vessel`, cân điện tử) | Tách thành `Beaker3D`, `Scale3D` của kit |
| Hook kéo trên mặt phẳng ngang | `physics/electricity/induction/apparatus/drag.ts` (`useBenchDrag`: raycast, pointer capture, tạm tắt OrbitControls, phân biệt click/drag) | Tổng quát hoá thành `useSnapDrag` |
| Toggle 2D/3D và lưu preference | `shared/LabRendererToggle.tsx` | Giữ nguyên |
| Quy ước số nguyên an toàn (mg, mmol, hậu tố đơn vị) | `packages/sim/mass-conservation.ts` | Áp cho engine mới (µL, µmol, mg, centi-pH) |
| Bảng 6 phản ứng mẫu | `packages/sim/index.ts:238` (`reactions`) | Tham khảo dữ liệu. Không dùng lại contract vì nó chọn phản ứng theo `reactionId` |
| Pattern draft IndexedDB | `runtime/lab-run-host.ts:44-111` | Lưu `ObservationLog` cục bộ |
| Câu hỏi giáo viên tự chấm | `StudentClassLabAdditionalResponses` + `ClassLabAdditionalResponse` | Drawer Stage 3 trong Class Lab |
| Trường intro đã có trong DB | `PracticalActivityVersion.spec`: objective, materials, safety, limitations | Đặt tên field config trùng để sau này BE cấp dữ liệu |
| zustand, `defineText` i18n, `lazy` dev route | Có sẵn trong FE | Store của bàn, copy, `/dev/lab-kits/k2` |

### 1.2 Chỗ đang hardcode theo bước

- **`MassConservationActivity.tsx`.** Bốn bước cố định PREDICTED → READ_BEFORE → MIXED → READ_AFTER. Toàn bộ câu hỏi, đáp án và feedback viết thẳng trong component.
- **`WetBenchStage.tsx`.** Chỉ nhận `mixed`, `pouring`, `scaleReading` cho đúng hai cốc. Không có khái niệm dụng cụ, vị trí hay chất.
- **`fl-10-events.ts:11`.** Server bắt đúng thứ tự sự kiện. `fl10VisibleReadings` chỉ lộ số cân sau khi sự kiện tương ứng được ghi.
- **`mass-conservation.ts`.** Chỉ chấp nhận đúng một fixture BaCl₂ + Na₂SO₄. Không trộn được chất khác.
- **`labs.controller.ts:243`.** `POST /simulate` từ chối FL-10 (`FL10_USE_LAB_RUN_EVENTS`).
- **`Lab.tsx:404`.** Có nhánh riêng `if (id === "mass-conservation")`.
- **Legacy `chemistry@1.0.0`.** Học sinh *chọn* `reactionId` rồi nhập mol: quy trình đi theo câu hỏi, không phải trộn chất. `Chemistry.tsx` hardcode màu quỳ ngay trên client (lọ 3 "xanh"), màu không lấy từ model.
- **`GET /labs`.** Không trả `materials`, `safety`, `limitations` từ activity spec. Lưu ý an toàn chỉ có trong bước 0 của FL-10.

**Kết luận:** Phần hiển thị (phòng, cốc, cân) và hạ tầng (shell, drag, draft) tái dùng được. Phần chưa có là một **mô hình trộn chất tổng quát**, **dụng cụ khai báo bằng dữ liệu**, và **tương tác snap-to-zone**. Pilot xây ba phần đó và không đụng contract guided của FL-10.

---

## 2. Kiến trúc tổng thể

### 2.1 Phân lớp và nơi đặt code

```
packages/sim (BE, vendored sang FE)         FE-NexaLab/src/features/labs
┌──────────────────────────────────┐        ┌─────────────────────────────────────────┐
│ wet-bench/  (KHOA HỌC, thuần)    │        │ chemistry/wet-bench/kit/  (HIỂN THỊ)    │
│  species.ts    chất, M, màu ion  │        │  apparatus-manifest.ts  ApparatusDef    │
│  reagents.ts   ReagentRegistry   │◀──────▶│  bench-layout.ts        BenchSlot       │
│  reactions.ts  k2-reactions@1    │  types │  interaction-rules.ts   tool×zone→op    │
│  engine.ts     applyOperation,   │        │  bench-reducer.ts       state + undo    │
│                observeVessel     │        │  apparatus/*3D.tsx      mesh dụng cụ    │
│  contracts.ts  zod: VesselState, │        │  effects/*              bọt, kết tủa…   │
│   Operation, Observation,        │        │  ExploreBench.tsx       Stage 1–3       │
│   ChemistryLabConfig (phần KH)   │        ├─────────────────────────────────────────┤
└──────────────────────────────────┘        │ chemistry/wet-bench/labs/*.explore.ts   │
                                            │   ChemistryLabConfig (mỗi lab 1 file)   │
                                            ├─────────────────────────────────────────┤
                                            │ shared/LabIntroOverlay, ObservationDrawer│
                                            └─────────────────────────────────────────┘
```

Nguyên tắc chia:

- **Hoá học nằm trong `packages/sim`**: chất, nồng độ, phản ứng, màu, pH, hiện tượng. Đây là dữ liệu cần review và golden test, và server sau này dùng lại y nguyên.
- **Dụng cụ, vị trí, mesh nằm trong FE kit.** Đây là presentation dùng chung, không mang sự thật khoa học.
- **`ChemistryLabConfig`** có schema zod nằm trong `packages/sim/wet-bench/contracts.ts`, để BE validate và ghim khi đưa vào release ở pha 2. File config của từng lab nằm ở FE trong pilot. `apparatus.kind` là enum chung; hình học chi tiết vẫn ở FE.

### 2.2 Luồng dữ liệu một thao tác

```
Học sinh kéo lọ HCl → miệng ống nghiệm T1
  (hoặc: click lọ HCl → click T1; hoặc: Tab tới "Lọ HCl", Enter, Tab tới "Ống nghiệm 1", Enter)
        │
        ▼
interaction-rules: (source=reagent_bottle[liquid], dispenser=dropper, zone=vessel_mouth)
        → Operation { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 250 }
        │  (bị chặn nếu: dụng cụ chưa bật, chất không cấp, zone không nhận, cốc đầy)
        ▼
sim.applyOperation(vessel, op, catalog, config.allowedReactions)      ← hàm thuần
        → { vessel: VesselState', transition: { fired: [...], gasEscapedMicromoles, outOfScope? } }
        ▼
sim.observeVessel(vessel', catalog)                                    ← hàm thuần
        → ReactionObservation { visual, readings, outOfScope? }
        ▼
bench-reducer: lưu state, đẩy history (Undo), tính delta với observation trước
        ├─▶ renderer-3d / DOM mirror vẽ lại VisualState (đổi màu, bọt, kết tủa, lớp bám)
        └─▶ ObservationLog.append({ action, deltas, outOfScope }) → IndexedDB (cục bộ, không phải evidence)
```

**Explore chạy hoàn toàn ở client và không chấm điểm.** Không tạo `LabRun`, không gọi `POST /attempts`, không sinh evidence. Điều này khớp nguyên tắc "client chỉ preview, server quyết định điểm": chế độ này không có điểm để quyết định. Khi cần chấm (guided), server chạy **cùng hàm** `applyOperation`/`observeVessel` từ `packages/sim`.

### 2.3 Hai chế độ cùng tồn tại

| | Explore (mới) | Guided / Assessed (giữ nguyên) |
|---|---|---|
| Khoá thứ tự | Không | Có (event order và evaluator hiện tại) |
| Server | Không gọi | `LabRun`, `/events`, `/attempts` như cũ |
| Lưu | ObservationLog cục bộ | Evidence ghim tuple |
| Câu hỏi | Drawer tuỳ chọn, không chặn | Như hiện tại |
| FL-10 | `fl10-mass.explore.ts` mới | `MassConservationActivity` **không sửa** |

---

## 3. Schema (Bước 2)

Đơn vị dùng số nguyên an toàn, theo quy ước của `mass-conservation.ts`: `Microliters`, `Micromoles`, `Milligrams`, `MilliCelsius`, `CentiPh` (pH × 100). Tất cả được viết bằng zod, và type được suy ra từ schema.

### 3.1 Khoa học — `packages/sim/wet-bench/contracts.ts`

```ts
export type SpeciesId =
  | "H2O" | "HCl" | "H2SO4" | "NaOH" | "NaCl" | "Na2SO4" | "CuSO4" | "FeSO4" | "ZnSO4"
  | "ZnCl2" | "FeCl2" | "CaCl2" | "BaCl2" | "BaSO4" | "CuOH2" | "CaCO3" | "Zn" | "Fe" | "Cu"
  | "H2" | "CO2";

export type Species = {
  id: SpeciesId;
  formulaDisplay: string;              // "Cu(OH)₂"
  nameVi: string;
  molarMassTenthsGramsPerMol: number;  // 980 = 98,0 g/mol
  phase: "aq" | "s" | "l" | "g";
  /** Màu minh hoạ khi tan (ion), null = không màu. Không phải phép đo màu. */
  aqueousColor: { rgb: string; alphaPerMillimolar: number } | null;
  /** Màu chất rắn/kết tủa */
  solidColor?: string;
  /** Cách mô hình tính pH: strong_acid(nH+), strong_base(nOH-), neutral, unmodeled */
  acidBase: { kind: "strong_acid"; protons: 1 | 2 } | { kind: "strong_base"; hydroxides: 1 }
          | { kind: "neutral" } | { kind: "unmodeled" };
  reviewStatus: "unverified" | "reviewed";
};

export type ReagentId =
  | "H2O" | "HCl_0_1M" | "H2SO4_0_05M" | "NaOH_0_1M" | "CuSO4_0_1M" | "BaCl2_0_1M"
  | "Na2SO4_0_1M" | "NaCl_0_1M" | "CaCO3_chips" | "Zn_granule" | "Fe_nail" | "Cu_wire"
  | "phenolphthalein" | "litmus_solution";

export type HazardLevel = "none" | "caution" | "warning" | "danger";
export type HazardTag = "corrosive" | "irritant" | "toxic_if_swallowed" | "flammable" | "stains_skin";

/** ReagentRegistry: mỗi lọ trên kệ, định nghĩa một lần cho cả K2 */
export type Reagent = {
  id: ReagentId;
  labelVi: string;                       // "Dung dịch HCl 0,1 M"
  form: "solution" | "solid_piece" | "solid_powder" | "indicator";
  dispenser: "dropper" | "pipette" | "spatula" | "tongs";  // dụng cụ mặc định khi kéo từ lọ
  /** solution: chất tan và nồng độ; solid: một mẩu = bao nhiêu µmol */
  composition:
    | { kind: "solution"; solute: SpeciesId | null; millimolar: number; densityMilligramsPerMilliliter: number }
    | { kind: "solid"; species: SpeciesId; micromolesPerPiece: number; milligramsPerPiece: number;
        shape: "granule" | "chips" | "nail" | "wire" | "powder" }
    | { kind: "indicator"; indicator: IndicatorId; microlitersPerDrop: number };
  defaultColor: string | null;           // màu lọ trên kệ (minh hoạ)
  hazard: { level: HazardLevel; tags: HazardTag[] };
  safetyNoteSim: string;                 // "Trong mô phỏng: …"
  safetyNoteRealLab: string;             // "Ở phòng thí nghiệm thật: …"
  reviewStatus: "unverified" | "reviewed";
};

export type IndicatorId = "phenolphthalein" | "litmus";
export type IndicatorDef = {
  id: IndicatorId;
  /** Dải màu theo pH; cận dưới tính, cận trên không tính. Ngưỡng cần SME duyệt. */
  bands: Array<{ fromCentiPh: number; toCentiPh: number; color: string | null; labelVi: string }>;
};

export type ReactionId =
  | "neutral.hcl-naoh" | "neutral.h2so4-naoh"
  | "metal-acid.zn-hcl" | "metal-acid.fe-hcl" | "metal-acid.zn-h2so4"
  | "displace.fe-cuso4" | "displace.zn-cuso4"
  | "precip.bacl2-na2so4" | "precip.cuso4-naoh"
  | "gas.caco3-hcl";

/** Một phản ứng đã review: hệ số, sản phẩm, gợi ý hiện tượng */
export type ReactionRule = {
  id: ReactionId;
  equationDisplay: string;                         // "Fe + CuSO₄ → FeSO₄ + Cu"
  reactants: Array<{ species: SpeciesId; coeff: number }>;
  products: Array<{ species: SpeciesId; coeff: number; fate: "dissolved" | "precipitate" | "coating" | "gas" | "solvent" }>;
  /** Cảm giác nhiệt định tính; nhiệt độ số chưa mô hình hoá ở v1 */
  thermalCue: "none" | "warms" | "cools";
  /** Ước lượng cường độ sủi bọt theo hình dạng chất rắn, chỉ để diễn hoạ */
  gasVigor?: Partial<Record<"granule" | "chips" | "nail" | "wire" | "powder", "low" | "medium" | "vigorous">>;
  phenomenonVi: string;                            // "Đinh sắt phủ lớp đỏ, dung dịch nhạt màu xanh"
  reviewStatus: "unverified" | "reviewed";
  goldenCaseIds: string[];
};

/** Danh mục phản ứng của kit, có version; lab chỉ chọn tập con */
export type ReactionCatalog = {
  id: "k2-reactions";
  version: 1;
  reactions: ReactionRule[];
  /** Cặp đã review là "không phản ứng trong phạm vi KHTN 8–9" (Cu + HCl loãng, NaCl + HCl…) */
  inertPairs: Array<[SpeciesId, SpeciesId]>;
  /** Chất tham gia cặp-kiểm-tra; H2O, chỉ thị và khí không cần cặp */
  pairCheckedSpecies: SpeciesId[];
};
```

**Vật chứa, thao tác, quan sát:**

```ts
export type VesselKind = "beaker" | "test_tube" | "erlenmeyer_flask" | "waste_beaker";

export type VesselState = {
  vesselId: string;
  kind: VesselKind;
  capacityMicroliters: number;
  tareMilligrams: number;
  stoppered: boolean;                                // true → khí ở lại trong bình
  solutionMicroliters: number;
  dissolved: Partial<Record<SpeciesId, number>>;     // µmol
  solids: Array<{ pieceId: string; species: SpeciesId; shape: "granule" | "chips" | "nail" | "wire" | "powder";
                  micromoles: number; initialMicromoles: number;
                  coating?: { species: SpeciesId; micromoles: number } }>;
  precipitates: Partial<Record<SpeciesId, number>>;  // µmol
  trappedGas: Partial<Record<SpeciesId, number>>;    // µmol, chỉ khi stoppered
  indicators: Partial<Record<IndicatorId, number>>;  // số giọt
  contentMilligrams: number;                         // sổ sách khối lượng, trừ khí thoát
  outOfScope: OutOfScope | null;                     // khi khác null, vật chứa "đóng băng" đến khi đổ bỏ
};

export type Operation =
  | { type: "add_liquid"; vesselId: string; reagentId: ReagentId; microliters: number }
  | { type: "add_solid"; vesselId: string; reagentId: ReagentId; pieces: number }
  | { type: "add_indicator"; vesselId: string; reagentId: ReagentId; drops: number }
  | { type: "pour_all"; fromVesselId: string; toVesselId: string }
  | { type: "toggle_stopper"; vesselId: string }
  | { type: "empty_to_waste"; vesselId: string };

export type OutOfScope = {
  code: "PAIR_NOT_IN_LAB_SCOPE" | "PAIR_UNREVIEWED" | "PH_UNMODELED" | "OVER_CAPACITY_BLOCKED";
  species?: [SpeciesId, SpeciesId];
  messageVi: string;   // "Tổ hợp chất này nằm ngoài phạm vi mô hình của bài thực hành."
};

export type Transition = {
  fired: Array<{ reactionId: ReactionId; extentMicromoles: number }>;
  gasEscapedMicromoles: Partial<Record<SpeciesId, number>>;
  outOfScope: OutOfScope | null;
};

/** Trạng thái hiển thị khai báo; renderer chỉ vẽ lại, không tính */
export type VesselVisualState = {
  liquidColor: string | null;          // rgba minh hoạ, trộn từ ion màu + chỉ thị
  liquidLevel: number;                 // 0..1 theo capacity
  gasBubbles: { intensity: "none" | "low" | "medium" | "vigorous"; gasId: SpeciesId | null };
  precipitate: { color: string; amount: number /* 0..1 */ } | null;
  solidSamples: Array<{ pieceId: string; type: string; remainingRatio: number; surfaceCoatingColor: string | null }>;
  thermalCue: "none" | "warms" | "cools";
};

export type ReactionObservation = {
  vesselId: string;
  visual: VesselVisualState;
  readings: {
    centiPh: number | null;            // null khi không có dung dịch hoặc PH_UNMODELED
    contentMilligrams: number;         // để cân cộng tare
  };
  firedSinceLast: Transition["fired"];
  outOfScope: OutOfScope | null;
  modelVersion: "wet-bench@1.0.0";
  catalogVersion: 1;
};

export declare function applyOperation(
  bench: Record<string, VesselState>, op: Operation,
  ctx: { catalog: ReactionCatalog; allowedReactions: readonly ReactionId[]; reagents: readonly ReagentId[] },
): { ok: true; bench: Record<string, VesselState>; transition: Transition } | { ok: false; code: "INVALID_OPERATION" | "UNKNOWN_REAGENT" | "REAGENT_NOT_AVAILABLE" | "VESSEL_FULL" };

export declare function observeVessel(vessel: VesselState, catalog: ReactionCatalog, last: Transition | null): ReactionObservation;
```

**Quy tắc engine (v1):**

1. **Phản ứng xảy ra tức thời đến hết chất hạn chế.** Engine lặp qua các phản ứng có đủ chất, theo thứ tự cố định (ưu tiên, rồi id), cho tới khi không còn phản ứng nào chạy. Đây là giới hạn đã khai báo: v1 không mô phỏng tốc độ (FL-12 cần model riêng).
2. **Quy tắc phạm vi, phần quan trọng nhất.** Với mỗi cặp chất trong `pairCheckedSpecies` cùng có mặt:
   - cặp nằm trong `allowedReactions` của lab → phản ứng;
   - cặp thuộc `inertPairs` → không phản ứng;
   - cặp có trong catalog nhưng lab không cho phép → `PAIR_NOT_IN_LAB_SCOPE`;
   - cặp không có ở đâu → `PAIR_UNREVIEWED`.

   **Thiếu luật không có nghĩa là không phản ứng.** Engine không bao giờ tự suy ra "không có hiện tượng".
3. **pH.** Tính từ lượng acid/base mạnh còn dư, chia cho thể tích. Nếu dung dịch có chất `acidBase: unmodeled` (CuSO₄, FeSO₄, ZnCl₂…) và lượng acid/base mạnh dư dưới ngưỡng `phDominanceMillimolar` (tham số chờ duyệt), thì phép đo pH trả `PH_UNMODELED`. Khi đó chỉ phép đo bị chặn, vật chứa vẫn hoạt động.
4. **Khối lượng.** `contentMilligrams` cộng khối lượng mỗi lần thêm chất. Khi vật chứa mở, trừ khối lượng khí thoát. Khi đậy nút, khí giữ trong `trappedGas`. Nhờ vậy FL-10 Explore cho thấy được: cốc mở có khí thoát thì số cân giảm, bình kín thì số cân giữ nguyên.
5. **Màu dung dịch.** Trộn alpha từ ion màu theo nồng độ, rồi phủ màu chỉ thị theo dải pH. Mọi màu được gắn nhãn "màu minh hoạ".
6. **Bọt khí.** Cường độ lấy từ `gasVigor` của phản ứng theo hình dạng chất rắn, cộng lượng khí sinh ra ở lần thao tác cuối. Renderer cho bọt tắt dần, và tắt hẳn khi bật reduced motion.

### 3.2 Bàn và dụng cụ — `FE-NexaLab/src/features/labs/chemistry/wet-bench/kit/`

```ts
export type ApparatusKind =                         // enum chung, re-export từ sim contracts
  | "beaker" | "test_tube" | "erlenmeyer_flask" | "waste_beaker" | "test_tube_rack"
  | "reagent_shelf" | "dropper" | "pipette" | "spatula" | "tongs" | "stopper"
  | "litmus_paper" | "ph_meter" | "thermometer" | "scale" | "burner";

export type SnapZoneKind = "vessel_mouth" | "bench_slot" | "rack_slot" | "scale_slot" | "heater_slot" | "probe_port";

export type ToolKind = "dropper" | "pipette" | "spatula" | "tongs" | "stopper" | "litmus_paper"
                     | "ph_meter" | "thermometer" | "held_vessel";

export type SnapZone = {
  id: string;                        // "mouth"
  kind: SnapZoneKind;
  accepts: ToolKind[];               // vessel_mouth nhận dropper/spatula/tongs/ph_meter/…
  anchor: [number, number, number];  // offset cục bộ (m)
  radius: number;                    // bán kính bắt dính khi kéo
};

/** ApparatusManifest: định nghĩa MỘT lần cho K2 */
export type ApparatusDef = {
  kind: ApparatusKind;
  role: "vessel" | "source" | "tool" | "instrument" | "fixture";
  labelVi: string;                   // "Ống nghiệm"
  purposeVi: string;                 // "Chứa lượng nhỏ hoá chất để quan sát phản ứng"
  placeOn: SnapZoneKind[];           // vị trí được phép đặt
  zones: SnapZone[];                 // vùng nhận trên chính dụng cụ
  vessel?: { kind: VesselKind; capacityMicroliters: number; tareMilligrams: number; stopperable: boolean };
  tool?: ToolKind;                   // khi cầm lên thì là tool gì
  renderer3d: "Beaker3D" | "TestTube3D" | "Erlenmeyer3D" | "ReagentBottle3D" | "Dropper3D"
            | "Spatula3D" | "Tongs3D" | "PhMeter3D" | "LitmusStrip3D" | "Scale3D" | "Rack3D"
            | "Thermometer3D" | "Burner3D" | "WasteBeaker3D";
  lowTierFallback: "primitive" | "hide";
};

export type BenchSlot = { id: string; kind: SnapZoneKind; position: [number, number, number]; labelVi: string };
// Bố cục cố định của K2: shelf (6 lọ), bench_1..bench_4, rack_1..rack_4, scale_1, heater_1, tool_tray

/** Bảng quy tắc tương tác: (vật đang cầm × zone) → Operation. Viết một lần. */
export type InteractionRule = {
  held: { tool: ToolKind; loaded?: Reagent["form"] };
  zone: SnapZoneKind;
  op: (ctx: { heldReagent?: ReagentId; targetId: string; preset: QuantityPreset }) => Operation | "measure_ph" | "measure_temp" | "dip_paper" | "place";
  quantityPresets?: QuantityPreset[];  // dropper: 1 giọt / 5 giọt; pipette: 1 mL / 5 mL; tongs: 1 mẩu
};
```

Trải nghiệm kéo-thả gói gọn trong ba bước, cả ba đều áp dụng chung cho toàn kit:

1. **Kéo thẳng từ lọ.** Học sinh không phải tự lấy dụng cụ trước. Kéo lọ HCl vào ống nghiệm thì kit dùng `dispenser` mặc định của lọ đó (ống nhỏ giọt). Các dụng cụ đo (máy đo pH, giấy quỳ, nhiệt kế) kéo từ khay dụng cụ.
2. **Snap theo vùng gần nhất.** Khi đang kéo, zone gần con trỏ nhất trong bán kính `radius` mà chấp nhận vật đang cầm sẽ sáng lên. Thả ra thì snap vào zone đó. Ngoài mọi zone thì vật trả về chỗ cũ, không tạo thao tác nào.
3. **Phương án thay thế bắt buộc.** Click để chọn, click để áp dụng; bàn phím qua `BenchAccessibleControls`, một danh sách DOM phản chiếu kệ, khay và vật chứa (Tab/Enter/Esc). Chip "Đang cầm" có nút huỷ. Trên màn cảm ứng: chạm một ngón để kéo dụng cụ, hai ngón để xoay camera.

### 3.3 Lab — `ChemistryLabConfig` (schema trong sim, file trong FE)

```ts
export type ChemistryLabConfig = {
  schema: "k2-lab-config/1";
  labId: string;                       // danh tính Lab, KHÔNG phải id kit
  catalogId: string;                   // "FL-13"
  configVersion: number;
  kit: "k2-wet-bench@1";
  engine: "wet-bench@1.0.0";
  reactionCatalog: "k2-reactions@1";

  // Stage 1 — trùng tên với PracticalActivityVersion.spec để BE cấp sau này
  title: string;
  outcomeSummary: string[];            // 1–3 ý, ngôn ngữ học sinh
  outcomeCodes?: string[];             // chỉ khi đã review
  safetyBriefing: { simulation: string[]; realLab: string[]; acknowledgeRequired: boolean };
  limitations: string[];

  modes: { explore: true; guided?: { rendererKey: string } };

  // Stage 2
  enabledApparatus: Array<{
    id: string;                        // "T1"
    kind: ApparatusKind;
    slot: string;                      // BenchSlot.id
    labelVi?: string;                  // "Ống nghiệm 1"
    initial?: { contents?: Array<{ reagentId: ReagentId; microliters?: number; pieces?: number }>; stoppered?: boolean };
  }>;
  availableReagents: Array<{ reagentId: ReagentId; shelfPosition: number; maxUses?: number }>;
  allowedReactions: ReactionId[];      // tập con của k2-reactions@1
  measurements: Array<"ph_meter" | "litmus_paper" | "scale">;
  outOfScopeMessageVi?: string;        // ghi đè thông điệp mặc định nếu cần

  // Stage 3
  pedagogy: {
    revealEquations: "never" | "after_observation" | "always";
    observationPrompts?: ObservationPrompt[];
  };
  review: { status: "draft" | "reviewed"; notes?: string };
};

export type ObservationPrompt = {
  id: string;
  textVi: string;
  kind: "note" | "choice" | "free_text";
  choices?: Array<{ id: string; labelVi: string }>;   // không có đáp án đúng trong explore
  focus?: { apparatusId?: string; reagentId?: ReagentId };   // nút "chỉ cho em" làm sáng dụng cụ
  highlightWhen?: { reaction?: ReactionId; measurement?: "ph_meter" | "litmus_paper" | "scale" };  // chỉ gắn badge "mới", không mở khoá
};
```

**Validator dùng chung:** `validateChemistryLabConfig(config, { kit, reagents, catalog })` được gọi trong test và khi load dev route. Nó báo lỗi khi:

- `kind` không có trong manifest, hoặc slot bị trùng hay đặt sai loại zone;
- `reagentId` lạ, hoặc `ReactionId` không thuộc catalog;
- một reaction cần chất không có trên kệ (cảnh báo: phản ứng không thể xảy ra);
- `measurements` cần dụng cụ chưa bật;
- prompt trùng id;
- `review.status: "reviewed"` mà còn reaction hoặc reagent ở trạng thái `unverified`. Đây là chặn cứng trước khi gắn vào release.

---

## 4. Luồng UI/UX ba giai đoạn (Bước 3)

Toàn bộ chạy trong `LabSpace`. Góc trên trái giữ tiêu đề và nút Thoát như hiện nay.

### Stage 1 — `LabIntroOverlay` (shared, dùng được cho mọi kit)

Overlay hiện khi mở lab. Mở lại được bất cứ lúc nào bằng nút ⓘ.

1. **Em sẽ tìm hiểu:** các ý `outcomeSummary`.
2. **Dụng cụ trên bàn:** lấy từ `enabledApparatus` cộng `labelVi`/`purposeVi` của manifest, kèm icon nhỏ.
3. **Hoá chất:** lấy từ `availableReagents` cộng registry, kèm badge mức nguy hiểm (`hazard.level`) và tag (ăn mòn, độc khi nuốt…).
4. **Lưu ý an toàn:** chia hai cột rõ ràng.
   - **Trong mô phỏng:** gộp `safetyBriefing.simulation` và `safetyNoteSim` của từng chất.
   - **Ở phòng thí nghiệm thật:** gộp `safetyBriefing.realLab` và `safetyNoteRealLab`.

   Ghi chú cố định: "Lab ảo không thay thế hướng dẫn của giáo viên".
5. **Giới hạn mô hình:** các ý `limitations`.
6. Nút **"Vào bàn thí nghiệm"**.
   - Khi `acknowledgeRequired` là true, nút có dạng "Em đã đọc lưu ý an toàn". Lựa chọn này được nhớ cục bộ theo lab và `configVersion`, không phải evidence.

### Stage 2 — Bàn thí nghiệm (Explore)

```
┌ Tiêu đề · Thoát ─────────────────────────────── ⓘ  2D/3D  ↶ Hoàn tác ┐
│ ┌Kệ hoá chất (3D + list DOM)┐                         ┌Nhật ký ────┐ │
│ │ HCl  NaOH  CuSO₄  Zn  …   │      [ BÀN 3D ]         │ 1. HCl → T1│ │
│ └───────────────────────────┘   T1  T2  T3  cốc  cân  │ 2. Phenol… │ │
│                                                        │   → hồng   │ │
│ [Đang cầm: Ống nhỏ giọt · NaOH 0,1 M · 1 giọt ▾ · Esc] └────────────┘ │
│ Khay dụng cụ: giấy quỳ · máy đo pH · kẹp · nút cao su · cốc thải       │
│ ▸ Gợi ý quan sát (2 mới)                                              │
└───────────────────────────────────────────────────────────────────────┘
```

- **Hover hoặc focus vào dụng cụ** hiện tooltip tên và công dụng. **Click vào vật chứa** mở `VesselInspector`, một thẻ nhỏ gồm:
  - thành phần đã thêm, theo tên lọ (không lộ sản phẩm nếu `revealEquations: "never"`);
  - mức chất lỏng;
  - số đo (chỉ hiện sau khi học sinh thật sự đo bằng máy pH, giấy quỳ hay cân);
  - nút "Đổ vào cốc thải".
- **Thao tác:** kéo-thả hoặc chọn-rồi-áp, như ở §3.2.
  - Lượng thêm chọn theo preset (1 giọt, 5 giọt, 1 mL, 1 mẩu), không nhập số tự do. Nhờ vậy không gian state có giới hạn và review được.
  - Thêm vượt dung tích thì bị chặn kèm thông báo "Ống nghiệm đã đầy".
- **Hiện tượng** được vẽ ngay từ `VesselVisualState`: đổi màu, sủi bọt, kết tủa lắng, lớp đồng bám, chất rắn nhỏ dần. Mỗi hiệu ứng có bản thay thế bằng chữ trong `aria-live` (ví dụ "Ống nghiệm 1: xuất hiện kết tủa xanh lam").
- **Ngoài phạm vi:** vật chứa hiện viền chấm và thẻ "Tổ hợp chất nằm ngoài phạm vi mô hình của bài thực hành này". Hiện tượng đóng băng ở trạng thái hợp lệ cuối. Hai lối ra là **Hoàn tác** hoặc **Đổ bỏ**. Engine không bịa hiện tượng.
- **Hoàn tác:** state là thuần, nên reducer giữ stack history, tối đa 50 bước.
- **Nhật ký thí nghiệm** (`ObservationLog`) tự sinh từ delta giữa hai lần observation:
  - mỗi dòng gồm thao tác, vật chứa và hiện tượng thay đổi;
  - phương trình chỉ hiện theo `revealEquations`;
  - lưu IndexedDB theo `labId`, `configVersion`; có nút "Xoá nhật ký" và "Bắt đầu lại bàn".
- **Thiết bị yếu:** `lowTierFallback` hạ hiệu ứng (bọt ít hạt, bỏ transmission). Khi WebGL lỗi, tự chuyển sang danh sách DOM. Mọi thao tác vẫn làm được vì `BenchAccessibleControls` là đường thao tác đầy đủ, không chỉ là trang trí.

### Stage 3 — `ObservationDrawer` (shared)

- Drawer thu gọn ở cạnh dưới (mobile) hoặc cạnh phải (desktop). Mở và đóng được bất cứ lúc nào. **Không bao giờ chặn bàn.**
- **Tab "Gợi ý quan sát":** `observationPrompts`.
  - Kiểu `choice` không có đáp án đúng, chỉ để học sinh tự ghi nhận. Kiểu `free_text` lưu cục bộ.
  - Nút "Chỉ cho em" làm sáng dụng cụ ghi trong `focus`.
  - `highlightWhen` chỉ thêm badge "mới" khi hiện tượng liên quan vừa xảy ra.
- **Tab "Câu hỏi của giáo viên"** (chỉ Class Lab): dùng lại `StudentClassLabAdditionalResponses` cùng `reportPrompts`, do giáo viên chấm như hiện tại.
- **Tab "Nhật ký":** cùng `ObservationLog` ở trên; trên mobile thì gộp vào drawer.

---

## 5. Data contract của pha tích hợp (để không phải làm lại)

Pha này không thuộc pilot, chỉ chốt hướng:

- **Pha 1:**
  - `GET /labs` (hoặc launch) trả thêm `intro { objective, materials, safety, limitations }` từ `release.snapshot.activity.spec`, cùng `exploreConfigRef`.
  - `Lab.tsx` hiện bộ chọn mode "Khám phá tự do / Thực hành có chấm" cho lab có cả hai, mặc định là Khám phá.
  - Nhánh FL-10 guided giữ nguyên.
- **Pha 2:**
  - Ghim `ChemistryLabConfig` vào `SimulationPackVersion.template.explore`, để release có digest và để server validate bằng chính `validateChemistryLabConfig`.
  - Class Lab thêm `content.mode: "explore" | "guided"`. Giáo viên bật hoặc tắt prompt và thêm `reportPrompts`. Không cho sửa `allowedReactions` hay chất (đó là khoa học đã ghim).
- **Pha 3:** activity guided mới trên wet-bench, dùng `MODEL_REGISTRY["wet-bench@1.0.0"]`, rubric mới, và server replay chuỗi `Operation`. Đây là lúc Explore và chấm điểm dùng chung một engine.

---

## 6. Ba lab áp thử (Bước 4)

Ba file dưới đây dùng **cùng kit, cùng component, cùng engine**. Chúng chỉ khác `enabledApparatus`, `availableReagents`, `allowedReactions`, `measurements` và prompt. Số liệu đều là bản nháp chờ SME.

### 6.1 FL-13 — Chỉ thị màu và pH (`labs/fl13-indicators.explore.ts`)

```ts
export const fl13IndicatorsExplore: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "acid-base-indicators", catalogId: "FL-13", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", reactionCatalog: "k2-reactions@1",
  title: "Acid, base và chất chỉ thị",
  outcomeSummary: [
    "Dùng quỳ tím và phenolphthalein để nhận biết dung dịch acid, base.",
    "Đo pH và thấy pH thay đổi khi thêm dần base vào acid.",
  ],
  safetyBriefing: {
    simulation: ["Thao tác ảo không gây nguy hiểm; các màu là minh hoạ."],
    realLab: ["HCl và NaOH gây bỏng da và mắt: đeo kính, găng tay; chỉ làm khi có giáo viên.",
              "Không nếm, không ngửi trực tiếp hoá chất."],
    acknowledgeRequired: true,
  },
  limitations: ["pH chỉ tính cho acid và base mạnh ở nồng độ loãng.", "Phản ứng xảy ra tức thời; không mô phỏng nhiệt độ."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "T1", kind: "test_tube", slot: "rack_1", labelVi: "Ống nghiệm 1" },
    { id: "T2", kind: "test_tube", slot: "rack_2", labelVi: "Ống nghiệm 2" },
    { id: "T3", kind: "test_tube", slot: "rack_3", labelVi: "Ống nghiệm 3" },
    { id: "B1", kind: "beaker", slot: "bench_1", labelVi: "Cốc trung hoà" },
    { id: "rack", kind: "test_tube_rack", slot: "bench_2" },
    { id: "paper", kind: "litmus_paper", slot: "tool_tray" },
    { id: "meter", kind: "ph_meter", slot: "tool_tray" },
    { id: "waste", kind: "waste_beaker", slot: "bench_4" },
  ],
  availableReagents: [
    { reagentId: "HCl_0_1M", shelfPosition: 1 }, { reagentId: "NaOH_0_1M", shelfPosition: 2 },
    { reagentId: "NaCl_0_1M", shelfPosition: 3 }, { reagentId: "H2O", shelfPosition: 4 },
    { reagentId: "phenolphthalein", shelfPosition: 5 }, { reagentId: "litmus_solution", shelfPosition: 6 },
  ],
  allowedReactions: ["neutral.hcl-naoh"],
  measurements: ["ph_meter", "litmus_paper"],
  pedagogy: {
    revealEquations: "after_observation",
    observationPrompts: [
      { id: "p1", kind: "note", textVi: "Nhúng giấy quỳ vào từng lọ. Lọ nào làm quỳ đổi màu?", focus: { apparatusId: "paper" } },
      { id: "p2", kind: "choice", textVi: "Phenolphthalein có màu gì trong NaOH?",
        choices: [{ id: "pink", labelVi: "Hồng" }, { id: "none", labelVi: "Không màu" }], highlightWhen: { measurement: "ph_meter" } },
      { id: "p3", kind: "free_text", textVi: "Nhỏ dần NaOH vào cốc HCl có phenolphthalein. Khi nào màu xuất hiện, và pH lúc đó khoảng bao nhiêu?",
        focus: { apparatusId: "B1" }, highlightWhen: { reaction: "neutral.hcl-naoh" } },
    ],
  },
  review: { status: "draft" },
};
```

### 6.2 FL-14a — Kim loại tác dụng với acid và dung dịch muối (`labs/fl14a-metals.explore.ts`)

FL-14 đang là SPLIT. "14a" là mode hẹp đề xuất, chưa phải danh tính Lab đã duyệt.

```ts
export const fl14aMetalsExplore: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "metal-reactivity", catalogId: "FL-14", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", reactionCatalog: "k2-reactions@1",
  title: "Kim loại tác dụng với acid và dung dịch muối",
  outcomeSummary: [
    "Quan sát kim loại nào đẩy được hydrogen ra khỏi acid loãng.",
    "Quan sát kim loại mạnh hơn đẩy kim loại yếu hơn ra khỏi dung dịch muối.",
  ],
  safetyBriefing: {
    simulation: ["Khí H₂ trong mô phỏng chỉ là bọt minh hoạ."],
    realLab: ["Khí H₂ dễ cháy: tránh xa lửa.", "Dung dịch CuSO₄ độc khi nuốt; rửa tay sau thí nghiệm."],
    acknowledgeRequired: true,
  },
  limitations: ["Phản ứng diễn ra tức thời, không mô phỏng tốc độ.", "Không tính pH khi dung dịch chứa muối của kim loại."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "T1", kind: "test_tube", slot: "rack_1", labelVi: "Ống nghiệm 1" },
    { id: "T2", kind: "test_tube", slot: "rack_2", labelVi: "Ống nghiệm 2" },
    { id: "T3", kind: "test_tube", slot: "rack_3", labelVi: "Ống nghiệm 3" },
    { id: "T4", kind: "test_tube", slot: "rack_4", labelVi: "Ống nghiệm 4" },
    { id: "rack", kind: "test_tube_rack", slot: "bench_2" },
    { id: "tongs", kind: "tongs", slot: "tool_tray" },
    { id: "waste", kind: "waste_beaker", slot: "bench_4" },
  ],
  availableReagents: [
    { reagentId: "HCl_0_1M", shelfPosition: 1 }, { reagentId: "CuSO4_0_1M", shelfPosition: 2 },
    { reagentId: "Zn_granule", shelfPosition: 3 }, { reagentId: "Fe_nail", shelfPosition: 4 },
    { reagentId: "Cu_wire", shelfPosition: 5 },
  ],
  allowedReactions: ["metal-acid.zn-hcl", "metal-acid.fe-hcl", "displace.fe-cuso4", "displace.zn-cuso4"],
  // Cu + HCl và Cu + CuSO4 nằm trong inertPairs: hợp lệ, "không có hiện tượng"
  measurements: [],
  pedagogy: {
    revealEquations: "after_observation",
    observationPrompts: [
      { id: "p1", kind: "note", textVi: "Thả kẽm, sắt, đồng vào ba ống HCl. Ống nào sủi bọt?", focus: { reagentId: "Zn_granule" } },
      { id: "p2", kind: "free_text", textVi: "Đinh sắt trong CuSO₄ thay đổi thế nào sau một lúc? Màu dung dịch ra sao?",
        highlightWhen: { reaction: "displace.fe-cuso4" } },
      { id: "p3", kind: "choice", textVi: "Từ quan sát, kim loại nào hoạt động mạnh hơn: sắt hay đồng?",
        choices: [{ id: "fe", labelVi: "Sắt" }, { id: "cu", labelVi: "Đồng" }] },
    ],
  },
  review: { status: "draft" },
};
```

### 6.3 FL-10 Explore — Khối lượng trước và sau phản ứng (`labs/fl10-mass.explore.ts`)

Activity guided FL-10 v1 **giữ nguyên**. File này bổ sung chế độ khám phá chạy song song, và mở rộng đúng phần "vận dụng" mà guided hiện chỉ hỏi bằng lời: cốc hở có khí thoát và bình kín.

```ts
export const fl10MassExplore: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "mass-conservation", catalogId: "FL-10", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", reactionCatalog: "k2-reactions@1",
  title: "Khối lượng trước và sau phản ứng",
  outcomeSummary: [
    "Cân hệ trước và sau phản ứng tạo kết tủa.",
    "So sánh khi có khí thoát ra khỏi cốc hở và khi khí bị giữ trong bình kín.",
  ],
  safetyBriefing: {
    simulation: ["Kết tủa trắng BaSO₄ là hình minh hoạ; số cân là số liệu mô phỏng lý tưởng."],
    realLab: ["Muối barium tan có độc tính: không tự làm tại nhà, dùng kính và găng tay.",
              "Không đậy kín bình khi có phản ứng sinh khí mạnh ngoài đời thật."],
    acknowledgeRequired: true,
  },
  limitations: ["Không mô phỏng bắn, bay hơi hay sai số cân.", "Hai cốc hở không phải hệ kín."],
  modes: { explore: true, guided: { rendererKey: "mass-conservation" } },
  enabledApparatus: [
    { id: "C1", kind: "beaker", slot: "scale_1", labelVi: "Cốc 1",
      initial: { contents: [{ reagentId: "BaCl2_0_1M", microliters: 20000 }] } },
    { id: "C2", kind: "beaker", slot: "bench_1", labelVi: "Cốc 2",
      initial: { contents: [{ reagentId: "Na2SO4_0_1M", microliters: 20000 }] } },
    { id: "F1", kind: "erlenmeyer_flask", slot: "bench_2", labelVi: "Bình tam giác" },
    { id: "stopper", kind: "stopper", slot: "tool_tray" },
    { id: "scale", kind: "scale", slot: "scale_1" },
    { id: "waste", kind: "waste_beaker", slot: "bench_4" },
  ],
  availableReagents: [
    { reagentId: "HCl_0_1M", shelfPosition: 1 }, { reagentId: "CaCO3_chips", shelfPosition: 2 },
    { reagentId: "BaCl2_0_1M", shelfPosition: 3 }, { reagentId: "Na2SO4_0_1M", shelfPosition: 4 },
  ],
  allowedReactions: ["precip.bacl2-na2so4", "gas.caco3-hcl"],
  measurements: ["scale"],
  pedagogy: {
    revealEquations: "never",
    observationPrompts: [
      { id: "p1", kind: "note", textVi: "Đặt cả hai cốc lên cân, đọc số, rồi đổ cốc 1 vào cốc 2 và cân lại.", focus: { apparatusId: "scale" } },
      { id: "p2", kind: "free_text", textVi: "Thả đá vôi vào HCl trong cốc hở trên cân. Số cân thay đổi thế nào? Vì sao?",
        highlightWhen: { reaction: "gas.caco3-hcl" } },
      { id: "p3", kind: "free_text", textVi: "Làm lại trong bình tam giác có nút. Số cân lần này ra sao?", focus: { apparatusId: "stopper" } },
    ],
  },
  review: { status: "draft" },
};
```

### 6.4 Chứng minh tái sử dụng

| Khác nhau giữa ba lab | FL-13 | FL-14a | FL-10 Explore |
|---|---|---|---|
| `enabledApparatus` | rack, 3 ống, cốc, giấy quỳ, máy pH | rack, 4 ống, kẹp | 2 cốc, bình tam giác, nút, cân |
| `availableReagents` | HCl, NaOH, NaCl, H₂O, 2 chỉ thị | HCl, CuSO₄, Zn, Fe, Cu | HCl, CaCO₃, BaCl₂, Na₂SO₄ |
| `allowedReactions` | 1 | 4 | 2 |
| Component 3D/UI mới | 0 | 0 | 0 |

- **Từ lab thứ 2 trở đi không viết thêm component.** Mọi dụng cụ ở trên (kể cả `stopper`, `scale`, `ph_meter`) đều có sẵn trong manifest của kit, và chỉ được dựng trong pilot.
- **Phần duy nhất phát sinh theo lab là dữ liệu khoa học.** Nếu lab mới cần phản ứng chưa có trong `k2-reactions`, phải thêm `ReactionRule` cùng golden case và chờ SME duyệt. "Thêm lab trong 5 phút" chỉ đúng khi mọi phản ứng cần dùng đã có trong catalog.
- **`burner` và `thermometer`** có trong manifest nhưng không lab nào bật. Lý do: v1 chưa có mô hình nhiệt độ. Khi FL-12 cần đến thì thêm model, không thêm UI.

---

## 7. Danh sách file dự kiến

### `BE-NexaLab/packages/sim` (khoa học, thuần)

| File | Hành động |
|---|---|
| `wet-bench/contracts.ts` | **Mới.** zod schema và type ở §3.1, §3.3, cùng `ApparatusKind` |
| `wet-bench/species.ts` | **Mới.** Bảng chất (`unverified`) |
| `wet-bench/reagents.ts` | **Mới.** `ReagentRegistry`, `IndicatorDef` |
| `wet-bench/reactions.ts` | **Mới.** `k2-reactions@1`: 10 phản ứng và `inertPairs` |
| `wet-bench/engine.ts` | **Mới.** `applyOperation`, `observeVessel`, tính pH, sổ sách khối lượng |
| `wet-bench/validate-config.ts` | **Mới.** `validateChemistryLabConfig` |
| `wet-bench/engine.test.ts` | **Mới.** Ba nhóm test: (1) golden case từng phản ứng; (2) bảo toàn khối lượng (cốc mở trừ đúng khối lượng khí, bình kín giữ nguyên); (3) ngoài phạm vi (cặp chưa review ra `PAIR_UNREVIEWED`, không bịa hiện tượng) và pH (`PH_UNMODELED`, biên dải màu) |
| `wet-bench/validate-config.test.ts` | **Mới.** Test cho ba config ở §6 và các ca lỗi |
| `index.ts` | **Sửa.** Export `wet-bench/*` |
| `package.json` | **Sửa.** Thêm file vào `files`, bump version `1.7.0` |

**Không sửa trong pilot:** `mass-conservation.ts`, `chemistry@1.0.0`, `sim-packs.ts` (`MODEL_REGISTRY`), `labs.controller.ts`, `catalog.controller.ts`, `prisma/schema.prisma`, `fl-10-events.ts`, mọi evaluator.

### `FE-NexaLab`

| File | Hành động |
|---|---|
| `vendor/nexalab-sim-1.7.0.tgz`, `package.json` | **Mới / sửa.** Pack lại sim, đổi dependency |
| `src/features/labs/chemistry/wet-bench/kit/apparatus-manifest.ts` | **Mới.** `ApparatusDef` cho 16 loại dụng cụ |
| `…/kit/bench-layout.ts` | **Mới.** `BenchSlot` |
| `…/kit/interaction-rules.ts` | **Mới.** Bảng (held × zone) → Operation, preset lượng |
| `…/kit/bench-reducer.ts` + `.test.ts` | **Mới.** State bàn, chọn/cầm, áp dụng, undo, tính delta (thuần, test bằng `node --test` như `test:regression`) |
| `…/kit/bench-store.ts` | **Mới.** zustand bọc reducer |
| `…/kit/observation-log.ts` + `.test.ts` | **Mới.** Delta → dòng nhật ký, lưu IndexedDB (try/catch, hỏng thì chạy không lưu) |
| `…/kit/useSnapDrag.ts` | **Mới.** Tổng quát hoá từ `induction/apparatus/drag.ts`; FL-25 không bị đổi |
| `…/kit/apparatus/Beaker3D.tsx`, `Scale3D.tsx` | **Mới.** Tách từ `WetBenchStage.tsx` |
| `…/kit/apparatus/TestTube3D.tsx`, `Erlenmeyer3D.tsx`, `ReagentBottle3D.tsx`, `Rack3D.tsx`, `Dropper3D.tsx`, `Tongs3D.tsx`, `PhMeter3D.tsx`, `LitmusStrip3D.tsx`, `Stopper3D.tsx`, `WasteBeaker3D.tsx` | **Mới.** Procedural, không GLB |
| `…/kit/effects/LiquidColumn.tsx`, `Bubbles.tsx`, `Precipitate.tsx`, `SolidSample.tsx` | **Mới.** Vẽ `VesselVisualState`, tôn trọng reduced motion |
| `…/kit/WetBenchKitStage.tsx` | **Mới.** Dựng scene từ config, gồm `PhysicalLabEnvironment`, slot, dụng cụ, zone highlight |
| `…/kit/BenchAccessibleControls.tsx`, `HeldItemChip.tsx`, `VesselInspector.tsx`, `ObservationLogPanel.tsx` | **Mới.** DOM, bàn phím, aria-live |
| `…/kit/ExploreBench.tsx`, `kit.css`, `index.ts` | **Mới.** Ghép Stage 1–3 |
| `…/kit/dev/K2KitPreview.tsx` | **Mới.** `/dev/lab-kits/k2?lab=fl13\|fl14a\|fl10`, gắn badge "Dữ liệu hoá học chưa duyệt" |
| `src/features/labs/chemistry/wet-bench/labs/fl13-indicators.explore.ts`, `fl14a-metals.explore.ts`, `fl10-mass.explore.ts`, `index.ts` | **Mới.** Ba config ở §6 |
| `src/features/labs/shared/LabIntroOverlay.tsx` + css | **Mới.** Dùng chung cho mọi kit |
| `src/features/labs/shared/ObservationDrawer.tsx` + css | **Mới.** Dùng chung cho mọi kit |
| `src/features/labs/chemistry/wet-bench/WetBenchStage.tsx` | **Sửa (refactor).** Dùng `Beaker3D`/`Scale3D`, giữ nguyên props và hình ảnh FL-10 |
| `src/app/App.tsx` | **Sửa.** Thêm dev route `k2` (chỉ `import.meta.env.DEV`) |
| `chemistry/wet-bench/README.md`, `labs/README.md` | **Sửa.** Ghi kit core và quy ước thêm lab |
| `tests/k2-explore-bench.spec.ts` | **Mới.** Playwright trên dev route: kéo-thả, click-click, bàn phím, ngoài phạm vi, undo, mobile viewport, WebGL fallback |

**Không sửa trong pilot:** `Lab.tsx`, `runtime/activity-renderers.tsx`, `runtime/lab-run-host.ts`, `MassConservationActivity.tsx`, `Chemistry.tsx`.

### Kiểm tra trước khi coi pilot là xong

- Test sim mới pass; test sim cũ (`mass-conservation.test.ts`, `sim.test.ts`…) không đổi kết quả.
- FE `npm run lint`, `npm run build`. Playwright hiện có của FL-10 (`lab-loading-regression`, các spec wet-bench) vẫn pass sau refactor `WetBenchStage`.
- Screenshot desktop và mobile của dev route cho cả ba lab, và ảnh FL-10 guided trước/sau refactor để so sánh.
- Đo sơ bộ bytes và thời gian đến tương tác. **Chưa** tính là đã pass hiệu năng Chromebook.

---

## 8. Quyết định cần chủ dự án chốt trước khi code

1. **Ba lab pilot:** FL-13, FL-14a, FL-10 Explore thay cho FL-06/07 (không phải Hoá). Đồng ý không?
2. **Renderer:** pilot làm 3D cùng điều khiển DOM đầy đủ (đề xuất), còn renderer 2D vẽ hình đặt sang pha sau. Hay theo §6A.4 làm 2D trước?
3. **Dữ liệu hoá học:** ai review `species`, `reagents`, `k2-reactions` (nồng độ, ngưỡng pH, dải màu chỉ thị, `inertPairs`)? Trước khi có review, pilot chỉ chạy ở dev route.
4. **Nhiệt độ:** v1 chỉ có cảm giác nhiệt định tính, `burner`/`thermometer` có trong kit nhưng tắt. Chấp nhận không?
5. **Nhật ký và câu trả lời Explore chỉ lưu cục bộ** trong pilot. Có cần giáo viên xem được (lưu server, không chấm) ngay từ pha 1 không?
