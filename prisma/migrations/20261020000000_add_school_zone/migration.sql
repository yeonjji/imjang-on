-- CreateTable
CREATE TABLE "SchoolZone" (
    "hakgudoId" VARCHAR(19) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "eduName" VARCHAR(60),
    "baseDate" DATE NOT NULL,
    "geom" geometry(MultiPolygon,4326) NOT NULL,
    CONSTRAINT "SchoolZone_pkey" PRIMARY KEY ("hakgudoId")
);

-- CreateTable
CREATE TABLE "SchoolZoneSchool" (
    "hakgudoId" VARCHAR(19) NOT NULL,
    "schId" VARCHAR(19) NOT NULL,
    "schoolName" VARCHAR(60) NOT NULL,
    "eduOffice" VARCHAR(60) NOT NULL,
    "schoolId" BIGINT,
    "isPrimary" BOOLEAN NOT NULL,
    CONSTRAINT "SchoolZoneSchool_pkey" PRIMARY KEY ("hakgudoId","schId")
);

-- 점 포함 조회용 공간 인덱스(Prisma 스키마로 표현 불가 — 다른 location 인덱스와 같은 방식)
CREATE INDEX "SchoolZone_geom_idx" ON "SchoolZone" USING GIST ("geom");

-- AddForeignKey
ALTER TABLE "SchoolZoneSchool" ADD CONSTRAINT "SchoolZoneSchool_hakgudoId_fkey" FOREIGN KEY ("hakgudoId") REFERENCES "SchoolZone"("hakgudoId") ON DELETE CASCADE ON UPDATE CASCADE;
