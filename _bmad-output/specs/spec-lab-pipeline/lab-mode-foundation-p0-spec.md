---
id: SPEC-lab-mode-foundation-p0
status: proposed
date: 2026-11-15
revision: 6 (D-3 chốt; lỗi theo dòng; publishExploreLab dùng chung + Admin API; guard host/port/DB; hai PR và cổng rollout)
depends_on: []
blocks: [SPEC-lab-kit-assets-and-class-lab]
amends: [docs/product/explore-first-lab-architecture-spec.md, docs/bmad/explore-labs-backlog-and-epics.md (F0-5, F0-7)]
---
# P0 — Contract chung: Lab Explore theo Kit/bàn và Class Lab Explore

## 0. Cách đọc spec này

Spec này là **contract chung**. Dev làm bất kỳ Kit hay bàn nào cũng dựa vào nó. Spec [pilot Kit Hóa học](lab-kit-assets-and-class-lab-spec.md) là lần áp dụng đầu tiên.

| Phần | Nội dung | Khi nào triển khai |
|---|---|---|
| §2 | Từ vựng, cách tổ chức Kit/bàn, quy tắc kết quả | Áp dụng ngay cho spec và ticket mới |
| §3 C1 | **Contract chạy Lab Explore**: mode, ghim, seed, tiến độ | **Triển khai trong P0**, trước pilot |
| §5.2 | **Hạ tầng chung**: F0-1/2/4/5, khung thư viện item, mẫu spec áp dụng | **Triển khai trong P0**. Xong §5.3 thì dev các Kit chạy song song |
| §3 C2 | **Contract Kit, bàn và thư viện item dùng chung** | Chuẩn chung. Bàn ướt (Kit Hóa học) hoàn thiện trong pilot bước A |
| §3 C3 | **Contract Class Lab Explore**: giáo viên customize Foundational Lab trong allow-list của bàn | Chuẩn chung. FL-13 triển khai trong pilot bước C |

Spec này **bổ sung** [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) (APPROVED_PATTERN), không thay thế. Cây thư mục (§3), quy ước dữ liệu khoa học (§4) và Definition of Done (§5) của tài liệu đó vẫn giữ nguyên. Các điểm được sửa có ghi ở §6.

**"sim" là gì.** `packages/sim` trong BE là package `@nexalab/sim`, phiên bản hiện tại 1.7.0. Package này chứa:
- engine mô phỏng tất định, dùng đơn vị số nguyên;
- dữ liệu khoa học: ID dụng cụ, chất, phản ứng, kèm `reviewStatus`;
- validator config;
- golden test.

BE dùng `packages/sim` để tính kết quả chính thức. FE dùng cùng mã đó qua tarball `FE-NexaLab/vendor/nexalab-sim-<ver>.tgz` để xem trước. Vì vậy hai bên luôn tính giống nhau, và kết quả của server là kết quả chính thức.

## 1. Mục tiêu

1. Mọi bàn Explore cắm vào hệ thống theo cùng một cách: mode do server khai báo, config được ghim, seed chạy trên DB cô lập.
2. **Foundational Explore là open curriculum.** Học sinh mở tự do, không chấm điểm, không tính tiến độ, kèm nhãn khi dữ liệu còn `unverified`.
3. Dụng cụ xuất hiện ở nhiều Kit chỉ được dựng **một lần**, trong thư viện item dùng chung. Không bàn nào vẽ lại dụng cụ đã có trong thư viện.
4. Class Lab Explore cho giáo viên customize một Foundational Lab **trong allow-list của bàn**. Có yêu cầu có loại, có bài nộp và nhận xét, và không chạm vào verdict hay tiến độ.

## 2. Từ vựng và quy tắc kết quả

### 2.1 Tổ chức: 4 Kit, các bàn, một thư viện item dùng chung

Mô hình này thay cho việc chia 9 bộ K1–K8/EX-A trong [danh mục kit](lab-catalog-and-shared-kits-khtn8-9.md). Các tên K1–K8 vẫn dùng được, nhưng chỉ là **tên bàn** bên trong một Kit.

| Kit | Lab | Các bàn (scene + engine), theo code hiện có |
|---|---|---|
| **Kit Hóa học** | FL-10 → FL-15 | Bàn ướt (FL-10 → FL-14, `chemistry/wet-bench`); kịch bản an toàn (FL-15, chưa có) |
| **Kit Vật lý** | FL-01, FL-25; FL-03 → FL-06; FL-24; FL-07, FL-08; FL-23 | Điện (`physics/electricity`), chất lỏng (`physics/fluid`), cơ (`physics/mechanics`), nhiệt (`physics/thermal`), quang (`physics/optics`) |
| **Kit Sinh học** | FL-20, FL-21, FL-26, FL-27 | Sinh thái (`biology/ecology`), di truyền (`biology/genetics`, mới có README), phân tử (`biology/molecular`) |
| **Kit Bổ trợ Explore** | FL-16, FL-17 | Giải phẫu (`biology/anatomy`); ngoài 20 slot chính |

FL-02 và FL-09 giữ trạng thái DEFER theo danh mục cũ.

| Lớp | Là gì | Ai dùng |
|---|---|---|
| **Thư viện item dùng chung** | Dụng cụ xuất hiện ở hơn một Kit hoặc một bàn: cốc, cân, ống đong, nhiệt kế, thước, đồng hồ bấm giờ, ống nghiệm… Mỗi item có một ID, một mesh/2D, một tên và một công dụng | Mọi bàn |
| **Kit** | Thư viện asset của môn, gồm item riêng của môn (hóa chất, quả nặng, loài, bộ phận…) cộng với các item dùng chung mà Kit dùng. Học sinh xem thư viện theo Kit. Giáo viên duyệt và chọn theo Kit | Học sinh, giáo viên |
| **Bàn** | Scene và engine của một loại thí nghiệm, kèm allow-list item của bàn đó | Dev |

**Quy tắc chống phình code:**
- Không tái cấu trúc thư mục. Code đã chia sẵn theo `physics/`, `chemistry/`, `biology/`, khớp với các Kit.
- Một item chỉ được đưa vào thư viện dùng chung khi **bàn thứ hai thật sự cần nó**. Hiện cốc và cân đã đủ điều kiện, vì được vẽ ở 3 nơi: `chemistry/wet-bench/kit/apparatus3d.tsx`, `chemistry/wet-bench/WetBenchStage.tsx`, `physics/fluid/kit/…`.
- Item dùng chung **chỉ chia sẻ phần hiển thị và giới thiệu**. Số đo vẫn do engine của từng bàn tính, vì đơn vị và mô hình khác nhau (ví dụ cân FL-10 Guided đọc mg từ server, cân bàn ướt Explore tự tính µg).
- Engine không gộp theo Kit. `packages/sim` đã tách theo mô hình (`wet-bench`, `lever-bench`, `thermal-bench`, `buoyancy`…).
- **Kit** là 4 bộ theo môn ở bảng trên. Trong config và code, trường `kit` (ví dụ `k2-wet-bench@1`) là **ID của bàn**, không phải ID của Kit. Tên trường được giữ nguyên để không đổi dữ liệu đã có. Kit của một bàn được khai báo bằng trường `group` trong mục đăng ký (C2.3), nhận một trong các giá trị `chemistry`, `physics`, `biology`, `explore-support`.

### 2.2 Hai trục mode

Spec và ticket mới dùng hai trục sau. Không gọi "Foundation v1/v2" hay "Class Lab v1/v2" nữa.

| | **Guided** | **Explore** |
|---|---|---|
| **Foundational** (NexaLab soạn) | Đang có: 12 Lab. LabRun, Attempt, rubric ghim, LabRelease. | Đang có: bàn ướt Kit Hóa học (FL-13, FL-14a; FL-10 Explore chỉ ở route dev). Open curriculum, tùy chọn. |
| **Class** (giáo viên soạn) | Đang có: `ClassResource` LAB fork từ release + challenge, `customParams`, `reportPrompts`, câu hỏi bổ sung. | Chưa có. Theo C3. Trạng thái `Đã nộp`/`Đã nhận xét`. |

- **Guided giữ nguyên quy tắc chấm và tính tiến độ theo context.**
  - Mọi lần nộp Guided lưu `Attempt.verdict` (`labs.controller.ts:638`).
  - `projectLab` bỏ qua `CLASS_PRACTICE` (`:644`).
- **Explore không tạo LabRun, Attempt, verdict hay tiến độ Foundational**, ở cả hai hàng.
- **Mode của bài giao lấy từ bản giao đã ghim.** Mode trên route thư viện `/labs/:id` lấy từ khai báo của Lab. Hai nguồn này độc lập.
- **Foundational Explore không có cổng duyệt để hiển thị.**
  - Dữ liệu `unverified` vẫn hiện, kèm nhãn "dữ liệu mô phỏng, chờ duyệt". `ExploreLabPage` đã có sẵn nhãn này.
  - `reviewStatus` vẫn được giữ trong dữ liệu theo Kiến trúc Explore §4, nhưng **chỉ dùng để hiện nhãn**. Nó không phải điều kiện hiển thị hay giao bài (D-1, D-4).

## 3. Contract

### C1. Chạy Lab Explore (triển khai trong P0)

Các điểm hiện trạng sau đã đối chiếu với code ngày 2026-11-15:

| # | Hiện trạng | Bằng chứng |
|---|---|---|
| H1 | Mode do bundle FE quyết định. `Lab.config.mode` được ghi nhưng không ai đọc. `rendererKey` cũng vậy. | FE `runtime/explore-labs.ts:9-11`, `Lab.tsx:179`; seed `:133-134` |
| H2 | Bàn chạy bản sao `Lab.config.explore`, bản có thể sửa ở mỗi lần seed. Nếu bản sao hỏng thì FE lặng lẽ dùng config đóng gói. `PracticalActivityVersion` bất biến nhưng không chứa config. | seed `:47-80, 130-141`; FE `explore-labs.ts:20-27` |
| H3 | Nhật ký, xác nhận an toàn và câu trả lời lưu theo khóa `labId@configVersion`. | FE `observation-log.ts:109`, `ExploreBench.tsx:19, 36` |
| H4 | Seed lấy `_count.challenges`/`releases` nhưng không dùng. Không có gì ngăn `foundationalLabId` trỏ tới Lab Explore. | seed `:113`; `foundational-progress.service.ts:44-53` |
| H5 | `db:seed:k2-explore` không có guard DB cô lập. Nó cho ghi DB dùng chung bằng token, trái với `AGENTS.md`. `targetHost()` trong seed chỉ so tên host, không kiểm port và tên DB. Explore cũng chưa có đường phát hành qua Admin API như Guided (`scripts/release-fl06-lever.mjs`), và `activitySpecSchema` của admin (`sim-packs.ts:189`) không nhận spec Explore. | `package.json:95`; seed `:30, 99-100` |

**C1.1 Mode khai báo tách khỏi tình trạng config**

- `Lab.config` của Lab Explore có đúng dạng `{ mode: "explore", kit, engine, activity: { id, key, version, digest } }`. Seed bỏ các bản sao `explore`, `reviewStatus`, `rendererKey`.
- `declaredMode(lab)` trả `"explore"` khi `Lab.config.mode === "explore"`, ngược lại trả `"guided"`. Hàm này không parse config. Mỗi Lab có đúng một mode khai báo. Lab có cả hai mode cần contract riêng (D-5, ngoài P0).
- Kết quả phân giải `ok: false` thì **chặn mở bàn** và hiện mã lỗi. Lab không rơi sang Guided.
- FE `Lab.tsx` rẽ nhánh theo thứ tự:
  1. Có `assignmentId`/`resourceId`: vào đường hiện có (`Lab.tsx:244-253`). Đường Class Explore (C3.4) sẽ rẽ tiếp theo mode của bản giao.
  2. Không có: đọc query `["labs"]`, phân biệt bốn trạng thái:
     - **đang tải**;
     - **lỗi API**, kèm nút thử lại;
     - **không có dòng**: giữ màn "Phòng thực hành chưa được phát hành" của `GuidedLab` (`Lab.tsx:387`);
     - **có dòng**: rẽ theo `row.mode` (C1.2). `"guided"` mở `GuidedLab`. `"explore"` mở trang Explore của bàn mà registry FE tra theo `row.explore.kit`. Nếu `row.explore.ok = false` thì hiện panel lỗi kèm `code`.
  - Bỏ `isExploreLab` dựa trên bundle.

**C1.2 Bàn chạy bản đã ghim**

- `PracticalActivityVersion.spec.explore` chứa toàn bộ config của bàn, đã qua validator lúc ghi. Digest khi đó bao cả config.
- **Response contract của `GET /labs`.** Mỗi dòng giữ các trường hiện có, và thêm:

  ```ts
  mode: "guided" | "explore";              // = declaredMode(lab); FE rẽ nhánh theo trường này
  explore?:                                // chỉ có khi mode = "explore"
    | { ok: true; kit: string; engine: string;
        activity: { id: string; key: string; version: number; digest: string };
        config: unknown }                  // spec.explore đã kiểm; FE validate lại bằng schema của bàn
    | { ok: false; code: ExploreResolveError };
  ```

  - FE không đọc `Lab.config` để chạy bàn. P0 không đổi việc trả hay không trả `Lab.config` cho từng vai trò.
  - Học sinh không nhận dòng có `explore.ok = false`; mở bằng link trực tiếp sẽ thấy màn "chưa phát hành". Giáo viên và admin nhận dòng đó kèm `code`.
- **Thứ tự kiểm và mã lỗi** (dừng ở lỗi đầu tiên):

  | # | Kiểm | Mã lỗi |
  |---|---|---|
  | 1 | Có `PracticalActivityVersion` với `id = Lab.config.activity.id` | `EXPLORE_VERSION_MISSING` |
  | 2 | `version.key = "<lab.id>-explore"`, `version.key/version = Lab.config.activity.key/version` | `EXPLORE_IDENTITY_MISMATCH` |
  | 3 | `digest(spec) = version.digest = Lab.config.activity.digest` | `EXPLORE_DIGEST_MISMATCH` |
  | 4 | `Lab.config.kit` có trong registry server | `EXPLORE_KIT_UNSUPPORTED` |
  | 5 | `spec.explore` qua schema của bàn | `EXPLORE_CONFIG_INVALID` |
  | 6 | `spec.explore.labId = lab.id`, `spec.explore.kit = Lab.config.kit`, `spec.explore.engine = Lab.config.engine` | `EXPLORE_IDENTITY_MISMATCH` |

  Kiểm 6 giữ điều kiện `labId` mà resolver FE đang có (`explore-labs.ts:24`). Lý do: một config đúng schema, đúng digest nhưng thuộc Lab khác không được chạy.
- **Lỗi được tách theo từng dòng.** Một dòng hỏng chỉ làm dòng đó có `explore.ok = false`; `GET /labs` vẫn trả 200 với các dòng khác. `Lab.config.activity` thiếu hoặc sai dạng thì trả `EXPLORE_VERSION_MISSING`. Không để lỗi parse của một dòng làm cả request trả 500.
- Đọc các version bằng **một** truy vấn. Không cần bảng mới. Endpoint mới duy nhất là đường phát hành ở C1.3.
- FE chỉ dùng `explore.config` từ server. Config đóng gói chỉ còn cho route dev và làm đầu vào của seed/script phát hành. `ExploreBench` được `key` theo `explore.activity.id`.
- FE validate lại `explore.config` bằng schema của bàn. Nếu lỗi (ví dụ tarball sim ở FE lệch với BE), FE **dừng mở bàn** và hiện `EXPLORE_CONFIG_INVALID`, giống như khi server báo lỗi.
- Khóa lưu cục bộ của Explore mở là `labId@activity.id`. Dữ liệu theo khóa cũ không được chuyển sang, vì đó là ghi chép chưa chấm.

**C1.3 Ghi dữ liệu Explore: seed, phát hành, tiến độ**

Mọi lần ghi một Lab Explore đi qua **một hàm dùng chung** `publishExploreLab(db, input)`, đặt ở module labs của BE. Seed và Admin API chỉ là hai lối gọi tới hàm này.

| | Seed (DB cô lập) | Phát hành (DB dùng chung) |
|---|---|---|
| Lối gọi | `npm run db:seed:k2-explore` → `publishExploreLab` | `POST /admin/labs/:id/explore-versions` (ADMIN, body validate bằng Zod) → `publishExploreLab`. Owner chạy một script gọi API, theo mẫu `scripts/release-fl06-lever.mjs`: đăng nhập admin, không ghi DB trực tiếp |
| Bảo vệ | `assertIsolatedDatabase()` chạy trước mọi lệnh ghi, kể cả `--unpublish` | RBAC ADMIN và audit, như các route admin khác |

`publishExploreLab` làm các bước sau trong một transaction:
1. Validate config bằng validator của bàn, lấy từ registry server.
2. Từ chối nếu Lab đích đã có challenge hoặc release, hoặc đang là `foundationalLabId` của một khóa active.
3. Dựng spec, parse bằng `exploreActivitySpecSchema`, tính digest bằng `activityDigest`.
   - `exploreActivitySpecSchema` là schema riêng của Explore: dạng spec seed đang ghi, cộng thêm `explore`.
   - `activityDigest` là hàm digest admin đang dùng (`sim-packs.ts:421`).
   - Không đổi `activitySpecSchema` của Guided.
4. Tạo `PracticalActivityVersion` key `<labId>-explore` nếu digest mới. Cùng nội dung thì dùng lại version cũ.
5. Ghi `Lab.config` (C1.1) và các trường hiển thị (published, `SHARED_LIBRARY`, `releaseCleared`, `topicCode`), sau đó ghi audit.

**Guard dùng chung.**
- Export hàm `assertIsolatedDatabase()` từ `scripts/assert-isolated-db.mjs`. Hàm giữ nguyên logic hiện có:
  - kiểm loopback;
  - cấm DB `postgres`;
  - bắt `DATABASE_URL`/`DIRECT_URL` khớp **host, port và tên DB** với `NEXALAB_ISOLATED_DATABASE_URL`.
- Hook `pre…` của npm và seed cùng gọi hàm này.
- Bỏ `targetHost()` và token `K2_EXPLORE_SHARED_WRITE_APPROVED` khỏi seed. Lý do: `targetHost()` chỉ so tên host, mà một cổng loopback khác có thể là tunnel ra DB dùng chung.

**Tiến độ.** Integration test trên DB cô lập khẳng định dùng Lab Explore không tạo `LabRun`, `Attempt` hay `Progress`.

**Hai dòng legacy** (`acid-base-indicators`, `metal-reactivity`) được xử lý ở cổng rollout §5.4.

### C2. Kit, bàn và thư viện item dùng chung

C2 bổ sung cây thư mục ở Kiến trúc Explore §3. Các mục ghi "F0-x" là story sẵn có trong backlog.

**C2.1 Thư viện item dùng chung** (FE, `src/features/labs/shared/items/`)

- **Mỗi item có:**
  - `{ id, category, labelVi, purposeVi, safetyVi? }`, với `category` thuộc `apparatus | material | part | instrument`;
  - component hiển thị 3D, kèm 2D nếu có;
  - điểm gắn (anchor) đặt tên rõ ràng: miệng, lòng chứa, đáy.
- **Không chứa giá trị ảnh hưởng mô phỏng.** Dung tích hiệu dụng, khối lượng, số đọc… thuộc engine của bàn trong `packages/sim`. Component hiển thị nhận chúng qua props.
- Một item vào thư viện chỉ khi có bàn thứ hai cần nó (§2.1). Item dùng ở một bàn thì nằm trong thư mục của bàn đó.
- Item đầu tiên: **cốc** và **cân**. Bàn ướt Explore, bàn ướt Guided (FL-10) và bàn chất lỏng đang vẽ riêng chúng.

**C2.2 Kit**

- Danh mục item của Kit là hợp các danh mục của các bàn trong Kit. Không cần dữ liệu riêng.
- **Panel trong bàn** ("Dụng cụ và thành phần") là bắt buộc.
- **Trang thư viện theo Kit** cho học sinh là tùy chọn. Làm khi Kit đó có từ hai bàn hỗ trợ C2.3.

**C2.3 Bàn phải cung cấp gì**

| Lớp | Bắt buộc | Bàn ướt hiện có |
|---|---|---|
| **sim** `packages/sim/<bàn>/` | ID ổn định cho mọi item mà engine cần biết; đơn vị số nguyên; giá trị ảnh hưởng mô phỏng; `reviewStatus` cho mỗi bộ số. Config schema mở rộng từ `ExploreLabEnvelope` (F0-1). Có `validate<Bàn>LabConfig(raw) → { ok, config, warnings } \| { ok: false, errors, warnings }`. Có golden test. | `wet-bench/contracts.ts` (`APPARATUS_KINDS`, `MEASUREMENTS`), `reagents.ts`, `species.ts`, `reactions.ts`, `validate-config.ts`, golden FL-13 |
| **Danh mục item của bàn** (FE) | Ánh xạ mỗi ID của engine sang **một item thư viện dùng chung** hoặc một item riêng của bàn. Có hàm `listKitItems(config)` trả danh sách item **đúng theo config đang chạy**. Panel học sinh và màn chọn giáo viên đều đọc hàm này. Mesh và điểm gắn tra theo ID, không dùng chuỗi if/else. | Có một phần: `kit/apparatus-manifest.ts` (labelVi, purposeVi), nhãn và cảnh báo hóa chất trong `reagents.ts`. Mesh chọn bằng if/else trong `WetBenchKitStage.tsx` |
| **Đăng ký runtime** (F0-2) | Một mục `{ kit, group, validate, loadPage, listKitItems }` trong registry FE. Một mục `{ kit, validate }` trong registry server, phục vụ C1.2. | Chưa có. Hiện chỉ đọc `k2LabConfigs` |
| **Seed** (F0-5) | Seed chung `--kit <bàn>`, theo C1.3. | `seed-k2-explore-labs.ts` |
| **Để dùng cho Class Lab** (C3) | `classTemplates`, `derive<Bàn>EffectiveConfig` và validator strict; khai báo loại yêu cầu bàn hỗ trợ. | Chưa có. Làm trong pilot bước C |

Bàn không có engine phản ứng, ví dụ giải phẫu hay sinh thái, vẫn theo C2.3: item là bộ phận hoặc loài có ID gắn với mesh, config chọn tập con. Nhãn đang khác định dạng giữa các bàn (`labelVi`, `label{vi,en}`, `name`) được ánh xạ về các trường chung trong `listKitItems`, không cần đổi dữ liệu gốc.

### C3. Class Lab Explore: giáo viên customize Foundational Lab trong allow-list của bàn

**C3.1 Cấu hình mẫu (`classTemplates`)**

- Mỗi `PracticalActivityVersion` của một Foundational Explore có thể kèm `spec.classTemplates[]`. Mẫu được ghim cùng digest.
- Mỗi mẫu khai báo:
  - `id`;
  - item bắt buộc;
  - các nhóm tùy chọn kèm allow-list ID và số lượng chọn;
  - khoảng giá trị cho phép (số nguyên, có đơn vị);
  - prompt ID được chọn, kèm điều kiện lựa chọn nếu nội dung prompt phụ thuộc vào mẫu (ví dụ prompt nhắc tên chất cụ thể chỉ hợp lệ khi đã chọn đúng các chất đó). Validator strict từ chối prompt không khớp lựa chọn;
  - các loại yêu cầu được phép.
- Giáo viên **chỉ** chọn trong mẫu. Lựa chọn gửi lên chỉ gồm ID và giá trị.
- Ngoài phạm vi: tạo model, viết phản ứng mới, sửa đáp án chuẩn, ghép asset tự do.

**C3.2 Ghép và kiểm tra**

- Mỗi bàn có `derive<Bàn>EffectiveConfig(explore, template, selection)` và validator strict, cả hai nằm trong sim.
- **Preview của giáo viên, lúc giao bài và lúc nộp đều gọi cùng hàm này.**
- Strict nghĩa là:
  - cảnh báo về hiện tượng mà một yêu cầu cần (thiếu chất, thiếu dụng cụ đo) trở thành **lỗi**;
  - mỗi yêu cầu `measure` phải có công cụ đo tương ứng trong config hiệu lực.

**C3.3 Loại yêu cầu**

| Loại | Học sinh nộp | Server kiểm | Bản đầu |
|---|---|---|---|
| `measure` | Một số nguyên cho mỗi cặp (item ID, phép đo), ví dụ pH theo `tenthsPh` | Item thuộc config đã ghim, đúng định dạng và khoảng | ✅ |
| `explain` | Văn bản | Bắt buộc, độ dài | ✅ |
| `choose` | Lựa chọn theo ID | Lựa chọn thuộc danh sách | Sau |
| `identify` | ID bộ phận | ID thuộc config | Sau (dùng cho bàn giải phẫu, Kit Bổ trợ Explore) |

Bản đầu giáo viên nhận xét thủ công. Muốn tự chấm từ thao tác thì cần spec riêng về bằng chứng và cách chạy lại trên server.

**C3.4 Ghim, truy cập, nộp**

- `ClassResource.content` của bài Explore ghim các thành phần sau:
  - `source { mode: "explore", labId, activityVersionId, activityDigest }`;
  - `templateId`, `selection`;
  - `effectiveConfigDigest`;
  - `requirements`.
- Cách ghim này dùng lại vòng đời `ClassResource` hiện có (DRAFT → PUBLISHED → revise tạo version mới). Nó **không** đi qua release/challenge (`class-lab-resource.ts:19-33`).
- **Học sinh mở và nộp theo `assignmentId`.** Server đọc snapshot đã ghim của bài giao (cấu hình hiệu lực, câu hỏi, `effectiveConfigDigest`), không đọc `ClassResource` hiện hành.
- Lúc mở, lúc nộp và khi tutor lấy ngữ cảnh, server đều kiểm ba điều: học sinh là thành viên lớp, học sinh nằm trong **đối tượng giao** (`Assignment.targets`), và digest khớp.
- Đường `resourceId` (luyện tập lớp) **không** mở bài Explore cho học sinh, chỉ dùng cho giáo viên xem trước. Lý do: `resolveClassLabResource` hiện chỉ kiểm thành viên lớp (`class-lab-resource.ts:42-49`), không kiểm đối tượng giao.
- Bài nộp lưu ở bảng riêng, unique theo (học sinh, bài giao, idempotency key). Retry của cùng học sinh trên cùng bài giao trả bài đã lưu.
- Bài nộp có trạng thái `Đã nộp` → `Đã nhận xét`. Không tạo LabRun, Attempt hay Progress.
- Khóa nháp cục bộ theo học sinh + bài giao + version.

**C3.5 Điều kiện đưa cho lớp thật**

- **Bắt buộc:** C3.2 pass, tức allow-list của cấu hình mẫu và validator strict.
- **Không cần review bộ môn** (D-4). Nội dung do NexaLab biên soạn.
- Đưa nội dung lên DB dùng chung qua đường phát hành Admin API ở C1.3.

## 4. Quyết định

| ID | Nội dung | Trạng thái |
|---|---|---|
| D-1 | (F0-7a) Foundational Explore còn `unverified` có hiện cho học sinh không | **Chốt: hiện, kèm nhãn** (open curriculum) |
| D-2 | Quy ước khối lượng mol của bàn ướt (Kit Hóa học) | Đề xuất dùng quy ước bài tập KHTN 8 mà NexaLab chọn, ghi rõ sách và trang. Căn cứ ban đầu: SGV KHTN 8 (NXB GDVN) Bài 3 dùng Fe = 56, CaCO₃ = 100; căn cứ này chưa xác nhận cả bảng. Người biên soạn NexaLab chốt bảng đầy đủ. Áp dụng trong pilot. |
| D-3 | Bỏ config FE đóng gói trên route chính | **Chốt: bỏ.** `/labs/:id` chỉ chạy Explore bằng config đã ghim từ server. Bản ghim lỗi thì dừng mở bàn (C1.2) |
| D-4 | Class Lab Explore có cần review bộ môn trước khi đưa cho lớp thật | **Chốt: không cần.** Nội dung do NexaLab biên soạn; chỉ cần allow-list và validator strict |
| D-5 | **Contract hai mode**: một Lab ID đã có Guided (challenge/release) mở thêm Explore trên route thư viện | **Mở, ngoài P0.** Cần quyết định cách khai báo hai mode, mode mặc định và nút chuyển. Gộp với F0-7b (đổi mode FL-10). Áp dụng cho FL-10, FL-06 và mọi Lab Guided được thêm Explore |

F0-7b được giải quyết cùng D-5.

## 5. Phạm vi triển khai P0 và mốc "Contract done"

P0 gồm hai phần. Cả hai xong thì dev các Kit khác bắt đầu làm song song.

**5.1 C1, chạy Lab Explore: hai PR theo thứ tự**

| PR | Nội dung | Ghi chú |
|---|---|---|
| **PR-1 (BE + sim): ghi** | C1.3 đầy đủ: `publishExploreLab`, `exploreActivitySpecSchema`, `POST /admin/labs/:id/explore-versions`, guard dùng chung, seed gọi `publishExploreLab`, script phát hành của owner | Chưa đổi `GET /labs`. FE cũ vẫn chạy: Lab không còn bản sao `Lab.config.explore` thì FE cũ dùng config đóng gói, cùng nội dung với bản ghim |
| *Giữa hai PR* | Cổng rollout §5.4, bước 1–2: phát hành bản ghim FL-13/FL-14a lên DB dùng chung | Học sinh không mất quyền truy cập |
| **PR-2 (BE + FE): đọc** | C1.1 + C1.2: `mode`/`explore` trong `GET /labs`, rẽ nhánh FE, khóa lưu mới, bỏ `isExploreLab` | Deploy BE và FE cùng lúc |

**5.2 Hạ tầng chung để chia việc song song.** Các story F0 sẵn có trong backlog, cộng thêm phần C2.1:

| Việc | Nội dung | Xong khi |
|---|---|---|
| F0-1 Envelope trung lập | `packages/sim/explore/envelope.ts` chỉ chứa phần chung. **Prompt chung** gồm `{ id, kind, textVi, choices?, challenge? }`. Các điều kiện kích hoạt và trỏ tới item (`focus`, `highlightWhen`, kể cả `reagentId`, `reaction`, `MEASUREMENTS` hiện ở `wet-bench/contracts.ts:51-59`) do **schema của từng bàn** mở rộng và validate. `ChemistryLabConfig` mở rộng từ envelope | Test sim pass. Bàn ướt không đổi hành vi. Envelope không import gì từ `wet-bench` |
| F0-2 Registry đa bàn + đăng ký bàn ướt | FE: `{ kit, group, validate, loadPage, listKitItems }`. BE: `{ kit, validate }` (C1.2). Bàn ướt được đăng ký ngay trong P0. `listKitItems` của bàn ướt là **adapter tối thiểu** từ `apparatus-manifest.ts` và `reagents.ts` | `/labs/:id` mở được Explore của **2 bàn khác nhau**. Bàn thứ hai có thể là fixture tối giản, chỉ để chứng minh registry chạy. Danh sách dụng cụ và chất ở màn giới thiệu hiện có của FL-13/FL-14a/FL-10 Explore không đổi, và được đọc qua `listKitItems` |
| F0-4 Lưu trữ nhật ký dùng chung | Phần dùng chung **chỉ** gồm khóa (`labId@activity.id`, hoặc khóa lớp ở C3.4), đọc/ghi IndexedDB, giới hạn số dòng và export. Kiểu dòng nhật ký và cách mô tả hiện tượng thuộc từng bàn: `ObservationLogEntry` hiện có `readings.ph/litmus/scale`, `equations`, là dữ liệu hóa học | Bàn ướt dùng phần lưu trữ chung, không đổi hành vi. Bàn khác chỉ viết kiểu dòng và `describeChange()` |
| F0-5 Seed đa bàn | `scripts/seed-explore-labs.ts --kit <bàn>`, gọi `publishExploreLab` (C1.3). Guard áp dụng cho mọi đường ghi. C1 **cố ý đổi** dữ liệu được ghi, nên không so với seed cũ | (a) Sau khi seed, cùng Lab mở đúng bàn qua `GET /labs`. (b) Chạy lại với cùng input thì không tạo version mới. (c) Đổi một giá trị config thì tạo version mới. (d) Mọi đường ghi, kể cả `--unpublish` và chạy thẳng `tsx`, đều bị chặn trên DB không cô lập |
| C2.1 Khung thư viện item | Tạo `src/features/labs/shared/items/`, kiểu item, quy ước anchor. **Một người chịu trách nhiệm** thư mục này: item chung được thêm qua PR riêng, không gộp trong PR của bàn | Khung, test kiểu và README quy ước có trong repo. Cốc và cân được thêm ở pilot bước A |
| Mẫu spec áp dụng | Mẫu một trang cho mỗi bàn: điền bảng C2.3, liệt kê item riêng và item dùng chung, loại yêu cầu bàn hỗ trợ, Lab nào có Explore | File mẫu nằm cạnh spec này |

**5.3 Mốc "Contract done"**

- [ ] Nghiệm thu C1 (§7) pass.
- [ ] Tất cả việc ở 5.2 đạt cột "Xong khi".
- [ ] Tài liệu ở §6 đã cập nhật.

Sau mốc này:

| Việc | Ai làm |
|---|---|
| Explore và danh mục item của từng bàn (C1 + C2.3) | **Dev các Kit, song song.** Lab mới hoặc Lab chưa có Guided: làm đến Lab thật. Lab đã có Guided (có challenge/release, ví dụ FL-06): chỉ làm trên dev route/fixture cho tới khi có contract hai mode (D-5), vì seed C1.3 từ chối các Lab này |
| Class Lab Explore (C3) cho bàn khác bàn ướt | Chỉ sau khi pilot Kit Hóa học xong **bước C**, khi schema `classTemplates` và bảng bài nộp đã chạy bằng code thật |

C2 và C3 là chuẩn. Bàn ướt (Kit Hóa học) áp dụng chúng đầu tiên ở pilot. Mỗi bàn sau viết spec áp dụng theo mẫu ở 5.2. Item dùng chung đi vào thư viện C2.1 khi bàn thứ hai cần đến.

**5.4 Cổng rollout lên DB dùng chung**

Làm đúng thứ tự. Chỉ dùng truy vấn chỉ-SELECT để kiểm DB dùng chung (theo AGENTS.md).

1. **Trước PR-2:** owner chạy script phát hành cho FL-13 và FL-14a qua Admin API (đã có từ PR-1).
2. **Kiểm bằng truy vấn chỉ-SELECT:** mỗi Lab có `Lab.config.activity` trỏ tới một version có `spec.explore`. Digest khớp. `spec.explore.labId` đúng với Lab.
3. **Trên DB cô lập, với build PR-2:**
   - Bài Guided cũ, gồm Foundational và Class Lab Guided qua `assignmentId`/`resourceId`, vẫn mở, nộp và chấm được.
   - Explore mở được trên **hai bàn**: bàn ướt và fixture của F0-2.
4. **Deploy PR-2** (BE + FE). Sau deploy, học sinh mở FL-13 và FL-14a được. Giáo viên không thấy mã lỗi nào trên hai Lab này.

Nếu bước 2 không đạt thì không deploy PR-2.

## 6. Sửa tài liệu kèm theo

- **Kiến trúc Explore:**
  - §0.2: Explore của lớp có bài nộp riêng theo C3.4, vẫn không tạo Attempt.
  - Khóa IndexedDB đổi sang `labId@activity.id`.
  - §2 `ExploreLabEnvelope`: `ObservationPrompt` trong envelope chỉ còn phần chung (F0-1).
  - Dòng DoD "chỉ ghi DB dùng chung khi có phê duyệt" đổi thành "seed chỉ chạy trên DB cô lập; phát hành lên DB dùng chung qua `POST /admin/labs/:id/explore-versions`".
- **Backlog F0:**
  - Ghi D-1 vào F0-7a.
  - F0-6 không còn là cổng phát hành (D-4). `reviewStatus` chỉ còn tác dụng hiện nhãn.
  - F0-5 bỏ "biến phê duyệt ghi DB dùng chung".
  - F0-1: envelope trung lập, prompt chung không có trường của bàn ướt (§5.2).
  - F0-2 thêm `group` và `listKitItems` vào mục đăng ký, và đăng ký bàn ướt ngay trong P0.
  - F0-4: phần dùng chung chỉ còn khóa và lưu/đọc.
  - F0-5: thay "kết quả giống hệt" bằng bốn tiêu chí (a)–(d) ở §5.2.
  - F0-3 (hạ tầng tương tác dùng chung) mở rộng thành thư viện item dùng chung C2.1.
- **Thiết kế K2:**
  - §5: giáo viên chọn trong allow-list của `classTemplates`.
  - Dòng 19: FL-13 Explore đã có.
- **Portfolio** dòng 74: FL-14a Explore đã có, FL-14 đầy đủ thì chưa.
- **Danh mục kit** (`lab-catalog-and-shared-kits-khtn8-9.md`): thêm một dòng ở đầu bảng kit, ghi rằng mô hình 4 Kit + bàn ở §2.1 thay cho cách chia 9 kit; K1–K8/EX-A là tên bàn.
- **`sprint-status.yaml`:** thêm `p0-explore-run-contract`, `chem-wet-bench-pilot`, `wet-bench-molar-mass-convention`.

## 7. Nghiệm thu P0 (C1)

Tất cả chạy trên DB cô lập.

- [ ] Route manifest chỉ thêm đúng một route: `POST /admin/labs/:id/explore-versions` (ADMIN). Mọi route cũ không đổi.
- [ ] `publishExploreLab`:
  - gọi qua API hay qua seed đều cho cùng version và cùng digest với cùng input;
  - cùng input thì không tạo version mới;
  - từ chối Lab có challenge/release hoặc đang là `foundationalLabId`;
  - từ chối config sai validator;
  - không phải ADMIN thì bị chặn.
- [ ] Một Lab có con trỏ activity sai trả đúng mã lỗi trên dòng đó. `GET /labs` vẫn trả 200 và các Lab khác vẫn tải bình thường.
- [ ] Mỗi mã lỗi ở bảng C1.2 có một ca test. Mỗi ca, giáo viên thấy panel lỗi kèm đúng mã, không mở `GuidedLab`, không dùng config đóng gói, còn học sinh không nhận dòng đó.
- [ ] Ca **config đúng schema, đúng digest nhưng thuộc Lab khác** trả `EXPLORE_IDENTITY_MISMATCH`.
- [ ] Response của `GET /labs` có `mode` trên mọi dòng và `explore` trên dòng Explore, đúng dạng ở C1.2. Danh sách dụng cụ ở màn giới thiệu đọc qua `listKitItems` và không đổi.
- [ ] Lab Explore hợp lệ mở được dù không có trong bundle FE. FL-10 vẫn mở Guided. Class Guided qua `assignmentId`/`resourceId` vẫn mở, nộp và chấm được, kể cả bài giao trước thay đổi.
- [ ] Sửa `Lab.config` mà không tạo version mới thì bàn không đổi, hoặc báo `EXPLORE_DIGEST_MISMATCH`. Seed config mới thì tạo version mới, bàn khởi tạo lại với khóa lưu mới, bản cũ giữ nguyên.
- [ ] Học sinh mở được FL-13 khi dữ liệu còn `unverified`, có nhãn.
- [ ] Seed thất bại khi `DATABASE_URL` khác `NEXALAB_ISOLATED_DATABASE_URL` ở host, ở port hoặc ở tên DB. Điều này đúng cả khi gọi qua `npm run` lẫn khi chạy thẳng `tsx`, và cả nhánh `--unpublish`.
- [ ] FE validate lại config thất bại thì dừng mở bàn, hiện `EXPLORE_CONFIG_INVALID`. Seed từ chối Lab đã có challenge/release hoặc đang là `foundationalLabId`.
- [ ] Dùng Lab Explore không tạo `LabRun`, `Attempt` hay `Progress`.
- [ ] Playwright FL-13 (mở, đo pH, danh sách dụng cụ) và `tests/fl-10-k2.spec.ts` pass. Lint, test và build ở BE; lint và build ở FE.

## Tham chiếu

- [Pilot Kit Hóa học](lab-kit-assets-and-class-lab-spec.md) · [Danh mục kit cũ](lab-catalog-and-shared-kits-khtn8-9.md) · [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) · [Backlog F0](../../../docs/bmad/explore-labs-backlog-and-epics.md) · [Thiết kế K2](k2-wet-bench-explore-kit-design.md)
- Code: [seed K2](../../../scripts/seed-k2-explore-labs.ts) · [catalog](../../../src/modules/curriculum/interface/catalog.controller.ts) · [Class Lab hiện tại](../../../src/modules/classes/application/class-lab-resource.ts) · [nộp Guided](../../../src/modules/labs/interface/labs.controller.ts) · [contracts K2](../../../packages/sim/wet-bench/contracts.ts) · [validator K2](../../../packages/sim/wet-bench/validate-config.ts)
- Căn cứ D-2: [SGV KHTN 8, NXB GDVN](https://sachdientu.nxbgd.vn/thu-vien-so/doc-sach/sgv-khoa-hoc-tu-nhien.4492016197) · [CIAAW](https://ciaaw.org/abridged-atomic-weights.htm)
