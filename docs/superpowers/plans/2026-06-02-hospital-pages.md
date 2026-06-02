# 병원 목록·상세 페이지 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원 목록 페이지(`/medical/hospital`)와 상세 페이지(`/medical/hospital/[sigunguCode]/[id]`)를 구현하고 life-menu를 활성화한다.

**Architecture:** 기존 school·amenity 상세 패턴(ISR + server component)을 따르되, 병원 고유 데이터는 탭 3개(진료정보/시설·장비/운영·교통)로 분리하고 주변인프라는 별도 2열 그리드 섹션으로 표시한다. 탭 전환·오늘 진료시간 계산만 client component로 처리한다.

**Tech Stack:** Next.js 14 App Router, Prisma (PostgreSQL geography), Vitest, ISR revalidate=86400, Tailwind CSS, 기존 Card/NaverMap/NearbyApartments 컴포넌트 재사용

---

## 파일 구조

**신규 생성:**
```
lib/hospital/utils.ts
lib/hospital/index.ts
tests/lib/hospital-utils.test.ts

app/(public)/medical/hospital/
  page.tsx
  _components/
    hospital-card.tsx
    hospital-filter-panel.tsx

app/(public)/medical/hospital/[sigunguCode]/[id]/
  page.tsx
  _components/
    hospital-hero.tsx
    hospital-summary-cards.tsx      ← 'use client'
    hospital-tabs.tsx               ← 'use client'
    hospital-tab-diagnosis.tsx
    hospital-tab-facility.tsx
    hospital-tab-operation.tsx
    hospital-nearby.tsx
    hospital-sidebar.tsx
```

**수정:**
```
lib/amenity/nearby.ts                  ← NearbyPharmacy 인터페이스 + getNearbyPharmacies() 추가
app/(public)/_components/life-menu.ts  ← 병원·의원 live: true, href 수정
```

---

## Task 1: formatHospitalTime 유틸리티 (TDD)

진료시간 숫자(예: 830, 1730)를 "08:30", "17:30"으로 변환하는 순수 함수. 탭·요약 카드 모두에서 사용.

**Files:**
- Create: `lib/hospital/utils.ts`
- Create: `tests/lib/hospital-utils.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

```ts
// tests/lib/hospital-utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatHospitalTime } from '@/lib/hospital/utils';

describe('formatHospitalTime', () => {
  it('4자리 숫자를 HH:MM 형식으로 변환', () => {
    expect(formatHospitalTime(830)).toBe('08:30');
    expect(formatHospitalTime(1730)).toBe('17:30');
    expect(formatHospitalTime(1200)).toBe('12:00');
    expect(formatHospitalTime(0)).toBe('00:00');
    expect(formatHospitalTime(900)).toBe('09:00');
  });

  it('null을 휴진으로 변환', () => {
    expect(formatHospitalTime(null)).toBe('휴진');
  });

  it('undefined를 휴진으로 변환', () => {
    expect(formatHospitalTime(undefined)).toBe('휴진');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pnpm test:unit -- tests/lib/hospital-utils.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/hospital/utils'`

- [ ] **Step 3: 구현 작성**

```ts
// lib/hospital/utils.ts
export function formatHospitalTime(n: number | null | undefined): string {
  if (n == null) return '휴진';
  const h = Math.floor(n / 100).toString().padStart(2, '0');
  const m = (n % 100).toString().padStart(2, '0');
  return `${h}:${m}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm test:unit -- tests/lib/hospital-utils.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/hospital/utils.ts tests/lib/hospital-utils.test.ts
git commit -m "feat(hospital): formatHospitalTime 유틸리티 + 테스트"
```

---

## Task 2: 데이터 레이어 — lib/hospital/index.ts + getNearbyPharmacies

**Files:**
- Create: `lib/hospital/index.ts`
- Modify: `lib/amenity/nearby.ts`

- [ ] **Step 1: lib/hospital/index.ts 작성**

```ts
// lib/hospital/index.ts
import { prisma } from '@/lib/db';

export async function getHospitalById(id: bigint) {
  return prisma.hospital.findUnique({
    where: { id },
    include: {
      facility: true,
      detail: true,
      depts: { orderBy: { deptName: 'asc' } },
      transits: true,
      equipment: { orderBy: { equipName: 'asc' } },
      mealSurcharges: true,
      nursingGrades: true,
      specialTreatments: { orderBy: { searchName: 'asc' } },
      specialties: { orderBy: { searchName: 'asc' } },
      staff: true,
    },
  });
}

export type HospitalWithRelations = NonNullable<Awaited<ReturnType<typeof getHospitalById>>>;

export async function getHospitalLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Hospital" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

export interface HospitalListFilter {
  sigunguCode?: string;
  typeCode?: string;
}

export async function getHospitalList(filter: HospitalListFilter, page: number, perPage = 20) {
  const where = {
    ...(filter.sigunguCode && { sigunguCode: filter.sigunguCode }),
    ...(filter.typeCode && { typeCode: filter.typeCode }),
  };
  const [rows, total] = await Promise.all([
    prisma.hospital.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.hospital.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getHospitalRegions(): Promise<{ sido: string; sigungu: string; sigunguCode: string }[]> {
  const rows = await prisma.hospital.findMany({
    select: { sido: true, sigungu: true, sigunguCode: true },
    where: { sido: { not: null }, sigungu: { not: null }, sigunguCode: { not: null } },
    distinct: ['sigunguCode'],
    orderBy: [{ sido: 'asc' }, { sigungu: 'asc' }],
  });
  return rows.map(r => ({ sido: r.sido!, sigungu: r.sigungu!, sigunguCode: r.sigunguCode! }));
}

export async function getHospitalTypeCodes(): Promise<{ typeCode: string; typeName: string }[]> {
  return prisma.hospital.findMany({
    select: { typeCode: true, typeName: true },
    distinct: ['typeCode'],
    orderBy: { typeName: 'asc' },
  });
}
```

- [ ] **Step 2: lib/amenity/nearby.ts 에 NearbyPharmacy 인터페이스 + getNearbyPharmacies 추가**

기존 파일 맨 끝에 추가:

```ts
// lib/amenity/nearby.ts 맨 끝에 추가

export interface NearbyPharmacy {
  id: bigint;
  name: string;
  address: string;
  tel: string | null;
  distanceMeters: number;
}

export async function getNearbyPharmacies(
  lat: number,
  lng: number,
  radiusMeters = 500,
): Promise<NearbyPharmacy[]> {
  return prisma.$queryRaw<NearbyPharmacy[]>`
    SELECT
      id, name, address, tel,
      ROUND(ST_Distance(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )::numeric) AS "distanceMeters"
    FROM "Pharmacy"
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

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/hospital/index.ts lib/amenity/nearby.ts
git commit -m "feat(hospital): 데이터 레이어 — getHospitalById/List/Regions/TypeCodes + getNearbyPharmacies"
```

---

## Task 3: 병원 목록 페이지

**Files:**
- Create: `app/(public)/medical/hospital/_components/hospital-card.tsx`
- Create: `app/(public)/medical/hospital/_components/hospital-filter-panel.tsx`
- Create: `app/(public)/medical/hospital/page.tsx`

- [ ] **Step 1: hospital-card.tsx 작성**

```tsx
// app/(public)/medical/hospital/_components/hospital-card.tsx
import Link from 'next/link';
import type { Hospital } from '@prisma/client';

interface Props { hospital: Hospital; }

export function HospitalCard({ hospital }: Props) {
  const href = `/medical/hospital/${hospital.sigunguCode}/${hospital.id}`;
  return (
    <Link
      href={href}
      className="block rounded-xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-blue)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate font-bold text-[var(--color-blue-dark)]">{hospital.name}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-blue)]">
          {hospital.typeName}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{hospital.address}</p>
      {hospital.tel && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{hospital.tel}</p>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: hospital-filter-panel.tsx 작성**

```tsx
// app/(public)/medical/hospital/_components/hospital-filter-panel.tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Region { sido: string; sigungu: string; sigunguCode: string; }
interface TypeCode { typeCode: string; typeName: string; }
interface Props {
  regions: Region[];
  typeCodes: TypeCode[];
  currentSigunguCode?: string;
  currentTypeCode?: string;
}

export function HospitalFilterPanel({ regions, typeCodes, currentSigunguCode, currentTypeCode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const sidos = [...new Set(regions.map(r => r.sido))].sort();
  const [selectedSido, setSelectedSido] = useState(() =>
    currentSigunguCode ? (regions.find(r => r.sigunguCode === currentSigunguCode)?.sido ?? '') : ''
  );
  const sigungus = selectedSido ? regions.filter(r => r.sido === selectedSido) : [];

  function navigate(sigunguCode: string, typeCode: string) {
    const p = new URLSearchParams(searchParams.toString());
    sigunguCode ? p.set('region', sigunguCode) : p.delete('region');
    typeCode ? p.set('type', typeCode) : p.delete('type');
    p.delete('page');
    startTransition(() => router.push(`/medical/hospital?${p.toString()}`));
  }

  const selectClass =
    'rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-blue)] focus:outline-none';

  return (
    <div className="flex flex-wrap gap-3">
      <select className={selectClass} value={selectedSido}
        onChange={e => { setSelectedSido(e.target.value); navigate('', currentTypeCode ?? ''); }}>
        <option value="">시도 전체</option>
        {sidos.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={selectClass} value={currentSigunguCode ?? ''} disabled={!selectedSido}
        onChange={e => navigate(e.target.value, currentTypeCode ?? '')}>
        <option value="">시군구 전체</option>
        {sigungus.map(r => <option key={r.sigunguCode} value={r.sigunguCode}>{r.sigungu}</option>)}
      </select>
      <select className={selectClass} value={currentTypeCode ?? ''}
        onChange={e => navigate(currentSigunguCode ?? '', e.target.value)}>
        <option value="">종류 전체</option>
        {typeCodes.map(t => <option key={t.typeCode} value={t.typeCode}>{t.typeName}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: 목록 page.tsx 작성**

```tsx
// app/(public)/medical/hospital/page.tsx
import Link from 'next/link';
import { Suspense } from 'react';
import { getHospitalList, getHospitalRegions, getHospitalTypeCodes } from '@/lib/hospital';
import { HospitalCard } from './_components/hospital-card';
import { HospitalFilterPanel } from './_components/hospital-filter-panel';
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

      <h1 className="mb-2 text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">병원·의원</h1>
      <p className="mb-6 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString()}개 병원·의원 정보</p>

      <div className="mb-6">
        <Suspense>
          <HospitalFilterPanel
            regions={regions}
            typeCodes={typeCodes}
            currentSigunguCode={sigunguCode}
            currentTypeCode={typeCode}
          />
        </Suspense>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-muted)]">검색 결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/medical/hospital/
git commit -m "feat(hospital): 병원 목록 페이지 (필터 + 카드 + 페이지네이션)"
```

---

## Task 4: 병원 상세 — Hero + 요약 카드

**Files:**
- Create: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-hero.tsx`
- Create: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-summary-cards.tsx`

- [ ] **Step 1: hospital-hero.tsx 작성**

```tsx
// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-hero.tsx
import type { HospitalWithRelations } from '@/lib/hospital';

interface Props { hospital: HospitalWithRelations; }

export function HospitalHero({ hospital }: Props) {
  return (
    <div className="rounded-2xl bg-[var(--color-blue-dark)] p-6 text-white">
      <p className="mb-1 text-sm font-semibold opacity-75">
        {hospital.typeName}
        {hospital.openedAt && ` · ${new Date(hospital.openedAt).getFullYear()}년 개원`}
      </p>
      <h1 className="mb-3 text-3xl font-black tracking-tight">{hospital.name}</h1>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-90">
        <span>📍 {hospital.address}</span>
        {hospital.tel && (
          <a href={`tel:${hospital.tel}`} className="hover:underline">📞 {hospital.tel}</a>
        )}
        {hospital.homepage && (
          <a href={hospital.homepage} target="_blank" rel="noopener noreferrer" className="hover:underline">
            🌐 홈페이지
          </a>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: hospital-summary-cards.tsx 작성**

오늘 진료시간은 ISR 캐시 문제로 클라이언트에서 요일을 계산한다.

```tsx
// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-summary-cards.tsx
'use client';
import type { ComponentProps } from 'react';
import { formatHospitalTime } from '@/lib/hospital/utils';
import type { HospitalFacility, HospitalDetail } from '@prisma/client';

// getDay() 반환값(0=일,1=월,...,6=토)에 대응하는 open/close 키
const DAY_KEYS = [
  ['openSun', 'closeSun'],
  ['openMon', 'closeMon'],
  ['openTue', 'closeTue'],
  ['openWed', 'closeWed'],
  ['openThu', 'closeThu'],
  ['openFri', 'closeFri'],
  ['openSat', 'closeSat'],
] as const;

interface Props {
  totalDoctors: number | null;
  facility: HospitalFacility | null;
  detail: HospitalDetail | null;
}

function SummaryCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-soft)] p-4 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{label}</p>
      <p className="font-bold text-[var(--color-blue-dark)]">{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export function HospitalSummaryCards({ totalDoctors, facility, detail }: Props) {
  const cards: ComponentProps<typeof SummaryCard>[] = [];

  if (totalDoctors != null) {
    cards.push({ icon: '👨‍⚕️', label: '의료진', value: `전문의 ${totalDoctors}명` });
  }

  if (facility) {
    const beds = (facility.generalBedPremium ?? 0) + (facility.generalBedNormal ?? 0);
    if (beds > 0) {
      cards.push({ icon: '🛏', label: '병상', value: `${beds.toLocaleString()}개`, sub: '일반병상 기준' });
    }
  }

  if (detail) {
    if (detail.erDayOpen != null) {
      const hasEr = detail.erDayOpen === 'Y' || detail.erNightOpen === 'Y';
      cards.push({ icon: '🚑', label: '응급실', value: hasEr ? '운영' : '미운영', sub: hasEr ? '24시간' : undefined });
    }
    if (detail.parkingCapacity != null) {
      cards.push({
        icon: '🚗', label: '주차', value: `${detail.parkingCapacity}대`,
        sub: detail.parkingFee === 'Y' ? '유료' : '무료',
      });
    }
    const dayIdx = new Date().getDay();
    const [openKey, closeKey] = DAY_KEYS[dayIdx];
    const open = detail[openKey];
    const close = detail[closeKey];
    if (open != null || close != null) {
      cards.push({
        icon: '🕐', label: '오늘 진료',
        value: open != null ? `${formatHospitalTime(open)} ~ ${formatHospitalTime(close)}` : '휴진',
      });
    }
  }

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(c => <SummaryCard key={c.label} {...c} />)}
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-hero.tsx" \
        "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-summary-cards.tsx"
git commit -m "feat(hospital): 상세 Hero + 요약 카드 컴포넌트"
```

---

## Task 5: 병원 상세 — 탭 컴포넌트 (진료정보 / 시설·장비 / 운영·교통)

**Files:**
- Create: `…/_components/hospital-tab-diagnosis.tsx`
- Create: `…/_components/hospital-tab-facility.tsx`
- Create: `…/_components/hospital-tab-operation.tsx`
- Create: `…/_components/hospital-tabs.tsx`

이하 경로 prefix: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/`

- [ ] **Step 1: hospital-tab-diagnosis.tsx 작성**

```tsx
// …/_components/hospital-tab-diagnosis.tsx
import type { HospitalWithRelations } from '@/lib/hospital';

interface Props {
  depts: HospitalWithRelations['depts'];
  staff: HospitalWithRelations['staff'];
  specialties: HospitalWithRelations['specialties'];
  specialTreatments: HospitalWithRelations['specialTreatments'];
  nursingGrades: HospitalWithRelations['nursingGrades'];
}

export function HospitalTabDiagnosis({ depts, staff, specialties, specialTreatments, nursingGrades }: Props) {
  if (!depts.length && !staff.length && !specialties.length && !specialTreatments.length && !nursingGrades.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">진료 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {depts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료과목 ({depts.length}개)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {depts.map(d => (
              <div key={String(d.id)} className="flex items-center justify-between rounded-lg bg-[var(--color-soft)] px-3 py-2 text-sm">
                <span>{d.deptName}</span>
                {d.specialistCount != null && (
                  <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
                    전문의 {d.specialistCount}명
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {staff.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">의료진 구성</h3>
          <div className="flex flex-wrap gap-2">
            {staff.map(s => (
              <span key={String(s.id)} className="rounded-lg bg-[var(--color-soft)] px-3 py-1.5 text-sm">
                {s.staffName}{s.staffCount != null ? ` ${s.staffCount}명` : ''}
              </span>
            ))}
          </div>
        </section>
      )}
      {specialties.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">특수클리닉</h3>
          <div className="flex flex-wrap gap-2">
            {specialties.map(s => (
              <span key={String(s.id)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs">{s.searchName}</span>
            ))}
          </div>
        </section>
      )}
      {specialTreatments.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">특수치료</h3>
          <div className="flex flex-wrap gap-2">
            {specialTreatments.map(s => (
              <span key={String(s.id)} className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs">{s.searchName}</span>
            ))}
          </div>
        </section>
      )}
      {nursingGrades.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">간호등급</h3>
          <div className="flex flex-col gap-2">
            {nursingGrades.map(n => (
              <div key={String(n.id)} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted)]">{n.typeName}</span>
                {n.nursingGrade && <span className="font-semibold">{n.nursingGrade}등급</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: hospital-tab-facility.tsx 작성**

```tsx
// …/_components/hospital-tab-facility.tsx
import type { HospitalWithRelations } from '@/lib/hospital';

type BedKey =
  | 'generalBedPremium' | 'generalBedNormal'
  | 'icuAdultBed' | 'icuPediatricBed' | 'icuNeonatalBed'
  | 'deliveryBed' | 'operatingRoomBed' | 'erBed'
  | 'physicalTherapyBed' | 'isolationBed' | 'sterileRoomBed'
  | 'psychiatryClosedPremium' | 'psychiatryClosedNormal'
  | 'psychiatryOpenPremium' | 'psychiatryOpenNormal';

const BED_ROWS: { key: BedKey; label: string }[] = [
  { key: 'generalBedPremium', label: '일반병상(상급)' },
  { key: 'generalBedNormal', label: '일반병상(일반)' },
  { key: 'icuAdultBed', label: '중환자실(성인)' },
  { key: 'icuPediatricBed', label: '중환자실(소아)' },
  { key: 'icuNeonatalBed', label: '중환자실(신생아)' },
  { key: 'deliveryBed', label: '분만실' },
  { key: 'operatingRoomBed', label: '수술실' },
  { key: 'erBed', label: '응급실 병상' },
  { key: 'physicalTherapyBed', label: '물리치료실' },
  { key: 'isolationBed', label: '격리실' },
  { key: 'sterileRoomBed', label: '무균실' },
  { key: 'psychiatryClosedPremium', label: '정신병동(폐쇄·상급)' },
  { key: 'psychiatryClosedNormal', label: '정신병동(폐쇄·일반)' },
  { key: 'psychiatryOpenPremium', label: '정신병동(개방·상급)' },
  { key: 'psychiatryOpenNormal', label: '정신병동(개방·일반)' },
];

interface Props {
  facility: HospitalWithRelations['facility'];
  equipment: HospitalWithRelations['equipment'];
  mealSurcharges: HospitalWithRelations['mealSurcharges'];
}

export function HospitalTabFacility({ facility, equipment, mealSurcharges }: Props) {
  if (!facility && !equipment.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">시설·장비 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {facility && (
        <section>
          {facility.foundTypeName && (
            <p className="mb-3 text-sm text-[var(--color-muted)]">
              설립구분: <span className="font-semibold text-[var(--color-blue-dark)]">{facility.foundTypeName}</span>
            </p>
          )}
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">병상 현황</h3>
          <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            {BED_ROWS.filter(r => (facility[r.key] ?? 0) > 0).map(r => (
              <div key={r.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-[var(--color-muted)]">{r.label}</span>
                <span className="font-semibold">{(facility[r.key] as number).toLocaleString()}개</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {equipment.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">의료장비 ({equipment.length}종)</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {equipment.map(e => (
              <div key={String(e.id)} className="flex items-center justify-between rounded-lg bg-[var(--color-soft)] px-3 py-2 text-sm">
                <span>{e.equipName}</span>
                {e.equipCount != null && <span className="text-[var(--color-muted)]">{e.equipCount}대</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      {mealSurcharges.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">식대가산</h3>
          <div className="flex flex-col gap-2">
            {mealSurcharges.map(m => (
              <div key={String(m.id)} className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted)]">{m.typeName}</span>
                {m.treatmentGrade && <span className="font-semibold">{m.treatmentGrade}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: hospital-tab-operation.tsx 작성**

```tsx
// …/_components/hospital-tab-operation.tsx
import { formatHospitalTime } from '@/lib/hospital/utils';
import type { HospitalWithRelations } from '@/lib/hospital';

const DAYS = [
  { label: '월', open: 'openMon', close: 'closeMon' },
  { label: '화', open: 'openTue', close: 'closeTue' },
  { label: '수', open: 'openWed', close: 'closeWed' },
  { label: '목', open: 'openThu', close: 'closeThu' },
  { label: '금', open: 'openFri', close: 'closeFri' },
  { label: '토', open: 'openSat', close: 'closeSat' },
  { label: '일', open: 'openSun', close: 'closeSun' },
] as const;

interface Props {
  detail: HospitalWithRelations['detail'];
  transits: HospitalWithRelations['transits'];
}

export function HospitalTabOperation({ detail, transits }: Props) {
  if (!detail && !transits.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">운영·교통 정보가 등록되어 있지 않습니다.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {detail && (
        <>
          <section>
            <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료시간</h3>
            <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {DAYS.map(d => {
                const open = detail[d.open];
                const close = detail[d.close];
                if (open == null && close == null) return null;
                return (
                  <div key={d.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="w-6 font-semibold text-[var(--color-blue-dark)]">{d.label}</span>
                    <span className="text-[var(--color-muted)]">
                      {open != null ? `${formatHospitalTime(open)} ~ ${formatHospitalTime(close)}` : '휴진'}
                    </span>
                  </div>
                );
              })}
            </div>
            {detail.lunchWeekday && (
              <p className="mt-2 text-xs text-[var(--color-muted)]">점심(평일): {detail.lunchWeekday}</p>
            )}
            {detail.closedSunday && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">일요일: {detail.closedSunday}</p>
            )}
          </section>

          {(detail.erDayOpen != null || detail.erNightOpen != null) && (
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">응급실</h3>
              <div className="flex flex-col gap-2 text-sm">
                {detail.erDayOpen != null && (
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-[var(--color-muted)]">주간</span>
                    <span className={detail.erDayOpen === 'Y' ? 'font-semibold text-green-600' : 'text-red-500'}>
                      {detail.erDayOpen === 'Y' ? '운영' : '미운영'}
                    </span>
                    {detail.erDayTel1 && <span className="text-[var(--color-muted)]">{detail.erDayTel1}</span>}
                  </div>
                )}
                {detail.erNightOpen != null && (
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-[var(--color-muted)]">야간</span>
                    <span className={detail.erNightOpen === 'Y' ? 'font-semibold text-green-600' : 'text-red-500'}>
                      {detail.erNightOpen === 'Y' ? '운영' : '미운영'}
                    </span>
                    {detail.erNightTel1 && <span className="text-[var(--color-muted)]">{detail.erNightTel1}</span>}
                  </div>
                )}
              </div>
            </section>
          )}

          {detail.parkingCapacity != null && (
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">주차</h3>
              <p className="text-sm">
                {detail.parkingCapacity.toLocaleString()}대
                {detail.parkingFee != null && ` · ${detail.parkingFee === 'Y' ? '유료' : '무료'}`}
              </p>
              {detail.parkingNote && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">{detail.parkingNote}</p>
              )}
            </section>
          )}
        </>
      )}

      {transits.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">교통편</h3>
          <ul className="divide-y divide-[var(--color-line)]">
            {transits.map(t => (
              <li key={String(t.id)} className="py-2.5 text-sm">
                <p className="font-semibold">
                  {t.transitName}{t.routeNumber ? ` (${t.routeNumber})` : ''}
                </p>
                <p className="text-[var(--color-muted)]">
                  {[t.stopPoint, t.direction, t.distance].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: hospital-tabs.tsx 작성 (client 탭 스위처)**

```tsx
// …/_components/hospital-tabs.tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { HospitalTabDiagnosis } from './hospital-tab-diagnosis';
import { HospitalTabFacility } from './hospital-tab-facility';
import { HospitalTabOperation } from './hospital-tab-operation';
import type { HospitalWithRelations } from '@/lib/hospital';

type TabKey = 'diagnosis' | 'facility' | 'operation';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'diagnosis', label: '🩺 진료정보' },
  { key: 'facility', label: '🏥 시설·장비' },
  { key: 'operation', label: '🕐 운영·교통' },
];

interface Props { hospital: HospitalWithRelations; }

export function HospitalTabs({ hospital }: Props) {
  const [active, setActive] = useState<TabKey>('diagnosis');
  return (
    <Card>
      <div className="mb-4 flex gap-1 border-b border-[var(--color-line)]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active === t.key
                ? 'border-[var(--color-blue)] text-[var(--color-blue)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'diagnosis' && (
        <HospitalTabDiagnosis
          depts={hospital.depts}
          staff={hospital.staff}
          specialties={hospital.specialties}
          specialTreatments={hospital.specialTreatments}
          nursingGrades={hospital.nursingGrades}
        />
      )}
      {active === 'facility' && (
        <HospitalTabFacility
          facility={hospital.facility}
          equipment={hospital.equipment}
          mealSurcharges={hospital.mealSurcharges}
        />
      )}
      {active === 'operation' && (
        <HospitalTabOperation detail={hospital.detail} transits={hospital.transits} />
      )}
    </Card>
  );
}
```

- [ ] **Step 5: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/"
git commit -m "feat(hospital): 상세 탭 컴포넌트 — 진료정보 / 시설·장비 / 운영·교통"
```

---

## Task 6: 병원 상세 — 주변인프라 + 사이드바 + page.tsx

**Files:**
- Create: `…/_components/hospital-nearby.tsx`
- Create: `…/_components/hospital-sidebar.tsx`
- Create: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: hospital-nearby.tsx 작성**

```tsx
// …/_components/hospital-nearby.tsx
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import type { NearbyApartment, NearbyPharmacy, NearbyPark, NearbyStore, NearbyEvCharger } from '@/lib/amenity/nearby';

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
                  {it.distanceMeters}m
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
  pharmacies: NearbyPharmacy[];
  parks: NearbyPark[];
  stores: NearbyStore[];
  chargers: NearbyEvCharger[];
}

export function HospitalNearby({ apts, pharmacies, parks, stores, chargers }: Props) {
  const sections: { show: boolean; node: ReactNode }[] = [
    {
      show: apts.length > 0,
      node: <NearbyCard title="주변 아파트" icon="🏢"
        items={apts.map(a => ({ id: a.id, name: a.name, sub: a.region, distanceMeters: a.distanceMeters }))} />,
    },
    {
      show: pharmacies.length > 0,
      node: <NearbyCard title="주변 약국" icon="💊"
        items={pharmacies.map(p => ({ id: p.id, name: p.name, sub: p.tel ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: parks.length > 0,
      node: <NearbyCard title="주변 공원" icon="🌳"
        items={parks.map(p => ({ id: p.id, name: p.name, sub: p.parkType ?? undefined, distanceMeters: p.distanceMeters }))} />,
    },
    {
      show: stores.length > 0,
      node: <NearbyCard title="편의점·마트" icon="🛒"
        items={stores.map(s => ({ id: s.id, name: s.name, sub: s.industryName ?? undefined, distanceMeters: s.distanceMeters }))} />,
    },
    {
      show: chargers.length > 0,
      node: <NearbyCard title="전기차 충전소" icon="⚡"
        items={chargers.map(c => ({ id: c.id, name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters }))} />,
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

- [ ] **Step 2: hospital-sidebar.tsx 작성**

```tsx
// …/_components/hospital-sidebar.tsx
import Link from 'next/link';
import type { Hospital } from '@prisma/client';

interface Props { hospitals: Hospital[]; sigunguCode: string; }

export function HospitalSidebar({ hospitals, sigunguCode }: Props) {
  if (hospitals.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">같은 지역 병원</h3>
      <ul className="divide-y divide-[var(--color-line)]">
        {hospitals.map(h => (
          <li key={String(h.id)}>
            <Link
              href={`/medical/hospital/${sigunguCode}/${h.id}`}
              className="block py-2.5 text-sm transition hover:text-[var(--color-blue)]"
            >
              <p className="truncate font-semibold">{h.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{h.typeName}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/medical/hospital?region=${sigunguCode}`}
        className="mt-3 block text-center text-xs font-semibold text-[var(--color-blue)] hover:underline"
      >
        이 지역 병원 더보기 →
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: 상세 page.tsx 작성**

```tsx
// app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getHospitalById, getHospitalLatLng, getHospitalList } from '@/lib/hospital';
import {
  getNearbyApartments,
  getNearbyPharmacies,
  getNearbyParks,
  getNearbyStores,
  getNearbyEvChargers,
} from '@/lib/amenity/nearby';
import { HospitalHero } from './_components/hospital-hero';
import { HospitalSummaryCards } from './_components/hospital-summary-cards';
import { HospitalTabs } from './_components/hospital-tabs';
import { HospitalNearby } from './_components/hospital-nearby';
import { HospitalSidebar } from './_components/hospital-sidebar';
import { NaverMap } from '@/components/ui/naver-map';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ sigunguCode: string; id: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const hospital = await getHospitalById(BigInt(id)).catch(() => null);
  if (!hospital) return {};
  return {
    title: `${hospital.name} — ${hospital.typeName} 정보·주변 아파트`,
    description: `${hospital.name}(${hospital.address}) 진료과·시설·교통 정보와 주변 아파트.`,
    alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
  };
}

export default async function HospitalDetailPage({ params }: Params) {
  const { sigunguCode, id } = await params;
  const hospitalId = BigInt(id);

  const hospital = await getHospitalById(hospitalId);
  if (!hospital || hospital.sigunguCode !== sigunguCode) notFound();

  const coord = await getHospitalLatLng(hospitalId);

  const [apts, pharmacies, parks, stores, chargers, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyPharmacies(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyParks(coord.lat, coord.lng) : Promise.resolve([]),
    coord ? getNearbyStores(coord.lat, coord.lng, 500) : Promise.resolve([]),
    coord ? getNearbyEvChargers(coord.lat, coord.lng) : Promise.resolve([]),
    getHospitalList({ sigunguCode }, 1, 5),
  ]);

  const others = otherList.rows.filter(h => h.id !== hospital.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/life/medical">의료시설</Link><span>›</span>
        <Link href="/medical/hospital">병원·의원</Link><span>›</span>
        {hospital.sigunguCode && (
          <>
            <Link href={`/medical/hospital?region=${hospital.sigunguCode}`}>
              {hospital.sigungu ?? hospital.sido}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="truncate font-semibold text-[var(--color-blue-dark)]">{hospital.name}</span>
      </nav>

      <HospitalHero hospital={hospital} />

      <div className="mt-5">
        <HospitalSummaryCards
          totalDoctors={hospital.totalDoctors}
          facility={hospital.facility}
          detail={hospital.detail}
        />
      </div>

      <div className="mt-7 grid grid-cols-1 gap-7 lg:grid-cols-[1fr_320px]">
        <main className="flex flex-col gap-6">
          <HospitalTabs hospital={hospital} />
          {coord && (
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">위치</h2>
              <NaverMap lat={coord.lat} lng={coord.lng} name={hospital.name} />
            </Card>
          )}
          <HospitalNearby
            apts={apts}
            pharmacies={pharmacies}
            parks={parks}
            stores={stores}
            chargers={chargers}
          />
        </main>
        <aside>
          <HospitalSidebar hospitals={others} sigunguCode={sigunguCode} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 타입 체크**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/"
git commit -m "feat(hospital): 상세 페이지 — 주변인프라·사이드바·page.tsx"
```

---

## Task 7: life-menu.ts 활성화 + 최종 검증

**Files:**
- Modify: `app/(public)/_components/life-menu.ts`

- [ ] **Step 1: life-menu.ts 수정**

`병원·의원` 항목의 `href`와 `live` 값을 변경:

```ts
// app/(public)/_components/life-menu.ts
// 기존:
{ label: '병원·의원', href: '/medical?type=hospital', live: false },
// 변경 후:
{ label: '병원·의원', href: '/medical/hospital', live: true },
```

- [ ] **Step 2: 타입 체크 + 유닛 테스트**

```bash
pnpm tsc --noEmit 2>&1 | tail -5
pnpm test:unit
```
Expected: 타입 에러 없음, 테스트 모두 PASS

- [ ] **Step 3: 개발 서버 구동 후 수동 검증**

```bash
pnpm dev
```

확인 목록:
1. `http://localhost:3000/medical/hospital` — 목록 페이지 렌더링
2. 시도 선택 시 시군구 드롭다운 활성화
3. 병원종류 필터 동작
4. 카드 클릭 → 상세 페이지 이동
5. 상세 페이지 탭 전환 (진료정보/시설·장비/운영·교통)
6. 요약 카드 — 오늘 진료시간 표시
7. 지도 렌더링 (location 있는 병원)
8. 주변인프라 2열 그리드 표시
9. 모바일(390px) — 2열 → 1열 전환, 탭 스크롤

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/_components/life-menu.ts"
git commit -m "feat(hospital): 병원·의원 메뉴 활성화 (live: true)"
```
