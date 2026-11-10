# Similarity Algorithms

Both functions are pure and versioned. Changing any constant or step requires a new version string.

## `qdup@1` — question duplicate (Part A)

- **Input text:** question `prompt` (or card `front`). For shared-library lessons, only the questions in `LessonStep` configs of type `QUIZ` and `BASIC_EXERCISE`; `Lesson.questions` is not read.
- **Normalization:** `normalize` from TAI-01 `validation-rules.md`. Diacritics are kept.
- **Exact:** `sha256(normalize(text))` equality.
- **Near:** character-trigram Jaccard ≥ 0.85 on `normalize(text)` padded with one space on each side. This padding is specific to `qdup@1`; TAI-01 VW-02 (`validate-items`) keeps its unpadded trigrams until TAI3-T2 switches the TAI-01 corpus to `qdup@1`.
- **Output per item:** `{ level: EXACT | NEAR, score, source: { kind, resourceId | lessonId, title, classId?, itemId } }`, at most 3 matches, best first.
- **Flag mapping:**

| Match | Same class | Other own class / library |
| --- | --- | --- |
| EXACT | `EXACT_DUPLICATE` (warning; teacher decides) | `EXACT_DUPLICATE_ELSEWHERE` (warning; teacher decides) |
| NEAR | `NEAR_DUPLICATE` | `NEAR_DUPLICATE_ELSEWHERE` |

## `subsim@1` — submission similarity (Part B)

Pure function `computeSubmissionSimilarity({ prompts, submissions })` in `ai/application/submission-similarity.ts`. Per prompt, for each current submission's response:

1. **Tokenize on the original text:** split into words on whitespace, then each word into tokens on Unicode punctuation (`\p{P}`). Symbols such as `=`, `+`, `°` and `$` are not punctuation. Every token keeps its offsets in the original text (UTF-16 code units), so NFC and NFD input both map back exactly; combining marks stay inside their token.
2. **Normalize each token:** NFC, lowercase `vi-VN`, diacritics kept. The response, the prompt text and every `commonPhrases` entry use the same tokenizer.
3. **Exclude tokens** (non-eligible, offsets kept; the first matching reason wins):
   - `FORMULA` (KaTeX): tokens that overlap a KaTeX span matched on the original text, block `\$\$[\s\S]+?\$\$` first, then inline `\$[^$\n]+?\$` outside the block spans. An unpaired `$` stays ordinary text.
   - `FORMULA` (formula-like): every token of a whitespace-delimited word that contains `=` or mixes digits with letters (`h2o`, `u=i.r`, `cuso4`); a word made only of mathematical symbols (`\p{Sm}`: `=`, `+`, `×`) marks itself and the previous and next word; and unit-only tokens (`v`, `a`, `ω`, `mol`, `g`, `ml`, `°c`). Pure numbers (`220`) stay eligible.
   - `PROMPT_TEXT`: tokens covered by a word 5-gram of the response's full token sequence that also occurs in the prompt's token sequence.
   - `COMMON_PHRASE`: tokens inside any contiguous occurrence of a `commonPhrases` entry of at least 2 tokens. A phrase of 5 or more tokens behaves like the 5-gram rule.
4. **Eligibility:** fewer than 40 eligible tokens (or no response) means the response is skipped with `SHORT_RESPONSE` for that prompt.
5. **Shingles:** consecutive word 5-grams over the eligible-token sequence (so removing prompt text does not split a copied passage). A shingle's text range runs from the start of its first token to the end of its last token in the original text. Hash: 64-bit FNV-1a over the UTF-8 bytes of the five normalized tokens joined by one space.
6. **Winnowing:** window w = 4 over the shingle hash sequence. Select the minimum hash per window (rightmost on ties) to get the fingerprint set F (distinct hashes) with the selected positions.
7. **Pair score:** `shared = |F_a ∩ F_b|` and `containment = shared / min(|F_a|, |F_b|)`. Thresholds use integer arithmetic: containment ≥ 0.60 is `shared × 5 ≥ min × 3`, and ≥ 0.80 is `shared × 5 ≥ min × 4`.
8. **Report** when containment ≥ 0.60 and `shared ≥ 8`. Level is `HIGH` when containment ≥ 0.80, otherwise `ELEVATED`.
9. **Spans:** merge the original-text ranges of the selected, shared shingles of each submission. Ranges with at most 3 original tokens between them join into one span. Return at most 10 spans per side, in text order.

A pair is the unordered combination of two different students' current submissions in the same assignment, compared prompt by prompt (a candidate index on the hashes keeps 200 submissions × 5 prompts fast). `perPrompt` lists only the prompts that reach the report threshold. The pair level is the highest prompt level and `maxContainment` the highest prompt containment. Pairs are sorted by `maxContainment` descending, then by submission ids; `submissionAId` is the lexicographically smaller id.

## Required fixtures

- `qdup`: case-only and whitespace-only differences → EXACT. Jaccard 0.84 → no match, 0.85 → NEAR. `lực` vs `lúc` → not EXACT. A copy in another teacher's class → never returned. A library lesson question → `EXACT_DUPLICATE_ELSEWHERE`.
- `subsim`:
  - Containment 0.59 → not reported; 0.60 with 7 shared → not reported; 0.60 with 8 → `ELEVATED`; 0.79 → `ELEVATED`; 0.80 → `HIGH`.
  - 39 eligible tokens → `SHORT_RESPONSE`; 40 → eligible.
  - Two responses that share only copied prompt text and formulas (`U = I.R`, `CuSO4`) → not reported.
  - Shared `commonPhrases` (including a phrase shorter than 5 tokens) → not reported.
  - Same student's old versus new submission → never compared (the function ignores a pair with the same `studentId`; the run layer passes only current submissions).
  - Identical responses in two different assignments → never compared (TAI3-T4: a run reads one assignment).
  - Spans map back to exact original-text offsets, including Vietnamese diacritics in NFC and NFD, and an NFD copy of an NFC text still matches.
  - 200 submissions × 5 prompts finish under 2 s on a dev machine (the measured time is recorded in `story_notes`).
