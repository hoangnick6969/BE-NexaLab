# FL-07 — Năng lượng nhiệt (K4): Design Pack và Model Slice Spec

**Trạng thái:** TECHNICALLY VERIFIED / OWNER REVIEW PENDING — production-route LabSpace, model, server activity/rubric, authoring manifest and isolated persisted browser flow implemented and verified; exact-digest publication approval and hosted rollout remain pending.

**Ngày:** 2026-11-02

**Kit:** K4 — Nhiệt

**Lab ID:** `thermal-energy` (registered in server/client allowlists)

**Activity key đề xuất:** `thermal-energy-investigation@1`

**Model:** `thermal-bench@1.0.0`

**Fixture:** `water-calorimeter-v1`

**Activity:** `thermal-energy-investigation@1`

**Rubric:** `thermal-energy-investigation@1.0.0`

**Kit:** `physics/thermal/kit`

**Ngôn ngữ:** `vi`

**Nguồn sự thật:** các mục §10–11 thay thế toàn bộ đề xuất cũ tại §1–9 nếu có khác biệt. Công thức `Q=m·c·ΔT` trong SGK KHTN 8: **CHƯA XÁC MINH**; học sinh không phải tính công thức này. Nó chỉ được dùng nội bộ trong model để phát sinh nhiệt độ từ fixture kỹ thuật. Các hằng số, bài toán calorimeter lý tưởng, mức đo và đáp án đều là **Technical Assumption**; owner ký `OWNER_SIGNOFF` trên exact digest trước khi có release. Không yêu cầu reviewer độc lập như một gate chính sách riêng.

## 1. Căn cứ và ranh giới

FL-07 là slot 6 trong portfolio; mục tiêu catalog là đo năng lượng nhiệt vật nhận khi được đun nóng, gắn với Outcome ứng viên `B27-O01`. Portfolio đề xuất joulemeter, nguồn gia nhiệt, nhiệt lượng kế và nhiệt kế; mô hình dự kiến đối chiếu năng lượng điện cấp vào với độ tăng nhiệt.

Các tên bài, mã Outcome, văn bản curriculum và độ phủ dưới đây chỉ là mapping đề xuất từ catalog. Cần xác minh theo nguồn KHTN8 có quyền truy cập, trang bài học và registry Outcome trước khi soạn nội dung dạy/chấm. Không suy ra kiến thức chính thức chỉ từ tên mã.

Ranh giới: FL-07 nghiên cứu **năng lượng nhận được khi đun nóng**. FL-08 riêng về các cách truyền nhiệt và vật liệu cách nhiệt; không nhập conduction/convection/radiation vào cùng rubric. Tái sử dụng runtime/đồ thị/đồng hồ đo khi phù hợp, nhưng giữ model, activity, pack, rubric, binding và release riêng. Dùng vỏ phòng `PhysicalLabEnvironment` chung; K4 chỉ sở hữu dụng cụ nhiệt.

## 2. Mục tiêu học tập đề xuất

Sau hoạt động, học sinh có thể:

1. Dự đoán và quan sát chiều biến đổi nhiệt độ của mẫu khi được đun.
2. Đọc năng lượng điện truyền từ heater bằng joulemeter; phân biệt J với W và thời gian.
3. So sánh năng lượng đo được với độ tăng nhiệt độ của một mẫu có khối lượng và vật liệu xác định.
4. Nhận ra dữ liệu nhiệt độ chịu ảnh hưởng bởi trao đổi nhiệt với môi trường và giới hạn độ phân giải của dụng cụ.

Mapping tạm: checkpoint A hỗ trợ B26-O01/O02 (khái niệm nhiệt/nội năng), checkpoint B–C hỗ trợ B27-O01 (đo năng lượng nhiệt vật nhận khi đun nóng). Chỉ B27-O01 là mục tiêu chính theo catalog; mapping này là Technical Assumption, owner ký OWNER_SIGNOFF trên digest. Không tuyên bố đo trực tiếp nội năng vi mô.

## 3. Trải nghiệm học sinh đề xuất

### 3A. Phạm vi mẫu v1

Việc cho học sinh chọn mẫu rắn hoặc chất lỏng là **ngoài phạm vi v1**. `water-calorimeter-v1` cố định một mẫu nước có khối lượng `100 g`; không có selector vật liệu hoặc thay đổi khối lượng trong UI.

**A — Dự đoán và khởi tạo phép đo:** xem fixture nước cố định 100 g, nhiệt độ ban đầu và giới hạn mô phỏng. Dự đoán chiều đổi nhiệt độ. Học sinh không chọn mẫu/khối lượng và không thay hằng số vật liệu trong v1.

**B — Đo năng lượng:** dùng joulemeter đo năng lượng heater cấp vào vật trong khoảng đun đã quy định. `Q=P·t` là phép tính/đối chiếu với đồng hồ, không mặc định là nhiệt lượng mẫu nhận nếu chưa nêu điều kiện nhiệt lượng kế lý tưởng. Nhiệt kế đọc `T(t)`; học sinh ghi số đo với đơn vị và độ chia thiết bị.

**C — Đối chiếu:** học sinh ghi số nhiệt kế và độ tăng nhiệt; không tính `Q=m·c·ΔT`. Chỉ chọn đáp án so sánh năng lượng/độ tăng nhiệt theo kết quả model. Công thức `mcΔT` là nội bộ, chưa xác minh có trong SGK KHTN 8.

**D — Kết luận:** nộp dự đoán, số đo, phép tính đơn vị và kết luận có dẫn chứng. Sai dự đoán không tự động bị trừ điểm; điểm dựa trên thao tác đo, độ chính xác tính toán, đơn vị và diễn giải giới hạn.

Hoạt cảnh phân tử (nếu có) chỉ minh họa định tính; không dùng chuyển động hạt làm đại lượng đo hay bằng chứng chấm điểm.

## 4. Apparatus và trình bày

- Nhiệt lượng kế/cốc cách nhiệt, mẫu có khối lượng xác định, heater điện, joulemeter và nhiệt kế.
- Bố cục K4 riêng trên bàn phòng nền chung; không thêm apparatus K1/K2/K3/K5 và không đặt đồ dùng vào component phòng nền.
- Bản 2D phải hoàn chỉnh để thao tác, đo, tính và nộp bài khi WebGL không chạy. 3D là biểu diễn cùng state, không tự tính số liệu riêng.
- Heater có trạng thái tắt/đang cấp/ngắt; đồng hồ năng lượng đơn điệu, nhiệt kế và đồ thị nhận cùng timestamp/state từ model.
- Hỗ trợ keyboard/touch, reduced motion, tương phản và target tối thiểu 44 px. Không hướng dẫn tái tạo tại nhà; mọi số liệu là mô phỏng.

## 5. Model contract cần nghiên cứu (chưa chốt)

Candidate chỉ nhằm mở nghiên cứu kỹ thuật, không phải quyết định vật lý:

- Input v1 chỉ gồm `fixtureId` và `elapsedMilliseconds`; sample ID động, mass, material, initial temperature, heater profile, `ambient temperature` và `heat-loss parameter` không do client nhập. Hai tham số ambient/loss là **ngoài phạm vi v1**; fixture không nhận chúng và không mô hình hóa thất thoát.
- Năng lượng điện cấp vào có thể tính `E_in = Σ(P_mW × Δt_ms) / 1_000_000` joule với số nguyên có scale rõ; cần chọn độ phân giải/thời gian lấy mẫu để tránh float và overflow.
- Phương trình `Q_sample = m·c·ΔT` và bảng `c` cần nguồn/đơn vị được review. Mô hình loss có thể cần `Q_sample ≤ E_in`; không tự đặt hiệu suất/loss tùy ý để khớp đáp án.
- Nếu chưa có thông số `c`, hiệu suất, điều kiện cách nhiệt và độ chính xác thiết bị được xác nhận, v1 chỉ được dạy phép đo `E_in` và `ΔT` mô tả; không chấm phép suy ra nhiệt dung hay cân bằng năng lượng định lượng.
- Mô hình phải xác định nhiệt độ lấy mẫu, lượng tử hóa, ngưỡng dừng an toàn, giới hạn nhiệt độ, clamp và hành vi reset/replay trước khi viết code.

Chỉ mở Model Slice sau khi các đại lượng, scale số nguyên, thứ tự validate, mã lỗi, state/output schema, golden/invalid fixtures và test cases được chốt như FL-06/FL-10. Server tính lại authoritative; client không gửi điểm hay số liệu kết quả làm nguồn tin cậy.

## 6. Activity, event và rubric

Chuỗi event và payload được định nghĩa duy nhất tại §11. Mỗi event gắn run, seq, timestamp và pinned tuple/digest; server từ chối payload thừa/thiếu hoặc sai thứ tự.

Rubric chi tiết và pass mark duy nhất nằm tại §11. Không chấm văn bản tự do.

## 7. Rủi ro và gates trước implementation/release

1. **Curriculum/source:** nội dung B26–B27 và wording Outcome hiện là mapping Technical Assumption; owner ký OWNER_SIGNOFF trên digest, không gắn nhãn đã kiểm chứng nguồn.
2. **Science/model:** cách phân biệt điện năng vào với nhiệt mẫu nhận, `c`, loss và điều kiện mẫu được ghi Technical Assumption; owner ký OWNER_SIGNOFF trên digest.
3. **Safety:** giới hạn nhiệt độ/công suất/thời gian và cảnh báo là Technical Assumption; owner ký OWNER_SIGNOFF trên digest và UI nêu đây là mô phỏng.
4. **Measurement:** xác định resolution/tolerance của joulemeter và nhiệt kế; không dùng số chữ số giả chính xác.
5. **Backend:** pin model/config/pack/activity/rubric bất biến theo digest; scorer authoritative; mapping đúng lesson/outcome.
6. **Frontend:** shared physical room; parity 2D/3D; reduced-motion/WebGL fallback; kiểm tra mobile, keyboard và touch.
7. **Release:** migration/schema chỉ khi cần và theo runbook; không tạo bảng riêng nếu pipeline generic đáp ứng; publish chỉ khi candidate/digest/review gates hiện hành được thỏa mãn.

## 8. Các mục chưa xác minh

- Read-only registry verification (2026-11-03): `KHTN8-B27-O01`, topic `KHTN8-L27`, published Lesson `pack-structured-08ed449d58fd5a1cbfa84a6fee3f2f0c88a7b95f-v1`, released content pack `cmvmmpjhd001rlw14azpwmk52` digest `618b1e879742f149bfb04596061c2abb950a372845b5dcc929a62c51add94fb5`. Statement: “Đo được năng lượng nhiệt mà vật nhận được khi bị đun nóng.” Stored source provenance points to PDF111 / printed109, block `sgk-khtn8-nxbgd-2026-p0111-b0004`, with `approved_internal` content review. This verifies stored identity/provenance, not independent source acceptance or FL-07 release approval.
- Quyền sử dụng nguồn và xác nhận khoa học ngoài owner assumptions. Các thông số trong §10 là Technical Assumptions, không phải dữ kiện thực nghiệm/SGK.
- `Q=m·c·ΔT` có trong SGK KHTN 8 hay không: **CHƯA XÁC MINH**; học sinh không tính công thức này trong v1.

## 9. Kế hoạch bước tiếp

1. Đối chiếu lại source/curriculum map; mọi mục chưa xác minh giữ nhãn Technical Assumption, owner ký OWNER_SIGNOFF trên digest.
2. Chốt subject/safety assumptions và dải hoạt động dưới cùng cơ chế OWNER_SIGNOFF.
3. Giữ các mục chưa xác minh tại §8 dưới nhãn rõ ràng; Technical Assumptions được owner ký `OWNER_SIGNOFF` trên exact digest trước mọi release.
4. Triển khai Model Slice thuần (`packages/sim/thermal-bench.ts` và test `M-01..M-08`) trước; BE activity/event/rubric và K4 UI là track sau, phải kiểm tra cap track/P3 gate trước khi mở.
5. Khi được mở track, kiểm tra isolated PostgreSQL và FE browser/mobile/WebGL fallback; không dùng Supabase production cho test/seed/migration.
6. Theo release runbook hiện hành; không tạo registry/release từ spec hoặc Model Slice này.

**Implementation note (2026-11-03):** `thermal-bench@1.0.0`, the server allowlist, ordered run events, the six-criterion rubric, and run-bound K4 2D/3D frontend are implemented on `codex/fl-07-thermal-energy`. This does not create a persisted Lab, source approval, migration, release candidate, or publish action. The technical activity is not curriculum or science approval.

**Completion evidence (2026-11-03):** the authoring manifest is `content/simulation-packs/fl07-candidate.json`; `docs/operations/fl07-publication-readiness.md` records the read-only real B27 mapping, 40/40 focused BE tests, isolated persisted API/browser proof, F5 recovery, input validation, 2D/3D parity, thumbnail and publication operator steps. A TEST FIXTURE ONLY Lab/release exists only in the isolated local database. No shared candidate or approval exists from this implementation. The production UI entry `/labs/thermal-energy` is included in the FE build; the dev fixture remains a separate preview.

## 10. Contract v1 có thể triển khai — `thermal-bench@1.0.0`

**Ranh giới outcome:** candidate `B27-O01` yêu cầu đo năng lượng nhiệt vật nhận khi đun nóng. Joulemeter đo điện năng heater; trong fixture lý tưởng, model giả định toàn bộ điện năng thành nhiệt mẫu. Đây là Technical Assumption, không mô tả phép đo thực nghiệm chính xác. B26-O01/O02 chỉ là nội dung hỗ trợ định tính.

### 10.1 Hằng số, fixture và hàm thuần

Một fixture `water-calorimeter-v1` bất biến: nước `massGrams=100`, `specificHeatMilliJoulesPerGramKelvin=4200` (tương đương 4,2 J/g/K), `initialTemperatureMilliCelsius=25000`; heater `powerMilliWatts=42000`; bước `1000 ms`, tối đa `100000 ms`; nhiệt kế độ chia `100 m°C`, joulemeter độ chia `1000 mJ`. Giá trị nhiệt dung và thiết bị là **Technical Assumption** cần owner/subject signoff cùng exact digest; không nhận là số đo SGK. Không cho client gửi `c`, `P`, nhiệt độ đầu hay đáp án. V1 một mẫu nước cố định; so sánh vật liệu khác thuộc phiên bản sau.

`evaluateThermalBench(raw: unknown)` nhận strict `{ fixtureId: 'water-calorimeter-v1', elapsedMilliseconds: number }`. Thời gian nguyên an toàn trong `[0,100000]`, bội `1000`. Output có contract tường minh:

```ts
type ThermalOutput = {
  modelVersion: '1.0.0';
  fixtureId: 'water-calorimeter-v1';
  elapsedMilliseconds: number;
  inputEnergyMilliJoules: number;
  sampleHeatMilliJoules: number;
  temperatureMilliCelsius: number;
  riseMilliCelsius: number;
  meterReadingMilliJoules: number;
  thermometerReadingMilliCelsius: number;
  heaterState: 'OFF' | 'ON' | 'AUTO_STOP';
  assumptions: readonly [
    'ideal_calorimeter',
    'no_heat_loss',
    'no_container_heat_capacity',
    'constant_specific_heat',
  ];
};
```

`E_mJ=P_mW*t_ms/1000=42*t_ms`; `ΔT_m°C=t_ms/10`. 1000 ms cho 42000 mJ và 100 m°C; 50000 ms cho 2100000 mJ và 5000 m°C; 100000 ms cho 4200000 mJ, 10000 m°C và 35 °C. Làm tròn readings half-up. Mốc 35 °C trùng đúng giới hạn thời gian 100 s nên auto stop không độc lập với thời gian tối đa. Học sinh không tính `mcΔT`; công thức có trong SGK KHTN 8 hay không **CHƯA XÁC MINH**, và chỉ thuộc phép tính nội bộ model.

`Result<T> = {ok:true,value:T}|{ok:false,code:ModelErrorCode}`; `ModelErrorCode = INVALID_SCHEMA | OUT_OF_RANGE | UNKNOWN_FIXTURE | INVALID_FIXTURE`. Không throw ở input client. Chỉ export `evaluateThermalBench` từ sim entrypoint; registry, validator và hàm tiêm fixture phục vụ test là nội bộ. Fixture được đóng băng sâu và validate mỗi lần evaluate.

| Bước | Điều kiện | Mã lỗi |
|---|---|---|
| 1 | Zod strict: thiếu/thừa key, sai kiểu, NaN/Infinity, số lẻ | `INVALID_SCHEMA` |
| 2 | elapsed không safe, ngoài biên hoặc không chia hết 1000 | `OUT_OF_RANGE` |
| 3 | fixtureId không có trong registry | `UNKNOWN_FIXTURE` |
| 4 | fixture sai hằng số, provenance, giới hạn hoặc golden digest nội bộ | `INVALID_FIXTURE` |
| 5 | Không cần bước/test riêng: với fixture và input hợp lệ, overflow không thể xảy ra; guard số nguyên an toàn chỉ phòng thủ | — |

### 10.2 Golden, invalid và `M-xx`

| ID | elapsed | E = Q | T | Meter / thermometer |
|---|---:|---:|---:|---|
| G-01 | 0 ms | 0 mJ | 25000 m°C | 0 mJ / 25000 m°C; OFF |
| G-02 | 1000 ms | 42000 mJ | 25100 m°C | 42000 mJ / 25100 m°C; ON |
| G-03 | 50000 ms | 2100000 mJ | 30000 m°C | 2100000 mJ / 30000 m°C; ON |
| G-04 | 100000 ms | 4200000 mJ | 35000 m°C | 4200000 mJ / 35000 m°C; AUTO_STOP |
| G-05 | 99000 ms | 4158000 mJ | 34900 m°C | 4158000 mJ / 34900 m°C; ON |

| ID | Input/lỗi | Mã |
|---|---|---|
| I-01 | elapsed string, 1.5, NaN, key `temperature` tự khai | INVALID_SCHEMA |
| I-02 | -1000, 100001, 2^53, 500 ms | OUT_OF_RANGE |
| I-03 | fixtureId lạ, elapsed hợp lệ | UNKNOWN_FIXTURE |
| I-04 | fixture test bị sửa `c`, `P`, provenance, limit hoặc golden | INVALID_FIXTURE |

`M-01` G-01..G-05 chính xác; `M-02` ranh giới energy/heat; `M-03` fixture mutation; `M-04` I-01..I-04 và thứ tự lỗi; `M-05` kiểm tra thứ tự key input không ảnh hưởng output, input đã `Object.freeze` sâu chạy bình thường/không bị mutate, deterministic và output detached; `M-06` schema strict/precedence schema > range > lookup > fixture; `M-07` helper nội bộ `quantizeReading` với half-up và invalid arguments throw (fixture mặc định không kích hoạt rounding); auto stop 35 °C trùng mốc 100 s nên chỉ kiểm tra tính tương đương với giới hạn thời gian, không tuyên bố trigger độc lập; `M-08` package chỉ public `evaluateThermalBench`, không lộ helper/registry. Guard safe-integer không cần test kích hoạt.

## 11. Activity và rubric v1 triển khai

Checkpoint A: prediction. B: ghi số đo 50 s: `E=2100 J`, `T0=25,0 °C`, `T1=30,0 °C`, `ΔT=5,0 °C`. C: prediction lần hai độc lập; ở 100 s ghi `E=4200 J`, `T1=35,0 °C`, `ΔT=10,0 °C`. D: lựa chọn quan hệ E/ΔT và điều kiện calorimeter lý tưởng. Học sinh không tính `mcΔT`; công thức chỉ là nội bộ model, việc công thức này có trong SGK KHTN 8 hay không CHƯA XÁC MINH.

Event cố định theo thứ tự và mọi payload Zod `.strict()`:

1. `PREDICTED_TEMPERATURE_CHANGE`: `{choice:'increase'|'same'|'decrease'}`. R1 = payload hợp lệ và có trước heating (1 điểm participation, không chấm đúng/sai).
2. `STARTED_HEATING`: payload `{}`; server ghi mốc start, 0 điểm.
3. `RECORDED_FIRST_MEASUREMENT`: `{elapsedMilliseconds:50000,energyMilliJoules:number,temperatureMilliCelsius:number,riseMilliCelsius:number}`; R2 = energy và temperature bằng model readings sau lượng tử hóa (1); R3 = rise bằng model rise (1).
4. `PREDICTED_SECOND_MEASUREMENT`: câu hỏi “Nếu tiếp tục đun mẫu nước đến 100 s, độ tăng nhiệt độ ΔT (tính từ nhiệt độ ban đầu T0 = 25,0 °C) ở mốc 100 s sẽ thế nào so với ΔT ở mốc 50 s?” Payload `{choice:'more_than_double'|'double'|'less_than_double'}`; 0 điểm, không trừ dự đoán sai.
5. `RECORDED_SECOND_MEASUREMENT`: cùng shape, elapsed đúng 100000; R4 = energy, temperature và rise khớp output lượng tử hóa/model (1).
6. `EXPLAINED_ENERGY_BOUNDARY`: trả lời hai câu kết luận bằng `{ratioChoice:'more_than_double'|'double'|'less_than_double',boundaryChoice:'equal_ideal_only'|'always_equal'|'unrelated'}`. Câu một hỏi quan hệ ΔT tại 50 s và 100 s theo bảng; R5 = `double` (1). Câu hai hỏi khi nào nhiệt lượng mẫu bằng điện năng joulemeter; R6 = `equal_ideal_only` (1). Scoring dựa model outputs/fixture, không dựa số học sinh tự khai; giải thích tự do tùy chọn, không chấm.

Tổng 6 điểm, pass đề xuất 5/6. Mỗi event bind run/digest/seq/time; BE xác thực đúng thứ tự và hai mốc đo, tính lại output. Retry/replay giữ nguyên verdict và không nhân đôi attempt.

UI/parser contract: T0=`25,0 °C` (`25000 m°C`) hiện cố định trong sổ tại `t=0`; học sinh không nhập T0 và T0 không nằm trong event payload. Tại 50/100 s có ba ô E, T, ΔT. E hiển thị J và chỉ nhận chuỗi `/^(0|[1-9]\d*)$/`, miền `0..10000 J`; FE chuyển bằng phép nhân nguyên `×1000` sang `energyMilliJoules`. T/ΔT hiển thị °C, chỉ nhận `/^(0|[1-9]\d*)([.,]\d)?$/`, miền `0,0..100,0 °C`; parser tách chuỗi thành phần nguyên và phần mười rồi tính `integer×1000 + tenth×100` m°C, tuyệt đối không `parseFloat`. Bắt buộc reject tại UI (hiện lỗi cạnh ô, không gửi event): `2.100` ở ô J, `1.000,0`, `-5`, `+30`, `30,05`, `25.12`, `2100,5` ở ô J, `0030`, `05`, `00.5`, `30.`, `30,`, `.5`, `,5`, chuỗi rỗng, chỉ khoảng trắng, `30 C`, `2100J`, `30, 0`. Giá trị cú pháp hợp lệ nhưng sai phép đo trong miền model vẫn được gửi làm evidence; R2/R3/R4 chấm 0 ở criterion tương ứng. Server strict-schema và miền số nguyên mJ `[0..10_000_000]`, m°C `[0..100_000]`; exact match tolerance 0 với meter/thermometer/rise output. Hai mốc là một tiến trình liên tục 0→50→100 s. 2D/3D cùng output; 2D hoàn chỉnh khi WebGL mất hoặc reduced motion bật. Thumbnail dùng harness chung và không vào digest.

Gate trước release: chốt Technical Assumptions (mapping, `c`, calorimeter lý tưởng, safety, rubric) và OWNER_SIGNOFF exact digest; không hàm ý có independent review. Model Slice hiện chỉ là technical candidate; kiểm tra phase/cap trong roadmap trước khi mở implementation track hoặc registry/release.
