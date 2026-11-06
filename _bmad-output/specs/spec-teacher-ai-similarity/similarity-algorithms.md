# Similarity Algorithms

Both functions are pure and versioned. Changing any constant or step requires a new version string.

## `qdup@1` — question duplicate (Part A)

- **Input text:** question `prompt` (or card `front`).
- **Normalization:** `normalize` from TAI-01 `validation-rules.md`. Diacritics are kept.
- **Exact:** `sha256(normalize(text))` equality.
- **Near:** character-trigram Jaccard ≥ 0.85 on `normalize(text)` padded with one space on each side.
- **Output per item:** `{ level: EXACT | NEAR, score, source: { kind, resourceId | lessonId, title, classId?, itemId } }`, at most 3 matches, best first.
- **Flag mapping:**

| Match | Same class | Other own class / library |
| --- | --- | --- |
| EXACT | `EXACT_DUPLICATE` (warning; teacher decides) | `EXACT_DUPLICATE_ELSEWHERE` (warning; teacher decides) |
| NEAR | `NEAR_DUPLICATE` | `NEAR_DUPLICATE_ELSEWHERE` |

## `subsim@1` — submission similarity (Part B)

Per prompt, for each current submission's response:

1. **Normalize:** NFC, lowercase `vi-VN`, keep diacritics, replace punctuation with spaces, collapse whitespace.
2. **Tokenize:** split on whitespace and keep the char offsets of every token in the original text.
3. **Exclude tokens** (mark them as non-eligible but keep their offsets):
   - Tokens covered by any word 5-gram that also occurs in the normalized prompt text (`PROMPT_TEXT`).
   - Formula-like tokens: those containing `=`, digits mixed with letters (`h2o`, `u=i.r`, `cuso4`), or unit-only tokens (`v`, `a`, `ω`, `mol`, `g`, `ml`, `°c`) (`FORMULA`).
   - Tokens covered by a 5-gram occurring in the prompt's `commonPhrases` (`COMMON_PHRASE`).
4. **Eligibility:** fewer than 40 eligible tokens means the response is skipped with `SHORT_RESPONSE` for that prompt.
5. **Shingles:** consecutive eligible-token word 5-grams. Hash with 64-bit FNV-1a of the joined tokens.
6. **Winnowing:** window w = 4 over the shingle hash sequence. Select the minimum hash per window (rightmost on ties) to get the fingerprint set F with positions.
7. **Pair score:** `containment = |F_a ∩ F_b| / min(|F_a|, |F_b|)`, plus `shared = |F_a ∩ F_b|`.
8. **Report** when `containment ≥ 0.60` and `shared ≥ 8`. Level is `HIGH` when containment ≥ 0.80, otherwise `ELEVATED`.
9. **Spans:** merge the original-text ranges of matched shingles in each submission. Ranges ≤ 3 tokens apart join into one span. Return at most 10 spans per side.

A pair is the unordered combination of two different students' current submissions in the same assignment, compared prompt by prompt. The pair level is the highest prompt level. Pairs are sorted by containment descending, then by submission ids.

## Required fixtures

- `qdup`: case-only and whitespace-only differences → EXACT. Jaccard 0.84 → no match, 0.85 → NEAR. `lực` vs `lúc` → not EXACT. A copy in another teacher's class → never returned. A library lesson question → `EXACT_DUPLICATE_ELSEWHERE`.
- `subsim`:
  - Containment 0.59 → not reported; 0.60 with 7 shared → not reported; 0.60 with 8 → `ELEVATED`; 0.79 → `ELEVATED`; 0.80 → `HIGH`.
  - 39 eligible tokens → `SHORT_RESPONSE`; 40 → eligible.
  - Two responses that share only copied prompt text and formulas (`U = I.R`, `CuSO4`) → not reported.
  - Shared `commonPhrases` → not reported.
  - Same student's old versus new submission → never compared.
  - Identical responses in two different assignments → never compared.
  - Spans map back to exact original-text offsets, including Vietnamese diacritics.
