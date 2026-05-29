# 어린이집 LIST/DETAIL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 적재된 25,113건 `Childcare` 데이터를 `/childcare` 라우트(전국 LIST · 시군구 grid · 시군구 LIST · DETAIL)로 노출하고, `school` DETAIL에 "주변 어린이집" 카드를 추가한다.

**Architecture:** `lib/childcare.ts`(헬퍼)는 `lib/school.ts` 패턴을 1:1로 따른다. UI는 `app/(public)/school/**` 컴포넌트를 카피해 어린이집 필드로 치환하고, 어린이집 고유 카드(`AgeBreakdown`/`WaitList`/`Staff`/`Facility`)만 새로 작성한다. 모바일은 native `<details>` 기반 아코디언으로 데이터-dense 카드를 세로 stack 한다.

**Tech Stack:** Next.js App Router (15) · Prisma (PostgreSQL+PostGIS) · Tailwind · TypeScript · vitest · Playwright · pnpm

**Spec:** `docs/superpowers/specs/2026-05-29-childcare-list-detail-design.md`

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `lib/childcare.ts` | 헬퍼 (list/byId/counts/타입 매핑) | Create |
| `tests/lib/childcare.test.ts` | 헬퍼 단위 테스트 | Create |
| `app/(public)/childcare/page.tsx` | 전국 LIST + sido 필터 | Create |
| `app/(public)/childcare/regions/page.tsx` | 시군구 grid + count | Create |
| `app/(public)/childcare/[sigunguCode]/page.tsx` | 시군구 LIST | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | DETAIL | Create |
| `app/(public)/childcare/_components/childcare-card.tsx` | LIST 카드 | Create |
| `app/(public)/childcare/_components/childcare-filter-panel.tsx` | 필터 패널 (`sido`/`region`/`type`/`q`/`inactive`) | Create |
| `app/(public)/childcare/_components/childcare-mobile-filter-sheet.tsx` | 모바일 필터 시트 | Create |
| `app/(public)/childcare/_components/childcare-pagination.tsx` | 페이지네이션 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-hero.tsx` | DETAIL Hero | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-info.tsx` | DETAIL 기본정보 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-facility.tsx` | DETAIL 시설 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-age-breakdown.tsx` | DETAIL 연령별 반/아동수 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-wait-list.tsx` | DETAIL 입소대기 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-staff.tsx` | DETAIL 교직원 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-detail-sidebar.tsx` | DETAIL 사이드바 | Create |
| `app/(public)/childcare/[sigunguCode]/[id]/_components/nearby-childcare.tsx` | "근처 어린이집" 카드 (DETAIL · school DETAIL 공용) | Create |
| `components/ui/details-card.tsx` | `<details>` 기반 모바일 아코디언 래퍼 | Create |
| `lib/amenity/nearby.ts` | `getNearbyChildcare` 추가 | Modify |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | NearbyChildcare 카드 통합 | Modify |
| `app/(public)/school/[sigunguCode]/[id]/_components/nearby-childcare.tsx` | school DETAIL용 (어린이집 detail의 컴포넌트 재사용) | Create (symlink-like re-export) |
| `app/(public)/_components/life-menu.ts` | 어린이집 항목 `live: true` 전환 | Modify |
| `tests/e2e/childcare.spec.ts` | E2E | Create |
| `tests/e2e/seed.ts` | childcare 시드 추가 | Modify |

---

## Task 0: 적재 데이터 채움률 확인 (가드)

**Files:** (검증만 — 결과는 이미 spec에 반영됨, 재확인 1회)

- [ ] **Step 1: 적재 row 수와 핵심 컬럼 채움률 확인**

Run:
```bash
pnpm dotenv -e .env.local -- pnpm exec tsx -e "
import('./lib/db').then(async ({prisma}) => {
  const total = await prisma.childcare.count();
  const fill = await prisma.\$queryRaw\`
    SELECT
      COUNT(*)::int total,
      COUNT(location)::int with_loc,
      COUNT(\"classCnt00\")::int cls00,
      COUNT(\"classCntTot\")::int clsTot,
      COUNT(\"waitCntTot\")::int wait_with,
      COUNT(\"emTenure0y\")::int tenure_with,
      COUNT(\"emRoleTot\")::int role_with
    FROM \"Childcare\"
  \`;
  console.log({ total, fill });
  await prisma.\$disconnect();
});
"
```
Expected: `total > 20000`, `cls00 / total > 0.95`, `tenure_with / total > 0.9`, `with_loc / total > 0.99`. (spec의 카드 비노출 규칙이 그대로 유효함을 재확인.)

> 임계 미달 시: `AgeBreakdown` 개별 연령 셀 제거 또는 `Staff` 근속년수 섹션 제거 결정 후 진행. 현재 측정 결과는 모두 임계 충족.

---

## Task 1: `lib/childcare.ts` 헬퍼 (TDD)

**Files:**
- Create: `lib/childcare.ts`
- Test: `tests/lib/childcare.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/childcare.test.ts` 생성:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import {
  getChildcareTypeFromDB,
  getChildcareTypeLabel,
  getChildcareList,
  buildChildcareWhere,
} from '@/lib/childcare';

const SEED_SIGUNGU = '99999';
const seedIds: bigint[] = [];

beforeAll(async () => {
  await prisma.childcare.deleteMany({ where: { sigunguCode: SEED_SIGUNGU } });
  const rows = [
    { sourceId: '99999000001', name: '국공A', crType: '국공립', status: '정상', capacity: 60 },
    { sourceId: '99999000002', name: '민간A',  crType: '민간',   status: '정상', capacity: 40 },
    { sourceId: '99999000003', name: '가정A',  crType: '가정',   status: '정상', capacity: 18 },
    { sourceId: '99999000004', name: '협동A',  crType: '협동',   status: '정상', capacity: 20 },
    { sourceId: '99999000005', name: '폐원A',  crType: '민간',   status: '휴지', capacity: 20 },
  ];
  for (const r of rows) {
    const created = await prisma.childcare.create({
      data: { ...r, sigunguCode: SEED_SIGUNGU, address: `서울특별시 테스트구 ${r.name}로 1` },
    });
    seedIds.push(created.id);
  }
});

afterAll(async () => {
  await prisma.childcare.deleteMany({ where: { sigunguCode: SEED_SIGUNGU } });
  await prisma.$disconnect();
});

describe('getChildcareTypeFromDB', () => {
  it('각 한국어 crType을 정확한 슬러그로 매핑', () => {
    expect(getChildcareTypeFromDB('국공립')).toBe('public');
    expect(getChildcareTypeFromDB('사회복지법인')).toBe('legalwelfare');
    expect(getChildcareTypeFromDB('법인·단체등')).toBe('legalorg');
    expect(getChildcareTypeFromDB('민간')).toBe('private');
    expect(getChildcareTypeFromDB('가정')).toBe('home');
    expect(getChildcareTypeFromDB('협동')).toBe('coop');
    expect(getChildcareTypeFromDB('직장')).toBe('workplace');
    expect(getChildcareTypeFromDB(null)).toBe('all');
    expect(getChildcareTypeFromDB('알수없음')).toBe('all');
  });
});

describe('getChildcareTypeLabel', () => {
  it('슬러그 → 한국어 라벨', () => {
    expect(getChildcareTypeLabel('public')).toBe('국공립');
    expect(getChildcareTypeLabel('coop')).toBe('협동');
    expect(getChildcareTypeLabel('all')).toBe('전체');
  });
});

describe('buildChildcareWhere', () => {
  it('운영중지 토글이 없으면 정상·재개만', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU });
    expect(w.status).toEqual({ in: ['정상', '재개', null] });
  });
  it('includeInactive=true면 status 필터 제거', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU, includeInactive: 'true' });
    expect(w.status).toBeUndefined();
  });
  it('type=public이면 crType=국공립', () => {
    const w = buildChildcareWhere({ sigunguCode: SEED_SIGUNGU, type: 'public' });
    expect(w.crType).toBe('국공립');
  });
});

describe('getChildcareList', () => {
  it('운영중지 기본 제외 — 휴지 row가 결과에 없음', async () => {
    const { rows, total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU }, 1);
    expect(total).toBe(4);
    expect(rows.find((r) => r.name === '폐원A')).toBeUndefined();
  });
  it('includeInactive=true면 휴지 포함', async () => {
    const { total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, includeInactive: 'true' }, 1);
    expect(total).toBe(5);
  });
  it('type 필터가 정확 일치', async () => {
    const { rows, total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, type: 'home' }, 1);
    expect(total).toBe(1);
    expect(rows[0].name).toBe('가정A');
  });
  it('q 검색이 name contains', async () => {
    const { total } = await getChildcareList({ sigunguCode: SEED_SIGUNGU, q: '협동' }, 1);
    expect(total).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/lib/childcare.test.ts`
Expected: FAIL — `lib/childcare` 모듈 없음.

- [ ] **Step 3: `lib/childcare.ts` 구현**

`lib/childcare.ts` 생성:

```ts
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type ChildcareTypeSlug =
  | 'all'
  | 'public'
  | 'legalwelfare'
  | 'legalorg'
  | 'private'
  | 'home'
  | 'coop'
  | 'workplace';

const TYPE_TO_KO: Record<Exclude<ChildcareTypeSlug, 'all'>, string> = {
  public: '국공립',
  legalwelfare: '사회복지법인',
  legalorg: '법인·단체등',
  private: '민간',
  home: '가정',
  coop: '협동',
  workplace: '직장',
};
const KO_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_KO).map(([k, v]) => [v, k as Exclude<ChildcareTypeSlug, 'all'>]),
) as Record<string, ChildcareTypeSlug>;

const LABEL: Record<ChildcareTypeSlug, string> = {
  all: '전체',
  public: '국공립',
  legalwelfare: '사회복지법인',
  legalorg: '법인·단체등',
  private: '민간',
  home: '가정',
  coop: '협동',
  workplace: '직장',
};

export function getChildcareTypeFromDB(crType: string | null): ChildcareTypeSlug {
  if (!crType) return 'all';
  return KO_TO_TYPE[crType] ?? 'all';
}

export function getChildcareTypeLabel(slug: ChildcareTypeSlug): string {
  return LABEL[slug] ?? '전체';
}

export interface ChildcareFilter {
  sido?: string;
  sigunguCode?: string;
  type?: ChildcareTypeSlug;
  q?: string;
  /** 'true'면 운영중지(휴지) 포함. 폐지는 실데이터 0건이므로 별도 구분 없음. */
  includeInactive?: string;
}

export function buildChildcareWhere(f: ChildcareFilter): Prisma.ChildcareWhereInput {
  const where: Prisma.ChildcareWhereInput = {};
  if (f.sigunguCode) where.sigunguCode = f.sigunguCode;
  else if (f.sido) where.sido = f.sido;
  if (f.type && f.type !== 'all') where.crType = TYPE_TO_KO[f.type];
  if (f.includeInactive !== 'true') {
    where.status = { in: ['정상', '재개', null] };
  }
  if (f.q) where.name = { contains: f.q };
  return where;
}

const PER_PAGE = 20;

export async function getChildcareList(f: ChildcareFilter, page = 1) {
  const where = buildChildcareWhere(f);
  const [rows, total] = await Promise.all([
    prisma.childcare.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true, name: true, address: true, sigunguCode: true, sigungu: true,
        crType: true, status: true, capacity: true, currentCount: true,
      },
    }),
    prisma.childcare.count({ where }),
  ]);
  return { rows, total, page, perPage: PER_PAGE, totalPages: Math.ceil(total / PER_PAGE) };
}

export async function getChildcareById(id: bigint) {
  return prisma.childcare.findUnique({ where: { id } });
}

export async function getChildcareLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Childcare" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export async function getChildcareCountsBySigungu(filter?: { sido?: string }) {
  const grouped = await prisma.childcare.groupBy({
    by: ['sigunguCode'],
    where: {
      status: { in: ['정상', '재개', null] },
      ...(filter?.sido ? { sido: filter.sido } : {}),
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) if (g.sigunguCode) map.set(g.sigunguCode, g._count._all);
  return map;
}

export async function getChildcareTypeCounts(sigunguCode?: string) {
  const grouped = await prisma.childcare.groupBy({
    by: ['crType'],
    where: {
      status: { in: ['정상', '재개', null] },
      ...(sigunguCode ? { sigunguCode } : {}),
    },
    _count: { _all: true },
  });
  const byType = { all: 0, public: 0, legalwelfare: 0, legalorg: 0, private: 0, home: 0, coop: 0, workplace: 0 } as Record<ChildcareTypeSlug, number>;
  let total = 0;
  for (const g of grouped) {
    const slug = getChildcareTypeFromDB(g.crType);
    byType[slug] += g._count._all;
    total += g._count._all;
  }
  byType.all = total;
  return { total, byType };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/lib/childcare.test.ts`
Expected: 10 passed (또는 그 이상).

- [ ] **Step 5: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add lib/childcare.ts tests/lib/childcare.test.ts
git commit -m "feat(childcare): lib/childcare 헬퍼 + 단위 테스트 (TDD)"
```

---

## Task 2: 모바일 아코디언 공통 컴포넌트

**Files:**
- Create: `components/ui/details-card.tsx`

`AgeBreakdown`/`WaitList`/`Staff`에서 공통으로 쓸 native `<details>` 기반 카드. 데스크톱(`md:`)에서는 항상 펼친 상태.

- [ ] **Step 1: `details-card.tsx` 작성**

```tsx
'use client';
import type { ReactNode } from 'react';

interface Props {
  id?: string;
  title: string;
  /** 닫혀 있을 때 보일 한 줄 요약 (선택) */
  summary?: string;
  /** 모바일에서 기본 펼침 여부 (기본 false: 닫힘) */
  defaultOpenMobile?: boolean;
  children: ReactNode;
}

/**
 * 모바일: <details>로 접힘/펼침 (defaultOpenMobile=false면 닫힌 상태로 시작).
 * 데스크톱(md:): summary 숨기고 본문만 그대로 노출 — 항상 펼쳐 보임.
 */
export function DetailsCard({ id, title, summary, defaultOpenMobile = false, children }: Props) {
  return (
    <details
      id={id}
      open={defaultOpenMobile}
      className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7 md:[&]:!open md:open"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 md:cursor-default">
        <h2 className="text-base font-bold text-[var(--color-blue-dark)] md:text-lg">{title}</h2>
        {summary && <span className="truncate text-xs text-[var(--color-muted)] md:hidden">{summary}</span>}
        <span aria-hidden className="text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180 md:hidden">▾</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add components/ui/details-card.tsx
git commit -m "feat(ui): DetailsCard — 모바일 아코디언, 데스크톱 자동 펼침"
```

---

## Task 3: LIST 컴포넌트 (`card` / `filter-panel` / `mobile-filter-sheet` / `pagination`)

학교 컴포넌트를 카피해 어린이집 필드로 치환한다.

**Files:**
- Create: `app/(public)/childcare/_components/childcare-card.tsx`
- Create: `app/(public)/childcare/_components/childcare-filter-panel.tsx`
- Create: `app/(public)/childcare/_components/childcare-mobile-filter-sheet.tsx`
- Create: `app/(public)/childcare/_components/childcare-pagination.tsx`

- [ ] **Step 1: `childcare-card.tsx` 작성**

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

interface ChildcareCardItem {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  crType: string | null;
  status: string | null;
  capacity: number | null;
  currentCount: number | null;
}

export function ChildcareCard({ item }: { item: ChildcareCardItem }) {
  const fillPct =
    item.capacity && item.capacity > 0 && item.currentCount != null
      ? Math.round((item.currentCount / item.capacity) * 100)
      : null;
  return (
    <Link href={`/childcare/${item.sigunguCode}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">👶</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{item.name}</h3>
            {item.crType && <Badge tone="blue">{item.crType}</Badge>}
            {item.status === '휴지' && <Badge tone="gray">휴지</Badge>}
            {item.status === '재개' && <Badge tone="green">재개</Badge>}
          </div>
          <p className="mt-1.5 truncate text-sm text-[var(--color-muted)]">
            {item.address}
            {item.capacity != null && <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">정원 {item.capacity}{fillPct != null ? ` · ${fillPct}%` : ''}</span>}
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

- [ ] **Step 2: `childcare-filter-panel.tsx` 작성**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';

interface SidoItem { code: string; sido: string; fullName: string; }
interface SigunguItem { code: string; sigungu: string; fullName: string; sigunguCode: string; }

const TYPES = [
  ['all', '전체'], ['public', '국공립'], ['legalwelfare', '사회복지법인'],
  ['legalorg', '법인·단체등'], ['private', '민간'], ['home', '가정'],
  ['coop', '협동'], ['workplace', '직장'],
] as const;

interface Props {
  basePath: string;
  sidoList?: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function ChildcareFilterPanel({ basePath, sidoList, params: ext, onParamsChange }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const get = (k: string, d = 'all') => p.get(k) ?? d;
  const sido = p.get('sido');
  const region = p.get('region');
  const includeInactive = p.get('inactive') === 'true';

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
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`${basePath}?${next.toString()}`);
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">어린이집명</h3>
        <input
          defaultValue={p.get('q') ?? ''}
          onBlur={(e) => update({ q: e.target.value || null })}
          onKeyDown={(e) => { if (e.key === 'Enter') update({ q: (e.target as HTMLInputElement).value || null }); }}
          placeholder="예) 천사어린이집"
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

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">운영유형</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPES.map(([val, label]) => (
            <Chip key={val} active={get('type') === val} onClick={() => update({ type: val === 'all' ? null : val })}>
              {label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => update({ inactive: e.target.checked ? 'true' : null })}
            className="h-4 w-4 rounded border-[var(--color-line)]"
          />
          운영중지(휴지) 포함
        </label>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: `childcare-mobile-filter-sheet.tsx` 작성**

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ChildcareFilterPanel } from './childcare-filter-panel';

interface SidoItem { code: string; sido: string; fullName: string; }

export function ChildcareMobileFilterSheet({ basePath, sidoList }: { basePath: string; sidoList?: SidoItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeCount = ['sido', 'type', 'q', 'inactive'].filter((k) => sp.get(k) && sp.get(k) !== 'all').length;

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
        <ChildcareFilterPanel basePath={basePath} sidoList={sidoList} params={pending} onParamsChange={setPending} />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: `childcare-pagination.tsx` 작성**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

export function ChildcarePagination({ basePath, current, totalPages, totalItems, perPage }: {
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

- [ ] **Step 5: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add "app/(public)/childcare/_components/"
git commit -m "feat(childcare): LIST용 카드·필터·모바일시트·페이지네이션"
```

---

## Task 4: 전국 LIST 페이지 `/childcare`

**Files:**
- Create: `app/(public)/childcare/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { getSidoList } from '@/lib/region';
import { getChildcareList, type ChildcareTypeSlug } from '@/lib/childcare';
import { ChildcareFilterPanel } from './_components/childcare-filter-panel';
import { ChildcareMobileFilterSheet } from './_components/childcare-mobile-filter-sheet';
import { ChildcareCard } from './_components/childcare-card';
import { ChildcarePagination } from './_components/childcare-pagination';
import { SiblingTabs } from '../_components/sibling-tabs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '어린이집찾기 — 전국 국공립·민간·가정',
  description: '지역·유형으로 어린이집을 찾고, 주변 아파트 실거래가까지 확인하세요.',
  alternates: { canonical: '/childcare' },
};

export const revalidate = 21_600;

interface Props { searchParams: Promise<Record<string, string>>; }

export default async function ChildcareListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sidoList = await getSidoList().catch(() => []);
  const basePath = '/childcare';
  const page = Math.max(1, Number(sp.page ?? '1'));
  const filter = {
    sido: sp.sido,
    sigunguCode: sp.region,
    type: (sp.type ?? 'all') as ChildcareTypeSlug,
    q: sp.q,
    includeInactive: sp.inactive,
  };
  const { rows, total, totalPages, perPage } = await getChildcareList(filter, page);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">어린이집찾기</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의 · 어린이집찾기</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">어린이집찾기</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">지역·운영유형으로 좁혀보세요. 어린이집을 누르면 정원·연령별 현황과 주변 아파트 실거래가까지 확인할 수 있어요.</p>
        <Link
          href="/childcare/regions"
          className="mt-4 inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-blue)] transition hover:border-[var(--color-sky)]"
        >
          📍 지역별 어린이집 찾기 →
        </Link>
      </div>

      <SiblingTabs currentHref="/childcare" />

      <Suspense><ChildcareMobileFilterSheet basePath={basePath} sidoList={sidoList} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ChildcareFilterPanel basePath={basePath} sidoList={sidoList} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 어린이집</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 어린이집이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((c) => <ChildcareCard key={String(c.id)} item={c} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><ChildcarePagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: dev server 띄우고 진입 확인**

Run: `pnpm dev` (백그라운드) → 새 터미널에서 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/childcare`
Expected: `200`.

브라우저: `http://localhost:3000/childcare` → "어린이집찾기" h1, 25,113+ row 카운트, 카드 ≥ 1, 우측 필터 패널, 모바일 viewport에서는 필터 버튼이 보이고 사이드바 hide.

- [ ] **Step 3: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint app/\(public\)/childcare`
Expected: 신규 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/childcare/page.tsx"
git commit -m "feat(childcare): /childcare 전국 LIST 페이지"
```

---

## Task 5: 시군구 grid `/childcare/regions`

**Files:**
- Create: `app/(public)/childcare/regions/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import Link from 'next/link';
import { getSigunguList } from '@/lib/region';
import { getChildcareCountsBySigungu } from '@/lib/childcare';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '지역별 어린이집',
  description: '시·도와 시군구별 어린이집 분포를 한눈에.',
  alternates: { canonical: '/childcare/regions' },
};

export const revalidate = 21_600;

export default async function ChildcareRegionsPage() {
  const [sigunguList, counts] = await Promise.all([
    getSigunguList(),
    getChildcareCountsBySigungu(),
  ]);

  const bySido = new Map<string, { code: string; sigungu: string; sigunguCode: string; count: number }[]>();
  for (const sg of sigunguList) {
    if (!sg.sigunguCode) continue;
    const list = bySido.get(sg.sido) ?? [];
    list.push({ code: sg.code, sigungu: sg.sigungu, sigunguCode: sg.sigunguCode, count: counts.get(sg.sigunguCode) ?? 0 });
    bySido.set(sg.sido, list);
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">지역별</span>
      </nav>
      <h1 className="mb-6 text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">지역별 어린이집</h1>
      <div className="flex flex-col gap-8">
        {Array.from(bySido.entries()).map(([sido, items]) => (
          <section key={sido}>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{sido}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((it) => (
                <Link
                  key={it.code}
                  href={`/childcare/${it.sigunguCode}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-soft)] hover:border-[var(--color-sky)]"
                >
                  <span className="font-semibold text-[var(--color-blue-dark)]">{it.sigungu}</span>
                  <span className="text-xs text-[var(--color-muted)]">{it.count.toLocaleString('ko-KR')}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 진입 확인**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/childcare/regions`
Expected: `200`. 브라우저 → 시도별로 시군구 grid에 count 표시.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/childcare/regions/"
git commit -m "feat(childcare): /childcare/regions 시군구 grid 페이지"
```

---

## Task 6: 시군구 LIST `/childcare/[sigunguCode]`

**Files:**
- Create: `app/(public)/childcare/[sigunguCode]/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { getSigunguByCode } from '@/lib/region';
import { getChildcareList, getChildcareTypeCounts, type ChildcareTypeSlug } from '@/lib/childcare';
import { ChildcareFilterPanel } from '../_components/childcare-filter-panel';
import { ChildcareMobileFilterSheet } from '../_components/childcare-mobile-filter-sheet';
import { ChildcareCard } from '../_components/childcare-card';
import { ChildcarePagination } from '../_components/childcare-pagination';
import type { Metadata } from 'next';

export const revalidate = 21_600;

interface Params { params: Promise<{ sigunguCode: string }>; searchParams: Promise<Record<string, string>>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode } = await params;
  const r = await getSigunguByCode(sigunguCode).catch(() => null);
  if (!r) return {};
  return {
    title: `${r.fullName} 어린이집 — 국공립·민간·가정`,
    description: `${r.fullName}의 어린이집 목록과 위치, 주변 아파트 실거래가.`,
    alternates: { canonical: `/childcare/${sigunguCode}` },
  };
}

export default async function ChildcareSigunguListPage({ params, searchParams }: Params) {
  const { sigunguCode } = await params;
  const sp = await searchParams;
  const region = await getSigunguByCode(sigunguCode);
  if (!region || !region.sigunguCode) notFound();

  const basePath = `/childcare/${sigunguCode}`;
  const page = Math.max(1, Number(sp.page ?? '1'));
  const filter = {
    sigunguCode,
    type: (sp.type ?? 'all') as ChildcareTypeSlug,
    q: sp.q,
    includeInactive: sp.inactive,
  };
  const [{ rows, total, totalPages, perPage }, typeCounts] = await Promise.all([
    getChildcareList(filter, page),
    getChildcareTypeCounts(sigunguCode),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{region.fullName}</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">어린이집찾기 · {region.fullName}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{region.sigungu} 어린이집</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전체 {typeCounts.total.toLocaleString('ko-KR')}개 · <Link href="/childcare" className="font-semibold text-[var(--color-blue)]">전국에서 검색 →</Link></p>
      </div>

      <Suspense><ChildcareMobileFilterSheet basePath={basePath} /></Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <ChildcareFilterPanel basePath={basePath} />
            </Suspense>
          </div>
          <div className="mt-4 rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-5 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]"><span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 어린이집</p>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">조건에 맞는 어린이집이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((c) => <ChildcareCard key={String(c.id)} item={c} />)}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6">
              <Suspense><ChildcarePagination basePath={basePath} current={page} totalPages={totalPages} totalItems={total} perPage={perPage} /></Suspense>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 진입 확인 (송파 `11710`)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/childcare/11710`
Expected: `200`. 브라우저 → 송파구 어린이집 ~270건 카드 출력. 필터 적용 후 URL 갱신 확인.

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/childcare/[sigunguCode]/page.tsx"
git commit -m "feat(childcare): /childcare/[sigunguCode] 시군구 LIST"
```

---

## Task 7: DETAIL 컴포넌트 (Hero / Info / Facility)

**Files:**
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-hero.tsx`
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-info.tsx`
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-facility.tsx`
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-detail-sidebar.tsx`

- [ ] **Step 1: `childcare-hero.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import type { Childcare } from '@prisma/client';

export function ChildcareHero({ item }: { item: Childcare }) {
  const fillPct =
    item.capacity && item.capacity > 0 && item.currentCount != null
      ? Math.round((item.currentCount / item.capacity) * 100)
      : null;
  return (
    <div className="rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-3xl">👶</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] line-clamp-2 md:text-3xl">{item.name}</h1>
            {item.crType && <Badge tone="blue">{item.crType}</Badge>}
            {item.status === '휴지' && <Badge tone="gray">휴지</Badge>}
            {item.status === '재개' && <Badge tone="green">재개</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
            <span>📍 {item.address}</span>
            {item.tel && <span>📞 {item.tel}</span>}
            {item.homepage && <a href={item.homepage} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-blue)]">🔗 홈페이지</a>}
          </div>
        </div>
      </div>
      {item.capacity != null && (
        <div className="mt-5 rounded-2xl bg-[var(--color-soft)] p-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-bold text-[var(--color-blue-dark)]">정원 대비 현원</span>
            <span className="font-mono text-[var(--color-muted)]">
              {item.currentCount ?? '-'} / {item.capacity}{fillPct != null && ` · ${fillPct}%`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[var(--color-blue)] transition-[width]"
              style={{ width: `${Math.min(100, fillPct ?? 0)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `childcare-info.tsx`**

```tsx
import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';

function fmtDate(d: Date | null): string {
  if (!d) return '-';
  return d.toISOString().slice(0, 10);
}

export function ChildcareInfo({ item, regionFullName }: { item: Childcare; regionFullName: string }) {
  const rows: [string, string | null][] = [
    ['지역', regionFullName],
    ['주소', item.address],
    ['전화', item.tel],
    ['팩스', item.fax],
    ['홈페이지', item.homepage],
    ['대표자', item.repName],
    ['인가일', fmtDate(item.confirmDate)],
    ['통학차량', item.vehicleOp],
    ['제공서비스', item.services],
    ['운영상태', item.status ?? '정상'],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">기본 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
            <span className="text-sm text-[var(--color-muted)]">{k}</span>
            <span className="ml-2 truncate text-sm font-semibold text-[var(--color-text)]" title={v ?? '-'}>{v ?? '-'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: `childcare-facility.tsx`**

```tsx
import { Card } from '@/components/ui/card';
import type { Childcare } from '@prisma/client';

export function ChildcareFacility({ item }: { item: Childcare }) {
  const items: { label: string; value: string }[] = [
    { label: '보육실', value: item.roomCount != null ? `${item.roomCount}실${item.roomSize != null ? ` · ${item.roomSize}㎡` : ''}` : '-' },
    { label: '놀이터', value: item.playgroundCount != null ? `${item.playgroundCount}개` : '-' },
    { label: 'CCTV', value: item.cctvCount != null ? `${item.cctvCount}대` : '-' },
    { label: '교직원', value: item.staffCount != null ? `${item.staffCount}명` : '-' },
  ];
  return (
    <Card id="facility">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">시설</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3 text-center">
            <div className="text-xs text-[var(--color-muted)]">{it.label}</div>
            <div className="mt-1 text-base font-bold text-[var(--color-blue-dark)]">{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: `childcare-detail-sidebar.tsx`**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';

interface SidebarItem { id: bigint; name: string; }

const ANCHORS = [
  { href: '#info', label: '기본 정보' },
  { href: '#facility', label: '시설' },
  { href: '#age-breakdown', label: '연령별 현황' },
  { href: '#wait-list', label: '입소대기' },
  { href: '#staff', label: '교직원' },
  { href: '#map', label: '위치' },
  { href: '#apt', label: '주변 아파트' },
];

export function ChildcareDetailSidebar({ basePath, others }: { basePath: string; others: SidebarItem[] }) {
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
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 다른 어린이집</h3>
          <ul className="flex flex-col gap-2">
            {others.map((o) => <li key={String(o.id)}><Link href={`${basePath}/${o.id}`} className="text-sm hover:text-[var(--color-blue)]">· {o.name}</Link></li>)}
            <li><Link href={basePath} className="text-sm font-semibold text-[var(--color-blue)]">지역 어린이집 전체 보기 →</Link></li>
          </ul>
        </Card>
      )}
      <div className="rounded-[20px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-xs text-[var(--color-muted)]">광고 영역</div>
    </div>
  );
}
```

- [ ] **Step 5: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-hero.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-info.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-facility.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-detail-sidebar.tsx"
git commit -m "feat(childcare): DETAIL Hero·Info·Facility·Sidebar 컴포넌트"
```

---

## Task 8: DETAIL 데이터-dense 컴포넌트 (AgeBreakdown / WaitList / Staff)

모바일에서 `DetailsCard` (Task 2)로 감싸서 아코디언 처리.

**Files:**
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-age-breakdown.tsx`
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-wait-list.tsx`
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-staff.tsx`

- [ ] **Step 1: `childcare-age-breakdown.tsx`**

```tsx
import { DetailsCard } from '@/components/ui/details-card';
import type { Childcare } from '@prisma/client';

const AGES = [
  ['00', '만 0세'], ['01', '만 1세'], ['02', '만 2세'],
  ['03', '만 3세'], ['04', '만 4세'], ['05', '만 5세'],
] as const;
const MIXED = [
  ['M2', '영아혼합(0~2세)'], ['M3', '영유아혼합(2~3세)'], ['M5', '유아혼합(3~5세)'], ['Sp', '특수장애'],
] as const;

function row(item: Childcare, key: string): { cls: number | null; chd: number | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = item as any;
  return { cls: i[`classCnt${key}`] ?? null, chd: i[`childCnt${key}`] ?? null };
}

export function ChildcareAgeBreakdown({ item }: { item: Childcare }) {
  if (item.classCntTot == null && item.childCntTot == null) {
    return (
      <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 text-sm text-[var(--color-muted)] shadow-[var(--shadow-soft)] md:p-7">
        <h2 className="mb-2 text-lg font-bold text-[var(--color-blue-dark)]">연령별 현황</h2>
        공시 데이터 없음
      </div>
    );
  }
  const summary = `반 ${item.classCntTot ?? '-'} · 아동 ${item.childCntTot ?? '-'}명`;
  return (
    <DetailsCard id="age-breakdown" title="연령별 현황" summary={summary} defaultOpenMobile>
      <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-soft)] text-xs">
            <tr>
              <th className="px-3 py-2 text-left text-[var(--color-muted)]">연령</th>
              <th className="px-3 py-2 text-right text-[var(--color-muted)]">반</th>
              <th className="px-3 py-2 text-right text-[var(--color-muted)]">아동</th>
            </tr>
          </thead>
          <tbody>
            {AGES.map(([k, label]) => {
              const r = row(item, k);
              return (
                <tr key={k} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cls ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.chd ?? '-'}</td>
                </tr>
              );
            })}
            {MIXED.map(([k, label]) => {
              const r = row(item, k);
              if (r.cls == null && r.chd == null) return null;
              return (
                <tr key={k} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 text-[var(--color-muted)]">{label}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.cls ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.chd ?? '-'}</td>
                </tr>
              );
            })}
            <tr className="border-t border-[var(--color-line)] bg-[var(--color-soft)]">
              <td className="px-3 py-2 font-bold">합계</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{item.classCntTot ?? '-'}</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{item.childCntTot ?? '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DetailsCard>
  );
}
```

- [ ] **Step 2: `childcare-wait-list.tsx`**

```tsx
import { DetailsCard } from '@/components/ui/details-card';
import type { Childcare } from '@prisma/client';

const AGES = [
  ['00', '만 0세'], ['01', '만 1세'], ['02', '만 2세'],
  ['03', '만 3세'], ['04', '만 4세'], ['05', '만 5세'], ['M6', '6세 이상'],
] as const;

export function ChildcareWaitList({ item }: { item: Childcare }) {
  if (item.waitCntTot == null || item.waitCntTot === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = item as any;
  return (
    <DetailsCard id="wait-list" title="입소대기 현황" summary={`총 ${item.waitCntTot}명 대기`}>
      <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {AGES.map(([k, label]) => {
          const v = i[`waitCnt${k}`] ?? 0;
          if (v === 0) return null;
          return (
            <li key={k} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
              <span className="text-[var(--color-muted)]">{label}</span>
              <span className="font-mono font-bold text-[var(--color-blue-dark)]">{v}명</span>
            </li>
          );
        })}
      </ul>
    </DetailsCard>
  );
}
```

- [ ] **Step 3: `childcare-staff.tsx`**

```tsx
import { DetailsCard } from '@/components/ui/details-card';
import type { Childcare } from '@prisma/client';

const ROLES = [
  ['emRoleDirector', '원장'], ['emRoleTeacher', '보육교사'], ['emRoleSpecial', '특수교사'],
  ['emRoleTherapy', '치료교사'], ['emRoleNutrition', '영양사'], ['emRoleNurse', '간호사'],
  ['emRoleNurseAssist', '간호조무사'], ['emRoleCook', '조리원'], ['emRoleOffice', '사무직원'],
] as const;
const TENURES = [
  ['emTenure0y', '1년 미만'], ['emTenure1y', '1~2년'], ['emTenure2y', '2~4년'],
  ['emTenure4y', '4~6년'], ['emTenure6y', '6년 이상'],
] as const;

export function ChildcareStaff({ item }: { item: Childcare }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i = item as any;
  const roleRows = ROLES.map(([k, label]) => ({ label, v: i[k] as number | null })).filter((r) => r.v != null && r.v > 0);
  const tenRows = TENURES.map(([k, label]) => ({ label, v: i[k] as number | null })).filter((r) => r.v != null);
  if (roleRows.length === 0 && tenRows.length === 0) return null;
  const summary = item.emRoleTot != null ? `총 ${item.emRoleTot}명` : `총 ${item.staffCount ?? '-'}명`;
  return (
    <DetailsCard id="staff" title="교직원" summary={summary}>
      <div className="flex flex-col gap-5">
        {roleRows.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-blue-dark)]">직역별</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {roleRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
                  <span className="text-[var(--color-muted)]">{r.label}</span>
                  <span className="font-mono font-bold text-[var(--color-blue-dark)]">{r.v}명</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tenRows.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-blue-dark)]">근속년수별</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {tenRows.map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
                  <span className="text-[var(--color-muted)]">{r.label}</span>
                  <span className="font-mono font-bold text-[var(--color-blue-dark)]">{r.v}명</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DetailsCard>
  );
}
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-age-breakdown.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-wait-list.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-staff.tsx"
git commit -m "feat(childcare): DETAIL AgeBreakdown·WaitList·Staff (DetailsCard 아코디언)"
```

---

## Task 9: NearbyChildcare 헬퍼 + 컴포넌트

**Files:**
- Modify: `lib/amenity/nearby.ts` (파일 끝에 함수 추가)
- Create: `app/(public)/childcare/[sigunguCode]/[id]/_components/nearby-childcare.tsx`

- [ ] **Step 1: `lib/amenity/nearby.ts`에 `getNearbyChildcare` 추가**

파일 끝에 추가:

```ts
export interface NearbyChildcare {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  crType: string | null;
  capacity: number | null;
  distanceMeters: number;
}

export async function getNearbyChildcare(
  lat: number,
  lng: number,
  radiusMeters = 1000,
  limit = 5,
  excludeId: bigint | null = null,
): Promise<NearbyChildcare[]> {
  const rows = await prisma.$queryRaw<NearbyChildcare[]>`
    SELECT
      id, name, address, "sigunguCode", "crType", capacity,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric)::int AS "distanceMeters"
    FROM "Childcare"
    WHERE location IS NOT NULL
      AND ("status" IN ('정상', '재개') OR "status" IS NULL)
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT ${limit + 1}
  `;
  return rows.filter((r) => excludeId == null || r.id !== excludeId).slice(0, limit);
}
```

- [ ] **Step 2: `nearby-childcare.tsx` 컴포넌트 작성**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { NearbyChildcare as Item } from '@/lib/amenity/nearby';

export function NearbyChildcare({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <Card id="nearby-childcare">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">근처 어린이집 (1km)</h2>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((it) => (
          <li key={String(it.id)} className="flex items-center gap-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-sky-soft)] text-base">👶</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                <Link href={`/childcare/${it.sigunguCode}/${it.id}`} className="hover:text-[var(--color-blue)]">{it.name}</Link>
                <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">{it.distanceMeters}m</span>
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {it.crType ?? ''}{it.capacity != null ? ` · 정원 ${it.capacity}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3: 타입 체크 + 단위 호출 스모크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

Run:
```bash
pnpm dotenv -e .env.local -- pnpm exec tsx -e "
import('./lib/amenity/nearby').then(async (m) => {
  const r = await m.getNearbyChildcare(37.5045, 127.1043);
  console.log('count:', r.length, 'first:', r[0]?.name, r[0]?.distanceMeters);
});
"
```
Expected: `count:` ≥ 1, 첫 row가 송파 근처 어린이집.

- [ ] **Step 4: Commit**

```bash
git add lib/amenity/nearby.ts "app/(public)/childcare/[sigunguCode]/[id]/_components/nearby-childcare.tsx"
git commit -m "feat(amenity): getNearbyChildcare + NearbyChildcare 카드"
```

---

## Task 10: DETAIL 페이지 `/childcare/[sigunguCode]/[id]`

**Files:**
- Create: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChildcareById, getChildcareLatLng, getChildcareList } from '@/lib/childcare';
import { getSigunguByCode } from '@/lib/region';
import { getNearbyApartments, getNearbyChildcare, getSchoolNearbyAmenities } from '@/lib/amenity/nearby';
import { ChildcareHero } from './_components/childcare-hero';
import { ChildcareInfo } from './_components/childcare-info';
import { ChildcareFacility } from './_components/childcare-facility';
import { ChildcareAgeBreakdown } from './_components/childcare-age-breakdown';
import { ChildcareWaitList } from './_components/childcare-wait-list';
import { ChildcareStaff } from './_components/childcare-staff';
import { ChildcareDetailSidebar } from './_components/childcare-detail-sidebar';
import { NearbyChildcare } from './_components/nearby-childcare';
import { NearbyApartments } from '@/components/ui/nearby-apartments';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';
import type { NearbyApartment } from '@/lib/amenity/nearby';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { sigunguCode, id } = await params;
  const item = await getChildcareById(BigInt(id)).catch(() => null);
  if (!item) return {};
  return {
    title: `${item.name} — ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`,
    description: `${item.name}(${item.address}) 보육정보·정원·교직원·주변 아파트 실거래가.`,
    alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
  };
}

export default async function ChildcareDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const itemId = BigInt(id);
  const [item, region] = await Promise.all([
    getChildcareById(itemId),
    getSigunguByCode(sigunguCode),
  ]);
  if (!item || !region || item.sigunguCode !== sigunguCode) notFound();

  const basePath = `/childcare/${sigunguCode}`;
  const coord = await getChildcareLatLng(itemId);

  const [apts, schoolAmenities, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getSchoolNearbyAmenities(coord.lat, coord.lng) : Promise.resolve({ parks: [], mart: [], chargers: [] } as Awaited<ReturnType<typeof getSchoolNearbyAmenities>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5, itemId) : Promise.resolve([]),
    getChildcareList({ sigunguCode }, 1),
  ]);
  const others = otherList.rows.filter((o) => o.id !== item.id).slice(0, 4).map((o) => ({ id: o.id, name: o.name }));

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <Link href={basePath}>{region.fullName}</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)] truncate max-w-[40vw]">{item.name}</span>
      </nav>

      <ChildcareHero item={item} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <ChildcareInfo item={item} regionFullName={region.fullName} />
          <ChildcareFacility item={item} />
          <ChildcareAgeBreakdown item={item} />
          <ChildcareWaitList item={item} />
          <ChildcareStaff item={item} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={item.name} />
            </Card>
          )}
          <NearbyApartments items={apts} />
          {coord && <NearbyChildcare items={nearbyChildren} />}
          {coord && (
            // 학교 detail의 mixed nearby 컴포넌트 재사용 (parks/mart/chargers 슬롯)
            (await import('../../../school/[sigunguCode]/[id]/_components/nearby-amenities')).NearbyAmenities({
              parks: schoolAmenities.parks, mart: schoolAmenities.mart, chargers: schoolAmenities.chargers,
            })
          )}
        </main>
        <aside><ChildcareDetailSidebar basePath={basePath} others={others} /></aside>
      </div>
    </div>
  );
}
```

> Step 1 NOTE: 위의 `(await import(...)).NearbyAmenities({...})` 인라인 호출은 child component를 평가 직접 호출하는 패턴 — 동작은 하지만 가독성이 떨어진다. 다음 Step에서 정식 import로 정리한다.

- [ ] **Step 2: NearbyAmenities import 정리 + dev server에서 진입 확인**

상단 import에 추가:
```tsx
import { NearbyAmenities } from '../../../school/[sigunguCode]/[id]/_components/nearby-amenities';
```
JSX의 `await import(...)` 라인을 다음으로 교체:
```tsx
{coord && <NearbyAmenities parks={schoolAmenities.parks} mart={schoolAmenities.mart} chargers={schoolAmenities.chargers} />}
```

Run: dev server 살아있는 상태에서 송파 정상 row 1건 확인:
```bash
pnpm dotenv -e .env.local -- pnpm exec tsx -e "
import('./lib/db').then(async ({prisma}) => {
  const r = await prisma.childcare.findFirst({ where: { sigunguCode: '11710', status: '정상', location: { not: null } }, select: { id: true, name: true } });
  console.log(r);
  await prisma.\$disconnect();
});
"
```
얻은 `id`로:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/childcare/11710/<id>"
```
Expected: `200`. 브라우저로 열어 Hero·Info·Facility·AgeBreakdown 테이블·지도·주변 아파트·근처 어린이집·주변 인프라가 모두 노출되는지 확인. 모바일 viewport(<768px)에서 AgeBreakdown/WaitList/Staff가 접힌 채(또는 AgeBreakdown은 펼친 채) 표시되고 헤더 탭 시 토글되는지 확인.

- [ ] **Step 3: 타입 체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint "app/(public)/childcare"`
Expected: 신규 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/childcare/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(childcare): /childcare/[sigunguCode]/[id] DETAIL 페이지"
```

---

## Task 11: school DETAIL에 NearbyChildcare 통합

**Files:**
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: import + Promise.all + JSX 한 줄 추가**

상단 import 묶음에 추가:
```ts
import { getNearbyChildcare } from '@/lib/amenity/nearby';
import { NearbyChildcare } from '../../../childcare/[sigunguCode]/[id]/_components/nearby-childcare';
```

`Promise.all` 블록 변경 — 현재:
```ts
const [apts, amenities, otherList] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
  coord ? getSchoolNearbyAmenities(coord.lat, coord.lng) : Promise.resolve({ parks: [], mart: [], chargers: [] } as Awaited<ReturnType<typeof getSchoolNearbyAmenities>>),
  getSchoolList({ sigunguCode }, 1),
]);
```
다음으로 교체:
```ts
const [apts, amenities, nearbyChildren, otherList] = await Promise.all([
  coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
  coord ? getSchoolNearbyAmenities(coord.lat, coord.lng) : Promise.resolve({ parks: [], mart: [], chargers: [] } as Awaited<ReturnType<typeof getSchoolNearbyAmenities>>),
  coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
  getSchoolList({ sigunguCode }, 1),
]);
```

JSX의 `<NearbyApartments items={apts} />` 바로 다음 줄에 추가:
```tsx
{coord && <NearbyChildcare items={nearbyChildren} />}
```

- [ ] **Step 2: 브라우저 확인**

송파 학교 detail 1건 진입 → "근처 어린이집 (1km)" 카드 추가됨, 송파 어린이집 row 노출. 좌표 없는 학교는 카드 미노출(컴포넌트 자체가 빈 배열이면 return null).

- [ ] **Step 3: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 신규 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(school): DETAIL에 '근처 어린이집' 카드 추가"
```

---

## Task 12: life-menu 라이브 전환

**Files:**
- Modify: `app/(public)/_components/life-menu.ts:27`

- [ ] **Step 1: 한 줄 수정**

```diff
-      { label: '어린이집', href: '/childcare', live: false, soon: true },
+      { label: '어린이집', href: '/childcare', live: true },
```

- [ ] **Step 2: dev에서 sibling-tabs·life 허브·모바일 드로어 확인**

브라우저:
- `/life` → 교육시설 그룹에 어린이집 카드가 'Soon' 배지 없이 라이브 링크로 노출
- `/childcare` → sibling-tabs에 학교·어린이집 두 탭 활성
- `/school` → sibling-tabs에 어린이집 탭 추가됨
- 모바일 드로어(햄버거) → 교육시설 그룹 펼치면 어린이집 클릭 가능(SoonModal 안 뜸)

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/_components/life-menu.ts"
git commit -m "feat(life): 어린이집 라이브 전환"
```

---

## Task 13: E2E

**Files:**
- Modify: `tests/e2e/seed.ts` (childcare 시드 추가)
- Create: `tests/e2e/childcare.spec.ts`

- [ ] **Step 1: 시드 추가**

`tests/e2e/seed.ts`에 기존 amenity 시드 함수 옆 또는 끝에 (스타일은 인접 시드 함수 참조). 시드 헬퍼 이름 규약을 따른다 — 보통 `seedXxx()`:

```ts
export async function seedChildcare() {
  const SIGUNGU = '11710';
  await prisma.childcare.deleteMany({ where: { sourceId: { startsWith: 'E2E_' } } });
  await prisma.childcare.create({
    data: {
      sourceId: 'E2E_CC_0001',
      name: 'E2E 천사어린이집',
      crType: '국공립',
      status: '정상',
      sido: '서울특별시',
      sigungu: '송파구',
      sigunguCode: SIGUNGU,
      address: '서울특별시 송파구 거마로24길 11',
      tel: '02-409-1406',
      capacity: 60,
      currentCount: 40,
      cctvCount: 7,
      staffCount: 13,
      classCntTot: 10,
      childCntTot: 70,
      emRoleDirector: 1,
      emRoleTeacher: 4,
      emRoleTot: 13,
    },
  });
  // 좌표 별도 update (location은 raw SQL 필요)
  await prisma.$executeRaw`UPDATE "Childcare" SET location = ST_SetSRID(ST_MakePoint(127.1043, 37.5045), 4326)::geography WHERE "sourceId" = 'E2E_CC_0001'`;
}
```

기존 seed의 `globalSeed()` 또는 동등 함수에서 `await seedChildcare()` 호출 한 줄 추가. (정확한 진입 함수명은 파일 상단 export 확인.)

- [ ] **Step 2: E2E spec 작성**

`tests/e2e/childcare.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('/childcare', () => {
  test('전국 LIST 진입 + 어린이집 카드 표시', async ({ page }) => {
    await page.goto('/childcare');
    await expect(page.getByRole('heading', { name: '어린이집찾기' })).toBeVisible();
    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
  });

  test('sibling-tabs에 학교·어린이집 모두 노출 (LIST)', async ({ page }) => {
    await page.goto('/childcare');
    await expect(page.getByRole('link', { name: /학교/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /어린이집/ })).toBeVisible();
  });

  test('유형 필터 — 국공립 chip 클릭 시 URL에 ?type=public', async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 768, '모바일은 시트 경유 (별도)');
    await page.goto('/childcare/11710');
    await page.getByRole('button', { name: '국공립' }).click();
    await expect(page).toHaveURL(/[?&]type=public/);
  });

  test('시군구 LIST + 시드 어린이집 노출', async ({ page }) => {
    await page.goto('/childcare/11710');
    await expect(page.getByRole('heading', { name: /송파구.*어린이집/ })).toBeVisible();
    await expect(page.getByText('E2E 천사어린이집').first()).toBeVisible();
  });

  test('DETAIL — Hero / AgeBreakdown / Staff', async ({ page }) => {
    await page.goto('/childcare/11710');
    await page.getByRole('link', { name: /E2E 천사어린이집/ }).first().click();
    await expect(page.getByRole('heading', { name: /E2E 천사어린이집/ })).toBeVisible();
    // AgeBreakdown 합계 행
    await expect(page.getByRole('row', { name: /합계/ })).toBeVisible();
    // Staff 직역 - 원장
    await expect(page.getByText('원장')).toBeVisible();
  });
});

test.describe('school DETAIL — 근처 어린이집', () => {
  test('학교 detail에서 근처 어린이집 카드 노출 (시드 송파)', async ({ page }) => {
    // 송파 학교 1건을 동적으로 찾아서 진입 (id는 seed에 따라 가변)
    await page.goto('/school/11710');
    await page.locator('article').first().click();
    await expect(page.getByRole('heading', { name: /근처 어린이집/ })).toBeVisible();
    await expect(page.getByText('E2E 천사어린이집')).toBeVisible();
  });
});
```

- [ ] **Step 3: E2E 실행**

Run: `pnpm exec playwright test tests/e2e/childcare.spec.ts --project=chromium`
Expected: 전부 PASS. 실패 시 콘솔/스크린샷으로 selector 조정. (시드 호출이 빠졌으면 송파 카드가 안 보임 → Step 1 시드 hook 재확인.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/seed.ts tests/e2e/childcare.spec.ts
git commit -m "test(e2e): /childcare LIST·DETAIL + school detail nearby-childcare"
```

---

## Task 14: 최종 검증

**Files:** (없음 — 검증·합본 확인)

- [ ] **Step 1: 타입 + 린트 + 단위 테스트 (전체)**

Run:
```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm exec vitest run tests/lib/childcare.test.ts
```
Expected: 모두 OK.

- [ ] **Step 2: E2E 풀 스위트**

Run: `pnpm exec playwright test --project=chromium`
Expected: 신규 추가된 childcare spec + 기존 sibling-tabs/life-group-hub spec 통과. 어린이집 라이브 전환으로 sibling-tabs/life-menu 기존 테스트가 영향을 받았다면 그 spec도 함께 PASS.

- [ ] **Step 3: dev에서 골든 패스 수동 확인**

1. `/life` → 교육시설 → 어린이집 클릭 → `/childcare` 진입
2. 시도 "서울특별시" → 시군구 "송파구" → 카드 노출
3. 유형 "가정" 필터 → URL `?type=home`, 카드 필터됨
4. 카드 클릭 → DETAIL → Hero 충원율 게이지·연령별 표·지도·근처 어린이집 모두 노출
5. 모바일 viewport(devtools 375x812) → 필터 버튼 → 시트 열림 → 적용
6. 모바일 DETAIL → AgeBreakdown(펼침 기본)·WaitList(요약 한 줄, 탭 시 펼침)·Staff(요약 한 줄, 탭 시 펼침)
7. `/school/11710` → 임의 학교 진입 → "근처 어린이집" 카드 노출

- [ ] **Step 4: PR 브랜치 생성 + 푸시**

```bash
git checkout -b feat/childcare-list-detail
git push -u origin feat/childcare-list-detail
```

이후 `gh pr create`로 PR을 만들고 PR 본문에 spec/plan 경로 인용. (PR 자동화는 별도 명령으로 사용자가 트리거.)

---

## Self-Review

- **Spec 커버리지**:
  - 라우팅 4개: Task 4(전국)·5(regions)·6(시군구)·10(DETAIL) ✓
  - `lib/childcare.ts` 함수 7종: Task 1 (`getChildcareList`/`getById`/`getLatLng`/`getCountsBySigungu`/`getTypeCounts`/`getTypeLabel`/`getTypeFromDB`) ✓
  - LIST 컴포넌트 4종: Task 3 (card/filter/mobile-sheet/pagination) ✓
  - DETAIL 컴포넌트 7+1종: Task 7 (hero/info/facility/sidebar) + Task 8 (age-breakdown/wait-list/staff) + Task 9 (nearby-childcare) ✓
  - DetailsCard 공통 컴포넌트: Task 2 ✓
  - school detail 통합: Task 11 ✓
  - life-menu live 전환: Task 12 ✓
  - 폐지/휴지 토글: Task 1 (`includeInactive`) + Task 3 (체크박스 UI) ✓
  - sub-filter 7종: Task 3 (`TYPES`) ✓
  - 카드 비노출 규칙: Task 8 (AgeBreakdown `classCntTot==null`, WaitList `waitCntTot==0`, Staff 행 없음) ✓
  - SEO metadata: Task 4·5·6·10 각 generateMetadata ✓
  - 데이터 채움률 가드: Task 0 ✓
  - 모바일 표/매트릭스: Task 8 (DetailsCard로 세로 stack + 아코디언) ✓
  - E2E: Task 13 (LIST/DETAIL/필터/시드 + school 통합) ✓
  - 최종 검증: Task 14 ✓
- **Placeholder 스캔**: 모든 step에 실제 코드/명령/기대값 포함. "추후"/"TBD" 없음. Task 13 Step 1의 "seed.ts 진입 함수명 확인"은 파일 직접 확인 지시(placeholder 아님).
- **타입 일관성**:
  - `ChildcareTypeSlug` 8종 — Task 1·3에서 동일.
  - `getChildcareList`/`buildChildcareWhere` 시그니처 — Task 1·6·10에서 일관 사용.
  - `Childcare` 타입은 `@prisma/client`에서 직접 import — 컴포넌트(Hero/Info/Facility/AgeBreakdown/WaitList/Staff)에서 동일.
  - `NearbyChildcare` 타입 — Task 9에서 정의, Task 10·11의 컴포넌트에서 동일 사용.
- **리스크 메모**:
  - `AgeBreakdown`·`WaitList`·`Staff`의 동적 키 접근(`(item as any)[\`classCnt${k}\`]`)은 prisma 생성 타입과 동일 필드명이라 런타임 안전. tsc는 `as any` 우회.
  - Task 10 Step 1의 인라인 `await import` 패턴은 Step 2에서 정식 import로 교체 — 의도된 2단계 분할.
  - `tests/e2e/seed.ts`의 진입 함수명은 파일 직접 확인 필요(다른 amenity seed의 호출 위치 참조).
