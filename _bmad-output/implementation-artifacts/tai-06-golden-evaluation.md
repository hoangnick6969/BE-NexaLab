# TAI-06 golden evaluation (SYNTHETIC, fake provider)

**Status: synthetic harness proof, NOT the lecturer evaluation.** Proposals were produced by the deterministic fake provider from a fixed set and checked by the same pipeline the job runner uses. No live provider was called (gate G-6 is open for real providers; the team-lead decision of 2026-11-09 limits tests and golden cases to the fake provider). No supervising lecturer labelled anything, so the ticket's 70% sensible-and-appropriate gate is **not assessed**.

- Prompt: `draft-lab-challenge@1`; provider: fake (deterministic); bounds: team-lead default bounds 2026-11-09, pending PO/reviewer confirmation.
- Proposals generated: 18; kept: 13; dropped: 5.
- Kept proposals inside the validated ranges: 13/13. Kept proposals engine-verified (at least one reference state passes, at least one does not, results equal a direct evaluate() call): 13/13.
- Dropped by reason: PARAMS_OUT_OF_RANGE 4, CHALLENGE_UNSOLVABLE 1.
- Lecturer labels: 0 of 13 (sensible and appropriate rate: not assessed).

| Lesson | Lab | Parameters | In range | Engine verified | Reference states passed | Sensible | Appropriate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| golden-circuit | circuit | `{"maxCurrentMa":20}` | yes | yes | 2/4 | not labelled | not labelled |
| golden-circuit | circuit | `{"maxCurrentMa":15}` | yes | yes | 2/4 | not labelled | not labelled |
| golden-circuit | circuit | `{"maxCurrentMa":10,"minLitLeds":1}` | yes | yes | 1/4 | not labelled | not labelled |
| golden-circuit | chemistry | `{"reactionId":"mg-hcl"}` | yes | yes | 1/14 | not labelled | not labelled |
| golden-chemistry | chemistry | `{"reactionId":"mg-hcl"}` | yes | yes | 1/14 | not labelled | not labelled |
| golden-chemistry | chemistry | `{"reactionId":"naoh-hcl"}` | yes | yes | 1/14 | not labelled | not labelled |
| golden-chemistry | chemistry | `{"reactionId":"cuso4-naoh"}` | yes | yes | 1/14 | not labelled | not labelled |
| golden-chemistry | chemistry | `{"experiment":"ph"}` | yes | yes | 1/14 | not labelled | not labelled |
| golden-chemistry | eye | `{"minScore":80}` | yes | yes | 1/3 | not labelled | not labelled |
| golden-eye | eye | `{"minScore":100}` | yes | yes | 1/3 | not labelled | not labelled |
| golden-eye | eye | `{"minScore":80}` | yes | yes | 1/3 | not labelled | not labelled |
| golden-eye | eye | `{"minScore":50}` | yes | yes | 2/3 | not labelled | not labelled |
| golden-eye | circuit | `{"maxCurrentMa":12}` | yes | yes | 1/4 | not labelled | not labelled |

Checks: every kept proposal is in range and engine-verified.
