# 아파트 상세 thin-content 파일럿 — 설계 (프로즈 + 프로버넌스 JSON-LD + 조건부 noindex)

**작성일**: 2026-07-01
**근거 문서**: `RESEARCH/01_full_report/06_P0-1_문구생성_설계.md`, `07_JSON-LD_출처인용_스키마설계.md`, `08_전체카테고리_통합설계.md`, `09_아파트상세_구현예시_end-to-end.md`
**대상**: `app/(public)/apt/[id]/page.tsx` (아파트 상세 1종 end-to-end)

---

## 1. 배경 · 목표

imjangon이 애드센스 'thin content'로 거절된 원인은 상세 페이지에 **크롤러가 읽을 고유 원본 텍스트가 없기 때문**이다(RESEARCH 진단). 해법의 두 축은 ① **데이터 해석 프로즈**, ② **출처·신선도 JSON-LD**이며, 얇은 페이지는 **noindex** 처리한다.

이 스펙은 그 세 가지를 **아파트 상세 1종에 end-to-end로 배선하는 파일럿**이다. 검증 후 나머지 카테고리로 복제(별도 롤아웃 스펙)한다.

### 성공 기준 (문서 09 AC)

- [ ] `view-source:`에 "한눈에 보기" 프로즈 문단과 프로버넌스 JSON-LD가 **JS 없이** 보인다(RSC/ISR).
- [ ] 해석 문장에 **비교/추세/파생 판단이 1개 이상**(단순 표 재서술 아님).
- [ ] 데이터 부족 단지는 프로즈 없음 + **noindex**가 함께 걸린다.
- [ ] Google Rich Results Test로 `Residence`/`Dataset` 스키마 통과.
- [ ] `description`이 페이지마다 다르다(프로즈 기반).

### 비협상 원칙 (RESEARCH 표지 §3)

1. 표를 문장으로 바꾸지 말 것 — 비교·추세·파생 판단을 담는다.
2. 동의어·어순만 바꾼 문장 대량 생성 금지(synonym spinning).
3. 데이터 부족 시 서술 생략 + noindex(항상 짝).
4. 프로즈와 JSON-LD는 함께 적용.
5. 화면에 없는 정보를 스키마·프로즈에 넣지 말 것(표시값 일치).

---

## 2. 현재 상태 (실측)

| 요소 | 상태 | 위치 |
|---|---|---|
| 아파트 상세 페이지 | ✅ RSC, `export const revalidate = 86_400` (ISR 24h) | `app/(public)/apt/[id]/page.tsx` |
| `generateMetadata` | ✅ title/description/canonical, **robots 제어 없음**(전역 index 기본값) | page.tsx:41–60 |
| JSON-LD | ✅ `residenceSchema` + `breadcrumbSchema` | page.tsx:106–122, `lib/seo/json-ld.tsx` |
| 단일 프로즈 문단 | ✅ `propertyBlurb()` (기본 템플릿) | `lib/seo/blurb.ts:44–78`, page.tsx:124–126 |
| 실거래·차트·주변 데이터 | ✅ 전부 존재 | `lib/property.ts`, `lib/nearby.ts`, `lib/amenity/nearby.ts`, `lib/subway/nearby.ts` |
| 지역 평균가 | ✅ `getRegionStats(sigunguCode)` 온디맨드(시군구 평균·min/max) | `lib/property.ts:308` (현재 apt 페이지 미사용) |
| 출처 레지스트리 | ✅ `molit-rtms` 등 16소스 SSOT | `lib/data-sources.ts` (JSON-LD 미통합) |
| 모듈형 인사이트 엔진 | ❌ 신규 | `lib/insights/apt.ts` |
| 프로버넌스 JSON-LD | ❌ 신규 | `lib/seo/json-ld.tsx` 확장 |

---

## 3. 아키텍처

기존 UI는 변경하지 않는다. 세 가지만 얹는다.

```
generateMetadata / page.tsx (서버 컴포넌트)
  1) 데이터 fetch (전부 기존 함수, React cache()로 감싸 왕복 1회)
       getPropertyById, getUnifiedTransactions, getRegionStats,
       getNearbySubwayStations, getNearbyInfra
  2) buildAptNarrative(input)         → 해석 프로즈  (신규 lib/insights/apt.ts)
  3) aptProvenanceJsonLd(input)       → 출처 스키마  (기존 lib/seo/json-ld.tsx 확장)
  4) decideIndex(fired)               → index / noindex (generateMetadata)
  ──────────────────────────────────────────
  렌더: <JsonLd>(기존 + 프로버넌스 노드) + <한눈에 보기 프로즈> + [기존 UI 그대로]
```

**중복 fetch 방지**: `generateMetadata`(noindex·description 판정)와 본문(렌더) 둘 다 narrative가 필요하다. 데이터 fetch 함수를 React `cache()`로 감싸 요청당 DB 왕복을 1회로 유지한다(프로젝트 Supabase 디스크 IO 병목 고려).

---

## 4. 컴포넌트 A — 프로즈 엔진 `lib/insights/apt.ts` (신규)

문서 06/09의 룰 기반 인사이트 모듈 패턴을 실제 데이터에 매핑한다. 고유성은 문구가 아니라 **데이터 값·발화 조합·구간 분기**에서 나온다.

### 4.1 입력 타입

기존 상세 데이터에서 조립한다(신규 데이터 수집 없음).

```ts
type AptInsightInput = {
  name: string;
  region: string;               // 표시용 시군구명(pPeer 비교 범위 라벨)
  builtYear?: number | null;
  households?: number | null;
  sales: { contractDate: string; amountManwon: number }[];  // getUnifiedTransactions 매매만, 단위 정규화
  regionAvgSaleManwon?: number | null;   // getRegionStats.saleAvgPrice12m (단위 정규화)
  regionSampleValid: boolean;            // 지역 표본 유효성(예: complexCount/txCount12m 임계)
  nearestStation?: { line: string; name: string; walkMin: number; distanceKm: number } | null;
  infra500m?: { cafe?: number; conv?: number; hospital?: number; mart?: number } | null;
};
type Insight = { key: string; weight: number; text: string };
```

> **단위 정규화 규칙**: `getRegionStats`·`getUnifiedTransactions`의 금액 단위(만원/원)를 확인해 **만원 기준으로 통일**한 뒤 표시용은 억 단위로 포맷. 비교(pPeer)는 동일 단위끼리만.

### 4.2 모듈 카탈로그

각 모듈은 가드 통과 시에만 발화. `★` = 스타 모듈(부가가치 최대).

| 모듈 | weight | 파생 판단 | 가드 |
|---|---|---|---|
| `tTrend` ★ | 10 | 최근 매매 N건, 최초→최근 변화율로 상승/하락/보합 | 매매 ≥ 2건 |
| `pPeer` ★ | 9 | 최근 매매가 vs 시군구 평균 → 상위/웃돎/비슷/낮음 | `regionSampleValid` & 매매 ≥ 1건 & `regionAvgSaleManwon` 존재 |
| `aAccess` | 6 | 최근접 역 도보 N분 + 반경 500m 인프라 밀도 | 역 존재 또는 인프라 항목 ≥ 2 |
| `bScale` | 4 | 준공년도 · 세대수 규모 | `builtYear` 또는 `households` 중 1개+ |

**구간 분기 예 (pPeer)** — 결론 문장이 데이터로 갈림(스핀 아님):

```
diff% = (최근매매 − 지역평균) / 지역평균 × 100   // 지역평균 = 시군구 평균
 ≥ +15 → "{시군구명} 평균보다 뚜렷하게 높은 상위 가격대"
 +5~+15 → "{시군구명} 평균을 웃도는 수준"
 −5~+5  → "{시군구명} 평균과 비슷한 수준"
 < −5   → "{시군구명} 평균보다 낮아 상대적으로 진입 부담이 적은 편"
```

> **정확성 주의(원칙 5)**: 벤치마크는 `getRegionStats`의 **시군구 평균**이다. 문장은 실제 비교 범위(시군구명)로 표기하고, "생활권"처럼 더 좁은 범위를 암시하지 않는다. 반경 생활권 중앙값은 후속 정밀화 과제.

### 4.3 조립 · 가드

```ts
export function buildAptNarrative(d: AptInsightInput): { text: string; fired: string[] } | null {
  const mods = [bScale, tTrend, pPeer, aAccess].map(fn => fn(d)).filter(Boolean) as Insight[];
  // 가드: 발화 ≥ 3개 AND (추세 또는 또래 발화). 미달 → null(=서술 생략+noindex).
  if (mods.length < 3 || !mods.some(m => m.key === 'trend' || m.key === 'peer')) return null;
  const ordered = mods.sort((a, b) => b.weight - a.weight);
  return { text: `${d.name}은(는) ${ordered.map(m => m.text).join(' ')}`, fired: ordered.map(m => m.key) };
}
```

- 첫 문장은 단지명(고유명사)으로 시작해 고유성↑.
- 발화 모듈 수가 3~4개로 가변 → 페이지 길이·구성이 데이터에 따라 자연히 달라짐.

### 4.4 금지

- 뜻이 같은데 표현만 바꾼 변형(랜덤 로테이션) 금지. 변형은 **데이터 결론이 달라질 때만**.
- 데이터 없는데 억지 문장 채우기 금지 → 침묵.

### 4.5 기존 `propertyBlurb`와의 관계

apt 상세 페이지에서 "한눈에 보기" 프로즈는 `buildAptNarrative`로 **대체**한다. 구현 시 `propertyBlurb`의 다른 호출처를 확인해:
- apt 페이지 전용이면 이 스펙에서 은퇴(호출 제거).
- 다른 호출처가 있으면 함수는 유지하고 apt 페이지 사용처만 교체.

---

## 5. 컴포넌트 B — 프로버넌스 JSON-LD (`lib/seo/json-ld.tsx` 확장)

기존 `residenceSchema` + `breadcrumbSchema`는 **유지**. 출처·신선도 노드를 얹는다(문서 07 패턴, 레지스트리 없이 apt만).

### 5.1 추가 노드

- `WebPage`: `isBasedOn`→`Dataset`, `sourceOrganization`→`GovernmentOrganization`(국토교통부), `license`(KOGL), `dateModified`, `mainEntity`→residence 엔티티.
- `Dataset`: 국토교통부 아파트 실거래가. `creator`→GovernmentOrganization, `license`(KOGL).
- `GovernmentOrganization`: 국토교통부.
- 엔티티(residence)에는 `mainEntityOfPage`로 WebPage 연결(출처 속성은 WebPage에만; Place에 넣지 않음 — 문서 07 주의).

### 5.2 출처 값 = 기존 레지스트리 재사용

`lib/data-sources.ts`의 `molit-rtms` 항목(기관명·URL 등)을 SSOT로 재사용한다. JSON-LD용 필드(라이선스 URL, 기관 schema.org 타입)가 부족하면 레지스트리에 **추가**한다(별도 하드코딩 금지).

### 5.3 dateModified

- **값 = 최근 실거래일**: `property.saleLastAt ?? jeonseLastAt ?? wolseLastAt`.
- **포맷**: `date.toISOString().slice(0, 10)` — **반드시 UTC**. `toLocaleDateString` 등 로컬 포맷 금지(KST면 하루 밀림. `@db.Date` 왕복 검증에서 확인됨).
- 세 날짜 모두 없으면 `dateModified` **생략**(조건부, 가짜 최신화 금지).
- `updatedAt`은 사용하지 않는다(수집 시각이라 최신화 신호 조작).

### 5.4 datasetId

`data.go.kr` 데이터셋 숫자 ID를 모르면 `sameAs`를 **생략**한다(추정 금지 — RESEARCH 표지 열린 항목). 확인되면 레지스트리에 추가.

### 5.5 표시값 일치

JSON-LD `additionalProperty`에 넣는 수치(준공·세대·최근가 등)는 **화면 표시값과 일치**해야 한다(불일치는 cloaking·구조화데이터 스팸).

---

## 6. 컴포넌트 C — 조건부 noindex + 메타

`generateMetadata`에서:

```ts
const narr = buildAptNarrative(input);           // cache()된 fetch 기반
const indexable = !!narr && narr.fired.length >= 3;
return {
  title, // 기존 유지
  description: narr?.text.slice(0, 150) ?? /* 기존 fallback description */,
  robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  alternates: { canonical },
};
```

- narrative가 `null`(데이터 부족) → `noindex, follow`. 본문에서도 프로즈 섹션 미렌더 → **noindex와 프로즈 없음이 함께**.
- `description`을 narrative 앞 ~150자로 → 페이지별 고유 meta(중복 description 방지).
- 패턴 참고: `app/(public)/list/page.tsx:15`의 `robots: { index: false, follow: true }`.

---

## 7. 렌더 (page.tsx 본문)

```tsx
// 기존 JsonLd에 프로버넌스 노드 추가
<JsonLd data={[ residenceSchema(...), breadcrumbSchema(...), ...aptProvenanceNodes(...) ]} />

<h1>{property.name}</h1>

{narr && (
  <section aria-label="한눈에 보기" className="prose">
    <h2>한눈에 보기</h2>
    <p>{narr.text}</p>
  </section>
)}

{/* 기존 UI 전부 그대로 — 실거래 표·시세 차트·지도·주변 인프라 */}
```

---

## 8. 테스트

### 단위 (`lib/insights/apt.ts`)

- 각 모듈: 가드 통과 시 발화 / 미달 시 `null`.
- 구간 경계값(pPeer의 ±5·±15, tTrend의 ±3% 등)에서 올바른 결론 문장 선택.
- 전체 가드: 발화 3개 미만 → `null`; 스타(추세·또래) 모두 미발화 → `null`.
- 고유성: 서로 다른 입력(가격·거래건수 다름) → **결론 문장이 다름**.
- 단위 정규화: 만원/원 혼용 입력에서 비교가 올바름.

### JSON-LD (`lib/seo/json-ld.tsx`)

- 프로버넌스 노드(WebPage·Dataset·GovernmentOrganization) 존재 및 `@id` 상호참조.
- `dateModified`가 최근 실거래일 UTC 포맷; 거래일 없으면 **키 부재**.
- `sameAs`는 datasetId 없으면 부재.

### noindex

- `decideIndex(fired)` 로직: narrative null → noindex, 정상 → index.

### 수용 기준 (수동)

- 대표 단지 20개 육안 검수(문장에 비교/추세 1개+).
- `view-source:`에 프로즈·JSON-LD가 JS 없이 포함(RSC/ISR).
- Rich Results Test 통과.

---

## 9. 범위 밖 (비목표 · YAGNI)

- **16카테고리 레지스트리**(`lib/registry/categories.ts` · 범용 `buildJsonLd`) — 다음 롤아웃 스펙.
- **중앙값·분위·반경 생활권 사전집계 배치** — 파일럿은 `getRegionStats`(시군구 평균) 재사용. 정밀화는 후속.
- **가이드/허브 콘텐츠 확대**, **sitemap 다이어트**, **나머지 카테고리**(어린이집·학교·병원 등) — 전부 별도.

---

## 10. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `lib/insights/apt.ts` | **신규** — 모듈형 프로즈 엔진 + `buildAptNarrative` |
| `lib/seo/json-ld.tsx` | 프로버넌스 노드 빌더 추가(`aptProvenanceNodes` 또는 `residenceSchema` 확장) |
| `lib/data-sources.ts` | (필요 시) JSON-LD용 필드(라이선스 URL·기관 타입) 추가 |
| `app/(public)/apt/[id]/page.tsx` | `cache()` fetch, `generateMetadata` robots/description, 프로즈 섹션, JSON-LD 노드 추가 |
| `lib/seo/blurb.ts` | apt 전용이면 `propertyBlurb` 은퇴(호출처 확인 후) |
| `tests/…` | 인사이트 엔진 · JSON-LD · noindex 단위 테스트 |
