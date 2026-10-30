# Teacher AI Roadmap (future specs)

TAI-01 is the slice implemented first. Each later entry has its own spec folder (`spec-teacher-ai-essay-assessment`, `spec-teacher-ai-similarity`, `spec-teacher-ai-evidence-insights`, `spec-teacher-ai-credits`, `spec-teacher-ai-lab-drafting`) and is tracked in `../../planning-artifacts/increment-tai-teacher-ai.md`. Each starts only when its preconditions hold. Every entry inherits the TAI-01 runtime (`job-runtime-and-failure-modes.md`) and these invariants:

- AI output is a suggestion. Official records (published content, score, verdict, progress, teacher decision) change only through an authenticated human action with audit.
- Every derived output pins its input snapshot, prompt version, output schema version and algorithm/model version, so it can be replayed.
- No automatic conclusion about cheating, "true ability", ranking or labelling of a student.
- Student data is sent to a provider only after a documented legal basis (NFR-07, Decree 13/2023/NĐ-CP for minors), PII removal, and a provider tier that does not use API data to improve its products. The TAI-01 Gemini free tier does not qualify.
- No fine-tuning until there is a teacher-labelled dataset, data-use permission, and evidence that prompt + grounding is insufficient.

| Spec | Scope | Preconditions | Hard limits |
| --- | --- | --- | --- |
| TAI-02 Essay rubric assistance | New resource kind for constructed responses with versioned rubric (`criteria[]`, `maxPoints`, anchors); AI `suggestedScore` per criterion with evidence spans; teacher accept/edit/reject as append-only decision; `finalScore` only from teacher | TAI-01 shipped; new essay submission contract in I3 test lifecycle; legal basis for sending student text; shadow-mode agreement data (AI vs teacher) on ≥ 100 responses | Evidence spans must be verbatim substrings of the submission (server check); per-criterion clamp to `maxPoints`; student text delimited as data against prompt injection; no numeric self-reported confidence shown |
| TAI-03 Similarity | (a) question duplicate across classes and library; (b) submission similarity inside one assignment | TAI-01 duplicate rules proven; TAI-02 for free-text submissions | Scope never crosses assignment/class; MCQ answers, required formulas and short answers are excluded from strong flags; result is `REVIEW_REQUIRED`, never "cheating"; never changes score |
| TAI-04 Evidence consistency insights | Extends B2 deterministic support signals with `SCORE_CHANGE_UNUSUAL`, `MCQ_EXPLANATION_MISMATCH`, `SIMULATION_EXPLANATION_MISMATCH`, `HIGH_HINT_DEPENDENCE`, `INSUFFICIENT_EVIDENCE` | B2 shipped; ≥ 3 qualifying attempts per student per scope; rule thresholds approved | Deterministic rules first, models only in shadow mode; every insight lists evidence IDs and rule version; no rank, no "weak student" label, no change to score/progress |
| TAI-05 AI credits | `CreditAccount`, immutable `CreditTransaction` ledger, `PricingVersion`, estimate → reserve → settle → refund keyed by `AiJob.id` | ≥ 1 month of TAI-01 token usage to price operations; payment-provider decision | Idempotent per job; system failure always refunds; raw provider tokens never shown, only credits |
| TAI-06 Simulation drafting | AI proposes an allowlisted model plus parameters inside validated ranges from `SimulationPackVersion`; teacher previews; golden cases must pass | Lab Builder track out of R&D; AD-14 topic-bound packs | AI never generates simulation code; engine result stays authoritative (AD-7); custom Labs stay class-scoped |

Order: TAI-01 → TAI-02 → TAI-03 → TAI-04. TAI-05 waits for measured usage. TAI-06 waits for Lab Builder.
