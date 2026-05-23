-- CreateTable
CREATE TABLE "School" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "schoolLevel" VARCHAR(10) NOT NULL,
    "schoolType" VARCHAR(20),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Park" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "address" VARCHAR(200) NOT NULL,
    "location" geography(Point,4326),
    "parkType" VARCHAR(40),
    "area" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Park_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_sourceId_key" ON "School"("sourceId");

-- CreateIndex
CREATE INDEX "School_schoolLevel_idx" ON "School"("schoolLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Park_sourceId_key" ON "Park"("sourceId");

-- CreateIndex
CREATE INDEX "Park_parkType_idx" ON "Park"("parkType");

-- PostGIS GIST indexes
CREATE INDEX IF NOT EXISTS "School_location_idx" ON "School" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Park_location_idx" ON "Park" USING GIST ("location");
