# Lab Catalog — kế hoạch dùng thumbnail từ cảnh 3D thật

Trạng thái: **implementation is in the fetched FE branch; awaiting rendered catalog review**. Phạm vi là thumbnail trong catalog `/labs`; không thay ảnh lesson, ảnh OG hay scene đang chạy trong Lab Space.

## Kết luận audit

- FE catalog nằm ở `src/features/labs/LabLibrary.tsx`. `LabCards` lấy danh sách Lab từ `GET /labs`, sau đó chỉ render card học sinh nếu ID có trong metadata `src/features/labs/lab-info.ts`.
- Vùng `.lab-art` hiện là nền CSS theo môn học, chữ số và icon Lucide; chưa có ảnh raster/WebP cho thumbnail Lab trong FE. Vì vậy card hiện tại là hình trang trí/mockup, không phải hình chụp scene.
- Supabase SELECT-only hiện ghi nhận 4 Lab đủ điều kiện catalog cho học sinh, đều có release `ACTIVE` và model/renderer 3D: `circuit` (`circuit-bulb@1.0.0`), `em-induction` (`em-induction@1.0.0`), `density` (`density-bench@1.0.0`) và `mass-conservation` (`mass-conservation@1.0.0`). Đây là ảnh chụp trạng thái hiện tại; khi triển khai phải lấy danh sách từ API/release hiện hành.
- Scene nguồn đã có, không cần dựng lại model: `CircuitBulb3DStage` + `PhysicsStage`; `EmInduction3DStage`; `Density3DStage` + `FluidBench3D`; `WetBenchStage` + `PhysicalLabEnvironment`.
- Phòng nền vật lý được chia sẻ ở cấp source giữa các scene phù hợp. Thumbnail FL-10 được chụp từ chính scene có cân và hai cốc; không thêm dụng cụ vào phòng nền.
- **Đã đồng bộ 2026-11-01:** FE README now identifies FL-25 as active; catalog cards are still filtered by `GET /labs`, and this plan's release list remains a dated snapshot rather than a source of truth.

## Quyết định triển khai

Tạo **ảnh tĩnh WebP bằng cách chụp chính Canvas/scene 3D đang dùng trong Lab**, lưu cùng FE assets và hiển thị trong card. Không mount thêm một R3F Canvas cho từng card: 4 Canvas chạy đồng thời sẽ tăng tải GPU, thời gian tải và nguy cơ mất WebGL trên Chromebook/máy yếu. Không vẽ lại scene bằng SVG/mockup và không tạo hình thay thế bằng AI.

## Mapping cảnh → thumbnail

| Lab đang phát hành | Scene làm nguồn | Trạng thái chụp đề xuất |
|---|---|---|
| FL-01 Circuit Bulb | `physics/electricity/CircuitBulb3DStage.tsx` và phòng K1 | Mạch kín, bóng sáng, bộ pin/công tắc/dây nằm gọn trong khung; dùng trạng thái an toàn đã có trong activity. |
| FL-25 Cảm ứng điện từ | `physics/electricity/induction/EmInduction3DStage.tsx` và phòng K1 | Nam châm, cuộn dây, điện kế và máy phát đều nhận biết được; chụp ở trạng thái đứng yên, không có bàn tay/hoạt cảnh dở. |
| FL-03 Khối lượng riêng | `physics/fluid/density/Density3DStage.tsx` trên `FluidBench3D` | Chọn một station đại diện có cân, mẫu vật và dụng cụ đo rõ; specimen lấy từ config hiện hành, không tự tạo giá trị khoa học. |
| FL-10 Bảo toàn khối lượng | `chemistry/wet-bench/WetBenchStage.tsx` trên phòng nền dùng chung | Hai cốc đặt trên cân; giữ màu dung dịch theo scene thật và nhãn hóa chất đọc được; kết tủa trắng chỉ dùng nếu đó là trạng thái hoạt động đã được duyệt để minh họa. |

Không tạo thumbnail cho ID chỉ có lesson resource hoặc Lab chưa phát hành/không có scene 3D. Card những Lab đó tiếp tục dùng fallback đến khi có scene 3D tương ứng.

## Các bước implement

1. **Chốt shot list và trạng thái nguồn.** Lấy catalog/release IDs từ API; mỗi Lab chọn một trạng thái mặc định, camera và crop. Kiểm tra tên apparatus, trạng thái đo và nhãn hoá chất khớp scene/spec. Không lấy màn hình có panel câu hỏi, badge debug, cursor hay lỗi WebGL.
2. **Tạo cách capture lặp lại được.** Dùng Playwright mở các renderer/scene thật bằng trạng thái fixture xác định, chuyển sang 3D, chờ Canvas ổn định rồi chụp đúng vùng scene. Capture phải chạy local/dev, không tạo LabRun, Attempt hay event trong Supabase; ưu tiên harness/test fixture chỉ dùng presentation state, không thay logic scene sản phẩm.
3. **Xuất asset.** Lưu ở `src/features/labs/assets/thumbnails/` với tên theo ID ổn định (`circuit.webp`, `em-induction.webp`, `density.webp`, `mass-conservation.webp`). Kích thước đầu ra 1280×720, WebP, giữ apparatus trong safe area trung tâm để crop card desktop/mobile không cắt mất chủ thể. Capture PNG rồi dùng browser Canvas `toBlob("image/webp", 0.82)` để chuyển định dạng; kiểm tra MIME và kích thước kết quả, không cần thêm thư viện ảnh. Mục tiêu tối đa 120 KB mỗi ảnh.
4. **Gắn ảnh vào metadata card.** Import các WebP tĩnh vào `lab-info.ts` để Vite phát URL có content hash; thêm trường `thumbnail` vào từng entry; `LabLibrary` render `<img>` cùng alt text từ tên Lab, `loading="lazy"`, `decoding="async"`, `object-fit: cover`, kích thước/aspect ratio ổn định. Giữ fallback CSS/icon hiện tại cho ảnh lỗi và Lab không có 3D.
5. **Bảo toàn thông tin trên ảnh.** Giữ nhãn môn/số thứ tự trên lớp overlay có gradient nhẹ; chọn vị trí theo shot list, kiểm tra tương phản ở cả ảnh tối/sáng. Ảnh là trang trí bổ trợ nên alt có thể rỗng nếu tên Lab đã được đọc ngay bên cạnh; nếu ảnh truyền đạt apparatus riêng thì dùng alt mô tả ngắn.
6. **Cập nhật inventory/documentation.** Ghi mapping asset → scene/source state ở README hoặc metadata capture; sửa ghi chú release FL-25 đã lỗi thời. Không đưa ảnh thumbnail vào SimulationPack, LabRelease digest, DB hay bundle model 3D.

## Acceptance criteria

- Bốn Lab hiện ACTIVE dùng ảnh chụp từ đúng scene 3D của Lab; không còn icon/mockup làm thumbnail chính cho chúng.
- Ảnh không chứa UI điều khiển, câu hỏi, dữ liệu người học, cursor, debug badge hoặc nội dung bị cắt mất apparatus.
- FL-10 giữ được nhận diện hai cốc và cân; không đổi màu hóa chất hoặc bổ sung vật dụng khác spec để làm ảnh đẹp hơn.
- Card giữ tỷ lệ và chiều cao ổn định; kiểm desktop ba cột, tablet hai cột và mobile một cột. Ảnh hỏng/không có ảnh vẫn hiện fallback hiện hữu.
- Catalog chỉ tải tệp ảnh tĩnh; mở catalog không tạo Canvas/WebGL context mới. Tổng ảnh hiển thị ban đầu có ngân sách ≤480 KB (4 × 120 KB), cache được qua URL có content hash của Vite.
- FE build pass; kiểm tra rendered cards và crop ở desktop/mobile; xác minh không có thay đổi API, model, release digest hay dữ liệu DB.

## Phạm vi không bao gồm

- Không thêm ảnh cho các Lab chưa phát hành hoặc chưa có scene 3D.
- Không thay đổi phòng nền, geometry apparatus hay hoạt cảnh của bất kỳ Lab nào.
- Không tạo screenshot runtime mỗi lần mở catalog; thumbnail là asset tĩnh có thể regenerate khi scene/camera thay đổi.
- Không thực hiện capture, sửa UI, commit hoặc publish trong bước lập plan này.

## Kết quả triển khai local (2026-10-31)

- Đã tạo bốn WebP 1280×720 từ chính các stage R3F trong harness dev: Circuit, FL-25, density và FL-10. Tổng kích thước hiện tại khoảng 92 KiB; mỗi ảnh nhỏ hơn 32 KiB và giới hạn 120 KiB.
- Harness ở `nexalab-fe/tools/lab-thumbnail-capture/` và `nexalab-fe/src/features/labs/dev/lab-thumbnail-capture.tsx`; `npm run capture:lab-thumbnails` tự chạy/tắt Vite, chặn request `/api/**`, và tạo ảnh cho mọi fixture đăng ký hoặc ID được chỉ định nên không tạo LabRun/event hay ghi DB.
- Catalog dùng WebP tĩnh qua Vite asset imports, lazy loading, overlay chữ có gradient và giữ icon CSS làm fallback. Không khởi tạo Canvas trong card.
- Ảnh density chụp cân có mẫu vật và ống đong; camera override chỉ áp dụng trong harness, camera hoạt động của Lab không đổi.
- Vite `import.meta.glob` tự gắn ảnh theo Lab ID khi có file `.webp`; README FE mô tả cách thêm fixture, chụp mới và review ảnh. README cũng cập nhật trạng thái scene FL-25.
- `npm run lint` pass; `npm run build` pass khi retry ngoài sandbox sau `EPERM` realpath trong lần chạy bị sandbox chặn. Đã xem trực tiếp bốn ảnh; chưa có kiểm tra đăng nhập/render catalog trên trình duyệt ở desktop/mobile, nên trạng thái vẫn chờ review rendered catalog.
- Chưa thay đổi API, model, release digest, DB, commit hay remote.
