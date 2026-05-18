-- Convert Region.sigunguCode to a generated column
ALTER TABLE "Region" DROP COLUMN IF EXISTS "sigunguCode";
ALTER TABLE "Region"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT(code, 5)) STORED;

CREATE INDEX "Region_sigunguCode_idx" ON "Region"("sigunguCode");

-- Convert Property.sigunguCode to a generated column
ALTER TABLE "Property" DROP COLUMN IF EXISTS "sigunguCode";
ALTER TABLE "Property"
  ADD COLUMN "sigunguCode" varchar(5)
  GENERATED ALWAYS AS (LEFT("regionCode", 5)) STORED;

CREATE INDEX "Property_sigunguCode_idx" ON "Property"("sigunguCode");
CREATE INDEX "Property_type_sgg_lasttx_idx"
  ON "Property"("propertyType", "sigunguCode", "lastTxAt" DESC);

-- GiST spatial index on location (column already exists)
CREATE INDEX "Property_location_gix" ON "Property" USING GIST ("location");

-- pg_trgm GIN indexes for fuzzy search
CREATE INDEX "Property_nameNorm_trgm_idx"
  ON "Property" USING GIN ("nameNorm" gin_trgm_ops);

CREATE INDEX "Region_fullName_trgm_idx"
  ON "Region" USING GIN ("fullName" gin_trgm_ops);
