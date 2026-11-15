---
id: SPEC-fl-26-mendel
status: approved
approved_by: owner (2026-11-15)
date: 2026-11-15
branch: feat/fl26-mendel-sim (BE)
depends_on: [SPEC-lab-kit-20-slot-delivery, SPEC-lab-mode-foundation-p0]
---

# FL-26 — Lai Mendel một tính trạng (Kit Sinh học, bàn di truyền `k8-garden`)

Đây là **spec áp dụng cho bàn di truyền** theo [mẫu spec áp dụng](../spec-lab-pipeline/lab-explore-bench-spec-template.md). Owner đã duyệt chính thức bản đề xuất (2026-11-15) làm chuẩn nguồn K9 và phạm vi FL-26. Outcome và mô hình vẫn giữ `reviewStatus: PROPOSED_UNAPPROVED` cho đến khi reviewer ký release digest.

## Quyết định cần owner chốt (D2-0.1)

| # | Quyết định | Đề xuất | Trạng thái |
|---|---|---|---|
| 1 | Nguồn K9 | `9/hien-tuong-di-truyen-mendel/1, 2` (quy luật Mendel), `9/di-truyen-nhiem-sac-the/4, 5` (phân ly, tổ hợp) theo [catalog](../spec-lab-pipeline/lab-catalog-and-shared-kits-khtn8-9.md) | **Owner đã duyệt.** Provenance K9 vẫn có điều kiện kiểm tra bởi reviewer |
| 2 | Phạm vi lát cắt đầu | **Một tính trạng, trội hoàn toàn**: Punnett 2×2, tỉ lệ kiểu gen và kiểu hình | **Owner đã duyệt** |
| 3 | Ngoài phạm vi v1 | Lai hai tính trạng, liên kết gen, NST giới tính XY, lấy mẫu ngẫu nhiên có `seed` | Owner đã duyệt. Để sang version sau. Catalog ghi các mục này nhưng backlog K8-FL26 coi là mở rộng |
| 4 | Track Lab | Từ INC-2 là track thứ ba, cần owner nới giới hạn 2 track (O-0.5) | **Owner đã duyệt** |

## Đăng ký và tái sử dụng

| Phần | Nội dung |
|---|---|
| Bàn và Kit | Bàn di truyền, `kit: "k8-garden"`, `group: "biology"`, thư mục FE `src/features/labs/biology/genetics/`. Topic: `KHTN9-CH11-T01` (cùng chương với FL-27; cần kiểm tra lại khi publish) |
| Lab đầu tiên | FL-26, Lab ID `fl-26-explore`, mode Explore mới (chưa có Guided, nên không chờ D-5) |
| Cách mở | `/labs/:id` với config đã ghim (`publishExploreLab`). Dev/fixture trước khi phát hành |
| Mô hình | `mendel-cross@1.0.0` trong `packages/sim/mendel-cross.ts`. Đơn vị: số tổ hợp trên 4 ô Punnett (số nguyên). `reviewStatus: PROPOSED_UNAPPROVED` |
| Item | Chậu cây đậu Hà Lan và giao tử (kéo thả vào ma trận Punnett). Item dùng chung đi qua PR riêng cho K2 duyệt. Hiện chưa có item nào cần thêm vào `shared/items/` |

## Mô hình

- Đầu vào: `{ setup: "monohybrid", parents: [kiểu gen 1, kiểu gen 2] }`, trong đó kiểu gen là hai chữ cái cùng tên. Chữ hoa là trội. `aA` được chuẩn hóa thành `Aa`.
- Giao tử: mỗi alen của bố hoặc mẹ là một giao tử, mỗi giao tử có trọng số 1/2. Cá thể đồng hợp cho hai giao tử giống nhau.
- Punnett: 2×2 (luôn luôn với lai một tính trạng; đồng hợp vẫn cho hai giao tử giống nhau), mỗi ô là một tổ hợp kiểu gen.
- Kết quả: `genotypeCounts`, `phenotypeCounts`, `genotypeRatio` và `phenotypeRatio` dưới dạng số nguyên đã rút gọn.
- Giới hạn: không mô phỏng ngẫu nhiên, không lai hai tính trạng, không liên kết gen. Con số là tỉ lệ kỳ vọng, không phải kết quả thí nghiệm.

## Nghiệm thu

- Golden test MX-01…MX-08 (`mendel-cross.test.ts`): Aa×Aa cho 1:2:1 và 3:1; AA×aa cho 100% Aa; Aa×aa cho 1:1; đồng hợp; chuẩn hóa `aA`; từ chối `Ab` và độ dài sai.
- Config (`mendel-config.test.ts`): envelope FL-26, kit `k8-garden`, cặp bố mẹ trong allow-list đọc được, phiên bản model đúng.
- INC-1 hoàn thành: model, schema, golden test, spec.
- INC-2 (D2-2.1…D2-2.5) triển khai trong cùng đợt, xem tracking.

## Đối chiếu

- [Tracking giao việc](../spec-lab-pipeline/lab-kit-delivery-tracking.md) · [Phân công 20 slot](../spec-lab-pipeline/lab-kit-20-slot-delivery-spec.md) · [Backlog K8-FL26](../../../docs/bmad/explore-labs-backlog-and-epics.md)
