CREATE TABLE "jotform_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "jotform_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jotform_accounts_apiKey_key" ON "jotform_accounts"("apiKey");

ALTER TABLE "jotform_forms" ADD COLUMN "accountId" TEXT;

ALTER TABLE "jotform_forms"
  ADD CONSTRAINT "jotform_forms_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "jotform_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "jotform_forms_accountId_idx" ON "jotform_forms"("accountId");

ALTER TABLE "survey_definitions" ADD COLUMN "openQuestionsSummary" TEXT;
