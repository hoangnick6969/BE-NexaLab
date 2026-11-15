# Explore-First Lab Architecture — Golden Blueprint

Status: APPROVED_PATTERN (rút ra từ pilot Kit K2 + FL-13, nhánh `feat/new-lab-foundation`, 2026-11-14).
Áp dụng cho: mọi Lab mới hoặc mọi chế độ Explore bổ sung cho Lab đã có.
Đọc cùng: `_bmad-output/specs/spec-lab-pipeline/k2-wet-bench-explore-kit-design.md` (thiết kế gốc của K2),
`_bmad-output/specs/spec-lab-pipeline/lab-portfolio-20-slots-v1.md` (danh mục 20 slot),
`docs/bmad/explore-labs-backlog-and-epics.md` (backlog và trạng thái từng Lab).

> Tài liệu này là hợp đồng triển khai. Khi nhận lệnh `Implement Lab FL-XX`, AI Agent hoặc dev phải
> làm đúng các mục **BẮT BUỘC** dưới đây, theo đúng thứ tự Gate ở mục 7, mà không cần giải thích lại.
> Chỗ nào tài liệu này mâu thuẫn với code hiện có, code K2 trên `feat/new-lab-foundation` là bản tham chiếu.

---

## 0. Nguyên tắc sản phẩm

1. **Thao tác trước, câu hỏi sau.** Học sinh vào Lab là được cầm, kéo, thả, đo ngay. Câu hỏi chỉ là gợi mở
   tùy chọn, không bao giờ khóa bàn thí nghiệm, không có thứ tự bắt buộc.
2. **Explore không chấm điểm.** Không tạo `LabRun`, `Attempt`, evidence hay điểm. Dữ liệu ở lại trên máy học sinh
   (IndexedDB) cho tới khi có Class Lab endpoint nhận `exportObservationLog()`.
3. **Trung thực về mô hình.** Mô phỏng chỉ trả lời trong phạm vi mô hình đã khai báo. Ngoài phạm vi thì nói rõ
   "nằm ngoài phạm vi mô hình" kèm lý do, không bịa kết quả, không suy ra "không phản ứng" từ việc thiếu luật.
4. **Dùng chung theo Kit.** Lab là *cấu hình* trên một Kit (bàn + dụng cụ + engine). Lab mới ưu tiên thêm config,
   chỉ thêm dụng cụ/engine khi Lab thật sự cần.
5. **Guided và Explore cùng tồn tại.** Lab đã có luồng guided (server evaluator, event order) giữ nguyên.
   Explore là chế độ thêm vào, không sửa evaluator cũ.

---

## 1. Kiến trúc 3 tầng (BẮT BUỘC)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Tầng 3 · 3-Stage UX & DB Seed                                             │
│   LabIntroOverlay → Explore Workbench (+ObservationLog) → ObservationDrawer│
│   scripts/seed-<kit>-explore-labs.ts  →  Lab.config.explore               │
├───────────────────────────────────────────────────────────────────────────┤
│ Tầng 2 · FE Kit 3D + Accessible HUD                                       │
│   features/labs/<subject>/<kit>/kit/  (reducer, stage 3D, HUD, log)       │
│   features/labs/<subject>/<kit>/labs/flXX.config.ts                       │
├───────────────────────────────────────────────────────────────────────────┤
│ Tầng 1 · packages/sim/<kit-slug>/  (hàm thuần, không React, không I/O)     │
│   contracts.ts · engine.ts · flXX.data.ts · flXX.golden.test.ts           │
└───────────────────────────────────────────────────────────────────────────┘
```

Hướng phụ thuộc chỉ đi xuống: Tầng 3 → Tầng 2 → Tầng 1. Tầng 1 không import gì từ FE, không biết đến 3D.

### 1.1 Tầng 1 — `BE-NexaLab/packages/sim/<kit-slug>/`

Tham chiếu: `packages/sim/wet-bench/`.

| File | Vai trò | Quy tắc |
|---|---|---|
| `contracts.ts` | Schema zod: state, operation, config Lab | Đơn vị **số nguyên**: µL, nmol, µg, mm, ms, pH×100, °C×100. Không dùng float cho đại lượng lưu trữ. |
| `engine.ts` | `createBench(config)`, `applyOperation(state, op) → { state, transition }`, `observe…()`, `measure…()` | Hàm thuần, deterministic, không `Date.now()`/`Math.random()` (cần ngẫu nhiên thì nhận `seed`). |
| `flXX.data.ts` | Hằng số khoa học riêng của Lab (bảng màu chỉ thị, Ka, hệ số…) | Mỗi bộ số có `reviewStatus: "unverified" \| "reviewed"` và `source`. Mặc định `unverified`. |
| `flXX.golden.test.ts` | Golden test: input cố định → output số cố định | Mỗi hiện tượng mà Lab cam kết có ít nhất 1 ca; mỗi ca ngoài phạm vi có 1 ca. |
| `validate-config.ts` | `validate<Kit>LabConfig(raw)` | Chặn `review.status: "reviewed"` khi còn input `unverified`; chặn tham chiếu dụng cụ/hóa chất không tồn tại. |
| `index.ts` | Export công khai của subpath | Import từ FE qua subpath `@nexalab/sim/<kit-slug>`, **không** thêm vào `packages/sim/index.ts` gốc. |

**Phạm vi mô hình (BẮT BUỘC).** Engine phải phân loại mọi thao tác vào một trong các nhóm, ví dụ ở K2:
`classifyPair → acid_base | reaction | inert | not_in_lab_scope | unreviewed`. Kết quả ngoài phạm vi trả về:

```ts
{ outOfScope: true, reasonVi: "Trộn H₂SO₄ với nước vôi trong nằm ngoài phạm vi mô hình (có thể tạo CaSO₄ ít tan)." }
```

- Thiếu luật **không** đồng nghĩa với "không xảy ra gì". Chỉ trả `inert` khi cặp đó được khai báo trơ rõ ràng.
- Config Lab khai báo `allowedReactions`/`supportedScope`; engine từ chối phần còn lại một cách trung thực.
- `limitations[]` trong config liệt kê các giả định (nhiệt độ cố định, phản ứng tức thời, lý tưởng hóa…) và được
  hiển thị ở Stage 1.

**Đóng gói.** Sau khi đổi Tầng 1: tăng `version` trong `packages/sim/package.json`, thêm file mới vào `files`,
`npm pack` ra `FE-NexaLab/vendor/nexalab-sim-<ver>.tgz`, cập nhật `FE-NexaLab/package.json` + lockfile.

### 1.2 Tầng 2 — FE Kit 3D + Accessible HUD

Tham chiếu: `FE-NexaLab/src/features/labs/chemistry/wet-bench/kit/`.

| File (mẫu K2) | Vai trò |
|---|---|
| `apparatus-manifest.ts` | Danh sách loại dụng cụ, kích thước, dung tích, điểm snap, nhãn tiếng Việt |
| `bench-layout.ts` | Vị trí slot nghỉ (rest pose) của từng dụng cụ và kệ hóa chất |
| `bench-reducer.ts` | State tương tác thuần (cầm gì, nạp bao nhiêu, undo stack, log); gọi engine Tầng 1 |
| `<Kit>Stage.tsx` | Canvas R3F: đặt `PhysicalLabEnvironment` + dụng cụ của kit, kéo-thả, snap |
| `apparatus3d.tsx` | Mesh 3D của từng dụng cụ (thủy tinh, chất lỏng, nhãn, nắp…) |
| `BenchHud.tsx` | HUD truy cập được: danh sách dụng cụ/đích, trạng thái đang cầm, nút Undo/Reset/Đặt về chỗ cũ |
| `ExploreBench.tsx` | Ghép Stage + HUD + log, đăng ký phím `Esc` và chuột phải |
| `ObservationLogPanel.tsx`, `observation-log.ts` | Nhật ký quan sát, gộp dòng, IndexedDB, export |
| `ExploreLabPage.tsx` | Trang Explore: Stage 1 → 2 → 3 |
| `../labs/flXX.config.ts` | Config từng Lab, kiểu `<Kit>LabConfig` từ Tầng 1 |

`PhysicalLabEnvironment` (`features/labs/shared/`) chỉ là vỏ phòng (tường, sàn, bàn, ánh sáng). **Không** đặt
dụng cụ riêng của kit vào đó; kit tự đặt dụng cụ trong Stage của mình.

#### Quy tắc tương tác BẮT BUỘC

1. **Không dùng khối cầu tạm.** Cầm dụng cụ nào thì mesh 3D của chính dụng cụ đó đi theo con trỏ
   (`FollowGroup` lerp theo vị trí con trỏ chiếu xuống mặt bàn, đọc qua ref để không re-render mỗi frame).
   Cấm hiển thị proxy hình cầu, hình hộp hay con trỏ màu thay cho dụng cụ.
2. **Chuột phải + `Esc` = trả dụng cụ về chỗ nghỉ.** Khi đang cầm: bắt `contextmenu` ở `window` (capture,
   `preventDefault` để không mở menu trình duyệt) và phím `Esc` → dispatch `release`. HUD luôn hiển thị
   `Đang cầm: <Tên dụng cụ> — Nhấn chuột phải hoặc Esc để đặt về chỗ cũ` và có nút `Đặt về chỗ cũ`.
   Khi không cầm gì, chuột phải hoạt động bình thường.
3. **Dung tích hữu hạn.** Mọi dụng cụ chứa chất/vật liệu có dung tích thật, khai báo trong manifest:

   | Dụng cụ | Giới hạn | Liều mỗi lần |
   |---|---|---|
   | Ống nhỏ giọt (K2) | `DROPPER_CAPACITY_MICROLITERS = 1000` (1,0 mL = 20 giọt) | preset `[50, 250, 500]` µL = 1 / 5 / 10 giọt |
   | Ống nghiệm, cốc, bình | theo `kind` trong manifest | thêm vượt dung tích bị chặn, không tốn chất trong dụng cụ cầm |
   | Thìa hóa chất rắn, cân (kit mới) | khai báo trong manifest, phải qua review | — |

   Hết chất → dụng cụ chuyển về trạng thái rỗng, hiện thông báo, phải nạp lại từ nguồn. Cấm "bấm vô hạn".
   Nhãn dụng cụ hiển thị lượng còn lại dạng `NaOH 0,1 M · 0,75 / 1,00 mL`. Thả dụng cụ về chỗ cũ thì bỏ phần còn lại.
4. **Hai đường thao tác song song, cùng một reducer:**
   - Kéo-thả 3D: snap từ tính về đích hợp lệ gần nhất (bán kính 0,26 đơn vị thế giới ở K2), collider vô hình
     lớn hơn mesh **1,4×**, tắt `OrbitControls` trong suốt cử chỉ kéo.
   - Click 2 bước: click dụng cụ (cầm) → click đích (áp dụng). Bàn phím: mọi dụng cụ và đích có nút trong HUD,
     `Tab`/`Enter` để chọn, `Esc` để thả.
5. **Undo / Reset** luôn có. Undo lùi một thao tác của reducer; Reset về trạng thái ban đầu của config.
6. **Hình ảnh đọc được.** Chất lỏng có chiều cao hiển thị tối thiểu (`visualFill` ≥ 0,22 của vật chứa khi có chất),
   màu lấy từ dữ liệu Tầng 1, không chói (exposure ~0,78 ở K2). Kết quả đo hiện bằng huy hiệu/nhãn rõ ràng
   (ví dụ `Quỳ: đỏ`), không chỉ dựa vào màu.
7. **Mobile.** Không tràn ngang, lề 16 px, HUD và log không bị header che.

### 1.3 Tầng 3 — 3-Stage UX & DB Seed

| Stage | Component (shared) | Nội dung bắt buộc |
|---|---|---|
| 1. Intro & Safety | `shared/LabIntroOverlay.tsx` | `outcomeSummary`; bảng an toàn **2 cột**: *Trong mô phỏng* (`safetyBriefing.simulation`) và *Trong phòng thí nghiệm thực tế* (`safetyBriefing.realLab`); `limitations`; giới thiệu dụng cụ; nút xác nhận nếu `acknowledgeRequired`. |
| 2. Explore Workbench | `<kit>/kit/ExploreBench.tsx` | Bàn tự do; badge `Khám phá tự do · không chấm điểm`; `ObservationLog` luôn mở được. |
| 3. Câu hỏi gợi mở | `shared/ObservationDrawer.tsx` | `pedagogy.observationPrompts` (`note`, `free_text`, `choice`, `challenge`); `focus` làm sáng dụng cụ; `highlightWhen` gợi ý khi học sinh vừa đo/vừa gây phản ứng liên quan. **Không bao giờ** chặn thao tác bàn. |

**ObservationLog (BẮT BUỘC):**
- Mỗi thao tác tạo một dòng: vị trí, hành động, hiện tượng (lời cho học sinh), số đo, phương trình
  (chỉ khi `revealEquations` cho phép), cờ `outOfScope`.
- **Gộp dòng:** các thao tác *liên tiếp* giống nhau (cùng loại, cùng chất, cùng vật chứa, cùng hiện tượng) gộp
  thành một dòng và cộng dồn lượng (`merge.key`, `merge.microliters`), ví dụ `Thêm 0,75 mL (15 giọt) Nước cất`.
- Lưu IndexedDB theo khóa `<labId>@<configVersion>`, giữ tối đa 500 dòng, lỗi lưu trữ không làm hỏng phiên.
- `exportObservationLog(config, entries)` trả JSON `schema: "<kit>-observation-log/1"`, `scored: false`.
- Màu chữ đủ tương phản: phụ `#475569`, chính `#0f172a`, thời gian `#334155`, `font-weight: 500`.

**DB seed (BẮT BUỘC):**
- Script idempotent `BE-NexaLab/scripts/seed-<kit>-explore-labs.ts` + npm script `db:seed:<kit>-explore`,
  hỗ trợ `--dry-run` và `--unpublish`. Tham chiếu: `scripts/seed-k2-explore-labs.ts`.
- Mọi lần ghi đi qua `publishExploreLab` (`src/modules/labs/application/explore-labs.ts`): upsert `Lab` (id = `labId`) với
  `config = { mode: "explore", kit, engine, activity: { id, key, version, digest } }`; config đầy đủ của bàn nằm ở `spec.explore` của version.
- Tạo `PracticalActivityVersion` `<labId>-explore` v1 (bất biến, chỉ tạo version mới khi nội dung đổi) với
  `modality: "explore"`, `scored: false`, nguồn `technical_draft` + `status: "unverified"` cho tới khi có reviewer.
- Seed chỉ chạy trên DB cô lập (`assertIsolatedDatabase()`, cả `--unpublish`). Phát hành lên DB dùng chung qua
  `POST /admin/labs/:id/explore-versions` (ADMIN), mẫu K2: `scripts/publish-k2-explore.ts`.
- `GET /labs` trả `mode` cho mọi dòng và `explore` (config đã ghim hoặc mã lỗi) cho dòng Explore (P0 C1.2). FE rẽ nhánh
  theo `row.mode`, chỉ chạy `explore.config` từ server sau khi validate lại; lỗi thì dừng mở bàn và hiện mã lỗi.
  Config đóng gói chỉ dùng cho route dev và làm đầu vào seed/phát hành. Khóa lưu cục bộ: `labId@activity.id`.

---

## 2. Hợp đồng config Lab

Mỗi kit có `<Kit>LabConfig` riêng (K2: `ChemistryLabConfig`, `schema: "k2-lab-config/1"`), nhưng đều có chung
phần vỏ sau. Phần vỏ này hiện mới nằm trong `wet-bench/contracts.ts`; story F0-1 trong backlog tách nó thành
`packages/sim/explore/envelope.ts` trước khi làm kit thứ hai.

```ts
type ExploreLabEnvelope = {
  schema: `${string}-lab-config/${number}`;
  labId: string;              // id trong bảng Lab, dùng cho route /labs/:id
  catalogId: `FL-${string}`;  // mã portfolio
  configVersion: number;      // tăng khi đổi nội dung -> khóa IndexedDB mới
  kit: `${string}@${number}`; // ví dụ "k2-wet-bench@1"
  engine: `${string}@${string}`;
  title: string; contextLabel: string;
  outcomeSummary: string[];
  safetyBriefing: { simulation: string[]; realLab: string[]; acknowledgeRequired: boolean };
  limitations: string[];
  modes: { explore: true; guided?: { rendererKey: string } };
  enabledApparatus: { id: string; kind: string; slot: string; labelVi?: string; initial?: unknown }[];
  measurements: string[];
  pedagogy: { revealEquations?: "never" | "after_observation"; observationPrompts: ObservationPrompt[] };
  review: { status: "draft" | "reviewed"; notes?: string };
};
```

- Lab có `modes.guided` → route chính vẫn mở luồng guided; config Explore chỉ dùng ở route dev cho tới khi PO
  quyết định cho học sinh chuyển chế độ.
- `review.status: "reviewed"` chỉ đặt khi reviewer bộ môn đã duyệt toàn bộ input `unverified`. Validator chặn
  trường hợp ngược lại.

---

## 3. Cây thư mục chuẩn cho Lab mới

```
BE-NexaLab/
  packages/sim/<kit-slug>/
    contracts.ts  engine.ts  validate-config.ts  index.ts
    flXX-<topic>.data.ts
    flXX-<topic>.golden.test.ts  engine.test.ts  validate-config.test.ts
  scripts/seed-<kit>-explore-labs.ts
FE-NexaLab/
  vendor/nexalab-sim-<ver>.tgz
  src/features/labs/<subject>/<kit-slug>/
    kit/      (manifest, layout, reducer, Stage, apparatus3d, HUD, ExploreBench, log, ExploreLabPage, css, dev/)
    labs/     (flXX.config.ts, index.ts)
    README.md
  src/features/labs/runtime/explore-labs.ts   (đăng ký Lab explore)
  src/features/labs/lab-info.ts               (thẻ catalog)
```

Lab dùng lại kit có sẵn chỉ thêm: `flXX.data.ts` + golden test (nếu có số liệu mới), `labs/flXX.config.ts`,
dòng đăng ký, thẻ catalog, mục trong seed script.

---

## 4. Quy ước dữ liệu khoa học

- Mọi số liệu khoa học nằm trong Tầng 1, không hardcode trong component.
- Mỗi bộ số có nguồn và `reviewStatus`. Không tự nâng lên `reviewed`.
- Màu hiển thị là màu minh họa và được nói rõ ở Stage 1.
- Hiện tượng được mô tả bằng lời học sinh quan sát được ("Dung dịch mất màu hồng"), không gọi tên sản phẩm
  trước khi `revealEquations` cho phép.
- Không mô phỏng nhiệt độ nếu kit chưa có mô hình nhiệt; khai báo trong `limitations`.

---

## 5. Kiểm thử và Definition of Done

Một Lab chỉ được đánh dấu `DONE` khi đủ cả danh sách:

- [ ] Tầng 1: golden test cho mọi hiện tượng cam kết + mọi ca ngoài phạm vi; `npx vitest run packages/sim` pass.
- [ ] Config qua `validate<Kit>LabConfig`; không tham chiếu dụng cụ/chất không tồn tại.
- [ ] Không có proxy hình cầu; mesh dụng cụ đi theo con trỏ.
- [ ] Chuột phải và `Esc` trả dụng cụ về chỗ cũ; HUD có hint và nút tương ứng.
- [ ] Mọi dụng cụ chứa có giới hạn dung tích; hết thì báo và phải nạp lại; vật chứa đầy thì chặn.
- [ ] Kéo-thả, click 2 bước và bàn phím đều làm được toàn bộ thao tác của Lab.
- [ ] Stage 1 có bảng an toàn 2 cột; Stage 3 không khóa bàn.
- [ ] Log gộp dòng liên tiếp, lưu IndexedDB, `exportObservationLog()` ra đúng schema.
- [ ] Seed idempotent đã chạy `--dry-run`; chỉ ghi DB dùng chung khi có phê duyệt.
- [ ] FE: `npx tsc -b` (hoặc `npm run lint`), `npm run build`, `npm run test:regression` pass.
- [ ] Đã mở trình duyệt kiểm tra desktop + mobile (375 px), không lỗi console, chụp ảnh làm bằng chứng.
- [ ] Lab guided cũ (nếu có) không đổi hành vi: evaluator server và thứ tự event giữ nguyên.
- [ ] Cập nhật trạng thái trong `docs/bmad/explore-labs-backlog-and-epics.md`.

---

## 6. Những điều cấm (anti-pattern)

| Cấm | Thay bằng |
|---|---|
| Khối cầu/hộp màu đi theo chuột khi cầm dụng cụ | Mesh thật của dụng cụ trong `FollowGroup` |
| Bấm vô hạn để thêm chất | Dung tích hữu hạn + nạp lại |
| Kết quả bịa cho thao tác ngoài mô hình | `outOfScope: true` + `reasonVi` |
| Câu hỏi bắt buộc trước khi cho thao tác | Drawer tùy chọn |
| Tạo `LabRun`/`Attempt`/điểm trong Explore | Log cục bộ, `scored: false` |
| Sửa evaluator guided để phục vụ Explore | Thêm chế độ Explore riêng |
| Đặt dụng cụ kit vào `PhysicalLabEnvironment` | Đặt trong Stage của kit |
| Export wet-bench/kit mới qua `packages/sim/index.ts` gốc | Subpath `@nexalab/sim/<kit-slug>` |
| Đánh dấu `reviewed` khi chưa có reviewer | Giữ `draft` / `unverified` |

---

## 7. Quy trình triển khai theo Gate (cho AI Agent)

Khi nhận `Implement Lab FL-XX`:

1. **Gate 0 — Khảo sát & thiết kế (dừng chờ duyệt).** Đọc story của Lab trong backlog, các plan có sẵn trong
   `_bmad-output/specs/spec-lab-pipeline/fl-XX-*.md`, code kit liên quan. Trình: dụng cụ tái sử dụng/thêm mới,
   biến trạng thái Tầng 1, phạm vi mô hình và danh sách ngoài phạm vi, file sẽ tạo/sửa, câu hỏi cần PO chốt.
   **Không viết code trước khi được duyệt.**
2. **Gate 1 — Tầng 1.** Contracts, data, engine, golden test. Test pass. Đóng gói tarball.
3. **Gate 2 — Tầng 2.** Manifest, reducer, Stage 3D, HUD, tương tác bắt buộc ở mục 1.2.
4. **Gate 3 — Tầng 3.** Config Lab, đăng ký route Explore, thẻ catalog, seed script (`--dry-run` trước).
5. **Gate 4 — Kiểm chứng.** Typecheck, build, test, trình duyệt desktop + mobile, ảnh chụp, cập nhật backlog.
6. **Commit.** Chỉ commit file của Lab đó (không gom thay đổi không liên quan đang có trong working tree).
   Dùng git author mặc định của máy. **Không** thêm dòng `Co-authored-by`, `Generated by` hay tên AI Agent nào
   vào commit message (quy định của chủ dự án). Message dạng `feat(labs): <mô tả>`.

---

## 8. Lịch sử

| Ngày | Thay đổi |
|---|---|
| 2026-11-14 | Bản đầu, rút từ K2 pilot (FL-13, FL-14a, FL-10 Explore) và vòng sửa tương tác (chuột phải, dung tích ống nhỏ giọt, gộp log, giấy quỳ, nắp/nhãn lọ). |
