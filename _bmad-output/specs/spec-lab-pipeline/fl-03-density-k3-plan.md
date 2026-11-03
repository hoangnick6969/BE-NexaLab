---
id: PLAN-FL-03-K3
status: active-release-limited-scope
updated: 2026-11-01
supersedes-draft: fl-03-density-lab-plan.md (untracked draft 2026-10-30; see §2 A1)
companions:
  - SPEC.md
  - lab-pipeline-phase-plan.md
  - lab-catalog-and-shared-kits-khtn8-9.md
  - ../spec-foundational-lab-p3-1/lab-definition.md
---
# FL-03 Khối lượng riêng + Shared Kit K3 "Bàn chất lỏng" — audit và kế hoạch triển khai

> **Trạng thái 2026-11-01: FL-03 Density v1 đang ACTIVE trong shared database.** SELECT-only readback xác nhận `SHARED_LIBRARY`, `releaseCleared=true`, pack active và `OWNER_SIGNOFF` thật trên digest. Release hiện có phạm vi activity density đã bind, không đồng nghĩa toàn bộ K3/FL-03 portfolio đã xong hay có reviewer độc lập. `OWNER_SIGNOFF_V1` chỉ bắt buộc owner ADMIN ký; nguồn, khoa học, rubric, an toàn và rights được ghi trong evidence của owner, chưa có các reviewer độc lập bắt buộc. P3.5 vẫn được tracking là NOT MET; các outcome/provenance và QA thiết bị/accessibility còn mở.

## Cách đọc tài liệu

- **Historical Audit (§1–§2):** ảnh chụp tại thời điểm 2026-10-31 trước các commit FL-03; không dùng làm trạng thái code hiện tại.
- **Technical Decisions (§3–§12):** thiết kế đề xuất và các gate; chi tiết chưa được reviewer duyệt không trở thành chuẩn khoa học chỉ vì đã có fixture.
- **Implementation Evidence (§13–§16):** bằng chứng code/test theo từng mốc, mục sau cập nhật mục trước; chỉ có hiệu lực trong phạm vi môi trường kiểm thử ghi rõ.
- **Open Gates (§10 và cuối tài liệu):** điều kiện còn thiếu trước khi gọi là Lab được duyệt hoặc phát hành.

## 0. Tóm tắt

- FL-03 là Lab **"Xác định khối lượng riêng"** bám đúng SGK KHTN 8 Bài 13 (TN1, TN2, `D = m/V`, đơn vị) và Bài 14 (ba phần: khối gỗ hộp chữ nhật, một lượng nước, hòn sỏi). Một Lab identity, một model `density-bench@1.0.0`, một activity `density-stations@1`.
- `PhysicalLabEnvironment` là phòng nền xuyên kit (tường, sàn, tủ, lababo, bàn, ánh sáng). K3 chỉ tổ chức dụng cụ và tương tác chất lưu phù hợp từng activity; cân, ống đong, cốc, thước và vật mẫu được FL-03 chọn theo model. Model, state khoa học, rubric và Outcome thuộc FL-03, không thuộc K3. Không mặc định chia sẻ dụng cụ thuỷ tinh với K2; mỗi Lab phải chứng minh nhu cầu và contract trước khi reuse.
- Registry BE/FE đã có trên nhánh FL-03 (§13–§16). Nhận định runtime hard-code Circuit ở §2 là audit lịch sử.
- Thứ tự Phase 0–6 dưới đây là kế hoạch gốc, không phải bằng chứng gate đã qua. Việc xây technical candidate trước gate được ghi ở §13–§16; không mở P3.7 hoặc cho phép release.

## 1. Historical Audit — chạy local (ảnh chụp 2026-10-31)

| Thành phần | Kết quả |
|---|---|
| BE `npm run dev` (PORT 4100 theo `.env`) | Khởi động OK, toàn bộ routes mapped. `.env` trỏ Supabase dùng chung: chỉ chạy dev server + SELECT read-only, không seed/migrate. |
| FE `vite` với `VITE_API_PROXY=http://127.0.0.1:4100` | OK (port 5174 vì 5173 bận). Proxy `/api` → BE trả 401 đúng khi chưa đăng nhập. Lưu ý: proxy mặc định của FE là 4000, BE `.env` là 4100 — cần thống nhất (§2 A13). |
| BE `tsc --noEmit` | Trước: 55 lỗi do Prisma Client cũ (`labRun`, `labPackRevocation`, `labExecution` không tồn tại). Sau `npm run db:generate`: 0 lỗi. |
| FE `tsc --noEmit` | Thiếu `react-markdown`, `remark-*`, `rehype-katex` trong node_modules → `npm install`. Còn 2 lỗi thật: file trùng `src/features/labs/CircuitBulbActivity.tsx` (§2 A2) → `npm run build` hỏng. |

Cấu hình chạy nằm ở `D:\FPT\Ky8\WDP301\.claude\launch.json` (`be-api`, `fe-web`).

## 2. Historical Audit — specs Foundational Lab trước commit FL-03

Phạm vi: BE `9a08c2d…adaee7f` (P3.5–P3.6, 2026-10-28→30), FE `b1321df…0d63fb8`, specs `spec-lab-pipeline/*`, `spec-foundational-lab-p3-1/lab-definition.md`, cùng code `packages/sim`, `modules/labs`, `features/labs`.

| ID | Mức | Phát hiện | Bằng chứng | Hành động trong plan |
|---|---|---|---|---|
| A1 | Cao | Draft FL-03 (untracked) loại "liquid density" khỏi v1, dùng "khối hộp sắt" và không có TN1/TN2. Outcome `KHTN8-B14-O01` ghi rõ "…khối hộp chữ nhật, …vật có hình dạng bất kì, **…một lượng chất lỏng**"; SGK Bài 14 dùng **khối gỗ**, **lượng nước**, **hòn sỏi**. Draft sẽ không phủ được Outcome chính. | SELECT `CurriculumOutcome` B13/B14; lesson `pack-structured-0733be47…-v1` mục I, II, III | §4–§5: 5 trạm S1–S5 theo thiết kế đề xuất |
| A2 | Cao | Commit FE `952a368` thêm bản sao `src/features/labs/CircuitBulbActivity.tsx/.css` ở root, import `./CircuitBulb3DStage`, `./LabRendererToggle` không tồn tại. Không file nào import nó, nhưng `tsc -b` trong `npm run build` fail. | `tsc --noEmit` | Ticket P-0: xoá bản sao, giữ `physics/electricity/` |
| A3 | Cao (env) | Prisma Client không được generate sau migration LabRun → lint BE fail và runtime `prisma.labRun` undefined khi launch Lab. | 55 lỗi TS2339/2353 trước `db:generate` | P-0: `postinstall: prisma generate` hoặc ghi rõ trong README |
| A4 | Cao (kiến trúc) | "Shared runtime" vẫn gắn chết Circuit: `runSubmissionSchema` union cứng `CLOSED/OPEN`, `ON/OFF`, `A/B/C`; `rubricRef: z.enum([legacy, circuit-bulb])`; `rubricRefForActivity` là chuỗi `if`; `rendererKey` là ternary trong `labs.controller.ts:341`; FE `Lab.tsx` dùng `isBulb` và danh sách cứng `["circuit","eye","chemistry"]` (dòng 273). Fixture P3.5 chạy bằng `legacy-challenge@1.0.0` nên **đường activity tổng quát chưa từng được kiểm**. | `lab-run.ts:31-55`, `labs.controller.ts:341`, `Lab.tsx:218-357` | Phase 1 (P-1…P-6) |
| A5 | Trung bình | Gate: P3.5 phase gate **NOT MET** (chưa có OWNER_SIGNOFF thật cho Circuit); catalog xếp W2 = FL-10/FL-13 trước rồi mới tới họ chất lỏng. Draft FL-03 không nêu hai ràng buộc này. | `lab-pipeline-phase-plan.md` dòng 25, 34; catalog §5 dòng 182 | §10, quyết định D-1, D-2 |
| A6 | Trung bình | Catalog FL-03 nói "bình tràn", nhưng SGK Bài 14 phần III đo bằng **ống đong, V₂ − V₁**. Bình tràn chỉ hợp làm biến thể sau. | Lesson Bài 14 mục III | §4: ống đong là phương pháp chuẩn; bình tràn là optional K3 |
| A7 | Trung bình | Lỗi OCR trong register/lesson làm nguồn: "Nếu được định nghĩa" (→ Nêu), "bắt kì" (→ bất kì), "thời sắt/Thôi" (→ thỏi), "Thuốc đo" (→ Thước đo), "Ông dong" (→ Ống đong), "Hây"; hình Bài 13 là placeholder "[Hình từ PDF trang 58; cần mô tả thủ công]". Tồn tại cặp lesson trùng `dev-khtn8-ch03-lesson-13/14` và `pack-structured-…`. | SELECT `Lesson` | Phase 0 T0.2: sửa register, chọn lesson released để bind |
| A8 | Trung bình | Đường dẫn chéo repo sai: FE README → `../../../../nexalab-be/…`, catalog §6A.6 → `../../../../nexalab-fe/…`; thư mục thật là `BE-NexaLab`, `FE-NexaLab`. | grep | P-0 |
| A9 | Thấp | Pattern 3D của pilot không nên nhân bản: `new THREE.Color()` mỗi frame trong `useFrame`; `frameloop` luôn chạy; point light đổ bóng realtime; không tone mapping/environment; kính giả bằng `opacity` (`transmission=0`); phòng dựng 120 mesh sàn riêng lẻ; `document.body.style.cursor` không reset khi unmount. | `CircuitBulb3DStage.tsx`, `PhysicsStage.tsx` | §6.6, §6.7: K3 dùng pattern mới, opt-in, không đổi Circuit khi chưa QA |
| A10 | Thấp | UI pilot vi phạm Hallmark floor nếu tái dùng cho trang mới: nhãn chữ in hoa giãn chữ "VẬT LÝ · KHÁM PHÁ MẠCH", chuỗi meta nối bằng dấu "·", chữ tiếng Việt cứng trong SVG bỏ qua i18n, `const t = text()` ở module scope (đổi ngôn ngữ không cập nhật), nhãn "9V" không có trong blueprint ("low-voltage" chung). | `CircuitBulbActivity.tsx` | §7: quy tắc UI cho FL-03; ticket riêng nếu muốn sửa Circuit |
| A11 | Thấp | Rác làm việc: `fl-03-density-lab-plan.md`, `be-e2e.err` untracked (BE); `.gitignore` sửa chưa commit (FE). | `git status` | Dọn khi chốt plan này |
| A12 | Info | Specs P3.6 mô tả đúng hiện trạng: release BLOCKED chờ signoff thật; Class Lab reuse mới verify trong isolated PG; Lab Space 2D/3D chỉ là presentation progress. | phase-plan "Verified implementation status" | Giữ nguyên ranh giới khi viết FL-03 |
| A13 | Thấp | `VITE_API_PROXY` mặc định 4000, BE `.env` `PORT=4100`; AGENTS.md ghi 4000. `npm run dev` hai repo không tự nối được. | `vite.config.ts`, `.env` | P-0: thống nhất 4000 hoặc thêm `VITE_API_PROXY` vào `.env.example` |

## 3. Technical Decisions — bài học từ pilot FL-01 Circuit

**Giữ và tái sử dụng:** `LabSpace` (fullscreen, inert, focus trả về), `LabSceneContext` portal, `LabRendererToggle` + preference localStorage theo Lab, `lab-run-host` (launch/draft/submit/idempotency), contract `lab-contract/1`, LabRun snapshot tuple, golden + invalid fixtures, release/OWNER_SIGNOFF pipeline, assignment pinning. Mẫu activity "dự đoán → thao tác → quan sát → giải thích" và nút DOM tương đương cho mọi thao tác 3D (`bulb-accessible-switch`).

**Thay đổi cho FL-03:** activity nhiều trạm thay vì 2 checkpoint cố định; evidence là số đo có đơn vị nên cần tolerance theo ĐCNN và kiểm tra tính nhất quán; renderer chọn qua registry; 3D phải là "nhạc cụ đo" đọc được (vạch chia, mặt khum, màn LCD), không chỉ minh hoạ; dùng `frameloop="demand"`, environment lighting, kính transmission thật, perf tiers.

## 4. Nội dung liên kết (nguồn để bám)

| Nguồn | Nội dung dùng trong Lab |
|---|---|
| `KHTN8-B13-O01` (chính) | Định nghĩa KLR, `D = m/V` |
| `KHTN8-B13-O02` (hỗ trợ) | Đơn vị kg/m³, g/cm³, g/mL; `1 kg/m³ = 0,001 g/cm³`, `1 g/cm³ = 1 g/mL` |
| `KHTN8-B14-O01` (chính) | Thí nghiệm xác định KLR: khối hộp chữ nhật, vật hình dạng bất kì, một lượng chất lỏng |
| Lesson `pack-structured-d8532ff6…-v1` "Khối lượng riêng" | TN1: ba thỏi sắt V, 2V, 3V, cân điện tử → Bảng 13.1 (m/V không đổi). TN2: thỏi sắt, nhôm, đồng cùng V → Bảng 13.2 (m/V khác nhau). Bài tập khối gang 2 × 3 × 5 cm, 210 g. Trọng lượng riêng `d = P/V` chỉ là ngữ cảnh, không chấm ở v1. |
| Lesson `pack-structured-0733be47…-v1` "Thực hành xác định KLR" | I. Khối gỗ: thước ĐCNN 1 mm, đo a, b, c, 3 lần đo, `V_tb`, `m_tb` (Bảng 14.1). II. Lượng nước: ống đong, cốc thuỷ tinh, `m₁` cốc rỗng, `m₂` cốc + nước, `Vₙ` (Bảng 14.2). III. Hòn sỏi không thấm nước: ống đong có nước `V₁`, thả sỏi `V₂`, `V = V₂ − V₁` (Bảng 14.3). Tỉ trọng kế chỉ nhắc, không mô phỏng. |
| Video OLM "Khối lượng riêng", "Thực hành xác định khối lượng riêng" | Ngữ cảnh lesson/video, không phải nguồn số liệu |

Bất kỳ hằng số nào (KLR sắt/nhôm/đồng/gỗ/sỏi/nước, ĐCNN, dung tích) đều là **config có version**, cần reviewer xác nhận nguồn (CAT-4). Renderer không suy ra vật liệu từ hình dáng.

## 5. Thiết kế FL-03 (Lab, model, activity, rubric)

### 5.1 Identity

| Trường | Giá trị đề xuất |
|---|---|
| Lab key | `density` (Foundational, private cho tới release) |
| modelRef | `density-bench@1.0.0` (mới, allowlist trong `MODEL_REGISTRY`) |
| Activity | `density-stations@1`, rubric `density-stations@1.0.0` |
| rendererKey | `density-bench` |
| Kit | K3 (`physics/fluid/kit`) cho dụng cụ chất lưu; phòng nền `PhysicalLabEnvironment` dùng chung xuyên kit. Dụng cụ chỉ được reuse khi activity yêu cầu. |
| Modality | 3D mặc định khi qua QA, 2D tương đương đầy đủ; preference cục bộ |

### 5.2 Năm trạm S1–S5 (thiết kế đề xuất theo SGK)

| Trạm | Thao tác học sinh | Dữ liệu ghi vào "Sổ thí nghiệm" | Outcome |
|---|---|---|---|
| S1 Khám phá tỉ số m/V | Cân lần lượt thỏi sắt V, 2V, 3V; sau đó thỏi sắt, nhôm, đồng cùng V. Dự đoán trước khi cân thỏi 2V. | Bảng 13.1, 13.2 (m và m/V); chọn kết luận A/B/C | B13-O01 |
| S2 Khối gỗ hộp chữ nhật | Đặt thước lên từng cạnh (snap về vạch 0), đọc a, b, c (mm); đặt khối lên cân, đọc m. Tối đa 3 lần đo. | Bảng 14.1: a, b, c, V từng lần, `V_tb`, `m_tb`, D | B14-O01 |
| S3 Lượng nước | TARE tắt / cân cốc rỗng `m₁`; rót nước vào ống đong tới mức tự chọn, đọc `Vₙ` ở đáy mặt khum ngang tầm mắt; đổ sang cốc, cân `m₂`. | Bảng 14.2: `Vₙ`, `m₁`, `m₂`, `m₂ − m₁`, D | B14-O01 |
| S4 Hòn sỏi | Cân sỏi `mₛ`; đọc `V₁` ống đong có nước; nghiêng ống, thả sỏi trượt nhẹ; đọc `V₂`. | Bảng 14.3: `mₛ`, `V₁`, `V₂`, `V₂ − V₁`, D | B14-O01 |
| S5 Kết luận và đơn vị | Đổi D của mỗi trạm sang kg/m³ ↔ g/cm³; chọn lý do dùng V₂ − V₁ cho vật bất kì; chọn kết luận chung. | Đơn vị, chuyển đổi, 2 câu chọn | B13-O01, B13-O02 |

Không có trong v1: chất lỏng khác nước, nhiệt độ, sai số tuyệt đối/tương đối, bình tràn, tỉ trọng kế, trọng lượng riêng, nổi/chìm (FL-05), áp suất (FL-04).

### 5.3 Biến thể theo run

Pack chứa danh sách biến thể đã review (ví dụ 4 khối gỗ khác kích thước, 3 hòn sỏi, 3 mức nước ban đầu). Khi launch, server chọn `variantId = variants[hash(runId) mod n]` và ghi vào LabRun snapshot. Mỗi học sinh có số liệu riêng; replay tái lập chính xác. Evidence phải echo `variantId`; lệch là validation error.

Không thêm nhiễu ngẫu nhiên vào số đo. Ba lần đo khác nhau chỉ khi học sinh đọc khác nhau, đúng với dụng cụ ảo lý tưởng (ghi trong limitation).

### 5.4 Model `density-bench@1.0.0` (packages/sim, deterministic)

State v1 (Zod strict, ≤ 20 KB):

```ts
{
  variantId: string,                       // phải thuộc pack đã pin
  stations: {
    explore?: { weighed: Array<{ specimenId: string }> },          // thứ tự cân
    block?:   { trials: Array<{ rulerSnapped: true }> },             // 1–3
    water?:   { pouredMl: number, cupTaredFirst: boolean },          // lượng rót do HS chọn
    pebble?:  { initialWaterMl: number, dropped: boolean }
  }
}
```

Output (observation, server tính, renderer chỉ hiển thị):

```ts
{
  version: "1.0.0",
  instruments: { balance: { resolutionG: 0.1, maxG: 500 }, ruler: { resolutionMm: 1 }, cylinder: { resolutionMl: 1, capacityMl: 100 } },
  expectedReadings: {
    explore: Array<{ specimenId, massG }>,
    block:   { aMm, bMm, cMm, massG },
    water:   { cupMassG, volumeMl, cupPlusWaterG },
    pebble:  { massG, v1Ml, v2Ml }
  },
  reference: { blockGcm3, waterGcm3, pebbleGcm3 },
  validity: "VALID" | lý do lỗi
}
```

Quy tắc: số đo lý tưởng được làm tròn theo ĐCNN (half-up, lưu cách làm tròn trong config); mực nước sau khi thả sỏi không được vượt dung tích (pack loại sẵn biến thể không hợp lệ, model vẫn fail closed); sỏi phải lọt ống (đường kính ≤ lòng ống trong config).

### 5.5 Evidence v1

```ts
{
  variantId,
  explore: { masses: Array<{ specimenId, massG }>, predictionFor2V: "DOUBLE" | "SAME" | "HALF", conclusion: "A" | "B" | "C" },
  block:   { trials: Array<{ aMm, bMm, cMm, massG }>, vAvgCm3, mAvgG, density: { value, unit } },
  water:   { volumeMl, m1G, m2G, density: { value, unit } },
  pebble:  { massG, v1Ml, v2Ml, density: { value, unit } },
  units:   { conversions: Array<{ from: { value, unit }, to: { value, unit } }>, irregularReason: "A" | "B" | "C" }
}
```

Chấp nhận dấu phẩy thập phân ở UI, chuẩn hoá thành số trước khi gửi. Mọi số hữu hạn, không âm, trong giới hạn dụng cụ.

### 5.6 Rubric `density-stations@1.0.0` (đề xuất, reviewer chốt)

| Tiêu chí | Đạt khi |
|---|---|
| R1 Đọc cân | Mọi khối lượng khớp màn hình ± 0,1 g |
| R2 Đọc thước | a, b, c lệch ≤ 1 mm (1 ĐCNN) so với giá trị kỳ vọng |
| R3 Đọc ống đong | `Vₙ`, `V₁`, `V₂` lệch ≤ 1 mL |
| R4 Tính toán nhất quán | D mỗi trạm khớp `m/V` tính từ chính số đo của HS, sai lệch tương đối ≤ 1 % sau làm tròn (không phạt dây chuyền khi R1–R3 sai) |
| R5 Quy trình | S3 có `m₁` cốc rỗng trước `m₂`; S4 dùng `V₂ − V₁` |
| R6 Đơn vị và chuyển đổi | Đơn vị đúng; chuyển đổi kg/m³ ↔ g/cm³ đúng |
| R7 Khái niệm | Kết luận S1 đúng (cùng chất: m/V không đổi; khác chất: khác) và lý do đo thể tích vật bất kì đúng |

`passed` khi R1–R7 đều đạt; ngược lại `needs_practice` với phản hồi từng trạm. Điểm số thô lưu trong result. Kết quả D so với reference (± 5 %) chỉ là phản hồi quan sát, không phải tiêu chí riêng (tránh phạt hai lần). Invalid state → không tạo attempt.

### 5.7 Golden và invalid cases (BE, chạy qua cùng model với attempt)

| ID | Trường hợp | Kỳ vọng |
|---|---|---|
| G1 | Khối gang SGK 2 × 3 × 5 cm, 210 g | V = 30 cm³, D = 7 g/cm³ = 7000 kg/m³ |
| G2 | Khối gỗ 100 × 60 × 40 mm, 144,0 g | V = 240 cm³, D = 0,600 g/cm³ |
| G3 | Nước `Vₙ` = 50 mL, `m₁` = 48,6 g, `m₂` = 98,6 g | 50,0 g, D = 1,00 g/mL |
| G4 | Sỏi `V₁` = 50, `V₂` = 62 mL, `mₛ` = 31,2 g | 12 cm³, D = 2,60 g/cm³ |
| G5 | Sắt 10, 20, 30 cm³ | 78,0 / 156,0 / 234,0 g; m/V = 7,8 |
| G6 | Chuyển đổi | 7800 kg/m³ = 7,8 g/cm³; 1 g/cm³ = 1000 kg/m³ |
| B1 | Đọc thước lệch đúng 1 mm / 2 mm | R2 đạt / không đạt |
| B2 | D tính lệch 0,9 % / 1,5 % so với m/V của chính HS | R4 đạt / không đạt |
| I1 | `V₂ ≤ V₁`, `m₂ ≤ m₁`, số âm, NaN, Infinity | Validation error, không attempt |
| I2 | `variantId` không thuộc pack, specimenId lạ | Validation error |
| I3 | Thiếu trạm, unit không hỗ trợ, quá 3 lần đo | Validation error |
| I4 | Mực nước sau thả sỏi > 100 mL | Model từ chối |
| L1 | Idempotency trùng key, replay sau hết hạn/revoke, đổi active tuple giữa phiên | Như suite Circuit |

## 6. Technical Decisions — Shared Kit K3 và chuẩn 3D

### 6.1 Ranh giới và cấu trúc thư mục (FE)

```text
src/features/labs/
  shared/
    PhysicalLabEnvironment.tsx   # phòng nền xuyên kit; không chứa apparatus của FL-03
    stage/BenchStage.tsx          # host/camera đề xuất, không sở hữu mesh phòng
    stage/bench-quality.ts        # tier low/mid/high, PerformanceMonitor → dpr
    stage/useCameraRig.ts         # preset camera + chuyển cảnh mượt (drei CameraControls)
    motion/lab-motion.ts          # duration/easing tokens, reduced-motion
  physics/fluid/
    kit/                          # K3, presentation-only
      k3-specs.ts                 # kích thước thật, ĐCNN, ánh xạ thể tích → chiều cao (một nguồn duy nhất cho vạch chia và mực nước)
      k3-events.ts                # PLACE_ON_PAN, TARE, POUR, DROP_INTO_CYLINDER, SNAP_RULER, READ_AT_EYE_LEVEL
      apparatus/DigitalBalance3D.tsx, Ruler3D.tsx, WaterJug3D.tsx, OverflowCan3D.tsx (optional)
      specimens/MetalBar3D.tsx, WoodBlock3D.tsx, Pebble3D.tsx
      effects/PourStream.tsx, SplashRing.tsx, Bubbles.tsx
      readout/ReadingLoupe.tsx    # khung phóng to vạch đọc (3D) + ReadingLoupe2D (SVG)
      two-d/                      # SVG tương đương cho từng dụng cụ
      k3-asset-manifest.ts, README.md
    density/                      # FL-03 riêng
      DensityActivity.tsx, Density3DStage.tsx, Density2DStage.tsx
      DensityNotebook.tsx, density-evidence.ts, density-copy.ts
```

K3 **không** sở hữu model, rubric, Outcome, state hay mesh phòng của FL-03/04/05. `PhysicalLabEnvironment` là lớp phòng nền độc lập xuyên kit; stage chỉ quản lý Canvas/camera. FL-03 chọn dụng cụ K3 theo activity đã review; FL-04/05 và K2 không mặc định nhận cùng dụng cụ. Mỗi lần reuse cần xác nhận nhu cầu, đơn vị đo, interaction và evidence contract riêng.

Sơ đồ thư mục trên là đề xuất ban đầu; trạng thái code thực tế xem §13–§16. `PhysicsStage` hiện compose phòng nền chung. Thay đổi room shell cần QA các consumer K1/K2/K3, không coi việc dùng chung source là bằng chứng đạt hiệu năng thiết bị.

### 6.2 Quy ước tỉ lệ và dụng cụ

1 đơn vị scene = 1 m; group bàn K3 dùng kích thước thật để vạch chia và mực nước khớp hình học. Camera near = 0,01.

| Dụng cụ | Thông số đề xuất (config, reviewer duyệt) | Dựng hình |
|---|---|---|
| Cân điện tử | 500 g × 0,1 g; thân 180 × 200 × 45 mm, đĩa inox Ø 120 mm; LCD 7 đoạn; phím ON, TARE | RoundedBox thân nhựa nhám; đĩa `LatheGeometry` có gờ; LCD `CanvasTexture` 7-segment tự vẽ, emissive nhẹ; chỉ báo ổn định |
| Ống đong | 100 mL, ĐCNN 1 mL; cao 250 mm; lòng Ø 27 mm (100 mL ≈ 174,6 mm cột); thành 1,5 mm; đế lục giác | `LatheGeometry` profile ngoài + trong (có độ dày thật), miệng loe có mỏ rót; vạch: `CanvasTexture` 2048 px cao, vạch ngắn mỗi 1 mL, vạch dài mỗi 5 mL, số mỗi 10 mL, dán trên một trụ mỏng ngoài thành kính |
| Cốc thuỷ tinh | 100 mL, Ø 50 × 70 mm, có mỏ | Lathe có độ dày, vạch thô 10 mL (không dùng để đo chính xác) |
| Thước | 300 mm, ĐCNN 1 mm, nhôm hoặc nhựa trong | Box mỏng + `CanvasTexture` vạch mm, số mỗi cm, anisotropy cao |
| Thỏi kim loại | Khối hộp V, 2V, 3V (V = 10 cm³) | RoundedBox bevel nhỏ; vật liệu PBR: sắt xám ấm, nhôm sáng, đồng đỏ cam; roughness map procedural vết xước |
| Khối gỗ | Ví dụ 100 × 60 × 40 mm | RoundedBox; vân gỗ `CanvasTexture` (noise + vòng năm) hoặc shader nhỏ, khác nhau theo biến thể |
| Hòn sỏi | V 8–15 cm³, lọt lòng ống | `IcosahedronGeometry` detail 4, dịch chuyển đỉnh bằng noise có seed theo `variantId`, sau đó **chuẩn hoá thể tích hiển thị** gần giá trị config; vertex color lốm đốm |
| Nước | Trong, IOR 1,333 | Cột nước `LatheGeometry` với mặt khum lõm (cao hơn ~1,5 mm sát thành), `MeshPhysicalMaterial` transmission, attenuation xanh rất nhẹ |

Mực nước trong 3D/2D được tính từ thể tích bằng `k3-specs` (geometry mapping), cùng nguồn với texture vạch chia. Đây là ánh xạ hình học, không phải tính khối lượng riêng; số đo chính thức vẫn do server.

### 6.3 Vật liệu và ánh sáng (threejs-materials, threejs-lighting)

- Renderer: `outputColorSpace = SRGB`, tone mapping `AgX` hoặc `ACESFilmic`, exposure ~1.0; physically correct light units mặc định của three r170.
- Environment: `RoomEnvironment` qua PMREM (procedural, không tải HDR từ mạng, không vướng bản quyền) hoặc drei `<Environment>` với `Lightformer` tự đặt (cửa sổ softbox + đèn trần). **Không** dùng `preset` của drei vì tải file từ CDN.
- Kính: `MeshPhysicalMaterial` `transmission: 1`, `thickness` theo thành, `ior: 1.47` (borosilicate), `roughness: 0.03–0.06`, `specularIntensity` 1; vạch chia là lớp riêng opaque phía ngoài (tránh sort lỗi). Nước: `transmission: 1`, `ior: 1.333`, `attenuationDistance` lớn, `attenuationColor` #e8f6ff.
- Thứ tự vẽ: kính và nước đi qua transmission pass; phần trong suốt khác dùng `renderOrder` cố định; vạch chia `depthWrite: true`.
- Bóng: `ContactShadows` (drei) render một lần (`frames={1}`) cho đồ tĩnh, bật lại khi vật di chuyển; tắt shadow map realtime của đèn điểm. Một directional key light mềm + environment.
- Chữ trong 3D: tránh drei `<Text>` mặc định (tải font từ CDN); dùng `CanvasTexture` hoặc tự host font trong `public/` với prop `font` rõ ràng.

### 6.4 Biên đạo chuyển động (threejs-animation, ui-ux-pro-max animation rules)

Tất cả chuyển động lấy giá trị cuối từ state/observation. Animation không bao giờ ghi ngược vào state hay evidence. Dùng `THREE.MathUtils.damp`/spring trong `useFrame` qua ref, không `setState` mỗi frame; gọi `invalidate()` trong lúc animate (frameloop demand).

| Sự kiện | Chuyển động | Thời lượng, easing | Reduced motion |
|---|---|---|---|
| Nhấc vật | Nâng 15 mm, nghiêng 2° | 120 ms ease-out | Tắt |
| Di chuyển tới cân/ống | Cung Bézier bậc 2, đỉnh +60 mm | 420 ms `cubic-bezier(.2,.7,.2,1)` | Fade 120 ms tại chỗ mới |
| Chạm đĩa cân | Đĩa lún tỉ lệ khối lượng (≤ 1,2 mm), spring k=300, c=26 | ~350 ms | Không lún |
| LCD cân | "----" 250 ms → số dao động tắt dần 4–6 bước (biên độ ≤ 0,5 % ) → giá trị chính xác, hiện dấu ổn định | 750 ms tổng, dãy giá trị deterministic | Hiện giá trị ngay |
| TARE | Màn chớp, về 0,0 | 300 ms | Ngay |
| Thước snap cạnh | Trượt, vạch 0 khớp mép, camera đổi sang close-up | 500 ms + camera 700 ms | Nhảy cảnh |
| Rót nước | Bình nghiêng 30° → 65°; dòng chảy `TubeGeometry` theo parabol, độ dày theo lưu lượng; mực dâng tuyến tính; gợn mặt khum tắt dần sau khi ngừng | Theo thời gian giữ nút; gợn 1,2 s | Mực nhảy tới giá trị, không dòng chảy |
| Thả sỏi | Ống nghiêng 25°, sỏi trượt dọc thành; vào nước giảm tốc (drag); vòng sóng mở rộng + 6–10 bọt khí (Instances) nổi; mực dâng 400 ms với dao động tắt dần | Tổng ~1,6 s | Mực nhảy, không hiệu ứng |
| Đọc vạch ngang tầm mắt | Camera hạ xuống ngang đáy mặt khum, mở `ReadingLoupe`; nếu camera cao hơn, vạch đọc bị lệch thị sai thật | 800 ms | Chuyển cảnh tức thì |
| Camera giữa trạm | `CameraControls.setLookAt(..., true)` smoothTime 0,35 | ~700–900 ms | Cắt cảnh |

### 6.5 Tương tác và tiếp cận

- Mỗi thao tác 3D có nút DOM tương đương trong thanh hành động của trạm ("Đặt lên cân", "Bấm TARE", "Rót thêm 1 mL / 5 mL", "Thả sỏi"). Kéo-thả là tuỳ chọn, không bắt buộc (WCAG 2.5.7).
- Màn LCD cân được đọc qua `aria-live="polite"` ("Cân hiển thị 144,0 gam") vì cân điện tử hiển thị số sẵn.
- Đọc vạch thước/ống đong là kỹ năng được chấm: 2D có `ReadingLoupe2D` SVG phóng to, điều khiển bằng phím. Cho người dùng trình đọc màn hình: chế độ hỗ trợ cung cấp giá trị đọc và đánh dấu R2/R3 là "không đánh giá" thay vì chấm sai — cần reviewer quyết (D-5).
- Bàn phím: Tab qua dụng cụ, Enter/Space thao tác, phím mũi tên chỉnh lượng rót, Esc đóng sổ/loupe; focus ring hiện ngay.

### 6.6 Hiệu năng (threejs-performance, catalog §6A.6)

| Tier | DPR | Kính/nước | Bóng | Khác |
|---|---|---|---|---|
| High | ≤ 2 | Transmission đầy đủ | ContactShadows 1024 | Bọt khí, gợn sóng |
| Mid | ≤ 1,5 | Transmission, `transmissionResolutionScale` 0,5 | ContactShadows 512 | Giảm hạt |
| Low | 1 | `MeshStandardMaterial` trong suốt + env reflection, không transmission | Texture blob tĩnh | Không hạt, không gợn |

- `PerformanceMonitor` hạ/tăng tier theo FPS đo được; `frameloop="demand"`; geometry/material/texture dùng chung qua `useMemo` và dispose khi rời Lab; lazy import `physics/fluid/*` theo route.
- Ngân sách đề xuất (phải đo trên máy mục tiêu, không coi là pass): ≤ 150k tam giác, ≤ 80 draw call, ≤ 32 MB GPU texture, chunk K3 + FL-03 ≤ 180 KB gzip (không tính three/drei), tương tác đầu tiên ≤ 3 s trên máy tầm trung.
- Xử lý mất WebGL: giữ fallback của `PhysicsStage`; hoạt động vẫn hoàn thành bằng 2D.

### 6.7 Tài sản và bản quyền

v1 dựng toàn bộ bằng procedural geometry + CanvasTexture, không GLB, không HDR ngoài, không ảnh SGK. `k3-asset-manifest.ts` liệt kê mỗi tài sản sinh bằng code (id, version, nguồn = "procedural", digest tham số) để release review rights dễ dàng. GLB/KTX2 chỉ thêm sau khi có provenance và đo hiệu năng.

## 7. UI/UX FL-03 (ui-ux-pro-max + Hallmark floor cho app screen)

- **Bố cục desktop ≥ 1024 px:** scene chiếm toàn LabSpace; "Sổ thí nghiệm" panel phải 380–420 px, tab theo trạm (Khám phá, Khối gỗ, Nước, Sỏi, Kết luận); thanh hành động trạm nổi dưới scene. **Mobile 390 × 844:** scene 48svh trên, sổ là bottom sheet có 3 điểm dừng; không cuộn ngang.
- **Sổ thí nghiệm:** bảng giống Bảng 13.1, 13.2, 14.1, 14.2, 14.3 trong SGK để học sinh nhận ra; ô nhập có nhãn hiển thị, đơn vị cố định cạnh ô, `inputmode="decimal"`, chấp nhận "0,6" và "0.6"; lỗi ngay dưới ô; giá trị tạm tính ghi rõ "Tạm tính trên máy, chưa chấm".
- **Trạng thái:** mỗi trạm có chưa làm / đang làm / đủ dữ liệu; biểu thị bằng chữ + icon, không chỉ bằng màu. Nút nộp chỉ bật khi evidence đủ; thông báo kết quả server theo từng tiêu chí R1–R7.
- **Hallmark floor áp dụng:** mọi màu/font qua token ở `:root`; không `transition: all`, chỉ animate `transform`/`opacity`; `:focus-visible` hiện ngay; có `prefers-reduced-motion`; không nhãn chữ in hoa giãn chữ, không chuỗi meta nối bằng "·", không emoji làm icon (dùng lucide), không card lồng card; ~80 từ mỗi màn hình hướng dẫn.
- **Ngôn ngữ:** tiếng Việt chính, tiếng Anh qua `defineText`; gọi `text()` trong component (không ở module scope); không chữ cứng trong SVG/Canvas.
- **Thông báo giới hạn mô hình:** "Dụng cụ ảo lý tưởng để học cách đo và tính khối lượng riêng; không thay thế thao tác thật trong phòng thí nghiệm."

## 8. Thay đổi nền tảng (Phase 1)

| Ticket | Repo | Nội dung | Chấp nhận |
|---|---|---|---|
| P-0 | FE/BE | Xoá bản sao `labs/CircuitBulbActivity.*`; thêm `prisma generate` vào `postinstall`; sửa đường dẫn `nexalab-*`; thống nhất port API (A13) | FE `npm run build`, BE `npm run lint` xanh |
| P-1 | BE | `activity-registry.ts`: `{ key@version → { modelRef, evidenceSchema, evaluate, rubricRef, rendererKey } }`; Circuit đăng ký đúng hành vi hiện tại | Toàn bộ test Circuit/LabRun/release cũ xanh, digest snapshot Circuit không đổi |
| P-2 | BE | Submission: giữ dạng Circuit cũ (`checkpoints`, `explanation`) cho tương thích; dạng mới `evidence` được validate **sau khi** load run theo activity đã pin; `rubricRef` lấy từ registry | Test: evidence sai activity → 400, không attempt |
| P-3 | BE | `rendererKey` lấy từ registry, bỏ ternary `labs.controller.ts:341` | Launch Circuit vẫn trả `circuit-bulb` |
| P-4 | FE | `labs/runtime/activity-renderers.ts`: `{ rendererKey → { Component, defaultEvidence, evidenceReady, toSubmission } }`; `Lab.tsx` bỏ `isBulb` và danh sách id cứng | Playwright Circuit mocked suite xanh |
| P-5 | BE/FE | `packages/sim` thêm điểm mở rộng model mới; quy trình bump tarball `@nexalab/sim` (1.1.0 → 1.2.0) và vendor sang FE | Hash tarball ghi trong release candidate |
| P-6 | BE | Contract test chung: một activity giả lập thứ hai (synthetic) chạy launch → submit → replay qua registry, không dùng `legacy-challenge` | Đóng khoảng trống A4 của P3.5 |

## 9. Phase, ticket và tiêu chí hoàn thành

| Phase | Ticket chính | Đầu ra | Ước lượng |
|---|---|---|---|
| **0. Quyết định và nguồn** | T0.1 chốt D-1…D-6 (§11). T0.2 sửa OCR B13/B14, chọn lesson released để bind, mô tả lại Hình 13.1/13.2/14.x. T0.3 bảng hằng số + nguồn (KLR Fe/Al/Cu, gỗ, sỏi, nước; ĐCNN; dung tích). T0.4 blueprint FL-03 theo mẫu `foundational-lab-track.md` (dựa trên §5). | Blueprint + source receipt, trạng thái PROPOSED | 2–3 ngày + thời gian reviewer |
| **1. Platform** | P-0…P-6 (§8) | Runtime đa activity, Circuit không đổi | 4–5 ngày |
| **2. K3 kit (presentation)** | K-1 `BenchStage` + quality tiers + camera rig. K-2 glassware cross-kit (ống đong, cốc, cột nước, mặt khum, vạch chia). K-3 cân điện tử + LCD. K-4 thước, thỏi kim loại, khối gỗ, sỏi procedural. K-5 hiệu ứng rót, thả, sóng, bọt. K-6 2D SVG tương đương + ReadingLoupe. K-7 route dev `/dev/lab-kits/k3` (chỉ dev build) để soi từng dụng cụ. | Kit chạy độc lập không có logic khoa học | 7–9 ngày |
| **3. Model + rubric BE** | M-1 `density-bench@1.0.0` + schema + fixtures G/B/I (§5.7). M-2 activity/rubric `density-stations@1` trong registry. M-3 pack/config/biến thể (synthetic, isolated DB). M-4 integration: launch, submit, replay, idempotency, expiry, revoke. | Golden/invalid xanh trong isolated PG | 4–5 ngày |
| **4. FL-03 FE** | F-1 `DensityNotebook` (5 tab, bảng SGK). F-2 `Density2DStage`. F-3 `Density3DStage` ghép K3. F-4 draft/F5 restore theo run + schema. F-5 kết quả theo R1–R7, phản hồi theo trạm. F-6 i18n vi/en. | 2D và 3D cho cùng evidence với cùng thao tác | 7–9 ngày |
| **5. QA** | Q-1 Playwright mocked (2D, 3D, mobile 390×844, keyboard-only, reduced motion). Q-2 browser thật FE → BE → isolated PG, 1 attempt `passed` + 1 `needs_practice`. Q-3 parity test 2D/3D (so evidence). Q-4 đo hiệu năng trên Chromebook/Celeron, tablet, điện thoại tầm trung. Q-5 audit a11y (axe + thủ công). | Báo cáo đo thực tế, không suy diễn | 3–4 ngày |
| **6. Release** | Freeze tuple, digest; dev/agent double check và ADMIN `DEV_APPROVAL` cho draft mới; bind lesson đã review; activation; Class Lab assignment reuse | Release FL-03 | Theo lịch release |

Phase 2 và Phase 3 chạy song song được (khác repo, khác file). Phase 4 cần cả hai.

## 10. Tuân thủ gate

- Theo `lab-pipeline-phase-plan.md`: P3.5 gate **NOT MET** → chưa mở track Lab thứ hai. Plan này vì vậy chia: Phase 0, 1, 2 là chuẩn bị/platform/presentation (catalog CAT-10 đề xuất renderer-3d là platform track, không chiếm slot Lab — vẫn chờ chốt); Phase 3 trở đi là track Lab FL-03, chỉ bắt đầu khi (a) có OWNER_SIGNOFF thật cho Circuit, hoặc (b) owner ghi nhận ngoại lệ bằng văn bản.
- Catalog W2 đặt FL-10/FL-13 trước họ chất lỏng; chọn FL-03 trước cần quyết định CAT-3/D-2.
- Giữ cap ≤ 2 track đồng thời; FL-03 tính một track dù K3 dùng chung.
- Mọi test/seed chạy trên PostgreSQL loopback cô lập qua script guarded; không chạm Supabase dùng chung.

## 11. Quyết định cần chốt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| D-1 | Có làm Phase 1–2 trước khi Circuit có signoff thật? | Có; không làm Phase 3+ trước gate |
| D-2 | FL-03 trước FL-10/13 (đổi thứ tự W2)? | Có nếu mục tiêu là chứng minh K3 + runtime đa activity; ghi vào CAT-3 |
| D-3 | Phạm vi v1: đủ 4 trạm (theo B14-O01) hay tách S1 thành activity riêng? | Đủ 4 trạm trong một activity; S1 có thể tắt bằng config cho Class Lab |
| D-4 | Tolerance R2/R3 = 1 ĐCNN, R4 = 1 % | Chốt bởi science reviewer |
| D-5 | Chế độ trình đọc màn hình: không đánh giá R2/R3 hay cấp giá trị? | Không đánh giá, ghi rõ trong result |
| D-6 | 3D mặc định cho FL-03 khi nào? | Chỉ sau Q-3 parity + Q-4 đo thiết bị; trước đó mặc định 2D |

## 12. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Kính transmission nặng trên máy yếu | Tier Low không transmission; đo Q-4 trước khi mặc định 3D |
| Vạch chia và mực nước lệch nhau gây đọc sai | Một nguồn `k3-specs` cho cả texture và chiều cao; test đơn vị: mỗi mL = đúng số pixel/mm |
| Refactor registry làm đổi digest Circuit | Snapshot test digest + toàn bộ suite Circuit trong P-1 |
| Reviewer chưa sẵn sàng | Phase 1–2 không phụ thuộc reviewer; Phase 3 dùng giá trị PROPOSED trong fixture synthetic |
| Học sinh chia sẻ đáp án | Biến thể theo run (§5.3) |
| Lỗi OCR lọt vào copy học sinh | T0.2 trước F-1; copy FL-03 viết lại, không dán từ register |

## 13. Implementation Evidence — mốc đầu 2026-10-31 (technical candidate)

Built on branch `feat/fl03-runtime-registry` at the owner's request, ahead of the P3.5 gate (§10). **Tại mốc đầu này** chưa có Lab row, pack, config, activity version hay release; §15–§16 ghi nhận fixture isolated DB được tạo sau đó. Không dùng câu này để mô tả DB hiện tại. Đây chỉ là bằng chứng kỹ thuật: chưa có curriculum, science hoặc rights approval.

| Area | State |
|---|---|
| BE model | `density-bench@1.0.0` in `packages/sim` (observation only; specimen table and tolerances PROPOSED_UNAPPROVED). `VERSION` is unchanged so existing pinned runs still resolve. |
| BE rubric | `density-stations@1.0.0` registered in the evaluator registry. **Deviation from §5.6:** six criteria, not seven. The separate "procedure" criterion (R5) is folded into the calculation criterion, which already judges the textbook method (m₂ − m₁, V₂ − V₁, mean of trials); order errors (m₂ ≤ m₁, V₂ ≤ V₁) are validation errors that create no attempt. Criteria: balance, ruler, cylinder, calculation, unitConversion, concept; each reports unmet stations. |
| Evidence | `{ evidence: { explore, block, water, pebble, units } }` in the generic `evidence` envelope. A misreading is penalised once: calculation and unit conversion are judged against the learner's own readings. The result never returns expected readings. |
| Tests | 19 evaluator/model tests (G1–G6, B1–B2, I1–I3 plus runtime pinning and envelope). Not covered: BE integration (launch, replay, expiry) — needs an isolated PostgreSQL and a seeded density Lab/pack. |
| FE | `DensityActivity` 2D pilot on the K3 kit, registered as `rendererKey="density-bench"`; guided readiness, notebook tables 13.1–14.3, `K3Hud`. Dev-only previews at `/dev/lab-kits/k3` and `/dev/lab-kits/density`. 3 Playwright tests (mocked API). |
| Known gaps | Specimen data is duplicated between the FE sample config and the BE table (keep them identical; BE is authoritative). The block and pebble are chosen by the learner, not per run (§5.3 server-chosen variants are not built). 3D is not wired to the activity. Pack/config seeding and a `CHALLENGE_PARAMETERS` entry for `density` are needed before a pack can be validated. |

## 14. Implementation Evidence — runtime pins và sync (mốc tiếp theo 2026-10-31)

| Area | State |
|---|---|
| Challenge params | `density` added to `CHALLENGE_PARAMETERS` (modelRef `density-bench@1.0.0`, no learner-tunable parameters, rangeReview pending). |
| Per-run specimens (§5.3) | Launch picks a block and a pebble with `crypto.randomInt` (`density-specimens.ts`), pins them in the run's execution tuple, and returns them as `runtimeParams`. The evaluator rejects evidence for any other specimen, and an unpinned tuple fails closed. |
| FE | `DensityActivity` applies `runtimeParams` over local state (`applyRunPins`). Without pins (dev preview) it keeps its own choice. The mass table still comes from `fl03-density.config.ts`, not the payload. |
| BE↔FE sync | `density-config-sync.test.ts` imports the FE config from the sibling repo and checks instruments, tolerances, specimen masses, sizes, volumes and reference densities against the BE model. It is skipped when the FE repo is absent. |
| Seed / release | **Not done.** `.env` points at shared Supabase; a write needs owner approval. A LabRelease can only become ACTIVE with a genuine OWNER_SIGNOFF (plan §10), which cannot be fabricated. Proposed next step: a guarded, idempotent seed (`assert-isolated-db`) run first against the isolated loopback DB, then a DRAFT release for owner review. |
| Verification | BE: 294 unit tests pass; one pre-existing failure in `learning.controller.test.ts` also fails on the original code. FE: Playwright density spec 5/5, lint and build green. Integration tests not run (no isolated PostgreSQL). |

## 15. Implementation Evidence — seed isolated DB (2026-10-31)

- **Isolated DB (done):** a private PostgreSQL 18 instance on `127.0.0.1:54329`, database `nexalab_fl03_isolated`. Base `prisma/seed.ts` ran against it, then `npm run db:seed:fl03-isolated` (idempotent; second run changed nothing). The rows are Lab `density` (synthetic, releaseCleared=false, CLASS_PRIVATE), challenge `density_001`, activity `density-stations@1`, config v1 and pack `density-bench-fixture` v1 (active). No LabRelease was created.
- **Shared Supabase (not written):** the `.env` database was NOT seeded and no release was activated. Reason: an ACTIVE release needs a genuine OWNER_SIGNOFF (§10), and seeding the shared DB is outside the isolated-only rule in AGENTS.md. Waiting for the owner's decision on the sign-off path.
- **Pending:** end-to-end launch and submit through the API against the isolated DB still needs an assignment or an active release; not run in this pass.

## 16. Implementation Evidence — release chain trên isolated DB (2026-10-31)

- **Mechanics, through the real service:** `LabReleaseService.createDraft` → `review(OWNER_SIGNOFF)` → `activate`, all in `density-release.fixture.ts`. The release is `ACTIVE`, version 1, and its single review matches the release digest. Lab `density` has `releaseCleared=true`, `scope=SHARED_LIBRARY`, `topicCode` set.
- **Labelled test fixtures, not approvals:** the outcome `KHTN8-B14-O01`, chapter, topic, lesson and content pack are `TEST FIXTURE ONLY`. The OWNER_SIGNOFF is a mechanics receipt. It is not a real owner review and must not be read as curriculum or scientific approval.
- **Isolated only:** every write goes to `nexalab_fl03_isolated` on `127.0.0.1:54329`, behind the guard. The shared Supabase database in `.env` was not touched.
- **Idempotent:** the database was rebuilt from scratch, then the seed ran twice and the E2E ran twice. All passed. `releaseCleared` is owned by activation and is no longer reset by reruns.
- **E2E (`density-e2e.integration.test.ts`):** (a) assignment path, and (b) launch with no assignment through the ACTIVE release (`versionBinding=FOUNDATIONAL_RELEASE`). Both pin a specimen pair, submit evidence, and get `passed` 6/6, and a wrong-specimen submission creates no attempt.
- **Caveat:** the activity spec was changed in place (`density-stations` v1 now names `KHTN8-B14-O01`). The seed is the only writer, and it runs only on the isolated database. A real activity must be authored as a new immutable version.

## Open Gates — trạng thái hiện tại

- **FL-03 / FL-10 release state:** FL-03 Density v1 and FL-10 Mass Conservation v1 are active in the shared DB as of 2026-11-01. FL-10 is one conservation-of-mass activity, not full FL-10 stoichiometry coverage. Their publication does not transfer approval between Labs.
- **Remaining review and QA:** `OWNER_SIGNOFF_V1` requires one owner ADMIN signoff and records the owner's source/curriculum/science/rubric/safety/rights assessment. Separate subject-matter reviewer approvals are not required by current code. Resolve outstanding source/outcome issues, accessibility and representative-device QA; do not describe these as completed independent reviews.
- **P3.5 remains tracked NOT MET:** the later releases are owner-authorized releases, not retroactive evidence that every phase gate passed. Reconcile the recorded exception and complete remaining compatibility/review evidence before expanding the portfolio.
- **P3.7 chưa mở:** không suy từ số Lab có code, seed, hay `ACTIVE` trong isolated DB ra tiến độ portfolio/release production. Xem [phase plan](lab-pipeline-phase-plan.md) là nguồn chuẩn cho phase và gate.
