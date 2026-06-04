# 메인 페이지 히어로(검색 중심) 재구성 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 페이지에 검색 중심 히어로 + 통계바 + 유형 아이콘 그리드를 추가하고, 하단 "찾기/보러가기" 비율을 뒤집고 보러가기 UI를 리스타일한다. 전 구간 모바일 최적화.

**Architecture:** Next.js App Router. 서버 컴포넌트(`page.tsx`)에서 `getHomeStats()`로 실제 DB 카운트를 ISR 집계해 `StatsBar`에 주입. 검색·CTA·스크롤은 클라이언트 컴포넌트(`HeroSection`/`HeroSearch`). 자동완성은 기존 `/api/search` 재사용, 엔터/버튼은 `/search?q=` 이동.

**Tech Stack:** Next.js, React, Prisma, Tailwind(CSS 변수 토큰 `--color-*`), vitest(`tests/lib`). React Testing Library 미설치 → 컴포넌트는 `pnpm build` + 시각 검증으로 확인.

---

## File Structure

**신규**
- `lib/stats.ts` — `getHomeStats()` 병렬 카운트 집계
- `app/(public)/_components/stats-bar.tsx` — 통계 4칸 (server)
- `app/(public)/_components/type-icon-grid.tsx` — 유형 아이콘 8개 (server)
- `app/(public)/_components/hero-search.tsx` — 큰 검색창 + 자동완성 + 키워드 칩 (client)
- `app/(public)/_components/hero-section.tsx` — 히어로 조립 + CTA 스크롤 (client)
- `tests/lib/stats.test.ts` — getHomeStats 스모크 테스트

**수정**
- `lib/format.ts` — `formatStatCount()` 추가
- `tests/lib/format.test.ts` — formatStatCount 테스트 추가
- `app/(public)/_components/type-hub.tsx` — 보러가기 카드 리스타일
- `app/(public)/page.tsx` — 히어로/통계바 배치, 하단 비율 뒤집기, 스크롤 타깃 id

---

### Task 1: `formatStatCount` 포맷터

**Files:**
- Modify: `lib/format.ts`
- Test: `tests/lib/format.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/lib/format.test.ts` 상단 import에 `formatStatCount` 추가하고 describe 블록 추가

```ts
import { formatBillion, formatArea, formatDate, formatPyeong, sqmToPyeong, formatStatCount } from '@/lib/format';

describe('formatStatCount (큰 카운트 → "N만+" 표기)', () => {
  it.each([
    [256_000, '25.6만+'],
    [160_000, '16만+'],
    [10_000, '1만+'],
    [12_345, '1.2만+'],
    [5_000, '5,000+'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatStatCount(input as number)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/format.test.ts`
Expected: FAIL — `formatStatCount is not a function` / import 에러

- [ ] **Step 3: Implement** — `lib/format.ts` 끝에 추가

```ts
/** 큰 카운트를 "16만+" / "25.6만+" / "5,000+" 형태로 표기 */
export function formatStatCount(n: number): string {
  if (n >= 10_000) {
    const man = Math.round((n / 10_000) * 10) / 10;
    return `${man}만+`;
  }
  return `${n.toLocaleString('ko-KR')}+`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts tests/lib/format.test.ts
git commit -m "feat(format): formatStatCount 통계 카운트 표기 추가"
```

---

### Task 2: `getHomeStats()` 카운트 집계

**Files:**
- Create: `lib/stats.ts`
- Test: `tests/lib/stats.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/lib/stats.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { getHomeStats } from '@/lib/stats';

describe('getHomeStats', () => {
  it('네 카운트를 0 이상의 숫자로 반환한다', async () => {
    const s = await getHomeStats();
    for (const v of [s.transactions, s.properties, s.schools, s.lifeFacilities]) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/stats.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stats'`

- [ ] **Step 3: Implement** — `lib/stats.ts`

```ts
import { prisma } from '@/lib/db';

export interface HomeStats {
  transactions: number;
  properties: number;
  schools: number;
  lifeFacilities: number;
}

/** 메인 통계바용 전체 카운트 집계 (page.tsx의 ISR로 캐시됨) */
export async function getHomeStats(): Promise<HomeStats> {
  const [
    transactions, properties, schools,
    ev, market, store, park, childcare, parking, hospital, pharmacy,
  ] = await Promise.all([
    prisma.transaction.count(),
    prisma.property.count(),
    prisma.school.count(),
    prisma.evCharger.count(),
    prisma.traditionalMarket.count(),
    prisma.store.count(),
    prisma.park.count(),
    prisma.childcare.count(),
    prisma.parking.count(),
    prisma.hospital.count(),
    prisma.pharmacy.count(),
  ]);

  return {
    transactions,
    properties,
    schools,
    lifeFacilities:
      ev + market + store + park + childcare + parking + hospital + pharmacy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/stats.test.ts`
Expected: PASS (로컬 docker DB 기준)

- [ ] **Step 5: Commit**

```bash
git add lib/stats.ts tests/lib/stats.test.ts
git commit -m "feat(stats): getHomeStats 메인 통계 카운트 집계"
```

---

### Task 3: `StatsBar` 컴포넌트 (server)

**Files:**
- Create: `app/(public)/_components/stats-bar.tsx`

- [ ] **Step 1: Implement** — 모바일 2×2 / 데스크탑 4열, 인덱스별 구분선

```tsx
import { formatStatCount } from '@/lib/format';
import type { HomeStats } from '@/lib/stats';

const ITEMS = [
  { key: 'transactions', icon: '📊', label: '실거래 데이터' },
  { key: 'properties', icon: '🏢', label: '아파트/오피스텔/다세대' },
  { key: 'schools', icon: '🎓', label: '학교 정보' },
  { key: 'lifeFacilities', icon: '🏪', label: '생활편의시설' },
] as const;

export function StatsBar({ stats }: { stats: HomeStats }) {
  return (
    <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-white shadow-[var(--shadow)] md:grid-cols-4">
      {ITEMS.map((item, i) => (
        <div
          key={item.key}
          className={[
            'flex items-center gap-3 p-4 md:p-6 border-[var(--color-line)]',
            i % 2 === 0 ? 'border-r' : '',
            i < 2 ? 'border-b' : '',
            'md:border-b-0',
            i < 3 ? 'md:border-r' : 'md:border-r-0',
          ].join(' ')}
        >
          <span className="text-2xl" aria-hidden>{item.icon}</span>
          <span className="min-w-0">
            <span className="block text-lg font-black tracking-tight text-[var(--color-blue-dark)] md:text-xl">
              {formatStatCount(stats[item.key])}
            </span>
            <span className="block text-xs text-[var(--color-muted)]">{item.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/_components/stats-bar.tsx
git commit -m "feat(main): StatsBar 통계바 컴포넌트"
```

---

### Task 4: `TypeIconGrid` 컴포넌트 (server)

**Files:**
- Create: `app/(public)/_components/type-icon-grid.tsx`

- [ ] **Step 1: Implement** — 8개 유형 아이콘, 모바일 4열 유지

```tsx
import Link from 'next/link';

const TYPE_ICONS = [
  { icon: '🏢', label: '아파트', href: '/list?type=apt' },
  { icon: '🏬', label: '오피스텔', href: '/list?type=officetel' },
  { icon: '🏘️', label: '다세대', href: '/list?type=villa' },
  { icon: '🏫', label: '학교', href: '/school' },
  { icon: '🌳', label: '공원', href: '/urban/park' },
  { icon: '🏪', label: '전통시장', href: '/amenity/market' },
  { icon: '⚡', label: 'EV충전소', href: '/urban/charger' },
  { icon: '🏥', label: '병원/약국', href: '/medical/hospital' },
] as const;

export function TypeIconGrid() {
  return (
    <div className="grid grid-cols-4 gap-2.5 md:gap-3.5">
      {TYPE_ICONS.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--color-line)] bg-white p-3 text-center shadow-[0_8px_20px_rgba(37,99,235,0.06)] transition hover:-translate-y-0.5 hover:border-[var(--color-blue)] md:p-4"
        >
          <span className="text-xl md:text-2xl" aria-hidden>{t.icon}</span>
          <span className="text-xs font-bold text-[var(--color-blue-dark)]">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/_components/type-icon-grid.tsx
git commit -m "feat(main): TypeIconGrid 유형 아이콘 그리드"
```

---

### Task 5: `HeroSearch` 컴포넌트 (client)

**Files:**
- Create: `app/(public)/_components/hero-search.tsx`

자동완성은 기존 `search-input.tsx`와 동일하게 `/api/search?q=` 사용(헤더용은 그대로 둠). 큰 사이즈 + 키워드 칩 + 엔터/버튼 시 `/search?q=`.

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Result {
  properties: Array<{ id: string; name: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}

const POPULAR = ['마포', '송도', '동탄', '강남'];

function typeToHref(type: string, id: string): string {
  if (type === 'APARTMENT') return `/apt/${id}`;
  if (type === 'OFFICETEL') return `/officetel/${id}`;
  return `/villa/${id}`;
}

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function submit() {
    const term = q.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <div ref={ref} className="relative mt-6">
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-line)] bg-white p-2 pl-4 shadow-[var(--shadow)]">
        <span className="text-[var(--color-muted)]" aria-hidden>🔍</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="단지명·지역명·지하철역으로 검색"
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-[var(--color-text)] outline-none"
        />
        <button
          onClick={submit}
          className="shrink-0 rounded-xl bg-[var(--color-blue)] px-6 py-3 font-bold text-white"
        >
          검색
        </button>
      </div>

      {open && results && (results.properties.length > 0 || results.regions.length > 0) && (
        <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow)]">
          {results.properties.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-bold text-[var(--color-muted)]">단지</p>
              {results.properties.map((p) => (
                <Link key={p.id} href={typeToHref(p.type, p.id)} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Link>
              ))}
            </>
          )}
          {results.regions.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1 text-xs font-bold text-[var(--color-muted)]">지역</p>
              {results.regions.map((r) => (
                <Link key={r.code} href={`/region/${r.code.slice(0, 5)}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
                  <p className="text-sm">{r.fullName}</p>
                </Link>
              ))}
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[var(--color-muted)]">인기검색</span>
        {POPULAR.map((k) => (
          <Link key={k} href={`/search?q=${encodeURIComponent(k)}`} className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:border-[var(--color-blue)]">
            # {k}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/_components/hero-search.tsx
git commit -m "feat(main): HeroSearch 히어로 통합 검색창"
```

---

### Task 6: `HeroSection` 컴포넌트 (client)

**Files:**
- Create: `app/(public)/_components/hero-section.tsx`

- [ ] **Step 1: Implement** — 모바일 1열 → md 2열, CTA는 `#search-filter`로 스크롤

```tsx
'use client';

import Link from 'next/link';
import { HeroSearch } from './hero-search';
import { TypeIconGrid } from './type-icon-grid';

export function HeroSection() {
  function scrollToFilter() {
    document.getElementById('search-filter')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-gradient-to-br from-[#eaf2ff] via-[#f3f8ff] to-white p-6 md:grid md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10 md:p-10">
      <div>
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3.5 py-2 text-xs font-extrabold text-[var(--color-blue-dark)]">
          📍 실거래가·생활권 정보 통합 플랫폼
        </span>
        <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
          어디든, <span className="text-[var(--color-blue)]">임장ON</span>에서 바로 검색하세요
        </h1>

        <HeroSearch />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={scrollToFilter}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-blue)] px-6 py-3.5 font-extrabold text-white"
          >
            🔍 실거래가 찾기
          </button>
          <Link
            href="/life"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-6 py-3.5 font-extrabold text-[var(--color-blue-dark)]"
          >
            📍 생활편의 둘러보기
          </Link>
        </div>
      </div>

      <div className="mt-8 md:mt-0">
        <TypeIconGrid />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/_components/hero-section.tsx
git commit -m "feat(main): HeroSection 검색 중심 히어로"
```

---

### Task 7: `TypeHub` 리스타일 (실거래가 보러가기)

**Files:**
- Modify: `app/(public)/_components/type-hub.tsx`

이미지처럼 색상 원형 아이콘 + 제목 + 부제 + 화살표. 라벨을 "OO 실거래가"로 변경.

- [ ] **Step 1: Replace** — 파일 전체 교체

```tsx
import Link from 'next/link';

const HUB_ITEMS = [
  { type: 'apt', label: '아파트 실거래가', desc: '단지별 매매·전세·월세 실거래가', icon: '🏢', tint: 'bg-[var(--color-sky-soft)]' },
  { type: 'officetel', label: '오피스텔 실거래가', desc: '오피스텔 실거래가 한눈에', icon: '🏬', tint: 'bg-[#ede9fe]' },
  { type: 'villa', label: '다세대 실거래가', desc: '연립·다세대 실거래가', icon: '🏘️', tint: 'bg-[#dcfce7]' },
] as const;

export function TypeHub() {
  return (
    <div className="flex h-full flex-col rounded-[26px] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow)]">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">유형별</p>
      <h2 className="mb-4 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
        실거래가 보러가기
      </h2>

      <div className="flex flex-1 flex-col gap-3">
        {HUB_ITEMS.map((item) => (
          <Link
            key={item.type}
            href={`/list?type=${item.type}`}
            className="group flex min-h-[84px] flex-1 items-center gap-4 rounded-[18px] border border-[var(--color-line)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-soft)]"
          >
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl ${item.tint}`} aria-hidden>
              {item.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-[var(--color-blue-dark)]">
                {item.label}
              </span>
              <span className="block text-xs text-[var(--color-muted)]">{item.desc}</span>
            </span>
            <span className="ml-auto text-[var(--color-blue)] transition group-hover:translate-x-0.5" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/_components/type-hub.tsx
git commit -m "style(main): 보러가기 카드 원형 아이콘+화살표 리스타일"
```

---

### Task 8: `page.tsx` 배치 + 비율 뒤집기

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Replace** — 파일 전체 교체 (히어로/통계바 추가, 하단 비율 뒤집기, 스크롤 타깃 id)

```tsx
import { MainSearchFilter } from './_components/main-search-filter';
import { TypeHub } from './_components/type-hub';
import { HeroSection } from './_components/hero-section';
import { StatsBar } from './_components/stats-bar';
import { getSidoList } from '@/lib/region';
import { getHomeStats } from '@/lib/stats';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 단지 단위로 한눈에.',
};

export const revalidate = 3600;

export default async function HomePage() {
  const [sidoList, stats] = await Promise.all([getSidoList(), getHomeStats()]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <HeroSection />
      <StatsBar stats={stats} />

      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-stretch">
        <div id="search-filter" className="min-w-0 flex-1 scroll-mt-24">
          <MainSearchFilter sidoList={sidoList} />
        </div>
        <aside className="w-full md:w-[380px] md:shrink-0">
          <TypeHub />
        </aside>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/page.tsx
git commit -m "feat(main): 히어로+통계바 배치, 찾기/보러가기 비율 뒤집기"
```

---

### Task 9: 빌드 + 시각 검증

**Files:** (없음 — 검증)

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm test:unit`
Expected: format/stats 포함 전부 PASS

- [ ] **Step 2: 프로덕션 빌드**

Run: `pnpm build`
Expected: 타입 에러 없이 성공, `/` 라우트 빌드됨

- [ ] **Step 3: 데스크탑 시각 확인**

Run: `pnpm dev` 후 `http://localhost:3000` 접속
확인:
- 히어로 2열(왼쪽 검색·CTA / 오른쪽 유형 그리드 8개)
- 통계바 4칸 실제 카운트 표시(0 아님)
- 하단: 필터가 넓게(왼쪽) + 보러가기 좁게(오른쪽, ~380px), 원형 아이콘+화살표
- "🔍 실거래가 찾기" 클릭 → 필터로 부드럽게 스크롤
- 검색창 2자 입력 → 자동완성 드롭다운 / 엔터 → `/search?q=` 이동
- 유형 아이콘 8개 각 링크 이동(아파트→/list?type=apt 등)

- [ ] **Step 4: 모바일 시각 확인**

브라우저 devtools 360~375px 폭:
- 가로 스크롤 없음
- 히어로 세로 스택(배지→제목→검색창→칩→CTA→유형 그리드)
- CTA 버튼 전체폭 세로 스택
- 통계바 2×2
- 필터 → 보러가기 세로 스택

- [ ] **Step 5: 최종 커밋(필요 시)**

```bash
git add -A
git commit -m "chore(main): 히어로 재구성 검증 반영" || echo "no changes"
```

---

## Self-Review 결과

- **Spec coverage:** 검색 중심 히어로(Task 5,6) / 유형 그리드(Task 4) / 통계바 실DB(Task 2,3) / 비율 뒤집기(Task 8) / 보러가기 리스타일(Task 7) / 모바일(각 컴포넌트 className + Task 9 Step4) — 전부 매핑됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 미완성 표현 없음.
- **Type consistency:** `HomeStats`(Task 2) → `StatsBar` props(Task 3) → `page.tsx`(Task 8) 동일. `formatStatCount`(Task 1) → StatsBar 사용. `getHomeStats`(Task 2) → page 사용. 일치.
- **참고:** 전통시장 아이콘은 오피스텔(🏬)과 구분되도록 🏪 사용.
