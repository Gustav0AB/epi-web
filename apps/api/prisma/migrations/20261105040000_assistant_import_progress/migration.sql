CREATE TABLE "assistant_imports" (
  "definitionId" TEXT PRIMARY KEY REFERENCES "survey_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "owner" TEXT, "leaseUntil" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'IDLE',
  "total" INTEGER NOT NULL DEFAULT 0, "updated" INTEGER NOT NULL DEFAULT 0,
  "pending" INTEGER NOT NULL DEFAULT 0, "errors" INTEGER NOT NULL DEFAULT 0, "skipped" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "assistant_import_items" (
  "definitionId" TEXT NOT NULL REFERENCES "assistant_imports"("definitionId") ON DELETE CASCADE ON UPDATE CASCADE,
  "submissionId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "outcome" TEXT NOT NULL,
  PRIMARY KEY ("definitionId", "submissionId")
);
