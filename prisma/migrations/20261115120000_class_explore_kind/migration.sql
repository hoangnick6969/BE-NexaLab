-- Class Explore (P0 C3, K2 pilot step C): EXPLORE_LAB class resource kind. Expand-only and idempotent.
-- Kept in its own migration: PostgreSQL cannot use a new enum value in the transaction that adds it.
-- Generated offline with prisma migrate diff; NOT applied to any database.
ALTER TYPE "ClassResourceKind" ADD VALUE IF NOT EXISTS 'EXPLORE_LAB';
