CREATE TABLE "EvChargerUnit" (
  "id" BIGSERIAL PRIMARY KEY,
  "sourceId" VARCHAR(120) NOT NULL UNIQUE,
  "stationSourceId" VARCHAR(80) NOT NULL,
  "chgerId" VARCHAR(20) NOT NULL,
  "chgerType" VARCHAR(4) NOT NULL,
  "isFast" BOOLEAN NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EvChargerUnit_stationSourceId_fkey"
    FOREIGN KEY ("stationSourceId") REFERENCES "EvCharger"("sourceId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EvChargerUnit_stationSourceId_idx" ON "EvChargerUnit"("stationSourceId");
