-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "processingError" TEXT;
