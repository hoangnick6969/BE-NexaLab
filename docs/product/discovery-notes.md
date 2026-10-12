# Product discovery notes

This is a working evidence record, not a product brief or a requirements decision.

## Current audience direction from the product owner

- **Student — primary learner:** learns through lessons and directly uses interactive 3D/simulation activities.
- **Teacher — learning facilitator:** manages classes and students, creates/manages lessons, assigns work, grades/reviews outcomes, monitors progress and inspects learning evidence.
- **Parent — progress observer:** tracks their child’s learning.
- **Admin — platform operator:** manages the platform overall.

The owner-defined problem is that a conventional LMS alone does not close the practical-learning and diagnostic gaps in THCS Natural Science. NexaLab combines normal learning content with interactive simulation, practical challenges and contextual guidance. This direction is not yet validated by user research.

## Evidence from the current product

- The student experience has three interactive labs: an electricity circuit, fixed chemistry reactions and an eye model. The backend recomputes lab results; the eye activity accepts typed labels.
- Lessons support authored multiple-choice quizzes. Teachers can create classes, assign lessons or labs, and view student attempts and progress through class analytics.
- The lab tutor is student-facing and optional: rules-based hints work without an AI provider; configured Claude may add a bounded question. No teacher-facing AI content workflow was found.
- Lesson records include grade, chapter, topic and curriculum fields. The scientific-model notes say textbook references have not been independently verified.
- No user interviews, observed classroom workflows, or validation results were found in the inspected repositories.

## Hypotheses to test

- Students may learn science concepts better by predicting, changing a simulation and seeing the result.
- Teachers may need class assignment, review and evidence workflows to make lab practice usable in class.
- Combining quizzes, practical results and attempt evidence may make assessment more useful than either format alone.

These are hypotheses from the supplied direction and existing implementation, not validated user needs.

## Discovery decisions still needed

The owner’s answers were consolidated in `product-brief.md`. The later PRD planning pass fixed the first pilot to NexaLab-authored Grade 8 content mapped to GDPT 2018, defined Increment A cut lines, and recorded measurable pilot gates. Student/teacher research and subject review are still required to validate those decisions; this discovery note is not the current decision source.
