# 상가 지점명 표기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 체인 상가의 지점명을 이름에 드러내 `씨유` 여러 줄을 `씨유 포이사거리점`처럼 구분되게 한다.

**Architecture:** 공공데이터가 지점명을 `bizesNm`과 `brchNm` 두 필드에 쪼개 내려주므로, `brchNm`을 새 컬럼 `Store.branchName`에 원본 그대로 저장한다. 결합·노이즈 제거·브랜드 접두 분리는 저장이 아니라 표시 시점의 순수 함수에서 처리해, 규칙을 바꿀 때 약 31만 건을 다시 받지 않아도 되게 한다.

**Tech Stack:** Next.js App Router, Prisma + PostgreSQL(PostGIS), vitest + `react-dom/server` SSR 문자열 단언, pnpm

**참조 스펙:** `docs/superpowers/specs/2026-07-31-store-branch-name-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm** 고정 (`pnpm@9.15.9`, Node >= 20). `npm`/`yarn` 금지.
- ESLint `no-unused-vars`가 **error**다. 매 태스크 끝에 `pnpm lint`를 돌린다.
- vitest는 반드시 dotenv 래퍼로 실행한다: `pnpm exec dotenv -e .env.test -- vitest run <경로>` (`lib/db.ts`가 import 시점에 PrismaClient를 만들어 `DATABASE_URL`을 요구한다).
- 컴포넌트 SSR 테스트는 `tests/components/*-ssr.test.ts` 규약을 따른다. 파일 상단에 `(globalThis as unknown as { React: typeof React }).React = React;` shim 필수.
- 커밋 메시지는 `type(scope): 한글 요약`.
- 작업 브랜치 `feat/store-branch-name`이 이미 체크아웃돼 있다. **새 브랜치를 만들지 않는다.**
- 운영사 노이즈 목록은 `{'코리아'}` 하나다 (코리아세븐㈜). 임의로 늘리지 않는다.
- 브랜드 목록은 정확히 이 11개이며 **최장 일치**로 매칭한다: `세븐일레븐`, `씨유`, `지에스25`, `지에스`, `이마트24`, `미니스톱`, `스토리웨이`, `emart24`, `GS25`, `CU`, `세븐`.
- 브랜드 접두 분리(`splitBrand`)는 **편의점에만** 적용한다. 카페·마트는 결합까지만.
- `displayStoreName`은 **어떤 입력에도 빈 문자열을 반환하지 않는다.** 규칙이 실패하면 원본 `name`으로 되돌아간다.

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `lib/amenity/store-name.ts` | 표시 이름 조립 순수 함수 | 신규 |
| `prisma/schema.prisma` | `Store.branchName` | 수정 |
| `prisma/migrations/<타임스탬프>_store_branch_name/` | 컬럼 추가 | 신규(생성됨) |
| `scripts/ingest/amenities/types.ts` | `NormalizedStore.branchName` | 수정 |
| `scripts/ingest/amenities/adapter-store.ts` | `brchNm` 파싱 | 수정 |
| `scripts/ingest/amenities/runner.ts` | raw upsert 컬럼 추가 | 수정 |
| `lib/amenity/_shared.ts` | 검색 조건 합성 헬퍼 | 수정 |
| `lib/amenity/category.ts` | `AmenityItem.branchName` | 수정 |
| `lib/amenity/adapters/convenience.ts` | select·toItem·검색 | 수정 |
| `lib/amenity/adapters/cafe.ts` | select·toItem·검색 | 수정 |
| `lib/amenity/adapters/mart.ts` | select·toItem·검색 | 수정 |
| `lib/amenity/nearby.ts` | raw select에 `branchName` | 수정 |
| `lib/amenity/infra.ts` | 표시 함수 적용 | 수정 |
| `app/(public)/amenity/[category]/_components/amenity-card.tsx` | 목록 카드 이름 | 수정 |
| `app/(public)/amenity/[category]/[id]/page.tsx` | 상세 h1·breadcrumb·JSON-LD·meta | 수정 |
| `tests/lib/store-name.test.ts` | 규칙 유닛 테스트 | 신규 |
| `tests/ingest/amenities/adapter-store.test.ts` | `brchNm` 파싱 | 수정 |
| `tests/ingest/amenities/fixtures/store-sample.xml` | `brchNm` 포함 픽스처 | 수정 |
| `tests/components/amenity-card-ssr.test.ts` | 카드 렌더 | 신규 |
| `tests/lib/amenity-store-search.test.ts` | 검색 조건 합성 | 신규 |

---

### Task 1: 표시 이름 조립 함수

가장 먼저 만든다. DB에 의존하지 않아 완전히 테스트 가능하고, 이후 모든 태스크가 이 함수를 쓴다.

**Files:**
- Create: `lib/amenity/store-name.ts`
- Test: `tests/lib/store-name.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, import 없음)
- Produces: `displayStoreName(store: { name: string; branchName?: string | null }, opts?: { splitBrand?: boolean }): string` — Task 4가 이 시그니처로 호출한다. `opts.splitBrand` 기본값은 `false`.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/store-name.test.ts` 를 새로 만든다. 값은 전부 공공데이터 API 실측에서 가져온 실제 레코드다.

```ts
import { describe, it, expect } from 'vitest';
import { displayStoreName } from '@/lib/amenity/store-name';

const split = { splitBrand: true };

describe('displayStoreName — 브랜드 분리(편의점)', () => {
  it('brchNm 꼬리를 결합하고 브랜드 뒤에 공백을 넣는다', () => {
    expect(displayStoreName({ name: '씨유켄싱턴리조트', branchName: '남원점' }, split))
      .toBe('씨유 켄싱턴리조트남원점');
    expect(displayStoreName({ name: '미니스톱', branchName: '서울역점' }, split))
      .toBe('미니스톱 서울역점');
    expect(displayStoreName({ name: '이마트24R정왕', branchName: '행복점' }, split))
      .toBe('이마트24 R정왕행복점');
  });

  it('brchNm이 없으면 name만으로 분리한다', () => {
    expect(displayStoreName({ name: '세븐일레븐포이중앙', branchName: null }, split))
      .toBe('세븐일레븐 포이중앙');
    expect(displayStoreName({ name: '씨유중구정동길점', branchName: '' }, split))
      .toBe('씨유 중구정동길점');
  });

  it('운영사 노이즈 코리아를 버리고 점주 꼬리를 점으로 되돌린다', () => {
    expect(displayStoreName({ name: '세븐혜화점주', branchName: '코리아' }, split))
      .toBe('세븐 혜화점');
    expect(displayStoreName({ name: '세븐효창공원점', branchName: '코리아' }, split))
      .toBe('세븐 효창공원점');
  });

  it('브랜드는 최장 일치로 고른다', () => {
    // '세븐'이 아니라 '세븐일레븐'
    expect(displayStoreName({ name: '세븐일레븐영등포', branchName: '본점' }, split))
      .toBe('세븐일레븐 영등포본점');
    // '지에스'가 아니라 '지에스25'
    expect(displayStoreName({ name: '지에스25익산', branchName: '오거리점' }, split))
      .toBe('지에스25 익산오거리점');
    // 25 없는 표기도 잡는다
    expect(displayStoreName({ name: '지에스노원하계점', branchName: null }, split))
      .toBe('지에스 노원하계점');
  });
});

describe('displayStoreName — 폴백', () => {
  it('브랜드를 못 찾으면 결합 결과를 그대로 준다', () => {
    expect(displayStoreName({ name: '금성세일마트', branchName: null }, split))
      .toBe('금성세일마트');
  });

  it('지점부가 비면 원본 name을 준다 (브랜드 뒤 공백만 남기지 않는다)', () => {
    expect(displayStoreName({ name: '씨유', branchName: null }, split)).toBe('씨유');
    expect(displayStoreName({ name: 'GS25', branchName: '' }, split)).toBe('GS25');
  });

  it('branchName이 코리아뿐이면 name만 남는다', () => {
    expect(displayStoreName({ name: '에이원', branchName: '코리아' }, split)).toBe('에이원');
  });

  it('빈 name은 그대로 반환한다', () => {
    expect(displayStoreName({ name: '', branchName: '서울역점' }, split)).toBe('');
  });
});

describe('displayStoreName — splitBrand 없음(카페·마트)', () => {
  it('결합만 하고 공백을 넣지 않는다', () => {
    expect(displayStoreName({ name: '컴포즈커피서산', branchName: '석림점' }))
      .toBe('컴포즈커피서산석림점');
    expect(displayStoreName({ name: '메가엠지씨커피', branchName: '구리돌다리점' }))
      .toBe('메가엠지씨커피구리돌다리점');
  });

  it('splitBrand 없이도 운영사 노이즈는 버린다', () => {
    expect(displayStoreName({ name: '세븐혜화점주', branchName: '코리아' }))
      .toBe('세븐혜화점');
  });

  it('branchName이 없으면 name 그대로다', () => {
    expect(displayStoreName({ name: '이디야커피', branchName: null }))
      .toBe('이디야커피');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/lib/store-name.test.ts
```

Expected: FAIL — `lib/amenity/store-name.ts`가 없어 import 에러(`Failed to resolve import`).

- [ ] **Step 3: 구현**

`lib/amenity/store-name.ts` 를 새로 만든다.

```ts
// lib/amenity/store-name.ts

/**
 * 공공데이터 상가업소 정보는 지점명을 bizesNm(상호명)과 brchNm(지점명)에 쪼개 내려준다.
 * brchNm은 독립된 지점명이 아니라 bizesNm에서 잘려나간 꼬리라, 공백 없이 이어붙여야
 * 원래 상호가 복원된다. (예: '씨유켄싱턴리조트' + '남원점' → '씨유켄싱턴리조트남원점')
 */

/** brchNm에 지점명 대신 운영사 상호가 흘러든 값. 코리아세븐㈜(세븐일레븐 운영사). */
const OPERATOR_NOISE = new Set(['코리아']);

/**
 * 편의점 브랜드 접두. 최장 일치로 매칭해야 '세븐일레븐'이 '세븐'보다,
 * '지에스25'가 '지에스'보다 먼저 잡힌다.
 */
const BRANDS = [
  '세븐일레븐',
  '씨유',
  '지에스25',
  '지에스',
  '이마트24',
  '미니스톱',
  '스토리웨이',
  'emart24',
  'GS25',
  'CU',
  '세븐',
];

const BRANDS_LONGEST_FIRST = [...BRANDS].sort((a, b) => b.length - a.length);

/**
 * 목록·상세에 노출할 상가 이름을 만든다.
 * splitBrand가 참이면 브랜드 접두 뒤에 공백을 넣어 '씨유 포이사거리점' 형태로 만든다.
 * 규칙이 어디서든 실패하면 원본 name으로 되돌아가며, 빈 문자열을 반환하지 않는다.
 */
export function displayStoreName(
  store: { name: string; branchName?: string | null },
  opts?: { splitBrand?: boolean },
): string {
  const name = store.name?.trim() ?? '';
  if (!name) return name;

  const branch = store.branchName?.trim() ?? '';
  const usableBranch = OPERATOR_NOISE.has(branch) ? '' : branch;

  // 공백 없이 결합한 뒤, 운영사 상호가 붙어 생긴 '…점주' 꼬리를 '…점'으로 되돌린다.
  const combined = (name + usableBranch).replace(/점주$/, '점');
  if (!combined) return name;
  if (!opts?.splitBrand) return combined;

  for (const brand of BRANDS_LONGEST_FIRST) {
    if (combined.toUpperCase().startsWith(brand.toUpperCase())) {
      const rest = combined.slice(brand.length);
      // 브랜드만 있고 지점부가 없으면 '씨유 ' 같은 값이 되므로 원본을 쓴다.
      if (!rest) return name;
      return `${combined.slice(0, brand.length)} ${rest}`;
    }
  }
  return combined;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/lib/store-name.test.ts
```

Expected: 11개 케이스 전부 PASS.

- [ ] **Step 5: lint · typecheck**

```bash
pnpm lint && pnpm typecheck
```

Expected: 둘 다 통과.

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/store-name.ts tests/lib/store-name.test.ts
git commit -m "feat(amenity): 상가 표시 이름 조립 함수 추가"
```

---

### Task 2: 스키마 · 수집에 `branchName` 추가

**Files:**
- Modify: `prisma/schema.prisma` (`model Store`)
- Create: `prisma/migrations/<타임스탬프>_store_branch_name/migration.sql` (Prisma가 생성)
- Modify: `scripts/ingest/amenities/types.ts` (`NormalizedStore`)
- Modify: `scripts/ingest/amenities/adapter-store.ts` (`parseStoreXml`)
- Modify: `scripts/ingest/amenities/runner.ts` (`ingestStores`, 329-356행)
- Modify: `tests/ingest/amenities/fixtures/store-sample.xml`
- Modify: `tests/ingest/amenities/adapter-store.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `Store.branchName` (nullable `VarChar(60)`) 컬럼과 `NormalizedStore.branchName: string | null` 필드. Task 3이 이 컬럼을 조회한다.

- [ ] **Step 1: 픽스처에 `brchNm` 추가**

`tests/ingest/amenities/fixtures/store-sample.xml`의 두 `<item>`에 `brchNm`을 넣는다. 첫 번째는 값 있음, 두 번째는 빈 값으로 두어 양쪽 경로를 덮는다. `<bizesNm>` 다음 줄에 각각 추가한다.

첫 번째 item (`B001`, 스타벅스 강남점):

```xml
        <brchNm>강남점</brchNm>
```

두 번째 item (`B002`, GS25 역삼점):

```xml
        <brchNm></brchNm>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/ingest/amenities/adapter-store.test.ts`의 `describe('adapter-store', ...)` 안 마지막 `it` 뒤에 추가한다. 이 파일은 최상단에 `const xml = readFileSync(...)`이 이미 있고 행을 `sourceId`로 찾는 스타일이니 그대로 따른다.

```ts
  it('brchNm을 branchName으로 파싱하고, 비면 null로 둔다', () => {
    const { rows } = parseStoreXml(xml);
    const sb = rows.find((r) => r.sourceId === 'B001');
    const gs = rows.find((r) => r.sourceId === 'B002');
    expect(sb!.branchName).toBe('강남점');
    expect(gs!.branchName).toBeNull();
  });
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/amenities/adapter-store.test.ts
```

Expected: FAIL — `branchName` 속성이 없어 `undefined`가 나오고 `toBe('강남점')`이 깨진다.

- [ ] **Step 4: `NormalizedStore`에 필드 추가**

`scripts/ingest/amenities/types.ts`의 `NormalizedStore`에 `industryName` 다음 줄로 추가한다.

```ts
  /** 공공데이터 brchNm 원본. 가공은 표시 시점(lib/amenity/store-name.ts)에서 한다. */
  branchName: string | null;
```

- [ ] **Step 5: 어댑터에서 `brchNm` 읽기**

`scripts/ingest/amenities/adapter-store.ts`의 `rows.push({...})` 안, `name` 다음 줄에 추가한다. 이름·주소와 같은 이유로 HTML 엔티티를 디코딩하고, 빈 문자열은 `null`로 정규화한다.

```ts
      branchName: decodeEntities(String(item.brchNm ?? '').trim()) || null,
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/ingest/amenities/adapter-store.test.ts
```

Expected: 전부 PASS.

- [ ] **Step 7: 스키마에 컬럼 추가**

`prisma/schema.prisma`의 `model Store`에서 `industryName` 다음 줄에 추가한다.

```prisma
  branchName   String?                               @db.VarChar(60)
```

- [ ] **Step 8: 마이그레이션 작성 (손으로)**

> **정정 (2026-07-31, 실행 중 발견):** 이 단계는 원래 `pnpm prisma:migrate --name store_branch_name`
> (= `prisma migrate dev`)이었는데 **틀린 지시였다.** 이 저장소는 마이그레이션을 손으로 쓴다 —
> `prisma/migrations/20260729000000_add_property_dedupe_unique/migration.sql`을 보면 한글 근거
> 주석이 달린 수작업 SQL이고 타임스탬프도 `...000000`처럼 수동으로 고른 값이다.
> `migrate dev`를 돌리면 로컬 docker DB에 남은 롤백된 마이그레이션 기록 때문에 **전체 스키마
> RESET을 요구하며 멈춘다.** 절대 확인하지 말 것 — 데이터가 날아간다.

폴더와 파일을 직접 만든다. 타임스탬프는 작성일 기준으로 고른다.

```
prisma/migrations/20260731000000_add_store_branch_name/migration.sql
```

```sql
-- 공공데이터 상가업소 정보는 지점명을 bizesNm(상호명)과 brchNm(지점명)에 쪼개 내려준다.
-- brchNm은 독립된 지점명이 아니라 bizesNm에서 잘려나간 꼬리라, 원본을 그대로 보관하고
-- 결합·정리는 표시 시점(lib/amenity/store-name.ts)에서 한다.
--
-- nullable인 이유: 기존 약 31만 행은 재수집 전까지 NULL이며, 표시 함수가 NULL이면
-- name만으로 동작하므로 코드가 먼저 배포돼도 화면이 깨지지 않는다.
ALTER TABLE "Store" ADD COLUMN "branchName" VARCHAR(60);
```

적용한다. `migrate deploy`는 dev 모드의 드리프트 검사를 하지 않아 RESET을 요구하지 않는다.

```bash
pnpm exec dotenv -e .env.local -- prisma migrate deploy
pnpm exec dotenv -e .env.local -- prisma migrate status
git status --short prisma/migrations/
```

Expected: `migrate status`가 up to date를 보고하고 마이그레이션 수가 하나 늘어난다. `git status`에는 **이번에 만든 폴더 하나만** 보여야 한다. 다른 폴더가 같이 나오면 `git add`에 포함하지 말고 사용자에게 보고한다.

- [ ] **Step 9: 수집 upsert에 컬럼 반영**

`scripts/ingest/amenities/runner.ts` 336-350행의 세 곳을 모두 고친다. **한 곳이라도 빠지면 컬럼 개수가 안 맞아 런타임에 깨진다.**

값 튜플 (`${r.industryName ?? null}` 다음에 삽입):

```ts
        Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.industryCode ?? null}, ${r.industryName ?? null}, ${r.branchName ?? null}, ${r.sigunguCode}, ${locationSql(r.lat, r.lng)}, NOW())`,
```

INSERT 컬럼 목록:

```sql
        INSERT INTO "Store" ("sourceId", name, address, "industryCode", "industryName", "branchName", "sigunguCode", location, "updatedAt")
```

DO UPDATE SET (`"industryName" = EXCLUDED."industryName",` 다음 줄):

```sql
          "branchName" = EXCLUDED."branchName",
```

- [ ] **Step 10: 전체 유닛 테스트 · lint · typecheck**

```bash
pnpm test:unit && pnpm lint && pnpm typecheck
```

Expected: 전부 통과.

- [ ] **Step 11: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations scripts/ingest/amenities/types.ts scripts/ingest/amenities/adapter-store.ts scripts/ingest/amenities/runner.ts tests/ingest/amenities/
git commit -m "feat(ingest): 상가 지점명(brchNm) 수집 및 컬럼 추가"
```

---

### Task 3: 조회 계층에 `branchName` 노출 + 검색 보정

**Files:**
- Modify: `lib/amenity/_shared.ts` (검색 헬퍼 추가)
- Modify: `lib/amenity/category.ts` (`AmenityItem`)
- Modify: `lib/amenity/adapters/convenience.ts`
- Modify: `lib/amenity/adapters/cafe.ts`
- Modify: `lib/amenity/adapters/mart.ts`
- Modify: `lib/amenity/nearby.ts`
- Test: `tests/lib/amenity-store-search.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Store.branchName` 컬럼
- Produces:
  - `AmenityItem.branchName?: string | null` — Task 4가 읽는다.
  - `applyStoreNameSearch(where: Prisma.StoreWhereInput, q: string | undefined): void` (`lib/amenity/_shared.ts`)
  - `NearbyStore.branchName: string | null` — Task 4의 `infra.ts`가 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/amenity-store-search.test.ts` 를 새로 만든다. `mart.ts`가 업종 필터에 이미 `where.OR`을 쓰기 때문에, 검색을 `OR`로 덮어쓰면 마트 필터가 조용히 깨진다. 그 회귀를 막는 것이 이 테스트의 핵심이다.

```ts
import { describe, it, expect } from 'vitest';
import { applyStoreNameSearch } from '@/lib/amenity/_shared';
import { buildMartWhere } from '@/lib/amenity/adapters/mart';
import { buildStoreWhere } from '@/lib/amenity/adapters/convenience';
import type { Prisma } from '@prisma/client';

describe('applyStoreNameSearch', () => {
  it('q가 없으면 where를 건드리지 않는다', () => {
    const where: Prisma.StoreWhereInput = { sigunguCode: '11140' };
    applyStoreNameSearch(where, undefined);
    expect(where).toEqual({ sigunguCode: '11140' });
  });

  it('name과 branchName 중 하나만 맞아도 걸리게 한다', () => {
    const where: Prisma.StoreWhereInput = {};
    applyStoreNameSearch(where, '서울역점');
    expect(where.AND).toEqual([
      { OR: [{ name: { contains: '서울역점' } }, { branchName: { contains: '서울역점' } }] },
    ]);
  });

  it('기존 OR(업종 필터)을 덮어쓰지 않는다', () => {
    const where: Prisma.StoreWhereInput = {
      OR: [{ industryCode: { startsWith: 'G20404' } }, { industryCode: { startsWith: 'G20402' } }],
    };
    applyStoreNameSearch(where, '이마트');
    expect(where.OR).toHaveLength(2); // 업종 OR 그대로
    expect(where.AND).toHaveLength(1); // 검색은 AND로 합성
  });
});

describe('어댑터 where 조립', () => {
  it('마트: 업종 OR과 검색이 공존한다', () => {
    const where = buildMartWhere({ q: '이마트' });
    expect(where.OR).toHaveLength(2);
    expect(where.AND).toHaveLength(1);
  });

  it('편의점: 업종 접두를 유지한 채 검색이 붙는다', () => {
    const where = buildStoreWhere({ q: '서울역점' });
    expect(where.industryCode).toEqual({ startsWith: 'G20405' });
    expect(where.AND).toHaveLength(1);
  });

  it('편의점: q가 없으면 AND가 생기지 않는다', () => {
    const where = buildStoreWhere({ sigunguCode: '11140' });
    expect(where.AND).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-store-search.test.ts
```

Expected: FAIL — `applyStoreNameSearch` export가 없어 import 에러.

- [ ] **Step 3: 검색 헬퍼 추가**

`lib/amenity/_shared.ts` 끝에 추가한다. 파일 상단에 `import type { Prisma } from '@prisma/client';`가 없으면 함께 추가한다.

```ts
/**
 * 상가 이름 검색 조건을 where에 합성한다.
 * name과 branchName이 따로 저장돼 있어(예: name='미니스톱', branchName='서울역점')
 * 화면에 보이는 '미니스톱 서울역점'으로 검색하려면 두 컬럼을 함께 봐야 한다.
 *
 * where.OR을 직접 쓰지 않고 AND로 합성하는 이유: mart 어댑터가 업종 필터에
 * 이미 where.OR을 쓰고 있어, 덮어쓰면 마트 목록에 다른 업종이 섞인다.
 */
export function applyStoreNameSearch(
  where: Prisma.StoreWhereInput,
  q: string | undefined,
): void {
  if (!q) return;
  const clause: Prisma.StoreWhereInput = {
    OR: [{ name: { contains: q } }, { branchName: { contains: q } }],
  };
  const existing = where.AND;
  where.AND = existing
    ? [...(Array.isArray(existing) ? existing : [existing]), clause]
    : [clause];
}
```

- [ ] **Step 4: 세 어댑터의 검색 교체**

`convenience.ts`, `cafe.ts`, `mart.ts` 각각에서 아래 한 줄을 찾아

```ts
  if (f.q) where.name = { contains: f.q };
```

이렇게 바꾼다.

```ts
  applyStoreNameSearch(where, f.q);
```

세 파일 모두 상단 import에 추가한다. 기존에 `AMENITY_PER_PAGE`를 `_shared`에서 가져오고 있으므로 그 import 문에 합친다.

```ts
import { AMENITY_PER_PAGE as PER_PAGE, applyStoreNameSearch } from '@/lib/amenity/_shared';
```

`market.ts`는 `Store` 테이블이 아니므로 **건드리지 않는다.**

- [ ] **Step 5: `AmenityItem`에 필드 추가**

`lib/amenity/category.ts`의 `AmenityItem`에서 `industryName` 다음 줄에 추가한다.

```ts
  branchName?: string | null;
```

- [ ] **Step 6: 세 어댑터의 select·toItem 확장**

`convenience.ts`, `cafe.ts`, `mart.ts` 각각에서:

`toItem`의 파라미터 타입에 `industryName: string | null;` 다음 줄로 추가:

```ts
  branchName: string | null;
```

`toItem`의 반환 객체에 `industryName: s.industryName,` 다음 줄로 추가:

```ts
    branchName: s.branchName,
```

`getList`와 `getById`의 `select:` 블록 두 곳 모두에 `industryName: true,` 다음 줄로 추가:

```ts
      branchName: true,
```

**세 파일 × (toItem 타입 1 + toItem 반환 1 + select 2) = 12곳이다.** `getById`의 select를 빠뜨리면 상세 페이지에서만 지점명이 사라지므로, 파일마다 `select:`를 grep해 두 곳 다 고쳤는지 확인한다.

- [ ] **Step 7: `nearby.ts`의 raw 쿼리 확장**

`lib/amenity/nearby.ts`의 `NearbyStore` 인터페이스(28행 부근 `industryName` 다음)에 추가:

```ts
  branchName: string | null;
```

같은 파일 raw SQL의 `"industryName",` 다음 줄에 추가(99행 부근):

```sql
      "branchName",
```

- [ ] **Step 8: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-store-search.test.ts
```

Expected: 6개 케이스 전부 PASS.

- [ ] **Step 9: 전체 유닛 테스트 · lint · typecheck**

```bash
pnpm test:unit && pnpm lint && pnpm typecheck
```

Expected: 전부 통과. typecheck가 `branchName` 누락을 잡아주므로 Step 6에서 빠뜨린 곳이 있으면 여기서 드러난다.

- [ ] **Step 10: 커밋**

```bash
git add lib/amenity/ tests/lib/amenity-store-search.test.ts
git commit -m "feat(amenity): 지점명 조회 노출 및 이름 검색에 지점명 포함"
```

---

### Task 4: 화면에 표시 적용

**Files:**
- Modify: `app/(public)/amenity/[category]/_components/amenity-card.tsx`
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx`
- Modify: `lib/amenity/infra.ts`
- Test: `tests/components/amenity-card-ssr.test.ts`

**Interfaces:**
- Consumes: Task 1의 `displayStoreName(store, opts)`, Task 3의 `AmenityItem.branchName`·`NearbyStore.branchName`
- Produces: 없음 (표시 계층 종단)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/amenity-card-ssr.test.ts` 를 새로 만든다.

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityCard } from '@/app/(public)/amenity/[category]/_components/amenity-card';
import { convenienceDef } from '@/lib/amenity/adapters/convenience';
import { cafeDef } from '@/lib/amenity/adapters/cafe';
import type { AmenityItem } from '@/lib/amenity/category';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. (related-guides-ssr.test.ts와 동일 shim)
(globalThis as unknown as { React: typeof React }).React = React;

const base: AmenityItem = {
  id: 1n,
  name: '미니스톱',
  address: '서울특별시 중구 소월로 10',
  sigunguCode: '11140',
  industryCode: 'G20405',
  industryName: '편의점',
  branchName: '서울역점',
};

describe('AmenityCard 이름 표기', () => {
  it('편의점은 브랜드 뒤에 공백을 넣어 지점명을 보여준다', () => {
    const html = renderToStaticMarkup(createElement(AmenityCard, { item: base, def: convenienceDef }));
    expect(html).toContain('미니스톱 서울역점');
  });

  it('카페는 결합만 하고 공백을 넣지 않는다', () => {
    const item: AmenityItem = {
      ...base,
      name: '컴포즈커피서산',
      branchName: '석림점',
      industryCode: 'I21201',
      industryName: '카페',
    };
    const html = renderToStaticMarkup(createElement(AmenityCard, { item, def: cafeDef }));
    expect(html).toContain('컴포즈커피서산석림점');
  });

  it('branchName이 없으면 기존 이름 그대로다', () => {
    const item: AmenityItem = { ...base, name: '에이원', branchName: null };
    const html = renderToStaticMarkup(createElement(AmenityCard, { item, def: convenienceDef }));
    expect(html).toContain('에이원');
  });

  it('주소는 그대로 유지한다', () => {
    const html = renderToStaticMarkup(createElement(AmenityCard, { item: base, def: convenienceDef }));
    expect(html).toContain('서울특별시 중구 소월로 10');
  });
});
```

export 이름은 확인해 둔 그대로다 — `convenienceDef`(`adapters/convenience.ts:116`), `cafeDef`(`adapters/cafe.ts:116`), `martDef`(`adapters/mart.ts:143`).

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/amenity-card-ssr.test.ts
```

Expected: FAIL — 카드가 아직 `item.name`만 렌더해 `'미니스톱 서울역점'`이 아니라 `'미니스톱'`만 나온다.

- [ ] **Step 3: 카드에 적용**

`app/(public)/amenity/[category]/_components/amenity-card.tsx`를 아래로 교체한다. 바뀌는 곳은 import 한 줄, `displayName` 계산 한 줄, `<h3>` 내용뿐이다.

```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { displayStoreName } from '@/lib/amenity/store-name';
import type { AmenityCategoryDef, AmenityItem } from '@/lib/amenity/category';

export function AmenityCard({ item, def }: { item: AmenityItem; def: AmenityCategoryDef }) {
  const summary = def.inferRowSummary(item);
  // 브랜드 접두 분리는 소수 브랜드가 지배하는 편의점에서만 의미가 있다.
  const displayName = displayStoreName(item, { splitBrand: def.slug === 'convenience' });
  return (
    <Link href={`/amenity/${def.slug}/${item.id}`}>
      <article className="flex items-center gap-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-sky)]">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-sky-soft)] text-2xl">{def.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{displayName}</h3>
            {summary && <Badge tone="blue">{summary}</Badge>}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-muted)]">{item.address}</p>
        </div>
        <span className="shrink-0 text-xs text-[var(--color-muted)]">상세 →</span>
      </article>
    </Link>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/components/amenity-card-ssr.test.ts
```

Expected: 4개 케이스 전부 PASS.

- [ ] **Step 5: 상세 페이지에 적용**

`app/(public)/amenity/[category]/[id]/page.tsx`에서 `item.name`이 쓰이는 곳을 표시 이름으로 바꾼다. 먼저 import를 추가한다.

```ts
import { displayStoreName } from '@/lib/amenity/store-name';
```

`generateMetadata` 안에서 `const locality = ...` 다음 줄에 추가하고, 이어지는 `title`·`description`의 `item.name`을 `displayName`으로 바꾼다.

```ts
  const displayName = displayStoreName(item, { splitBrand: def.slug === 'convenience' });
```

본문 컴포넌트에서도 `const item = await getAmenityById(...)` 다음(그리고 `item` null 체크 이후)에 같은 줄을 추가하고, 아래 네 곳의 `item.name`을 `displayName`으로 바꾼다.

- JSON-LD의 `name:` (106행 부근)
- breadcrumb JSON-LD의 마지막 항목 `name:` (115행 부근)
- 화면 breadcrumb `<span>` (128행 부근)
- 히어로에 넘기는 `name={item.name}` (145행 부근)

`item.address`를 쓰는 곳은 건드리지 않는다.

- [ ] **Step 6: 주변 인프라 목록에 적용**

`lib/amenity/infra.ts`에서 `Store` 기반 항목 세 줄(72·74·90행 부근 — `mart`, `cafe`, `etc`)의 `name: s.name`을 바꾼다. 파일 상단에 import를 추가한다.

```ts
import { displayStoreName } from '@/lib/amenity/store-name';
```

세 곳 모두 동일하게:

```ts
name: displayStoreName(s),
```

여기서는 `splitBrand`를 켜지 않는다. 이 목록은 편의점 전용이 아니라 마트·카페·기타가 섞여 있고, 항목이 좁은 폭에 렌더되기 때문이다.

`hospitals`·`pharmacies`·`parks`·`markets`·`chargers`·`parking`·`childcare`는 `Store`가 아니므로 **건드리지 않는다.**

- [ ] **Step 7: 전체 유닛 테스트 · lint · typecheck**

```bash
pnpm test:unit && pnpm lint && pnpm typecheck
```

Expected: 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add "app/(public)/amenity" lib/amenity/infra.ts tests/components/amenity-card-ssr.test.ts
git commit -m "feat(amenity): 목록·상세·인프라 이름에 지점명 표기"
```

---

### Task 5: 통합 검증

**Files:** 없음 (검증 전용). 문제 발견 시 해당 태스크로 되돌아간다.

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: 없음

**로컬 환경 주의:** `.env.local`은 비어 있는 로컬 docker DB(`localhost:5433`)를 가리킨다. 목록 페이지가 200을 주면서 내용이 비어도 코드 버그가 아니다. 빌드도 `generateStaticParams`가 빈 배열을 반환할 뿐이라 성공한다. 운영 도메인(`imjangon.co.kr`)에 요청을 반복해 보내지 않는다.

- [ ] **Step 1: 전체 게이트**

```bash
pnpm test:unit && pnpm lint && pnpm typecheck
```

Expected: 전부 통과.

- [ ] **Step 2: 빌드**

```bash
pnpm build
```

Expected: 통과. (`ci.yml`에 `pnpm build`가 없어 CI 초록이 빌드 성공을 보장하지 않으므로 여기서 직접 본다.)

- [ ] **Step 3: 마이그레이션 상태 확인**

```bash
pnpm exec dotenv -e .env.local -- prisma migrate status
```

Expected: 이번 마이그레이션이 목록에 보인다. 로컬 DB에 적용돼 있어야 한다.

**운영 마이그레이션은 배포가 자동으로 적용한다** — `deploy/remote-deploy.sh:16`이 `web` 빌드·재시작 전에 `prisma migrate deploy`를 실행하고, `set -euo pipefail`이라 실패 시 배포가 거기서 중단돼 옛 `web`이 계속 서비스된다. 컬럼이 nullable이라 코드가 먼저 나가도 깨지지 않고, 재수집 전에는 적용돼 있어야 한다.

- [ ] **Step 4: 표시 규칙 실측 재확인**

Task 1의 규칙이 실제 데이터에서 기대대로 동작하는지 확인한다. 스펙의 실측 표본과 같은 값들이다.

```bash
pnpm exec dotenv -e .env.test -- vitest run tests/lib/store-name.test.ts
```

Expected: 전부 PASS. 스펙이 약속한 수치(편의점 5,000건 기준 정상 90.0%, 이상값 0%)의 근거가 이 규칙이다.

- [ ] **Step 5: 결과 보고**

사용자에게 보고하고 다음 두 가지를 명시한다.

1. **재수집 전까지는 화면이 지금과 같다.** `branchName`이 전부 null이면 `displayStoreName`은 `name`을 그대로 돌려준다. 재수집(`ingest:amenities` 계열 실행) 후에 지점명이 붙는다.
2. **운영 마이그레이션은 배포가 자동으로 적용하므로 별도 수동 조치가 필요 없다.**

문제가 있으면 해당 태스크로 돌아가 고친 뒤 Step 1부터 다시 돌린다.

---

## 참고: 배포 순서

1. 코드 머지 → 배포가 `web` 빌드·재시작 전에 마이그레이션을 자동 적용(컬럼 추가, nullable이라 무중단). 실패하면 `set -euo pipefail`로 배포가 중단되고 기존 `web`이 계속 서비스된다.
2. 배포 완료 — `branchName`이 전부 null이어도 기존과 동일하게 동작
3. 재수집 실행 — `branchName` 채워지고 이름이 완성됨

3번 전까지 중간 상태에서 깨지는 화면이 없다. `feat/*` → `main` 직접 PR로 머지 즉시 배포되는 단일 트렁크다.
