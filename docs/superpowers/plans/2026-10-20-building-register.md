# 상세 건축물 정보(건축물대장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 법정동코드 조회표 + 건축HUB 3개 오퍼레이션으로 단지별 건축물대장을 매칭·저장하고, 아파트·오피스텔·빌라 상세에 "건축물 정보" 섹션을 렌더한다.

**Architecture:** `LegalDong`(연 1회 수동 적재)로 실거래 (시군구, 동 이름, 지번) → 대장 조회 키를 만든다. 매일 온박스 수집기(100분 예산)가 `BuildingRegister`에 단지당 1행(status + 정규화 필드)을 쓴다. 화면은 `status='matched'` 행만 읽는다. 순수 모듈(key·select·normalize·view)이 판정과 표시를 맡는다.

**Tech Stack:** Prisma + PostgreSQL, tsx 스크립트, Vitest, Playwright, Next.js 서버 컴포넌트

**Spec:** `docs/superpowers/specs/2026-10-20-building-register-design.md` · UI: `docs/superpowers/mockups/2026-10-20-building-register.html`

## Global Constraints

- 브랜치 `feat/building-register`. 머지 = 운영 배포, 전체 확인 + 사용자 승인 후.
- 화면은 DB만 읽는다. `status !== 'matched'`면 섹션 숨김. 빈 값 행/타일은 숨긴다.
- 내진설계는 '적용'(1)만 표시, '미적용' 문구 금지. 에너지등급·기계식 비율 표시 금지.
- 근린생활시설 안내는 빌라(ROW_HOUSE·MULTIPLEX)만, 매칭 건물의 주용도·기타용도에 '근린생활시설'이 있을 때만. 문구는 spec §5 그대로.
- 매칭 채택 4조건(spec §3) 전부. 이름 유사로 건물을 '추정'하지 않는다(포함 관계 + 한 이름으로 모일 때만).
- 수집: 동시성 3, 한도 초과 즉시 중단, 100분 예산, 단지별 오류 격리. 새 ETL 잡은 `install-timers.sh`의 JOBS와 **start 목록 둘 다** 추가.
- 완료 전 `pnpm lint`, e2e.

## Review Focus

1. 지번 형식 이상('', '산12', '12-3-4') → bad_key, 호출 안 함 (Task 2).
2. 대단지 표제부 100건 초과 → 페이지네이션 (Task 4).
3. 0이 의미 없는 필드(승강기·주차·건폐율 0) → null (Task 3).
4. 아파트에서 표시 항목이 모두 비면 섹션 숨김 (Task 6).
5. 세대수·호수 없을 때 세대당 주차 미계산, 총대수만 (Task 6).

---

### Task 1: 스키마·마이그레이션
- schema: spec §2의 `LegalDong`, `BuildingRegister` 그대로(AptMaintenanceCostStat 뒤). migration SQL 직접 작성(CHAR/VARCHAR/DECIMAL/JSONB/TIMESTAMP(3), 인덱스 `LegalDong_sigunguCode_name_idx`, `BuildingRegister_status_idx`).
- `pnpm test:db:migrate && pnpm prisma generate`, migrate status 확인 → 커밋 `feat(db): LegalDong·BuildingRegister 추가`

### Task 2: 법정동코드 파싱·적재 + 조회 키 (순수 + DB)
**Files:** `scripts/ingest/legal-dong/{parse.ts,load.ts,runner.ts}`, `scripts/ingest/building-register/key.ts`, tests `tests/ingest/legal-dong/parse.test.ts`, `tests/ingest/building-register/key.test.ts`, `tests/integration/legal-dong-load.test.ts`. `scripts/ingest/school-zone/parse.ts`의 `decodeText`를 export해 재사용.
- `parseLegalDongCsv(bytes)`: '존재'만, 시군구 행(`code[:5]+'00000'`)의 이름을 접두로 떼어 `{ code, sigunguCode, name }`. 시군구 행이 없거나 접두가 안 맞는 행은 버린다. 시·도/시군구 행 자체(뒤 5자리 00000)는 제외.
- `replaceLegalDongs(rows)`: 트랜잭션 교체, 이전 90% 미만 거부.
- runner: `downloadFileData({publicDataPk:'15123287', detailPk:'uddi:d6c67241-a722-48c4-8041-d66ff243cf57'})` 또는 `--csv=`. IngestionRun source `legal-dong`.
- `buildRegisterKey(pairs: TxPair[], lookup: Map<string,string[]>)`: 지번 `^(산)?(\d+)(?:-(\d+))?$`, lookup 키 `${sgg}|${umd}`, 코드가 정확히 1개여야 함. 하나라도 실패 → `bad_key`, 쌍 0개 → `bad_key`, 서로 다른 키 2+ → `multi_pair`, 아니면 `{status:'ok', key:{bjdCode, platGbCd:'0'|'1', bun(4), ji(4)}}`.
- 테스트: 일반구('41111','정자동')·리('덕산읍 두촌리')·산 지번·'' 지번·2개 지번·동일 키 중복 거래.

### Task 3: 건물 특정·정규화 (순수)
**Files:** `scripts/ingest/building-register/{select.ts,normalize.ts}`, tests 동명.
- `selectTarget({type,name,builtYear,recap,titles})` — spec §3 2~4: 주건축물=`mainAtchGbCd=='0'`. 아파트: recap 1건 → {recap, 모든 주건축물}; 아니면 주건축물 1건; 아니면 이름 매칭. 그 외: 주건축물 1건 → {recap(1건이면), [그것]}; recap 1건 → {recap, 모든 주건축물}; 아니면 이름 매칭(공백·괄호·하이픈·'아파트' 제거 후 포함 관계, 매칭 건물의 bldNm 종류가 1개일 때). 결과 없음 `not_found`, 못 고름 `ambiguous`, builtYear 없음 또는 연도값 없음 `year_unknown`, ±1 불일치 `year_mismatch`, 용도(아파트·빌라 '주택' / 오피스텔 /오피스텔|업무|공동주택/) 불일치 `purpose_mismatch`.
- `normalizeRegister(sel, jijigu, titlesAll)` → spec §2 필드: 층 max(0→null), 세대 recap.hhldCnt>0 또는 주건축물 합, 호 recap.hoCnt>0 또는 합, 승강기 합(0→null), 주차 recap.totPkngCnt>0 또는 전체 표제부(부속 포함) 자주식+기계식 합(0→null), 건폐·용적 recap>0 또는 주건축물 1건 값>0, 구조·주용도·기타용도는 주건축물 최빈(기타용도는 그 건물 것), 내진 적용 수 = `rserthqkDsgnApplyYn=='1'` 수, 사용승인 recap 유효값 또는 주건축물 중 가장 이른 값, 대장 생성일 첫 주건축물 crtnDay, 지역지구 = reprYn '1' 첫 건(구분명에서 '코드' 제거, 공백 이름은 null), 근생 = 주건축물 주용도·기타용도에 '근린생활시설'.

### Task 4: 수집 러너 (HTTP·DB)
**Files:** `scripts/ingest/building-register/{http.ts,runner.ts}`, test `tests/ingest/building-register/http.test.ts`(readItems), `tests/integration/building-register-runner.test.ts`.
- `readItems(payload)`: resultCode '00' 아니면 throw, items ''/없음 → [], 단건 → [obj]. `fetchBrItems(op, key)`: numOfRows 100, totalCount 초과 시 다음 페이지(최대 10페이지).
- `runCollect({ deadline, concurrency=3, limit?, fetchItems=fetchBrItems, propertyIds? })`: LegalDong 전체를 Map으로 1회 적재 → 대상(행 없음 또는 api_error, redirect 아님, 유형 우선순위 아파트→오피스텔→연립→다세대, txCount12m desc) 2,000건씩 → 단지별: 거래 쌍(DISTINCT sigunguCode, umd, jibun) → key → 실패면 그 status로 저장(호출 없음) → recap·title 호출 → select → matched면 jijigu 호출 → normalize → upsert. 비할당 오류는 `api_error` 저장, 한도 초과는 저장 없이 전체 중단, upsert 오류는 로그 후 계속.
- main: `--max-minutes`(기본 100), IngestionRun source `building-register`, notify(한도·시간 중단은 info).
- 통합 테스트: 키 실패 단지는 호출 0, matched 저장, api_error 재시도, 한도 중단, 시간 예산.

### Task 5: 표시 모델·조회
**Files:** `lib/insights/building-register.ts`, `lib/building-register-query.ts`, tests.
- `buildBuildingView(row, propertyType, now)` → `{ tiles: {label,value,sub?}[], rows: {label,value,note?}[], neighborhoodNotice, createdLabel, fetchedLabel, formula } | null` — 시안 A(아파트: 건폐율·용적률·내진 타일 / 지역지구·구조·최고층 행) · B/C(오피스텔·빌라: 사용승인 연차·규모·주차(세대/호당, 임장ON 계산)·승강기·건폐율·용적률 / 주용도(—기타)·지역지구·구조·내진 적용) 그대로. 값 없는 타일·행 생략, 아파트는 타일·행 모두 없으면 null.
- `getBuildingRegisterView(propertyId, propertyType, now)`: matched 행만.

### Task 6: 컴포넌트 + 출처 + 페이지 3곳 + 사이드바
- `app/(public)/apt/[id]/_components/building-register-section.tsx`(시안 구조), 출처 `molit-building-register`(국토교통부, 건축HUB 건축물대장정보 서비스, data.go.kr/data/15134735, '부동산 거래').
- apt: maintenance 아래, officetel·villa: ComplexInfoSection 아래. DetailSidebar `showBuilding` + `{ href: '#building-register', label: '건축물 정보', needsBuilding: true }`(관리비 다음).
- SSR 테스트: 시안별 텍스트, '미적용' 부재, 근생 줄은 빌라만, null → ''.

### Task 7: 실행 배선
- package.json `ingest:building-register`, `ingest:legal-dong`; run-etl.sh `building-register)`; install-timers JOBS `building-register|*-*-* 21:00:00` **및 start 목록**.

### Task 8: e2e
- 시드: 래미안서초 BuildingRegister(matched, 아파트 값), 서초빌라하우스(matched, 근생 true). 테스트 2개(아파트 섹션·빌라 근생 줄).

### Task 9: 머지 전 확인 + 리뷰 + PR
- 전체 검사, 실데이터 로컬 스모크(LegalDong 실파일 적재 → 표본 단지 몇 곳 실제 API 수집, 로컬 DB에 표본 Property 복사 대신 `propertyIds`로 지정한 시드 단지), Opus 최종 리뷰, 수정, PR(배포 후: legal-dong 1회 적재 → 타이머 설치(start 포함) → 첫 실행 수동).
