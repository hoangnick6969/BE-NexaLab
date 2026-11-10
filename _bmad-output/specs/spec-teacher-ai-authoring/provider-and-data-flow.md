# TAI-01 Provider and Data Flow

**Status:** design reference only. TAI-01 has no implementation in the current codebase. Provider eligibility, personal-data safeguards, retention and product-scope approval remain open gates.

## Provider inventory

| Use | Current state | Provider and configuration |
| --- | --- | --- |
| Lab student hints | Implemented as a bounded optional adapter with deterministic-template fallback | Anthropic API; `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` |
| TAI-01 teacher authoring | Specified, not implemented or approved for live use | Planned Gemini API; `GEMINI_API_KEY` and `GEMINI_MODEL` |
| TAI-02 rubric suggestions | Specified, provider not selected | Must pass provider, legal and evaluation gates |
| TAI-03 similarity / TAI-04 insights | Designed as deterministic server functions | No LLM provider in the specified first wave |
| General Student AI chat | No implementation or TAI spec | Requires a separate scope, safety and data-flow decision |

The Lab Anthropic adapter is not the general Teacher AI provider. TAI-01's planned Gemini adapter is separate; the names above describe code/spec state, not an active service configuration.

## Proposed TAI-01 pipeline

```text
Teacher selects class, lesson, format, count and difficulty
  → backend checks owner, active class, lesson access, request bounds,
    provider eligibility, quota and idempotency
  → backend snapshots the request and lesson passages in AiJob (PENDING)
  → PostgreSQL-backed worker claims a lease and builds a versioned prompt
  → Gemini API receives the bounded lesson snapshot and teacher instruction
  → backend parses strict JSON and validates structure, grounding, content,
    safety and duplicate warnings
  → backend stores validated draft items and usage; raw provider text is discarded
  → teacher keeps, edits or rejects each item
  → accepted items become a normal ClassResource DRAFT
  → teacher uses the existing edit/publish flow; only then can students see it
```

Runtime values in the current spec: worker poll 2 seconds, lease 90 seconds, provider timeout 60 seconds, at most two attempts. There is no Redis queue in the design. Cancellation and stale-job behavior are specified in `job-runtime-and-failure-modes.md`.

## Proposed provider request

The stored input snapshot and provider request may contain:

- lesson title, grade, domain/topic and learning objective;
- selected lesson passages (up to 40 passages, each up to 1,200 characters);
- selected outcome statements;
- target format/count/difficulty and the teacher's free-text instruction.

The TAI-01 request has no student ID, name, account, answer, grade or chat-history field. That does **not** prove that no personal data can leave NexaLab: lesson text may contain identifying details, and free-text teacher instructions can include copied student work or other sensitive content. Until input boundaries and provider eligibility are approved, do not describe the payload as guaranteed non-personal.

## What the proposed design stores

| Location | Data described by the spec | Gap to close |
| --- | --- | --- |
| NexaLab `AiJob` | Request, immutable lesson/input snapshot, digest, prompt/schema versions, provider/model, status, token counts and failure metadata | Snapshot contains lesson text and teacher instruction in readable form |
| NexaLab `AiJobItem` | Validated item payload, source references and warning flags | Define teacher-facing access, deletion and retention with the shared retention work |
| NexaLab decisions | Append-only accept/edit/reject decisions and actor/time | Specify retention and export/deletion behavior |
| Provider | Receives the input snapshot rendered into the prompt and returns generated text | Confirm eligibility, data use, human review, location, subprocessors and deletion on the selected tier |
| Application logs | Job/provider request identifiers, status and usage; no prompt or raw output | Preserve redaction in error/observability paths |

The current design discards raw provider text, but it retains the submitted input snapshot and validated output in the application database. No TAI-01 retention/deletion job is specified; the roadmap points to the separate NS-13 retention work. Do not launch until that policy covers AI job snapshots, drafts, decisions and failed/cancelled jobs.

## Provider and data gates

1. **Gemini age/eligibility terms:** Google's [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms?authuser=00) include an age restriction for using the service as part of a website, application or service directed to or likely to be accessed by people under 18. NexaLab is child-facing. Obtain a written provider/legal interpretation for the teacher-only endpoint inside this application, or choose a provider whose terms permit the context. A paid tier's data-use terms alone do not settle this eligibility question.
2. **Free-tier data use:** Google's [billing/data-use documentation](https://ai.google.dev/gemini-api/docs/billing/) says content on the unpaid service may be used to improve Google products, while paid-service prompts/responses are not used for that purpose. The free tier must not receive personal or confidential information, and its general eligibility still needs the separate review above.
3. **Accidental personal data:** decide whether to remove free-text instructions, constrain them to a short educational instruction, and/or apply detection and rejection before provider submission. Detection must not be represented as a guarantee that all personal data is removed.
4. **Cross-border and retention:** record the data categories, destination, provider terms/DPA, subprocessors, retention/deletion and transfer assessment. The [Personal Data Protection Law 91/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=), [Decree 356/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160) and [Decree 330/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=219266&orggroupid=2&pageid=27160) are the current references to have counsel assess for the actual data flow. The old Decree 13/2023 reference is no longer a current standalone basis after Decree 356 took effect.
5. **Source rights and provenance:** verify that curriculum/textbook content may be transmitted to the selected provider for processing. Preserve `sourceRefs` and AI origin after a draft is materialized and published, or document how those references survive job deletion and retention cleanup.
6. **Scope approval:** closed. TAI-T0 was approved 2026-10-30 and synced to fl05 2026-11-05 (PRD §10.17, AD-17). Scope approval does not satisfy items 1–5; they remain gate G-6.

These notes identify review gates; they are not a legal determination that a provider or transfer is permitted.
