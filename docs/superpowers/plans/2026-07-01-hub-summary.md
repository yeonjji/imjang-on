# 허브 상단 요약 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개수만 표시되던 6개 허브 페이지에 등록 수 기반 지역 분포 요약 산문을 SSR로 추가한다.

**Architecture:** 3계층 분리 — (1) 순수 프로즈 빌더(`lib/hub-summary/prose.ts`, DB 무관·결정적), (2) 도메인별 집계 함수(`lib/hub-summary/{medical,property,amenity,urban}.ts`, 정규화 `HubSummaryData` 반환), (3) 서버 컴포넌트(`HubSummary`). 각 허브 페이지는 집계 함수를 호출해 컴포넌트에 넘긴다. 집계 실패/희소 데이터는 `null`/폴백 문장으로 안전 처리.

**Tech Stack:** Next.js App Router(RSC), Prisma(PostgreSQL/Supabase), Vitest.

## Global Constraints

- 프로즈 용어는 **"등록 수 · 분포 · 비중"만** 사용. "밀집도/밀도"는 절대 쓰지 않는다(인구 정규화 데이터 없음 → 과장 금지, PRODUCT.md 원칙).
- 집중도는 페이지 무관하게 **"상위 3개 {지역단위}가 전체의 약 N% 비중"** 단일 프레이밍. "수도권 N%" 등 혼용 금지.
- 집계 단위 ↔ 문장 지역단위 라벨 일치: `nation`→"시·도", `sido`→"시·군·구".
- 데이터 희소 폴백 필수: `total===0`/집계 `null`→요약 생략; 지역 3개 미만 또는 `total < 30`→분포·비중 없이 사실 문장 1개.
- 기존 리스트/필터/카드/페이지네이션 UX는 변경 금지(최소 침습).
- 대상 6개 허브만: `/officetel`, `/villa`, `/amenity/[category]`, `/urban/[category]`, `/medical/hospital`, `/medical/pharmacy`.
- 테스트 러너: 순수 유닛은 `tests/lib/**`(DB 불필요), DB 집계는 `tests/integration/**`(`.env.test` 로컬 docker DB).
- 커밋 브랜치: `feat/hub-summary` (이미 생성됨, 스펙 커밋 존재).

## 파일 구조

- Create `lib/hub-summary/types.ts` — `HubScopeLevel`, `HubRegionCount`, `HubSummaryData`
- Create `lib/hub-summary/prose.ts` — `buildHubSummaryLines(data)` 순수 함수 + 한글 조사 헬퍼
- Create `app/(public)/_components/hub-summary.tsx` — `HubSummary` 서버 컴포넌트
- Create `lib/hub-summary/medical.ts` — `getMedicalRegionBreakdown(kind, label, region?)`
- Create `lib/hub-summary/property.ts` — `getPropertyHubStats(types, label)`
- Create `lib/hub-summary/amenity.ts` — `getAmenityHubSummary(slug, label, filter)`
- Create `lib/hub-summary/urban.ts` — `getUrbanHubSummary(slug, label, filter)`
- Modify `lib/amenity/category.ts` — `AmenityCategoryDef`에 `getRegionBreakdown` 추가
- Modify `lib/amenity/adapters/{cafe,convenience,mart,market}.ts` — `getRegionBreakdown` 구현
- Modify `lib/urban/category.ts` + `lib/urban/adapters/*.ts` — 동일
- Modify 6개 페이지 — 요약 컴포넌트 삽입(+amenity/urban metadata description 교체)
- Create `tests/lib/hub-summary/prose.test.ts`, `tests/integration/hub-summary-*.test.ts`

---

## Task 1: 코어 타입 + 프로즈 빌더 (순수, TDD)

**Files:**
- Create: `lib/hub-summary/types.ts`
- Create: `lib/hub-summary/prose.ts`
- Test: `tests/lib/hub-summary/prose.test.ts`

**Interfaces:**
- Produces:
  - `type HubScopeLevel = 'nation' | 'sido' | 'sigungu'`
  - `interface HubRegionCount { name: string; count: number }`
  - `interface HubSummaryData { kind: 'amenity'|'medical'|'property'; categoryLabel: string; scopeLabel: string; scopeLevel: HubScopeLevel; total: number; topRegions: HubRegionCount[]; concentrationPct?: number }`
  - `function buildHubSummaryLines(d: HubSummaryData): string[]`

- [ ] **Step 1: 타입 파일 작성**

Create `lib/hub-summary/types.ts`:

```ts
export type HubScopeLevel = 'nation' | 'sido' | 'sigungu';

export interface HubRegionCount {
  name: string;
  count: number;
}

export interface HubSummaryData {
  kind: 'amenity' | 'medical' | 'property';
  categoryLabel: string;   // "카페", "병원·의원", "오피스텔"
  scopeLabel: string;      // "서울", "전국", "서울특별시 강남구"
  scopeLevel: HubScopeLevel;
  total: number;
  topRegions: HubRegionCount[]; // 집계 단위는 scopeLevel이 결정 (nation→시도, sido→시군구)
  concentrationPct?: number;    // 상위 3개 지역이 전체에서 차지하는 비중(%)
}
```

- [ ] **Step 2: 실패 테스트 작성**

Create `tests/lib/hub-summary/prose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import type { HubSummaryData } from '@/lib/hub-summary/types';

const sidoCase: HubSummaryData = {
  kind: 'amenity', categoryLabel: '카페', scopeLabel: '서울', scopeLevel: 'sido',
  total: 21619,
  topRegions: [
    { name: '강남구', count: 2100 },
    { name: '마포구', count: 1340 },
    { name: '송파구', count: 980 },
  ],
  concentrationPct: 21,
};

const nationCase: HubSummaryData = {
  kind: 'medical', categoryLabel: '병원·의원', scopeLabel: '전국', scopeLevel: 'nation',
  total: 79562,
  topRegions: [
    { name: '경기도', count: 17234 },
    { name: '서울특별시', count: 14012 },
    { name: '부산광역시', count: 5210 },
  ],
  concentrationPct: 46,
};

describe('buildHubSummaryLines', () => {
  it('sido 스코프: 시·군·구 분포 + 상위3 비중', () => {
    const lines = buildHubSummaryLines(sidoCase);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('서울에 등록된 카페는 21,619곳입니다.');
    expect(lines[1]).toContain('시·군·구별 분포');
    expect(lines[1]).toContain('강남구(2,100)·마포구(1,340)·송파구(980)');
    expect(lines[1]).toContain('상위 3개 시·군·구가 전체의 약 21% 비중');
    expect(lines[1]).not.toContain('밀집도');
    expect(lines[1]).not.toContain('수도권');
  });

  it('nation 스코프: 시·도 분포', () => {
    const lines = buildHubSummaryLines(nationCase);
    expect(lines[0]).toBe('전국에 등록된 병원·의원은 79,562곳입니다.');
    expect(lines[1]).toContain('시·도별 분포');
    expect(lines[1]).toContain('상위 3개 시·도가 전체의 약 46% 비중');
  });

  it('조사: 받침 없는 단어는 "는", 있는 단어는 "은"', () => {
    expect(buildHubSummaryLines(sidoCase)[0]).toContain('카페는');
    expect(buildHubSummaryLines(nationCase)[0]).toContain('병원·의원은');
    const offi = { ...nationCase, categoryLabel: '오피스텔' };
    expect(buildHubSummaryLines(offi)[0]).toContain('오피스텔은');
  });

  it('폴백: total 0 → 빈 배열', () => {
    expect(buildHubSummaryLines({ ...sidoCase, total: 0 })).toEqual([]);
  });

  it('폴백: sigungu 스코프 → 사실 문장 1개, 분포·비중 없음', () => {
    const lines = buildHubSummaryLines({
      kind: 'amenity', categoryLabel: '카페', scopeLabel: '서울특별시 강남구',
      scopeLevel: 'sigungu', total: 2100, topRegions: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('서울특별시 강남구에 등록된 카페는 2,100곳입니다.');
  });

  it('폴백: total이 임계값 미만 → 사실 문장 1개', () => {
    const lines = buildHubSummaryLines({ ...sidoCase, total: 12, concentrationPct: 90 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('12곳입니다');
  });

  it('폴백: 지역 3개 미만 → 사실 문장 1개', () => {
    const lines = buildHubSummaryLines({ ...sidoCase, topRegions: sidoCase.topRegions.slice(0, 2) });
    expect(lines).toHaveLength(1);
  });

  it('근접중복 방지: 서로 다른 입력은 서로 다른 문자열', () => {
    const a = buildHubSummaryLines(sidoCase).join(' ');
    const b = buildHubSummaryLines({ ...sidoCase, scopeLabel: '부산',
      topRegions: [{ name: '해운대구', count: 800 }, { name: '부산진구', count: 720 }, { name: '남구', count: 510 }],
      total: 9800, concentrationPct: 21 }).join(' ');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/prose.test.ts`
Expected: FAIL — `buildHubSummaryLines` 모듈 없음.

- [ ] **Step 4: 프로즈 빌더 구현**

Create `lib/hub-summary/prose.ts`:

```ts
import type { HubScopeLevel, HubSummaryData } from './types';

const MIN_TOTAL_FOR_DISTRIBUTION = 30;
const MIN_REGIONS_FOR_DISTRIBUTION = 3;

const nf = (n: number): string => n.toLocaleString('ko-KR');

/** 마지막 글자에 받침(종성)이 있으면 true. 한글 음절이 아니면 false. */
function hasJongseong(word: string): boolean {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 주제 조사 은/는 선택 */
function topicParticle(word: string): string {
  return hasJongseong(word) ? '은' : '는';
}

function regionUnitLabel(level: HubScopeLevel): string {
  return level === 'nation' ? '시·도' : '시·군·구';
}

function identitySentence(d: HubSummaryData): string {
  const scope = d.scopeLevel === 'nation' ? '전국' : d.scopeLabel;
  return `${scope}에 등록된 ${d.categoryLabel}${topicParticle(d.categoryLabel)} ${nf(d.total)}곳입니다.`;
}

export function buildHubSummaryLines(d: HubSummaryData): string[] {
  if (d.total <= 0) return [];
  const identity = identitySentence(d);

  const canDistribute =
    d.scopeLevel !== 'sigungu' &&
    d.total >= MIN_TOTAL_FOR_DISTRIBUTION &&
    d.topRegions.length >= MIN_REGIONS_FOR_DISTRIBUTION &&
    d.concentrationPct != null;

  if (!canDistribute) return [identity];

  const unit = regionUnitLabel(d.scopeLevel);
  const top = d.topRegions
    .slice(0, 3)
    .map((r) => `${r.name}(${nf(r.count)})`)
    .join('·');
  const distribution =
    `${unit}별 분포를 보면 ${top} 순으로 등록 수가 많고, ` +
    `상위 3개 ${unit}가 전체의 약 ${d.concentrationPct}% 비중입니다.`;

  return [identity, distribution];
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/prose.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: 커밋**

```bash
git add lib/hub-summary/types.ts lib/hub-summary/prose.ts tests/lib/hub-summary/prose.test.ts
git commit -m "feat(hub): 허브 요약 프로즈 빌더 + 타입 (순수 함수)"
```

---

## Task 2: HubSummary 서버 컴포넌트

**Files:**
- Create: `app/(public)/_components/hub-summary.tsx`

**Interfaces:**
- Consumes: `buildHubSummaryLines`, `HubSummaryData` (Task 1)
- Produces: `function HubSummary({ data }: { data: HubSummaryData | null }): JSX.Element | null`

- [ ] **Step 1: 컴포넌트 구현** (서버 컴포넌트, 'use client' 없음)

Create `app/(public)/_components/hub-summary.tsx`:

```tsx
import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import type { HubSummaryData } from '@/lib/hub-summary/types';

export function HubSummary({ data }: { data: HubSummaryData | null }) {
  if (!data) return null;
  const lines = buildHubSummaryLines(data);
  if (lines.length === 0) return null;
  return (
    <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--color-muted)]">
      {lines.join(' ')}
    </p>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(신규 파일 관련).

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/_components/hub-summary.tsx"
git commit -m "feat(hub): HubSummary 서버 컴포넌트"
```

---

## Task 3: 의료(병원·약국) 집계 + 페이지 배선

**Files:**
- Create: `lib/hub-summary/medical.ts`
- Modify: `app/(public)/medical/hospital/page.tsx:34-55`
- Modify: `app/(public)/medical/pharmacy/page.tsx` (동일 위치의 total <p> 아래)
- Test: `tests/integration/hub-summary-medical.test.ts`

**Interfaces:**
- Consumes: `HubSummaryData` (Task 1), `HubSummary` (Task 2), `prisma`
- Produces: `function getMedicalRegionBreakdown(kind: 'hospital' | 'pharmacy', categoryLabel: string, region?: string): Promise<HubSummaryData | null>`

- [ ] **Step 1: 집계 함수 구현**

Create `lib/hub-summary/medical.ts`:

```ts
import { prisma } from '@/lib/db';
import type { HubSummaryData } from './types';

type MedicalKind = 'hospital' | 'pharmacy';

// prisma delegate 타입이 hospital/pharmacy로 갈리므로 분기하여 union 호출을 피한다.
async function sidoGroups(kind: MedicalKind): Promise<{ sido: string | null; _count: { _all: number } }[]> {
  if (kind === 'hospital') {
    return prisma.hospital.groupBy({ by: ['sido'], where: { sido: { not: null } }, _count: { _all: true } });
  }
  return prisma.pharmacy.groupBy({ by: ['sido'], where: { sido: { not: null } }, _count: { _all: true } });
}

async function sigunguCount(kind: MedicalKind, sigunguCode: string): Promise<number> {
  if (kind === 'hospital') return prisma.hospital.count({ where: { sigunguCode } });
  return prisma.pharmacy.count({ where: { sigunguCode } });
}

export async function getMedicalRegionBreakdown(
  kind: MedicalKind,
  categoryLabel: string,
  region?: string,
): Promise<HubSummaryData | null> {
  try {
    if (region) {
      const total = await sigunguCount(kind, region);
      if (total <= 0) return null;
      const reg = await prisma.region.findFirst({
        where: { sigunguCode: region, level: 2, isAbolished: false },
        select: { fullName: true },
      });
      return {
        kind: 'medical', categoryLabel,
        scopeLabel: reg?.fullName ?? '해당 지역',
        scopeLevel: 'sigungu', total, topRegions: [],
      };
    }

    const groups = await sidoGroups(kind);
    const rows = groups
      .filter((g) => g.sido)
      .map((g) => ({ name: g.sido as string, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;
    const top = rows.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    return {
      kind: 'medical', categoryLabel, scopeLabel: '전국', scopeLevel: 'nation',
      total, topRegions: top,
      concentrationPct: Math.round((top3 / total) * 100),
    };
  } catch (e) {
    console.error(`getMedicalRegionBreakdown(${kind}) failed`, e);
    return null;
  }
}
```

- [ ] **Step 2: 통합 테스트 작성**

Create `tests/integration/hub-summary-medical.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getMedicalRegionBreakdown } from '@/lib/hub-summary/medical';

describe('getMedicalRegionBreakdown', () => {
  it('전국 병원: nation 스코프 + 상위3 + 비중', async () => {
    const d = await getMedicalRegionBreakdown('hospital', '병원·의원');
    if (d === null) return; // 로컬 DB에 의료 데이터 없으면 스킵(폴백 검증은 유닛에서)
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
    expect(d.topRegions.length).toBeGreaterThan(0);
    expect(d.topRegions.length).toBeLessThanOrEqual(3);
    if (d.concentrationPct != null) {
      expect(d.concentrationPct).toBeGreaterThanOrEqual(0);
      expect(d.concentrationPct).toBeLessThanOrEqual(100);
    }
    // topRegions는 count 내림차순
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-medical.test.ts`
Expected: PASS (데이터 있으면 단언 통과, 없으면 조기 return).

- [ ] **Step 4: 병원 페이지 배선**

`app/(public)/medical/hospital/page.tsx`:
- import 추가(파일 상단):

```tsx
import { HubSummary } from '../../_components/hub-summary';
import { getMedicalRegionBreakdown } from '@/lib/hub-summary/medical';
```

- `Promise.all` 블록(34-38행)에 요약 집계 추가:

```tsx
  const [{ rows, total, totalPages }, regions, typeCodes, summary] = await Promise.all([
    getHospitalList({ sigunguCode, typeCode }, page),
    getHospitalRegions(),
    getHospitalTypeCodes(),
    getMedicalRegionBreakdown('hospital', '병원·의원', sigunguCode).catch(() => null),
  ]);
```

- 헤더 카드의 `<p className="mt-2 text-sm text-[var(--color-muted)]">전국 {total.toLocaleString('ko-KR')}개</p>` (54행) 바로 아래에 삽입:

```tsx
          <HubSummary data={summary} />
```

- [ ] **Step 5: 약국 페이지 배선**

`app/(public)/medical/pharmacy/page.tsx`에 병원과 동일 패턴 적용:
- 동일 import 두 줄 추가(경로 상대깊이 동일: `../../_components/hub-summary`).
- `Promise.all`에 `getMedicalRegionBreakdown('pharmacy', '약국', sigunguCode).catch(() => null)` 추가하고 결과를 `summary`로 구조분해.
- 헤더 카드의 `전국 {total}개` <p> 아래 `<HubSummary data={summary} />` 삽입.

(약국 페이지의 Promise.all 구조가 병원과 다르면, 기존 배열 끝에 항목을 추가하고 좌변 구조분해에 `summary`를 같은 순서로 추가한다.)

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

```bash
git add lib/hub-summary/medical.ts tests/integration/hub-summary-medical.test.ts "app/(public)/medical/hospital/page.tsx" "app/(public)/medical/pharmacy/page.tsx"
git commit -m "feat(hub): 병원·약국 지역 분포 요약"
```

---

## Task 4: 실거래(오피스텔·빌라) 집계 + 페이지 배선

**Files:**
- Create: `lib/hub-summary/property.ts`
- Modify: `app/(public)/officetel/page.tsx:26-33`
- Modify: `app/(public)/villa/page.tsx` (동일 위치)
- Test: `tests/integration/hub-summary-property.test.ts`

**Interfaces:**
- Consumes: `HubSummaryData`, `HubSummary`, `prisma`, `PropertyType`, `sidoFromPrefix` (from `@/lib/region`)
- Produces: `function getPropertyHubStats(types: PropertyType[], categoryLabel: string): Promise<HubSummaryData | null>`

- [ ] **Step 1: 집계 함수 구현**

`sidoFromPrefix(code2)`는 2자리 시도코드 → 단축 시도명을 반환한다(페이지들에서 `sidoFromPrefix(region.slice(0,2))`로 사용 중). Property는 sido 컬럼이 없고 `sigunguCode`(앞 2자리=시도코드) + `region` 관계만 있으므로, raw SQL로 시도코드별 GROUP BY 후 이름 매핑한다(`getRegionStats`의 raw SQL 패턴 준용).

Create `lib/hub-summary/property.ts`:

```ts
import { prisma } from '@/lib/db';
import { Prisma, PropertyType } from '@prisma/client';
import { sidoFromPrefix } from '@/lib/region';
import type { HubSummaryData } from './types';

export async function getPropertyHubStats(
  types: PropertyType[],
  categoryLabel: string,
): Promise<HubSummaryData | null> {
  try {
    const typeList = Prisma.join(types.map((t) => Prisma.sql`${t}::"PropertyType"`));
    const rows = await prisma.$queryRaw<Array<{ sido_code: string; cnt: number }>>`
      SELECT substring("sigunguCode" from 1 for 2) AS sido_code, COUNT(*)::int AS cnt
      FROM "Property"
      WHERE "propertyType" IN (${typeList})
        AND "txCount12m" > 0
        AND "sigunguCode" IS NOT NULL
      GROUP BY 1
      ORDER BY cnt DESC
    `;
    const mapped = rows
      .map((r) => ({ name: sidoFromPrefix(r.sido_code) ?? r.sido_code, count: r.cnt }))
      .filter((r) => r.count > 0);
    const total = mapped.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;
    const top = mapped.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    return {
      kind: 'property', categoryLabel, scopeLabel: '전국', scopeLevel: 'nation',
      total, topRegions: top,
      concentrationPct: Math.round((top3 / total) * 100),
    };
  } catch (e) {
    console.error('getPropertyHubStats failed', e);
    return null;
  }
}
```

- [ ] **Step 2: 통합 테스트 작성**

Create `tests/integration/hub-summary-property.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PropertyType } from '@prisma/client';
import { getPropertyHubStats } from '@/lib/hub-summary/property';

describe('getPropertyHubStats', () => {
  it('오피스텔: nation 스코프 + 시도 분포', async () => {
    const d = await getPropertyHubStats([PropertyType.OFFICETEL], '오피스텔');
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.kind).toBe('property');
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('빌라: 두 개 타입 합산', async () => {
    const d = await getPropertyHubStats([PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX], '연립·다세대');
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-property.test.ts`
Expected: PASS.

- [ ] **Step 4: 오피스텔 페이지 배선** (force-dynamic이므로 `.catch(() => null)` 필수)

`app/(public)/officetel/page.tsx`:
- import 추가:

```tsx
import { HubSummary } from '../_components/hub-summary';
import { getPropertyHubStats } from '@/lib/hub-summary/property';
```

- `OffiHubPage` 본문에서 popular 조회와 병렬로 요약 집계:

```tsx
  const [popular, summary] = await Promise.all([
    getTopPropertiesByVolume({ types: [PropertyType.OFFICETEL], limit: 30 }).catch((err) => {
      console.error('OffiHubPage: popular query failed', err);
      return [];
    }),
    getPropertyHubStats([PropertyType.OFFICETEL], '오피스텔').catch(() => null),
  ]);
```

- `<h1>전국 오피스텔 실거래가</h1>` 바로 아래에 삽입:

```tsx
      <HubSummary data={summary} />
```

- [ ] **Step 5: 빌라 페이지 배선**

`app/(public)/villa/page.tsx`에 동일 패턴:
- import: `HubSummary`(`../_components/hub-summary`), `getPropertyHubStats`.
- villa 타입은 `[PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX]`, 라벨 `'연립·다세대'`.
- 기존 popular 조회를 `Promise.all`로 묶고 `getPropertyHubStats([PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX], '연립·다세대').catch(() => null)` 추가.
- `<h1>` 아래 `<HubSummary data={summary} />` 삽입.

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

```bash
git add lib/hub-summary/property.ts tests/integration/hub-summary-property.test.ts "app/(public)/officetel/page.tsx" "app/(public)/villa/page.tsx"
git commit -m "feat(hub): 오피스텔·빌라 시도 분포 요약"
```

---

## Task 5: 생활편의(amenity) 집계 + 페이지 배선 + 메타

**Files:**
- Modify: `lib/amenity/category.ts` — `AmenityCategoryDef` 인터페이스에 `getRegionBreakdown` 추가
- Modify: `lib/amenity/adapters/{cafe,convenience,mart,market}.ts` — `getRegionBreakdown` 구현 + def에 등록
- Create: `lib/hub-summary/amenity.ts`
- Modify: `app/(public)/amenity/[category]/page.tsx:33-44,63-95`
- Test: `tests/integration/hub-summary-amenity.test.ts`

**Interfaces:**
- Consumes: `getCategoryDef`, `AmenityListFilter` (from `@/lib/amenity/category`), `prisma`, `HubSummaryData`
- Produces:
  - `AmenityCategoryDef.getRegionBreakdown(filter: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]>`
  - `function getAmenityHubSummary(slug: string, categoryLabel: string, filter: AmenityListFilter): Promise<HubSummaryData | null>`

- [ ] **Step 1: 인터페이스에 메서드 추가**

`lib/amenity/category.ts`의 `AmenityCategoryDef` 인터페이스에서 `getList` 선언 바로 아래에 추가:

```ts
  getRegionBreakdown(filter: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]>;
```

- [ ] **Step 2: cafe 어댑터 구현**

`lib/amenity/adapters/cafe.ts`에 함수 추가(기존 `buildCafeWhere` 재사용):

```ts
export async function cafeRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildCafeWhere(f);
  const groups = await prisma.store.groupBy({
    by: ['sigunguCode'],
    where,
    _count: { _all: true },
  });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}
```

그리고 이 파일이 export 하는 `AmenityCategoryDef` 객체에 `getRegionBreakdown: cafeRegionBreakdown,`를 추가한다(기존 `getList` 프로퍼티 옆).

- [ ] **Step 3: convenience/mart/market 어댑터 구현**

각 파일에서 그 파일의 where 빌더 이름을 사용해 동일 함수를 추가한다. 각 어댑터는 이미 `buildXWhere`(cafe와 동형)와 `prisma.store`를 쓴다. where 빌더 이름을 먼저 확인(`grep -n "function build" lib/amenity/adapters/convenience.ts`)한 뒤:

`lib/amenity/adapters/convenience.ts`:

```ts
export async function convenienceRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildConvenienceWhere(f); // 실제 빌더 이름으로
  const groups = await prisma.store.groupBy({ by: ['sigunguCode'], where, _count: { _all: true } });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}
```

`lib/amenity/adapters/mart.ts`:

```ts
export async function martRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildMartWhere(f);
  const groups = await prisma.store.groupBy({ by: ['sigunguCode'], where, _count: { _all: true } });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}
```

`lib/amenity/adapters/market.ts`:

```ts
export async function marketRegionBreakdown(f: AmenityListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildMarketWhere(f);
  const groups = await prisma.store.groupBy({ by: ['sigunguCode'], where, _count: { _all: true } });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode, count: g._count._all }));
}
```

각 파일의 def 객체에 `getRegionBreakdown: <해당>RegionBreakdown,`를 추가한다. (where 빌더가 export 되어있지 않다면 같은 파일 내부 함수이므로 그대로 호출 가능.)

- [ ] **Step 4: amenity 요약 함수 구현**

Create `lib/hub-summary/amenity.ts`:

```ts
import { prisma } from '@/lib/db';
import { getCategoryDef } from '@/lib/amenity/category';
import type { AmenityListFilter } from '@/lib/amenity/category';
import { getAmenityList } from '@/lib/amenity/list';
import type { HubSummaryData } from './types';

export async function getAmenityHubSummary(
  slug: string,
  categoryLabel: string,
  filter: AmenityListFilter,
  scopeLabel: string,
): Promise<HubSummaryData | null> {
  try {
    const def = getCategoryDef(slug);
    if (!def) return null;

    // 시군구 스코프: 하위 분포 없음 → 총계만
    if (filter.sigunguCode) {
      const { total } = await getAmenityList(slug, filter, 1);
      if (total <= 0) return null;
      return { kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sigungu', total, topRegions: [] };
    }

    const groups = (await def.getRegionBreakdown(filter)).sort((a, b) => b.count - a.count);
    const total = groups.reduce((s, g) => s + g.count, 0);
    if (total <= 0) return null;

    const top = groups.slice(0, 3);
    const regions = await prisma.region.findMany({
      where: { sigunguCode: { in: top.map((t) => t.sigunguCode) }, level: 2, isAbolished: false },
      select: { sigunguCode: true, sigungu: true },
    });
    const nameOf = (code: string) =>
      regions.find((r) => r.sigunguCode === code)?.sigungu ?? code;

    const top3 = top.reduce((s, g) => s + g.count, 0);
    return {
      kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total,
      topRegions: top.map((g) => ({ name: nameOf(g.sigunguCode), count: g.count })),
      concentrationPct: Math.round((top3 / total) * 100),
    };
  } catch (e) {
    console.error(`getAmenityHubSummary(${slug}) failed`, e);
    return null;
  }
}
```

- [ ] **Step 5: 통합 테스트 작성 + 실행**

Create `tests/integration/hub-summary-amenity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getAmenityHubSummary } from '@/lib/hub-summary/amenity';

describe('getAmenityHubSummary', () => {
  it('서울 카페: sido 스코프 + 시군구 분포', async () => {
    const d = await getAmenityHubSummary('cafe', '카페', { sido: '서울' }, '서울');
    if (d === null) return;
    expect(d.scopeLevel).toBe('sido');
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    d.topRegions.forEach((r) => expect(r.name).not.toMatch(/^\d/)); // 코드가 아닌 지역명
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-amenity.test.ts`
Expected: PASS.

- [ ] **Step 6: 페이지 배선 + 메타 교체**

`app/(public)/amenity/[category]/page.tsx`:
- import 추가:

```tsx
import { HubSummary } from '../../_components/hub-summary';
import { getAmenityHubSummary } from '@/lib/hub-summary/amenity';
```

- `generateMetadata`의 description(35행)을 스코프 고유 문장으로 교체:

```tsx
    description: `${scope}에 등록된 ${def.label} 현황을 지역별 분포와 함께 정리했습니다. 주변 아파트 실거래가도 함께 확인하세요.`,
```

- 본문 `Promise.all`(63-73행)에 요약 집계 추가(구조분해 끝에 `summary`):

```tsx
    getAmenityHubSummary(def.slug, def.label, {
      sigunguCode: sp.region, sido: effectiveSido, q: sp.q, sub: sp[subKey],
    }, scopeLabel).catch(() => null),
```

  (단, `scopeLabel`은 76행에서 계산되므로, 집계 호출을 `scopeLabel` 계산 이후로 옮기거나 `region?.fullName ?? (effectiveSido ?? '전국')`을 인라인으로 전달한다. 간단히 `Promise.all` 뒤 별도 `await`로 빼도 됨 — ISR 캐시라 성능 영향 미미.)

- 헤더 카드의 `<p className="mt-2 text-sm text-[var(--color-muted)]">전체 {total.toLocaleString('ko-KR')}개</p>`(92-94행) 아래에 삽입:

```tsx
        <HubSummary data={summary} />
```

- [ ] **Step 7: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(모든 어댑터가 `getRegionBreakdown`을 구현했는지 인터페이스가 강제).

```bash
git add lib/amenity/category.ts lib/amenity/adapters/ lib/hub-summary/amenity.ts tests/integration/hub-summary-amenity.test.ts "app/(public)/amenity/[category]/page.tsx"
git commit -m "feat(hub): 생활편의 카테고리 지역 분포 요약 + 메타 고유화"
```

---

## Task 6: 도시인프라(urban) 집계 + 페이지 배선 + 메타

**Files:**
- Modify: `lib/urban/category.ts` — `UrbanCategoryDef`에 `getRegionBreakdown` 추가
- Modify: `lib/urban/adapters/*.ts` — 구현 + def 등록
- Create: `lib/hub-summary/urban.ts`
- Modify: `app/(public)/urban/[category]/page.tsx` (amenity와 동형)
- Test: `tests/integration/hub-summary-urban.test.ts`

**Interfaces:**
- Consumes: `getUrbanCategoryDef`, `AmenityListFilter`-동형의 `UrbanListFilter`(from `@/lib/urban/category`), `prisma`, `HubSummaryData`
- Produces:
  - `UrbanCategoryDef.getRegionBreakdown(filter): Promise<{ sigunguCode: string; count: number }[]>`
  - `function getUrbanHubSummary(slug, categoryLabel, filter, scopeLabel): Promise<HubSummaryData | null>`

- [ ] **Step 1: urban 어댑터 구조 확인**

Run: `ls lib/urban/adapters/ && grep -n "function build\|prisma\.\|by: \[" lib/urban/adapters/*.ts`
Expected: 각 어댑터의 모델(예: `prisma.park`, `prisma.parkingLot`, `prisma.evCharger` 등)과 where 빌더 이름 확인. groupBy 대상 컬럼이 `sigunguCode`인지 확인.

**중요:** urban 어댑터는 amenity의 `Store`와 달리 카테고리별 별도 모델을 쓸 수 있다. groupBy 컬럼도 `sigunguCode`가 아닐 수 있으니(예: 주소 파싱 기반) Step 1 결과에 맞춰 아래 구현의 모델명·컬럼을 조정한다. `sigunguCode` 컬럼이 없는 어댑터는 `getRegionBreakdown`이 빈 배열을 반환하도록 두면(요약은 시군구 폴백/생략으로 안전) 회귀가 없다.

- [ ] **Step 2: 인터페이스 + 어댑터 구현**

`lib/urban/category.ts`의 `UrbanCategoryDef` 인터페이스 `getList` 아래에 추가:

```ts
  getRegionBreakdown(filter: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]>;
```

각 urban 어댑터에 Step 1에서 확인한 모델·where로 함수 추가(예시는 park):

```ts
export async function parkRegionBreakdown(f: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  const where = buildParkWhere(f);
  const groups = await prisma.park.groupBy({ by: ['sigunguCode'], where, _count: { _all: true } });
  return groups.map((g) => ({ sigunguCode: g.sigunguCode as string, count: g._count._all }));
}
```

`sigunguCode` 컬럼이 없는 어댑터는:

```ts
export async function xRegionBreakdown(_f: UrbanListFilter): Promise<{ sigunguCode: string; count: number }[]> {
  return []; // 시군구 코드 미보유 → 분포 생략(요약은 총계 문장으로 폴백)
}
```

각 def 객체에 `getRegionBreakdown: <해당>RegionBreakdown,` 등록.

- [ ] **Step 3: urban 요약 함수 구현**

Create `lib/hub-summary/urban.ts` (amenity와 동형, import만 urban으로):

```ts
import { prisma } from '@/lib/db';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { UrbanListFilter } from '@/lib/urban/category';
import { getUrbanList } from '@/lib/urban/list';
import type { HubSummaryData } from './types';

export async function getUrbanHubSummary(
  slug: string,
  categoryLabel: string,
  filter: UrbanListFilter,
  scopeLabel: string,
): Promise<HubSummaryData | null> {
  try {
    const def = getUrbanCategoryDef(slug);
    if (!def) return null;

    if (filter.sigunguCode) {
      const { total } = await getUrbanList(slug, filter, 1);
      if (total <= 0) return null;
      return { kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sigungu', total, topRegions: [] };
    }

    const groups = (await def.getRegionBreakdown(filter)).sort((a, b) => b.count - a.count);
    const total = groups.reduce((s, g) => s + g.count, 0);
    if (total <= 0) return null;

    // 분포가 비었으면(코드 미보유) 총계 문장만 → sido 스코프이되 topRegions=[]로 폴백
    if (groups.length < 3) {
      return { kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total, topRegions: [] };
    }

    const top = groups.slice(0, 3);
    const regions = await prisma.region.findMany({
      where: { sigunguCode: { in: top.map((t) => t.sigunguCode) }, level: 2, isAbolished: false },
      select: { sigunguCode: true, sigungu: true },
    });
    const nameOf = (code: string) => regions.find((r) => r.sigunguCode === code)?.sigungu ?? code;
    const top3 = top.reduce((s, g) => s + g.count, 0);
    return {
      kind: 'amenity', categoryLabel, scopeLabel, scopeLevel: 'sido', total,
      topRegions: top.map((g) => ({ name: nameOf(g.sigunguCode), count: g.count })),
      concentrationPct: Math.round((top3 / total) * 100),
    };
  } catch (e) {
    console.error(`getUrbanHubSummary(${slug}) failed`, e);
    return null;
  }
}
```

(`kind: 'amenity'`로 두는 이유: `kind`는 현재 프로즈에 영향 없음. urban 전용 kind가 필요해지면 Task 1 유니온에 추가.)

- [ ] **Step 4: 통합 테스트 + 실행**

Create `tests/integration/hub-summary-urban.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getUrbanHubSummary } from '@/lib/hub-summary/urban';

describe('getUrbanHubSummary', () => {
  it('서울 주차장/공원: null 아니면 total>0, count 내림차순', async () => {
    const d = await getUrbanHubSummary('parking', '주차장', { sido: '서울' }, '서울');
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
    const counts = d.topRegions.map((r) => r.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
```

(slug은 Step 1에서 확인한 실제 urban 슬러그로 조정: parking/park/charger 등.)

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-urban.test.ts`
Expected: PASS.

- [ ] **Step 5: 페이지 배선 + 메타 교체**

`app/(public)/urban/[category]/page.tsx`를 Task 5의 amenity 페이지와 동형으로 수정:
- import: `HubSummary`(`../../_components/hub-summary`), `getUrbanHubSummary`.
- `generateMetadata` description(35행)을 교체:

```tsx
    description: `${scope}에 등록된 ${def.label} 현황을 지역별 분포와 함께 정리했습니다. 주변 아파트 실거래가도 함께 확인하세요.`,
```

- 본문에서 `scopeLabel` 계산 후 요약 집계:

```tsx
  const summary = await getUrbanHubSummary(def.slug, def.label, {
    sigunguCode: sp.region, sido: effectiveSido, q: sp.q, sub: sp[subKey],
  }, scopeLabel).catch(() => null);
```

- 헤더 카드의 `전체 {total}개` <p> 아래 `<HubSummary data={summary} />` 삽입.

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

```bash
git add lib/urban/category.ts lib/urban/adapters/ lib/hub-summary/urban.ts tests/integration/hub-summary-urban.test.ts "app/(public)/urban/[category]/page.tsx"
git commit -m "feat(hub): 도시인프라 카테고리 지역 분포 요약 + 메타 고유화"
```

---

## Task 7: 전체 검증 (실제 렌더 + 회귀)

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 테스트**

Run: `pnpm test`
Expected: 신규 유닛·통합 테스트 포함 전부 PASS (기존 DB 병렬 flake는 단독 재실행으로 확인).

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 빌드 후 6개 허브 초기 HTML 확인**

Run(백그라운드): `pnpm dev`
그다음 각 허브를 curl해 요약 문장이 raw HTML에 있는지 확인:

```bash
for u in \
  "http://localhost:3000/officetel" \
  "http://localhost:3000/villa" \
  "http://localhost:3000/medical/hospital" \
  "http://localhost:3000/medical/pharmacy" \
  "http://localhost:3000/amenity/cafe?sido=서울" \
  "http://localhost:3000/urban/parking?sido=서울"; do
  echo "=== $u ==="
  curl -s "$u" | grep -oE '등록된 [^<]{0,40}곳입니다' | head -1
done
```

Expected: 각 URL에서 "등록된 … 곳입니다" 문장이 출력됨(데이터 있는 허브). 로컬 DB에 데이터 없는 허브는 폴백으로 문장이 없을 수 있음 — 그 경우 프로덕션 프리뷰(Vercel)로 재확인.

- [ ] **Step 4: 회귀 확인**

각 허브에서 기존 리스트/필터/페이지네이션이 정상 동작하는지 육안 확인(요약은 헤더 카드 안에만 추가됨).

- [ ] **Step 5: PR 생성**

```bash
git push -u origin feat/hub-summary
gh pr create --base main --head feat/hub-summary \
  --title "feat(hub): 생활편의·실거래 허브 상단 지역 분포 요약" \
  --body "6개 허브(officetel/villa/amenity/urban/medical hospital·pharmacy)에 등록 수 기반 지역 분포 요약을 SSR로 추가. AdSense thin-content 대응. 스펙: docs/superpowers/specs/2026-07-01-hub-summary-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage:**
- 3계층 분리 → Task 1(프로즈)·집계(3~6)·컴포넌트(2) ✅
- 용어 "등록 수·분포·비중", 밀집도 금지 → Task 1 구현 + 테스트 단언 ✅
- 집중도 단일 프레이밍 → Task 1 `distribution` 문장 ✅
- 집계단위↔표현 일치 → `regionUnitLabel` + 테스트 ✅
- 폴백(0/희소) → Task 1 `canDistribute` + 테스트 ✅
- 6개 허브 배선 → Task 3~6 ✅
- 메타 고유화 → Task 5·6(amenity/urban, 템플릿 반복 페이지). medical/property는 기존 description이 이미 페이지별 고유(진단 결과)라 미변경 — 의도된 범위 축소.
- SSR/raw HTML 포함 검증 → Task 7 Step 3 ✅
- force-dynamic 폴백 → Task 4 `.catch(() => null)` ✅

**Placeholder scan:** urban(Task 6)은 모델·컬럼을 Step 1에서 확인 후 채우는 구조 — 코드는 제시하되 실제 모델명은 확인 의존. 이는 어댑터별 스키마 차이 때문이며, 확인 명령과 조정 규칙(코드 미보유 시 빈 배열)을 명시해 플레이스홀더가 아닌 결정 규칙으로 처리함.

**Type consistency:** `getRegionBreakdown` 반환형 `{ sigunguCode: string; count: number }[]` 전 계층 일치. `HubSummaryData` 필드 Task 1과 3~6 일치. `getAmenityHubSummary`/`getUrbanHubSummary` 4번째 인자 `scopeLabel: string` 일치.
