# 2026-07-01 행정구역 개편 대응 마이그레이션 설계

작성 2026-07-23. 조사 근거: 라이브 DB + data.go.kr 원본 + 각 상류 API 실측.

## 목표

2026-07-01 시행된 행정구역 개편을 `Region` 및 파생 데이터에 반영한다. **진행 중인 데이터 손실**(신 지역 실거래·보육 미수집)을 먼저 멈추고, 소스가 준비된 데이터셋부터 신 코드로 재수집한다.

**성공 기준**
- `/apt`·`/villa`·`/officetel`·`/childcare`·`/school`의 신설 지역(제물포구·영종구·검단구·전남광주통합특별시)에 데이터가 채워진다.
- `getPopularSigungus` 등 시도 기반 서빙이 신 지역에서 깨지지 않는다(`sidoFromPrefix('12')` 유효).
- 구 지역(광주광역시·인천 중구 등) 페이지·기존 URL·`Property` FK가 유지된다(무중단).

## 배경 — 무엇이 바뀌었나 (원본 대조 확정)

data.go.kr `15077871`(행정표준 법정동코드) 대조 결과 3건:

| 변경 | 성격 | 신 코드 | 구 코드 |
|---|---|---|---|
| 인천 구 재편 | 시군구 | 제물포구 `2812500000`(LAWD 28125)·영종구 `2815500000`(28155)·검단구 `2829000000`(28290) | 중구 2811·동구 2814 폐지, 서구 2826 재편 |
| **전남광주통합특별시** | **시도 통폐합** | 신 시도코드 **`12`**(법정동 3,204) | 광주광역시 2900·전라남도 4600 **소멸**(원본 "데이터없음") |
| 안양 명학동·병목안동 | 행정동 개칭 | — (법정동 아님) | **Region 무관, 대상 아님** |

현재 `Region`: `sourceVersion=2026-05`, 최종 2026-05-19, 20,560행. 신설 구 0건. **자동 재시드 크론은 연 1회(4월 5일)** + GHA는 OCI DB(127.0.0.1) 접근 불가 → **온박스 수동 실행만 유효**.

## 영향 범위 (라이브 카운트)

구 코드(인천 2811/2814/2826 + 광주 29 + 전남 46)에 걸린 행:

| 테이블 | 총건수 | 영향 행 | Region 연결 | 소스 신코드 준비 |
|---|--:|--:|---|:--:|
| Transaction | 7.60M | **494,161** | `sigunguCode`/`regionCode` 비정규화 | ✅ MOLIT |
| Property | 274,340 | **11,029** | 🔗 FK `regionCode→Region.code` | ✅ MOLIT |
| Store | 311,857 | **24,729** | 소진공 `signguCd` 직접 | ❌ 구코드 |
| Childcare | 25,102 | **2,195** | Region 파생 arcode | ✅ 보육통합 |
| School | 12,561 | **1,381** | 주소매칭(NEIS) | ✅ NEIS |
| TraditionalMarket | 1,393 | **137** | 주소매칭 | ⏳ 미갱신 추정 |
| SubscriptionNotice | 5,854 | 0 | `regionCode` | — |

**별도/무관**: Hospital·Pharmacy = HIRA 자체코드(전남광주=prefix 36, 법정동 무관) — 2026-07-20 갱신 완료(전남광주 반영, 인천 재편은 HIRA 소스 대기). Region 마이그레이션과 독립. Park·Parking·EvCharger = 좌표전용, 무관.

**정식 FK는 `Property.regionCode` 하나뿐** → 재시드(upsert)는 FK 안전. 나머지는 코드 문자열 비정규화라 cascade 없음.

## 소스 준비 상태 (실측)

| 소스 | 프로브 결과 |
|---|---|
| MOLIT 실거래 | 제물포 28125=37건·전남광주목포 12110=110건 / 구코드 28110·46110 = **0** ✅ |
| 보육통합 | 제물포 28125=51건 / 구 28110=0 ✅ |
| NEIS 학교 | 인천 주소 제물포36·영종27·검단42 / 구 중구·동구·서구=0 ✅ |
| 소진공 상가 | 제물포권=`28110 중구`, 목포=`46110 전라남도` — **아직 구코드** ❌ |

→ **실거래·보육·학교는 지금 재수집하면 신 코드로 흐른다. 소진공(상가·시장)은 대기.**

## 핵심 설계 결정 (검토 요망)

1. **폐지 코드 = 삭제 아니라 마킹.** 구 코드 삭제 시 `Property` FK 11K + 과거 실거래 494K 유실. **삭제 절대 금지**, `isAbolished=true`만.
   - **검출 방식(권장)**: 재시드를 새 `sourceVersion`(예 `2026-07`)로 실행 → API에 있는 코드는 전부 새 버전으로 갱신됨. 이후 `sourceVersion`이 옛 값인 행 = 이번 API에 없는 코드 = 폐지. `UPDATE ... SET isAbolished=true, abolishedAt='2026-07-01' WHERE sourceVersion <> '2026-07' AND isAbolished=false`. (sourceVersion diff = 깔끔한 폐지 검출)
2. **구 지역 URL/페이지 처리 — ✅ 확정: 유지 (삭제·강제 301 안 함).**
   - `isAbolished=true` 마킹은 **탐색 표면에서만** 구 지역을 숨긴다(검색 `lib/search.ts`, 드롭다운 `getSigungusBySido`, 인기지역 `getPopularSigungus`/`briefing`, 허브요약 `hub-summary/*` 전부 `isAbolished=false` 필터). 데이터·FK·상세페이지는 보존, **404 없음**.
   - sigungu-scoped 상세(`/school/[sigunguCode]/[id]` 등)는 이미 `if (school.sigunguCode !== sigunguCode) permanentRedirect(...)` 보유 → 엔티티가 신코드로 재수집되면 옛 URL이 **자동 308**로 신 URL 이관(SEO 손실 0, 수동 리다이렉트 불필요). region=null(폐지)이어도 fallback 렌더.
   - 매물 상세(`/apt/[id]`)는 id 기반이라 URL 불변. 구/신 중복은 T4b remap에서 해소.
   - '폐지 배지'는 선택(UX 명확성용). 즉시 301은 빈 신 페이지 강제 이관 + 자동 308과 중복이라 **채택 안 함**.
3. **`sourceVersion` 태그**: `2026-07` 사용(seed 기본 포맷 YYYY-MM). **← 확인**
4. **전남광주 sido 표기**: `Region.sido`에는 seed가 `전남광주통합특별시`를 넣음(fullName 단일 토큰). `SIDO_LIST`에 `{code:'1200000000', sido:'전남광주', fullName:'전남광주통합특별시'}` 추가.
   - 구 `광주`(29)·`전남`(46)의 `PREFIX_TO_SIDO` 매핑은 **유지**(폐지 데이터 표시용) + `12` 추가. **← 백워드 표기 유지 확인**
5. **주소 문자열 갱신 & Property 중복 (재수집 부작용).** ← **중요, 별도 설계 필요**
   - **어메니티(School·Childcare·Store·Market·…)**: 재수집이 `ON CONFLICT(sourceId) DO UPDATE`라 `address`가 소스 값으로 **덮어써짐**. School·Childcare=신주소 반영 ✅ / Store·Market=소진공 구주소라 그대로 ❌.
   - **⚠️ Property**: `property-matcher`가 `regionCode startsWith sigunguCode`로 매칭 → 같은 단지라도 **신 코드(제물포 28125) 거래가 오면 구 코드(중구 28110) 단지와 매칭 실패 → 신규 Property 중복 생성**. 매칭 성공 시에도 `address`는 **최초 생성값 고정(안 덮음)**. ⇒ 재편지역 11,029 단지가 구/신 두 벌로 쪼개지고 거래이력·주소 분리.
   - **결정 필요**: (a) 구 Property.regionCode를 신 코드로 **remap**(연동해 Transaction 494K의 regionCode/sigunguCode도 remap) vs (b) 중복 허용 후 name+좌표로 **병합**. **권장 (a)**.
   - **크로스워크(조사 완료)**: StanReginCd에 직접 승계필드 없음 + 폐지 구코드 미반환. 대신 **도출 가능** — 신코드는 `adpt_de=20260701`로 식별, 구코드는 Region 테이블 보유, **읍면동명(`locallow_nm`) 매칭**으로 old→new 구성. 전남 시군구(목포 등, 시도만 46→12 변경)는 사실상 prefix swap, 인천·광주 구재편(중구+동구→제물포구 병합·재번호)은 이름매칭(동명 충돌 검증). ⇒ 블로커 아님.
   - Transaction 자체는 구/시도명 미저장 → 지역명은 Region join 표시라 개별 주소 갱신 불필요(코드 remap만이 쟁점).

## 코드 변경

### 1) `lib/region.ts` — 하드코딩 시도 테이블 (필수)
현재 주석 "17개 시도는 안 바뀜" 가정이 깨졌다.
- `SIDO_LIST`: `전남광주통합특별시(1200000000)` 추가. 광주(2900)·전남(4600)은 **폐지 표기용으로 유지하되** 신규 서빙 기본에서 빠지도록 정리(구 데이터 라벨은 살아야 함).
- `SIDO_PREFIX`/`PREFIX_TO_SIDO`: `'전남광주':'12'` 추가(광주 29·전남 46 매핑은 유지). 없으면 `sidoFromPrefix('12')=undefined` → `getPopularSigungus`에서 신지역 **누락**(L225 `if(!sido)continue`).
- 회귀 주의: `getSigungusBySido('전남광주')`가 `sidoQuery='전남광주통합특별시'`로 Region.sido와 매칭되는지.

### 2) `scripts/ingest/regions/seed-from-api.ts` — 폐지 마킹 패스 추가
현재 upsert 전용 + `isAbolished:false` 하드코딩이라 폐지 미처리. main() 말미(2차 parentCode 패스 뒤)에 sourceVersion diff 기반 폐지 마킹 추가(위 결정 1). **삭제 없음.**

### 3) (선택) `adapter-childcare.ts` — `where: { sigunguCode:{not:null}, isAbolished:false }`로 좁혀 폐지 arcode 순회 제외(현재는 전부 순회, 폐지코드는 0 반환이라 무해하나 낭비).

## 실행 계획 (Phase 별)

### Phase 1 — 출혈 정지 + 영향의 ~95%(≈509K) 복구 [지금]
- **T1.** `lib/region.ts` 시도 테이블 수정 + 단위테스트(`sidoFromPrefix('12')==='전남광주'`, `getSigungusBySido('전남광주')` 비어있지 않음). → verify: `pnpm test lib/region` 통과
- **T2.** `seed-from-api.ts` 폐지 마킹 패스 + 테스트(구 코드 fixture가 `isAbolished=true`로). → verify: 단위테스트, `pnpm lint`
- **T3.** 온박스 Region 재시드(`REGION_SOURCE_VERSION=2026-07`). → verify: `제물포구/영종구/검단구/전남광주통합특별시` 행 존재, 광주·전남·인천중구 `isAbolished=true`, `sidoFromPrefix` 회귀 없음
- **T4.** 실거래 백필: 신 코드 대상 `2026-07` 재수집(놓친 3주 복구) + daily가 이후 자동 포함되는지 확인. → verify: 제물포구·전남광주목포 Transaction 행수 > 0
- **T4b.** Property/Transaction remap 처리 [결정 5]: **읍면동명 기반 크로스워크 도출**(신코드 `adpt_de=20260701` + Region 구코드 `locallow_nm` 매칭; 전남계열은 prefix swap 46→12) → 재편지역 구 Property·Transaction의 `regionCode`/`sigunguCode` 신코드 remap. 동명 충돌·미매칭 케이스 리포트. → verify: 제물포구 단지 중복 0, 거래이력 연속, 미매칭 0
- **T5.** 보육 재수집 + 학교 region-backfill 재실행. → verify: Childcare/School 신 sigunguCode 행수 > 0
- **T6.** 재검증: 홈 인기지역·신 지역 상세페이지 200 + 데이터 노출. → verify: 실제 URL 확인

### Phase 2 — 소진공 대기 [모니터링]
- **T7.** 감지 스크립트: 제물포구 좌표 상가 `signguCd`가 28125로 바뀌는지 주기 체크(예 주 1회). 갱신 감지 시 Store/Market 재수집.

### Phase 3 — UX/SEO 마감 [신 페이지 populate 후]
- **T8.** (축소 — 결정 #2 "유지"로 대부분 자동화) sigungu-scoped 옛 URL은 기존 자동 308이 처리. 잔여만: 사이트맵에서 폐지 sigungu 제외 확인(`getAllSigungus`가 이미 `isAbolished=false`), 폐지 지역 '안내 배지'(선택), 매물 구/신 중복은 T4b로 해소. **강제 301 없음.**

## 실행 경로 (온박스)

GHA 아님. `etl` 컨테이너로 실행(코드+DB+PUBLIC_DATA_KEY 보유):
```
cd /opt/imjang
DC="docker compose -f deploy/docker-compose.yml --profile tools --env-file deploy/.env.production"
# 재시드 (배포로 코드 반영 후)
$DC run --rm -e REGION_SOURCE_VERSION=2026-07 etl pnpm tsx scripts/ingest/regions/seed-from-api.ts
```
코드 변경(T1·T2)은 main 머지 → push-to-deploy로 박스 반영 후 실행.

## 테스트
- `lib/region.ts`: 시도 매핑 신규(전남광주/12) 단위테스트, 기존 시도 회귀.
- `seed-from-api`: 폐지 마킹 패스(구코드→abolished, 신코드→active) fixture 테스트.
- 통합: 재시드 후 `selectSigunguTargets`에 신 LAWD 포함·구 LAWD 제외 확인.

## 롤백
- 재시드 전 `Region` 백업(`pg_dump -t '"Region"'`). 문제 시 복원.
- 코드는 PR 되돌림. 데이터는 삭제 없음이라 upsert 재실행으로 수렴.

## 범위 밖 / 후속
- Hospital·Pharmacy 인천 재편: HIRA 소스 대기(우리 무관, 다음 xlsx 배포 시).
- 안양 행정동 개칭: 법정동 무관.
- 서구→검단구 분리의 서구 잔존부 경계: 원본 재시드로 자동 반영, 별도 처리 없음.
- 통합특별시 일반구 처리(전남광주 산하 시·구 계층): `selectSigunguTargets` 기존 일반구 로직으로 커버되는지 재시드 후 검증(관련: [[project_transaction_ilbangu_missing]]).
