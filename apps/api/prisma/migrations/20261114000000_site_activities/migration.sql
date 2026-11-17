-- AlterTable
ALTER TABLE "sites" ADD COLUMN "activities" TEXT[] DEFAULT ARRAY[]::TEXT[];
