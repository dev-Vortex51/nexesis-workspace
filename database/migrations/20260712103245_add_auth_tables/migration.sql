/*
  Warnings:

  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Department_institutionId_idx";

-- AlterTable
ALTER TABLE "public"."AcademicSession" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Announcement" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."AuditLog" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Department" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Document" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."DocumentVersion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Feedback" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Grade" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."GradeComponent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Institution" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Meeting" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MeetingAttendance" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MeetingNote" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Message" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Milestone" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Notification" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "sentVia" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Project" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."ProjectMember" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Report" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Rubric" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."RubricCriterion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "passwordHash",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "name" TEXT,
ALTER COLUMN "status" SET DEFAULT 'active';

-- Backfill "name" for existing rows from the domain name columns, then enforce
-- NOT NULL. Done in three steps so the migration succeeds on a populated table.
UPDATE "public"."User" SET "name" = "firstName" || ' ' || "lastName" WHERE "name" IS NULL;
ALTER TABLE "public"."User" ALTER COLUMN "name" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Jwks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Jwks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "public"."Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "public"."Verification"("identifier");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
