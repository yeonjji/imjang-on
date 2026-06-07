-- CreateTable
CREATE TABLE "SubwayStation" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "nameNorm" VARCHAR(60) NOT NULL,
    "lines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "operators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "address" VARCHAR(200),
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "location" geography(Point,4326),
    "dataStdDate" DATE,
    "sourceKey" VARCHAR(80) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubwayStation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubwayStation_sourceKey_key" ON "SubwayStation"("sourceKey");

-- PostGIS GIST + 검색용 GIN trigram 인덱스
CREATE INDEX IF NOT EXISTS "SubwayStation_location_idx" ON "SubwayStation" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "SubwayStation_nameNorm_trgm_idx" ON "SubwayStation" USING GIN ("nameNorm" gin_trgm_ops);
