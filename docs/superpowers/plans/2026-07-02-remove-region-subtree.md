# `/region` 서브트리 전체 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** thin-content 신호인 `/region` 라우트 서브트리(인덱스·시도허브·시군구 상세 ~250 URL)를 전량 제거하고 모든 흔적(링크·사이트맵·ISR·고아 코드)을 정리하되, 옛 URL은 `/list`로 308 승계한다.

**Architecture:** 순수 삭제 + 리다이렉트 작업. `next.config.mjs`에 308 리다이렉트 2규칙을 추가하고 라우트 디렉터리를 삭제한 뒤, 인바운드 링크(footer·사이트맵·robots)·XML 사이트맵 생성기·ISR 재검증 파이프라인·`/region` 전용 고아 심볼과 그 테스트를 순차적으로 제거한다. 각 태스크는 `tsc` + 해당 테스트가 green인 상태로 끝난다.

**Tech Stack:** Next.js(App Router) · TypeScript(strict) · Vitest · Playwright · pnpm. 리다이렉트는 `next.config.mjs`의 `redirects()`.

## Global Constraints

- **리다이렉트는 `permanent: true`(308)** 로만 추가하고, `next.config.mjs`의 기존 `redirects()` 배열 안 **inline 객체 패턴**을 그대로 따른다(별도 상수 추출 금지).
- **절대 건드리지 않음(다른 소비처 존재):** `@/lib/region`의 데이터 함수(`getSidoList`·`getSigunguByCode`·`getSigungusBySido`·`sidoFullName`·`sidoPrefix`·`sidoFromPrefix`·`shortSidoFromRegionCode`·`getPopularSigungus`), `app/api/regions/route.ts`, `/school/regions`·`/childcare/regions`, `lib/property.ts`의 `getRegionStats`·`getTopPropertiesByVolume`, `lib/faq/data.ts`의 region FAQ, `lib/guide/page-category.ts`의 region 매핑, `lib/format.ts`의 `formatBillion`.
- **`lib/revalidate.ts`는 손대지 않는다** — `revalidateRegionTag`/`revalidatePropertyPaths`는 이 변경 이전부터 호출자 0인 기존 dead code(범위 밖, 발견 기록만).
- **`/list`는 `robots:{index:false,follow:true}`(noindex)** — 리다이렉트 목적지이며 변경하지 않는다.
- **브랜치:** `feat/remove-region-subtree` (이미 존재, spec 커밋 `6603b46` 위에 쌓는다).
- **tsconfig:** `strict: true`(단 `noUnusedLocals` 미설정 — 미사용 지역변수는 tsc를 깨지 않음).
- **커밋 메시지**는 저장소 convention(`type(scope): 한글 요약`)을 따르고, 환경 규칙대로 `Co-Authored-By`·`Claude-Session` 트레일러를 말미에 붙인다.
- **테스트 명령:** `pnpm typecheck`(=`tsc --noEmit`) · `pnpm test:unit`(dotenv+vitest, `tests/lib tests/ingest tests/components`) · `pnpm test:e2e`(playwright). 특정 파일만: `pnpm exec dotenv -e .env.test -- vitest run <경로>`.

---

### Task 1: `/region` 라우트 삭제 + 308 리다이렉트 + 고아 컴포넌트·e2e 정리

**Files:**
- Modify: `next.config.mjs:18-35` (`redirects()` 배열에 2규칙 추가)
- Delete: `app/(public)/region/` 디렉터리 전체 — `page.tsx`, `[code]/page.tsx`, `[code]/opengraph-image.tsx`
- Delete: `app/(public)/_components/region-card.tsx` (`RegionCard` — 소비처가 위 2페이지뿐)
- Delete: `tests/e2e/region.spec.ts` (`/region/11650` 방문 e2e — 라우트와 함께 무효)

**Interfaces:**
- Consumes: 없음.
- Produces: `/region`·`/region/:code` URL이 308로 `/list`(시군구 코드는 `?region=`)에 착지. **Task 3이 이 태스크에 의존** — `region/[code]/page.tsx`가 `regionBlurb`·`sidoFromHubCode`의 유일 소비처이므로 반드시 먼저 삭제돼야 Task 3의 심볼 제거가 tsc를 깨지 않는다.

- [ ] **Step 1: `next.config.mjs` redirects 배열에 2규칙 추가**

`app/amenity` 규칙 배열의 닫는 `];` 직전에 삽입한다. 기존 마지막 규칙(`/amenity/:category/:sigunguCode(\\d{5})/:id(\\d+)`) 다음:

```js
      {
        source: '/amenity/:category/:sigunguCode(\\d{5})/:id(\\d+)',
        destination: '/amenity/:category/:id',
        permanent: true,
      },
      // /region 서브트리 제거(thin-content) — 실콘텐츠 목록으로 308 승계.
      // 시군구 코드는 parseListParams가 ?region=→sigunguCode로 매핑해 필터 착지.
      {
        source: '/region',
        destination: '/list',
        permanent: true,
      },
      {
        source: '/region/:code',
        destination: '/list?region=:code',
        permanent: true,
      },
    ];
```

- [ ] **Step 2: 라우트·고아 컴포넌트·e2e 삭제**

```bash
git rm -r "app/(public)/region"
git rm "app/(public)/_components/region-card.tsx"
git rm tests/e2e/region.spec.ts
```

Expected: 5개 파일 삭제(`region/page.tsx`, `region/[code]/page.tsx`, `region/[code]/opengraph-image.tsx`, `region-card.tsx`, `region.spec.ts`).

- [ ] **Step 3: 타입체크 — 삭제로 인한 dangling import 없음 확인**

Run: `pnpm typecheck`
Expected: PASS(Exit 0). (`region-card`·삭제 페이지의 유일 소비처가 함께 사라졌으므로 미해결 import 없음.)

- [ ] **Step 4: 리다이렉트 스모크(308 + Location)**

```bash
pnpm dev   # 백그라운드로 기동 후
curl -sI http://localhost:3000/region        | grep -iE '^(HTTP|location)'
curl -sI 'http://localhost:3000/region/11110' | grep -iE '^(HTTP|location)'
```

Expected:
- `/region` → `HTTP/1.1 308 ...` + `location: /list`
- `/region/11110` → `HTTP/1.1 308 ...` + `location: /list?region=11110`

(dev 종료 후 다음 단계.)

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(seo): /region 라우트 서브트리 제거 + /list 308 리다이렉트"
```

---

### Task 2: 사이트맵(XML·HTML)·robots·footer의 `/region` 링크 정리

**Files:**
- Modify: `lib/sitemap/static-entries.ts:12` (정적 `/region` 엔트리 제거)
- Modify: `lib/sitemap/sources.ts:47-53` (`coreEntries()`의 `/region/{code}` for-루프 제거)
- Modify: `app/robots.ts:6` (allow 배열에서 `'/region/'` 제거)
- Modify: `app/(public)/sitemap/page.tsx:20` (HTML 사이트맵 `/region` 행 제거)
- Modify: `app/(public)/_components/footer.tsx:21` (`/region` `<li>` 제거)

**Interfaces:**
- Consumes: Task 1(라우트 삭제 완료).
- Produces: sitemap.xml·HTML 사이트맵·footer에 `/region*` 링크 0건.

- [ ] **Step 1: `static-entries.ts`에서 `/region` 엔트리 제거**

`lib/sitemap/static-entries.ts`에서 아래 줄(12행) 삭제:

```js
  { url: `${SITE_URL}/region`, changeFrequency: 'weekly', priority: 0.8 },
```

- [ ] **Step 2: `sources.ts`의 `/region/{code}` 생성 루프 제거**

`lib/sitemap/sources.ts` `coreEntries()`에서 아래 블록(47-53행) 전체 삭제. `schoolSigungus`·`amenityCountsBySlug` 루프는 유지:

```js
    for (const r of sigungus) {
      entries.push({
        url: `${SITE_URL}/region/${r.code.slice(0, 5)}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
```

삭제 후 `sigungus`가 미사용이 되면 `Promise.all` 구조분해에서 함께 정리한다. 현재:

```js
    const [sigungus, schoolSigungus, amenityCountsBySlug] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      getAllSigungus().catch(() => []),
      Promise.all(...),
    ]);
```

→ 첫 `prisma.region.findMany` 항목과 `sigungus` 바인딩을 제거하고 배열을 2개로 축소:

```js
    const [schoolSigungus, amenityCountsBySlug] = await Promise.all([
      getAllSigungus().catch(() => []),
      Promise.all(
        AMENITY_SLUGS.map(async (slug) => ({
          slug,
          counts: await AMENITY_CATEGORIES[slug]
            .getCountsBySigungu()
            .catch(() => new Map<string, number>()),
        })),
      ),
    ]);
```

(`prisma`가 이 파일에서 여전히 다른 소스들에 쓰이므로 import는 유지된다.)

- [ ] **Step 3: `robots.ts` allow에서 `/region/` 제거**

`app/robots.ts:6`:

```js
  const allow = ['/', '/apt/', '/officetel/', '/villa/', '/region/', ...(isBoardPublic() ? ['/board/'] : [])];
```

→

```js
  const allow = ['/', '/apt/', '/officetel/', '/villa/', ...(isBoardPublic() ? ['/board/'] : [])];
```

- [ ] **Step 4: HTML 사이트맵에서 `/region` 행 제거**

`app/(public)/sitemap/page.tsx`의 `실거래가` 그룹에서 아래 줄(20행) 삭제(바로 위 `{ href: '/list', label: '통합 실거래가' }`가 의도 커버):

```js
      { href: '/region', label: '지역별 시세' },
```

- [ ] **Step 5: footer에서 `/region` `<li>` 제거**

`app/(public)/_components/footer.tsx:21` 삭제(같은 목록 17행에 `/list` "실거래가"가 이미 존재):

```jsx
            <li><Link href="/region">지역별 시세</Link></li>
```

- [ ] **Step 6: 타입체크 + 사이트맵 테스트 회귀**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/sitemap.test.ts`
Expected: PASS — 기존 단언(`/life`·`LIFE_GROUPS`·`/urban/parking`·`loan`·`/board`)은 `/region`을 참조하지 않으므로 무영향(회귀 없음 증명).

- [ ] **Step 7: 이 태스크 범위의 링크 잔존 0 확인**

Run: `grep -rn '/region' lib/sitemap app/robots.ts "app/(public)/sitemap/page.tsx" "app/(public)/_components/footer.tsx"`
Expected: 0건.

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "chore(seo): 사이트맵·robots·footer의 /region 링크 제거"
```

---

### Task 3: `/region` 전용 고아 심볼·테스트 제거 (`regionBlurb`·`sidoFromHubCode`)

**Files:**
- Modify: `lib/seo/blurb.ts:80-109` (`RegionBlurbInput` + `regionBlurb` 제거)
- Modify: `tests/lib/blurb.test.ts` (import·`region` 픽스처·`regionBlurb` describe 제거)
- Modify: `lib/region.ts:173-181` (`sidoFromHubCode` + 주석 제거)
- Modify: `tests/lib/region.test.ts` (import에서 `sidoFromHubCode` 제거 + describe 51-66 제거)

**Interfaces:**
- Consumes: Task 1(유일 소비처 `region/[code]/page.tsx` 삭제 완료).
- Produces: 없음(순수 정리). `formatBillion` import는 `propertyBlurb` 등이 계속 사용하므로 유지.

- [ ] **Step 1: `blurb.ts`에서 `RegionBlurbInput` + `regionBlurb` 제거**

`lib/seo/blurb.ts`에서 아래 두 선언(80-109행) 전체 삭제. `propertyBlurb`·`propertyMetaDescription`·`subscriptionBlurb`·`salePriceTrend`·`import { formatBillion }`는 유지:

```ts
export interface RegionBlurbInput {
  fullName: string;
  complexCount: number;
  txCount12m: number;
  saleAvgPrice12m: number | null;
  jeonseAvgDeposit12m: number | null;
  priceMin: number | null;
  priceMax: number | null;
  topComplexNames: string[];
}

export function regionBlurb(i: RegionBlurbInput): string {
  // ... (본문 전체)
}
```

- [ ] **Step 2: `blurb.test.ts` 정리**

2행 import에서 `regionBlurb`·`RegionBlurbInput` 제거:

```ts
import { salePriceTrend, propertyBlurb, type PropertyBlurbInput } from '@/lib/seo/blurb';
```

그리고 `const region: RegionBlurbInput = {...}` 픽스처(65-74행)와 `describe('regionBlurb', () => {...})` 블록(76-89행)을 삭제.

- [ ] **Step 3: `lib/region.ts`에서 `sidoFromHubCode` 제거**

`lib/region.ts`의 아래 JSDoc 주석(173-177행)과 함수(178-181행)를 삭제:

```ts
/**
 * 시도 허브 코드 판별. /region 인덱스의 RegionCard가 시도 10자리 코드를 5자리로 잘라
 * `/region/{prefix}000`(예 '11000'=서울)으로 링크하므로, 이 형태면 시도 단축명을 반환한다.
 * 시군구 코드(끝 3자리 ≠ '000')·미지의 prefix는 null.
 */
export function sidoFromHubCode(code: string): string | null {
  if (!/^\d{2}000$/.test(code)) return null;
  return sidoFromPrefix(code.slice(0, 2)) ?? null;
}
```

- [ ] **Step 4: `region.test.ts` 정리**

2행 import에서 `sidoFromHubCode` 제거:

```ts
import { sidoPrefix, sidoFromPrefix, shortSidoFromRegionCode, sidoFullName, getPopularSigungus } from '@/lib/region';
```

그리고 `describe('sidoFromHubCode', () => {...})` 블록(51-66행)을 삭제.

- [ ] **Step 5: 타입체크 + 유닛 테스트 회귀**

Run: `pnpm typecheck`
Expected: PASS(잔존 소비처 없음).

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/blurb.test.ts tests/lib/region.test.ts`
Expected: PASS — 남은 describe(`salePriceTrend`·`propertyBlurb`·`sidoFullName`·`sidoPrefix`·`sidoFromPrefix`·`shortSidoFromRegionCode`·`getPopularSigungus`)만 실행되고 통과.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor(seo): /region 전용 고아 심볼(regionBlurb·sidoFromHubCode)·테스트 제거"
```

---

### Task 4: ISR 재검증 파이프라인의 `/region` 경로 제거 + 최종 회귀

**Files:**
- Modify: `scripts/ingest/transactions/runner.ts` (6·88·103·134·151·230행의 `regionPath`/`affectedRegionCodes`/`affectedRegions` 메커니즘 제거)
- Modify: `scripts/ingest/revalidator.ts:31-33` (`regionPath` 함수 제거)

**Interfaces:**
- Consumes: Task 1(라우트 삭제).
- Produces: 일일 실거래 수집이 더 이상 `/region/{code}`를 재검증 큐에 넣지 않음. `propertyPath` 기반 property 재검증은 유지 → 데이터 신선도 무영향.

> `affectedRegionCodes`(Set)는 오직 삭제 대상인 `regionPath` push(134행)를 위해 존재하므로 메커니즘 전체를 제거한다(선언·runOne 인자·파라미터·`.add`).

- [ ] **Step 1: `runner.ts` import에서 `regionPath` 제거**

6행:

```ts
import { revalidatePaths, propertyPath, regionPath } from '@/scripts/ingest/revalidator';
```

→

```ts
import { revalidatePaths, propertyPath } from '@/scripts/ingest/revalidator';
```

- [ ] **Step 2: `affectedRegionCodes` 선언 제거 (88행)**

삭제:

```ts
  const affectedRegionCodes = new Set<string>();
```

- [ ] **Step 3: `runOne` 호출에서 마지막 인자 제거 (103행)**

```ts
            const upserted = await runOne(adapter, sgg, regionCode, yyyymm, affectedPropertyIds, affectedRegionCodes);
```

→

```ts
            const upserted = await runOne(adapter, sgg, regionCode, yyyymm, affectedPropertyIds);
```

- [ ] **Step 4: `daily` 재검증에서 region push 제거 (134행)**

삭제:

```ts
    for (const sgg of affectedRegionCodes) paths.push(regionPath(sgg));
```

(위 `for (const p of props) paths.push(propertyPath(...))`와 `await revalidatePaths(paths)`는 유지.)

- [ ] **Step 5: `runOne` 시그니처에서 `affectedRegions` 파라미터 제거 (145-152행)**

```ts
async function runOne(
  adapter: Adapter,
  sigungu: string,
  regionCode: string,
  yyyymm: string,
  affectedProps: Set<bigint>,
  affectedRegions: Set<string>,
): Promise<number> {
```

→ `affectedRegions: Set<string>,` 줄 제거:

```ts
async function runOne(
  adapter: Adapter,
  sigungu: string,
  regionCode: string,
  yyyymm: string,
  affectedProps: Set<bigint>,
): Promise<number> {
```

- [ ] **Step 6: `runOne` 내부 `.add` 제거 (228-231행)**

```ts
    for (const { property, row } of resolved) {
      affectedProps.add(property.id);
      affectedRegions.add(row.sigunguCode);
    }
```

→

```ts
    for (const { property, row } of resolved) {
      affectedProps.add(property.id);
    }
```

- [ ] **Step 7: `revalidator.ts`에서 `regionPath` 함수 제거 (31-33행)**

삭제:

```ts
export function regionPath(sigunguCode: string): string {
  return `/region/${sigunguCode}`;
}
```

- [ ] **Step 8: 타입체크 + 수집 테스트 회귀**

Run: `pnpm typecheck`
Expected: PASS(미해결 참조 없음).

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest`
Expected: PASS (수집 어댑터 테스트는 `regionPath`/`affectedRegions`를 참조하지 않음).

- [ ] **Step 9: 최종 링크 잔존 스윕 — 리다이렉트 설정만 남는지 확인**

Run: `grep -rn "'/region\|\"/region\|/region/" app lib components scripts --include='*.ts' --include='*.tsx'`
Expected: **`next.config.mjs`의 `source: '/region'`·`source: '/region/:code'` 2건만** 출력(=리다이렉트 규칙, 의도된 잔존). 그 외 0건.

- [ ] **Step 10: 전체 회귀(typecheck + unit)**

Run: `pnpm typecheck && pnpm test:unit`
Expected: PASS. (`tests/lib`·`tests/ingest`·`tests/components` 전부 green. 참고: DB 집계 일부 테스트는 병렬 flake 가능 — 실패 시 해당 파일 단독 재실행으로 확인.)

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "refactor(ingest): /region ISR 재검증 경로 제거"
```

---

## Self-Review

**1. Spec coverage** (`2026-07-02-remove-region-subtree-design.md` 대비):
- §1 라우트 삭제 + 308 리다이렉트 2규칙 → **Task 1** ✅
- §2 footer·HTML사이트맵·robots·static-entries·sources → **Task 2** ✅
- §3 ISR 파이프라인(runner·revalidator `regionPath`) → **Task 4** ✅
- §4 고아 삭제(region-card→Task 1; regionBlurb·sidoFromHubCode→Task 3) + 테스트 정리(e2e→Task 1; blurb·region 유닛→Task 3) ✅
- §5 검증(tsc·vitest·잔존 grep·리다이렉트 스모크) → 각 Task Step + Task 4 Step 9-10 ✅
- §6 범위 밖(`lib/revalidate.ts`·`sitemap.test.ts`의 /life·Search Console·docs) → Global Constraints에 명시, 태스크 없음(의도) ✅

**2. Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 스텝에 실제 코드·명령·기대출력 포함.

**3. Type consistency:** `regionBlurb`/`RegionBlurbInput`/`sidoFromHubCode`/`regionPath`/`affectedRegions`(Set<string>) 이름이 정의(제거 대상)와 테스트·소비처에서 일관. `runOne` 시그니처 변경(6번째 인자 제거)이 유일 호출부(103행)와 일치.

**주의(실행 순서 고정):** Task 3은 Task 1 이후에만 안전(삭제 심볼의 유일 소비처가 Task 1에서 제거됨). Task 순서 1→2→3→4 준수.
