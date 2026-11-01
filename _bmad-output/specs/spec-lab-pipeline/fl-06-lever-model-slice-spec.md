# FL-06 / K5 — Model Slice Spec `lever-bench@1.0.0`

**Ngày:** 2026-11-01. **Trạng thái:** contract triển khai, chưa có code hoặc release FL-06.

**Chốt của owner:** mở track kỹ thuật sau FL-10 ACTIVE; v1 chỉ tiếng Việt, Bài 18–19, mapping ứng viên `B18-O01`, `B18-O02`, `B19-O01`, `B19-O02`; bỏ `B31-O02`. Thông số, mapping, rubric, mô hình và giới hạn khoa học đều mang nhãn **Giả định kỹ thuật / Technical Assumption**. Không chờ reviewer độc lập ở Bước 0; owner trực tiếp ký `OWNER_SIGNOFF` trên exact release digest. Owner chọn **đổi release policy sang OWNER_SIGNOFF** cho FL-06. Code hiện tại vẫn tạo draft `DEV_APPROVAL_V1` và yêu cầu `DEV_APPROVAL`; thay đổi policy tương thích release cũ phải được triển khai/test ở lát cắt release riêng trước khi có thể publish FL-06. Tài liệu này không đổi hành vi runtime.

## 1. Ranh giới model thuần

Lát cắt này chỉ thêm hàm TypeScript thuần, Zod strict, fixture nội bộ bất biến và test trong `packages/sim/`. Không thêm production model registry, tarball FE, LabRun, DB, route, UI, asset hoặc release ở lát cắt này. Theo khuôn FL-10, model tính đại lượng khoa học, activity lưu tiến trình, rubric server chấm và renderer chỉ trình bày output. FL-10 ACTIVE là tiền lệ cho track kỹ thuật, không phải bằng chứng khoa học cho FL-06.

Thanh cứng lý tưởng, **bỏ qua khối lượng thanh và ma sát trục** cố định cho v1. Không mô phỏng quán tính, độ võng, va chạm, sai số dụng cụ thực hoặc an toàn nâng tải. Mọi lực trong model là lực kéo **xuống**, vuông góc thanh **ở vị trí ngang** `theta = 0`. Khi nghiêng, `TILT_LEFT/LEVEL/TILT_RIGHT` chỉ là trạng thái hiển thị định tính; không tính lại cánh tay đòn hoặc suy gia tốc từ góc animation.

## 2. Đơn vị, hình học, công thức

| Quy tắc cố định | Giá trị |
|---|---|
| Thanh và điểm tựa A/B/C | `-250..+250 mm`; O tại `0 mm`, tổng dài `500 mm`. |
| Lỗ móc | Đúng 11 lỗ `[-250,-200,-150,-100,-50,0,50,100,150,200,250] mm`; tối đa một attachment mỗi lỗ. |
| Quả nặng | Lực nguyên `500..5000 mN`, bội số `500 mN`; `g=10 m/s²`, nên `100 g = 1000 mN = 1 N`. |
| Lực kế | `0..5000 mN`, bội số `100 mN`, độ chia `0.1 N`; tối đa một lực kế. |
| Cánh tay đòn và moment | `d_mm = abs(position_mm)`; `M_mN_mm = F_mN × d_mm`. O tạo moment 0. |
| Dấu | Tải kéo xuống bên trái tạo CCW **dương**; bên phải tạo CW **âm**. |
| Tổng | `ccw = sum(M_left)`, `cw = sum(M_right)`, `netMoment_mN_mm = ccw - cw`. |
| Kết luận | `net > 0`: `TILT_LEFT` (đầu trái xuống); `net = 0`: `LEVEL` và `BALANCED`; `net < 0`: `TILT_RIGHT`. Cân bằng iff net đúng bằng 0, không tolerance. |
| Hiển thị | UI mới chia `mN_mm / 1_000_000` để hiện `N·m`; model/rubric so sánh số nguyên gốc. |

Bàn A–C chỉ có lực kéo xuống và O tại 0; không tái hiện LOAD_BETWEEN hoặc EFFORT_BETWEEN vì các cấu hình cân bằng này cần lực hướng lên. classifyLeverCase chỉ dành cho sơ đồ ứng dụng D; UI không cho thử hai cấu hình đó trên bàn A–C.

Input rỗng hợp lệ, cho output net 0/LEVEL, nhưng không hoàn thành checkpoint. Tối đa 11 attachments × 5000 mN × 250 mm = 13_750_000 mN_mm, nằm trong safe integer. Validator vẫn kiểm tra mọi phép nhân/cộng an toàn trước khi trả output; đây là defensive guard không thể kích hoạt sau các bước 1–5 với input hợp lệ, không cần test kích hoạt riêng. Không dùng float trong model. UI không được đưa số đã format trở lại phép tính.

## 3. Interface, fixture và preset

```ts
type Weight = { kind: "WEIGHT"; positionMillimetres: number; forceMilliNewtons: number };
type Gauge = { kind: "GAUGE"; positionMillimetres: number; forceMilliNewtons: number };
type LeverInput = { fixtureId: string; attachments: Array<Weight | Gauge> };
type ModelErrorCode = "INVALID_SCHEMA" | "OUT_OF_RANGE" | "UNKNOWN_FIXTURE" | "INVALID_FIXTURE" | "INVALID_CONFIGURATION";
type Result<T> = { ok: true; value: T } | { ok: false; code: ModelErrorCode };
type LeverOutput = {
  modelVersion: "1.0.0"; fixtureId: "lever-bench-reference-v1";
  systemBoundary: "ideal_horizontal_rigid_bar";
  assumptions: readonly ["bar_mass_ignored", "pivot_friction_ignored", "perpendicular_downward_forces", "fulcrum_at_zero"];
  attachments: Array<{ kind: "WEIGHT" | "GAUGE"; positionMillimetres: number; forceMilliNewtons: number;
    armMillimetres: number; unsignedMomentMilliNewtonMillimetres: number; signedMomentMilliNewtonMillimetres: number }>;
  ccwMomentMilliNewtonMillimetres: number; cwMomentMilliNewtonMillimetres: number;
  netMomentMilliNewtonMillimetres: number; balance: "BALANCED" | "UNBALANCED";
  displayState: "TILT_LEFT" | "LEVEL" | "TILT_RIGHT";
};
declare function evaluateLeverBench(raw: unknown): Result<LeverOutput>;
```

Fixture `lever-bench-reference-v1` chứa các hằng số mục 2, provenance `technical_assumption` và preset C1–C3; đóng băng sâu và validate **mỗi lần gọi** trước khi tính như FL-10. Preset không phải số liệu SGK. Mỗi preset gồm tải cố định `(loadPositionMillimetres, loadForceMilliNewtons)` và vị trí lực kế đối bên `gaugePositionMillimetres`, đều khác O. Tính nghiệm bằng integer: `numerator = loadForceMilliNewtons × abs(loadPositionMillimetres)`, `denominator = abs(gaugePositionMillimetres)`; bắt buộc `numerator % denominator === 0`, `F2 = numerator / denominator` thuộc `[0,5000]` và `F2 % 100 === 0`. Không nhận nghiệm từ client.

| Preset | Tải | Lực kế | Nghiệm |
|---|---|---|---|
| C1 | `-100 mm`, `1000 mN` | `+200 mm` | `500 mN`; moment mỗi bên `100000 mN_mm`. |
| C2 | `+150 mm`, `2000 mN` | `-100 mm` | `3000 mN`; moment mỗi bên `300000 mN_mm`. |
| C3 | `-250 mm`, `500 mN` | `+50 mm` | `2500 mN`; moment mỗi bên `125000 mN_mm`. |

`evaluateLeverBench` nhận attachment tổng quát trong giới hạn; khi tích hợp, server so state học sinh với preset/allowlist đã pin trong execution. Output theo thứ tự input nhưng là bản sao mới, không chia sẻ object/mảng với input/registry. `validateLeverFixture` và `evaluateLeverBenchWithRegistry(raw, registry)` chỉ dùng ở module nội bộ để test fixture hỏng; entrypoint `packages/sim` chỉ public `evaluateLeverBench` từ phần này. Không đưa registry, constants, expected answer hoặc output tự khai từ client vào nguồn tính authoritative.

## 4. Hàm thuần ứng dụng checkpoint D

`classifyLeverCase(raw)` nhận `{ fulcrumMillimetres, loadMillimetres, effortMillimetres }`: ba số nguyên an toàn, thuộc `-250..250`, bội số 50 và **khác nhau**. Tính `loadArmMillimetres = abs(loadMillimetres-fulcrumMillimetres)`, `effortArmMillimetres = abs(effortMillimetres-fulcrumMillimetres)`. Output `{ loadArmMillimetres, effortArmMillimetres, geometry, forceAdvantage, changesForceDirection }`; `geometry` là `FULCRUM_BETWEEN | LOAD_BETWEEN | EFFORT_BETWEEN`. `forceAdvantage` là `GAIN` nếu effortArm > loadArm, `EQUAL` nếu bằng, `NO_GAIN` nếu nhỏ hơn; không chia float. `changesForceDirection` đúng chỉ khi fulcrum nằm nghiêm ngặt giữa load và effort. Đây là suy luận cho cấu hình lý tưởng với hướng lực phù hợp, không khẳng định mọi vector lực thực đều đổi hướng. Không trả nhãn “loại 1/2/3” vì Bài 19 có hai loại chính và nhắc tên loại 3 theo tài liệu khác. Classifier trả `INVALID_SCHEMA`, `OUT_OF_RANGE`, `INVALID_CONFIGURATION` theo thứ tự ở mục 5; public export mới thứ hai là `classifyLeverCase`.

## 5. Mã lỗi và thứ tự kiểm tra

| Bước | Kiểm tra | Mã |
|---|---|---|
| 1 | Zod strict: thiếu/lạ trường, sai kiểu, NaN/Infinity, số lẻ, kind sai, attachments không là array | `INVALID_SCHEMA` |
| 2 | Length >11; số không safe; vị trí ngoài thanh/không thuộc lưới; WEIGHT ngoài 500..5000 hoặc sai bội 500; GAUGE ngoài 0..5000 hoặc sai bội 100 | `OUT_OF_RANGE` |
| 3 | `fixtureId` string không ở allowlist nội bộ | `UNKNOWN_FIXTURE` |
| 4 | Fixture sai schema, provenance, constants, assumptions hoặc preset/đáp án | `INVALID_FIXTURE` |
| 5 | Trùng lỗ, quá một GAUGE | `INVALID_CONFIGURATION` |
| 6 | Nhân/cộng safe rồi tính output; nếu bất khả thi do input/fixture lọt validate, trả mã theo nguồn lỗi, không throw | `OUT_OF_RANGE` / `INVALID_FIXTURE` |

Zod bước 1 không dùng `.safe()`, `.min()`, `.max()` hoặc `.multipleOf()` cho số; `Number.isSafeInteger` và range ở bước 2. Lookup bằng `Object.hasOwn`. Nếu nhiều lỗi đồng thời, chỉ mã bước sớm nhất thắng. Không lộ stack trace. Với classifier D, chỉ áp dụng bước 1, 2, 5; tọa độ trùng trả `INVALID_CONFIGURATION`.

## 6. Golden và invalid fixtures

| ID | Input | Kỳ vọng chính xác |
|---|---|---|
| G-01 | WEIGHT `(-100,1000)`, WEIGHT `(+200,500)` | CCW `100000`, CW `100000`, net `0`, LEVEL. |
| G-02 | WEIGHT `(-100,1000)`, WEIGHT `(+100,500)` | net `+50000`, TILT_LEFT. |
| G-03 | WEIGHT `(-100,500)`, WEIGHT `(+200,1000)` | net `-150000`, TILT_RIGHT. |
| G-04 | WEIGHT `(0,5000)` | moment/net `0`, LEVEL. |
| G-05 | Không attachment | net `0`, LEVEL; activity không đánh dấu hoàn thành. |
| G-06 | C2: WEIGHT `(+150,2000)`, GAUGE `(-100,3000)` | net `0`, lực kế `3000 mN`, moment mỗi bên `300000 mN_mm = 0.3 N·m` trên UI. |
| G-07 | D: O `0`, load `-50`, effort `+150` | FULCRUM_BETWEEN, GAIN, đổi hướng. |
| G-08 | D: O `-250`, load `-100`, effort `+250` | LOAD_BETWEEN, GAIN, không đổi hướng. |
| G-09 | D: O `-250`, effort `-200`, load `+250` | EFFORT_BETWEEN, NO_GAIN, không đổi hướng. |

| ID | Biến thể lỗi | Mã |
|---|---|---|
| I-01 | Trường `netMoment` tự khai, extra key, force string/số lẻ/NaN/Infinity | `INVALID_SCHEMA` |
| I-02 | Position 251/25/`2 ** 53`; WEIGHT 0/550/5500; GAUGE -100/50/5100; 12 attachments | `OUT_OF_RANGE` |
| I-03 | Fixture ID lạ, các trường còn lại hợp lệ | `UNKNOWN_FIXTURE` |
| I-04 | Fixture nội bộ sửa g, lưới, assumption, provenance hoặc preset không có nghiệm chia hết 100 | `INVALID_FIXTURE` |
| I-05 | Hai attachment cùng lỗ hoặc hai GAUGE khác lỗ | `INVALID_CONFIGURATION` |
| I-06 | D có tọa độ trùng nhau | `INVALID_CONFIGURATION` |

Fixtures test tự chứa, không đọc OCR ở CI. C1–C3, g, dụng cụ và chiều dài thanh đều là **Technical Assumption**, không gắn nhãn số liệu SGK.

## 7. Acceptance / TDD `M-xx`

1. **M-01 / G-01..G-06:** thêm GAUGE tại O với lực dương có arm/moment 0; hai WEIGHT cùng bên cộng đúng một vế. Assert unsigned/signed moment từng attachment, CCW/CW/net, dấu, cân bằng iff net=0, O và input rỗng; exact integer, không tolerance.
2. **M-02:** assert `g=10`, 100 g → 1000 mN, `1 N·m = 1_000_000 mN_mm` theo contract formatter UI sau này; model chỉ trả nguyên và mọi phép tính ở biên là safe.
3. **M-03 / I-04:** validateLeverFixture chỉ kiểm tra preset C1–C3 hợp lệ; evaluateLeverBench tính tổng quát attachments, đối chiếu state với preset ở Activity/Server. Mutate bản sao fixture về constants, assumptions, provenance, preset C1/C2/C3, nghiệm phân số/sai bước 100/vượt 5000; validator và evaluator nội bộ cùng trả `INVALID_FIXTURE`.
4. **M-04 / I-01..I-03,I-05:** test biên lỗ ±250, WEIGHT 500/5000, GAUGE 0/5000, length đúng 11 với 11 lỗ và tối đa một GAUGE chạy thành công; hoán vị attachments giữ tổng/balance/displayState; sai kiểu, số lẻ/không safe, sai bội, trùng lỗ, nhiều gauge, ID lạ và mã chính xác.
5. **M-05:** input freeze sâu vẫn chạy và không bị mutate; cùng input cho output bằng nhau; sửa/thử sửa output đầu tiên không đổi output sau hoặc fixture. Registry và nested presets đóng băng sâu.
6. **M-06:** force string + ID lạ → `INVALID_SCHEMA`; force ngoài biên + ID lạ → `OUT_OF_RANGE`; ID lạ hợp lệ → `UNKNOWN_FIXTURE`; fixture hỏng + trùng lỗ → `INVALID_FIXTURE`; fixture chuẩn + trùng lỗ → `INVALID_CONFIGURATION`.
7. **M-07 / G-07..G-09,I-06:** classifier suy ra geometry, lợi về lực và đổi hướng; test đối xứng trái/phải, cánh tay bằng nhau, tọa độ trùng, sai lưới/không safe; không chia float/hardcode ví dụ.
8. **M-08:** entrypoint chỉ thêm `evaluateLeverBench`/`classifyLeverCase`; giữ export cũ, ẩn validator/registry/withRegistry. `packages/sim/package.json` gồm runtime module, không gồm test; `npm pack --dry-run --json` chứng minh đóng gói. Chưa đồng bộ FE ở lát cắt thuần.

**Đường dẫn dự kiến:** `packages/sim/lever-bench.ts`, `packages/sim/lever-bench.test.ts`. Khi triển khai mới ghi lệnh test/typecheck/build và kết quả thực tế; không coi test xanh là science approval.

## 8. D1/D2 và release sau model slice

**D1 đã chốt:** Server ghi/validate chuỗi `LabRunEvent` đúng một lần trên cùng run, sequence tăng trong transaction/lock theo pattern FL-10: `PREDICTED_ROTATION` → `OBSERVED_ROTATION` → `MEASURED_MOMENT` → `PREDICTED_EQUILIBRIUM` → `VERIFIED_EQUILIBRIUM` → `APPLIED_LEVER_CASE`. Dự đoán persist trước khi công bố quan sát. Event payload Zod strict, quyền, retry/idempotency, concurrency và execution digest được kiểm ở activity slice; event không tham gia hàm model thuần.

**D2 đã chốt:** Activity `lever-investigation@1`, rubric server `lever-investigation@1.0.0`; dạy/chấm `M = F·d` và `F₁d₁ = F₂d₂`. Execution pin modelRef, engineVersion, pack/config/activity version và digest, rubricRef, fixture/preset và release digest; successor không sửa attempt cũ. Server recompute, không tin moment/đáp án/verdict client. Chi tiết payload/trọng số rubric thuộc activity slice, không giả là code model đã có.

**Release policy đã chốt:** Owner ký `OWNER_SIGNOFF` exact digest kèm Technical Assumptions, nguồn B18/B19, mapping 4 outcome, golden/rubric, safety/rights và giới hạn lab ảo; không cần reviewer độc lập ở Bước 0. Phải sửa `lab-release.service.ts` từ policy hiện hành `DEV_APPROVAL_V1` cho draft FL-06 tương lai và test tương thích snapshot ACTIVE cũ trước khi release; không sửa digest/receipt cũ hoặc activate bằng fixture. Chỉ B18/B19 và copy `vi`; K5 reuse `PhysicalLabEnvironment`/`LabSpace`, nhưng dụng cụ và model riêng FL-10. Animation 2D/3D nhận output `TILT_LEFT/LEVEL/TILT_RIGHT`, không tính khoa học.
