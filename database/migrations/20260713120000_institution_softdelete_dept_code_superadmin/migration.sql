-- Enable citext for case-insensitive department codes.
CREATE EXTENSION IF NOT EXISTS "citext";

-- New system-level principal for the global institution registry.
ALTER TYPE "UserRole" ADD VALUE 'super_admin';

-- Institution soft-delete moves from a settings JSONB key to a dedicated,
-- atomically-writable column. Backfill any legacy marker so existing
-- soft-deleted rows stay deleted, then strip the reserved key from settings.
ALTER TABLE "Institution" ADD COLUMN "deletedAt" TIMESTAMP(3);

UPDATE "Institution"
SET "deletedAt" = CASE
  WHEN (settings ->> '_deletedAt') IS NOT NULL
    THEN ("settings" ->> '_deletedAt')::timestamptz
  ELSE NULL
END
WHERE settings ? '_deletedAt';

UPDATE "Institution"
SET "settings" = "settings" - '_deletedAt'
WHERE settings ? '_deletedAt';

-- Department code becomes case-insensitive and unique within an institution,
-- enforced by the database (replacing the racy application-level precheck).
ALTER TABLE "Department" ALTER COLUMN "code" SET DATA TYPE CITEXT;

CREATE UNIQUE INDEX "Department_institutionId_code_key" ON "Department"("institutionId", "code");
