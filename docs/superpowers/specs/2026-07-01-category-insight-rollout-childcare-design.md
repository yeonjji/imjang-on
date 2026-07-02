# 카테고리 인사이트 롤아웃 — 프레임워크 + 어린이집 파일럿 (설계)

**작성일**: 2026-07-01
**근거**: `RESEARCH/01_full_report/06·07·08` + 아파트 파일럿(`feat/apt-detail-thin-content-pilot`) 일반화
**대상**: 비-부동산 카테고리 상세에 "한눈에 보기" 해석 프로즈 + 출처·신선도 JSON-LD + 조건부 noindex 도입. 이 스펙은 **재사용 프레임워크 + 어린이집(childcare) 1종**을 end-to-end로 구축한다.

---

## 1. 배경 · 목표

아파트·오피스텔·빌라는 파일럿(PR #179)으로 완료. 남은 카테고리(어린이집·병원·공원 등)는 데이터 구조가 달라 그대로 복제되지 않는다. 이 스펙은 **비-부동산 카테고리에 재사용 가능한 인사이트 프레임워크**를 만들고, 가장 데이터가 풍부한 **어린이집**으로 검증한다.

**전략 = 린(lean)**: 또래 비교(P)·밀도(D) 사전집계는 만들지 않는다. 각 시설의 **자체 파생 판단**(충원율, 대기 비율, 교사당 원아 등)과 이미 모든 상세가 fetch 중인 **접근성(A)·시세맥락(C)** 공유 모듈로 프로즈를 구성한다. 신규 집계·데이터 수집 0.

### 성공 기준
- [ ] 어린이집 상세 `view-source`에 "한눈에 보기" 프로즈와 프로버넌스 JSON-LD가 JS 없이 렌더.
- [ ] 각 문장에 비교/파생 판단 1개 이상(표 재서술 아님).
- [ ] 데이터 부족 시설은 프로즈 없음 + `noindex, follow`.
- [ ] `dateModified`가 소스 기준일(`dataStdDate`) UTC로 노출, 없으면 생략.
- [ ] Rich Results Test로 `ChildCare`/`Dataset` 통과.
- [ ] 프레임워크(공유 A/C·provenanceNodes·InsightSection)가 다음 카테고리에서 재사용 가능한 형태로 분리.

### 비협상 원칙 (RESEARCH 표지)
표를 문장으로 바꾸지 말 것(파생·비교만) · synonym spinning 금지 · 데이터 부족 시 침묵+noindex · 프로즈와 JSON-LD 병행 · 화면에 없는 값 금지(표시값 일치).

---

## 2. 현재 상태 (실측)

| 요소 | 상태 | 위치 |
|---|---|---|
| 어린이집 상세 | ✅ RSC, `revalidate=86_400` | `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` |
| 데이터 | ✅ 정원·현원·교직원·연령별 대기(`waitCnt*`)·시설(cctv/보육실/통학차량)·`crType`·`dataStdDate` | `getChildcareById` (`lib/childcare.ts`) |
| nearby fetch | ✅ `getNearbyApartments`(가격 포함)·`getNearbyInfra`·`getNearbySubwayStations` | page.tsx:76–84 |
| JSON-LD | ✅ `placeSchema('ChildCare')` + breadcrumb (프로버넌스 없음, id 없음) | page.tsx:92–110 |
| generateMetadata | ✅ title/description/canonical (robots 없음) | page.tsx:38–54 |
| 출처 레지스트리 | ✅ `childcare` → 보건복지부 | `lib/data-sources.ts` |
| 프로즈 엔진 | ❌ 아파트 전용(`lib/insights/apt.ts`) | 신규 일반화 필요 |
| 렌더 컴포넌트 | ✅ `PropertyInsight`(sentences[] 렌더·수치 굵기·방향색) — 카테고리 무관 | `components/ui/property-insight.tsx` |

---

## 3. 아키텍처 (재사용 프레임워크)

```
[공유 모듈] lib/insights/shared.ts
   accessInsight({ nearestStation, infra })      → 역 도보분 + 반경 인프라 (A)
   priceContextInsight({ nearbyAptPricesEok })   → 도보권 아파트 실거래 range (C)
   Insight 타입({ key, text }) · Narrative 타입({ sentences, text, fired }) 공용화

[카테고리 엔티티 모듈] lib/insights/childcare.ts
   buildChildcareNarrative(input) → 엔티티 파생 판단 문장 + 공유 A/C → Narrative | null

[일반화 프로버넌스] lib/seo/json-ld.tsx
   provenanceNodes({ url, name, sourceId, entityId, dateModified, datasetSameAs? })
   placeSchema에 선택 id/mainEntityOfPageId 추가

[렌더] components/ui/insight-section.tsx  (PropertyInsight 개명·이동)
   <InsightSection sentences={narrative.sentences} />

[로더] lib/insights/childcare-loader.ts
   cache()로 generateMetadata+본문이 1회만 fetch. dateModified 산출.
```

**카테고리 추가 비용** = 엔티티 모듈 1파일 + 로더 1파일 + 페이지 배선(3곳). 공유 A/C·provenanceNodes·InsightSection 재사용.

### 공용 타입 이동
`AptInsightInput`은 apt 전용으로 두되, `Insight`/`Narrative`(`{ sentences: string[]; text: string; fired: string[] }`)를 `lib/insights/shared.ts`로 올려 apt·childcare 공용. apt.ts는 shared에서 import.

---

## 4. 공유 모듈 — `lib/insights/shared.ts`

아파트 `aAccess`/시세 로직을 카테고리 무관 형태로 추출.

```ts
export interface Insight { key: string; text: string; }
export interface Narrative { sentences: string[]; text: string; fired: string[]; }

// A: 접근성
export function accessInsight(d: {
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
}): Insight | null; // 역 없고 인프라<2 → null

// C: 시세 맥락 (도보권 아파트 실거래 억 단위)
export function priceContextInsight(d: { nearbyAptPricesEok: number[] }): Insight | null;
// 표본 <3 → null. 예: "도보권 아파트 실거래가는 약 9억~16억 원대에 분포합니다."

// 조립: 첫 문장에 엔티티명 prefix, 가드 통과 시 Narrative
export function assembleNarrative(name: string, mods: (Insight | null)[], opts: {
  minFired: number; requireKeys: string[]; // 예: minFired:3, requireKeys:['occupancy','wait']
}): Narrative | null;
```

`assembleNarrative`는 apt의 조립·가드 로직을 일반화(발화 필터 → `mods.length < minFired || !mods.some(m => requireKeys.includes(m.key))` → null → 아니면 첫 문장 이름 prefix + `{sentences,text,fired}`).

> apt.ts도 `assembleNarrative`를 쓰도록 리팩터(선택). 안전하게: apt는 그대로 두고 childcare만 shared 사용해도 됨. **결정: 공용 타입만 이동, `assembleNarrative`는 shared에 신설하고 childcare가 사용. apt 리팩터는 이 스펙 범위 밖(회귀 위험 최소화).**

---

## 5. 어린이집 엔티티 모듈 — `lib/insights/childcare.ts`

### 입력 타입
```ts
export interface ChildcareInsightInput {
  name: string;
  crType: string | null;                 // 국공립/민간/가정 …
  capacity: number | null;
  currentCount: number | null;
  staffCount: number | null;
  waitByAge: { age: string; count: number }[]; // waitCnt00…M6 → 라벨+값
  roomSize: number | null;               // 보육실 총 ㎡
  cctvCount: number | null;
  vehicleOp: string | null;              // 통학차량 운영여부
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptPricesEok: number[];
}
```

### 모듈 (자연 순서)
| key | 문장(예) | 가드 |
|---|---|---|
| `intro` | "민간 어린이집으로 정원 69명입니다." | crType 또는 capacity |
| `occupancy` ★ | "현원 57명으로 충원율 83%로 정원에 여유가 있는 편입니다." (구간: ≥90 거의 참 / 70~90 보통 / <70 여유) | capacity≥1 & current!=null |
| `wait` ★ | "대기 39명 중 만 0세가 35명(약 90%)으로 영아반 경쟁이 특히 치열합니다." | 총대기≥3 |
| `ratio` | "보육교사 17명이 근무해 교사 1인당 원아 약 3.4명입니다." | staff≥1 & current≥1 |
| `facility` | "원아 1인당 보육실 약 3.3㎡, CCTV 8대, 통학차량 운영 등을 갖췄습니다." | 필드 ≥2 |
| `access` | 공유 A | — |
| `price` | 공유 C | — |

`buildChildcareNarrative`는 위 모듈을 순서대로 실행 → `assembleNarrative(name, mods, { minFired: 3, requireKeys: ['occupancy','wait'] })`.

**구간 분기 예 (occupancy)** — 결론이 데이터로 갈림(스핀 아님):
```
occ = current/capacity
 ≥ 0.90 → "정원에 거의 찬 편"
 0.70~0.90 → "보통 수준"
 < 0.70 → "정원에 여유가 있는 편"
```

**금지**: 뜻 같은 문구 로테이션. "정원 69명입니다"만 있고 파생 판단 없는 문장(표 재서술).

---

## 6. 일반화 프로버넌스 — `lib/seo/json-ld.tsx`

```ts
export function provenanceNodes(input: {
  url: string;
  name: string;
  sourceId: DataSourceId;          // DATA_SOURCES에서 provider/dataset/url 주입
  entityId: string;                // 엔티티 노드 @id (예: `${url}#childcare`)
  dateModified?: string;           // YYYY-MM-DD UTC, 없으면 생략
  datasetSameAs?: string;          // data.go.kr URL, 없으면 생략(추정 금지)
}): Json[]; // [WebPage, GovernmentOrganization, Dataset]
```
- WebPage: `isBasedOn`→Dataset, `sourceOrganization`→GovOrg, `license`(KOGL), `dateModified?`, `mainEntity`→entityId.
- GovOrg: `DATA_SOURCES[sourceId].provider`. Dataset: `.dataset`/`.url`, `creator`→GovOrg, license KOGL, `sameAs?`.
- `aptProvenanceNodes({url,name,dateModified,datasetSameAs?})`는 `provenanceNodes({...,sourceId:'molit-rtms',entityId:`${url}#residence`})`로 위임(아파트 출력 불변 — 회귀 테스트로 보장).
- `placeSchema`에 선택 `id`/`mainEntityOfPageId` 추가(residenceSchema와 동일 패턴, 하위호환).

> **라이선스**: 대부분 KOGL. `DataSource`에 license 필드가 없으므로 KOGL 상수 사용(현행 aptProvenanceNodes와 동일). 데이터셋별 상이 시 후속.

---

## 7. 렌더 컴포넌트 — `components/ui/insight-section.tsx`

`PropertyInsight`를 `InsightSection`으로 개명·이동(내용 동일: soft-tint 보더 패널, 문장 줄 렌더, 수치 굵기, 상승/하락 방향색). apt·officetel·villa import 3곳을 `InsightSection`으로 갱신. childcare는 신규 import.
- 방향색(상승/하락)은 어린이집 프로즈에 해당 단어가 없어 자연히 미발동(무해).
- 수치 굵기(억·만원·%)는 충원율 %·시세 억에 적용됨.

---

## 8. 로더 + 페이지 배선

### 로더 `lib/insights/childcare-loader.ts`
```ts
export const cachedChildcareById = cache(getChildcareById);
export const cachedChildcareLatLng = cache(getChildcareLatLng);
// 로더가 페이지와 같은 cache() 래퍼를 써야 요청당 1회로 dedupe된다. 어린이집
// 페이지의 기존 fetch 시맨틱(getNearbyApartments/getNearbyInfra/getNearbySubwayStations,
// includeChildcare 옵션 없음)을 그대로 감싼 래퍼를 이 로더에서 export하고,
// 페이지도 이 래퍼들로 교체한다. (apt-loader는 infra 옵션이 달라 재사용하지 않는다.)
export const cachedNearbyApartments = cache(getNearbyApartments);
export const cachedNearbyInfraCC = cache((lat: number, lng: number) => getNearbyInfra(lat, lng));
export const cachedNearbySubwayCC = cache(getNearbySubwayStations);
export const loadChildcareInsight = cache(async (id: bigint): Promise<{
  narrative: Narrative | null; dateModified?: string;
}> => { … buildChildcareNarrative(...) …; dateModified = toUtcDate(item.dataStdDate); });
```
`cachedNearbyApartments`로 `nearbyAptPricesEok` 산출(가격 필드 → 억 변환·정렬). 페이지의 `Promise.all`도 위 래퍼로 교체해 로더와 쿼리 공유.

### 페이지 (`childcare/[sigunguCode]/[id]/page.tsx`)
- `generateMetadata`: `cachedChildcareById` + `loadChildcareInsight` → `robots: fired≥3 ? index : noindex, follow`, `description = narrative?.text.slice(0,150) ?? 기존폴백`.
- 본문: 데이터 fetch를 cache 래퍼로(중복 방지), `const { narrative, dateModified } = await loadChildcareInsight(itemId)`.
- JSON-LD: `placeSchema({..., id:`${url}#childcare`, mainEntityOfPageId:`${url}#webpage`})` + breadcrumb + `...provenanceNodes({url, name, sourceId:'childcare', entityId:`${url}#childcare`, dateModified})`.
- `ChildcareHero` 아래 `{narrative && <InsightSection sentences={narrative.sentences} />}`.

---

## 9. 테스트
- **유닛**: `childcare.ts`(각 모듈 발화/침묵·구간 경계·가드 null·고유성), `shared.ts`(accessInsight·priceContextInsight·assembleNarrative 가드), `provenanceNodes`(sourceId 주입값·dateModified 조건부·entityId 연결·aptProvenanceNodes 위임 후 출력 불변).
- **회귀**: apt·officetel·villa 여전히 렌더(InsightSection 개명·타입 이동 후). insights-apt·json-ld-provenance 스위트 green.
- **수동 AC**: 대표 어린이집 20개 육안, view-source 프로즈+JSON-LD(JS 없이), thin 시설 noindex+프로즈 없음, Rich Results 통과.

---

## 10. 범위 밖 (비목표)
- 또래 비교(P)·밀도(D) **사전집계 엔진** — 린이라 제외.
- **학교**(학급·학생·교원 수 DB 없음, NEIS 재적재 필요)·**약국**(운영시간 없음) — 데이터 선행 필요, 별건.
- **도시(공원·주차장·충전소)·편의(마트·카페·시장)·청약·지하철역** — 다음 스펙(프레임워크 재사용).
- apt.ts의 `assembleNarrative` 리팩터 — 회귀 위험 최소화 위해 이번엔 타입만 공용화.

## 11. 파일 변경 요약
| 파일 | 변경 |
|---|---|
| `lib/insights/shared.ts` | **신규** — Insight/Narrative 타입, accessInsight, priceContextInsight, assembleNarrative |
| `lib/insights/apt.ts` | Insight/Narrative를 shared에서 import(타입만) |
| `lib/insights/childcare.ts` | **신규** — buildChildcareNarrative + 엔티티 모듈 |
| `lib/insights/childcare-loader.ts` | **신규** — 캐시 로더 |
| `lib/seo/json-ld.tsx` | `provenanceNodes` 신설, `aptProvenanceNodes` 위임, `placeSchema` id 추가 |
| `components/ui/insight-section.tsx` | `PropertyInsight` 개명·이동 |
| `app/(public)/{apt,officetel,villa}/[id]/page.tsx` | InsightSection import 갱신 |
| `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | 로더·robots·description·프로즈 섹션·provenance·placeSchema id |
| `tests/…` | shared·childcare·provenance 유닛 + 회귀 |

## 12. 의존성
아파트 파일럿 코드(provenanceNodes·InsightSection 일반화 대상)를 확장한다. **`feat/apt-detail-thin-content-pilot` 브랜치 위 스택** 또는 **PR #179 머지 후** 진행.
