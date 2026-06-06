# 메인 인기 지역 해시태그 → 실거래가 목록 딥링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인 검색창 아래 "인기검색" 칩을 거래량 기반 동적 "인기 지역"(시군구) 칩으로 바꾸고, 클릭 시 해당 시군구로 필터된 실거래가 목록(`/list`)으로 바로 이동시킨다.

**Architecture:** `lib/region.ts`에 거래량 집계 함수 `getPopularSigungus()`를 추가해 홈 페이지(`page.tsx`, ISR)에서 호출하고, 그 결과를 `HeroSection` → `HeroSearch`로 prop 전달한다. `HeroSearch`는 정적 `POPULAR` 상수 대신 prop을 렌더하며 각 칩을 `/list?sido=<단축명>&region=<sigunguCode>`로 링크한다.

**Tech Stack:** Next.js (App Router, ISR), Prisma, TypeScript, Vitest. 테스트는 `.env.test`(로컬 docker DB) 기준.

---

## File Structure

- `lib/region.ts` (수정): `PopularRegion` 타입과 `getPopularSigungus(limit)` 함수 추가. region 도메인 함수가 모여 있는 곳.
- `tests/lib/region.test.ts` (수정): `getPopularSigungus` 통합 테스트 추가.
- `app/(public)/page.tsx` (수정): `getPopularSigungus()` 호출 + `HeroSection`에 prop 전달.
- `app/(public)/_components/hero-section.tsx` (수정): `popularRegions` prop을 받아 `HeroSearch`로 전달.
- `app/(public)/_components/hero-search.tsx` (수정): 정적 `POPULAR` 제거, prop 기반 칩 렌더 + `/list` 딥링크.

`PopularRegion` 타입은 `lib/region.ts`에서 export하여 위 세 컴포넌트가 재사용한다.

---

## Task 1: `getPopularSigungus` 집계 함수

**Files:**
- Modify: `lib/region.ts` (파일 끝에 추가)
- Test: `tests/lib/region.test.ts` (파일 끝에 추가)

집계 흐름: 최근 90일 `Transaction`을 `sigunguCode`로 groupBy하여 count 내림차순 상위 N개를 구하고, 부족하면 전체 기간으로 폴백. 상위 코드를 `Region`(level 2)에서 라벨 조회하고, 시도 단축명은 `sidoFromPrefix(code.slice(0,2))`로 변환. `Region`에 없거나 시도 변환이 안 되는 코드는 스킵. groupBy 순서(거래량 내림차순)를 유지해 반환.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/region.test.ts` 상단 import에 `getPopularSigungus`, `sidoFromPrefix`를 포함시키고(이미 `sidoFromPrefix`가 import되어 있으면 `getPopularSigungus`만 추가), 파일 끝에 아래 describe 블록을 추가한다.

```typescript
import { getPopularSigungus } from '@/lib/region';

describe('getPopularSigungus', () => {
  it('limit 이하의 배열을 반환한다', async () => {
    const result = await getPopularSigungus(6);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('각 항목은 sigunguCode/sido/sigungu 문자열을 가진다', async () => {
    const result = await getPopularSigungus(6);
    for (const r of result) {
      expect(typeof r.sigunguCode).toBe('string');
      expect(typeof r.sido).toBe('string');
      expect(typeof r.sigungu).toBe('string');
      expect(r.sigunguCode.length).toBe(5);
    }
  });

  it('sido는 sigunguCode 앞 2자리의 시도 단축명과 일치한다', async () => {
    const result = await getPopularSigungus(6);
    for (const r of result) {
      expect(r.sido).toBe(sidoFromPrefix(r.sigunguCode.slice(0, 2)));
    }
  });

  it('sigunguCode는 중복되지 않는다', async () => {
    const result = await getPopularSigungus(6);
    const codes = result.map((r) => r.sigunguCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `pnpm vitest run tests/lib/region.test.ts`
Expected: FAIL — `getPopularSigungus` is not exported / not a function.

- [ ] **Step 3: 최소 구현 작성**

`lib/region.ts` 파일 끝에 추가한다.

```typescript
export interface PopularRegion {
  sigunguCode: string;
  sido: string;
  sigungu: string;
}

/**
 * 거래량(최근 90일) 기준 인기 시군구 상위 N개.
 * 최근 90일 결과가 limit 미만이면 전체 기간으로 폴백한다.
 * 메인 페이지 ISR(revalidate=3600)로 캐시되므로 시간당 1회만 집계된다.
 */
export async function getPopularSigungus(limit = 6): Promise<PopularRegion[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  async function topCodes(where: { contractDate?: { gte: Date } }) {
    const rows = await prisma.transaction.groupBy({
      by: ['sigunguCode'],
      where,
      _count: { sigunguCode: true },
      orderBy: { _count: { sigunguCode: 'desc' } },
      take: limit,
    });
    return rows.map((r) => r.sigunguCode);
  }

  let codes = await topCodes({ contractDate: { gte: since } });
  if (codes.length < limit) {
    codes = await topCodes({});
  }
  if (codes.length === 0) return [];

  const regions = await prisma.region.findMany({
    where: { sigunguCode: { in: codes }, level: 2, isAbolished: false },
    select: { sigunguCode: true, sigungu: true },
  });
  const labelByCode = new Map(regions.map((r) => [r.sigunguCode, r.sigungu]));

  const result: PopularRegion[] = [];
  for (const code of codes) {
    const sigungu = labelByCode.get(code);
    const sido = sidoFromPrefix(code.slice(0, 2));
    if (!sigungu || !sido) continue;
    result.push({ sigunguCode: code, sido, sigungu });
  }
  return result;
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `pnpm vitest run tests/lib/region.test.ts`
Expected: PASS (전체 region describe 블록 모두 통과).

- [ ] **Step 5: 커밋**

```bash
git add lib/region.ts tests/lib/region.test.ts
git commit -m "feat(region): 거래량 기반 인기 시군구 집계 getPopularSigungus 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 메인 페이지 와이어링 + 인기 지역 칩 렌더

**Files:**
- Modify: `app/(public)/page.tsx`
- Modify: `app/(public)/_components/hero-section.tsx`
- Modify: `app/(public)/_components/hero-search.tsx`

UI prop 전달은 단위 테스트가 어려우므로 타입체크/빌드 + 수동 확인으로 검증한다.

- [ ] **Step 1: `page.tsx`에서 인기 지역 조회 + prop 전달**

`import { getSidoList } from '@/lib/region';`를 `import { getSidoList, getPopularSigungus } from '@/lib/region';`로 변경하고, `Promise.all`과 `HeroSection` 렌더를 아래처럼 수정한다.

변경 전:
```typescript
  const [sidoList, stats, briefing] = await Promise.all([getSidoList(), getHomeStats(), getMarketBriefing()]);
```
변경 후:
```typescript
  const [sidoList, stats, briefing, popularRegions] = await Promise.all([
    getSidoList(),
    getHomeStats(),
    getMarketBriefing(),
    getPopularSigungus(),
  ]);
```

변경 전:
```typescript
      <HeroSection />
```
변경 후:
```typescript
      <HeroSection popularRegions={popularRegions} />
```

- [ ] **Step 2: `hero-section.tsx`가 prop을 받아 전달**

`import { HeroSearch } from './hero-search';` 아래에 타입 import를 추가하고, 컴포넌트 시그니처와 `HeroSearch` 사용부를 수정한다.

import 추가:
```typescript
import type { PopularRegion } from '@/lib/region';
```

변경 전:
```typescript
export function HeroSection() {
```
변경 후:
```typescript
export function HeroSection({ popularRegions }: { popularRegions: PopularRegion[] }) {
```

변경 전:
```typescript
        <HeroSearch />
```
변경 후:
```typescript
        <HeroSearch popularRegions={popularRegions} />
```

- [ ] **Step 3: `hero-search.tsx`에서 정적 상수 제거하고 prop 렌더 + `/list` 딥링크**

`import type { PopularRegion } from '@/lib/region';`를 파일 상단 import 영역에 추가한다.

정적 상수 제거 — 아래 줄을 삭제한다:
```typescript
const POPULAR = ['마포', '송도', '동탄', '강남'];
```

컴포넌트 시그니처 변경:

변경 전:
```typescript
export function HeroSearch() {
```
변경 후:
```typescript
export function HeroSearch({ popularRegions }: { popularRegions: PopularRegion[] }) {
```

칩 렌더 블록 교체 —

변경 전:
```typescript
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[var(--color-muted)]">인기검색</span>
        {POPULAR.map((k) => (
          <Link key={k} href={`/search?q=${encodeURIComponent(k)}`} className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:border-[var(--color-blue)]">
            # {k}
          </Link>
        ))}
      </div>
```
변경 후:
```typescript
      {popularRegions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[var(--color-muted)]">인기 지역</span>
          {popularRegions.map((r) => (
            <Link key={r.sigunguCode} href={`/list?sido=${encodeURIComponent(r.sido)}&region=${r.sigunguCode}`} className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:border-[var(--color-blue)]">
              # {r.sigungu}
            </Link>
          ))}
        </div>
      )}
```

- [ ] **Step 4: 타입체크 / 린트 통과 확인**

Run: `pnpm tsc --noEmit`
Expected: 오류 없음 (특히 `HeroSection`/`HeroSearch` prop 타입, `PopularRegion` import).

- [ ] **Step 5: 수동 확인 (개발 서버)**

Run: `pnpm dev` 후 브라우저에서 `/` 접속.
Expected:
- 검색창 아래 "인기 지역" 라벨과 시군구명 칩(예: `# 강남구`)이 보인다.
- 칩 클릭 시 `/list?sido=...&region=...`로 이동하고, 목록이 해당 시군구로 필터되며 좌측 필터 패널의 시도/시군구가 선택 표시된다.
- (선택) 로컬 DB에 거래가 0건이면 "인기 지역" 섹션이 렌더되지 않는다.

- [ ] **Step 6: 커밋**

```bash
git add app/\(public\)/page.tsx app/\(public\)/_components/hero-section.tsx app/\(public\)/_components/hero-search.tsx
git commit -m "feat(home): 인기 지역 칩을 실거래가 목록 시군구 필터로 딥링크

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 동작(인기 지역 칩 → `/list?sido&region`, 자동완성 유지): Task 2 ✓
- 동적 TOP N 집계 + 90일 윈도우 + 폴백: Task 1 ✓
- 라벨 "인기 지역": Task 2 Step 3 ✓
- 와이어링(page → HeroSection → HeroSearch): Task 2 ✓
- 엣지: 0건 시 섹션 숨김(Task 2 Step 3 `popularRegions.length > 0`), Region 미존재 코드 스킵(Task 1 Step 3) ✓
- 검증: 단위/통합 테스트(Task 1), 타입체크·수동 확인(Task 2) ✓

**Placeholder scan:** 없음 — 모든 코드 블록은 실제 내용 포함.

**Type consistency:** `PopularRegion { sigunguCode, sido, sigungu }`를 Task 1에서 정의하고 Task 2의 `HeroSection`/`HeroSearch` props에서 동일하게 사용. `getPopularSigungus(limit=6)` 시그니처가 page.tsx 호출(`getPopularSigungus()`, 기본값 6)과 일치.
