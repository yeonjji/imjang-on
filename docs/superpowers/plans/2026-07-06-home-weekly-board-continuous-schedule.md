# 홈 청약 보드 연속 일정 표기 + 더보기 제자리 펼침 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 "청약 일정을 한눈에" 보드가 공고를 활성 구간 전체에 연속 표기하고, 각 날짜를 그날 기준 배지로 보여주며, 더보기가 페이지 이동 없이 제자리에서 펼쳐지게 한다.

**Architecture:** 순수 함수 `buildWeekModel`이 공고 행을 웹(간트 막대)·모바일(일자별 반복 카드)이 공유하는 단일 `WeekModel`로 변환한다. 서버 컴포넌트(`weekly-subscription-board.tsx`)는 헤더·요약·출처만 렌더하고, 두 개의 `'use client'` 하위 컴포넌트(간트/모바일)가 `useState`로 펼침 상태만 관리한다. 기존 `getWeeklySubscriptions`/`WeeklyBoard`/`flattenWeeklyBoard`(jeonse-guarantee·loan-discovery가 사용)는 건드리지 않고 새 함수를 병렬 추가한다.

**Tech Stack:** Next.js(App Router, RSC), TypeScript, Prisma(`$queryRaw`), Vitest(node env, `renderToStaticMarkup` SSR 테스트), Tailwind CSS.

## Global Constraints

- 기존 공개 API 유지: `getWeeklySubscriptions`, `assembleWeeklyBoard`, `flattenWeeklyBoard`, `WeeklyBoard`, `WeeklyBoardItem`, `WeeklyBoardDay`는 **시그니처·동작 변경 금지**(jeonse-guarantee·loan-discovery 소비자 있음).
- 날짜 계산은 전부 UTC 자정 기준(`dateInt`/`dayDiff` 재사용). 클라이언트에는 **Date 객체를 넘기지 않는다** — 표시 문자열(weekday·md·badge)은 서버에서 계산.
- 색은 정보 전달용, 그림자는 `--shadow-soft` 하나, 한글 본문 14px 이상 (CLAUDE.md Design Context).
- 완료 전 `pnpm exec tsc --noEmit`와 `pnpm lint` 통과 필수 (미사용 변수는 lint에서 error).
- 테스트 파일은 기존 관습을 따른다: lib 순수 함수는 `tests/lib/*.test.ts`, 컴포넌트는 `tests/components/*-ssr.test.ts`(`renderToStaticMarkup` + React 전역 shim).

---

### Task 1: `dayBadge` + `WeekModel` 타입 + `buildWeekModel` (순수 함수)

**Files:**
- Modify: `lib/subscription.ts` (기존 `flattenWeeklyBoard` 아래, 약 `:388` 뒤에 추가)
- Test: `tests/lib/subscription-week-model.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 모듈 내부 헬퍼 `dateInt`, `dayDiff`(모듈 private), `getWeekRange`, `deriveStatus`, `boardTone`, `ddayLabel`, `parseSigungu`, 상수 `WEEKDAYS`, `TONE_ORDER`, 타입 `BoardTone`, `WeeklyBoardItem`, `WeeklyNoticeRow`.
- Produces:
  ```ts
  export interface WeekBar {
    id: string; name: string; regionShort: string | null;
    startIdx: number; endIdx: number;          // 0~6, 주간 클램프
    startsBeforeWeek: boolean; endsAfterWeek: boolean;
    tone: BoardTone;                            // 오늘 기준 상태색
    todayDdayLabel: string | null;             // 오늘 기준 마감칩
  }
  export interface WeekModelDay {
    weekday: string; md: string; isToday: boolean; items: WeeklyBoardItem[];
  }
  export interface WeekModel {
    summary: { open: number; upcoming: number; closed: number };
    total: number; days: WeekModelDay[]; bars: WeekBar[];
  }
  export function dayBadge(begin: Date | null, end: Date | null, cell: Date, today: Date): { tone: BoardTone; badge: string };
  export function buildWeekModel(rows: WeeklyNoticeRow[], today?: Date): WeekModel;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/subscription-week-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dayBadge, buildWeekModel } from '@/lib/subscription';
import type { WeeklyNoticeRow } from '@/lib/subscription';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const today = D('2026-07-06'); // 주간 07-03 ~ 07-09, 오늘 index 3

const row = (o: Partial<WeeklyNoticeRow> & { id: bigint; name: string }): WeeklyNoticeRow => ({
  regionName: '서울', address: '서울특별시 마포구 합정동',
  receiptBegin: null, receiptEnd: null, ...o,
});

describe('dayBadge (그날 기준)', () => {
  it('시작 전 셀은 예정', () => {
    expect(dayBadge(D('2026-07-08'), D('2026-07-10'), D('2026-07-07'), today))
      .toEqual({ tone: 'blue', badge: '예정' });
  });
  it('시작일 셀은 접수시작', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-03'), today))
      .toEqual({ tone: 'green', badge: '접수시작' });
  });
  it('중간 셀은 그날 기준 D-day (D-2는 초록, D-1은 주황)', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-04'), today))
      .toEqual({ tone: 'green', badge: 'D-2' });
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-05'), today))
      .toEqual({ tone: 'orange', badge: 'D-1' });
  });
  it('마감일이 오늘이면 오늘 마감', () => {
    expect(dayBadge(D('2026-07-03'), D('2026-07-06'), D('2026-07-06'), today))
      .toEqual({ tone: 'orange', badge: '오늘 마감' });
  });
  it('마감일이 미래면 마감일, 과거면 마감', () => {
    expect(dayBadge(null, D('2026-07-08'), D('2026-07-08'), today))
      .toEqual({ tone: 'orange', badge: '마감일' });
    expect(dayBadge(D('2026-07-01'), D('2026-07-04'), D('2026-07-04'), today))
      .toEqual({ tone: 'gray', badge: '마감' });
  });
});

describe('buildWeekModel', () => {
  it('진행중 공고를 활성 구간 매일 셀에 그날 배지로 넣는다 (신제주 시나리오)', () => {
    const m = buildWeekModel(
      [row({ id: 1n, name: '신제주', receiptBegin: D('2026-07-03'), receiptEnd: D('2026-07-06') })],
      today,
    );
    // days[0]=07-03 ... days[3]=07-06(오늘)
    const badgeOn = (i: number) => m.days[i].items.find((x) => x.name === '신제주')?.badge;
    expect(badgeOn(0)).toBe('접수시작'); // 07-03
    expect(badgeOn(1)).toBe('D-2');       // 07-04
    expect(badgeOn(2)).toBe('D-1');       // 07-05
    expect(badgeOn(3)).toBe('오늘 마감');  // 07-06
    expect(m.days[4].items).toHaveLength(0); // 07-07엔 없음
  });

  it('막대(bar)는 시작~마감 컬럼과 오늘 기준 마감칩을 담는다 (당산역: 마감 07-08)', () => {
    const m = buildWeekModel(
      [row({ id: 2n, name: '당산역', receiptBegin: D('2026-07-01'), receiptEnd: D('2026-07-08') })],
      today,
    );
    const bar = m.bars.find((b) => b.name === '당산역')!;
    expect(bar.startIdx).toBe(0);            // 07-03 (주 시작으로 클램프)
    expect(bar.endIdx).toBe(5);              // 07-08
    expect(bar.startsBeforeWeek).toBe(true); // 07-01 시작
    expect(bar.endsAfterWeek).toBe(false);
    expect(bar.tone).toBe('green');          // 오늘 기준 진행중
    expect(bar.todayDdayLabel).toBe('D-2');  // 오늘(07-06)→07-08
    // 오늘 셀(07-06=index3) 배지는 D-2
    expect(m.days[3].items.find((x) => x.name === '당산역')?.badge).toBe('D-2');
  });

  it('주 전체를 관통하는 공고는 7일 모두에 나타나고 양끝 화살표 플래그가 켜진다', () => {
    const m = buildWeekModel(
      [row({ id: 3n, name: '롱런', receiptBegin: D('2026-06-20'), receiptEnd: D('2026-07-20') })],
      today,
    );
    const bar = m.bars.find((b) => b.name === '롱런')!;
    expect([bar.startIdx, bar.endIdx]).toEqual([0, 6]);
    expect(bar.startsBeforeWeek && bar.endsAfterWeek).toBe(true);
    expect(m.days.every((d) => d.items.some((x) => x.name === '롱런'))).toBe(true);
  });

  it('오늘 기준 마감된 공고는 활성 구간 전체를 회색 마감으로 표기한다', () => {
    const m = buildWeekModel(
      [row({ id: 4n, name: '지난공고', receiptBegin: D('2026-07-03'), receiptEnd: D('2026-07-04') })],
      today,
    );
    const items = m.days.flatMap((d) => d.items).filter((x) => x.name === '지난공고');
    expect(items).toHaveLength(2); // 07-03, 07-04
    expect(items.every((x) => x.tone === 'gray' && x.badge === '마감')).toBe(true);
    expect(m.summary.closed).toBe(1);
  });

  it('summary와 total, days 문자열 필드를 채운다', () => {
    const m = buildWeekModel([], today);
    expect(m.days).toHaveLength(7);
    expect(m.days[3]).toMatchObject({ isToday: true, md: '07.06', weekday: '월' });
    expect(m.days[0].isToday).toBe(false);
    expect(m.summary).toEqual({ open: 0, upcoming: 0, closed: 0 });
    expect(m.total).toBe(0);
    expect(m.bars).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/subscription-week-model.test.ts`
Expected: FAIL — `dayBadge`/`buildWeekModel` are not exported (import error).

- [ ] **Step 3: Write minimal implementation**

In `lib/subscription.ts`, after `flattenWeeklyBoard` (around `:388`), add:

```ts
// ---- 홈 주간 모델 (연속 표기) ----
export interface WeekBar {
  id: string;
  name: string;
  regionShort: string | null;
  startIdx: number;
  endIdx: number;
  startsBeforeWeek: boolean;
  endsAfterWeek: boolean;
  tone: BoardTone;
  todayDdayLabel: string | null;
}

export interface WeekModelDay {
  weekday: string;
  md: string;
  isToday: boolean;
  items: WeeklyBoardItem[];
}

export interface WeekModel {
  summary: { open: number; upcoming: number; closed: number };
  total: number;
  days: WeekModelDay[];
  bars: WeekBar[];
}

function mmdd(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 특정 셀 날짜 기준의 배지/톤. 셀은 활성 구간 [begin..end] 안에 있다고 가정. */
export function dayBadge(
  begin: Date | null,
  end: Date | null,
  cell: Date,
  today: Date,
): { tone: BoardTone; badge: string } {
  const b = begin ? dateInt(begin) : null;
  const e = end ? dateInt(end) : null;
  const c = dateInt(cell);
  const t = dateInt(today);

  if (b != null && c < b) return { tone: 'blue', badge: '예정' };
  if (b != null && c === b && (e == null || c < e)) return { tone: 'green', badge: '접수시작' };
  if (e != null && c === e) {
    if (c === t) return { tone: 'orange', badge: '오늘 마감' };
    return c < t ? { tone: 'gray', badge: '마감' } : { tone: 'orange', badge: '마감일' };
  }
  if (e != null) {
    const d = dayDiff(cell, end!);
    return d === 1 ? { tone: 'orange', badge: 'D-1' } : { tone: 'green', badge: `D-${d}` };
  }
  return { tone: 'green', badge: '진행중' };
}

export function buildWeekModel(rows: WeeklyNoticeRow[], today: Date = new Date()): WeekModel {
  const { dates } = getWeekRange(today);
  const ws = dateInt(dates[0]);
  const we = dateInt(dates[6]);
  const buckets: WeeklyBoardItem[][] = dates.map(() => []);
  const bars: WeekBar[] = [];
  const summary = { open: 0, upcoming: 0, closed: 0 };

  for (const r of rows) {
    const st = deriveStatus(r.receiptBegin, r.receiptEnd, today);
    if (st.status === 'OPEN') summary.open++;
    else if (st.status === 'UPCOMING') summary.upcoming++;
    else summary.closed++;

    const spanBegin = r.receiptBegin ?? r.receiptEnd;
    const spanEnd = r.receiptEnd ?? r.receiptBegin;
    if (!spanBegin || !spanEnd) continue;

    const bi = dateInt(spanBegin);
    const ei = dateInt(spanEnd);
    if (ei < ws || bi > we) continue; // 주간과 겹치지 않음(방어)

    const startIdx = dates.findIndex((d) => dateInt(d) === Math.max(bi, ws));
    const endIdx = dates.findIndex((d) => dateInt(d) === Math.min(ei, we));

    const regionShort = parseSigungu(r.address, r.regionName);
    const { tone: barTone } = boardTone(st);
    bars.push({
      id: String(r.id),
      name: r.name,
      regionShort,
      startIdx,
      endIdx,
      startsBeforeWeek: bi < ws,
      endsAfterWeek: ei > we,
      tone: barTone,
      todayDdayLabel: ddayLabel(st),
    });

    for (let i = startIdx; i <= endIdx; i++) {
      const cell =
        st.status === 'CLOSED'
          ? ({ tone: 'gray', badge: '마감' } as const)
          : dayBadge(r.receiptBegin, r.receiptEnd, dates[i], today);
      buckets[i].push({ id: String(r.id), name: r.name, regionShort, tone: cell.tone, badge: cell.badge });
    }
  }

  bars.sort(
    (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.endIdx - b.endIdx || a.name.localeCompare(b.name, 'ko'),
  );

  const days: WeekModelDay[] = dates.map((date, i) => ({
    weekday: WEEKDAYS[date.getUTCDay()],
    md: mmdd(date),
    isToday: dateInt(date) === dateInt(today),
    items: buckets[i].sort(
      (a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.name.localeCompare(b.name, 'ko'),
    ),
  }));

  return { summary, total: rows.length, days, bars };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/subscription-week-model.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/subscription.ts tests/lib/subscription-week-model.test.ts
git commit -m "feat(subscription): 홈 주간 모델(연속 구간·그날 기준 배지) 순수 함수 추가"
```

---

### Task 2: `getHomeWeekBoard` 조회 함수 (구간 겹침 쿼리)

**Files:**
- Modify: `lib/subscription.ts` (`getWeeklySubscriptions` 아래, 약 `:419` 뒤)

**Interfaces:**
- Consumes: `getWeekRange`, `buildWeekModel`(Task 1), `prisma`, `Prisma`.
- Produces: `export async function getHomeWeekBoard(today?: Date): Promise<WeekModel>`

이 함수는 DB 의존이라 기존 `getWeeklySubscriptions`와 동일하게 자동화 단위테스트 없이 타입체크·다운스트림 렌더로 검증한다. 기존 함수의 잠재적 누락 버그(주 관통 공고 미포함)는 그대로 두고(jeonse-guarantee·loan-discovery 영향 회피), 신규 함수에서만 구간 겹침 조건을 쓴다.

- [ ] **Step 1: Add the fetch function**

In `lib/subscription.ts`, immediately after `getWeeklySubscriptions` (ends `:419`), add:

```ts
export async function getHomeWeekBoard(today: Date = new Date()): Promise<WeekModel> {
  const { weekStart, weekEnd } = getWeekRange(today);
  // 구간 겹침: 시작이 주 끝 이전 && 마감이 주 시작 이후 → 주 전체를 관통하는 긴 공고도 포함.
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
    WHERE COALESCE(n."receiptBegin", n."receiptEnd") <= ${weekEnd}
      AND COALESCE(n."receiptEnd", n."receiptBegin") >= ${weekStart}
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

  return buildWeekModel(mapped, today);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors referencing `lib/subscription.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/subscription.ts
git commit -m "feat(subscription): getHomeWeekBoard 조회(구간 겹침 쿼리) 추가"
```

---

### Task 3: 웹 간트 클라이언트 컴포넌트

**Files:**
- Create: `app/(public)/_components/weekly-board-gantt.tsx`
- Test: `tests/components/weekly-board-gantt-ssr.test.ts` (신규)

**Interfaces:**
- Consumes: `WeekModel['days']`(weekday·md·isToday), `WeekBar`(Task 1). `cn` from `@/lib/cn`.
- Produces: `export function WeeklyBoardGantt(props: { days: WeekModelDay[]; bars: WeekBar[]; initialVisible?: number }): JSX.Element`

- [ ] **Step 1: Write the failing SSR test**

Create `tests/components/weekly-board-gantt-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoardGantt } from '@/app/(public)/_components/weekly-board-gantt';
import type { WeekModelDay, WeekBar } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const days: WeekModelDay[] = Array.from({ length: 7 }, (_, i) => ({
  weekday: '월화수목금토일'[i], md: `07.0${i + 3}`, isToday: i === 3, items: [],
}));
const bar = (o: Partial<WeekBar> & { id: string; name: string }): WeekBar => ({
  regionShort: null, startIdx: 0, endIdx: 3, startsBeforeWeek: false, endsAfterWeek: false,
  tone: 'green', todayDdayLabel: 'D-2', ...o,
});

describe('WeeklyBoardGantt SSR', () => {
  it('상위 N행만 초기 렌더하고 나머지는 더보기 버튼 개수로 노출', () => {
    const bars = Array.from({ length: 8 }, (_, i) => bar({ id: String(i), name: `공고${i}` }));
    const html = renderToStaticMarkup(createElement(WeeklyBoardGantt, { days, bars, initialVisible: 6 }));
    expect(html).toContain('공고0');
    expect(html).toContain('공고5');
    expect(html).not.toContain('공고6'); // 접힘 상태
    expect(html).toContain('+2건 더보기');
  });
  it('막대에 공고명과 오늘 기준 마감칩을 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(WeeklyBoardGantt, { days, bars: [bar({ id: '1', name: '신제주' })] }),
    );
    expect(html).toContain('신제주');
    expect(html).toContain('D-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/weekly-board-gantt-ssr.test.ts`
Expected: FAIL — module `weekly-board-gantt` not found.

- [ ] **Step 3: Write the component**

Create `app/(public)/_components/weekly-board-gantt.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { WeekModelDay, WeekBar } from '@/lib/subscription';

const BAR_TONE: Record<WeekBar['tone'], string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  blue: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)] ring-sky-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function WeeklyBoardGantt({
  days,
  bars,
  initialVisible = 6,
}: {
  days: WeekModelDay[];
  bars: WeekBar[];
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, bars.length - initialVisible);
  const visible = expanded ? bars : bars.slice(0, initialVisible);

  return (
    <div className="hidden md:block">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-px border-b border-[var(--color-line)] pb-2">
        {days.map((d, i) => (
          <div key={i} className="flex items-center gap-1 px-1 text-xs font-bold text-[var(--color-blue-dark)]">
            <span>{d.weekday}</span>
            <span className="font-medium text-[var(--color-muted)]">{d.md}</span>
            {d.isToday && (
              <span className="rounded-full bg-[var(--color-blue-dark)] px-1 py-0.5 text-[10px] font-black leading-none text-white">
                오늘
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 막대 영역 (오늘 컬럼 하이라이트 배경 + 막대 행) */}
      <div className="relative pt-2">
        <div className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-px">
          {days.map((d, i) => (
            <div key={i} className={d.isToday ? 'rounded-md bg-[var(--color-soft)]' : ''} />
          ))}
        </div>

        <div className="relative flex flex-col gap-1.5">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm font-medium text-[var(--color-muted)]">청약 일정 없음</p>
          )}
          {visible.map((bar) => (
            <div key={bar.id} className="grid grid-cols-7 gap-px">
              <Link
                href={`/subscription/${bar.id}`}
                style={{ gridColumn: `${bar.startIdx + 1} / ${bar.endIdx + 2}` }}
                className={cn(
                  'flex min-w-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold ring-1 transition hover:brightness-95',
                  BAR_TONE[bar.tone],
                )}
              >
                {bar.startsBeforeWeek && <span className="shrink-0 opacity-60">◀</span>}
                <span className="min-w-0 flex-1 truncate">{bar.name}</span>
                {bar.todayDdayLabel && (
                  <span className="shrink-0 rounded bg-white/70 px-1 text-[11px] font-black leading-tight">
                    {bar.todayDdayLabel}
                  </span>
                )}
                {bar.endsAfterWeek && <span className="shrink-0 opacity-60">▶</span>}
              </Link>
            </div>
          ))}
        </div>
      </div>

      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold text-[var(--color-blue)]"
        >
          {expanded ? '접기 ↑' : `+${overflow}건 더보기 ↓`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/weekly-board-gantt-ssr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/_components/weekly-board-gantt.tsx tests/components/weekly-board-gantt-ssr.test.ts
git commit -m "feat(home): 청약 주간 간트 클라이언트 컴포넌트(제자리 더보기)"
```

---

### Task 4: 모바일 반복 카드 클라이언트 컴포넌트

**Files:**
- Create: `app/(public)/_components/weekly-board-mobile.tsx`
- Test: `tests/components/weekly-board-mobile-ssr.test.ts` (신규)

**Interfaces:**
- Consumes: `WeekModelDay`(Task 1), `SubscriptionBoardItem` from `./subscription-board-item`.
- Produces: `export function WeeklyBoardMobile(props: { days: WeekModelDay[]; perDay?: number }): JSX.Element`

- [ ] **Step 1: Write the failing SSR test**

Create `tests/components/weekly-board-mobile-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeeklyBoardMobile } from '@/app/(public)/_components/weekly-board-mobile';
import type { WeekModelDay, WeeklyBoardItem } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const item = (id: string): WeeklyBoardItem => ({
  id, name: `공고${id}`, regionShort: '마포구', tone: 'green', badge: 'D-2',
});
const day = (o: Partial<WeekModelDay> & { items: WeeklyBoardItem[] }): WeekModelDay => ({
  weekday: '월', md: '07.06', isToday: true, ...o,
});

describe('WeeklyBoardMobile SSR', () => {
  it('날짜별 상위 N개만 초기 렌더하고 초과분은 더보기 개수로 노출', () => {
    const days: WeekModelDay[] = [day({ items: ['1', '2', '3', '4', '5'].map(item) })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardMobile, { days, perDay: 3 }));
    expect(html).toContain('공고1');
    expect(html).toContain('공고3');
    expect(html).not.toContain('공고4');
    expect(html).toContain('+2건 더보기');
  });
  it('빈 날짜는 일정 없음 안내', () => {
    const days: WeekModelDay[] = [day({ items: [] })];
    const html = renderToStaticMarkup(createElement(WeeklyBoardMobile, { days, perDay: 3 }));
    expect(html).toContain('청약 일정 없음');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/weekly-board-mobile-ssr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `app/(public)/_components/weekly-board-mobile.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { SubscriptionBoardItem } from './subscription-board-item';
import type { WeekModelDay } from '@/lib/subscription';

function DayRow({ day, perDay }: { day: WeekModelDay; perDay: number }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, day.items.length - perDay);
  const visible = expanded ? day.items : day.items.slice(0, perDay);

  return (
    <div
      className={`flex gap-3 rounded-2xl border bg-white px-3 py-2.5 ${
        day.isToday ? 'border-[var(--color-blue)] bg-[var(--color-soft)]' : 'border-[var(--color-line)]'
      }`}
    >
      <div className="w-12 shrink-0">
        <strong className="block text-sm font-black text-[var(--color-blue-dark)]">{day.weekday}</strong>
        <span className="block text-xs font-medium text-[var(--color-muted)]">{day.md}</span>
        {day.isToday && (
          <span className="mt-1 inline-block rounded-full bg-[var(--color-blue-dark)] px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            TODAY
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {day.items.length === 0 ? (
          <p className="text-xs font-medium text-slate-300">청약 일정 없음</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {visible.map((item) => (
              <SubscriptionBoardItem key={item.id} item={item} />
            ))}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-left text-xs font-bold text-[var(--color-blue)]"
              >
                {expanded ? '접기 ↑' : `+${overflow}건 더보기 ↓`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeeklyBoardMobile({ days, perDay = 3 }: { days: WeekModelDay[]; perDay?: number }) {
  return (
    <div className="flex flex-col gap-2 md:hidden">
      {days.map((day, i) => (
        <DayRow key={i} day={day} perDay={perDay} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/components/weekly-board-mobile-ssr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/_components/weekly-board-mobile.tsx tests/components/weekly-board-mobile-ssr.test.ts
git commit -m "feat(home): 청약 주간 모바일 반복카드 컴포넌트(날짜별 제자리 더보기)"
```

---

### Task 5: 서버 보드 재작성 + 홈 페이지 배선

**Files:**
- Modify: `app/(public)/_components/weekly-subscription-board.tsx` (전면 교체)
- Modify: `app/(public)/page.tsx` (`:9` import, `:42-49` 호출, `:60` props)

**Interfaces:**
- Consumes: `WeekModel`(Task 1), `getHomeWeekBoard`(Task 2), `WeeklyBoardGantt`(Task 3), `WeeklyBoardMobile`(Task 4), 기존 `SourceCaption`.
- Produces: `WeeklySubscriptionBoard`가 `{ board: WeekModel }`를 받도록 변경.

- [ ] **Step 1: Rewrite the server board component**

Replace the entire contents of `app/(public)/_components/weekly-subscription-board.tsx`:

```tsx
import Link from 'next/link';
import type { WeekModel } from '@/lib/subscription';
import { WeeklyBoardGantt } from './weekly-board-gantt';
import { WeeklyBoardMobile } from './weekly-board-mobile';
import { SourceCaption } from '@/components/ui/source-caption';

function SummaryHeader({ summary }: { summary: WeekModel['summary'] }) {
  const cards = [
    { n: summary.open, label: '진행중', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
    { n: summary.upcoming, label: '예정', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
    { n: summary.closed, label: '마감', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  ];
  return (
    <div className="flex gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 ring-1 ${c.cls}`}>
          <strong className="text-lg font-black leading-none">{c.n}</strong>
          <span className="flex items-center gap-1 text-xs font-bold">
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeeklySubscriptionBoard({ board }: { board: WeekModel }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="mb-1 text-xl font-bold tracking-tight text-[var(--color-blue-dark)]">
            청약 일정을 한눈에
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            오늘 기준 전후 3일 · 진행중·예정·마감 일정
          </p>
        </div>
        <div className="flex items-center gap-3 md:flex-col md:items-end">
          <SummaryHeader summary={board.summary} />
          <Link href="/subscription" className="shrink-0 text-xs font-bold text-[var(--color-blue)]">
            전체 보기 →
          </Link>
        </div>
      </div>

      {board.total === 0 ? (
        <div className="rounded-2xl border border-[var(--color-line)] bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--color-muted)]">표시할 청약 일정이 없습니다.</p>
          <Link href="/subscription" className="mt-2 inline-block text-sm font-bold text-[var(--color-blue)]">
            전체 청약 일정 보기 →
          </Link>
        </div>
      ) : (
        <>
          <WeeklyBoardMobile days={board.days} />
          <WeeklyBoardGantt days={board.days} bars={board.bars} />
        </>
      )}

      <SourceCaption ids={['applyhome', 'lh-presub']} />
    </section>
  );
}
```

- [ ] **Step 2: Wire the home page**

In `app/(public)/page.tsx`:

Change the import on `:9` from:
```ts
import { getWeeklySubscriptions } from '@/lib/subscription';
```
to:
```ts
import { getHomeWeekBoard } from '@/lib/subscription';
```

Change the `safe(getWeeklySubscriptions(), {...})` call (`:42-49`) to:
```ts
    safe(getHomeWeekBoard(), {
      summary: { open: 0, upcoming: 0, closed: 0 },
      total: 0,
      days: [],
      bars: [],
    }),
```

(`<WeeklySubscriptionBoard board={weeklyBoard} />` on `:60` stays — the variable now holds a `WeekModel`.)

- [ ] **Step 3: Typecheck, lint, and run the full unit suite**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20 && echo "---LINT---" && pnpm lint 2>&1 | tail -8`
Expected: no type errors, no lint errors. (Confirm `getWeeklySubscriptions`/`WeeklyBoard` still imported where used — jeonse-guarantee·loan-discovery untouched.)

Run: `pnpm exec vitest run tests/lib/subscription-week-model.test.ts tests/components/weekly-board-gantt-ssr.test.ts tests/components/weekly-board-mobile-ssr.test.ts tests/lib/subscription.test.ts tests/lib/subscription-flatten.test.ts`
Expected: PASS — new tests green AND the untouched `subscription`/`subscription-flatten` tests still green (regression guard for shared API).

- [ ] **Step 4: Visual verification**

Run the dev server and confirm the home board renders (desktop gantt bars span active days with correct D-day chips; mobile shows the notice repeated across active days with per-day badges; 더보기 expands in place without navigation).

Run: `pnpm dev` and open `http://localhost:3000` (또는 프로젝트 `/run` 스킬 사용). 데스크톱·모바일 폭 모두 확인.
Expected: 신제주형 공고가 접수~마감 매일 셀에 표기, 더보기 클릭 시 페이지 이동 없이 펼침.

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/_components/weekly-subscription-board.tsx app/\(public\)/page.tsx
git commit -m "feat(home): 청약 보드를 연속 간트+반복카드 모델로 전환하고 홈에 배선"
```

---

## Self-Review

**Spec coverage:**
- 조회 쿼리 버그(구간 겹침) → Task 2 (`getHomeWeekBoard`, 기존 함수는 의도적으로 미변경 — 소비자 보호). ✅
- 그날 기준 배지 규칙 표 → Task 1 `dayBadge` + 테스트. ✅
- 직렬화 모델(Date 미전달) → Task 1 `WeekModel`(문자열 필드). ✅
- 웹 간트(1행=1공고, 화살표, 오늘칩, 6행+더보기) → Task 3. ✅
- 모바일 반복카드(날짜별 3개+더보기) → Task 4. ✅
- 인터랙션(제자리 펼침, 클라이언트화, 전체 보기 링크 유지) → Task 3/4/5. ✅
- 기본값(간트 6 / 모바일 3) → Task 3 `initialVisible=6`, Task 4 `perDay=3`. ✅
- 마감 공고 회색 표기 → Task 1 buildWeekModel CLOSED 분기 + 테스트. ✅
- 테스트(고정 today, 겹침, 화살표 플래그) → Task 1 테스트 케이스. ✅

**Placeholder scan:** 없음 — 모든 스텝에 실제 코드/명령/기대출력 포함.

**Type consistency:** `WeekModel`/`WeekModelDay`/`WeekBar`/`WeeklyBoardItem` 이름이 Task 1 정의와 Task 3·4·5 사용에서 일치. `getHomeWeekBoard`(Task 2) 반환 = `WeekModel`, page.tsx fallback 형태와 일치. `WeeklyBoardGantt({days,bars,initialVisible})`·`WeeklyBoardMobile({days,perDay})` 시그니처가 Task 5 호출과 일치.
