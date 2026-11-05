# Teacher AI và Student AI — đối chiếu hướng phát triển

**Ngày đối chiếu:** 05/11/2026  
**Phạm vi:** code hiện có, TAI specs và hướng đã nêu. Đây là đối chiếu source/tài liệu; chưa chạy test và chưa xác nhận UI bằng browser.

## Kết luận nhanh

**Hướng sản phẩm nhất quán với codebase nếu server giữ quyền kiểm tra và quyết định chính thức, AI chỉ đề xuất, giáo viên duyệt.** Có thể phát triển Teacher core UX/import song song với việc chốt spec AI. TAI-01 phụ thuộc luồng Class Resources; provider call phải chờ duyệt scope, điều khoản provider và cách xử lý dữ liệu.

**Teacher AI chưa phải tính năng đã có.** TAI-01..06 là draft/backlog. Code hiện có một adapter Anthropic riêng cho gợi ý Lab; chưa có AI job chung, Gemini adapter, credit ledger, bài viết/rubric hay phòng trao đổi.

**Student AI theo luật (không gọi LLM) đã có trên nhánh `research/student-ai`, chưa merge vào main** (cập nhật 06/11/2026): gợi ý từng bước cho 11 Foundational Lab và quiz bài học, giải thích kết quả, nhận diện lỗi hiểu sai, "Nếu… thì sao?", tóm tắt cho phụ huynh và giáo viên. Student AI hội thoại (SAI-04) vẫn chưa có và chờ cổng SG-2. Xem mục 7.

## 1. Code hiện tại và spec hiện tại

| Khu vực | Code hiện có | Spec/hướng đích | Khoảng cách chính |
| --- | --- | --- | --- |
| Class resources | `DECK`, `STUDY_QUIZ`, `TEST`; DRAFT, publish, version; import CSV UTF-8 | AI tạo thẻ/quiz/test, duyệt từng mục rồi tạo DRAFT | Chưa có luồng AI; import chưa phải import file tổng quát; cần chốt hợp đồng câu hỏi dùng chung |
| Quiz/test | TEST được chấm phía server; submission hiện bắt buộc có điểm và số câu đúng | Quiz luyện tập, bài kiểm tra ma trận, nhiều mã đề | Chưa có question bank, metadata chủ đề/mức độ hay `formId` trong submission |
| Lab hints | Template theo luật; adapter Anthropic tùy chọn; lỗi thì fallback | Student AI rộng hơn; Teacher AI gợi ý tham số mô phỏng | Lab adapter không phải Teacher AI hay Student AI hội thoại |
| Bài tự luận | Chưa có written task/rubric trong luồng hiện hành | Giáo viên chấm thủ công; AI gợi ý từng tiêu chí và dẫn chứng | Cần kiểu bài/nộp bài chưa chấm; schema hiện tại không khớp |
| AI runtime/credits | Chưa thấy module/job/ledger chung trong code | TAI-01 đề xuất Gemini + worker; TAI-05 ledger | Đặc tả chưa triển khai; provider và thứ tự credit chưa được duyệt |
| Similarity/insights | Chưa thấy TAI-03/04 runtime | So bài cùng assignment; tín hiệu theo luật | Đặc tả, không phải kết luận gian lận hay dự đoán điểm |
| Student AI | Trên nhánh `research/student-ai`: gợi ý, giải thích, lỗi hiểu sai, "Nếu… thì sao?" theo luật (mục 7) | Student AI hội thoại giới hạn (SAI-04) | Hội thoại chờ SG-2; spec riêng `spec-student-ai-*`, không nằm trong TAI |
| Phòng trao đổi / đề ma trận | Chưa có luồng tương ứng trong TAI-01..06 | Giáo viên nhắn; lập ma trận/mã đề | Cần spec và cổng riêng, không nằm trong increment TAI hiện tại |

**Bằng chứng code chính:** [class resource contract](../../src/modules/classes/application/class-resource-contract.ts), [resource import](../../src/modules/classes/application/class-resources.service.ts), [assignment schema](../../prisma/schema.prisma), [Lab LLM adapter](../../src/modules/labs/infrastructure/llm.ts). Spec: [TAI roadmap](../../_bmad-output/specs/spec-teacher-ai-authoring/teacher-ai-roadmap.md), [TAI increment](../../_bmad-output/planning-artifacts/increment-tai-teacher-ai.md).

## 2. TAI-01 dự kiến chạy như thế nào

```text
Giáo viên chọn lớp, bài học, loại nội dung, số lượng và mức độ
  → Server kiểm quyền sở hữu, lớp/bài còn dùng được, giới hạn và request trùng
  → Server lưu AiJob + snapshot nội dung bài học (PENDING)
  → Worker lấy job bằng lease, dựng prompt có phiên bản
  → Provider nhận snapshot bài học + chuẩn đầu ra + chỉ dẫn giáo viên
  → Server kiểm schema, nguồn trích, nội dung và cờ trùng/tương tự
  → Server lưu mục hợp lệ và cờ cảnh báo; bỏ raw text provider
  → Giáo viên giữ/sửa/bỏ từng mục
  → Mục được giữ vào ClassResource DRAFT
  → Giáo viên chỉnh và publish theo luồng hiện tại
```

TAI-01 spec đề xuất worker polling DB (2 giây), lease 90 giây, timeout provider 60 giây, tối đa hai lần thử. Đây là **pipeline trên giấy**; code chưa có `AiJob`/worker này. Xem [provider và data flow](../../_bmad-output/specs/spec-teacher-ai-authoring/provider-and-data-flow.md).

## 3. Provider và dữ liệu

| Tác vụ | Provider | Trạng thái và dữ liệu |
| --- | --- | --- |
| Gợi ý Lab cho học sinh | Anthropic API tùy cấu hình | Đã có adapter hẹp; template luật là mặc định/fallback. Không phải Student AI tổng quát. |
| Soạn nội dung TAI-01 | Gemini API, `GEMINI_API_KEY` / `GEMINI_MODEL` | Được chọn trong spec trước đây, nhưng chưa có adapter và chưa được duyệt để dùng live. |
| Chấm tự luận TAI-02 | Chưa chọn | Bị chặn tới khi chọn provider phù hợp và duyệt pháp lý/dữ liệu. |
| TAI-03/04 | Không cần LLM trong wave đầu | So tương đồng và phân tích theo luật trên server. |
| Student AI theo luật | Không dùng provider | Trên nhánh `research/student-ai`; mọi câu chữ lấy từ catalog có phiên bản hoặc từ mô hình mô phỏng. |
| Student AI hội thoại | Chưa chọn/chưa có | SAI-04; cần SG-2 về dữ liệu, phạm vi, an toàn và giới hạn. |

### Dữ liệu TAI-01 theo thiết kế hiện tại

- Provider dự kiến nhận tên/metadata bài học, đoạn nội dung bài, chuẩn đầu ra, định dạng/số câu/mức độ và chỉ dẫn tự do của giáo viên.
- Request không có trường hồ sơ học sinh. Tuy nhiên bài học hoặc chỉ dẫn tự do vẫn có thể chứa dữ liệu cá nhân, bài làm học sinh hoặc nội dung mật; chưa thể cam kết “không gửi dữ liệu cá nhân” nếu chưa có chính sách đầu vào và biện pháp kiểm tra.
- Server dự kiến lưu `request`, snapshot bài học dạng đọc được, digest, prompt/schema version, provider/model, token usage, các mục đã validate và quyết định giữ/sửa/bỏ. Raw provider response không lưu theo spec.
- Chưa chốt thời hạn lưu/xóa snapshot, draft, quyết định và job lỗi/hủy. Phải đồng bộ với chính sách retention trước khi bật.

**Cổng provider:** Google Gemini API terms có điều khoản về dịch vụ dành cho hoặc có khả năng được người dưới 18 tuổi sử dụng; NexaLab là sản phẩm cho học sinh. Cần xác nhận với provider/reviewer pháp lý rằng endpoint chỉ do giáo viên gọi vẫn được phép trong ứng dụng này, hoặc chọn provider khác. Paid tier tự nó không giải quyết điều kiện tuổi. Nguồn: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms?authuser=00), [billing/data use](https://ai.google.dev/gemini-api/docs/billing/).

**Cổng pháp lý:** TAI-02 trước đây dẫn Nghị định 13/2023; spec đã đổi sang cổng rà soát theo [Luật 91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=), [Nghị định 356/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160) và [Nghị định 330/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=219266&orggroupid=2&pageid=27160), gồm tuổi, thông báo/đồng ý phù hợp, chuyển dữ liệu ra nước ngoài, lưu giữ và xóa. Không mặc định bản ghi `ParentConsent` hiện có đã giải quyết mọi căn cứ pháp lý.

## 4. Những xung đột/cổng cần xử lý

| Ưu tiên | Vấn đề | Hiện trạng và việc cần chốt |
| --- | --- | --- |
| **Đã xử lý** | AI chưa được duyệt trong product scope | TAI-T0 đã duyệt 30/10/2026 và đồng bộ lên fl05 05/11/2026: PRD §10.17, architecture spine và AD-17 đã sửa. Duyệt phạm vi **không** phải duyệt provider; provider call vẫn chờ G-6 (và G-2 với dữ liệu học sinh). |
| **P0** | Provider và người dưới 18 tuổi | Gemini free tier là lựa chọn cũ trong TAI-01, không phải provider đã duyệt. Xác nhận eligibility cho ứng dụng hướng tới trẻ vị thành niên hoặc chọn provider khác trước provider call. |
| **P0** | Dữ liệu lesson và prompt tự do | Snapshot chứa text thật; giáo viên có thể dán thông tin học sinh vào chỉ dẫn. Chốt input policy, giảm dữ liệu, retention/xóa và transfer. Detection không bảo đảm xóa sạch dữ liệu cá nhân. |
| **P1** | Câu trùng | Spec cũ khóa accept với `EXACT_DUPLICATE`, trái yêu cầu giáo viên tự quyết. Đã đồng bộ TAI-01/03/tickets: exact/near duplicate chỉ cảnh báo; giáo viên giữ, sửa hoặc bỏ. |
| **P1** | Thứ tự credit | TAI-01 loại credit; TAI-05 đợi một tháng usage mới đặt giá. Hướng sản phẩm lại yêu cầu estimate và giữ credit trước thao tác. Chốt internal pilot không credit hay đưa estimate/reserve lên trước lần ra mắt giáo viên. Giai đoạn đầu admin cấp credit, không payment gateway. |
| **P1** | Resource contract/provenance | Resource hiện chưa lưu mọi metadata TAI-01 muốn như nguồn/mức độ/chủ đề. Spec giữ `sourceRefs` trong `AiJobItem` trong khi materialize sang resource; chốt cách truy vết sau publish, sửa/xóa job và khi tái dùng câu. Xác nhận quyền gửi tài liệu sách/nguồn được cấp phép cho provider xử lý. |
| **P1** | Tự luận khác TEST hiện tại | `AssignmentSubmission` hiện yêu cầu điểm tự động; bài viết cần trạng thái chờ chấm, rubric/version và quyết định giáo viên. Chấm thủ công cần dùng được trước AI; không đổi semantics TEST. |
| **P1** | UX Teacher core/import | TAI-01 phụ thuộc Class Space resources dùng được. Song song audit/hoàn thiện quản lý lớp/học sinh, resources, hướng dẫn import, file mẫu, preview và lỗi theo dòng. Backend hiện hỗ trợ CSV UTF-8; chưa có kết quả audit browser mới trong tài liệu này. |
| **P2** | Thiếu spec ngoài TAI | Ma trận đề/nhiều mã đề, phòng trao đổi và Student AI tổng quát chưa nằm trong TAI-01..06. Tách phạm vi và quyết định quyền/dữ liệu riêng trước khi build. |

## 5. Checklist trước khi giao phát triển

### Teacher core — có thể làm song song

- [ ] Rà UI thật của quản lý lớp, học sinh và resources trên role/viewport cần hỗ trợ.
- [ ] Viết rõ luồng import: định dạng/file mẫu, hướng dẫn, preview, map cột, lỗi theo dòng và xác nhận trước khi tạo.
- [ ] Chốt content/question contract dùng cho nhập tay, CSV, AI và bài kiểm tra.
- [ ] Phân biệt quiz luyện tập không điểm với TEST được server chấm.
- [ ] Chuẩn bị metadata chủ đề/mức độ/chuẩn kiến thức nếu muốn có question bank và ma trận.

### TAI-01 — soạn bài

- [x] PO duyệt TAI-T0 (30/10/2026; đồng bộ fl05 05/11/2026).
- [ ] Duyệt provider terms cho ứng dụng có người dưới 18 tuổi; Gemini chưa được coi là duyệt.
- [ ] Chốt giới hạn dữ liệu lesson/instruction gửi ra ngoài, prompt safety, retention/xóa và provenance câu được publish.
- [ ] Chỉ dùng bài học đã chọn; mỗi câu có source ref; server validate output trước khi giáo viên xem.
- [ ] Giáo viên review từng câu; exact/near duplicate chỉ cảnh báo; DRAFT qua luồng publish hiện có.
- [ ] Chốt chất lượng: lỗi đáp án, độ đúng kiến thức, groundedness và tỷ lệ giữ/sửa.
- [ ] Chốt credit estimate/reserve sequencing trước teacher-facing launch.

### Tự luận, tương đồng, insights

- [ ] Tạo WRITTEN_TASK và rubric có version; chấm tay hoạt động trước AI.
- [ ] AI chỉ gợi ý theo tiêu chí, evidence trích nguyên văn; giáo viên xác nhận rồi mới là điểm chính thức.
- [ ] Duyệt legal/provider/cross-border/retention và đánh giá mù trước khi gửi bài học sinh ra provider.
- [ ] Similarity trong cùng bài giao chỉ là evidence; không gắn nhãn gian lận, không đổi điểm.
- [ ] Insights có đủ mẫu, quy tắc và bằng chứng; không dự đoán điểm/xếp hạng.

### Credits và các phạm vi riêng

- [ ] Giáo viên thấy estimate trước; server reserve nguyên tử; settle không vượt reservation; lỗi/hủy hoàn idempotent.
- [ ] Admin cấp credit; chưa có cổng thanh toán.
- [ ] Lab AI chỉ gợi ý tham số allowlist; server kiểm giới hạn, giáo viên preview/duyệt.
- [ ] Đề ma trận lấy ngân hàng trước, chỉ sinh bù phần thiếu; lưu mã đề/đáp án riêng.
- [ ] Phòng trao đổi: giáo viên gửi; AI chỉ soạn nháp.
- [x] Student AI theo luật: tách quyền/dữ liệu; chỉ trên bài và lượt làm của chính học sinh; gợi ý không lộ đáp án (leak test); "Nếu… thì sao?" chỉ mở khi đã làm xong hoặc đã đạt (nhánh `research/student-ai`).
- [ ] Student AI hội thoại: không trả lời trong bài có điểm; chờ SG-2.

## 6. Thứ tự phát triển khuyến nghị

Hai track có thể chạy song song:

1. **Track Teacher core:** UX quản lý lớp/học sinh/resources và import có preview; chốt contract tài nguyên/câu hỏi.
2. **Track AI readiness:** duyệt TAI-T0, provider, dữ liệu, retention, provenance và credit sequencing. Hoàn thiện spec/UX contract trước khi mở provider call.
3. **TAI-01:** grounded draft → validate → cảnh báo trùng → review từng item → DRAFT → publish.
4. **Written task thủ công:** bài viết, rubric, nộp bài và chấm tay.
5. **Similarity:** cảnh báo câu hỏi và so bài trong cùng assignment, giữ hai phạm vi riêng.
6. **TAI-02 AI grading:** chỉ sau provider/legal review và blind evaluation.
7. **Question bank/ma trận**, sau đó insights, Lab drafting, Student AI và phòng trao đổi theo spec riêng.

## 7. Student AI theo luật (nhánh `research/student-ai`)

| Phần | Phạm vi | Spec |
| --- | --- | --- |
| Gợi ý từng bước (mức 1–4, chỉ tăng sau khi thật sự làm lại) | 11 Foundational Lab: sau khi nộp; trong lúc làm mức 1–2 | `spec-student-ai-checkpoint-hints` |
| Giải thích vì sao đạt/chưa đạt (B2) | 11 Foundational Lab | `spec-student-ai-checkpoint-hints` |
| Nhận diện lỗi hiểu sai (B8) | 11 Foundational Lab | `spec-student-ai-checkpoint-hints` |
| Gợi ý câu hỏi quiz bài học, không đọc đáp án (SAI-03A) | Quiz trong bài học được giao | `spec-student-ai-lesson-hints` |
| "Nếu… thì sao?" từ mô hình (B3) | 8 Lab | `spec-student-ai-what-if` |
| Phụ huynh: số lần xin gợi ý theo mức (SAI-05) | Lab | `spec-student-ai-checkpoint-hints` |
| Giáo viên: "Lớp đang vướng ở đâu", giả thuyết lỗi, không đồng ý (SAI-02A) | Bài Lab được giao | `spec-student-ai-teacher-insight` |

Chưa làm: luật "phụ thuộc gợi ý" (chờ G-5, dùng chung engine với TAI-04), Student AI hội thoại (SAI-04, chờ SG-2), cá nhân hoá câu chữ (SAI-06).

## Tài liệu cần đối chiếu

- [TAI-01 spec](../../_bmad-output/specs/spec-teacher-ai-authoring/SPEC.md)
- [TAI-01 provider/data flow](../../_bmad-output/specs/spec-teacher-ai-authoring/provider-and-data-flow.md)
- [TAI roadmap](../../_bmad-output/specs/spec-teacher-ai-authoring/teacher-ai-roadmap.md)
- [TAI-02 written tasks](../../_bmad-output/specs/spec-teacher-ai-essay-assessment/SPEC.md)
- [TAI-03 similarity](../../_bmad-output/specs/spec-teacher-ai-similarity/SPEC.md)
- [TAI-05 credits](../../_bmad-output/specs/spec-teacher-ai-credits/SPEC.md)
- [TAI increment/gates](../../_bmad-output/planning-artifacts/increment-tai-teacher-ai.md)
