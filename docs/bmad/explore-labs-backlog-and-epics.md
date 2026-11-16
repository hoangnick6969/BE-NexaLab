# Explore Labs — BMAD Epics, Stories & Tracking

Cập nhật: 2026-11-14 · Nhánh nền: `feat/new-lab-foundation`
Chuẩn triển khai: [`docs/product/explore-first-lab-architecture-spec.md`](../product/explore-first-lab-architecture-spec.md)
Danh mục gốc: `_bmad-output/specs/spec-lab-pipeline/lab-portfolio-20-slots-v1.md` (PROPOSED_UNAPPROVED; ID, slot và
quyết định SHARE/KEEP/SPLIT lấy từ đây).

> Quy ước cho AI Agent: chỉ nhận story đang `READY_FOR_DEV`, làm theo Gate 0 → 4 của spec, dừng ở Gate 0 để trình
> thiết kế. Cuối phiên cập nhật cột trạng thái trong file này. Commit không có dòng `Co-authored-by` hay tên AI.

## Chú giải trạng thái

| Trạng thái | Nghĩa |
|---|---|
| `DONE` | Code Explore đủ Definition of Done (spec mục 5), đã commit. Dữ liệu khoa học có thể vẫn `unverified`: xem cột Review. |
| `IN_PROGRESS` | Đang có người/agent làm trên nhánh. |
| `READY_FOR_DEV` | Đủ thông tin để vào Gate 0. Các câu hỏi ghi ở "Cần chốt ở Gate 0" được trả lời trong Gate 0, không phải trước. |
| `ACTIVE` | Chế độ **Guided** đã có trong catalog và đang dùng; không đổi hành vi khi thêm Explore. |
| `—` | Chưa có. |

Cột **Guided** và **Explore** tách riêng: phần lớn Lab vật lý/sinh học đã có Guided, việc còn lại là thêm Explore
trên kit sẵn có, không viết lại.

---

## Tổng quan

| Epic | Kit | Lab | Slot | Lớp | Guided | Explore | Review khoa học |
|---|---|---|---|---|---|---|---|
| K2 Hóa học | `k2-wet-bench@1` | FL-13 Acid–base, chỉ thị & pH | 11 | 8 | — | `DONE` | chờ reviewer Hóa |
| | | FL-14a Kim loại + acid/muối (prototype) | 12 | 8 | — | `DONE` | chờ reviewer Hóa |
| | | FL-10 Bảo toàn khối lượng & mol | 8 | 8 | `ACTIVE` | `DONE` (config, route dev) | chờ reviewer Hóa |
| | | FL-11 Dung dịch & nồng độ | 9 | 8 | — | `READY_FOR_DEV` | — |
| | | FL-12 Tốc độ phản ứng & xúc tác | 10 | 8 | — | `READY_FOR_DEV` | — |
| | | FL-14 Full Phản ứng vô cơ & kim loại | 12 | 8/9 | — | `READY_FOR_DEV` | — |
| | | FL-15 An toàn phòng thí nghiệm | 13 | 8 | — | `READY_FOR_DEV` | bắt buộc reviewer an toàn |
| K1 Điện–Từ | `k1` | FL-01 Mạch điện một chiều | 1 | 8 (+9) | `ACTIVE` | `READY_FOR_DEV` | — |
| | | FL-25 Cảm ứng điện từ & xoay chiều | 18 | 9 | `ACTIVE` | `READY_FOR_DEV` | — |
| K3 Chất lưu | `k3-fluid` | FL-03 Khối lượng riêng | 2 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | | FL-05 Lực đẩy Archimedes | 4 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | | FL-04 Áp suất chất lỏng & khí quyển | 3 | 8 | — | `READY_FOR_DEV` | — |
| K4 Nhiệt | `k4-thermal` | FL-07 Năng lượng nhiệt & nhiệt dung | 6 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | | FL-08 Sự truyền nhiệt / dẫn nhiệt | 7 | 8 | — | `READY_FOR_DEV` | — |
| K5 Cơ học | `k5-mechanics` | FL-06 Moment lực & đòn bẩy | 5 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | | FL-24 Cơ năng, công & công suất | 17 | 9 | — | `READY_FOR_DEV` | provenance K9 |
| K6 Quang học | `k6-optics` | FL-23 Khúc xạ, thấu kính | 16 | 9 | — | `READY_FOR_DEV` | SPLIT chưa chốt |
| K7/K8 Sinh học | `k8-diorama` | FL-20 Giới hạn & nhân tố sinh thái | 14 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | `k8-diorama` | FL-21 Lưới thức ăn & cân bằng | 15 | 8 | `ACTIVE` | `READY_FOR_DEV` | — |
| | `k8-garden` | FL-26 Lai Mendel & di truyền NST | 19 | 9 | — | `READY_FOR_DEV` | provenance K9 |
| | `k7-molecular` | FL-27 Từ gene đến protein | 20 | 9 | `ACTIVE` | `READY_FOR_DEV` | — |
| Explorer 3D | `anatomy` | FL-16 Cấu tạo mắt | ngoài 20 slot | 8 | `ACTIVE` | `READY_FOR_DEV` | checklist SME FL-16 |
| | `anatomy` | FL-17 Tim & hệ tuần hoàn | ngoài 20 slot | 8 | — | `READY_FOR_DEV` | cần PO cấp ID |

`ACTIVE` ở đây nghĩa là Lab có renderer Guided và thẻ trong `FE-NexaLab/src/features/labs/lab-info.ts`. Bảng không
khẳng định Lab đó đã qua owner sign-off/release; trạng thái release xem `_bmad-output/implementation-artifacts/sprint-status.yaml`.

---

## Epic F0 — Nền tảng dùng chung (làm trước kit thứ hai)

K2 là kit Explore đầu tiên nên vài phần hiện chỉ phục vụ K2. Các story này gỡ phần đó ra để kit sau không sao chép.

| Status | Story | Việc | Done khi |
|---|---|---|---|
| `IN_PROGRESS` | F0-1 Envelope chung | `packages/sim/explore/envelope.ts` chứa envelope và các trường prompt chung. Bàn tự mở rộng schema, gồm `focus` và `highlightWhen` của K2. | Test sim pass, K2 giữ nguyên hành vi. |
| `DONE` | F0-2 Registry Explore đa bàn | FE đăng ký `{ kit, group, validate, loadPage, listKitItems }`, BE đăng ký `{ kit, validate }`. Bàn ướt đăng ký trong P0. | `/labs/:id` mở bàn ướt và fixture FE trên API mock. Kiểm với server thật theo cổng P0 §5.4. |
| `IN_PROGRESS` | F0-3 Thư viện item dùng chung | Tạo khung `features/labs/shared/items/` theo P0 C2.1. Pilot A thêm cốc và cân. | Có kiểu item, test kiểu và README quy ước anchor. |
| `IN_PROGRESS` | F0-4 Log quan sát dùng chung | Phần chung gồm khóa, đọc/ghi IndexedDB, giới hạn dòng và khung export. Kiểu dòng, mô tả hiện tượng và luật gộp thuộc từng bàn. | K2 đọc lại dữ liệu đã lưu và xuất đúng định dạng cũ. |
| `IN_PROGRESS` | F0-5 Seed đa bàn | `npm run db:seed:explore -- --kit <id-bàn>` gọi `publishExploreLab`. Có `--dry-run`, `--unpublish` và guard DB cô lập. | Đạt các ca mở Lab đã ghim, dùng lại version, tạo version khi config đổi và chặn mọi đường ghi ngoài DB cô lập (P0 §5.2). |
| `READY_FOR_DEV` | F0-6 Review Hóa K2 | Reviewer môn Hóa duyệt `species.ts`, `reagents.ts`, `reactions.ts`, `fl13-acid-base.data.ts` (dải màu chỉ thị, Ka, màu dung dịch). `reviewStatus` phục vụ hiển thị nhãn, phát hành Explore theo D-4. | `reviewStatus` từng bộ số chuyển `reviewed` có tên người duyệt. |
| `IN_PROGRESS` | F0-7 Quyết định hiển thị | (a) D-1 đã chốt: Foundational Explore hiện cho học sinh kèm nhãn `unverified`. (b) Chuyển Guided ↔ Explore ở FL-10 theo D-5 của pilot. | D-5 chốt contract hai mode. |

---

## Epic K2 — Hóa học (Wet Chemistry Bench, trên `PhysicalLabEnvironment`)

Kit: `k2-wet-bench@1` · Engine `wet-bench@1.0.0` · Sim: `packages/sim/wet-bench/` · FE: `features/labs/chemistry/wet-bench/`
Dụng cụ có sẵn (manifest K2): giá 6 ống nghiệm, ống nghiệm, cốc 100 mL, cốc thải, bình tam giác 100 mL, cân điện tử,
ống nhỏ giọt (1,0 mL, liều 1/5/10 giọt), kẹp gắp, giấy quỳ tím, bút đo pH, nút cao su, kệ hóa chất (số lọ và thứ tự theo `shelfPosition` trong config).
Giới hạn engine hiện tại: 25 °C cố định, phản ứng tức thời (không có trục thời gian), dung dịch loãng lý tưởng.

### K2-FL13 · Acid–base, chỉ thị & pH — `DONE`
- Slot 11 · KHTN 8 · labId `acid-base-indicators` · config `labs/fl-13.config.ts` · seed: có (Supabase, `KHTN8-L09`).
- Sim: `acid-base.ts` (`solveAcidBase`, bisection trên log10[H⁺], Ka CH₃COOH 1,8·10⁻⁵), `fl13-acid-base.data.ts`
  (`LITMUS_BANDS`, `PHENOLPHTHALEIN_BANDS`), golden test `fl13-acid-base.golden.test.ts`.
- Ngoài phạm vi: H₂SO₄ + Ca(OH)₂ (CaSO₄ ít tan).
- Còn mở: F0-6 review Hóa.

### K2-FL14a · Kim loại với acid loãng và dung dịch muối (prototype) — `DONE`
- Slot 12 (mode hẹp của FL-14 SPLIT) · labId `metal-reactivity` · config `labs/fl-14a.config.ts` · seed: có (`KHTN8-L11`).
- Phản ứng: `metal-acid.zn-hcl`, `metal-acid.fe-hcl`, `displace.fe-cuso4`, `displace.zn-cuso4`; Cu + HCl khai báo trơ.
- Còn mở: F0-6; FL-14 Full sẽ thay thế hoặc mở rộng config này.

### K2-FL14b · Phản ứng của muối — `DONE` (dev, chưa phát hành)
- Slot 12 (mode hẹp của FL-14 SPLIT) · labId `salt-reactions` · config `labs/fl-14b.config.ts` · topic `KHTN8-L11` · `wet-bench@1.0.0`.
- Phản ứng: `gas.na2co3-hcl`, `precip.agno3-nacl`, `precip.fecl3-naoh`, `precip.cuso4-naoh`. Dữ liệu `draft`. Spec: `fl-14-reaction-modes-explore-spec.md`.

### K2-FL14c · Oxide và acid — `DONE` (dev, chưa phát hành)
- Slot 12 (mode hẹp của FL-14 SPLIT) · labId `oxide-reactions` · config `labs/fl-14c.config.ts` · topic `KHTN8-L10` · `wet-bench@1.1.0` (cái thìa).
- Phản ứng: `oxide-acid.cuo-h2so4`, `oxide-acid.mgo-hcl`, `oxide-acid.fe2o3-hcl`; oxide với NaOH khai báo trơ.

### K2-FL10 · Bảo toàn khối lượng & mol — Explore `DONE` (config) · Guided `ACTIVE`
- Slot 8 (SPLIT) · labId `mass-conservation` · config `labs/fl-10-explore.config.ts` có `modes.guided`, nên route chính
  vẫn mở Guided; Explore chỉ chạy ở `/dev/lab-kits/k2`.
- Không sửa evaluator Guided. Phần mol/PTHH (`n = m/M`, chất dư, hiệu suất) của slot 8 **chưa** có trong Explore.
- Còn mở: F0-7(b).

### K2-FL11 · Pha chế dung dịch & nồng độ — `READY_FOR_DEV`
- Slot 9 (KEEP) · KHTN 8 · Outcome: `C% = m_ct/m_dd·100`, `CM = n/V`, pha dung dịch đích; bão hòa/độ tan.
- Tái sử dụng: cốc 100 mL, ống nhỏ giọt, kệ hóa chất, cân điện tử, cốc thải.
- Cần thêm: bình định mức (50/100 mL, vạch mức), đũa thủy tinh (khuấy → tan), phễu rót, thìa lấy hóa chất rắn
  (dung tích hữu hạn, ví dụ ≤ 1 g mỗi lần, cần review), cân phân tích (độ phân giải 0,01 g), bình tia nước cất.
- Biến trạng thái sim: `VesselState.solutes[{ speciesId, dissolvedMicrograms, undissolvedMicrograms }]`,
  `solutionMicroliters`, `solutionMassMicrograms`, `stirred: boolean`, `volumetricMarkMicroliters`,
  `scoopLoadedMicrograms`; số đo dẫn xuất `massPercentX100`, `molarityMicromolPerL`.
- Ngoài phạm vi (v1): độ tan theo nhiệt độ (K2 không có mô hình nhiệt), thể tích không cộng tính, độ cồn.
- Cần chốt ở Gate 0: bảng độ tan nào ở 25 °C; có tách "bảng độ tan theo nhiệt độ" thành mode chỉ xem số liệu không.
- Prompt: `Implement Lab FL-11 theo docs/product/explore-first-lab-architecture-spec.md và story K2-FL11 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng Kit K2, dừng ở Gate 0 để trình thiết kế.`

### K2-FL12 · Tốc độ phản ứng & xúc tác — `READY_FOR_DEV`
- Slot 10 (KEEP) · KHTN 8 · Outcome: ảnh hưởng của nồng độ, diện tích bề mặt, nhiệt độ, chất xúc tác lên tốc độ.
- Tái sử dụng: ống nghiệm, bình tam giác, nút cao su, kẹp gắp, ống nhỏ giọt, CaCO₃ dạng viên + HCl (đã có phản ứng `gas.caco3-hcl`).
- Cần thêm: nút cao su có ống dẫn khí, ống nghiệm/ống đong thu khí úp ngược, đồng hồ bấm giây, CaCO₃ dạng bột,
  hiển thị bọt khí theo tốc độ; chất xúc tác (ví dụ MnO₂ + H₂O₂) cần review an toàn.
- Biến trạng thái sim: `elapsedMs`, `gasCollectedMicroliters`, `rateMicrolitersPerS`, `surfaceArea: "chips" | "powder"`,
  `catalystId | null`, `limitingRemainingNmol`; hàm `advance(state, dtMs)` thuần.
- Cần chốt ở Gate 0 (**chặn kỹ thuật**): engine K2 là tức thời. Cần quyết định thêm trục thời gian
  (`engine wet-bench@1.1.0`, luật tốc độ đơn giản đã khai báo) hay làm kit con riêng. Biến nhiệt độ: chỉ cho chọn
  nấc định tính (lạnh/thường/ấm) hay để ngoài phạm vi.
- Prompt: `Implement Lab FL-12 theo docs/product/explore-first-lab-architecture-spec.md và story K2-FL12 trong docs/bmad/explore-labs-backlog-and-epics.md; trình phương án mở rộng trục thời gian cho engine wet-bench ở Gate 0 trước khi code.`

### K2-FL14 · Phản ứng vô cơ & kim loại (Full) — `READY_FOR_DEV`
- Slot 12 (SPLIT) · KHTN 8/9 · Outcome: dự đoán phản ứng từ cơ sở dữ liệu phản ứng đã review (khí, kết tủa, đổi màu),
  bảng tính tan, dãy hoạt động kim loại.
- Tái sử dụng: toàn bộ K2 + config FL-14a.
- Cần thêm: khay phản ứng giọt (spot plate 12 ô), thêm kim loại (Mg, Al, Pb, Ag dạng lá/hạt — cần review an toàn),
  dung dịch muối (AgNO₃, FeCl₃, BaCl₂…), panel tra cứu bảng tính tan và dãy hoạt động (HUD, chỉ xem).
- Biến trạng thái sim: mở rộng `K2_REACTIONS` theo nhóm (`precip.*`, `gas.*`, `displace.*`, `metal-acid.*`),
  `K2_INERT_PAIRS`, `SOLUBILITY_TABLE`, `ACTIVITY_SERIES`; mỗi luật có `reviewStatus`.
- Cần chốt ở Gate 0: tách SPLIT thành những Lab nào (gợi ý: FL-14a kim loại, FL-14b kết tủa & tính tan, FL-14c khí);
  danh sách phản ứng tối thiểu cho mỗi Lab con.
- Prompt: `Implement Lab FL-14 (Full) theo docs/product/explore-first-lab-architecture-spec.md và story K2-FL14 trong docs/bmad/explore-labs-backlog-and-epics.md; đề xuất cách tách SPLIT và danh sách phản ứng ở Gate 0.`

### K2-FL15 · Kịch bản an toàn phòng thí nghiệm — `READY_FOR_DEV`
- Slot 13 (KEEP) · KHTN 8 · Outcome: nhận diện ký hiệu GHS, chọn bảo hộ, xử lý sự cố.
- Tái sử dụng: `PhysicalLabEnvironment`, kệ hóa chất (nhãn GHS trên lọ), cốc/ống nghiệm làm đạo cụ.
- Cần thêm: tủ đồ bảo hộ (kính, găng, áo blouse, khẩu trang), biển GHS, bộ xử lý tràn đổ (cát/giấy thấm, xô),
  vòi rửa mắt; kịch bản sự cố (tràn acid, vỡ ống nghiệm, cháy cồn) là đạo cụ minh họa.
- Biến trạng thái sim: `scenarioId`, `ppeWorn: Set<PpeId>`, `hazardsIdentified: Set<GhsId>`,
  `incident: { kind, state: "active" | "contained" | "escalated" }`, `actionsTaken[]`; `checkScenario()` theo luật đã review.
- Ràng buộc: là bài *kịch bản*, không phải thao tác hóa chất; mọi luật cần reviewer an toàn; Stage 1 nói rõ đây không
  thay thế huấn luyện an toàn thật.
- Prompt: `Implement Lab FL-15 theo docs/product/explore-first-lab-architecture-spec.md và story K2-FL15 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng PhysicalLabEnvironment, trình bộ luật kịch bản ở Gate 0.`

---

## Epic K1 — Vật lý Điện–Từ (trên `PhysicalLabEnvironment`)

Hiện có: `circuit()` / `circuitBulb()` / `emInduction()` trong `packages/sim/index.ts`; FE `features/labs/physics/electricity/`
(`CircuitBulbActivity`, `Circuit2DEditor`, `induction/`). Explore sẽ dùng subpath mới `packages/sim/k1-circuit/`, không sửa API cũ.

### K1-FL01 · Mạch điện một chiều — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 1 (SHARE) · KHTN 8 (+ mở rộng K9 `P = U·I`, `A = P·t` là activity riêng).
- Tái sử dụng: pin/nguồn, dây nối, công tắc, bóng đèn, LED, mesh 3D trong `CircuitBulb3DStage`.
- Cần thêm: biến trở, ampe kế, vôn kế, bảng mạch có lỗ cắm (breadboard) để kéo-thả linh kiện, đầu dây kẹp cá sấu.
- Biến trạng thái sim: `components[{ id, kind, terminals, params }]`, `wires[{ from, to }]`, `switchClosed`,
  `readings{ ammeterMilliA, voltmeterMilliV }`, `ledState: "off" | "on" | "reverse" | "burnt_out_of_scope"`.
- Dung tích hữu hạn: số linh kiện/dây trong khay có giới hạn.
- Ngoài phạm vi: đoản mạch nguồn (báo nguy hiểm, không mô phỏng cháy), điện trở trong thực.
- Prompt: `Implement Explore mode cho FL-01 theo docs/product/explore-first-lab-architecture-spec.md và story K1-FL01 trong docs/bmad/explore-labs-backlog-and-epics.md; giữ nguyên Guided circuit, dừng ở Gate 0.`

### K1-FL25 · Cảm ứng điện từ & dòng xoay chiều — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 18 (KEEP) · KHTN 9 · mô hình định tính, không có số Faraday.
- Tái sử dụng: `EmInduction3DStage`, `apparatus/` (nam châm, cuộn dây), `emInduction()`.
- Cần thêm: lõi thép tháo lắp, đèn LED hai chiều (thấy đảo chiều), điện kế kim giữa, tay quay máy phát.
- Biến trạng thái sim: `magnetPose{ positionMm, velocityMmPerS, pole }`, `coilTurns`, `coreInserted`,
  `fluxTrend: "increasing" | "decreasing" | "steady"`, `inducedDirection: "D1" | "D2" | "NONE"`, `generatorRpm`.
- Prompt: `Chuẩn hóa FL-25 sang Explore-First theo docs/product/explore-first-lab-architecture-spec.md và story K1-FL25 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng EmInduction3DStage, dừng ở Gate 0.`

---

## Epic K3 — Vật lý Chất lưu (trên `PhysicalLabEnvironment`)

Hiện có: FE `features/labs/physics/fluid/kit/` (`FluidBench3D`, `apparatus/`, `hud/`, `k3-config.ts`); sim `densityBench()`
(`DENSITY_SPECIMENS`, `DENSITY_EXPLORE_IDS`) và `simulateBuoyancy()`. Plan: `fl-03-density-k3-plan.md`, `fl-05-buoyancy-k3-plan.md`.

### K3-FL03 · Xác định khối lượng riêng — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 2 (SHARE) · KHTN 8 · `D = m/V`.
- Tái sử dụng: cân, ống đong, bình tràn, mẫu vật K3.
- Cần thêm: mở khóa toàn bộ mẫu (gỗ, đá/sỏi, nhôm, đồng, sắt) trong Explore; thước đo khối hộp.
- Biến trạng thái sim: `specimenId`, `onScale`, `scaleReadingMg`, `cylinderLevelMicroliters`, `overflowMicroliters`,
  `submerged`; dung tích ống đong/bình tràn hữu hạn (tràn thì báo).
- Prompt: `Implement Explore mode cho FL-03 theo docs/product/explore-first-lab-architecture-spec.md và story K3-FL03 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng Kit K3, dừng ở Gate 0.`

### K3-FL05 · Lực đẩy Archimedes — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 4 (SHARE) · KHTN 8 · `F_A = d·V`, nổi/chìm.
- Tái sử dụng: lực kế, bình tràn, mẫu vật, chất lỏng K3; dữ liệu mật độ đã review từ FL-03.
- Cần thêm: mở khóa toàn bộ mẫu và chất lỏng (nước, nước muối, dầu — cần review mật độ).
- Biến trạng thái sim: `specimenId`, `liquidId`, `immersedFractionX1000`, `dynamometerReadingMilliN`,
  `buoyantForceMilliN`, `floats: boolean`.
- Prompt: `Implement Explore mode cho FL-05 theo docs/product/explore-first-lab-architecture-spec.md và story K3-FL05 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng Kit K3, dừng ở Gate 0.`

### K3-FL04 · Áp suất chất lỏng & khí quyển — `READY_FOR_DEV`
- Slot 3 (SHARE) · KHTN 8 · `p = F/S`, `p = d·h`, Pascal (định tính), áp suất khí quyển (định tính).
- Tái sử dụng: bể/bình chất lỏng K3, nền bàn, HUD K3.
- Cần thêm: đầu dò màng cao su (xoay hướng), áp kế chữ U, bình thông nhau, khối vật trên bề mặt cát (`p = F/S`).
- Biến trạng thái sim: `probeDepthMm`, `probeOrientation: "up" | "down" | "side"`, `liquidId`,
  `manometerDeltaMm`, `contactAreaMm2`, `forceMilliN`.
- Cần chốt ở Gate 0: lỗ hổng nguồn B15 trong register (ghi trong portfolio).
- Prompt: `Implement Lab FL-04 theo docs/product/explore-first-lab-architecture-spec.md và story K3-FL04 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng Kit K3, dừng ở Gate 0.`

---

## Epic K4 — Vật lý Nhiệt học (trên `PhysicalLabEnvironment`)

Hiện có: sim `thermal-bench.ts` (`evaluateThermalBench`); FE `physics/thermal/` (`ThermalEnergyActivity`, `kit/ThermalBenchStage`).
Plan: `fl-07-thermal-energy-design.md`.

### K4-FL07 · Năng lượng nhiệt & nhiệt dung — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 6 (SHARE) · KHTN 8 · `Q = P·t`, `ΔT = Q/(m·c)`, giả định thất thoát nhiệt khai báo.
- Tái sử dụng: nhiệt lượng kế, que đun, joulemeter, nhiệt kế số trong `ThermalBenchStage`.
- Cần thêm: chọn khối lượng nước bằng ống đong (dung tích hữu hạn), mẫu chất lỏng khác (bảng c đã review), bộ hẹn giờ.
- Biến trạng thái sim: `heaterPowerW`, `heaterOn`, `elapsedMs`, `energyJoules`, `liquidId`, `liquidMassMg`,
  `temperatureCx100`, `heatLossModel`.
- Prompt: `Implement Explore mode cho FL-07 theo docs/product/explore-first-lab-architecture-spec.md và story K4-FL07 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng ThermalBenchStage, dừng ở Gate 0.`

### K4-FL08 · Sự truyền nhiệt / dẫn nhiệt — `READY_FOR_DEV`
- Slot 7 (SHARE) · KHTN 8 · so sánh dẫn nhiệt 1-D theo vật liệu, cách nhiệt; đối lưu/bức xạ định tính.
- Tái sử dụng: nguồn nhiệt và đồ thị/đo của K4.
- Cần thêm: giá đỡ thanh kim loại (đồng, nhôm, sắt; thêm thủy tinh/gỗ để so sánh), nến sáp chỉ thị nhiệt gắn dọc thanh,
  đinh ghim rơi khi sáp chảy, vỏ cách nhiệt.
- Biến trạng thái sim: `rods[{ materialId, waxMarkers[{ positionMm, melted, meltedAtMs }] }]`, `heatSourceOn`,
  `elapsedMs`, `insulationId | null`; thứ hạng dẫn nhiệt đã review, không mô phỏng phương trình nhiệt đầy đủ.
- Prompt: `Implement Lab FL-08 theo docs/product/explore-first-lab-architecture-spec.md và story K4-FL08 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng Kit K4, dừng ở Gate 0.`

---

## Epic K5 — Vật lý Cơ học (trên `PhysicalLabEnvironment`)

Hiện có: sim `lever-bench.ts` (`evaluateLeverBench`, `classifyLeverCase`); FE `physics/mechanics/` (`LeverInvestigationActivity`,
`kit/K5Stage`). Plan: `fl-06-lever-k5-plan.md`, `fl-06-lever-model-slice-spec.md`.

### K5-FL06 · Moment lực & đòn bẩy — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 5 (KEEP) · KHTN 8 · `M = F·d`, `F1·d1 = F2·d2`, ba loại đòn bẩy.
- Tái sử dụng: thanh đòn chia vạch, trục quay, quả nặng trong `K5Stage`.
- Cần thêm: quả nặng có móc treo kéo-thả lên từng vạch, lực kế kéo (kéo theo hướng), dời điểm tựa (3 loại đòn bẩy).
- Biến trạng thái sim: `pivotPositionMm`, `weights[{ positionMm, massG }]`, `forceMeter{ positionMm, angleDeg, readingMilliN }`,
  `netMomentMilliNm`, `tilt: "left" | "right" | "balanced"`; khay quả nặng có số lượng hữu hạn.
- Prompt: `Implement Explore mode cho FL-06 theo docs/product/explore-first-lab-architecture-spec.md và story K5-FL06 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng K5Stage, dừng ở Gate 0.`

### K5-FL24 · Cơ năng, công & công suất — `READY_FOR_DEV`
- Slot 17 (KEEP) · KHTN 9 · `Wđ = ½mv²`, `Wt = P·h`, bảo toàn trên máng không ma sát/con lắc, `A = F·s`, `P = A/t`.
- Tái sử dụng: nền K5, lực kế.
- Cần thêm: máng trượt nghiêng chỉnh góc, xe/viên bi, con lắc, cổng quang điện + đồng hồ đo thời gian.
- Biến trạng thái sim: `rampAngleDeg`, `releaseHeightMm`, `massG`, `gates[{ positionMm, blockedAtMs }]`,
  `speedMmPerS`, `frictionless: true`.
- Cần chốt ở Gate 0: quy ước `P = 10m` theo SGK (reviewer xác nhận); provenance K9.
- Prompt: `Implement Lab FL-24 theo docs/product/explore-first-lab-architecture-spec.md và story K5-FL24 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng Kit K5, dừng ở Gate 0.`

---

## Epic K6 — Vật lý Quang học (trên `PhysicalLabEnvironment`, giảm sáng phòng)

Hiện có: chưa có kit (`physics/optics/README.md`). Có thể tham khảo mô hình tia trong `eye-optics.ts`.

### K6-FL23 · Khúc xạ ánh sáng, thấu kính — `READY_FOR_DEV`
- Slot 16 (SPLIT) · KHTN 9 · Snell, `n = c/v`, góc tới hạn, lăng kính, dựng ảnh qua thấu kính mỏng, kính lúp; tán sắc định tính.
- Tái sử dụng: `PhysicalLabEnvironment` (thêm chế độ giảm sáng ở kit, không sửa vỏ phòng chung).
- Cần thêm: đèn rọi tia hẹp, bản bán nguyệt, lăng kính, thấu kính hội tụ/phân kỳ, giá quang học có thước, màn hứng.
- Biến trạng thái sim: `source{ positionMm, angleDeg }`, `elements[{ kind, positionMm, n | focalMm }]`,
  `rays[]` (tính thuần), `incidenceDeg`, `refractionDeg`, `totalInternalReflection`, `imageDistanceMm`.
- Cần chốt ở Gate 0: tách SPLIT (khúc xạ/lăng kính vs thấu kính); dùng công thức `1/f = 1/d + 1/d'` hay chỉ dựng hình.
- Prompt: `Implement Lab FL-23 theo docs/product/explore-first-lab-architecture-spec.md và story K6-FL23 trong docs/bmad/explore-labs-backlog-and-epics.md; tạo Kit K6 mới, đề xuất cách tách SPLIT ở Gate 0.`

---

## Epic K7 & K8 — Sinh học (không dùng phòng thí nghiệm vật lý)

Không dùng `PhysicalLabEnvironment`. K8 = sa bàn/cảnh nhẹ + HUD; K7 = không gian phân tử procedural.
"Dụng cụ" ở đây là đối tượng trong cảnh (sinh vật, cây, phân tử). Quy tắc chuột phải/`Esc` và dung tích hữu hạn vẫn
áp dụng cho đối tượng đang cầm và kho đối tượng.

### K8-FL20 · Giới hạn & nhân tố sinh thái — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 14 (KEEP) · KHTN 8 · sim `ecology-tolerance.ts`; FE `biology/ecology/tolerance` + `kit/` (`PondDiorama3D`, `Thermometer3D`).
- Cần thêm: chỉnh nhiều nhân tố (nhiệt độ, ánh sáng, độ mặn) bằng dụng cụ cầm trong cảnh; khung đếm mật độ.
- Biến trạng thái sim: `speciesId`, `factors{ temperatureCx10, ... }`, `toleranceZone`, `quadrat{ areaM2, count }`, `ageSample`.
- Prompt: `Implement Explore mode cho FL-20 theo docs/product/explore-first-lab-architecture-spec.md và story K8-FL20 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng EcoStage, dừng ở Gate 0.`

### K8-FL21 · Lưới thức ăn & cân bằng — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 15 (KEEP) · KHTN 8 · sim `food-web.ts`; FE `biology/ecology/food-web` + `MeadowDiorama3D`.
- Cần thêm: kéo sinh vật vào/ra sa bàn quần xã (kho loài hữu hạn), nối mũi tên ăn–bị ăn, tháp năng lượng 10 %.
- Biến trạng thái sim: `present: Set<FoodWebSpeciesId>`, `edges[]`, `removed`, `effects[{ speciesId, trend }]`, `energyChain`.
- Prompt: `Implement Explore mode cho FL-21 theo docs/product/explore-first-lab-architecture-spec.md và story K8-FL21 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng MeadowDiorama3D, dừng ở Gate 0.`

### K8-FL26 · Lai Mendel & di truyền NST — `READY_FOR_DEV`
- Slot 19 (KEEP) · KHTN 9 · Punnett lai 1 và 2 cặp tính trạng, tỉ lệ kỳ vọng, lấy mẫu có `seed`, XY, liên kết hoàn toàn.
- Cần thêm: vườn thực nghiệm (chậu cây đậu Hà Lan), giao tử kéo-thả vào ma trận Punnett HUD, bộ đếm đời con.
- Biến trạng thái sim: `parents[{ genotype }]`, `cross: "mono" | "di"`, `punnett[][]`, `seed`, `offspringCounts`,
  `linkage: "independent" | "complete"`.
- Cần chốt ở Gate 0: provenance K9; có cho lấy mẫu ngẫu nhiên (seeded) trong Explore không.
- Prompt: `Implement Lab FL-26 theo docs/product/explore-first-lab-architecture-spec.md và story K8-FL26 trong docs/bmad/explore-labs-backlog-and-epics.md; tạo cảnh Vườn thực nghiệm K8 + Punnett HUD, dừng ở Gate 0.`

### K7-FL27 · Từ gene đến protein — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Slot 20 (KEEP) · KHTN 9 · sim `gene-expression.ts`; FE `biology/molecular/` (`kit/MolecularStage`, `k7-codons.ts`). Plan: `fl-27-gene-protein-k7-plan.md`.
- Cần thêm: cầm nucleotide/tRNA đặt vào mạch (kho hữu hạn), tạo đột biến điểm tự do và xem codon/amino acid đổi.
- Biến trạng thái sim: `dnaTemplate`, `strandPairs[]`, `mRna`, `ribosomeIndex`, `polypeptide[]`, `mutation{ index, from, to }`.
- Prompt: `Implement Explore mode cho FL-27 theo docs/product/explore-first-lab-architecture-spec.md và story K7-FL27 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng MolecularStage, dừng ở Gate 0.`

---

## Epic Explorer — Xem & khám phá mô hình 3D (không chấm điểm, studio trung tính)

Không có bàn thí nghiệm; Stage 2 là studio xoay/cắt/tách lớp mô hình. Vẫn có Stage 1 (Outcome, lưu ý), log quan sát
(bộ phận đã xem) và drawer câu hỏi tùy chọn.

### EX-FL16 · Mô hình cấu tạo mắt 3D — Guided `ACTIVE` · Explore `READY_FOR_DEV`
- Ngoài 20 slot · KHTN 8 · FE `biology/anatomy/Eye.tsx`, `kit/` (`AnatomyStage`, `EyeModel`, `eye-parts.ts`), sim `eye()` và `eye-optics.ts`.
  Lab liên quan `eye-optics` (điều tiết). Plan: `fl-16-eye-anatomy-kit-plan.md`, checklist `fl-16-sme-review-checklist.md`.
- Cần thêm: chế độ studio tách lớp/mặt cắt, kéo thẻ tên vào bộ phận, đèn chiếu tia vào mắt.
- Biến trạng thái: `visibleLayers`, `cutPlane`, `selectedPartId`, `labelsPlaced{ partId: boolean }`, `accommodation`.
- Prompt: `Implement Explore mode cho FL-16 theo docs/product/explore-first-lab-architecture-spec.md và story EX-FL16 trong docs/bmad/explore-labs-backlog-and-epics.md; tái sử dụng AnatomyStage, dừng ở Gate 0.`

### EX-FL17 · Mô hình tim & hệ tuần hoàn 3D — `READY_FOR_DEV`
- Ngoài 20 slot (cần PO cấp ID chính thức) · KHTN 8.
- Tái sử dụng: khung `AnatomyStage` (studio, ánh sáng, xoay, mặt cắt).
- Cần thêm: mô hình tim 4 buồng + van, mạch phổi/mạch hệ thống, hạt dòng máu (đỏ/xanh) chạy theo nhịp.
- Biến trạng thái: `cutPlane`, `phase: "systole" | "diastole"`, `heartRateBpm`, `flowPath`, `selectedPartId`.
- Cần chốt ở Gate 0: ID và slot; nguồn SGK; mức chi tiết giải phẫu; reviewer Sinh.
- Prompt: `Implement Lab FL-17 theo docs/product/explore-first-lab-architecture-spec.md và story EX-FL17 trong docs/bmad/explore-labs-backlog-and-epics.md; dùng khung AnatomyStage, dừng ở Gate 0 để chốt ID và nguồn.`

---

## Thứ tự đề xuất

1. F0-1 → F0-5 (nền tảng đa kit), song song F0-6/F0-7 (review và quyết định của PO).
2. Explore cho Lab đã có Guided và kit sẵn (rẻ nhất): FL-03, FL-05, FL-06, FL-07, FL-21, FL-20.
3. Lab mới trên kit sẵn: FL-11, FL-14 Full, FL-04, FL-08.
4. Lab cần mở rộng engine hoặc kit mới: FL-12 (trục thời gian), FL-24, FL-23 (K6), FL-26, FL-15, FL-17.

## Nhật ký cập nhật

| Ngày | Ai | Thay đổi |
|---|---|---|
| 2026-11-14 | owner | Tạo backlog; K2 pilot (FL-13, FL-14a, FL-10 Explore) `DONE`. |
