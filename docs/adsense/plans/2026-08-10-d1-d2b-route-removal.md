# D1·D2b 상세 라우트 제거 — 실행 설계

작성 2026-08-10. `docs/adsense/2026-08-09-4th-application-plan.md` §4 P2-1의 실행 설계.
6개 영역 병렬 조사 + 반증 검증 12건 + 운영 DB 실측(2026-08-10)을 반영한 판.

## 확정된 게이트 (2026-08-10 운영자 결정)

```
생존(200)  saleCount12m >= 5  OR  txCountTotal >= 30      35,006
301 →/list 나머지 중 txCount12m > 0                      148,658
410 Gone   나머지 중 txCount12m = 0                        90,346
```

`txCountTotal >= 30`을 OR로 넣은 근거: 상세의 거래표·층프리미엄·평형별 비교는 **전체기간** 기준이라,
12개월이 조용해도 전체기간이 두꺼우면 지금 실제로 두꺼운 페이지다(§4.3).

410 대상 90,346의 전체기간 거래 분포 실측 — **98.8%가 9건 이하**라 서사 게이트(`tTrend` = 전체기간 30건)를
통과할 수 없어 이미 noindex다. 색인 가능성이 있는 145개(0.2%)는 위 OR 조건이 정확히 흡수한다.

| 전체기간 거래 | 단지수 | % |
|---|---:|---:|
| 0건 | 24,686 | 27.3% |
| 1–9건 | 64,735 | 71.5% |
| 10–29건 | 925 | 1.0% |
| 30건+ | 145 | 0.2% |

**미확인:** 실제 유입 규모. GSC 자격증명 부재로 판정 불가이며, 운영자 판단으로 **확인 없이 진행**하기로 했다
(2026-08-10). 색인 프록시가 과소추정일 여지는 `pPeer` 경로 — `tTrend` 30건 외에 또래 비교로도 발화한다.

---

---

## 0. 원안에서 바뀐 것 (반증 반영)

| 원안 | 실측 결과 | 교정 |
|---|---|---|
| "목록으로 301하면 끝" | 목록 카드 6종이 전부 상세 링크(`hospital-card.tsx:7`·`pharmacy-card.tsx:7`·`childcare-card.tsx:21`·`amenity-card.tsx:10`·`urban-card.tsx:17`·`park-card.tsx:12`) | **착지 페이지가 자기 자신으로 되돌아오는 308 루프.** 카드 비링크화가 같은 PR 필수 |
| "301" | `permanent:true`·`permanentRedirect()` 모두 **308** (`next.config.mjs:20-91` 전 룰). `next.config.mjs:65` 주석은 "301 승계"라 적혀 있어 틀렸다 | 문서·검증 스크립트를 **308**로 통일 |
| bare 목록이 301 타깃 | convenience·mart·cafe·parking·park는 `requiresSidoScope` **미선언**(=undefined) → `!== false` 참 → `?sido=서울`로 **307** (`amenity/[category]/page.tsx:54`, `urban/[category]/page.tsx:54`). 200은 market(`market.ts:146`)·charger(`charger.ts:90`)뿐 | 308→307 2홉 + 부산 점포가 서울 목록 착지. **선행 정리 필요** |
| 매물은 `/list?region=&type=`로 301 | `/list`는 `deal='all'`이어도 `where.txCount12m={gt:0}`(`lib/property.ts:224`)를 **끌 수 없다**. DealFilter 4값 어디에도 해제 조합 없음 | **12개월 거래 0건 매물은 착지 목록에 절대 안 뜬다.** 타깃을 두 갈래로 분기 |
| 병원·약국은 `?region=`으로 시군구 보존 | 두 목록 모두 **정적 `metadata` export**, canonical이 `/medical/hospital`로 하드코딩(`page.tsx:16-20`) | 시군구는 URL에만 남고 **색인상 보존 안 됨** |
| P2-1 "charger는 `/urban/[category]/[id]`와 같은 라우트라 게이트 필요" | `app/(public)/urban/charger/[id]/`가 **독립 정적 세그먼트 라우트** | 게이트 불필요, 디렉터리 삭제로 끝 |
| 충전소 벌크 상태조회 불가(미확인) | `scripts/ingest/amenities/adapter-ev-charger.ts:5`가 **동일 엔드포인트** `getChargerInfo`를 `statId` 없이 `PAGE_SIZE=1000`으로 전국 페이징 중 | 스냅샷 ETL은 "신설"이 아니라 컬럼 추가. 다만 스케줄이 월 1회(`ingest-amenities.yml` cron `0 2 1 * *`) |
| nearby-infra가 "조회 기능"의 실체 | 위젯 아이템 필드는 name/sub/distance 3개뿐(`nearby-infra.tsx:74-79`). `fetchChargerStatus` 호출부는 `urban/charger/[id]/page.tsx:76` **단 한 곳** | "조회 기능화"는 기존 UI 이전이 아니라 **신규 구현**. 태스크로 계상 |
| 위젯 밀도 = 페이지당 120행 | fetch는 8회(`lib/amenity/nearby.ts:352-362`), store/cafe/etc는 단일 12행 배열을 쪼갠 것 → 상한 **96행**, DOM 노출 5행/카테고리 | 규모 재계산. 단 `'use client'`라 RSC 페이로드 직렬화 가능성 있음(미확인) |

---

## 1. 선행 조건 — 이게 없으면 계획이 성립하지 않는다

### 1.1 코드 선행 (착수 전 반드시)

| # | 무엇을 | 없으면 무슨 일이 | 파일 | 규모 |
|---|---|---|---|---|
| **B1** | **병원·약국 목록에 이름 검색 `q` 추가** | 105,532개의 유일 타깃이 "시군구 + 이름순 20개/페이지"뿐. 시군구당 수백~수천 중 1페이지 착지 = 찾던 시설이 화면에 없다 → soft 404 위험 | `lib/hospital/index.ts:31-52`(`HospitalListFilter`에 `q`, `where.name={contains}`), `lib/pharmacy/index.ts:17-31`, `app/(public)/medical/{hospital,pharmacy}/page.tsx:22`(searchParams), 필터 패널 입력 | S |
| **B2** | **`/list` 미노출 매물 규모 실측 + 타깃 분기 결정** | D2b 250,599개 중 `txCount12m==0`인 것들은 `/list`에 **구조적으로 안 뜬다**(`lib/property.ts:224`) → 빈 목록 착지 = "정보를 옮겼다"가 거짓이 된다 | 읽기전용 psql 1회 (§7 M1) | S |
| **B3** | **사전계산 `indexable` 컬럼 + 전량 재집계 잡** | `saleCount12m`은 `NOW()` 롤링인데 `updatePropertyAggregates`가 **전달된 propertyIds만** 갱신(`scripts/ingest/aggregator.ts:4,15` + `runner.ts:213`). 조용한 단지는 값이 고착되고 거래 1건이 들어오는 순간 계단식 급락 → 페이지 존재 여부가 그 값에 매달린다 | `prisma/schema.prisma` Property에 `indexable Boolean @default(false)` + `indexableAt`, `scripts/ingest/aggregator.ts`, 야간 전량 재계산 워크플로 | M |
| **B4** | **충전소 실시간 상태를 목록·지도에서 제공** | 결정문이 "실시간 상태 조회는 유지"라고 명시했는데 현재 그 코드는 상세 1곳뿐(`urban/charger/[id]/page.tsx:76`). 지금 접으면 유지가 아니라 **기능 삭제** | `app/api/charger-status/route.ts`(신설, 모델 `app/api/subway/search/route.ts`), `components/ui/charger-status-table.tsx`(이전+`'use client'`), 전용 `ChargerCard` | M |
| **B5** | **병원·약국 착지 `scopeLabel` 폴백** | `lib/hub-summary/medical.ts:30-33`이 `region.findFirst({sigunguCode, level:2})`로 지역명을 찾는데 넘어오는 값이 **심평원 6자리 코드**(`prisma/schema.prisma:505,707` `VarChar(10)`, 타 테이블은 `VarChar(5)`)라 **항상 null** → 10만 URL 착지점이 "해당 지역 병원·의원 N곳" | `lib/hub-summary/medical.ts`. 패턴은 `app/(public)/childcare/[sigunguCode]/page.tsx:8-19` `resolveRegionDisplay` | S |
| **B6** | **bare 목록 307 처리 방식 확정** | convenience·mart·cafe·parking·park 5종의 301 타깃이 2홉이 되거나, `?sido=서울`을 박으면 전국 URL이 서울에 착지 | 운영자 결정(§8 O1) → 결정 후 `amenity/[category]/page.tsx:54-57`, `urban/[category]/page.tsx:54-56` | S~M |

### 1.2 착수 무관하게 병행 (측정)

| # | 무엇을 | 왜 |
|---|---|---|
| B7 | GSC 서비스계정 키 배치(P0-1) | D7(유입 손실 상한)의 유일한 판단 근거. 지금은 "상세가 이미 noindex라 유입 0에 가깝다"는 **추론**이지 실측이 아니다 |
| B8 | 사이트맵 재측정 | 마지막 실측이 2026-08-06(76,655) |

### 1.3 만들지 않아도 되는 것 (명시적 기각)

| 원안 | 기각 근거 |
|---|---|
| `/medical/{hospital,pharmacy}/[sigunguCode]` 허브 신설(P2-2) | ① 심평원 6자리 코드라 `Region` 조인 불가 → 행 기반 폴백 신설 필요 ② 시군구×2 ≈500개 디렉터리 URL 신설은 P1-3(파라미터 목록 통합)과 방향이 반대 ③ 게이트 4 ③번("부모 404 해소")은 **고아 상세의 소멸 + 그 URL이 사이트맵·내부링크 어디에도 없다는 사실**로 충족된다 |
| `/medical/hospital/:sgg` 1세그먼트 리다이렉트 룰 | 현재 404인 것을 200-빈목록으로 바꿔 **소프트 404를 만든다**. 그 URL은 노출 0이므로 404가 정답 |
| 매물 시군구 허브(#189 부분 revert) | D2b가 `/list?region=&type=`으로 착지하므로 불필요. 단 §8 O4에서 "색인되는 매물 지역 목록"이 필요하다고 판단되면 재검토 |

---

## 2. 작업 순서

**핵심 제약: 카드 비링크화 + 라우트 삭제 + 리다이렉트는 반드시 같은 커밋이다.**
링크만 끊으면 고아 200이 남고(축소 효과 0), 라우트만 지우면 착지 페이지 20행이 전부 자기 자신으로 308한다. `next.config.mjs:27-30`의 경고 주석이 정확히 이 계열 룰의 과거 사고 기록이다.

### Phase 0 — 무손실·되돌리기 1줄 (선행 인프라)

| 단계 | 파일 | 검증 |
|---|---|---|
| 0-1 | `lib/hospital/index.ts` / `lib/pharmacy/index.ts` — `q` 필터 추가 | 유닛 테스트 신규 1개 |
| 0-2 | `app/(public)/medical/{hospital,pharmacy}/page.tsx` — searchParams `q`, 필터 패널 입력 | `pnpm build` + 로컬 `?q=` 대조 |
| 0-3 | `lib/hub-summary/medical.ts` — 심평원 코드 폴백 | `?region=<실코드>` 착지에 실제 시군구명 |
| 0-4 | `lib/childcare.ts:84-87` select 확장 + `app/(public)/childcare/_components/childcare-card.tsx` — `waitCntTot`·`cctvCount`·`vehicleOp`·`emRoleTeacher`·`tel` 노출 | 카드 SSR 테스트 |
| 0-5 | `lib/hospital/index.ts:36-52` — `detail`(erDayOpen·erNightOpen·parkingCapacity)·`facility`(generalBed*)·`_count.depts` include + `hospital-card.tsx` 배지 4종 | 카드 SSR 테스트 |
| 0-6 | `lib/urban/adapters/parking.ts` — `inferRowSummary`에 기본요금·운영시간 요약 편입 또는 `UrbanCard` 확장 | e2e `urban-parking-list.spec.ts` 보강 |
| 0-7 | `app/(public)/amenity/[category]/_components/amenity-card.tsx` — market일 때 `marketType` 원문 1줄 | 카드 SSR 테스트 |
| 0-8 | `prisma/schema.prisma` Property `indexable`·`indexableAt` + `scripts/ingest/aggregator.ts` + 야간 전량 재계산 워크플로 | 마이그레이션 status 확인 후 머지(메모리 `project_vercel_migration_deploy_gap`) |

> 0-8은 마이그레이션이므로 **머지 전 `prisma migrate status` 확인 필수**.

### Phase 1 — 사이트맵 재구성 (라우트 삭제보다 **먼저**)

라우트를 먼저 지우면 사이트맵이 308 URL 68,987개(현 사이트맵의 90%)를 제출한다. 순서를 뒤집으면 GSC에 "제출된 URL이 리디렉션됨" 대량 경고.

| 단계 | 파일 | 내용 |
|---|---|---|
| 1-1 | `lib/sitemap/sources.ts:188` | childcare `count` → `async () => 0`. **SOURCE_ORDER 슬롯·findMany·`CHILDCARE_SITEMAP_INDEXABLE`은 보존**(pharmacy `:212` 선례 형식) |
| 1-2 | `lib/sitemap/sources.ts:239` | hospital 동일 |
| 1-3 | `lib/sitemap/sources.ts:100-111` | `PROPERTY_INDEXABLE`을 `{ indexable: true, redirectToId: null }`로, `count`를 `prisma.property.count({where})`로 복원. `redirectToId: null`이 현행 조건에 빠져 있어 그대로 복원하면 308 체인이 사이트맵에 들어간다 |
| 1-4 | `lib/sitemap/static-entries.ts:6-33` | `/medical/hospital`·`/medical/pharmacy`·`/childcare`·`/guide` 추가, `/urban/parking?sido=서울` 제거(P1-4) |
| 1-5 | (선택, §8 O7) | `SOURCE_ORDER`에서 property를 **끝으로** 이동 — 매일 흔들리는 count가 앞에 있으면 뒤 샤드 번호가 매일 재배치된다 |

**샤드 산술**

| | 소스별 URL | 샤드 |
|---|---|---|
| 현재 | core 1,334 · childcare 24,108 · hospital 44,879 · subscription 5,893 · loan 318 · post 48 · jeonse 47 · guide 28 = **76,655** | **14** (`/sitemaps/0..13`) |
| 이후 | core 1,334 · **property 23,409** · subscription 5,893 · loan 318 · post 48 · jeonse 47 · guide 28 ≈ **31,077** | **9** |

→ `/sitemaps/9`~`/sitemaps/13`이 404(`app/sitemaps/[id]/route.ts:33-35`). GSC에서 옛 샤드 제출분 수동 삭제 필요.
→ **부동산 비중 = (23,409 + 5,893) / 31,077 = 94.3%** — 게이트 4 복원 항목 ②·③이 이 변경 하나로 충족된다.

### Phase 2 — 상세 라우트 제거 (카테고리별, 손실 작은 순)

각 단계 = 카드 비링크화 + 위젯 href null + 라우트 삭제 + 리다이렉트 + 테스트, **한 커밋**.

| 순 | 카테고리 | 수 | 이유 |
|---|---|---:|---|
| 2-1 | amenity 4종 | 271,131 | 정보 손실 근거가 가장 확실(상세 추가 필드 = 업종 1개). ISR 쓰기 1위 라우트 해소 |
| 2-2 | urban park + parking | 34,884 | park 손실 ≈0, parking은 0-6 선행으로 완화. 둘 다 사이트맵 소스 없음 |
| 2-3 | medical 2종 | 105,532 | B1·B5 선행 필수 |
| 2-4 | childcare | 25,151 | 0-4 선행. `nearby-childcare.tsx` 이전이 최우선 |
| 2-5 | urban charger | 101,703 | B4 선행 필수 |

### Phase 3 — D2b 매물 (마지막, 가장 위험)

| 단계 | 파일 | 내용 |
|---|---|---|
| 3-1 | `lib/property.ts` | `PROPERTY_DETAIL_MIN_SALE_12M = 5`, `propertyListHref(p)` 헬퍼 |
| 3-2 | `app/(public)/apt/[id]/page.tsx:**98**` | `redirectToId` 체크(`:97`) **직후**, `cachedPropertyLatLng`(`:99`) 앞. ⚠️ `:94`는 `if (!property)` 블록의 닫는 중괄호라 그 지점의 `property`는 `null`이다. officetel `:105`, villa `:109` |
| 3-3 | 같은 파일 `generateMetadata` | 유형 가드 직후 `if (!property.indexable) return {}`. 본문 리다이렉트는 `generateMetadata`를 막지 못하고, 거기서 `loadAptInsight`의 8-way `Promise.all`(`lib/insights/apt-loader.ts:38-47`)이 그대로 돈다 |
| 3-4 | `opengraph-image.tsx` 3종 | `load()`에 같은 게이트 → null 반환 시 `og-map-route.tsx:32-33`이 404 |
| 3-5 | `app/(public)/apt/[id]/page.tsx:79` 등 | 생존 페이지 robots를 `robotsFor(true)`로. **사이트맵 ⊆ 색인 차집합 0을 만드는 유일한 값싼 방법** — 존재 자체가 이미 밀도 게이트를 통과했다는 뜻 |
| 3-6 | 링크 공급 4곳 | `lib/nearby.ts:55`·`lib/amenity/nearby.ts:157`(raw SQL `AND p."indexable"`), `lib/property.ts:326`(`getTopPropertiesByVolume`), `lib/search.ts:14-25`(자동완성) |
| 3-7 | `app/(public)/list/_components/property-list-card.tsx:27` | 미달 행 비클릭 + "최근 1년 매매 기록 없음" 표기. **목록에서 행을 지우지 않는다** — 타깃에 그 행이 남아 있어야 리다이렉트가 소프트404로 안 보인다 |
| 3-8 | `lib/briefing.ts:92,259-264` + `market-briefing.tsx:44,47` + `jeonse-discovery-section.tsx:112` | `TxHighlight`에 게이트 값 실어 미달이면 href 생략(Tile은 href 옵셔널) |

---

## 3. PR 분할

| PR | 내용 | 독립 배포 | 되돌리기 | 의존 |
|---|---|---|---|---|
| **PR-A** 선행 인프라 | Phase 0-1~0-7 (q 검색, scopeLabel 폴백, 카드 필드 보강) | ✅ 순수 추가 | revert 1회 | — |
| **PR-B** indexable 컬럼 | Phase 0-8 (마이그레이션 + 재집계 잡) | ✅ 읽는 곳 없음 | 컬럼 남겨도 무해 | — |
| **PR-C** 사이트맵 재구성 | Phase 1 전체 | ✅ | count 3줄 revert | PR-B(1-3이 `indexable` 읽음) |
| **PR-D** amenity 제거 | 2-1 + `next.config.mjs:31-35` destination 교체 | ✅ | 라우트 복원 필요(디렉터리 revert) | PR-C, B6 |
| **PR-E** urban park·parking | 2-2 | ✅ | 동일 | PR-C, B6, PR-A(0-6) |
| **PR-F** medical 제거 | 2-3 | ✅ | 동일 | PR-A(0-1,0-3,0-5), PR-C |
| **PR-G** childcare 제거 | 2-4 (`nearby-childcare.tsx` 이전 선행) | ✅ | 동일 | PR-A(0-4), PR-C |
| **PR-H** 충전소 실시간 기능 | B4 (`/api/charger-status` + ChargerCard) | ✅ 순수 추가 | revert 1회 | — |
| **PR-I** charger 제거 | 2-5 | ✅ | 동일 | PR-H |
| **PR-J** D2b 매물 | Phase 3 전체 | ✅ | 게이트 조건문 제거로 즉시 복구(라우트가 살아 있으므로 **가장 되돌리기 쉽다**) | PR-B, PR-C, B2 |

**공유 파일 충돌 지점 — PR-D~I가 동시에 손대는 곳:**

| 파일 | 손대는 PR | 처리 |
|---|---|---|
| `lib/amenity/infra.ts` | D(storeHref, market) · E(park·parking) · F(hospital·pharmacy) · G(childcare) · I(charger) | 최종적으로 `infraHref` 전 분기가 null이 되므로 **함수 삭제 + 호출부 9곳을 `href: null` 인라인**. 순차 편집(D→E→F→G→I) |
| `next.config.mjs` redirects | D · E · F · G · I | 순차. 룰 순서 주의 |
| `lib/seo/map-entity.ts` | D · E · F · G · I | §8 O8 결정 후 일괄 |
| `tests/lib/amenity-infra.test.ts` | 전부 | 마지막 PR에서 전 케이스 `toBeNull()` + "모든 href가 null" 단정 테스트 신규 |

---

## 4. 정보 손실 목록

### 4.1 손실 없음 — 근거 확실 (288,268개)

| 카테고리 | 수 | 근거 |
|---|---:|---|
| 편의점·카페 | 200,166 | 상세 `detailFields` = 업종 1개(`convenience.ts:138`, `cafe.ts:135`)인데 카드 배지가 같은 값(`:137` → `amenity-card.tsx:16`) |
| 마트 | 69,572 | `detailFields` '구분'이 `inferRowSummary` 그 자체(`mart.ts:176-178`). 업종 원문만 빠지며 '구분'이 상위 개념 |
| 공원 | 17,137 | `ParkInfo`(`park-info.tsx:11-22`) ⊆ `ParkCard`(`park-card.tsx:17-21`) |
| 전통시장 | 1,393 | `marketType` 원문 1줄만 — **0-7에서 카드에 추가하면 0** |

### 4.2 손실 있음 — 목록으로 옮겨야 하는 것

| 카테고리 | 수 | 카드에 이미 있는 것 | 사라지는 것 | **옮길 것** |
|---|---:|---|---|---|
| **병원** | 79,772 | 이름·종별·주소·전화·의사수·개원연도(`hospital-card.tsx:14-27`) | 요일별 진료시간·점심·일/공휴일(`hospital-tab-operation.tsx:37-59`), **응급실 주·야간 + 전용 전화**(`:63-87`), 주차(`:89-99`), 교통편(`:104-119`), 진료과목+과별 전문의(`hospital-tab-diagnosis.tsx:61`), 자격별 인력(`:28-32`), 특수클리닉·간호등급(`:90,110`), 병상 15종(`hospital-tab-facility.tsx:11-27`), 장비·식대가산(`:61,74`), 홈페이지(`hospital-hero.tsx:20`) | **① 응급실 운영 여부 ② 주차 가능/대수 ③ 진료과 수 ④ 일반병상 규모** (0-5). 사이트맵 게이트가 근거로 삼던 `depts.some(specialistCount>0)`(`sources.ts:230-234`)가 카드에 없다는 점이 ③의 근거 |
| **어린이집** | 25,151 | 이름·유형·휴지/재개·주소·정원·충원율(`childcare-card.tsx:26-33`) | 보육실 수/면적·놀이터·**CCTV**·교직원(`childcare-facility.tsx:5-9`), 직역별·근속연수(`childcare-staff.tsx:28,41`), 연령별 반/아동(`childcare-age-breakdown.tsx:29-64`), **연령별 대기자**(`childcare-wait-list.tsx:15`), 전화·팩스·홈페이지·대표자·인가일·**통학차량**·제공서비스(`childcare-info.tsx:10-21`) | **`waitCntTot`·`cctvCount`·`vehicleOp`·`emRoleTeacher`·`tel`** (0-4). 전부 Childcare 단일 테이블 컬럼(`schema.prisma:363,371,380,424,441`)이라 select 확장만으로 조인 없이 끝 |
| **주차장** | 17,747 | 구분·요금구분·장애인·이름·주소·면수·24시간(`urban-card.tsx:22-31`) | 요일별 운영시간(`parking-hours-table.tsx:13-24`), **기본요금·추가단위·1일권·월정기**(`lib/urban/parking-fees.ts:26-29`), 결제수단, 운영기관·전화·기준일자, 단속·급유·특기사항(`parking-extras.tsx:24-31`) | **기본요금 + 평일 운영시간** 요약 1줄 (0-6). 없으면 주차장 데이터 효용이 사실상 0 |
| **약국** | 25,760 | 이름·주소·전화·개설연도(`pharmacy-card.tsx:14-27`) | 종별·개설일 전체 날짜·우편번호 (+읍면동은 **미확인** — HIRA xlsx의 별도 컬럼이라 주소가 도로명이면 순증) | 종별 배지(선택). 손실 작음 |
| **충전소** | 101,703 | `급속 · N기`만(`charger.ts:105`). ⚠️ `UrbanCard`가 `raw as ParkingRaw`로 캐스팅(`urban-card.tsx:12`)해 **배지가 전부 안 뜬다** | **충전기 개별 실시간 상태**(`charger-status-table.tsx:61-99`) — 이 영역의 유일한 진짜 손실 | **B4 필수.** 전용 `ChargerCard` + 온디맨드 상태 조회 |
| **매물 (D2b)** | 250,599 | 이름·시군구·준공년도·평형대·세대수·최근가·12개월 건수(`property-list-card.tsx:37-98`). ⚠️ 매매 박스가 `saleCount12m>0` 가드(`:52`)라 **12개월 매매 0건은 매매가가 아예 안 뜬다** | 개별 실거래 행 표, 24개월 그래프, 평형별 비교, 동일층·층 프리미엄, 지도·지번주소, 주변 단지 비교 | **① 매매가 표시 복구** — `saleLastPrice`는 전체기간 최근가라 `PropertyListItem`에 이미 있다(`lib/property.ts:358`). **기준일 병기 필수**(전체기간 값과 "12개월 N건" 라벨이 한 카드에 섞이면 PR #272가 잡은 결함과 동형) ② 최근 거래 2~3건 접어 넣기 |

### 4.3 D2b의 진짜 손실 — 원안이 놓친 것

원안은 "임계 미달이면 대부분 빈 카드"라고 했으나 **거짓이다.** 게이트는 12개월인데 상세 산출물은 대부분 전체기간이다:

| 산출물 | 기간 필터 | 근거 |
|---|---|---|
| 거래표·유형별 건수 | **없음** | `lib/transaction.ts:470-497`, `:6-17` |
| 동일층 비교 | **없음** | `:301-339` |
| 층 프리미엄 | **없음** (`HAVING COUNT(*)>=10`) | `:372-396` |
| 평형별 최근가 | **없음** | `:187-193` |
| 월별 그래프 | **24개월** | `:62` |
| `tTrend` 발화 조건 | 전체기간 최근 매매 30건 | `lib/insights/apt.ts:33-34` ← `apt-loader.ts:39` |
| 12개월 게이트를 받는 것 | `getTransactionFlags`(`:429,442`), `changePct12m`·`jeonseRatioPct`·`gap12m`(`:243-255`) — **원안이 "빈 카드" 근거로 든 두 항목이 곧 예외** |

→ `saleCount12m<5`여도 **전체기간 거래가 두터운 단지는 지금 실제로 두꺼운 페이지**다. 계획 문서 자신의 수치로도 `txCountTotal≥30 = 32,242` vs `saleCount12m≥5 = 23,409`(`:157,172`)라 두 집합이 포개지지 않는다.
**착수 전 반드시 측정할 것: `saleCount12m < 5 AND txCountTotal >= 30`의 크기** (§7 M1b). 이것이 D2b의 실제 정보 손실 본체다.

### 4.4 도달 가능성 — "조회 기능화"의 한계 (정직하게)

| 카테고리 | 이름 검색 | 지역 해상도 | 페이지 크기 |
|---|---|---|---|
| 병원·약국 | **없음 → B1으로 추가** | 시군구 | 20 |
| 어린이집 | 있음(`lib/childcare.ts:57,70`) | 시군구 | — |
| amenity | 있음(`category.ts:33` → `_shared.ts:14-26`, `name`·`branchName`만, **주소 검색 불가**) | `?region=` | 30 |
| urban | 있음(`lib/urban/category.ts:27`) | `?region=`, 단 Parking·Park·EvCharger는 **`sigunguCode` 컬럼 자체가 없어** 주소 파싱 기반(`charger.ts:38`, `parking.ts:48`, `park.ts:38`) | 20 |
| 매물 | `/list?q=` 있음 — 단 `txCount12m>0` AND 조건이라 **거래 0건 단지는 이름을 정확히 쳐도 안 나온다** | 시군구 | 30 |

→ D1의 정당화 근거는 "사용자 조회로 대체된다"보다 **"편의점 1곳에 독립 문서를 발행할 제품상 이유가 없다"**(계획 `:123`)에 두는 편이 정확하다.

---

## 5. 리다이렉트 설계

**전부 308이다.** 문자 그대로 301이 필요하면 `permanent` 대신 `statusCode: 301`(둘은 동시 사용 불가). 구글은 동등 취급.

| 대상 | 타깃 | 홉 | 수단 |
|---|---|---|---|
| `/amenity/market/:id` | `/amenity/market` | 1 | 정적 룰 (`market.ts:146` bare 200) |
| `/amenity/:cat(convenience\|mart\|cafe)/:id` | `/amenity/:cat` | **B6 결정 후 1** | 정적 룰 |
| `/amenity/:cat/:sgg(\d{5})/:id` | `/amenity/:cat` | 1 | **기존 `next.config.mjs:31-35` 룰 destination 교체** (안 하면 308→308 2홉) |
| `/urban/charger/:id` | `/urban/charger` | 1 | 정적 룰 (`charger.ts:90` bare 200) |
| `/urban/:cat(park\|parking)/:id` | `/urban/:cat` | **B6 결정 후 1** | 정적 룰. ⚠️ **카테고리 화이트리스트 필수** — 안 걸면 charger까지 삼킨다(redirects가 파일시스템 라우팅보다 먼저·배열 순서대로 평가) |
| `/medical/hospital/:sgg(\d+)/:id(\d+)` | `/medical/hospital?region=:sgg` | 1 | 정적 룰. **`(\d{5})` 금지** — 심평원 코드 6자리 |
| `/medical/pharmacy/:sgg(\d+)/:id(\d+)` | `/medical/pharmacy?region=:sgg` | 1 | 동일 |
| `/childcare/:sgg(\d{5})/:id(\d+)` | `/childcare/:sgg` | 1 | 정적 룰. 유일하게 **자기참조 canonical**(`[sigunguCode]/page.tsx:38`)이라 시군구가 색인상으로도 보존된다 |
| 매물 `saleCount12m<5` **AND `txCount12m>0`** | `/list?type={slug}&region={sgg}` | 1 | 페이지 내 `permanentRedirect` (DB 상태라 정적 룰 불가) |
| 매물 **`txCount12m==0`** | §8 O2 — `/{slug}` 허브 308 또는 **410** | 1 | 동일 |

**명시할 단서 3가지**

1. **병원·약국의 "시군구 보존"은 UX 한정.** 두 목록의 canonical이 `/medical/hospital`로 하드코딩(`page.tsx:16-20`, 정적 metadata라 searchParams를 볼 수 없음)이라 색인상으로는 bare 한 장으로 접힌다. 방향 자체는 P1-3과 일치하므로 결함은 아니지만, "보존된다"고 적으면 거짓이다.
2. **`?sido=서울`을 타깃으로 박지 말 것.** 27만 건을 서울로 오도하고, 그 URL은 P1-4가 사이트맵에서 빼기로 한 URL이며, P1-3에서 비정본이 된다. 무관한 페이지로의 대량 리다이렉트는 soft 404 판정 위험(외부 동작이라 저장소로 검증 불가 — **미확인**).
3. **존재하지 않는 id도 308→200이 된다.** 패턴 룰로는 실재 여부를 판별할 수 없다. 크롤러는 기존 URL만 알므로 **의도적으로 수용**한다고 문서에 남긴다.

---

## 6. 위험과 완화

### 6.1 매물 게이트 플래핑 (최고 위험)

**메커니즘 (실측):**
- `saleCount12m`은 `NOW() - INTERVAL '12 months'` 롤링(`scripts/ingest/aggregator.ts:15`)
- `updatePropertyAggregates`는 **전달된 propertyIds만** 갱신(`:4`), 호출부는 `affectedPropertyIds`뿐(`runner.ts:213`)
- → 조용한 단지는 값이 **마지막 터치 시점에 고착**(stale-high). 오랜만에 거래 1건이 들어오면 12개월치가 한꺼번에 재평가되어 **계단식 급락**.
- 즉 플래핑은 "매일 조금씩"이 아니라 **"드물게 크게"** 일어난다 → 히스테리시스 폭 ±1로는 못 막는다.

| 완화 | 내용 |
|---|---|
| **M-1 (필수)** | **사전계산 `indexable` 컬럼**(B3). 사이트맵·페이지 robots·링크 공급 4곳이 **전부 이 컬럼만 읽는다**. 이것이 게이트 4 "차집합 0"의 해법이기도 하다 |
| **M-2 (필수)** | **야간 전량 재집계 잡.** 지금은 aggregate 전용 타임스탬프가 없어(`schema.prisma:59-66`에 `updatedAt`만) stale 정도조차 코드로 알 수 없다. 게이트가 load-bearing이 되므로 전량 재계산이 전제다 |
| **M-3** | **히스테리시스**: 진입 `saleCount12m >= 5`, 이탈 `< 3`, 최소 유지 90일(`indexableAt`). ETL이 컬럼을 쓸 때 적용 |
| **M-4** | ISR 캐시된 308의 무효화는 `runner.ts:218-226`(mode='daily', 그날 거래가 들어온 매물만)에 의존한다. 야간 잡이 `indexable`을 뒤집은 매물의 경로도 revalidate하도록 확장 |
| **M-5** | `PROPERTY_INDEXABLE`에 `redirectToId: null` 추가 — 현행 조건에 빠져 있어 그대로 복원하면 사이트맵에 308 체인이 들어간다 |

### 6.2 301(308) 폭증 — **부하 문제가 아니다. 순감이다**

| 근거 | 실측 |
|---|---|
| 제거 대상이 ISR 쓰기의 대부분 | `docs/vercel/cost-reduction-batch2-2026-07-14.md:29-36` — amenity 14K + charger 4.7K + childcare 3.6K + hospital 3K + pharmacy 1.1K = **26.4K / 전체 37.3K ≈ 71%**(12시간) |
| charger는 `revalidate=60` | 그 라우트 삭제가 ISR 쓰레싱의 주요 축 하나를 통째로 없앤다 |
| 정적 redirect 비용 | Next 라우터가 렌더·DB 이전에 경로 패턴만 보고 판정 |
| 배포 형태 | OCI 단일 박스 standalone(`next.config.mjs:6-7`) + CF 터널 — 함수 호출 과금 없음. 병목은 CPU인데 그 CPU를 지금 ISR 렌더가 먹고 있다 |

**예외 2가지 (진짜 비용):**
- **D2b 250,599개**는 정적 룰 불가 → 라우트 렌더 + `cachedPropertyById` 1회. 인덱스 조회라 싸지만 무료는 아니다. `generateMetadata` 조기 반환(3-3)이 이 비용의 대부분을 차지하므로 **반드시 함께**.
- **디스크.** 메모리 `project_oci_disk_fill`(2026-07-25 루트 45G 포화, 원인 중 하나가 web `.next` 무한 캐시). 다만 **현재 같은 25만 URL이 완성 HTML로 캐시되고 있으므로** 리다이렉트 엔트리로 바뀌면 순감. 그래도 배포 후 디스크 추이 관측 필요(2026-08-04 임계치 70/85 드롭인은 박스에만 존재).

### 6.3 충전소 실시간 조회

| 안 | 성립? | 비용 | 판정 |
|---|---|---|---|
| (a) 목록 20행 인라인 SSR (현행 헬퍼) | ❌ | `URBAN_PER_PAGE=20`(`_shared.ts:5`), 실시간이려면 목록 `revalidate`를 21,600(`urban/[category]/page.tsx:17`) → 60. 기본 목록 1회 전수 크롤만으로 전 statId를 한 번씩 때린다 | **채택 불가**. ⚠️ 단 "렌더당 20콜 × 필터 조합"은 과대 — `ev-status.ts:39`가 `next:{revalidate:60}`이라 비용은 **60초당 고유 statId 수**로 묶인다 |
| **(b) 온디맨드 프록시 + 모달** | ✅ | `/api/charger-status?statId=` 신설(`fetchChargerStatus` 그대로 재사용). 크롤러 비용 **0**(`app/robots.ts:12` `/api/` disallow), 호출은 사람 클릭 수에 비례 | **권장 — 오늘 가능** |
| (c) 상태 스냅샷 ETL + 인라인 SSR | ✅ (후속) | 벌크 리더가 **이미 있다** — `adapter-ev-charger.ts:5`가 동일 `getChargerInfo`를 `statId` 없이 `PAGE_SIZE=1000`으로 전국 페이징. `stat`·`lastTsdt`가 같은 응답에 실려 오는데 적재만 안 한다(`:23-67`). 전국 스윕 = 수백 콜 | 클릭 없이 보이고 크롤러에게도 보이므로 기능 보존도는 (b)보다 높다. 대가는 신선도 — 스케줄이 월 1회(`ingest-amenities.yml`)라 새 워크플로 필요, `http.ts` 페이지당 250ms sleep·429 백오프 감안하면 **10~30분 주기가 현실적**(미확인) |

**구현 주의**: `PUBLIC_DATA_KEY`는 `NEXT_PUBLIC_` 접두사가 없어 서버 전용(`lib/env.ts:9`) → 클라이언트 직접 호출 불가, 프록시 필수. `UrbanCard`는 `<article>` 전체를 `<Link>`로 감싼 서버 컴포넌트(`:9,17`)라 버튼을 그냥 넣으면 `<a>` 안의 `<button>`이 된다 — 카드 구조 변경 + `'use client'` 자식 신설.
**관측 공백**: `fetchChargerStatus`는 키 미설정·에러 시 조용히 `[]`(`ev-status.ts:30,40,58`) → 실패가 "미확인"으로만 보인다. 로깅 추가 권장.

### 6.4 그 외

| 위험 | 완화 |
|---|---|
| 사이트맵 총량 붕괴 | D1만 먼저 배포하면 76,655 → 약 7,700. **Phase 1(property 복원 + 병원·어린이집 0)을 한 PR로** |
| 샤드 번호 재배치 | `/sitemaps/9~13` 404. GSC에서 옛 샤드 제출분 수동 삭제. 반복 방지는 §8 O7 |
| **빌드 파괴** | `app/(public)/school/[sigunguCode]/[id]/page.tsx:7`이 삭제 대상 `childcare/[sigunguCode]/[id]/_components/nearby-childcare.tsx`를 import. **이전을 먼저 하지 않으면 school 상세 컴파일 실패** |
| lint 차단 | 위젯 href 전 항목 null → `components/ui/nearby-infra.tsx:3` `import Link` 미사용. typecheck는 못 잡고 ESLint `no-unused-vars=error`가 CI를 막는다(메모리 `feedback_lint_gate_before_done`). 목록 카드 6종 Link import도 동일 |
| CI 초록 ≠ 안전 | `ci.yml`에 `pnpm build`가 없다(메모리 `project_ci_gaps`). 라우트 6종 삭제는 import 고아를 대량 만든다 → **로컬 build 필수** |
| robots로 막고 싶은 유혹 | 제거 경로를 Disallow에 넣으면 크롤러가 308을 못 읽어 옛 URL이 URL-only로 잔류. `app/robots.ts:9-12`가 `/list`에 대해 정확히 같은 논리를 이미 적어 뒀다. **추가 조치 불필요가 정답** |
| 살아남는 페이지의 죽은 링크 | `components/ui/nearby-apartments.tsx:15`가 무조건 `/apt/${a.id}` 링크. 이 위젯을 **생존 페이지 2곳**(`school/[sigunguCode]/[id]/page.tsx:177`, `subscription/[id]/page.tsx:146`)이 쓴다 → 3-6 게이트 필수 |

---

## 7. 검증 계획

### 7.1 착수 전 측정 (읽기전용 psql — 메모리 `feedback_readonly_tunnel_qa`)

| # | 질의 | 무엇을 가른다 |
|---|---|---|
| M1 | `SELECT count(*) FROM "Property" WHERE "redirectToId" IS NULL AND "txCount12m"=0` | D2b 타깃 분기(§8 O2). **추정 ≈107,000, 상한 150,245 — 미확인** |
| M1b | `... WHERE "saleCount12m"<5 AND "txCountTotal">=30` | **D2b의 실제 정보 손실 본체** (§4.3) |
| M2 | `SELECT DISTINCT length("sigunguCode"), "sigunguCode" !~ '^[0-9]+$' FROM "Hospital"` (약국 동일) | 리다이렉트 패턴 `(\d+)` 안전성 |
| M3 | childcare 정규화로 rows 0이 된 옛 sigunguCode 수 | 리다이렉트 후 404 규모 |
| M4 | `saleLastAt` vs `updatedAt` 분포 | saleCount12m stale 정도 → 전량 재집계 1회 필요 여부 |
| M5 | charger 상태 응답이 비는 비율 | `charger-status-table.tsx:43-48` 분기 비중 → B4 규모 |

### 7.2 단계별 게이트

| 단계 | 검증 |
|---|---|
| 전 단계 공통 | `pnpm lint` → `pnpm typecheck` → `pnpm test` → **`pnpm build`**(CI에 없음) → `pnpm seed:e2e` 후 Playwright 전량(메모리 `feedback_run_e2e_on_ui_text_change` — 카드에서 '상세 →' 문구를 지우므로 생략 금지) |
| PR-A | `?q=` 로컬 대조. `?region=<실코드>` 착지에 실제 시군구명이 나오는지(`lib/hub-summary/prose.ts:26-27`의 `"{scopeLabel}에 등록된 병원·의원은 N곳입니다"`) |
| PR-C | 로컬 `/sitemap.xml`이 **9개** 샤드, `/sitemaps/9`~`13`이 404. 각 샤드에서 제거 대상 7개 라우트 패턴 **0건** |
| PR-D~I | 로컬 `pnpm build && pnpm start` 후 `curl -sI localhost:3000/<제거대상>` → **308 + Location이 200 라우트**. **홉 수 ≤ 1**. ⚠️ 운영 사이트 금지(메모리 `feedback_no_prod_traffic_burst`) |
| PR-D~I | 착지 페이지 초기 HTML에서 `<a href>` 추출 → **제거 대상 패턴 매칭 0건** (자기참조 루프 회귀 가드) |
| PR-J | 표본 100개: 308 → 최종 200 **AND 착지 1화면 안에 원래 엔티티가 보이는가**. txCount12m=0 표본은 §8 O2 결정대로 |
| 배포 후 | GSC로만 확인. 옛 샤드 제출분 삭제. 박스 디스크 추이 |

### 7.3 신규 테스트 3종

1. `buildInfraCategories`가 만드는 **모든 카테고리의 모든 `item.href`가 null** — 누가 링크를 되살리면 즉시 잡힌다
2. `next.config.mjs` 리다이렉트 룰의 각 destination이 **200 라우트**이고 다시 리다이렉트되지 않는지
3. 사이트맵 `PROPERTY_INDEXABLE` ⊆ 페이지 색인 조건 (`tests/lib/sitemap-indexable.test.ts`에 property 케이스 추가 — 3-5 적용 후 자명하게 성립)

### 7.4 깨지는 테스트 (전수)

| 종류 | 파일 | 조치 |
|---|---|---|
| **하드 import 에러** | `tests/components/childcare-staff-ssr.test.ts:5`, `tests/components/hospital-tabs-ssr.test.ts:5`, `tests/components/facility-title-metadata.test.ts:4-5` | 앞 둘 삭제, 셋째는 해당 케이스만 제거 |
| e2e 삭제 | `tests/e2e/urban-parking-detail.spec.ts`(전체), `urban-parking-mobile.spec.ts:14-20` | |
| e2e 반전 | `urban-parking-list.spec.ts:13-16`, `amenity-mart.spec.ts:10-21`, `childcare.spec.ts:30-40` | "카드가 링크가 아니다"로 |
| 단정 실패 | `tests/lib/amenity-infra.test.ts:144-145,158-160,221-246` | 전부 `toBeNull()` |
| 의미 소실(통과는 함) | `tests/lib/sitemap-indexable.test.ts:7-29`(childcare·hospital), `tests/lib/guide-page-category.test.ts:7-9` | 무력화 주석 또는 property 케이스로 교체 |
| **안 깨짐(확인)** | `tests/lib/sitemap-manifest.test.ts`(합성 count), `tests/lib/json-ld.test.ts`(문자열 입력), `tests/e2e/life-menu.spec.ts`(목록까지만), `.github/workflows/warm-hub-cache.yml`(목록만 워밍), `tests/e2e/apt-detail.spec.ts`·`subway.spec.ts`·`officetel-villa-infra.spec.ts`(시드 매물은 `seed-e2e.ts:202-273`에서 SALE 12건 → `saleCount12m=12`) | 조치 불필요 |
| ⚠️ 시드 주의 | `seed-e2e.ts:233-242` '테스트아파트1~30'은 `txCount12m=1`만 직접 세팅하고 Transaction이 없어 `saleCount12m=0` | 3-7(비클릭)이면 `list.spec.ts:53` 통과. 목록 자체를 필터하는 선택이면 `list.spec.ts:56-66`이 깨진다 |

---

## 8. 운영자 판단이 필요한 지점

| # | 결정 | 선택지 | 막고 있는 것 | 권고 |
|---|---|---|---|---|
| **O1** | bare 목록 307 처리 | ① `?sido=서울`을 타깃에 박는다(오도, P1-3/P1-4와 충돌) ② `requiresSidoScope`를 걷어 bare를 200 실렌더로(전국 스캔 성능 **미확인** — 로컬 DB가 비어 측정 불가) ③ bare를 **시도 선택 랜딩**으로(200, 자기참조 canonical, DB 스캔 0) ④ 2홉 감수 | PR-D·PR-E | **③** — 스캔 없이 1홉·정본 착지를 동시에 얻는다 |
| **O2** | `txCount12m==0` 매물(≈107,000, 상한 150,245) | ① `/{slug}` 허브로 308(빈 목록은 아니지만 25만을 3개 허브로 몰아 soft 404 위험) ② **410 Gone**(승계할 콘텐츠가 실제로 없으므로 가장 정직, D2b 근거와 정합) ③ `/list` 기본 필터를 열어 목록에 노출(D1이 줄이려는 표면을 목록 안으로 되가져옴) | PR-J | **②**. 결정문이 "410 아님"이었으므로 **뒤집는 결정이다** — 근거: `/list`가 구조적으로 못 보여주는 대상에 대한 301은 "축소"가 아니라 "빈 페이지로 보내기"다 |
| **O3** | 충전소 | (b) 온디맨드 프록시 즉시 / (c) 스냅샷 ETL 후속 / 둘 다 | PR-H·PR-I | **(b) 먼저 배포, (c)는 신선도 요구 확인 후.** (b)의 API 라우트를 그대로 두고 나중에 (c)를 얹을 수 있다 |
| **O4** | 병원·약국 canonical | ① 현행(bare 고정) 유지 → 시군구는 색인상 미보존 ② `generateMetadata`로 전환 → region 인지 canonical(목록 URL 양산, P1-3과 충돌) | PR-F | **①**. "시군구 보존은 UX 한정"을 문서에 명시 |
| **O5** | 목록 카드 보강 범위 | 4.2 표의 "옮길 것" 전부 / 일부 / 없음 | Phase 0 | **전부.** 없으면 "조회 기능화"가 문서 수준에서 거짓 |
| **O6** | D7 — 검색 유입 손실 상한 | 수치 | 최종 승인 | **B7(GSC) 없이는 판단 불가.** 현재는 "상세가 이미 noindex(charger·parking `robotsFor(false)`, amenity `robotsFor(false)`, pharmacy `index:false`)라 유입 0에 가깝다"는 **추론**뿐 |
| **O7** | 샤드 id 안정화 | property를 `SOURCE_ORDER` 끝으로 이동(1회 재번호, 이후 안정) / 현행 유지(count 변동마다 뒤 샤드 재배치) | PR-C | **이동.** 어차피 이번에 재번호가 일어난다 |
| **O8** | `/map/{kind}/{id}` 고아 표면 | 유지 / `MAP_ENTITY_TABLES`(`lib/seo/map-entity.ts:7-18`)에서 8개 kind 제거(→ `route.ts:18`이 404) | PR-D~I 공통 | **제거.** HTML이 아니라 심사 분모에 드는지는 **미확인**이지만 크롤 예산은 쓰고, 비용 0으로 닫힌다. `tests/lib/map-entity.test.ts:6` 동반 수정 |
| **O9** | 어댑터 인터페이스 정리 | `AmenityCategoryDef`에서 `getById`/`getLatLng` 제거(4 어댑터 + 4 테스트 연쇄) / 호출처 없는 채로 존치 | PR-D | 제거가 CLAUDE.md §3에 맞으나, PR #274가 세운 업종 게이트 회귀 테스트가 함께 사라진다 — **트레이드오프 판단 필요** |
| **O10** | 위젯 미러 밀도 | 현행(fetch 96행/DOM 50행) / `INFRA_FETCH_LIMIT` 12→5(`lib/amenity/infra.ts:8`) / **집계만**(항목명 제거, "편의점 8곳 · 최근접 120m") | PR-D 이후 | **집계만이 정책상 가장 안전**(원출처 문자열 0). 단 `NearbyInfra`가 `'use client'`(`:1`)라 prop 전량이 RSC 페이로드로 HTML 바이트에 직렬화될 개연성이 있어(**미확인**) `DISPLAY_CAP` 조정은 무효일 수 있다 → `INFRA_FETCH_LIMIT` 축소나 집계화만 실효 |

---

## 9. 정직하게 남는 미확인

| 미확인 | 해소 방법 |
|---|---|
| `txCount12m==0` 매물의 정확한 수 (추정 ≈107,000 / 상한 150,245) | M1 |
| `saleCount12m<5 AND txCountTotal>=30`의 크기 — **D2b 정보 손실의 본체** | M1b |
| 실제 유입 손실 규모 | B7(GSC). 저장소 코드로는 판정 불가 |
| Next 15가 ISR 라우트의 `permanentRedirect` 결과를 full route cache에 저장하는지 | PR #274 선례(`amenity/[category]/[id]/page.tsx:40-42,76` — 같은 `revalidate`·`generateStaticParams` 조합)가 강한 방증이나 계측하지 않았다. **25만 규모로 켜기 전 프리뷰에서 같은 URL 2회 요청 시 두 번째가 DB를 안 치는지 실측 권장** |
| `bare 200화`(O1-②)의 전국 스캔 성능 | 로컬 DB가 e2e 시드뿐이라 측정 불가 |
| 충전소 스냅샷 ETL의 현실적 주기 | `http.ts` 250ms/page + 429 백오프 + 대용량 응답 타임아웃(`adapter-ev-charger.ts:6` 주석) → 10~30분 추정 |
| `/map/{kind}/{id}` 이미지 200이 심사 분모에 계상되는지 | 계획 §1의 ≈162만은 HTML만 센 수치 |
| 약국 `eupmyeondong`이 주소 문자열에 포함되는지 | HIRA xlsx의 **별도 컬럼**(`adapter-pharmacy.ts:27` vs `:29`)이라 도로명주소면 순증 |
| Cloudflare 터널이 쿼리스트링 URL을 캐시하는지 | 캐시되면 301 착지점 부하 대부분 해소 |
| "축소 → 승인"의 인과 | 계획 §8이 미확정으로 남긴 그대로. 축소의 근거는 **"광고를 실을 수 없는 화면을 공개 표면에서 줄인다"**(정책 원문 직결)에 둘 것 |

---

## 10. 최종 표면 확인

| | URL |
|---|---:|
| PR #274 후 기준선 | 830,885 |
| − amenity 4종 | 271,131 |
| − medical 2종 | 105,532 |
| − childcare | 25,151 |
| − urban park·parking | 34,884 |
| − urban charger | 101,703 |
| − 매물 임계 미달 | 250,599 |
| **= 최종** | **41,885** (매물 23,409 · 학교 12,566 · 청약 5,910) |

사이트맵: 76,655(부동산 0%) → **≈31,077(부동산 94.3%)**.

> ⚠️ 계획 문서 `:326`이 이미 적었듯 **이것만으로 승인되지 않는다.** 4.2만도 승인 사례 규모(수십~수백)보다 2~3자릿수 크고, 축소 후에도 자동 조립 표면 비율은 99.8%로 거의 변하지 않는다(원본 76편 / 41,885). 축소는 **사람이 쓴 레이어가 보이게 만드는 조건**이지 답이 아니다 — P2-3(사람 작성 지역 분석)이 진짜 레버다.