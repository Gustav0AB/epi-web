-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'OPEN_TEXT';

-- CreateTable
CREATE TABLE "question_insights" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bestAnswers" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_insights_questionId_key" ON "question_insights"("questionId");

-- AddForeignKey
ALTER TABLE "question_insights" ADD CONSTRAINT "question_insights_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
