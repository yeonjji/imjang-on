# 생활시설 상세 보강 PR 6 — 계산값 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 데이터만으로 시설마다 다른 사실 5가지를 계산해 공원·주차장·약국·병원 상세에 붙인다. 공원 면적 순위, 주차장 요금 비교, 약국의 동네 위치(동 약국 수·개설 순서), 약국 도보권 일요일 진료 병·의원 수, 병원의 같은 진료과 현황이다.

**Architecture:** 도메인마다 `…-context.ts` 하나를 둔다. 각 파일에는 순수 함수(단위 테스트)와 DB 조회 함수(자체 시드 통합 테스트)를 넣는다. 화면 카드는 조회 결과를 props로 받는 순수 컴포넌트다(SSR 테스트). 페이지당 추가 쿼리는 1~2개다.

**Tech Stack:** Next.js App Router(ISR), Prisma `$queryRaw` + PostGIS(`ST_DWithin`), Vitest(unit·integration·SSR).

**Spec:** `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` 7절. 이 계획으로 범위를 줄였다: "주변 생활 인프라" 목록과 겹치는 4개(병원의 근처 약국, 약국의 가장 가까운 약국, 공원 반경 공원 수, 주차장 반경 공영 수)는 빼고 새 정보 5개만 다룬다.

## 실측 근거 (2026-10-02, 운영 DB 읽기 전용)

| 데이터 | 사실 | 계획 반영 |
|---|---|---|
| 의원 진료시간(`HospitalDetail`) | 의원 37,800곳 중 11,848곳(31%)만 있음. 일요일 진료 811곳 | 시간 기반 수치에는 "진료시간을 공개한 곳 기준"을 표기하고, 0은 숨긴다 |
| 의원 대표 진료과 | 진료과가 평균 3.8개. 이름에 진료과명이 들어간 의원 25,975곳(69%) | 대표 과 = 이름에 포함된 진료과(가장 긴 일치). 없으면 카드 생략 |
| 주차장 기본시간 | 30분 3,553, 60분 1,115, 10분 988, **1440분 430**(=1일 요금) | 30분 환산은 기본시간 5~120분만 사용 |
| 공영 30분 환산 요금 | 중앙값 500원, 평균 702원, 최대 6,000원 | 평균 대신 **중앙값** 비교 |
| 약국 읍면동 | 25,760곳 중 24,075곳(93%) | 읍면동이 없으면 동 비교 생략 |
| 공원·주차장 | `sigunguCode` 컬럼이 없음 | 기존 `resolveAddrPrefix`(시도+시군구 주소 접두어)로 묶는다 |

## Global Constraints

- 스키마 변경 없음(마이그레이션 없음).
- 비교 대상이 3곳 미만이면 순위·중앙값을 표시하지 않는다(스펙 7절).
- 시간 기반 수치(일요일·토요일·야간 진료)는 0이면 숨기고, 표시할 때는 "진료시간을 공개한 병·의원 기준"을 붙인다(과장 금지).
- "가까운 ○○ 목록" 형태는 만들지 않는다. 기존 "주변 생활 인프라"와 겹친다.
- 페이지당 추가 쿼리 2개 이하.
- 색은 `--color-*` 토큰만, 한글 본문 14px 이상.
- 통합 테스트는 자체 시드(키 접두어 `UT-PR6-`)로 하고, 실제 데이터와 겹치지 않는 바다 좌표(위도 33.0, 경도 124.5 부근)를 쓴다. `afterAll`에서 지운다.
- 커밋 메시지 끝에 다음 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
  ```

## Review Focus

1. **진료시간이 없는 의원을 "진료 안 함"으로 세지 않기**: 일요일 진료 0곳을 "없음"으로 단정하면 안 된다. → Task 3·4 테스트
2. **1일 요금(1440분)을 30분 요금으로 환산해 터무니없이 싼 값이 나오지 않게**: → Task 2 테스트
3. **이름에 진료과가 두 개 겹칠 때**("소아청소년과"·"청소년과"): 가장 긴 일치를 골라야 한다. → Task 4 테스트
4. **자기 자신 포함 여부**: 순위·개수에 이 시설이 포함되는지 문구가 실제와 맞아야 한다("이곳 포함"). → Task 1·3·4 테스트
5. **주소 접두어 실패**(`__NO_MATCH__`) 시 카드 숨김, 크래시 없음. → Task 1·2 테스트

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `lib/urban/park-context.ts` | 공원 면적 순위 조회 | 생성 |
| `lib/urban/parking-context.ts` | 30분 환산·중앙값(순수), 요금 비교 조회 | 생성 |
| `lib/pharmacy/context.ts` | 영업 연차(순수), 동 약국 비교·일요일 진료 조회 | 생성 |
| `lib/hospital/context.ts` | 대표 진료과(순수), 같은 진료과 현황 조회 | 생성 |
| `app/(public)/urban/[category]/_components/park-info.tsx` | "면적 순위" 행 | 수정 |
| `app/(public)/urban/[category]/_components/parking-fee-compare.tsx` | 요금 비교 카드 | 생성 |
| `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood.tsx` | "동네 속 이 약국" 카드 | 생성 |
| `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-same-dept.tsx` | "같은 진료과, 이 동네에서" 카드 | 생성 |
| `app/(public)/urban/[category]/[id]/page.tsx` | 공원·주차장 연결 | 수정 |
| `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` | 약국 연결 | 수정 |
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | 병원 연결 | 수정 |
| `tests/lib/pr6-context-pure.test.ts` | 순수 함수 단위 테스트 | 생성 |
| `tests/components/pr6-cards-ssr.test.ts` | 카드 SSR 테스트 | 생성 |
| `tests/integration/pr6-context.test.ts` | 조회 함수 통합 테스트(자체 시드) | 생성 |

---

### Task 1: 공원 면적 순위

**Files:**
- Create: `lib/urban/park-context.ts`
- Modify: `app/(public)/urban/[category]/_components/park-info.tsx`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`
- Test: `tests/integration/pr6-context.test.ts`(공원 블록), `tests/components/pr6-cards-ssr.test.ts`(ParkInfo 블록)

**Interfaces:**
- Produces:
  ```ts
  export interface ParkAreaRank { rank: number; total: number }
  export async function getParkAreaRank(
    p: { parkType: string | null; area: number | null },
    addrPrefix: string | null,
  ): Promise<ParkAreaRank | null>; // total < 3, 값 없음, 접두어 없음 → null. total에 이 공원 포함
  ```
  `ParkInfo`에 선택 prop `areaRank?: { rank: number; total: number; scope: string } | null`(scope 예: "평택시 근린공원")

- [ ] **Step 1: 실패하는 통합 테스트 작성** (파일을 새로 만들고, 이후 Task 2~4가 같은 파일에 블록을 추가한다)

```ts
// tests/integration/pr6-context.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getParkAreaRank } from '@/lib/urban/park-context';

// 실제 데이터와 겹치지 않게 가상 주소 접두어와 바다 좌표를 쓴다(CI check 잡은 seed를 안 한다).
const PREFIX = 'UT도 UT시';

beforeAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.park.createMany({
    data: [
      { sourceId: 'UT-PR6-P1', name: 'UT큰공원', address: `${PREFIX} 1`, parkType: '근린공원', area: 90000 },
      { sourceId: 'UT-PR6-P2', name: 'UT중간공원', address: `${PREFIX} 2`, parkType: '근린공원', area: 50000 },
      { sourceId: 'UT-PR6-P3', name: 'UT작은공원', address: `${PREFIX} 3`, parkType: '근린공원', area: 10000 },
      { sourceId: 'UT-PR6-P4', name: 'UT어린이공원', address: `${PREFIX} 4`, parkType: '어린이공원', area: 99999 },
    ],
  });
});

afterAll(async () => {
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.$disconnect();
});

describe('getParkAreaRank', () => {
  it('같은 시군구·같은 유형 중 면적 순위(이 공원 포함)', async () => {
    expect(await getParkAreaRank({ parkType: '근린공원', area: 50000 }, PREFIX)).toEqual({ rank: 2, total: 3 });
  });
  it('비교 대상이 3곳 미만이면 null', async () => {
    expect(await getParkAreaRank({ parkType: '어린이공원', area: 99999 }, PREFIX)).toBeNull();
  });
  it('접두어·유형·면적이 없으면 null', async () => {
    expect(await getParkAreaRank({ parkType: '근린공원', area: 50000 }, null)).toBeNull();
    expect(await getParkAreaRank({ parkType: null, area: 50000 }, PREFIX)).toBeNull();
    expect(await getParkAreaRank({ parkType: '근린공원', area: null }, PREFIX)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/pr6-context.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module '@/lib/urban/park-context'`

- [ ] **Step 3: 구현**

```ts
// lib/urban/park-context.ts
// 공원 상세의 계산값: 같은 시군구·같은 유형 공원 중 면적 순위.
// Park에는 sigunguCode 컬럼이 없어 '시도 시군구' 주소 접두어(resolveAddrPrefix)로 묶는다.
import { prisma } from '@/lib/db';

export interface ParkAreaRank {
  rank: number;
  total: number;
}

export async function getParkAreaRank(
  p: { parkType: string | null; area: number | null },
  addrPrefix: string | null,
): Promise<ParkAreaRank | null> {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__' || !p.parkType || !p.area) return null;
  const rows = await prisma.$queryRaw<{ total: number; bigger: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE area > ${p.area})::int AS bigger
    FROM "Park"
    WHERE address LIKE ${`${addrPrefix} %`} AND "parkType" = ${p.parkType} AND area IS NOT NULL
  `;
  const r = rows[0];
  if (!r || r.total < 3) return null;
  return { rank: r.bigger + 1, total: r.total };
}
```

`park-info.tsx`: 시그니처에 prop을 추가하고 `rows` 배열의 `['면적', …]` 다음에 행을 추가한다.

```tsx
export function ParkInfo({
  item,
  areaRank,
}: {
  item: UrbanItem<ParkRaw>;
  areaRank?: { rank: number; total: number; scope: string } | null;
}) {
```

```tsx
    ['면적 순위', areaRank ? `${areaRank.scope} ${areaRank.total}곳 중 ${areaRank.rank}위` : null],
```

`page.tsx`(urban): import 추가.

```tsx
import { getParkAreaRank } from '@/lib/urban/park-context';
import { resolveAddrPrefix } from '@/lib/urban/_shared';
```

`const { narrative, dateModified } = isPark ? …` 다음 줄에 추가한다.

```tsx
  const parkRaw = isPark ? (item as UrbanItem<ParkRaw>).raw : null;
  const addrPrefix = sigunguCode ? await resolveAddrPrefix({ sigunguCode }) : null;
  const areaRank = parkRaw ? await getParkAreaRank(parkRaw, addrPrefix) : null;
  const areaRankProp =
    areaRank && region && parkRaw?.parkType
      ? { ...areaRank, scope: `${region.fullName.split(' ').pop()} ${parkRaw.parkType}` }
      : null;
```

`<ParkInfo item={item as UrbanItem<ParkRaw>} />`를 `<ParkInfo item={item as UrbanItem<ParkRaw>} areaRank={areaRankProp} />`로 바꾼다.

`resolveAddrPrefix`의 인자 타입이 `UrbanListFilter`라 다른 필드가 필수면, 그 타입을 확인해 `{ sigunguCode } as UrbanListFilter`로 넘긴다.

`tests/components/pr6-cards-ssr.test.ts`를 만들고 ParkInfo 블록을 넣는다(Task 2~4가 같은 파일에 추가).

```ts
// tests/components/pr6-cards-ssr.test.ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParkInfo } from '@/app/(public)/urban/[category]/_components/park-info';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import type { UrbanItem } from '@/lib/urban/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const park = { id: 1n, name: 'p', address: '경기도 평택시 1', sigunguCode: null, raw: { address: '경기도 평택시 1', parkType: '근린공원', area: 58462 } as ParkRaw } as UrbanItem<ParkRaw>;

describe('ParkInfo 면적 순위', () => {
  it('순위가 있으면 행으로', () => {
    const html = renderToStaticMarkup(createElement(ParkInfo, { item: park, areaRank: { rank: 15, total: 120, scope: '평택시 근린공원' } }));
    expect(html).toContain('평택시 근린공원 120곳 중 15위');
  });
  it('없으면 행 없음', () => {
    expect(renderToStaticMarkup(createElement(ParkInfo, { item: park }))).not.toContain('면적 순위');
  });
});
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts tests/components/park-detail-ssr.test.ts --no-file-parallelism && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add lib/urban/park-context.ts "app/(public)/urban/[category]/_components/park-info.tsx" "app/(public)/urban/[category]/[id]/page.tsx" tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts
git commit -m "feat(park): 같은 시군구·유형 공원 중 면적 순위

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 2: 주차장 요금 비교

**Files:**
- Create: `lib/urban/parking-context.ts`
- Create: `app/(public)/urban/[category]/_components/parking-fee-compare.tsx`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`
- Test: `tests/lib/pr6-context-pure.test.ts`(새 파일), `tests/integration/pr6-context.test.ts`(주차장 블록 추가), `tests/components/pr6-cards-ssr.test.ts`(블록 추가)

**Interfaces:**
- Produces:
  ```ts
  export function per30(basicTime: number | null, basicCharge: number | null): number | null; // 5~120분, 요금>0만
  export function median(nums: number[]): number | null; // 빈 배열 null, 짝수면 두 중앙의 평균 반올림
  export interface ParkingFeeComparison {
    own30: number | null; median30: number | null; count30: number;
    ownMonthly: number | null; medianMonthly: number | null; countMonthly: number;
  }
  export async function getParkingFeeComparison(
    r: { basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null },
    addrPrefix: string | null,
  ): Promise<ParkingFeeComparison | null>; // 비교할 지표가 하나도 없으면 null. 각 지표는 공영 3곳 미만이면 중앙값 null
  export function ParkingFeeCompare(props: { cmp: ParkingFeeComparison; scope: string }): JSX.Element | null;
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/pr6-context-pure.test.ts
import { describe, it, expect } from 'vitest';
import { per30, median } from '@/lib/urban/parking-context';

describe('per30', () => {
  it('기본시간·요금을 30분 요금으로', () => {
    expect(per30(30, 1000)).toBe(1000);
    expect(per30(60, 1000)).toBe(500);
    expect(per30(10, 300)).toBe(900);
  });
  it('1440분(=1일 요금)이나 범위 밖 기본시간은 환산하지 않는다', () => {
    expect(per30(1440, 10000)).toBeNull();
    expect(per30(3, 100)).toBeNull();
    expect(per30(30, 0)).toBeNull();
    expect(per30(null, 1000)).toBeNull();
  });
});

describe('median', () => {
  it('중앙값', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // (2+3)/2 = 2.5 → 반올림 3
    expect(median([])).toBeNull();
  });
});
```

`tests/integration/pr6-context.test.ts`에 추가: 맨 위 import에 `import { getParkingFeeComparison } from '@/lib/urban/parking-context';`, `beforeAll` 안에 주차장 시드를, `afterAll` 안에 정리를 추가한다.

```ts
  // beforeAll 안에 추가
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.parking.createMany({
    data: [
      { sourceId: 'UT-PR6-K1', name: 'UT공영1', address: `${PREFIX} 1`, prkplceSe: '공영', basicTime: 30, basicCharge: 500, monthCmmtkt: 60000 },
      { sourceId: 'UT-PR6-K2', name: 'UT공영2', address: `${PREFIX} 2`, prkplceSe: '공영', basicTime: 60, basicCharge: 1200, monthCmmtkt: 80000 },
      { sourceId: 'UT-PR6-K3', name: 'UT공영3', address: `${PREFIX} 3`, prkplceSe: '공영', basicTime: 30, basicCharge: 1000, monthCmmtkt: 100000 },
      { sourceId: 'UT-PR6-K4', name: 'UT공영일일', address: `${PREFIX} 4`, prkplceSe: '공영', basicTime: 1440, basicCharge: 10000 },
      { sourceId: 'UT-PR6-K5', name: 'UT민영', address: `${PREFIX} 5`, prkplceSe: '민영', basicTime: 30, basicCharge: 5000 },
    ],
  });
```

```ts
  // afterAll 안에 추가
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
```

```ts
describe('getParkingFeeComparison', () => {
  it('공영 주차장 30분 환산 중앙값·월정기권 중앙값(1일 요금·민영 제외)', async () => {
    const cmp = await getParkingFeeComparison({ basicTime: 30, basicCharge: 1500, monthCmmtkt: 100000 }, PREFIX);
    expect(cmp).toEqual({
      own30: 1500, median30: 600, count30: 3,   // 500, 600, 1000 → 600
      ownMonthly: 100000, medianMonthly: 80000, countMonthly: 3,
    });
  });
  it('접두어가 없으면 null', async () => {
    expect(await getParkingFeeComparison({ basicTime: 30, basicCharge: 1500, monthCmmtkt: null }, '__NO_MATCH__')).toBeNull();
  });
  it('이 주차장 요금이 없으면 null', async () => {
    expect(await getParkingFeeComparison({ basicTime: null, basicCharge: null, monthCmmtkt: null }, PREFIX)).toBeNull();
  });
});
```

`tests/components/pr6-cards-ssr.test.ts`에 추가(맨 위 import에 `ParkingFeeCompare`).

```ts
import { ParkingFeeCompare } from '@/app/(public)/urban/[category]/_components/parking-fee-compare';

describe('ParkingFeeCompare', () => {
  it('30분 요금과 월정기권을 중앙값과 나란히', () => {
    const html = renderToStaticMarkup(
      createElement(ParkingFeeCompare, {
        cmp: { own30: 1500, median30: 600, count30: 3, ownMonthly: 100000, medianMonthly: 80000, countMonthly: 3 },
        scope: '평택시',
      }),
    );
    expect(html).toContain('1,500원');
    expect(html).toContain('평택시 공영주차장 중앙값 600원');
    expect(html).toContain('100,000원');
  });
  it('중앙값이 없는 지표는 타일을 숨기고, 다 없으면 렌더하지 않는다', () => {
    const none = { own30: 1500, median30: null, count30: 1, ownMonthly: null, medianMonthly: null, countMonthly: 0 };
    expect(renderToStaticMarkup(createElement(ParkingFeeCompare, { cmp: none, scope: '평택시' }))).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module '@/lib/urban/parking-context'`

- [ ] **Step 3: 구현**

```ts
// lib/urban/parking-context.ts
// 주차장 상세의 계산값: 같은 시군구 공영주차장과의 요금 비교.
// 기본시간이 곳마다 달라(5·10·30·60분, 1440분=1일 요금) 30분 기준으로 환산하고, 이상치 때문에 중앙값을 쓴다.
import { prisma } from '@/lib/db';

const MIN_COMPARABLES = 3;

export function per30(basicTime: number | null, basicCharge: number | null): number | null {
  if (!basicTime || !basicCharge || basicTime < 5 || basicTime > 120 || basicCharge <= 0) return null;
  return Math.round((basicCharge * 30) / basicTime);
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface ParkingFeeComparison {
  own30: number | null;
  median30: number | null;
  count30: number;
  ownMonthly: number | null;
  medianMonthly: number | null;
  countMonthly: number;
}

export async function getParkingFeeComparison(
  r: { basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null },
  addrPrefix: string | null,
): Promise<ParkingFeeComparison | null> {
  if (!addrPrefix || addrPrefix === '__NO_MATCH__') return null;
  const own30 = per30(r.basicTime, r.basicCharge);
  const ownMonthly = r.monthCmmtkt && r.monthCmmtkt > 0 ? r.monthCmmtkt : null;
  if (own30 === null && ownMonthly === null) return null;

  const rows = await prisma.$queryRaw<{ basicTime: number | null; basicCharge: number | null; monthCmmtkt: number | null }[]>`
    SELECT "basicTime", "basicCharge", "monthCmmtkt" FROM "Parking"
    WHERE "prkplceSe" = '공영' AND address LIKE ${`${addrPrefix} %`}
  `;
  const fees = rows.map((x) => per30(x.basicTime, x.basicCharge)).filter((v): v is number => v !== null);
  const months = rows.map((x) => x.monthCmmtkt).filter((v): v is number => !!v && v > 0);
  return {
    own30,
    median30: fees.length >= MIN_COMPARABLES ? median(fees) : null,
    count30: fees.length,
    ownMonthly,
    medianMonthly: months.length >= MIN_COMPARABLES ? median(months) : null,
    countMonthly: months.length,
  };
}
```

```tsx
// app/(public)/urban/[category]/_components/parking-fee-compare.tsx
import { Card } from '@/components/ui/card';
import type { ParkingFeeComparison } from '@/lib/urban/parking-context';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function ParkingFeeCompare({ cmp, scope }: { cmp: ParkingFeeComparison; scope: string }) {
  const tiles: { label: string; value: string; sub: string }[] = [];
  if (cmp.own30 !== null && cmp.median30 !== null) {
    tiles.push({ label: '30분 요금(환산)', value: won(cmp.own30), sub: `${scope} 공영주차장 중앙값 ${won(cmp.median30)}` });
  }
  if (cmp.ownMonthly !== null && cmp.medianMonthly !== null) {
    tiles.push({ label: '월 정기권', value: won(cmp.ownMonthly), sub: `${scope} 공영주차장 중앙값 ${won(cmp.medianMonthly)}` });
  }
  if (tiles.length === 0) return null;
  return (
    <Card id="fee-compare">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">요금, 주변과 비교하면</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        기본시간 5~120분인 공영주차장의 기본요금을 30분 기준으로 환산해 비교했습니다(1일 요금 제외).
      </p>
    </Card>
  );
}
```

`page.tsx`(urban): import 추가.

```tsx
import { getParkingFeeComparison } from '@/lib/urban/parking-context';
import { ParkingFeeCompare } from '../_components/parking-fee-compare';
```

Task 1에서 만든 `addrPrefix` 줄 다음에 추가한다.

```tsx
  const feeCmp = def.slug === 'parking' ? await getParkingFeeComparison(r, addrPrefix) : null;
```

주차장 분기의 `<ParkingFeeGrid row={r} />` 바로 다음에 추가한다.

```tsx
              {feeCmp && region && <ParkingFeeCompare cmp={feeCmp} scope={region.fullName.split(' ').pop() ?? ''} />}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add lib/urban/parking-context.ts "app/(public)/urban/[category]/_components/parking-fee-compare.tsx" "app/(public)/urban/[category]/[id]/page.tsx" tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts
git commit -m "feat(parking): 같은 시군구 공영주차장과 30분 요금·월정기권 중앙값 비교

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 3: 약국 "동네 속 이 약국"

**Files:**
- Create: `lib/pharmacy/context.ts`
- Create: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood.tsx`
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
- Test: `tests/lib/pr6-context-pure.test.ts`, `tests/integration/pr6-context.test.ts`, `tests/components/pr6-cards-ssr.test.ts`(블록 추가)

**Interfaces:**
- Produces:
  ```ts
  export function pharmacyYears(openedAt: Date | null, nowYear: number): number | null; // 연차 = nowYear - 개설연도 + 1
  export interface PharmacyDong { dong: string; count: number; openedRank: number } // count는 이 약국 포함
  export async function getPharmacyDong(p: { sigunguCode: string | null; eupmyeondong: string | null; openedAt: Date | null }): Promise<PharmacyDong | null>; // count < 2 → null
  export async function countSundayClinicsNearby(lat: number, lng: number, radius?: number): Promise<number>; // 기본 500m, 진료시간 공개분 중 일요일 유효 시간대
  export function PharmacyNeighborhood(props: { years: number | null; openedYear: number | null; dong: PharmacyDong | null; sundayClinics: number }): JSX.Element | null;
  ```

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/lib/pr6-context-pure.test.ts`에 추가.

```ts
import { pharmacyYears } from '@/lib/pharmacy/context';

describe('pharmacyYears', () => {
  it('개설 연도 포함 연차', () => {
    expect(pharmacyYears(new Date('2007-10-10T00:00:00Z'), 2026)).toBe(20);
    expect(pharmacyYears(new Date('2026-03-01T00:00:00Z'), 2026)).toBe(1);
  });
  it('없거나 미래면 null', () => {
    expect(pharmacyYears(null, 2026)).toBeNull();
    expect(pharmacyYears(new Date('2027-01-01T00:00:00Z'), 2026)).toBeNull();
  });
});
```

`tests/integration/pr6-context.test.ts`: import에 `import { getPharmacyDong, countSundayClinicsNearby } from '@/lib/pharmacy/context';`를 추가하고, `beforeAll`/`afterAll`에 약국·병원 시드와 정리를 추가한다. 병원 시드는 Task 4도 쓴다.

```ts
  // beforeAll 안에 추가 — 약국(시군구 99999, UT동) 3곳, 바다 좌표 근처 병·의원
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.pharmacy.createMany({
    data: [
      { sourceId: 'UT-PR6-RX1', name: 'UT약국1', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2001-01-01T00:00:00Z') },
      { sourceId: 'UT-PR6-RX2', name: 'UT약국2', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2007-10-10T00:00:00Z') },
      { sourceId: 'UT-PR6-RX3', name: 'UT약국3', address: 'UT', sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2015-05-05T00:00:00Z') },
    ],
  });
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  const mk = (sourceId: string, name: string, typeName: string) =>
    prisma.hospital.create({ data: { sourceId, name, typeCode: '31', typeName, address: 'UT' } });
  const h1 = await mk('UT-PR6-H1', 'UT내과의원', '의원');      // 일요일·토요일·야간 진료
  const h2 = await mk('UT-PR6-H2', 'UT바다내과의원', '의원');  // 토요일만
  const h3 = await mk('UT-PR6-H3', 'UT소아청소년과의원', '의원'); // 진료시간 비공개
  const h4 = await mk('UT-PR6-H4', 'UT먼내과의원', '의원');    // 3km 밖
  await prisma.hospitalDept.createMany({
    data: [
      { hospitalId: h1.id, deptCode: '01', deptName: '내과' },
      { hospitalId: h2.id, deptCode: '01', deptName: '내과' },
      { hospitalId: h3.id, deptCode: '11', deptName: '소아청소년과' },
      { hospitalId: h4.id, deptCode: '01', deptName: '내과' },
    ],
  });
  await prisma.hospitalDetail.createMany({
    data: [
      { hospitalId: h1.id, openSun: 900, closeSun: 1300, openSat: 900, closeSat: 1300, openMon: 900, closeMon: 2100 },
      { hospitalId: h2.id, openSat: 900, closeSat: 1300, openMon: 900, closeMon: 1800 },
      { hospitalId: h4.id, openSun: 900, closeSun: 1300 },
    ],
  });
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5000, 33.0000), 4326)::geography WHERE "sourceId" IN ('UT-PR6-H1','UT-PR6-H3')`;
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5030, 33.0000), 4326)::geography WHERE "sourceId" = 'UT-PR6-H2'`;
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5400, 33.0000), 4326)::geography WHERE "sourceId" = 'UT-PR6-H4'`;
```

```ts
  // afterAll 안에 추가 (HospitalDept·HospitalDetail은 onDelete: Cascade)
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-PR6-' } } });
```

```ts
describe('약국 동네 맥락', () => {
  it('같은 동 약국 수와 개설 순서(이 약국 포함)', async () => {
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: 'UT동', openedAt: new Date('2007-10-10T00:00:00Z') }))
      .toEqual({ dong: 'UT동', count: 3, openedRank: 2 });
  });
  it('읍면동이 없거나 혼자면 null', async () => {
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: null, openedAt: null })).toBeNull();
    expect(await getPharmacyDong({ sigunguCode: '99999', eupmyeondong: '없는동', openedAt: null })).toBeNull();
  });
  it('도보권(500m) 일요일 진료: 진료시간 공개분 중 일요일 유효 시간대만, 3km 밖 제외', async () => {
    expect(await countSundayClinicsNearby(33.0, 124.5)).toBe(1);
  });
});
```

`tests/components/pr6-cards-ssr.test.ts`에 추가.

```ts
import { PharmacyNeighborhood } from '@/app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood';

describe('PharmacyNeighborhood', () => {
  it('연차·동 순서·일요일 진료와 그 기준 표기', () => {
    const html = renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: 20, openedYear: 2007, dong: { dong: '박달동', count: 7, openedRank: 2 }, sundayClinics: 2 }));
    expect(html).toContain('20년차');
    expect(html).toContain('박달동 약국 7곳');
    expect(html).toContain('개설 순 2번째');
    expect(html).toContain('2곳');
    expect(html).toContain('진료시간을 공개한 병·의원 기준');
  });
  it('일요일 진료 0곳은 "없음"으로 단정하지 않고 타일을 숨긴다', () => {
    const html = renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: 20, openedYear: 2007, dong: null, sundayClinics: 0 }));
    expect(html).not.toContain('일요일');
  });
  it('보여줄 게 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(PharmacyNeighborhood, { years: null, openedYear: null, dong: null, sundayClinics: 0 }))).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module '@/lib/pharmacy/context'`

- [ ] **Step 3: 구현**

```ts
// lib/pharmacy/context.ts
// 약국 상세의 계산값: 영업 연차, 같은 읍면동 약국 중 개설 순서, 도보권 일요일 진료 병·의원 수.
// 진료시간(HospitalDetail)은 의원의 약 31%만 공개돼 있어, 0을 "없음"으로 단정하지 않는다(호출부가 0이면 숨김).
import { prisma } from '@/lib/db';

export function pharmacyYears(openedAt: Date | null, nowYear: number): number | null {
  if (!openedAt) return null;
  const y = openedAt.getUTCFullYear();
  return y > nowYear ? null : nowYear - y + 1;
}

export interface PharmacyDong {
  dong: string;
  count: number;
  openedRank: number;
}

export async function getPharmacyDong(p: {
  sigunguCode: string | null;
  eupmyeondong: string | null;
  openedAt: Date | null;
}): Promise<PharmacyDong | null> {
  if (!p.sigunguCode || !p.eupmyeondong) return null;
  const rows = await prisma.$queryRaw<{ total: number; older: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${p.openedAt}::date IS NOT NULL AND "openedAt" < ${p.openedAt}::date)::int AS older
    FROM "Pharmacy"
    WHERE "sigunguCode" = ${p.sigunguCode} AND eupmyeondong = ${p.eupmyeondong}
  `;
  const r = rows[0];
  if (!r || r.total < 2) return null;
  return { dong: p.eupmyeondong, count: r.total, openedRank: r.older + 1 };
}

export async function countSundayClinicsNearby(lat: number, lng: number, radius = 500): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Hospital" h JOIN "HospitalDetail" d ON d."hospitalId" = h.id
    WHERE h.location IS NOT NULL
      AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
      AND d."openSun" BETWEEN 0 AND 2400 AND d."closeSun" BETWEEN 0 AND 2400 AND d."closeSun" > d."openSun"
  `;
  return rows[0]?.n ?? 0;
}
```

```tsx
// app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood.tsx
import { Card } from '@/components/ui/card';
import type { PharmacyDong } from '@/lib/pharmacy/context';

interface Props {
  years: number | null;
  openedYear: number | null;
  dong: PharmacyDong | null;
  sundayClinics: number;
}

export function PharmacyNeighborhood({ years, openedYear, dong, sundayClinics }: Props) {
  const tiles: { label: string; value: string; sub?: string }[] = [];
  if (years !== null && openedYear !== null) tiles.push({ label: '영업 연차', value: `${years}년차`, sub: `${openedYear}년 개설` });
  if (dong) tiles.push({ label: '같은 동 약국', value: `${dong.dong} 약국 ${dong.count}곳`, sub: `개설 순 ${dong.openedRank}번째` });
  if (sundayClinics > 0) tiles.push({ label: '도보권 일요일 진료', value: `${sundayClinics}곳`, sub: '반경 500m 병·의원' });
  if (tiles.length === 0) return null;
  return (
    <Card id="neighborhood">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">동네 속 이 약국</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {sundayClinics > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">일요일 진료 수는 진료시간을 공개한 병·의원 기준입니다.</p>
      )}
    </Card>
  );
}
```

`page.tsx`(약국): import 추가.

```tsx
import { getPharmacyDong, countSundayClinicsNearby, pharmacyYears } from '@/lib/pharmacy/context';
import { PharmacyNeighborhood } from './_components/pharmacy-neighborhood';
```

기존 `Promise.all([apts, infra, otherList, subway])`를 두 항목을 더한 형태로 바꾼다.

```tsx
  const [apts, infra, otherList, subway, dong, sundayClinics] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { excludePharmacyId: pharmacy.id, includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    getPharmacyList({ sigunguCode }, 1, 5),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
    getPharmacyDong(pharmacy),
    coord ? countSundayClinicsNearby(coord.lat, coord.lng) : Promise.resolve(0),
  ]);
```

`<SourceCaption ids={['hira']} />` 바로 다음에 추가한다.

```tsx
          <PharmacyNeighborhood
            years={pharmacyYears(pharmacy.openedAt, new Date().getUTCFullYear())}
            openedYear={pharmacy.openedAt ? pharmacy.openedAt.getUTCFullYear() : null}
            dong={dong}
            sundayClinics={sundayClinics}
          />
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add lib/pharmacy/context.ts "app/(public)/medical/pharmacy/[sigunguCode]/[id]/_components/pharmacy-neighborhood.tsx" "app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx" tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts
git commit -m "feat(pharmacy): 동네 속 이 약국 — 영업 연차·같은 동 개설 순서·도보권 일요일 진료

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 4: 병원 "같은 진료과, 이 동네에서"

**Files:**
- Create: `lib/hospital/context.ts`
- Create: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-same-dept.tsx`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
- Test: `tests/lib/pr6-context-pure.test.ts`, `tests/integration/pr6-context.test.ts`, `tests/components/pr6-cards-ssr.test.ts`(블록 추가)

**Interfaces:**
- Consumes: Task 3에서 시드한 병원 4곳
- Produces:
  ```ts
  export function primaryDept(name: string, deptNames: string[]): string | null; // 이름에 포함된 진료과 중 가장 긴 것
  export interface SameDeptNearby { dept: string; typeName: string; total: number; withHours: number; saturday: number; night: number }
  export async function getSameDeptNearby(
    h: { typeName: string }, dept: string, lat: number, lng: number, radius?: number,
  ): Promise<SameDeptNearby | null>; // 기본 1km. total(이곳 포함) < 2 → null
  export function HospitalSameDept(props: { data: SameDeptNearby }): JSX.Element;
  ```

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/lib/pr6-context-pure.test.ts`에 추가.

```ts
import { primaryDept } from '@/lib/hospital/context';

describe('primaryDept', () => {
  it('이름에 들어 있는 진료과를 대표 과로', () => {
    expect(primaryDept('밝은내과의원', ['내과', '가정의학과', '피부과'])).toBe('내과');
  });
  it('겹치는 이름은 가장 긴 일치(소아청소년과 > 청소년과)', () => {
    expect(primaryDept('우리소아청소년과의원', ['청소년과', '소아청소년과'])).toBe('소아청소년과');
  });
  it('공백 차이는 무시', () => {
    expect(primaryDept('서울 정형외과의원', ['정형 외과'])).toBe('정형 외과');
  });
  it('이름에 없으면 null', () => {
    expect(primaryDept('하나의원', ['내과', '피부과'])).toBeNull();
  });
});
```

`tests/integration/pr6-context.test.ts`: import에 `import { getSameDeptNearby } from '@/lib/hospital/context';`를 추가한다.

```ts
describe('getSameDeptNearby', () => {
  it('반경 1km 같은 진료과·같은 종별(이곳 포함), 진료시간 공개분 중 토요일·평일 20시 이후', async () => {
    expect(await getSameDeptNearby({ typeName: '의원' }, '내과', 33.0, 124.5)).toEqual({
      dept: '내과', typeName: '의원', total: 2, withHours: 2, saturday: 2, night: 1,
    });
  });
  it('혼자면 null', async () => {
    expect(await getSameDeptNearby({ typeName: '의원' }, '소아청소년과', 33.0, 124.5)).toBeNull();
  });
});
```

`tests/components/pr6-cards-ssr.test.ts`에 추가.

```ts
import { HospitalSameDept } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-same-dept';

describe('HospitalSameDept', () => {
  it('같은 과 수와 토요일·야간 진료, 그 기준 표기', () => {
    const html = renderToStaticMarkup(createElement(HospitalSameDept, { data: { dept: '내과', typeName: '의원', total: 6, withHours: 4, saturday: 4, night: 1 } }));
    expect(html).toContain('반경 1km 내과 의원');
    expect(html).toContain('6곳');
    expect(html).toContain('이곳 포함');
    expect(html).toContain('진료시간을 공개한 4곳 기준');
  });
  it('진료시간 공개분이 없으면 토요일·야간 타일을 숨긴다', () => {
    const html = renderToStaticMarkup(createElement(HospitalSameDept, { data: { dept: '내과', typeName: '의원', total: 3, withHours: 0, saturday: 0, night: 0 } }));
    expect(html).not.toContain('토요일');
    expect(html).not.toContain('20시');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module '@/lib/hospital/context'`

- [ ] **Step 3: 구현**

```ts
// lib/hospital/context.ts
// 병원 상세의 계산값: 반경 1km 같은 진료과·같은 종별 의료기관 수와, 그중 토요일·평일 야간 진료 수.
// 의원은 진료과가 평균 3.8개라 "대표 과"는 이름에 포함된 진료과로 정한다(의원의 약 69%). 없으면 카드 생략.
// 진료시간은 일부만 공개돼 있어 토요일·야간 수는 공개분(withHours) 기준으로 함께 보인다.
import { prisma } from '@/lib/db';

const strip = (s: string) => s.replace(/\s+/g, '');

export function primaryDept(name: string, deptNames: string[]): string | null {
  const n = strip(name);
  const hits = deptNames.filter((d) => d && n.includes(strip(d)));
  if (hits.length === 0) return null;
  return hits.sort((a, b) => strip(b).length - strip(a).length)[0];
}

export interface SameDeptNearby {
  dept: string;
  typeName: string;
  total: number;
  withHours: number;
  saturday: number;
  night: number;
}

export async function getSameDeptNearby(
  h: { typeName: string },
  dept: string,
  lat: number,
  lng: number,
  radius = 1000,
): Promise<SameDeptNearby | null> {
  const rows = await prisma.$queryRaw<{ total: number; with_hours: number; saturday: number; night: number }[]>`
    SELECT count(DISTINCT x.id)::int AS total,
           count(DISTINCT x.id) FILTER (WHERE d.id IS NOT NULL)::int AS with_hours,
           count(DISTINCT x.id) FILTER (
             WHERE d."openSat" BETWEEN 0 AND 2400 AND d."closeSat" BETWEEN 0 AND 2400 AND d."closeSat" > d."openSat"
           )::int AS saturday,
           count(DISTINCT x.id) FILTER (
             WHERE d."closeMon" BETWEEN 2000 AND 2400 OR d."closeTue" BETWEEN 2000 AND 2400
                OR d."closeWed" BETWEEN 2000 AND 2400 OR d."closeThu" BETWEEN 2000 AND 2400
                OR d."closeFri" BETWEEN 2000 AND 2400
           )::int AS night
    FROM "Hospital" x
    JOIN "HospitalDept" dp ON dp."hospitalId" = x.id AND dp."deptName" = ${dept}
    LEFT JOIN "HospitalDetail" d ON d."hospitalId" = x.id
    WHERE x."typeName" = ${h.typeName} AND x.location IS NOT NULL
      AND ST_DWithin(x.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
  `;
  const r = rows[0];
  if (!r || r.total < 2) return null;
  return { dept, typeName: h.typeName, total: r.total, withHours: r.with_hours, saturday: r.saturday, night: r.night };
}
```

```tsx
// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-same-dept.tsx
import { Card } from '@/components/ui/card';
import type { SameDeptNearby } from '@/lib/hospital/context';

export function HospitalSameDept({ data }: { data: SameDeptNearby }) {
  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: `반경 1km ${data.dept} ${data.typeName}`, value: `${data.total}곳`, sub: '이곳 포함' },
  ];
  if (data.withHours > 0) {
    tiles.push({ label: '그중 토요일 진료', value: `${data.saturday}곳` });
    tiles.push({ label: '그중 평일 20시 이후', value: `${data.night}곳` });
  }
  return (
    <Card id="same-dept">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">같은 진료과, 이 동네에서</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {data.withHours > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">토요일·야간 진료 수는 진료시간을 공개한 {data.withHours}곳 기준입니다.</p>
      )}
    </Card>
  );
}
```

`page.tsx`(병원): import 추가.

```tsx
import { primaryDept, getSameDeptNearby } from '@/lib/hospital/context';
import { HospitalSameDept } from './_components/hospital-same-dept';
```

`const coord = await cachedHospitalLatLng(hospitalId);` 다음에 추가한다. `hospital.depts`가 `getHospitalById`의 include에 없으면 이 줄을 쓰기 전에 include를 확인해 `{ deptName }`을 가져온다.

```tsx
  const dept = primaryDept(hospital.name, hospital.depts.map((d) => d.deptName));
  const sameDept = coord && dept ? await getSameDeptNearby(hospital, dept, coord.lat, coord.lng) : null;
```

`<HospitalTabs hospital={hospital} />` 다음 `<SourceCaption ids={['hira']} />` 바로 다음에 추가한다.

```tsx
          {sameDept && <HospitalSameDept data={sameDept} />}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts --no-file-parallelism && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add lib/hospital/context.ts "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-same-dept.tsx" "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx" tests/lib/pr6-context-pure.test.ts tests/integration/pr6-context.test.ts tests/components/pr6-cards-ssr.test.ts
git commit -m "feat(hospital): 같은 진료과 — 반경 1km 같은 과 수와 토요일·야간 진료

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 5: 스펙 반영과 전체 게이트

**Files:**
- Modify: `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` (7절 표)

- [ ] **Step 1: 스펙 7절 갱신**

7절 표에서 다음 4행을 취소선으로 바꾸고 "(주변 생활 인프라와 중복, 2026-10-02 제외)"를 붙인다: 병원 "처방 후 들를 약국", 약국 "최근접 약국", 공원 "반경 1km 공원 수", 주차장 "반경 500m 공영 수·면수". 약국 행에 "도보권 일요일 진료는 진료시간 공개분 기준 표기, 0은 숨김"을 추가한다.

- [ ] **Step 2: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`
Expected: lint 경고·오류 0, 단위 테스트 전부 PASS, build 성공

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/pr6-context.test.ts --no-file-parallelism`
Expected: PASS (CI는 integration 실패를 허용하므로 로컬 결과를 PR에 남긴다)

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md
git commit -m "docs(spec): PR 6 범위에서 주변 인프라와 겹치는 계산값 4개 제외

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

- [ ] **Step 4: push·PR·머지는 사용자 확인 후.** 수집 단계는 없다(기존 데이터만 사용). 배포 후 운영 페이지 4곳(공원·주차장·약국·병원 상세 각 1곳)을 한 번씩만 열어 카드를 확인한다(연속 요청 금지).
