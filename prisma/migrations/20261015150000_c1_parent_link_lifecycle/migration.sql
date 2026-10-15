CREATE TYPE "ParentLinkStatus" AS ENUM ('pending', 'approved', 'revoked');
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ParentLink" ADD COLUMN "status" "ParentLinkStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "ParentLink" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "ParentLink" ADD COLUMN "codeId" TEXT;
CREATE INDEX "ParentLink_parentId_status_idx" ON "ParentLink"("parentId", "status");
CREATE INDEX "ParentLink_studentId_status_idx" ON "ParentLink"("studentId", "status");
CREATE TABLE "ParentLinkCode" (
  "id" TEXT NOT NULL, "studentId" TEXT NOT NULL, "teacherId" TEXT NOT NULL, "classId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL, "keyVersion" INTEGER NOT NULL DEFAULT 1, "guardianVerifiedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentLinkCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ParentLinkCode_codeHash_key" ON "ParentLinkCode"("codeHash");
CREATE INDEX "ParentLinkCode_studentId_expiresAt_idx" ON "ParentLinkCode"("studentId", "expiresAt");
CREATE INDEX "ParentLinkCode_teacherId_classId_createdAt_idx" ON "ParentLinkCode"("teacherId", "classId", "createdAt");
CREATE TABLE "ParentConsent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "purpose" TEXT NOT NULL, "version" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL, "actorId" TEXT, "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt" TIMESTAMP(3), CONSTRAINT "ParentConsent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ParentConsent_userId_purpose_version_idx" ON "ParentConsent"("userId", "purpose", "version");
