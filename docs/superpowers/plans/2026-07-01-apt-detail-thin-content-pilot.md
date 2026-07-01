# 아파트 상세 thin-content 파일럿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트 상세 페이지에 데이터 해석 프로즈 + 출처·신선도 JSON-LD + 조건부 noindex를 배선해 애드센스 thin-content 신호를 해소한다.

**Architecture:** 순수 함수 2개(프로즈 엔진 `lib/insights/apt.ts`, 프로버넌스 JSON-LD 빌더)를 TDD로 만들고, 캐시된 로더(`lib/insights/apt-loader.ts`)로 `generateMetadata`와 페이지 본문이 같은 데이터를 1회만 fetch하도록 묶은 뒤, 기존 `app/(public)/apt/[id]/page.tsx`에 3가지만 얹는다. 기존 UI·표·차트·지도는 불변.

**Tech Stack:** Next.js App Router(RSC/ISR), TypeScript, Prisma, Vitest, React `cache()`.

## Global Constraints

- **날짜 포맷은 반드시 UTC**: `date.toISOString().slice(0, 10)`. `toLocaleDateString` 등 로컬 포맷 금지(KST면 하루 밀림).
- **금액 단위는 만원 기준 통일**: `getRegionStats.saleAvgPrice12m`·`Transaction.dealAmount` 모두 만원. 표시는 `formatBillion(manwon)`으로 억 변환.
- **표시값 일치**: 프로즈·JSON-LD 수치는 화면 표시값과 일치(cloaking 금지).
- **synonym spinning 금지**: 변형은 데이터 결론(구간 분기)이 달라질 때만. 뜻 같은 문구 로테이션 금지.
- **데이터 부족 시 침묵**: narrative가 `null`이면 프로즈 섹션 미렌더 + `noindex` (항상 짝).
- **SSR 유지**: 모든 계산은 서버 컴포넌트에서. `revalidate = 86_400` 유지.
- **범위 밖**: 16카테고리 레지스트리, 중앙값·반경 사전집계, officetel/villa 페이지, 가이드/sitemap. 이 플랜은 **아파트 1종만**.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/insights/apt.ts` | 순수 프로즈 엔진 — 인사이트 모듈 + `buildAptNarrative` | 신규 |
| `lib/seo/json-ld.tsx` | `aptProvenanceNodes` 추가 + `residenceSchema`에 선택 `id`/`mainEntityOfPageId` | 수정 |
| `lib/insights/apt-loader.ts` | 캐시된 데이터 로더 — property/sales/region/subway/infra → narrative + dateModified | 신규 |
| `app/(public)/apt/[id]/page.tsx` | 로더 호출, generateMetadata robots/description, 프로즈 섹션, JSON-LD 노드 | 수정 |
| `tests/lib/insights-apt.test.ts` | 프로즈 엔진 단위 테스트 | 신규 |
| `tests/lib/json-ld-provenance.test.ts` | 프로버넌스 빌더 단위 테스트 | 신규 |

---

## Task 1: 프로즈 엔진 `lib/insights/apt.ts`

순수 함수. DB 의존 없음. 입력 타입은 이 태스크가 정의하고 Task 3 로더가 채운다.

**Files:**
- Create: `lib/insights/apt.ts`
- Test: `tests/lib/insights-apt.test.ts`

**Interfaces:**
- Consumes: `formatBillion(manwon)` (`@/lib/format`), `josa(word, withBatchim, withoutBatchim)` (`@/lib/seo/josa`)
- Produces:
  ```ts
  export interface AptInsightInput {
    name: string;
    sigunguName: string;                                   // pPeer 비교 라벨 (property.region.sigungu)
    builtYear: number | null;
    households: number | null;
    saleDeals: { contractDate: string; amountManwon: number }[];  // 매매만, YYYY-MM-DD
    regionAvgSaleManwon: number | null;                    // getRegionStats.saleAvgPrice12m (만원)
    regionSampleCount: number;                             // getRegionStats.complexCount
    nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
    infra: { label: string; count: number }[];             // count>0 만
  }
  export interface AptNarrative { text: string; fired: string[]; }
  export function buildAptNarrative(d: AptInsightInput): AptNarrative | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/insights-apt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAptNarrative, type AptInsightInput } from '@/lib/insights/apt';

const base: AptInsightInput = {
  name: '광교센트럴아파트',
  sigunguName: '수원시 영통구',
  builtYear: 2013,
  households: 998,
  saleDeals: [
    { contractDate: '2026-03-10', amountManwon: 80000 },
    { contractDate: '2026-06-20', amountManwon: 90000 },
  ],
  regionAvgSaleManwon: 80000,
  regionSampleCount: 12,
  nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
};

describe('buildAptNarrative', () => {
  it('4개 모듈 모두 발화하면 이름으로 시작하고 fired에 4키를 담는다', () => {
    const n = buildAptNarrative(base)!;
    expect(n).not.toBeNull();
    expect(n.text.startsWith('광교센트럴아파트는')).toBe(true);
    expect(n.fired).toEqual(['trend', 'peer', 'access', 'scale']); // weight desc
  });

  it('tTrend: 상승 방향과 건수를 판단으로 표현', () => {
    const n = buildAptNarrative(base)!;
    expect(n.text).toContain('최근 매매 2건');
    expect(n.text).toContain('13% 상승'); // (90000-80000)/80000=12.5→13
  });

  it('pPeer 구간 분기: +5~+15%면 "웃도는 수준"', () => {
    const n = buildAptNarrative(base)!; // 90000 vs 80000 = +13%
    expect(n.text).toContain('수원시 영통구 평균을 웃도는 수준');
  });

  it('pPeer 구간 분기: +15%↑이면 "뚜렷하게 높은 상위 가격대"', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-06-20', amountManwon: 95000 }, { contractDate: '2026-03-10', amountManwon: 80000 }],
    })!; // latest 95000 vs 80000 = +18.75%→19
    expect(n.text).toContain('뚜렷하게 높은 상위 가격대');
  });

  it('pPeer 구간 분기: -5%↓이면 "진입 부담이 적은 편"', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-03-10', amountManwon: 72000 }, { contractDate: '2026-06-20', amountManwon: 70000 }],
    })!; // latest 70000 vs 80000 = -12.5%→-13
    expect(n.text).toContain('진입 부담이 적은 편');
  });

  it('aAccess: 도보 분과 인프라 밀도를 표현', () => {
    const n = buildAptNarrative(base)!;
    expect(n.text).toContain('상현역'); // 400m/80 = 5분
    expect(n.text).toContain('도보 약 5분');
    expect(n.text).toContain('기본 생활 인프라를 갖췄습니다'); // 인프라 2종 → 기본
  });

  it('aAccess: 인프라 3종↑이면 "양호한 편"', () => {
    const n = buildAptNarrative({ ...base, infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }, { label: '마트', count: 3 }] })!;
    expect(n.text).toContain('양호한 편입니다');
  });

  it('bScale: 준공·세대 규모', () => {
    expect(buildAptNarrative(base)!.text).toContain('2013년 준공 · 998세대 단지입니다');
  });

  it('가드: 발화 모듈 3개 미만이면 null (매매<2, 지역표본부족, 인프라1종)', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-06-20', amountManwon: 90000 }], // 1건 → tTrend null, pPeer는 발화 가능
      regionSampleCount: 3,   // <5 → pPeer null
      nearestStation: null,
      infra: [{ label: '카페', count: 8 }], // 1종 → aAccess null
    }); // scale만 발화 → null
    expect(n).toBeNull();
  });

  it('가드: 스타(trend/peer) 미발화면 null', () => {
    const n = buildAptNarrative({
      ...base,
      saleDeals: [],          // tTrend·pPeer 모두 침묵
      regionAvgSaleManwon: null,
    }); // scale+access 2개 → 3 미만이자 스타 없음 → null
    expect(n).toBeNull();
  });

  it('고유성: 가격이 다르면 결론 문장이 달라진다', () => {
    const high = buildAptNarrative(base)!;
    const low = buildAptNarrative({
      ...base,
      saleDeals: [{ contractDate: '2026-03-10', amountManwon: 72000 }, { contractDate: '2026-06-20', amountManwon: 70000 }],
    })!;
    expect(high.text).not.toEqual(low.text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-apt.test.ts`
Expected: FAIL — `Cannot find module '@/lib/insights/apt'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/insights/apt.ts`:

```ts
import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';

export interface AptInsightInput {
  name: string;
  sigunguName: string;
  builtYear: number | null;
  households: number | null;
  saleDeals: { contractDate: string; amountManwon: number }[];
  regionAvgSaleManwon: number | null;
  regionSampleCount: number;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
}

export interface AptNarrative { text: string; fired: string[]; }

interface Insight { key: string; weight: number; text: string; }

// T: 최근 매매 추세 — 표 재서술이 아니라 건수·방향 판단
function tTrend(d: AptInsightInput): Insight | null {
  const sales = [...d.saleDeals].sort((a, b) => a.contractDate.localeCompare(b.contractDate));
  if (sales.length < 2) return null;
  const first = sales[0].amountManwon;
  const last = sales[sales.length - 1].amountManwon;
  const diff = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
  const dir = diff >= 3 ? `직전 대비 약 ${diff}% 상승`
    : diff <= -3 ? `직전 대비 약 ${Math.abs(diff)}% 하락`
    : '큰 변동 없이 보합';
  return { key: 'trend', weight: 10,
    text: `최근 매매 ${sales.length}건이 신고됐고 실거래가는 ${dir} 흐름입니다(최근 ${formatBillion(last)}).` };
}

// P: 시군구 평균 대비 가격 위치 (벤치마크 = getRegionStats)
function pPeer(d: AptInsightInput): Insight | null {
  if (!d.saleDeals.length || d.regionAvgSaleManwon == null || d.regionSampleCount < 5) return null;
  const latest = [...d.saleDeals].sort((a, b) => b.contractDate.localeCompare(a.contractDate))[0].amountManwon;
  const avg = d.regionAvgSaleManwon;
  const diff = Math.round(((latest - avg) / avg) * 100);
  const judge = diff >= 15 ? `${d.sigunguName} 평균보다 뚜렷하게 높은 상위 가격대`
    : diff >= 5 ? `${d.sigunguName} 평균을 웃도는 수준`
    : diff > -5 ? `${d.sigunguName} 평균과 비슷한 수준`
    : `${d.sigunguName} 평균보다 낮아 상대적으로 진입 부담이 적은 편`;
  return { key: 'peer', weight: 9,
    text: `최근 실거래 ${formatBillion(latest)}은 ${judge}입니다(${d.sigunguName} 평균 ${formatBillion(avg)}).` };
}

// A: 접근성 — 최근접 역 도보분 + 반경 인프라 밀도
function aAccess(d: AptInsightInput): Insight | null {
  const seg: string[] = [];
  if (d.nearestStation) {
    const walkMin = Math.max(1, Math.round(d.nearestStation.distanceMeters / 80));
    const line = d.nearestStation.lines[0] ? `${d.nearestStation.lines[0]} ` : '';
    seg.push(`인근 지하철역은 ${line}${d.nearestStation.name}으로 도보 약 ${walkMin}분`);
  }
  const infraParts = d.infra.filter((c) => c.count > 0).map((c) => `${c.label} ${c.count}곳`);
  if (infraParts.length >= 2) {
    const dense = infraParts.length >= 3 ? '생활 편의가 양호한 편입니다' : '기본 생활 인프라를 갖췄습니다';
    seg.push(`반경 도보권에 ${infraParts.join('·')}이 있어 ${dense}`);
  }
  if (!seg.length) return null;
  return { key: 'access', weight: 6, text: `${seg.join('이며, ')}.` };
}

// 규모·연식 (맥락 보조)
function bScale(d: AptInsightInput): Insight | null {
  const parts: string[] = [];
  if (d.builtYear) parts.push(`${d.builtYear}년 준공`);
  if (d.households) parts.push(`${d.households.toLocaleString('ko-KR')}세대`);
  if (!parts.length) return null;
  return { key: 'scale', weight: 4, text: `${parts.join(' · ')} 단지입니다.` };
}

export function buildAptNarrative(d: AptInsightInput): AptNarrative | null {
  const mods = [bScale, tTrend, pPeer, aAccess].map((fn) => fn(d)).filter(Boolean) as Insight[];
  // 가드: 발화 ≥3 AND (추세 또는 또래 발화). 미달 → null(=서술 생략+noindex).
  if (mods.length < 3 || !mods.some((m) => m.key === 'trend' || m.key === 'peer')) return null;
  const ordered = mods.sort((a, b) => b.weight - a.weight);
  return { text: `${josa(d.name, '은', '는')} ${ordered.map((m) => m.text).join(' ')}`, fired: ordered.map((m) => m.key) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-apt.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/apt.ts tests/lib/insights-apt.test.ts
git commit -m "feat(insights): 아파트 해석 프로즈 엔진(모듈형, 구간 분기 가드)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 2: 프로버넌스 JSON-LD 빌더 (`lib/seo/json-ld.tsx` 확장)

**Files:**
- Modify: `lib/seo/json-ld.tsx` (`residenceSchema` 확장 + `aptProvenanceNodes` 추가)
- Test: `tests/lib/json-ld-provenance.test.ts`

**Interfaces:**
- Consumes: `DATA_SOURCES` (`@/lib/data-sources`), `SITE_URL` (`@/lib/site`)
- Produces:
  ```ts
  export function aptProvenanceNodes(input: {
    url: string; name: string; dateModified?: string; datasetSameAs?: string;
  }): Json[];   // [WebPage, GovernmentOrganization, Dataset]
  // residenceSchema(input)에 선택 필드 추가: id?: string; mainEntityOfPageId?: string;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/json-ld-provenance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aptProvenanceNodes, residenceSchema } from '@/lib/seo/json-ld';

const URL = 'https://imjangon.co.kr/apt/123';

describe('aptProvenanceNodes', () => {
  it('WebPage·GovernmentOrganization·Dataset 3노드를 @id로 연결한다', () => {
    const nodes = aptProvenanceNodes({ url: URL, name: '○○아파트' }) as Record<string, any>[];
    const page = nodes.find((n) => n['@type'] === 'WebPage')!;
    const gov = nodes.find((n) => n['@type'] === 'GovernmentOrganization')!;
    const ds = nodes.find((n) => n['@type'] === 'Dataset')!;
    expect(nodes).toHaveLength(3);
    expect(page.isBasedOn['@id']).toBe(ds['@id']);
    expect(page.sourceOrganization['@id']).toBe(gov['@id']);
    expect(ds.creator['@id']).toBe(gov['@id']);
    expect(gov.name).toBe('국토교통부');
    expect(page.mainEntity['@id']).toBe(`${URL}#residence`);
  });

  it('dateModified는 전달 시에만 포함된다', () => {
    const without = aptProvenanceNodes({ url: URL, name: 'x' })[0] as Record<string, any>;
    expect('dateModified' in without).toBe(false);
    const withDate = aptProvenanceNodes({ url: URL, name: 'x', dateModified: '2026-06-20' })[0] as Record<string, any>;
    expect(withDate.dateModified).toBe('2026-06-20');
  });

  it('datasetSameAs는 전달 시에만 포함된다(미전달=추정 금지)', () => {
    const ds = (aptProvenanceNodes({ url: URL, name: 'x' }) as Record<string, any>[]).find((n) => n['@type'] === 'Dataset')!;
    expect('sameAs' in ds).toBe(false);
  });
});

describe('residenceSchema 확장', () => {
  it('id·mainEntityOfPageId 전달 시 @id와 mainEntityOfPage를 세팅', () => {
    const r = residenceSchema({ name: 'x', address: '주소', url: URL, id: `${URL}#residence`, mainEntityOfPageId: `${URL}#webpage` }) as Record<string, any>;
    expect(r['@id']).toBe(`${URL}#residence`);
    expect(r.mainEntityOfPage['@id']).toBe(`${URL}#webpage`);
  });
  it('선택 필드 미전달 시 기존과 동일(하위호환)', () => {
    const r = residenceSchema({ name: 'x', address: '주소', url: URL }) as Record<string, any>;
    expect('@id' in r).toBe(false);
    expect('mainEntityOfPage' in r).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/json-ld-provenance.test.ts`
Expected: FAIL — `aptProvenanceNodes` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/seo/json-ld.tsx`:

(a) Add import at top (after existing `import { SITE_URL }`):

```tsx
import { DATA_SOURCES } from '@/lib/data-sources';
```

(b) Replace `residenceSchema` (lines 72–82) with the extended version:

```tsx
export function residenceSchema(input: PlaceInput & { id?: string; mainEntityOfPageId?: string }): Json {
  return {
    ...ctx,
    '@type': 'Residence',
    ...(input.id ? { '@id': input.id } : {}),
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    ...(input.mainEntityOfPageId ? { mainEntityOfPage: { '@id': input.mainEntityOfPageId } } : {}),
  };
}
```

(c) Add at end of file (after `JsonLd`):

```tsx
const KOGL_LICENSE = 'https://www.kogl.or.kr/info/license.do';

/** 아파트 상세 출처·신선도 노드(WebPage·GovernmentOrganization·Dataset). 국토부 실거래가 근거. */
export function aptProvenanceNodes(input: {
  url: string;
  name: string;
  dateModified?: string; // YYYY-MM-DD (UTC)
  datasetSameAs?: string; // data.go.kr URL, 미전달 시 생략
}): Json[] {
  const src = DATA_SOURCES['molit-rtms'];
  const orgId = `${SITE_URL}/#src-molit`;
  const pageId = `${input.url}#webpage`;
  const dsId = `${input.url}#dataset`;
  const entId = `${input.url}#residence`;
  return [
    {
      ...ctx,
      '@type': 'WebPage',
      '@id': pageId,
      url: input.url,
      name: `${input.name} | 임장ON`,
      inLanguage: 'ko-KR',
      mainEntity: { '@id': entId },
      isBasedOn: { '@id': dsId },
      sourceOrganization: { '@id': orgId },
      license: KOGL_LICENSE,
      ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    },
    { ...ctx, '@type': 'GovernmentOrganization', '@id': orgId, name: src.provider, url: src.url },
    {
      ...ctx,
      '@type': 'Dataset',
      '@id': dsId,
      name: src.dataset,
      url: src.url,
      creator: { '@id': orgId },
      license: KOGL_LICENSE,
      ...(input.datasetSameAs ? { sameAs: input.datasetSameAs } : {}),
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/json-ld-provenance.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/seo/json-ld.tsx tests/lib/json-ld-provenance.test.ts
git commit -m "feat(seo): 아파트 출처·신선도 JSON-LD 노드 + residenceSchema @id 연결

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 3: 캐시된 로더 + 페이지 배선

`generateMetadata`(noindex/description 판정)와 본문(렌더)이 같은 데이터를 필요로 한다. React `cache()`로 감싼 로더 하나로 요청당 1회 실행하고, 페이지의 기존 fetch도 캐시 래퍼로 바꿔 중복 쿼리를 없앤다. DB 의존이라 단위 테스트 대신 타입체크·빌드·수동 검증으로 확인한다.

**Files:**
- Create: `lib/insights/apt-loader.ts`
- Modify: `app/(public)/apt/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildAptNarrative`, `AptNarrative` (Task 1); `getPropertyById`, `getPropertyLatLng`, `getRegionStats` (`@/lib/property`); `getUnifiedTransactions` (`@/lib/transaction`); `getNearbySubwayStations` (`@/lib/subway/nearby`); `getNearbyInfra` (`@/lib/amenity/nearby`)
- Produces:
  ```ts
  export const cachedPropertyById: (id: bigint) => ReturnType<typeof getPropertyById>;
  export const cachedPropertyLatLng: (id: bigint) => ReturnType<typeof getPropertyLatLng>;
  export const cachedNearbySubway: (lat: number, lng: number) => ReturnType<typeof getNearbySubwayStations>;
  export const cachedNearbyInfra: (lat: number, lng: number) => ReturnType<typeof getNearbyInfra>;
  export const loadAptInsight: (propId: bigint) => Promise<{ narrative: AptNarrative | null; dateModified?: string }>;
  ```

- [ ] **Step 1: Create the cached loader**

Create `lib/insights/apt-loader.ts`:

```ts
import { cache } from 'react';
import { getPropertyById, getPropertyLatLng, getRegionStats } from '@/lib/property';
import { getUnifiedTransactions } from '@/lib/transaction';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { buildAptNarrative, type AptNarrative } from '@/lib/insights/apt';

// 요청 스코프 캐시: generateMetadata와 본문에서 같은 인자로 호출하면 1회만 실행된다.
export const cachedPropertyById = cache(getPropertyById);
export const cachedPropertyLatLng = cache(getPropertyLatLng);
export const cachedNearbySubway = cache(getNearbySubwayStations);
export const cachedNearbyInfra = cache((lat: number, lng: number) =>
  getNearbyInfra(lat, lng, { includeChildcare: true }),
);

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export const loadAptInsight = cache(
  async (propId: bigint): Promise<{ narrative: AptNarrative | null; dateModified?: string }> => {
    const property = await cachedPropertyById(propId);
    if (!property) return { narrative: null };

    const coord = await cachedPropertyLatLng(propId);
    const [salesResult, region, subway, infra] = await Promise.all([
      getUnifiedTransactions(propId, { page: 1, perPage: 30, dealType: 'SALE' }),
      getRegionStats(property.sigunguCode),
      coord ? cachedNearbySubway(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      coord ? cachedNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    ]);

    const saleDeals = salesResult.rows
      .filter((r) => r.dealAmount != null)
      .map((r) => ({ contractDate: r.contractDate, amountManwon: r.dealAmount as number }));

    const narrative = buildAptNarrative({
      name: property.name,
      sigunguName: property.region.sigungu,
      builtYear: property.builtYear,
      households: property.households,
      saleDeals,
      regionAvgSaleManwon: region.saleAvgPrice12m,
      regionSampleCount: region.complexCount,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
    });

    const dateModified = toUtcDate(property.saleLastAt ?? property.jeonseLastAt ?? property.wolseLastAt);
    return { narrative, dateModified };
  },
);
```

> **참고**: `property.sigunguCode`·`saleLastAt`·`jeonseLastAt`·`wolseLastAt`는 Prisma `Property` 스칼라 필드(`getPropertyById`가 `include: { region: true }`로 전체 반환). 타입이 맞지 않으면 Step 5 타입체크에서 잡힌다.

- [ ] **Step 2: Wire generateMetadata (robots + description)**

In `app/(public)/apt/[id]/page.tsx`, update imports:

- Line 2 `import { getPropertyById, getPropertyLatLng } from '@/lib/property';` → remove (replaced by cached wrappers).
- Line 28 `import { propertyBlurb, salePriceTrend, propertyMetaDescription } from '@/lib/seo/blurb';` → `import { propertyMetaDescription } from '@/lib/seo/blurb';` (drop `propertyBlurb`, `salePriceTrend` — apt no longer uses them; officetel/villa still import their own).
- Line 29 `import { JsonLd, residenceSchema, breadcrumbSchema } from '@/lib/seo/json-ld';` → add `aptProvenanceNodes`.
- Add: `import { cachedPropertyById, cachedPropertyLatLng, cachedNearbySubway, cachedNearbyInfra, loadAptInsight } from '@/lib/insights/apt-loader';`

Replace `generateMetadata` body (lines 41–60) with:

```tsx
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const property = await cachedPropertyById(BigInt(id)).catch(() => null);
  if (!property) return {};
  const { narrative } = await loadAptInsight(BigInt(id));
  const indexable = !!narrative && narrative.fired.length >= 3;
  return {
    title: `${property.name} 실거래가 · ${property.region.sigungu}`,
    description: narrative?.text.slice(0, 150) ?? propertyMetaDescription({
      name: property.name,
      typeLabel: '아파트',
      regionFullName: property.region.fullName,
      builtYear: property.builtYear,
      households: property.households,
      saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
      jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
      txCount12m: property.txCount12m,
    }),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/apt/${property.id}` },
  };
}
```

- [ ] **Step 3: Wire the page body (fetch via cache, narrative, JSON-LD, prose section)**

In the same file, in `AptDetailPage`:

(a) Replace `const property = await getPropertyById(propId);` (line 66) → `const property = await cachedPropertyById(propId);`

(b) Replace `const coord = await getPropertyLatLng(propId);` (line 69) → `const coord = await cachedPropertyLatLng(propId);`

(c) In the `Promise.all` (lines 72–87): change the infra call to `cachedNearbyInfra(coord.lat, coord.lng)` and the subway call to `cachedNearbySubway(coord.lat, coord.lng)` (so the loader and page share one query each). Leave the other fetches unchanged.

(d) Add after the `Promise.all` block: `const { narrative, dateModified } = await loadAptInsight(propId);`

(e) Delete the `const blurbText = propertyBlurb({ ... });` block (lines 89–102).

(f) Replace the `<JsonLd data={[ ... ]} />` block (lines 106–122) with:

```tsx
<JsonLd
  data={[
    residenceSchema({
      name: property.name,
      address: property.region.fullName,
      lat: coord?.lat,
      lng: coord?.lng,
      url: `${SITE_URL}/apt/${property.id}`,
      image: coord ? staticMapUrl(coord) : undefined,
      id: `${SITE_URL}/apt/${property.id}#residence`,
      mainEntityOfPageId: `${SITE_URL}/apt/${property.id}#webpage`,
    }),
    breadcrumbSchema([
      { name: '홈', url: `${SITE_URL}/` },
      { name: '아파트', url: `${SITE_URL}/apt` },
      { name: property.name, url: `${SITE_URL}/apt/${property.id}` },
    ]),
    ...aptProvenanceNodes({
      url: `${SITE_URL}/apt/${property.id}`,
      name: property.name,
      dateModified,
    }),
  ]}
/>
```

(g) Replace the blurb `<p>` (lines 124–126) with the conditional prose section:

```tsx
{narrative && (
  <section
    aria-label="한눈에 보기"
    className="mt-5 rounded-2xl bg-[var(--color-soft)] px-5 py-4 leading-relaxed text-[var(--color-text)]"
  >
    <h2 className="mb-2 text-base font-bold text-[var(--color-blue-dark)]">한눈에 보기</h2>
    <p>{narrative.text}</p>
  </section>
)}
```

- [ ] **Step 4: Verify no unused imports / dead code**

Run: `grep -n 'propertyBlurb\|salePriceTrend\|blurbText\|getPropertyById\|getPropertyLatLng' app/\(public\)/apt/\[id\]/page.tsx`
Expected: no matches for `propertyBlurb`, `salePriceTrend`, `blurbText`; `getPropertyById`/`getPropertyLatLng` only via cached wrappers (i.e., no direct import remaining).

- [ ] **Step 5: Typecheck + build**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm build 2>&1 | tail -20`
Expected: build succeeds; `/apt/[id]` compiles.

- [ ] **Step 6: Manual acceptance (dev server)**

Run: `pnpm exec dotenv -e .env.local -- next dev` and open an apt with rich data (many recent 매매) and one with sparse data.

Verify:
- Rich page: `view-source:` contains the "한눈에 보기" 문단 text and `application/ld+json` with `WebPage`/`Dataset` nodes (JS 없이). The 문장에 비교/추세 판단이 1개 이상.
- Sparse page (거래 거의 없음): 프로즈 섹션 없음, `<meta name="robots" content="noindex, follow">` 존재.
- description이 두 페이지에서 다르다.
- 크롬 콘솔에 [Rich Results Test](https://search.google.com/test/rich-results)로 `Residence`·`Dataset` 통과(또는 배포 후 확인).

- [ ] **Step 7: Commit**

```bash
git add lib/insights/apt-loader.ts "app/(public)/apt/[id]/page.tsx"
git commit -m "feat(apt): 해석 프로즈+출처 JSON-LD+조건부 noindex 배선(캐시 로더)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 4: 전체 회귀 확인

**Files:** 없음(검증만)

- [ ] **Step 1: 유닛 스위트**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-apt.test.ts tests/lib/json-ld-provenance.test.ts tests/lib/blurb.test.ts`
Expected: 전부 PASS (blurb.test.ts는 officetel/villa가 쓰는 propertyBlurb가 안 깨졌는지 회귀 확인).

- [ ] **Step 2: 타입체크 전체**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: (선택) officetel/villa 상세가 여전히 blurb 렌더하는지 육안 확인**

`app/(public)/officetel/[id]/page.tsx`·`villa/[id]/page.tsx`는 이 플랜에서 미변경 — `propertyBlurb`를 계속 사용해야 한다(수정된 게 없어야 정상).

---

## Self-Review (플랜 작성자 체크)

**Spec coverage**
- 프로즈 엔진(§4) → Task 1 ✅
- 프로버넌스 JSON-LD(§5, dateModified=최근 실거래일 UTC, datasetId 생략) → Task 2 + 로더 ✅
- 조건부 noindex + 고유 description(§6) → Task 3 Step 2 ✅
- 중복 fetch 방지 cache()(§3) → Task 3 로더 + 캐시 래퍼 ✅
- 프로즈 섹션 렌더(§7) → Task 3 Step 3(g) ✅
- 테스트(§8) → Task 1·2 유닛 + Task 3 수동 AC + Task 4 회귀 ✅
- propertyBlurb 관계(§4.5): apt·officetel·villa 공유 확인 → 은퇴 대신 apt 사용처만 교체 ✅ (스펙의 "apt 전용이면 은퇴"는 실측 결과 공유이므로 유지로 확정)

**Placeholder scan**: TBD/TODO 없음. 모든 코드 블록 완성.

**Type consistency**: `AptInsightInput`/`AptNarrative`(Task1) ↔ 로더 사용(Task3) 일치. `aptProvenanceNodes` 시그니처(Task2) ↔ 호출(Task3 3f) 일치. `residenceSchema` 확장 필드 `id`/`mainEntityOfPageId`(Task2) ↔ 호출(Task3 3f) 일치. 단위(만원) 일관.
