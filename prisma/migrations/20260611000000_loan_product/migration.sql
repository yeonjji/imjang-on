-- CreateTable
CREATE TABLE "LoanProduct" (
    "seq" INTEGER NOT NULL,
    "finprdnm" VARCHAR(200) NOT NULL,
    "ofrinstnm" VARCHAR(120),
    "instCtg" VARCHAR(40),
    "lnlmt" INTEGER,
    "irt" VARCHAR(60),
    "irtCtg" VARCHAR(40),
    "usageTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "targetTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "regionTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rawJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanProduct_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE INDEX "LoanProduct_finprdnm_idx" ON "LoanProduct"("finprdnm");
