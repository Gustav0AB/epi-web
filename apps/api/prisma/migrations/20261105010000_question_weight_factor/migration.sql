ALTER TABLE "weights" ADD COLUMN "factor" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "weights" ADD CONSTRAINT "weights_factor_range" CHECK ("factor" BETWEEN 1 AND 10);
