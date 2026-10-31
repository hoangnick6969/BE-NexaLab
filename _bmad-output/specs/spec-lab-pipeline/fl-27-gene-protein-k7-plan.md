---
id: PLAN-FL-27-K7
status: technical-candidate-unapproved
updated: 2026-10-31
branch: feat/fl27 (BE + FE)
companions:
  - SPEC.md
  - lab-pipeline-phase-plan.md
  - lab-catalog-and-shared-kits-khtn8-9.md
  - lab-portfolio-20-slots-v1.md
  - fl-03-density-k3-plan.md
---
# FL-27 Từ gene đến protein + Shared Kit K7 "Phân tử/gen" — audit và kế hoạch triển khai

> **TECHNICAL CANDIDATE / UNAPPROVED.** Code FE + BE trên nhánh `feat/fl27` là bằng chứng kỹ thuật: kit K7, renderer FL-27, model `gene-expression@1.0.0` và rubric `gene-protein-stations@1.0.0`, kiểm chứng trên PostgreSQL cô lập. Không có release, binding Lesson hay OWNER_SIGNOFF thật. Mọi Outcome dưới đây là `PROPOSED_UNAPPROVED`; outcome K9 còn điều kiện provenance. P3.5 vẫn **NOT MET**, P3.7 chưa mở.

## Cách đọc tài liệu

- **Audit (§1–§2):** ảnh chụp các spec Foundational Lab qua các commit gần nhất (BE `aca658c…ad26747`, FE `3926083…c6a98ee`, 2026-10-30 → 31) và bài học từ pilot FL-01 Circuit.
- **Technical Decisions (§3–§8):** thiết kế FL-27 và kit K7 dùng chung cho FL-27/28/30.
- **Plan (§9–§12):** phase, ticket, gate, quyết định cần chốt, rủi ro.
- **Implementation Evidence (§13):** những gì đã build trên `feat/fl27` và phạm vi kiểm chứng.

## 0. Tóm tắt

- **Định danh đúng theo catalog:** FL-27 = "Từ gene đến protein" (KHTN **9**, `KEEP / W4 / K9 cond.`), slot portfolio **20**, kit **K7 Procedural phân tử/gen**, Tier A Scene-first, Dual-View **Đọc** (`9/tu-gene-den-protein/4, 5, 7`). Yêu cầu ban đầu ghi "FL-27 K8, bộ kit 3"; trong catalog, K3 là Bàn chất lỏng (FL-03/04/05) và K8 là Cảnh nhẹ + HUD (FL-18–22, 26, 29). Plan này bám catalog: **K7** (§2 F1). Nếu owner thực sự muốn đổi kit, đó là một quyết định catalog riêng (D-1).
- **Shared kit K7** (`biology/molecular/kit/`) chứa presentation dùng chung cho FL-27 (gene–protein), FL-28 (phân bào, DEFER) và FL-30 (phân tử hữu cơ, DEFER): stage phân tử không dùng phòng vật lý, procedural DNA/RNA/enzyme/ribosome/tRNA/chuỗi polypeptide, camera rig, motion tokens, sơ đồ 2D "Đọc", HUD. Kit không chứa model, rubric, Outcome hay trình tự gene của Lab nào.
- **FL-27** có 6 trạm bám SGK KHTN 9 (KNTT) Bài 38–41: cấu trúc DNA, tái bản, phiên mã, dịch mã, đột biến điểm, kết luận DNA → RNA → protein → tính trạng. Một model đề xuất `gene-expression@1.0.0`, activity/rubric `gene-protein-stations@1`, rendererKey `gene-expression`.
- Trên nhánh này đã có Phase 2 (kit K7), Phase 3 (model + rubric BE, fixture isolated, E2E) và Phase 4 FE (renderer chạy qua run host, nộp evidence, kết quả server). Phase 5 (đo thiết bị, a11y) và Phase 6 (release) chưa làm (§14).

## 1. Audit — specs Foundational Lab qua các commit gần đây

Phạm vi đọc: `spec-lab-pipeline/{SPEC, lab-pipeline-phase-plan, lab-catalog-and-shared-kits-khtn8-9 §6A, lab-portfolio-20-slots-v1, fl-03-density-k3-plan, fl-10-*}`, `spec-fl-25-em-induction/SPEC.md`, FE `features/labs/**` (registry, `PhysicsStage`, K3 kit, FL-03, FL-25), nội dung SGK KHTN 9 trong `NexaLAB_Content tool/data/releases/khtn9-full-p2-integration.json`.

| ID | Mức | Phát hiện | Bằng chứng | Xử lý trong plan |
|---|---|---|---|---|
| F1 | Cao | Kit của FL-27 là **K7**, không phải K3/K8. FL-27 là KHTN 9 (K9 cond.). | catalog §6A.3 dòng FL-27; §6A.6 bảng kit; portfolio §3 slot 20 | §0, D-1 |
| F2 | Cao (gate) | P3.5 **NOT MET**, cap ≤ 2 track đồng thời, và FL-03 + FL-10 đang là hai technical candidate. FL-27 là track thứ ba → chỉ được làm như private engineering prototype theo yêu cầu owner (tiền lệ FL-25, ngoại lệ 2026-10-31), không release. | phase-plan "FL-03 / FL-10 status"; FL-25 SPEC §trạng thái | §10, D-2 |
| F3 | Cao (kiến trúc) | `PhysicsStage` luôn compose `PhysicalLabEnvironment`. Catalog §6A.6: K7 chỉ dùng phòng nền "nếu đúng archetype scene"; cảnh phân tử không phải phòng thực hành → K7 cần stage host riêng. Phần lifecycle Canvas/WebGL fallback/context-lost/portal hiện bị lặp giữa các stage. | `physics/shared/PhysicsStage.tsx` | K7 có `MolecularStage` riêng; ticket nền tảng P-2 gom `StageHost` dùng chung |
| F4 | Trung bình | FL-03 plan §6.1 đề xuất `shared/motion/lab-motion.ts`, nhưng code chỉ có `usePrefersReducedMotion` trong `k3-motion.ts`. Kit khác không thể import K3 mà không tạo phụ thuộc chéo kit. | `physics/fluid/kit/k3-motion.ts` | Thêm `shared/motion/usePrefersReducedMotion.ts`; K3 chuyển sau (P-3) |
| F5 | Trung bình | `K3Hud` là khung hướng dẫn tổng quát nhưng nằm trong K3 và kéo `k3.css`. | `physics/fluid/kit/hud/K3Hud.tsx` | K7 có `K7Hud` riêng cùng ngữ nghĩa; đề xuất P-4 nâng thành `shared/LabGuideHud` |
| F6 | Trung bình | `activity-renderers.tsx` import eager `DensityActivity` (kéo three/drei và K3 vào chunk Lab chung), trái với catalog §6A.6 "lazy-load scene/model theo Lab route". | `runtime/activity-renderers.tsx` | FL-27 đăng ký renderer bằng `lazy()`; FL-03 sửa riêng (P-5) |
| F7 | Trung bình | Mã outcome khác định dạng: catalog viết tắt `9/tu-gene-den-protein/N`, content tool dùng `KHTN-L9/tu-gene-den-protein/N`. | catalog §7; content release JSON | **Đã chốt (owner 2026-10-31):** BE dùng mã DB — lớp 8 `KHTN8-Bxx-Oyy` (FL-03), lớp 9 `KHTN-L9/<chủ-đề>/<n>` (FL-25). FL-10 không gắn mã trong code. FL-27 dùng `KHTN-L9/tu-gene-den-protein/{2,4,5,6,7}` trong fixture và plan; dạng `9/...` chỉ là viết tắt của catalog |
| F8 | Trung bình | Hằng số hình học DNA trong SGK (Ø 20 Å, chu kỳ xoắn 34 Å gồm 10 cặp nucleotide, 3,4 Å/cặp) là mô hình giáo khoa; B-DNA thực tế ≈ 10,5 cặp/vòng. | SGK KHTN 9 Bài 38, Hình 38.1 (claim "Kích thước của mỗi cặp nucleotide là bao nhiêu Å?") | Config dùng số SGK, ghi giới hạn mô hình; reviewer chốt (D-4) |
| F9 | Thấp | `.memlog.md` vẫn ghi "Design only: no code…" dù đã có code FL-03/10/25. | `.memlog.md` dòng đầu | Ghi chú lịch sử, không sửa trong nhánh này |
| F10 | Thấp | README FE vẫn ghi "K7 FL-27 Not implemented" và `biology/molecular/README.md` chỉ là placeholder. | FE README | Cập nhật trong commit FE |

## 2. Bài học từ pilot FL-01 Circuit và các Lab sau (FL-03, FL-25)

**Giữ nguyên:** `LabSpace` (fullscreen, inert, focus trả về), `LabSceneContext` portal, `LabRendererToggle` + preference localStorage theo Lab, `lab-run-host` (launch/draft/submit/idempotency), `lab-contract/1`, tuple LabRun bất biến, golden/invalid fixtures, release + OWNER_SIGNOFF, assignment pinning. Mẫu "dự đoán → thao tác → quan sát → giải thích". Mỗi thao tác 3D có nút DOM tương đương. Canvas `aria-hidden`, mọi thông tin đọc được nằm trong DOM.

**Từ FL-03 (K3):** kit tách khỏi Lab; config Zod strict fail-closed có `reviewStatus`; `frameloop="demand"` + `invalidate()` khi animate; chuyển động `damp` theo state, không ghi ngược state; tone mapping AgX, environment Lightformer tự dựng (không tải HDR/font từ CDN); evidence draft khớp schema server; preview dev chỉ trong `import.meta.env.DEV`.

**Khác ở FL-27:** cảnh phân tử không có dụng cụ đo hay phòng; "dụng cụ" là chính các phân tử. Kỹ năng được chấm là **đọc** quy tắc bổ sung và bảng mã di truyền, không phải đọc vạch chia. Sơ đồ 2D phải đồng bộ từ state (Dual-View Đọc), học sinh không vẽ.

## 3. Nội dung liên kết (nguồn để bám)

| Nguồn (SGK KHTN 9 KNTT, tái bản 2) | Nội dung dùng trong Lab |
|---|---|
| Bài 38 Nucleic acid và gene; outcome `/2` (chính), `/3` | DNA xoắn kép, 4 loại nucleotide A, T, G, C; nguyên tắc bổ sung A–T, G–C; Hình 38.1 (kích thước cặp nucleotide, chu kỳ xoắn); tính đa dạng và đặc trưng do trình tự; RNA mạch đơn, U thay T; mRNA, tRNA, rRNA (Hình 38.3); gene 600–1 500 cặp nucleotide (ngữ cảnh). |
| Bài 39 Tái bản DNA và phiên mã tạo RNA; `/4`, `/5` (chính) | Ba giai đoạn tái bản (tháo xoắn tách hai mạch, tổng hợp mạch mới theo nguyên tắc bổ sung, hai DNA con giống nhau và giống mẹ); phiên mã tổng hợp RNA dựa trên mạch gốc của gene, diễn ra trong nhân. PCR chỉ là ngữ cảnh. |
| Bài 40 Dịch mã và mối quan hệ từ gene đến tính trạng; `/6`, `/7` (chính) | Mã bộ ba trên mRNA; câu hỏi n = 1, 2, 3 → 4, 16, 64 tổ hợp; bảng mã di truyền (Hình 40.1), codon cùng nghĩa thường khác ở vị trí thứ ba; thí nghiệm Nirenberg–Matthaei (CCC → proline) là ngữ cảnh; sơ đồ dịch mã (Hình 40.4); DNA → mRNA → protein → tính trạng (Hình 40.5). |
| Bài 41 Đột biến gene; `/8` (hỗ trợ) | Đột biến gene là biến đổi trong cấu trúc gene; allele đột biến khác allele kiểu dại (Hình 41.1); có lợi, có hại hoặc trung tính. v1 chỉ mô phỏng **thay thế một cặp nucleotide**. |
| `9/hien-tuong-di-truyen/2` (hỗ trợ) | Gene là trung tâm của di truyền: dùng ở trạm kết luận. |

Mọi số liệu (trình tự, biến thể đột biến, hằng số hình học, bảng mã) là **config có version**, reviewer xác nhận nguồn. Bảng mã di truyền chuẩn là dữ kiện khoa học, render lại bằng code, không chụp hình SGK.

## 4. Thiết kế FL-27 (Lab, model, activity, rubric)

### 4.1 Identity

| Trường | Giá trị đề xuất |
|---|---|
| Lab key | `gene-protein` (Foundational, private cho tới release) |
| modelRef | `gene-expression@1.0.0` (mới, allowlist trong `MODEL_REGISTRY`) |
| Activity / rubric | `gene-protein-stations@1` / `gene-protein-stations@1.0.0` |
| rendererKey | `gene-expression` (đã đăng ký FE, lazy) |
| Kit | K7 `biology/molecular/kit`; không dùng `PhysicalLabEnvironment` |
| Modality | 3D và 2D "Đọc" cùng state; preference cục bộ; mặc định 3D chỉ sau parity + đo thiết bị (D-6) |

### 4.2 Sáu trạm S1–S6

| Trạm | Thao tác học sinh | Evidence | Outcome |
|---|---|---|---|
| S1 Cấu trúc DNA | Xoay/phóng to chuỗi xoắn; bật thước đo Å; đọc số cặp nucleotide mỗi chu kỳ, chiều dài chu kỳ, khoảng cách mỗi cặp, đường kính; chọn quy tắc ghép cặp. | `bpPerTurn`, `turnLengthA`, `riseA`, `diameterA`, `pairing` | /2 |
| S2 Tái bản DNA | Sắp xếp ba giai đoạn; enzyme tháo xoắn mở chạc; chọn nucleotide bổ sung cho 6 vị trí mạch mới; quan sát hai DNA con (mỗi DNA giữ một mạch cũ). | `stageOrder[3]`, `newStrand[6]`, `semiConservative` | /4 |
| S3 Phiên mã | RNA polymerase chạy dọc mạch gốc (3'→5'); chọn base cho 18 nucleotide mRNA (A→U, T→A, G→C, C→G). | `mrna[18]` | /5 |
| S4 Dịch mã | Ribosome đọc từng bộ ba từ AUG; học sinh tra bảng mã chọn amino acid cho mỗi codon tới codon kết thúc; trả lời câu n = 1/2/3. | `aminoAcids[6]`, `codonCombos` | /6, /7 |
| S5 Đột biến điểm | Biến thể run thay một nucleotide trên mạch mã hoá; học sinh đọc codon mới, tra amino acid, phân loại hậu quả. | `mutatedCodon`, `mutatedAminoAcid`, `effect` | /8 |
| S6 Kết luận | Chọn sơ đồ quan hệ DNA → mRNA → protein → tính trạng và vai trò của gene. | `flow`, `geneRole` | /7, hien-tuong-di-truyen/2 |

Không có trong v1: intron/exon, mạch ra chậm/Okazaki chi tiết, primer, điều hoà gene, đột biến mất/thêm (lệch khung), protein bậc 2–4, PCR.

### 4.3 Biến thể theo run

Pack chứa danh sách gene đã review (trình tự mạch mã hoá 18 nt bắt đầu ATG và kết thúc bằng codon stop) và các đột biến điểm (vị trí, base mới, loại hậu quả). Server chọn `variantId = variants[hash(runId) mod n]`, ghi vào snapshot LabRun và trả trong `runtimeParams`; evidence phải echo `variantId`. Không nhiễu ngẫu nhiên.

### 4.4 Model `gene-expression@1.0.0` (packages/sim, deterministic)

State (Zod strict): `{ variantId }` (thao tác thuần presentation không vào state). Output (server tính, renderer chỉ hiển thị sau khi nộp):

```ts
{
  version: "1.0.0",
  gene: { coding: string, template: string },        // 5'→3' và 3'→5'
  mrna: string,                                       // complement(template) với U
  codons: string[], aminoAcids: string[],             // tới stop, bảng mã chuẩn pinned
  mutation: { position: number, from: Base, to: Base, codon: string, aminoAcid: string, effect: "SILENT"|"MISSENSE"|"NONSENSE" },
  structure: { bpPerTurn: 10, turnLengthA: 34, riseA: 3.4, diameterA: 20 },   // số SGK, D-4
  validity: "VALID" | reason
}
```

Quy tắc fail-closed: trình tự chỉ gồm A/T/G/C, độ dài chia hết cho 3, bắt đầu ATG, có đúng một stop ở cuối; vị trí đột biến trong vùng mã hoá; bảng mã có 64 codon, 3 stop.

### 4.5 Evidence v1

```ts
{
  variantId,
  structure:     { bpPerTurn, turnLengthA, riseA, diameterA, pairing: "A"|"B"|"C" },
  replication:   { stageOrder: ["UNWIND"|"SYNTHESIZE"|"COMPLETE" ×3], newStrand: Base[6], semiConservative: "A"|"B"|"C" },
  transcription: { mrna: RnaBase[18] },
  translation:   { aminoAcids: (AminoAcid | "Stop")[6], codonCombos: { n1, n2, n3 } },   // dừng ở "Stop" đầu tiên
  mutation:      { mutatedCodon: string, mutatedAminoAcid: AminoAcid, effect },
  conclusion:    { flow: "A"|"B"|"C", geneRole: "A"|"B"|"C" }
}
```

Draft cục bộ dùng `null` cho ô chưa điền; chỉ nộp khi đủ (FE `geneEvidenceReady`).

### 4.6 Rubric `gene-protein-stations@1.0.0` (đề xuất, reviewer chốt)

| Tiêu chí | Đạt khi |
|---|---|
| R1 Cấu trúc | 4 số đọc đúng theo config; quy tắc A–T, G–C đúng |
| R2 Tái bản | Thứ tự 3 giai đoạn đúng; ≥ 5/6 base mạch mới đúng; chọn đúng "mỗi DNA con có một mạch cũ" |
| R3 Phiên mã | ≥ 17/18 base mRNA đúng, không dùng T trong RNA |
| R4 Dịch mã | Mọi amino acid đúng theo codon của **chính mRNA học sinh** (không phạt dây chuyền khi R3 sai) và dừng đúng ở codon stop; n = 4, 16, 64 |
| R5 Đột biến | Codon mới, amino acid mới và loại hậu quả đúng |
| R6 Khái niệm | Sơ đồ DNA → mRNA → protein → tính trạng và vai trò gene đúng |

`passed` khi R1–R6 đều đạt; ngược lại `needs_practice` với phản hồi từng trạm. Invalid → không tạo attempt.

### 4.7 Golden và invalid cases

| ID | Trường hợp | Kỳ vọng |
|---|---|---|
| G1 | Mạch mã hoá `ATG TTC GGA TGG CAT TAA` | mRNA `AUG UUC GGA UGG CAU UAA`; Met–Phe–Gly–Trp–His–Stop |
| G2 | Mạch gốc 3'→5' của G1 | `TAC AAG CCT ACC GTA ATT` |
| G3 | Thay T→A ở vị trí 6 (UUC→UUA) | Leu, MISSENSE |
| G4 | Thay G→A ở vị trí 12 (UGG→UGA) | Stop, NONSENSE |
| G5 | Thay A→G ở vị trí 9 (GGA→GGG) | Gly, SILENT |
| G6 | n = 1, 2, 3 | 4, 16, 64 |
| B1 | mRNA sai 1 base ở codon 2 | R3 đạt; R4 chấm theo codon học sinh |
| I1 | Base ngoài A/U/G/C trong mRNA, mảng sai độ dài, amino acid lạ | Validation error, không attempt |
| I2 | `variantId` không thuộc pack | Validation error |
| L1 | Idempotency, replay, revoke, đổi tuple giữa phiên | Như suite Circuit |

## 5. Technical Decisions — Shared Kit K7

### 5.1 Ranh giới và cấu trúc thư mục (FE, đã tạo trên `feat/fl27`)

```text
src/features/labs/
  shared/motion/usePrefersReducedMotion.ts     # hook dùng chung (F4)
  biology/molecular/
    kit/                                       # K7, presentation-only, dùng chung FL-27/28/30
      index.ts, k7.css
      k7-geometry.ts     # hằng số B-DNA theo config, hàm vị trí xoắn, bubble mở xoắn
      k7-palette.ts      # màu A/T/G/C/U + amino acid theo nhóm tính chất (luôn kèm chữ)
      k7-motion.ts       # thời lượng, hằng số damp, stagger
      k7-quality.ts      # tier high/mid/low → dpr, số hạt, độ chi tiết
      MolecularStage.tsx # Canvas host không phòng vật lý: nền nhân tế bào, ánh sáng, camera rig, fallback
      molecules/  DnaDuplex3D, NucleotideStrand3D, Enzyme3D, Ribosome3D, Trna3D, Polypeptide3D, Nucleoplasm3D, AngstromRuler3D
      two-d/      SequenceDiagram2D (sơ đồ Đọc đồng bộ state)
      hud/        K7Hud, BasePicker, CodonTable
      dev/        K7KitPreview (route /dev/lab-kits/k7, chỉ DEV)
    gene-protein/                              # FL-27 riêng
      fl27-gene.config.ts, gene-evidence.ts, gene-copy.ts
      GeneProteinActivity.tsx, GeneProtein3DStage.tsx, GeneProtein2DStage.tsx, GeneNotebook.tsx
      dev/GeneProteinPilotPreview.tsx           # route /dev/lab-kits/gene-protein, chỉ DEV
```

K7 **không** sở hữu trình tự gene, bảng biến thể, rubric hay Outcome. FL-28/30 chỉ reuse component khi activity riêng của chúng được review.

### 5.2 Quy ước tỉ lệ

1 đơn vị scene = 1 nm. Theo config SGK: đường kính 2,0 nm (bán kính trục phosphate 1,0), 10 cặp/chu kỳ, chu kỳ 3,4 nm, 0,34 nm/cặp. Hai mạch lệch pha ≈ 144° để tạo **rãnh lớn và rãnh nhỏ** thật sự (không đối xứng 180°). Base purine (A, G) dài hơn pyrimidine (T, C, U) theo tỉ lệ 0,56 : 0,44 của thanh ngang; liên kết hydrogen hiển thị **2 vạch cho A–T/A–U, 3 vạch cho G–C**. Mạch có chiều 5'→3' đánh dấu bằng nhãn DOM neo vào đầu mạch.

### 5.3 Dựng hình và vật liệu (three.js)

| Thành phần | Dựng hình | Vật liệu |
|---|---|---|
| Khung đường–phosphate | `InstancedMesh`: cầu phosphate + khối ngũ giác (đường deoxyribose/ribose) + đoạn trụ nối, cập nhật ma trận khi tham số mở xoắn đổi | `MeshPhysicalMaterial` clearcoat 0,6, sheen nhẹ; DNA ấm, RNA lạnh hơn để phân biệt |
| Base | `InstancedMesh` khối bo cạnh, màu theo `instanceColor` từ `k7-palette` | roughness 0,45, clearcoat |
| Liên kết H | `InstancedMesh` trụ mảnh, 2 hoặc 3 vạch | emissive nhẹ, trong suốt |
| Enzyme (helicase, DNA/RNA polymerase) | Bề mặt phân tử procedural: icosahedron chi tiết 5, dịch đỉnh bằng noise có seed (deterministic), rãnh ôm DNA | Physical, `transparent`, opacity 0,5–0,7, sheen + fresnel từ environment, `depthWrite false` |
| Ribosome | Hai tiểu đơn vị procedural (lớn/nhỏ) có kênh mRNA và vị trí E/P/A | Physical, mờ, màu rRNA |
| tRNA | Hình chữ L đơn giản hoá: thân + vòng anticodon 3 base + đầu 3' gắn amino acid | Physical |
| Chuỗi polypeptide | Hạt amino acid nối liên kết peptide, đi ra khỏi kênh thoát, uốn theo đường cong mềm | Màu theo nhóm (kị nước, phân cực, tích điện, đặc biệt) |
| Nhân tế bào | Nền gradient + `fogExp2`; hạt dịch nhân trôi chậm (Instanced, tier high/mid) | Không ảnh tải về |

Renderer: `outputColorSpace` sRGB, tone mapping AgX, environment dựng bằng `Lightformer` (không preset/HDR từ CDN), một key light + rim light lạnh. Chữ trong 3D dùng drei `Html` (DOM, không tải font).

### 5.4 Biên đạo chuyển động

Mọi chuyển động hội tụ về state (vị trí ribosome = codon hiện tại, độ mở xoắn = giai đoạn, độ dài mRNA = số base học sinh đã chọn). Không `setState` mỗi frame; `damp` trong `useFrame` qua ref; `invalidate()` khi còn chuyển động; reduced motion → nhảy tới trạng thái cuối.

| Sự kiện | Chuyển động | Thời lượng / easing | Reduced motion |
|---|---|---|---|
| Đổi trạm | Camera rig `damp` vị trí + target về preset | ≈ 0,9 s, λ = 4 | Cắt cảnh |
| Tháo xoắn | Helicase trượt tới chạc; bubble mở dần, hai mạch xoay ngược và tách ra | λ = 3,5 | Mở ngay |
| Nucleotide tự do gắn vào | Bay theo cung Bézier từ dịch nhân, xoay khớp hướng, chạm thì nháy liên kết H | 520 ms ease-out, stagger 60 ms | Hiện tại chỗ |
| Phiên mã | RNA polymerase trượt theo số base đã chọn; bubble đi theo; DNA đóng xoắn lại phía sau; mRNA bóc ra khỏi khuôn | λ = 4 | Đặt ngay |
| Dịch mã | Hai tiểu đơn vị lắp ráp ở AUG; tRNA vào vị trí A, khớp anticodon; amino acid chuyển sang chuỗi; ribosome dịch 3 nt; tRNA rời vị trí E | ≈ 1,1 s mỗi codon | Đặt chuỗi ngay |
| Đột biến | Base bị thay nháy viền, lật sang base mới; codon và amino acid liên quan được tô | 600 ms | Đổi ngay |
| Idle | Chuỗi xoắn quay rất chậm ở S1 (0,08 rad/s) chỉ khi không reduced motion | liên tục | Tắt |

### 5.5 Tương tác và tiếp cận

- Mọi thao tác có nút DOM: chọn base bằng `BasePicker` (chữ + màu + `aria-label` đầy đủ), phím A/T/U/G/C khi focus nằm trong bộ chọn base, Backspace xoá.
- Bảng mã di truyền (`CodonTable`) là bảng HTML thật (header hàng/cột, `scope`), tô codon hiện tại; học sinh chọn amino acid từ danh sách.
- Canvas `aria-hidden`; trình tự và tiến trình đọc qua `aria-live="polite"`.
- 2D "Đọc" (`SequenceDiagram2D`) dựng từ cùng state: hai mạch có nhãn 5'/3', bubble, mRNA, khung codon, ribosome, chuỗi amino acid.

### 5.6 Hiệu năng

| Tier | DPR | Hạt dịch nhân | Chi tiết |
|---|---|---|---|
| High | ≤ 2 | 260 | Enzyme detail 5, sheen, clearcoat |
| Mid | ≤ 1,5 | 120 | detail 4 |
| Low | 1 | 0 | detail 3, không clearcoat |

`frameloop="demand"`, chỉ chạy liên tục khi idle-rotate bật. Mọi phân tử lặp dùng `InstancedMesh` (một draw call cho mỗi loại phần tử). Lazy import renderer FL-27. Ngân sách đề xuất (phải đo thiết bị thật): ≤ 120k tam giác, ≤ 60 draw call, không texture tải về.

### 5.7 Tài sản và bản quyền

100 % procedural geometry; không GLB, HDR, font ngoài hay hình SGK. Bảng mã di truyền chuẩn render từ dữ liệu.

## 6. UI/UX FL-27

- Desktop ≥ 1024 px: scene full LabSpace; `K7Hud` phải 400 px gồm tab 6 trạm, hướng dẫn ≤ 80 từ, dải trình tự, thao tác; bảng mã mở trong HUD ở S4–S5. Mobile 390 × 844: HUD thành bottom sheet 52 dvh.
- Hallmark floor: token ở `:root` (light/dark), chỉ animate `transform`/`opacity`, không `transition: all`, `:focus-visible` rõ, có `prefers-reduced-motion`, không chữ in hoa giãn chữ, không chuỗi meta nối bằng "·", icon lucide, không card lồng card, trạng thái bằng chữ + icon.
- Ngôn ngữ: tiếng Việt chính, tiếng Anh qua `defineText`, gọi `text()` trong component.
- Thông báo giới hạn: "Mô hình phân tử đơn giản hoá theo SGK để học quá trình từ gene đến protein; kích thước và hình dạng enzyme không theo tỉ lệ thật."

## 7. Thay đổi nền tảng

| Ticket | Nội dung | Trạng thái |
|---|---|---|
| P-1 | `shared/motion/usePrefersReducedMotion.ts` | Xong trên nhánh này |
| P-2 | Gom lifecycle Canvas/fallback/context-lost/portal của `PhysicsStage` và `MolecularStage` thành `shared/stage/StageHost` | Đề xuất; cần QA K1/K2/K3 |
| P-3 | K3 dùng hook motion chung | Đề xuất |
| P-4 | Nâng `K3Hud`/`K7Hud` thành `shared/LabGuideHud` | Đề xuất |
| P-5 | Lazy-load renderer FL-03 trong registry | Đề xuất |

## 8. Model server

`gene-expression@1.0.0` + evaluator `gene-protein-stations@1.0.0` đăng ký qua `LabEvaluator` registry (đã có từ FL-03, `505b487`). Bảng mã chuẩn đặt trong `packages/sim` và bump tarball `@nexalab/sim` khi đồng bộ FE. Seed creation-only và seed isolated theo mẫu `seed-fl03-density-isolated.ts`.

## 9. Phase, ticket và tiêu chí hoàn thành

| Phase | Ticket | Đầu ra | Ước lượng |
|---|---|---|---|
| 0. Quyết định và nguồn | T0.1 chốt D-1…D-6. T0.2 ánh xạ mã outcome (F7), chọn lesson Bài 38–41 released để bind. T0.3 bảng hằng số + nguồn (F8), trình tự và biến thể. T0.4 blueprint theo `foundational-lab-track.md`. | Blueprint PROPOSED + source receipt | 2–3 ngày + reviewer |
| 1. Platform | P-1 (xong), P-2…P-5 | Hạ tầng dùng chung | 2 ngày |
| 2. K7 kit | K-1 `MolecularStage` + camera rig + tier. K-2 DNA duplex + bubble. K-3 RNA/nucleotide strand. K-4 enzyme, ribosome, tRNA, polypeptide. K-5 dịch nhân, thước Å. K-6 2D sơ đồ Đọc. K-7 HUD, BasePicker, CodonTable. K-8 `/dev/lab-kits/k7`. | **Xong (technical)** trên nhánh này | 6–8 ngày |
| 3. Model + rubric BE | M-1 model + fixtures §4.7. M-2 activity/rubric trong registry. M-3 pack/biến thể (isolated DB). M-4 integration launch/submit/replay. | **Xong (technical, §14)** | 4–5 ngày |
| 4. FL-27 FE | F-1 6 trạm + notebook. F-2 2D. F-3 3D. F-4 draft/restore. F-5 kết quả R1–R6. F-6 i18n. | **Xong (technical)**: chạy qua `lab-run-host` (draft IndexedDB theo run), kết quả server qua `GeneResult` | 6–8 ngày |
| 5. QA | Playwright (2D, 3D, mobile, bàn phím, reduced motion); E2E thật FE → BE → isolated PG; parity 2D/3D; đo thiết bị; audit a11y | Báo cáo đo thật | 3–4 ngày |
| 6. Release | Freeze tuple; OWNER_SIGNOFF thật; bind Bài 38–41; activation | Release FL-27 | Theo owner |

## 10. Tuân thủ gate

- Phase 0–2 là presentation/platform track (CAT-10), không chiếm slot Lab. Phase 3 trở đi tính là track Lab thứ ba → cần (a) P3.5 đạt và một track hiện tại đóng, hoặc (b) owner ghi nhận ngoại lệ bằng văn bản như FL-25.
- Không seed/migrate Supabase dùng chung; mọi test BE chạy trên PostgreSQL loopback cô lập qua script guarded.
- Renderer không bao giờ chấm điểm; kết quả server thay mọi preview.

## 11. Quyết định cần chốt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| D-1 | FL-27 thuộc K7 (catalog) hay đổi kit theo yêu cầu "kit 3"? | **Chốt K7** (owner 2026-10-31), dùng chung FL-28/30 |
| D-2 | Mở FL-27 như track thứ ba (ngoại lệ owner) hay chờ FL-03/FL-10 đóng? | Chỉ presentation trên nhánh này; Phase 3 chờ owner |
| D-3 | S2 có gồm mạch ra chậm (Okazaki) không? | Không ở v1, ghi giới hạn |
| D-4 | Hằng số hình học: số SGK (10 cặp, 34 Å) hay B-DNA thực (10,5)? | **Chốt số SGK** (owner 2026-10-31): 10 cặp/vòng, 34 Å, Ø 20 Å; A–T 2, G–C 3 liên kết H |
| D-5 | Chỉ đột biến thay thế hay thêm cả mất/thêm (lệch khung)? | Thay thế ở v1 |
| D-6 | 3D mặc định khi nào? | Sau parity Q-3 + đo thiết bị Q-4 |

## 12. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Hình ảnh enzyme/ribosome bị hiểu là hình dạng thật | Thông báo giới hạn; nhãn "đơn giản hoá" |
| Màu base là kênh thông tin duy nhất | Luôn kèm chữ A/T/G/C/U; palette kiểm tra tương phản |
| Cảnh nhiều instance nặng trên máy yếu | Tier Low, demand frameloop, đo Q-4 |
| Học sinh chia sẻ đáp án | Biến thể gene/đột biến theo run |
| Lẫn T và U khi phiên mã | BasePicker S3 chỉ có A/U/G/C; rubric R3 kiểm |

## 13. Implementation Evidence — `feat/fl27` (2026-10-31)

- **FE:** kit K7 theo §5.1 (`MolecularStage`, DNA duplex có chạc/bóng mở xoắn, mạch đơn, enzyme/ribosome/tRNA/polypeptide procedural, thước Å, `SequenceDiagram2D`, `K7Hud`, `SequenceTrack` + `BasePicker`, `CodonTable`); FL-27 renderer `gene-expression` (lazy, chunk riêng ≈ 28 KB gzip, không tính three/drei) trong `runtime/activity-renderers.tsx`; 6 trạm với 3D và 2D "Đọc" cùng một draft evidence; `GeneResult` hiển thị kết quả server theo R1–R6; preview dev `/dev/lab-kits/k7` và `/dev/lab-kits/gene-protein` (chỉ DEV build). Cấu hình `fl27-gene.config.ts` là `PROPOSED_UNAPPROVED` (4 biến thể: missense, nonsense, silent của gene A; Glu → Val của gene B).
- **Đã kiểm chứng (2026-10-31, máy dev):** `tsc --noEmit` và `npm run build` FE xanh. Playwright Chromium trên route preview: `tests/gene-protein-lab.spec.ts` 4/4 (đủ 6 trạm tới trạng thái sẵn sàng nộp, bàn phím trong BasePicker, bảng mã đánh dấu codon, biến thể pin thay draft, 3D ↔ 2D) và hồi quy `tests/density-lab.spec.ts` 10/10. Soi trực quan trong trình duyệt dev ở 1440 × 900 và 375 × 812 cho cấu trúc, tái bản (mở chạc, nucleotide bay vào, hai DNA con), phiên mã (bóng phiên mã di chuyển, mRNA bóc khỏi khuôn), dịch mã (lắp ráp ribosome, tRNA, chuỗi dài ra, giải phóng ở codon stop), đột biến và kết luận.
- **Không chứng minh:** model/rubric server (chưa có `gene-expression@1.0.0`), launch/submit thật, đo hiệu năng trên Chromebook/tablet, audit a11y bằng công cụ, parity 2D/3D chính thức.
- **Chưa làm:** Phase 0, Phase 3, F-4/F-5 (draft theo run/restore và kết quả thật cần BE), Phase 5–6, ticket P-2…P-5.

## 14. Implementation Evidence — Phase 3 BE + tích hợp FE (2026-10-31)

| Hạng mục | Nội dung |
|---|---|
| Model | `packages/sim/gene-expression.ts`, export từ `@nexalab/sim`: bảng mã chuẩn (NCBI table 1), hằng số SGK, 4 biến thể gene (thay thế điểm: missense, nonsense, silent gene A; Glu → Val gene B), `translate` đọc từ base đầu và dừng sau codon stop đầu tiên, `classifySubstitution`. Fail-closed với variant lạ, thiếu ATG, stop sai vị trí, đột biến ngoài vùng mã hoá. Đăng ký `gene-expression@1.0.0` (labId `gene-protein`, observation-only) trong `MODEL_REGISTRY`; `CHALLENGE_PARAMETERS["gene-protein"]` không có tham số học sinh. Tarball FE không bump vì FE không gọi model (giống FL-03). |
| Rubric | `gene-protein-stations@1.0.0` trong `LabEvaluator` registry, envelope `evidence`, rendererKey `gene-expression`. R1 số đọc (đếm cặp chính xác, độ dài ± 1 Å, 3,4 Å ± 0,1) + quy tắc ghép cặp; R2 thứ tự giai đoạn + ≤ 1 base sai + bán bảo toàn; R3 ≤ 1 base sai; R4 dịch đúng **mRNA của chính học sinh** (cùng khung đọc, dừng đúng ở stop) + 4/16/64; R5 codon, amino acid, loại hậu quả; R6 hai câu khái niệm. Kết quả chỉ trả số base đúng, không trả trình tự kỳ vọng. Evidence malformed (T trong RNA, U trong DNA, chuỗi amino acid có lỗ hổng hoặc tiếp sau Stop, codon không phải 3 chữ A/U/G/C) → lỗi validation, không tạo attempt. |
| Runtime | Launch ghim `variantId` vào tuple (`gene-variants.ts`) và trả `runtimeParams`; submit kiểm tra evidence khớp gene đã ghim. `labs.controller.ts` lấy rendererKey từ evaluator và kiểm envelope theo rubric — **cùng nội dung với thay đổi FL-03 chưa commit ở checkout gốc** (không đụng vào checkout đó), để khi FL-03 commit, merge áp dụng một lần. |
| Fixture | `gene-protein-tuple.fixture.ts` + `npm run db:seed:fl27-isolated` (có guard isolated): Lab `gene-protein` synthetic CLASS_PRIVATE, challenge `gene_protein_001`, activity, config, pack active; không LabRelease, không releaseCleared. Idempotent (chạy lại không đổi id). |
| Kiểm chứng BE | `npm run lint` sạch. `vitest run`: 49 file pass, 372 test pass, 11 skip (integration cần DB). Test mới: 38 model/rubric (G1–G6, sai nguyên tắc bổ sung, sai khung đọc, dừng sớm/bỏ qua stop, stop do lỗi của chính học sinh, 4 kịch bản đột biến, pin, registry, envelope) + 3 test đồng bộ BE↔FE (cấu hình gene và bản nháp FE hoàn chỉnh được schema BE nhận nguyên vẹn, chấm passed cho cả 4 biến thể). |
| E2E BE thật | `gene-protein-e2e.integration.test.ts` trên PostgreSQL 18 loopback riêng (`127.0.0.1:54327/nexalab_fl27_isolated`, cluster tạm, đã migrate + seed qua script guarded): launch qua assignment → rendererKey `gene-expression`, variant ghim → nộp đúng 6/6 passed → replay cùng key trả cùng attempt → dịch sai stop bị chấm `translation:codons` → evidence gene khác / T trong RNA bị từ chối, không tạo attempt. **Pass.** |
| FE | Lab library có thẻ `gene-protein`; renderer chạy qua `lab-run-host` (launch, draft, submit). Payload nộp là bản nháp FE nguyên trạng trong envelope `evidence`. `GeneResult` hiển thị R1–R6 và số base đúng từ server. Route preview dev giữ nguyên. |
| Kiểm chứng FE | `tsc` + `npm run build` sạch (chunk FL-27 ≈ 28 KB gzip). Playwright: `gene-protein-run.spec.ts` 3/3 (launch ghim gene; body POST /attempts đúng 7 khoá và `evidence` bằng đúng object kỳ vọng; đổi trạm và 3D↔2D không làm đổi evidence; kết quả needs_practice), `gene-protein-lab.spec.ts` 4/4, hồi quy `density-lab.spec.ts` 10/10 (1 test reduced-motion của FL-03 fail một lần khi chạy gộp, chạy lại riêng pass: flaky, không liên quan FL-27). API trong Playwright là mock; luồng BE thật được chứng minh riêng bằng E2E ở trên, chưa chạy một phiên trình duyệt FE → BE → DB liền mạch. |
| Chưa làm | Đo hiệu năng thiết bị, audit a11y bằng công cụ, review curriculum/khoa học, owner exception cho track thứ ba, release. P-2…P-5 giữ là đề xuất (không sửa K3/FL-03 trên nhánh này). |

## Open Gates — trạng thái hiện tại

Curriculum/science review cho Outcome K9 và hằng số; model + rubric server; owner exception cho track thứ ba; parity 2D/3D và đo thiết bị đại diện; OWNER_SIGNOFF thật. Không mục nào được đáp ứng bởi nhánh này.
