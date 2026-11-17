-- CreateTable
CREATE TABLE "category_sites" (
    "categoryId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "category_sites_pkey" PRIMARY KEY ("categoryId","siteId")
);

-- CreateIndex
CREATE INDEX "category_sites_siteId_idx" ON "category_sites"("siteId");

-- AddForeignKey
ALTER TABLE "category_sites" ADD CONSTRAINT "category_sites_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_sites" ADD CONSTRAINT "category_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
