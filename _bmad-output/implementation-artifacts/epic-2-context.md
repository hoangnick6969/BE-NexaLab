# Epic 2 Context: A student learns from complete core materials

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give an assigned student a complete, stable lesson experience before practical simulation: reading, video or an approved equivalent, and study cards appear in an authoritative order, progress survives reloads, and the interface always identifies the next server-authorized action while keeping later learning steps visible but locked. This makes NexaLab a coherent Grade 8 learning path rather than a collection of disconnected activities.

## Stories

- Story A2-T1: Authoritative ordered lesson pathway
- Story A2-T2: Complete and resume reading
- Story A2-T3: Resume and complete video or equivalent text
- Story A2-T4: Review study cards and advance to Quiz
- Story A2-T5: Verify resilience and interaction budgets

## Requirements & Constraints

- Students may open only published lessons from assignments applicable to their approved enrollment. Unauthorized or unrelated direct requests must not reveal content metadata.
- A lesson exposes curriculum reference, subject, grade, chapter, topic, learning objective, and prerequisites together with its complete ordered pathway.
- A2 supports reading, non-autoplay video or an approved equivalent, and study cards. Quiz, lab, and challenge steps may be shown as future steps but their scoring, execution, and unlock rules belong to later epics.
- Reading completion is explicit. Video progress uses a monotonic playback high-water mark and completes at 90 percent watched or on `ended`; unavailable video requires a published equivalent with an explicit completion action. Study-card completion requires every published card to have been visited.
- Official progress is persisted by authorized backend operations. Updates are idempotent and cannot lower prior evidence; failed writes must never be shown as saved.
- Every asynchronous learning surface provides layout-preserving loading, populated, empty or unavailable, and recoverable-error states. Student input or unsent progress must remain recoverable when a request fails.
- The core path must work with keyboard and touch, use targets of at least 44 by 44 pixels, meet WCAG AA for rendered colors, respect reduced motion, and avoid horizontal overflow or obscured primary actions at 390, 768, 1024, and 1440 pixels.
- Use the approved NexaLab-authored Grade 8 Natural Science pilot content with explicit curriculum metadata. Software verification does not establish curriculum or subject-matter approval.
- Keep the experience honest: one primary next-step action per screen, no fabricated metrics, peer ranking, shame language, or score without traceable evidence.

## Technical Decisions

- The backend is authoritative for assignment applicability, ownership, pathway state, progress, and learning gates. The frontend renders server state and may use provisional local state only when it is visibly reconciled with the mutation response.
- Model lesson structure as ordered `LessonStep` records with validated types and a unique lesson-position pair. Model per-student evidence as unique `StepProgress` records containing status, a validated 0–100 progress value, optional resume position, and server-authored timestamps.
- Published lesson validation rejects duplicate positions, unsupported types, invalid references, missing required resources, and empty required content. Student responses expose sanitized learning resources only, never quiz answers or hidden authoring data.
- The pathway read authorizes the authenticated student's applicable assignment and returns lesson and assignment summaries, ordered steps with official states and lock reasons, the next step identifier, and a server timestamp.
- The progress mutation uses a step-type-specific Zod union, verifies that the step belongs to the lesson and student pathway, applies a monotonic transition, updates the rebuildable aggregate progress projection transactionally, and returns the reconciled step plus full pathway.
- Use authenticated actor identity rather than client-supplied ownership. API payloads use opaque string IDs, ISO-8601 UTC timestamps, stable success shapes, and recoverable errors shaped as `{ statusCode, code, message, details? }`.
- Backend Zod schemas and generated OpenAPI are the canonical HTTP contract. Any contract change updates backend tests and the frontend types, fixtures, consumers, and recovery behavior in the same vertical ticket.
- Retry safe reads only with bounded backoff. Never blindly retry a non-idempotent mutation; use an idempotency key or a stable conflict response where a mutation can be retried.
- Verify source, automated checks, real-dependency runtime behavior, and production behavior as separate evidence tiers. Runtime acceptance requires the actual seeded PostgreSQL/API/frontend/browser stack.

## UX & Interaction Patterns

- Render the lesson in a fixed top-to-bottom sequence: objective, reading, video, study cards, quiz, practical work, then challenge. Locked future steps remain in flow with a lock icon and a precise prerequisite explanation; they are disabled, not hidden.
- The primary Continue action targets the next unlocked server-authorized step and uses concrete step-specific copy rather than a generic continuation label.
- Video exposes controls, duration, progress, transcript access, retry, and approved equivalent content without autoplay. Study cards show one card at a time with count, Previous and Next controls, arrow-key and touch support, and a usable no-motion presentation.
- Preserve page structure through loading and content replacement. Use restrained transform or opacity motion only, keep keyboard order aligned with visual order, and ensure no critical action depends on hover, gesture, or animation.
- Use subject color only for subject context, not status, score, or progress. Locked, in-progress, completed, unavailable, and error states need text or icon cues in addition to color.

## Cross-Story Dependencies

- Epic A2 begins only after the A1 provisioned-student assignment and lesson-opening journey has real runtime acceptance.
- The authoritative pathway and evidence model established in A2-T1 underpin reading, video, and study-card progress. Those three experiences converge on the server-confirmed Quiz boundary; A2 does not implement quiz scoring or practical unlocks.
- Resilience and interaction-budget verification covers the integrated A2 path after the material-specific stories are complete. Production remains a separate gate and is not implied by source, unit, contract, or local browser evidence.
