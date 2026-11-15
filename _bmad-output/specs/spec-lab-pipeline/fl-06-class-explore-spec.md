# FL-06 Class Explore: giao bàn đòn bẩy cho lớp (D1-3.1)

| | |
|---|---|
| Trạng thái | **Đã duyệt** (owner, 2026-11-16): Q-1 → Q-5 theo đề xuất |
| Bước | D1-3.1 (INC-3), mở sau K2-2.8 |
| Nguồn | [P0 C3](lab-mode-foundation-p0-spec.md#c3-class-lab-explore-giáo-viên-customize-foundational-lab-trong-allow-list-của-bàn) · [FL-06 Explore §8](fl-06-mechanics-bench-explore-spec.md#8-class-explore) · [tracking](lab-kit-delivery-tracking.md) · pilot K2 bước C (K2-2.1 → K2-2.8) |
| Repo | BE `feat/dev1-fl06-class-explore`, FE cùng tên nhánh |

## 1. Mục tiêu

Giáo viên giao bàn đòn bẩy FL-06 cho lớp theo C3, giống FL-13: chọn trong mẫu (`classTemplates`), xem trước, giao bài; học sinh mở theo `assignmentId`, làm trên bàn đã ghim, nộp số đo và lời giải thích; giáo viên nhận xét. Không tạo `LabRun`, `Attempt` hay `Progress`.

Ngoài phạm vi: tự chấm từ thao tác, loại yêu cầu `choose`/`identify`, phát hành FL-06 Explore (D1-3.3, chờ D-5).

## 2. Hiện trạng: C3 đang viết riêng cho đo pH

Pilot K2 chạy thật, nhưng phần "chung" của C3 vẫn gắn với bàn ướt. Bàn thứ hai không cắm vào được nếu không sửa:

| Lớp | Chỗ gắn với FL-13 |
|---|---|
| BE `class-explore-contract.ts` | `selection` dùng `classSelectionSchema` của bàn ướt (`reagents`, `promptId`); yêu cầu `measure` chỉ nhận `measurement: "ph_meter"`, `unit: "tenthsPh"`; bài nộp `measures[].tenthsPh` (0–140) |
| BE `explore-labs.ts` | `ClassDerivation.requirements` là `EffectiveRequirement` của bàn ướt |
| FE `class-explore.ts` | kiểu yêu cầu và bài nộp lặp lại `tenthsPh` |
| FE `ExploreAssignModal.tsx` | form giáo viên dựng từ `reagentGroups`; nhãn "pH của …" |
| FE `ExploreBoard.tsx` | tên mẫu qua `reagentById`, số đo qua `formatTenthsPh` |
| FE `ExploreClassAssignment.tsx` | ô nhập pH cho học sinh |

Bài nộp lưu ở cột `Json` (`ClassExploreSubmission.answers`), snapshot ở `Assignment.exploreSnapshot` (`Json`). **Mở rộng không cần migration.**

## 3. Đề xuất A: tổng quát hoá C3 (giữ tương thích FL-13)

Một PR riêng, K2 review, vì sửa code pilot của K2.

**A.1 Lựa chọn do bàn sở hữu.** BE không parse `selection` bằng schema bàn ướt nữa: `exploreResourceInputSchema.selection` là object bất kỳ (giới hạn kích thước), bàn kiểm trong `deriveClass`. Mọi `selection` FL-13 đã lưu vẫn hợp lệ vì bàn ướt kiểm như cũ.

**A.2 Yêu cầu `measure` có đơn vị theo bàn.** Hợp nhất kiểu yêu cầu thành một bảng đơn vị khai báo ở sim (`explore/requirements.ts`):

| `unit` | Bàn | Khoảng | Hiển thị |
|---|---|---|---|
| `tenthsPh` | bàn ướt (đang có) | 0–140 | `7,0` |
| `milliNewtonMetres` | bàn cơ (mới) | 0–100 000 | `0,150 N·m` |

Yêu cầu: `{ kind: "measure", itemId, measurement, unit }` với `measurement`/`unit` thuộc bảng trên. Snapshot FL-13 cũ (`ph_meter` + `tenthsPh`) parse không đổi.

**A.3 Bài nộp `value` + đọc được dạng cũ.** Bài nộp mới: `measures: [{ itemId, value }]`, khoảng theo `unit` của yêu cầu. BE vẫn nhận `{ itemId, tenthsPh }` (client cũ trong lúc deploy) và chuẩn hoá thành `value` trước khi kiểm; khi đọc bài đã lưu, `tenthsPh` cũ hiểu là `value`. Không viết lại dữ liệu cũ.

**A.4 FE theo registry.** Mỗi entry Explore registry có thêm phần `classExplore` (tùy chọn, tải lười):
- `TemplateForm`: form giáo viên chọn trong mẫu, trả `selection`;
- `requirementLabel(item, config)`: "pH của HCl", "Moment bên trái khi cân bằng";
- `measureInput(unit)`: cách nhập và hiển thị theo bảng đơn vị A.2;
- `loadClassPage` (đã có cho bàn ướt).

`ExploreAssignModal`, `ExploreBoard`, `ExploreClassAssignment` chỉ gọi registry; phần pH chuyển vào entry bàn ướt. Giao diện FL-13 giữ nguyên từng chữ (Playwright `class-explore` 9 ca là thước đo).

## 4. Đề xuất B: mẫu lớp của FL-06

**B.1 Schema mẫu (sim `mechanics/class-template.ts`)**

```ts
leverClassTemplate = {
  id, titleVi,
  loadPresets: [{ id, labelVi, attachments: LeverAttachment[] }],   // allow-list, giáo viên chọn đúng 1
  weightOptions: number[][],      // các bộ quả nặng giáo viên được chọn (mỗi bộ ⊆ weights.availableMilliNewtons)
  gauge: "teacher_choice" | "on" | "off",
  momentTable: "teacher_choice" | "on" | "off",
  promptChoices: [{ promptId }],  // id trong pedagogy.observationPrompts
  requirements: { measure: "balance_moments" | null, explain: boolean },
}
selection = { templateId, loadPresetId, weightOptionIndex, gauge?: boolean, momentTable?: boolean, promptId }
```

**B.2 Mẫu đầu tiên `balance-the-lever` ("Làm thanh đòn cân bằng")**
- 4 tải ban đầu: 1 N ở −100 mm; 2 N ở 150 mm; 0,5 N ở −250 mm; 2 N ở −200 mm (ba tải đầu trùng preset C1–C3 của Guided để giáo viên quen).
- Bộ quả nặng: `[500, 1000, 2000]` hoặc `[1000]`.
- Lực kế và bảng moment: giáo viên bật/tắt. Tắt bảng moment thì học sinh phải tự tính F × d từ thước và nhãn lực.
- Câu hỏi: `balance` (đã có) hoặc câu mới `explain-balance` ("Vì sao thanh nằm ngang? Dùng moment hai bên để giải thích").
- Yêu cầu: đo **moment bên trái** và **moment bên phải** khi thanh đã nằm ngang (`itemId` `moment-left`, `moment-right`, `milliNewtonMetres`), cộng một lời giải thích.

**B.3 `deriveLeverEffectiveConfig` và kiểm strict**
- Lựa chọn phải thuộc allow-list; `gauge`/`momentTable` chỉ được gửi khi mẫu để `teacher_choice`.
- Config hiệu lực: `initialAttachments` = tải đã chọn, `weights.availableMilliNewtons` = bộ đã chọn, bỏ `spring_gauge` khỏi `enabledApparatus` khi tắt lực kế, bỏ `moment_table` khỏi `measurements` khi tắt bảng, chỉ giữ câu hỏi đã chọn, bỏ `classTemplates`.
- Strict (cảnh báo thành lỗi):
  - `balance_moments` cần `ruler` và `force_labels`;
  - **tải đã chọn phải cân bằng được** bằng bộ quả nặng (và lực kế nếu bật) trong giới hạn `maxCount` và 11 lỗ. Sim tìm thử mọi cách treo (không gian nhỏ: 11 lỗ, ≤ 4 quả); không có cách nào thì từ chối lựa chọn, giống "phản ứng không thể xảy ra" ở bàn ướt. Ví dụ: tải 0,5 N ở −250 mm (moment 0,125 N·m) với bộ chỉ có quả 1 N và lực kế tắt thì không cân bằng được (quả 1 N ở lỗ cách 50 mm chỉ cho bội của 0,05 N·m), nên bị từ chối.

**B.4 Phía giáo viên khi xem bài**: hiện kèm moment của tải ban đầu (F × d, tính từ snapshot) làm số tham chiếu. Giáo viên vẫn nhận xét thủ công (C3.3).

## 5. Phụ thuộc D-5

`loadPinnedExploreLab` chỉ đọc Lab Explore **đã phát hành**. FL-06 có Guided nên chưa phát hành Explore được (chờ D-5 / O-3.1). Vì vậy:
- D1-3.1 giao code + test (sim golden, BE unit, Playwright mock API), **không** dùng được với lớp thật cho tới D1-3.3.
- Không ghi Supabase. Không phát hành.

## 6. Thứ tự và phiên bản

1. PR A (BE + FE): tổng quát hoá C3, không đổi hành vi FL-13. K2 review.
2. PR B (BE + FE): mẫu FL-06, `deriveLeverEffectiveConfig`, entry `classExplore` của bàn cơ, `configVersion` FL-06 lên 2.
3. Sim: **1.14.0** (1.12.0 đã dùng, Dev 2 giữ 1.13.0 cho FL-26). Kiểm lại các nhánh đang mở ngay trước khi đóng gói.

## 7. Nghiệm thu

- Sim: golden cho `deriveLeverEffectiveConfig` (mỗi tải × bộ quả nặng × lực kế bật/tắt), ca lỗi (ngoài allow-list, tải không cân bằng được, gửi `gauge` khi mẫu khoá, thiếu thước). Test class template bàn ướt pass không sửa.
- BE: unit test contract mới; bài nộp dạng cũ `tenthsPh` và dạng mới `value` đều qua; snapshot FL-13 cũ verify được.
- FE: `class-explore` (9 ca) pass không sửa; Playwright mới `fl06-class-explore`: giáo viên chọn mẫu → xem trước → giao; học sinh mở theo `assignmentId`, nộp hai moment + giải thích; giáo viên nhận xét. Mock API.
- Regression INC-2 (`lever-explore`, `fl-06-k5`, `k2-baseline`, `explore-*`) pass.

## 8. Câu hỏi cho owner

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q-1 | Tổng quát hoá C3 (§3) trong PR riêng, sửa code pilot của K2? | Có. Không có cách nào khác để bàn thứ hai dùng C3; giữ tương thích và để K2 review |
| Q-2 | Yêu cầu đo của FL-06 là gì? | Hai moment (trái, phải) khi cân bằng + giải thích. Phương án khác: chỉ nộp F và d của lực cân bằng |
| Q-3 | Đơn vị moment học sinh nhập? | N·m, 3 chữ số thập phân (khớp bảng moment trên bàn), lưu số nguyên mN·m |
| Q-4 | Làm D1-3.1 trước khi chốt D-5, chấp nhận chưa dùng được với lớp thật? | Có. Code và test sẵn, D1-3.3 chỉ còn phát hành |
| Q-5 | Giáo viên tắt được bảng moment? | Có (spec FL-06 Q-1 đã ghi "giáo viên tắt được qua C3") |
