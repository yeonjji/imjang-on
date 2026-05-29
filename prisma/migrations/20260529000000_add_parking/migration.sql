-- CreateTable
CREATE TABLE "Parking" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "prkplceSe" VARCHAR(10),
    "prkplceType" VARCHAR(10),
    "rdnmadr" VARCHAR(200),
    "lnmadr" VARCHAR(200),
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "prkcmprt" INTEGER,
    "feedingSe" VARCHAR(4),
    "enforceSe" VARCHAR(20),
    "operDay" VARCHAR(60),
    "weekdayOpenHhmm" VARCHAR(5),
    "weekdayCloseHhmm" VARCHAR(5),
    "satOpenHhmm" VARCHAR(5),
    "satCloseHhmm" VARCHAR(5),
    "holidayOpenHhmm" VARCHAR(5),
    "holidayCloseHhmm" VARCHAR(5),
    "chargeInfo" VARCHAR(10),
    "basicTime" INTEGER,
    "basicCharge" INTEGER,
    "addUnitTime" INTEGER,
    "addUnitCharge" INTEGER,
    "dayCmmtkt" INTEGER,
    "monthCmmtkt" INTEGER,
    "metpay" VARCHAR(60),
    "spcmnt" TEXT,
    "pwdbsPpkZoneYn" BOOLEAN,
    "institutionNm" VARCHAR(80),
    "phoneNumber" VARCHAR(30),
    "insttCode" VARCHAR(10),
    "insttNm" VARCHAR(80),
    "referenceDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parking_sourceId_key" ON "Parking"("sourceId");

-- CreateIndex
CREATE INDEX "Parking_prkplceSe_idx" ON "Parking"("prkplceSe");

-- CreateIndex
CREATE INDEX "Parking_chargeInfo_idx" ON "Parking"("chargeInfo");

-- PostGIS GIST index
CREATE INDEX IF NOT EXISTS "Parking_location_idx" ON "Parking" USING GIST ("location");
