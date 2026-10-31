# FL-10 / K2 — đặc tả để triển khai

Trạng thái: **model thuần và bản triển khai ứng viên BE/FE đã có; integration DB, review nguồn/khoa học và release chưa xong**. Xem [delivery plan](fl-10-k2-delivery-plan.md) để biết từng gate. Không xem tài liệu này là duyệt khoa học, nguồn SGK, OWNER_SIGNOFF hay ghi đè gate trong `lab-pipeline-phase-plan.md`. Phạm vi là một ứng viên hoạt động bảo toàn khối lượng thuộc FL-10; quyết định SPLIT toàn FL-10 vẫn mở.

## 1. Mục tiêu, bằng chứng và phạm vi

Đề xuất liên kết B05-O01, hỗ trợ học sinh dự đoán, quan sát số đo, giải thích và vận dụng phạm vi cân. Thao tác ảo không chứng minh năng lực sử dụng dụng cụ hoá học thật. Mapping, mức hỗ trợ và Lesson cụ thể cần đối chiếu nguồn và review trước release.

K2 là nền presentation cho các ứng viên FL-10–FL-15. Xây room, dụng cụ và widget theo nhu cầu thực tế; mỗi hoạt động có model, dữ liệu, rubric và release riêng. Fixture `chemistry@1.0.0` không phải FL-10.

### Phân biệt các lớp mô hình

- **Model khoa học v1** là phép tính sổ sách cho một fixture lý tưởng: sản phẩm đã được xác định trong fixture, model kiểm tra nhất quán và tính tổng. Kết quả hai số bằng nhau là hệ quả của giả định; model không tự khám phá định luật, không mô phỏng tốc độ, độ tan, chuyển động chất lỏng, bay hơi, sai số cân hay chất dư. Số hiển thị phải được nhận diện là mô phỏng; cân thật có sai số.
- **Activity** điều phối bước và bằng chứng; **rubric** chấm kết quả theo phiên bản được duyệt; **view model** đề xuất chỉ chuyển state và output thành dữ liệu hiển thị; **renderer K2** diễn họa. Cảnh, màu, quỹ đạo và sơ đồ vi mô không phải dữ liệu đo trực tiếp.
- Người học có thể rút ra kết luận về trường hợp lý tưởng đã mô phỏng và phạm vi được cân; không suy ra hai cốc mở là hệ kín, số đo thực luôn bằng nhau tuyệt đối hay lab ảo chứng minh kỹ năng thao tác thật.

Tài liệu tham khảo báo nhóm đã đối chiếu OCR và cho rằng ví dụ định lượng với thí nghiệm hai cốc nằm ở các mục khác nhau. Việc đưa số của ví dụ vào cảnh hai cốc là **đề xuất ghép của thiết kế**, chưa được xác minh từ SGK và không được trình bày là một thí nghiệm SGK nguyên bản. D4 cần xác nhận edition, source block, quyền và có chấp nhận việc ghép cùng nhãn “ví dụ” hay không.

## 2. Lát cắt đầu tiên: model thuần và fixture

**Đầu ra:** hàm TypeScript thuần trong `packages/sim/`, schema Zod strict, fixture test và test đơn vị. Không đăng ký model trong production registry, không sửa tarball FE, không tạo LabRun/release, route, dữ liệu DB hoặc UI trong lát cắt này. Tên dự kiến `mass-conservation@1.0.0` là đề xuất, chưa phải model đã đăng ký. Tránh thay đổi hành vi các model hiện tại.

### Fixture tham chiếu kỹ thuật

Đề xuất phản ứng BaCl₂ + Na₂SO₄ → BaSO₄ + 2 NaCl, với khối lượng mol làm tròn 208, 142, 233, 58,5 g/mol. Fixture phép tính: 20.800 mg và 14.200 mg chất tham gia; 23.300 mg và 11.700 mg sản phẩm. Hai vế cùng 35.000 mg; theo các khối lượng mol giả định là 0,1; 0,1; 0,1; 0,2 mol. Đây là **fixture tham chiếu do người dùng cung cấp**, không phải số đo hay nguồn SGK đã kiểm chứng.

Fixture kèm `source`: loại `user_reference`, mô tả, trạng thái `unverified`, edition/page/source-block để `null` đến khi có chứng cứ; không tạo citation giả, không đọc OCR local trong test. Khối lượng cốc rỗng, dung môi và độ chia cân là giả định fixture được ghi nguồn riêng, không trình bày là số liệu SGK. Phản ứng, độc tính muối barium tan và xử lý chất thải phải review trước khi học sinh nhìn thấy.

Golden case cân kỹ thuật: mỗi cốc rỗng **100.000 mg**, mỗi phần dung môi **50.000 mg**; với 35.000 mg chất tham gia hoặc sản phẩm, số cân trước và sau đều **335.000 mg**. Bốn giá trị cốc/dung môi có provenance `technical_assumption`, do nhóm phát triển đặt để test công thức; không phải tham số học sinh hay số liệu SGK đã duyệt.

Provenance `technical_assumption` của bốn khối lượng được lưu trong hằng số hoặc chú thích của test, không thêm vào `MassInput` hay `ConservationFixture.source`. Các giá trị 50 g dung môi chỉ để kiểm tra phép cộng, **không được tái sử dụng làm tham số hiển thị cho học sinh**. D4 phải review độ tan, nhiệt độ và nồng độ trước khi chọn dung môi cho hoạt động; chưa khẳng định giá trị độ tan từ trí nhớ là evidence.

### Contract v1 giới hạn

- Chỉ chấp nhận một bộ khối lượng chất phản ứng và sản phẩm ở trên; dữ liệu không trùng fixture bị từ chối, chưa hỗ trợ đầu vào tỉ lệ bất kỳ, chất dư, phản ứng khác, khí, hao hụt, thay đổi nhiệt độ hay thay đổi giai đoạn bằng API. Một validator strict từ chối trường lạ, số không nguyên, âm, NaN và ngoài giới hạn. Không nhận số cân hay kết luận do client cung cấp.
- Quy ước tên trường: dùng hậu tố `Milligrams` cho mg, `Millimoles` cho mmol và `MolarMassTenthsGramsPerMol` cho 0,1 g/mol; không dùng `Mg` vì đó là ký hiệu megagram. Các giá trị là số nguyên an toàn, kiểm tra trước mọi phép tính; không so sánh số thực dấu phẩy động.
- Mỗi khối lượng cốc rỗng nằm trong **[1, 1.000.000] mg**, mỗi khối lượng dung môi trong **[0, 1.000.000] mg**, hai đầu mút tính cả. Đây là giới hạn kỹ thuật giả định, chưa được duyệt là phạm vi thí nghiệm thật. Không nhận khối lượng chất hoặc sản phẩm tùy ý ngoài fixture.
- `0 mg` dung môi chỉ là biên kiểm thử kỹ thuật, không biểu diễn dung dịch thật. Cấu hình hướng tới học sinh cần dung môi dương và được review; không mặc định cho học sinh nhập tự do khối lượng.
- `massBefore = cup1 + cup2 + solvent1 + solvent2 + reactantA + reactantB`; `massAfter = cup1 + cup2 + solvent1 + solvent2 + productA + productB`. Chất tan là thành phần của dung dịch nên không cộng thêm tổng dung dịch. Trước/sau đều cân toàn bộ hai cốc và mọi thành phần đã liệt kê, giả định không bắn, bay hơi hoặc thất thoát. Hai cốc mở không phải hệ kín.
- Model chưa mô phỏng phân bố chất theo cốc, dung dịch bám thành cốc, một cốc trên cân, độ chia cân, thao tác hay trình tự. Giả định fixture: không bắn, không bay hơi, không thất thoát và không có lượng bám thành cốc được mô phỏng; đây là lý tưởng hóa, không khẳng định hiện tượng thật. Renderer tương lai làm tròn hiển thị theo tham số được duyệt; không dùng số đã làm tròn làm đầu vào tính khoa học.

### Interface và validation fixture

```ts
type Species = "BaCl2" | "Na2SO4" | "BaSO4" | "NaCl";
type FixtureEntry = { species: Species; massMilligrams: number; amountMillimoles: number; molarMassTenthsGramsPerMol: number };
type ConservationFixture = {
  id: "barium-precipitation-reference-v1";
  reactants: [FixtureEntry, FixtureEntry]; products: [FixtureEntry, FixtureEntry];
  source: { kind: "user_reference"; status: "unverified"; description: string; edition: string | null; page: number | null; sourceBlock: string | null };
};
type MassInput = { fixtureId: string; cup1Milligrams: number; cup2Milligrams: number; solvent1Milligrams: number; solvent2Milligrams: number };
type ModelErrorCode = "INVALID_SCHEMA" | "OUT_OF_RANGE" | "UNKNOWN_FIXTURE" | "INVALID_FIXTURE";
type Result<T> = { ok: true; value: T } | { ok: false; code: ModelErrorCode };
type MassOutput = {
  modelVersion: "1.0.0"; fixtureId: string;
  systemBoundary: "two_open_cups_on_scale";
  assumptions: readonly ["no_splash", "no_evaporation", "no_loss", "no_residue_modeled"];
  reactants: FixtureEntry[]; products: FixtureEntry[];
  reactantsTotalMilligrams: number; productsTotalMilligrams: number;
  beforeScaleMilligrams: number; afterScaleMilligrams: number;
};
declare function validateConservationFixture(raw: unknown): Result<ConservationFixture>;
declare function evaluateMassConservation(raw: unknown): Result<MassOutput>;
```

Fixture kỹ thuật bất biến được lưu ở source/test fixture và tra cứu bằng allowlist nội bộ; `evaluateMassConservation` validate **fixture được tra cứu ở mỗi lần gọi** trước khi tính. Input hàm chỉ có `fixtureId` và bốn khối lượng cốc/dung môi, không truyền hay thay fixture. `validateConservationFixture` được export từ module nội bộ để test dữ liệu biến đổi, không export từ entrypoint package và không phải API cho client cung cấp phản ứng; nó kiểm tra schema strict, ID, đúng tên và thứ tự species, các hằng số fixture allowlist, tổng khối lượng và tỉ lệ mmol.

Ở lát cắt thuần, `MassInput` là input của hàm kỹ thuật, không phải request API học sinh. Khi tích hợp LabRun, server lấy fixture ID và bốn giá trị cốc/dung môi từ bộ tham số đã review, pin vào execution snapshot và bảo vệ bằng digest theo contract D1/D2; không nhận giá trị từ client học sinh làm nguồn thẩm quyền. Validation biên kỹ thuật không phải phê duyệt khoa học. Test tích hợp phải chứng minh giả mạo input client không thay đổi tham số đã pin hoặc kết quả server.

Để kiểm thử nhánh fixture lỗi, module nội bộ có `evaluateMassConservationWithRegistry(raw, registry)` dùng cùng đường xử lý với hàm công khai. Test import trực tiếp module nội bộ và tiêm registry fixture đã sửa; entrypoint `packages/sim` chỉ export `evaluateMassConservation`, luôn truyền registry chuẩn đóng băng và không nhận registry từ client. Registry bị lỗi trả `INVALID_FIXTURE` trước khi trả output; không tạo đường tiêm vào production API.

Output phải tạo bản sao sâu các phần tử `reactants` và `products`, không chia sẻ object hoặc mảng với registry. Sửa output của một lần gọi không được ảnh hưởng fixture hoặc output của lần sau. Output không đưa giới hạn kỹ thuật cốc 1 mg vào nội dung học sinh; số đó chỉ dùng validate đầu vào kỹ thuật.

Runtime kiểm tra số nguyên `amountMillimoles` tương ứng 100, 100, 100, 200; `molarMassTenthsGramsPerMol` tương ứng 2080, 1420, 2330, 585. Với từng chất kiểm tra chính xác `massMilligrams * 10 === amountMillimoles * molarMassTenthsGramsPerMol`, kiểm tra nhân an toàn trước khi so sánh; đồng thời kiểm tra tỉ lệ 1:1:1:2 và tổng hai phía. Các khối lượng mol làm tròn là giả định fixture.

| Mã | Khi nào |
|---|---|
| `INVALID_SCHEMA` | Thiếu/sai kiểu trường, giá trị không nguyên hoặc không hữu hạn, hoặc input có trường lạ. |
| `OUT_OF_RANGE` | Cốc hoặc dung môi ngoài biên công bố; số nguyên không an toàn bị từ chối. |
| `UNKNOWN_FIXTURE` | `fixtureId` là chuỗi nhưng không nằm trong allowlist. |
| `INVALID_FIXTURE` | Fixture nội bộ không đúng schema, provenance, species, hằng số, tỉ lệ, khối lượng/mol hoặc bảo toàn. |

Thứ tự xác thực: schema/kiểu → biên → lookup → validate fixture → tính toán. Schema strict chỉ kiểm tra sự hiện diện, kiểu số, hữu hạn và nguyên, cùng trường lạ; không dùng `.safe()` hay `.min()`/`.max()` ở bước này. Bước biên riêng dùng `Number.isSafeInteger` và min/max, trả `OUT_OF_RANGE` cho số nguyên không an toàn hay ngoài khoảng. Với các biên và fixture cố định, số học nằm trong dải số nguyên an toàn; vẫn kiểm tra số nguyên an toàn khi validate fixture, fixture không an toàn trả `INVALID_FIXTURE`. Không đặt mã overflow riêng không thể kích hoạt qua input hợp lệ. Các input có nhiều lỗi chỉ cam kết mã của bước đầu tiên; không trả exception hay stack trace ra contract này.

### Acceptance và TDD model

1. Viết fixture và test trước. **M-01/G-01:** xác minh từng thành phần 20.800, 14.200, 23.300, 11.700 mg và tổng hai phía 35.000 mg; với hai cốc 100.000 mg và hai phần dung môi 50.000 mg, khẳng định số cân trước và sau đều 335.000 mg, mỗi thành phần đúng một lần. Fixture gắn provenance chưa xác minh và không phụ thuộc file OCR ngoài CI.
2. **M-02:** kiểm tra đơn vị nguyên, công thức khối lượng/mol và tỉ lệ 1:1:1:2 tại runtime; khối lượng mol làm tròn là giả định.
3. **M-03:** tạo bản sao fixture đổi 23.300 → 23.400 mg, giữ các trường khác: `validateConservationFixture` và lời gọi evaluator nội bộ với registry được tiêm đều trả `INVALID_FIXTURE`. Thay đổi tỉ lệ mmol, molar mass, species hoặc tổng cũng phải bị từ chối; fixture v1 không có trường hệ số riêng. Không dùng nhiều bộ cốc/dung môi làm bằng chứng duy nhất cho bảo toàn; không tuyên bố hỗ trợ chất dư.
4. **M-04:** kiểm tra các biên cốc 0/1/1.000.000/1.000.001 và dung môi -1/0/1.000.000/1.000.001 mg, số nguyên không an toàn `2 ** 53` trả `OUT_OF_RANGE`, cùng sai kiểu, số lẻ, NaN, trường lạ, fixture không biết và phép tính an toàn. Kiểm tra tổng với cốc/dung môi khác nhau và thứ tự cộng; assert mã lỗi theo bảng.
5. **M-05:** cùng input cho output bằng nhau về giá trị, có `modelVersion: "1.0.0"`, `systemBoundary: "two_open_cups_on_scale"` và đủ giả định. Sửa hoặc thử sửa mảng/entry trong output đầu tiên, gọi lại với cùng input và xác nhận output sau cùng fixture gốc không đổi.
6. **M-06:** `cup1Milligrams` là chuỗi cùng với `fixtureId` lạ trả `INVALID_SCHEMA`; cốc ngoài biên cùng với `fixtureId` lạ trả `OUT_OF_RANGE`; ID lạ với các trường còn lại hợp lệ trả `UNKNOWN_FIXTURE`. Test khẳng định thứ tự kiểm tra đã công bố.
7. **M-07:** trong các export mới của lát cắt này, entrypoint `packages/sim` chỉ public `evaluateMassConservation`, không public validator, registry hoặc hàm tiêm registry; các export model hiện có được giữ nguyên. Test module nội bộ xác nhận registry chuẩn và các object/mảng lồng nhau được đóng băng sâu: thử sửa phải lỗi hoặc không có tác dụng, và các lần gọi sau không đổi. Quyền truy cập registry của test chỉ qua module nội bộ, không thêm đường tiêm vào API public.
8. Chạy test model thuần có phạm vi hẹp và typecheck theo quy trình repo; mọi lệnh DB/test tích hợp phải dùng guard và PostgreSQL loopback cô lập. Không sửa hay reset DB dùng chung. Ghi lệnh và kết quả thực tế; test xanh chỉ là bằng chứng kỹ thuật.

**Đóng gói:** đặt implementation/validator/registry tại `packages/sim/mass-conservation.ts`, test tại `packages/sim/mass-conservation.test.ts`; `packages/sim/index.ts` chỉ re-export `evaluateMassConservation` từ module mới và giữ các export hiện có. Lát cắt thuần cập nhật `packages/sim/package.json` `files` để bao gồm module runtime mới (không gồm test), không tạo tarball FE. Trước khi phân phối hay đồng bộ FE, version tarball theo quy trình repo và xác minh tarball chứa mọi file được entrypoint import; test trong checkout BE không chứng minh tarball dùng được.

**Evidence cục bộ 2026-10-31:** `npm test -- packages/sim` qua database guard với URL loopback dành cho test thuần: 3 files, 33 tests passed, gồm 7 test FL-10; không có kết nối DB trong các test model này. `npm run lint` và `npm run build` passed. `npm pack --dry-run --json` liệt kê `index.ts`, `mass-conservation.ts` và `package.json`; chưa tạo hay đồng bộ tarball, chưa kiểm tra FE dùng phiên bản mới. Đây là bằng chứng kỹ thuật, không xác nhận thí nghiệm thực, độ tan, nguồn hay release.

Bản test spec người dùng gửi qua attachment trước đó đã **được thay thế ở phần Model** bởi mục này; Activity, Rubric, Renderer và kiểm thử chéo tầng trong bản đó chỉ là danh mục tham khảo cho D1–D5, chưa là acceptance contract. Không tìm thấy bản sao của tài liệu attachment đó trong repo để sửa trực tiếp.

## 3. Quyết định chặn các lát cắt tiếp theo

Bản nháp nội dung D3/D4 của chủ dự án đã được ghi riêng tại [fl-10-student-content-draft.md](fl-10-student-content-draft.md). Nó xác định mã lựa chọn và chuỗi hoạt động ứng viên nhưng **chưa xác nhận nguồn SGK, độ tan, trọng số rubric hay release**. Các con số 435,0 g chỉ là tham số đề xuất và không thay golden test kỹ thuật.

### Đối chiếu code 2026-10-31

Kế hoạch triển khai và quyết định kỹ thuật D1/D2 sau khi đối chiếu code: [fl-10-k2-delivery-plan.md](fl-10-k2-delivery-plan.md). D1 chọn event log server trước khi công bố số đo; D2 chọn tuple pin hiện có và rubric FL-10 độc lập. **Chưa có event API, rubric runtime, cấu hình được review hay release**. Bảng bên dưới giữ các acceptance gate cho implementation, không còn có nghĩa là D1/D2 chưa có hướng giải quyết.

- `src/modules/labs/interface/labs.controller.ts` hiện tạo `LabRun` với `execution` và `executionDigest`, rồi chỉ nhận evidence tại `submitRun`; `src/features/labs/runtime/lab-run-host.ts` lưu bản nháp cục bộ. Contract Circuit hiện tại là **replay khi nộp**. Nó không chứng minh thời điểm học sinh dự đoán trước quan sát. FL-10 sẽ dùng endpoint/event log mới; không diễn đạt replay như xác thực từng bước.
- `src/modules/labs/application/lab-run.ts` kiểm tra activity/model/rubric tuple bằng `rubricRefForActivity` và `executionSchema`; `assignmentExecutionSchema` và digest pin tuple. Rubric Circuit chấm độ đúng dự đoán và không phù hợp FL-10. `mass-conservation@1.0.0` cùng activity key `mass-conservation-*` hiện bị chặn khỏi rubric legacy bằng kiểm tra fail closed và test. D2 vẫn cần định nghĩa rubric FL-10 riêng, tham số được review, snapshot/digest và migration tương thích trước khi đăng ký model.
- Model kỹ thuật chưa có tham số dung môi được duyệt, nội dung POEA và review nguồn/an toàn. Không đăng ký registry, renderer, LabRun hay release dựa trên fixture này. D3–D5 vẫn mở.

| Quyết định | Cần chốt trước | Evidence cần có |
|---|---|---|
| D1: event log được server xác thực theo bước hay replay evidence khi submit | Kiểm thử trình tự và UX khôi phục | So sánh yêu cầu xác thực thời điểm, offline/retry, idempotency, concurrency, persistence, chi phí và bảo vệ dữ liệu. Replay cuối không chứng minh học sinh đã dự đoán trước theo thời gian thực. |
| D2: version rubric, activity và tham số được duyệt | Kiểm thử rubric, replay và tích hợp model | Kiểm tra `executionSchema`, `rubricRefForActivity`, digest, assignment pin, release snapshot, retry và replay hiện có. Chốt server lấy bộ tham số đã review và pin vào snapshot/digest; quy định tương thích, migration và không thay đổi kết quả attempt cũ. |
| D3: nội dung POEA | Review activity và rubric | Câu dự đoán trung lập, câu giải thích có cấu trúc, tình huống vận dụng và phản hồi theo từng lựa chọn; sai dự đoán không tự trừ điểm. Văn bản tự do không chấm bằng từ khóa. |
| D4: mô hình thí nghiệm và nguồn | Thiết kế scene và golden khoa học | Edition, trang in, source block, Lesson/Outcome, quyền nội dung; xác nhận thiết bị, phạm vi cân, giả định không hao hụt và an toàn. Không suy từ OCR chưa review. |
| D5: UI và K2 | Renderer và kiểm thử V | Thiết kế desktop/mobile 2D/3D, điều khiển bàn phím/cảm ứng, trạng thái lỗi, màn hình câu hỏi, bố cục, tài sản và ngân sách thiết bị mục tiêu. |

## 4. Các lát cắt sau D1–D5

Đối chiếu Circuit: các bước sau phải đi qua shared host/LabRun, registry allowlist, activity/rubric, tuple pin, backend đánh giá, assignment và release digest tương tự pilot, nhưng cần đăng ký và kiểm tra tương thích riêng cho FL-10. Circuit 3D dùng R3F/Drei, `PhysicsStage`, camera/ánh sáng và scene qua `LabSpace`. K2 candidate `WetBenchStage` dùng lại `shared/PhysicalLabEnvironment.tsx` (phòng, sàn, lababo, tủ, bàn nâu, ánh sáng nền) và chỉ thêm apparatus hoá học, cân và hai cốc; vẫn cần QA thiết bị/hoạt cảnh và review nội dung. Không sao chép logic Circuit hoặc dựng lại phòng nền trong kit. D1/D2 đã có quyết định và code ứng viên; integration DB, D3/D4/D5 review và release vẫn là gate.

### Đề xuất thiết kế activity, UI và hoạt cảnh — chưa chốt

Các ý dưới đây phục vụ review D1–D5; **không mở phạm vi triển khai, không phải acceptance contract**, và phụ thuộc việc D4 xác nhận thí nghiệm. Model thuần ở mục 2 không thay đổi.

- Chuỗi ứng viên hiện tại: giới thiệu → an toàn → dự đoán → đọc trước (hai cốc đặt sẵn trên cân) → rót/lắc → cốc rỗng trở lại cân → đọc sau → giải thích → vận dụng → tổng kết. Mỗi bước có một hành động chính và lý do bằng chữ nếu không thể thực hiện. Việc bắt buộc giải thích dự đoán, cho sửa, gộp/tách rót và lắc, reset và quy tắc chuyển bước cần D1/D3/D4/D5 quyết định. Trình tự UI không tự chứng minh thời điểm thao tác; retry, hai tab, idempotency và khôi phục theo khả năng contract D1 được chọn.
- `deriveViewModel(activityState, modelOutput)` thuần là một phương án để 2D/3D cùng hiển thị bước, trạng thái cốc, số đọc đã được phép công bố, hành động, lý do không khả dụng và nhãn. Kiểu state, provenance output và thứ tự chuyển bước chưa được chốt; không đánh dấu test view model là sẵn sàng trước khi contract tương ứng được quyết định. Ở dự đoán không hiển thị số sau hoặc kết luận; phản hồi, hướng dẫn và thứ tự focus được thiết kế theo D3/D5.
- View model ứng viên giữ hai cốc trên cân ở cả 2D/3D và chỉ chuyển `reading: null | modelOutput` khi event đọc tương ứng đã hợp lệ. Không hiển thị số trước dự đoán hoặc số “Sau” trước khi hoạt động cho phép; view model không chứa số đo riêng từng cốc.
- Model v1 chỉ cho tổng và danh sách chất, không cho phân bố theo cốc hay quỹ đạo. Hoạt cảnh cốc nhận kết tủa và sơ đồ nguyên tử chỉ là **minh họa theo kịch bản đã duyệt**, có nhãn; không tạo số đo từng cốc hoặc tự suy ra lượng chất. Việc mở rộng model để tính phân bố là quyết định version và review riêng. Số trước/sau hiển thị là số liệu mô phỏng và chỉ lấy từ output model đáng tin cậy.
- Cân chỉ được tuyên bố là đo hai cốc khi cả hai cốc và chất thuộc phạm vi trên đĩa. Model v1 không tính số chỉ khi chỉ một cốc trên cân; UI cần nêu chưa đủ phạm vi, không tự hiện tổng hoặc kết luận. Quy tắc hiển thị khi đĩa thật sự trống (`Trống` hay `0,0 g`), độ chia và định dạng là câu hỏi mở D5; không gán `Trống` nếu vẫn có một cốc trên cân.
- Desktop ưu tiên cảnh lớn và bảng bước thu gọn; mobile dùng bảng cuộn hoặc bottom sheet không che thao tác. Giữ tên bài, thoát và chọn 2D/3D dễ tìm; 3D là ưu tiên theo định hướng sản phẩm, tải lười module 3D và dùng 2D khi người học chọn hoặc WebGL không khả dụng. Không ép hiển thị 2D trước khi tải 3D. Camera preset và nút tương đương kéo thả là đề xuất, chưa phải hành vi đã chốt.
- Rót/lắc và kết tủa dùng hoạt cảnh có thể bỏ qua, kết thúc đúng state activity; reduced motion chuyển nhanh tới state cuối với mô tả. Thời lượng và hiệu ứng chỉ là giả thuyết D5, phải thử trên thiết bị; không cập nhật React state mỗi frame. Chia sẻ GPU assets có ownership/reference counting hoặc cơ chế cache rõ ràng; giải phóng tài nguyên theo vòng đời mà không dispose đối tượng còn được scene khác dùng.
- Các mốc khởi đầu để thử, chưa phải ngưỡng nghiệm thu: rót/lắc 1,5–2,5 giây; minh họa kết tủa 1–2 giây; chuyển bảng bước 150–250 ms. Nút bỏ qua cho hoạt cảnh dài là đề xuất. Camera toàn cảnh/cận cân/cận cốc, vùng chạm 44×44 px và phóng to 200% là mục tiêu thiết kế cần kiểm tra trong D5.
- Bàn phím, focus rõ, điều khiển không phụ thuộc màu/hover, chữ có độ tương phản phù hợp, phóng to và thông báo trạng thái qua `aria-live` là yêu cầu UX cần đặc tả/kiểm chứng. Chỉ một lớp UI sở hữu thông báo để tránh lặp giữa renderer. Nội dung an toàn cần review; xác nhận đã đọc không phải bằng chứng năng lực thao tác an toàn.
- D5 cần chốt ngân sách kích thước tải, bộ nhớ và khung hình trên thiết bị mục tiêu cùng cách đo. Đề xuất FPS thấp liên tục thì gợi ý chuyển 2D, có hysteresis để không nhấp nháy; mất WebGL phải giữ state và cho 2D nếu hoạt động. D1 quyết định tính bền vững của state khi mất mạng/reload, không hứa khôi phục server trước khi có contract.

**Danh mục kiểm thử UI tham khảo, chưa sẵn sàng triển khai:**

| Mã | Hành vi cần kiểm tra | Chặn bởi |
|---|---|---|
| U-01 | Guard sai thứ tự, retry và idempotency phù hợp contract | D1 |
| U-02 | View model tất định, một hành động chính và lý do khi không khả dụng | D1, D5 |
| U-03 | Không lộ số sau/kết luận trước bước được phép; không có số đo từng cốc | D1, D3, D5 |
| U-04 | Hai cốc đặt sẵn trên cân ở cả 2D/3D; chỉ hiện tổng sau event đọc hợp lệ | D4, D5 |
| U-05 | Dự đoán sai và văn bản tự do không đổi điểm | D2, D3 |
| U-06 | Parity số đo, văn bản, an toàn và thông báo 2D/3D | D3, D5 |
| U-07 | Đổi mode giữa chừng giữ state và evidence | D1, D5 |
| U-08 | Skip animation và reduced motion về đúng state cuối | D1, D5 |
| U-09 | Keyboard, focus, không bẫy focus và thông báo aria-live | D5 |
| U-10 | WebGL context loss cho phép fallback 2D, giữ state | D1, D5 |
| U-11 | Nhãn mô phỏng/minh họa và ngôn ngữ về phạm vi cân đúng ngữ cảnh | D3, D4, D5 |
| U-12 | Hiệu năng đạt ngân sách đo trên thiết bị mục tiêu | D5 |
| U-13 | Cấu hình học sinh có dung môi dương đã duyệt; không nhập tự do | D1, D2, D4, D5 |

Khi D1–D5 được chốt cần hoàn thiện input, kỳ vọng và test harness cho từng mã; không xem các mã này thuộc M-01..07 của model thuần.

Các câu hỏi mở gồm cách hiển thị cân trống; tách hay gộp rót/lắc; lý do dự đoán bắt buộc hay không; có cần model phân bố chất theo cốc; độ chia cân và thiết bị tối thiểu; reset trong lượt hay tạo lượt mới; việc ghép số liệu ví dụ và nhãn tương ứng. Tất cả chỉ chốt sau review liên quan, không suy ra đã duyệt từ bản đề xuất.

1. Chốt activity và rubric: dự đoán được ghi nhận như bằng chứng, không chấm độ đúng; giải thích bằng lựa chọn có cấu trúc; vận dụng hệ hở là tình huống giả định nếu model chưa hỗ trợ. Review nội dung, đáp án, phản hồi và giới hạn Outcome.
2. Tích hợp server: đăng ký model và rubric có version riêng với kiểm tra tương thích fail closed; pin tuple/config/activity/rubric/release theo contract thực tế, server tính lại output, từ chối forged fields và kiểm tra quyền, replay, idempotency. Không chuyển fixture chemistry cũ thành release FL-10.
3. FE K2: hai renderer dùng cùng state/output; 3D ưu tiên, 2D là lựa chọn và fallback khi WebGL lỗi; chuyển chế độ không mất tiến trình. Xây dụng cụ chung vừa đủ cho FL-10, không tuyên bố hoàn thành FL-11–15. Giữ nguyên thay đổi Circuit đang có của người dùng.
4. Kiểm thử hành vi: forged input, trạng thái không hợp lệ, parity 2D/3D, đổi mode, reload/retry, giải thích/free text, a11y keyboard và aria-live, reduced motion, context loss, responsive và Circuit regression. Kiểm tra payload, quyền truy cập thay vì quét bundle để khẳng định giấu đáp án. Đo tải và hiệu năng trên thiết bị thực đã chọn.
5. Release: review nguồn, mapping, khoa học, an toàn, quyền và accessibility; fixture/golden/rubric được duyệt, tạo snapshot và digest thực, OWNER_SIGNOFF xác thực trên đúng digest, rồi kiểm tra launch/assignment theo quy trình. Không tự tạo approval hoặc activate bằng fixture.

## 5. Trạng thái pipeline cần đối chiếu

`lab-pipeline-phase-plan.md` hiện ghi P3.6 blocked/P3.7 gated, trong khi `sprint-status.yaml` ghi P3.6 done/P3.7 ready-for-dev và có acceptance record. Đối chiếu evidence và receipt thực tế, sau đó sửa tài liệu canonical bằng chứng xác minh; không lấy một trong hai trạng thái làm kết luận mới chỉ vì xuất hiện ở đây. Bước model thuần là fixture kỹ thuật riêng, không khẳng định mở track release hay phê duyệt nội dung.
