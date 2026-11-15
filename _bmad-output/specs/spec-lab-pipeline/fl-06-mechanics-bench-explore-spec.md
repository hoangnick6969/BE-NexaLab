# Spec áp dụng Explore: bàn cơ (FL-06 Moment lực và đòn bẩy)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-15): chấp nhận đề xuất Q-1…Q-4. Đã triển khai D1-1.2…D1-1.5 trên dev/fixture |
| Người viết | Dev 1 (Kit Vật lý) |
| Cập nhật | 2026-11-15 |
| Theo mẫu | [Mẫu spec áp dụng Explore](lab-explore-bench-spec-template.md) |
| Nguồn | [P0 C1–C3](lab-mode-foundation-p0-spec.md#3-contract) · [phân công 20 slot](lab-kit-20-slot-delivery-spec.md) · [tracking](lab-kit-delivery-tracking.md) · [model slice `lever-bench@1.0.0`](fl-06-lever-model-slice-spec.md) · [kế hoạch FL-06 K5](fl-06-lever-k5-plan.md) |

Spec này chốt lát cắt Explore đầu tiên của bàn cơ. Lát cắt dùng lại mô hình `lever-bench@1.0.0` và cảnh K5 của FL-06 Guided. FL-06 đã có Guided, nên Explore chỉ chạy trên dev/fixture tới khi có D-5.

## 1. Phạm vi

| Phạm vi | Nội dung |
|---|---|
| Bàn và Kit | **Bàn cơ**. ID bàn `kit = "k5-lever-bench@1"`, `group = "physics"`. FE: `src/features/labs/physics/mechanics/` (cảnh ở `kit/`, trang Explore ở `explore/`). Sim: `packages/sim/mechanics/` (mới) dùng lại `packages/sim/lever-bench.ts` |
| Lab đầu tiên | **FL-06**, Lab ID `lever-equilibrium`, topic `KHTN8-L18`. Mode hiện có: Guided ACTIVE v1. Mode triển khai: Explore, chỉ trên dev/fixture |
| Cách mở | Dev: `/dev/lab-kits/lever-explore` với config đóng gói. Fixture: `/labs/:id` qua registry, với dòng `GET /labs` mock (`mode: "explore"`). **Công bố cho học sinh chờ D-5**, vì `publishExploreLab` từ chối Lab đã có release |
| Mô hình | `lever-bench@1.0.0`, không đổi. Đơn vị số nguyên: mm, mN, mN·mm. Fixture `lever-bench-reference-v1`, provenance `technical_assumption`, nên `review.status = "draft"`. Hiện tượng hỗ trợ: thanh nằm ngang hay nghiêng trái/phải theo tổng moment hai bên. Giới hạn: xem §2.3 |

## 2. Lát cắt Explore (cách A)

### 2.1 Học sinh làm gì

- Điểm tựa O cố định ở giữa thanh (0 mm). Thanh có 11 lỗ móc, cách nhau 50 mm, từ −250 đến 250 mm.
- Học sinh treo **quả nặng** vào lỗ, lấy từ bộ quả nặng của config (trong khoảng 0,5–5 N, bước 0,5 N). Mỗi lỗ chỉ treo một dụng cụ, tối đa 11 dụng cụ.
- Nếu config bật lực kế, học sinh gắn **một lực kế** kéo xuống và chỉnh lực từ 0 đến 5 N, bước 0,1 N.
- Gỡ một dụng cụ bằng nút × trên chip, như Guided.
- Sau mỗi thay đổi, sim tính lại. Thanh chuyển sang nằm ngang, nghiêng trái hoặc nghiêng phải. Nếu config bật bảng moment, panel hiện bảng F, d, M của từng dụng cụ và tổng moment mỗi bên.
- Không có bước, không bắt buộc dự đoán, không nộp, không chấm. Câu hỏi gợi quan sát là tùy chọn và chỉ ghi vào nhật ký.

### 2.2 Khác với FL-06 Guided

| | Guided (giữ nguyên) | Explore |
|---|---|---|
| Luồng | 6 bước A–D, sự kiện ghi lên server qua `LabRun` | Tự do, không `LabRun`, không `Attempt`, không `Progress` |
| Bộ số | Preset C1–C3 và ba vị trí thử | Config chọn quả nặng, lực kế và cấu hình ban đầu |
| Ứng dụng D (ba loại đòn bẩy) | Sơ đồ phân tích bằng `classifyLeverCase` | Không có trong lát cắt này (cách B, §11) |
| Lưu trữ | Server | Nhật ký cục bộ theo khóa `labId@activity.id` |

### 2.3 Ngoài phạm vi

- Dời điểm tựa và ba loại đòn bẩy (cách B). Muốn làm phải mở rộng evaluator và bump model (§11).
- Lực kéo lên, lực xiên, khối lượng thanh, ma sát ở điểm tựa. Đây là các giả định của mô hình (`bar_mass_ignored`, `pivot_friction_ignored`, `perpendicular_downward_forces`, `fulcrum_at_zero`). Panel liệt kê chúng ở mục giới hạn.
- Góc nghiêng thật. Thanh chỉ hiển thị trạng thái, không tính góc.
- Thao tác ngoài phạm vi (dụng cụ thứ hai vào cùng lỗ, lực kế thứ hai, lực ngoài lưới) bị chặn ở giao diện, kèm thông báo. Nhật ký không ghi các thao tác này.

## 3. Config và sim

**Thư mục** `packages/sim/mechanics/`, export `@nexalab/sim/mechanics` (cùng kiểu với `@nexalab/sim/wet-bench`):

| File | Nội dung |
|---|---|
| `contracts.ts` | `LEVER_KIT = "k5-lever-bench@1"`, `LEVER_ENGINE = "lever-bench@1.0.0"`, `APPARATUS_KINDS`, `MEASUREMENTS`, `leverLabConfigSchema` |
| `validate-config.ts` | `validateLeverLabConfig(raw) → { ok: true, config, warnings } \| { ok: false, errors, warnings }` |
| `fl06-lever.data.ts` | Config đóng gói của FL-06 Explore |
| `fl06-lever.golden.test.ts`, `validate-config.test.ts` | Golden và ca lỗi (§3.3) |

`lever-bench.ts` **không đổi**. Guided và Explore cùng gọi `evaluateLeverBench`, nên `modelVersion` vẫn là `"1.0.0"`. Thêm thư mục mới nên phải bump `@nexalab/sim` và đồng bộ tarball sang FE. Bản thực tế là **1.11.0**: K2 đã dùng 1.9.0 (khối lượng mol, K2-1.6) và 1.10.0 (class template FL-13), bàn cơ thêm `mechanics/` lên trên.

### 3.1 Schema `k5-lever-config/1`

Mở rộng `exploreLabEnvelopeSchema`:

```ts
leverLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k5-lever-config/1"),
  catalogId: z.literal("FL-06"),          // lát cắt đầu; nới ra khi có Lab cơ thứ hai dùng thanh đòn
  kit: z.literal(LEVER_KIT),
  engine: z.literal(LEVER_ENGINE),
  fixtureId: z.literal("lever-bench-reference-v1"),
  enabledApparatus: z.array(envelopeApparatus.extend({
    kind: z.enum(["lever_bar", "weight_set", "spring_gauge"]),
    initial: z.unknown().optional(),       // hiện chưa dùng; giữ để tương thích envelope
  })).min(2).max(3),
  weights: z.object({
    availableMilliNewtons: z.array(int).min(1).max(10),   // tập con của 500..5000, bước 500
    maxCount: int.min(1).max(11),
  }).strict(),
  initialAttachments: z.array(leverAttachment).max(11),   // cùng dạng attachment của evaluateLeverBench
  measurements: z.array(z.enum(["ruler", "force_labels", "moment_table"])),
  pedagogy: envelope.pedagogy.extend({ observationPrompts: z.array(observationPromptSchema).max(6).optional() }),
});
```

### 3.2 Validator

`validateLeverLabConfig` kiểm theo thứ tự sau và gom mọi lỗi theo đường dẫn, như `validateChemistryLabConfig`:

1. Schema hợp lệ.
2. `enabledApparatus` có đúng một `lever_bar` và một `weight_set`, có không hoặc một `spring_gauge`. ID của các dụng cụ không trùng nhau.
3. `weights.availableMilliNewtons` nằm trong 500..5000, bước 500, không trùng nhau.
4. `initialAttachments` qua được `evaluateLeverBench`. Lực của mỗi quả nặng thuộc `availableMilliNewtons`. Số quả nặng không quá `maxCount`. Có `GAUGE` thì phải bật `spring_gauge`.
5. `modes.guided` không được khai báo (BE cũng chặn). D-5 sẽ quyết định cách khai báo hai mode.
6. Cảnh báo, không chặn: `review.status = "draft"`; `measurements` không có `ruler` (học sinh khó đọc cánh tay đòn).

### 3.3 Golden và ca lỗi

| Ca | Đầu vào | Kỳ vọng |
|---|---|---|
| G-01 | Config đóng gói FL-06 | `ok: true`, có cảnh báo `draft` |
| G-02 | 1,0 N ở −100 mm, lực kế 0,5 N ở 200 mm (C1) | `BALANCED`, `LEVEL`, mỗi bên 100 000 mN·mm |
| G-03 | 2,0 N ở 150 mm, lực kế 3,0 N ở −100 mm (C2) | `BALANCED` |
| G-04 | 1,0 N ở −100 mm | `TILT_LEFT` |
| G-05 | 1,0 N ở 0 mm | `LEVEL`, moment 0 |
| I-01 | Thiếu `weight_set`, hoặc hai `spring_gauge` | lỗi `enabledApparatus` |
| I-02 | `availableMilliNewtons` có 750 | lỗi `weights` |
| I-03 | `initialAttachments` hai dụng cụ cùng lỗ, hoặc lỗ 75 mm | lỗi `initialAttachments` (`INVALID_CONFIGURATION` / `OUT_OF_RANGE` từ evaluator) |
| I-04 | Có `GAUGE` nhưng không bật `spring_gauge` | lỗi `initialAttachments` |
| I-05 | Có `modes.guided` | lỗi `modes.guided` |
| I-06 | `fixtureId`, `kit` hoặc `engine` khác giá trị cố định | lỗi schema |

### 3.4 Config đóng gói FL-06

- `labId: "lever-equilibrium"`, `catalogId: "FL-06"`, `configVersion: 1`, tiêu đề "Moment lực và đòn bẩy".
- `enabledApparatus`: thanh đòn, bộ quả nặng, lực kế.
- `weights`: 0,5 N, 1,0 N, 2,0 N; tối đa 4 quả.
- `initialAttachments`: một quả 1,0 N ở −100 mm, giống điểm bắt đầu của Guided.
- `measurements`: `ruler`, `force_labels`, `moment_table` (chờ owner xác nhận, câu hỏi Q-1).
- `safetyBriefing`:
  - mô phỏng: "Đây là mô hình lý tưởng: bỏ qua khối lượng thanh và ma sát ở điểm tựa.";
  - phòng thật: "Treo quả nặng nhẹ tay, giữ tay và chân tránh xa phía dưới thanh.";
  - `acknowledgeRequired: false`, vì bài không có nguy cơ hóa chất.
- `outcomeSummary`: điều kiện cân bằng của đòn bẩy và moment lực M = F × d.
- `observationPrompts` (3 câu, không có đáp án): treo ở O thì sao; dời quả nặng xa O thì sao; tìm một cách khác để thanh nằm ngang.
- `review.status: "draft"`.

## 4. BE

- Thêm `EXPLORE_BENCHES["k5-lever-bench@1"]`:
  - `modelRef: "lever-bench@1.0.0"`;
  - `validate` gọi `validateLeverLabConfig` và từ chối `modes.guided`;
  - `activitySpec: leverBenchSpec`, dựng spec Explore (tiêu đề, outcome, giới hạn) từ config, theo mẫu `wetBenchSpec`.
- **Seed: chưa đăng ký target** cho FL-06 trong `seed-explore-labs.ts`. Lý do: `lever-equilibrium` đã có release, nên bước 2 của `publishExploreLab` sẽ từ chối. Target thêm sau khi có D-5.
- Unit test:
  - registry resolve được `k5-lever-bench@1`;
  - config đóng gói qua validator;
  - `publishExploreLab` với config bàn cơ trả lỗi khi Lab đích có release (giữ hành vi C1.3).

## 5. FE

- **Registry** (`runtime/explore-registry.ts`):

  ```ts
  { kit: "k5-lever-bench@1", group: "physics",
    validate: (raw) => validateLeverLabConfig(raw) → { ok, config },
    loadPage: () => import("../physics/mechanics/explore/LeverExploreLabPage"),
    listKitItems: listLeverKitItems }
  ```

- **Trang Explore**: dùng bố cục A của `LabSpace`.
  - Header: Quay về, tên bài, 3D/2D (`LabHeaderSlot` + `LabRendererToggle`), Làm lại.
  - Cảnh: `K5Stage3D` và `K5Stage2D` phủ toàn màn hình.
  - Panel phải (`LabQuestionPanel`):
    1. mục "Dụng cụ và thành phần" đọc `listKitItems`;
    2. bộ chọn dụng cụ (Gắn vào thanh, chip có ×);
    3. trạng thái thanh;
    4. bảng moment nếu config bật;
    5. câu hỏi gợi quan sát;
    6. giới hạn mô hình.
  - Dock dưới trái: Xem nhật ký, Xuất nhật ký.
- **Dùng lại**: tách phần chọn và gắn dụng cụ của `LeverInvestigationActivity.tsx` (select loại, vị trí, lực; `lqp-tool`; `lqp-chips`) thành component `K5Toolbox` trong `kit/`. Guided và Explore cùng dùng component này. Điều kiện: hành vi Guided không đổi và `fl-06-k5.spec.ts` vẫn pass.
- **Dev preview**: `/dev/lab-kits/lever-explore` mở trang với config đóng gói, khai báo trong `App.tsx` như các preview K3, K7, K8 khác.

## 6. Item

Lát cắt này chưa có item dùng chung (C2.1: item chỉ vào thư viện khi bàn thứ hai cần).

| ID loại (engine) | Item | `category` | Ghi chú |
|---|---|---|---|
| `lever_bar` | Thanh đòn 11 lỗ, điểm tựa O | `apparatus` | Anchor `hole_-250` … `hole_250`, `fulcrum` |
| `weight_set` | Bộ quả nặng | `apparatus` | `purposeVi` liệt kê các mức lực của config |
| `spring_gauge` | Lực kế | `instrument` | Anchor `hook`. Ứng viên item dùng chung với bàn chất lỏng FL-05 (cũng dùng lực kế) ở INC-2, qua PR riêng cho K2 duyệt |

`listLeverKitItems(config)` chỉ trả những item có trong `enabledApparatus`. Nhãn lực theo config, ví dụ "Bộ quả nặng: 0,5 N, 1,0 N, 2,0 N".

## 7. Nhật ký

- Lưu bằng phần lưu trữ chung `shared/explore/observation-log.ts` (`createObservationLogStore`, `observationLogKey(labId, activity.id)`, `buildObservationLogExport`), cùng giới hạn 500 dòng.
- Kiểu dòng `LeverLogEntry`: `{ seq, at, actionVi, phenomenaVi[], readings: { leftMomentNmm, rightMomentNmm }, attachments }`.
- `describeLeverChange(before, after)` mô tả bằng lời cho học sinh, ví dụ:
  - hành động: "Treo quả nặng 1,0 N ở lỗ −100 mm";
  - hiện tượng: "Thanh chuyển từ nằm ngang sang nghiêng trái".
  - Nếu trạng thái không đổi: "Thanh vẫn nghiêng trái; moment bên trái tăng".
- Chỉnh lực kế liên tiếp gộp thành một dòng, giống cách bàn ướt gộp các lần nhỏ giọt.
- File export có `scored: false`, `labId`, `activityId`, `engine`.

## 8. Class Explore

- Loại yêu cầu bàn sẽ hỗ trợ: `measure` (đo moment hai bên khi thanh cân bằng) và `explain` (giải thích vì sao thanh nằm ngang).
- Allow-list dự kiến cho C3: `weights`, bật/tắt `spring_gauge`, `measurements`, `initialAttachments`, `observationPrompts`.
- Làm ở D1-3.1, sau pilot C của K2 (K2-2.8). Lát cắt này không làm phần nào của C3.

## 9. Nghiệm thu (D1-1.5)

- Sim: golden và ca lỗi §3.3 pass, test cũ của `lever-bench` pass.
- BE: unit test §4 pass.
- FE: lint, build và unit test `listLeverKitItems` pass.
- Playwright `tests/lever-explore.spec.ts`, mock API, không ghi Supabase:
  1. dòng `GET /labs` mock có `mode: "explore"`, `kit: "k5-lever-bench@1"`, config có `labId` khớp dòng. `/labs/:id` mở trang bàn cơ qua registry;
  2. panel liệt kê đúng 3 item của config. Config chỉ bật thanh đòn và quả nặng thì không có lực kế;
  3. treo và gỡ dụng cụ làm thanh đổi trạng thái. G-02 cho "Thanh nằm ngang";
  4. nhật ký có dòng mới, còn sau F5, export có `scored: false`;
  5. không có request `/lab-runs` hay `/attempts`;
  6. config sai làm dừng mở bàn và hiện `EXPLORE_CONFIG_INVALID`;
  7. vừa phone 390 px, không cuộn ngang.
- Hồi quy Guided: `fl-06-k5.spec.ts` pass (mở, nộp, chấm).

## 10. Phụ thuộc và rủi ro

| | Ghi chú |
|---|---|
| D-5 | Chặn việc công bố Explore cho học sinh trên `lever-equilibrium`. Khi D-5 chốt: thêm seed target, cách khai báo hai mode, nút chuyển Guided ↔ Explore (D1-3.3) |
| Bump sim | Phải đồng bộ tarball sang FE cùng PR. Nếu FE và BE lệch phiên bản sim, FE hiện `EXPLORE_CONFIG_INVALID` (C1.2) |
| Tách `K5Toolbox` | Rủi ro làm hỏng Guided. Giảm rủi ro bằng `fl-06-k5.spec.ts` và một PR riêng cho phần tách |
| Bảng moment | Hiện sẵn bảng có thể làm học sinh mất phần tự tính của Guided bước B. Hai mode tách nhau nên ảnh hưởng nhỏ; vẫn cần owner chốt (Q-1) |

## 11. Quyết định của owner

Owner duyệt ngày 2026-11-15, chấp nhận cả bốn đề xuất.

| ID | Câu hỏi | Quyết định |
|---|---|---|
| Q-1 | Explore FL-06 có hiện bảng moment mặc định không? | **Chốt:** có. Giáo viên tắt được qua C3 sau này |
| Q-2 | Explore dùng chung Lab ID `lever-equilibrium` với Guided (chờ D-5) hay tạo Lab ID riêng để công bố sớm? | **Chốt:** dùng chung, chờ D-5 |
| Q-3 | Đặt ID bàn `k5-lever-bench@1`, schema `k5-lever-config/1` | **Chốt:** `k5-lever-bench@1`, `k5-lever-config/1` |
| Q-4 | Cách B (dời điểm tựa, ba loại đòn bẩy) làm khi nào? | **Chốt:** sau D1-1.5, bản `lever-bench@1.1.0`: evaluator nhận `fulcrumMillimetres`, có golden riêng, Guided giữ 1.0.0 |

## 12. Việc theo task

| Task | Việc | File chính |
|---|---|---|
| D1-1.2 | Schema, validator, config FL-06, golden; bump sim 1.11.0 | `packages/sim/mechanics/*`, `packages/sim/package.json` |
| D1-1.3 | `EXPLORE_BENCHES` + `leverBenchSpec`; registry FE, `LeverExploreLabPage`, `listLeverKitItems`, `K5Toolbox`, dev preview | `explore-labs.ts`; FE `explore-registry.ts`, `physics/mechanics/explore/*`, `kit/K5Toolbox.tsx`, `App.tsx` |
| D1-1.4 | `LeverLogEntry`, `describeLeverChange`, panel nhật ký, export | `physics/mechanics/explore/lever-log.ts` |
| D1-1.5 | Playwright §9 và hồi quy Guided | `tests/lever-explore.spec.ts`, `tests/fl-06-k5.spec.ts` |

## 13. Ghi chú triển khai (2026-11-15)

- Sim 1.11.0 (sau khi gộp 1.9.0 và 1.10.0 của K2): `packages/sim/mechanics/` như §3; config đóng gói có thêm `contextLabel` và một câu ghi chú ở `review.notes`.
- FE: nhật ký nằm trong ngăn kéo mở từ dock dưới trái; trên phone ngăn kéo thay chỗ panel khi mở. Dòng trạng thái thanh nằm dưới header. Câu trả lời `free_text` lưu cục bộ theo khóa nhật ký, không vào file export.
- FE unit test `lever-explore.test.ts` tự dựng config vì `tsx` không đọc được tên export của gói sim (lỗi có sẵn, `kit-items.test.ts` cũng gặp). Tính hợp lệ của config đóng gói do golden sim kiểm.
- Playwright dùng Lab ID fixture `lever-explore-fixture`, cùng giá trị với config đóng gói.
- Sửa cảnh K5 dùng chung cho Guided và Explore (2026-11-15, owner báo lỗi): điểm tựa nâng từ 0,9 lên 1,3 kèm trụ đỡ, dụng cụ treo thẳng đứng theo lỗ, nên quả nặng ở lỗ đầu thanh nghiêng 0,18 rad vẫn cách mặt bàn khoảng 0,17. Khung camera chừa phần panel (phải trên màn rộng, dưới trên phone), `fitWidth` 5,8, `maxDistance` 17, nên thấy đủ 11 lỗ.
- FL-06 Guided ẩn phần tự gắn dụng cụ ở phần A (bước 1–2): cảnh ở hai bước này vẽ đúng các vị trí của bài, nên dụng cụ tự gắn không hiện và gây hiểu nhầm.
