# Teacher AI — UX audit (before), 2026-11-24

Run: FE/BE `origin/main` (e1e620d / c1735ae), isolated local Postgres, `AI_PROVIDER=fake`, teacher `teacher.owner`, class `class-pilot-a`, viewport 1440×900 light. Screenshots: `teacher-ai-screenshots/studio-v2/before/`.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A-1 | No AI entry on the class page. The flow is the 3rd mode ("Soạn nháp bằng AI") inside the resource *creation card* of tab "Tài nguyên lớp"; default mode is manual entry. | 01, 02 | High (discoverability) |
| A-2 | The form, quota, recent jobs and the whole review all stack in one column inside the creation card; the class resource list is pushed below the fold. | 03, 05 | High |
| A-3 | Quota is 4 lines of small grey text ("Đã dùng 0/20 lượt…", "Đang xử lý 0/2 yêu cầu", link) with a thin bar; the disabled reason ("Chọn bài học để tạo…") is tiny under a pale disabled button. | 04 | Medium |
| A-4 | Selects for kind and level hide the options; item count is a free number box. | 03 | Low |
| A-5 | Review is a long single list of 10 cards; progress ("Đã quyết định 0/10") is plain text at top, no filter, no way to jump to an item, actions repeat per card with no sticky summary. | 06 | High (efficiency) |
| A-6 | Job header and decision summary scroll away; "Tạo bản nháp" lives at the end of the list. | 06 | Medium |
| A-7 | Tags like "Có số liệu, cần kiểm tra phép tính" are very small grey pills, easy to miss although they ask for a check. | 06 | Medium |
| A-8 | Brand colours are applied correctly (teal `--brand`, dark green primary buttons, amber accents) — keep. | all | — |

Fixes are specified in `SPEC.md` (R-1…R-4, U-1…U-8).
