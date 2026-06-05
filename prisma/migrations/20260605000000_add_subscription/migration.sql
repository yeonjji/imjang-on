-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('APPLYHOME', 'LH_PRESUB');
CREATE TYPE "SubscriptionCategory" AS ENUM ('APT', 'OFFICETEL_ETC', 'REMNANT', 'PUB_PRIV_RENT', 'ARBITRARY', 'LH_PRESUB');

-- CreateTable
CREATE TABLE "SubscriptionNotice" (
  "id" BIGSERIAL NOT NULL,
  "source" "SubscriptionSource" NOT NULL,
  "category" "SubscriptionCategory" NOT NULL,
  "sourceKey" VARCHAR(120) NOT NULL,
  "houseManageNo" VARCHAR(40),
  "pblancNo" VARCHAR(40),
  "panId" VARCHAR(30),
  "origNoticeKey" VARCHAR(30),
  "name" VARCHAR(200) NOT NULL,
  "status" VARCHAR(20),
  "regionCode" VARCHAR(10),
  "regionName" VARCHAR(60),
  "address" VARCHAR(256),
  "totalSupply" INTEGER,
  "noticeDate" DATE,
  "receiptBegin" DATE,
  "receiptEnd" DATE,
  "winnerDate" DATE,
  "contractBegin" DATE,
  "contractEnd" DATE,
  "moveInYm" VARCHAR(6),
  "homepage" VARCHAR(256),
  "noticeUrl" VARCHAR(300),
  "developer" VARCHAR(200),
  "constructor" VARCHAR(200),
  "tel" VARCHAR(30),
  "location" geography(Point, 4326),
  "rawJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionNotice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionUnit" (
  "id" BIGSERIAL NOT NULL,
  "noticeId" BIGINT NOT NULL,
  "modelNo" VARCHAR(4),
  "houseType" VARCHAR(20),
  "area" DECIMAL(10,4),
  "generalSupply" INTEGER,
  "specialSupply" INTEGER,
  "topAmount" INTEGER,
  "rawJson" JSONB NOT NULL,
  CONSTRAINT "SubscriptionUnit_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE UNIQUE INDEX "SubscriptionNotice_source_sourceKey_key" ON "SubscriptionNotice"("source", "sourceKey");
CREATE INDEX "SubscriptionNotice_category_noticeDate_idx" ON "SubscriptionNotice"("category", "noticeDate" DESC);
CREATE INDEX "SubscriptionNotice_source_status_idx" ON "SubscriptionNotice"("source", "status");
CREATE INDEX "SubscriptionNotice_regionCode_idx" ON "SubscriptionNotice"("regionCode");
CREATE INDEX "SubscriptionNotice_location_idx" ON "SubscriptionNotice" USING GIST ("location");

CREATE UNIQUE INDEX "SubscriptionUnit_noticeId_modelNo_houseType_key" ON "SubscriptionUnit"("noticeId", "modelNo", "houseType");
CREATE INDEX "SubscriptionUnit_noticeId_idx" ON "SubscriptionUnit"("noticeId");

-- ForeignKey
ALTER TABLE "SubscriptionUnit" ADD CONSTRAINT "SubscriptionUnit_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "SubscriptionNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
