# 메인 주간 청약 보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인화면 생활권 섹션 위에 이번 주(월~일) 청약 일정을 가로 스크롤 없이 보여주는 보드를 추가하고, 각 청약을 누르면 `/subscription/[id]` 상세로 이동시킨다.

**Architecture:** 순수 함수(주 범위 계산·anchor 배치·톤 결정·지역 파싱·보드 조립)를 `lib/subscription.ts`에 추가하고 단위 테스트로 검증한다(기존 `deriveStatus`/`ddayLabel` 패턴 그대로). DB 접근은 얇은 `$queryRaw` 함수 하나로 감싸고, UI는 서버 컴포넌트 2개(`WeeklySubscriptionBoard` + `SubscriptionBoardItem`)로 구성한다. 모바일=7행 타임라인, 데스크탑=7열 그리드를 Tailwind 반응형으로 전환한다.

**Tech Stack:** Next.js(App Router, 서버 컴포넌트), Prisma `$queryRaw`, Vitest, Tailwind(CSS 변수 토큰), 기존 `Badge` 컴포넌트(`tone: blue|green|gray|orange`).

---

## File Structure

- `lib/subscription.ts` (수정) — 타입 + 순수 함수 `getWeekRange`, `boardTone`, `parseSigungu`, `assembleWeeklyBoard` + DB 함수 `getWeeklySubscriptions` 추가. 기존 export는 건드리지 않는다.
- `tests/lib/subscription.test.ts` (수정) — 순수 함수 4종 테스트 추가.
- `app/(public)/_components/subscription-board-item.tsx` (생성) — 청약 1건 링크.
- `app/(public)/_components/weekly-subscription-board.tsx` (생성) — 요약 헤더 + 데스크탑 그리드 + 모바일 타임라인 + 빈 상태.
- `app/(public)/page.tsx` (수정) — `getWeeklySubscriptions()` 호출 + 생활권 섹션 위에 보드 삽입.

## 공유 타입 (Task 1에서 `lib/subscription.ts`에 정의)

```ts
export type BoardTone = 'green' | 'blue' | 'gray' | 'orange';

export interface WeeklyNoticeRow {
  id: bigint;
  name: string;
  regionName: string | null;
  address: string | null;
  receiptBegin: Date | null;
  receiptEnd: Date | null;
}

export interface WeeklyBoardItem {
  id: string;          // /subscription/[id] 링크용 (String(id))
  name: string;
  regionShort: string | null;
  tone: BoardTone;
  badge: string;       // '진행중' | '예정' | '마감' | 'D-1' | '오늘 마감'
}

export interface WeeklyBoardDay {
  date: Date;
  weekday: string;     // '월'..'일'
  isToday: boolean;
  items: WeeklyBoardItem[]; // 최대 3건
  overflow: number;    // 3 초과 건수, 없으면 0
}

export interface WeeklyBoard {
  weekStart: Date;
  weekEnd: Date;
  days: WeeklyBoardDay[]; // 항상 7개 (월~일)
  summary: { open: number; upcoming: number; closed: number };
  total: number;
}
```

---

## Task 1: 주 범위 계산 순수 함수 `getWeekRange`

**Files:**
- Modify: `lib/subscription.ts` (파일 끝에 추가)
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/subscription.test.ts` 맨 아래에 추가. 상단 import에 `getWeekRange`를 추가한다(`const D = ...` 헬퍼는 파일에 이미 있음).

```ts
import { getWeekRange } from '@/lib/subscription';

describe('getWeekRange (월~일 UTC)', () => {
  it('주중(금요일) 기준 월요일~일요일 7일을 만든다', () => {
    const r = getWeekRange(D('2026-06-05')); // 금
    expect(r.weekStart).toEqual(D('2026-06-01'));
    expect(r.weekEnd).toEqual(D('2026-06-07'));
    expect(r.dates).toHaveLength(7);
    expect(r.dates[0]).toEqual(D('2026-06-01'));
    expect(r.dates[6]).toEqual(D('2026-06-07'));
  });
  it('일요일은 같은 주의 끝으로 본다', () => {
    const r = getWeekRange(D('2026-06-07')); // 일
    expect(r.weekStart).toEqual(D('2026-06-01'));
    expect(r.weekEnd).toEqual(D('2026-06-07'));
  });
  it('월요일은 주의 시작이다', () => {
    const r = getWeekRange(D('2026-06-01')); // 월
    expect(r.weekStart).toEqual(D('2026-06-01'));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t getWeekRange`
Expected: FAIL — `getWeekRange is not a function` (또는 import 에러)

- [ ] **Step 3: 최소 구현 추가**

`lib/subscription.ts` 끝에 추가. 위 "공유 타입" 블록의 타입들도 이 시점에 같이 추가한다.

```ts
export interface WeekRange {
  weekStart: Date;
  weekEnd: Date;
  dates: Date[]; // 7개, 월~일, 각 UTC 자정
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function getWeekRange(today: Date): WeekRange {
  const base = utcMidnight(today);
  const offsetToMonday = (base.getUTCDay() + 6) % 7; // 0=일 → 6, 1=월 → 0
  const weekStart = new Date(base);
  weekStart.setUTCDate(base.getUTCDate() - offsetToMonday);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    return d;
  });
  return { weekStart: dates[0], weekEnd: dates[6], dates };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t getWeekRange`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): add getWeekRange 순수 함수"
```

---

## Task 2: 보드 배지/톤 결정 `boardTone`

**Files:**
- Modify: `lib/subscription.ts`
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `boardTone` 추가 후:

```ts
import { boardTone } from '@/lib/subscription';

describe('boardTone', () => {
  it('예정은 파랑 + 예정', () => {
    expect(boardTone({ status: 'UPCOMING', dday: 3 })).toEqual({ tone: 'blue', badge: '예정' });
  });
  it('접수중 D-day 2 이상은 초록 + 진행중', () => {
    expect(boardTone({ status: 'OPEN', dday: 4 })).toEqual({ tone: 'green', badge: '진행중' });
  });
  it('접수중 D-1은 주황 + D-1', () => {
    expect(boardTone({ status: 'OPEN', dday: 1 })).toEqual({ tone: 'orange', badge: 'D-1' });
  });
  it('접수중 오늘 마감은 주황 + 오늘 마감', () => {
    expect(boardTone({ status: 'OPEN', dday: 0 })).toEqual({ tone: 'orange', badge: '오늘 마감' });
  });
  it('마감은 회색 + 마감', () => {
    expect(boardTone({ status: 'CLOSED', dday: null })).toEqual({ tone: 'gray', badge: '마감' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t boardTone`
Expected: FAIL — `boardTone is not a function`

- [ ] **Step 3: 최소 구현 추가**

`lib/subscription.ts`에 추가. 기존 `DerivedStatus`, `ddayLabel`을 재사용한다.

```ts
export function boardTone(st: DerivedStatus): { tone: BoardTone; badge: string } {
  if (st.status === 'UPCOMING') return { tone: 'blue', badge: '예정' };
  if (st.status === 'CLOSED') return { tone: 'gray', badge: '마감' };
  // OPEN
  if (st.dday != null && st.dday <= 1) {
    return { tone: 'orange', badge: ddayLabel(st) ?? '진행중' };
  }
  return { tone: 'green', badge: '진행중' };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t boardTone`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): add boardTone 배지/톤 결정"
```

---

## Task 3: 지역 축약 파싱 `parseSigungu`

**Files:**
- Modify: `lib/subscription.ts`
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `parseSigungu` 추가 후:

```ts
import { parseSigungu } from '@/lib/subscription';

describe('parseSigungu', () => {
  it('구가 있으면 구를 반환한다', () => {
    expect(parseSigungu('서울특별시 마포구 합정동 1-2', '서울')).toBe('마포구');
  });
  it('군이 있으면 군을 반환한다', () => {
    expect(parseSigungu('경기도 양평군 양평읍', '경기')).toBe('양평군');
  });
  it('구·군이 없으면 시를 반환한다', () => {
    expect(parseSigungu('경기도 부천시 원미구 ', '경기')).toBe('원미구'); // 구 우선
    expect(parseSigungu('경기도 부천시', '경기')).toBe('부천시');
  });
  it('주소가 없으면 regionName 폴백', () => {
    expect(parseSigungu(null, '서울')).toBe('서울');
  });
  it('둘 다 없으면 null', () => {
    expect(parseSigungu(null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t parseSigungu`
Expected: FAIL — `parseSigungu is not a function`

- [ ] **Step 3: 최소 구현 추가**

```ts
export function parseSigungu(address: string | null, regionName: string | null): string | null {
  if (address) {
    const tokens = address.match(/[가-힣]+[시군구]/g) ?? [];
    const guGun = tokens.find((t) => t.endsWith('구') || t.endsWith('군'));
    if (guGun) return guGun;
    const si = tokens.find((t) => t.endsWith('시'));
    if (si) return si;
  }
  return regionName ?? null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t parseSigungu`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): add parseSigungu 지역 축약 파싱"
```

---

## Task 4: 보드 조립 `assembleWeeklyBoard`

**Files:**
- Modify: `lib/subscription.ts`
- Test: `tests/lib/subscription.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `assembleWeeklyBoard`, `WeeklyNoticeRow` 추가 후:

```ts
import { assembleWeeklyBoard, type WeeklyNoticeRow } from '@/lib/subscription';

const row = (o: Partial<WeeklyNoticeRow> & { id: bigint; name: string }): WeeklyNoticeRow => ({
  regionName: '서울', address: '서울특별시 마포구 합정동',
  receiptBegin: null, receiptEnd: null, ...o,
});

describe('assembleWeeklyBoard', () => {
  const today = D('2026-06-06'); // 토

  it('항상 7일(월~일)을 만들고 오늘을 표시한다', () => {
    const b = assembleWeeklyBoard([], today);
    expect(b.days).toHaveLength(7);
    expect(b.days[0].weekday).toBe('월');
    expect(b.days[6].weekday).toBe('일');
    expect(b.days.find((d) => d.isToday)?.date).toEqual(D('2026-06-06'));
    expect(b.total).toBe(0);
    expect(b.summary).toEqual({ open: 0, upcoming: 0, closed: 0 });
  });

  it('예정은 접수 시작일에, 마감/진행은 마감일에 배치한다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: '부천 센트럴포레', receiptBegin: D('2026-06-08'), receiptEnd: D('2026-06-10') }), // 예정(주 밖이라도 begin 클램프)
      row({ id: 2n, name: '강동 리버파크', receiptBegin: D('2026-05-20'), receiptEnd: D('2026-06-02') }),   // 마감(화)
      row({ id: 3n, name: '마포 더하이츠', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }),   // 진행(주 내 마감일 없음 → weekEnd 클램프)
    ], today);
    const tue = b.days.find((d) => d.weekday === '화')!;
    expect(tue.items.map((i) => i.name)).toContain('강동 리버파크');
    expect(tue.items[0].badge).toBe('마감');
  });

  it('상태별 summary를 집계한다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: 'A', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }), // OPEN
      row({ id: 2n, name: 'B', receiptBegin: D('2026-06-08'), receiptEnd: D('2026-06-10') }), // UPCOMING
      row({ id: 3n, name: 'C', receiptBegin: D('2026-05-20'), receiptEnd: D('2026-06-02') }), // CLOSED
    ], today);
    expect(b.summary).toEqual({ open: 1, upcoming: 1, closed: 1 });
    expect(b.total).toBe(3);
  });

  it('하루 4건이면 3건 + overflow 1', () => {
    const sameDay = { receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-04') }; // 마감일=목
    const b = assembleWeeklyBoard([
      row({ id: 1n, name: 'A', ...sameDay }), row({ id: 2n, name: 'B', ...sameDay }),
      row({ id: 3n, name: 'C', ...sameDay }), row({ id: 4n, name: 'D', ...sameDay }),
    ], today);
    const thu = b.days.find((d) => d.weekday === '목')!;
    expect(thu.items).toHaveLength(3);
    expect(thu.overflow).toBe(1);
  });

  it('아이템에 링크용 id와 지역 축약을 담는다', () => {
    const b = assembleWeeklyBoard([
      row({ id: 7n, name: '마포 더하이츠', receiptBegin: D('2026-06-01'), receiptEnd: D('2026-06-09') }),
    ], today);
    const item = b.days.flatMap((d) => d.items).find((i) => i.name === '마포 더하이츠')!;
    expect(item.id).toBe('7');
    expect(item.regionShort).toBe('마포구');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t assembleWeeklyBoard`
Expected: FAIL — `assembleWeeklyBoard is not a function`

- [ ] **Step 3: 최소 구현 추가**

```ts
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const TONE_ORDER: Record<BoardTone, number> = { orange: 0, green: 1, blue: 2, gray: 3 };

function clampToWeek(d: Date, weekStart: Date, weekEnd: Date): Date {
  if (dateInt(d) < dateInt(weekStart)) return weekStart;
  if (dateInt(d) > dateInt(weekEnd)) return weekEnd;
  return d;
}

export function assembleWeeklyBoard(rows: WeeklyNoticeRow[], today: Date = new Date()): WeeklyBoard {
  const { weekStart, weekEnd, dates } = getWeekRange(today);
  const buckets: WeeklyBoardItem[][] = dates.map(() => []);
  const summary = { open: 0, upcoming: 0, closed: 0 };

  for (const r of rows) {
    const st = deriveStatus(r.receiptBegin, r.receiptEnd, today);
    if (st.status === 'OPEN') summary.open++;
    else if (st.status === 'UPCOMING') summary.upcoming++;
    else summary.closed++;

    const anchorRaw = st.status === 'UPCOMING' ? r.receiptBegin : (r.receiptEnd ?? r.receiptBegin);
    if (!anchorRaw) continue;
    const anchor = clampToWeek(anchorRaw, weekStart, weekEnd);
    const idx = dates.findIndex((d) => dateInt(d) === dateInt(anchor));
    if (idx < 0) continue;

    const { tone, badge } = boardTone(st);
    buckets[idx].push({
      id: String(r.id),
      name: r.name,
      regionShort: parseSigungu(r.address, r.regionName),
      tone,
      badge,
    });
  }

  const days: WeeklyBoardDay[] = dates.map((date, i) => {
    const sorted = buckets[i].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
    return {
      date,
      weekday: WEEKDAYS[i],
      isToday: dateInt(date) === dateInt(today),
      items: sorted.slice(0, 3),
      overflow: Math.max(0, sorted.length - 3),
    };
  });

  return { weekStart, weekEnd, days, summary, total: rows.length };
}
```

> 참고: `dateInt`, `deriveStatus`는 `lib/subscription.ts`에 이미 존재한다. `dateInt`가 파일 위쪽에 선언되어 있으므로 그대로 호출 가능.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/lib/subscription.test.ts -t assembleWeeklyBoard`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts tests/lib/subscription.test.ts
git commit -m "feat(subscription): add assembleWeeklyBoard 보드 조립"
```

---

## Task 5: DB 조회 `getWeeklySubscriptions`

**Files:**
- Modify: `lib/subscription.ts`

> DB 직접 호출 함수는 기존 `getSubscriptionList` 등과 동일하게 단위 테스트 대상이 아니다(통합/수동 검증). 타입 검사와 빌드로 검증한다.

- [ ] **Step 1: 구현 추가**

`lib/subscription.ts`에 추가. 이번 주와 겹치는 공고만 가져온다(접수 시작 또는 마감이 주 범위 내).

```ts
export async function getWeeklySubscriptions(today: Date = new Date()): Promise<WeeklyBoard> {
  const { weekStart, weekEnd } = getWeekRange(today);
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint; name: string; region_name: string | null; address: string | null;
      receipt_begin: Date | null; receipt_end: Date | null;
    }>
  >(Prisma.sql`
    SELECT n.id, n.name,
           n."regionName" AS region_name,
           n.address AS address,
           n."receiptBegin" AS receipt_begin,
           n."receiptEnd" AS receipt_end
    FROM "SubscriptionNotice" n
    WHERE (n."receiptBegin" BETWEEN ${weekStart} AND ${weekEnd})
       OR (n."receiptEnd"   BETWEEN ${weekStart} AND ${weekEnd})
    ORDER BY n."receiptEnd" ASC NULLS LAST, n.id ASC
  `);

  const mapped: WeeklyNoticeRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    regionName: r.region_name,
    address: r.address,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
  }));

  return assembleWeeklyBoard(mapped, today);
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(0 errors)

- [ ] **Step 3: 커밋**

```bash
git add lib/subscription.ts
git commit -m "feat(subscription): add getWeeklySubscriptions DB 조회"
```

---

## Task 6: 청약 1건 링크 컴포넌트 `SubscriptionBoardItem`

**Files:**
- Create: `app/(public)/_components/subscription-board-item.tsx`

- [ ] **Step 1: 구현 작성**

기존 `Badge`(tone: blue|green|gray|orange)를 재사용한다.

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { WeeklyBoardItem } from '@/lib/subscription';

export function SubscriptionBoardItem({ item }: { item: WeeklyBoardItem }) {
  return (
    <Link
      href={`/subscription/${item.id}`}
      className="group flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-2.5 py-2 transition hover:border-[var(--color-blue)]"
    >
      <Badge tone={item.tone} className="shrink-0">{item.badge}</Badge>
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-blue-dark)]">
        {item.name}
      </span>
      {item.regionShort && (
        <span className="shrink-0 text-xs font-medium text-[var(--color-muted)]">
          {item.regionShort}
        </span>
      )}
      <span className="shrink-0 text-[var(--color-muted)] transition group-hover:translate-x-0.5">›</span>
    </Link>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/_components/subscription-board-item.tsx"
git commit -m "feat(home): add SubscriptionBoardItem 청약 링크 컴포넌트"
```

---

## Task 7: 주간 보드 컴포넌트 `WeeklySubscriptionBoard`

**Files:**
- Create: `app/(public)/_components/weekly-subscription-board.tsx`

- [ ] **Step 1: 구현 작성**

요약 헤더(가시성 강조) + 모바일 7행 타임라인(`md:hidden`) + 데스크탑 7열 그리드(`hidden md:grid`) + 빈 상태.

```tsx
import Link from 'next/link';
import type { WeeklyBoard, WeeklyBoardDay } from '@/lib/subscription';
import { SubscriptionBoardItem } from './subscription-board-item';

function formatMd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function SummaryHeader({ board }: { board: WeeklyBoard }) {
  const cards = [
    { n: board.summary.open, label: '진행중', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    { n: board.summary.upcoming, label: '예정', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
    { n: board.summary.closed, label: '마감', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  ];
  return (
    <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-2xl px-3 py-3 ring-1 ${c.cls}`}>
          <strong className="block text-2xl font-black leading-none">{c.n}</strong>
          <span className="mt-1.5 flex items-center gap-1 text-xs font-bold">
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayItems({ day }: { day: WeeklyBoardDay }) {
  if (day.items.length === 0) {
    return <p className="text-xs font-medium text-slate-300">청약 일정 없음</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {day.items.map((item) => (
        <SubscriptionBoardItem key={item.id} item={item} />
      ))}
      {day.overflow > 0 && (
        <Link href="/subscription" className="text-xs font-bold text-[var(--color-blue)]">
          +{day.overflow}건 더보기
        </Link>
      )}
    </div>
  );
}

export function WeeklySubscriptionBoard({ board }: { board: WeeklyBoard }) {
  return (
    <section className="mt-10">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">📅 이번주 청약</p>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
            이번 주 청약을 한눈에
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            {formatMd(board.weekStart)} – {formatMd(board.weekEnd)} · 진행중·예정·마감 일정
          </p>
        </div>
        <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
          전체 보기 →
        </Link>
      </div>

      <SummaryHeader board={board} />

      {board.total === 0 ? (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--color-muted)]">이번 주 등록된 청약이 없습니다.</p>
          <Link href="/subscription" className="mt-2 inline-block text-sm font-bold text-[var(--color-blue)]">
            전체 청약 일정 보기 →
          </Link>
        </div>
      ) : (
        <>
          {/* 모바일: 7행 타임라인 */}
          <div className="flex flex-col gap-2 md:hidden">
            {board.days.map((day) => (
              <div
                key={day.weekday}
                className={`flex gap-3 rounded-2xl border bg-white px-3 py-2.5 ${
                  day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
                }`}
              >
                <div className="w-10 shrink-0">
                  <strong className="block text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
                  <span className="block text-[10px] font-medium text-[var(--color-muted)]">{formatMd(day.date)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <DayItems day={day} />
                </div>
              </div>
            ))}
          </div>

          {/* 데스크탑: 7열 그리드 */}
          <div className="hidden grid-cols-7 gap-2.5 md:grid">
            {board.days.map((day) => (
              <div
                key={day.weekday}
                className={`flex min-h-[150px] flex-col rounded-2xl border bg-white p-3 ${
                  day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
                }`}
              >
                <div className="mb-2.5 border-b border-[var(--color-line)] pb-2">
                  <strong className="block text-sm font-black text-[var(--color-blue-dark)]">
                    {day.weekday} {formatMd(day.date)}
                  </strong>
                  {day.isToday && <span className="text-[10px] font-bold text-[var(--color-blue)]">오늘</span>}
                </div>
                <div className="flex-1">
                  <DayItems day={day} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 타입 검사**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/_components/weekly-subscription-board.tsx"
git commit -m "feat(home): add WeeklySubscriptionBoard 주간 청약 보드"
```

---

## Task 8: 메인 페이지에 보드 연결

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: import 추가**

`app/(public)/page.tsx` 상단 import 블록에 두 줄 추가한다.

```ts
import { WeeklySubscriptionBoard } from './_components/weekly-subscription-board';
import { getWeeklySubscriptions } from '@/lib/subscription';
```

- [ ] **Step 2: 데이터 패칭 + 렌더 추가**

`Promise.all` 배열과 구조분해에 `weeklyBoard`를 추가하고, `<AmenityHub />` **위**에 보드를 삽입한다. 변경 후 함수는 다음과 같다.

```tsx
export default async function HomePage() {
  const [sidoList, stats, briefing, popularRegions, weeklyBoard] = await Promise.all([
    getSidoList(),
    getHomeStats(),
    getMarketBriefing(),
    getPopularSigungus(),
    getWeeklySubscriptions(),
  ]);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <HeroSection popularRegions={popularRegions} />
      <StatsBar stats={stats} />

      <div className="mt-10 flex flex-col gap-6 md:flex-row md:items-stretch">
        <div id="search-filter" className="min-w-0 flex-1 scroll-mt-24">
          <MainSearchFilter sidoList={sidoList} />
        </div>
        <aside className="w-full md:w-[380px] md:shrink-0">
          <TypeHub />
        </aside>
      </div>

      <MarketBriefing briefing={briefing} />

      <WeeklySubscriptionBoard board={weeklyBoard} />

      <AmenityHub />
    </section>
  );
}
```

- [ ] **Step 3: 타입 검사 + 단위 테스트**

Run: `pnpm exec tsc --noEmit && pnpm test:unit`
Expected: 타입 에러 없음, 모든 테스트 PASS(신규 18개 포함)

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/page.tsx"
git commit -m "feat(home): 메인에 주간 청약 보드 삽입"
```

---

## Task 9: 최종 검증

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm test:unit`
Expected: 전체 PASS

- [ ] **Step 2: 프로덕션 빌드**

Run: `pnpm build`
Expected: 빌드 성공, `app/(public)/page` 컴파일 에러 없음

- [ ] **Step 3: 로컬 육안 확인(선택)**

Run: `pnpm dev` 후 `http://localhost:3000` 접속
확인: 생활권 섹션 위에 주간 청약 보드 노출, 모바일 폭에서 가로 스크롤 없이 7행 타임라인, 데스크탑에서 7열 그리드, 청약 클릭 시 `/subscription/[id]` 이동.

---

## Self-Review 체크 결과

- **스펙 커버리지:** 위치(Task 8)·모바일 타임라인/데스크탑 그리드(Task 7)·요약 강조(Task 7 SummaryHeader)·`getWeeklySubscriptions`/`deriveStatus` 재사용(Task 4·5)·anchor 배치(Task 4)·하루 다건 +N(Task 4·7)·빈 상태(Task 7)·상세 링크(Task 6)·ISR(기존 `revalidate=3600` 유지, 변경 불필요) 모두 태스크에 매핑됨.
- **플레이스홀더:** 없음(모든 코드/명령/기대값 명시).
- **타입 일관성:** `WeeklyBoard`/`WeeklyBoardItem`/`WeeklyNoticeRow`/`BoardTone`는 Task 1에서 정의, Task 4~8에서 동일 시그니처로 사용. `boardTone`은 `DerivedStatus`를 받고 `{tone,badge}`를 반환(Task 2·4 일치). `Badge` tone 값(blue/green/gray/orange)은 `BoardTone`과 정확히 일치.
