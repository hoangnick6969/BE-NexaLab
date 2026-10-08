# NexaLab product idea

The product idea is still under discovery. This records the current direction and codebase evidence; it is not a PRD or a final MVP decision.

## CORE — MVP

Owner-defined MVP direction:

- A Vietnamese THCS Natural Science LMS: lessons, reading/video content, flashcards/study cards, quizzes, assignments and progress tracking.
- Interactive 3D/virtual labs, practical challenges and a deterministic simulation engine for Grade 8–9 Physics, Chemistry and Biology.
- Teacher class and student management, lesson management, assignment, outcome review/grading, progress monitoring and learning-evidence inspection.
- Read-only parent progress tracking and admin management of users, content, labs and assets.

The Release 1 student loop is **Learn → Quiz → Practice/Simulation → Challenge → Retry → Progress**. Teacher AI Content Assistant comes before Student AI Hint, which is post-Release 1 scope. Existing code implements parts of these flows, not their complete scope.

## AI ASSISTANCE

Teacher assistance direction:

- Draft quizzes/tests, flashcards/study cards and questions from a lesson or topic.
- Draft learning materials and assist with analysis of learning evidence.
- Teacher review, edit, approval and publication before any generated content is used.

AI should assist teachers; it should not automatically replace teacher judgment. Student AI may explain, ask Socratic questions and give progressive hints grounded in verified lesson/lab/challenge context. Existing implementation is a configurable, student-facing lab tutor that can add a bounded question to rule-based hints. No teacher-facing generation or answer-analysis feature was found.

## FUTURE / RESEARCH

Keep these outside the MVP discussion until validated; no decision is made about eventual implementation:

- Computer Vision/gesture interaction; advanced answer similarity or cheating detection.
- Student competency prediction, including whether a score reflects actual ability.
- Advanced AI-generated simulations, token-based monetization and parent-specific AI asset workflows.
- Other advanced AI capabilities not yet validated.

## Assessment discovery map

“Current idea” means a direction listed for discovery, not a requirement. “Unknown” means the codebase and supplied idea do not establish it.

| Assessment area | Status | Evidence / boundary |
| --- | --- | --- |
| Multiple-choice | Current implementation | Lesson quizzes store options and an answer index; server calculates score. |
| True/false | Unknown | No separate question type found. |
| Short answer | Current implementation | Eye lab checks typed names against a fixed set; general lesson short-answer support is unknown. |
| Essay/free response | Unknown | No essay workflow found. |
| Quiz | Current implementation | Lesson quiz endpoint and UI exist; the implemented format is multiple-choice. |
| Practice exercises | Current implementation | Lab challenges accept attempts and return deterministic results. |
| Midterm/final practice | Current idea | Raised for discovery; no such practice flow found. |
| Simulation-based assessment | Current implementation | Server evaluates lab attempts for the three existing simulations. |
| Mixed questions + simulation | Unknown | Lessons can link to a lab, but a combined assessment flow is not established. |
| Teacher-created assignments | Current implementation | Teachers can assign a lesson or lab to a class or selected students. |
| AI-generated question suggestions | Current idea | No implementation found. |
| AI-assisted grading | Unknown | Existing scores are deterministic; no AI grading path found. AI assistance would not imply automatic grade decisions. |
| Answer similarity | Current idea | No implementation found; advanced similarity/cheating detection is a future/research direction, outside MVP. |
| Assessment analytics | Current implementation | Partially implemented: progress and class analytics endpoints expose scores, attempts and some circuit misconceptions; scope and usefulness remain open. |
| Possible competency estimation | Current idea | No implementation found; future research only. Whether a score reflects ability is a research question, not a requirement. |

## Curriculum and content

Initial content focus is Vietnamese THCS Grade 8–9 Physics, Chemistry and Biology under GDPT 2018, mapped by grade, topic and chapter, with an approved textbook/content set. The exact approved set and references still need confirmation. The schema has curriculum, grade, chapter and topic fields; existing model documentation says textbook references have not been independently verified.
