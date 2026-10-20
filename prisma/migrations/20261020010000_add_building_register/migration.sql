-- CreateTable
CREATE TABLE "LegalDong" (
    "code" CHAR(10) NOT NULL,
    "sigunguCode" CHAR(5) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    CONSTRAINT "LegalDong_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "BuildingRegister" (
    "propertyId" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "bjdCode" CHAR(10),
    "platGbCd" CHAR(1),
    "bun" CHAR(4),
    "ji" CHAR(4),
    "useAprDate" DATE,
    "structure" VARCHAR(60),
    "mainPurpose" VARCHAR(60),
    "etcPurpose" VARCHAR(300),
    "groundFloors" INTEGER,
    "undergroundFloors" INTEGER,
    "mainBuildingCount" INTEGER,
    "households" INTEGER,
    "units" INTEGER,
    "elevators" INTEGER,
    "parkingTotal" INTEGER,
    "bcRat" DECIMAL(6,2),
    "vlRat" DECIMAL(7,2),
    "seismicApplied" INTEGER,
    "zoningKind" VARCHAR(20),
    "zoningName" VARCHAR(60),
    "hasNeighborhoodFacility" BOOLEAN NOT NULL DEFAULT false,
    "registerCreatedAt" DATE,
    "raw" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuildingRegister_pkey" PRIMARY KEY ("propertyId")
);

-- CreateIndex
CREATE INDEX "LegalDong_sigunguCode_name_idx" ON "LegalDong"("sigunguCode", "name");

-- CreateIndex
CREATE INDEX "BuildingRegister_status_idx" ON "BuildingRegister"("status");
