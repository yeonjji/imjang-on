-- CreateTable
CREATE TABLE "EvCharger" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "chargeSpeed" VARCHAR(10) NOT NULL,
    "chargerCount" INTEGER NOT NULL,
    "operatorName" VARCHAR(80),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvCharger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraditionalMarket" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "marketType" VARCHAR(40),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraditionalMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "industryCode" VARCHAR(20),
    "industryName" VARCHAR(60),
    "sigunguCode" VARCHAR(5) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EvCharger_sourceId_key" ON "EvCharger"("sourceId");

-- CreateIndex
CREATE INDEX "EvCharger_chargeSpeed_idx" ON "EvCharger"("chargeSpeed");

-- CreateIndex
CREATE UNIQUE INDEX "TraditionalMarket_sourceId_key" ON "TraditionalMarket"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_sourceId_key" ON "Store"("sourceId");

-- CreateIndex
CREATE INDEX "Store_sigunguCode_idx" ON "Store"("sigunguCode");

-- CreateIndex
CREATE INDEX "Store_industryCode_idx" ON "Store"("industryCode");

-- PostGIS GIST indexes
CREATE INDEX IF NOT EXISTS "EvCharger_location_idx"
  ON "EvCharger" USING GIST ("location");

CREATE INDEX IF NOT EXISTS "TraditionalMarket_location_idx"
  ON "TraditionalMarket" USING GIST ("location");

CREATE INDEX IF NOT EXISTS "Store_location_idx"
  ON "Store" USING GIST ("location");
