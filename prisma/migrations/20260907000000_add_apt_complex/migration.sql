-- CreateTable
CREATE TABLE "AptComplex" (
    "kaptCode" VARCHAR(20) NOT NULL,
    "kaptName" VARCHAR(120) NOT NULL,
    "nameNorm" VARCHAR(120) NOT NULL,
    "bjdCode" VARCHAR(10) NOT NULL,
    "sigunguCode" VARCHAR(5) NOT NULL,
    "as3" VARCHAR(40),
    "households" INTEGER,
    "buildingCount" INTEGER,
    "usedate" DATE,
    "hallType" VARCHAR(20),
    "heatType" VARCHAR(20),
    "aptKind" VARCHAR(20),
    "topFloor" INTEGER,
    "baseFloor" INTEGER,
    "area60" INTEGER,
    "area85" INTEGER,
    "area135" INTEGER,
    "area136" INTEGER,
    "parkingGround" INTEGER,
    "parkingUnder" INTEGER,
    "subwayLine" VARCHAR(60),
    "subwayStation" VARCHAR(60),
    "walkSubway" VARCHAR(40),
    "walkBus" VARCHAR(40),
    "evGround" INTEGER,
    "evUnder" INTEGER,
    "elevator" INTEGER,
    "cctv" INTEGER,
    "builder" VARCHAR(200),
    "welfareFacility" TEXT,
    "convenientFacility" TEXT,
    "educationFacility" TEXT,
    "inUse" BOOLEAN NOT NULL DEFAULT true,
    "rawJson" JSONB,
    "propertyId" BIGINT,
    "matchTier" INTEGER,
    "matchedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptComplex_pkey" PRIMARY KEY ("kaptCode")
);

-- CreateIndex
CREATE UNIQUE INDEX "AptComplex_propertyId_key" ON "AptComplex"("propertyId");

-- CreateIndex
CREATE INDEX "AptComplex_sigunguCode_nameNorm_idx" ON "AptComplex"("sigunguCode", "nameNorm");

-- CreateIndex
CREATE INDEX "AptComplex_propertyId_idx" ON "AptComplex"("propertyId");

-- CreateIndex
CREATE INDEX "AptComplex_matchTier_idx" ON "AptComplex"("matchTier");

-- AddForeignKey
ALTER TABLE "AptComplex" ADD CONSTRAINT "AptComplex_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
