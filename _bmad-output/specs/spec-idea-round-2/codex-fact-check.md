# Codex fact check vs main, 2026-11-24

> All points verified by Claude and applied to SPEC.md.

## Wrong facts

- **WRONG:** I-4 says a clear class materials tab is missing. The class resource view already has **“Tài liệu & Báo cáo”** and displays document resources. The remaining request may be a better dedicated library or reuse flow, but the view is not absent. [SPEC.md](<SPEC.md:30>) · [ClassSpaceResources.tsx](<../../../../FE-NexaLab/src/features/classes/ClassSpaceResources.tsx:904>)
- **WRONG:** “20 MB generic” is too broad as an asset limit. The 20 MB cap applies to the form upload route; the asset media policy defaults video to 300 MB and PDF to 20 MB, with environment overrides. [SPEC.md](<SPEC.md:131>) · [files.controller.ts](<../../../src/modules/assets/interface/files.controller.ts:24>) · [media.ts](<../../../src/modules/assets/application/media.ts:48>)
- **WRONG citation:** The teacher-only `AiAssessmentSuggestion` rule is documented at schema lines **1736–1738**; line 1734 closes an enum. [SPEC.md](<SPEC.md:51>) · [schema.prisma](<../../../prisma/schema.prisma:1736>)

## Already exists

- A class materials view and resource publishing path exist. Published resources are listed for approved class members; teachers can create and publish resources in owned classes. [ClassSpaceResources.tsx](<../../../../FE-NexaLab/src/features/classes/ClassSpaceResources.tsx:904>) · [class-resources.service.ts](<../../../src/modules/classes/application/class-resources.service.ts:41>)
- Asset and lesson review mechanisms already exist, but **not** the proposed teacher-video `PENDING_REVIEW` queue: assets have `ACTIVE`, `QUARANTINED`, `ARCHIVED`, while lessons have a review field and release reviews. [schema.prisma](<../../../prisma/schema.prisma:411>) · [schema.prisma](<../../../prisma/schema.prisma:1311>)

## Conflicts

- CAP-4.1 promises PDF/DOCX/PPTX/MP4 through the existing upload flow. The asset initializer currently accepts **PDF, PNG, JPEG, MP4, WebVTT, GLB**; DOCX and PPTX need new validation and handling. The current class editor also applies a 20 MB file check. [SPEC.md](<SPEC.md:58>) · [asset-versions.ts](<../../../src/modules/assets/application/asset-versions.ts:250>) · [RichResourceEditor.tsx](<../../../../FE-NexaLab/src/features/classes/RichResourceEditor.tsx:59>)
- CAP-3.1’s pending-video privacy cannot use the current asset status contract unchanged: a finalized `READY` version on an `ACTIVE` asset can be read by its owner, and asset status has no review state. Approval must be enforced at every student read path before class publication. [SPEC.md](<SPEC.md:64>) · [asset-versions.ts](<../../../src/modules/assets/application/asset-versions.ts:164>) · [schema.prisma](<../../../prisma/schema.prisma:1311>)
- CAP-2.1 needs a preferences contract change: the documented stored shape currently has `theme` and `locale`. CAP-1.2 likewise needs an AiJob contract decision: each job is class-bound, lesson-bound, and stores an immutable request and input snapshot. [SPEC.md](<SPEC.md:77>) · [schema.prisma](<../../../prisma/schema.prisma:103>) · [schema.prisma](<../../../prisma/schema.prisma:1676>)

## Other notes

- **CORRECT:** Role enum; 1000-character AI instruction; ≤20 report prompts and ≤10 numeric custom parameters; asset scope/status and metadata; named parent routes; no `speechSynthesis` match in the searched FE source. [schema.prisma](<../../../prisma/schema.prisma:11>) · [ai-job-contract.ts](<../../../src/modules/ai/application/ai-job-contract.ts:38>) · [class-resource-contract.ts](<../../../src/modules/classes/application/class-resource-contract.ts:21>) · [parents.controller.ts](<../../../src/modules/parents/interface/parents.controller.ts:128>)
- **UNVERIFIABLE in this review:** FR-26 and AD-19 being the highest identifiers, TAI-06’s “all ranges pending,” and the content tool’s P2 implementation status. Those claims require a separate complete check of the referenced documents and content tool. [SPEC.md](<SPEC.md:27>) · [SPEC.md](<SPEC.md:49>) · [SPEC.md](<SPEC.md:52>)
