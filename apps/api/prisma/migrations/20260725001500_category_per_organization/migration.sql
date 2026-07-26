-- categories table is empty in every environment this has shipped to, so the
-- new organizationId column can go straight to NOT NULL without a backfill step.
DROP INDEX "categories_name_subcategory_key";

ALTER TABLE "categories" ADD COLUMN "organizationId" TEXT NOT NULL;

CREATE UNIQUE INDEX "categories_organizationId_name_subcategory_key" ON "categories"("organizationId", "name", "subcategory");

ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
