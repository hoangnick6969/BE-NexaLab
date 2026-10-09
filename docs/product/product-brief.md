# NexaLab product brief

## Product direction

NexaLab is a Vietnamese THCS Natural Science learning platform. It provides the core experience of an LMS while making practical science learning central through interactive 3D/virtual labs, practical challenges, a deterministic simulation engine and contextual AI guidance.

Its differentiation is to address the **practice gap** and **diagnostic gap**: students can act, observe a scientific result, retry, and receive bounded guidance; teachers can see evidence of where and why students struggle.

## Audience and roles

- **Students** are the primary users. They learn from content and use labs, challenges and guidance directly.
- **Teachers** manage classes and students, manage lessons, assign work, review or grade outcomes, monitor progress and inspect learning evidence.
- **Parents** have read-only access to their child’s progress.
- **Admins** manage users, content, labs and assets.

## MVP scope

Release 1 student workflow: **Learn → Quiz → Practice/Simulation → Challenge → Retry → Progress.** Student AI Hint follows after Release 1.

The MVP includes lessons, reading/video content, flashcards or study cards, quizzes, assignments and progress tracking alongside interactive labs. Initial science scope is Grade 8–9 Vietnamese Natural Science under **GDPT 2018**, using an approved textbook/content set. Each lesson and lab needs a curriculum reference, learning objective and prerequisite knowledge.

Teachers manage classes and students, create or manage lessons, assign work, review/grade outcomes, monitor progress and inspect learning evidence. Parents only track their linked child. Admins manage users, content and labs/assets.

The MVP assessment model combines normal quizzes, practical challenge assessment and learning evidence. The simulation produces the scientific result; the Challenge Evaluator assigns pass, partial or fail; attempts feed progress, teacher analytics and bounded AI context.

## Product boundaries

- The simulation engine is the scientific source of truth. AI explains and guides; it never calculates or overrides a scientific result.
- Student AI is limited to the relevant curriculum, lesson, lab, challenge and verified attempt context. It must avoid revealing answers too early.
- AI may explain, ask Socratic questions, offer progressive hints, assist teachers with draft content, and help analyse learning evidence.
- Teachers review, edit, approve and publish AI-generated quizzes, tests, flashcards/study cards, questions and learning materials. AI does not make the final content decision.

## AI direction

The preferred content-assistance sequence is: draft quiz/test, flashcards/study cards and questions from a lesson or topic; then require teacher review, editing, approval and publication.

Teacher AI Content Assistant is Release 1 scope. Student tutoring follows after Release 1 and uses increasing support: **Question → Concept Hint → Action Hint → Explanation**. It combines lesson/lab/challenge context, student actions, deterministic results, attempts and hint history. It remains advisory and does not automatically grade a student.

## Useful analytics

Prioritize progress, completion, quiz scores, attempts, simulation/challenge results, hint usage and misconception evidence. Teacher views should identify students who need support and the evidence behind that conclusion.

## Later research and expansion

Keep computer vision/gesture interaction optional and outside the first release. Other later directions include advanced adaptive learning, AI-generated 3D/models/challenges, multiplayer, VR/AR, advanced parent features and optional paid AI support for students or parents.

## Evidence and decisions still needed

The product owner supplied this direction; it is not yet validated by student or teacher research. The draft [PRD](prd.md) carries these items as release gates and open planning decisions: confirm the approved Grade 8–9 content set and curriculum references, define learning and assessment success measures, validate priority workflows with intended users, and decide which listed MVP capabilities are required for the first release versus the first post-MVP increment.
