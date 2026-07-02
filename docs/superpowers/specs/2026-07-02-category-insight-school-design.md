# 카테고리 인사이트 롤아웃 — 학교(School) 설계

**작성일**: 2026-07-02
**근거**: 카테고리 인사이트 프레임워크(#181/#184, 머지됨) 재사용 + 병원(#185)·공원(#186) 롤아웃 패턴
**대상**: 학교 상세(`app/(public)/school/[sigunguCode]/[id]/page.tsx`)에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex 도입.

---

## 1. 배경 · 목표

프레임워크(공유 A/C·`provenanceNodes`·`InsightSection`·로더 패턴)는 어린이집·병원·공원으로 검증됨. 이 스펙은 **프레임워크를 학교에 적용**한다(네 번째 카테고리). **린 전략** 유지.

학교 엔티티 필드(`schoolKind`·`foundType`·`coeduType`)만으로는 intro가 라벨 조합이라 표 재서술에 가깝다. 그래서 **도보권 학교 밀도(학군)**를 요청 시점에 파생 판단하는 `district` 모듈을 star로 두고, **`district`가 발화해야만 index**되게 게이트를 건다 — 이것이 학교를 약국·시장(near-zero 엔티티, 스킵됨)과 다르게 만든다. 진입 검토자(이사·매수)에게 학군은 핵심 가치이므로 register에 부합한다.

**과장 금지 원칙**: "배정 학교" 등 미보유(배정) 데이터 주장 금지. 도보권 학교 수는 실측이므로 사실 진술.

### 성공 기준
- [ ] 학교 상세 `view-source`에 "한눈에 보기" 프로즈 + 프로버넌스 JSON-LD(출처=교육부 NEIS)가 JS 없이.
- [ ] 각 문장에 파생 판단(급별·설립·성별, 도보권 학교 밀도, 접근성, 시세) — 표 재서술 최소화.
- [ ] `district` 미발화(도보권 학교 없음) 또는 좌표 없는 학교는 프로즈 없음 + `noindex, follow`.
- [ ] 아파트·어린이집·병원·공원 무회귀.

### 비협상 원칙
표 재서술 최소화(파생·학군 중심) · synonym spinning 금지 · 데이터 부족 시 침묵+noindex · 프로즈와 JSON-LD 병행 · 표시값 일치 · 과장(미보유 배정 데이터) 금지.

---

## 2. 현재 상태 (실측)

| 요소 | 상태 | 위치 |
|---|---|---|
| 학교 상세 | ✅ RSC, `revalidate=86_400`, 전용 라우트(공유 아님) | `app/(public)/school/[sigunguCode]/[id]/page.tsx` |
| 데이터 | ✅ `schoolKind`·`foundType`·`coeduType`·`region`·`eduOffice`·`tel`. 학생수·학급수 없음 | `getSchoolById` (`@/lib/school`) |
| nearby fetch | ✅ `getNearbyApartments`·`getNearbyInfra(coord)`(학교 미포함)·`getNearbySubwayStations`·`getNearbyChildcare` — 이미 호출 | page.tsx |
| JSON-LD | ✅ `placeSchema('School')` + breadcrumb (프로버넌스·id 없음) | page.tsx |
| generateMetadata | ✅ title/description/canonical (robots 없음) | page.tsx |
| 출처 레지스트리 | ✅ `neis` → 교육부 NEIS 학교 기본정보 | `lib/data-sources.ts` |
| **소스 기준일** | ❌ 없음(NEIS 기본정보). `updatedAt`은 매 실행 튐 → **dateModified 생략** | schema `School` |
| nearby 학교 집계 | ❌ 없음(`getNearbyInfra`는 학교 미포함) → **신규 필요** | `lib/amenity/nearby.ts` |
| 프레임워크 | ✅ `lib/insights/shared.ts`·`provenanceNodes`·`InsightSection` | 재사용 |

**필드 분포**(실측 12,561곳): schoolKind = 초등학교 6,333·중학교 3,320·고등학교 2,404·특수학교 203·각종학교 등 소수. foundType = 공립 10,595·사립 1,896·국립 54·기타/국외/null 소수. coeduType = **남여공학**(DB 원값) 11,085·남 746·여 730. 위치 99.6%(12,512/12,561).

---

## 3. 아키텍처 (프레임워크 재사용)

신규는 학교 엔티티 모듈 + 로더 + nearby-schools 집계 + 페이지 배선. **base = main**(스택 아님 — 프레임워크 이미 머지됨).

```
[재사용] shared.accessInsight(A)·priceContextInsight(C)·assembleNarrative · provenanceNodes · InsightSection

[신규] lib/amenity/nearby.ts  — getNearbySchoolCounts(lat,lng,excludeId,radius) 추가
[신규] lib/insights/school.ts        — buildSchoolNarrative(input) → Narrative | null
[신규] lib/insights/school-loader.ts — 캐시 로더(dateModified 없음)
[수정] school 페이지                 — robots·description·프로즈·provenance(neis)·placeSchema id
```

`getNearbyInfra`는 학교를 포함하지 않으므로 학군용 집계는 별도 쿼리다. 캐시 래퍼로 감싸 generateMetadata·본문 dedup.

---

## 4. nearby-schools 집계 — `lib/amenity/nearby.ts`

```ts
export interface NearbySchoolCount { kind: string; count: number; }

export async function getNearbySchoolCounts(
  lat: number, lng: number, excludeId: bigint, radiusMeters = 1000,
): Promise<NearbySchoolCount[]> {
  // ST_DWithin 반경 내 School을 schoolKind별 GROUP BY COUNT, 자기 자신(excludeId) 제외, schoolKind NOT NULL
  // 반환: [{kind:'초등학교', count:2}, {kind:'중학교', count:1}] (kind 순서는 모듈이 정렬)
}
```
- `getNearbyChildcare`의 raw `$queryRaw` + `ST_DWithin` 패턴을 따른다.
- `radiusMeters = 1000`(도보권 기준, 어린이집 nearby와 동일 반경).

---

## 5. 학교 엔티티 모듈 — `lib/insights/school.ts`

### 입력 타입
```ts
export interface SchoolInsightInput {
  name: string;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  nearbySchoolCounts: { kind: string; count: number }[];
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}
```

### 모듈 (자연 순서)
| key | 파생 판단(예) | 가드 |
|---|---|---|
| `intro` | "공립 남녀공학 중학교입니다." / "사립 남자고등학교입니다." | schoolKind 또는 foundType |
| `district` ★ | "도보권에 초등학교 2곳·중학교 1곳이 있어 학령기 학교가 가깝습니다." | nearbySchoolCounts 합 ≥1 |
| `access` | 공유 A (최근접 역 도보분 + 반경 인프라) | — |
| `price` | 공유 C (도보권 아파트 실거래 range) | — |

`buildSchoolNarrative` → `assembleNarrative(name, mods, { minFired: 3, requireKeys: ['district'] })`.
**게이트**: `district` 필수 + 총 3개 이상 발화. 도보권 학교 없거나 좌표 없어 nearby가 비면 narrative null → noindex.

**`intro` 파생 규칙**
- `kind` = `schoolKind || '학교'`.
- `coeduType` 라벨:
  - `'남'` → 학교명 앞에 `남자` 붙임: `남자${kind}` (예: 남자고등학교)
  - `'여'` → `여자${kind}` (예: 여자중학교)
  - `'남여공학'` → `남녀공학 ${kind}` (별도 어절, 표기는 `남녀공학`으로 정규화)
  - 그 외/null → `${kind}` (수식 없음)
- `foundType` prefix: `공립`·`국립`·`사립`이면 `${foundType} ` 접두, `기타`·`국외`·null이면 생략.
- text = `${foundPrefix}${kindPhrase}입니다.`
- 첫 문장은 `assembleNarrative`가 `{name}은/는 ` prefix를 붙인다(intro text는 name 미포함).

**`district` 파생 규칙**
- 입력 `nearbySchoolCounts`를 고정 순서(초등학교→중학교→고등학교→특수학교→기타)로 정렬, `count>0`만.
- 나열: `초등학교 2곳·중학교 1곳`.
- 판단 문장: `도보권에 ${list}이 있어 학령기 학교가 가깝습니다.`
- 합이 0이면 미발화(null).

**금지**: 뜻 같은 문구 로테이션. 배정·학군 등급 등 미보유 데이터 주장. 도보권 학교를 단순 나열만(파생 없이).

---

## 6. 출처 · dateModified

- `provenanceNodes({ url, name, sourceId: 'neis', entityId: `${url}#school` })` — 출처=교육부(NEIS 학교 기본정보). **dateModified 생략**(소스 기준일 없음, `updatedAt` 사용 금지, 병원과 동일).
- `placeSchema({ type:'School', name, address, lat, lng, url, image, telephone, id: `${url}#school`, mainEntityOfPageId: `${url}#webpage` })` — 기존 placeSchema('School') 호출에 `id`·`mainEntityOfPageId` 추가.
- `breadcrumbSchema` — 기존 nav 반영: 홈 › 생활편의(`/life`) › 학교찾기(`/school`) › (지역) › 이름.

---

## 7. 로더 + 페이지 배선

### 로더 `lib/insights/school-loader.ts`
```ts
import { cache } from 'react';
import { getSchoolById } from '@/lib/school';
import { getNearbyApartments, getNearbyInfra, getNearbySchoolCounts } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildSchoolNarrative } from '@/lib/insights/school';
import type { Narrative } from '@/lib/insights/shared';

export const cachedSchoolById = cache(getSchoolById);
export const cachedSchoolLatLng = cache(/* School location ST_Y/ST_X raw query, 페이지의 getSchoolLatLng 이관 */);
export const cachedNearbyAptsSchool = cache(getNearbyApartments);
export const cachedNearbyInfraSchool = cache(getNearbyInfra); // 2인자(학교 exclude 불필요 — infra에 학교 없음)
export const cachedNearbySubwaySchool = cache(getNearbySubwayStations);
export const cachedNearbySchoolCounts = cache((lat: number, lng: number, excludeId: bigint) =>
  getNearbySchoolCounts(lat, lng, excludeId));

export const loadSchoolInsight = cache(async (id: bigint): Promise<{ narrative: Narrative | null }> => {
  // school + coord → nearby(apts/infra/subway/schoolCounts) → buildSchoolNarrative
  // dateModified 없음 → 반환하지 않음
});
```
- `nearbyAptSaleManwon` = apts의 매매 최근 실거래(만원) 필터(병원·공원 로더와 동일).
- `infra`는 `getNearbyInfra` 결과의 `{label, items.length}` 매핑, count>0, slice 5.
- `getSchoolLatLng`(현재 페이지 내부 정의)를 로더로 이관해 캐시.

### 페이지 (`school/[sigunguCode]/[id]/page.tsx`)
- `generateMetadata`: `cachedSchoolById` + `loadSchoolInsight` → `robots: narrative && narrative.fired.length >= 3 ? index : noindex`, `description = narrative?.text.slice(0,150) ?? 기존 폴백`.
- 본문: fetch를 캐시 래퍼로(dedup), `const { narrative } = await loadSchoolInsight(schoolId)`.
- JSON-LD: `placeSchema(... id, mainEntityOfPageId)` + breadcrumb + `...provenanceNodes({ sourceId:'neis', entityId })`.
- `SchoolHero` 아래 `{narrative && <InsightSection sentences={narrative.sentences} />}`.

---

## 8. 테스트
- **유닛** `tests/lib/insights-school.test.ts`: `school.ts` — intro(공립 남녀공학, 사립 남자, found 없음, kind 없음), district(정렬·나열·합0 미발화), minFired 게이트(district 없으면 null, intro+access+price만이면 district 필수라 null), 고유성.
- **회귀**: 어린이집·병원·공원·아파트 스위트 green(shared·provenance·InsightSection 무변경).
- **수동 AC**: 대표 학교(도심 초/중/고 각 1) view-source 프로즈+JSON-LD(NEIS), 도보권 학교 없는 고립 학교 noindex, Rich Results.

---

## 9. 범위 밖
- 학생수·학급수·교원수 등 규모 지표 — NEIS 기본정보에 없음, 제외.
- 학군 등급·배정 정보 — 미보유, 과장 금지 원칙상 제외.
- **시장(TraditionalMarket)** — marketType뿐이라 near-zero 엔티티, 약국과 동일 판단으로 **스킵**.
- 기타 나머지 카테고리 — 다음 스펙.

## 10. 파일 변경 요약
| 파일 | 변경 |
|---|---|
| `lib/amenity/nearby.ts` | `getNearbySchoolCounts` + `NearbySchoolCount` 신규 |
| `lib/insights/school.ts` | **신규** — buildSchoolNarrative + intro·district |
| `lib/insights/school-loader.ts` | **신규** — 캐시 로더(dateModified 없음) |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | 로더·robots·description·프로즈·provenance·placeSchema id |
| `tests/lib/insights-school.test.ts` | **신규** — 엔티티 모듈 유닛 |

## 11. 의존성 · 머지
- 프레임워크(`shared.ts`·`provenanceNodes`·`InsightSection`)는 이미 main에 머지됨(#184). **base = main**, 스택 아님.
- 스키마 변경 없음 → `prisma:deploy` 불필요.
