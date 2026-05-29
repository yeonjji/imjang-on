# 도시인프라 · 주차장 LIST/DETAIL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/urban/parking` LIST/DETAIL을 amenity 패턴 미러로 구축하고 33컬럼 풀 활용 (운영시간/요금/부대정보/주변상권 혼합).

**Architecture:** `lib/urban/` 자체 레지스트리(`parkingDef` 1종 등록, 공원·충전소 슬롯). `app/(public)/urban/[category]/` 동형 라우트. 카테고리 전용 섹션은 `parking-*.tsx`로 분리하고 `def.renderRichSections()`이 트리 반환. 공유 컴포넌트(`NaverMap`/`NearbyApartments`/`NearbyAmenitiesMixed`)는 amenity에서 import.

**Tech Stack:** Next.js 14 App Router · TypeScript · Prisma (Parking 모델) · Tailwind · Vitest · Playwright.

**Reference spec:** `docs/superpowers/specs/2026-05-29-urban-list-detail-design.md`

---

## File Structure

```
lib/urban/
  category.ts                          ← Task 1
  parking-hours.ts                     ← Task 2
  parking-fees.ts                      ← Task 3
  region-from-address.ts               ← Task 4
  adapters/parking.ts                  ← Tasks 5–6
  list.ts                              ← Task 7
  detail.ts                            ← Task 7
  nearby.ts                            ← Task 7

app/(public)/urban/
  [category]/
    page.tsx                           ← Task 12 (LIST)
    [id]/page.tsx                      ← Task 18 (DETAIL)
    _components/
      urban-card.tsx                   ← Task 8
      urban-filter-panel.tsx           ← Task 9
      urban-mobile-filter-sheet.tsx    ← Task 10
      urban-pagination.tsx             ← Task 11
      urban-hero.tsx                   ← Task 13
      urban-info.tsx                   ← Task 13
      parking-hours-table.tsx          ← Task 14
      parking-fee-grid.tsx             ← Task 15
      parking-extras.tsx               ← Task 16
      urban-same-category-nearby.tsx   ← Task 17
      urban-detail-sidebar.tsx         ← Task 17

Modify:
  app/(public)/_components/life-menu.ts   ← Task 19 (urban items href + live)
  app/sitemap.ts                          ← Task 19 (parking URLs)
  tests/e2e/seed.ts                       ← Task 20 (parking 시드)

Tests (Create):
  tests/lib/urban-parking-hours.test.ts          ← Task 2
  tests/lib/urban-parking-fees.test.ts           ← Task 3
  tests/lib/urban-region-from-address.test.ts    ← Task 4
  tests/lib/urban-parking-adapter.test.ts        ← Tasks 5–6
  tests/lib/urban-category.test.ts               ← Task 1
  tests/e2e/urban-parking-list.spec.ts           ← Task 20
  tests/e2e/urban-parking-detail.spec.ts         ← Task 20
  tests/e2e/urban-parking-mobile.spec.ts         ← Task 20

Modify (Tests):
  tests/lib/life-menu.test.ts                   ← Task 19
```

---

### Task 1: `lib/urban/category.ts` — Types & Registry Skeleton

**Files:**
- Create: `lib/urban/category.ts`
- Test: `tests/lib/urban-category.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/urban-category.test.ts
import { describe, it, expect } from 'vitest';
import { URBAN_SLUGS, getUrbanCategoryDef } from '@/lib/urban/category';

describe('urban category registry', () => {
  it('exposes parking as the only live slug', () => {
    expect(URBAN_SLUGS).toEqual(['parking']);
  });

  it('returns parkingDef for "parking"', () => {
    const def = getUrbanCategoryDef('parking');
    expect(def).not.toBeNull();
    expect(def?.slug).toBe('parking');
    expect(def?.label).toBe('주차장');
    expect(def?.emoji).toBe('🅿️');
  });

  it('returns null for unknown slug', () => {
    expect(getUrbanCategoryDef('foo')).toBeNull();
    expect(getUrbanCategoryDef('park')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-category.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write category.ts (with placeholder parkingDef)**

```ts
// lib/urban/category.ts
import type { ReactNode } from 'react';

export type UrbanSlug = 'parking';

export interface UrbanItem<TRow = unknown> {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  raw: TRow;
}

export interface UrbanListFilter {
  sigunguCode?: string;
  sido?: string;
  q?: string;
  sub?: string;        // 공영 / 민영 / all (chip top)
  charge?: string;     // 유료 / 무료
  type?: string;       // 노외 / 노상 / 부설
  pwd?: string;        // 'on' → pwdbsPpkZoneYn=true
  open24?: string;     // 'on' → 평일 0000-2400
}

export interface UrbanListResult<TRow = unknown> {
  rows: UrbanItem<TRow>[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface UrbanSubFilterOption { slug: string; label: string }
export interface UrbanSubFilterDef {
  paramKey: string;
  options: UrbanSubFilterOption[];
  defaultSlug: string;
}

export interface UrbanCategoryDef<TRow = unknown> {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: UrbanSubFilterDef;
  requiresSidoScope?: boolean;
  getList(filter: UrbanListFilter, page: number): Promise<UrbanListResult<TRow>>;
  getById(id: bigint): Promise<UrbanItem<TRow> | null>;
  getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null>;
  inferRowSummary(item: UrbanItem<TRow>): string | null;
  detailFields(item: UrbanItem<TRow>, ctx: { regionFullName: string }): Array<{ label: string; value: string }>;
  renderRichSections(item: UrbanItem<TRow>): ReactNode;
}

import { parkingDef } from './adapters/parking';

export const URBAN_SLUGS = ['parking'] as const satisfies readonly UrbanSlug[];

export const URBAN_CATEGORIES: Record<UrbanSlug, UrbanCategoryDef> = {
  parking: parkingDef,
};

export function getUrbanCategoryDef(slug: string): UrbanCategoryDef | null {
  if ((URBAN_SLUGS as readonly string[]).includes(slug)) {
    return URBAN_CATEGORIES[slug as UrbanSlug];
  }
  return null;
}

export interface UrbanCategoryView {
  slug: UrbanSlug;
  label: string;
  emoji: string;
  breadcrumbLabel: string;
  subFilters?: UrbanSubFilterDef;
}

export function toUrbanCategoryView(def: UrbanCategoryDef): UrbanCategoryView {
  return {
    slug: def.slug,
    label: def.label,
    emoji: def.emoji,
    breadcrumbLabel: def.breadcrumbLabel,
    subFilters: def.subFilters,
  };
}
```

- [ ] **Step 4: Create placeholder `lib/urban/adapters/parking.ts` so import resolves**

```ts
// lib/urban/adapters/parking.ts
import type { UrbanCategoryDef } from '@/lib/urban/category';

export const parkingDef: UrbanCategoryDef = {
  slug: 'parking',
  label: '주차장',
  emoji: '🅿️',
  breadcrumbLabel: '주차장',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '공영', label: '공영' },
      { slug: '민영', label: '민영' },
    ],
  },
  async getList() { throw new Error('not implemented'); },
  async getById() { return null; },
  async getLatLng() { return null; },
  inferRowSummary: () => null,
  detailFields: () => [],
  renderRichSections: () => null,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-category.test.ts`
Expected: PASS — 3/3 tests

- [ ] **Step 6: Commit**

```bash
git add lib/urban/category.ts lib/urban/adapters/parking.ts tests/lib/urban-category.test.ts
git commit -m "feat(urban): UrbanCategoryDef 레지스트리 + parkingDef 스켈레톤"
```

---

### Task 2: `lib/urban/parking-hours.ts` — 24h helper + hours normalize

**Files:**
- Create: `lib/urban/parking-hours.ts`
- Test: `tests/lib/urban-parking-hours.test.ts`

운영시간 두 컬럼 페어(open/close `HHMM`)를 사람 친화 라벨로 정규화. `0000-2400`은 "24시간". 둘 다 null → null. close <= open인 경우(자정 넘어감)도 라벨만 그대로 표시 (해석 책임 회피).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/urban-parking-hours.test.ts
import { describe, it, expect } from 'vitest';
import { formatHourRange, isOpen24, isAllDayOpen24 } from '@/lib/urban/parking-hours';

describe('formatHourRange', () => {
  it('returns "24시간 운영" for 0000-2400', () => {
    expect(formatHourRange('0000', '2400')).toBe('24시간 운영');
  });
  it('returns "HH:MM ~ HH:MM" for normal range', () => {
    expect(formatHourRange('0600', '2200')).toBe('06:00 ~ 22:00');
  });
  it('returns null when either side is null', () => {
    expect(formatHourRange(null, '2200')).toBeNull();
    expect(formatHourRange('0600', null)).toBeNull();
    expect(formatHourRange(null, null)).toBeNull();
  });
  it('returns null for malformed hhmm', () => {
    expect(formatHourRange('abcd', '1200')).toBeNull();
    expect(formatHourRange('25', '99')).toBeNull();
  });
});

describe('isOpen24', () => {
  it('true when both are 0000 and 2400', () => {
    expect(isOpen24('0000', '2400')).toBe(true);
  });
  it('false otherwise', () => {
    expect(isOpen24('0600', '2400')).toBe(false);
    expect(isOpen24('0000', '2200')).toBe(false);
    expect(isOpen24(null, null)).toBe(false);
  });
});

describe('isAllDayOpen24', () => {
  it('true when weekday/sat/holiday all 0000-2400', () => {
    expect(isAllDayOpen24({
      weekdayOpen: '0000', weekdayClose: '2400',
      satOpen: '0000', satClose: '2400',
      holidayOpen: '0000', holidayClose: '2400',
    })).toBe(true);
  });
  it('false when weekday only', () => {
    expect(isAllDayOpen24({
      weekdayOpen: '0000', weekdayClose: '2400',
      satOpen: '0900', satClose: '1800',
      holidayOpen: null, holidayClose: null,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-parking-hours.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// lib/urban/parking-hours.ts
const HHMM = /^([01]\d|2[0-4])([0-5]\d)$/;

function parse(hhmm: string | null | undefined): { h: number; m: number } | null {
  if (!hhmm) return null;
  const m = HHMM.exec(hhmm);
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatHourRange(open: string | null, close: string | null): string | null {
  const o = parse(open);
  const c = parse(close);
  if (!o || !c) return null;
  if (open === '0000' && close === '2400') return '24시간 운영';
  return `${pad(o.h)}:${pad(o.m)} ~ ${pad(c.h)}:${pad(c.m)}`;
}

export function isOpen24(open: string | null, close: string | null): boolean {
  return open === '0000' && close === '2400';
}

export interface HourBlocks {
  weekdayOpen: string | null;
  weekdayClose: string | null;
  satOpen: string | null;
  satClose: string | null;
  holidayOpen: string | null;
  holidayClose: string | null;
}

export function isAllDayOpen24(b: HourBlocks): boolean {
  return isOpen24(b.weekdayOpen, b.weekdayClose)
    && isOpen24(b.satOpen, b.satClose)
    && isOpen24(b.holidayOpen, b.holidayClose);
}

export function hasAnyHours(b: HourBlocks): boolean {
  return Object.values(b).some((v) => v !== null && v !== '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-parking-hours.test.ts`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add lib/urban/parking-hours.ts tests/lib/urban-parking-hours.test.ts
git commit -m "feat(urban): 주차장 운영시간 정규화 helper (24시간 판정 + HH:MM 포맷)"
```

---

### Task 3: `lib/urban/parking-fees.ts` — Fee normalize

**Files:**
- Create: `lib/urban/parking-fees.ts`
- Test: `tests/lib/urban-parking-fees.test.ts`

`chargeInfo='무료'` 우선 규칙. 유료시 4개 키(기본/추가/일주차/월정기)를 표시 가능 항목만 골라 normalize.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/urban-parking-fees.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeFees } from '@/lib/urban/parking-fees';

describe('normalizeFees', () => {
  it('returns { free: true } when chargeInfo is 무료', () => {
    expect(normalizeFees({ chargeInfo: '무료', basicCharge: 500, basicTime: 30, addUnitCharge: 200, addUnitTime: 10, dayCmmtkt: null, monthCmmtkt: null }))
      .toEqual({ free: true, items: [] });
  });
  it('returns paid items when chargeInfo is 유료', () => {
    const r = normalizeFees({ chargeInfo: '유료', basicCharge: 500, basicTime: 30, addUnitCharge: 200, addUnitTime: 10, dayCmmtkt: 10000, monthCmmtkt: 80000 });
    expect(r.free).toBe(false);
    expect(r.items).toEqual([
      { label: '기본요금', value: '30분 500원' },
      { label: '추가단위', value: '10분 200원' },
      { label: '1일권', value: '10,000원' },
      { label: '월정기', value: '80,000원' },
    ]);
  });
  it('skips items whose pair is incomplete', () => {
    const r = normalizeFees({ chargeInfo: '유료', basicCharge: 500, basicTime: null, addUnitCharge: null, addUnitTime: 10, dayCmmtkt: 0, monthCmmtkt: null });
    expect(r.items).toEqual([]); // 0 / partial 페어 제외
  });
  it('chargeInfo null with all-null fees → free:false, items 0', () => {
    const r = normalizeFees({ chargeInfo: null, basicCharge: null, basicTime: null, addUnitCharge: null, addUnitTime: null, dayCmmtkt: null, monthCmmtkt: null });
    expect(r.free).toBe(false);
    expect(r.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-parking-fees.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// lib/urban/parking-fees.ts
export interface FeeInput {
  chargeInfo: string | null;
  basicTime: number | null;
  basicCharge: number | null;
  addUnitTime: number | null;
  addUnitCharge: number | null;
  dayCmmtkt: number | null;
  monthCmmtkt: number | null;
}

export interface FeeItem { label: string; value: string; }

export interface FeeResult {
  free: boolean;
  items: FeeItem[];
}

function fmtKrw(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export function normalizeFees(f: FeeInput): FeeResult {
  if (f.chargeInfo === '무료') return { free: true, items: [] };

  const items: FeeItem[] = [];
  if (f.basicTime && f.basicCharge) items.push({ label: '기본요금', value: `${f.basicTime}분 ${fmtKrw(f.basicCharge).replace('원','')}원` });
  if (f.addUnitTime && f.addUnitCharge) items.push({ label: '추가단위', value: `${f.addUnitTime}분 ${fmtKrw(f.addUnitCharge).replace('원','')}원` });
  if (f.dayCmmtkt && f.dayCmmtkt > 0) items.push({ label: '1일권', value: fmtKrw(f.dayCmmtkt) });
  if (f.monthCmmtkt && f.monthCmmtkt > 0) items.push({ label: '월정기', value: fmtKrw(f.monthCmmtkt) });

  return { free: false, items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-parking-fees.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/urban/parking-fees.ts tests/lib/urban-parking-fees.test.ts
git commit -m "feat(urban): 주차장 요금 normalize helper (chargeInfo 우선 + 4종 페어)"
```

---

### Task 4: `lib/urban/region-from-address.ts` — sigunguCode resolver

**Files:**
- Create: `lib/urban/region-from-address.ts`
- Test: `tests/lib/urban-region-from-address.test.ts`

주소 prefix → sigunguCode. `lib/region`의 sido/sigungu 카탈로그를 가져와 가장 긴 prefix 매칭을 우선. 매칭 실패 시 null.

- [ ] **Step 1: Quick recon — confirm `lib/region.ts` exports a sigungu catalog**

```bash
grep -E "^export (const|function|async)" lib/region.ts | head -10
```
Note exported names (예: `SIGUNGU_LIST`, `getSidoList`, `getSigunguByCode`, `sidoPrefix`, `sidoFromPrefix`). 카탈로그가 sync 배열이 아니라 DB 조회면 helper도 async로 작성한다.

- [ ] **Step 2: Write the failing test (sync 가정; async라면 step 3에서 즉시 조정)**

```ts
// tests/lib/urban-region-from-address.test.ts
import { describe, it, expect } from 'vitest';
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';

describe('resolveSigunguFromAddress', () => {
  it('returns sigunguCode for full address with sigungu name', async () => {
    // 서울특별시 마포구 → 11440 (region 카탈로그상)
    expect(await resolveSigunguFromAddress('서울특별시 마포구 신촌로 100')).toBe('11440');
  });
  it('handles compact sido 서울 + sigungu', async () => {
    expect(await resolveSigunguFromAddress('서울 마포구 신촌로 100')).toBe('11440');
  });
  it('returns null when no sigungu matches', async () => {
    expect(await resolveSigunguFromAddress('미상지역')).toBeNull();
    expect(await resolveSigunguFromAddress(null)).toBeNull();
    expect(await resolveSigunguFromAddress('')).toBeNull();
  });
});
```

> 시드 region 데이터에 11440(마포구)이 없으면 시드된 다른 시군구로 케이스를 교체한다.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-region-from-address.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement**

```ts
// lib/urban/region-from-address.ts
import { prisma } from '@/lib/db';

let cache: Array<{ code: string; sido: string; sigungu: string; fullName: string }> | null = null;

async function loadCatalog() {
  if (cache) return cache;
  const rows = await prisma.region.findMany({
    select: { code: true, sido: true, sigungu: true, fullName: true },
  });
  cache = rows
    .map((r) => ({ code: r.code, sido: r.sido ?? '', sigungu: r.sigungu ?? '', fullName: r.fullName ?? '' }))
    .filter((r) => r.sigungu && r.sido)
    // 긴 sigungu name 우선 매칭 (수원시 영통구 vs 수원시)
    .sort((a, b) => b.sigungu.length - a.sigungu.length);
  return cache;
}

// 시도 alias: '서울특별시' ↔ '서울' 양방 매칭
const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ['서울특별시', '서울'],
  부산광역시: ['부산광역시', '부산'],
  대구광역시: ['대구광역시', '대구'],
  인천광역시: ['인천광역시', '인천'],
  광주광역시: ['광주광역시', '광주'],
  대전광역시: ['대전광역시', '대전'],
  울산광역시: ['울산광역시', '울산'],
  세종특별자치시: ['세종특별자치시', '세종'],
  경기도: ['경기도', '경기'],
  강원특별자치도: ['강원특별자치도', '강원도', '강원'],
  충청북도: ['충청북도', '충북'],
  충청남도: ['충청남도', '충남'],
  전북특별자치도: ['전북특별자치도', '전라북도', '전북'],
  전라남도: ['전라남도', '전남'],
  경상북도: ['경상북도', '경북'],
  경상남도: ['경상남도', '경남'],
  제주특별자치도: ['제주특별자치도', '제주'],
};

export async function resolveSigunguFromAddress(addr: string | null | undefined): Promise<string | null> {
  if (!addr) return null;
  const catalog = await loadCatalog();
  for (const r of catalog) {
    const aliases = SIDO_ALIASES[r.sido] ?? [r.sido];
    for (const sidoForm of aliases) {
      // 정규식 escaping (한글이라 단순 includes도 가능)
      if (addr.startsWith(`${sidoForm} ${r.sigungu}`) || addr.includes(` ${r.sigungu} `) && addr.startsWith(sidoForm)) {
        return r.code;
      }
    }
  }
  return null;
}

// for test cleanup
export function __resetRegionCatalogCacheForTests() { cache = null; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-region-from-address.test.ts`
Expected: PASS

If test fails due to seed mismatch, update test fixtures to the actual seeded sigungu codes.

- [ ] **Step 6: Commit**

```bash
git add lib/urban/region-from-address.ts tests/lib/urban-region-from-address.test.ts
git commit -m "feat(urban): 주소 prefix → sigunguCode resolver (sido alias 처리)"
```

---

### Task 5: `parkingDef.getList` — Filter SQL + pagination

**Files:**
- Modify: `lib/urban/adapters/parking.ts`
- Test: `tests/lib/urban-parking-adapter.test.ts`

`Parking` Prisma 모델 where 빌더. sido prefix는 `rdnmadr`/`lnmadr` LIKE 매칭. 4종 advanced 필터 + 24시간 + q.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/urban-parking-adapter.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { parkingDef } from '@/lib/urban/adapters/parking';

beforeAll(async () => {
  // 테스트 시드: 마포 공영(유료, 24시간) + 마포 민영(무료) + 강남(노외)
  await prisma.parking.createMany({
    data: [
      { sourceId: 'T-1', name: '마포 공영주차장', address: '서울특별시 마포구 신촌로 100',
        rdnmadr: '서울특별시 마포구 신촌로 100', lnmadr: null,
        prkplceSe: '공영', prkplceType: '노외', chargeInfo: '유료', feedingSe: '유료',
        prkcmprt: 120, weekdayOpenHhmm: '0000', weekdayCloseHhmm: '2400',
        satOpenHhmm: '0000', satCloseHhmm: '2400', holidayOpenHhmm: '0000', holidayCloseHhmm: '2400',
        basicTime: 30, basicCharge: 500, addUnitTime: 10, addUnitCharge: 200,
        pwdbsPpkZoneYn: true,
      },
      { sourceId: 'T-2', name: '마포 사설', address: '서울특별시 마포구 마포대로 5',
        rdnmadr: '서울특별시 마포구 마포대로 5',
        prkplceSe: '민영', prkplceType: '노상', chargeInfo: '무료', feedingSe: '무료',
        prkcmprt: 20, pwdbsPpkZoneYn: false,
      },
      { sourceId: 'T-3', name: '강남 부설', address: '서울특별시 강남구 테헤란로 1',
        rdnmadr: '서울특별시 강남구 테헤란로 1',
        prkplceSe: '민영', prkplceType: '부설', chargeInfo: '유료',
        prkcmprt: 50,
      },
    ],
    skipDuplicates: true,
  });
});

describe('parkingDef.getList filters', () => {
  it('filters by sido prefix (서울)', async () => {
    const r = await parkingDef.getList({ sido: '서울' }, 1);
    expect(r.rows.length).toBeGreaterThanOrEqual(3);
    expect(r.rows.every((it) => it.address.startsWith('서울'))).toBe(true);
  });
  it('filters by prkplceSe via sub', async () => {
    const r = await parkingDef.getList({ sido: '서울', sub: '공영' }, 1);
    expect(r.rows.every((it) => it.name.includes('공영'))).toBe(true);
  });
  it('filters by chargeInfo', async () => {
    const r = await parkingDef.getList({ sido: '서울', charge: '무료' }, 1);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    expect(r.rows.every((it) => (it.raw as { chargeInfo: string | null }).chargeInfo === '무료')).toBe(true);
  });
  it('filters by 24시간 (open24)', async () => {
    const r = await parkingDef.getList({ sido: '서울', open24: 'on' }, 1);
    expect(r.rows.find((it) => it.name === '마포 공영주차장')).toBeDefined();
    expect(r.rows.find((it) => it.name === '마포 사설')).toBeUndefined();
  });
  it('filters by name q (contains)', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '사설' }, 1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].name).toContain('사설');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-parking-adapter.test.ts`
Expected: FAIL — getList throws "not implemented"

- [ ] **Step 3: Implement `getList`**

`lib/urban/adapters/parking.ts`의 placeholder def를 다음으로 교체:

```ts
// lib/urban/adapters/parking.ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sidoPrefix } from '@/lib/region';
import type {
  UrbanCategoryDef,
  UrbanItem,
  UrbanListFilter,
  UrbanListResult,
} from '@/lib/urban/category';
import { ParkingRichSections } from '@/app/(public)/urban/[category]/_components/parking-rich-sections';
// ↑ Task 14–16에서 export. 본 Task 시점에 미존재 → 임시로 () => null 익명 import 대신 step 3a에서 inline 함수.

export type ParkingRaw = NonNullable<Awaited<ReturnType<typeof prisma.parking.findFirst>>>;

const PER_PAGE = 20;

function buildWhereWithPrefix(f: UrbanListFilter, addrPrefix: string | null): Prisma.ParkingWhereInput {
  const where: Prisma.ParkingWhereInput = {};

  if (addrPrefix) {
    where.OR = [
      { rdnmadr: { startsWith: addrPrefix } },
      { lnmadr: { startsWith: addrPrefix } },
    ];
  } else if (f.sido) {
    const prefix = fullSidoName(f.sido);
    if (prefix) where.OR = [
      { rdnmadr: { startsWith: prefix } },
      { lnmadr: { startsWith: prefix } },
    ];
  }

  // 운영 형태 (sub chip)
  if (f.sub && f.sub !== 'all') {
    where.prkplceSe = f.sub;
  }
  // 요금
  if (f.charge === '무료' || f.charge === '유료') where.chargeInfo = f.charge;
  // 종류
  if (f.type) where.prkplceType = f.type;
  // 부가
  if (f.pwd === 'on') where.pwdbsPpkZoneYn = true;
  if (f.open24 === 'on') {
    where.weekdayOpenHhmm = '0000';
    where.weekdayCloseHhmm = '2400';
  }
  // 이름 검색
  if (f.q) where.name = { contains: f.q };

  return where;
}

// 짧은 sido → 풀네임 (rdnmadr LIKE 'XX시%' 매칭용)
function fullSidoName(s: string): string | null {
  const m: Record<string, string> = {
    서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시',
    광주: '광주광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시',
    경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도',
    전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도',
  };
  return m[s] ?? s;
}

function toItem(row: ParkingRaw): UrbanItem<ParkingRaw> {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    sigunguCode: null, // 컬럼 없음 — DETAIL에서 resolveSigunguFromAddress로 채움
    raw: row,
  };
}

async function resolveAddrPrefix(f: UrbanListFilter): Promise<string | null> {
  if (!f.sigunguCode) return null;
  const region = await prisma.region.findUnique({
    where: { code: f.sigunguCode },
    select: { sido: true, sigungu: true },
  });
  if (!region?.sido || !region?.sigungu) return '__NO_MATCH__'; // 알 수 없는 코드 → 빈 결과 강제
  return `${region.sido} ${region.sigungu}`;
}

async function getList(f: UrbanListFilter, page: number): Promise<UrbanListResult<ParkingRaw>> {
  const addrPrefix = await resolveAddrPrefix(f);
  if (addrPrefix === '__NO_MATCH__') {
    return { rows: [], total: 0, page, perPage: PER_PAGE, totalPages: 0 };
  }
  const where = buildWhereWithPrefix(f, addrPrefix);
  const [rows, total] = await Promise.all([
    prisma.parking.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    prisma.parking.count({ where }),
  ]);
  return {
    rows: rows.map(toItem),
    total,
    page,
    perPage: PER_PAGE,
    totalPages: Math.ceil(total / PER_PAGE),
  };
}

// Task 6에서 채울 메서드 — 일단 stub
async function getById(id: bigint): Promise<UrbanItem<ParkingRaw> | null> {
  const row = await prisma.parking.findUnique({ where: { id } });
  return row ? toItem(row) : null;
}
async function getLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Parking" WHERE id = ${id} AND location IS NOT NULL`;
  return rows[0] ?? null;
}

export const parkingDef: UrbanCategoryDef<ParkingRaw> = {
  slug: 'parking',
  label: '주차장',
  emoji: '🅿️',
  breadcrumbLabel: '주차장',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '공영', label: '공영' },
      { slug: '민영', label: '민영' },
    ],
  },
  getList,
  getById,
  getLatLng,
  inferRowSummary: () => null,             // Task 6
  detailFields: () => [],                  // Task 6
  renderRichSections: () => null,          // Tasks 14–16에서 실 컴포넌트로
};
```

> Task 5 시점에는 `ParkingRichSections` import를 **삭제** — Task 14–16에서 컴포넌트가 생성되면 그때 import. 본 Task에서는 `renderRichSections: () => null` 유지.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-parking-adapter.test.ts`
Expected: 5/5 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/urban/adapters/parking.ts tests/lib/urban-parking-adapter.test.ts
git commit -m "feat(urban): parkingDef.getList + sido prefix/sub/charge/type/24h/q 필터"
```

---

### Task 6: `parkingDef.detailFields` + `inferRowSummary`

**Files:**
- Modify: `lib/urban/adapters/parking.ts`
- Modify: `tests/lib/urban-parking-adapter.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
// tests/lib/urban-parking-adapter.test.ts (append at end)
describe('parkingDef.inferRowSummary', () => {
  it('returns 구획수 + 요금 chip for paid 24h', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '공영' }, 1);
    const item = r.rows[0];
    expect(parkingDef.inferRowSummary(item)).toBe('120면 · 유료');
  });
  it('returns 무료 chip for free', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '사설' }, 1);
    const item = r.rows[0];
    expect(parkingDef.inferRowSummary(item)).toBe('20면 · 무료');
  });
});

describe('parkingDef.detailFields', () => {
  it('emits address rows + 운영기관 + 전화 + 결제수단 + 지역', async () => {
    const r = await parkingDef.getList({ sido: '서울', q: '공영' }, 1);
    const fields = parkingDef.detailFields(r.rows[0], { regionFullName: '서울 마포구' });
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('도로명 주소');
    expect(labels).toContain('지역');
    expect(fields.find((f) => f.label === '지역')?.value).toBe('서울 마포구');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/urban-parking-adapter.test.ts`
Expected: New tests FAIL — empty results

- [ ] **Step 3: Implement inferRowSummary + detailFields**

`lib/urban/adapters/parking.ts`에서 def 객체의 두 메서드를 구현으로 교체:

```ts
// (replace within parkingDef const)
inferRowSummary: (item) => {
  const r = item.raw;
  const parts: string[] = [];
  if (r.prkcmprt != null) parts.push(`${r.prkcmprt}면`);
  if (r.chargeInfo) parts.push(r.chargeInfo);
  return parts.length > 0 ? parts.join(' · ') : null;
},
detailFields: (item) => {
  const r = item.raw;
  return [
    { label: '도로명 주소', value: r.rdnmadr ?? '-' },
    { label: '지번 주소', value: r.lnmadr ?? '-' },
    { label: '운영기관', value: r.institutionNm ?? r.insttNm ?? '-' },
    { label: '전화', value: r.phoneNumber ?? '-' },
    { label: '기준일자', value: r.referenceDate ? r.referenceDate.toISOString().slice(0, 10) : '-' },
    { label: '결제수단', value: r.metpay ?? '-' },
  ];
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/urban-parking-adapter.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add lib/urban/adapters/parking.ts tests/lib/urban-parking-adapter.test.ts
git commit -m "feat(urban): parkingDef.detailFields + inferRowSummary"
```

---

### Task 7: `lib/urban/list.ts` + `detail.ts` + `nearby.ts` — Dispatch wrappers

**Files:**
- Create: `lib/urban/list.ts`
- Create: `lib/urban/detail.ts`
- Create: `lib/urban/nearby.ts`

amenity와 동일 패턴의 dispatch + same-category nearby raw SQL.

- [ ] **Step 1: Create dispatch wrappers**

```ts
// lib/urban/list.ts
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanListFilter, UrbanListResult } from '@/lib/urban/category';

export function normalizePage(raw: string | undefined): number {
  const n = Number(raw ?? '1');
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function getUrbanList(slug: string, filter: UrbanListFilter, page: number): Promise<UrbanListResult> {
  const def = getUrbanCategoryDef(slug);
  if (!def) throw new Error(`Unknown urban category: ${slug}`);
  return def.getList(filter, Math.max(1, page));
}
```

```ts
// lib/urban/detail.ts
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanItem } from '@/lib/urban/category';

export async function getUrbanById(slug: string, id: bigint): Promise<UrbanItem | null> {
  const def = getUrbanCategoryDef(slug);
  if (!def) return null;
  return def.getById(id);
}

export async function getUrbanLatLng(slug: string, id: bigint): Promise<{ lat: number; lng: number } | null> {
  const def = getUrbanCategoryDef(slug);
  if (!def) return null;
  return def.getLatLng(id);
}
```

```ts
// lib/urban/nearby.ts
import { prisma } from '@/lib/db';

export interface NearbyParking {
  id: bigint;
  name: string;
  address: string;
  prkplceSe: string | null;
  chargeInfo: string | null;
  distanceMeters: number;
}

export async function getSameCategoryNearbyParking(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
  limit = 6,
): Promise<NearbyParking[]> {
  const rows = await prisma.$queryRaw<NearbyParking[]>`
    SELECT id, name, address, "prkplceSe", "chargeInfo",
      ROUND(ST_Distance(
        location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Parking"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => r.id !== excludeId).slice(0, limit);
}
```

- [ ] **Step 2: Smoke test — wrappers compile**

Run: `pnpm tsc --noEmit`
Expected: no errors related to `lib/urban/*`.

- [ ] **Step 3: Commit**

```bash
git add lib/urban/list.ts lib/urban/detail.ts lib/urban/nearby.ts
git commit -m "feat(urban): list/detail dispatch wrappers + 같은 카테고리 nearby raw SQL"
```

---

### Task 8: `urban-card.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-card.tsx`

amenity-card의 두 줄(이름 + 주소) 구조에 배지 줄(공영/민영, 유료/무료, ♿) + meta(구획·요금) 추가.

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/urban-card.tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import { isOpen24 } from '@/lib/urban/parking-hours';

export function UrbanCard({ item, def }: { item: UrbanItem; def: UrbanCategoryDef }) {
  // 본 PR은 parking 한정 — raw는 ParkingRaw로 좁혀 처리
  const r = item.raw as ParkingRaw;
  const open24 = isOpen24(r.weekdayOpenHhmm, r.weekdayCloseHhmm);
  const summary = def.inferRowSummary(item);

  return (
    <Link href={`/urban/${def.slug}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.prkplceSe && <Badge tone="blue">{r.prkplceSe}</Badge>}
            {r.chargeInfo && <Badge tone={r.chargeInfo === '무료' ? 'green' : 'gray'}>{r.chargeInfo}</Badge>}
            {r.pwdbsPpkZoneYn && <Badge tone="purple">♿</Badge>}
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">{item.address}</p>
          {(summary || open24) && (
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
              {summary}{summary && open24 ? ' · ' : ''}{open24 ? '24시간 ⏰' : ''}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

> `<Badge tone="green|purple">`가 `@/components/ui/badge`에 없으면, `gray`/`blue`만 쓰고 색은 라벨로 구분.

- [ ] **Step 2: Verify Badge tones**

Run: `grep -E "tone\?:" components/ui/badge.tsx`
허용 tone 외 값은 `gray`로 fallback.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanCard — 공영/민영·유료/무료·♿ 배지 + 24시간 ⏰ meta"
```

---

### Task 9: `urban-filter-panel.tsx` (desktop)

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-filter-panel.tsx`

amenity-filter-panel을 fork. 추가 advanced: `charge` (chip), `type` (chip), `pwd` (checkbox), `open24` (checkbox).

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/urban-filter-panel.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import type { UrbanCategoryView } from '@/lib/urban/category';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

interface Props {
  def: UrbanCategoryView;
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

const CHARGE_OPTS = [
  { slug: '', label: '전체' },
  { slug: '무료', label: '무료' },
  { slug: '유료', label: '유료' },
];
const TYPE_OPTS = [
  { slug: '', label: '전체' },
  { slug: '노외', label: '노외' },
  { slug: '노상', label: '노상' },
  { slug: '부설', label: '부설' },
];

export function UrbanFilterPanel({ def, basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sub = def.subFilters;
  const sido = p.get('sido');
  const region = p.get('region');
  const charge = p.get('charge') ?? '';
  const type = p.get('type') ?? '';
  const pwd = p.get('pwd') === 'on';
  const open24 = p.get('open24') === 'on';

  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);
  useEffect(() => {
    if (!sido) { setSigunguList([]); return; }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((d: SigunguItem[]) => setSigunguList(d))
      .catch(() => setSigunguList([]));
  }, [sido]);

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';
  const subKey = sub?.paramKey ?? 'sub';
  const subCur = sub ? (p.get(subKey) ?? sub.defaultSlug) : null;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주차장 이름</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder="예) 마포공영주차장"
          className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2 text-sm"
        />
      </section>

      {sidoList && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
          <div className="mt-2 flex flex-col gap-2">
            <select value={sido ?? ''} onChange={(e) => update({ sido: e.target.value || null, region: null })} className={selectCls}>
              <option value="">시도 전체</option>
              {sidoList.map((s) => <option key={s.code} value={s.sido}>{s.fullName}</option>)}
            </select>
            {sigunguList.length > 0 && (
              <select value={region ?? ''} onChange={(e) => update({ region: e.target.value || null })} className={selectCls}>
                <option value="">시군구 전체</option>
                {sigunguList.map((sg) => <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>)}
              </select>
            )}
          </div>
        </section>
      )}

      {sub && (
        <section>
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">운영 형태</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sub.options.map((opt) => (
              <Chip key={opt.slug} active={subCur === opt.slug}
                onClick={() => update({ [subKey]: opt.slug === sub.defaultSlug ? null : opt.slug })}>
                {opt.label}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">요금</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHARGE_OPTS.map((opt) => (
            <Chip key={opt.label} active={charge === opt.slug}
              onClick={() => update({ charge: opt.slug || null })}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주차장 종류</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPE_OPTS.map((opt) => (
            <Chip key={opt.label} active={type === opt.slug}
              onClick={() => update({ type: opt.slug || null })}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">부가</h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pwd} onChange={(e) => update({ pwd: e.target.checked ? 'on' : null })} />
          ♿ 장애인전용 구획 있음
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={open24} onChange={(e) => update({ open24: e.target.checked ? 'on' : null })} />
          ⏰ 24시간 운영 (평일 기준)
        </label>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Smoke compile**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanFilterPanel — sub/charge/type/♿/⏰24h advanced filters"
```

---

### Task 10: `urban-mobile-filter-sheet.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-mobile-filter-sheet.tsx`

amenity-mobile-filter-sheet의 1:1 fork. activeKeys 확장.

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/urban-mobile-filter-sheet.tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { UrbanFilterPanel } from './urban-filter-panel';
import type { UrbanCategoryView } from '@/lib/urban/category';

interface SidoItem { code: string; sido: string; fullName: string; }

export function UrbanMobileFilterSheet({ def, basePath, sidoList }: { def: UrbanCategoryView; basePath: string; sidoList?: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeKeys = ['sido', 'region', 'q', 'charge', 'type', 'pwd', 'open24',
    ...(def.subFilters ? [def.subFilters.paramKey] : [])];
  const activeCount = activeKeys.filter((k) => {
    const v = sp.get(k);
    if (!v || v === 'all') return false;
    if (k === 'sido' && v === '서울') return false;
    return true;
  }).length;

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => { setPending(new URLSearchParams(sp.toString())); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터{activeCount > 0 && <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">{activeCount}</span>}
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="필터"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPending(new URLSearchParams())} className="shrink-0">초기화</Button>
            <Button onClick={() => { const qs = pending.toString(); router.push(qs ? `${basePath}?${qs}` : basePath); setOpen(false); }} className="flex-1">조회</Button>
          </div>
        }
      >
        <UrbanFilterPanel def={def} basePath={basePath} sidoList={sidoList} params={pending} onParamsChange={setPending} />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanMobileFilterSheet — 바텀시트 필터 (advanced 키 포함)"
```

---

### Task 11: `urban-pagination.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-pagination.tsx`

amenity-pagination 1:1 fork.

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/urban-pagination.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

export function UrbanPagination({ basePath, current, totalPages, totalItems, perPage }: {
  basePath: string; current: number; totalPages: number; totalItems: number; perPage: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <Pagination
      current={current}
      totalPages={totalPages}
      totalItems={totalItems}
      perPage={perPage}
      onChange={(page) => {
        const params = new URLSearchParams(sp.toString());
        params.set('page', String(page));
        router.push(`${basePath}?${params.toString()}`);
      }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanPagination"
```

---

### Task 12: LIST page `app/(public)/urban/[category]/page.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/page.tsx`

amenity LIST의 골격을 그대로 가져오되 prefix `/urban/`, urban 컴포넌트, breadcrumb `홈 › 생활편의 › 도시인프라 › 주차장`.

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getSidoList, getSigunguByCode, sidoFromPrefix } from '@/lib/region';
import { getUrbanCategoryDef, toUrbanCategoryView, URBAN_SLUGS } from '@/lib/urban/category';
import { getUrbanList, normalizePage } from '@/lib/urban/list';
import { UrbanFilterPanel } from './_components/urban-filter-panel';
import { UrbanMobileFilterSheet } from './_components/urban-mobile-filter-sheet';
import { UrbanCard } from './_components/urban-card';
import { UrbanPagination } from './_components/urban-pagination';
import { SiblingTabs } from '../../_components/sibling-tabs';

export const revalidate = 21_600;

interface Params {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateStaticParams() {
  return URBAN_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { category } = await params;
  const sp = await searchParams;
  const def = getUrbanCategoryDef(category);
  if (!def) return {};
  const region = sp.region ? await getSigunguByCode(sp.region).catch(() => null) : null;
  const scope = region?.fullName ?? sp.sido ?? '전국';
  return {
    title: `${scope} ${def.label}`,
    description: `${scope}의 ${def.label} 목록과 위치, 주변 아파트 실거래가.`,
    alternates: {
      canonical: sp.region
        ? `/urban/${def.slug}?region=${sp.region}`
        : sp.sido
          ? `/urban/${def.slug}?sido=${encodeURIComponent(sp.sido)}`
          : `/urban/${def.slug}`,
    },
  };
}

export default async function UrbanListPage({ params, searchParams }: Params) {
  const { category } = await params;
  const sp = await searchParams;
  const def = getUrbanCategoryDef(category);
  if (!def) notFound();

  if (def.requiresSidoScope !== false && !sp.sido && !sp.region) {
    redirect(`/urban/${category}?sido=${encodeURIComponent('서울')}`);
  }

  const effectiveSido = sp.sido ?? (sp.region ? sidoFromPrefix(sp.region.slice(0, 2)) : undefined);

  const page = normalizePage(sp.page);
  const subKey = def.subFilters?.paramKey ?? 'sub';
  const basePath = `/urban/${def.slug}`;

  const [{ rows, total, totalPages, perPage }, sidoList, region] = await Promise.all([
    getUrbanList(def.slug, {
      sigunguCode: sp.region,
      sido: effectiveSido,
      q: sp.q,
      sub: sp[subKey],
      charge: sp.charge,
      type: sp.type,
      pwd: sp.pwd,
      open24: sp.open24,
    }, page),
    getSidoList().catch(() => []),
    sp.region ? getSigunguByCode(sp.region).catch(() => null) : Promise.resolve(null),
  ]);

  const defView = toUrbanCategoryView(def);
  const scopeLabel = region?.fullName ?? (effectiveSido ?? '전국');

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/urban">도시인프라</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">도시인프라 · {def.breadcrumbLabel}</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          {def.emoji} {scopeLabel} {def.label}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {total.toLocaleString('ko-KR')}개</p>
      </div>

      <SiblingTabs currentHref={`/urban/${category}`} />

      <Suspense><UrbanMobileFilterSheet def={defView} basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <UrbanFilterPanel def={defView} basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 {def.label}
            </p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 {def.label}이 없습니다.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((it) => <UrbanCard key={String(it.id)} item={it} def={def} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><UrbanPagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke run dev server**

Run: `pnpm dev` (백그라운드)
Open: `http://localhost:3000/urban/parking` → `?sido=서울` redirect 확인. 카드 노출되는지.
Kill dev when done.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): /urban/[category] LIST 페이지 (sido auto-redirect, sibling 탭, 카드)"
```

---

### Task 13: `urban-hero.tsx` + `urban-info.tsx` (DETAIL 상단)

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-hero.tsx`
- Create: `app/(public)/urban/[category]/_components/urban-info.tsx`

amenity 패턴 fork. Hero 배지 행 확장.

- [ ] **Step 1: Implement Hero**

```tsx
// app/(public)/urban/[category]/_components/urban-hero.tsx
import { Badge } from '@/components/ui/badge';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import { isAllDayOpen24, hasAnyHours } from '@/lib/urban/parking-hours';

export function UrbanHero({ item, def }: { item: UrbanItem; def: UrbanCategoryDef }) {
  const r = item.raw as ParkingRaw;
  const hours = {
    weekdayOpen: r.weekdayOpenHhmm, weekdayClose: r.weekdayCloseHhmm,
    satOpen: r.satOpenHhmm, satClose: r.satCloseHhmm,
    holidayOpen: r.holidayOpenHhmm, holidayClose: r.holidayCloseHhmm,
  };
  const allDay24 = isAllDayOpen24(hours);
  const noHours = !hasAnyHours(hours);

  return (
    <div className="flex items-center gap-5 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">{def.emoji}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{item.name}</h1>
          {r.prkplceSe && <Badge tone="blue">{r.prkplceSe}</Badge>}
          {r.chargeInfo && <Badge tone={r.chargeInfo === '무료' ? 'green' : 'gray'}>{r.chargeInfo}</Badge>}
          {r.prkplceType && <Badge tone="gray">{r.prkplceType}</Badge>}
          {r.pwdbsPpkZoneYn && <Badge tone="purple">♿장애인전용</Badge>}
          {allDay24 && <Badge tone="blue">⏰ 24시간</Badge>}
          {noHours && <Badge tone="gray">운영시간 미상</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
          <span>📍 {item.address}</span>
          {r.prkcmprt != null && <span>구획 {r.prkcmprt}면</span>}
          {r.enforceSe && <span>단속 {r.enforceSe}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement Info**

```tsx
// app/(public)/urban/[category]/_components/urban-info.tsx
import { Card } from '@/components/ui/card';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';

export function UrbanInfo({ item, def, regionFullName }: { item: UrbanItem; def: UrbanCategoryDef; regionFullName: string }) {
  const fields = def.detailFields(item, { regionFullName });
  const rows = [...fields, { label: '지역', value: regionFullName || '-' }];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.label} 기본정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{r.label}</span>
            <span className="text-sm font-semibold text-[var(--color-text)]">{r.value || '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanHero + UrbanInfo (배지 행 + 기본정보 grid)"
```

---

### Task 14: `parking-hours-table.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/parking-hours-table.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/parking-hours-table.tsx
import { Card } from '@/components/ui/card';
import { formatHourRange, hasAnyHours } from '@/lib/urban/parking-hours';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

export function ParkingHoursTable({ row }: { row: ParkingRaw }) {
  const hours = {
    weekdayOpen: row.weekdayOpenHhmm, weekdayClose: row.weekdayCloseHhmm,
    satOpen: row.satOpenHhmm, satClose: row.satCloseHhmm,
    holidayOpen: row.holidayOpenHhmm, holidayClose: row.holidayCloseHhmm,
  };
  if (!hasAnyHours(hours)) return null;

  const rows = [
    { label: '평일',   value: formatHourRange(row.weekdayOpenHhmm, row.weekdayCloseHhmm) ?? '운영 안 함' },
    { label: '토요일', value: formatHourRange(row.satOpenHhmm, row.satCloseHhmm) ?? '운영 안 함' },
    { label: '공휴일', value: formatHourRange(row.holidayOpenHhmm, row.holidayCloseHhmm) ?? '운영 안 함' },
  ];

  return (
    <Card id="hours">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">운영시간</h2>
      {row.operDay && (
        <p className="mb-3 inline-block rounded-full bg-[var(--color-sky-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-blue)]">
          운영 요일: {row.operDay}
        </p>
      )}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-[var(--color-line)] last:border-b-0">
              <th className="w-20 py-2.5 text-left text-[var(--color-muted)] font-normal">{r.label}</th>
              <td className="py-2.5 font-semibold text-[var(--color-blue-dark)]">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): ParkingHoursTable (평일/토/공휴일 + operDay 칩)"
```

---

### Task 15: `parking-fee-grid.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/parking-fee-grid.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/parking-fee-grid.tsx
import { Card } from '@/components/ui/card';
import { normalizeFees } from '@/lib/urban/parking-fees';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

export function ParkingFeeGrid({ row }: { row: ParkingRaw }) {
  const fee = normalizeFees(row);

  if (fee.free) {
    return (
      <Card id="fee">
        <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
        <div className="rounded-2xl bg-[var(--color-sky-soft)] p-6 text-center">
          <p className="text-3xl font-black text-[var(--color-blue)]">무료</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">무료 주차 — 별도 요금이 부과되지 않습니다</p>
        </div>
        {row.metpay && <p className="mt-3 text-xs text-[var(--color-muted)]">결제수단: {row.metpay}</p>}
      </Card>
    );
  }

  if (fee.items.length === 0) {
    return (
      <Card id="fee">
        <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
        <p className="rounded-2xl border border-dashed border-[var(--color-line)] p-6 text-center text-sm text-[var(--color-muted)]">
          요금 정보가 등록되어 있지 않습니다.
        </p>
      </Card>
    );
  }

  return (
    <Card id="fee">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">요금</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fee.items.map((f) => (
          <div key={f.label} className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">{f.label}</p>
            <p className="mt-1 text-lg font-bold text-[var(--color-blue-dark)]">{f.value}</p>
          </div>
        ))}
      </div>
      {row.metpay && <p className="mt-3 text-xs text-[var(--color-muted)]">결제수단: {row.metpay}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): ParkingFeeGrid (무료/유료 분기 + 4종 페어)"
```

---

### Task 16: `parking-extras.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/parking-extras.tsx`

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/_components/parking-extras.tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

const SPCMNT_THRESHOLD = 120;

export function ParkingExtras({ row }: { row: ParkingRaw }) {
  const [expanded, setExpanded] = useState(false);
  const hasBadges = row.pwdbsPpkZoneYn || row.enforceSe;
  const hasNote = (row.spcmnt ?? '').trim().length > 0;
  if (!hasBadges && !hasNote) return null;

  const spcmnt = row.spcmnt ?? '';
  const truncated = spcmnt.length > SPCMNT_THRESHOLD && !expanded
    ? spcmnt.slice(0, SPCMNT_THRESHOLD) + '…'
    : spcmnt;

  return (
    <Card id="extras">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">부대정보</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {row.pwdbsPpkZoneYn && <Badge tone="purple">♿ 장애인전용 구획</Badge>}
        {row.enforceSe && <Badge tone="gray">단속 {row.enforceSe}</Badge>}
        {row.feedingSe && <Badge tone={row.feedingSe === '무료' ? 'green' : 'gray'}>{row.feedingSe}</Badge>}
      </div>
      {hasNote && (
        <div className="rounded-xl bg-[var(--color-soft)] p-4 text-sm text-[var(--color-text)]">
          <p className="mb-1 text-xs font-bold text-[var(--color-muted)]">특기사항</p>
          <p className="whitespace-pre-wrap">{truncated}</p>
          {spcmnt.length > SPCMNT_THRESHOLD && (
            <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs font-semibold text-[var(--color-blue)]">
              {expanded ? '접기' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): ParkingExtras (♿·단속·유료 배지 + 특기사항 expand)"
```

---

### Task 17: `urban-same-category-nearby.tsx` + `urban-detail-sidebar.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx`
- Create: `app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx`

- [ ] **Step 1: Implement same-category-nearby**

```tsx
// app/(public)/urban/[category]/_components/urban-same-category-nearby.tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { UrbanCategoryDef } from '@/lib/urban/category';
import type { NearbyParking } from '@/lib/urban/nearby';

export function UrbanSameCategoryNearby({ items, def }: { items: NearbyParking[]; def: UrbanCategoryDef }) {
  if (items.length === 0) return null;
  return (
    <Card id="same">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">{def.emoji} 가까운 {def.label}</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)}>
            <Link href={`/urban/${def.slug}/${it.id}`} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-blue-dark)]">{it.name}
                  <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.distanceMeters}m</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                  {it.address}
                  {(it.prkplceSe || it.chargeInfo) && (
                    <> · {[it.prkplceSe, it.chargeInfo].filter(Boolean).join(' · ')}</>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Implement detail sidebar**

```tsx
// app/(public)/urban/[category]/_components/urban-detail-sidebar.tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { UrbanCategoryDef, UrbanItem } from '@/lib/urban/category';

const ANCHORS = [
  { href: '#info',   label: '기본 정보' },
  { href: '#hours',  label: '운영시간' },
  { href: '#fee',    label: '요금' },
  { href: '#extras', label: '부대정보' },
  { href: '#map',    label: '위치' },
  { href: '#apt',    label: '주변 아파트' },
  { href: '#poi',    label: '주변 상권' },
  { href: '#same',   label: '가까운 주차장' },
];

export function UrbanDetailSidebar({
  others,
  def,
  sigunguCode,
}: {
  others: UrbanItem[];
  def: UrbanCategoryDef;
  sigunguCode?: string | null;
}) {
  const regionListHref = sigunguCode
    ? `/urban/${def.slug}?region=${sigunguCode}`
    : `/urban/${def.slug}`;

  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">바로가기</h3>
        <ul className="flex flex-col gap-2">
          {ANCHORS.map((a) => <li key={a.href}><a href={a.href} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-blue)]">{a.label}</a></li>)}
        </ul>
      </Card>
      {others.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 {def.label}</h3>
          <ul className="flex flex-col gap-2">
            {others.map((it) => (
              <li key={String(it.id)}>
                <Link href={`/urban/${def.slug}/${it.id}`} className="text-sm hover:text-[var(--color-blue)]">· {it.name}</Link>
              </li>
            ))}
            <li>
              <Link href={regionListHref} className="text-sm font-semibold text-[var(--color-blue)]">지역 {def.label} 전체 →</Link>
            </li>
          </ul>
        </Card>
      )}
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/urban
git commit -m "feat(urban): UrbanSameCategoryNearby + UrbanDetailSidebar (anchor + 같은 시군구 다른 주차장)"
```

---

### Task 18: DETAIL page `app/(public)/urban/[category]/[id]/page.tsx`

**Files:**
- Create: `app/(public)/urban/[category]/[id]/page.tsx`

11개 섹션 통합. coord 없는 row는 지도/주변* skip.

- [ ] **Step 1: Implement**

```tsx
// app/(public)/urban/[category]/[id]/page.tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getUrbanList } from '@/lib/urban/list';
import { getSameCategoryNearbyParking } from '@/lib/urban/nearby';
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';
import { getNearbyApartments, getMixedNearbyForDetail } from '@/lib/amenity/nearby';
import { getSigunguByCode } from '@/lib/region';
import { UrbanHero } from '../_components/urban-hero';
import { UrbanInfo } from '../_components/urban-info';
import { ParkingHoursTable } from '../_components/parking-hours-table';
import { ParkingFeeGrid } from '../_components/parking-fee-grid';
import { ParkingExtras } from '../_components/parking-extras';
import { UrbanSameCategoryNearby } from '../_components/urban-same-category-nearby';
import { UrbanDetailSidebar } from '../_components/urban-detail-sidebar';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NearbyAmenitiesMixed } from '@/app/(public)/amenity/[category]/_components/nearby-amenities-mixed';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, id } = await params;
  const def = getUrbanCategoryDef(category);
  if (!def) return {};
  const item = await getUrbanById(def.slug, BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name}(${item.address}) ${def.label} 정보(운영시간·요금)와 주변 아파트 실거래가.`,
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
}

export default async function UrbanDetailPage({ params }: Params) {
  const { category, id } = await params;
  const def = getUrbanCategoryDef(category);
  if (!def) notFound();

  const itemId = BigInt(id);
  const item = await getUrbanById(def.slug, itemId);
  if (!item) notFound();

  const r = item.raw as ParkingRaw;
  const sigunguCode = await resolveSigunguFromAddress(r.rdnmadr ?? r.lnmadr ?? r.address);

  const [region, coord] = await Promise.all([
    sigunguCode ? getSigunguByCode(sigunguCode).catch(() => null) : Promise.resolve(null),
    getUrbanLatLng(def.slug, itemId),
  ]);

  const emptyMixed = { convenience: [], mart: [], cafe: [], market: [] };
  const emptyList = { rows: [], total: 0, page: 1, perPage: 0, totalPages: 0 };

  const [apts, mixed, sameCat, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    // amenity의 currentSlug 인자는 amenity 카테고리만 받음 — 'parking'은 enum에 없으므로 'market' 같은 값으로 임시 전달하면 무관한 list 노출됨.
    // → currentSlug를 amenity 4종 중 어느 것도 아닌 값으로 캐스팅 회피 위해 함수 자체를 호출하되, 어느 카테고리도 제외하지 않는 동작이 되도록 union을 확장하거나
    //   parking 케이스 전용 변종을 amenity nearby에 추가해야 한다. 본 PR에서는 후자 — `getMixedNearbyForDetail`에 'parking' 받도록 amenity 코드도 보강 (Step 2 참조).
    coord ? getMixedNearbyForDetail('parking' as never, coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
    coord ? getSameCategoryNearbyParking(coord.lat, coord.lng, itemId) : Promise.resolve([]),
    sigunguCode ? getUrbanList(def.slug, { sigunguCode }, 1) : Promise.resolve(emptyList),
  ]);

  const others = otherList.rows.filter((s) => s.id !== item.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/urban">도시인프라</Link><span>›</span>
        <Link href={`/urban/${def.slug}`}>{def.breadcrumbLabel}</Link><span>›</span>
        {region && (<><Link href={`/urban/${def.slug}?region=${sigunguCode}`}>{region.fullName}</Link><span>›</span></>)}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{item.name}</span>
      </nav>

      <UrbanHero item={item} def={def} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <UrbanInfo item={item} def={def} regionFullName={region?.fullName ?? ''} />
          <ParkingHoursTable row={r} />
          <ParkingFeeGrid row={r} />
          <ParkingExtras row={r} />
          {coord ? (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          ) : (
            <Card>
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">위치 정보가 등록되어 있지 않아 지도와 주변 정보를 표시할 수 없습니다.</p>
            </Card>
          )}
          {coord && <NearbyApartments items={apts} />}
          {coord && <NearbyAmenitiesMixed {...mixed} />}
          {coord && <UrbanSameCategoryNearby items={sameCat} def={def} />}
        </main>
        <aside><UrbanDetailSidebar others={others} def={def} sigunguCode={sigunguCode} /></aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Extend `getMixedNearbyForDetail` to accept `'parking'`**

`lib/amenity/nearby.ts`의 시그니처를 확장 — `currentSlug`를 `AmenitySlug | 'parking'`로 받아 parking이면 어느 것도 제외하지 않음.

```ts
// lib/amenity/nearby.ts (수정 부분)
import type { AmenitySlug } from '@/lib/amenity/category';

export async function getMixedNearbyForDetail(
  currentSlug: AmenitySlug | 'parking',
  lat: number,
  lng: number,
): Promise<{
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  market: NearbyTraditionalMarket[];
}> {
  const [stores, markets] = await Promise.all([
    getNearbyStores(lat, lng, 500),
    getNearbyTraditionalMarkets(lat, lng, 1000),
  ]);
  const convenience = stores.filter((s) => (s.industryCode ?? '').startsWith('G20405'));
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return c.startsWith('G20404') || c.startsWith('G20402');
  });
  const cafe = stores.filter((s) => (s.industryCode ?? '').startsWith('I21201'));
  return {
    convenience: currentSlug === 'convenience' ? [] : convenience.slice(0, 5),
    mart: currentSlug === 'mart' ? [] : mart.slice(0, 5),
    cafe: currentSlug === 'cafe' ? [] : cafe.slice(0, 5),
    market: currentSlug === 'market' ? [] : markets.slice(0, 5),
  };
}
```

DETAIL page에서 `as never` 캐스트 제거:

```ts
coord ? getMixedNearbyForDetail('parking', coord.lat, coord.lng).catch(() => emptyMixed) : Promise.resolve(emptyMixed),
```

- [ ] **Step 3: Smoke run + visual check**

Run: `pnpm dev` (background)
Browse: 시드된 parking row id 하나로 `/urban/parking/${id}` 열어 11개 섹션 렌더 확인.
Kill dev when done.

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/urban lib/amenity/nearby.ts
git commit -m "feat(urban): /urban/[category]/[id] DETAIL — 11섹션 통합 + nearby mixed parking 지원"
```

---

### Task 19: life-menu 갱신 + sitemap 추가

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`
- Modify: `app/sitemap.ts`
- Modify: `tests/lib/life-menu.test.ts`

- [ ] **Step 1: Update life-menu**

`app/(public)/_components/life-menu.ts`의 urban 그룹을 다음으로 교체:

```ts
{
  slug: 'urban',
  label: '도시인프라',
  intro: '공원·충전소·주차장 — 동네 인프라 한눈에.',
  items: [
    { label: '주차장', href: '/urban/parking', live: true },
    { label: '공원',   href: '/urban/park',    live: false },
    { label: '충전소', href: '/urban/charger', live: false },
  ],
},
```

(parking의 기존 `soon: true` 제거, href는 `/urban/{slug}`로.)

- [ ] **Step 2: Update life-menu unit test**

```ts
// tests/lib/life-menu.test.ts (해당 단언만 교체)
it('도시인프라 그룹 — parking live, park/charger soon-modal', () => {
  const urban = LIFE_GROUPS.find((g) => g.slug === 'urban')!;
  const parking = urban.items.find((i) => i.label === '주차장')!;
  expect(parking.href).toBe('/urban/parking');
  expect(parking.live).toBe(true);
  const park = urban.items.find((i) => i.label === '공원')!;
  expect(park.live).toBe(false);
  const charger = urban.items.find((i) => i.label === '충전소')!;
  expect(charger.live).toBe(false);
});
```

Run: `pnpm vitest run tests/lib/life-menu.test.ts`
Expected: PASS

- [ ] **Step 3: Update sitemap**

`app/sitemap.ts`에 도시인프라 LIST 엔트리 추가:

```ts
// app/sitemap.ts (urls 배열 추가)
const SIDOS = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
const parkingUrls = [
  { url: `${base}/urban/parking`, lastModified: now, priority: 0.7 },
  ...SIDOS.map((s) => ({
    url: `${base}/urban/parking?sido=${encodeURIComponent(s)}`,
    lastModified: now, priority: 0.6,
  })),
];
```

기존 sitemap 골격에 맞게 spread. 단위 테스트(`tests/lib/sitemap.test.ts`) 있으면 `/urban/parking` 엔트리 존재 확인 케이스 추가:

```ts
it('includes /urban/parking', () => {
  const urls = sitemap();
  expect(urls.some((u) => u.url.endsWith('/urban/parking'))).toBe(true);
});
```

Run: `pnpm vitest run tests/lib/sitemap.test.ts`
Expected: PASS (또는 추가 케이스 통과)

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/_components/life-menu.ts app/sitemap.ts tests/lib/life-menu.test.ts tests/lib/sitemap.test.ts
git commit -m "feat(urban): life-menu parking live 전환 + sitemap parking URL 추가"
```

---

### Task 20: E2E 시드 + 3종 E2E 스펙

**Files:**
- Modify: `tests/e2e/seed.ts`
- Create: `tests/e2e/urban-parking-list.spec.ts`
- Create: `tests/e2e/urban-parking-detail.spec.ts`
- Create: `tests/e2e/urban-parking-mobile.spec.ts`

- [ ] **Step 1: Append parking seed**

`tests/e2e/seed.ts`에 parking 3건 추가 (좌표 포함). 무료 1 + 24시간 유료 1 + 일반 유료 1.

```ts
// tests/e2e/seed.ts (parking seed append — 다른 시드 직후)
await prisma.$executeRaw`
  INSERT INTO "Parking" (
    "sourceId","name","prkplceSe","prkplceType","rdnmadr","lnmadr","address",
    location,"prkcmprt","feedingSe","enforceSe","operDay",
    "weekdayOpenHhmm","weekdayCloseHhmm","satOpenHhmm","satCloseHhmm","holidayOpenHhmm","holidayCloseHhmm",
    "chargeInfo","basicTime","basicCharge","addUnitTime","addUnitCharge","dayCmmtkt","monthCmmtkt",
    "metpay","spcmnt","pwdbsPpkZoneYn","institutionNm","phoneNumber","insttCode","insttNm",
    "updatedAt"
  )
  VALUES
    ('E2E-PRK-1','테스트 24시간 유료주차장','공영','노외','서울특별시 마포구 신촌로 100',null,'서울특별시 마포구 신촌로 100',
     ST_SetSRID(ST_MakePoint(126.9437,37.5599),4326)::geography,120,'유료','단속중',
     null,'0000','2400','0000','2400','0000','2400',
     '유료',30,500,10,200,10000,80000,'카드,현금','시범운영 안내',true,'마포구청','02-3153-0000','3140000','마포구',
     NOW()),
    ('E2E-PRK-2','테스트 무료주차장','민영','노상','서울특별시 마포구 마포대로 5',null,'서울특별시 마포구 마포대로 5',
     ST_SetSRID(ST_MakePoint(126.946,37.560),4326)::geography,20,'무료',null,
     '월,화,수,목,금','0700','2000','0700','1800',null,null,
     '무료',null,null,null,null,null,null,null,null,false,null,null,null,null,
     NOW()),
    ('E2E-PRK-3','테스트 일반 유료주차장','민영','부설','서울특별시 강남구 테헤란로 1',null,'서울특별시 강남구 테헤란로 1',
     ST_SetSRID(ST_MakePoint(127.027,37.498),4326)::geography,50,'유료',null,
     null,'0600','2200','0700','2000','0900','1800',
     '유료',60,1000,30,500,null,null,'카드',null,false,null,null,null,null,
     NOW())
  ON CONFLICT ("sourceId") DO NOTHING;
`;
```

- [ ] **Step 2: Write LIST E2E**

```ts
// tests/e2e/urban-parking-list.spec.ts
import { test, expect } from '@playwright/test';

const seoul = '?sido=' + encodeURIComponent('서울');

test.describe('urban parking LIST happy path', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '데스크톱 사이드바 필터 사용');

  test('진입 시 ?sido=서울 redirect + 카드 노출 + 카드 클릭 시 DETAIL', async ({ page }) => {
    await page.goto('/urban/parking');
    await expect(page).toHaveURL(/sido=/);
    await expect(page.getByRole('heading', { level: 1, name: /주차장/ })).toBeVisible();

    const firstCard = page.locator('a:has(article)').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await expect(page.getByRole('heading', { name: /주차장 기본정보/ })).toBeVisible({ timeout: 5000 });
  });

  test('chip 공영 클릭 → URL ?sub=공영', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}`);
    await expect(page.getByRole('heading', { name: '운영 형태' })).toBeVisible();
    await page.getByRole('button', { name: '공영', exact: true }).click();
    await expect(page).toHaveURL(/sub=%EA%B3%B5%EC%98%81|sub=공영/);
  });

  test('24시간 체크 → URL ?open24=on', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}`);
    await page.getByRole('checkbox', { name: /24시간/ }).check();
    await expect(page).toHaveURL(/open24=on/);
  });

  test('이름 검색이 없으면 빈 결과 메시지', async ({ page }) => {
    await page.goto(`/urban/parking${seoul}&q=zzzzzz_nonexistent`);
    await expect(page.getByText(/조건에 맞는 주차장이 없습니다/)).toBeVisible();
  });
});
```

- [ ] **Step 3: Write DETAIL E2E**

```ts
// tests/e2e/urban-parking-detail.spec.ts
import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/db';

test.describe('urban parking DETAIL', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, '데스크톱');

  test('Hero / 운영시간 / 요금 / 부대정보 / 지도 / 주변 아파트 mount', async ({ page }) => {
    const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-1' } });
    expect(row).toBeTruthy();
    await page.goto(`/urban/parking/${row!.id}`);

    await expect(page.getByRole('heading', { level: 1, name: /24시간 유료주차장/ })).toBeVisible();
    // 운영시간
    await expect(page.getByRole('heading', { name: '운영시간' })).toBeVisible();
    await expect(page.getByText(/24시간 운영/).first()).toBeVisible();
    // 요금 grid
    await expect(page.getByRole('heading', { name: '요금', exact: true })).toBeVisible();
    await expect(page.getByText('30분 500원')).toBeVisible();
    // 부대정보
    await expect(page.getByRole('heading', { name: '부대정보' })).toBeVisible();
    await expect(page.getByText('♿ 장애인전용 구획')).toBeVisible();
    // 위치
    await expect(page.getByRole('heading', { name: '위치' })).toBeVisible();
  });

  test('무료 주차장 — 요금에 "무료" 단일 카드', async ({ page }) => {
    const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-2' } });
    expect(row).toBeTruthy();
    await page.goto(`/urban/parking/${row!.id}`);
    await expect(page.getByText('무료').first()).toBeVisible();
  });
});
```

- [ ] **Step 4: Write mobile E2E**

```ts
// tests/e2e/urban-parking-mobile.spec.ts
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 375, height: 812 } });

test('모바일 LIST 필터 시트 → 24시간 체크 → 조회', async ({ page }) => {
  await page.goto('/urban/parking?sido=' + encodeURIComponent('서울'));
  await page.getByRole('button', { name: /필터/ }).click();
  await page.getByRole('checkbox', { name: /24시간/ }).check();
  await page.getByRole('button', { name: '조회' }).click();
  await expect(page).toHaveURL(/open24=on/);
});

test('모바일 DETAIL — 운영시간 표 가시성', async ({ page }) => {
  // 시드 row 동적 조회 (apt-detail.spec와 동일 패턴) — 간소화 위해 sourceId로
  const { prisma } = await import('@/lib/db');
  const row = await prisma.parking.findFirst({ where: { sourceId: 'E2E-PRK-1' } });
  await page.goto(`/urban/parking/${row!.id}`);
  await expect(page.getByRole('heading', { name: '운영시간' })).toBeVisible();
});
```

- [ ] **Step 5: Run E2E locally**

Run: `pnpm playwright test tests/e2e/urban-parking-*.spec.ts`
Expected: 모든 spec PASS. 실패 시 시드/select chip 라벨 대조 후 spec 수정.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/seed.ts tests/e2e/urban-parking-list.spec.ts tests/e2e/urban-parking-detail.spec.ts tests/e2e/urban-parking-mobile.spec.ts
git commit -m "test(urban): parking LIST/DETAIL/모바일 E2E + 시드 3건"
```

---

## Final Verification

- [ ] **Step 1: Run all unit tests**

Run: `pnpm vitest run`
Expected: 모든 단위 테스트 PASS (urban-* 5종 + life-menu/sitemap 갱신).

- [ ] **Step 2: Run E2E full suite**

Run: `pnpm playwright test`
Expected: urban-parking-* 3종 + 기존 e2e 회귀 없음.

- [ ] **Step 3: Type check**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Manual smoke**

`pnpm dev` 후:
- `/urban/parking` 진입 시 `?sido=서울` redirect
- 카드 → DETAIL 진입, 11섹션 모두 렌더
- 모바일 viewport (375px)에서 sibling 탭 가로 스크롤, 필터 시트 열림
- `/life/urban` 그룹 hub에서 "주차장"만 live, 공원·충전소 SoonModal

- [ ] **Step 5: Final commit if any fixes**

`git status` 깨끗 확인.

---

## Self-Review Notes

- **Spec coverage**: spec §3–10의 각 요구사항이 Task 1–20에 매핑됨:
  - §3 routing → Task 12, 18
  - §4 컬럼 매핑 → Tasks 5, 6, 13, 14, 15, 16, 17
  - §5 디렉터리 → 전 Task의 File 표시
  - §6 타입/어댑터 → Tasks 1, 5, 6
  - §7 LIST → Tasks 8–12
  - §8 DETAIL → Tasks 13–18
  - §9 menu/메타/sitemap → Tasks 12 metadata + 18 metadata + 19
  - §10 테스트 → Tasks 2–6, 19, 20
- **Type consistency**: `ParkingRaw = NonNullable<Awaited<ReturnType<typeof prisma.parking.findFirst>>>` 한 곳에서만 정의 → 모든 컴포넌트가 동일 타입 import.
- **No placeholders**: 모든 Step에 실 코드 또는 명령. "TBD" 없음.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-urban-parking-list-detail.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — Tasks in this session using executing-plans, batch with checkpoints.

Which approach?
