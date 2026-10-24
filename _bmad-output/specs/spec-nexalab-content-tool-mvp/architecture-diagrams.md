# Sơ đồ kiến trúc

## Ranh giới hệ thống

```mermaid
flowchart LR
    S[PDF và curriculum/source evidence được phép dùng] --> I
    subgraph T[Standalone Content Tool — local workspace]
      I[Import UI + per-book job state]
      E[PyMuPDF + MinerU local]
      R[OCR Review/Edit UI — no reviewer identity]
      G[Optional Gemini LaTeX proposal — rights-gated]
      A[Lesson authoring UI + stable IDs]
      V[Package validation/export]
      P[BE plan/apply CLI]
      I --> E --> R --> A --> V --> P
      R -->|selected block only, when enabled| G -->|proposal, operator decides| R
    end
    P -->|manifest and verified request| B[NexaLab BE]
    B -->|controlled media upload| O[(Cloudflare R2)]
    B -->|validate, persist, release| D[(Supabase PostgreSQL)]
    D --> F[NexaLab FE / Open Curriculum]
    F --> M[@nexalab/sim]
```

## Luồng và trạng thái theo từng sách

```mermaid
flowchart LR
    I[Imported] --> X[Inspect source and page types]
    X --> O[OCR queued/running]
    O --> R[OCR ready / review edits]
    R --> A[Lesson authoring]
    A --> V[Package validation]
    V --> P[BE plan passed]
    P --> L[BE apply / receipt]
    L --> F[FE verified]
    O -. optional, rights-gated .-> G[Gemini LaTeX proposal]
    G --> R
    X -. failure .-> B[Blocked with step error]
    O -. failure .-> B
    R -. unresolved source/OCR .-> B
    A -. incomplete evidence .-> B
    V -. validation error .-> B
    P -. target or release gate .-> B
```

Persist stage and artifacts in the local workspace so the operator can resume after closing/reopening the tool. Show page counts or percent only when the OCR process provides reliable progress; otherwise show the current stage and running state. This job state is distinct from student Lesson/course progress.

OCR review saves actions, edits, duration, and source/result hashes without asking for reviewer identity. Formal content/release approval remains a separate NexaLab BE gate. Applying a release does not imply course binding or completed student progress.

## Trạng thái package/release

```mermaid
stateDiagram-v2
    [*] --> Imported
    Imported --> Extracting
    Extracting --> OCRReview
    OCRReview --> Authoring
    Authoring --> PackageReady
    PackageReady --> Planned: BE dry-run passes
    Planned --> Applied: verified target and BE approval gates pass
    Applied --> FEVerified: Open Curriculum and student path checked
    Imported --> Blocked
    Extracting --> Blocked
    OCRReview --> Blocked
    Authoring --> Blocked
    PackageReady --> Blocked
    Planned --> Blocked
    Applied --> Retired: superseding release
```
