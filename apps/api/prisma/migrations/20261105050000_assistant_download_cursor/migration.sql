ALTER TABLE "assistant_imports"
  ADD COLUMN "runId" TEXT,
  ADD COLUMN "downloadOffset" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "downloadComplete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastPageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "assistant_import_items"
  ADD COLUMN "runId" TEXT,
  ADD COLUMN "sourceJson" JSONB;
