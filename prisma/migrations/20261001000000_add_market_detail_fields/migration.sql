-- 전국전통시장표준데이터에서 수집하던 응답 중 버리던 필드를 저장한다(생활시설 상세 보강 PR 1).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "TraditionalMarket"
  ADD COLUMN "storeCount" INTEGER,
  ADD COLUMN "openCycle" VARCHAR(40),
  ADD COLUMN "establishedYear" INTEGER,
  ADD COLUMN "products" VARCHAR(300),
  ADD COLUMN "hasParking" BOOLEAN,
  ADD COLUMN "hasToilet" BOOLEAN,
  ADD COLUMN "tel" VARCHAR(30),
  ADD COLUMN "homepage" VARCHAR(200),
  ADD COLUMN "referenceDate" DATE;
