# Checklist P0: Contract Explore (theo dõi tiến độ)

Spec: [lab-mode-foundation-p0-spec.md](lab-mode-foundation-p0-spec.md) (revision 6). Cập nhật: 2026-11-15.

Ký hiệu: `[x]` xong và đã kiểm · `[~]` code xong, còn việc kiểm chưa chạy được · `[ ]` chưa làm.

## 1. C1: chạy Lab Explore (§5.1, hai PR)

### PR-1 (BE + sim): ghi dữ liệu. Đã merge (PR #69)
- [x] Export `assertIsolatedDatabase()`, có hook `predb:seed:k2-explore`; seed gọi guard ở mọi chế độ, kể cả `--unpublish`; đã bỏ `targetHost()` và token phê duyệt
- [x] `exploreActivitySpecSchema` riêng cho Explore; `activitySpecSchema` của Guided không đổi
- [x] `publishExploreLab` (một transaction, registry server, các ca từ chối, version mới chỉ khi digest mới, `Lab.config` dạng gọn, audit)
- [x] `POST /admin/labs/:id/explore-versions` (ADMIN, Zod) và script owner `scripts/publish-k2-explore.ts`
- [x] Route manifest chỉ thêm đúng route trên; lint, build và unit test pass
- [~] Integration test trên DB cô lập (`explore-publish.integration.test.ts`): đã viết, **chưa chạy** vì máy dev không có Postgres local

### Giữa hai PR: cổng rollout §5.4
- [x] Bước 1: phát hành FL-13 và FL-14a qua Admin API, cả hai lên version 2
- [x] Bước 2: kiểm chỉ-SELECT đạt (đúng con trỏ, digest khớp, `spec.explore.labId` đúng Lab)
- [ ] Bước 3: kiểm trên DB cô lập với build PR-2 (Guided và Class Guided vẫn mở, nộp, chấm được; Explore mở được trên **2 bàn**: bàn ướt và fixture F0-2. Phía FE đã chứng minh bằng Playwright mock API; cần Postgres local để chạy với server thật)
- [ ] Bước 4: deploy PR-2 (BE và FE cùng lúc)

### PR-2 (BE + FE): đọc dữ liệu. Đã commit (BE `eac62f0`, FE `b127276`), chưa push
- [x] `GET /labs`: `mode` trên mọi dòng, `explore` trên dòng Explore, 6 bước kiểm theo thứ tự, lỗi tách theo dòng, học sinh không nhận dòng lỗi
- [x] FE `Lab.tsx` rẽ nhánh theo `row.mode`; lỗi thì hiện panel kèm mã; đã bỏ `isExploreLab`; chỉ dùng config từ server
- [x] `ExploreBench` key theo `activity.id`; khóa lưu cục bộ `labId@activity.id`
- [x] Test: mỗi mã lỗi một ca, ca config thuộc Lab khác, ca Lab hỏng không ảnh hưởng Lab khác, ca Lab ngoài bundle vẫn mở, FL-10 vẫn Guided, FL-13 có nhãn nháp, Playwright FL-13 và `fl-10-k2` pass
- [x] Chạy resolver chỉ-SELECT trên DB dùng chung: FL-13 và FL-14a `ok: true`
- [ ] Push branch và mở PR, merge (owner làm tay)

## 2. Nghiệm thu C1 (§7)
- [x] Route manifest chỉ thêm `POST /admin/labs/:id/explore-versions`
- [~] `publishExploreLab`: API và seed cho cùng version/digest; cùng input không tạo version mới; từ chối đúng các ca; chặn người không phải ADMIN (unit test pass; bản chạy DB cô lập chưa chạy)
- [x] Con trỏ activity sai trả đúng mã lỗi trên dòng đó; `GET /labs` vẫn 200
- [x] Mỗi mã lỗi một ca: giáo viên thấy panel kèm mã, không vào GuidedLab, không dùng config đóng gói; học sinh không nhận dòng
- [x] Config đúng schema và digest nhưng thuộc Lab khác trả `EXPLORE_IDENTITY_MISMATCH`
- [x] Response đúng contract C1.2; danh sách dụng cụ và chất ở màn giới thiệu đọc qua `listKitItems` và không đổi (test so với logic cũ trên FL-10/13/14a)
- [x] Lab Explore ngoài bundle mở được; FL-10 vẫn Guided; Class Guided qua `assignmentId`/`resourceId` vẫn mở, nộp được (Playwright `fl-10-k2`, `lab-run-host`)
- [x] Sửa `Lab.config` mà không tạo version mới thì báo `EXPLORE_DIGEST_MISMATCH`; config mới thì có version mới và khóa lưu mới
- [x] Học sinh mở FL-13 khi dữ liệu còn `unverified`, có nhãn
- [x] Guard chặn khi lệch host, port hoặc DB, cả qua `npm run`, chạy thẳng `tsx` và `--unpublish`
- [x] FE validate lại thất bại thì dừng, hiện `EXPLORE_CONFIG_INVALID`; seed từ chối Lab có challenge/release/foundationalLabId
- [~] Dùng Explore không tạo `LabRun`/`Attempt`/`Progress` (Playwright: không có request run; bản kiểm DB cô lập chưa chạy)
- [x] Lint, test, build BE; lint, build FE

## 3. Hạ tầng chung §5.2 (mỗi việc nên là một PR nhỏ)
- [ ] **F0-1** Envelope trung lập `packages/sim/explore/envelope.ts`; `ChemistryLabConfig` mở rộng từ envelope; bàn ướt không đổi hành vi
- [x] **F0-2** Registry đa bàn (FE, chưa commit). FE `runtime/explore-registry.ts` với mục `{ kit, group, validate, loadPage, listKitItems }`; bàn ướt đã đăng ký; `listWetBenchKitItems` là adapter tối thiểu và màn giới thiệu đọc qua nó. BE giữ `EXPLORE_BENCHES` `{ kit, validate }` như spec. Bàn thứ hai là fixture `explore-fixture@1`, **chỉ đăng ký ở build dev**: Playwright mở được hai bàn qua `/labs/:id`. Server không có fixture, nên bước 3 của rollout trên DB cô lập chỉ kiểm được bàn ướt cho tới khi có bàn thật thứ hai
- [ ] **F0-4** Lưu nhật ký dùng chung: khóa, IndexedDB, giới hạn dòng, export
- [ ] **F0-5** Seed đa bàn `scripts/seed-explore-labs.ts --kit <bàn>` gọi `publishExploreLab`; đạt tiêu chí (a)–(d)
- [ ] **C2.1** Khung `src/features/labs/shared/items/` (kiểu item, quy ước anchor, README, test kiểu)
- [ ] **Mẫu spec áp dụng** cho mỗi bàn (file mẫu nằm cạnh spec P0)

## 4. Mốc "Contract done" (§5.3)
- [ ] Nghiệm thu C1 (§7) pass toàn bộ, gồm cả các mục `[~]` ở trên
- [ ] Mọi việc §5.2 đạt cột "Xong khi"
- [ ] Tài liệu §6 cập nhật. Đã sửa đoạn DB seed và FE của Kiến trúc Explore; còn lại: Kiến trúc §0.2 và §2, Backlog F0 (F0-1/2/3/4/5/6/7a), Thiết kế K2, Portfolio, Danh mục kit, `sprint-status.yaml`

## 5. Việc tồn đọng ngoài P0 (phát hiện khi làm)
- [ ] Chạy các integration test trên DB cô lập: cần một Postgres local (`NEXALAB_PINNING_TEST_URL` / `NEXALAB_ISOLATED_DATABASE_URL`)
- [ ] 4 Playwright fail sẵn (cũng fail trên code gốc `c869578`): `em-induction` (viewport điện thoại), 2 ca trong `lab-run-host`, 1 ca trong `lab-space-class-section`
- [ ] `.env` BE có hai dòng `SEED_PASSWORD`; dotenv lấy dòng thứ hai (sai)
- [ ] `D:\FPT\vite.config.ts` nằm ngoài workspace làm vitest BE đọc nhầm config
