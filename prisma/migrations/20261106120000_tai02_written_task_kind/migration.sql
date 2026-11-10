-- TAI-02 (TAI2-T1): WRITTEN_TASK class resource kind. Expand-only and idempotent: the shared dev database already
-- carries other values (LAB, DOCUMENT, REPORT_TEMPLATE, LINK) from another branch, which this migration leaves alone.
ALTER TYPE "ClassResourceKind" ADD VALUE IF NOT EXISTS 'WRITTEN_TASK';
