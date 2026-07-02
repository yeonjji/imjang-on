# 공원 카테고리 인사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공원 상세(`urban/[category]/[id]`의 park 분기)에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex를 프레임워크 재사용으로 도입.

**Architecture:** 프레임워크(#181: `shared.ts`·`provenanceNodes`·`InsightSection`)와 병원 로더 패턴(#182)을 재사용. 신규는 공원 엔티티 모듈(`park.ts`) + 캐시 로더(`park-loader.ts`)뿐. 공유 라우트라 **`def.slug === 'park'` 분기 한정**으로 배선(parking/charger 무회귀). #180 병합으로 `Park.referenceDate` → dateModified.

**Tech Stack:** Next.js App Router(RSC/ISR `revalidate=86_400`), TypeScript, Prisma+Supabase(PostGIS), React `cache()`, Vitest, pnpm.

## Global Constraints

- 표 재서술 금지 — 각 문장은 파생 판단(면적 규모·유형·접근성·시세)만. synonym spinning(뜻 같은 문구 로테이션) 금지.
- 데이터 부족 시 침묵 + `noindex, follow`. 프로즈와 JSON-LD 병행. 표시값과 프로즈 값 일치.
- `dateModified`는 `Park.referenceDate`(`@db.Date`)의 `toISOString().slice(0,10)`만 사용. `updatedAt` 사용 금지(가짜 신선도). referenceDate 없으면 dateModified 생략.
- 돈은 만원 단위 입력, 억 표시(`formatBillion`, 공유 C가 처리).
- **park 분기 한정 배선** — 다른 urban 카테고리(parking·charger) 동작 무변경.
- 공유 모듈(`shared.ts`)·`provenanceNodes`·`InsightSection` **무변경**(재사용만).

---

### Task 1: 브랜치 생성 + #180 병합 (`Park.referenceDate` 도입)

**Files:**
- Merge: `origin/feat/park-reference-date` (Park.referenceDate 필드 + 마이그레이션 `20260701000000_add_park_reference_date` + ingest 어댑터)

**Interfaces:**
- Consumes: 현재 HEAD = `feat/category-insight-hospital`(#182, 프레임워크+병원).
- Produces: `Park` 모델에 `referenceDate: DateTime? @db.Date` 필드 + 이를 포함한 Prisma Client 타입. 후속 Task의 로더가 `park.raw.referenceDate`로 접근.

- [ ] **Step 1: park 브랜치 생성**

```bash
git checkout -b feat/category-insight-park
```

- [ ] **Step 2: #180 병합**

```bash
git merge --no-edit origin/feat/park-reference-date
```

Expected: 충돌 없음(#180은 Park 모델·ingest만 건드리고, #182와 겹치지 않음). 충돌 시 `prisma/schema.prisma`는 양쪽 변경을 모두 살린다(referenceDate 필드 추가 + 병원 변경 유지).

- [ ] **Step 3: Prisma Client 재생성**

```bash
pnpm prisma generate
```

Expected: 에러 없이 완료. 이후 `import type { Park } from '@prisma/client'`에 `referenceDate`가 포함된다.

- [ ] **Step 4: 마이그레이션 상태 확인**

```bash
pnpm dotenv -e .env.test -- prisma migrate status
```

Expected: `20260701000000_add_park_reference_date` 포함 목록 출력(운영 반영 여부와 무관, 파일 존재 확인 목적). 로컬 검증 DB는 `.env.test`.

- [ ] **Step 5: 타입·기존 테스트 무회귀 확인**

```bash
pnpm tsc --noEmit && pnpm vitest run tests/ingest/amenities/adapter-park.test.ts
```

Expected: tsc 통과, park ingest 어댑터 테스트 PASS(#180이 가져온 테스트 포함).

- [ ] **Step 6: 커밋 불필요(병합 커밋으로 충분)**

병합 커밋이 이미 생성됨. 별도 커밋 없음. `git log --oneline -3`으로 병합 커밋 확인.

---

### Task 2: 공원 엔티티 모듈 `lib/insights/park.ts`

**Files:**
- Create: `lib/insights/park.ts`
- Test: `tests/lib/insights-park.test.ts`

**Interfaces:**
- Consumes: `@/lib/insights/shared`의 `accessInsight(d)`, `priceContextInsight(d)`, `assembleNarrative(name, mods, opts)`, `type Insight`, `type Narrative`.
  - `accessInsight({ nearestStation: {name,lines,distanceMeters}|null, infra: {label,count}[] }) → Insight|null` (key `'access'`)
  - `priceContextInsight({ nearbyAptSaleManwon: number[] }) → Insight|null` (key `'price'`, 유효 원소 3개 미만이면 null)
  - `assembleNarrative(name, mods, { minFired, requireKeys }) → Narrative|null` — 첫 발화 모듈 text에 `${name}은/는 ` prefix 부착.
- Produces: `buildParkNarrative(input: ParkInsightInput): Narrative | null`, `interface ParkInsightInput`.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/insights-park.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildParkNarrative, type ParkInsightInput } from '@/lib/insights/park';

const base: ParkInsightInput = {
  name: '중앙근린공원',
  parkType: '근린공원',
  area: 32000,
  nearestStation: { name: '시청역', lines: ['1호선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 5 }, { label: '병원', count: 3 }, { label: '약국', count: 2 }],
  nearbyAptSaleManwon: [90000, 130000, 175000],
};

describe('buildParkNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 intro+access+price 발화', () => {
    const n = buildParkNarrative(base)!;
    expect(n.sentences[0].startsWith('중앙근린공원은')).toBe(true);
    expect(n.fired).toEqual(['intro', 'access', 'price']);
  });

  it('intro 대규모: 면적 10만㎡ 이상이면 "대규모" 수식', () => {
    const t = buildParkNarrative({ ...base, area: 125000 })!.text;
    expect(t).toContain('면적 12.5만㎡의 대규모 근린공원입니다');
  });

  it('intro 무수식: 1만~10만㎡ 사이는 규모 수식 없음', () => {
    expect(buildParkNarrative({ ...base, area: 32000 })!.text).toContain('면적 3.2만㎡의 근린공원입니다');
  });

  it('intro 소규모: 1만㎡ 미만이면 "소규모" + 콤마 표기', () => {
    const t = buildParkNarrative({ ...base, area: 1850, parkType: '어린이공원' })!.text;
    expect(t).toContain('면적 1,850㎡의 소규모 어린이공원입니다');
  });

  it('면적 정수 만이면 소수점 없음(5만㎡)', () => {
    expect(buildParkNarrative({ ...base, area: 50000 })!.text).toContain('면적 5만㎡의 근린공원입니다');
  });

  it('면적 경계 1만㎡는 소규모 아님', () => {
    expect(buildParkNarrative({ ...base, area: 10000 })!.text).toContain('면적 1만㎡의 근린공원입니다');
  });

  it('area 없고 parkType만 있으면 유형 문장만', () => {
    const n = buildParkNarrative({ ...base, area: null })!;
    expect(n.text).toContain('중앙근린공원은 근린공원입니다');
    expect(n.fired).toContain('intro');
  });

  it('area·parkType 다 없으면 intro 미발화 → requireKeys 미충족 → null', () => {
    expect(buildParkNarrative({ ...base, area: null, parkType: null })).toBeNull();
  });

  it('게이트: intro만 발화(access·price 없음)면 minFired 2 미달 → null', () => {
    expect(
      buildParkNarrative({ ...base, nearestStation: null, infra: [], nearbyAptSaleManwon: [] }),
    ).toBeNull();
  });

  it('게이트: intro + access(역만)면 발화', () => {
    const n = buildParkNarrative({ ...base, infra: [], nearbyAptSaleManwon: [] })!;
    expect(n.fired).toEqual(['intro', 'access']);
  });

  it('parkType 없고 area만 있으면 "도시공원"으로 대체', () => {
    expect(buildParkNarrative({ ...base, parkType: null, area: 32000 })!.text).toContain('면적 3.2만㎡의 도시공원입니다');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/insights-park.test.ts`
Expected: FAIL — `Cannot find module '@/lib/insights/park'`.

- [ ] **Step 3: 모듈 구현**

Create `lib/insights/park.ts`:

```ts
import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface ParkInsightInput {
  name: string;
  parkType: string | null;
  area: number | null; // ㎡
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function formatArea(area: number): string {
  if (area >= 10000) {
    const man = area / 10000;
    return `${Number.isInteger(man) ? man : man.toFixed(1)}만㎡`;
  }
  return `${area.toLocaleString('ko-KR')}㎡`;
}

function intro(d: ParkInsightInput): Insight | null {
  const hasArea = d.area != null && d.area > 0;
  if (!hasArea && !d.parkType) return null;
  const typeWord = d.parkType || '도시공원';
  if (hasArea) {
    const area = d.area!;
    const size = area >= 100000 ? '대규모 ' : area < 10000 ? '소규모 ' : '';
    return { key: 'intro', text: `면적 ${formatArea(area)}의 ${size}${typeWord}입니다.` };
  }
  return { key: 'intro', text: `${typeWord}입니다.` };
}

export function buildParkNarrative(d: ParkInsightInput): Narrative | null {
  // 자연 순서: 소개(면적·유형) → 입지(접근성) → 시세.
  const mods = [
    intro(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 2, requireKeys: ['intro'] });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/insights-park.test.ts`
Expected: PASS(11 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/insights/park.ts tests/lib/insights-park.test.ts
git commit -m "feat(insights): 공원 해석 프로즈 엔진(면적 규모·유형 파생판단)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

### Task 3: `PlaceType 'Park'` + 로더 + 페이지 배선

**Files:**
- Modify: `lib/seo/json-ld.tsx` (PlaceType 유니온에 `'Park'` 추가)
- Create: `lib/insights/park-loader.ts`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx` (park 분기 한정 배선)

**Interfaces:**
- Consumes:
  - Task 2의 `buildParkNarrative(ParkInsightInput)`.
  - `@/lib/urban/detail`: `getUrbanById(slug, id) → Promise<UrbanItem|null>`, `getUrbanLatLng(slug, id) → Promise<{lat,lng}|null>`. `UrbanItem.raw`는 park일 때 `Park`(Prisma) — `referenceDate`·`area`·`parkType` 보유(Task 1 이후).
  - `@/lib/amenity/nearby`: `getNearbyApartments(lat,lng) → NearbyApartment[]`(`.saleLastPrice: number|null`), `getNearbyInfra(lat,lng,{excludeParkId,includeChildcare}) → {label,items[]}[]`.
  - `@/lib/subway/nearby`: `getNearbySubwayStations(lat,lng) → {stations:{name,lines,distanceMeters}[], fallback}`.
  - `@/lib/seo/json-ld`: `placeSchema({type:'Park', name,address,lat,lng,url,image,id,mainEntityOfPageId})`, `breadcrumbSchema(items)`, `provenanceNodes({url,name,sourceId:'mois-park',entityId,dateModified?})`, `JsonLd`.
  - `@/components/ui/insight-section`: `InsightSection({sentences})`.
- Produces: `loadParkInsight(id) → Promise<{narrative:Narrative|null; dateModified?:string}>` + 캐시 래퍼 `cachedParkById`·`cachedParkLatLng`·`cachedNearbyAptsPark`·`cachedNearbyInfraPark`·`cachedNearbySubwayPark`.

- [ ] **Step 1: PlaceType에 'Park' 추가**

Modify `lib/seo/json-ld.tsx` (line 87):

```ts
export type PlaceType = 'School' | 'Hospital' | 'Pharmacy' | 'ChildCare' | 'Park';
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 통과(유니온 확장만).

- [ ] **Step 3: 로더 작성**

Create `lib/insights/park-loader.ts`:

```ts
import { cache } from 'react';
import type { Park } from '@prisma/client';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildParkNarrative } from '@/lib/insights/park';
import type { Narrative } from '@/lib/insights/shared';

export const cachedParkById = cache((id: bigint) => getUrbanById('park', id));
export const cachedParkLatLng = cache((id: bigint) => getUrbanLatLng('park', id));
export const cachedNearbyAptsPark = cache(getNearbyApartments);
// park 페이지 infra fetch는 excludeParkId를 넘긴다. 3인자를 그대로 받아 cache 키를 맞춘다.
export const cachedNearbyInfraPark = cache((lat: number, lng: number, excludeParkId: bigint) =>
  getNearbyInfra(lat, lng, { excludeParkId, includeChildcare: true }),
);
export const cachedNearbySubwayPark = cache(getNearbySubwayStations);

export const loadParkInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null; dateModified?: string }> => {
    const item = await cachedParkById(id);
    if (!item) return { narrative: null };
    const park = item.raw as Park;
    const coord = await cachedParkLatLng(id);
    const [apts, infra, subway] = await Promise.all([
      coord ? cachedNearbyAptsPark(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraPark(coord.lat, coord.lng, id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayPark(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    ]);

    const narrative = buildParkNarrative({
      name: item.name,
      parkType: park.parkType,
      area: park.area,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    const dateModified = park.referenceDate ? park.referenceDate.toISOString().slice(0, 10) : undefined;
    return { narrative, dateModified };
  },
);
```

- [ ] **Step 4: 로더 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 통과.

- [ ] **Step 5: 페이지 import 추가**

Modify `app/(public)/urban/[category]/[id]/page.tsx` — import 블록(기존 line 1~29)에 추가:

```ts
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
import {
  loadParkInsight,
  cachedParkLatLng,
  cachedNearbyAptsPark,
  cachedNearbyInfraPark,
  cachedNearbySubwayPark,
} from '@/lib/insights/park-loader';
```

- [ ] **Step 6: generateMetadata park 분기 추가**

Replace the `return {...}` in `generateMetadata` (기존 line 42~46) with a park branch before it:

```ts
  if (def.slug === 'park') {
    const { narrative } = await loadParkInsight(BigInt(id));
    const indexable = !!narrative && narrative.fired.length >= 2;
    return {
      title: `${item.name} — 공원 정보·주변 아파트`,
      description:
        narrative?.text.slice(0, 150) ??
        `${item.name} 공원 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
      robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
      alternates: { canonical: `/urban/park/${id}` },
    };
  }
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
```

- [ ] **Step 7: 본문 fetch를 park 분기에서 캐시 래퍼로 교체 + coord dedup**

In `UrbanDetailPage` body, replace the `coord` fetch (기존 line 62~65 `Promise.all([...region, coord...])`) so park uses `cachedParkLatLng`. Change:

```ts
  const [region, coord] = await Promise.all([
    sigunguCode ? getSigunguByCode(sigunguCode).catch(() => null) : Promise.resolve(null),
    def.slug === 'park' ? cachedParkLatLng(itemId) : getUrbanLatLng(def.slug, itemId),
  ]);
```

Then replace the nearby `Promise.all` (기존 line 72~81) with park-aware wrappers:

```ts
  const isPark = def.slug === 'park';
  const [apts, infra, otherList, subway] = await Promise.all([
    coord
      ? (isPark ? cachedNearbyAptsPark(coord.lat, coord.lng) : getNearbyApartments(coord.lat, coord.lng))
      : Promise.resolve([] as NearbyApartment[]),
    coord
      ? (isPark
          ? cachedNearbyInfraPark(coord.lat, coord.lng, itemId)
          : getNearbyInfra(coord.lat, coord.lng, { ...exclude, includeChildcare: true }))
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
    coord
      ? (isPark ? cachedNearbySubwayPark(coord.lat, coord.lng) : getNearbySubwayStations(coord.lat, coord.lng))
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative, dateModified } = isPark
    ? await loadParkInsight(itemId)
    : { narrative: null, dateModified: undefined as string | undefined };
```

(`exclude`는 기존 line 69~70 정의 유지. park일 때 `cachedNearbyInfraPark`가 `excludeParkId`를 내부에서 처리하므로 `exclude`는 parking 경로에서만 쓰인다.)

- [ ] **Step 8: JSON-LD + InsightSection 렌더 추가**

In the JSX return, insert park-only `<JsonLd>` at the top of the outer `<div>` (기존 line 92~93 `return ( <div ...>` 직후, `<nav>` 앞):

```tsx
      {isPark && (
        <JsonLd
          data={[
            placeSchema({
              type: 'Park',
              name: item.name,
              address: item.address,
              lat: coord?.lat,
              lng: coord?.lng,
              url: `${SITE_URL}/urban/park/${id}`,
              image: coord ? staticMapUrl(coord) : undefined,
              id: `${SITE_URL}/urban/park/${id}#park`,
              mainEntityOfPageId: `${SITE_URL}/urban/park/${id}#webpage`,
            }),
            breadcrumbSchema([
              { name: '홈', url: `${SITE_URL}/` },
              { name: '생활편의', url: `${SITE_URL}/life` },
              { name: '도시인프라', url: `${SITE_URL}/life/urban` },
              { name: '공원', url: `${SITE_URL}/urban/park` },
              { name: item.name, url: `${SITE_URL}/urban/park/${id}` },
            ]),
            ...provenanceNodes({
              url: `${SITE_URL}/urban/park/${id}`,
              name: item.name,
              sourceId: 'mois-park',
              entityId: `${SITE_URL}/urban/park/${id}#park`,
              dateModified,
            }),
          ]}
        />
      )}
```

Then insert `<InsightSection>` right after `<UrbanHero item={item} def={def} />` (기존 line 103):

```tsx
      <UrbanHero item={item} def={def} />
      {narrative && <InsightSection sentences={narrative.sentences} />}
```

- [ ] **Step 9: 타입 + 전체 인사이트 스위트 확인**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/lib/insights-park.test.ts tests/lib/insights-hospital.test.ts`
Expected: tsc 통과, 공원·병원 스위트 PASS(회귀 없음).

- [ ] **Step 10: 프로덕션 빌드로 라우트 컴파일 확인**

Run: `pnpm build 2>&1 | tail -20`
Expected: 빌드 성공. `urban/[category]/[id]` 라우트 에러 없음.

- [ ] **Step 11: 커밋**

```bash
git add lib/seo/json-ld.tsx lib/insights/park-loader.ts "app/(public)/urban/[category]/[id]/page.tsx"
git commit -m "feat(park): 한눈에 보기+출처 JSON-LD+조건부 noindex 배선(캐시 로더, park 분기 한정)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## 자체 검토 결과 (writing-plans self-review)

**1. 스펙 커버리지:**
- §3 아키텍처(프레임워크 재사용, park 분기 한정) → Task 3 Step 6~8.
- §4 엔티티 모듈(intro 규모 구간·면적 표기·게이트) → Task 2.
- §5 출처·dateModified(placeSchema Park·provenanceNodes mois-park·referenceDate toISOString) → Task 3 Step 1·3·8.
- §6 로더·페이지 배선(캐시 dedup·robots·description) → Task 3 Step 3·6·7·8.
- §7 테스트(유닛·회귀·빌드) → Task 2 Step 4, Task 3 Step 9·10.
- §10 #180 병합·머지 순서 → Task 1.
- 갭 없음.

**2. Placeholder 스캔:** 없음. 모든 코드 스텝에 완전한 코드 포함.

**3. 타입 일관성:** `ParkInsightInput`(Task 2 정의) ↔ Task 3 로더의 `buildParkNarrative` 호출 인자 일치. `loadParkInsight` 반환 `{narrative, dateModified?}` ↔ Task 3 페이지 소비 일치. `cachedNearbyInfraPark(lat,lng,excludeParkId:bigint)` 3인자 ↔ 호출 `cachedNearbyInfraPark(coord.lat, coord.lng, itemId)` 일치.
