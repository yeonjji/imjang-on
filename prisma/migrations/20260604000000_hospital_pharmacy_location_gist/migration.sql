-- Hospital·Pharmacy location GiST 인덱스 (누락분 보완)
CREATE INDEX IF NOT EXISTS "Hospital_location_idx" ON "Hospital" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Pharmacy_location_idx" ON "Pharmacy" USING GIST ("location");
