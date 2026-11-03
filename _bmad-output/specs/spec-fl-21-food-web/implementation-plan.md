# FL-21 implementation plan

Nhánh: `feat/fl-21-food-web` ở cả BE-NexaLab và FE-NexaLab, tạo từ `main` ngày 2026-11-02 (BE `e424524`, FE `ab7776b`).

Nguyên tắc dữ liệu:
- Test chỉ dùng dữ liệu synthetic trên PostgreSQL cô lập (loopback, `NEXALAB_ISOLATED_DATABASE_URL`).
- Không chạy migration hay seed lên DB từ xa; migration Supabase do owner tự chạy.

## 1. Ticket và thứ tự

| Ticket | Nội dung | Repo | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FL21-T0 | Owner chốt D-1, D-2, D-6; reviewer xử lý D-3, D-4, D-5 | Owner | — | open |
| FL21-T1 | Review blueprint | Docs | — | draft |
| FL21-T2 | Model `food-web@1.0.0` (`packages/sim/food-web.ts`) + golden FW-01…FW-11, FW-X1…X3; bump sim, vendor tarball sang FE | BE (sim) | T1 | backlog |
| FL21-T3 | Activity `food-web-checkpoints` v1 trong `checkpoint-activities.ts`; đăng ký evaluator (`evaluators/registry.ts`) và model (`sim-packs.ts`); challenge params; test activity + integration cô lập | BE | T2 | backlog |
| FL21-T4 | FE: entry `food-web` trong `runtime/activity-renderers.tsx` và `checkpoint-views.tsx`; evidence/phase machine | FE | T2 | backlog |
| FL21-T5 | FE: sa bàn lưới thức ăn SVG (nút loài, mũi tên, dựng chuỗi, loại bỏ loài) | FE | T4 | backlog |
| FL21-T6 | FE: tháp năng lượng, bảng nguyên nhân, panel, khám phá tự do, a11y, reduced-motion | FE | T5 | backlog |
| FL21-T7 | Playwright (mock) + 1 lượt thật FE → BE → DB cô lập | FE + BE | T3, T6 | backlog |
| FL21-T8 | QA: 360/390/1280/1440 px, sáng/tối, bàn phím | QA | T7 | backlog |
| FL21-T9 | Release: migration Lab `food-web` (khtn, lớp 8, `KHTN8-L44`) + challenge `fw_001`; `scripts/release-food-web.mjs`; diễn tập trên DB cô lập; thẻ thư viện | Owner | T8 + owner duyệt | blocked |

## 2. BE

- `packages/sim/food-web.ts`, file mới, theo mẫu `ecology-tolerance.ts`:
  - dữ liệu W1 hằng `as const`, mỗi mục có trường `source: "ILLUSTRATIVE"` hoặc block SGK;
  - Zod strict schema, discriminated union theo `setup`;
  - hàm `foodWeb(raw)`, phân số nguyên.
  - Export từ `index.ts`, thêm file vào `files` của package. Bump version gói theo bản đang có trên `main` (1.4.0 → 1.5.0); engine `VERSION` giữ nguyên.
- `checkpoint-activities.ts`:
  - `FOOD_WEB_ACTIVITY_KEY`, `FOOD_WEB_RUBRIC`;
  - submission schema: `prediction` là union gồm map vai trò, `"CHAIN"`, `{value}`, lựa chọn hiệu ứng, và danh sách nguyên nhân đã sắp xếp;
  - `CHAIN` không so state với state bắt buộc, chỉ kiểm schema; các checkpoint khác so state bắt buộc như FL-20.
- `evaluators/registry.ts`: `checkpointEvaluator(FOOD_WEB_RUBRIC)`; cập nhật danh sách rubric trong `registry.test.ts`.
- `sim-packs.ts`:
  - model `food-web@1.0.0`, `labId: "food-web"`, `observationOnly`;
  - outputs gồm `setup`, `valid`, `length`, `roles`, `levelsKJ`, `effects`, `causes`;
  - `requiredSemanticIds: ["food-web", "energy-pyramid", "causes"]`.
- `lesson-content.ts`: `CHALLENGE_PARAMETERS["food-web"]` rỗng.
- Test:
  - `packages/sim/food-web.test.ts`;
  - `application/food-web-activity.test.ts`;
  - `interface/food-web.integration.test.ts` (mẫu `ecology-tolerance.integration.test.ts`).
- Lệnh kiểm tra:
  - `npm run lint`, `npm test` (với isolated URL `nexalab_pinning_test` như CI), `npm run build`, `npm run check:layers`;
  - route manifest không đổi.

## 3. FE

```text
src/features/labs/biology/ecology/food-web/
  FoodWebActivity.tsx      panel, phase machine, khám phá tự do
  FoodWebActivity.css      token hoá; dùng lại bố cục panel/dock của FL-20
  fw-evidence.ts           default evidence, ready(), phase
  FoodWebScene.tsx         lưới SVG: nút loài (button), mũi tên thức ăn → kẻ ăn, trạng thái loại bỏ, hiệu ứng ↑ ↓
  EnergyPyramid.tsx        4 bậc, kJ và phần mất dưới dạng nhiệt; nhãn "quy ước minh hoạ 10 %"
  CausesBoard.tsx          6 hoạt động; sau khi kiểm tra hiện loài bị ảnh hưởng
```

- Bố cục giống FL-20: cảnh 2D bên trái, panel câu hỏi bên phải (bottom sheet ở ≤ 720 px), dock hành động.
- Thêm `.fw-activity` vào quy tắc khung kết quả trong `LabSpace.css`. Bài học từ FL-20: thiếu dòng này thì khung kết quả bị panel câu hỏi che.
- Vị trí nút loài đặt cố định theo bậc dinh dưỡng (hàng dưới là sinh vật sản xuất, hàng trên cùng là đại bàng); sinh vật phân giải đặt ở cạnh, có đường nét đứt nhận xác từ mọi bậc.
- Dựng chuỗi:
  - bấm loài để thêm vào chuỗi;
  - dòng chữ hiển thị chuỗi hiện tại;
  - có nút "Bỏ mắt xích cuối" và "Xoá chuỗi";
  - bấm "Kiểm tra" thì chuỗi bị khoá. Nếu chuỗi đứt, mũi tên bị thiếu được tô và có chữ giải thích.
- Hallmark Floor (scope app), `sloplint --scope app` 0 FAIL.
- Thẻ thư viện thêm ở T9 (`lab-info.ts`, icon gợi ý `Network` của lucide).

## 4. Kiểm chứng

- `tests/food-web-lab.spec.ts` (mock) kiểm:
  - đi hết bằng bàn phím;
  - F5 khôi phục;
  - payload chỉ gồm checkpoints và explanation;
  - chuỗi đứt bị chấm sai ở phía server (mock);
  - layout điện thoại;
  - khung kết quả không bị che (`elementFromPoint`).
- Lượt thật trên DB cô lập: một câu sai cố ý, server chấm 6/7.
- Ảnh chụp 1440, 1280 (tối) và 390 px; không lỗi trang, không cuộn ngang.

## 5. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Lưới minh hoạ bị hiểu là số liệu SGK | Nhãn "minh hoạ" ngay trên sa bàn và trong giới hạn mô hình |
| Học sinh hiểu "chỉ hiệu ứng trực tiếp" là toàn bộ thực tế | Câu giới hạn mô hình nói rõ hiệu ứng lan rộng và thay đổi theo thời gian |
| Lộ đáp án `HUNT`/`DEFOREST` trước khi dự đoán | Chỉ áp dụng loại bỏ loài sau khi chọn dự đoán; trước đó sa bàn ở trạng thái đầy đủ |
| Release gắn được một chủ đề | Gắn Bài 44; ghi rõ trong bằng chứng OWNER_SIGNOFF |
| Mũi tên ngược chiều quy ước | Theo SGK: mũi tên từ thức ăn tới sinh vật ăn nó; có chú thích |
