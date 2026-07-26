-- CreateTable report_templates
CREATE TABLE "report_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_report_templates
CREATE TABLE "user_report_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_templates_key_key" ON "report_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_report_templates_userId_templateKey_key" ON "user_report_templates"("userId", "templateKey");

-- AddForeignKey
ALTER TABLE "user_report_templates" ADD CONSTRAINT "user_report_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_report_templates" ADD CONSTRAINT "user_report_templates_templateKey_fkey" FOREIGN KEY ("templateKey") REFERENCES "report_templates"("key") ON DELETE CASCADE ON UPDATE CASCADE;
