-- AlterTable
ALTER TABLE "jotform_accounts" ADD COLUMN "excludedLabelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
