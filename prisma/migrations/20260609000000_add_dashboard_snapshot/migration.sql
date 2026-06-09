-- CreateTable
CREATE TABLE "DashboardSnapshot" (
    "key" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardSnapshot_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Transaction_contractDate_sigunguCode_idx" ON "Transaction"("contractDate", "sigunguCode");
