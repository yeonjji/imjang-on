-- 기본 목록(/list) 정렬·카운트 성능: propertyType IN(...) AND txCount12m>0 ORDER BY lastTxAt DESC
-- 기존 (propertyType, lastTxAt) 인덱스는 여러 타입을 한꺼번에 lastTxAt 순으로 정렬하지 못해 풀스캔을 유발.
-- lastTxAt 선두 + txCount12m>0 부분 인덱스 + propertyType INCLUDE로 정렬·필터·카운트를 인덱스로 처리.
-- 운영 DB에는 이미 온라인 적용됨(IF NOT EXISTS로 멱등; 다른 환경 동기화용).
CREATE INDEX IF NOT EXISTS "Property_active_lastTxAt_idx"
  ON "Property" ("lastTxAt" DESC NULLS LAST)
  INCLUDE ("propertyType")
  WHERE "txCount12m" > 0;
