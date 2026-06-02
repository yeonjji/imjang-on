-- CreateTable
CREATE TABLE "Hospital" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "typeCode" VARCHAR(10) NOT NULL,
    "typeName" VARCHAR(40) NOT NULL,
    "sido" VARCHAR(20),
    "sigungu" VARCHAR(40),
    "sigunguCode" VARCHAR(10),
    "eupmyeondong" VARCHAR(40),
    "zipcode" VARCHAR(10),
    "address" VARCHAR(300) NOT NULL,
    "tel" VARCHAR(30),
    "homepage" VARCHAR(200),
    "openedAt" DATE,
    "totalDoctors" INTEGER,
    "drMedGeneral" INTEGER,
    "drMedIntern" INTEGER,
    "drMedResident" INTEGER,
    "drMedSpecialist" INTEGER,
    "drDentGeneral" INTEGER,
    "drDentIntern" INTEGER,
    "drDentResident" INTEGER,
    "drDentSpecialist" INTEGER,
    "drKorGeneral" INTEGER,
    "drKorIntern" INTEGER,
    "drKorResident" INTEGER,
    "drKorSpecialist" INTEGER,
    "midwifeCount" INTEGER,
    "location" geography(Point,4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalFacility" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "foundTypeCode" VARCHAR(5),
    "foundTypeName" VARCHAR(20),
    "generalBedPremium" INTEGER,
    "generalBedNormal" INTEGER,
    "icuAdultBed" INTEGER,
    "icuPediatricBed" INTEGER,
    "icuNeonatalBed" INTEGER,
    "deliveryBed" INTEGER,
    "operatingRoomBed" INTEGER,
    "erBed" INTEGER,
    "physicalTherapyBed" INTEGER,
    "psychiatryClosedPremium" INTEGER,
    "psychiatryClosedNormal" INTEGER,
    "psychiatryOpenPremium" INTEGER,
    "psychiatryOpenNormal" INTEGER,
    "isolationBed" INTEGER,
    "sterileRoomBed" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDetail" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "locationBuilding" VARCHAR(100),
    "locationDirection" VARCHAR(100),
    "locationDistance" VARCHAR(50),
    "parkingCapacity" INTEGER,
    "parkingFee" VARCHAR(4),
    "parkingNote" TEXT,
    "closedSunday" VARCHAR(100),
    "closedHoliday" VARCHAR(100),
    "erDayOpen" VARCHAR(4),
    "erDayTel1" VARCHAR(30),
    "erDayTel2" VARCHAR(30),
    "erNightOpen" VARCHAR(4),
    "erNightTel1" VARCHAR(30),
    "erNightTel2" VARCHAR(30),
    "lunchWeekday" VARCHAR(50),
    "lunchSaturday" VARCHAR(50),
    "receptionWeekday" VARCHAR(50),
    "receptionSaturday" VARCHAR(50),
    "openSun" INTEGER,
    "closeSun" INTEGER,
    "openMon" INTEGER,
    "closeMon" INTEGER,
    "openTue" INTEGER,
    "closeTue" INTEGER,
    "openWed" INTEGER,
    "closeWed" INTEGER,
    "openThu" INTEGER,
    "closeThu" INTEGER,
    "openFri" INTEGER,
    "closeFri" INTEGER,
    "openSat" INTEGER,
    "closeSat" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDept" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "deptCode" VARCHAR(10) NOT NULL,
    "deptName" VARCHAR(40) NOT NULL,
    "specialistCount" INTEGER,
    "optionalDoctorCount" INTEGER,

    CONSTRAINT "HospitalDept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalTransit" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "transitName" VARCHAR(50),
    "routeNumber" VARCHAR(30),
    "stopPoint" VARCHAR(100),
    "direction" VARCHAR(100),
    "distance" VARCHAR(50),
    "note" VARCHAR(200),

    CONSTRAINT "HospitalTransit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalEquipment" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "equipCode" VARCHAR(20) NOT NULL,
    "equipName" VARCHAR(60) NOT NULL,
    "equipCount" INTEGER,

    CONSTRAINT "HospitalEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalMealSurcharge" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "typeCode" VARCHAR(10) NOT NULL,
    "typeName" VARCHAR(40) NOT NULL,
    "hasGeneral" VARCHAR(4),
    "staffCount" INTEGER,
    "treatmentGrade" VARCHAR(10),

    CONSTRAINT "HospitalMealSurcharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalNursingGrade" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "typeCode" VARCHAR(10) NOT NULL,
    "typeName" VARCHAR(40) NOT NULL,
    "nursingGrade" VARCHAR(10),

    CONSTRAINT "HospitalNursingGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalSpecialTreatment" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "searchCode" VARCHAR(20) NOT NULL,
    "searchName" VARCHAR(60) NOT NULL,

    CONSTRAINT "HospitalSpecialTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalSpecialty" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "searchCode" VARCHAR(20) NOT NULL,
    "searchName" VARCHAR(60) NOT NULL,

    CONSTRAINT "HospitalSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStaff" (
    "id" BIGSERIAL NOT NULL,
    "hospitalId" BIGINT NOT NULL,
    "staffCode" VARCHAR(20) NOT NULL,
    "staffName" VARCHAR(60) NOT NULL,
    "staffCount" INTEGER,

    CONSTRAINT "HospitalStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "typeCode" VARCHAR(10),
    "typeName" VARCHAR(20),
    "sido" VARCHAR(20),
    "sigungu" VARCHAR(40),
    "sigunguCode" VARCHAR(10),
    "eupmyeondong" VARCHAR(40),
    "zipcode" VARCHAR(10),
    "address" VARCHAR(300) NOT NULL,
    "tel" VARCHAR(30),
    "openedAt" DATE,
    "location" geography(Point,4326),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_sourceId_key" ON "Hospital"("sourceId");

-- CreateIndex
CREATE INDEX "Hospital_typeCode_idx" ON "Hospital"("typeCode");

-- CreateIndex
CREATE INDEX "Hospital_sigunguCode_idx" ON "Hospital"("sigunguCode");

-- CreateIndex
CREATE INDEX "Hospital_sigunguCode_typeCode_idx" ON "Hospital"("sigunguCode", "typeCode");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalFacility_hospitalId_key" ON "HospitalFacility"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDetail_hospitalId_key" ON "HospitalDetail"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDept_hospitalId_deptCode_key" ON "HospitalDept"("hospitalId", "deptCode");

-- CreateIndex
CREATE INDEX "HospitalDept_hospitalId_idx" ON "HospitalDept"("hospitalId");

-- CreateIndex
CREATE INDEX "HospitalDept_deptCode_idx" ON "HospitalDept"("deptCode");

-- CreateIndex
CREATE INDEX "HospitalTransit_hospitalId_idx" ON "HospitalTransit"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalEquipment_hospitalId_equipCode_key" ON "HospitalEquipment"("hospitalId", "equipCode");

-- CreateIndex
CREATE INDEX "HospitalEquipment_hospitalId_idx" ON "HospitalEquipment"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalMealSurcharge_hospitalId_typeCode_key" ON "HospitalMealSurcharge"("hospitalId", "typeCode");

-- CreateIndex
CREATE INDEX "HospitalMealSurcharge_hospitalId_idx" ON "HospitalMealSurcharge"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalNursingGrade_hospitalId_typeCode_key" ON "HospitalNursingGrade"("hospitalId", "typeCode");

-- CreateIndex
CREATE INDEX "HospitalNursingGrade_hospitalId_idx" ON "HospitalNursingGrade"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSpecialTreatment_hospitalId_searchCode_key" ON "HospitalSpecialTreatment"("hospitalId", "searchCode");

-- CreateIndex
CREATE INDEX "HospitalSpecialTreatment_hospitalId_idx" ON "HospitalSpecialTreatment"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSpecialty_hospitalId_searchCode_key" ON "HospitalSpecialty"("hospitalId", "searchCode");

-- CreateIndex
CREATE INDEX "HospitalSpecialty_hospitalId_idx" ON "HospitalSpecialty"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalStaff_hospitalId_staffCode_key" ON "HospitalStaff"("hospitalId", "staffCode");

-- CreateIndex
CREATE INDEX "HospitalStaff_hospitalId_idx" ON "HospitalStaff"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_sourceId_key" ON "Pharmacy"("sourceId");

-- CreateIndex
CREATE INDEX "Pharmacy_sigunguCode_idx" ON "Pharmacy"("sigunguCode");

-- AddForeignKey
ALTER TABLE "HospitalFacility" ADD CONSTRAINT "HospitalFacility_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDetail" ADD CONSTRAINT "HospitalDetail_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDept" ADD CONSTRAINT "HospitalDept_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalTransit" ADD CONSTRAINT "HospitalTransit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalEquipment" ADD CONSTRAINT "HospitalEquipment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMealSurcharge" ADD CONSTRAINT "HospitalMealSurcharge_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalNursingGrade" ADD CONSTRAINT "HospitalNursingGrade_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalSpecialTreatment" ADD CONSTRAINT "HospitalSpecialTreatment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalSpecialty" ADD CONSTRAINT "HospitalSpecialty_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStaff" ADD CONSTRAINT "HospitalStaff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
