---
id: SPEC-lab-space-shared-ui-direction
status: proposed
date: 2026-11-14
parent: lab-space-shared-ui-spec.md
---
# Hướng refactor giao diện Lab Space dùng chung

Tài liệu này cụ thể hóa [lab-space-shared-ui-spec.md](lab-space-shared-ui-spec.md) dựa trên code FE ở `main` (`1a06299`, giống `feat/bug-resolve`). Có ba yêu cầu của nhóm:

1. Không đổi logic của Guided hay Explore, của Foundational hay Class Lab.
2. Ưu tiên tái sử dụng và không thêm code trùng.
3. Lấy form câu hỏi và toggle của **Lab hệ sinh thái** làm chuẩn. Câu hỏi bổ sung của Class Lab hoặc Explore không được đè lên section hay modal khác.

## 1. Hiện trạng (đã đọc code)

| Chủ đề | Hiện trạng | Vấn đề |
|---|---|---|
| Panel câu hỏi hệ sinh thái | `FoodWebActivity` (`fw-*`) và `EcologyToleranceActivity` (`eco-*`) có cùng cấu trúc: badge mở panel, header (môn · bước · nút đóng), dải tiến độ, tiêu đề, `fieldset` + radio native, segment. Esc bắt bằng `onKeyDown` trên panel và gọi `stopPropagation`. | Khoảng 22 rule CSS gần như trùng nhau giữa hai file. Hai bài chỉ khác nhau vài giá trị padding và màu legend. Markup cũng bị viết hai lần. |
| Panel FL-10 (Guided) | `MassConservationActivity` có `k2-panel` riêng, nút lựa chọn là `<button>`, ô chọn là `<select>`. | Khác hẳn kiểu hệ sinh thái. Nút dự đoán gửi event `PREDICTED` ngay khi bấm (đây là logic, không phải radio). |
| Panel FL-13 (Explore) | `ExploreBench` dùng `ObservationDrawer`. Lựa chọn là `<button role="radio">`, câu trả lời lưu localStorage. | `ObservationDrawer` nghe Esc trên **window**. `ExploreBench` cũng nghe Esc trên window để thả dụng cụ, nên một lần nhấn có thể làm cả hai việc (trái quy tắc Esc của spec). |
| Toggle 2D/3D | 10 activity dùng `LabRendererToggle`, nhưng ở ba vị trí khác nhau: header (portal, như Buoyancy, Density, Gene), trong panel (FL-10, Thermal, Lever), trong thân trang (Circuit, EM). Hệ sinh thái lại dùng nút chữ riêng (`fw-view-toggle`, `eco-view-toggle`) đặt ở góc scene. | Có ba vị trí và hai component cho cùng một chức năng. |
| Câu hỏi bổ sung Class Lab | Hàm `space()` trong `Lab.tsx:343` chèn **trước mọi activity**, ở đầu `.lab-space-body`: panel "Hướng dẫn của giáo viên" (có `<ol>` liệt kê `reportPrompts`), rồi `StudentClassLabAdditionalResponses` (form, liệt kê lại đúng các prompt đó). Cả hai là `.panel` (z-index 6, rộng 420 px) nằm trong luồng của body. | (a) Đẩy và chồng lên layout riêng của activity (k2-layout, nút đổi view của hệ sinh thái ở `top:128px; left`, scene). (b) Mỗi prompt hiện **hai lần**, riêng Buoyancy là ba lần vì còn `displayQuestions`. (c) Explore mở qua `ExploreLabPage`, không đi qua `space()`, nên Class Lab trên Explore không có chỗ hiện câu hỏi. Prop `ObservationDrawer.teacherSection` đã có sẵn nhưng chưa ai dùng. |

## 2. Nguyên tắc

- **Chỉ tách phần trình bày.** Component dùng chung nhận nội dung, giá trị và callback; không giữ state nghiệp vụ, không gọi API, không biết LabRun. State, checkpoint, event FL-10, log Explore và submit vẫn nằm ở activity như hiện tại.
- **Không đụng vào:** `runtime/lab-run-host.ts`, payload/evidence (`fw-evidence.ts`, `eco-evidence.ts`, event FL-10), `CheckpointHintPanel`, API `class-lab-additional-responses`, khóa localStorage `nexalab:k2-prompts:*`, `data-testid` đang có.
- **Tái sử dụng trước, tạo mới sau:** giữ `LabSpace`, `LabHeaderActionsContext`, `LabRendererToggle`, `ObservationDrawer` và `StudentClassLabAdditionalResponses`. Chỉ thêm một bộ primitive câu hỏi, được rút ra từ code hệ sinh thái (dời code, không viết mới), rồi xóa CSS trùng ở hai bài hệ sinh thái.

## 3. Thiết kế đích

### 3.1 Bộ primitive câu hỏi (`src/features/labs/shared/question-panel/`)

| Component | Lấy từ | API (chỉ trình bày) |
|---|---|---|
| `LabQuestionPanel` | `fw-question-badge` + `fw-panel` + `fw-panel-header` + `fw-progress` + `fw-heading` | `id`, `open`, `onOpenChange`, `badgeLabel`, `eyebrow`, `stepLabel?`, `progress?: {count, current}`, `heading?`, `children`, `footer?`. Esc bắt bằng `onKeyDown` + `stopPropagation`, sau đó trả focus về badge. |
| `ChoiceGroup` | `fw-choices` / `eco-choices` (`fieldset` + radio native) | `legend`, `name`, `options[{value,label}]`, `value`, `onChange`, `disabled?`, `result?` (đúng/sai cho từng lựa chọn). |
| `SegmentGroup` | `fw-segment` / `eco-segment` | Giống `ChoiceGroup`, hiển thị dạng segment ngang. |
| `TextAnswer` | Ô ghi chú của `ObservationDrawer` và textarea FL-10 | `label`, `value`, `onChange`, `maxLength`, `hint?`. |

CSS gom vào `LabQuestionPanel.css` với biến `--lqp-*` lấy giá trị từ `--fw-*`. Hai bài hệ sinh thái chỉ map biến màu. Riêng khác biệt padding/legend giữa `fw` và `eco` thì chọn một giá trị, đề xuất theo `eco`.

### 3.2 Toggle

- **2D/3D:** dùng một component duy nhất là `LabRendererToggle` (đã có nhóm `aria-pressed` và trạng thái 2D không khả dụng), luôn đưa vào **header** qua `LabHeaderActionsContext`, như Buoyancy, Density và Gene đang làm. Giao diện nút lấy theo hệ sinh thái. Hai bài hệ sinh thái bỏ `fw-view-toggle` / `eco-view-toggle` và giữ nguyên `chooseView` (vẫn tôn trọng `canRender3d`).
  *Cần nhóm chốt:* spec yêu cầu toggle ở header, còn hệ sinh thái đang đặt ở góc scene. Tài liệu này đề xuất: **vị trí theo spec, giao diện theo hệ sinh thái.**
- **Mở/gập panel:** dùng badge của `LabQuestionPanel` (chính là badge hệ sinh thái) cho Guided. Explore giữ nút "Gợi ý quan sát" nhưng dùng chung style badge.

### 3.3 Câu hỏi của giáo viên (Class Lab), không đè lên vùng khác

1. Bỏ việc chèn hai panel ở đầu body trong `Lab.tsx:343`. Thay bằng một **slot riêng**:
   - Thêm context `LabClassSectionContext` (cùng kiểu `LabHeaderActionsContext`). `space()` cung cấp node: phần hướng dẫn và form trả lời.
   - Activity nào đã dùng `LabQuestionPanel` thì render slot thành **section cuối panel**, có tiêu đề riêng "Câu hỏi của giáo viên". Section này luôn nằm sau các bước của activity, không thay chỗ chúng.
   - Explore truyền slot vào `ObservationDrawer.teacherSection` (prop đã có sẵn).
   - Activity chưa chuyển sang panel chung thì `LabSpace` render slot trong một **ngăn gập được cố định ở góc dưới trái**, có z-index riêng, không nằm trong luồng `.lab-space-body`, nên không đẩy hay che layout của activity.
2. **Mỗi prompt chỉ hiện một lần.** Khi có form trả lời (`responseClassId` và `responseResourceId`), phần hướng dẫn chỉ giữ mục tiêu và hướng dẫn, bỏ `<ol>`. Chỉ khi xem trước (không có form) mới giữ `<ol>`.
3. **Buoyancy (FL-05):** giữ `displayQuestions` và nhánh `id !== "buoyancy"` như hiện tại cho tới khi đối chiếu fixture (theo mục 3 của spec gốc).
4. **Modal/overlay:** `LabIntroOverlay` (xác nhận an toàn của Explore), session gate và lỗi WebGL vẫn ở trên cùng. Slot giáo viên bị ẩn (`hidden`/`inert`) khi intro đang mở, giống cách `ExploreBench` đang ẩn drawer bằng `!introOpen`.

### 3.4 Esc

- `ObservationDrawer`: chuyển từ listener trên window sang `onKeyDown` trên `aside` + `stopPropagation` + trả focus về nút mở, giống hệ sinh thái. Khi focus đang ở bàn, chỉ `ExploreBench` xử lý Esc (thả dụng cụ). Sửa vậy là đủ quy tắc "một hành động mỗi lần nhấn".

## 4. Thứ tự triển khai (mỗi bước là một PR nhỏ)

| # | Việc | Phạm vi | Bảo vệ hồi quy |
|---|---|---|---|
| 0 | Chạy và ghi baseline. Chụp màn hình 1440 px và 390 px của FL-21, FL-20 (tolerance), FL-10, FL-13, một Class Lab Guided có câu hỏi. | Không sửa code | `food-web-lab`, `ecology-tolerance-lab`, `fl-10-k2`, `lab-run-host`, `lesson-lab-navigation`, `buoyancy-*` |
| 1 | Rút `LabQuestionPanel` / `ChoiceGroup` / `SegmentGroup` từ hệ sinh thái. Chuyển **FoodWeb và Tolerance** sang dùng, xóa CSS trùng. | Chỉ hệ sinh thái | Hai spec hệ sinh thái giữ nguyên `data-testid`; so ảnh trước/sau gần như không khác |
| 2 | Toggle: hệ sinh thái chuyển sang `LabRendererToggle` ở header; FL-10, Thermal, Lever đưa toggle lên header | Vị trí toggle | Đổi 2D/3D không tạo run mới, giữ câu trả lời (`fl-10-k2`) |
| 3 | Slot giáo viên (`LabClassSectionContext`) + bỏ `<ol>` trùng + ngăn dự phòng ở góc dưới trái | `Lab.tsx`, `LabSpace` | **Thêm spec mới:** Class Lab Guided có câu hỏi: prompt hiện một lần, gập/mở giữ câu đang nhập, retry không nộp trùng, không che panel activity |
| 4 | FL-10 dùng vỏ `LabQuestionPanel` + `TextAnswer`/`ChoiceGroup` cho các ô chọn (`select` → radio) và giữ nút gửi event là `<button>` | FL-10 | Payload và rubric giống baseline (`fl-10-k2`) |
| 5 | `ObservationDrawer` dùng `ChoiceGroup`/`TextAnswer` và style chung, sửa Esc, nối `teacherSection` cho Explore khi mở dưới dạng Class Lab | FL-13 | **Thêm spec mới:** Explore: Esc theo focus, xác nhận an toàn bằng bàn phím, không có request nộp attempt |
| 6 | Mở rộng sang các Lab còn lại theo nhóm UI; kiểm tra một Lab chỉ quan sát (không có panel, không có toggle) | Còn lại | Spec từng Lab |

Bước 1 và 2 không chạm logic nên có thể merge sớm. Bước 3 sửa đúng chỗ gây "đè section". Bước 4 và 5 có rủi ro cao nhất về logic, nên làm sau khi primitive đã ổn định.

## 5. Không làm trong refactor này

- Đổi `promptId` theo vị trí (`prompt-1`, `prompt-2`) sang ID ổn định. Việc này thuộc [lab-kit-assets-and-class-lab-spec.md](lab-kit-assets-and-class-lab-spec.md).
- Đổi nội dung câu hỏi, rubric, điều kiện đạt, API hay schema.
- Gộp `ObservationDrawer` với `LabQuestionPanel` thành một component. Hai cái khác hành vi (Explore không khóa bước, không nộp), nên chỉ dùng chung primitive và style.

## 6. Trạng thái triển khai (FE nhánh `feat/lab-space-shared-ui`, 14/11/2026)

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| 0 Baseline | Xong | Trên `main` sạch có 27 passed, 9 failed, 1 skipped (navigation, FL-20, FL-25, lab-run-host). Các lỗi này có sẵn. Sau khi pull phải chạy `npm ci`, vì `@nexalab/sim` 1.7.0 có export `wet-bench`. |
| 1 Panel câu hỏi dùng chung | Xong | `shared/question-panel/LabQuestionPanel.tsx` (gồm `LabQuestionPanel` và `ChoiceGroup`) cùng file CSS. FL-21, FL-20 và FL-25 đã chuyển sang và bỏ CSS trùng (khoảng 100 dòng). Giữ class `${prefix}-panel/-step/-question-badge` và mọi `data-testid`. Thêm hành vi: mở/đóng bằng tay thì focus chuyển sang nút đóng/badge. |
| 2 Toggle + bố cục A | Xong (user chốt 2026-11-15) | Bố cục A cho mọi Lab: header góc trên trái gồm ← Quay về, tên bài, 3D/2D (`LabRendererToggle`, style riêng `shared/LabRendererToggle.css`, cao 44px), ↻ Làm lại (`LabSpace` prop `tools`); cảnh phủ kín phía sau; panel câu hỏi bên phải; kết quả, giải thích và gợi ý sau khi nộp là phần cuối của panel (`LabSpace` prop `result` + `useLabPanelSections`, cuộn tới bằng `revealInPanel`); thao tác cảnh và thanh Gợi ý/Nộp ở dưới trái; ghi chú cảnh dưới header. `LabHeaderSlot` thay mọi `createPortal(toggle, headerActions)`. Hệ sinh thái bỏ link "Xem sơ đồ 2D", thẻ biểu đồ hạ xuống dưới header. `FloatingCheckpointHint` → `CheckpointResultSection` trong panel. |
| 3 Câu hỏi giáo viên | Xong | `shared/LabClassSection.tsx`. Panel chung và `ObservationDrawer` nhận phần này. Activity chưa dùng panel chung thì hiện trong ngăn gập được dưới header, nút mở lại nằm ở header. Bỏ `<ol>` trùng khi đã có form trả lời. Buoyancy giữ nguyên. |
| 4 FL-10, FL-06, FL-07 | Xong | Ba Lab dùng `LabQuestionPanel` và chuyển các câu hỏi sang radio: FL-10 có 6 câu (ô dropdown và nút giải thích), FL-06 có 7 câu (chiều quay, bộ đề, cấu hình, lợi về lực, đổi hướng), FL-07 có 3 câu. Giữ dropdown cho giá trị số dài (lực 0–5 N, vị trí lỗ) và giữ nút gửi event (dự đoán FL-10, "Ghi …"). Nút 2D/3D của ba Lab đưa lên header (giống Buoyancy, Density, Gene). Số đo và panel trên điện thoại được đặt phía trên nút "Gợi ý". `explanationAttempts` của FL-10 không còn ghi trùng khi bấm lại cùng một lựa chọn; C4 chỉ chấm lựa chọn cuối nên kết quả chấm không đổi. Khoảng cách: panel chung quy định một nhịp (12px giữa các khối, 8px giữa nhãn và ô nhập/lựa chọn) qua `.lqp-section` và reset margin trong `.lqp-panel`; margin riêng cũ của `.k2-/.k5-/.thermal-panel` và khoảng 16px/30px của phần câu hỏi giáo viên (`.field`) đã gỡ. Đo lại bằng DOM: FL-10, FL-06, FL-07 và FL-21 đều 12px/8px. Thêm `.lqp-tool` (nút phụ, theo nút công cụ hệ sinh thái), `.lqp-chip`/`.lqp-chips` (thẻ gỡ được) cho FL-06, và một kiểu `summary` chung có mũi tên 44px cho mọi `details` trong panel (FL-07 trước đây không có mũi tên). Vùng mô phỏng chiếm cả Lab Space (không có nút toàn màn hình, theo yêu cầu): FL-06 `.k5-scene` và FL-07 `.thermal-stage` bỏ `margin-right` và phủ kín; bản vẽ 2D chỉ chừa chỗ cho header, panel câu hỏi và nút dưới bằng `inset`/`padding`; Gen – protein 2D (`.k7-2d-panel`) bỏ khung thẻ, phủ kín 1440×900 và 390×844. |
| 5 Explore | Một phần | Esc của `ObservationDrawer` chỉ tác dụng khi focus nằm trong ngăn, rồi trả focus về nút mở. `ObservationDrawer` đã nhận phần câu hỏi giáo viên nếu có, nhưng `ExploreLabPage` chưa truyền dữ liệu Class Lab, vì Explore chưa có luồng Class Lab. |
| 6 Lab còn lại | Xong (trừ Explore/hoá học cũ) | `K3Hud` (Khối lượng riêng, Lực đẩy) và `K7Hud` (Gen) dựng trên `LabQuestionPanel` + `StationTabs`; Mắt (eye-optics), Mạch điện bóng đèn (`#bulb-questions`, `ChoiceGroup`) và Mạch điện cũ (`#circuit-controls`) cũng chuyển; thẻ thử thách/verdict của mạch cũ chuyển sang trái dưới header. Gỡ CSS HUD cũ (`.k3-hud`, `.k7-hud`, `.eye-optics-hud`, `.bulb-content`, `.circuit-controls` định vị) và quy tắc ẩn panel khi `.lab-aside` mở. Còn lại: FL-13 Explore giữ `ObservationDrawer` (cùng vùng phải) và bài hoá học kiểu cũ. |

Test mới: `tests/lab-space-class-section.spec.ts` (2 ca), `tests/explore-lab-space.spec.ts` (1 ca; với `ObservationDrawer` cũ thì ca này fail) và `tests/fl07-thermal-panel.spec.ts` (1 ca, chạy trên trang fixture dev). Đã cập nhật `fl-10-k2`, `fl-06-k5` và `event-lab-hints` từ `selectOption` sang radio.

Sau bước 4: lint, build và regression 64/64 qua. Bộ Playwright liên quan có 40 passed và 7 failed; cả 7 lỗi đều thuộc danh sách lỗi có sẵn của baseline (navigation 89/133, lab-run-host 60/78/234×2, FL-25 180).
