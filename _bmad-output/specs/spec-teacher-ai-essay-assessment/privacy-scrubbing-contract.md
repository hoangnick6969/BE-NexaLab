# TAI2-T0 — Privacy scrubbing contract (policy `g2-pii-scrub@1`)

**Status:** gate G-2 closed for development and test by a **team-lead decision recorded 2026-11-09**, on the assumption of PII scrubbing / anonymization combined with the existing 3-layer privacy architecture. This is **not** an approval by the product owner, the supervising lecturer or a legal reviewer; the legal review under Law 91/2025/QH15, Decree 356/2025/NĐ-CP and Decree 330/2026/NĐ-CP and the provider/DPA review remain open. Code: `src/config/ai-assessment.ts`, `src/modules/ai/application/assessment-privacy.ts`.

## What may leave the server

Only the `AssessPromptPayload` of `prompt-spec.md`, nothing else:

| Field | Source | Notes |
| --- | --- | --- |
| `topic` | lesson title | teacher-authored |
| `prompts[].promptId` | server UUID of the prompt | not a person identifier |
| `prompts[].question` | prompt text | teacher-authored |
| `prompts[].referenceAnswer` | optional, teacher-only | never shown to students or parents |
| `prompts[].criteria[]` | code, description, maxPoints, anchors | teacher-authored |
| `prompts[].response` | the student's answer **after redaction** | delimited as data (`<data>` block, `<` escaped) |

Never sent: student id, name, username, email, enrollment, class id or name, parent data, `commonPhrases`, `maxChars`, TAI-03 similarity data, grades.

## Layers enforced in code

1. **Minimization:** the snapshot builder copies only the fields above (`buildAssessSnapshot`).
2. **Redaction (`redact@1`):** the submitting student and every approved class member — full name, name tokens of at least 2 characters, username, email, user id — become `[HỌC_SINH]`; emails, phone numbers (`(\+84|0)` + 9–12 digits), URLs, 9–12 digit identifier numbers and the class name become `[ĐÃ_ẨN]`. Whole-word, case-insensitive, NFC. An offset map links the redacted text back to the original answer for evidence highlighting.
3. **Data, not instructions:** the response is serialized once inside `<data>` with `<` as `<`; `injection@1` runs before any call and a match makes no provider call (suggestion `SUPPRESSED`, flag `INJECTION_SUSPECTED`).
4. **Fail-closed guard:** `buildAssessProviderRequest` runs `assertProviderPayloadSafe` before building a request: exactly the payload keys (any other key, e.g. `studentId`, `className`, `similarity`, fails), no residual identifier in any string (responses with name tokens; teacher text with whole names, usernames, emails, ids, class names and the email/phone/URL/ID-number patterns). The runner re-reads identities at run time, so a classmate who joined after the request is also caught. A violation throws `PrivacyGuardError` (field paths and kinds only, never the matched text); nothing is sent and the job fails `PRIVACY_GUARD_REJECTED` (not retried).

## Eligibility under `g2-pii-scrub@1`

- `AI_POLICY_INELIGIBLE` with `detail`: `IDENTIFIER_IN_PAYLOAD` (the guard rejects the payload at request time, e.g. a student name in the reference answer), `REDACTION_DOMINANT` (more than 50 % of a response is personal data), `RESPONSE_MISSING`.
- `consentRequired: false`. The code supports a policy with `consentRequired: true` (skip `CONSENT_REQUIRED` unless an approved linked parent has an active `ai-assessment` `ParentConsent`); no recorded policy uses it yet.
- `allowedProviders: ["fake"]`, `productionAllowed: false`: boot fails if the gate is enabled with any other provider or in production. A live provider needs a new policy record backed by PO and legal approval.

## Configuration and boot checks

`AI_ASSESSMENT_ENABLED` (default `false`), `AI_ASSESSMENT_MODE` (`off|shadow|assist`, default `off`), `AI_ASSESSMENT_POLICY`, `AI_DAILY_ASSESSMENT_LIMIT` (default 200). Boot fails when the gate is enabled without a recorded policy, with an uncovered provider, in production under this policy, when a mode is set while the gate is off, or when `assist` is set without a recorded shadow-evaluation PASS for the active prompt version (a SYNTHETIC pass is refused in production).

## Known limits

- Redaction of known identifiers does not prevent indirect identification (a description of a person, a rare event). It is one layer, not a guarantee.
- Name tokens are matched as whole words, so common Vietnamese words that equal a classmate's name token (for example `an`, `gia`, `bảo`) are also replaced. This over-redaction can lower suggestion quality; it never leaks.
- Retention: the redacted snapshot lives on `AiJob.inputSnapshot` and is deleted with the submission (`AiJob.submissionId` cascade). A retention job is still out of scope (NS-13).
