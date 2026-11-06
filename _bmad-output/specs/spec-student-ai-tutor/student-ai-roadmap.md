# Student AI Roadmap (future specs)

SAI-01 is the first slice. Each later entry gets its own spec folder when its preconditions hold, and is tracked in `../../planning-artifacts/increment-sai-student-ai.md`. Every entry inherits these invariants:

- AI is advisory (FR-22). It never calculates or overrides a result, verdict, score, assignment status or progress.
- Every student-facing AI output writes a `HintLog` (or a successor row) with its context snapshot, rule, prompt and model versions, so it is traceable (BR-13) and replayable.
- Escalation is Question → Concept Hint → Action Hint → Explanation, only after a real retry (BR-06).
- No misconception or ability label is shown to a student (BR-09). Parents see a help-seeking summary only, never conversations (BR-11).
- Student data goes only to a provider tier that does not train on API data, and only after the SG-2 legal basis is recorded. Free tiers are excluded.

| Spec | Scope | SRS | Preconditions | Hard limits |
| --- | --- | --- | --- | --- |
| SAI-02 Teacher hint insights | Class-wide "where students are stuck" summary and per-student hint dependence, traceable to `Attempt`/`HintLog`; teacher can mark disagreement; extend `misconceptions()` beyond `circuit_001` with versioned rules | UC-AI-05, 06, 07 | SAI-01 shipped; merge with TAI-04 `HIGH_HINT_DEPENDENCE` so there is one insight engine, not two | Deterministic rules only; no student ranking; insight lists evidence IDs and rule version |
| SAI-03 Lesson and quiz hints | Hints on lesson basic exercises and study quizzes using lesson passages and the question, never the answer key | UC-AI-02 extended | SAI-01; content grounding from TAI-01 snapshot builder | Never reveals `correctOption`; no hints on scored TEST resources while open |
| SAI-04 Socratic free-text tutor | Student types a question inside a lab or lesson; curriculum classifier plus refusal and redirection; conversation logged | UC-AI-08 | SAI-01, SG-2 closed, PO-approved safety evaluation set (≥ 200 prompts including off-topic, unsafe and injection) | Off-topic → polite refusal and steer back; no answers to scored items; per-student budget; conversation retained per PO decision 6 |
| SAI-05 Parent help-seeking summary | Count of hints by level per lab, shown to linked parents | BR-11, parent AC-02 | SAI-01 | No content, no conversation, no misconception |
| SAI-06 Personalised wording | Use `studentLevel` or misconception hypotheses to choose variants | UC-AI-05 step 5 | SAI-02 rules validated; SG-2 | Wording changes only; level order unchanged; never shown as a label |

Order: SAI-01 → SAI-02 and SAI-05 → SAI-03 → SAI-04. SAI-06 waits for SAI-02 evaluation evidence.
