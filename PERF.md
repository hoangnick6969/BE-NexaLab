# PERF.md: nhật ký hiệu năng

Mỗi thay đổi hiệu năng ghi một dòng với số đo trước và sau. Thay đổi không vượt nhiễu đo thì bỏ (reverted). Báo cáo gốc:
[`_bmad-output/specs/perf-review/perf-review-2026-11-16.md`](_bmad-output/specs/perf-review/perf-review-2026-11-16.md).

Cách đo backend: API dev cục bộ (`npm run dev`, cổng 4000), token admin, `curl -w '%{size_download} %{time_total}'`, mỗi phép đo
lặp 3–5 lần sau khi server đã nạp xong. DB dev là Supabase từ xa nên thời gian chủ yếu là vòng mạng tới DB.

| Ngày | Mục | Thay đổi | Trước | Sau | Kết luận |
|---|---|---|---|---|---|
| 2026-11-16 | 8 | Middleware `compression` (gzip, ngưỡng 1 KB) trong `src/main.ts` | `GET /api/labs` 84 973 B, không `content-encoding`; 0,77–0,79 s | 21 026 B gzip (−75 %); 0,73–0,93 s (bằng nhau trong nhiễu, không gzip 0,76–1,0 s). Client không gửi `Accept-Encoding` vẫn nhận JSON thô; body < 1 KB (`/api/subjects`) không nén | **Kept**: giảm 75 % dung lượng truyền, không tăng thời gian đo được |
| 2026-11-17 | 10 | `AuthGuard` cache kết quả kiểm tra phiên theo session id (`src/modules/auth/interface/session-cache.ts`), TTL `SESSION_CACHE_TTL_MS` mặc định 15 s, không vượt `expiresAt` của phiên. Xoá cache ngay trên instance hiện tại khi đăng xuất, refresh, đổi mật khẩu, quên mật khẩu, giáo viên đặt lại mật khẩu học sinh, admin sửa/khoá/xoá tài khoản | Mỗi request đã đăng nhập: 1 truy vấn `session.findFirst` + user, đo trực tiếp trên DB dev (Supabase ap-southeast-1): 76–83 ms, trung vị 78 ms | Request trong 15 s sau lần kiểm tra trước: 0 truy vấn (tiết kiệm ~78 ms/request). Đánh đổi: thu hồi làm trên **instance khác** có hiệu lực chậm tối đa 15 s; cùng instance có hiệu lực ngay | **Kept**. Test `session-cache.test.ts` 4/4 (TTL, theo chủ token, xoá, guard dùng lại cache rồi hỏi DB sau `forgetUser`); CI tắt cache cho server chạy script tích hợp vì script ghi DB trực tiếp |
| 2026-11-17 | 11 | Cache dùng chung trong tiến trình (`src/common/shared-cache.ts`, gộp các lần tải đồng thời, không giữ lỗi) cho `GET /subjects` và `GET /open-curriculum`, hai response giống nhau cho mọi người gọi. TTL `CATALOG_CACHE_TTL_MS` mặc định 60 s | Đo trực tiếp controller trên DB dev: `/subjects` 138–140 ms; `/open-curriculum` 425–520 ms (43 KB JSON, 3 truy vấn) | Khi trúng cache: ~0,1 ms. Đánh đổi: nội dung mới phát hành hiện sau tối đa 60 s | **Kept**. `shared-cache.test.ts` 3/3. Chưa thêm `Cache-Control` HTTP (endpoint cần đăng nhập) |
| 2026-11-17 | 12 | Chốt sổ điểm: `gradebookEntry.create` trong vòng lặp → một `createMany` | 1 lượt ghi mỗi học sinh (lớp 40 HS = 40 vòng mạng trong transaction, ~78 ms mỗi vòng tới DB dev) | 1 lượt ghi cho cả lớp | **Kept**. `assessment-mode.test.ts` 40/40 (gồm chốt lại lần 2) |
| 2026-11-17 | 16 | Dockerfile multi-stage: stage chạy chỉ `npm ci --omit=dev`, mang `dist`, `prisma`, `certs`, `content`; `prisma` chuyển sang `dependencies` (cần cho `prisma generate`/migrate ở stage chạy); `ENV HOST=0.0.0.0`; tách migrate khỏi start (`scripts/docker-start.sh`, `MIGRATE_ON_START=true` chạy `npm run db:migrate` có guard) | Image 1,71 GB. CMD cũ `npm run db:migrate && npm start`: guard `assert-isolated-db` từ chối mọi DB không phải loopback nên container **không khởi động được** với DB từ xa; app nghe `127.0.0.1` nên không gọi được từ ngoài container | Image 898 MB (−47 %). Smoke test với Postgres tạm: mặc định khởi động, `/api/health` `database: up`, gzip hoạt động; `MIGRATE_ON_START=true` vẫn bị guard chặn với host không phải loopback như cũ | **Kept**. Render hiện không dùng Dockerfile này (không có `render.yaml`; CMD cũ không thể chạy với Supabase) |

## Các mục không đổi code

| Mục | Kết luận |
|---|---|
| 9 Phân trang | Danh sách admin lớn (`GET /admin/users`, `GET /admin/audit`) đã có `limit` + cursor. Danh mục (`/subjects`, `/open-curriculum`) có kích thước theo nội dung đã phát hành, nay đã cache (mục 11). Danh sách theo học sinh bị chặn bởi dữ liệu của chính học sinh đó. Chưa đo được endpoint nào chậm vì thiếu `take`, nên không đổi contract API (đổi sang phân trang cần sửa FE cùng lúc). Đo lại khi có dữ liệu thật |
| 13 Pool kết nối | Theo dõi khi tăng tải; không có số đo để đổi |
| 14 Index | Chưa có truy vấn chậm thật để `EXPLAIN ANALYZE`; không thêm index đoán |
| 15 Render | Cần chủ dự án xác nhận gói Render (free có cold start 30–60 s); ngoài phạm vi code |
