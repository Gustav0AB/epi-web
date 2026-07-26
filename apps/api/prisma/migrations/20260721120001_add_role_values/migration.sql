-- Step 1/3 of the Role enum swap: add the new values in their own
-- transaction. Postgres forbids using a freshly-added enum value in the
-- same transaction that added it, so the data backfill lives in the next
-- migration.
ALTER TYPE "Role" ADD VALUE 'SYSTEM_ADMIN';
ALTER TYPE "Role" ADD VALUE 'ORG_ADMIN';
ALTER TYPE "Role" ADD VALUE 'REPORT_VIEWER';
ALTER TYPE "Role" ADD VALUE 'FUNCTIONALITY_USER';
