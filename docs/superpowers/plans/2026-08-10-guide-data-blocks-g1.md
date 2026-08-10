# 가이드 데이터 블록 G-1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가이드 본문의 `[[data:<키>]]` 자리표시자를 실측 데이터 블록으로 치환하는 렌더 경로를 만들고, 레지스트리 집계 블록 4종과 작성일·편집자 표기를 붙인다.

**Architecture:** 순수 함수 `splitGuideBody()`가 본문을 마크다운 조각과 블록키로 쪼갠다. 서버 컴포넌트 `GuideBody`가 조각을 순서대로 렌더하며 블록키를 컴포넌트로 매핑한다. 각 블록은 자기 데이터를 Prisma `groupBy` 한 번으로 조회하는 서버 컴포넌트다. 가이드 페이지는 `revalidate = 86_400`이라 조회가 하루 1회로 묶인다.

**Tech Stack:** Next.js App Router(서버 컴포넌트), Prisma, react-markdown + remark-gfm, Vitest, Playwright

## Global Constraints

- 가이드 **본문 문장을 새로 쓰거나 재생성하지 않는다.** 이 계획은 렌더 경로와 블록만 만든다. 본문 수정은 G-3이다.
- 자리표시자가 없는 가이드 20편은 **현재와 완전히 동일하게 렌더**되어야 한다.
- 모든 블록 하단에 `SourceCaption`으로 출처를 단다 (`PRODUCT.md`: 모든 수치에 출처 표기).
- 블록이 데이터를 못 얻으면 `null`을 반환해 **그 자리만 비운다.** 본문은 그대로 읽혀야 한다.
- 한글 본문 14px 이상, 그림자는 `--shadow-soft` 하나 (`DESIGN.md`).
- 완료 판정 전 반드시: `pnpm lint` → `pnpm typecheck` → `pnpm test:unit` → `pnpm build` → `pnpm seed:e2e` → `pnpm test:e2e:local`.

## 스펙과 다르게 하는 것 (근거 포함)

| 스펙 | 계획 | 이유 |
|---|---|---|
| `hospital-by-type`에 일반병상 포함 | **개수·평균 의사수만** | 병상은 `HospitalFacility` 관계에 있어 `groupBy`로 집계할 수 없다. 관계 조인 집계는 단일 저비용 쿼리 원칙을 깬다 |
| `charger-mix`에 시도별 밀도 포함 | **급속·완속 분포 + 충전기 수만** | `EvCharger`에 `sido` 컬럼이 없다(주소 문자열뿐). 주소 파싱은 이 태스크 범위를 넘는다 |
| `childcare-by-type` 충원율 | **평균 정원 / 평균 현원**으로 표기 | 행별 중앙값은 raw SQL이 필요하다. 라벨을 "평균 정원 대비 평균 현원"으로 정확히 적어 오해를 막는다 |

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/guide/body-parts.ts` (신규) | 본문 → 조각 배열. **순수 함수, DB·React 없음** |
| `lib/guide/data-blocks.ts` (신규) | 블록키 목록과 타입 가드. 단일 진실 원천 |
| `lib/guide/blocks/hospital-by-type.ts` (신규) | 병원 종별 집계 쿼리 |
| `lib/guide/blocks/childcare-by-type.ts` (신규) | 어린이집 유형별 집계 쿼리 |
| `lib/guide/blocks/childcare-waitlist.ts` (신규) | 어린이집 대기자 상위 지역 쿼리 |
| `lib/guide/blocks/charger-mix.ts` (신규) | 충전소 급속·완속 집계 쿼리 |
| `app/(public)/guide/[slug]/_components/guide-body.tsx` (신규) | 조각 렌더 + 블록키 → 컴포넌트 매핑 |
| `app/(public)/guide/[slug]/_components/data-block.tsx` (신규) | 블록 4종의 서버 컴포넌트 + 공용 표 셸 |
| `app/(public)/guide/[slug]/page.tsx` (수정) | `GuideBody` 사용, 작성일·편집자 줄 추가 |
| `tests/lib/guide-body-parts.test.ts` (신규) | 분할 로직 |
| `tests/lib/guide-blocks.test.ts` (신규) | 집계 쿼리 4종 |
| `tests/e2e/guide-detail.spec.ts` (신규) | 블록 렌더·회귀 가드 |
| `tests/_helpers/seed-e2e.ts` (수정) | 자리표시자 있는 가이드 + 없는 가이드 시드 |

---

## Task 1: 본문 분할 순수 함수

**Files:**
- Create: `lib/guide/data-blocks.ts`
- Create: `lib/guide/body-parts.ts`
- Test: `tests/lib/guide-body-parts.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `GUIDE_DATA_BLOCK_KEYS`, `type GuideDataBlockKey`, `isGuideDataBlockKey(v: string): v is GuideDataBlockKey`, `type GuideBodyPart`, `splitGuideBody(rest: string): GuideBodyPart[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/lib/guide-body-parts.test.ts
import { describe, it, expect } from 'vitest';
import { splitGuideBody } from '@/lib/guide/body-parts';

describe('splitGuideBody', () => {
  it('표식이 없으면 마크다운 한 조각', () => {
    expect(splitGuideBody('## 제목\n본문입니다.')).toEqual([
      { kind: 'markdown', text: '## 제목\n본문입니다.' },
    ]);
  });

  it('표식을 기준으로 앞뒤를 나눈다', () => {
    expect(splitGuideBody('앞\n\n[[data:charger-mix]]\n\n뒤')).toEqual([
      { kind: 'markdown', text: '앞' },
      { kind: 'block', key: 'charger-mix' },
      { kind: 'markdown', text: '뒤' },
    ]);
  });

  it('표식이 여러 개면 순서를 보존한다', () => {
    const parts = splitGuideBody('A\n[[data:charger-mix]]\nB\n[[data:childcare-waitlist]]\nC');
    expect(parts.map((p) => (p.kind === 'block' ? p.key : p.text))).toEqual([
      'A', 'charger-mix', 'B', 'childcare-waitlist', 'C',
    ]);
  });

  it('모르는 블록키는 조용히 버린다 — 오타로 페이지가 깨지지 않게', () => {
    expect(splitGuideBody('앞\n[[data:nope]]\n뒤')).toEqual([
      { kind: 'markdown', text: '앞' },
      { kind: 'markdown', text: '뒤' },
    ]);
  });

  it('빈 마크다운 조각은 버린다', () => {
    expect(splitGuideBody('[[data:charger-mix]]')).toEqual([
      { kind: 'block', key: 'charger-mix' },
    ]);
  });

  it('코드블록 안의 표식은 치환하지 않는다', () => {
    const body = '설명\n\n```\n[[data:charger-mix]]\n```\n\n끝';
    const parts = splitGuideBody(body);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ kind: 'markdown', text: body });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run tests/lib/guide-body-parts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guide/body-parts'`

- [ ] **Step 3: 최소 구현을 쓴다**

```ts
// lib/guide/data-blocks.ts
/** 가이드 본문에 넣을 수 있는 데이터 블록 키. 여기가 단일 진실 원천이다. */
export const GUIDE_DATA_BLOCK_KEYS = [
  'hospital-by-type',
  'childcare-by-type',
  'childcare-waitlist',
  'charger-mix',
] as const;

export type GuideDataBlockKey = (typeof GUIDE_DATA_BLOCK_KEYS)[number];

export function isGuideDataBlockKey(v: string): v is GuideDataBlockKey {
  return (GUIDE_DATA_BLOCK_KEYS as readonly string[]).includes(v);
}
```

```ts
// lib/guide/body-parts.ts
import { isGuideDataBlockKey, type GuideDataBlockKey } from '@/lib/guide/data-blocks';

export type GuideBodyPart =
  | { kind: 'markdown'; text: string }
  | { kind: 'block'; key: GuideDataBlockKey };

/** 표식은 한 줄을 통째로 차지해야 한다. 코드펜스 안의 표식은 건드리지 않는다. */
const PLACEHOLDER = /^\[\[data:([a-z0-9-]+)\]\][ \t]*$/;
const FENCE = /^\s*(```|~~~)/;

/**
 * 가이드 본문(splitSummary 후의 rest)을 마크다운 조각과 블록으로 쪼갠다.
 * 표식이 없으면 조각 하나만 나오므로 기존 렌더 경로와 동일하다.
 */
export function splitGuideBody(rest: string): GuideBodyPart[] {
  const parts: GuideBodyPart[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) parts.push({ kind: 'markdown', text });
    buffer = [];
  };

  for (const line of rest.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = inFence ? null : PLACEHOLDER.exec(line);
    if (!m) {
      buffer.push(line);
      continue;
    }
    flush();
    if (isGuideDataBlockKey(m[1])) parts.push({ kind: 'block', key: m[1] });
  }
  flush();
  return parts;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm vitest run tests/lib/guide-body-parts.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/guide/data-blocks.ts lib/guide/body-parts.ts tests/lib/guide-body-parts.test.ts
git commit -m "feat(guide): 본문 자리표시자 분할 순수 함수"
```

---

## Task 2: 집계 쿼리 4종

**Files:**
- Create: `lib/guide/blocks/hospital-by-type.ts`
- Create: `lib/guide/blocks/childcare-by-type.ts`
- Create: `lib/guide/blocks/childcare-waitlist.ts`
- Create: `lib/guide/blocks/charger-mix.ts`
- Test: `tests/lib/guide-blocks.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`
- Produces:
  - `getHospitalByType(): Promise<{ typeName: string; count: number; avgDoctors: number | null }[]>`
  - `getChildcareByType(): Promise<{ crType: string; count: number; avgCapacity: number | null; avgCurrent: number | null }[]>`
  - `getChildcareWaitlist(): Promise<{ sido: string; sigungu: string; waitTotal: number; facilities: number }[]>`
  - `getChargerMix(): Promise<{ chargeSpeed: string; stations: number; chargers: number }[]>`
  - 네 함수 모두 데이터가 없으면 **빈 배열**을 반환한다(호출부가 `null` 판정)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// tests/lib/guide-blocks.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getHospitalByType } from '@/lib/guide/blocks/hospital-by-type';
import { getChildcareByType } from '@/lib/guide/blocks/childcare-by-type';
import { getChildcareWaitlist } from '@/lib/guide/blocks/childcare-waitlist';
import { getChargerMix } from '@/lib/guide/blocks/charger-mix';

const IDS = ['UT-GB-1', 'UT-GB-2'];

beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.childcare.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.evCharger.deleteMany({ where: { sourceId: { in: IDS } } });

  await prisma.hospital.createMany({
    data: [
      { sourceId: 'UT-GB-1', name: '유닛종합', typeCode: 'UT01', typeName: '유닛테스트종합병원', address: '서울 마포', totalDoctors: 100 },
      { sourceId: 'UT-GB-2', name: '유닛의원', typeCode: 'UT01', typeName: '유닛테스트종합병원', address: '서울 마포', totalDoctors: 50 },
    ],
  });
  await prisma.childcare.createMany({
    data: [
      { sourceId: 'UT-GB-1', name: '유닛어린이집1', crType: '유닛테스트유형', address: '서울 마포', sigunguCode: '11440', sido: '서울특별시', sigungu: '유닛구', capacity: 100, currentCount: 80, waitCntTot: 10 },
      { sourceId: 'UT-GB-2', name: '유닛어린이집2', crType: '유닛테스트유형', address: '서울 마포', sigunguCode: '11440', sido: '서울특별시', sigungu: '유닛구', capacity: 50, currentCount: 20, waitCntTot: 5 },
    ],
  });
  await prisma.evCharger.createMany({
    data: [
      { sourceId: 'UT-GB-1', name: '유닛충전1', address: '서울 마포', chargeSpeed: '유닛급속', chargerCount: 3 },
      { sourceId: 'UT-GB-2', name: '유닛충전2', address: '서울 마포', chargeSpeed: '유닛급속', chargerCount: 2 },
    ],
  });
});

afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.childcare.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.evCharger.deleteMany({ where: { sourceId: { in: IDS } } });
  await prisma.$disconnect();
});

describe('guide 데이터 블록 집계', () => {
  it('병원 종별: 개수와 평균 의사수', async () => {
    const row = (await getHospitalByType()).find((r) => r.typeName === '유닛테스트종합병원');
    expect(row).toMatchObject({ count: 2, avgDoctors: 75 });
  });

  it('어린이집 유형별: 개수와 평균 정원·현원', async () => {
    const row = (await getChildcareByType()).find((r) => r.crType === '유닛테스트유형');
    expect(row).toMatchObject({ count: 2, avgCapacity: 75, avgCurrent: 50 });
  });

  it('어린이집 대기자: 지역별 합계와 시설 수', async () => {
    const row = (await getChildcareWaitlist()).find((r) => r.sigungu === '유닛구');
    expect(row).toMatchObject({ sido: '서울특별시', waitTotal: 15, facilities: 2 });
  });

  it('충전소: 속도별 지점 수와 충전기 수', async () => {
    const row = (await getChargerMix()).find((r) => r.chargeSpeed === '유닛급속');
    expect(row).toMatchObject({ stations: 2, chargers: 5 });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run tests/lib/guide-blocks.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guide/blocks/hospital-by-type'`

- [ ] **Step 3: 네 쿼리를 구현한다**

```ts
// lib/guide/blocks/hospital-by-type.ts
import { prisma } from '@/lib/db';

export interface HospitalTypeRow { typeName: string; count: number; avgDoctors: number | null }

/** 병원 종별 개수·평균 의사수. 일반병상은 HospitalFacility 관계라 groupBy로 못 담는다(계획 §스펙 차이). */
export async function getHospitalByType(): Promise<HospitalTypeRow[]> {
  const rows = await prisma.hospital.groupBy({
    by: ['typeName'],
    _count: { _all: true },
    _avg: { totalDoctors: true },
    orderBy: { _count: { typeName: 'desc' } },
  });
  return rows.map((r) => ({
    typeName: r.typeName,
    count: r._count._all,
    avgDoctors: r._avg.totalDoctors == null ? null : Math.round(r._avg.totalDoctors),
  }));
}
```

```ts
// lib/guide/blocks/childcare-by-type.ts
import { prisma } from '@/lib/db';

export interface ChildcareTypeRow {
  crType: string; count: number; avgCapacity: number | null; avgCurrent: number | null;
}

/** 어린이집 유형별 개수·평균 정원·평균 현원. 운영중(정상·재개)만 센다. */
export async function getChildcareByType(): Promise<ChildcareTypeRow[]> {
  const rows = await prisma.childcare.groupBy({
    by: ['crType'],
    where: { OR: [{ status: { in: ['정상', '재개'] } }, { status: null }] },
    _count: { _all: true },
    _avg: { capacity: true, currentCount: true },
    orderBy: { _count: { crType: 'desc' } },
  });
  return rows
    .filter((r): r is typeof r & { crType: string } => r.crType !== null)
    .map((r) => ({
      crType: r.crType,
      count: r._count._all,
      avgCapacity: r._avg.capacity == null ? null : Math.round(r._avg.capacity),
      avgCurrent: r._avg.currentCount == null ? null : Math.round(r._avg.currentCount),
    }));
}
```

```ts
// lib/guide/blocks/childcare-waitlist.ts
import { prisma } from '@/lib/db';

export interface ChildcareWaitRow {
  sido: string; sigungu: string; waitTotal: number; facilities: number;
}

/** 대기자가 있는 시군구 상위 10곳. sido·sigungu는 Childcare 자체 컬럼이라 조인이 없다. */
export async function getChildcareWaitlist(): Promise<ChildcareWaitRow[]> {
  const rows = await prisma.childcare.groupBy({
    by: ['sido', 'sigungu'],
    where: {
      waitCntTot: { gt: 0 },
      sido: { not: null },
      sigungu: { not: null },
      OR: [{ status: { in: ['정상', '재개'] } }, { status: null }],
    },
    _sum: { waitCntTot: true },
    _count: { _all: true },
    orderBy: { _sum: { waitCntTot: 'desc' } },
    take: 10,
  });
  return rows.map((r) => ({
    sido: r.sido as string,
    sigungu: r.sigungu as string,
    waitTotal: r._sum.waitCntTot ?? 0,
    facilities: r._count._all,
  }));
}
```

```ts
// lib/guide/blocks/charger-mix.ts
import { prisma } from '@/lib/db';

export interface ChargerMixRow { chargeSpeed: string; stations: number; chargers: number }

/** 충전 속도별 지점 수·충전기 수. EvCharger에 sido 컬럼이 없어 지역 분해는 하지 않는다(계획 §스펙 차이). */
export async function getChargerMix(): Promise<ChargerMixRow[]> {
  const rows = await prisma.evCharger.groupBy({
    by: ['chargeSpeed'],
    _count: { _all: true },
    _sum: { chargerCount: true },
    orderBy: { _count: { chargeSpeed: 'desc' } },
  });
  return rows.map((r) => ({
    chargeSpeed: r.chargeSpeed,
    stations: r._count._all,
    chargers: r._sum.chargerCount ?? 0,
  }));
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm dotenv -e .env.test -- pnpm vitest run tests/lib/guide-blocks.test.ts`
Expected: PASS (4 tests)

> 이 테스트는 DB를 쓴다. `tests/lib/urban-parking-adapter.test.ts`와 같은 방식(고유 `sourceId` 시드 후 정리)이라 앰비언트 데이터에 의존하지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add lib/guide/blocks tests/lib/guide-blocks.test.ts
git commit -m "feat(guide): 데이터 블록 집계 쿼리 4종"
```

---

## Task 3: 블록 컴포넌트와 렌더 경로

**Files:**
- Create: `app/(public)/guide/[slug]/_components/data-block.tsx`
- Create: `app/(public)/guide/[slug]/_components/guide-body.tsx`
- Modify: `app/(public)/guide/[slug]/page.tsx`

**Interfaces:**
- Consumes: `splitGuideBody`, `GuideDataBlockKey`, 집계 함수 4종
- Produces: `<GuideBody body={rest} />` — 가이드 상세가 마크다운 렌더 대신 쓰는 서버 컴포넌트

- [ ] **Step 1: 공용 표 셸과 블록 4종을 만든다**

```tsx
// app/(public)/guide/[slug]/_components/data-block.tsx
import { SourceCaption } from '@/components/ui/source-caption';
import type { DataSourceId } from '@/lib/data-sources';
import { getHospitalByType } from '@/lib/guide/blocks/hospital-by-type';
import { getChildcareByType } from '@/lib/guide/blocks/childcare-by-type';
import { getChildcareWaitlist } from '@/lib/guide/blocks/childcare-waitlist';
import { getChargerMix } from '@/lib/guide/blocks/charger-mix';

/** 블록 공용 셸. 제목·표·출처 캡션을 한 형태로 묶는다. */
function BlockShell({
  title, note, sources, headers, rows,
}: {
  title: string;
  note: string;
  sources: DataSourceId[];
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="my-8 rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{note}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={`py-2 text-xs font-bold text-[var(--color-muted)] ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-[var(--color-line)] last:border-b-0">
                {r.map((c, i) => (
                  <td key={i} className={`py-2 text-[var(--color-text)] ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {typeof c === 'number' ? c.toLocaleString('ko-KR') : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceCaption ids={sources} />
    </section>
  );
}

async function HospitalByType() {
  const rows = await getHospitalByType().catch(() => []);
  if (rows.length === 0) return null;
  return (
    <BlockShell
      title="종별 병원 수와 평균 의사 수"
      note="임장ON이 수집한 전국 의료기관 자료를 종별로 집계한 값입니다."
      sources={['hira']}
      headers={['종별', '기관 수', '평균 의사 수']}
      rows={rows.map((r) => [r.typeName, r.count, r.avgDoctors ?? '-'])}
    />
  );
}

async function ChildcareByType() {
  const rows = await getChildcareByType().catch(() => []);
  if (rows.length === 0) return null;
  return (
    <BlockShell
      title="유형별 어린이집 수와 정원"
      note="운영 중인 어린이집만 집계했습니다. 정원·현원은 유형별 평균입니다."
      sources={['childcare']}
      headers={['유형', '어린이집 수', '평균 정원', '평균 현원']}
      rows={rows.map((r) => [r.crType, r.count, r.avgCapacity ?? '-', r.avgCurrent ?? '-'])}
    />
  );
}

async function ChildcareWaitlist() {
  const rows = await getChildcareWaitlist().catch(() => []);
  if (rows.length === 0) return null;
  return (
    <BlockShell
      title="대기 인원이 많은 지역"
      note="대기자가 등록된 어린이집이 있는 시군구 상위 10곳입니다."
      sources={['childcare']}
      headers={['지역', '대기 인원', '해당 어린이집 수']}
      rows={rows.map((r) => [`${r.sido} ${r.sigungu}`, r.waitTotal, r.facilities])}
    />
  );
}

async function ChargerMix() {
  const rows = await getChargerMix().catch(() => []);
  if (rows.length === 0) return null;
  return (
    <BlockShell
      title="충전 속도별 충전소 분포"
      note="지점 수와 각 지점에 설치된 충전기 수를 속도별로 집계했습니다."
      sources={['kepco-ev']}
      headers={['충전 속도', '지점 수', '충전기 수']}
      rows={rows.map((r) => [r.chargeSpeed, r.stations, r.chargers])}
    />
  );
}

export const GUIDE_DATA_BLOCK_COMPONENTS = {
  'hospital-by-type': HospitalByType,
  'childcare-by-type': ChildcareByType,
  'childcare-waitlist': ChildcareWaitlist,
  'charger-mix': ChargerMix,
} as const;
```

- [ ] **Step 2: 렌더 경로를 만든다**

```tsx
// app/(public)/guide/[slug]/_components/guide-body.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitGuideBody } from '@/lib/guide/body-parts';
import { GUIDE_DATA_BLOCK_COMPONENTS } from './data-block';

/**
 * 가이드 본문을 렌더한다. `[[data:<키>]]` 표식이 있으면 그 자리에 데이터 블록을 끼운다.
 * 표식이 없으면 조각이 하나뿐이라 기존 렌더와 동일하다.
 */
export function GuideBody({ body }: { body: string }) {
  const parts = splitGuideBody(body);
  return (
    <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
      {parts.map((part, i) => {
        if (part.kind === 'markdown') {
          return (
            <ReactMarkdown key={i} remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>
              {part.text}
            </ReactMarkdown>
          );
        }
        const Block = GUIDE_DATA_BLOCK_COMPONENTS[part.key];
        return <Block key={i} />;
      })}
    </div>
  );
}
```

- [ ] **Step 3: 상세 페이지를 바꾼다**

`app/(public)/guide/[slug]/page.tsx`에서 마크다운 `<div>`를 `GuideBody`로 교체한다.

```tsx
// 삭제
<div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
  <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{rest}</ReactMarkdown>
</div>

// 추가
<GuideBody body={rest} />
```

import를 정리한다: `GuideBody`를 추가하고, `ReactMarkdown`·`remarkGfm`이 이 파일에서 더 쓰이지 않으면 **import를 지운다**(ESLint `no-unused-vars`가 CI를 막는다).

- [ ] **Step 4: 검증**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 전부 통과, ESLint 경고 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/guide/[slug]"
git commit -m "feat(guide): 데이터 블록 렌더 경로 + 블록 컴포넌트 4종"
```

---

## Task 4: 작성일·편집자 표기

**Files:**
- Modify: `app/(public)/guide/[slug]/page.tsx`

**Interfaces:**
- Consumes: `EDITORIAL` from `@/lib/editorial`, 기존 `published` 변수(`page.tsx:46`)
- Produces: 없음(UI 전용)

- [ ] **Step 1: 표기를 추가한다**

`published`는 이미 `YYYY-MM-DD`로 계산돼 JSON-LD에만 쓰이고 있다. 화면에 올린다.

```tsx
// 기존
<p className="mt-2 text-sm text-[var(--color-muted)]">임장ON 가이드 · {guideCategoryLabel(guide.category)}</p>

// 교체
<p className="mt-2 text-sm text-[var(--color-muted)]">
  임장ON 가이드 · {guideCategoryLabel(guide.category)}
</p>
<p className="mt-1 text-sm text-[var(--color-muted)]">
  <time dateTime={published}>{published.replace(/-/g, '.')}</time> · 편집 {EDITORIAL.name}
</p>
```

`import { EDITORIAL } from '@/lib/editorial';`를 추가한다.

> "작성"이 아니라 **"편집"**이다. PR #277이 JSON-LD `author`를 `Organization`으로 바꿨고, 본문이 언어모델 초안 + 운영자 검수라는 사실과 어긋나면 안 된다.

- [ ] **Step 2: 검증**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/guide/[slug]/page.tsx"
git commit -m "feat(guide): 상세에 작성일·편집자 표기"
```

---

## Task 5: e2e 시드와 회귀 가드

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts`
- Create: `tests/e2e/guide-detail.spec.ts`

**Interfaces:**
- Consumes: `GuideCategory`, `PostStatus` from `@prisma/client`
- Produces: 시드 가이드 두 편 — `ut-guide-with-block`(표식 있음), `ut-guide-plain`(표식 없음)

- [ ] **Step 1: 시드를 추가한다**

`tests/_helpers/seed-e2e.ts`의 시드 함수 안에 넣는다. 기존 시드가 쓰는 `prisma` 인스턴스를 그대로 쓴다.

```ts
await prisma.guide.deleteMany({ where: { slug: { in: ['ut-guide-with-block', 'ut-guide-plain'] } } });
await prisma.guide.createMany({
  data: [
    {
      slug: 'ut-guide-with-block',
      title: '유닛테스트 블록 가이드',
      summary: '데이터 블록이 들어간 가이드',
      body: '## 핵심 요약\n- 요약\n\n## 충전 방식\n설명 문장입니다.\n\n[[data:charger-mix]]\n\n## 마무리\n끝.',
      category: GuideCategory.LIFE,
      status: PostStatus.PUBLISHED,
      sourceName: '유닛테스트', sourceUrl: 'https://example.com',
      sourceDate: new Date('2026-01-01'), sourceExcerpt: '테스트',
      dedupeKey: 'ut-guide-with-block',
      publishedAt: new Date('2026-06-29'),
    },
    {
      slug: 'ut-guide-plain',
      title: '유닛테스트 일반 가이드',
      summary: '표식이 없는 가이드',
      body: '## 핵심 요약\n- 요약\n\n## 본문\n설명만 있습니다.',
      category: GuideCategory.LIFE,
      status: PostStatus.PUBLISHED,
      sourceName: '유닛테스트', sourceUrl: 'https://example.com',
      sourceDate: new Date('2026-01-01'), sourceExcerpt: '테스트',
      dedupeKey: 'ut-guide-plain',
      publishedAt: new Date('2026-06-29'),
    },
  ],
});
```

`charger-mix` 블록이 렌더되려면 `EvCharger` 행이 필요하다. 시드에 없으면 추가한다.

```ts
await prisma.evCharger.deleteMany({ where: { sourceId: 'UT-E2E-CHG' } });
await prisma.evCharger.create({
  data: { sourceId: 'UT-E2E-CHG', name: 'e2e 충전소', address: '서울특별시 마포구', chargeSpeed: '급속', chargerCount: 2 },
});
```

- [ ] **Step 2: e2e 스펙을 쓴다**

```ts
// tests/e2e/guide-detail.spec.ts
import { test, expect } from '@playwright/test';

test('표식이 있는 가이드: 데이터 블록이 렌더되고 출처가 붙는다', async ({ page }) => {
  await page.goto('/guide/ut-guide-with-block');
  await expect(page.getByRole('heading', { name: '충전 속도별 충전소 분포' })).toBeVisible();
  await expect(page.getByText('출처:').first()).toBeVisible();
  // 표식 원문이 화면에 새어 나오면 안 된다
  await expect(page.getByText('[[data:')).toHaveCount(0);
});

test('표식이 없는 가이드: 기존과 동일하게 렌더된다 (회귀 가드)', async ({ page }) => {
  await page.goto('/guide/ut-guide-plain');
  await expect(page.getByRole('heading', { level: 1, name: '유닛테스트 일반 가이드' })).toBeVisible();
  await expect(page.getByText('설명만 있습니다.')).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
});

test('작성일과 편집자가 노출된다', async ({ page }) => {
  await page.goto('/guide/ut-guide-plain');
  await expect(page.getByText('2026.06.29')).toBeVisible();
  await expect(page.getByText('편집 임장ON 편집자')).toBeVisible();
});
```

- [ ] **Step 3: 실행**

```bash
pnpm seed:e2e
pnpm test:e2e:local tests/e2e/guide-detail.spec.ts
```
Expected: 3 tests PASS (데스크톱·모바일 프로젝트 각각)

- [ ] **Step 4: 전체 검증**

```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm test:e2e:local
```
Expected: 전부 통과. e2e 실행 전 `pnpm seed:e2e` 필수.

- [ ] **Step 5: 커밋**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/guide-detail.spec.ts
git commit -m "test(guide): 데이터 블록 e2e + 비대상 가이드 회귀 가드"
```

---

## Task 6: PR 올리기

- [ ] **Step 1: 푸시하고 PR을 만든다**

```bash
git push -u origin feat/guide-data-blocks
```

PR 본문에 담을 것:
- 이 PR은 **렌더 경로와 블록만** 만든다. 본문에 표식이 없으므로 **운영 가이드 28편의 화면은 변하지 않는다**(작성일·편집자 줄 제외)
- 표식 삽입은 G-3이며, 렌더가 배포된 뒤여야 한다 — 순서를 뒤집으면 표식 원문이 날것으로 노출된다
- 스펙 대비 축소 3건(§스펙 차이 표)과 근거
- 검증 결과 전량

---

## Self-Review

**스펙 커버리지 (G-1 범위)**

| 스펙 항목 | 태스크 |
|---|---|
| §3.1 본문 분할 렌더 | Task 1, 3 |
| §3.2 가벼운 블록 = 렌더 시 조회 | Task 2 |
| §4.1 블록 4종 | Task 2, 3 |
| §6 작성일·편집자 UI | Task 4 |
| §7 오류 처리(블록 실패 시 자리만 비움 / 미지 키 무시) | Task 1 Step 3, Task 3 Step 1 |
| §8 테스트(분할·집계·회귀 가드) | Task 1, 2, 5 |

**G-1 범위 밖(별도 계획):** §3.3 스냅샷, §4.2 무거운 블록 5종, §5 본문 수정 스크립트.

**타입 일관성 확인:** `GuideDataBlockKey`가 Task 1에서 정의되고 Task 3의 `GUIDE_DATA_BLOCK_COMPONENTS` 키와 일치한다. 집계 함수 4종의 반환 타입이 Task 2에서 정의되고 Task 3의 `rows.map`에서 그 필드만 쓴다.
