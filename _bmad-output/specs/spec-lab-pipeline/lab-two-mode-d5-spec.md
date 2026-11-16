# D-5: Contract hai mode trên cùng một Lab ID (Guided + Explore)

| | |
|---|---|
| Trạng thái | **Đề xuất, chờ owner chốt** (Q-1 đến Q-6 ở §6). Chưa code |
| Người viết | Dev 1, để gỡ D1-3.3 (phát hành FL-06 Explore) và các Lab Sinh học của Dev 2 |
| Cập nhật | 2026-11-16 |
| Liên quan | [Tracking O-3.1 và ghi chú hai mode tạm thời](lab-kit-delivery-tracking.md) · [phân công 20 slot §2](lab-kit-20-slot-delivery-spec.md) · [P0 C1](lab-mode-foundation-p0-spec.md) |

## 1. Vấn đề

Owner mở khoá D-5 ngày 2026-11-15 nhưng chưa có văn bản. Ghi chú của Dev 2 (2026-11-16) liệt kê ba điểm còn thiếu: cách khai báo hai mode trên một Lab ID, mode mặc định, nút chuyển.

Trong code hiện tại, `publishExploreLab` **ghi đè** `lab.config` thành con trỏ Explore (`{ mode: "explore", kit, engine, activity }`) và đặt `simulationModelRef` bằng engine của bàn Explore. Với một Lab đã có Guided, việc này làm hỏng bản Guided, nên BE chặn bằng `EXPLORE_LAB_HAS_GUIDED`. Hệ quả:

- **FL-06** (`lever-equilibrium`): Explore đã code xong và đã lên `main`, nhưng không phát hành được (D1-3.3).
- **FL-20, FL-21, FL-27, FL-16:** Dev 2 phát hành Explore thành Lab ID riêng (`fl-xx-explore`), lệch spec. FE đang gộp tạm hai thẻ (`exploreOf` trong `lab-info.ts`, `lab-modes.ts`).

## 2. Đề xuất contract

### 2.1 Khai báo (Q-1)

- Lab có Guided **giữ nguyên** mọi thứ của Guided: `simulationModelRef`, release, challenge, và phần config Guided hiện có.
- Explore được khai báo bằng một khối riêng **`lab.config.explore = { kit, engine, activity: { id, key, version, digest } }`**, cùng hình với con trỏ Explore hiện tại, chỉ là nằm trong khoá `explore`. Config lưu JSON nên **không cần migration**.
- Lab chỉ có Explore (FL-04, FL-08, FL-23, FL-24, FL-26) **giữ nguyên dạng hiện tại** (`config.mode = "explore"`), không phải phát hành lại.
- Hàm `declaredMode` thay bằng **`declaredModes(lab)`**, trả `["guided"]`, `["explore"]` hoặc `["guided", "explore"]`.

### 2.2 `GET /labs` (Q-1)

- Mỗi row giữ `mode` (mode chính, để client cũ không vỡ) và thêm **`modes: ("guided" | "explore")[]`**.
- Row hai mode có `mode: "guided"`, kèm khối `explore` y như Lab chỉ có Explore hiện nay (đã ghim, đã kiểm digest, `ok` hoặc mã lỗi). `resolveExplore` dùng lại nguyên vẹn, chỉ đọc con trỏ từ `config.explore` thay vì `config`.
- Khả năng thấy của học sinh: Explore hiện khi Lab đã phát hành và có khối `explore` hợp lệ; Guided vẫn theo release và quyền như cũ.

### 2.3 Phát hành (Q-2)

- `publishExploreLab` lên một Lab đã có Guided: **cho phép**, nhưng chỉ ghi `config.explore` và `practicalActivityVersion` của key `${labId}-explore`. **Không** đụng `simulationModelRef`, release, challenge hay config Guided.
- Vẫn từ chối khi: Lab là `foundationalLabId` của một khoá đang active (`EXPLORE_LAB_IN_COURSE`), topic không có, config không hợp lệ.
- Thêm thao tác admin **gỡ Explore** khỏi một Lab hai mode (xoá `config.explore`, giữ lịch sử activity version).
- Kiểm thử bắt buộc: sau khi phát hành Explore, Guided của Lab đó vẫn mở, nộp và chấm như trước (P0 nghiệm thu).

### 2.4 Mode mặc định (Q-3)

- **Guided là mặc định** khi học sinh có bài Guided được giao cho Lab đó, hoặc khi Lab có release Guided.
- Ngoài trường hợp trên, mở **mode học sinh chọn lần trước** (lưu trên máy theo Lab ID); lần đầu thì mở Guided.
- Link có thể chỉ định mode: `/labs/:id?mode=explore` (để giáo viên, Class Explore và thẻ "Khám phá tự do" mở thẳng Explore).

### 2.5 Nút chuyển (Q-4)

- Giữ cách Dev 2 đã làm tạm: **nút hai lựa chọn "Có hướng dẫn / Khám phá tự do" ở header Lab Space**, chỉ hiện khi row có cả hai mode.
- Chuyển mode **không** đụng bài Guided đang làm (attempt, nháp, bằng chứng). Explore vẫn không tạo LabRun, không chấm điểm. Nhật ký Explore giữ theo `labId@activity.id`.
- Danh sách `/labs` hiện **một thẻ** cho mỗi Lab ID, kèm badge "2 chế độ" như bản tạm.

## 3. Chuyển các Lab đang lệch (Q-5)

| Lab | Việc | Ai |
|---|---|---|
| FL-06 `lever-equilibrium` | Phát hành Explore lên chính Lab ID này (D1-3.3); kiểm lại Guided FL-06 | Dev 1 |
| FL-20, FL-21, FL-27, FL-16 | Phát hành lại Explore lên Lab ID Guided; ẩn (không xoá) các Lab `fl-xx-explore`; bỏ `exploreOf` và phần gộp tạm ở FE | Dev 2 |
| FL-01 và các Lab Guided khác | Không đổi; khi có ticket Explore thì dùng contract này | — |

Nhật ký Explore học sinh đã ghi trên `fl-xx-explore` gắn với Lab ID cũ, nên sẽ không chuyển sang Lab ID mới. Đề xuất chấp nhận mất các nhật ký này trên dev (dữ liệu dev, Explore không chấm điểm).

## 4. Class Explore (Q-6)

- Mẫu Class Explore FL-06 (`balance-the-lever`, D1-3.1) giao theo Lab ID `lever-equilibrium` và mở **mode Explore**: bài giao lớp dùng link `?mode=explore` và config đã ghim của bài giao.
- Bài Guided giao cho lớp vẫn mở mode Guided như cũ.

## 5. Phạm vi kỹ thuật (sau khi duyệt)

- **BE:** `declaredModes`, đọc con trỏ Explore từ `config.explore` khi Lab có Guided, nới `publishExploreLab` theo §2.3, thêm gỡ Explore, `modes` trong `GET /labs`, test (Guided còn nguyên sau khi phát hành Explore; Lab chỉ Explore không đổi).
- **FE:** đọc `modes`, chọn mode theo §2.4, nút chuyển §2.5, một thẻ mỗi Lab ID; giữ `exploreOf` tới khi Dev 2 chuyển xong rồi xoá.
- **Không cần migration** cơ sở dữ liệu. Không đổi `@nexalab/sim`.

## 6. Câu hỏi cho owner

Nếu đồng ý cả sáu đề xuất, chỉ cần trả lời "duyệt".

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-1 | Khai báo hai mode | `config.explore` trong Lab Guided; `GET /labs` thêm `modes`, giữ `mode` là mode chính; Lab chỉ Explore giữ nguyên |
| Q-2 | Phát hành Explore lên Lab có Guided | Cho phép nếu chỉ ghi `config.explore` và activity Explore, không đụng Guided; thêm thao tác gỡ Explore |
| Q-3 | Mode mặc định | Guided nếu có bài Guided được giao hoặc có release Guided; ngoài ra mở mode chọn lần trước; `?mode=explore` để mở thẳng |
| Q-4 | Nút chuyển | Nút hai lựa chọn ở header Lab Space, chỉ khi có cả hai mode; một thẻ mỗi Lab ID trên `/labs` |
| Q-5 | Lab đang lệch | FL-06 phát hành lên `lever-equilibrium` (Dev 1); FL-20, FL-21, FL-27, FL-16 phát hành lại lên Lab ID Guided và ẩn `fl-xx-explore` (Dev 2); chấp nhận mất nhật ký Explore cũ trên dev |
| Q-6 | Class Explore | Bài giao Class Explore mở `?mode=explore` trên Lab ID Guided |
