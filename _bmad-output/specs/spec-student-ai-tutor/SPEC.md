---
id: SPEC-student-ai-tutor
status: draft-awaiting-sai-t0-scope-approval
companions:
  - implementation-contract.md
  - hint-rules.md
  - student-ai-roadmap.md
  - tickets.md
  - ../../planning-artifacts/architecture-spine-nexalab-release-1/ARCHITECTURE-SPINE.md
sources:
  - ../../../docs/product/prd.md
  - ../../../docs/product/product-brief.md
  - ../../../docs/reference/srs-nexalab-v1.1.txt
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# SAI-01 — Students Get Bounded, Traceable Lab Hints

## Why

A student who fails a lab challenge often retries at random or gives up. FR-22 allows Student AI to give bounded advisory hints only. It must never calculate or override a result, verdict, score or progress. The SRS (UC-AI-01 to 04, 08, 09; BR-06, BR-13) fixes the shape: Question → Concept Hint → Action Hint → Explanation, escalating only after a real retry, with every hint logged. The codebase already has a rules-based lab tutor (`labs/application/tutor.ts`, `hint.ts`, `infrastructure/llm.ts`). It can add one LLM-phrased question at level 3 and above. It works, but it escalates on any new attempt, even an unchanged one. It also has no versioning, cache, LLM budget or kill switch, and it sends context to the provider without a payload allowlist. SAI-01 turns that prototype into the contract the SRS describes, without adding a new learning surface.

## Capabilities

- **CAP-1 — Grounded context:** the hint context is built only from the attempt, its challenge, the engine output and the student's earlier attempts on the same challenge (UC-AI-01). **Success:** `context.simulation` is a byte-equal copy of `Attempt.simulationResult`. No context field is produced by a model.
- **CAP-2 — Eligible hint request:** a student requests a hint for their own latest attempt on a challenge when that attempt is not `passed` (UC-AI-02). **Success:** other students' attempts return 404. An older attempt returns `400 HINT_NOT_LATEST_ATTEMPT`, and a `passed` attempt returns `409 HINT_NOT_NEEDED`. A repeated request for the same attempt returns the stored hint and creates no second row.
- **CAP-3 — Escalation only after a real retry:** the level rises from n to n+1 only when the lab-state digest of this attempt differs from the digest of the attempt that received level n (UC-AI-03, BR-06). **Success:** an identical re-run stays at level n and gets the next template variant, flagged `escalated: false`. Waiting never escalates, and level 4 is never reached without passing levels 1–3.
- **CAP-4 — Advisory output with rules fallback:** levels 1–2 always come from versioned templates. At levels 3–4, an optional provider may prepend one Socratic observation that passes the output guard in `hint-rules.md`. **Success:** every provider failure, timeout, guard rejection, kill switch or budget exhaustion returns the template for that level, with `provider` recording why. The student never sees an empty hint.
- **CAP-5 — Complete HintLog:** every returned hint, whether from a template, the cache or the provider, writes exactly one `HintLog` (UC-AI-04, BR-13). **Success:** the row stores level, content, context snapshot, context digest, rule version, prompt version, provider, model and cache hit. Replaying the rule version on the snapshot reproduces the template part of the content.
- **CAP-6 — Bounded cost and abuse:** per-student request rate limit, per-student daily provider budget and a cache of validated observations (UC-AI-09). **Success:** over the request limit returns `429 HINT_RATE_LIMITED` with `retryAfterSeconds`. Over the provider budget silently falls back to rules. A repeated `(challenge, lab-state digest, level, promptVersion, model)` is served from cache with no provider call.
- **CAP-7 — Curriculum lock by construction:** the hint route accepts no student free text (UC-AI-08 for this slice). **Success:** a request with any body field is rejected with 400. The provider prompt contains only allowlisted lab data.

## Constraints

- **FR-22 is absolute:** hint code never writes `Attempt.verdict`, `simulationResult`, scores, assignment status or official progress. The only progress side effect kept is the existing `projectLab`/`projectLesson` projection, which reads `lastHintLevel` and never changes a verdict.
- No provider call runs inside a database transaction or under an advisory lock. The existing three-step flow in `hint.ts` (read, call provider, short recheck transaction) is preserved.
- **Payload allowlist:** the provider receives only `challengeObjective`, `labState`, the engine result fields listed in `implementation-contract.md`, `hintLevel` and the template text. It never receives user ID, name, username, class, school, `studentLevel`, attempt IDs or hint history. A unit test asserts the exact request body keys.
- **Provider tier:** student interaction data may only go to a provider tier that does not use API data to train or improve its products. The TAI-01 Gemini free tier is excluded. Until gate SG-2 closes, `STUDENT_AI_LLM_ENABLED` must be `false` in production, so the tutor is rules-only even if a key is set.
- Misconception hypotheses (`misconceptions()`) are never shown to the student and never change hint wording in this slice (BR-09). Teacher-facing use is SAI-02.
- Parents never see hint content or the context snapshot (BR-11). This slice adds no parent field.
- Templates and the provider prompt are versioned in code (`tutor-rules@1`, `tutor-observation@1`). A pinned-digest test fails when text changes without a version bump.
- No new infrastructure. The cache and budget live in PostgreSQL and stay correct with more than one API instance. The in-memory `RequestRateLimiter` remains a front guard only.
- HintLog retention follows PO decision 6 (12 months after last activity), the same as attempts.

## Non-goals

- Free-text chat, "ask the tutor" boxes or open questions (roadmap SAI-04).
- Hints for lessons, quizzes, tests or Class Space resources (roadmap SAI-03).
- Teacher class-wide AI summary, insight trace and disagreement marking (UC-AI-05 to 07, roadmap SAI-02, coordinated with TAI-04).
- Parent help-seeking summary (roadmap SAI-05).
- Student credits, billing or a paid student tier.
- Using misconceptions or `studentLevel` to personalise wording.
- Fine-tuning or training on student data.

## Success signal

On `class-pilot-a`, `student.active` builds an open circuit in `circuit_001` and requests a hint: level 1 template, `provider: "rules"`. Re-running the identical circuit and asking again returns level 1 variant b with `escalated: false`. Changing the wiring, running and asking returns level 2. Two more real retries reach levels 3 and 4. With the fake provider enabled, the level-3 hint carries an observation. The same state from `student.outsider` in another class is served from cache with `cacheHit: true` and no provider call. The guard drops an injected observation containing a digit. Passing the challenge then asking returns `409 HINT_NOT_NEEDED`. The verdict, score and progress rows are identical to a run with hints disabled, except for `lastHintLevel`. A parent of `student.active` sees no hint content anywhere.

## Assumptions

- Lab state for circuits, chemistry and the eye model is a JSON value that `stableStringify` normalises deterministically. The digest ignores component display positions; see `hint-rules.md`.
- The current Anthropic adapter is kept as the first real adapter behind the new provider port. The model id stays in `ANTHROPIC_MODEL` (no default in code).
- One hint per attempt remains the unit. "Still don't get it" in UC-AI-03 maps to "run again, then ask again".

## Open Questions

- PRD §10 item 17 and the ARCHITECTURE-SPINE Deferred section treat AI as future work. FE `08-STUDENT-P0-UX-DEFINITION.md` says no hint UI in Student P0, yet `Lab.tsx` already shows "Nhận gợi ý". Does the PO approve activating FR-22 as increment SAI (SAI-T0)? Should the rules-only hint button stay visible in P0, or move behind `VITE_STUDENT_HINTS_ENABLED`?
- Should a `passed` attempt really refuse hints (SRS pre-condition), or return a level-4 reflection, which is what today's `SAFE` templates do?
- Which provider tier and legal basis (NFR-07, Decree 13/2023/NĐ-CP for minors) does the PO approve for gate SG-2?
