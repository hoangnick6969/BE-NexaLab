# Checklist P0: Contract Explore (theo dõi tiến độ)

Spec: [lab-mode-foundation-p0-spec.md](lab-mode-foundation-p0-spec.md) (revision 7). Cập nhật: 2026-11-15.

**Trạng thái: Contract done (2026-11-15).** Còn hai việc rollout do owner làm tay: merge PR-2 và deploy PR-2 (§5.4 bước 4). Việc giao dev tiếp theo: [tracking giao việc](lab-kit-delivery-tracking.md).

Ký hiệu: `[x]` xong và đã kiểm · `[ ]` chưa làm.

**Cách nghiệm thu (D-6).** Không dùng Postgres cô lập. Bằng chứng gồm unit test, CLI test của guard, Playwright với API mock, và một lượt kiểm chỉ-SELECT trên Supabase chạy trong transaction `READ ONLY` ngày 2026-11-15. Không có lệnh nào ghi lên Supabase. Guard DB cô lập của seed giữ nguyên.

## Bằng chứng Supabase (chỉ-SELECT, 2026-11-15)

| Kiểm | Kết quả |
|---|---|
| Lab trên DB | 15 Lab: 13 khai báo `guided`, 2 khai báo `explore` |
| Resolver PR-2 (`resolveExploreLabs`, sim 1.8.0) | `acid-base-indicators` (FL-13) và `metal-reactivity` (FL-14a) đều `ok: true`, trỏ tới version 2 |
| Bản ghim | Mỗi key `<labId>-explore` có v1 (công bố cũ, không có `spec.explore`) và v2 (có `spec.explore`). Không có version trùng nội dung |
| Không tạo dữ liệu chấm | Trên 2 Lab Explore: `LabRun` = 0, `Challenge` = 0 (nên không thể có `Attempt`), `Progress` = 0 |
| Ràng buộc Explore | Không Lab Explore nào có challenge, release hoặc là `foundationalLabId` |
| Guided không bị ảnh hưởng | 11 release Guided vẫn `ACTIVE`; không release ACTIVE nào nằm trên Lab Explore |
| Audit | 2 dòng `lab.explore.publish` (FL-13, FL-14a) lúc phát hành qua Admin API |
| Migration | 70/70 migration trong repo đã áp dụng trên Supabase. P0 không thêm migration nào |

## 1. C1: chạy Lab Explore (§5.1, hai PR)

### PR-1 (BE + sim): ghi dữ liệu. Đã merge (PR #69)
- [x] Export `assertIsolatedDatabase()`, có hook `predb:seed:k2-explore`; seed gọi guard ở mọi chế độ, kể cả `--unpublish`; đã bỏ `targetHost()` và token phê duyệt
- [x] `exploreActivitySpecSchema` riêng cho Explore; `activitySpecSchema` của Guided không đổi
- [x] `publishExploreLab` (một transaction, registry server, các ca từ chối, version mới chỉ khi digest mới, `Lab.config` dạng gọn, audit)
- [x] `POST /admin/labs/:id/explore-versions` (ADMIN, Zod) và script owner `scripts/publish-k2-explore.ts`
- [x] Route manifest chỉ thêm đúng route trên; lint, build và unit test pass
- [x] Theo D-6, integration test trên Postgres cô lập không còn là điều kiện đóng P0. `explore-publish.integration.test.ts` giữ lại để chạy khi có DB cô lập

### Cổng rollout §5.4
- [x] Bước 1: phát hành FL-13 và FL-14a qua Admin API, cả hai lên version 2
- [x] Bước 2: kiểm chỉ-SELECT đạt (đúng con trỏ, digest khớp, `spec.explore.labId` đúng Lab)
- [x] Bước 3 (theo D-6): Guided và Class Guided qua Playwright `fl-10-k2`, `lab-run-host`; Supabase còn đủ 11 release ACTIVE. Explore mở trên 2 bàn (bàn ướt và fixture F0-2) qua Playwright mock. Resolver trên dữ liệu Supabase trả `ok: true` cho cả hai Lab Explore. Bàn thứ hai thật được kiểm khi FL-06 vào registry server
- [ ] Bước 4: deploy PR-2 (BE và FE cùng lúc), sau đó học sinh mở FL-13 và FL-14a được, giáo viên không thấy mã lỗi

### PR-2 (BE + FE): đọc dữ liệu. Đã có trên nhánh remote (BE `eac62f0`, FE `b127276`)
- [x] `GET /labs`: `mode` trên mọi dòng, `explore` trên dòng Explore, 6 bước kiểm theo thứ tự, lỗi tách theo dòng, học sinh không nhận dòng lỗi
- [x] FE `Lab.tsx` rẽ nhánh theo `row.mode`; lỗi thì hiện panel kèm mã; đã bỏ `isExploreLab`; chỉ dùng config từ server
- [x] `ExploreBench` key theo `activity.id`; khóa lưu cục bộ `labId@activity.id`
- [x] Test: mỗi mã lỗi một ca, ca config thuộc Lab khác, ca Lab hỏng không ảnh hưởng Lab khác, ca Lab ngoài bundle vẫn mở, FL-10 vẫn Guided, FL-13 có nhãn nháp, Playwright FL-13 và `fl-10-k2` pass
- [x] Resolver với envelope 1.8.0 trả `ok: true` cho bản ghim FL-13 và FL-14a v2 trên Supabase
- [ ] Merge PR-2 ở BE và FE (owner làm tay)

## 2. Nghiệm thu C1 (§7)
- [x] Route manifest chỉ thêm `POST /admin/labs/:id/explore-versions`
- [x] `publishExploreLab`: API và seed cho cùng version/digest; cùng input không tạo version mới; từ chối đúng các ca; chặn người không phải ADMIN (unit test). Trên Supabase, hai Lab phát hành qua API có đúng một version mới mỗi Lab
- [x] Con trỏ activity sai trả đúng mã lỗi trên dòng đó; `GET /labs` vẫn 200
- [x] Mỗi mã lỗi một ca: giáo viên thấy panel kèm mã, không vào GuidedLab, không dùng config đóng gói; học sinh không nhận dòng
- [x] Config đúng schema và digest nhưng thuộc Lab khác trả `EXPLORE_IDENTITY_MISMATCH`
- [x] Response đúng contract C1.2; danh sách dụng cụ và chất ở màn giới thiệu đọc qua `listKitItems` và không đổi (test so với logic cũ trên FL-10/13/14a)
- [x] Lab Explore ngoài bundle mở được; FL-10 vẫn Guided; Class Guided qua `assignmentId`/`resourceId` vẫn mở, nộp được (Playwright `fl-10-k2`, `lab-run-host`)
- [x] Sửa `Lab.config` mà không tạo version mới thì báo `EXPLORE_DIGEST_MISMATCH`; config mới thì có version mới và khóa lưu mới
- [x] Học sinh mở FL-13 khi dữ liệu còn `unverified`, có nhãn
- [x] Guard chặn khi lệch host, port hoặc DB, cả qua `npm run`, chạy thẳng `tsx` và `--unpublish`
- [x] FE validate lại thất bại thì dừng, hiện `EXPLORE_CONFIG_INVALID`; seed từ chối Lab có challenge/release/foundationalLabId
- [x] Dùng Explore không tạo `LabRun`/`Attempt`/`Progress`: Playwright không thấy request run; Supabase có 0 `LabRun`, 0 `Challenge`, 0 `Progress` trên hai Lab Explore
- [x] Lint/build BE và FE pass. 163 test sim/BE, 7 unit test FE (`npx tsx --test`) và 11 Playwright Explore pass (API mock), chạy lại ngày 2026-11-15

## 3. Hạ tầng chung §5.2
- [x] **F0-1** Envelope trung lập `packages/sim/explore/envelope.ts`; `ChemistryLabConfig` mở rộng schema này. Test envelope cho bàn khác, golden của bàn ướt và hai bản ghim v2 đều pass. FE dùng tarball `@nexalab/sim` 1.8.0, khớp `packages/sim`
- [x] **F0-2** Registry đa bàn (FE `e438a0e`). FE `runtime/explore-registry.ts` với mục `{ kit, group, validate, loadPage, listKitItems }`; bàn ướt đã đăng ký; `listWetBenchKitItems` là adapter tối thiểu. BE giữ `EXPLORE_BENCHES` `{ kit, validate }`. Fixture `explore-fixture@1` chỉ đăng ký ở FE dev; Playwright mock mở được hai bàn qua `/labs/:id`
- [x] **F0-4** Lưu nhật ký dùng chung: khóa, IndexedDB, giới hạn 500 dòng, export. Playwright FL-13 đọc lại số đo pH sau khi tải lại trang và xuất đúng định dạng JSON K2
- [x] **F0-5** `npm run db:seed:explore -- --kit <id-bàn>` gọi `publishExploreLab`; alias K2 vẫn dùng được. (b), (c), (d) qua unit/CLI test. (a) theo D-6: bản ghim trên Supabase, ghi bằng cùng `publishExploreLab`, được resolver PR-2 mở đúng bàn K2
- [x] **C2.1** Khung `src/features/labs/shared/items/` có kiểu item, test kiểu và README quy ước anchor. Người phụ trách pilot Kit Hóa học duyệt PR item chung
- [x] **Mẫu spec áp dụng** cho mỗi bàn: [lab-explore-bench-spec-template.md](lab-explore-bench-spec-template.md)

## 4. Mốc "Contract done" (§5.3)
- [x] Nghiệm thu C1 (§7) pass toàn bộ, theo D-6
- [x] Mọi việc §5.2 đạt cột "Xong khi"
- [x] Tài liệu §6 đã cập nhật: Kiến trúc Explore, Backlog F0, Thiết kế K2, Portfolio, Danh mục kit và `sprint-status.yaml`

## 5. Việc tồn đọng ngoài P0 (phát hiện khi làm)
- [ ] 4 Playwright fail sẵn (cũng fail trên code gốc `c869578`): `em-induction` (viewport điện thoại), 2 ca trong `lab-run-host`, 1 ca trong `lab-space-class-section`
- [ ] `.env` BE có hai dòng `SEED_PASSWORD`; dotenv lấy dòng thứ hai (sai)
- [ ] `D:\FPT\vite.config.ts` nằm ngoài workspace làm vitest BE đọc nhầm config
- [ ] Unit test FE chỉ chạy bằng `npx tsx --test`, chưa có script npm nên không ai chạy tự động
- [ ] Code schema của fixture F0-2 vẫn nằm trong bundle production (không được đăng ký, chỉ là code thừa)
