# 생활편의 상세 메타 타이틀 — 시설별 변별 키워드 삽입

**작성일:** 2026-07-30
**상태:** 설계 승인됨

## 문제

생활편의 상세 페이지의 검색결과 제목이 시설을 구분해주지 못한다. 실측(구글 SERP)에서 확인된 현재 형태:

```
연세무척나은병원 (광진구) — 병원 정보·주변 아파트
강남힐병원 (관악구) — 병원 정보·주변 아파트
연세대학교 의과대학 용인세브란스병원 (용인시) — 종합병원 …
```

두 가지가 겹쳐 있다.

1. **`정보·주변 아파트`(9자)가 모든 상세에 동일하게 들어간다.** 변별 가치가 0인데 제목 예산의 3분의 1을 쓴다.
2. **가시 예산이 좁다.** 실제 `<title>`은 루트 `template: '%s | 임장ON'`이 붙은 형태이고, 구글은 `| 임장ON`을 떼고 사이트명을 위 줄로 옮긴다. 한글 가시 구간은 대략 30~33자다. 위 3번째 결과는 이미 잘렸다.

따라서 키워드를 **뒤에 덧붙이면 잘려서 보이지 않는다.** 공통 문구를 걷어내 자리를 만들고 그 자리에 시설별 변별 키워드를 넣는다.

## 범위

상세 페이지의 `generateMetadata`가 만드는 `title` 문자열만 바꾼다. 목록·허브·홈은 대상이 아니다.

`description`, `robots`, `alternates.canonical`은 **전부 무변경**이다. `주변 아파트` 키워드는 description에 그대로 남긴다(제목에서는 변별력이 없지만 스니펫에서는 사이트 정체성을 지탱한다).

색인 정책도 이 작업에서 건드리지 않는다.

## 색인 현실 — 기대효과 구분

`lib/seo/indexable.ts`의 `robotsFor()` 기준 현재 상세 색인 상태:

| 색인됨 (제목 변경이 SERP에 반영) | noindex (반영 안 됨) |
|---|---|
| 병원·의원, 학교, 어린이집 — narrative 3개 이상 발화 시 | 약국 — `index:false` 하드코딩 |
| 공원 — narrative 2개 이상 | 편의점·마트·카페·전통시장 — `robotsFor(false)` |
| | 주차장·충전소 — `robotsFor(false)` |

thin-content 대응으로 의도적으로 막아둔 상태다. 즉 **당장 검색결과가 바뀌는 것은 병원·학교·어린이집·공원 4종**이고, 나머지 5종은 색인을 열 때를 대비한 선반영이다. 제목 조립 지점이 좁아 9종 전부 처리해도 비용 차이가 거의 없어 전부 적용한다.

## 제목 패턴

통일 패턴: **`{이름} ({지역}) — {변별 키워드} {시설명}`**

키워드 데이터가 없으면 키워드만 빠지고 기존 시설명으로 폴백한다. 일부 카테고리는 키워드가 시설명을 흡수한다(`근린공원`, `슈퍼마켓`).

| 카테고리 | 키워드 소스 | 결과 예시 |
|---|---|---|
| 병원·의원 | `HospitalDept.deptName` 상위 2개 (전문의 수 내림차순) | `연세무척나은병원 (광진구) — 정형외과·신경과 병원` |
| 학교 | `foundType` + `coeduType`(남/여만) | `○○중학교 (광진구) — 공립 중학교`<br>`○○여자고등학교 (광진구) — 사립 여자 고등학교` |
| 어린이집 | **현행 유지 — 변경 없음** | `○○어린이집 (광진구) — 국공립 어린이집 정원 99명` |
| 공원 | `Park.parkType` (시설명 흡수) | `어린이대공원 (광진구) — 근린공원` |
| 주차장 | `chargeInfo`(무료/유료) + `prkplceSe`(공영/민영) | `○○주차장 (광진구) — 무료 공영주차장` |
| 충전소 | `EvCharger.chargeSpeed`(급속/완속) | `○○충전소 (광진구) — 급속 충전소` |
| 전통시장 | `TraditionalMarket.marketType` | `자양전통시장 (광진구) — 상설 전통시장` |
| 마트 | `Store.industryName` (시설명 흡수) | `○○마트 (광진구) — 슈퍼마켓` |
| 편의점·카페 | **없음 — 공통 문구만 제거** | `GS25 자양점 (광진구) — 편의점` |
| 약국 | `eupmyeondong` | `○○약국 (광진구) — 자양동 약국` |

### 카테고리별 선택 근거

- **병원**: "광진구 정형외과" 형태가 실검색 의도의 중심이다. 전문의 수 내림차순 정렬 로직이 `lib/insights/hospital-loader.ts:46`(`topDeptNames`)에 이미 있어 같은 규칙을 재사용한다.
- **학교**: `foundType`·`coeduType`은 지금 description에만 있다. 제목으로 승격한다. `남녀공학`은 다수라 변별력이 낮고 길이만 먹으므로 생략하고, `남`·`여`만 `남자`·`여자`로 표기한다.
- **어린이집**: 이미 `crType` + 정원이 제목에 있고 공통 문구가 없다. 손대지 않는다.
- **주차장**: "무료 주차장"이 가장 강한 검색 의도다. `chargeInfo`가 무료/유료 컬럼이다(`parkingchrgeInfo` 매핑, `lib/urban/adapters/parking.ts:30`의 무료/유료 필터가 쓰는 컬럼). `feedingSe`는 급지구분이므로 쓰지 않는다.
- **전통시장**: `classifyMarketSub()`가 이미 `marketType`에서 상설/정기를 판별한다.
- **편의점·카페**: `Store.industryName`이 `편의점`, `커피전문점` 형태로 라벨과 동어반복이다. 짜낼 소재가 없어 공통 문구만 걷어내고 짧게 둔다. 없는 변별력을 만들어내지 않는다.
- **약국**: `Pharmacy` 모델에 영업시간·심야·공휴일 컬럼이 없어 "심야약국" 같은 실검색어를 만들 소재가 없다. `eupmyeondong`이 유일한 변별 축이다. 색인도 막혀 있어 실익이 가장 낮은 칸이다.

## 구조

키워드 도출을 **DB를 타지 않는 순수 함수**로 분리한다. 각 `generateMetadata`는 이미 상세 row를 로드해둔 상태라 그 row만 넘기면 된다.

신규 모듈 `lib/seo/facility-descriptor.ts`:

```ts
hospitalDescriptor(depts, typeName)                  → '정형외과·신경과 병원'
schoolDescriptor(foundType, coeduType, schoolKind)   → '공립 중학교'
pharmacyDescriptor(eupmyeondong)                     → '자양동 약국'
amenityDescriptor(slug, item, label)                 → '상설 전통시장' | '슈퍼마켓' | '편의점'
urbanParkDescriptor(parkType)                        → '근린공원'
urbanParkingDescriptor(chargeInfo, prkplceSe)        → '무료 공영주차장'
urbanChargerDescriptor(chargeSpeed)                  → '급속 충전소'
```

**모든 함수는 항상 문자열을 반환한다.** 데이터가 없으면 기존 라벨(`'병원'`, `'공원'`, `'주차장'`)로 폴백해 호출부에 null 분기를 만들지 않는다.

`amenityDescriptor`는 호출 지점이 `app/(public)/amenity/[category]/[id]/page.tsx` 하나뿐이므로 4종을 `slug`로 분기하는 단일 함수로 둔다. urban은 `generateMetadata`의 park 분기와 일반 분기가 이미 갈라져 있고 `item.raw`가 카테고리마다 다른 타입이라 카테고리별로 나눈다.

`qualifiedTitle()`은 손대지 않는다. 제목 조립 단일 지점 규칙이 유지된다.

### 호출부 변경

각 파일에서 한 줄씩 바뀐다.

```ts
// 기존
title: qualifiedTitle(hospital.name, locality, `— ${hospital.typeName} 정보·주변 아파트`),
// 변경
title: qualifiedTitle(hospital.name, locality, `— ${hospitalDescriptor(hospital.depts, hospital.typeName)}`),
```

수정 대상 파일:

| 파일 | 비고 |
|---|---|
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | `hospital.depts`가 `cachedHospitalById`에 이미 포함돼 있다(FAQ 빌더가 사용 중) |
| `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` | |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | |
| `app/(public)/amenity/[category]/[id]/page.tsx` | 4종 공용 |
| `app/(public)/urban/[category]/[id]/page.tsx` | park 분기 + 일반 분기 2곳. `item.raw`는 `unknown`이라 페이지 본문(`:90`)과 동일하게 `as ParkRaw` / `as ParkingRaw`로 좁힌다 |

`app/(public)/childcare/[sigunguCode]/[id]/page.tsx`는 대상이 아니다.

## 폴백·길이 규칙

- **병원 진료과목**: `specialistCount > 0`인 과만 후보로 두고 내림차순 상위 2개. 전문의 배치 과가 없으면 전체 과목에서 2개. 과목이 0개면 `typeName`만. **두 과목 결합 길이가 10자를 넘으면 1개만** 쓴다(`소아청소년과·영상의학과` 같은 11자 조합 방어).
- **학교**: `foundType`이 없으면 `schoolKind`만. `schoolKind`도 없으면 `'학교'`.
- **주차장**: `chargeInfo`만 있으면 `무료 주차장`, `prkplceSe`만 있으면 `공영주차장`, 둘 다 없으면 `주차장`.
- **전통시장**: `marketType`에 `상설` 포함 → `상설 전통시장`, `정기` 또는 `일장` 포함 → `정기 전통시장`, 그 외 → `전통시장`.
- **마트**: `industryName`이 있으면 그대로, 없으면 `마트`.
- **약국**: `eupmyeondong`이 없으면 `약국`.
- 가시 예산 초과에 대한 별도 절단 로직은 넣지 않는다. 키워드를 8자 이하로 통제하고 있고, 이름 자체가 예산을 넘기는 경우(`연세대학교 의과대학 용인세브란스병원`)는 어떤 안을 써도 잘린다. 구글의 절단에 맡긴다.

## 부수효과

Next는 `openGraph.title`이 없으면 `title`을 물려준다. 카카오톡·슬랙 공유 카드 제목도 같이 바뀐다. 의도한 방향과 같아 별도 처리하지 않는다.

## 검증

`tests/lib/facility-descriptor.test.ts` 신규 — DB 불필요, 순수 입출력. 케이스:

- 정상 경로: 카테고리별 대표 입력 1건씩
- 데이터 null: 각 함수의 폴백 라벨 반환
- 병원 진료과목 0개 → `typeName`만
- 병원 전문의 배치 과 없음 → 전체 과목에서 2개
- 병원 결합 10자 초과 → 1개만
- 학교 `남녀공학` 생략, `남`/`여` → `남자`/`여자`
- 주차장 `chargeInfo`/`prkplceSe` 부분 결측 3케이스
- 전통시장 상설/정기/미분류

기존 `tests/lib/seo-title.test.ts`는 `qualifiedTitle`이 tail을 임의 문자열로 받는다는 것이 요지이므로 기대 문자열에 `정보·주변 아파트`가 남아 있어도 **수정하지 않는다.**

완료 게이트: `pnpm lint` + `pnpm test` 통과.
