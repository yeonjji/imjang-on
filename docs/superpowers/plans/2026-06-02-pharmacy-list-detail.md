# 약국 목록/상세 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원 페이지와 통일된 약국(Pharmacy) 목록·상세 페이지를 만들고, 상세에 가능한 모든 주변 인프라를 노출한다.

**Architecture:** 병원 페이지(`app/(public)/medical/hospital/**`, `lib/hospital/**`)를 1차 템플릿으로 미러링한다. 약국 데이터는 평면 단일 테이블이라 진료과/시설 탭이 없으므로 상세는 hero + 정보카드 + 지도 + 주변 인프라 + 사이드바로 구성한다. 주변 인프라는 기존 `lib/amenity/nearby.ts` 헬퍼를 재사용하고 `getNearbyHospitals`만 신규 추가한다.

**Tech Stack:** Next.js App Router (RSC), Prisma + PostGIS(raw `$queryRaw`), Tailwind CSS 변수, vitest(unit), pnpm.

---

## File Structure

**신규 생성**
- `lib/pharmacy/utils.ts` — 순수 포매팅/정보행 빌더 (테스트 대상)
- `tests/lib/pharmacy-utils.test.ts` — 위 유닛 테스트
- `lib/pharmacy/index.ts` — Prisma 데이터 접근 (병원 lib 미러)
- `app/(public)/medical/pharmacy/page.tsx` — 목록 페이지
- `app/(public)/medical/pharmacy/_components/pharmacy-card.tsx`
- `app/(public)/medical/pharmacy/_components/pharmacy-filter-panel.tsx`
- `app/(public)/medical/pharmacy/_components/pharmacy-mobile-filter-sheet.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` — 상세 페이지
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-hero.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-info.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-nearby.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-sidebar.tsx`

**수정**
- `lib/amenity/nearby.ts` — `getNearbyHospitals` + `NearbyHospital` 추가
- `app/(public)/_components/life-menu.ts` — 약국 항목 라이브 전환

**참고용 원본(읽기만)**
- `lib/hospital/index.ts`, `app/(public)/medical/hospital/page.tsx`, `app/(public)/medical/hospital/_components/*`, `app/(public)/medical/hospital/[sigunguCode]/[id]/*`

---

## Task 1: 약국 순수 유틸 (TDD)

**Files:**
- Create: `lib/pharmacy/utils.ts`
- Test: `tests/lib/pharmacy-utils.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lib/pharmacy-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatOpenedDate, buildPharmacyInfoRows } from '@/lib/pharmacy/utils';

describe('formatOpenedDate', () => {
  it('Date를 YYYY.MM.DD로 변환', () => {
    // 로컬 시간 기준 컴포넌트로 생성해 TZ 무관하게 결정적
    expect(formatOpenedDate(new Date(2010, 4, 3))).toBe('2010.05.03');
    expect(formatOpenedDate(new Date(1999, 11, 25))).toBe('1999.12.25');
  });
  it('null이면 null', () => {
    expect(formatOpenedDate(null)).toBeNull();
  });
});

describe('buildPharmacyInfoRows', () => {
  it('값이 있는 필드만 라벨/값 순서대로 반환', () => {
    const rows = buildPharmacyInfoRows({
      typeName: '약국',
      openedAt: new Date(2010, 4, 3),
      tel: '02-123-4567',
      zipcode: null,
      sido: '서울특별시',
      sigungu: '강남구',
      eupmyeondong: null,
    });
    expect(rows).toEqual([
      { label: '종별', value: '약국' },
      { label: '개설일', value: '2010.05.03' },
      { label: '전화', value: '02-123-4567' },
      { label: '시도', value: '서울특별시' },
      { label: '시군구', value: '강남구' },
    ]);
  });
  it('모든 필드가 비면 빈 배열', () => {
    expect(buildPharmacyInfoRows({
      typeName: null, openedAt: null, tel: null, zipcode: null,
      sido: null, sigungu: null, eupmyeondong: null,
    })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/pharmacy-utils.test.ts`
Expected: FAIL — `@/lib/pharmacy/utils` 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

`lib/pharmacy/utils.ts`:

```ts
export function formatOpenedDate(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

export interface InfoRow {
  label: string;
  value: string;
}

interface InfoSource {
  typeName: string | null;
  openedAt: Date | null;
  tel: string | null;
  zipcode: string | null;
  sido: string | null;
  sigungu: string | null;
  eupmyeondong: string | null;
}

export function buildPharmacyInfoRows(p: InfoSource): InfoRow[] {
  const rows: InfoRow[] = [];
  if (p.typeName) rows.push({ label: '종별', value: p.typeName });
  const opened = formatOpenedDate(p.openedAt);
  if (opened) rows.push({ label: '개설일', value: opened });
  if (p.tel) rows.push({ label: '전화', value: p.tel });
  if (p.zipcode) rows.push({ label: '우편번호', value: p.zipcode });
  if (p.sido) rows.push({ label: '시도', value: p.sido });
  if (p.sigungu) rows.push({ label: '시군구', value: p.sigungu });
  if (p.eupmyeondong) rows.push({ label: '읍면동', value: p.eupmyeondong });
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/pharmacy-utils.test.ts`
Expected: PASS (5 assertions, 4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/pharmacy/utils.ts tests/lib/pharmacy-utils.test.ts
git commit -m "feat(pharmacy): 약국 정보 포매팅 유틸 + 테스트"
```

---

## Task 2: 약국 데이터 레이어

**Files:**
- Create: `lib/pharmacy/index.ts`

병원 `lib/hospital/index.ts`를 미러링하되 타입코드 함수는 제외, relation 없음(평면 레코드).

- [ ] **Step 1: Write implementation**

`lib/pharmacy/index.ts`:

```ts
import { prisma } from '@/lib/db';

export async function getPharmacyById(id: bigint) {
  return prisma.pharmacy.findUnique({ where: { id } });
}

export type PharmacyRecord = NonNullable<Awaited<ReturnType<typeof getPharmacyById>>>;

export async function getPharmacyLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Pharmacy" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface PharmacyListFilter {
  sigunguCode?: string;
}

export async function getPharmacyList(filter: PharmacyListFilter, page: number, perPage = 20) {
  const where = {
    sigunguCode: { not: null },
    ...(filter.sigunguCode && { sigunguCode: filter.sigunguCode }),
  };
  const [rows, total] = await Promise.all([
    prisma.pharmacy.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.pharmacy.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getPharmacyRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  const rows = await prisma.pharmacy.findMany({
    select: { sido: true, sigungu: true, sigunguCode: true },
    where: { sido: { not: null }, sigungu: { not: null }, sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
  return rows.map(r => ({ sido: r.sido!, sigungu: r.sigungu!, sigunguCode: r.sigunguCode! }));
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: 에러 없음(0 errors). 신규 파일 관련 타입 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/pharmacy/index.ts
git commit -m "feat(pharmacy): 약국 목록/단건/지역 데이터 레이어"
```

---

## Task 3: 주변 병원 nearby 헬퍼

**Files:**
- Modify: `lib/amenity/nearby.ts` (파일 끝에 추가)

- [ ] **Step 1: Add helper + interface**

`lib/amenity/nearby.ts` 끝에 다음을 추가:

```ts
export interface NearbyHospital {
  id: bigint;
  name: string;
  typeName: string;
  address: string;
  distanceMeters: number;
}

export async function getNearbyHospitals(
  lat: number,
  lng: number,
  radiusMeters = 500,
): Promise<NearbyHospital[]> {
  return prisma.$queryRaw<NearbyHospital[]>`
    SELECT
      id, name, "typeName", address,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Hospital"
    WHERE location IS NOT NULL
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY "distanceMeters"
    LIMIT 5
  `;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(pharmacy): 주변 병원 nearby 헬퍼 추가"
```

---

## Task 4: 목록 페이지 + 컴포넌트

**Files:**
- Create: `app/(public)/medical/pharmacy/_components/pharmacy-card.tsx`
- Create: `app/(public)/medical/pharmacy/_components/pharmacy-filter-panel.tsx`
- Create: `app/(public)/medical/pharmacy/_components/pharmacy-mobile-filter-sheet.tsx`
- Create: `app/(public)/medical/pharmacy/page.tsx`

- [ ] **Step 1: PharmacyCard**

`app/(public)/medical/pharmacy/_components/pharmacy-card.tsx`:

```tsx
import Link from 'next/link';
import type { Pharmacy } from '@prisma/client';

interface Props { pharmacy: Pharmacy; }

export function PharmacyCard({ pharmacy }: Props) {
  const href = `/medical/pharmacy/${pharmacy.sigunguCode}/${pharmacy.id}`;
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-blue)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-bold text-[var(--color-blue-dark)]">{pharmacy.name}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-blue)]">
          약국
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{pharmacy.address}</p>
      {pharmacy.tel && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{pharmacy.tel}</p>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: PharmacyFilterPanel (지역만)**

`app/(public)/medical/pharmacy/_components/pharmacy-filter-panel.tsx`:

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface Region { sido: string; sigungu: string; sigunguCode: string; }

interface Props {
  regions: Region[];
  basePath?: string;
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function PharmacyFilterPanel({
  regions,
  basePath = '/medical/pharmacy',
  params: ext,
  onParamsChange,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sidos = [...new Set(regions.map(r => r.sido))].sort();

  const [selectedSido, setSelectedSido] = useState(() => {
    const regionCode = p.get('region') ?? '';
    return regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '';
  });

  useEffect(() => {
    if (!ext) return;
    const regionCode = ext.get('region') ?? '';
    setSelectedSido(regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]);

  const sigungus = selectedSido ? regions.filter(r => r.sido === selectedSido) : [];

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) {
      onParamsChange(next);
    } else {
      router.push(`${basePath}?${next.toString()}`);
    }
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';
  const curRegion = p.get('region') ?? '';

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="mt-2 flex flex-col gap-2">
          <select
            className={selectCls}
            value={selectedSido}
            onChange={e => { setSelectedSido(e.target.value); update({ region: null }); }}
          >
            <option value="">시도 전체</option>
            {sidos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {sigungus.length > 0 && (
            <select
              className={selectCls}
              value={curRegion}
              onChange={e => update({ region: e.target.value || null })}
            >
              <option value="">시군구 전체</option>
              {sigungus.map(r => <option key={r.sigunguCode} value={r.sigunguCode}>{r.sigungu}</option>)}
            </select>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: PharmacyMobileFilterSheet (지역만)**

`app/(public)/medical/pharmacy/_components/pharmacy-mobile-filter-sheet.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { PharmacyFilterPanel } from './pharmacy-filter-panel';

interface Region { sido: string; sigungu: string; sigunguCode: string; }

interface Props {
  regions: Region[];
}

export function PharmacyMobileFilterSheet({ regions }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeCount = ['region'].filter(k => {
    const v = sp.get(k);
    return v && v !== '';
  }).length;

  return (
    <div className="mb-4 flex items-center gap-2 md:hidden">
      <button
        onClick={() => { setPending(new URLSearchParams(sp.toString())); setOpen(true); }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--color-blue-dark)] px-4 py-2 text-sm font-semibold text-white"
      >
        필터
        {activeCount > 0 && (
          <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-[var(--color-blue-dark)]">
            {activeCount}
          </span>
        )}
      </button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="필터"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={() => setPending(new URLSearchParams())} className="shrink-0">
              초기화
            </Button>
            <Button
              onClick={() => {
                const qs = pending.toString();
                router.push(qs ? `/medical/pharmacy?${qs}` : '/medical/pharmacy');
                setOpen(false);
              }}
              className="flex-1"
            >
              조회
            </Button>
          </div>
        }
      >
        <PharmacyFilterPanel
          regions={regions}
          params={pending}
          onParamsChange={setPending}
        />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: 목록 page.tsx**

`app/(public)/medical/pharmacy/page.tsx`:

```tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { getPharmacyList, getPharmacyRegions } from '@/lib/pharmacy';
import { PharmacyCard } from './_components/pharmacy-card';
import { PharmacyFilterPanel } from './_components/pharmacy-filter-panel';
import { PharmacyMobileFilterSheet } from './_components/pharmacy-mobile-filter-sheet';
import type { Metadata } from 'next';

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: '약국 찾기 — 우리 동네 의료시설',
  description: '지역별 약국 정보를 한눈에.',
  alternates: { canonical: '/medical/pharmacy' },
};

interface Props { searchParams: Promise<{ region?: string; page?: string }>; }

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function PharmacyListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sigunguCode = sp.region;

  const [{ rows, total, totalPages }, regions] = await Promise.all([
    getPharmacyList({ sigunguCode }, page),
    getPharmacyRegions(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">약국</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">의료시설 · 약국</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          약국
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString('ko-KR')}개</p>
      </div>

      <Suspense>
        <PharmacyMobileFilterSheet regions={regions} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <PharmacyFilterPanel regions={regions} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>개 약국
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 약국이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map(p => <PharmacyCard key={String(p.id)} pharmacy={p} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map(p => {
                const params = new URLSearchParams();
                if (sigunguCode) params.set('region', sigunguCode);
                params.set('page', String(p));
                return (
                  <Link
                    key={p}
                    href={`/medical/pharmacy?${params.toString()}`}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                      page === p
                        ? 'bg-[var(--color-blue)] text-white'
                        : 'border border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-blue)]'
                    }`}
                  >
                    {p}
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 타입/린트 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add "app/(public)/medical/pharmacy/page.tsx" "app/(public)/medical/pharmacy/_components/"
git commit -m "feat(pharmacy): 약국 목록 페이지 + 카드/지역 필터"
```

---

## Task 5: 상세 페이지 + 컴포넌트

**Files:**
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-hero.tsx`
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-info.tsx`
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-nearby.tsx`
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-sidebar.tsx`
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: PharmacyHero**

`.../[id]/_components/pharmacy-hero.tsx`:

```tsx
import type { PharmacyRecord } from '@/lib/pharmacy';

interface Props { pharmacy: PharmacyRecord; }

export function PharmacyHero({ pharmacy }: Props) {
  return (
    <div className="rounded-2xl bg-[var(--color-blue-dark)] p-6 text-white">
      <p className="mb-1 text-sm font-semibold opacity-75">
        약국
        {pharmacy.openedAt && ` · ${new Date(pharmacy.openedAt).getFullYear()}년 개설`}
      </p>
      <h1 className="mb-3 text-3xl font-black tracking-tight">{pharmacy.name}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-90">
        <span>📍 {pharmacy.address}</span>
        {pharmacy.tel && (
          <a href={`tel:${pharmacy.tel}`} className="hover:underline">📞 {pharmacy.tel}</a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PharmacyInfo**

`.../[id]/_components/pharmacy-info.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { buildPharmacyInfoRows } from '@/lib/pharmacy/utils';
import type { PharmacyRecord } from '@/lib/pharmacy';

interface Props { pharmacy: PharmacyRecord; }

export function PharmacyInfo({ pharmacy }: Props) {
  const rows = buildPharmacyInfoRows(pharmacy);
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">기본 정보</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between gap-4 border-b border-[var(--color-line)] pb-2">
            <dt className="shrink-0 text-sm text-[var(--color-muted)]">{r.label}</dt>
            <dd className="truncate text-sm font-semibold text-[var(--color-blue-dark)]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
```

- [ ] **Step 3: PharmacyNearby (편의점/마트/카페 분리, 9개 카테고리)**

`.../[id]/_components/pharmacy-nearby.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import type {
  NearbyApartment,
  NearbyHospital,
  NearbyPark,
  NearbyStore,
  NearbyTraditionalMarket,
  NearbyEvCharger,
  NearbyChildcare,
} from '@/lib/amenity/nearby';

type SimpleItem = { id: bigint; name: string; sub?: string; distanceMeters: number };

function NearbyCard({ title, icon, items }: { title: string; icon: string; items: SimpleItem[] }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">{icon} {title}</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map(it => (
          <li key={String(it.id)} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {it.name}
                <span className="ml-2 rounded-md bg-[var(--color-sky-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
                  {Math.round(Number(it.distanceMeters))}m
                </span>
              </p>
              {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface Props {
  apts: NearbyApartment[];
  hospitals: NearbyHospital[];
  parks: NearbyPark[];
  convenience: NearbyStore[];
  mart: NearbyStore[];
  cafe: NearbyStore[];
  markets: NearbyTraditionalMarket[];
  chargers: NearbyEvCharger[];
  childcare: NearbyChildcare[];
}

export function PharmacyNearby({
  apts, hospitals, parks, convenience, mart, cafe, markets, chargers, childcare,
}: Props) {
  const sections: { show: boolean; node: ReactNode }[] = [
    {
      show: apts.length > 0,
      node: <NearbyCard title="주변 아파트" icon="🏢"
        items={apts.slice(0, 5).map(a => ({ id: a.id, name: a.name, sub: a.region, distanceMeters: a.distanceMeters }))} />,
    },
    {
      show: hospitals.length > 0,
      node: <NearbyCard title="주변 병원·의원" icon="🏥"
        items={hospitals.slice(0, 5).map(h => ({ id: h.id, name: h.name, sub: h.typeName, distanceMeters: h.distanceMeters }))} />,
    },
    {
      show: parks.length > 0,
      node: <NearbyCard title="주변 공원" icon="🌳"
        items={parks.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.parkType ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: convenience.length > 0,
      node: <NearbyCard title="편의점" icon="🏪"
        items={convenience.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: mart.length > 0,
      node: <NearbyCard title="마트" icon="🛒"
        items={mart.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: cafe.length > 0,
      node: <NearbyCard title="카페" icon="☕"
        items={cafe.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: markets.length > 0,
      node: <NearbyCard title="전통시장" icon="🏬"
        items={markets.slice(0, 5).map(m => ({ id: m.id, name: m.name, sub: m.marketType ?? undefined, distanceMeters: m.distanceMeters }))} />,
    },
    {
      show: chargers.length > 0,
      node: <NearbyCard title="전기차 충전소" icon="⚡"
        items={chargers.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters }))} />,
    },
    {
      show: childcare.length > 0,
      node: <NearbyCard title="어린이집" icon="👶"
        items={childcare.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: c.crType ?? undefined, distanceMeters: c.distanceMeters }))} />,
    },
  ];

  const visible = sections.filter(s => s.show);
  if (visible.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">주변 인프라</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {visible.map((s, i) => <div key={i}>{s.node}</div>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: PharmacySidebar**

`.../[id]/_components/pharmacy-sidebar.tsx`:

```tsx
import Link from 'next/link';
import type { Pharmacy } from '@prisma/client';

interface Props { pharmacies: Pharmacy[]; sigunguCode: string; }

export function PharmacySidebar({ pharmacies, sigunguCode }: Props) {
  if (pharmacies.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 약국</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {pharmacies.map(p => (
          <li key={String(p.id)}>
            <Link
              href={`/medical/pharmacy/${sigunguCode}/${p.id}`}
              className="block py-2.5 text-sm transition hover:text-[var(--color-blue)]"
            >
              <p className="truncate font-semibold">{p.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{p.address}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/medical/pharmacy?region=${sigunguCode}`}
        className="mt-3 block text-center text-xs font-semibold text-[var(--color-blue)] hover:underline"
      >
        이 지역 약국 더보기 →
      </Link>
    </div>
  );
}
```

- [ ] **Step 5: 상세 page.tsx**

`.../[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPharmacyById, getPharmacyLatLng, getPharmacyList } from '@/lib/pharmacy';
import {
  getNearbyApartments,
  getNearbyHospitals,
  getNearbyParks,
  getNearbyStores,
  getNearbyTraditionalMarkets,
  getNearbyEvChargers,
  getNearbyChildcare,
} from '@/lib/amenity/nearby';
import { PharmacyHero } from './_components/pharmacy-hero';
import { PharmacyInfo } from './_components/pharmacy-info';
import { PharmacyNearby } from './_components/pharmacy-nearby';
import { PharmacySidebar } from './_components/pharmacy-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const pharmacy = await getPharmacyById(BigInt(id)).catch(() => null);
  if (!pharmacy) return {};
  return {
    title: `${pharmacy.name} — 약국 정보·주변 아파트`,
    description: `${pharmacy.name}(${pharmacy.address}) 위치·연락처와 주변 아파트·생활 인프라.`,
    alternates: { canonical: `/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
  };
}

export default async function PharmacyDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const pharmacyId = BigInt(id);

  const pharmacy = await getPharmacyById(pharmacyId);
  if (!pharmacy || pharmacy.sigunguCode !== sigunguCode) notFound();

  const coord = await getPharmacyLatLng(pharmacyId);

  const [apts, hospitals, parks, stores, markets, chargers, childcare, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyHospitals(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyParks(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyStores(coord.lat, coord.lng, 500) : Promise.resolve([]),
    coord ? getNearbyTraditionalMarkets(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyEvChargers(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyChildcare(coord.lat, coord.lng) : Promise.resolve([]),
    getPharmacyList({ sigunguCode }, 1, 5),
  ]);

  const convenience = stores.filter(s => (s.industryCode ?? '').startsWith('G20405'));
  const mart = stores.filter(s => {
    const c = s.industryCode ?? '';
    return c.startsWith('G20404') || c.startsWith('G20402');
  });
  const cafe = stores.filter(s => (s.industryCode ?? '').startsWith('I21201'));
  const others = otherList.rows.filter(p => p.id !== pharmacy.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <Link href="/medical/pharmacy">약국</Link><span>›</span>
        {pharmacy.sigunguCode && (
          <>
            <Link href={`/medical/pharmacy?region=${pharmacy.sigunguCode}`}>
              {pharmacy.sigungu ?? pharmacy.sido}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{pharmacy.name}</span>
      </nav>

      <PharmacyHero pharmacy={pharmacy} />

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <PharmacyInfo pharmacy={pharmacy} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={pharmacy.name} />
            </Card>
          )}
          <PharmacyNearby
            apts={apts}
            hospitals={hospitals}
            parks={parks}
            convenience={convenience}
            mart={mart}
            cafe={cafe}
            markets={markets}
            chargers={chargers}
            childcare={childcare}
          />
        </div>
        <aside>
          <PharmacySidebar pharmacies={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add "app/(public)/medical/pharmacy/[sigunguCode]"
git commit -m "feat(pharmacy): 약국 상세 페이지 (정보카드·지도·주변 인프라·사이드바)"
```

---

## Task 6: 메뉴 라이브 전환 + 최종 검증

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`

- [ ] **Step 1: life-menu 약국 항목 라이브 전환**

`app/(public)/_components/life-menu.ts`에서 medical 그룹의 약국 항목을 교체:

기존:
```ts
      { label: '약국', href: '/medical?type=pharmacy', live: false },
```
변경:
```ts
      { label: '약국', href: '/medical/pharmacy', live: true },
```

- [ ] **Step 2: 전체 유닛 테스트 + 타입체크 + 린트**

Run: `pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: 전부 통과(약국 유틸 테스트 포함), 에러 없음.

- [ ] **Step 3: 수동 동작 확인 (dev 서버)**

Run: `pnpm dev` 후 브라우저로 확인:
- `/medical/pharmacy` — 목록 렌더, "전국 25,68x개" 표기, 지역 필터로 시도→시군구 선택 시 URL `?region=` 갱신·목록 변경, 페이지네이션 동작.
- 카드 클릭 → `/medical/pharmacy/{sigunguCode}/{id}` 상세 진입.
- 상세 — 파란 hero, 기본 정보 카드, 지도(좌표 있는 약국), 주변 인프라(데이터 있는 카테고리만, 편의점/마트/카페 별도 카드), "같은 지역 약국" 사이드바.
- `/life` 또는 의료시설 허브에서 "약국" 클릭 시 SoonModal 없이 바로 이동.
- 모바일 폭(개발자도구 375px): 가로 스크롤·오버플로 없음, 모바일 필터 bottom sheet 동작, 상세 단일 컬럼·주변 인프라 1열.

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/_components/life-menu.ts"
git commit -m "feat(pharmacy): life-menu 약국 항목 라이브 전환"
```

---

## 범위 밖 (YAGNI / 스펙 확정)

- 약국 이름 검색 입력 (병원에도 없음).
- 운영시간/심야약국 표기 (데이터 없음).
- 약국 타입 필터 (전 데이터 단일값 "약국").
- `app/sitemap.ts` 약국 URL 추가 (스펙 범위 밖 — 필요 시 별도 작업).

## Self-Review 결과

- **스펙 커버리지:** 라우팅(T2·T4·T5), 데이터 레이어(T2), getNearbyHospitals(T3), 목록+카드+필터+모바일시트(T4), 상세 hero/정보/지도/주변9종/사이드바(T5), life-menu 라이브(T6), 모바일 검증(T6 Step3) — 스펙 전 항목 매핑됨.
- **Placeholder:** 없음. 모든 코드 스텝에 완전한 코드 포함.
- **타입 일관성:** `PharmacyRecord`(lib/pharmacy) → hero/info에서 사용, `NearbyHospital`(T3) → nearby/page에서 사용, `buildPharmacyInfoRows`/`formatOpenedDate`(T1) → info/테스트에서 사용. Store 분류 접두사(G20405/G20404·G20402/I21201)는 기존 `getMixedNearbyForDetail`과 동일.
