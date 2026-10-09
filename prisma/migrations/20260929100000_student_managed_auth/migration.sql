-- Student accounts use a school-managed username. Adult accounts keep email.
ALTER TABLE "User"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "User"
SET "username" = CASE
  WHEN "id" = 'student' THEN 'nguyenan.8a'
  ELSE 'student-' || substr(md5("id"), 1, 8)
END
WHERE "role" = 'STUDENT' AND "username" IS NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "User"
  ADD CONSTRAINT "User_role_identifier_check" CHECK (
    ("role" = 'STUDENT' AND "username" IS NOT NULL)
    OR
    ("role" <> 'STUDENT' AND "email" IS NOT NULL)
  );
