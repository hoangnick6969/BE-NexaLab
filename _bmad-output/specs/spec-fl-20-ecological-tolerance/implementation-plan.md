# FL-20 implementation plan

Nhánh: `feat/fl-20-ecological-tolerance` ở cả BE-NexaLab và FE-NexaLab, tạo từ `main` ngày 2026-10-31 (BE `0ac700a`, FE `0a8cf73`).

**Điều kiện bắt đầu build:** owner quyết định SPEC D-1 (đã quyết 2026-10-31). Dữ liệu test là synthetic, nằm trong PostgreSQL cô lập (loopback, `NEXALAB_ISOLATED_DATABASE_URL`) và gắn nhãn TEST FIXTURE ONLY. Không ghi vào Supabase dùng chung, không chạy migration/seed lên DB từ xa.

## 1. Ticket và thứ tự

| Ticket | Nội dung | Repo | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FL20-T0 | Owner chốt D-1, D-2, D-6, D-7; curriculum reviewer xử lý D-3, D-4, D-5 | Owner, curriculum | — | D-1 đã quyết; còn D-2…D-7 |
| FL20-T1 | Review blueprint (`lab-definition.md`) và sửa theo góp ý | Docs | — | review |
| FL20-T2 | Model `ecology-tolerance@1.0.0` + golden tests; bump `@nexalab/sim` lên 1.3.0 và vendor sang FE | BE (sim) | T1 | done |
| FL20-T3 | Activity trong `checkpoint-activities.ts`; đăng ký model trong `sim-packs.ts`; challenge params; test integration cô lập | BE | T2 | done |
| FL20-T4 | FE: entry `ecology-tolerance` trong `lab-run-host.ts` và `checkpoint-views.tsx`; evidence/phase machine | FE | T2 | done |
| FL20-T5 | FE: cảnh ao cá + đồ thị giới hạn (SVG) | FE | T4 | done |
| FL20-T6 | FE: sa bàn quần thể, bảng mật độ, tháp tuổi HUD | FE | T4 | done |
| FL20-T7 | FE: panel activity, copy, accessibility, reduced-motion, khám phá vô sinh/hữu sinh | FE | T5, T6 | done |
| FL20-T8 | Playwright (mock) + 1 lượt thật FE → BE → DB cô lập | FE + BE | T3, T7 | done |
| FL20-T9 | QA: điện thoại 360 px, bàn phím, screen reader, máy trường | QA | T8 | in-progress (360/390/1280/1440 px, sáng/tối; còn VoiceOver, máy trường) |
| FL20-T10 | Release: migration Lab/Subject/Challenge + script release qua admin API, bind 2 Lesson | Owner | T9 + owner duyệt | blocked |

T2 và T1 có thể chạy song song khi owner cho phép D-1. T5 và T6 có thể làm song song.

## 2. BE

### FL20-T2 — model

- `packages/sim/index.ts`:
  - thêm `ecologyToleranceSchema` (Zod strict, discriminated union theo `setup`; `valueDeciC` là `z.number().int().min(0).max(500)`);
  - thêm bảng dữ liệu cố định của §3.1 blueprint (hằng `as const`, có trường `source`: block SGK hoặc `ILLUSTRATIVE`);
  - thêm hàm `ecologyTolerance(raw)` theo quy tắc §3.4;
  - phân số dùng số nguyên và hàm `gcd`, không dùng float.
- `packages/sim/sim.test.ts`: thêm EC-01…EC-11 và EC-X1…X3.
- `VERSION` của engine giữ `1.0.0`, như FL-25, để các tuple đã ghim không đổi. Bump version gói lên 1.3.0, đóng tarball và thay `FE-NexaLab/vendor/nexalab-sim-1.2.0.tgz` bằng `nexalab-sim-1.3.0.tgz`. Lockfile FE chỉ đổi dòng của gói này.

### FL20-T3 — activity, đăng ký, integration

- `src/modules/labs/application/checkpoint-activities.ts`: thêm `ECOLOGY_TOLERANCE_ACTIVITY_KEY`, `ECOLOGY_TOLERANCE_RUBRIC` và entry gồm:
  - submission schema: union theo `id`, vì `DENSITY.prediction` là object;
  - danh sách required state;
  - evaluator theo §5 blueprint;
  - `rendererKey: "ecology-tolerance"`.
- `sim-packs.ts`: thêm `"ecology-tolerance@1.0.0"` vào `MODEL_REGISTRY` với `labId: "ecology-tolerance"`, `observationOnly: true` và `requiredSemanticIds: ["pond", "thermometer", "tolerance-graph", "population-plot", "age-pyramid"]`.
- `lesson-content.ts`: `CHALLENGE_PARAMETERS["ecology-tolerance"]` rỗng, giống `em-induction`.
- `simulation-versions.ts`: golden cases của pack là EC-01…EC-10.
- Test mới `src/modules/labs/interface/ecology-tolerance.integration.test.ts`, sao theo `em-induction.integration.test.ts`:
  - launch → nộp đúng → PASS 7/7, lưu attempt, replay khớp;
  - sai `DENSITY` → NEEDS_PRACTICE với `calculation:DENSITY`;
  - state lệch → 400 và không có attempt;
  - trùng idempotency key; người ngoài lớp nhận 404;
  - đổi tuple sau khi launch thì vẫn chấm theo tuple cũ.
- Test rubric trong `lab-run.test.ts`: các trường hợp ở blueprint §6 (phần activity).
- Lệnh: `npm run lint`, `npm test`, `npm run build`, `npm run check:layers` và `npm run test:integration` trên Postgres cô lập (cluster scratchpad cổng 55432). Route manifest (`npx tsx scripts/route-manifest.ts src`) phải giống `main`.

## 3. FE

### Cấu trúc file mới

```text
src/features/labs/biology/ecology/tolerance/
  EcologyToleranceActivity.tsx   panel, phase machine, khám phá tự do (gồm phân loại vô sinh/hữu sinh, không chấm)
  EcologyToleranceActivity.css
  eco-evidence.ts                default evidence, ready(), draft
  PondScene.tsx                  ao cá cắt ngang, nhiệt kế, cá rô phi (SVG)
  ToleranceGraph.tsx             đồ thị giới hạn + đồ thị so sánh 3 loài và dải nhiệt độ địa phương
  PopulationViews.tsx            sa bàn ô ruộng bắp cải + Bảng 42.1; tháp tuổi
```

Cập nhật thêm:
- `runtime/lab-run-host.ts`: thêm entry `"ecology-tolerance": { labId: "ecology-tolerance", modelRefs: ["ecology-tolerance@1.0.0"] }`.
- `runtime/checkpoint-views.tsx`: thêm view và `describeResult`, ví dụ "Nước 44,0 °C: cá rô phi không tồn tại được, dự đoán đúng".
- `lab-info.ts` và `LabLibrary.tsx`: thêm thẻ Lab. Bài học từ FL-25: thiếu thẻ thì học sinh không thấy Lab. Chỉ thêm khi đến T10.
- README: `features/labs/README.md` và `biology/ecology/README.md`.

### FL20-T5 — cảnh ao cá và đồ thị

- Ao cắt ngang: mặt nước, đáy bùn, vài cây thuỷ sinh, 3 con cá rô phi vẽ bằng path đơn giản.
- Màu nước nội suy theo nhiệt độ, từ xanh lạnh sang ấm, qua token CSS. Nhiệt độ luôn có chữ đi kèm, không chỉ dựa vào màu.
- Trạng thái cá đến từ observation preview (`@nexalab/sim`):
  - WITHIN: cá bơi chậm theo quỹ đạo cố định, dùng CSS `transform`;
  - ngoài giới hạn: cá mờ thành đường viền nét đứt, đứng yên, có nhãn "Không tồn tại được ở nhiệt độ này". Không có hình ảnh cá chết.
- Nhiệt kế dọc bên phải cho biết giá trị; slider native điều khiển giá trị.
- Đồ thị:
  - trục x từ 0 đến 50 °C;
  - đường cong minh hoạ dạng chuông giữa min và max (ghi "minh hoạ, không có số đo"), tính một lần;
  - hai vạch dọc tại 5,6 °C và 42 °C, chỉ hiện sau checkpoint `LIMITS` để không lộ đáp án;
  - con trỏ giá trị hiện tại.
- Ở checkpoint `IMPORT`, đồ thị đổi sang 3 dải ngang (cá A, B, C) và một dải nền cho phạm vi nhiệt độ nước ở địa phương. Mỗi dải có nhãn chữ, không phân biệt chỉ bằng màu.
- Không lộ đáp án trước khi dự đoán: ở `T_INSIDE` và `T_ABOVE`, nút "Đặt 30,0 °C" / "Đặt 44,0 °C" đặt sẵn giá trị. Trạng thái cá chỉ hiện sau khi học sinh chọn dự đoán và bấm "Quan sát".

### FL20-T6 — quần thể

- Sa bàn ô ruộng bắp cải nhìn từ trên xuống, có lưới ô và ghi chú diện tích. Hình vẽ chỉ minh hoạ, không vẽ đủ 3 000 cây; ghi rõ "hình minh hoạ, số liệu theo Bảng 42.1".
- Bảng 42.1 rút gọn gồm 3 dòng; dòng bắp cải được tô nổi.
- Ô nhập mật độ: `inputmode="decimal"`, kèm select đơn vị (cây/ha, cây/m², con/m³). Sau khi nộp checkpoint, hiện phép tính `3 000 : 750 = 4 cây/m²` do server/preview tính.
- Tháp tuổi: 3 thanh ngang xếp chồng (trước sinh sản ở dưới), chiều rộng tỉ lệ với số lượng, có số và bảng ẩn cho screen reader. Có thể xem P1/P2/P3 trong phần khám phá; checkpoint dùng P3.

### FL20-T7 — panel và accessibility

- Phase machine giống FL-25: dự đoán hoặc trả lời → quan sát → bước tiếp → giải thích → sẵn sàng nộp. Hiển thị "Bước n/7".
- Khám phá tự do (slider bất kỳ, xem P1–P3, chọn dân số khác) mở sau khi xong checkpoint, giống FL-25. Không ảnh hưởng evidence.
- Hallmark Floor, phạm vi app screen, giữ hệ token của Lab Space:
  - không `transition: all`;
  - chỉ animate `transform`/`opacity`;
  - `:focus-visible` cho mọi control;
  - không nhãn chữ hoa giãn chữ, không chuỗi meta nối dấu chấm giữa;
  - icon lấy từ `lucide-react`.

  Chạy `sloplint --scope app` trước khi bàn giao.
- Vùng chạm ≥ 44×44 px; riêng radio dùng kích thước 18 px như sửa lỗi ở FL-25. Tương phản ≥ 4,5:1. Không cuộn ngang ở 360/390/768/1366 px. Trên điện thoại, cảnh ở trên, panel là bottom sheet.
- Copy viết bằng `defineText`, vi chính và en phụ. Viết lại sạch, không chép text OCR từ DB. Ghi chú giới hạn model luôn hiển thị.

## 4. Kiểm chứng

### FL20-T8

- FE: `npm run lint`, `npm run build`. Spec mới `tests/ecology-tolerance-lab.spec.ts` (API mock) kiểm:
  - đi hết 7 bước bằng bàn phím;
  - F5 khôi phục draft;
  - payload nộp đúng evidence JSON;
  - hiển thị kết quả server;
  - "4,0" được chấp nhận;
  - layout điện thoại.
- Các spec lab hiện có (`circuit-lab`, `em-induction-lab`, `lab-run-host`) phải pass không sửa.
- Một lượt thật FE → BE → Postgres cô lập: PASS 7/7, kiểm tra Attempt và LabRun trong DB. Ghi rõ là Chromium desktop.

### FL20-T9

- Đo thời gian tới tương tác và số node SVG; mục tiêu ≤ 1 500 node trên cảnh.
- Kiểm tra bằng VoiceOver.
- Kiểm tra ở 360 px.
- Máy trường nếu có.

## 5. Release (FL20-T10, chỉ khi owner duyệt)

Theo đúng quy trình FL-25:
1. Migration `<timestamp>_fl20_ecology_tolerance_lab`: Subject `biology` (on conflict do nothing), Lab `ecology-tolerance` (grade 8, topicCode `KHTN8-CH08`, draft, CLASS_PRIVATE, `ecology-tolerance@1.0.0`) và Challenge `eco_001`.
2. Owner tự chạy `prisma migrate deploy` lên DB dùng chung.
3. `scripts/release-ecology-tolerance.mjs`, chỉ dùng admin API, chạy được nhiều lần không đổi kết quả. Script bind 2 Lesson (D-2), outcome `KHTN8-B41-O03` và `KHTN8-B42-O02`; publish chỉ khi `FL20_PUBLISH=true` và owner yêu cầu.
4. Thêm thẻ Lab vào `lab-info.ts`.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Số liệu minh hoạ bị hiểu là số liệu SGK | Nhãn "minh hoạ" cố định cạnh dữ liệu; trường `source` trong model; reviewer D-4 |
| Lộ đáp án qua đồ thị hoặc màu nước trước khi dự đoán | Vạch giới hạn chỉ hiện sau `LIMITS`; trạng thái cá chỉ hiện sau "Quan sát"; test Playwright kiểm DOM trước khi quan sát |
| Hình ảnh sinh vật chết gây khó chịu | Không vẽ cá chết; chỉ đường viền mờ kèm chữ |
| Nhập số thập phân kiểu Việt ("4,0") bị chấm sai | Chấp nhận cả `,` và `.`; so sánh phân số chính xác; test riêng |
| Copy OCR lỗi lọt vào Lab | Copy viết tay; reviewer đọc lại |
| Vượt giới hạn ≤ 2 track, lệch roadmap (B1, B2) | Chỉ build khi owner cho phép D-1 |
