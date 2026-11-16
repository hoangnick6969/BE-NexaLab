# Báo cáo hiệu năng và best practices (2026-11-16)

| | |
|---|---|
| Trạng thái | **Giả thuyết, chưa đo.** Quét tĩnh + kích thước `dist` đã build; chưa chạy Lighthouse hay APM |
| Nhánh làm việc | BE và FE `perf/baseline-and-quick-wins` (tách từ `main` 2026-11-16) |
| Nguyên tắc | Đo trước khi tối ưu. Mỗi thay đổi đo lại, ghi vào `PERF.md` (kept / reverted); thay đổi không vượt nhiễu đo thì bỏ |

## Frontend (FE-NexaLab)

| # | Mức | Vấn đề | Hướng xử lý |
|---|---|---|---|
| 1 | Cao | Entry `index-*.js` 514 KB (164 KB gzip) + CSS 314 KB (54 KB gzip), ~220 KB gzip để mở trang (ngân sách JS 200 KB gzip). `src/app/App.tsx` import cứng `Login`, `Dashboard`, `LabLibrary`, `EmailVerification`, `NotificationBell`, `PasswordGate` (46 trang khác đã lazy) | `React.lazy` cho `Dashboard`, `LabLibrary`; `npx vite-bundle-visualizer` xem entry |
| 2 | Cao | `LessonDetail` 525 KB (161 KB gzip), `Lessons` 442 KB (139 KB gzip); `OrbitControls` 840 KB (225 KB gzip), `pdf` 483 KB, `katex` 262 KB. 40 file import tĩnh three/drei/pdfjs/katex/tiptap. `vite.config.ts` `chunkSizeWarningLimit: 1400` | `import()` động katex/react-markdown/pdf nếu không cần ở lần render đầu; hạ cảnh báo về 500; `manualChunks` cho react, three, katex |
| 3 | Cao | `src/styles.css` dòng 1 `@import` Google Fonts (9 trọng số Be Vietnam Pro, 5 Manrope), chặn render, không preconnect, gửi IP học sinh cho Google | Tự host woff2 subset latin + vietnamese, bỏ trọng số ít dùng (450, 550, 650, 750); tối thiểu `preconnect` + `<link>` trong `index.html` |
| 4 | Cao | KaTeX ship font `.ttf` | Ưu tiên woff2, chỉ giữ font dùng |
| 5 | TB | MediaPipe 42 MB trong `public/vision` (3 wasm ~11 MB, `hand_landmarker.task` 7,8 MB), upload lại mỗi deploy Vercel | Đưa lên CDN/R2 `Cache-Control: immutable`, giữ 1 biến thể wasm SIMD; báo dung lượng trước khi tải |
| 6 | TB | Ảnh thumbnail webp 18–36 KB ổn; chưa đối chiếu `width`/`height`/`loading="lazy"`/`decoding="async"` | Rà các `<img>` chống CLS |
| 7 | TB | React Query `staleTime: 15000` | Tăng (ví dụ 5 phút) cho dữ liệu hiếm đổi: danh mục môn, chương trình |

## Backend (BE-NexaLab)

| # | Mức | Vấn đề | Hướng xử lý |
|---|---|---|---|
| 8 | Cao | Không nén response (`compression` không có trong `package.json`/`main.ts`) | Middleware `compression` (hoặc nén ở proxy). Dễ và lợi nhất |
| 9 | Cao | ~243/267 `findMany` không `take`; nhiều nhất `assignments.service.ts` (20), `insights-loader.ts` (14), `progress.controller.ts` (12), `labs.controller.ts` (11). `subjects` và `open-curriculum` trong `catalog.controller.ts` tải toàn bộ bài học rồi ghép bằng JS | Ưu tiên endpoint học sinh gọi mỗi trang (dashboard, tiến độ, danh mục) và danh sách admin |
| 10 | Cao | `JwtGuard` (`auth.ts`) tra bảng `session` mỗi request; dev trỏ Supabase `ap-southeast-1` | Cache kiểm tra phiên 15–30 s trong bộ nhớ, xoá khi đăng xuất/khoá tài khoản (đánh đổi: thu hồi trễ tối đa bằng TTL) |
| 11 | Cao | Không có cache backend (chỉ 1 `Map` robots.txt; 1 `Cache-Control: no-store` ở gradebook); `docker-compose.yml` có Redis nhưng chưa dùng | Cache theo khoá gồm mọi đầu vào (vai trò, lớp); `Cache-Control: public, max-age` + ETag cho dữ liệu công khai |
| 12 | TB | N+1 ghi: `gradebook.service.ts:241` tạo từng `gradebookEntry` trong `for` (40 HS = 40 ghi); `admin-users.controller.ts` ~325–345; `content-release.ts`, `ai-assessments.service.ts` (nền) | `createMany` cho gradebook trước |
| 13 | TB | Pool 10 qua pgbouncer 6543 (đã tách `DIRECT_URL`, tốt); nhiều instance × 10 có thể chạm giới hạn Supabase | Theo dõi khi tăng tải |
| 14 | TB | 173 `@@index`/`@unique` cho 85 model, chưa thấy thiếu rõ | `EXPLAIN ANALYZE` trên truy vấn chậm thật rồi mới thêm |
| 15 | Triển khai | `vercel.json` rewrite `/api` → `nexalab-api.onrender.com` (thêm một hop); Render free có thể cold start 30–60 s | Xác nhận gói Render |
| 16 | Triển khai | Dockerfile `npm ci` cả devDependencies, không multi-stage; `npm run db:migrate` mỗi lần khởi động | Multi-stage, `npm ci --omit=dev` ở stage chạy; tách migrate khỏi start |

## Thứ tự đề xuất

1. Đo baseline: `npm run build`, preview cục bộ, `npx lighthouse` trang đăng nhập và dashboard, DevTools Network "Fast 4G". Không đụng Supabase dùng chung.
2. Bật nén backend (8).
3. Font tự host hoặc preconnect (3).
4. Lazy `Dashboard`/`LabLibrary`, tách chunk `LessonDetail` (1, 2).
5. Phân trang + cache endpoint danh mục (9, 11).
6. Cache kiểm tra phiên ngắn hạn (10).
7. Ghi từng thay đổi vào `PERF.md` với số đo trước/sau.
