# Class Lab and attachment data contract

Companion to `spec-class-lab-customization-resources.md`; this contract remains draft until the parent spec is approved. It closes implementation choices identified in the user-provided assessment on 2026-11-05.

## Resource schemas

Define strict Zod schemas in `src/modules/classes/application/class-resource-contract.ts`. Unknown fields are rejected. Text is plain text, trimmed and bounded; it is never rendered as HTML. Resource title remains the existing required 1–160-character field. Keep the existing class lesson authorization check for all kinds.

`labResourceContentSchema`:

```ts
{
  source: { labId: string, releaseId: string, challengeId: string },
  learningObjective: string, // 1–1000 characters
  instructions: string,     // 1–10000 characters
  reportPrompts: string[],  // 0–20 entries, each 1–1000 characters
  execution: AssignmentExecution,
  executionDigest: string  // canonical SHA-256, 64 hex characters
}
```

Create/update input accepts only `source` and the pedagogical fields. The server constructs `execution` and its digest from the eligible approved release; clients cannot supply or override scientific fields. Source IDs are bounded to existing identifier limits. Require the selected challenge to belong to the pinned release and the source lab to satisfy current assignment eligibility checks. At publication revalidate the same source tuple and revocation status. If the source has ceased to be eligible, return a recoverable conflict; never replace it silently. Fork and source-upgrade operations require an active eligible release. Once published, resolving an existing pin does not require it to remain the latest release.

Resolve source thumbnails through `lab-info.ts` using `source.labId`; no arbitrary client thumbnail asset ID. Clearly label pedagogical text as teacher-authored. Retain the released activity's instructions/checkpoints and assessment contract; teacher text supplements them.

`documentResourceContentSchema` for DOCUMENT and REPORT_TEMPLATE:

```ts
{
  description: string, // optional, default empty, maximum 10000 characters
  source:
    | { type: "upload", assetVersionId: string }
    | { type: "link", url: string }
}
```

`linkResourceContentSchema`: `{ url: string, description?: string }`, with the same description bound. HTTPS URLs are bounded to 2048 characters, parsed as URLs and reject embedded credentials. No server fetching or automatic embedding. External actions open with `noopener noreferrer`. Show Google Drive sharing instructions and clearly indicate external permissions are controlled by the provider.

Upload metadata (name, MIME, byte count) comes from AssetVersion, never client assertions. Accept only owned READY versions of ACTIVE assets with PDF/PNG/JPEG/MP4 MIME/extension combinations accepted by the existing media pipeline. Revalidate at publication; quarantined assets cannot be attached or opened. Preserve upload budgets/environment/scanner gates. If production scanning is unavailable, display the actual failure; do not bypass it or claim files were scanned. CSV import remains exclusive to DECK/STUDY_QUIZ/TEST. Only those first two kinds use saved card/quiz practice state.

## Persisted run context

- Add nullable `LabRun.resourceId` referencing the exact ClassResource version row, with `onDelete: Restrict` and an index. Resource rows are archived rather than deleted.
- Add nullable `LabRun.classLabSnapshot` JSON and `Assignment.classLabSnapshot` JSON. Historical rows remain null, without backfill. Add the four ClassResourceKind values through an additive migration; never rebuild/drop the enum.
- A pedagogical snapshot contains `resourceId`, `version`, `title`, `lessonId`, `source`, `learningObjective`, `instructions`, `reportPrompts`, and `contentDigest`. The digest hashes all preceding snapshot fields canonically, excluding itself. Construct it server-side and verify before use.
- Keep the existing `LabRun.context` String column. Supported contexts become FOUNDATIONAL, ASSIGNMENT and CLASS_PRACTICE. Reject inconsistent combinations server-side.
- Extend the existing `POST /labs/:labId/runs` input with optional `resourceId`. Standalone class practice supplies this instead of `assignmentId` or `releaseId`; reject mixed selectors. Resolve class, source, challenge and execution from that resource. Never infer class scope from the lab ID alone.
- CLASS_PRACTICE persists the resource reference and pedagogical snapshot, uses the immutable science tuple, has no assignmentId and expires after the existing 24-hour practice window. Recheck active class, published resource, approved membership, run ownership, expiry and source/pack revocation on launch, every event read/write, hint and submit path where the run is consumed.
- Its stored attempt is unscored class evidence. It must not enter the gradebook, public Foundational progress or subject achievement through fallback queries that select attempts with null assignmentId. Audit all projection readers as well as submission-time writes; do not treat CLASS_PRACTICE as FOUNDATIONAL.
- Teacher preview displays custom text and the source activity without creating a scored student attempt or weakening STUDENT launch guards.

## Assignment compatibility

Keep `Assignment.contentType = "lab"` and `Assignment.contentId = source.labId`. Current eligibility, run/event checks and renderers rely on this identity. Never replace contentId with a ClassResource ID or invent a new contentType for this slice.

Extend assignment input with optional `classLabResourceId`. In this mode, require a PUBLISHED LAB resource from the owned class and require contentId to match its source. Derive the release/challenge from the resource; reject conflicting client source selectors. Copy its exact pedagogical snapshot into `Assignment.classLabSnapshot` and its approved execution into existing `labExecution`/`labExecutionDigest`. Use the snapshot content digest for the private assignment's `contentVersion` so different custom resource versions do not collide in duplicate detection. Preserve the released-lab assignment path and release-digest versioning for existing callers.

Assigned runs retain ASSIGNMENT context and copy assignment snapshots. Their source/challenge/pedagogy cannot be replaced by an extra resource selector at launch. Resource revision or archival does not invalidate an already-issued assignment: active class, approved membership, target eligibility, assignment archive/close and scientific revocation remain authoritative. Resource archive blocks new class practice and new assignments; it does not rewrite existing assignments or evidence. New source releases require an explicit new resource draft/version.

## Asset access and retention

In the shared `canReadVersion`, match `content.source.type = upload` and the exact `assetVersionId` on PUBLISHED DOCUMENT/REPORT_TEMPLATE resources. Permit students only through an ACTIVE owning class with approved enrollment. Check READY/ACTIVE before returning a grant. No substring matching of arbitrary JSON and no widening private assets to SHARED_LIBRARY. Existing file/access/range routes must share this check.

Extend `assetReferences` and every admin deletion/dependency consumer with references from draft, published and archived resources so cleanup cannot destroy retained resources. An already-issued signed URL can remain valid until its short TTL expires; archival/removal blocks new grants, not instant invalidation of an existing storage URL.

## Required edge checks

Test strict schema rejection, URL schemes/credentials, upload ownership/MIME/status, CSV-kind rejection, run selector conflicts, source/challenge spoofing, class-run expiry, event/hint access after membership removal, resource archival versus existing assignment eligibility, custom-version duplicate detection, no Foundational projection, exact asset matching and retained file references. Preserve legacy rows, idempotent submission receipts and immutable historical snapshots.

Modify existing pages/controllers locally; extract focused helpers/components where useful without replacing entire page trees. No scientific validation or production-readiness claim follows solely from tuple pinning or these tests.
