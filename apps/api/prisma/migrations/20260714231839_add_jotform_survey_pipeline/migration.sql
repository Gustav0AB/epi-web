-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('LOCAL', 'VISITING');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('LIKERT', 'ONE_ANSWER', 'FREQUENCY');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PROCESADO', 'PENDIENTE_CONFIGURACION', 'ERROR');

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_definitions" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "jotformFormId" TEXT NOT NULL,
    "type" "SurveyType" NOT NULL DEFAULT 'LOCAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "surveyDefinitionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weights" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "correctAnswer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "jotformSubmissionId" TEXT NOT NULL,
    "surveyDefinitionId" TEXT,
    "participantId" TEXT,
    "rawJsonData" JSONB NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDIENTE_CONFIGURACION',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "school" TEXT,
    "groupName" TEXT,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregated_results" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "calculatedScore" DOUBLE PRECISION NOT NULL,
    "isPrePost" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregated_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_name_key" ON "sites"("name");

-- CreateIndex
CREATE UNIQUE INDEX "survey_definitions_jotformFormId_version_key" ON "survey_definitions"("jotformFormId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "questions_surveyDefinitionId_externalId_key" ON "questions"("surveyDefinitionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "weights_questionId_key" ON "weights"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_jotformSubmissionId_key" ON "submissions"("jotformSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "participants_externalId_key" ON "participants"("externalId");

-- AddForeignKey
ALTER TABLE "survey_definitions" ADD CONSTRAINT "survey_definitions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_surveyDefinitionId_fkey" FOREIGN KEY ("surveyDefinitionId") REFERENCES "survey_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weights" ADD CONSTRAINT "weights_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_surveyDefinitionId_fkey" FOREIGN KEY ("surveyDefinitionId") REFERENCES "survey_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aggregated_results" ADD CONSTRAINT "aggregated_results_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
