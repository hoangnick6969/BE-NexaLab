---
id: SPEC-teacher-ai-similarity
status: draft-blocked-on-tai-01-and-tai2-t2
companions:
  - implementation-contract.md
  - similarity-algorithms.md
  - tickets.md
  - ../spec-teacher-ai-authoring/validation-rules.md
  - ../spec-teacher-ai-essay-assessment/implementation-contract.md
  - ../spec-teacher-ai-authoring/teacher-ai-roadmap.md
sources:
  - ../../../docs/product/prd.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# TAI-03 — Question Duplicate and Submission Similarity Evidence

## Why

TAI-01 only checks duplicates inside one class. Teachers who reuse material across classes, or who draw on the shared library, still create near-identical items without noticing. Once TAI-02 adds free-text submissions, teachers also need a way to spot unusually similar answers inside one assignment. Without one, they compare answers by eye or rely on an opaque "plagiarism score". This spec gives deterministic, explainable evidence (matched text spans under a versioned algorithm) and leaves every judgment to the teacher.

## Capabilities

- **CAP-1 — Cross-class duplicate warnings:** when the teacher authors, imports or reviews AI drafts, items are checked against the teacher's own classes and released shared-library questions. **Success:** exact and near fixtures flag with the matched source title. Content from other teachers' private classes never appears.
- **CAP-2 — Lifecycle-consistent fingerprints:** question fingerprints follow resource create, draft update, publish, revise and archive. **Success:** every change updates fingerprints in the same transaction, and the backfill reconciles fingerprint counts with live items.
- **CAP-3 — Submission similarity run:** the owning teacher runs similarity on a written assignment and gets pairs with matched spans per prompt. **Success:** boundary fixtures pass, exclusions (short answers, prompt text, formulas, common phrases, same student, other assignments) hold, and a rerun on unchanged input replays the stored run.
- **CAP-4 — Teacher review of matches:** the teacher marks a pair as noted or dismissed, with an optional note. **Success:** reviews are append-only. Score, grade, status and notifications are untouched, and students and parents see nothing.

## Constraints

- Everything is deterministic and runs locally. No provider call is made, so no student text leaves the server. Every result records `algorithmVersion` (`qdup@1`, `subsim@1`).
- Part A corpus covers the requesting teacher's own classes plus `SHARED_LIBRARY` lessons that are published and not synthetic. Corpus rows from other owners are never returned, not even as counts.
- Part B compares only the current submissions of different students, in the same assignment and the same prompt. It never compares across assignments or classes, and never compares a student with their own earlier submissions.
- Results carry `REVIEW_REQUIRED` evidence, labelled "nội dung tương đồng", and never "gian lận" or "đạo văn". They never feed grades, rollups, B2 support flags, notifications or student/parent read models.
- Direct authoring and CSV import only warn. The TAI-01 rule stays: a same-class `EXACT_DUPLICATE` blocks unedited AI accept. A cross-class or library exact match is a warning (`EXACT_DUPLICATE_ELSEWHERE`).
- Runs are synchronous and bounded (≤ 200 submissions). Larger inputs are rejected instead of being queued, so no runner is added.

## Non-goals

- Cheating or plagiarism verdicts, penalties, or automatic score changes.
- Comparison against the internet, other schools, other teachers' private classes, or LLM-generated text detection.
- Semantic or embedding similarity (a possible later `algorithmVersion` with its own spec update).
- Similarity on TEST or STUDY_QUIZ answers (option choices are expected to coincide).

## Success signal

On `class-pilot-a`, the owner teacher creates a TEST containing a question copied from their other class and sees the warning with the source title, while `teacher.outsider`'s identical question never appears. For a written assignment with 6 fixture submissions (two near-copies, two sharing only the prompt text and formulas, two independent), one similarity run flags exactly the near-copy pair with spans in both texts. A rerun replays the same run, a dismissal is recorded, and scores and student views are unchanged.

## Assumptions

- Starting thresholds: trigram Jaccard ≥ 0.85 near-duplicate; containment ≥ 0.60 with ≥ 8 shared fingerprints reported, ≥ 0.80 HIGH; minimum 40 eligible tokens; word 5-gram shingles; winnowing window 4. Tuning on pilot data ships as a new `algorithmVersion`.
- The teacher's corpus stays ≤ 10 000 items. Beyond that only exact matching runs, and `CORPUS_TRUNCATED` is returned.

## Open Questions

- Should teacher-declared common phrases per prompt live in the WRITTEN_TASK rubric content (TAI-02 contract) or in a separate similarity setting? This spec assumes an optional `commonPhrases` field per prompt.
