# 허브 콘텐츠 보강 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전체 허브(15 카테고리)에 손으로 쓴 활용 가이드 문단과 카테고리별 데이터 하이라이트를 얹어 콘텐츠를 보강한다.

**Architecture:** v1의 `lib/hub-summary/` 3계층을 확장한다. (1) 정적 가이드 레지스트리 + `HubGuide` 서버 컴포넌트, (2) `HubSummaryData.highlights` 필드 + 프로즈 빌더 렌더 + 도메인별 하이라이트 집계. 페이즈 1(가이드)과 페이즈 2(하이라이트)는 독립 배포 가능.

**Tech Stack:** Next.js App Router(RSC), Prisma(PostgreSQL), Vitest.

## Global Constraints

- 프로즈 용어: "등록 수·분포·비중"만, "밀집도/밀도" 금지. 집중도는 "상위 3개 {지역단위}가 전체의 약 N% 비중" 단일 프레이밍.
- 가이드 문단: 카테고리별 손으로 쓴 고정 텍스트, PRODUCT.md "조용한 정보 안내자" 톤 — 사실·안내 위주, 광고/과장 문구 금지.
- 하이라이트 데이터 없는 카테고리(약국·편의점·마트·카페·전통시장)에는 억지 문장 생성 금지 — 분포+가이드로만.
- 모든 집계 함수는 실패 시 throw 금지(try/catch → null 또는 빈 highlights). force-dynamic 페이지(apt/officetel/villa)는 호출부도 `.catch(() => null)`.
- 기존 리스트/필터/카드/페이지네이션 UX 변경 금지. 헤더 카드에 요약·가이드만 추가.
- 브랜치: `feat/hub-summary` (v1과 동일, 이어서 작업).
- 테스트: 순수 유닛 `tests/lib/**`(DB 불필요), DB 집계 `tests/integration/**`(`.env.test`).
- 15 카테고리 키: `apt, officetel, villa, subscription, school, childcare, hospital, pharmacy, convenience, mart, cafe, market, parking, park, charger`.

## 파일 구조

- Create `lib/hub-summary/guides.ts` — 카테고리 키 → 가이드 문단 레지스트리 + `getHubGuide(key)`
- Create `app/(public)/_components/hub-guide.tsx` — `HubGuide` 서버 컴포넌트
- Modify `lib/hub-summary/types.ts` — `HubSummaryData.highlights?: string[]`
- Modify `lib/hub-summary/prose.ts` — highlights 렌더
- Modify `lib/hub-summary/{medical,property,amenity,urban}.ts` — 하이라이트 집계 추가
- Create `lib/hub-summary/{school,childcare,subscription}.ts` — 신규 허브 요약+하이라이트
- Modify 10개 허브 page.tsx — HubGuide(전부) + HubSummary(신규 4개)
- Create `tests/lib/hub-summary/guides.test.ts`, `tests/integration/hub-summary-{school,childcare,subscription,highlights-*}.test.ts`

---

# 페이즈 1 — 활용 가이드 (전 15 카테고리)

## Task 1: 가이드 레지스트리 + HubGuide 컴포넌트

**Files:**
- Create: `lib/hub-summary/guides.ts`
- Create: `app/(public)/_components/hub-guide.tsx`
- Test: `tests/lib/hub-summary/guides.test.ts`

**Interfaces:**
- Produces:
  - `type HubGuideKey = 'apt'|'officetel'|'villa'|'subscription'|'school'|'childcare'|'hospital'|'pharmacy'|'convenience'|'mart'|'cafe'|'market'|'parking'|'park'|'charger'`
  - `function getHubGuide(key: string): string | null`
  - `function HubGuide({ category }: { category: string }): JSX.Element | null`

- [ ] **Step 1: 레지스트리 작성**

Create `lib/hub-summary/guides.ts`:

```ts
export type HubGuideKey =
  | 'apt' | 'officetel' | 'villa' | 'subscription' | 'school' | 'childcare'
  | 'hospital' | 'pharmacy' | 'convenience' | 'mart' | 'cafe' | 'market'
  | 'parking' | 'park' | 'charger';

const GUIDES: Record<HubGuideKey, string> = {
  apt: '아파트 실거래가는 같은 단지·평형이라도 층·향·거래 시점에 따라 차이가 큽니다. 단지를 고른 뒤 최근 매매·전세·월세 흐름과 거래량, 인근 단지 시세를 함께 비교해 보세요.',
  officetel: '오피스텔은 전용면적 대비 실사용 면적과 관리비, 임대 수요가 매매가만큼 중요합니다. 단지별 매매·전세·월세 거래량과 최근 시세를 함께 확인하세요.',
  villa: '연립·다세대는 거래가 드물어 시세를 파악하기 어려운 편입니다. 최근 실거래가 있는 건물 위주로 매매·전세 거래 시점과 주변 아파트 시세를 함께 참고하세요.',
  subscription: '청약은 접수 일정과 자격 요건, 분양가, 공급 세대수를 미리 확인하는 것이 중요합니다. 진행 중·예정 공고를 유형별로 살펴보고 주변 시세와 비교해 보세요.',
  school: '학군은 배정 방식과 통학 거리에 따라 체감이 크게 다릅니다. 학교급(초·중·고)과 설립유형(공립·사립), 남녀공학 여부, 인근 아파트 시세를 함께 확인하세요.',
  childcare: '어린이집은 운영유형(국공립·민간·가정)에 따라 대기와 비용 부담이 다릅니다. 정원 대비 현원, 통학차량 운영, 집과의 거리를 함께 살펴보세요.',
  hospital: '가까운 의료시설은 진료과목과 응급실 운영, 주차 여건에 따라 실제 편의가 갈립니다. 지역별 병원·의원 분포와 종별을 참고해 생활권을 점검해 보세요.',
  pharmacy: '약국은 접근성과 운영시간이 핵심입니다. 집·직장 동선에 가까운지, 심야·공휴일 운영 여부를 함께 확인하세요.',
  convenience: '편의점 밀도는 생활 편의와 상권 활력을 가늠하는 지표입니다. 도보권 분포와 함께 인근 아파트 시세를 참고해 생활권을 살펴보세요.',
  mart: '대형마트·슈퍼는 장보기 동선과 생활비에 직접 영향을 줍니다. 도보·차량 접근성과 지역별 분포를 함께 확인하세요.',
  cafe: '카페 밀도는 상권 성숙도와 생활 편의를 보여줍니다. 지역별 분포를 참고해 동네 분위기와 생활권을 가늠해 보세요.',
  market: '전통시장은 생활 물가와 지역 상권을 보여주는 공간입니다. 집과의 거리와 지역별 분포를 함께 확인하세요.',
  parking: '주차 여건은 공영·민영, 요금, 운영시간, 24시간 개방 여부에 따라 크게 갈립니다. 목록에서 운영시간과 요금을 함께 살펴보세요.',
  park: '공원·녹지는 생활 만족도와 직결됩니다. 공원 유형과 규모(면적), 집에서의 거리를 함께 확인해 산책·여가 여건을 점검해 보세요.',
  charger: '전기차 충전 여건은 급속·완속 구성과 충전기 수, 접근성에 따라 다릅니다. 지역별 충전소 분포와 운영 형태를 함께 확인하세요.',
};

export function getHubGuide(key: string): string | null {
  return (GUIDES as Record<string, string>)[key] ?? null;
}
```

- [ ] **Step 2: 실패 테스트 작성**

Create `tests/lib/hub-summary/guides.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getHubGuide, type HubGuideKey } from '@/lib/hub-summary/guides';

const ALL_KEYS: HubGuideKey[] = [
  'apt','officetel','villa','subscription','school','childcare',
  'hospital','pharmacy','convenience','mart','cafe','market',
  'parking','park','charger',
];

describe('getHubGuide', () => {
  it('15개 카테고리 전부 비지 않은 문단을 가진다', () => {
    for (const k of ALL_KEYS) {
      const g = getHubGuide(k);
      expect(g, k).toBeTruthy();
      expect(g!.length, k).toBeGreaterThan(20);
    }
  });

  it('광고성/과장 표현이 없다', () => {
    const banned = ['최고', '최저가', '무조건', '대박', '강력 추천', '완벽'];
    for (const k of ALL_KEYS) {
      const g = getHubGuide(k)!;
      for (const w of banned) expect(g.includes(w), `${k}:${w}`).toBe(false);
    }
  });

  it('미지의 키는 null', () => {
    expect(getHubGuide('nope')).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/guides.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 4: 컴포넌트 구현**

Create `app/(public)/_components/hub-guide.tsx`:

```tsx
import { getHubGuide } from '@/lib/hub-summary/guides';

export function HubGuide({ category }: { category: string }) {
  const text = getHubGuide(category);
  if (!text) return null;
  return (
    <p className="mt-3 max-w-[70ch] border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)]">
      {text}
    </p>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/guides.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/guides.ts "app/(public)/_components/hub-guide.tsx" tests/lib/hub-summary/guides.test.ts
git commit -m "feat(hub): 활용 가이드 레지스트리 + HubGuide 컴포넌트"
```

---

## Task 2: HubGuide를 10개 허브 페이지에 배선

**Files (Modify):**
- `app/(public)/amenity/[category]/page.tsx`
- `app/(public)/urban/[category]/page.tsx`
- `app/(public)/medical/hospital/page.tsx`
- `app/(public)/medical/pharmacy/page.tsx`
- `app/(public)/apt/page.tsx`
- `app/(public)/officetel/page.tsx`
- `app/(public)/villa/page.tsx`
- `app/(public)/subscription/page.tsx`
- `app/(public)/school/page.tsx`
- `app/(public)/childcare/page.tsx`

**Interfaces:**
- Consumes: `HubGuide` (Task 1). Import path depends on page depth: `app/(public)/X/page.tsx` → `../_components/hub-guide`; `app/(public)/X/[y]/page.tsx` → `../../_components/hub-guide`.

각 페이지에서 **헤더 카드 안, 요약/개수 <p> 아래**(v1 HubSummary가 있으면 그 아래)에 `<HubGuide category="KEY" />`를 삽입한다. 리스트/필터는 건드리지 않는다. 각 페이지의 실제 구조는 읽고 확인할 것.

- [ ] **Step 1: amenity/urban [category] 페이지 (카테고리 키 = def.slug)**

`app/(public)/amenity/[category]/page.tsx`:
- import: `import { HubGuide } from '../../_components/hub-guide';`
- 헤더 카드의 `<HubSummary data={summary} />` 아래에 삽입: `<HubGuide category={def.slug} />`

`app/(public)/urban/[category]/page.tsx`: 동일. import `../../_components/hub-guide`, `<HubGuide category={def.slug} />`를 `<HubSummary>` 아래.

- [ ] **Step 2: medical 페이지 (고정 키)**

`app/(public)/medical/hospital/page.tsx`: import `../../_components/hub-guide`; `<HubSummary>` 아래 `<HubGuide category="hospital" />`.
`app/(public)/medical/pharmacy/page.tsx`: `<HubGuide category="pharmacy" />`.

- [ ] **Step 3: property 페이지 (고정 키)**

`app/(public)/apt/page.tsx`: import `../_components/hub-guide`; `<h1>` 아래(또는 v2 Task 7에서 추가될 HubSummary 아래) `<HubGuide category="apt" />`.
`app/(public)/officetel/page.tsx`: `<HubSummary>` 아래 `<HubGuide category="officetel" />` (import `../_components/hub-guide`).
`app/(public)/villa/page.tsx`: `<HubGuide category="villa" />`.

- [ ] **Step 4: subscription / school / childcare (고정 키)**

각 페이지를 읽고 헤더 카드 안 제목/설명 아래에 삽입:
- `app/(public)/subscription/page.tsx`: `<HubGuide category="subscription" />`
- `app/(public)/school/page.tsx`: `<HubGuide category="school" />` — 기존 1줄 인트로("지역·학교급으로 좁혀보세요…")는 남겨도 되고, 중복스러우면 제거하고 가이드로 대체.
- `app/(public)/childcare/page.tsx`: `<HubGuide category="childcare" />` — 동일.

import 경로는 `../_components/hub-guide`(해당 페이지가 `app/(public)/X/page.tsx`이므로).

- [ ] **Step 5: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add "app/(public)/amenity/[category]/page.tsx" "app/(public)/urban/[category]/page.tsx" "app/(public)/medical/hospital/page.tsx" "app/(public)/medical/pharmacy/page.tsx" "app/(public)/apt/page.tsx" "app/(public)/officetel/page.tsx" "app/(public)/villa/page.tsx" "app/(public)/subscription/page.tsx" "app/(public)/school/page.tsx" "app/(public)/childcare/page.tsx"
git commit -m "feat(hub): 전체 허브에 활용 가이드 문단 배선"
```

- [ ] **Step 6: 로컬 렌더 확인(선택)**

`pnpm dev` 후 `curl -s http://localhost:3000/medical/hospital | grep -o '진료과목과 응급실'` 등으로 가이드 문장이 raw HTML에 포함되는지 확인.

---

# 페이즈 2 — 카테고리별 풍부한 요약

## Task 3: highlights 필드 + 프로즈 빌더 렌더

**Files:**
- Modify: `lib/hub-summary/types.ts`
- Modify: `lib/hub-summary/prose.ts`
- Test: `tests/lib/hub-summary/prose.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Produces: `HubSummaryData.highlights?: string[]`; `buildHubSummaryLines`가 highlights를 정체/분포 뒤에 이어 붙인다.

- [ ] **Step 1: 타입에 필드 추가**

`lib/hub-summary/types.ts`의 `HubSummaryData` 인터페이스 끝에 추가:

```ts
  highlights?: string[]; // 카테고리별 추가 팩트 문장(0~2). 정체/분포 뒤에 렌더.
```

- [ ] **Step 2: 실패 테스트 추가**

`tests/lib/hub-summary/prose.test.ts`에 케이스 추가:

```ts
  it('highlights를 정체·분포 뒤에 이어 붙인다', () => {
    const lines = buildHubSummaryLines({
      kind: 'medical', categoryLabel: '병원·의원', scopeLabel: '전국', scopeLevel: 'nation',
      total: 79562,
      topRegions: [
        { name: '경기도', count: 17234 }, { name: '서울특별시', count: 14012 }, { name: '부산광역시', count: 5210 },
      ],
      concentrationPct: 46,
      highlights: ['종합병원 350곳·병원 3,900곳·의원 3.6만곳 등으로 구성됩니다.'],
    });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('종합병원 350곳·병원 3,900곳·의원 3.6만곳 등으로 구성됩니다.');
  });

  it('폴백(정체만)일 때도 highlights는 이어 붙는다', () => {
    const lines = buildHubSummaryLines({
      kind: 'property', categoryLabel: '오피스텔', scopeLabel: '전국', scopeLevel: 'nation',
      total: 12, topRegions: [], highlights: ['최근 1년 거래는 매매가 가장 많았습니다.'],
    });
    expect(lines).toHaveLength(2); // 정체 + highlight
    expect(lines[1]).toBe('최근 1년 거래는 매매가 가장 많았습니다.');
  });

  it('total 0이면 highlights가 있어도 빈 배열', () => {
    expect(buildHubSummaryLines({
      kind: 'property', categoryLabel: '오피스텔', scopeLabel: '전국', scopeLevel: 'nation',
      total: 0, topRegions: [], highlights: ['x'],
    })).toEqual([]);
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/prose.test.ts`
Expected: 새 케이스 FAIL(현재 highlights 미렌더).

- [ ] **Step 4: 빌더 수정**

`lib/hub-summary/prose.ts`의 `buildHubSummaryLines`에서 두 return 지점을 수정한다. `total <= 0` 가드는 그대로. 함수 끝에서 `highlights`를 이어 붙이도록:

```ts
export function buildHubSummaryLines(d: HubSummaryData): string[] {
  if (d.total <= 0) return [];
  const identity = identitySentence(d);
  const extra = d.highlights ?? [];

  const canDistribute =
    d.scopeLevel !== 'sigungu' &&
    d.total >= MIN_TOTAL_FOR_DISTRIBUTION &&
    d.topRegions.length >= MIN_REGIONS_FOR_DISTRIBUTION &&
    d.concentrationPct != null;

  if (!canDistribute) return [identity, ...extra];

  const unit = regionUnitLabel(d.scopeLevel);
  const top = d.topRegions.slice(0, 3).map((r) => `${r.name}(${nf(r.count)})`).join('·');
  const distribution =
    `${unit}별 분포를 보면 ${top} 순으로 등록 수가 많고, ` +
    `상위 3개 ${unit}가 전체의 약 ${d.concentrationPct}% 비중입니다.`;

  return [identity, distribution, ...extra];
}
```

- [ ] **Step 5: 전체 프로즈 테스트 통과 + 커밋**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hub-summary/prose.test.ts`
Expected: PASS (기존 8 + 신규 3 = 11).

```bash
git add lib/hub-summary/types.ts lib/hub-summary/prose.ts tests/lib/hub-summary/prose.test.ts
git commit -m "feat(hub): 요약에 highlights 문장 렌더 지원"
```

---

## Task 4: 학교·어린이집 요약(신규) + 하이라이트

**Files:**
- Create: `lib/hub-summary/school.ts`, `lib/hub-summary/childcare.ts`
- Modify: `app/(public)/school/page.tsx`, `app/(public)/childcare/page.tsx`
- Test: `tests/integration/hub-summary-school.test.ts`, `tests/integration/hub-summary-childcare.test.ts`

**Interfaces:**
- Consumes: `HubSummaryData`, `HubSummary`, `prisma`
- Produces:
  - `function getSchoolHubSummary(region?: string): Promise<HubSummaryData | null>`
  - `function getChildcareHubSummary(region?: string): Promise<HubSummaryData | null>`

**중요:** School/Childcare 모델과 리스트 lib를 먼저 읽어라(`lib/school*`, `lib/childcare*`, `prisma/schema.prisma`). 확인된 필드: School `schoolKind`(초·중·고·특수), `foundType`(공립·사립), `sigunguCode`, `region`. Childcare `crType`(국공립·민간·가정 등), `capacity`, `sido`, `sigunguCode`. School은 시도 컬럼이 명확치 않을 수 있으니(sigunguCode 앞2자리=시도코드), 시도 분포는 `sigunguCode` 앞2자리 GROUP BY + `sidoFromPrefix`로 매핑(property.ts 패턴 준용). Childcare는 `sido` 컬럼 사용 가능.

- [ ] **Step 1: school 집계 구현**

Create `lib/hub-summary/school.ts`:

```ts
import { prisma } from '@/lib/db';
import { sidoFromPrefix } from '@/lib/region';
import { Prisma } from '@prisma/client';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

export async function getSchoolHubSummary(region?: string): Promise<HubSummaryData | null> {
  try {
    const where: Prisma.SchoolWhereInput = region ? { sigunguCode: region } : { sigunguCode: { not: null } };

    // 시도 분포 (sigunguCode 앞2자리)
    const distRows = await prisma.$queryRaw<Array<{ sido_code: string; cnt: number }>>`
      SELECT substring("sigunguCode" from 1 for 2) AS sido_code, COUNT(*)::int AS cnt
      FROM "School" WHERE "sigunguCode" IS NOT NULL ${region ? Prisma.sql`AND "sigunguCode" = ${region}` : Prisma.empty}
      GROUP BY 1 ORDER BY cnt DESC
    `;
    const dist = distRows.map((r) => ({ name: sidoFromPrefix(r.sido_code) ?? r.sido_code, count: r.cnt }));
    const total = dist.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;

    // 하이라이트: 학교급 분포 + 공/사립
    const [kinds, founds] = await Promise.all([
      prisma.school.groupBy({ by: ['schoolKind'], where, _count: { _all: true } }),
      prisma.school.groupBy({ by: ['foundType'], where, _count: { _all: true } }),
    ]);
    const highlights: string[] = [];
    const kindTop = kinds.filter(k => k.schoolKind).map(k => ({ n: k.schoolKind as string, c: k._count._all }))
      .sort((a, b) => b.c - a.c).slice(0, 4);
    if (kindTop.length > 0) {
      highlights.push(`학교급별로는 ${kindTop.map(k => `${k.n} ${nf(k.c)}곳`).join('·')} 등으로 구성됩니다.`);
    }
    const pub = founds.find(f => f.foundType === '공립')?._count._all ?? 0;
    const priv = founds.find(f => f.foundType === '사립')?._count._all ?? 0;
    if (pub + priv > 0) {
      const pubPct = Math.round((pub / (pub + priv)) * 100);
      highlights.push(`공립이 약 ${pubPct}%, 사립이 약 ${100 - pubPct}% 비중입니다.`);
    }

    const top = dist.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    const scopeLevel = region ? 'sigungu' : 'nation';
    return {
      kind: 'medical', categoryLabel: '학교', scopeLabel: region ? '해당 지역' : '전국',
      scopeLevel, total,
      topRegions: region ? [] : top,
      concentrationPct: region ? undefined : Math.round((top3 / total) * 100),
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getSchoolHubSummary failed', e);
    return null;
  }
}
```

(주: `region` 지정 시 scopeLevel 'sigungu'라 분포는 폴백 처리되고 하이라이트만 붙는다. `scopeLabel`은 region이면 리스트에서 넘겨받아 대체할 수 있으나 이번엔 '해당 지역'으로 둔다.)

- [ ] **Step 2: childcare 집계 구현**

Create `lib/hub-summary/childcare.ts`:

```ts
import { prisma } from '@/lib/db';
import { sidoFullName } from '@/lib/region';
import { Prisma } from '@prisma/client';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

export async function getChildcareHubSummary(region?: string): Promise<HubSummaryData | null> {
  try {
    const where: Prisma.ChildcareWhereInput = region ? { sigunguCode: region } : {};

    const groups = await prisma.childcare.groupBy({
      by: region ? ['sigunguCode'] : ['sido'],
      where: region ? where : { sido: { not: null } },
      _count: { _all: true },
    });
    const rows = groups
      .map((g) => ({ name: (region ? (g as { sigunguCode: string }).sigunguCode : (g as { sido: string | null }).sido) ?? '', count: g._count._all }))
      .filter((r) => r.name).sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    if (total <= 0) return null;

    // 하이라이트: 운영유형 분포 + 평균 정원
    const [types, cap] = await Promise.all([
      prisma.childcare.groupBy({ by: ['crType'], where, _count: { _all: true } }),
      prisma.childcare.aggregate({ where: { ...where, capacity: { gt: 0 } }, _avg: { capacity: true } }),
    ]);
    const highlights: string[] = [];
    const typeTop = types.filter(t => t.crType).map(t => ({ n: t.crType as string, c: t._count._all }))
      .sort((a, b) => b.c - a.c).slice(0, 4);
    if (typeTop.length > 0) {
      highlights.push(`운영유형별로는 ${typeTop.map(t => `${t.n} ${nf(t.c)}곳`).join('·')} 등이 있습니다.`);
    }
    if (cap._avg.capacity != null) {
      highlights.push(`평균 정원은 약 ${Math.round(cap._avg.capacity)}명입니다.`);
    }

    const top = rows.slice(0, 3);
    const top3 = top.reduce((s, r) => s + r.count, 0);
    return {
      kind: 'medical', categoryLabel: '어린이집',
      scopeLabel: region ? '해당 지역' : '전국',
      scopeLevel: region ? 'sigungu' : 'nation',
      total,
      topRegions: region ? [] : top,
      concentrationPct: region ? undefined : Math.round((top3 / total) * 100),
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getChildcareHubSummary failed', e);
    return null;
  }
}
```

- [ ] **Step 3: 통합 테스트 작성 + 실행**

Create `tests/integration/hub-summary-school.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSchoolHubSummary } from '@/lib/hub-summary/school';

describe('getSchoolHubSummary', () => {
  it('전국: nation 스코프, 하이라이트에 학교급', async () => {
    const d = await getSchoolHubSummary();
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
    if (d.highlights) expect(d.highlights.join(' ')).toMatch(/학교급|공립|사립/);
  });
});
```

Create `tests/integration/hub-summary-childcare.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getChildcareHubSummary } from '@/lib/hub-summary/childcare';

describe('getChildcareHubSummary', () => {
  it('전국: nation 스코프, 하이라이트에 운영유형/정원', async () => {
    const d = await getChildcareHubSummary();
    if (d === null) return;
    expect(d.scopeLevel).toBe('nation');
    expect(d.total).toBeGreaterThan(0);
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-school.test.ts tests/integration/hub-summary-childcare.test.ts`
Expected: PASS(데이터 있으면 단언, 없으면 조기 return).

- [ ] **Step 4: 페이지 배선**

`app/(public)/school/page.tsx`를 읽고: import `HubSummary`(`../_components/hub-summary`), `getSchoolHubSummary`. 리스트 조회의 지역 필터 값(`sp.region` 등)을 넘겨 `getSchoolHubSummary(region).catch(() => null)`을 호출(가능하면 기존 Promise.all에 추가). 헤더 카드에 `<HubSummary data={summary} />`를 `<HubGuide>` 위에 삽입.

`app/(public)/childcare/page.tsx`: 동일하게 `getChildcareHubSummary(region)`.

- [ ] **Step 5: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/school.ts lib/hub-summary/childcare.ts tests/integration/hub-summary-school.test.ts tests/integration/hub-summary-childcare.test.ts "app/(public)/school/page.tsx" "app/(public)/childcare/page.tsx"
git commit -m "feat(hub): 학교·어린이집 요약(신규)+하이라이트"
```

---

## Task 5: 병원 하이라이트 (종별 분포)

**Files:**
- Modify: `lib/hub-summary/medical.ts`
- Test: `tests/integration/hub-summary-medical.test.ts` (케이스 추가)

**Interfaces:**
- `getMedicalRegionBreakdown('hospital', ...)` 결과에 `highlights`(종별 분포)를 채운다. pharmacy는 하이라이트 없음(변경 없음).

- [ ] **Step 1: hospital 종별 하이라이트 추가**

`lib/hub-summary/medical.ts`의 nation 경로(region 미지정, hospital일 때)에서 종별 분포를 추가로 집계해 highlights에 넣는다. 함수 끝의 return 객체에 `highlights`를 추가하기 전, hospital+nation 조건에서:

```ts
    let highlights: string[] | undefined;
    if (kind === 'hospital') {
      const types = await prisma.hospital.groupBy({
        by: ['typeName'], where: { typeName: { not: null } }, _count: { _all: true },
      });
      const top = types.filter(t => t.typeName).map(t => ({ n: t.typeName as string, c: t._count._all }))
        .sort((a, b) => b.c - a.c).slice(0, 4);
      if (top.length > 0) {
        highlights = [`종별로는 ${top.map(t => `${t.n} ${t.c.toLocaleString('ko-KR')}곳`).join('·')} 등으로 구성됩니다.`];
      }
    }
```

그리고 nation return 객체에 `highlights` 필드를 포함시킨다. (region 경로/pharmacy는 highlights 없음.)

- [ ] **Step 2: 테스트 케이스 추가 + 실행**

`tests/integration/hub-summary-medical.test.ts`에 추가:

```ts
  it('병원 전국: 종별 하이라이트 존재(데이터 있으면)', async () => {
    const d = await getMedicalRegionBreakdown('hospital', '병원·의원');
    if (d === null || !d.highlights) return;
    expect(d.highlights.join(' ')).toContain('종별로는');
  });
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-medical.test.ts`
Expected: PASS.

- [ ] **Step 3: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/medical.ts tests/integration/hub-summary-medical.test.ts
git commit -m "feat(hub): 병원 종별 분포 하이라이트"
```

---

## Task 6: 도시인프라 하이라이트 (주차장·공원·충전소)

**Files:**
- Modify: `lib/hub-summary/urban.ts`
- Test: `tests/integration/hub-summary-urban.test.ts` (케이스 추가)

확인된 모델/필드: `Parking`(prkplceSe 공영/민영, chargeInfo 무료/유료), `Park`(parkType, area), `EvCharger`(chargeSpeed 급속/완속, chargerCount). urban 어댑터가 카테고리별 모델을 쓰므로, 하이라이트는 slug로 분기해 각 모델을 직접 집계한다. **먼저 lib/urban 및 스키마에서 정확한 필드값(예: prkplceSe 값이 '공영'인지 코드인지, chargeInfo 무료 표기)을 확인**하고 문자열 매칭을 맞춘다.

- [ ] **Step 1: urban 하이라이트 함수 추가**

`lib/hub-summary/urban.ts`에 slug별 하이라이트 집계를 추가한다. `getUrbanHubSummary`가 sido/sigungu 스코프에서 필터(effectiveSido 등)를 갖고 있으므로, 그 스코프 조건을 그대로 하이라이트 집계에도 적용한다(전역 집계 방지). 새 헬퍼:

```ts
async function urbanHighlights(slug: string, filter: UrbanListFilter): Promise<string[] | undefined> {
  try {
    const nf = (n: number) => n.toLocaleString('ko-KR');
    if (slug === 'parking') {
      // filter를 Parking where로 변환하는 방법은 어댑터의 where 빌더 재사용 또는 sido prefix 매칭
      const rows = await prisma.parking.groupBy({ by: ['prkplceSe'], _count: { _all: true } });
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      const pub = rows.find(r => r.prkplceSe && r.prkplceSe.includes('공영'))?._count._all ?? 0;
      if (total > 0 && pub > 0) return [`공영 주차장이 약 ${Math.round((pub / total) * 100)}% 비중입니다.`];
      return undefined;
    }
    if (slug === 'charger') {
      const rows = await prisma.evCharger.groupBy({ by: ['chargeSpeed'], _count: { _all: true }, _sum: { chargerCount: true } });
      const total = rows.reduce((s, r) => s + r._count._all, 0);
      const fast = rows.find(r => r.chargeSpeed && r.chargeSpeed.includes('급속'))?._count._all ?? 0;
      const units = rows.reduce((s, r) => s + (r._sum.chargerCount ?? 0), 0);
      if (total > 0) return [`급속 충전소가 약 ${Math.round((fast / total) * 100)}%, 총 충전기는 ${nf(units)}기입니다.`];
      return undefined;
    }
    if (slug === 'park') {
      const [kinds, area] = await Promise.all([
        prisma.park.groupBy({ by: ['parkType'], where: { parkType: { not: null } }, _count: { _all: true } }),
        prisma.park.aggregate({ where: { area: { gt: 0 } }, _avg: { area: true } }),
      ]);
      const top = kinds.map(k => ({ n: k.parkType as string, c: k._count._all })).sort((a, b) => b.c - a.c).slice(0, 3);
      const out: string[] = [];
      if (top.length) out.push(`유형별로는 ${top.map(k => `${k.n} ${nf(k.c)}곳`).join('·')} 등이 있습니다.`);
      if (area._avg.area != null) out.push(`평균 면적은 약 ${nf(Math.round(area._avg.area))}㎡입니다.`);
      return out.length ? out : undefined;
    }
    return undefined;
  } catch (e) {
    console.error(`urbanHighlights(${slug}) failed`, e);
    return undefined;
  }
}
```

주의: 위 groupBy는 스코프 필터를 생략한 전역 집계다. **주차장/충전소/공원 모델에 sigunguCode가 없어(어댑터가 주소기반)** 스코프 한정이 어렵다. 시도 스코프 하이라이트가 부정확해지지 않도록, **하이라이트는 전국 기준 비율/구성으로 표기**하거나(문장에 "전국 기준" 명시), 스코프 한정이 가능하면 주소 LIKE로 좁힌다. 구현 시 어댑터의 where 빌더를 재사용할 수 있으면 그것을 우선한다. 정확 스코프 한정이 불가하면 문장을 "전국 기준 …"으로 명시해 오해를 막는다.

`getUrbanHubSummary`의 return들에 `highlights: await urbanHighlights(slug, filter)`를 추가한다(단, 전국 기준임을 문장에 반영).

- [ ] **Step 2: 테스트 케이스 추가 + 실행**

`tests/integration/hub-summary-urban.test.ts`에 추가:

```ts
  it('공원/충전소: 하이라이트가 있으면 문자열', async () => {
    const d = await getUrbanHubSummary('park', '공원', { sido: '서울' }, '서울');
    if (d === null || !d.highlights) return;
    expect(Array.isArray(d.highlights)).toBe(true);
    expect(d.highlights.every(s => typeof s === 'string' && s.length > 0)).toBe(true);
  });
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-urban.test.ts`
Expected: PASS.

- [ ] **Step 3: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/urban.ts tests/integration/hub-summary-urban.test.ts
git commit -m "feat(hub): 주차장·공원·충전소 하이라이트(전국 기준 구성)"
```

---

## Task 7: 아파트(신규 요약) + 오피스텔·빌라 하이라이트 (성능 주의)

**Files:**
- Modify: `lib/hub-summary/property.ts`
- Modify: `app/(public)/apt/page.tsx`, `app/(public)/officetel/page.tsx`, `app/(public)/villa/page.tsx`
- Test: `tests/integration/hub-summary-property.test.ts` (케이스 추가)

**성능:** apt/officetel/villa는 force-dynamic. 하이라이트로 전국 SUM/AVG를 매 요청 실행하면 부담. 따라서 하이라이트 집계는 **거래유형 카운트 합만**(가벼운 aggregate: `_sum` on saleCount12m/jeonseCount12m/wolseCount12m, `txCount12m > 0` 필터)으로 제한하고, 평균가 등 무거운 통계는 제외한다. 그래도 무거우면 `unstable_cache`(TTL 6h)로 감싼다.

- [ ] **Step 1: property 하이라이트 추가**

`lib/hub-summary/property.ts`의 `getPropertyHubStats`에 거래유형 구성 하이라이트를 추가한다. 기존 분포 raw SQL 뒤에:

```ts
    const agg = await prisma.property.aggregate({
      where: { propertyType: { in: types }, txCount12m: { gt: 0 } },
      _sum: { saleCount12m: true, jeonseCount12m: true, wolseCount12m: true },
    });
    const sale = agg._sum.saleCount12m ?? 0;
    const jeonse = agg._sum.jeonseCount12m ?? 0;
    const wolse = agg._sum.wolseCount12m ?? 0;
    const txTotal = sale + jeonse + wolse;
    let highlights: string[] | undefined;
    if (txTotal > 0) {
      const pct = (n: number) => Math.round((n / txTotal) * 100);
      highlights = [`최근 1년 거래는 매매 ${pct(sale)}%·전세 ${pct(jeonse)}%·월세 ${pct(wolse)}% 비중입니다.`];
    }
```

그리고 return 객체에 `highlights`를 포함. (성능 우려 시 `unstable_cache`로 `getPropertyHubStats`를 감싸는 래퍼를 만들되, 이번엔 단일 aggregate라 인덱스(`txCount12m`)를 타면 허용 범위로 판단 — 실측 후 필요 시 캐시.)

- [ ] **Step 2: apt 페이지에 HubSummary 신규 배선**

`app/(public)/apt/page.tsx`를 읽고: import `HubSummary`(`../_components/hub-summary`), `getPropertyHubStats`, `PropertyType`. 기존 popular 조회를 `Promise.all`로 묶어 `getPropertyHubStats([PropertyType.APARTMENT], '아파트').catch(() => null)`을 추가. `<h1>` 아래에 `<HubSummary data={summary} />`(그 아래 Task 2에서 넣은 `<HubGuide category="apt" />`).

- [ ] **Step 3: officetel·villa는 이미 HubSummary 존재 → 하이라이트 자동 반영**

officetel/villa는 v1에서 `getPropertyHubStats`를 이미 호출하므로 Step 1 변경으로 하이라이트가 자동으로 붙는다. 추가 배선 불필요(확인만).

- [ ] **Step 4: 테스트 케이스 추가 + 실행**

`tests/integration/hub-summary-property.test.ts`에 추가:

```ts
  it('오피스텔: 거래유형 하이라이트', async () => {
    const d = await getPropertyHubStats([PropertyType.OFFICETEL], '오피스텔');
    if (d === null || !d.highlights) return;
    expect(d.highlights.join(' ')).toContain('매매');
  });
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-property.test.ts`
Expected: PASS.

- [ ] **Step 5: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/property.ts tests/integration/hub-summary-property.test.ts "app/(public)/apt/page.tsx"
git commit -m "feat(hub): 아파트 요약(신규)+실거래 거래유형 하이라이트"
```

---

## Task 8: 청약 요약(신규) + 하이라이트

**Files:**
- Create: `lib/hub-summary/subscription.ts`
- Modify: `app/(public)/subscription/page.tsx`
- Test: `tests/integration/hub-summary-subscription.test.ts`

확인된 모델 `SubscriptionNotice`: `status`(진행 상태), `category`(SubscriptionCategory enum, 공급유형), `regionCode`/`regionName`, `totalSupply`. **먼저 스키마의 `SubscriptionCategory`/`SubscriptionSource` enum 값과 `status` 실제 값(예: 진행중/예정/마감)을 확인**하고 매칭하라.

- [ ] **Step 1: subscription 집계 구현**

Create `lib/hub-summary/subscription.ts`:

```ts
import { prisma } from '@/lib/db';
import type { HubSummaryData } from './types';

const nf = (n: number) => n.toLocaleString('ko-KR');

export async function getSubscriptionHubSummary(): Promise<HubSummaryData | null> {
  try {
    const total = await prisma.subscriptionNotice.count();
    if (total <= 0) return null;

    const [byCategory, supply] = await Promise.all([
      prisma.subscriptionNotice.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.subscriptionNotice.aggregate({ _sum: { totalSupply: true } }),
    ]);
    const catTop = byCategory.map(c => ({ n: String(c.category), c: c._count._all }))
      .sort((a, b) => b.c - a.c).slice(0, 4);

    const highlights: string[] = [];
    if (catTop.length > 0) {
      highlights.push(`공급유형별로는 ${catTop.map(c => `${c.n} ${nf(c.c)}건`).join('·')} 등이 있습니다.`);
    }
    if (supply._sum.totalSupply) {
      highlights.push(`집계된 총 공급 규모는 약 ${nf(supply._sum.totalSupply)}세대입니다.`);
    }

    return {
      kind: 'medical', categoryLabel: '청약 공고', scopeLabel: '전국', scopeLevel: 'nation',
      total, topRegions: [], // 청약은 지역 분포 대신 하이라이트 위주
      highlights: highlights.length ? highlights : undefined,
    };
  } catch (e) {
    console.error('getSubscriptionHubSummary failed', e);
    return null;
  }
}
```

(주: topRegions 비움 + total만 → 프로즈는 "전국에 등록된 청약 공고는 N건입니다" 형태의 정체 문장 + 하이라이트. 단, 정체 문장은 "곳입니다"로 끝나므로 청약엔 어색하다 → **prose.ts의 정체 문장 단위 '곳'을 카테고리에 맞추는 게 필요하면** categoryLabel을 '청약 공고'로 두되, 단위 문제는 Step 2에서 확인 후, 필요하면 `HubSummaryData`에 `unit?: '곳'|'건'|'세대'` 옵션을 추가하고 prose 기본 '곳'으로 처리한다.)

- [ ] **Step 2: 단위 처리 확인**

`buildHubSummaryLines`의 정체 문장은 `${total}곳입니다`로 고정이다. 청약은 "건"이 자연스럽다. `HubSummaryData`에 optional `unit?: string`(기본 '곳')을 추가하고 `identitySentence`에서 `${nf(d.total)}${d.unit ?? '곳'}입니다`로 바꾼다. 이 변경 시 `tests/lib/hub-summary/prose.test.ts`에 unit 케이스 1개 추가(기본 '곳' 유지 확인 + unit '건' 확인). 그리고 subscription 요약은 `unit: '건'` 설정.

- [ ] **Step 3: 통합 테스트 + 실행**

Create `tests/integration/hub-summary-subscription.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSubscriptionHubSummary } from '@/lib/hub-summary/subscription';

describe('getSubscriptionHubSummary', () => {
  it('전국 청약: total>0면 정체 문장 대상', async () => {
    const d = await getSubscriptionHubSummary();
    if (d === null) return;
    expect(d.total).toBeGreaterThan(0);
    expect(d.scopeLevel).toBe('nation');
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hub-summary-subscription.test.ts tests/lib/hub-summary/prose.test.ts`
Expected: PASS.

- [ ] **Step 4: 페이지 배선**

`app/(public)/subscription/page.tsx`를 읽고: import `HubSummary`(`../_components/hub-guide` 아님, `../_components/hub-summary`), `getSubscriptionHubSummary`. 헤더 카드에 `const summary = await getSubscriptionHubSummary().catch(() => null)` + `<HubSummary data={summary} />`를 `<HubGuide category="subscription" />` 위에 삽입.

- [ ] **Step 5: 타입체크 + 커밋**

Run: `pnpm exec tsc --noEmit` → 에러 없음.

```bash
git add lib/hub-summary/subscription.ts lib/hub-summary/types.ts lib/hub-summary/prose.ts tests/lib/hub-summary/prose.test.ts tests/integration/hub-summary-subscription.test.ts "app/(public)/subscription/page.tsx"
git commit -m "feat(hub): 청약 요약(신규)+공급유형 하이라이트+단위 옵션"
```

---

## Task 9: 전체 검증

- [ ] **Step 1: 전체 테스트**

Run: `pnpm test`
Expected: 신규 포함 전부 PASS(기존 DB 병렬 flake는 단독 재실행 확인).

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 렌더 확인 (가이드는 데이터 무관하므로 전부 확인 가능)**

`pnpm dev` 후:

```bash
for u in \
  "/apt" "/officetel" "/villa" "/subscription" "/school" "/childcare" \
  "/medical/hospital" "/medical/pharmacy" \
  "/amenity/cafe?sido=서울" "/amenity/convenience?sido=서울" "/amenity/mart?sido=서울" "/amenity/market?sido=서울" \
  "/urban/parking?sido=서울" "/urban/park?sido=서울" "/urban/charger?sido=서울"; do
  echo "=== $u ==="; curl -s "http://localhost:3000$u" | grep -oE '함께 (확인|비교|살펴|참고)[^<]*' | head -1
done
```

Expected: 15개 전부 가이드 문장 출력(가이드는 정적이라 데이터 없어도 나옴). 하이라이트는 로컬 데이터 있는 허브에서만.

- [ ] **Step 4: 회귀 확인 + PR 업데이트**

기존 리스트/필터/페이지네이션 정상 동작 확인. 이미 열린 PR #178(feat/hub-summary)에 커밋이 누적되므로 별도 PR 불필요 — PR 본문에 v2 내용을 추가한다:

```bash
git push
gh pr edit 178 --body "$(cat <<'PRBODY'
(기존 v1 내용 + v2: 전체 15개 허브에 활용 가이드 문단 추가, 카테고리별 데이터 하이라이트(학교 학교급·어린이집 운영유형·병원 종별·주차장 공영비율·공원 유형·충전소 급속비율·실거래 거래유형·청약 공급유형) 추가, 신규 허브 apt·subscription·school·childcare 요약 노출)
PRBODY
)"
```

---

## Self-Review

**Spec coverage:**
- 가이드 레지스트리+컴포넌트 → Task 1 ✅ / 15 허브 배선 → Task 2 ✅
- highlights 필드+렌더 → Task 3 ✅
- 학교·어린이집(신규 요약+하이라이트) → Task 4 ✅
- 병원 종별 → Task 5 ✅ / urban(주차장·공원·충전소) → Task 6 ✅
- 아파트(신규)+실거래 하이라이트(성능 주의) → Task 7 ✅
- 청약(신규)+단위 옵션 → Task 8 ✅
- 데이터 없는 카테고리(약국·편의점·마트·카페·전통시장) 하이라이트 없음 → 설계대로 미포함(가이드만) ✅
- 검증/회귀 → Task 9 ✅

**Placeholder scan:** Task 6은 urban 모델의 필드값(prkplceSe '공영' 문자열, chargeInfo 무료 표기, chargeSpeed '급속')을 구현 시 확인해야 함 — 확인 명령과 "불확실하면 전국 기준 명시" 규칙을 넣어 결정 규칙화. Task 4/8은 School.region/sido 컬럼과 SubscriptionCategory enum 값을 읽고 매칭 — 읽기 지시 명시. 스코프 한정 불가한 urban 하이라이트는 "전국 기준" 문장으로 오해 방지.

**Type consistency:** `HubSummaryData` 확장 필드 `highlights?: string[]`, `unit?: string`(Task 8) 전 태스크 일치. 각 도메인 함수 반환형 `Promise<HubSummaryData | null>` 일치. `kind`는 프로즈 미사용(리뷰서 확인됨)이라 신규 도메인에서 'medical' 재사용 무방(원하면 유니온 확장은 별도).
