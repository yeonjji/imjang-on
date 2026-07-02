# 카테고리 인사이트 롤아웃 (프레임워크 + 어린이집) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비-부동산 카테고리 상세에 재사용 가능한 인사이트 프레임워크(공유 A/C 모듈·일반화 프로버넌스·렌더 컴포넌트)를 만들고 어린이집으로 검증한다.

**Architecture:** 아파트 파일럿을 일반화한다. 공유 모듈(`lib/insights/shared.ts`)이 접근성·시세맥락·조립을 제공하고, 카테고리별 엔티티 모듈(`lib/insights/childcare.ts`)이 자체 파생 판단 문장을 만든다. `provenanceNodes`가 출처를 레지스트리에서 주입하고, 캐시 로더가 요청당 1회 fetch로 프로즈+noindex를 구동한다. 벤치마크 집계는 만들지 않는다(린).

**Tech Stack:** Next.js App Router(RSC/ISR), TypeScript, Prisma, Vitest, React `cache()`.

## Global Constraints

- **린**: 또래/밀도 사전집계 없음. 엔티티 파생값 + 공유 A(접근성)·C(시세맥락)만.
- **날짜는 UTC**: `date.toISOString().slice(0,10)`. 어린이집 `dateModified = item.dataStdDate`.
- **금액 단위 만원**: `NearbyApartment.saleLastPrice`는 만원. 표시는 `formatBillion`.
- **표시값 일치·파생만**: 표 재서술 금지, 각 문장에 파생 판단 포함. synonym spinning 금지.
- **데이터 부족 시 침묵**: narrative null → 프로즈 섹션 미렌더 + `robots:{index:false,follow:true}`. index 조건 = `narrative && fired.length>=3`.
- **아파트 무회귀**: apt/officetel/villa 출력 불변(타입 이동·컴포넌트 개명·provenance 위임 후에도 렌더·테스트 green).
- **의존 브랜치**: `feat/category-insight-rollout`(아파트 파일럿 위 스택). 테스트는 `pnpm exec dotenv -e .env.test -- vitest run <파일>`.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/insights/shared.ts` | 공용 타입(Insight/Narrative) + accessInsight + priceContextInsight + assembleNarrative | 신규 |
| `lib/insights/apt.ts` | Insight/Narrative를 shared에서 import(타입만, 로직 무변경) | 수정 |
| `lib/insights/childcare.ts` | buildChildcareNarrative + 어린이집 엔티티 모듈 | 신규 |
| `lib/insights/childcare-loader.ts` | 캐시 로더 + dateModified | 신규 |
| `lib/seo/json-ld.tsx` | provenanceNodes 신설 + aptProvenanceNodes 위임 + placeSchema id | 수정 |
| `components/ui/insight-section.tsx` | property-insight.tsx 개명·이동(내용 동일) | 이동 |
| `app/(public)/{apt,officetel,villa}/[id]/page.tsx` | InsightSection import 갱신 | 수정 |
| `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | 로더·robots·description·프로즈·provenance·placeSchema id | 수정 |

---

## Task 1: 공유 인사이트 모듈 `lib/insights/shared.ts`

순수. apt의 접근성 로직을 카테고리 무관 형태로 추출하고 공용 타입을 정의한다.

**Files:**
- Create: `lib/insights/shared.ts`
- Modify: `lib/insights/apt.ts` (타입만 shared에서 import)
- Test: `tests/lib/insights-shared.test.ts`

**Interfaces:**
- Consumes: `formatBillion` (`@/lib/format`), `josa` (`@/lib/seo/josa`)
- Produces:
  ```ts
  export interface Insight { key: string; text: string; }
  export interface Narrative { sentences: string[]; text: string; fired: string[]; }
  export function accessInsight(d: { nearestStation: { name: string; lines: string[]; distanceMeters: number } | null; infra: { label: string; count: number }[]; }): Insight | null;
  export function priceContextInsight(d: { nearbyAptSaleManwon: number[] }): Insight | null;
  export function assembleNarrative(name: string, mods: (Insight | null)[], opts: { minFired: number; requireKeys: string[] }): Narrative | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/insights-shared.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { accessInsight, priceContextInsight, assembleNarrative } from '@/lib/insights/shared';

describe('accessInsight', () => {
  it('역+인프라≥2면 발화, 도보분 계산', () => {
    const r = accessInsight({
      nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 400 },
      infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
    })!;
    expect(r.key).toBe('access');
    expect(r.text).toContain('상현역');
    expect(r.text).toContain('도보 약 5분');
  });
  it('역 없고 인프라<2면 null', () => {
    expect(accessInsight({ nearestStation: null, infra: [{ label: '카페', count: 8 }] })).toBeNull();
  });
});

describe('priceContextInsight', () => {
  it('표본≥3이면 억 범위 발화', () => {
    const r = priceContextInsight({ nearbyAptSaleManwon: [90000, 120000, 165000] })!;
    expect(r.key).toBe('price');
    expect(r.text).toContain('9억');
    expect(r.text).toContain('16.5억');
  });
  it('표본<3이면 null', () => {
    expect(priceContextInsight({ nearbyAptSaleManwon: [90000, 120000] })).toBeNull();
  });
});

describe('assembleNarrative', () => {
  const A = { key: 'a', text: 'A문장입니다.' };
  const B = { key: 'b', text: 'B문장입니다.' };
  const C = { key: 'c', text: 'C문장입니다.' };
  it('발화≥minFired & requireKey 충족 시 첫 문장에 이름 prefix', () => {
    const n = assembleNarrative('○○원', [A, B, C, null], { minFired: 3, requireKeys: ['b'] })!;
    expect(n.sentences).toHaveLength(3);
    expect(n.sentences[0].startsWith('○○원은')).toBe(true);
    expect(n.text).toBe('○○원은 A문장입니다. B문장입니다. C문장입니다.');
    expect(n.fired).toEqual(['a', 'b', 'c']);
  });
  it('발화<minFired면 null', () => {
    expect(assembleNarrative('x', [A, B, null], { minFired: 3, requireKeys: ['a'] })).toBeNull();
  });
  it('requireKey 미발화면 null', () => {
    expect(assembleNarrative('x', [A, B, C], { minFired: 3, requireKeys: ['z'] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-shared.test.ts`
Expected: FAIL — `Cannot find module '@/lib/insights/shared'`.

- [ ] **Step 3: Write the implementation**

Create `lib/insights/shared.ts`:

```ts
import { formatBillion } from '@/lib/format';
import { josa } from '@/lib/seo/josa';

export interface Insight { key: string; text: string; }
export interface Narrative { sentences: string[]; text: string; fired: string[]; }

// A: 접근성 — 최근접 역 도보분 + 반경 인프라 밀도 (아파트 aAccess와 동일 로직)
export function accessInsight(d: {
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
}): Insight | null {
  const station = d.nearestStation;
  const infraParts = d.infra.filter((c) => c.count > 0).map((c) => `${c.label} ${c.count}곳`);
  const hasInfra = infraParts.length >= 2;
  if (!station && !hasInfra) return null;
  const dense = infraParts.length >= 3 ? '생활 편의가 양호한 편입니다' : '기본 생활 인프라를 갖췄습니다';
  const walkMin = station ? Math.max(1, Math.round(station.distanceMeters / 80)) : 0;
  const line = station && station.lines[0] ? `${station.lines[0]} ` : '';
  const stationSeg = station
    ? `인근 지하철역은 ${line}${josa(station.name, '으로', '로')} 도보 약 ${walkMin}분 거리`
    : '';
  let text: string;
  if (station && hasInfra) {
    text = `${stationSeg}이며, 반경 도보권에 ${infraParts.join('·')}이 있어 ${dense}.`;
  } else if (station) {
    text = `${stationSeg}입니다.`;
  } else {
    text = `반경 도보권에 ${infraParts.join('·')}이 있어 ${dense}.`;
  }
  return { key: 'access', text };
}

// C: 시세 맥락 — 도보권 아파트 실거래 range (만원 입력, 억 표시)
export function priceContextInsight(d: { nearbyAptSaleManwon: number[] }): Insight | null {
  const p = d.nearbyAptSaleManwon.filter((x) => x > 0);
  if (p.length < 3) return null;
  return {
    key: 'price',
    text: `도보권 아파트 실거래가는 약 ${formatBillion(Math.min(...p))}~${formatBillion(Math.max(...p))}에 분포합니다.`,
  };
}

// 조립: 발화 모듈 필터 → 가드 → 첫 문장에 엔티티명 prefix
export function assembleNarrative(
  name: string,
  mods: (Insight | null)[],
  opts: { minFired: number; requireKeys: string[] },
): Narrative | null {
  const fired = mods.filter(Boolean) as Insight[];
  if (fired.length < opts.minFired || !fired.some((m) => opts.requireKeys.includes(m.key))) return null;
  const sentences = fired.map((m, i) => (i === 0 ? `${josa(name, '은', '는')} ${m.text}` : m.text));
  return { sentences, text: sentences.join(' '), fired: fired.map((m) => m.key) };
}
```

- [ ] **Step 4: Point apt.ts types at shared (no logic change)**

In `lib/insights/apt.ts`:
- Delete the local `interface Insight { key: string; text: string; }` line.
- Replace `export interface AptNarrative { … }` block (the full interface) with:
  ```ts
  import type { Insight, Narrative } from './shared';
  export type AptNarrative = Narrative;
  ```
  Place the `import type` with the other imports at the top, and keep `export type AptNarrative = Narrative;` where the interface was. `buildAptNarrative` already returns `AptNarrative` — unchanged. (Its inline assembly stays; do NOT refactor apt to use assembleNarrative.)

- [ ] **Step 5: Run tests to verify pass (shared + apt regression)**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-shared.test.ts tests/lib/insights-apt.test.ts`
Expected: PASS (shared 8 + apt 13).

- [ ] **Step 6: Commit**

```bash
git add lib/insights/shared.ts lib/insights/apt.ts tests/lib/insights-shared.test.ts
git commit -m "feat(insights): 공유 인사이트 모듈(접근성·시세맥락·조립) 추출

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 2: 일반화 프로버넌스 `lib/seo/json-ld.tsx`

**Files:**
- Modify: `lib/seo/json-ld.tsx`
- Test: `tests/lib/json-ld-provenance.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `DATA_SOURCES`, `DataSourceId` (`@/lib/data-sources`), `SITE_URL`
- Produces:
  ```ts
  export function provenanceNodes(input: { url: string; name: string; sourceId: DataSourceId; entityId: string; dateModified?: string; datasetSameAs?: string; }): Json[];
  // aptProvenanceNodes(input) → provenanceNodes(...) 위임, 출력 불변
  // placeSchema(input & { id?: string; mainEntityOfPageId?: string })
  ```

- [ ] **Step 1: Write the failing test (append)**

Append to `tests/lib/json-ld-provenance.test.ts`:

```ts
import { provenanceNodes, placeSchema } from '@/lib/seo/json-ld';
import { DATA_SOURCES } from '@/lib/data-sources';

describe('provenanceNodes (일반화)', () => {
  const URL = 'https://imjangon.co.kr/childcare/41110/10120';
  it('sourceId로 출처 기관·데이터셋을 주입한다', () => {
    const nodes = provenanceNodes({ url: URL, name: '○○어린이집', sourceId: 'childcare', entityId: `${URL}#childcare` }) as Record<string, any>[];
    const page = nodes.find((n) => n['@type'] === 'WebPage')!;
    const gov = nodes.find((n) => n['@type'] === 'GovernmentOrganization')!;
    const ds = nodes.find((n) => n['@type'] === 'Dataset')!;
    expect(gov.name).toBe(DATA_SOURCES['childcare'].provider);
    expect(ds.name).toBe(DATA_SOURCES['childcare'].dataset);
    expect(page.mainEntity['@id']).toBe(`${URL}#childcare`);
    expect(page.isBasedOn['@id']).toBe(ds['@id']);
    expect(page.sourceOrganization['@id']).toBe(gov['@id']);
    expect(ds.creator['@id']).toBe(gov['@id']);
  });
  it('dateModified·datasetSameAs는 전달 시에만', () => {
    const [page] = provenanceNodes({ url: URL, name: 'x', sourceId: 'childcare', entityId: `${URL}#childcare` }) as Record<string, any>[];
    expect('dateModified' in page).toBe(false);
    const with2 = provenanceNodes({ url: URL, name: 'x', sourceId: 'childcare', entityId: `${URL}#childcare`, dateModified: '2026-06-28' })[0] as Record<string, any>;
    expect(with2.dateModified).toBe('2026-06-28');
  });
});

describe('placeSchema id 확장', () => {
  const URL = 'https://imjangon.co.kr/childcare/41110/10120';
  it('id·mainEntityOfPageId 전달 시 세팅', () => {
    const s = placeSchema({ type: 'ChildCare', name: 'x', address: '주소', url: URL, id: `${URL}#childcare`, mainEntityOfPageId: `${URL}#webpage` }) as Record<string, any>;
    expect(s['@id']).toBe(`${URL}#childcare`);
    expect(s.mainEntityOfPage['@id']).toBe(`${URL}#webpage`);
  });
  it('미전달 시 기존과 동일(하위호환)', () => {
    const s = placeSchema({ type: 'ChildCare', name: 'x', address: '주소', url: URL }) as Record<string, any>;
    expect('@id' in s).toBe(false);
    expect('mainEntityOfPage' in s).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/json-ld-provenance.test.ts`
Expected: FAIL — `provenanceNodes` is not exported.

- [ ] **Step 3: Implement**

In `lib/seo/json-ld.tsx`:

(a) Add `DataSourceId` to the data-sources import:
```tsx
import { DATA_SOURCES, type DataSourceId } from '@/lib/data-sources';
```

(b) Replace the existing `placeSchema` function with the id-extended version:
```tsx
export function placeSchema(input: PlaceInput & { type: PlaceType; id?: string; mainEntityOfPageId?: string }): Json {
  return {
    ...ctx,
    '@type': input.type,
    ...(input.id ? { '@id': input.id } : {}),
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    telephone: input.telephone || undefined,
    openingHours: input.openingHours || undefined,
    ...(input.mainEntityOfPageId ? { mainEntityOfPage: { '@id': input.mainEntityOfPageId } } : {}),
  };
}
```

(c) Add `provenanceNodes` and rewrite `aptProvenanceNodes` to delegate (place near the existing `aptProvenanceNodes`; keep `KOGL_LICENSE`):
```tsx
/**
 * 실거래가/공공데이터 상세 공용 출처·신선도 노드
 * (WebPage·GovernmentOrganization·Dataset). 출처는 DATA_SOURCES[sourceId]에서 주입.
 */
export function provenanceNodes(input: {
  url: string;
  name: string;
  sourceId: DataSourceId;
  entityId: string;        // 엔티티 노드 @id (예: `${url}#childcare`)
  dateModified?: string;   // YYYY-MM-DD UTC
  datasetSameAs?: string;  // data.go.kr URL, 미전달 시 생략
}): Json[] {
  const src = DATA_SOURCES[input.sourceId];
  const orgId = `${SITE_URL}/#src-${input.sourceId}`;
  const pageId = `${input.url}#webpage`;
  const dsId = `${input.url}#dataset`;
  return [
    {
      ...ctx,
      '@type': 'WebPage',
      '@id': pageId,
      url: input.url,
      name: `${input.name} | 임장ON`,
      inLanguage: 'ko-KR',
      mainEntity: { '@id': input.entityId },
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

export function aptProvenanceNodes(input: {
  url: string;
  name: string;
  dateModified?: string;
  datasetSameAs?: string;
}): Json[] {
  return provenanceNodes({ ...input, sourceId: 'molit-rtms', entityId: `${input.url}#residence` });
}
```
Delete the old `aptProvenanceNodes` body (the one that inlined the nodes). `KOGL_LICENSE` and `Dataset`'s `url` fall back on `DATA_SOURCES` — note `DataSource.url` is optional; `molit-rtms` and `childcare` both have `url`, so `src.url` is defined for these.

> Note: apt's GovernmentOrganization `@id` changes from `#src-molit` to `#src-molit-rtms`. This is an internal cross-reference; the existing regression assertions check `@id` equality between nodes (relational), not the literal string, so they still pass. Rich Results is unaffected.

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/json-ld-provenance.test.ts`
Expected: PASS (기존 5 + 신규 4).

- [ ] **Step 5: Commit**

```bash
git add lib/seo/json-ld.tsx tests/lib/json-ld-provenance.test.ts
git commit -m "feat(seo): provenanceNodes 일반화(sourceId 주입) + placeSchema @id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 3: 렌더 컴포넌트 개명 `InsightSection`

**Files:**
- Move: `components/ui/property-insight.tsx` → `components/ui/insight-section.tsx`
- Modify: `app/(public)/apt/[id]/page.tsx`, `app/(public)/officetel/[id]/page.tsx`, `app/(public)/villa/[id]/page.tsx`

**Interfaces:**
- Produces: `export function InsightSection({ sentences }: { sentences: string[] })` — 내용은 기존 `PropertyInsight`와 동일(soft-tint 보더 패널, 문장 줄 렌더, 수치 굵기, 상승/하락 방향색).

- [ ] **Step 1: Rename file + export**

```bash
git mv components/ui/property-insight.tsx components/ui/insight-section.tsx
```
In `components/ui/insight-section.tsx`, rename the exported function `PropertyInsight` → `InsightSection` (only the `export function PropertyInsight` line; the internal `renderSentence`/regex unchanged). Update the leading JSDoc first line to "실거래가·공공데이터 상세 공용 '한눈에 보기' 섹션".

- [ ] **Step 2: Update the three property pages**

In each of `apt/[id]/page.tsx`, `officetel/[id]/page.tsx`, `villa/[id]/page.tsx`:
- Change the import line `import { PropertyInsight } from '@/components/ui/property-insight';` → `import { InsightSection } from '@/components/ui/insight-section';`
- Change the usage `{narrative && <PropertyInsight sentences={narrative.sentences} />}` → `{narrative && <InsightSection sentences={narrative.sentences} />}`

- [ ] **Step 3: Verify no stale references**

Run: `grep -rn 'PropertyInsight\|property-insight' app components`
Expected: no matches.

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): PropertyInsight → InsightSection(카테고리 공용 개명)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 4: 어린이집 엔티티 모듈 `lib/insights/childcare.ts`

순수. 어린이집 자체 파생 판단 + 공유 A/C.

**Files:**
- Create: `lib/insights/childcare.ts`
- Test: `tests/lib/insights-childcare.test.ts`

**Interfaces:**
- Consumes: `accessInsight`, `priceContextInsight`, `assembleNarrative`, `type Insight`, `type Narrative` (`./shared`)
- Produces:
  ```ts
  export interface ChildcareInsightInput {
    name: string; crType: string | null; capacity: number | null; currentCount: number | null;
    staffCount: number | null; waitByAge: { label: string; count: number }[];
    roomSize: number | null; cctvCount: number | null; vehicleOp: string | null;
    nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
    infra: { label: string; count: number }[]; nearbyAptSaleManwon: number[];
  }
  export function buildChildcareNarrative(d: ChildcareInsightInput): Narrative | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/insights-childcare.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildChildcareNarrative, type ChildcareInsightInput } from '@/lib/insights/childcare';

const base: ChildcareInsightInput = {
  name: '광교샛별어린이집',
  crType: '민간',
  capacity: 69,
  currentCount: 57,
  staffCount: 17,
  waitByAge: [{ label: '만 0세', count: 35 }, { label: '만 1세', count: 2 }, { label: '만 2세', count: 2 }],
  roomSize: 187,
  cctvCount: 8,
  vehicleOp: '운영',
  nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 1100 },
  infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
  nearbyAptSaleManwon: [90000, 120000, 165000],
};

describe('buildChildcareNarrative', () => {
  it('풍부한 데이터면 이름으로 시작하고 핵심 모듈이 발화', () => {
    const n = buildChildcareNarrative(base)!;
    expect(n.sentences[0].startsWith('광교샛별어린이집은')).toBe(true);
    expect(n.fired).toContain('occupancy');
    expect(n.fired).toContain('wait');
    expect(n.fired).toContain('access');
    expect(n.fired).toContain('price');
  });
  it('충원율 구간: 57/69=83% → 보통 수준', () => {
    expect(buildChildcareNarrative(base)!.text).toContain('충원율 83%로 보통 수준');
  });
  it('충원율 구간: <70% → 여유', () => {
    const n = buildChildcareNarrative({ ...base, currentCount: 40 })!; // 40/69=58%
    expect(n.text).toContain('정원에 여유가 있는 편');
  });
  it('대기: 최다 연령 share≥60%면 경쟁 치열 문장', () => {
    // 35/(35+2+2)=90%
    expect(buildChildcareNarrative(base)!.text).toContain('만 0세가 35명(약 90%)');
    expect(buildChildcareNarrative(base)!.text).toContain('경쟁이 특히 치열');
  });
  it('교사당 원아: 57/17≈3.4명', () => {
    expect(buildChildcareNarrative(base)!.text).toContain('원아 약 3.4명');
  });
  it('시설: 원아 1인당 보육실 면적·CCTV·통학차량', () => {
    const t = buildChildcareNarrative(base)!.text;
    expect(t).toContain('보육실 약 3.3㎡'); // 187/57=3.28→3.3
    expect(t).toContain('CCTV 8대');
    expect(t).toContain('통학차량 운영');
  });
  it('가드: 핵심(충원율·대기) 미발화 & 3모듈 미만이면 null', () => {
    const n = buildChildcareNarrative({
      ...base, capacity: null, currentCount: null, waitByAge: [], staffCount: null,
      roomSize: null, cctvCount: null, vehicleOp: null,
      nearestStation: null, infra: [{ label: '카페', count: 8 }], nearbyAptSaleManwon: [],
    });
    expect(n).toBeNull();
  });
  it('고유성: 충원율이 다르면 결론 문장이 달라진다', () => {
    const a = buildChildcareNarrative(base)!;
    const b = buildChildcareNarrative({ ...base, currentCount: 40 })!;
    expect(a.text).not.toEqual(b.text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-childcare.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/insights/childcare.ts`:

```ts
import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface ChildcareInsightInput {
  name: string;
  crType: string | null;
  capacity: number | null;
  currentCount: number | null;
  staffCount: number | null;
  waitByAge: { label: string; count: number }[];
  roomSize: number | null;
  cctvCount: number | null;
  vehicleOp: string | null;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function intro(d: ChildcareInsightInput): Insight | null {
  if (!d.crType && d.capacity == null) return null;
  const type = d.crType ? `${d.crType} 어린이집` : '어린이집';
  return {
    key: 'intro',
    text: d.capacity != null ? `${type}으로 정원 ${d.capacity}명입니다.` : `${type}입니다.`,
  };
}

function occupancy(d: ChildcareInsightInput): Insight | null {
  if (d.capacity == null || d.capacity < 1 || d.currentCount == null) return null;
  const occ = d.currentCount / d.capacity;
  const pct = Math.round(occ * 100);
  const judge = occ >= 0.9 ? '정원에 거의 찬 편입니다'
    : occ >= 0.7 ? '보통 수준입니다'
    : '정원에 여유가 있는 편입니다';
  return { key: 'occupancy', text: `현원 ${d.currentCount}명으로 충원율 ${pct}%로 ${judge}.` };
}

function wait(d: ChildcareInsightInput): Insight | null {
  const w = d.waitByAge.filter((x) => x.count > 0);
  const total = w.reduce((s, x) => s + x.count, 0);
  if (total < 3) return null;
  const top = [...w].sort((a, b) => b.count - a.count)[0];
  const share = Math.round((top.count / total) * 100);
  return {
    key: 'wait',
    text: share >= 60
      ? `대기 ${total}명 중 ${top.label}가 ${top.count}명(약 ${share}%)으로 ${top.label} 반 입소 경쟁이 특히 치열합니다.`
      : `총 ${total}명이 입소 대기 중이며 ${top.label} 대기가 가장 많습니다.`,
  };
}

function ratio(d: ChildcareInsightInput): Insight | null {
  if (!d.staffCount || d.staffCount < 1 || !d.currentCount) return null;
  const r = d.currentCount / d.staffCount;
  return { key: 'ratio', text: `교직원 ${d.staffCount}명 기준 1인당 원아 약 ${r.toFixed(1)}명입니다.` };
}

function facility(d: ChildcareInsightInput): Insight | null {
  const parts: string[] = [];
  if (d.roomSize != null && d.currentCount && d.currentCount > 0) {
    parts.push(`원아 1인당 보육실 약 ${(d.roomSize / d.currentCount).toFixed(1)}㎡`);
  }
  if (d.cctvCount != null && d.cctvCount > 0) parts.push(`CCTV ${d.cctvCount}대`);
  if (d.vehicleOp && d.vehicleOp.includes('운영') && !d.vehicleOp.includes('미운영')) {
    parts.push('통학차량 운영');
  }
  if (parts.length < 2) return null;
  return { key: 'facility', text: `${parts.join(', ')} 등을 갖췄습니다.` };
}

export function buildChildcareNarrative(d: ChildcareInsightInput): Narrative | null {
  const mods = [
    intro(d),
    occupancy(d),
    wait(d),
    ratio(d),
    facility(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['occupancy', 'wait'] });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-childcare.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/childcare.ts tests/lib/insights-childcare.test.ts
git commit -m "feat(insights): 어린이집 해석 프로즈 엔진(충원율·대기·시설 파생판단)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 5: 어린이집 로더 + 페이지 배선

**Files:**
- Create: `lib/insights/childcare-loader.ts`
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildChildcareNarrative` (Task 4); `getChildcareById`, `getChildcareLatLng` (`@/lib/childcare`); `getNearbyApartments`, `getNearbyInfra` (`@/lib/amenity/nearby`); `getNearbySubwayStations` (`@/lib/subway/nearby`); `provenanceNodes`, `placeSchema` (Task 2); `InsightSection` (Task 3)
- Produces:
  ```ts
  export const cachedChildcareById, cachedChildcareLatLng, cachedNearbyApartments, cachedNearbyInfraCC, cachedNearbySubwayCC;
  export const loadChildcareInsight: (id: bigint) => Promise<{ narrative: Narrative | null; dateModified?: string }>;
  ```

- [ ] **Step 1: Create the loader**

Create `lib/insights/childcare-loader.ts`:

```ts
import { cache } from 'react';
import { getChildcareById, getChildcareLatLng } from '@/lib/childcare';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildChildcareNarrative } from '@/lib/insights/childcare';
import type { Narrative } from '@/lib/insights/shared';

// 로더와 페이지가 같은 인자로 호출하면 요청당 1회로 dedupe된다.
export const cachedChildcareById = cache(getChildcareById);
export const cachedChildcareLatLng = cache(getChildcareLatLng);
export const cachedNearbyApartments = cache(getNearbyApartments);
export const cachedNearbyInfraCC = cache((lat: number, lng: number) => getNearbyInfra(lat, lng));
export const cachedNearbySubwayCC = cache(getNearbySubwayStations);

// cpmsapi030 대기 연령 코드 → 라벨 (childcare-wait-list.tsx와 동일)
const WAIT_AGES: [string, string][] = [
  ['waitCnt00', '만 0세'], ['waitCnt01', '만 1세'], ['waitCnt02', '만 2세'],
  ['waitCnt03', '만 3세'], ['waitCnt04', '만 4세'], ['waitCnt05', '만 5세'], ['waitCntM6', '6세 이상'],
];

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export const loadChildcareInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null; dateModified?: string }> => {
    const item = await cachedChildcareById(id);
    if (!item) return { narrative: null };
    const coord = await cachedChildcareLatLng(id);
    const [apts, infra, subway] = await Promise.all([
      coord ? cachedNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraCC(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayCC(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    ]);

    const narrative = buildChildcareNarrative({
      name: item.name,
      crType: item.crType,
      capacity: item.capacity,
      currentCount: item.currentCount,
      staffCount: item.staffCount,
      waitByAge: WAIT_AGES.map(([k, label]) => ({ label, count: (item as Record<string, unknown>)[k] as number ?? 0 }))
        .filter((x) => x.count > 0),
      roomSize: item.roomSize,
      cctvCount: item.cctvCount,
      vehicleOp: item.vehicleOp,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    return { narrative, dateModified: toUtcDate(item.dataStdDate) };
  },
);
```

> `item.dataStdDate` is `DateTime? @db.Date` on the Childcare model. `saleLastPrice` on `NearbyApartment` is 만원. `getNearbyInfra` returns `InfraCategory[]` (`{label, items}`); count = `items.length`.

- [ ] **Step 2: Wire generateMetadata (robots + description)**

In `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`, add imports:
```tsx
import { loadChildcareInsight, cachedChildcareById, cachedChildcareLatLng, cachedNearbyApartments, cachedNearbyInfraCC, cachedNearbySubwayCC } from '@/lib/insights/childcare-loader';
import { InsightSection } from '@/components/ui/insight-section';
import { provenanceNodes } from '@/lib/seo/json-ld'; // 기존 json-ld import 줄에 합쳐도 됨
```

Replace `generateMetadata` body from `const item = …` through the `return { … }` with:
```tsx
  const itemId = parseId(id);
  const item = itemId == null ? null : await cachedChildcareById(itemId).catch(() => null);
  if (!item) return {};
  const { narrative } = itemId == null ? { narrative: null } : await loadChildcareInsight(itemId);
  const indexable = !!narrative && narrative.fired.length >= 3;
  const parts: string[] = [];
  if (item.capacity != null) parts.push(`정원 ${item.capacity.toLocaleString('ko-KR')}명`);
  if (item.currentCount != null) parts.push(`현원 ${item.currentCount.toLocaleString('ko-KR')}명`);
  if (item.staffCount != null) parts.push(`교직원 ${item.staffCount.toLocaleString('ko-KR')}명`);
  const stat = parts.length ? ` ${parts.join('·')}` : '';
  const type = item.crType ? `(${item.crType})` : '';
  return {
    title: `${item.name} — ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`,
    description: narrative?.text.slice(0, 150) ?? `${item.name}${type}${stat}. 도보권 아파트 실거래가와 보육정보를 한눈에.`,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
  };
```

- [ ] **Step 3: Wire the page body (cache fetch, narrative, JSON-LD, prose)**

In `ChildcareDetailPage`:

(a) Replace the `Promise.all([getChildcareById(itemId), getSigunguByCode(sigunguCode)])` — change `getChildcareById` → `cachedChildcareById`.

(b) Replace `const coord = await getChildcareLatLng(itemId);` → `const coord = await cachedChildcareLatLng(itemId);`

(c) In the second `Promise.all` (apts/infra/nearbyChildren/otherList/subway): change `getNearbyApartments(coord.lat, coord.lng)` → `cachedNearbyApartments(coord.lat, coord.lng)`, `getNearbyInfra(coord.lat, coord.lng)` → `cachedNearbyInfraCC(coord.lat, coord.lng)`, `getNearbySubwayStations(coord.lat, coord.lng)` → `cachedNearbySubwayCC(coord.lat, coord.lng)`. Leave `getNearbyChildcare` and `getChildcareList` unchanged.

(d) After that `Promise.all` block (after `const others = …`), add:
```tsx
  const { narrative, dateModified } = await loadChildcareInsight(itemId);
```

(e) In the `<JsonLd data={[...]}/>`, replace the `placeSchema({...})` call to add `id`/`mainEntityOfPageId`, and append provenance nodes:
```tsx
        data={[
          placeSchema({
            type: 'ChildCare',
            name: item.name,
            address: item.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/childcare/${sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            telephone: item.tel,
            id: `${SITE_URL}/childcare/${sigunguCode}/${id}#childcare`,
            mainEntityOfPageId: `${SITE_URL}/childcare/${sigunguCode}/${id}#webpage`,
          }),
          breadcrumbSchema([ /* 기존 그대로 */
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '어린이집찾기', url: `${SITE_URL}/childcare` },
            { name: item.name, url: `${SITE_URL}/childcare/${sigunguCode}/${id}` },
          ]),
          ...provenanceNodes({
            url: `${SITE_URL}/childcare/${sigunguCode}/${id}`,
            name: item.name,
            sourceId: 'childcare',
            entityId: `${SITE_URL}/childcare/${sigunguCode}/${id}#childcare`,
            dateModified,
          }),
        ]}
```

(f) Add the prose section right after `<ChildcareHero item={item} />`:
```tsx
      <ChildcareHero item={item} />
      {narrative && <InsightSection sentences={narrative.sentences} />}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm build 2>&1 | tail -20`
Expected: build succeeds; `/childcare/[sigunguCode]/[id]` compiles.

- [ ] **Step 5: Manual acceptance (dev server)**

Run: `pnpm exec dotenv -e .env.local -- next dev` and open a data-rich childcare detail (정원·현원·대기 있는 시설) and a sparse one.

Verify:
- Rich: `view-source:`에 "한눈에 보기" 문단 + `application/ld+json`의 `WebPage`/`Dataset`(sourceOrganization=보건복지부) 노드가 JS 없이. 문장에 충원율·대기 파생 판단.
- Sparse(데이터 거의 없음): 프로즈 없음 + `<meta name="robots" content="noindex, follow">`. 기존 표·지도·목록 정상.
- `dateModified`가 `dataStdDate` 값으로 노출(있을 때).

- [ ] **Step 6: Commit**

```bash
git add lib/insights/childcare-loader.ts "app/(public)/childcare/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(childcare): 한눈에 보기+출처 JSON-LD+조건부 noindex 배선(캐시 로더)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 6: 전체 회귀 확인

**Files:** 없음(검증만)

- [ ] **Step 1: 유닛 스위트**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-shared.test.ts tests/lib/insights-childcare.test.ts tests/lib/insights-apt.test.ts tests/lib/json-ld-provenance.test.ts`
Expected: 전부 PASS (shared·childcare·apt·provenance).

- [ ] **Step 2: 타입체크 전체**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: 아파트 계열 무회귀 육안**

`app/(public)/{apt,officetel,villa}/[id]/page.tsx`가 `InsightSection`을 렌더하고, `aptProvenanceNodes` 출력이 이전과 동일(WebPage·Dataset·GovOrg, 국토교통부)한지 dev 서버로 대표 1건 확인.

---

## Self-Review (플랜 작성자 체크)

**Spec coverage**
- 공유 A/C·조립(§4) → Task 1 ✅
- 어린이집 엔티티 모듈(§5) → Task 4 ✅
- 일반화 provenanceNodes + placeSchema id(§6) → Task 2 ✅
- InsightSection 개명(§7) → Task 3 ✅
- 로더·robots·description·프로즈·dateModified=dataStdDate(§8) → Task 5 ✅
- 테스트·회귀(§9) → Task 1·2·4 유닛 + Task 5 수동 + Task 6 회귀 ✅
- 아파트 무회귀(Global Constraint) → Task 1 Step5·Task 2 note·Task 6 ✅

**Placeholder scan**: TBD/TODO 없음. 코드 블록 완성.

**Type consistency**: `Insight`/`Narrative`(shared, Task1) ↔ childcare(Task4)·loader(Task5) 일치. `buildChildcareNarrative(ChildcareInsightInput)→Narrative` ↔ 로더 사용 일치. `provenanceNodes({url,name,sourceId,entityId,dateModified?})`(Task2) ↔ 페이지 호출(Task5) 일치. `InsightSection({sentences})`(Task3) ↔ 페이지(Task5) 일치. `WAIT_AGES` 라벨 ↔ childcare-wait-list.tsx 동일. 단위 만원 일관.
