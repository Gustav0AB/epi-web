-- Step 3/3 of the Role enum swap: drop the old ADMIN/USER values. Postgres
-- has no DROP VALUE, so recreate the type with only the 4 new values and
-- swap the column over.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;

CREATE TYPE "Role_new" AS ENUM ('SYSTEM_ADMIN', 'ORG_ADMIN', 'REPORT_VIEWER', 'FUNCTIONALITY_USER');

ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

DROP TYPE "Role";

ALTER TYPE "Role_new" RENAME TO "Role";

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'FUNCTIONALITY_USER';
