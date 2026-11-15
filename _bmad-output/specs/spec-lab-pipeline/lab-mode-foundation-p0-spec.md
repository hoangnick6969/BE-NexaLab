---
id: SPEC-lab-mode-foundation-p0
status: proposed
date: 2026-11-15
revision: 4 (tổ chức theo 4 Kit + bàn + thư viện item dùng chung; Foundational Explore là open curriculum; không cần duyệt bộ môn)
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
| H5 | `db:seed:k2-explore` không có guard DB cô lập. Nó cho ghi DB dùng chung bằng token, trái với `AGENTS.md`. | `package.json:95`; seed `:30, 99-100` |

**C1.1 Mode khai báo tách khỏi tình trạng config**

- `Lab.config` của Lab Explore có đúng dạng `{ mode: "explore", kit, engine, activity: { id, key, version, digest } }`. Seed bỏ các bản sao `explore`, `reviewStatus`, `rendererKey`.
- `declaredMode(lab)` trả `"explore"` khi `Lab.config.mode === "explore"`, ngược lại trả `"guided"`. Hàm này không parse config.
- Server phân giải Lab Explore thành một trong hai kết quả:
  - `{ ok: true, activity, explore }`;
  - `{ ok: false, code }`, với `code` thuộc `EXPLORE_VERSION_MISSING | EXPLORE_DIGEST_MISMATCH | EXPLORE_KIT_UNSUPPORTED | EXPLORE_CONFIG_INVALID`.
- Kết quả `ok: false` thì **chặn mở bàn** và hiện mã lỗi. Lab không rơi sang Guided.
- FE `Lab.tsx` rẽ nhánh theo thứ tự:
  1. Có `assignmentId`/`resourceId`: vào đường hiện có (`Lab.tsx:244-253`). Đường Class Explore (C3) sẽ rẽ tiếp theo mode của bản giao.
  2. Không có: đọc query `["labs"]`, phân biệt bốn trạng thái:
     - **đang tải**;
     - **lỗi API**, kèm nút thử lại;
     - **không có dòng**: giữ màn "Phòng thực hành chưa được phát hành" của `GuidedLab` (`Lab.tsx:387`);
     - **có dòng**: mở theo `declaredMode`.
  - Bỏ `isExploreLab` dựa trên bundle.

**C1.2 Bàn chạy bản đã ghim**

- `PracticalActivityVersion.spec.explore` chứa toàn bộ config của bàn, đã qua validator lúc ghi. Digest khi đó bao cả config.
- `GET /labs` với dòng Explore:
  - đọc các version bằng **một** truy vấn;
  - kiểm `digest(spec)` = `version.digest` = `Lab.config.activity.digest`;
  - kiểm bàn (`kit`) có trong registry server và `spec.explore` qua schema của bàn;
  - trả `explore` và `activity` từ bản ghim.
- Không cần bảng hay endpoint mới.
- FE chỉ dùng `explore` từ server. Config đóng gói chỉ còn cho route dev và làm đầu vào của seed. `ExploreBench` được `key` theo `activity.id`.
- Khóa lưu cục bộ của Explore mở là `labId@activity.id`. Dữ liệu theo khóa cũ không chuyển sang, vì đó là ghi chép chưa chấm.

**C1.3 Seed và tiến độ**

- Seed của mọi bàn chạy qua npm script có `pre…` gọi `scripts/assert-isolated-db.mjs`. Seed không có đường ghi DB dùng chung.
- **Phát hành lên DB dùng chung là thủ tục owner riêng**, có ghi chép.
- Seed từ chối khi:
  - Lab đích đã có challenge hoặc release;
  - Lab đích đang là `foundationalLabId` trong một khóa active.
- Integration test trên DB cô lập: dùng Lab Explore không tạo `LabRun`, `Attempt` hay `Progress`.
- **Hai dòng legacy trên DB dùng chung** (`acid-base-indicators`, `metal-reactivity`):
  - trước khi chuyển BE/FE, chạy truy vấn chỉ-SELECT kiểm `Lab.config.activity` và `spec.explore` của version;
  - sau khi chuyển, hai dòng báo `EXPLORE_CONFIG_INVALID` hoặc `EXPLORE_VERSION_MISSING` cho tới khi owner phát hành bản ghim mới;
  - P0 không sửa dữ liệu dùng chung.

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
  - prompt ID được chọn;
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
- Lúc mở và lúc nộp, server kiểm quyền thành viên lớp, đối tượng giao và digest. Tutor dùng cùng điều kiện cho bài lớp.
- Bài nộp lưu ở bảng riêng, unique theo (học sinh, bài giao, idempotency key). Retry của cùng học sinh trên cùng bài giao trả bài đã lưu.
- Bài nộp có trạng thái `Đã nộp` → `Đã nhận xét`. Không tạo LabRun, Attempt hay Progress.
- Khóa nháp cục bộ theo học sinh + bài giao + version.

**C3.5 Điều kiện đưa cho lớp thật**

- **Bắt buộc:** C3.2 pass, tức allow-list của cấu hình mẫu và validator strict.
- **Không cần review bộ môn** (D-4). Nội dung do NexaLab biên soạn.
- Việc đưa nội dung lên DB dùng chung đi theo thủ tục phát hành owner ở C1.3.

## 4. Quyết định

| ID | Nội dung | Trạng thái |
|---|---|---|
| D-1 | (F0-7a) Foundational Explore còn `unverified` có hiện cho học sinh không | **Chốt: hiện, kèm nhãn** (open curriculum) |
| D-2 | Quy ước khối lượng mol của bàn ướt (Kit Hóa học) | Đề xuất dùng quy ước bài tập KHTN 8 mà NexaLab chọn, ghi rõ sách và trang. Căn cứ ban đầu: SGV KHTN 8 (NXB GDVN) Bài 3 dùng Fe = 56, CaCO₃ = 100; căn cứ này chưa xác nhận cả bảng. Người biên soạn NexaLab chốt bảng đầy đủ. Áp dụng trong pilot. |
| D-3 | Bỏ config FE đóng gói trên route chính | Đề xuất **bỏ**, theo C1.2 |
| D-4 | Class Lab Explore có cần review bộ môn trước khi đưa cho lớp thật | **Chốt: không cần.** Nội dung do NexaLab biên soạn; chỉ cần allow-list và validator strict |

F0-7b (đổi mode FL-10) không thuộc spec này.

## 5. Phạm vi triển khai P0 và mốc "Contract done"

P0 gồm hai phần. Cả hai xong thì dev các Kit khác bắt đầu làm song song.

**5.1 C1, chạy Lab Explore**

```
D-3 chốt ─► C1.1 mode ─► C1.2 ghim ─► C1.3 seed/tiến độ     (một PR BE+sim, một PR FE)
```

**5.2 Hạ tầng chung để chia việc song song.** Các story F0 sẵn có trong backlog, cộng thêm phần C2.1:

| Việc | Nội dung | Xong khi |
|---|---|---|
| F0-1 Envelope | Tách `ExploreLabEnvelope` và `ObservationPrompt` sang `packages/sim/explore/envelope.ts`. `ChemistryLabConfig` mở rộng từ envelope | Test sim pass, bàn ướt không đổi hành vi |
| F0-2 Registry đa bàn | FE: `{ kit, group, validate, loadPage, listKitItems }`. BE: `{ kit, validate }` (C1.2) | `/labs/:id` mở được Explore của **2 bàn khác nhau**. Bàn thứ hai có thể là fixture tối giản chỉ dùng cho test |
| F0-4 Nhật ký dùng chung | Tách phần chung của `observation-log.ts` | Bàn khác chỉ cần viết `describeChange()` |
| F0-5 Seed đa bàn | `scripts/seed-explore-labs.ts --kit <bàn>`, có guard cô lập (C1.3) | Seed bàn ướt qua script mới cho kết quả giống hệt script cũ |
| C2.1 Khung thư viện item | Tạo `src/features/labs/shared/items/`, kiểu item, quy ước anchor. **Một người chịu trách nhiệm** thư mục này: item chung được thêm qua PR riêng, không gộp trong PR của bàn | Khung, test kiểu và README quy ước có trong repo. Cốc và cân được thêm ở pilot bước A |
| Mẫu spec áp dụng | Mẫu một trang cho mỗi bàn: điền bảng C2.3, liệt kê item riêng và item dùng chung, loại yêu cầu bàn hỗ trợ, Lab nào có Explore | File mẫu nằm cạnh spec này |

**5.3 Mốc "Contract done"**

- [ ] Nghiệm thu C1 (§7) pass.
- [ ] Tất cả việc ở 5.2 đạt cột "Xong khi".
- [ ] Tài liệu ở §6 đã cập nhật.

Sau mốc này:

| Việc | Ai làm |
|---|---|
| Explore và danh mục item của từng bàn (C1 + C2.3) | **Dev các Kit, song song** |
| Class Lab Explore (C3) cho bàn khác bàn ướt | Chỉ sau khi pilot Kit Hóa học xong **bước C**, khi schema `classTemplates` và bảng bài nộp đã chạy bằng code thật |

C2 và C3 là chuẩn. Bàn ướt (Kit Hóa học) áp dụng chúng đầu tiên ở pilot. Mỗi bàn sau viết spec áp dụng theo mẫu ở 5.2. Item dùng chung đi vào thư viện C2.1 khi bàn thứ hai cần đến.

## 6. Sửa tài liệu kèm theo

- **Kiến trúc Explore:**
  - §0.2: Explore của lớp có bài nộp riêng theo C3.4, vẫn không tạo Attempt.
  - Khóa IndexedDB đổi sang `labId@activity.id`.
  - Dòng DoD "chỉ ghi DB dùng chung khi có phê duyệt" đổi thành "seed chỉ chạy trên DB cô lập; phát hành là thủ tục owner".
- **Backlog F0:**
  - Ghi D-1 vào F0-7a.
  - F0-6 không còn là cổng phát hành (D-4). `reviewStatus` chỉ còn tác dụng hiện nhãn.
  - F0-5 bỏ "biến phê duyệt ghi DB dùng chung".
  - F0-2 thêm `group` và `listKitItems` vào mục đăng ký.
  - F0-3 (hạ tầng tương tác dùng chung) mở rộng thành thư viện item dùng chung C2.1.
- **Thiết kế K2:**
  - §5: giáo viên chọn trong allow-list của `classTemplates`.
  - Dòng 19: FL-13 Explore đã có.
- **Portfolio** dòng 74: FL-14a Explore đã có, FL-14 đầy đủ thì chưa.
- **Danh mục kit** (`lab-catalog-and-shared-kits-khtn8-9.md`): thêm một dòng ở đầu bảng kit, ghi rằng mô hình 4 Kit + bàn ở §2.1 thay cho cách chia 9 kit; K1–K8/EX-A là tên bàn.
- **`sprint-status.yaml`:** thêm `p0-explore-run-contract`, `chem-wet-bench-pilot`, `wet-bench-molar-mass-convention`.

## 7. Nghiệm thu P0 (C1)

Tất cả chạy trên DB cô lập.

- [ ] Route manifest không đổi.
- [ ] Lab có `mode: "explore"` mà config sai, bàn lạ, thiếu version hoặc sai digest thì hiện panel lỗi kèm mã. Không mở `GuidedLab`, không dùng config đóng gói.
- [ ] Lab Explore hợp lệ mở được dù không có trong bundle FE. FL-10 vẫn mở Guided. Class Guided qua `assignmentId`/`resourceId` vẫn mở, nộp và chấm được, kể cả bài giao trước thay đổi.
- [ ] Sửa `Lab.config` mà không tạo version mới thì bàn không đổi, hoặc báo `EXPLORE_DIGEST_MISMATCH`. Seed config mới thì tạo version mới, bàn khởi tạo lại với khóa lưu mới, bản cũ giữ nguyên.
- [ ] Học sinh mở được FL-13 khi dữ liệu còn `unverified`, có nhãn.
- [ ] `npm run db:seed:k2-explore` thất bại trên DB không cô lập. Seed từ chối Lab đã có challenge/release hoặc đang là `foundationalLabId`.
- [ ] Dùng Lab Explore không tạo `LabRun`, `Attempt` hay `Progress`.
- [ ] Playwright FL-13 (mở, đo pH, danh sách dụng cụ) và `tests/fl-10-k2.spec.ts` pass. Lint, test và build ở BE; lint và build ở FE.

## Tham chiếu

- [Pilot Kit Hóa học](lab-kit-assets-and-class-lab-spec.md) · [Danh mục kit cũ](lab-catalog-and-shared-kits-khtn8-9.md) · [Kiến trúc Explore](../../../docs/product/explore-first-lab-architecture-spec.md) · [Backlog F0](../../../docs/bmad/explore-labs-backlog-and-epics.md) · [Thiết kế K2](k2-wet-bench-explore-kit-design.md)
- Code: [seed K2](../../../scripts/seed-k2-explore-labs.ts) · [catalog](../../../src/modules/curriculum/interface/catalog.controller.ts) · [Class Lab hiện tại](../../../src/modules/classes/application/class-lab-resource.ts) · [nộp Guided](../../../src/modules/labs/interface/labs.controller.ts) · [contracts K2](../../../packages/sim/wet-bench/contracts.ts) · [validator K2](../../../packages/sim/wet-bench/validate-config.ts)
- Căn cứ D-2: [SGV KHTN 8, NXB GDVN](https://sachdientu.nxbgd.vn/thu-vien-so/doc-sach/sgv-khoa-hoc-tu-nhien.4492016197) · [CIAAW](https://ciaaw.org/abridged-atomic-weights.htm)
