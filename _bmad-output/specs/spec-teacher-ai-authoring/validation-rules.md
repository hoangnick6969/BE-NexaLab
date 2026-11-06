# Validation Rules and Evaluation

Validation is a pure function `validateItems(snapshot, targetKind, parsedOutput, duplicateCorpus) → { items, dropped }`, unit-tested without a database or provider.

## Normalization (used by duplicate and distinctness rules)

`normalize(s)`: NFC, lowercase with `vi-VN` locale, collapse whitespace, trim, strip trailing punctuation `.?!:;`, and unify `×`/`x`, `−`/`-`, and full-width digits. Vietnamese diacritics are **kept**, because removing them merges distinct words.

## Drop rules (item removed, reason recorded)

| Id | Rule | Reason code |
| --- | --- | --- |
| VR-01 | Item type matches the target kind family | `ITEM_TYPE_MISMATCH` |
| VR-02 | Length limits per output schema | `LENGTH_INVALID` |
| VR-03 | `SINGLE_CHOICE`: 2–6 options; `correctOption` is an integer index of an existing option | `ANSWER_KEY_INVALID` |
| VR-04 | Options pairwise distinct after `normalize` | `OPTIONS_NOT_DISTINCT` |
| VR-05 | No option is "all of the above / none of the above" style (`tất cả các đáp án`, `cả a và b`, `không có đáp án nào`…) | `OPTION_PATTERN_FORBIDDEN` |
| VR-06 | `sourceRefs` non-empty and every id exists in `snapshot.passages` | `GROUNDING_REF_INVALID` |
| VR-07 | `outcomeCodes` ⊆ snapshot outcome codes | `OUTCOME_INVALID` |
| VR-08 | Safety: no instruction for real-world hazardous procedures (mains electricity, mixing/tasting chemicals, self-made devices, medical advice), reusing and extending the pattern list in `labs/infrastructure/llm.ts` | `SAFETY_REJECTED` |
| VR-10 | Items beyond the requested `itemCount` | `OVER_COUNT` |

## Warning flags (item kept, shown to teacher)

| Id | Rule | Flag |
| --- | --- | --- |
| VW-01 | `normalize(prompt)` (or `front`) equals an existing class question/card | `EXACT_DUPLICATE` warning; teacher may accept, edit or reject |
| VW-02 | Character-trigram Jaccard ≥ 0.85 with an existing class item or another batch item | `NEAR_DUPLICATE` |
| VW-03 | Prompt or any option contains a digit together with a unit or operator (`[0-9]` and (`=`, `%`, a unit token such as `V`, `A`, `Ω`, `g`, `mol`, `°C`, `km/h`)) | `NUMERIC_REVIEW` |
| VW-04 | `correctOption` is the longest option and is at least 1.5× the mean length of the others | `ANSWER_LENGTH_CUE` |
| VW-05 | Prompt contains a negation (`không`, `sai`, `KHÔNG đúng`) | `NEGATIVE_STEM` |
| VW-06 | Requested difficulty differs from item difficulty | `DIFFICULTY_MISMATCH` |
| VW-07 | Exact or near duplicate of an earlier item in the same batch | `BATCH_DUPLICATE` |

`EDITED` payloads re-run VR-02..VR-05 and VR-08 (returning `AI_EDIT_INVALID` on failure) and recompute VW flags. A duplicate check against the original item is not applied to its own edit.

## Mapping at materialization

- `TEST`: `{ prompt, options, correctOption, explanation }` → `normalizeResourceContent("TEST", …)`.
- `STUDY_QUIZ`: `{ prompt, options, explanation }` → `normalizeResourceContent("STUDY_QUIZ", …)` (answer key dropped per existing contract).
- `DECK`: `{ front, back }` → `normalizeResourceContent("DECK", …)`.
- `sourceRefs`, `difficulty`, `outcomeCodes` and flags stay in `AiJobItem` only.

## Required unit fixtures

At minimum one passing and one failing fixture per VR rule. For VW-02 the boundaries are 0.84 / 0.85. For VW-01, a case- and whitespace-only difference must flag. For VR-04, a diacritic-only difference (`lực` vs `lúc`) must **not** count as a duplicate.

## Golden evaluation (release gate for TAI-01)

- Corpus: the seeded KHTN lessons `lesson-circuit` (ENERGY), `lesson-chemistry` (MATTER), `lesson-eye` (LIVING), with ≥ 20 TEST items each from the real provider, using the pinned prompt version.
- The supervising lecturer (giảng viên hướng dẫn) labels each item with: answer key correct (yes/no), scientifically accurate (yes/no), grounded in lesson (yes/no), decision (accept / accept-after-edit / reject).
- Pass when answer-key error ≤ 3%, scientific-accuracy error ≤ 5%, and accept + accept-after-edit ≥ 70%. Results are stored as `_bmad-output/implementation-artifacts/tai-01-golden-evaluation.md` with prompt version, model id and date.
- Any prompt version bump re-runs the golden evaluation before it becomes the default.
