-- 전국도시공원정보표준데이터에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 2).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다. 기타 시설(etcFclty)은 표시하지 않아 저장하지 않는다.
ALTER TABLE "Park"
  ADD COLUMN "facilitySport" VARCHAR(300),
  ADD COLUMN "facilityPlay" VARCHAR(300),
  ADD COLUMN "facilityConvenience" VARCHAR(300),
  ADD COLUMN "facilityCulture" VARCHAR(300),
  ADD COLUMN "designatedAt" DATE,
  ADD COLUMN "managingOrg" VARCHAR(100),
  ADD COLUMN "tel" VARCHAR(30);
