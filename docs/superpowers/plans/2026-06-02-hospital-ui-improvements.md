# Hospital UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원·의원 목록 페이지를 amenity 레이아웃(왼쪽 필터 사이드바 + 모바일 bottom sheet + 2열 그리드)으로 통일하고, 상세 페이지 주변 인프라를 카테고리당 최대 5개로 제한한다.

**Architecture:** `HospitalFilterPanel`을 수직 섹션형으로 재작성하고 `params/onParamsChange` prop을 추가해 모바일 sheet에서 재사용한다. 목록 `page.tsx`를 `aside + main` 레이아웃으로 전환하고, `HospitalNearby`에서 각 배열을 `.slice(0, 5)` 처리한다.

**Tech Stack:** Next.js 14 App Router, React (client components), Tailwind CSS, `@/components/ui/bottom-sheet`, `@/components/ui/button`

---

## File Map

| 작업 | 파일 경로 |
|------|-----------|
| Modify | `app/(public)/medical/hospital/_components/hospital-filter-panel.tsx` |
| Create | `app/(public)/medical/hospital/_components/hospital-mobile-filter-sheet.tsx` |
| Modify | `app/(public)/medical/hospital/page.tsx` |
| Modify | `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx` |

---

## Task 1: HospitalFilterPanel — 수직 섹션형으로 재작성

**Files:**
- Modify: `app/(public)/medical/hospital/_components/hospital-filter-panel.tsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useTransition } from 'react';

interface Region { sido: string; sigungu: string; sigunguCode: string; }
interface TypeCode { typeCode: string; typeName: string; }

interface Props {
  regions: Region[];
  typeCodes: TypeCode[];
  basePath?: string;
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function HospitalFilterPanel({
  regions,
  typeCodes,
  basePath = '/medical/hospital',
  params: ext,
  onParamsChange,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const [, startTransition] = useTransition();

  const sidos = [...new Set(regions.map(r => r.sido))].sort();

  const [selectedSido, setSelectedSido] = useState(() => {
    const regionCode = p.get('region') ?? '';
    return regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '';
  });

  useEffect(() => {
    if (!ext) return;
    const regionCode = ext.get('region') ?? '';
    setSelectedSido(regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '');
  }, [ext, regions]);

  const sigungus = selectedSido ? regions.filter(r => r.sido === selectedSido) : [];

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) {
      onParamsChange(next);
    } else {
      startTransition(() => router.push(`${basePath}?${next.toString()}`));
    }
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';
  const curRegion = p.get('region') ?? '';
  const curType = p.get('type') ?? '';

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

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">종류</h3>
        <div className="mt-2">
          <select
            className={selectCls}
            value={curType}
            onChange={e => update({ type: e.target.value || null })}
          >
            <option value="">전체</option>
            {typeCodes.map(t => <option key={t.typeCode} value={t.typeCode}>{t.typeName}</option>)}
          </select>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: 에러 없음 (또는 무관한 기존 에러만)

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/medical/hospital/_components/hospital-filter-panel.tsx
git commit -m "refactor(hospital): 필터 패널 수직 섹션형으로 재작성 (amenity 패턴 통일)"
```

---

## Task 2: HospitalMobileFilterSheet 신규 생성

**Files:**
- Create: `app/(public)/medical/hospital/_components/hospital-mobile-filter-sheet.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { HospitalFilterPanel } from './hospital-filter-panel';

interface Region { sido: string; sigungu: string; sigunguCode: string; }
interface TypeCode { typeCode: string; typeName: string; }

interface Props {
  regions: Region[];
  typeCodes: TypeCode[];
}

export function HospitalMobileFilterSheet({ regions, typeCodes }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, setPending] = useState(() => new URLSearchParams(sp.toString()));

  const activeCount = ['region', 'type'].filter(k => sp.get(k)).length;

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
                router.push(qs ? `/medical/hospital?${qs}` : '/medical/hospital');
                setOpen(false);
              }}
              className="flex-1"
            >
              조회
            </Button>
          </div>
        }
      >
        <HospitalFilterPanel
          regions={regions}
          typeCodes={typeCodes}
          params={pending}
          onParamsChange={setPending}
        />
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/medical/hospital/_components/hospital-mobile-filter-sheet.tsx
git commit -m "feat(hospital): 모바일 필터 bottom sheet 컴포넌트 추가"
```

---

## Task 3: 목록 page.tsx — aside + main 레이아웃으로 교체

**Files:**
- Modify: `app/(public)/medical/hospital/page.tsx`

- [ ] **Step 1: 파일 전체를 아래 내용으로 교체**

```tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { getHospitalList, getHospitalRegions, getHospitalTypeCodes } from '@/lib/hospital';
import { HospitalCard } from './_components/hospital-card';
import { HospitalFilterPanel } from './_components/hospital-filter-panel';
import { HospitalMobileFilterSheet } from './_components/hospital-mobile-filter-sheet';
import type { Metadata } from 'next';

export const revalidate = 86_400;

export const metadata: Metadata = {
  title: '병원·의원 찾기 — 우리 동네 의료시설',
  description: '지역별 병원·의원·종합병원 정보를 한눈에.',
  alternates: { canonical: '/medical/hospital' },
};

interface Props { searchParams: Promise<{ region?: string; type?: string; page?: string }>; }

function pageNums(current: number, total: number): number[] {
  const lo = Math.max(1, current - 2);
  const hi = Math.min(total, current + 2);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

export default async function HospitalListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const sigunguCode = sp.region;
  const typeCode = sp.type;

  const [{ rows, total, totalPages }, regions, typeCodes] = await Promise.all([
    getHospitalList({ sigunguCode, typeCode }, page),
    getHospitalRegions(),
    getHospitalTypeCodes(),
  ]);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">병원·의원</span>
      </nav>

      <div className="mb-6 rounded-[26px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">의료시설 · 병원·의원</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
          병원·의원
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString()}개</p>
      </div>

      <Suspense>
        <HospitalMobileFilterSheet regions={regions} typeCodes={typeCodes} />
      </Suspense>

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-[var(--color-soft)]" />}>
              <HospitalFilterPanel regions={regions} typeCodes={typeCodes} />
            </Suspense>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow-soft)]">
            <p className="text-base font-bold text-[var(--color-blue-dark)]">
              <span className="text-[var(--color-blue)]">{total.toLocaleString()}</span>개 병원·의원
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
              조건에 맞는 병원·의원이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map(h => <HospitalCard key={String(h.id)} hospital={h} />)}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {pageNums(page, totalPages).map(p => {
                const params = new URLSearchParams();
                if (sigunguCode) params.set('region', sigunguCode);
                if (typeCode) params.set('type', typeCode);
                params.set('page', String(p));
                return (
                  <Link
                    key={p}
                    href={`/medical/hospital?${params.toString()}`}
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

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/medical/hospital/page.tsx
git commit -m "feat(hospital): 목록 페이지 aside+main 레이아웃 적용 (amenity 통일)"
```

---

## Task 4: HospitalNearby — 카테고리당 최대 5개로 제한

**Files:**
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx`

- [ ] **Step 1: sections 배열에서 각 map 앞에 `.slice(0, 5)` 추가**

`sections` 배열 정의 부분을 아래와 같이 변경한다 (5곳 모두 적용):

```tsx
const sections: { show: boolean; node: ReactNode }[] = [
  {
    show: apts.length > 0,
    node: <NearbyCard title="주변 아파트" icon="🏢"
      items={apts.slice(0, 5).map(a => ({ id: a.id, name: a.name, sub: a.region, distanceMeters: a.distanceMeters }))} />,
  },
  {
    show: pharmacies.length > 0,
    node: <NearbyCard title="주변 약국" icon="💊"
      items={pharmacies.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.tel ?? undefined, distanceMeters: p.distanceMeters }))} />,
  },
  {
    show: parks.length > 0,
    node: <NearbyCard title="주변 공원" icon="🌳"
      items={parks.slice(0, 5).map(p => ({ id: p.id, name: p.name, sub: p.parkType ?? undefined, distanceMeters: p.distanceMeters }))} />,
  },
  {
    show: stores.length > 0,
    node: <NearbyCard title="편의점·마트" icon="🛒"
      items={stores.slice(0, 5).map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
  },
  {
    show: chargers.length > 0,
    node: <NearbyCard title="전기차 충전소" icon="⚡"
      items={chargers.slice(0, 5).map(c => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters }))} />,
  },
];
```

- [ ] **Step 2: 타입 체크 통과 확인**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```

Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-nearby.tsx"
git commit -m "fix(hospital): 주변 인프라 카테고리당 최대 5개로 제한 (거리순)"
```

---

## Task 5: 최종 검증

- [ ] **Step 1: 전체 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -10
```

Expected: 에러 없음

- [ ] **Step 2: 린트 체크**

```bash
pnpm lint 2>&1 | tail -10
```

Expected: 에러 없음

- [ ] **Step 3: 단위 테스트**

```bash
pnpm test:unit 2>&1 | grep -E "hospital|✓|PASS|FAIL" | head -20
```

Expected: hospital 관련 테스트 모두 PASS (`formatHospitalTime` 등)

- [ ] **Step 4: 개발 서버 실행 후 목록 페이지 육안 확인**

```bash
pnpm dev
```

확인 항목:
1. `http://localhost:3000/medical/hospital` — 왼쪽 필터 사이드바 표시, 2열 카드 그리드
2. 모바일 뷰포트 (DevTools 375px) — 상단 "필터" 버튼 표시, 클릭 시 bottom sheet 오픈
3. 아무 병원 상세 페이지 — 주변 인프라 각 카테고리 최대 5개씩만 표시
