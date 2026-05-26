-- CreateTable
CREATE TABLE "School" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "schoolKind" VARCHAR(20),
    "foundType" VARCHAR(20),
    "coeduType" VARCHAR(20),
    "region" VARCHAR(20),
    "eduOffice" VARCHAR(40),
    "tel" VARCHAR(30),
    "homepage" VARCHAR(200),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_sourceId_key" ON "School"("sourceId");

-- CreateIndex
CREATE INDEX "School_schoolKind_idx" ON "School"("schoolKind");

-- CreateIndex
CREATE INDEX "School_region_idx" ON "School"("region");

-- PostGIS GIST index
CREATE INDEX IF NOT EXISTS "School_location_idx" ON "School" USING GIST ("location");
