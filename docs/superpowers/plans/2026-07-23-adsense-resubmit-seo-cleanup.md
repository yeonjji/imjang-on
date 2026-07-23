# 애드센스 재신청 전 SEO 마감 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로즈 없는 얇은 페이지를 색인에서 빼고(SSR noindex), sitemap을 index 페이지만 남기고(noindex 0건), 파생수치·도보시간·어린이집 프로즈의 결함을 고쳐 애드센스 재신청 준비를 끝낸다.

**Architecture:** 색인 규칙을 순수 모듈(`lib/seo/indexable.ts`)로 집약해 7개 상세 페이지가 공유하고, 프로즈 없는 생활 카테고리(amenity·주차장·충전소)에 SSR noindex를 부여한다. sitemap은 색인 게이트의 **확정 부분집합**만 등재한다 — property·school 상세는 게이트가 nearby/지역통계 의존이라 제외(pharmacy와 동일 `count:0` 패턴), childcare·hospital은 "필드조건⇒모듈발화"가 성립하는 보수적 컬럼/관계 프록시로 유지. 도보시간은 단일 유틸(80 m/분)로 통일한다.

**Tech Stack:** Next.js(App Router) · TypeScript · Prisma(PostgreSQL) · Vitest v2 · pnpm. 배포는 main push → OCI 자동배포.

## Global Constraints

- noindex는 **SSR `metadata.robots`로만** 부여한다. 대상 경로(amenity·urban·charger)를 `robots.txt`에서 Disallow 하지 않는다(크롤을 허용해야 Googlebot이 noindex 태그를 읽는다). `robots.txt`(`app/robots.ts`)는 이번 작업에서 **수정하지 않는다**.
- noindex여도 `follow: true`는 유지한다.
- sitemap 각 소스의 `count()`와 `page()/findMany()`는 **동일한 WHERE 상수**를 참조한다(샤드 정합). 불변식: **sitemap에 noindex URL 0건**(부분집합만 등재, 일부 index 페이지 누락은 허용).
- `SOURCE_ORDER`는 순서·엔트리를 유지한다(property·school은 `count: async () => 0`으로만 바꾸고 코드/슬롯 보존; 끝에만 추가 규칙 준수).
- 완료된 apt·childcare 프로즈의 **문구·숫자는 바꾸지 않는다**. 예외는 명시 요청된 childcare 2건(충원율 시군구 중앙값 벤치마크, 교사비율 보육교사 기준)뿐. 도보 상수는 80 m/분(프로즈 기존값)으로 통일하므로 프로즈 도보 숫자는 불변.
- **손대지 않음**: 실거래 표·지도 UI, JSON-LD 배관, 약국·`/list` robots(이미 noindex), `robots.txt` 기존 규칙, subscription 색인 조건.
- **머지 게이트 = CI 그린.** 로컬 풀빌드는 강제하지 않는다. 배포 후 프로덕션 검증은 **소수 요청만**(자동 챌린지·버스트 금지) 또는 GSC URL 검사.
- 배포: `feat/adsense-seo-cleanup` → main PR → CI 그린 → merge → OCI 자동배포.
- `pnpm lint`가 반드시 통과해야 한다(ESLint `no-unused-vars`=error가 CI를 막음). 사용처를 바꾼 뒤 미사용 import/변수를 남기지 않는다.

---

### Task 1: 색인 규칙 순수 모듈 `lib/seo/indexable.ts`

**Files:**
- Create: `lib/seo/indexable.ts`
- Test: `tests/lib/seo/indexable.test.ts`

**Interfaces:**
- Consumes: `Narrative` from `@/lib/insights/shared` (`{ sentences: string[]; text: string; fired: string[] }`).
- Produces:
  - `isNarrativeIndexable(narrative: Narrative | null, minFired?: number): boolean` (default `minFired = 3`)
  - `robotsFor(indexable: boolean): { index: boolean; follow: boolean }`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/seo/indexable.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
import type { Narrative } from '@/lib/insights/shared';

const nar = (fired: string[]): Narrative => ({ sentences: [], text: '', fired });

describe('isNarrativeIndexable', () => {
  it('null narrative → false', () => {
    expect(isNarrativeIndexable(null)).toBe(false);
  });
  it('fired < 3 → false (default minFired=3)', () => {
    expect(isNarrativeIndexable(nar(['a', 'b']))).toBe(false);
  });
  it('fired >= 3 → true', () => {
    expect(isNarrativeIndexable(nar(['a', 'b', 'c']))).toBe(true);
  });
  it('minFired=2 (park): fired 2 → true, 1 → false', () => {
    expect(isNarrativeIndexable(nar(['a', 'b']), 2)).toBe(true);
    expect(isNarrativeIndexable(nar(['a']), 2)).toBe(false);
  });
});

describe('robotsFor', () => {
  it('true → index+follow', () => {
    expect(robotsFor(true)).toEqual({ index: true, follow: true });
  });
  it('false → noindex+follow(항상 follow 유지)', () => {
    expect(robotsFor(false)).toEqual({ index: false, follow: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/seo/indexable.test.ts`
Expected: FAIL — `Cannot find module '@/lib/seo/indexable'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/seo/indexable.ts`:

```ts
import type { Narrative } from '@/lib/insights/shared';

/**
 * 상세 페이지 색인 규칙(단일 소스). narrative가 있고 발화 모듈이 minFired개 이상이면 index.
 * 각 페이지 generateMetadata가 인라인하던 `!!narrative && narrative.fired.length >= N`을 대체한다.
 * park만 minFired=2, 나머지는 3.
 */
export function isNarrativeIndexable(narrative: Narrative | null, minFired = 3): boolean {
  return !!narrative && narrative.fired.length >= minFired;
}

/** robots 메타 헬퍼 — noindex여도 follow는 유지(링크 전파). */
export function robotsFor(indexable: boolean): { index: boolean; follow: boolean } {
  return { index: indexable, follow: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/seo/indexable.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/seo/indexable.ts tests/lib/seo/indexable.test.ts
git commit -m "feat(seo): 색인 규칙 순수 모듈(isNarrativeIndexable·robotsFor)"
```

---

### Task 2: 생활 상세 페이지에 색인 규칙 배선

기존 7개 narrative 페이지의 인라인 게이트를 `isNarrativeIndexable`로 교체(동작 불변)하고, 프로즈 없는 amenity·주차장·충전소에 SSR noindex를 부여한다.

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx:59,72`
- Modify: `app/(public)/officetel/[id]/page.tsx:65,78`
- Modify: `app/(public)/villa/[id]/page.tsx:65,78`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:51,58`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx:42,47`
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx:52,62`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx:59,65` (park 분기) + `:69-73`(비-park return)
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx:50-54`
- Modify: `app/(public)/urban/charger/[id]/page.tsx:49-53`

**Interfaces:**
- Consumes: `isNarrativeIndexable`, `robotsFor` from `@/lib/seo/indexable` (Task 1).

- [ ] **Step 1: 기존 6개(minFired 3) 페이지 교체**

각 파일 상단 import 추가:
```ts
import { isNarrativeIndexable, robotsFor } from '@/lib/seo/indexable';
```
각 파일에서 아래 라인(6개 파일 모두 동일 텍스트)을 교체:
```ts
// before
const indexable = !!narrative && narrative.fired.length >= 3;
// after
const indexable = isNarrativeIndexable(narrative);
```
그리고 robots 라인(6개 파일 동일):
```ts
// before
robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
// after
robots: robotsFor(indexable),
```
대상: `apt/[id]`, `officetel/[id]`, `villa/[id]`, `school/[sigunguCode]/[id]`, `medical/hospital/[sigunguCode]/[id]`, `childcare/[sigunguCode]/[id]`.

- [ ] **Step 2: urban park 분기(minFired 2) 교체**

`app/(public)/urban/[category]/[id]/page.tsx`에 import 추가 후 park 분기(:59,:65):
```ts
// before (:59)
const indexable = !!narrative && narrative.fired.length >= 2;
// after
const indexable = isNarrativeIndexable(narrative, 2);
// before (:65)
robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
// after
robots: robotsFor(indexable),
```

- [ ] **Step 3: 프로즈 없는 카테고리에 noindex 부여**

`app/(public)/urban/[category]/[id]/page.tsx` 비-park return(:69-73)에 robots 추가:
```ts
// before
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
// after (robots 한 줄 추가)
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
```

`app/(public)/amenity/[category]/[id]/page.tsx`: import `robotsFor` 후 return(:50-54)에 `robots: robotsFor(false),` 추가:
```ts
import { robotsFor } from '@/lib/seo/indexable';
// ...
  return {
    title: `${item.name} — ${def.label} 정보·주변 아파트`,
    description: `${item.name} ${def.label} 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/amenity/${def.slug}/${id}` },
  };
```

`app/(public)/urban/charger/[id]/page.tsx`: import `robotsFor` 후 return(:49-53)에 `robots: robotsFor(false),` 추가:
```ts
import { robotsFor } from '@/lib/seo/indexable';
// ...
  return {
    title: `${item.name} — 전기차충전소 정보·주변 아파트`,
    description: `${item.name} 전기차충전소 실시간 충전기 현황과 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/urban/charger/${id}` },
  };
```

- [ ] **Step 4: 구조 검증(치환 누락·미사용 없음)**

Run: `rg -n "fired\.length >=" "app/(public)"`
Expected: **subscription 1건만 남음**(`subscription/[id]/page.tsx` — 다른 게이트라 유지). narrative 7개 페이지엔 0건.

Run: `rg -L -n "robots:" "app/(public)/amenity/[category]/[id]/page.tsx" "app/(public)/urban/charger/[id]/page.tsx"`
Expected: 두 파일 모두 `robots:` 존재(누락 없음).

- [ ] **Step 5: lint·typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS(미사용 import 없음, 타입 오류 없음).

- [ ] **Step 6: Commit**

```bash
git add "app/(public)"
git commit -m "feat(seo): 생활 상세 색인 규칙 배선 + amenity·주차장·충전소 SSR noindex"
```

---

### Task 3: 도보 시간 단일 유틸 `lib/walk-minutes.ts`

**Files:**
- Create: `lib/walk-minutes.ts`
- Test: `tests/lib/walk-minutes.test.ts`

**Interfaces:**
- Produces: `walkMinutes(distanceMeters: number): number` — 80 m/분, 하한 1분.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/walk-minutes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { walkMinutes } from '@/lib/walk-minutes';

describe('walkMinutes (80 m/분 통일)', () => {
  it('80m/분으로 반올림', () => {
    expect(walkMinutes(1360)).toBe(17); // 1360/80 = 17.0
    expect(walkMinutes(800)).toBe(10);
  });
  it('하한 1분', () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(30)).toBe(1);
  });
  it('반올림 경계', () => {
    expect(walkMinutes(120)).toBe(2); // 1.5 → 2
    expect(walkMinutes(119)).toBe(1); // 1.4875 → 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/walk-minutes.test.ts`
Expected: FAIL — `Cannot find module '@/lib/walk-minutes'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/walk-minutes.ts`:

```ts
/**
 * 도보 소요 시간(분). 성인 보행 80 m/분 기준으로 통일한다.
 * 프로즈(insights)와 배지(nearby-subway)가 같은 거리에서 다른 값을 내지 않도록 단일 소스.
 */
export function walkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / 80));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/walk-minutes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/walk-minutes.ts tests/lib/walk-minutes.test.ts
git commit -m "feat(geo): 도보 시간 단일 유틸 walkMinutes(80 m/분)"
```

---

### Task 4: 도보 계산 3곳을 walkMinutes로 통일

프로즈 2곳(이미 ÷80 → 숫자 불변)과 배지 1곳(÷67 → ÷80, 버그 수정)을 단일 유틸로 교체.

**Files:**
- Modify: `lib/insights/shared.ts:17`
- Modify: `lib/insights/apt.ts:69`
- Modify: `components/ui/nearby-subway.tsx:9-11,87`

**Interfaces:**
- Consumes: `walkMinutes` from `@/lib/walk-minutes` (Task 3).

- [ ] **Step 1: insights 2곳 교체(숫자 불변)**

`lib/insights/shared.ts` — import 추가 후 :17:
```ts
import { walkMinutes } from '@/lib/walk-minutes';
// before
const walkMin = station ? Math.max(1, Math.round(station.distanceMeters / 80)) : 0;
// after
const walkMin = station ? walkMinutes(station.distanceMeters) : 0;
```
`lib/insights/apt.ts` — import 추가 후 :69(동일 치환):
```ts
import { walkMinutes } from '@/lib/walk-minutes';
// before
const walkMin = station ? Math.max(1, Math.round(station.distanceMeters / 80)) : 0;
// after
const walkMin = station ? walkMinutes(station.distanceMeters) : 0;
```

- [ ] **Step 2: 배지 교체(÷67 → ÷80)**

`components/ui/nearby-subway.tsx` — 로컬 함수(:9-11) 삭제하고 import로 교체:
```ts
// before (:9-11)
function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 67));
}
// after: 로컬 함수 삭제, 상단 import 추가
import { walkMinutes } from '@/lib/walk-minutes';
```
`:87`의 `walkMinutes(station.distanceMeters)` 호출은 그대로 두면 import된 함수로 해석된다(수정 불필요).

- [ ] **Step 3: 기존 테스트에서 옛 배지값(÷67) 단정 갱신**

Run: `rg -n "도보|walkMinutes|/ 67" tests`
옛 배지 분값(÷67 기준)을 단정하는 테스트가 있으면 ÷80 기준으로 갱신한다. insights 테스트는 ÷80이 유지되므로 변경 없음. (없으면 다음 스텝으로.)

- [ ] **Step 4: 회귀 검증**

Run: `pnpm exec vitest run tests/lib/insights-apt.test.ts tests/lib/insights-shared.test.ts tests/lib/walk-minutes.test.ts`
Expected: PASS. 이어서 `pnpm lint && pnpm typecheck` PASS(로컬 함수 삭제 후 미사용 없음).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/shared.ts lib/insights/apt.ts components/ui/nearby-subway.tsx
git commit -m "fix(subway): 도보시간 배지를 프로즈와 동일 유틸(80 m/분)로 통일"
```

---

### Task 5: 파생수치 raw float 반올림

**Files:**
- Modify: `lib/faq/builders/apt.ts:47`
- Modify: `lib/faq/builders/jeonse.ts:27`
- Test: `tests/lib/faq-apt.test.ts`, `tests/lib/faq-jeonse.test.ts`

**Interfaces:**
- Consumes: `buildAptFaq(input: AptFaqInput)`, `buildJeonseFaq(p: JeonseFaqInput)` (기존, 순수).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/faq-apt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildAptFaq } from '@/lib/faq/builders/apt';

describe('buildAptFaq 전세가율 반올림', () => {
  it('raw float를 정수%로(긴 소수 없음)', () => {
    const items = buildAptFaq({
      property: { name: '테스트아파트', region: { sido: '서울특별시' }, saleLastPrice: null, saleLastAt: null, saleAvgPrice12m: null, saleCount12m: 0 },
      areaSummary: [{ area: 84, jeonseRatioPct: 57.61439522661714 }],
      unifiedTotalCount: 10,
    });
    const ratioFaq = items.find((i) => i.q.includes('전세가율'));
    expect(ratioFaq).toBeDefined();
    expect(ratioFaq!.a).toContain('약 58%'); // 57.61 → 58
    expect(ratioFaq!.a).not.toMatch(/\d+\.\d{3,}/); // 긴 소수 금지
  });
});
```

Create `tests/lib/faq-jeonse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildJeonseFaq } from '@/lib/faq/builders/jeonse';

describe('buildJeonseFaq 한도비율 반올림', () => {
  it('rate를 정수%로', () => {
    const items = buildJeonseFaq({
      rcmdProdNm: '테스트보증', maxLoanLmtAmt: null, rentGrntMaxLoanLmtRate: 79.99999,
      exptGrfeRateCont: null, grntReqTrgtDvcd: null, rcmdGrntProdDvcd: null,
      trtBankCont: null, updatedAt: new Date('2026-07-01'),
    });
    const f = items.find((i) => i.a.includes('한도비율'));
    expect(f).toBeDefined();
    expect(f!.a).toContain('한도비율은 80%');
    expect(f!.a).not.toMatch(/\d+\.\d{3,}/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/lib/faq-apt.test.ts tests/lib/faq-jeonse.test.ts`
Expected: FAIL — apt는 `약 57.61439522661714%`(정수 아님), jeonse는 `한도비율은 79.99999%`.

- [ ] **Step 3: 반올림 적용**

`lib/faq/builders/apt.ts:47`:
```ts
// before
      a: `동일 평형의 매매·전세 실거래로 계산한 전세가율은 약 ${ratio}%입니다. 매매가 대비 전세보증금 비율로, 표본 수에 따라 참고용으로 활용하세요.`,
// after
      a: `동일 평형의 매매·전세 실거래로 계산한 전세가율은 약 ${Math.round(ratio)}%입니다. 매매가 대비 전세보증금 비율로, 표본 수에 따라 참고용으로 활용하세요.`,
```

`lib/faq/builders/jeonse.ts:27`:
```ts
// before
        ? `${amt ? ', ' : ''}임차보증금 대비 한도비율은 ${p.rentGrntMaxLoanLmtRate}%`
// after
        ? `${amt ? ', ' : ''}임차보증금 대비 한도비율은 ${Math.round(p.rentGrntMaxLoanLmtRate)}%`
```
> 참고: 같은 파일 `:39` `exptGrfeRateCont`는 `string`(범위 텍스트)이라 반올림 대상 아님 — 변경하지 않는다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/lib/faq-apt.test.ts tests/lib/faq-jeonse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/faq/builders/apt.ts lib/faq/builders/jeonse.ts tests/lib/faq-apt.test.ts tests/lib/faq-jeonse.test.ts
git commit -m "fix(faq): 전세가율·한도비율 파생수치 정수 반올림(raw float 노출 제거)"
```

---

### Task 6: 어린이집 프로즈 정확도(충원율 시군구 중앙값 벤치마크 + 교사비율 보육교사 기준)

**Files:**
- Modify: `lib/insights/childcare.ts` (인터페이스 + `occupancy()` + `ratio()`)
- Modify: `lib/insights/childcare-loader.ts` (median 주입 + `emRoleTeacher` 주입)
- Modify: `lib/childcare.ts` (median 쿼리 추가; `getChildcareById`가 `emRoleTeacher` 반환하는지 확인)
- Modify: `tests/lib/insights-childcare.test.ts` (기존 occupancy/ratio 단정 갱신 + 신규 케이스)

**Interfaces:**
- Produces: `ChildcareInsightInput`에 `emRoleTeacher: number | null`, `sigunguFillMedian: number | null` (필수 필드) 추가 → **모든 생성 지점(loader·테스트)이 두 필드를 제공해야 컴파일**된다.
- Produces: `getSigunguChildcareFillMedian(sigunguCode: string): Promise<number | null>` from `@/lib/childcare`.
- Consumes(Task 7): 위 인터페이스(Task 7의 childcare 픽스처가 두 필드를 포함해야 함).

- [ ] **Step 1: 인터페이스에 필드 추가**

`lib/insights/childcare.ts` 인터페이스(:4-17)에 두 필드 추가:
```ts
export interface ChildcareInsightInput {
  name: string;
  crType: string | null;
  capacity: number | null;
  currentCount: number | null;
  staffCount: number | null;
  emRoleTeacher: number | null;      // 보육교사 수(교사비율 분모)
  sigunguFillMedian: number | null;  // 같은 시군구 충원율 중앙값(0..1), 벤치마크용
  waitByAge: { label: string; count: number }[];
  roomSize: number | null;
  cctvCount: number | null;
  vehicleOp: string | null;
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}
```
> `staffCount`는 유지한다(다른 참조·시딩 shape 보존). `ratio()`가 더 이상 쓰지 않지만 pre-existing 필드이므로 삭제하지 않는다(관측만).

- [ ] **Step 2: `occupancy()` 벤치마크로 재작성, `ratio()` 보육교사 기준으로 재작성**

`lib/insights/childcare.ts` `occupancy()`(:28-36):
```ts
function occupancy(d: ChildcareInsightInput): Insight | null {
  if (d.capacity == null || d.capacity < 1 || d.currentCount == null) return null;
  const occ = d.currentCount / d.capacity;
  const pct = Math.round(occ * 100);
  const med = d.sigunguFillMedian;
  if (med != null && med > 0) {
    const medPct = Math.round(med * 100);
    const rel = occ >= med * 1.1 ? '같은 시군구 중앙값보다 높은'
      : occ <= med * 0.9 ? '같은 시군구 중앙값보다 낮은'
      : '같은 시군구 중앙값과 비슷한';
    return { key: 'occupancy', text: `현원 ${d.currentCount}명, 충원율 ${pct}%로 ${rel} 수준입니다(같은 시군구 중앙값 ${medPct}%).` };
  }
  // 폴백: 중앙값 표본이 없으면 기존 절대 기준 서술.
  const judge = occ >= 0.9 ? '정원에 거의 찬 편입니다'
    : occ >= 0.7 ? '보통 수준입니다'
    : '정원에 여유가 있는 편입니다';
  return { key: 'occupancy', text: `현원 ${d.currentCount}명, 충원율 ${pct}%로 ${judge}.` };
}
```

`lib/insights/childcare.ts` `ratio()`(:52-56):
```ts
function ratio(d: ChildcareInsightInput): Insight | null {
  if (!d.emRoleTeacher || d.emRoleTeacher < 1 || !d.currentCount) return null;
  const r = d.currentCount / d.emRoleTeacher;
  return { key: 'ratio', text: `보육교사 ${d.emRoleTeacher}명 기준 1인당 원아 약 ${r.toFixed(1)}명입니다.` };
}
```

- [ ] **Step 3: median 쿼리 추가 + `emRoleTeacher` 반환 확인**

먼저 `getChildcareById`가 `emRoleTeacher`를 반환하는지 확인:
Run: `rg -n "getChildcareById|emRoleTeacher|select" lib/childcare.ts`
- 명시적 `select`를 쓰고 `emRoleTeacher`가 없으면 `emRoleTeacher: true`를 select에 추가한다. (select 없이 전체 반환이면 이미 포함 — 변경 불필요.)

`lib/childcare.ts`에 median 헬퍼 추가(파일 상단에 `import { prisma } from '@/lib/db';`가 없으면 추가):
```ts
/** 같은 시군구 어린이집 충원율(현원/정원) 중앙값. 벤치마크 서술용. 표본 없으면 null. */
export async function getSigunguChildcareFillMedian(sigunguCode: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ median: number | null }[]>`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY "currentCount"::float / "capacity"
    ) AS median
    FROM "Childcare"
    WHERE "sigunguCode" = ${sigunguCode}
      AND "capacity" > 0
      AND "currentCount" IS NOT NULL
  `;
  const m = rows[0]?.median;
  return m == null ? null : Number(m);
}
```

- [ ] **Step 4: loader에서 median·보육교사 주입**

`lib/insights/childcare-loader.ts`:
```ts
// import에 추가
import { getChildcareById, getChildcareLatLng, getSigunguChildcareFillMedian } from '@/lib/childcare';
// cache 별칭 추가(파일 상단 cache 블록 근처)
export const cachedSigunguFillMedian = cache(getSigunguChildcareFillMedian);
```
Promise.all(:30-34)에 median 추가하고 buildChildcareNarrative 인자에 두 필드 추가:
```ts
    const [apts, infra, subway, fillMedian] = await Promise.all([
      coord ? cachedNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraCC(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayCC(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      cachedSigunguFillMedian(item.sigunguCode),
    ]);

    const narrative = buildChildcareNarrative({
      name: item.name,
      crType: item.crType,
      capacity: item.capacity,
      currentCount: item.currentCount,
      staffCount: item.staffCount,
      emRoleTeacher: item.emRoleTeacher,
      sigunguFillMedian: fillMedian,
      waitByAge: WAIT_AGES.map(([k, label]) => ({ label, count: (item as Record<string, unknown>)[k] as number ?? 0 }))
        .filter((x) => x.count > 0),
      roomSize: item.roomSize,
      cctvCount: item.cctvCount,
      vehicleOp: item.vehicleOp,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });
```

- [ ] **Step 5: 테스트 — 기존 단정 갱신 + 신규 케이스(먼저 실패 확인)**

`tests/lib/insights-childcare.test.ts`를 연다. `buildChildcareNarrative`를 호출하는 기존 픽스처는 이제 `emRoleTeacher`·`sigunguFillMedian` 미포함으로 **타입 에러**가 난다 — 모든 픽스처에 두 필드를 추가한다. 옛 문구를 단정하던 기존 테스트(`'보통 수준입니다'`, `'교직원 N명 기준'`)는 신규 문구로 갱신한다. 파일 상단에 공용 픽스처 헬퍼와 신규 describe를 추가:
```ts
const base = (o: Partial<Parameters<typeof buildChildcareNarrative>[0]> = {}) =>
  buildChildcareNarrative({
    name: '햇살어린이집', crType: '국공립', capacity: 100, currentCount: 90,
    staffCount: 20, emRoleTeacher: 15, sigunguFillMedian: 0.7,
    waitByAge: [{ label: '만 1세', count: 5 }], roomSize: 200, cctvCount: 10, vehicleOp: '운영',
    nearestStation: null, infra: [], nearbyAptSaleManwon: [], ...o,
  });

describe('충원율 시군구 중앙값 벤치마크', () => {
  it('중앙값보다 높으면 "높은"', () => {
    expect(base({ currentCount: 90, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값보다 높은');
  });
  it('중앙값과 비슷하면 "비슷한"', () => {
    expect(base({ currentCount: 72, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값과 비슷한');
  });
  it('중앙값보다 낮으면 "낮은"', () => {
    expect(base({ currentCount: 50, sigunguFillMedian: 0.7 })!.text).toContain('같은 시군구 중앙값보다 낮은');
  });
  it('중앙값 없으면 절대 기준 폴백', () => {
    expect(base({ currentCount: 95, sigunguFillMedian: null })!.text).toContain('정원에 거의 찬');
  });
});

describe('교사비율 보육교사 기준', () => {
  it('보육교사 분모로 서술', () => {
    // 90 / 15 = 6.0
    expect(base({ currentCount: 90, emRoleTeacher: 15 })!.text).toContain('보육교사 15명 기준 1인당 원아 약 6.0명');
  });
  it('보육교사 없으면 교사비율 문장 생략', () => {
    const t = base({ emRoleTeacher: null })!.text;
    expect(t).not.toContain('보육교사');
    expect(t).not.toContain('1인당 원아');
  });
});
```

Run: `pnpm exec vitest run tests/lib/insights-childcare.test.ts`
Expected: 신규 케이스 FAIL(구현 전이면) 또는 타입/문구 불일치. 구현(Step 1-4) 후 재실행.

- [ ] **Step 6: Run test to verify pass**

Run: `pnpm exec vitest run tests/lib/insights-childcare.test.ts`
Expected: PASS. 이어 `pnpm typecheck`로 모든 `ChildcareInsightInput` 생성 지점(loader 포함)이 두 필드를 제공하는지 확인.

- [ ] **Step 7: Commit**

```bash
git add lib/insights/childcare.ts lib/insights/childcare-loader.ts lib/childcare.ts tests/lib/insights-childcare.test.ts
git commit -m "feat(childcare): 충원율 시군구 중앙값 벤치마크 + 교사비율 보육교사 기준"
```

---

### Task 7: sitemap hard-0 (property·school 제외, childcare·hospital 보수적 프록시)

**Files:**
- Modify: `lib/sitemap/sources.ts` (property·school `count:0`; childcare·hospital 프록시)
- Test: `tests/lib/sitemap-indexable.test.ts`

**Interfaces:**
- Consumes: `buildChildcareNarrative`(Task 6 확장 인터페이스), `buildHospitalNarrative` — 프록시가 색인 게이트의 부분집합임을 증명.

- [ ] **Step 1: 부분집합 증명 테스트 작성(먼저 실패 확인)**

Create `tests/lib/sitemap-indexable.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildChildcareNarrative } from '@/lib/insights/childcare';
import { buildHospitalNarrative } from '@/lib/insights/hospital';

// 프록시 WHERE를 '겨우' 만족하는 최소 입력이 색인(fired≥3 + requireKey)됨을 증명 →
// sitemap 등재 조건 ⊆ 페이지 색인 게이트(noindex URL 0건).
describe('sitemap 프록시 ⊆ 색인 게이트', () => {
  it('childcare 프록시 최소 입력(capacity≥1·currentCount≥1·roomSize·cctv≥1) → 색인', () => {
    const n = buildChildcareNarrative({
      name: 'X', crType: null, capacity: 1, currentCount: 1,
      staffCount: null, emRoleTeacher: null, sigunguFillMedian: null,
      waitByAge: [], roomSize: 10, cctvCount: 1, vehicleOp: null,
      nearestStation: null, infra: [], nearbyAptSaleManwon: [],
    });
    expect(n).not.toBeNull();
    expect(n!.fired.length).toBeGreaterThanOrEqual(3);
    expect(n!.fired).toEqual(expect.arrayContaining(['intro', 'occupancy', 'facility']));
  });

  it('hospital 프록시 최소 입력(totalDoctors≥1·전문의 배치 진료과) → 색인', () => {
    const n = buildHospitalNarrative({
      name: 'Y', typeName: '병원', deptCount: 1, deptWithSpecialistCount: 1,
      topDeptNames: ['내과'], totalDoctors: 1, specialistTotal: 1, bedCounts: [],
      nearestStation: null, infra: [], nearbyAptSaleManwon: [],
    });
    expect(n).not.toBeNull();
    expect(n!.fired.length).toBeGreaterThanOrEqual(3);
    expect(n!.fired).toEqual(expect.arrayContaining(['intro', 'depts', 'doctors']));
  });
});
```

Run: `pnpm exec vitest run tests/lib/sitemap-indexable.test.ts`
Expected: PASS 예상(게이트는 기존 로직). **만약 FAIL이면 프록시 조건이 부분집합이 아님 → 프록시를 더 조여야 한다(Step 2 진행 전 원인 파악).**

- [ ] **Step 2: property·school 상세 제외(count:0)**

`lib/sitemap/sources.ts` property 소스(:104-121) `count`만 교체하고 주석 추가:
```ts
// property 상세 색인 게이트(fired≥3)는 nearby(입지)·지역통계(peer) 의존이라 Property 컬럼만으로
// hard-0 부분집합을 만들 수 없다. 이번 마감은 noindex 0건 우선 → property 상세를 sitemap에서 제외한다
// (허브는 core에 유지). SOURCE_ORDER 슬롯·findMany는 보존해, 향후 사전계산 indexable 플래그로
// 복원 시 count를 prisma.property.count({ where: PROPERTY_INDEXABLE })로 되돌리면 된다.
const property = dbSource({
  key: 'property',
  count: async () => 0,
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: PROPERTY_INDEXABLE,
      select: { id: true, propertyType: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/${propertyPrefix(p.propertyType)}/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});
```
school 소스(:149-166) `count`만 교체 + 주석:
```ts
// school 상세 색인 게이트는 district(인근 학교 밀도, 공간)·입지 의존이라 컬럼만으로 부분집합 불가.
// noindex 0건 우선 → school 상세 제외(허브 /school/{sigunguCode}는 core에 유지). 복원 시 count를
// prisma.school.count({ where: { sigunguCode: { not: null } } })로 되돌린다.
const school = dbSource({
  key: 'school',
  count: async () => 0,
  findMany: (skip, take) =>
    prisma.school.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (s) => ({
    url: `${SITE_URL}/school/${s.sigunguCode!}/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});
```
> 주의: property(위치 2)·school(위치 4)이 count=0이 되면 뒤 소스의 글로벌 샤드 id가 앞당겨진다(pharmacy가 이미 count=0인 것과 동일 성격). sitemap 인덱스는 24h마다 재생성되고 Google이 인덱스를 다시 읽으므로 일시적 재정렬은 허용된다.

- [ ] **Step 3: childcare 보수적 프록시**

`lib/sitemap/sources.ts` childcare 소스(:168-184) 위에 상수 추가하고 count·findMany에 적용:
```ts
// 색인 게이트의 확정 부분집합: intro(capacity)+occupancy(capacity·currentCount)+facility(roomSize·cctv)
// = 3발화, occupancy∈requireKeys. ratio(emRoleTeacher)와 무관해 childcare 프로즈 변경 영향 없음.
// count·findMany 동일 WHERE로 샤드 정합. (tests/lib/sitemap-indexable.test.ts가 부분집합 증명)
const CHILDCARE_SITEMAP_INDEXABLE: Prisma.ChildcareWhereInput = {
  capacity: { gte: 1 },
  currentCount: { gte: 1 },
  roomSize: { not: null },
  cctvCount: { gte: 1 },
};

const childcare = dbSource({
  key: 'childcare',
  count: () => prisma.childcare.count({ where: CHILDCARE_SITEMAP_INDEXABLE }),
  findMany: (skip, take) =>
    prisma.childcare.findMany({
      where: CHILDCARE_SITEMAP_INDEXABLE,
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (c) => ({
    url: `${SITE_URL}/childcare/${c.sigunguCode}/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});
```

- [ ] **Step 4: hospital 보수적 프록시**

`lib/sitemap/sources.ts` hospital 소스(:210-227) 위에 상수 추가하고 count·findMany에 적용:
```ts
// 색인 게이트의 확정 부분집합: intro(typeName non-null → 항상)+doctors(totalDoctors≥1)
// +depts(전문의 배치 진료과 존재 ⇒ deptWithSpecialistCount>0) = 3발화, requireKeys(depts·doctors) 충족.
const HOSPITAL_SITEMAP_INDEXABLE: Prisma.HospitalWhereInput = {
  sigunguCode: { not: null },
  totalDoctors: { gte: 1 },
  depts: { some: { specialistCount: { gt: 0 } } },
};

const hospital = dbSource({
  key: 'hospital',
  count: () => prisma.hospital.count({ where: HOSPITAL_SITEMAP_INDEXABLE }),
  findMany: (skip, take) =>
    prisma.hospital.findMany({
      where: HOSPITAL_SITEMAP_INDEXABLE,
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (h) => ({
    url: `${SITE_URL}/medical/hospital/${h.sigunguCode!}/${h.id}`,
    lastModified: h.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});
```

- [ ] **Step 5: 검증**

Run: `pnpm exec vitest run tests/lib/sitemap-indexable.test.ts`
Expected: PASS(부분집합 증명 유지).
Run: `pnpm typecheck`
Expected: PASS(`Prisma.ChildcareWhereInput`/`HospitalWhereInput`·`depts.some.specialistCount` 필드 유효).
Run: `rg -n "CHILDCARE_SITEMAP_INDEXABLE|HOSPITAL_SITEMAP_INDEXABLE" lib/sitemap/sources.ts`
Expected: 각 상수가 **count와 findMany 두 곳**에서 참조됨(패리티 육안 확인).

- [ ] **Step 6: Commit**

```bash
git add lib/sitemap/sources.ts tests/lib/sitemap-indexable.test.ts
git commit -m "fix(sitemap): noindex 0건 — property·school 상세 제외, childcare·hospital 보수적 프록시"
```

---

### Task 8: 검증 & 배포 (CI 게이트 + 배포후 표본 + GSC 재제출)

**Files:** (코드 없음 — 게이트·운영 체크리스트)

- [ ] **Step 1: 로컬 전체 검증**

```bash
pnpm lint
pnpm typecheck
pnpm test          # 통합 포함(도커 테스트 DB :5433 필요). 불가 시 최소 pnpm test:unit
```
Expected: 전부 PASS. 실패 시 해당 Task로 돌아가 수정.

- [ ] **Step 2: PR 생성 → CI 그린 확인**

```bash
git push -u origin feat/adsense-seo-cleanup
gh pr create --base main --head feat/adsense-seo-cleanup \
  --title "SEO 마감: thin noindex + sitemap hard-0 + 파생수치·도보·어린이집 정정" \
  --body "docs/superpowers/plans/2026-07-23-adsense-resubmit-seo-cleanup.md 기준. CI 그린이 머지 게이트."
```
CI가 그린이 될 때까지 대기(머지 게이트). 실패 로그가 있으면 수정 후 재푸시.

- [ ] **Step 3: 머지 → 자동배포**

CI 그린 후 main으로 머지. main push가 OCI 자동배포를 트리거한다. 배포 완료를 GitHub Actions에서 확인(프로덕션 직접 폴링 금지).

- [ ] **Step 4: 배포 후 프로덕션 표본 검증(버스트 금지 — 유형별 1건, 총 5~6요청)**

각 유형에서 대표 id 하나씩 골라(허브 페이지나 GSC에서) view-source robots 확인:
```bash
# index 유지(정상 apt): index 기대
curl -s "https://imjangon.co.kr/apt/<id>" | rg -i 'name="robots"'      # → content="index, follow"
# 신규 noindex(cafe/parking): noindex 기대
curl -s "https://imjangon.co.kr/amenity/cafe/<id>" | rg -i 'name="robots"'  # → content="noindex, follow"
curl -s "https://imjangon.co.kr/urban/parking/<id>" | rg -i 'name="robots"' # → content="noindex, follow"
# childcare: 프로즈(중앙값 벤치마크·보육교사 문구) 노출 확인
curl -s "https://imjangon.co.kr/childcare/<sigungu>/<id>" | rg -i '같은 시군구 중앙값|보육교사|name="robots"'
```
Rich Results Test(수동): apt·childcare 각 1건 URL 넣어 JSON-LD 유효 확인.

- [ ] **Step 5: sitemap 표본 확인**

```bash
curl -s "https://imjangon.co.kr/sitemap.xml" | rg -o '/sitemaps/[0-9]+' | head
# childcare/hospital 샤드 하나를 열어 표본 URL의 페이지가 index인지 1건 확인.
# property/school '상세' URL(/apt/<id>, /school/<code>/<id>)이 샤드에 없음을 확인(허브만 존재).
```
Expected: sitemap에 property·school **상세** URL 없음, childcare·hospital 상세 표본은 index.

- [ ] **Step 6: GSC sitemap 재제출**

Google Search Console에서 `sitemap.xml` 재제출. (색인 반영은 비동기 — 이후 커버리지에서 'Submitted URL marked noindex' 감소를 모니터링.)

- [ ] **Step 7: 최종 보고**

성공 기준 대비 결과를 요약 보고: (1) amenity·주차장·충전소 noindex, (2) sitemap noindex 0건 + property/school 상세 제외, (3) 전세가율 정수%, (4) 도보 프로즈=배지, (5) 어린이집 충원율 벤치마크·보육교사 비율, (6) CI 그린 머지 + 표본 통과 + GSC 재제출.

---

## Self-Review

**1. Spec coverage**
- WS1(thin noindex) → Task 1·2. WS2(sitemap hard-0) → Task 7(+부분집합 증명 Task 1 미해당, Task 7 자체 테스트). WS3(반올림) → Task 5. WS4a(도보) → Task 3·4. WS4b·c(어린이집) → Task 6. WS5(검증) → Task 8. **전 항목 매핑됨.**
- 스펙의 "property 보수 프록시" 항목은 사용자 결정에 따라 **property·school 제외**로 상향(=더 보수적, noindex 0건). 스펙 WS2의 "자체컬럼 ≥3 부분집합"은 childcare·hospital에만 적용(코드 실측으로 property·school은 불가 확인).

**2. Placeholder scan**
- 모든 코드 스텝에 실제 코드/명령/기대출력 포함. `<id>` 등은 배포후 운영 표본의 실제 파라미터(플레이스홀더 아님 — 런타임 값). "TBD/TODO" 없음.

**3. Type consistency**
- `ChildcareInsightInput`에 추가한 `emRoleTeacher`·`sigunguFillMedian`는 Task 6에서 정의하고 Task 7 픽스처가 동일 필드로 소비(순서 6→7 명시). `walkMinutes`·`isNarrativeIndexable`·`robotsFor` 시그니처가 생산(Task 1·3)과 소비(Task 2·4)에서 일치. `Prisma.ChildcareWhereInput`/`HospitalWhereInput`·`depts.some.specialistCount`·`totalDoctors`는 스키마(schema.prisma:489,507, HospitalDept.specialistCount)로 확인됨.

**의존 순서:** 1→2, 3→4, 6→7, (5 독립), 8 마지막. 5·6·7은 서로 독립이나 7은 6의 인터페이스에 의존.
