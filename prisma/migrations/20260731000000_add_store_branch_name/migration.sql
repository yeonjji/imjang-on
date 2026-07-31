-- 공공데이터 상가업소 정보는 지점명을 bizesNm(상호명)과 brchNm(지점명)에 쪼개 내려준다.
-- brchNm은 독립된 지점명이 아니라 bizesNm에서 잘려나간 꼬리라, 원본을 그대로 보관하고
-- 결합·정리는 표시 시점(lib/amenity/store-name.ts)에서 한다.
--
-- nullable인 이유: 기존 약 31만 행은 재수집 전까지 NULL이며, 표시 함수가 NULL이면
-- name만으로 동작하므로 코드가 먼저 배포돼도 화면이 깨지지 않는다.
ALTER TABLE "Store" ADD COLUMN "branchName" VARCHAR(60);
