-- 한국환경공단 충전소 API에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 5).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "EvCharger"
  ADD COLUMN "accessLimited" BOOLEAN,
  ADD COLUMN "limitDetail" VARCHAR(200),
  ADD COLUMN "useTime" VARCHAR(100),
  ADD COLUMN "parkingFree" BOOLEAN,
  ADD COLUMN "floorType" VARCHAR(1),
  ADD COLUMN "floorNum" INTEGER,
  ADD COLUMN "facilityKind" VARCHAR(2),
  ADD COLUMN "facilityKindDetail" VARCHAR(4),
  ADD COLUMN "operatorTel" VARCHAR(30),
  ADD COLUMN "locationDetail" VARCHAR(300);

ALTER TABLE "EvChargerUnit"
  ADD COLUMN "outputKw" INTEGER,
  ADD COLUMN "installYear" INTEGER;
