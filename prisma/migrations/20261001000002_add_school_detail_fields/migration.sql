-- 나이스 학교기본정보에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 3).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "School"
  ADD COLUMN "hsType" VARCHAR(20),
  ADD COLUMN "hsTrack" VARCHAR(20),
  ADD COLUMN "specialPurpose" VARCHAR(40),
  ADD COLUMN "admissionPeriod" VARCHAR(10),
  ADD COLUMN "foundedAt" DATE,
  ADD COLUMN "anniversaryAt" DATE;
