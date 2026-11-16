# PERF.md: nhật ký hiệu năng

Mỗi thay đổi hiệu năng ghi một dòng với số đo trước và sau. Thay đổi không vượt nhiễu đo thì bỏ (reverted). Báo cáo gốc:
[`_bmad-output/specs/perf-review/perf-review-2026-11-16.md`](_bmad-output/specs/perf-review/perf-review-2026-11-16.md).

Cách đo backend: API dev cục bộ (`npm run dev`, cổng 4000), token admin, `curl -w '%{size_download} %{time_total}'`, mỗi phép đo
lặp 3–5 lần sau khi server đã nạp xong. DB dev là Supabase từ xa nên thời gian chủ yếu là vòng mạng tới DB.

| Ngày | Mục | Thay đổi | Trước | Sau | Kết luận |
|---|---|---|---|---|---|
| 2026-11-16 | 8 | Middleware `compression` (gzip, ngưỡng 1 KB) trong `src/main.ts` | `GET /api/labs` 84 973 B, không `content-encoding`; 0,77–0,79 s | 21 026 B gzip (−75 %); 0,73–0,93 s (bằng nhau trong nhiễu, không gzip 0,76–1,0 s). Client không gửi `Accept-Encoding` vẫn nhận JSON thô; body < 1 KB (`/api/subjects`) không nén | **Kept**: giảm 75 % dung lượng truyền, không tăng thời gian đo được |
