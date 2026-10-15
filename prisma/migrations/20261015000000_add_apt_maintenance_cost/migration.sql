-- CreateTable
CREATE TABLE "AptMaintenanceCost" (
    "kaptCode" VARCHAR(20) NOT NULL,
    "yearMonth" CHAR(6) NOT NULL,
    "labor" BIGINT,
    "cleaning" BIGINT,
    "guard" BIGINT,
    "disinfection" BIGINT,
    "elevator" BIGINT,
    "homeNetwork" BIGINT,
    "consignFee" BIGINT,
    "repairs" BIGINT,
    "commonEtc" BIGINT,
    "commonTotal" BIGINT,
    "heat" BIGINT,
    "hotWater" BIGINT,
    "gas" BIGINT,
    "electricity" BIGINT,
    "water" BIGINT,
    "individualEtc" BIGINT,
    "ltrLevy" BIGINT,
    "ltrUse" BIGINT,
    "ltrBalance" BIGINT,
    "ltrRate" DECIMAL(6,2),
    "complete" BOOLEAN NOT NULL,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptMaintenanceCost_pkey" PRIMARY KEY ("kaptCode","yearMonth")
);

-- CreateTable
CREATE TABLE "AptMaintenanceCostStat" (
    "sigunguCode" VARCHAR(5) NOT NULL,
    "yearMonth" CHAR(6) NOT NULL,
    "medianCommonPerM2" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptMaintenanceCostStat_pkey" PRIMARY KEY ("sigunguCode","yearMonth")
);

-- CreateIndex
CREATE INDEX "AptMaintenanceCost_yearMonth_idx" ON "AptMaintenanceCost"("yearMonth");
