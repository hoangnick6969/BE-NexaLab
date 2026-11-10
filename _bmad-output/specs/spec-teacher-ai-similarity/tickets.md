# TAI-03 — Ordered Vertical Tickets

Part A (T1–T2) can ship right after TAI-01. Part B (T3–T5) waits for TAI2-T2.

## TAI3-T1 — Question fingerprint store and backfill

- `QuestionFingerprint` migration, `qdup@1` pure function, lifecycle hooks in the ClassResource transactions and shared-library publish/quarantine, and the backfill script.
- **Accept when:** the `qdup` fixtures in `similarity-algorithms.md` pass; create, revise and archive change fingerprints atomically (a rollback fixture leaves none); a backfill rerun is a no-op with matching counts; the route manifest is unchanged (the `duplicate-check` route belongs to TAI3-T2).
- **Depends on:** TAI-T3 (TAI-01 `normalize` and validation pipeline).

## TAI3-T2 — Cross-class duplicate warnings

- `duplicate-check` route, `duplicateWarnings` on create, update and import preview, TAI-01 corpus switch with `*_ELSEWHERE` flags, and FE warnings and badges.
- Matches exclude the item's own version chain: after `revise`, the published source and its new draft both keep fingerprints (TAI3-T1), so checks for a resource ignore rows of resources in the same class with the same `kind` and `title` (the revise lineage).
- **Accept when:** a copy from the teacher's other class and a library copy both warn with source title; `teacher.outsider`'s identical item never appears in matches or counts; direct authoring and TAI-01 review are never blocked by duplicate warnings.
- **Depends on:** TAI3-T1, TAI-T4.

## TAI3-T3 — `subsim@1` similarity engine

- Pure function with tokenization offsets, exclusions, winnowing, pair scoring and span merge.
- **Accept when:** every `subsim` fixture in `similarity-algorithms.md` passes, including the 0.59/0.60/0.79/0.80, 7/8 shared and 39/40 token boundaries, and span offsets on Vietnamese text; 200 submissions × 5 prompts finish under 2 s on a dev machine (recorded).
- **Depends on:** TAI2-T2 (written submission shape).

## TAI3-T4 — Similarity runs and review API

- Run, match and review migrations; create (with replay by digest), list, detail and review routes; audit.
- **Accept when:** a rerun on unchanged input returns the same run id; a new submission marks old runs stale; lesson/lab/test assignments return 409; fewer than 2 and more than 200 submissions return the documented codes; outsider teacher, student and parent are denied; scores, grades, statuses and notifications are byte-for-byte unchanged after runs and reviews.
- **Depends on:** TAI3-T3.

## TAI3-T5 — Teacher similarity review UI

- Run view on the written-status board with side-by-side spans, level badges, noted/dismissed with note, and the stale banner.
- **Accept when:** a Playwright run on the 6-submission fixture flags exactly the near-copy pair; the review persists across reload; neutral copy contains no "gian lận" or "đạo văn" wording.
- **Depends on:** TAI3-T4, TAI2-T3.

## TAI3-T6 — End-to-end journey and negatives

- The SPEC success-signal journey for both parts on seeded fixtures with an outsider probe.
- **Accept when:** a real API/database/browser journey passes and the audit entries reconcile.
- **Depends on:** TAI3-T2, TAI3-T5.
