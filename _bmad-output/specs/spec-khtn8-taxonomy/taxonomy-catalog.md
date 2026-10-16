# KHTN 8 Taxonomy Catalog

## Identity and facets

| Dimension | Rule | Stable values for this scope |
| --- | --- | --- |
| Subject | Integrated subject identity | `KHTN` |
| Grade | Subject plus grade | `KHTN-8` |
| Curriculum strand | Official conceptual facet, not a separate subject | `MATTER`, `ENERGY`, `LIVING`, `EARTH_SKY` |
| Discipline tag | Search/editorial facet; multi-valued | `CHEMISTRY`, `PHYSICS`, `BIOLOGY`, `EARTH_SCIENCE` |
| Cross-cutting tag | Skills and practices spanning strands | `SCIENCE_PRACTICE`, `LAB_SAFETY`, `MEASUREMENT`, `DATA_REASONING`, `ENVIRONMENT_SUSTAINABILITY` |
| Chapter | Stable NexaLab navigation identity | `khtn8-ch-<two digits>-<slug>` |
| Source lesson | Exact book-outline identity | `<source-edition-key>:lesson-<two digits>` |
| Curriculum outcome | Authority-owned identity | Supplied by the reviewed official curriculum artifact; never derived from a book lesson number |
| Learning unit | NexaLab-authored/versioned unit | Stable unit ID plus immutable version; may map to multiple outcomes and sources |

`strand` and `disciplineTags` solve different problems. For example, chemical reaction content belongs to the `MATTER` strand and carries the `CHEMISTRY` tag. They must not be collapsed into one enum.

## Canonical Grade 8 chapter baseline

This is the approved navigation baseline derived from the current SGK table of contents. Printed-page ranges are source locators, not permission or outcome claims.

| Order | Chapter key | Vietnamese label | Printed pages | Source lessons | Strand | Discipline tags |
| ---: | --- | --- | ---: | --- | --- | --- |
| 0 | `khtn8-foundations-science-practice` | Nền tảng thực hành KHTN | 6–10 | Bài 1 | cross-cutting | multi-disciplinary; `SCIENCE_PRACTICE`, `LAB_SAFETY`, `MEASUREMENT` |
| 1 | `khtn8-ch-01-chemical-reactions` | Phản ứng hoá học | 11–34 | Bài 2–7 | `MATTER` | `CHEMISTRY` |
| 2 | `khtn8-ch-02-common-compounds` | Một số hợp chất thông dụng | 35–55 | Bài 8–12 | `MATTER` | `CHEMISTRY` |
| 3 | `khtn8-ch-03-density-and-pressure` | Khối lượng riêng và áp suất | 56–75 | Bài 13–17 | `ENERGY` | `PHYSICS` |
| 4 | `khtn8-ch-04-turning-effect-of-force` | Tác dụng làm quay của lực | 76–83 | Bài 18–19 | `ENERGY` | `PHYSICS` |
| 5 | `khtn8-ch-05-electricity` | Điện | 84–104 | Bài 20–25 | `ENERGY` | `PHYSICS` |
| 6 | `khtn8-ch-06-thermal-physics` | Nhiệt | 105–122 | Bài 26–29 | `ENERGY` | `PHYSICS` |
| 7 | `khtn8-ch-07-human-biology` | Sinh học cơ thể người | 123–169 | Bài 30–40 | `LIVING` | `BIOLOGY` |
| 8 | `khtn8-ch-08-organisms-and-environment` | Sinh vật và môi trường | 170–194 | Bài 41–47 | `LIVING` | `BIOLOGY`; `ENVIRONMENT_SUSTAINABILITY` where applicable |

`EARTH_SKY` stays a valid KHTN strand but has no chapter in this source edition. Coverage must report zero source chapters rather than remove the strand.

## Source lesson outline

| Lesson | Title | Start page | Chapter key |
| ---: | --- | ---: | --- |
| 1 | Sử dụng một số hoá chất, thiết bị cơ bản trong phòng thí nghiệm | 6 | `khtn8-foundations-science-practice` |
| 2 | Phản ứng hoá học | 11 | `khtn8-ch-01-chemical-reactions` |
| 3 | Mol và tỉ khối chất khí | 16 | `khtn8-ch-01-chemical-reactions` |
| 4 | Dung dịch và nồng độ | 20 | `khtn8-ch-01-chemical-reactions` |
| 5 | Định luật bảo toàn khối lượng và phương trình hoá học | 24 | `khtn8-ch-01-chemical-reactions` |
| 6 | Tính theo phương trình hoá học | 28 | `khtn8-ch-01-chemical-reactions` |
| 7 | Tốc độ phản ứng và chất xúc tác | 31 | `khtn8-ch-01-chemical-reactions` |
| 8 | Acid | 35 | `khtn8-ch-02-common-compounds` |
| 9 | Base. Thang pH | 39 | `khtn8-ch-02-common-compounds` |
| 10 | Oxide | 44 | `khtn8-ch-02-common-compounds` |
| 11 | Muối | 48 | `khtn8-ch-02-common-compounds` |
| 12 | Phân bón hoá học | 53 | `khtn8-ch-02-common-compounds` |
| 13 | Khối lượng riêng | 56 | `khtn8-ch-03-density-and-pressure` |
| 14 | Thực hành xác định khối lượng riêng | 59 | `khtn8-ch-03-density-and-pressure` |
| 15 | Áp suất trên một bề mặt | 64 | `khtn8-ch-03-density-and-pressure` |
| 16 | Áp suất chất lỏng. Áp suất khí quyển | 67 | `khtn8-ch-03-density-and-pressure` |
| 17 | Lực đẩy Archimedes | 73 | `khtn8-ch-03-density-and-pressure` |
| 18 | Tác dụng làm quay của lực. Moment lực | 76 | `khtn8-ch-04-turning-effect-of-force` |
| 19 | Đòn bẩy và ứng dụng | 79 | `khtn8-ch-04-turning-effect-of-force` |
| 20 | Hiện tượng nhiễm điện do cọ xát | 84 | `khtn8-ch-05-electricity` |
| 21 | Dòng điện, nguồn điện | 88 | `khtn8-ch-05-electricity` |
| 22 | Mạch điện đơn giản | 91 | `khtn8-ch-05-electricity` |
| 23 | Tác dụng của dòng điện | 95 | `khtn8-ch-05-electricity` |
| 24 | Cường độ dòng điện và hiệu điện thế | 99 | `khtn8-ch-05-electricity` |
| 25 | Thực hành đo cường độ dòng điện và hiệu điện thế | 102 | `khtn8-ch-05-electricity` |
| 26 | Năng lượng nhiệt và nội năng | 105 | `khtn8-ch-06-thermal-physics` |
| 27 | Thực hành đo năng lượng nhiệt bằng joulemeter | 109 | `khtn8-ch-06-thermal-physics` |
| 28 | Sự truyền nhiệt | 112 | `khtn8-ch-06-thermal-physics` |
| 29 | Sự nở vì nhiệt | 118 | `khtn8-ch-06-thermal-physics` |
| 30 | Khái quát về cơ thể người | 123 | `khtn8-ch-07-human-biology` |
| 31 | Hệ vận động ở người | 125 | `khtn8-ch-07-human-biology` |
| 32 | Dinh dưỡng và tiêu hoá ở người | 128 | `khtn8-ch-07-human-biology` |
| 33 | Máu và hệ tuần hoàn của cơ thể người | 135 | `khtn8-ch-07-human-biology` |
| 34 | Hệ hô hấp ở người | 142 | `khtn8-ch-07-human-biology` |
| 35 | Hệ bài tiết ở người | 146 | `khtn8-ch-07-human-biology` |
| 36 | Điều hoà môi trường trong của cơ thể người | 150 | `khtn8-ch-07-human-biology` |
| 37 | Hệ thần kinh và các giác quan ở người | 152 | `khtn8-ch-07-human-biology` |
| 38 | Hệ nội tiết ở người | 157 | `khtn8-ch-07-human-biology` |
| 39 | Da và điều hoà thân nhiệt ở người | 160 | `khtn8-ch-07-human-biology` |
| 40 | Sinh sản ở người | 165 | `khtn8-ch-07-human-biology` |
| 41 | Môi trường và các nhân tố sinh thái | 170 | `khtn8-ch-08-organisms-and-environment` |
| 42 | Quần thể sinh vật | 174 | `khtn8-ch-08-organisms-and-environment` |
| 43 | Quần xã sinh vật | 177 | `khtn8-ch-08-organisms-and-environment` |
| 44 | Hệ sinh thái | 180 | `khtn8-ch-08-organisms-and-environment` |
| 45 | Sinh quyển | 185 | `khtn8-ch-08-organisms-and-environment` |
| 46 | Cân bằng tự nhiên | 188 | `khtn8-ch-08-organisms-and-environment` |
| 47 | Bảo vệ môi trường | 191 | `khtn8-ch-08-organisms-and-environment` |

## Mapping rules

1. A source lesson is not automatically one LearningUnit. Editors may split it into several outcome-aligned units or combine supporting sections from SGK, SGV, SBT, and reusable sources.
2. `chapterKey` is stable navigation. `sourceChapterLabel` preserves exact wording from each edition.
3. A video, quiz, study-card set, practical, or simulation attaches to a LearningUnit/outcome, not directly to a whole book or discipline tag.
4. Agent-generated mappings are `CANDIDATE`; only reviewed mappings become `VERIFIED`. A mapping stores rationale, source locator, reviewer, and version.
5. Coverage is not inferred from page count. Report `outcomes_mapped`, `knowledge_units_reviewed`, `lessons_released`, `assessments_released`, `practicals_specified`, `media_available`, and `simulations_available` separately.
