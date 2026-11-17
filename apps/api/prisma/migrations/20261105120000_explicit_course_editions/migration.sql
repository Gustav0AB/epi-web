-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionRole" ADD VALUE 'GENDER';
ALTER TYPE "QuestionRole" ADD VALUE 'AGE';

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "responseFingerprint" TEXT,
ADD COLUMN     "reviewAge" INTEGER,
ADD COLUMN     "reviewGender" TEXT;

-- CreateTable
CREATE TABLE "course_editions" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "primaryDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instrument_relations" (
    "primaryDefinitionId" TEXT NOT NULL,
    "complementaryDefinitionId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instrument_relations_pkey" PRIMARY KEY ("primaryDefinitionId","complementaryDefinitionId")
);

-- CreateTable
CREATE TABLE "course_applications" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "moment" "SurveyMoment" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_memberships" (
    "submissionId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "contextRevision" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_memberships_pkey" PRIMARY KEY ("submissionId")
);

-- CreateIndex
CREATE INDEX "course_editions_siteId_createdAt_idx" ON "course_editions"("siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "course_applications_courseId_contextKey_key" ON "course_applications"("courseId", "contextKey");

-- CreateIndex
CREATE INDEX "course_memberships_applicationId_idx" ON "course_memberships"("applicationId");

-- CreateIndex
CREATE INDEX "submissions_surveyDefinitionId_responseFingerprint_idx" ON "submissions"("surveyDefinitionId", "responseFingerprint");

-- AddForeignKey
ALTER TABLE "course_editions" ADD CONSTRAINT "course_editions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_editions" ADD CONSTRAINT "course_editions_primaryDefinitionId_fkey" FOREIGN KEY ("primaryDefinitionId") REFERENCES "survey_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_relations" ADD CONSTRAINT "instrument_relations_primaryDefinitionId_fkey" FOREIGN KEY ("primaryDefinitionId") REFERENCES "survey_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instrument_relations" ADD CONSTRAINT "instrument_relations_complementaryDefinitionId_fkey" FOREIGN KEY ("complementaryDefinitionId") REFERENCES "survey_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_applications" ADD CONSTRAINT "course_applications_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "survey_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_memberships" ADD CONSTRAINT "course_memberships_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_memberships" ADD CONSTRAINT "course_memberships_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "course_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

