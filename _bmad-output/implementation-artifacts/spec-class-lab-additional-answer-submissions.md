---
title: 'Class Lab additional question submissions and teacher grading'
type: 'feature'
created: '2026-11-06'
status: 'in-progress'
baseline_commit: '2c9ca2dcc7127def24e33fc4302cf58fe15f8e9d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - 'docs/product/class-lab-additional-questions.md'
  - 'docs/product/class-lab-foundational-fork-direction.md'
---

<frozen-after-approval reason="human-owned intent — approved by the user request to complete the additional-question flow">

## Intent

**Problem:** Class Lab already lets teachers author supplementary prompts, but students can only see them. They cannot submit answers, and teachers have no place to receive or grade those responses.

**Approach:** Complete the supplementary question workflow with student text answers, immutable submissions tied to the published Class Lab version and optional assignment, and a teacher inbox that records a separate manual grade and feedback. Keep this separate from the Foundational Lab's simulation questions and evaluator.

## Boundaries & Constraints

**Always:** Reuse `ClassResource` ownership, approved enrollment, assignment targeting, classLab snapshots and existing idempotency patterns. Validate all prompt IDs/answers and student/teacher authorization server-side. Preserve submission history; revisions or grade edits must not rewrite an earlier student response. Manual grading is separate from the Lab simulation verdict and official Foundational progress. Use the existing integer 0–100 score convention and optional teacher feedback.

**Never:** Change Foundational Lab question/checkpoint content, model behavior, rubric, automatic evaluator, `AssignmentSubmission` test scoring, or prior class resource/assignment snapshots. Do not introduce arbitrary answer types or auto-grade free text. Do not add external notifications or change deployment/shared database state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Submit | Approved student submits one answer per published prompt for a published Class Lab, in practice or as an assignment target | Immutable response attempt is stored against resource version and assignment context; student sees receipt | Reject missing/duplicate/unknown prompt IDs, oversized answers, wrong class, non-target, archived/ineligible context |
| Resubmit | Student submits another attempt for the same context | New attempt is appended; earlier responses and grades remain available | Idempotent retry returns the same submission; changed payload with reused key is rejected |
| Teacher review | Owning teacher opens responses for a resource/assignment | Responses show student, submit time, attempt, answers and grade state | Non-owner or mismatched resource/assignment is denied |
| Grade | Owner records integer score 0–100 and optional bounded feedback | Grade/feedback are stored separately from Lab verdict and visible to the student | Reject invalid score, empty/non-submitted response, or unauthorized grader |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma`: add an append-only Class Lab response record linked to class resource, student and optional assignment; do not reuse `AssignmentSubmission`, whose contract is for server-scored tests.
- `src/modules/classes/application/class-resource-contract.ts`: existing `reportPrompts` are the source prompts. Validate answer count, IDs and text limits against the exact immutable resource snapshot.
- `src/modules/classes/application/class-resources.service.ts` and `src/modules/classes/interface/class-resources.controller.ts`: add student submit/read-own and owner list/grade operations, using existing ownership/member and transaction/audit patterns.
- `src/modules/classes/application/assignments.service.ts` and `src/modules/classes/interface/assignments.controller.ts`: verify optional assignment belongs to the class, uses the same resource snapshot and targets the submitting student.
- `src/features/labs/Lab.tsx`: add the supplementary response form after/beside existing teacher instructions; submit via class-resource context or assignment snapshot without changing the Lab evaluator payload.
- `src/features/classes/ClassSpaceResources.tsx` and `src/features/classes/ClassLabs.tsx`: expose teacher response inbox/review and grading controls from the class resource and assigned Lab surfaces.
- `src/modules/classes/application/class-resources-rich.integration.test.ts` and FE class/lab tests: cover role isolation, snapshot binding, answer validation, submit/retry, grade visibility and immutability.

## Tasks & Acceptance

**Execution:**
- [x] Add additive Prisma model/migration for immutable response attempts and separate teacher grade fields.
- [x] Add Zod contracts and service/controller endpoints for student submission, student receipt, teacher list and grade; enforce class membership, assignment target, resource version and teacher ownership.
- [x] Add the student answer/submit UI for existing `reportPrompts`, with loading, validation, success and retry states.
- [x] Add teacher inbox and grading UI with response history, score 0–100, feedback and saved status.
- [x] Add focused integration assertions and update the additional-question product doc with implemented limits.

**Acceptance Criteria:**
- Given a published Class Lab with supplementary prompts, when an eligible student submits complete answers, then the server stores one immutable response attempt bound to that exact resource version/context.
- Given a student submits again or retries an idempotent request, when the server receives it, then it appends exactly one new attempt or returns the original attempt without overwriting history.
- Given the owning teacher opens the Class Lab, when responses exist, then the teacher can read each response and save a valid score/feedback; another teacher cannot access or grade it.
- Given a teacher grades a response, when the student views it, then the grade/feedback are visible and the Lab simulation verdict, rubric and Foundational progress are unchanged.
- Given a Class Lab is revised, when old responses are viewed, then they remain attached to the original resource/assignment snapshot and retain their original answers and grade.

## Implementation Notes

- Added `ClassLabAdditionalResponse` plus migration `20261106140000_class_lab_additional_responses`. Submitted answer/prompt/resource snapshot fields are protected by a DB trigger; grade/feedback fields remain editable and are audit logged.
- Student API requires an active class, approved membership, published LAB resource, complete non-empty answers for the exact current prompt set, and (when assigned) an active assignment with the same Class Lab snapshot and a matching target. Class-wide and subset assignments both use resolved assignment targets.
- Added student submit/history form in `nexalab-fe/src/features/classes/ClassLabAdditionalResponses.tsx`, included in student Lab Space, and teacher inbox/grade controls in class resources and assigned Class Labs. Manual score remains separate from simulation evaluation.
- Verification: BE and FE lint pass; BE TypeScript build and FE production build pass; Prisma schema validation passed. Focused integration coverage was added, but not run because `NEXALAB_ISOLATED_DATABASE_URL` is not configured. Migration `20261106140000_class_lab_additional_responses` was applied to the configured Supabase project and verified: table present, RLS enabled, immutable trigger present. No sample responses were inserted.
