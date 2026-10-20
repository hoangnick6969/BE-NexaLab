# NexaLab — Backend

**Chạm vào khoa học. Học qua từng lần thử.**

NexaLab là nền tảng học tập dành cho học sinh THCS, kết hợp bài học, mô hình 3D tương tác và phòng thí nghiệm ảo cho ba môn **Sinh học — Hóa học — Vật lý**. Học sinh có thể tự lắp ráp, chạy thí nghiệm, quan sát kết quả và điều chỉnh bài làm với các gợi ý phù hợp.

Repository này cung cấp API, dữ liệu học tập, phân quyền, engine mô phỏng và dịch vụ hướng dẫn của NexaLab.

[Frontend](https://github.com/hoangnick6969/FE-NexaLab) · [Backend](https://github.com/hoangnick6969/BE-NexaLab) · [Mô hình khoa học](docs/SCIENTIFIC-MODELS.md)

## Ý tưởng sản phẩm

NexaLab hướng đến vòng lặp học tập:

**Học lý thuyết → Khám phá → Thực hành → Nhận kết quả → Hiểu lỗi → Thử lại.**

Engine mô phỏng là nơi tính toán và chấm kết quả khoa học. Tutor đọc trạng thái bài làm để hướng dẫn học sinh; không thay thế engine hoặc tự quyết định điểm số.

## Người dùng

| Vai trò | Chức năng chính |
| --- | --- |
| Học sinh | Học bài, làm quiz, thực hành lab, nhận gợi ý, lưu thí nghiệm và xem tiến độ cá nhân |
| Giáo viên | Soạn bài, quản lý lớp, duyệt thành viên, giao bài và xem bằng chứng thực hành |
| Phụ huynh | Liên kết với con bằng mã dùng một lần, xem tiến độ và mức độ cần trợ giúp |
| Quản trị viên | Quản lý người dùng, môn học và metadata/trạng thái/asset của các lab |

## Tính năng hiện có

- **Tài khoản & phân quyền:** học sinh dùng username do giáo viên/trường cấp; người lớn dùng email; Argon2, JWT access, refresh token xoay một lần, cookie HttpOnly và kiểm tra quyền tại API.
- **Nội dung học:** môn, chương, bài học, metadata, rich text, quiz, học liệu đính kèm và vòng đời nháp/xuất bản/lưu trữ.
- **Lớp học:** mã tham gia, duyệt thành viên, cấp tài khoản học sinh, giao bài cả lớp hoặc nhóm, hạn nộp và theo dõi tiến độ.
- **Thực hành:** lưu lượt thử, kết quả chấm ba trạng thái, lịch sử gợi ý và cấu hình thí nghiệm để mở lại.
- **Tutor:** Context Builder, bốn cấp gợi ý, chỉ tăng cấp sau lượt thử mới; nhận diện một số mẫu hiểu sai và cung cấp chứng cứ cho giáo viên.
- **Phụ huynh:** kiểm tra quan hệ cha mẹ–con tại API; không trả nội dung gợi ý chi tiết cho phụ huynh.
- **Học liệu:** upload PDF, PNG, JPEG, MP4 và GLB; giới hạn 20 MB, kiểm tra chữ ký file và quyền đọc.

### Ba kịch bản thực hành

| Lab | Nội dung | Cách đánh giá |
| --- | --- | --- |
| Vật lý — Mạch điện | Nguồn, LED, điện trở, công tắc, nhánh nối tiếp/song song độc lập | Kiểm tra mạch kín và dòng qua LED theo mô hình đã định nghĩa |
| Hóa học — Phản ứng | Sáu phản ứng cố định, tỉ lệ mol và chất dư | Tính mức tiến triển và lượng chất còn lại |
| Sinh học — Mắt người | Khám phá cấu tạo và kiểm tra tên tám bộ phận | Chấm câu trả lời trên server |

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| API | NestJS, TypeScript, Node.js |
| Dữ liệu | PostgreSQL, Prisma, migrations |
| Xác thực | JWT, Argon2, session lưu trong database |
| Mô phỏng | Package TypeScript thuần hàm `@nexalab/sim` |
| Tutor | Template theo luật và adapter Claude tùy chọn |
| Kiểm thử | Vitest, test tích hợp HTTP; Playwright ở repo frontend |
| API docs | Swagger tại `/api/docs` |
| Môi trường | Docker Compose, GitHub Actions |

## Kiến trúc

```text
React / 3D Viewer / Lab Canvas
              │
          NestJS API
              ├── Auth & RBAC
              ├── Lessons / Classes / Assignments
              ├── Simulation Engine → Challenge result
              ├── Context Builder → Tutor → HintLog
              └── Progress / Saved experiments / Parent links
                         │
                    PostgreSQL
```

Client có thể xem trước bằng cùng phiên bản engine, nhưng **server luôn tính lại kết quả chính thức**.

## Bắt đầu

Yêu cầu Node.js **22.19+**, npm và PostgreSQL. Có thể dùng Docker Compose để chuẩn bị PostgreSQL và Mailpit.

```bash
git clone https://github.com/hoangnick6969/BE-NexaLab.git
cd BE-NexaLab
npm ci
```

Sao chép `.env.example` thành `.env`, rồi cấu hình:

- `DATABASE_URL`: kết nối PostgreSQL riêng cho dự án.
- `JWT_SECRET`: chuỗi ngẫu nhiên ít nhất 32 ký tự; không giữ giá trị mẫu.
- `SEED_PASSWORD`: mật khẩu riêng cho các tài khoản dữ liệu mẫu.
- `WEB_ORIGIN`: mặc định `http://localhost:5173`.
- Các biến `SMTP_*`: dịch vụ gửi email hoặc hộp thư phát triển.

```bash
docker compose up -d postgres mailpit
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

| Địa chỉ | Dịch vụ |
| --- | --- |
| `http://127.0.0.1:4100/api/health` | Health check |
| `http://127.0.0.1:4100/api/docs` | Swagger |
| `http://localhost:8025` | Mailpit khi chạy bằng Compose |

Seed tạo học sinh `nguyenan.8a` và các tài khoản người lớn `teacher@nexalab.local`, `parent@nexalab.local`, `admin@nexalab.local`, dùng mật khẩu từ `SEED_PASSWORD`. Mã lớp mẫu: `NEXA8A`. Chạy lại seed không ghi đè mật khẩu của tài khoản đã tồn tại.

## Mô hình xác thực

Học sinh không tự đăng ký và không cần email. Giáo viên cấp tài khoản trong một lớp bằng `POST /api/classes/:classId/students`; API tạo mật khẩu tạm có hiệu lực 24 giờ và chỉ trả về một lần. Học sinh đăng nhập bằng `POST /api/auth/student/login` rồi bắt buộc đổi mật khẩu trước khi truy cập nội dung khác. Giáo viên có thể cấp lại mật khẩu qua `POST /api/classes/:classId/students/:studentId/reset-password`; thao tác này thu hồi mọi phiên hiện có của học sinh.

Giáo viên, phụ huynh và quản trị viên đăng nhập bằng email qua `POST /api/auth/login`. Chỉ phụ huynh được tự đăng ký ở MVP. Quên mật khẩu qua email chỉ áp dụng cho tài khoản người lớn. Mã tham gia lớp, mã liên kết phụ huynh và mật khẩu tạm là ba loại thông tin độc lập, không dùng thay cho nhau.

Nếu không dùng Mailpit, `node scripts/mailbox.mjs` mở SMTP nội bộ trên cổng 1025 và hộp thư xem email trên cổng 8025. Không chạy đồng thời cả hai trên cùng cổng.

### Chạy bằng Docker

```bash
docker compose --profile full up -d --build
docker compose --profile full exec api npm run db:seed
```

Container API chạy migration khi khởi động. Việc nạp dữ liệu mẫu là bước riêng, không tự thực hiện trên môi trường production.

### Công cụ Windows

`scripts/Start-NexaLab.ps1` và `scripts/Stop-NexaLab.ps1` hỗ trợ bật/tắt API, frontend ở thư mục `../FE-NexaLab` và hộp thư local. Script cần hai repo đã cài dependency, backend đã build và `.env` hợp lệ. Phần PostgreSQL local nhận diện cụm riêng `.local/postgres` khi có binary PostgreSQL 18 tại đường dẫn cài đặt mặc định; trên máy khác có thể dùng Compose.

## Cấu hình Tutor

Không có API key, Tutor dùng template theo luật và vẫn hỗ trợ đầy đủ bốn mức gợi ý.

Để bật adapter Claude, đặt `ANTHROPIC_API_KEY` và `ANTHROPIC_MODEL` phù hợp với tài khoản trong `.env`, rồi khởi động lại API. Mức 1–2 dùng template; mức 3–4 có thể bổ sung câu hỏi định tính từ mô hình. Kết quả khoa học vẫn do engine cung cấp. Khi timeout, lỗi hoặc đầu ra không hợp lệ, hệ thống quay về template.

## Kiểm thử

```bash
npm run lint
npm test
npm run build
npm run test:integration
```

Test tích hợp cần API và database seed đang chạy. Các tài khoản fixture `it-*` được dọn sau test. Luồng reset mật khẩu có test riêng `node scripts/password-flow.mjs`, cần hộp thư `scripts/mailbox.mjs`. Chạy các bộ kiểm thử đăng nhập nối tiếp, cách nhau đủ cửa sổ rate limit; không dùng database production.

Bản MVP đã được kiểm tra với 19 unit tests mô phỏng, 46 assertion tích hợp API và 6 kiểm tra khôi phục mật khẩu. Repo FE có bốn ca Playwright cho ba lab và responsive.

## Cấu trúc thư mục

```text
src/<domain>/         Mỗi thư mục là một Nest module: auth, users, curriculum, lessons,
                      classes, progress, learning, labs, parents, reports, assets,
                      content, admin; infra và common là module global
packages/sim/         Engine mô phỏng dùng chung và unit tests
prisma/               Schema, migrations và dữ liệu mẫu
scripts/              Test tích hợp, mailbox và tiện ích Windows
docs/                 Giả định và giới hạn mô hình khoa học
.github/workflows/    CI lint, test và build
```

Chi tiết và quy ước: [docs/architecture/project-structure.md](docs/architecture/project-structure.md).

### Đồng bộ engine sang frontend

FE sử dụng tarball version hóa để có thể cài độc lập. Khi thay đổi engine: cập nhật version, chạy unit tests, đóng gói lại và cập nhật dependency bên FE.

```bash
npm pack ./packages/sim --pack-destination ../FE-NexaLab/vendor
# Trong repo FE:
npm install ./vendor/nexalab-sim-<version>.tgz
```

## Trạng thái & hướng phát triển

Dự án hiện là **MVP**, chưa hoàn thành toàn bộ phạm vi blueprint.

- Mô hình mắt là mesh minh họa, chưa phải asset giải phẫu được chuyên gia duyệt; GLB upload chưa tự thay thế mô hình dựng sẵn.
- Lab Hóa dùng số mol trực tiếp; thao tác rót/đun và mô phỏng nồng độ/thể tích là hướng phát triển tiếp theo.
- Claude adapter cần key/model riêng; chưa xác nhận bằng cuộc gọi dịch vụ thật trong bộ kiểm thử hiện tại.
- Upload hiện dùng ổ đĩa, rate limit dùng bộ nhớ một API process. Redis/MinIO có cấu hình Compose nhưng chưa tích hợp vào luồng chạy.
- BullMQ, realtime, Sentry, báo cáo tuần và tự động deploy chưa triển khai.

Đọc [SCIENTIFIC-MODELS.md](docs/SCIENTIFIC-MODELS.md) trước khi thay đổi công thức hoặc nghiệm thu nội dung. Trước khi sử dụng với học sinh thật, cần kiểm duyệt chuyên môn và quy trình chấp thuận dữ liệu phù hợp. Không đưa `.env`, API key, dữ liệu database hoặc học liệu riêng tư lên repository.
