# 카테고리 인사이트 롤아웃 — 병원(Hospital) 설계

**작성일**: 2026-07-01
**근거**: 카테고리 인사이트 프레임워크(`feat/category-insight-rollout` #181) 재사용 + `RESEARCH/01_full_report/08`
**대상**: 병원·의원 상세(`app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`)에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex 도입.

---

## 1. 배경 · 목표

프레임워크(공유 A/C·`provenanceNodes`·`InsightSection`·로더 패턴)는 어린이집 롤아웃으로 완성됨. 이 스펙은 **프레임워크를 병원에 적용**한다(다음 카테고리를 싸게 추가하는 패턴의 두 번째 사례). **린 전략** 유지: 벤치마크/밀도 사전집계 없음. 병원 자체 데이터(진료과·의사수·병상)의 파생 판단 + 공유 접근성/시세맥락.

### 성공 기준
- [ ] 병원 상세 `view-source`에 "한눈에 보기" 프로즈 + 프로버넌스 JSON-LD(출처=건강보험심사평가원)가 JS 없이.
- [ ] 각 문장에 파생 판단(진료과 수·전문의 비율·병상 규모 등) — 표 재서술 아님.
- [ ] 데이터 부족 병원은 프로즈 없음 + `noindex, follow`.
- [ ] 아파트·어린이집 무회귀.

### 비협상 원칙
표 재서술 금지(파생만) · synonym spinning 금지 · 데이터 부족 시 침묵+noindex · 프로즈와 JSON-LD 병행 · 표시값 일치.

---

## 2. 현재 상태 (실측)

| 요소 | 상태 | 위치 |
|---|---|---|
| 병원 상세 | ✅ RSC, `revalidate=86_400` | `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` |
| 데이터 | ✅ `typeName`·`totalDoctors`+의사구성(drMed/Dent/Kor×Specialist 등)·`midwifeCount` / 관계 `depts[]`(deptName·specialistCount)·`facility`(병상) | `getHospitalById` (`@/lib/hospital`) |
| nearby fetch | ✅ `getNearbyApartments`·`getNearbyInfra(coord,{excludeHospitalId, includeChildcare:true})`·`getNearbySubwayStations` | page.tsx |
| JSON-LD | ✅ `placeSchema('Hospital')` + breadcrumb (프로버넌스·id 없음) | page.tsx |
| generateMetadata | ✅ title/description/canonical (robots 없음) | page.tsx |
| 출처 레지스트리 | ✅ `hira` → 건강보험심사평가원 | `lib/data-sources.ts` |
| **소스 기준일** | ❌ 없음(HIRA XLSX). `updatedAt`은 매 실행 튐 → **dateModified 생략** | schema `Hospital` |
| 프레임워크 | ✅ `lib/insights/shared.ts`·`provenanceNodes`·`InsightSection` | 재사용 |

---

## 3. 아키텍처 (프레임워크 재사용)

신규는 병원 엔티티 모듈 + 로더 + 페이지 배선뿐.

```
[재사용] shared.accessInsight(A)·priceContextInsight(C)·assembleNarrative · provenanceNodes · InsightSection

[신규] lib/insights/hospital.ts       — buildHospitalNarrative(input) → Narrative | null
[신규] lib/insights/hospital-loader.ts — 캐시 로더(병원 전용 nearby 옵션), dateModified 없음
[수정] hospital 페이지               — robots·description·프로즈·provenance(sourceId hira)·placeSchema id
```

**병원 전용 nearby 캐시 래퍼**: 병원 페이지의 infra fetch는 `getNearbyInfra(lat,lng,{excludeHospitalId, includeChildcare:true})`. `excludeHospitalId`가 엔티티마다 달라 단순 `cache((lat,lng)=>…)`로는 dedupe가 어긋난다. → 로더는 `cachedNearbyInfraHosp = cache((lat,lng,excludeHospitalId)=>getNearbyInfra(lat,lng,{excludeHospitalId, includeChildcare:true}))`로 감싸고 페이지도 이 래퍼로 교체(같은 3인자 → dedupe). Apartments/Subway는 인자 동일하므로 childcare-loader와 같은 방식.

---

## 4. 병원 엔티티 모듈 — `lib/insights/hospital.ts`

### 입력 타입
```ts
export interface HospitalInsightInput {
  name: string;
  typeName: string;                       // 의원/병원/종합병원 …
  deptCount: number;                      // depts 길이
  deptWithSpecialistCount: number;        // specialistCount>0 인 depts 수
  topDeptNames: string[];                 // 대표 진료과명(상위 몇 개)
  totalDoctors: number | null;
  specialistTotal: number | null;         // drMedSpecialist+drDentSpecialist+drKorSpecialist
  bedCounts: { label: string; count: number }[];  // 병상 유형별(count>0)
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}
```

### 모듈 (자연 순서)
| key | 파생 판단(예) | 가드 |
|---|---|---|
| `intro` | "종합병원으로 진료과 18개과를 운영합니다." | typeName 또는 deptCount≥1 |
| `depts` ★ | "18개 진료과 중 전문의가 배치된 과는 12개이며, 내과·외과·정형외과 등을 진료합니다." | deptCount≥1 |
| `doctors` ★ | "의사 45명 중 전문의가 38명(약 84%)입니다." | totalDoctors≥1 |
| `beds` | "일반병상 120·중환자실 20·응급실·수술실을 갖춘 규모입니다." | 병상 유형 ≥1 & 합≥1 |
| `access` | 공유 A | — |
| `price` | 공유 C | — |

`buildHospitalNarrative` → `assembleNarrative(name, mods, { minFired: 3, requireKeys: ['depts','doctors'] })`.

**파생 판단 규칙**
- `depts`: 총 진료과 수 + 전문의 배치 과 수(파생) + 대표 과목 나열(topDeptNames 상위 3). 표 재서술 아님(전문의 배치 비율은 depts 집계에서 파생).
- `doctors`: 전문의/전체 비율(파생). 전문의 비율이 병원의 성격을 드러냄.
- `beds`: 병상 유형 조합으로 규모 성격(응급실·수술실·중환자실 유무). 큰 병원과 의원이 자연히 다른 문장.
- 구간 분기로 유형별 결론이 갈리게(예: 전문의 비율 ≥80% "전문의 중심" vs <50% "일반의 비중").

**금지**: 뜻 같은 문구 로테이션. 병상 목록을 그냥 나열만 하는 문장(파생 없이).

---

## 5. 출처 · dateModified

- `provenanceNodes({ url, name, sourceId: 'hira', entityId: `${url}#hospital`, dateModified: undefined })` — 출처=건강보험심사평가원. **dateModified 생략**(소스 기준일 없음, updatedAt 사용 금지).
- `placeSchema('Hospital', { id: `${url}#hospital`, mainEntityOfPageId: `${url}#webpage` })`.

---

## 6. 로더 + 페이지 배선

### 로더 `lib/insights/hospital-loader.ts`
```ts
export const cachedHospitalById = cache(getHospitalById);
export const cachedHospitalLatLng = cache(getHospitalLatLng);
export const cachedNearbyApartmentsHosp = cache(getNearbyApartments);
export const cachedNearbyInfraHosp = cache((lat, lng, excludeHospitalId: bigint) =>
  getNearbyInfra(lat, lng, { excludeHospitalId, includeChildcare: true }));
export const cachedNearbySubwayHosp = cache(getNearbySubwayStations);
export const loadHospitalInsight = cache(async (id: bigint): Promise<{ narrative: Narrative | null }> => {
  // hospital + coord + nearby(apts/infra/subway) → buildHospitalNarrative
  // dateModified 없음 → 반환하지 않음
});
```
- `deptCount`/`deptWithSpecialistCount`/`topDeptNames`는 `hospital.depts`에서 산출.
- `specialistTotal` = drMedSpecialist+drDentSpecialist+drKorSpecialist (null 안전 합).
- `bedCounts`는 `hospital.facility`의 병상 필드를 라벨+값으로 매핑(일반병상=generalBedNormal+generalBedPremium, 중환자실=icuAdult+Pediatric+Neonatal, 응급실=erBed, 수술실=operatingRoomBed, 분만실=deliveryBed 등), count>0만.
- `nearbyAptSaleManwon` = apts.saleLastPrice(만원) 필터.

### 페이지
- `generateMetadata`: `cachedHospitalById` + `loadHospitalInsight` → `robots: fired≥3 ? index : noindex`, `description = narrative?.text.slice(0,150) ?? 기존폴백`.
- 본문: fetch를 캐시 래퍼로(중복 방지), `const { narrative } = await loadHospitalInsight(hospitalId)`.
- JSON-LD: `placeSchema(... id, mainEntityOfPageId)` + breadcrumb + `...provenanceNodes({ sourceId:'hira', entityId, /* no dateModified */ })`.
- `HospitalHero` 아래 `{narrative && <InsightSection sentences={narrative.sentences} />}`.

---

## 7. 테스트
- **유닛**: `hospital.ts`(각 모듈 발화/침묵·전문의 비율 구간·병상 조합·가드 null·고유성).
- **회귀**: 어린이집·아파트 스위트 green(shared·provenance 무변경). `provenanceNodes`가 dateModified 없이도 정상(어린이집 테스트가 이미 커버).
- **수동 AC**: 대표 병원(종합병원·의원 각 1) view-source 프로즈+JSON-LD(건강보험심사평가원), thin 의원 noindex, Rich Results.

---

## 8. 범위 밖
- 진료과 **밀도**(반경 내 동종 진료과 희소성) 사전집계 — 린이라 제외(RESEARCH의 D 모듈).
- **운영시간/야간·주말** status 모듈 — DB에 데이터 없음, 별건.
- 약국·도시·편의·청약·지하철 등 나머지 카테고리 — 다음 스펙.

## 9. 파일 변경 요약
| 파일 | 변경 |
|---|---|
| `lib/insights/hospital.ts` | **신규** — buildHospitalNarrative + 엔티티 모듈 |
| `lib/insights/hospital-loader.ts` | **신규** — 캐시 로더(병원 nearby 옵션, dateModified 없음) |
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | 로더·robots·description·프로즈·provenance·placeSchema id |
| `tests/lib/insights-hospital.test.ts` | **신규** — 엔티티 모듈 유닛 |

## 10. 의존성
프레임워크(`shared.ts`·`provenanceNodes`·`InsightSection`)는 `feat/category-insight-rollout`(#181)에 있음. 이 병원 작업은 **#181 위 스택**.
