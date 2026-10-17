# NexaLab product brief

## Product direction

NexaLab is a Vietnamese THCS Natural Science learning platform. It provides the core experience of an LMS while making practical science learning central through interactive 3D/virtual labs, practical challenges, a deterministic simulation engine and contextual AI guidance.

Its differentiation is to address the **practice gap** and **diagnostic gap**: students can act, observe a scientific result, retry, and receive bounded guidance; teachers can see evidence of where and why students struggle.

## Audience and roles

- **Students** are the primary users. They learn from content and use labs, challenges and guidance directly.
- **Teachers** manage classes and students, manage lessons, assign work, review or grade outcomes, monitor progress and inspect learning evidence.
- **Parents** have read-only access to their child’s progress.
- **Admins** manage users, content, labs and assets.

## Release 1 scope

Release 1 uses one shared architecture for Student, Teacher, Parent and Admin, delivered in three increments: Student Learning Core + Minimal Operations, Teacher Operations, then Parent and Admin. Open Curriculum follows **Content → Video → Basic practice → Optional foundational Lab → Progress**. Class Space separately provides teacher-created study cards and unscored study quizzes; scored tests appear only when explicitly assigned.

The MVP includes lessons, reading/video content, foundational practice, optional curriculum Labs, Class Space study cards and unscored study quizzes, explicitly assigned tests, and progress tracking alongside interactive labs. The first pilot scope is NexaLab-authored Grade 8 Vietnamese Natural Science content mapped to **GDPT 2018**; it does not copy a textbook without a separate rights decision. Each lesson and lab needs a curriculum reference, learning objective, prerequisite knowledge and subject review.

Teachers manage classes and students, create or manage lessons, assign work, review/grade outcomes, monitor progress and inspect learning evidence. Parents only track their linked child. Admins manage users, content and labs/assets.

Open-curriculum lesson practice and Class Space study quizzes are unscored learning activities. Teacher-created tests are scored only when explicitly assigned. Practical challenge assessment and its learning evidence remain separate: the simulation produces the scientific result; the Challenge Evaluator assigns pass, partial or fail; attempts feed progress, teacher analytics and bounded AI context.

## Product boundaries

- The simulation engine is the scientific source of truth. AI explains and guides; it never calculates or overrides a scientific result.
- Student AI is limited to the relevant curriculum, lesson, lab, challenge and verified attempt context. It must avoid revealing answers too early.
- AI may explain, ask Socratic questions, offer progressive hints, assist teachers with draft content, and help analyse learning evidence.
- For Class Space study materials, teachers may author directly, enter or import source data, or request AI-generated advanced extensions grounded in a linked lesson. Teachers review and publish every AI draft; AI does not make the final content decision. Scored tests require explicit assignment.

## Future AI direction

General-purpose Teacher AI Content Assistant and Student AI Tutor capabilities remain beyond the current bounded class study-content authoring scope. Any AI-generated class material remains a teacher-reviewed draft before publication.

Teacher AI Content Assistant and Student AI Tutor are Future capabilities. Student tutoring, when approved, uses increasing support: **Question → Concept Hint → Action Hint → Explanation**. It combines lesson/lab/challenge context, student actions, deterministic results, attempts and hint history. It remains advisory and does not automatically grade a student.

## Useful analytics

Prioritize progress, completion, quiz scores, attempts, simulation/challenge results, hint usage and misconception evidence. Teacher views should identify students who need support and the evidence behind that conclusion.

## Later research and expansion

Keep computer vision/gesture interaction optional and outside the first release. Other later directions include advanced adaptive learning, AI-generated 3D/models/challenges, multiplayer, VR/AR, advanced parent features and optional paid AI support for students or parents.

## Evidence and decisions still needed

The product owner supplied this direction; it is not yet validated by student or teacher research. The [PRD](prd.md) now records the approved Increment A policies, pilot matrix and measurable gates. Those decisions make A1–A5 implementable, but the targets remain hypotheses until the real seeded Supabase/API/frontend/browser journey and intended-user pilot are measured.
