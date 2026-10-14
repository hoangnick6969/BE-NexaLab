## Data model and acquisition contract

**Purpose:** Companion to [`increment-b-c-plan.md`](./increment-b-c-plan.md). This document holds the detailed content data model, open-source ingestion, R2, review, and simulation pipeline so the increment plan can stay focused on scope, dependencies, and delivery order.

**Precedence:** PRD sets product scope and gates; this document details the data foundation. B1/C2 SPECs may refine implementation fields but must not weaken source rights, review gates, immutable evidence, or curriculum coverage reporting.
Đây là foundation dùng chung cho B1 Content Editor và C2 Content/Lab/Asset operations, không phải Epic sản phẩm thứ năm. B1 SPEC phải chứa contract và import/publish gate; C2 SPEC dùng lại contract cho quản trị taxonomy, asset và simulation config.

### Baseline dataset coverage

Mục tiêu là lập curriculum map và theo dõi coverage **toàn bộ yêu cầu cần đạt KHTN lớp 8–9**. Corpus phát hành là nội dung học tập được biên soạn/biên tập bằng tiếng Việt, dựa trên nhiều nguồn mở có license kiểm chứng; nó không phải bản sao SGK và không được quảng cáo là “đầy đủ SGK”. Chương trình chính thức làm khung outcome; sách/viewer của nhà xuất bản không phải nguồn ingest trong MVP nếu chỉ có quyền xem. [Bộ GDĐT mô tả mô hình một chương trình, nhiều SGK](https://hed.moet.gov.vn/tin-tuc/hoi-nghi-giam-doc-so-giao-duc-va-dao-tao-nam-2024-f52aa772-2C583C03.html)

Dataset nền được theo dõi theo bốn deliverable riêng: (1) curriculum map; (2) researched/verified knowledge units; (3) lessons và question sets đã release; (4) practical activity specs, trong đó chỉ một phần dẫn tới simulation/3D. Knowledge unit ghi facts/concepts/formulas, thuật ngữ, ví dụ, misconception khi có, source notes và version. Practical activity gồm objective, materials, setup, procedure, variables, observations, expected result, explanation, safety, model limitations và sources. **Không phải mọi outcome đều cần practical hoặc 3D.** Sáu topic dưới đây là candidate packs kiểm chứng workflow/engine/modalities, không thay thế coverage report toàn bộ outcome.

Accuracy là hard publish gate. Mọi scientific claim phải có source locator; fact/formula/answer key/model quan trọng cần ít nhất hai references độc lập, trong đó ít nhất một nguồn có thẩm quyền khoa học/giáo dục phù hợp. Curriculum là căn cứ phạm vi và yêu cầu cần đạt, không tự nó chứng minh mọi scientific claim. Người review chuyên môn có tên phải xác minh claims, phép tính, answer key và activity procedure/safety; model/simulation phải có expected outputs và golden cases so với reference trước khi kiểm tra visual. Thiếu evidence hoặc reviewer approval thì không publish.

| Domain | Topic pack đại diện | Hình thức chính | Giá trị kiểm chứng |
| --- | --- | --- | --- |
| Vật lý | Mạch điện/định luật Ohm (giữ pack hiện có) | Deterministic simulation + lesson | Input units/ranges, server recomputation, retry |
| Vật lý | Áp suất hoặc tác dụng làm quay của lực | Simulation/animation; 3D chỉ nếu giúp không gian | Chương thứ hai, model/config khác circuit |
| Hóa học | Phản ứng hóa học, mol và chất giới hạn (mở rộng pack hiện có) | Deterministic symbolic simulation | Equation/units, safety boundary, historical model version |
| Hóa học | Acid–base/pH hoặc dung dịch | Video/animation + bounded simulation nếu có model được review | Topic không phụ thuộc GLB; test source/review workflow |
| Sinh học | Cấu tạo mắt người (mở rộng pack hiện có) | Labeled 3D + guided interaction | Semantic node map, attribution, expert assumptions |
| Sinh học | Hô hấp hoặc tuần hoàn | Video/animation + diagram/3D only when justified | Multi-chapter biology, captions/transcript and no forced 3D |

Topic name/order above là candidate pack selection; content team phải map outcome inventory cho cả lớp 8–9. Coverage báo riêng số lượng/tỷ lệ `outcomes_mapped`, `knowledge_units_reviewed`, `lessons_released`, `practicals_specified`, `simulations_available` theo grade/domain; không gom thành một phần trăm dataset. Có thể curriculum-map đạt 100% trong khi phần knowledge/lesson/practical còn gap. Không tuyên bố corpus lesson đã phủ đủ nếu lesson release còn thiếu outcome; không release unit nếu thiếu outcome reference, source/license record hoặc named reviewer approval.

Ba flagship không buộc mọi thao tác authoring phải diễn ra trong không gian 3D. Hình thức phải theo bản chất bài học:

- **Vật lý:** sơ đồ mạch có thể vẫn là editor 2D để nối dây chính xác; một 3D view đồng bộ hiển thị linh kiện, trạng thái công tắc và hiệu ứng dòng/độ sáng từ kết quả engine.
- **Hóa học:** dữ liệu cấu trúc phân tử có thể tạo visual 3D, còn phương trình, mol, chất giới hạn và verdict vẫn do symbolic engine đã review xử lý; beaker/reaction visual chỉ biểu diễn output.
- **Sinh học:** GLB giải phẫu có semantic nodes để chọn, ẩn/hiện, highlight, gắn nhãn và giải thích đường đi/chức năng; challenge tham chiếu các node ổn định thay vì tọa độ màn hình.

### Topic simulation pack contract

Asset 3D và simulation là hai lớp khác nhau. Một file GLB đẹp nhưng không có semantic map, parameter schema và engine binding chỉ là media minh họa; nó không được xuất hiện như một lab chấm điểm.

```text
Subject → Grade → Chapter → Topic → LearningOutcome
                                    └─ LearningUnit
                                          └─ LearningActivity / PracticalActivitySpec
                                                └─ ScientificModelSpec
                                                      └─ TopicSimulationPackVersion
                                                            ├─ SimulationTemplateVersion
                                                            ├─ VisualAssetVersion (GLB/textures)
                                                            ├─ SemanticNodeMap
                                                            ├─ VisualBindingManifest
                                                            └─ ChallengeTemplateVersion[]
```

- `PracticalActivitySpec`: immutable activity version linked from a learning unit/outcome; includes learning objective, materials, setup/procedure, variables, expected observations/result, explanation, safety, limitations and evidence/reviewers. A simulation pack cannot exist without a reviewed activity reference.
- `ScientificModelSpec`: explicit assumptions, equations/rules, units/ranges and expected outputs grounded in source evidence; may be represented by `SimulationTemplateVersion` only if it carries the full evidence and approval contract.
- `SimulationTemplateVersion`: `modelRef`, input/output/state schema, units, valid ranges, initial state, deterministic rules reference, limitations and golden cases. Server resolves an allowlisted model/version; it never executes arbitrary script/formula from a manifest.
- `VisualAssetVersion`: immutable GLB/texture versions trên R2, checksum, coordinate/scale/unit convention, polygon/texture budget, accessibility alternative và provenance/license.
- `SemanticNodeMap`: stable semantic ID như `battery`, `resistor`, `lens`, `retina`, `molecule:water` map tới node/material/animation trong GLB. Publish fail nếu required node thiếu hoặc trùng.
- `VisualBindingManifest`: mapping có schema từ output/state của engine sang hành vi hiển thị allowlisted như visibility, transform trong range, material color/emissive, label và named animation. Không cho arbitrary JavaScript, shader hoặc remote URI.
- `ChallengeTemplateVersion`: objective, allowed parameter controls, constraints, success criteria reference, hint/equivalent-text requirements và difficulty. Teacher chỉ cấu hình trong range đã subject-reviewed; thay đổi quy luật khoa học cần simulation version mới và subject-matter review.

Luồng giáo viên: chọn chapter/topic/outcome có sẵn → preview bài nền → tạo assignment riêng → tùy biến quiz/test, tham số và challenge trong range → preview cả fallback không 3D → giao cho lớp. Teacher không sửa bản nội dung nền dùng chung. Upload GLB riêng chỉ được dùng như media minh họa sau technical/license checks; muốn dùng để chấm lab thì phải qua semantic mapping, binding, model compatibility, golden cases và subject-matter review.

### Content pack contract

Mỗi pack versioned phải có tối thiểu:

- `grade`, `domain`, `chapter`, `topic`, curriculum/outcome references, learning objectives và prerequisites.
- Knowledge unit: claims/facts/concepts/formulas, terms, examples/misconceptions khi có, source notes/locators và claim-to-source links. Reading content, video manifest (`objectKey`, duration, transcript, caption track), study cards và quiz có stable IDs/rationale/source references; answer key chỉ ở server.
- `PracticalActivitySpec` khi có thực hành: linked outcomes/learning unit, objective, materials, setup, procedure, variables, observations, expected result, explanation, safety, limitations, modality recommendation, sources và named reviewers. Activity không mặc định phải có mô phỏng.
- Source manifest: title, author/organization, canonical URL, accessed date, license/permission, attribution text và modification note.
- `ScientificModelSpec`/simulation manifest khi có: activity reference, model assumptions, variables/units/ranges, equations/rules, expected outputs, limitations/safety note, source evidence và golden validation cases. Pack pin đúng `simulationModelVersion`; không có model được review thì không publish simulation.
- 3D asset manifest khi có: GLB object key, semantic node map, scale/units, checksum, source/license/attribution, texture/LOD metadata và accessibility alternative.
- Content author/editor identity, named subject-matter reviewer and source/license reviewer, claim/source evidence, accuracy checklist, review/published timestamps, pack version và lifecycle `draft → editorial_review → subject_reviewed → released → archived`.

### Data acquisition and publish workflow

1. Map every topic/outcome in the official KHTN Grade 8–9 curriculum; track map coverage separately from content coverage.
2. Research multiple openly reusable sources or NexaLab-created evidence. Record source notes and exact locators; never turn a crawl result directly into a lesson.
3. Editors synthesize age-appropriate Vietnamese knowledge units, lessons and original question sets. Cross-check important scientific claims against at least two independent references; ensure at least one appropriate authoritative scientific/educational reference. The curriculum defines scope, not scientific proof.
4. Where a lesson has practical value, author and version a `PracticalActivitySpec`; review objectives, materials, setup/procedure, expected observations/results, explanation, safety and limitations. Select modality based on that activity.
5. For simulations, specify scientific assumptions/equations/ranges, derive expected outputs, create golden cases and compare engine outputs to references before visual/3D validation. UI/visual QA follows scientific validation.
6. Named subject-matter reviewer verifies claims, answer keys, calculations, grade fit, practical procedures and safety; rights reviewer verifies reuse/derivative permission and attribution. Both are mandatory release gates. Automated checks validate evidence completeness, license policy, schema, IDs, broken references, assets, accessibility and golden cases; passing automation alone cannot publish.
7. Coverage report separates curriculum map, reviewed knowledge units, released lessons, specified practicals and available simulations per grade/domain. Importer publishes immutable versions; corrections create a new version so assignments and historical evidence remain explainable.

**Release checklist (all applicable items required):**

- [ ] Curriculum outcome and grade mapping verified.
- [ ] Sources and exact item-level rights/attribution attached; derivative use is allowed.
- [ ] Scientific claims are linked to source locators; important claims are cross-checked against two independent references, including an appropriate authoritative reference.
- [ ] Answer keys, formulas, units and calculations reviewed; model outputs match expected values/golden cases.
- [ ] Practical procedure, materials, expected observations/results, safety and model limitations reviewed when applicable.
- [ ] Named subject-matter reviewer approved; rights reviewer approved; accessibility/media requirements pass.
- [ ] Immutable content/model/asset versions and reviewer evidence are recorded before release.

Any failed or inapplicable-without-reason gate blocks publication. A second reference is not a substitute for a qualified reviewer, and automated tests do not attest to scientific accuracy.

### Storage boundary

- Supabase PostgreSQL stores taxonomy, lesson/content manifests, source/license metadata, R2 object metadata, review state, assignments and learning evidence.
- R2 stores binary media only. Use separate prefixes/buckets by environment and media class; raw upload, processed/published asset and deleted/quarantine states cannot share an ambiguous key.
- API issues short-lived upload/read authorization and validates ownership, declared MIME, actual file signature, size budget and checksum before marking an asset usable.
- MP4 MVP is 720p H.264/AAC with Fast Start; caption is UTF-8 WebVTT; transcript is stored as sanitized content. Exact maximum duration/size and bitrate budget remain Q-DATA-01 for the B1 SPEC.

### R2 environment and upload setup

SPEC B1 phải đưa checklist này thành cấu hình và acceptance evidence, không chỉ ghi “dùng R2”:

1. Tạo bucket private riêng cho `development`, `pilot` và `production`; token mỗi môi trường chỉ được read/write đúng bucket tương ứng. Không dùng `r2.dev` public access cho learning assets.
2. Backend-only env gồm `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_UPLOAD_TTL_SECONDS`, `R2_READ_TTL_SECONDS`; secrets không đi vào FE hoặc prefix `VITE_`.
3. CORS allowlist chính xác origin của FE từng môi trường; chỉ cho `PUT`, `GET`, `HEAD` cùng các header cần thiết như `Content-Type`, checksum và expose `ETag`. Không dùng wildcard production origin.
4. Object key do server sinh, ví dụ `<env>/<scope>/<assetId>/<versionId>/<safe-name>`; client không tự chọn bucket/key hoặc đổi scope.
5. Với object tối đa theo ngưỡng đề xuất 300 MB: API tạo `AssetVersion(status=PENDING)` và multipart upload R2; client tải từng part qua presigned `UploadPart` URL ngắn hạn; API hoàn tất multipart. Finalize dùng `HEAD` xác minh size thực, đọc một byte range giới hạn để kiểm file signature, rồi chạy SHA-256 streaming, malware scan và media validation có giới hạn trước khi chuyển `READY`. Multipart ETag không phải checksum toàn object; SHA-256 client gửi chỉ là giá trị kỳ vọng, server phải tự tính lại. Abort multipart hết hạn/thất bại và quarantine file lỗi. Publish chỉ tham chiếu version `READY`.
6. Staging upload không finalize được cleanup sau 24 giờ. `QUARANTINED` object không được cấp read URL; referenced/published version không bị hard-delete. Lifecycle delete thực tế phải kiểm DB reference trước, không chỉ dựa vào R2 prefix rule.
7. Download/playback dùng short-lived presigned `GET` sau khi backend kiểm role, assignment/content access và quarantine state. Log asset ID/version, không log signed URL.

### Database setup for content and media

Schema đích tối thiểu; SPEC được đổi tên trường nhưng không được bỏ các invariant:

- `Asset`: identity, `scope`, owner teacher nullable cho shared asset, lifecycle status, shared catalog metadata, timestamps.
- `AssetVersion`: immutable R2 bucket/object key, MIME, bytes, SHA-256, ETag, media dimensions/duration, technical validation result, createdBy/createdAt.
- `AssetSource`: canonical source URL/ID, publisher/author, license code/URL, attribution, modification note, retrievedAt và evidence snapshot/reference.
- `ContentPack` + `ContentPackVersion`: grade/domain/chapter/topic/outcome reference, author/reviewer, lifecycle và immutable published version.
- `KnowledgeUnit` + `KnowledgeUnitVersion`: versioned claim/fact/concept/formula/terminology bundle linked to outcomes, source notes, claim-to-source references, editorial and subject-review evidence.
- `PracticalActivity` + `PracticalActivityVersion`: optional learning activity linked from a `LearningUnit`/outcome, with objective, materials, setup, procedure, variables, observations, expected result, explanation, safety, limitations, modality and sources/reviewers.
- `ContentAsset`: nối một content-pack version với đúng asset version và usage role như video, caption, transcript, GLB, texture, image hoặc PDF.
- `TopicSimulationPack` + `TopicSimulationPackVersion`: identity theo topic/outcome và immutable aggregate version nối đúng model, visual, bindings và challenge templates.
- `ScientificModelSpec` + version (can be represented by a reviewed `SimulationTemplateVersion` if it carries all required evidence): practical activity reference, assumptions/equations, units/ranges, expected outputs, source evidence, limitations and golden cases. Backend implementation is allowlisted; never store/execute user-provided scientific code.
- `AssetSemanticMap` + `VisualBindingManifest`: semantic IDs và declarative bindings từ engine state/output tới đúng `AssetVersion`; publish validator kiểm model/visual compatibility.
- `ChallengeTemplate` + `ChallengeTemplateVersion`: teacher-configurable objective/constraints trong range đã review; published lesson/lab pin exact version.
- `SourceRegistry`: allowlisted source, access mode (`OPEN_BULK_IMPORT`, `API`, `MANUAL_REFERENCE`, `MANUAL_UPLOAD`, `BOUNDED_CRAWL`), allowed paths/data types, item-level license rule and attribution, robots/terms review date, rate limit, update/withdrawal contact, enabled state.
- `IngestionRun` + `IngestionItem`: source, external ID/URL, fetchedAt, checksum, parser version, status/rejection reason. Dùng cho idempotency, provenance và rerun; không dùng bản ghi ingest làm nội dung học tập trực tiếp.
- `SourceArtifact` + `SourceArtifactVersion`: logical external document/dataset item và snapshot version đã lấy. Version lưu canonical locator, response metadata, content checksum, parser version, license snapshot, storage policy và các R2 keys nullable cho raw/normalized representations. `IngestionItem` là trạng thái xử lý trong một run; `SourceArtifactVersion` là kết quả nguồn có thể được content pack tham chiếu lâu dài.
- `ContentRelease` + `ContentReleaseItem`: immutable manifest digest, target environment, pack/asset versions, importer version, initiated/approved actors, status and timestamps. Đây là deployment record cho pilot/production content, tách khỏi dev seed và runtime draft.

Migration phải import `AssetFile` hiện có thành private/shared asset theo owner và usage, tạo version đầu tiên với checksum, rồi rewrite `asset:<id>` references có kiểm đếm trước/sau. File local chỉ được xoá sau khi object R2 và database reference đã verify.

Supabase setup giữ đúng PRD/AD-10: `DATABASE_URL` dùng Session pooler cho runtime; `DIRECT_URL` dùng direct connection cho Prisma migrate, seed và import, hoặc Session pooler khi deployment network không đi được IPv6 direct endpoint; credentials chỉ ở backend. Schema migration không chứa binary hoặc lesson payload lớn. Versioned content-pack manifests nằm trong source control/data bundle, importer upload binary lên R2 trước rồi transactionally upsert metadata/reference vào PostgreSQL. Development fixtures và pilot content dùng namespace/source record riêng; không tự promote fixture sang production.

### Data delivery lanes

| Lane | Mục đích | Ai/chương trình chạy | Đích | Được dùng ở production? |
| --- | --- | --- | --- | --- |
| Prisma migration | Tạo/thay đổi table, enum, index và constraint | Reviewed deployment job qua `prisma migrate deploy` | Supabase PostgreSQL schema | Có |
| Development seed | Tạo account/class/assignment và pack giả lập phục vụ dev/E2E | Guarded `db:seed` trên target đã xác minh | Development/test DB; asset fixture riêng | **Không** |
| Content Release Importer | Nạp một manifest pack/asset đã version, validate, upload R2, upsert metadata và ghi release receipt | CLI/job có dry-run, target allowlist và approval | Pilot/production R2 + Supabase | Có, đây là đường chuẩn cho bootstrap/bulk release |
| Runtime authoring | Giáo viên tạo lesson/private asset; admin quản shared library | Authenticated backend APIs | R2 + Supabase | Có |
| Connector ingestion | Đồng bộ candidate source data theo SourceRegistry | Worker/CLI/job, admin trigger/schedule | Staging `IngestionRun/Item` + R2 staging | Có, nhưng không auto-publish |

`SourceRegistry` ban đầu được bootstrap từ một versioned registry manifest bằng importer. Sau đó admin có thể enable/disable, cập nhật policy metadata hoặc duyệt source proposal qua UI; admin không nhập tay từng dữ liệu khoa học. Thay đổi source policy phải version/audit và chỉ ảnh hưởng ingestion run mới.

Ví dụ: record `pubchem-pug-rest` chỉ nói connector nào được gọi, endpoint/data type nào được phép, rate limit, cách đọc license/provenance và lần review terms gần nhất. Nó **không** chứa bài “Mol và chất giới hạn”, file GLB hay câu quiz. Connector dùng record đó để lấy candidate theo CID/name allowlist vào staging; teacher mới chọn candidate, diễn giải theo lớp 8 và đưa vào một pack có review.

### Source document storage example

`SourceRegistry`, source document và lesson là ba object khác nhau:

```text
SourceRegistry: "khtn-curriculum-tt32"
  └─ SourceArtifact: "Chương trình môn Khoa học tự nhiên"
      └─ SourceArtifactVersion: metadata-only reference, exact section locator and checksum (unless reuse rights permit storing a copy)
          └─ ContentPackVersion: bài học tiếng Việt do NexaLab editorial team biên soạn
```

Ví dụ registry policy rút gọn:

```json
{
  "key": "khtn-curriculum-tt32",
  "accessMode": "MANUAL_REFERENCE",
  "allowedHosts": ["thcsandong.haiphong.edu.vn"],
  "allowedMime": ["application/pdf"],
  "storagePolicy": "METADATA_ONLY",
  "parser": "gdpt-curriculum-pdf-v1",
  "rateLimitPerMinute": 2,
  "enabled": true
}
```

Khi tạo record tham chiếu tới PDF, Supabase không chứa binary PDF. Một `SourceArtifactVersion` lưu metadata như:

```json
{
  "canonicalUrl": "https://thcsandong.haiphong.edu.vn/van-ban-bo-gddt/chuong-trinh-giao-duc-pho-thong-mon-khoa-hoc-tu-nhien-ban-hanh-kem-theo-thong-t/vbct/20343/91434",
  "retrievedAt": "2026-10-14T00:00:00Z",
  "sha256": "...",
  "mime": "application/pdf",
  "rawObjectKey": null,
  "normalizedObjectKey": null,
  "locator": "Phụ lục Chương trình môn Khoa học tự nhiên ban hành kèm TT32/2018; kiểm tra sửa đổi TT13/2022 và TT17/2025",
  "parserVersion": null,
  "licenseStatus": "REFERENCE_ONLY",
  "reviewStatus": "METADATA_VERIFIED"
}
```

- Raw PDF/HTML/JSON được lưu ở R2 staging **chỉ khi source policy và license cho phép lưu snapshot**.
- Nếu chỉ được tham chiếu, dùng `storagePolicy=METADATA_ONLY`: giữ canonical URL, response headers, checksum và locator; không giữ full body.
- Normalized text là JSON có page/section/heading/paragraph locator để truy vết về nguồn. MVP không tự chia embeddings hoặc xây vector database nếu chưa có search/RAG requirement.
- Sau khi approved, content pack tham chiếu exact `SourceArtifactVersion` và các locators đã dùng. Lesson text vẫn là bản biên soạn riêng của teacher, không phải bản copy của normalized source.
- Media/GLB được chọn để tái sử dụng sẽ được promote từ source artifact staging thành immutable `AssetVersion`; raw source artifact và runtime asset giữ identity/version riêng.

### Controlled acquisition pipeline

1. Importer bootstrap các source definitions đã review; admin duyệt/enable/disable `SourceRegistry`; teacher có thể đề xuất nguồn hoặc upload tài liệu có quyền sử dụng. Registry lưu policy, connector và license scope, không lưu lesson rows.
2. Một trigger tạo `IngestionRun`: admin bấm import, release job chạy, hoặc scheduler chạy cho source đã cho phép. Run pin exact registry-policy version và connector/parser version.
3. Discovery chỉ tìm candidate trong allowed host/path/query/ID. API connector ưu tiên hơn crawl; document connector chỉ tải URL cụ thể; `BOUNDED_CRAWL` theo link depth/page cap đã cấu hình, không tự lan sang host/path khác.
4. Pre-fetch gate kiểm enabled state, terms/license review còn hiệu lực, robots policy, rate limit, retry/backoff, timeout, MIME và content-size cap. Redirect sang host ngoài allowlist bị chặn.
5. Fetch bằng conditional request khi có ETag/Last-Modified; ghi status, response headers cần thiết và checksum. Trùng external ID/canonical URL/SHA-256 thì reuse hoặc tạo version rõ ràng.
6. Lưu raw snapshot vào R2 staging nếu policy cho phép; nếu `METADATA_ONLY`, chỉ lưu metadata/hash/locator. Không đưa raw source thẳng vào public/shared library.
7. Parser allowlisted trích text/table/metadata hoặc scientific records; normalized output giữ page/section/field locators và parser version. Parser lỗi hoặc nội dung đổi bất thường chuyển `NEEDS_REVIEW`, không đoán dữ liệu.
8. Automated checks: schema, license allowlist, broken references, MIME/signature/checksum, malware scan hook, caption/transcript, scientific units/ranges và simulation golden cases. Candidate đạt kiểm tra vẫn chỉ là `STAGED`.
9. NexaLab content/editorial team chọn source bundle, map outcome và biên soạn nội dung tiếng Việt; subject-matter reviewer xác nhận scientific review. Với asset shared, admin duyệt thêm provenance/license/technical scope. Chỉ content/asset pack version đạt đủ gate mới publish.
10. Scheduled refresh tạo `SourceArtifactVersion` mới; không sửa published version tại chỗ. Nguồn bị rút quyền hoặc đổi license tạo review task và có thể bị admin quarantine.

### Connector strategy for Grades 8–9 Natural Science

Không có một API duy nhất được chốt là cung cấp sẵn bài học tiếng Việt KHTN THCS, video, quiz và 3D lesson có thể đưa thẳng vào NexaLab. Connector được chọn theo **loại dữ liệu**; curriculum authority, science data, open media và lesson authoring là các lane riêng:

| Data lane | Source/connector for Release 1 | Dữ liệu nhận | Dùng thế nào | Ranh giới |
| --- | --- | --- | --- | --- |
| Curriculum authority | Bộ GDĐT official curriculum PDF, versioned manual import | Môn/khối/yêu cầu cần đạt/chủ đề và reference trang | Admin/PM/teacher curate thành taxonomy/outcome JSON có `curriculumRef` | Không giả định có public curriculum API; PDF là căn cứ mapping, không phải quyền copy textbook prose |
| Vietnamese open learning materials | [VOER](https://www.voer.edu.vn/public/content/huong-dan) and other OER repositories; bounded crawl or API/export only after item-level review | Candidate text/modules and metadata, with exact license and attribution | Editorial team extracts/adapts only within that item's license, maps to Grade 8–9 outcomes, then reviews | VOER states CC BY 3.0 by default except where an item says otherwise; do not assume it has complete THCS coverage or that every linked item inherits the repository default |
| Chemistry structured data | PubChem PUG REST connector, query theo approved compound list/CID | CID, tên, formula, identifiers, properties, 2D/3D conformer SDF/JSON | Tạo reviewed `ScienceRecord` và input cho molecule visualization | Không cung cấp bài học lớp 8, phản ứng được phép dạy, hay answer key; nguồn structure không tự chứng minh safety/pedagogical fit |
| Physics/Biology learning references | Curated official/open references, source bundles, named subject-matter reviewers | Metadata, facts/diagrams, source locators | NexaLab editorial team maps outcomes and authors an explanation/model; subject-matter reviewer signs off | Không scrape web đại trà để tự sinh khoa học chuẩn |
| Reusable simulations | [PhET licensing](https://phet.colorado.edu/si/licensing), manually curated candidates | Simulation URL/metadata; downloadable files only where terms allow | Prefer link-out or evaluate as a learning aid; do not ingest/embed executable sim by default | Standard HTML sims are CC BY-NC 4.0, so not included in a reusable/commercially-neutral corpus absent separate rights |
| 3D/image assets | [Smithsonian Open Access](https://www.si.edu/openaccess/faq) CC0-designated records; Wikimedia Commons or other open repositories per-item | Candidate media/3D plus item-level rights metadata | Staging → normalize GLB → semantic map → scientific/technical/license review | Import only items explicitly marked compatible; source-level openness does not prove each asset's rights or topic fit |
| Baseline textbook/lesson corpus | No publisher textbook ingestion in MVP. Build original/adapted units from open references and licensed OER | Openly reusable source passages/facts/assets and NexaLab-authored explanations/questions | Map source locators and attribution to curriculum outcomes; release as versioned `ContentPackVersion` | A public viewer, free PDF, or visible page is not reuse permission; no textbook completeness claim |
| Video/caption and supplemental lesson media | Original NexaLab production or per-item open-license media | Permitted MP4, WebVTT, transcript, original media | Becomes versioned `ContentAsset` after rights, technical and subject review | Do not download/rehost platform video without explicit reusable license |

**Practical release order:** (1) create Grade 8–9 official outcome inventory; (2) run a source discovery/rights audit across VOER and other OER plus structured science APIs/assets; (3) measure actual outcome coverage before promising a full dataset, and staff an editorial/reviewer workflow to author gaps from reusable factual references; (4) add the narrow PubChem connector and curate three topic-specific simulation packs; (5) produce/license video and media in batches. Bounded crawl starts disabled and is enabled only for an allowlisted source/path after item license, terms, robots, parser and rate limits are reviewed. Public access alone is never a license. PhET NC material is link-out/research only by default.

### Open-source acquisition path for the MVP

The realistic target is an **open, curriculum-aligned corpus for grades 8–9**, not a scraped copy of the official textbooks. No single reviewed source is established here as complete for Vietnamese KHTN THCS. [VOER describes](https://www.voer.edu.vn/public/content/huong-dan) its materials as CC BY 3.0 unless an item specifies otherwise; it is a candidate repository, not proof of grade/topic coverage. [Smithsonian Open Access](https://www.si.edu/openaccess/faq) allows reuse of records explicitly designated CC0, while [PhET standard HTML simulations](https://phet.colorado.edu/si/licensing) use CC BY-NC 4.0; therefore PhET can be a reference/link-out but is excluded from the baseline reusable corpus if commercial use remains possible. Check the item-level metadata before every import.

1. Create a versioned curriculum inventory for every official Grade 8 and Grade 9 outcome, with strand/topic, source locator and coverage state.
2. Discover OER by exact topic/outcome. For each candidate record the canonical URL/ID, author, source, exact license/version, attribution text, access date, allowed adaptation/commercial use, terms/robots review, checksum and reviewer. Reject unclear licenses and incompatible NC/ND items from the release.
3. Prefer documented APIs and bulk exports. A bounded crawler is only a fetcher for explicitly allowlisted open pages/files; enforce host/path, item/page caps, MIME/size/rate limits, robots and terms review. Do not crawl login-gated textbook viewers or copy text merely because it is visible.
4. Extract only reusable material with page/heading/paragraph locators. Store permitted raw files in private R2; store metadata, normalized knowledge units, curriculum links, attribution and release state in Supabase. Deduplicate by source identity plus checksum; new source revisions create new artifact/content versions.
5. Editors write age-appropriate Vietnamese explanations, examples and original quizzes grounded in cited sources. Preserve share-alike obligations when using BY-SA. Subject reviewers check scientific accuracy and pedagogy; rights reviewers check scope and attribution. A source fact or molecule model is not itself a finished lesson.
6. Publish only after schema/license validation and human reviews. Produce a coverage/gap report per grade, outcome and modality. If open sources do not support an outcome, mark the gap and prioritize original authored content; do not fill it with textbook scraping. A “full curriculum map” is achievable; “complete official textbook content” is not promised.

The `SourceRegistry` stores approved source policy and connector configuration. It does not store lessons or automatically bless all content from a domain. Each `SourceArtifactVersion` snapshots the exact item-level license and provenance used by a release. Build ingestion as a dry-run importer with staging, validation, release receipt and rollback; never seed curriculum content directly into production tables or R2 by hand.

### Import mapping from open source artifacts to NexaLab

```text
Open-license source artifact / NexaLab-authored content
  → SourceArtifactVersion (canonical locator, checksum, item-level license, provenance)
  → CurriculumOutcome map (official KHTN subject-program outcomes)
  → KnowledgeUnitVersion + LearningUnitVersion (cross-checked claims, reviewed synthesis)
  → PracticalActivitySpec (when the learning activity warrants it)
  → ScientificModelSpec → TopicSimulationPackVersion (only for validated simulation activities)
  → Content Release Importer
      ├─ Supabase: metadata, normalized content, questions, review state
      └─ R2: permitted open assets and NexaLab-created media
```

The official school subject is integrated Khoa học tự nhiên; retain the official curriculum's integrated outcome/topic relationships and add domain tags (`PHYSICS`, `CHEMISTRY`, `BIOLOGY`) for navigation and simulation matching. Do not split cross-domain outcomes into unrelated tracks. Teacher customization is a separate version/overlay referencing the immutable base learning unit/question/model version; it never edits the shared baseline.

### Canonical data format and acquisition tools

Connectors preserve the source payload and normalize to NexaLab's versioned JSON contracts. Do not place arbitrary scraped page HTML directly into lesson tables. Minimum normalized shapes:

```json
{
  "kind": "CURRICULUM_OUTCOME",
  "id": "vn-gdpt2018-khtn8-physics-<stable-id>",
  "subject": "KHTN",
  "domain": "PHYSICS",
  "grade": 8,
  "chapterKey": "electricity",
  "topicKey": "ohms-law",
  "outcome": { "text": "Teacher-reviewed paraphrase of the required outcome" },
  "curriculumRef": {
    "sourceArtifactVersionId": "srcver_moet_2026_01",
    "documentTitle": "Chương trình giáo dục phổ thông môn Khoa học tự nhiên",
    "page": 42,
    "section": "Yêu cầu cần đạt"
  },
  "review": { "status": "SUBJECT_REVIEWED", "reviewerId": "reviewer-id", "reviewerRole": "SUBJECT_MATTER_EXPERT" }
}
```

```json
{
  "kind": "SCIENCE_RECORD",
  "id": "pubchem-cid-962",
  "source": { "registryKey": "pubchem-pug-rest", "externalId": "CID:962", "retrievedAt": "2026-10-14T00:00:00Z" },
  "subject": "KHTN",
  "domain": "CHEMISTRY",
  "topicKey": "molecular-structure",
  "data": { "name": "water", "formula": "H2O", "conformerFormat": "SDF" },
  "licenseAndAttribution": { "status": "REVIEW_REQUIRED", "sourceUrl": "https://pubchem.ncbi.nlm.nih.gov/compound/962" },
  "assetRefs": [],
  "reviewStatus": "STAGED"
}
```

The exact Zod schemas/IDs are a B0/B1 SPEC deliverable; stable fields above define the minimum semantics. Suggested tool implementation:

- API acquisition: a backend Node/TypeScript CLI or job using `fetch`/an HTTP client, Zod validation, retries with backoff, rate limits, and raw response fixtures for deterministic parser tests. Each connector has explicit query allowlists and parser version.
- PDF/HTML acquisition: manual upload or bounded Python/Node ingestion command; use PDF text extraction first, OCR only when needed, and preserve page/heading/table locators. Human verifies equations, diagrams, tables, and OCR output.
- 3D conversion: isolated asset pipeline using a glTF validator/optimizer; record source checksum and tool version. Never execute uploaded content. Technical validation cannot replace scientific review.
- Storage/import: Content Release Importer validates manifests, uploads permitted binaries to private R2 through backend credentials, writes metadata/relations to Supabase with Prisma, and emits a release receipt. Browser upload uses a server-issued presigned URL; no R2 secret in the FE.
- Review: a staging review UI can be added with B1/C2 scope; before that UI exists, use reviewed versioned manifest files and importer CLI. The tool does repeatable fetching/validation; designated content editors and subject/rights reviewers make publication decisions. Teachers customize activities and may submit assets but are not responsible for the core dataset.

For every source, keep a source card: owner/publisher, official URL, access mode, terms/license URL and date checked, allowed use (link/reference/snapshot/derivative), allowed endpoints/paths, expected MIME/schema, rate/size/page caps, parser version, contact/removal path, and `enabled` state. If license or rights are unclear, store only the minimum locator/checksum needed for review and do not publish the source-derived body or asset.

### Open asset library pipeline for 3D

Không cho teacher tìm asset trực tiếp trên web ở thời điểm ra bài. NexaLab duy trì một **curated Starter Library** nội bộ, được lọc theo topic/chương và chỉ chứa version đã qua pipeline:

1. Discover candidate bằng API/manual upload theo `SourceRegistry`; lưu raw binary và source evidence ở R2 staging.
2. Pin canonical source ID/URL, license, attribution, checksum và retrieved timestamp; item không rõ quyền sử dụng bị reject.
3. Convert/optimize sang GLB nội bộ khi cần; texture được đóng gói hoặc dùng cùng immutable asset version, không giữ external runtime URI.
4. Chạy technical validator: file signature/glTF validity, size/triangle/texture budgets, node/animation inventory, scale/units, no scripts/remote URI, malware hook và fallback text/preview.
5. Curator/teacher tạo semantic node map và binding manifest cho đúng `SimulationTemplateVersion`; chạy golden cases để so engine output với visual state expected.
6. Named subject-matter reviewer validates scientific fit; admin reviews provenance/license/technical/shared scope. Teacher may propose an asset but does not substitute for core-content review.
7. Publish immutable pack version vào shared library. Teacher tìm theo subject → grade → chapter → topic → outcome và chỉ chỉnh các controls/challenge fields đã allowlist.

PubChem cung cấp source data phân tử, không cung cấp sẵn bài học tiếng Việt hoặc engine phản ứng cho NexaLab. Smithsonian/Open Access hay nguồn khác cung cấp candidate visual, không bảo đảm semantic fit với chương trình. Mọi asset ngoài hệ thống đều phải được chuẩn hóa thành NexaLab pack trước khi dùng để chấm điểm.

Nguồn pilot đề xuất: chương trình Bộ GDĐT cho taxonomy/outcome; PubChem PUG REST cho dữ liệu hợp chất có cấu trúc; Wikimedia Commons API cho media kèm license metadata; Smithsonian Open Access/3D API cho asset phù hợp. Video bài giảng do NexaLab production hoặc bên có license cung cấp. Mọi item vẫn phải qua license check và subject-matter review; tên nguồn không tự động làm item hợp lệ.

| Loại dữ liệu | Nguồn ưu tiên | Cách lấy | Có thể dùng trực tiếp để làm gì |
| --- | --- | --- | --- |
| Taxonomy/outcome | Văn bản chính thức Bộ GDĐT | Manual snapshot/import có version và reference | Map grade/domain/chapter/topic/outcome; không copy textbook prose |
| Hóa học có cấu trúc | PubChem PUG REST | API connector theo CID/name allowlist | Formula, identifier, 2D/3D compound data làm source input; teacher diễn giải cho lớp 8 |
| Hình/diagram/media | Wikimedia Commons | API lấy file + `imageinfo/extmetadata` | Chỉ item có license được allowlist; lưu author/license/attribution/file page |
| 3D collection | Smithsonian Open Access/3D API | API/manual download | Candidate asset; phải convert/optimize/validate GLB và kiểm tra semantic fit |
| Video/caption | NexaLab production hoặc từng video có open license tương thích | Manual upload qua private R2 flow | MP4 720p + WebVTT + transcript; editorial, rights and subject review trước release |
| Sách giáo khoa, question bank, YouTube/blog | Không ingest mặc định | Chỉ manual source reference khi có quyền rõ ràng | Không copy body/video/question vào runtime nếu chưa có permission/license |

### Authoritative foundation references

- Taxonomy và yêu cầu cần đạt: dùng **phụ lục Chương trình môn Khoa học tự nhiên** ban hành kèm Thông tư 32/2018/TT-BGDĐT; đối chiếu thay đổi tại [Thông tư 13/2022/TT-BGDĐT](https://vanban.chinhphu.vn/?docid=206343&pageid=27160) và [Thông tư 17/2025/TT-BGDĐT](https://vanban.chinhphu.vn/default.aspx?docid=215347&pageid=27160). [Bản phụ lục môn KHTN để tra cứu](https://thcsandong.haiphong.edu.vn/van-ban-bo-gddt/chuong-trinh-giao-duc-pho-thong-mon-khoa-hoc-tu-nhien-ban-hanh-kem-theo-thong-t/vbct/20343/91434) là bản được lưu trên cổng trường học; trước khi phát hành taxonomy, đối chiếu với văn bản pháp quy và ghi locator cụ thể. Nguồn taxonomy xác định phạm vi/outcome, không tự động cấp quyền sao chép sách giáo khoa.
- Object storage contract: [Cloudflare R2 upload methods](https://developers.cloudflare.com/r2/objects/upload-objects/), [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 overview](https://developers.cloudflare.com/r2/how-r2-works/) và [pricing/egress behavior](https://developers.cloudflare.com/r2/pricing/). Presigned form POST không được hỗ trợ; upload multipart là lựa chọn cho video lớn và SPEC không được giả định R2 tự transcode video.
- Phương án nâng cấp nếu cần adaptive video: [Cloudflare Stream documentation](https://developers.cloudflare.com/stream/get-started/); nằm ngoài MVP hiện tại.
- Quyền tái sử dụng nguồn mở: [Creative Commons reuse guidance](https://creativecommons.org/reusing-cc-licensed-content/). Mỗi source/asset vẫn phải lưu đúng license, attribution và modification note của chính nó.
- Ingestion APIs: [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest), [MediaWiki Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo/en) và [Smithsonian 3D API](https://3d-api.si.edu/api-docs/). Chỉ lấy các field/item nằm trong license và content scope đã duyệt.
- Crawl policy: [RFC 9309 Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html). Robots rules là một gate kỹ thuật; SourceRegistry vẫn phải ghi terms/license riêng.

