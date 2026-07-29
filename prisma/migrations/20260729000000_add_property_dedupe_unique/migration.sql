-- 경합으로 인한 단지 중복 생성을 DB 차원에서 차단한다.
--
-- 부분 인덱스인 이유: 병합된 패자와 2026-07-01 행정구역 개편 때 리다이렉트된 구 레코드는
-- 생존자와 (propertyType, nameNorm, regionCode, address)가 동일한 채로 남는다. 유일성이
-- 필요한 것은 살아 있는 단지뿐이다.
--
-- address를 포함하는 이유: 빼면 같은 시군구 안 동명 별개 건물(예: 동신/금동 vs 동신/수송동)이
-- 제약을 위반해 강제 병합을 유발한다. 그건 데이터 손상이다.
--
-- CONCURRENTLY를 쓰지 않는 이유: Prisma가 마이그레이션 파일을 트랜잭션으로 감싸 실행하는데
-- CREATE INDEX CONCURRENTLY는 트랜잭션 안에서 동작하지 않는다. Property는 27만 행대라
-- 일반 인덱스 생성이 수 초에 끝난다.
CREATE UNIQUE INDEX "Property_dedupe_key"
  ON "Property" ("propertyType", "nameNorm", "regionCode", "address")
  WHERE "redirectToId" IS NULL;
