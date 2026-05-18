-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'OFFICETEL', 'ROW_HOUSE', 'MULTIPLEX');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SALE', 'JEONSE', 'WOLSE');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('RUNNING', 'OK', 'ERROR');

-- CreateTable
CREATE TABLE "Region" (
    "code" VARCHAR(10) NOT NULL,
    "sido" VARCHAR(20) NOT NULL,
    "sigungu" VARCHAR(40),
    "eupmyeondong" VARCHAR(40),
    "ri" VARCHAR(40),
    "fullName" VARCHAR(120) NOT NULL,
    "level" INTEGER NOT NULL,
    "parentCode" VARCHAR(10),
    "isAbolished" BOOLEAN NOT NULL DEFAULT false,
    "abolishedAt" DATE,
    "sourceVersion" VARCHAR(20) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sigunguCode" VARCHAR(5),

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" BIGSERIAL NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "nameNorm" VARCHAR(80) NOT NULL,
    "regionCode" VARCHAR(10) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "builtYear" INTEGER,
    "households" INTEGER,
    "buildingCount" INTEGER,
    "areaTypes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "txCountTotal" INTEGER NOT NULL DEFAULT 0,
    "txCount12m" INTEGER NOT NULL DEFAULT 0,
    "lastTxAt" TIMESTAMP(3),
    "saleCount12m" INTEGER NOT NULL DEFAULT 0,
    "saleAvgPrice12m" BIGINT,
    "saleLastPrice" BIGINT,
    "saleLastAt" DATE,
    "jeonseCount12m" INTEGER NOT NULL DEFAULT 0,
    "jeonseAvgDeposit12m" BIGINT,
    "jeonseLastDeposit" BIGINT,
    "jeonseLastAt" DATE,
    "wolseCount12m" INTEGER NOT NULL DEFAULT 0,
    "wolseAvgDeposit12m" BIGINT,
    "wolseAvgRent12m" INTEGER,
    "wolseLastDeposit" BIGINT,
    "wolseLastRent" INTEGER,
    "wolseLastAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sigunguCode" VARCHAR(5),
    "location" geography(Point,4326),

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" BIGSERIAL NOT NULL,
    "propertyId" BIGINT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "regionCode" VARCHAR(10) NOT NULL,
    "sigunguCode" VARCHAR(5) NOT NULL,
    "dealType" "DealType" NOT NULL,
    "contractDate" DATE NOT NULL,
    "exclusiveArea" DECIMAL(6,2) NOT NULL,
    "floor" INTEGER,
    "buildYear" INTEGER,
    "dealAmount" INTEGER,
    "registerDate" DATE,
    "dealingType" VARCHAR(20),
    "buyerType" VARCHAR(20),
    "sellerType" VARCHAR(20),
    "cancelDate" DATE,
    "cancelType" VARCHAR(20),
    "deposit" INTEGER,
    "monthlyRent" INTEGER,
    "contractTerm" VARCHAR(20),
    "contractType" VARCHAR(20),
    "useRRRight" BOOLEAN,
    "preDeposit" INTEGER,
    "preMonthlyRent" INTEGER,
    "umd" VARCHAR(40),
    "jibun" VARCHAR(40),
    "roadName" VARCHAR(120),
    "source" VARCHAR(30) NOT NULL,
    "externalKey" VARCHAR(80),
    "rawHash" CHAR(64) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" BIGSERIAL NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "targetKey" VARCHAR(40) NOT NULL,
    "status" "IngestionStatus" NOT NULL,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSignup" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "topic" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Region_sido_sigungu_eupmyeondong_idx" ON "Region"("sido", "sigungu", "eupmyeondong");

-- CreateIndex
CREATE INDEX "Region_level_isAbolished_idx" ON "Region"("level", "isAbolished");

-- CreateIndex
CREATE INDEX "Property_propertyType_regionCode_idx" ON "Property"("propertyType", "regionCode");

-- CreateIndex
CREATE INDEX "Property_name_idx" ON "Property"("name");

-- CreateIndex
CREATE INDEX "Property_propertyType_lastTxAt_idx" ON "Property"("propertyType", "lastTxAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_rawHash_key" ON "Transaction"("rawHash");

-- CreateIndex
CREATE INDEX "Transaction_propertyId_dealType_contractDate_idx" ON "Transaction"("propertyId", "dealType", "contractDate" DESC);

-- CreateIndex
CREATE INDEX "Transaction_propertyId_contractDate_idx" ON "Transaction"("propertyId", "contractDate" DESC);

-- CreateIndex
CREATE INDEX "Transaction_sigunguCode_propertyType_dealType_contractDate_idx" ON "Transaction"("sigunguCode", "propertyType", "dealType", "contractDate" DESC);

-- CreateIndex
CREATE INDEX "Transaction_regionCode_contractDate_idx" ON "Transaction"("regionCode", "contractDate" DESC);

-- CreateIndex
CREATE INDEX "Transaction_propertyType_contractDate_idx" ON "Transaction"("propertyType", "contractDate" DESC);

-- CreateIndex
CREATE INDEX "IngestionRun_source_targetKey_idx" ON "IngestionRun"("source", "targetKey");

-- CreateIndex
CREATE INDEX "IngestionRun_status_startedAt_idx" ON "IngestionRun"("status", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSignup_email_key" ON "EmailSignup"("email");

-- CreateIndex
CREATE INDEX "EmailSignup_topic_idx" ON "EmailSignup"("topic");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
