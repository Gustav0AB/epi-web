-- AlterTable
ALTER TABLE "users" ADD COLUMN     "excludedSiteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "excludedSurveyDefinitionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
