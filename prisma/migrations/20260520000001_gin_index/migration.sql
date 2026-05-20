-- AddIndex: GIN index on Property.areaTypes (Int[] array column)
CREATE INDEX IF NOT EXISTS "Property_areaTypes_gin" ON "Property" USING GIN ("areaTypes");
