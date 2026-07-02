# 카테고리 인사이트 롤아웃 — 공원(Park) 설계

**작성일**: 2026-07-02
**근거**: 카테고리 인사이트 프레임워크(#181) 재사용 + 병원 롤아웃(#182) 패턴 + #180(공원 referenceDate)
**대상**: 공원 상세(`app/(public)/urban/[category]/[id]/page.tsx`의 park 분기)에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex 도입.

---

## 1. 배경 · 목표

프레임워크(공유 A/C·`provenanceNodes`·`InsightSection`·로더 패턴)는 어린이집·병원 롤아웃으로 검증됨. 이 스펙은 **프레임워크를 공원에 적용**한다(세 번째 카테고리). **린 전략** 유지: 벤치마크/밀도 사전집계 없음. 공원 자체 데이터(면적·유형)의 파생 판단 + 공유 접근성/시세맥락.

공원은 병원처럼 엔티티가 풍부하지 않지만(엔티티 신호는 `area`·`parkType` 둘), **약국과 결정적으로 다르다**: 공원의 규모·접근성 자체가 주거 가치의 본질이므로 "면적 5.2만㎡의 근린공원" 같은 판단이 **원문으로 성립**한다(재서술 아님). 실측상 면적 커버리지 99.9%(17,123/17,137), 위치 100%라 `intro`는 거의 모든 공원에서 발화한다.

### 성공 기준
- [ ] 공원 상세 `view-source`에 "한눈에 보기" 프로즈 + 프로버넌스 JSON-LD(출처=행정안전부)가 JS 없이.
- [ ] 각 문장에 파생 판단(면적 규모·유형·접근성·시세) — 표 재서술 아님.
- [ ] 데이터 부족 공원(면적·유형 없음 또는 주변 데이터 전무)은 프로즈 없음 + `noindex, follow`.
- [ ] parking·charger 등 다른 urban 카테고리 무회귀. 아파트·어린이집·병원 무회귀.

### 비협상 원칙
표 재서술 금지(파생만) · synonym spinning 금지 · 데이터 부족 시 침묵+noindex · 프로즈와 JSON-LD 병행 · 표시값 일치.

---

## 2. 현재 상태 (실측)

| 요소 | 상태 | 위치 |
|---|---|---|
| 공원 상세 | ✅ RSC, `revalidate=86_400`, 공유 라우트의 park 분기 | `app/(public)/urban/[category]/[id]/page.tsx` |
| 데이터 | ✅ `name`·`parkType`·`area`·`location`. 진료과·인력 같은 리치 데이터 없음 | `getUrbanById('park', id)` → `UrbanItem<ParkRaw>` (`@/lib/urban/detail`, adapter `lib/urban/adapters/park.ts`) |
| nearby fetch | ✅ `getNearbyApartments`·`getNearbyInfra(coord,{excludeParkId, includeChildcare:true})`·`getNearbySubwayStations` — 이미 페이지에서 호출 | page.tsx |
| JSON-LD | ❌ **전무**(placeSchema·breadcrumb·프로버넌스 모두 없음) | page.tsx |
| generateMetadata | ✅ title/description/canonical (robots 없음) | page.tsx |
| 출처 레지스트리 | ✅ `mois-park` → 행정안전부 전국도시공원표준데이터 | `lib/data-sources.ts` |
| **소스 기준일** | ⚠️ `Park.referenceDate` 없음. #180(`feat/park-reference-date`)이 추가 → **이 브랜치에 병합 필요** | schema `Park` |
| 프레임워크 | ✅ `lib/insights/shared.ts`(accessInsight·priceContextInsight·assembleNarrative)·`provenanceNodes`·`InsightSection` | 재사용 |

**면적 분포**(실측 17,137곳): `<1만㎡` 12,705(74%) · `1만–10만㎡` 3,594(21%) · `≥10만㎡` 824(5%) · `없음` 14.
**유형 분포**: 어린이공원 8,644 · 근린공원 3,736 · 소공원 2,881 · 기타 531 · 문화 464 · 수변 383 · 체육 247 · 역사 179 등.

---

## 3. 아키텍처 (프레임워크 재사용)

신규는 공원 엔티티 모듈 + 로더 + 페이지 배선뿐.

```
[재사용] shared.accessInsight(A)·priceContextInsight(C)·assembleNarrative · provenanceNodes · InsightSection

[신규] lib/insights/park.ts        — buildParkNarrative(input) → Narrative | null
[신규] lib/insights/park-loader.ts — 캐시 로더(park 전용 nearby 옵션) + referenceDate
[수정] json-ld.tsx                 — PlaceType에 'Park' 추가(1줄)
[수정] urban/[category]/[id] 페이지 — park 분기에서만 robots·description·프로즈·JSON-LD 배선
[병합] #180                        — Park.referenceDate (마이그레이션 포함)
```

**공원 전용 nearby 캐시 래퍼**: park 페이지의 infra fetch는 `getNearbyInfra(lat,lng,{excludeParkId, includeChildcare:true})`. `excludeParkId`가 엔티티마다 달라 단순 `cache((lat,lng)=>…)`로는 dedupe가 어긋난다 → 로더는 `cachedNearbyInfraPark = cache((lat,lng,excludeParkId:bigint)=>getNearbyInfra(lat,lng,{excludeParkId, includeChildcare:true}))`로 감싼다(병원 loader와 동일 패턴). Apartments/Subway는 인자 동일하므로 공통 캐시.

**공유 라우트 주의**: `urban/[category]/[id]/page.tsx`는 park·parking을 공용한다. **인사이트 로드·프로즈·JSON-LD·robots는 `def.slug === 'park'`일 때만** 실행. 다른 카테고리는 기존 동작 그대로(무회귀).

---

## 4. 공원 엔티티 모듈 — `lib/insights/park.ts`

### 입력 타입
```ts
export interface ParkInsightInput {
  name: string;
  parkType: string | null;
  area: number | null;                    // ㎡
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}
```

### 모듈 (자연 순서)
| key | 파생 판단(예) | 가드 |
|---|---|---|
| `intro` ★ | 면적 규모 + 유형: "면적 5.2만㎡의 근린공원입니다." / "면적 1,850㎡의 소규모 어린이공원입니다." / "소공원입니다." | area>0 또는 parkType |
| `access` | 공유 A (최근접 역 도보분 + 반경 인프라) | — |
| `price` | 공유 C (도보권 아파트 실거래 range) | — |

`buildParkNarrative` → `assembleNarrative(name, mods, { minFired: 2, requireKeys: ['intro'] })`.

**`intro` 파생 규칙**
- **면적 표기**: `area >= 10000` → `(area/10000)` 소수1자리 + `만㎡`(예: `5.2만㎡`; 정수면 `5만㎡`), `area < 10000` → `area.toLocaleString('ko-KR') + '㎡'`(예: `1,850㎡`), `area` 없음 → 면적 문구 생략.
- **규모 구간** (실측 분포 기반):
  - `area >= 100000`(10만㎡+) → 규모 수식 `대규모` (예: "면적 12.5만㎡의 대규모 근린공원입니다.")
  - `10000 <= area < 100000` → 수식 없음 (유형 그대로, 예: "면적 3.2만㎡의 근린공원입니다.")
  - `area < 10000` → 규모 수식 `소규모` (예: "면적 1,850㎡의 소규모 어린이공원입니다.")
- **유형**: `parkType` 그대로 사용. 없으면 일반명사 `도시공원`으로 대체.
- **조합 문장 규칙**:
  - area 있음 + 규모 수식 있음: `면적 {면적표기}의 {규모}{유형}입니다.`
  - area 있음 + 규모 수식 없음: `면적 {면적표기}의 {유형}입니다.`
  - area 없음 + parkType 있음: `{유형}입니다.`
  - area 없음 + parkType 없음: `intro` 미발화(null 반환) → requireKeys 미충족 → noindex.
- **주의**: 첫 문장은 `assembleNarrative`가 `{name}은/는 ` prefix를 붙인다(예: "○○근린공원은 면적 5.2만㎡의 근린공원입니다."). intro text는 name을 포함하지 않는다.

**게이트 논리**: 엔티티 신호가 `intro` 하나뿐이라 `minFired: 2`. **intro + (access 또는 price) 최소 2개** 발화해야 index. area·parkType 다 없거나(14곳), 좌표 없어 access·price가 모두 null인 외딴 공원은 narrative null → noindex.

**금지**: 뜻 같은 문구 로테이션. 면적을 단순 나열만 하는 문장(규모 파생 없이).

---

## 5. 출처 · dateModified

- `provenanceNodes({ url, name, sourceId: 'mois-park', entityId: `${url}#park`, dateModified })` — 출처=행정안전부(전국도시공원표준데이터).
- `dateModified`: `Park.referenceDate`(Prisma `@db.Date`, UTC 자정 저장)가 있으면 반환된 Date의 `toISOString().slice(0,10)` → `YYYY-MM-DD`(가짜 신선도 금지 원칙 — `updatedAt` 사용 안 함). **null이면 생략**(provenanceNodes가 undefined일 때 필드 생략, 병원과 동일). §6 로더 규칙과 동일.
  - #180 ingest 재실행 전엔 prod에서 null → 초기엔 생략, 파이프라인 완료 후 자동 표시(코드는 정확).
- `placeSchema({ type: 'Park', name, address, lat, lng, url, image, id: `${url}#park`, mainEntityOfPageId: `${url}#webpage` })`.
- `breadcrumbSchema` — 기존 nav 반영: 홈 › 생활편의(`/life`) › 도시인프라(`/life/urban`) › 공원(`/urban/park`) › (지역) › 이름.

`PlaceType` 유니온에 `'Park'` 추가(Schema.org `Park`, CivicStructure 하위, 유효).

---

## 6. 로더 + 페이지 배선

### 로더 `lib/insights/park-loader.ts`
```ts
import { cache } from 'react';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildParkNarrative } from './park';
import type { Narrative } from './shared';

export const cachedParkById = cache((id: bigint) => getUrbanById('park', id));
export const cachedParkLatLng = cache((id: bigint) => getUrbanLatLng('park', id));
export const cachedNearbyAptsPark = cache(getNearbyApartments);
export const cachedNearbyInfraPark = cache((lat: number, lng: number, excludeParkId: bigint) =>
  getNearbyInfra(lat, lng, { excludeParkId, includeChildcare: true }));
export const cachedNearbySubwayPark = cache(getNearbySubwayStations);

export const loadParkInsight = cache(async (id: bigint): Promise<{ narrative: Narrative | null; dateModified?: string }> => {
  // park + coord → nearby(apts/infra/subway) → buildParkNarrative
  // dateModified = park.raw.referenceDate ? Date.UTC 앵커 YYYY-MM-DD : undefined
});
```
- `nearbyAptSaleManwon` = apts의 매매 최근 실거래(만원) 필터(병원·어린이집 로더와 동일 산출).
- `infra`는 `getNearbyInfra` 결과의 `{label,count}` 매핑.
- `referenceDate`(Prisma `@db.Date` → UTC 날짜부): `new Date(Date.UTC(y,m,d))`가 아니라, Prisma가 반환한 Date의 `toISOString().slice(0,10)` 사용(병원 dateModified 배선과 동일 규칙 — `@db.Date`는 UTC 자정으로 저장됨).

### 페이지 (`urban/[category]/[id]/page.tsx`, park 분기 한정)
- `generateMetadata`: `def.slug === 'park'`일 때 `loadParkInsight(BigInt(id))` → `robots: narrative && narrative.fired.length >= 2 ? index : noindex`, `description = narrative?.text.slice(0,150) ?? 기존 폴백`. 다른 카테고리는 기존 그대로.
- 본문: `def.slug === 'park'`일 때 nearby fetch를 park 캐시 래퍼로 교체(generateMetadata와 dedupe), `const { narrative, dateModified } = await loadParkInsight(itemId)`.
- JSON-LD: park일 때 `<JsonLd data={[ placeSchema({type:'Park', …, id, mainEntityOfPageId}), breadcrumbSchema([...]), ...provenanceNodes({ sourceId:'mois-park', entityId, dateModified }) ]} />` 추가. (기존 페이지엔 JsonLd 자체가 없으므로 신규 삽입, park 분기 한정.)
- `<ParkInfo>` 아래(또는 UrbanHero 아래) `{narrative && <InsightSection sentences={narrative.sentences} />}`.

---

## 7. 테스트
- **유닛** `tests/lib/insights-park.test.ts`: `park.ts` — intro 면적 구간별 문장(대규모/무수식/소규모), area 없음+parkType만, area·parkType 다 없음 → null, 면적 표기(만㎡ vs ㎡), minFired 게이트(intro만 발화 시 null, intro+access → 발화), 고유성.
- **회귀**: 어린이집·병원·아파트 스위트 green(shared·provenance·InsightSection 무변경). parking/charger 상세 무영향(수동 확인).
- **수동 AC**: 대표 공원(대규모 근린공원·소규모 어린이공원 각 1) view-source 프로즈+JSON-LD(행정안전부), thin 공원(주변 데이터 없음) noindex, parking 상세 무회귀, Rich Results.

---

## 8. 범위 밖
- 공원 **밀도/희소성**(반경 내 공원 면적 총합 등) 사전집계 — 린이라 제외.
- 유형별 면적 벤치마크("어린이공원치고 넓음") — 사전집계 필요, 제외.
- parking·charger 등 다른 urban 카테고리 인사이트 — 별건(데이터 구조 상이).
- 학교·시장 등 나머지 카테고리 — 다음 스펙.

## 9. 파일 변경 요약
| 파일 | 변경 |
|---|---|
| `lib/seo/json-ld.tsx` | PlaceType에 `'Park'` 추가(1줄) |
| `lib/insights/park.ts` | **신규** — buildParkNarrative + intro 모듈 |
| `lib/insights/park-loader.ts` | **신규** — 캐시 로더(park nearby 옵션, referenceDate) |
| `app/(public)/urban/[category]/[id]/page.tsx` | park 분기: 로더·robots·description·프로즈·JSON-LD |
| `prisma/schema.prisma`(+migration) | #180 병합 → `Park.referenceDate` |
| `tests/lib/insights-park.test.ts` | **신규** — 엔티티 모듈 유닛 |

## 10. 의존성 · 머지
- 프레임워크(`shared.ts`·`provenanceNodes`·`InsightSection`)는 #181. 병원은 #182. 이 공원 작업은 **#182 위 스택**.
- **#180 병합 필요**: `Park.referenceDate` 필드 + 수집 로직. 이 브랜치에 `feat/park-reference-date`를 병합해 가져온다.
- ⚠️ `Park.referenceDate` 마이그레이션 → 머지 전 수동 `prisma:deploy` 필요(아니면 500). 머지 전 `migrate status` 확인.
- 머지 순서: #179 → #181 → #182 → #180 → park.
