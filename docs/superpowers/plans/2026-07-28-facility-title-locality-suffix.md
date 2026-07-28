# 시설 상세 title 지역 접미사 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시설 상세 페이지 12종의 `title`에 시군구를 붙여 동명 시설의 중복 제목을 없앤다.

**Architecture:** 제목 조립은 순수 함수 `qualifiedTitle()` 하나로 모으고, 지역 문자열은 주소 파싱 한 경로(`resolveSigunguLabelFromAddress()`)로만 얻는다. 지역 해석에 실패하면 접미사를 생략해 기존과 동일한 문자열을 낸다. DB 스키마·렌더 트리·`robots`·`canonical`은 건드리지 않는다.

**Tech Stack:** Next.js App Router (`generateMetadata`), Prisma, vitest

**설계 문서:** `docs/superpowers/specs/2026-07-28-facility-title-locality-suffix-design.md`

## Global Constraints

- **선행 조건:** PR #262(`fix/region-alias-gwangju-jeonnam`)가 머지돼 있어야 한다. `SIDO_ALIASES`의 `전남광주통합특별시` 항목은 이미 존재하는 것으로 전제한다 — 이 계획에서 다시 추가하지 않는다.
- 표기 형식은 `{name} ({locality}) {tail}` 고정. 괄호는 반각 `(`·`)`, 이름과 괄호 사이 공백 1칸.
- `locality`가 `null`이면 `{name} {tail}` — 수정 전 문자열과 **바이트 단위로 동일**해야 한다.
- 지역 단위는 **시군구 고정**. 읍면동으로 내려가지 않는다.
- 시도는 **이름이 겹치는 시군구에만** 붙인다(전국 243개 중 26곳). 시도 축약명은 `shortSido()`가 낸다.
- 구·군이 없는 시(세종)는 동 이름 대신 시 축약명(`세종`)을 쓴다.
- `description`·`robots`·`alternates.canonical`은 어느 태스크에서도 수정하지 않는다.
- `resolveSigunguFromAddress()`의 시그니처와 동작은 바꾸지 않는다 — 기존 테스트가 회귀 감시선이다.
- 적용 대상 12종: `hospital` `pharmacy` `school` `childcare` `park` `parking` `charger` `convenience` `cafe` `mart` `market` `finance`
- 제외: `board` `jeonse-guarantee` `subscription` `apt` `villa` `officetel`
- 완료 전 `pnpm lint`를 반드시 통과시킨다. `pnpm typecheck`는 미사용 변수를 잡지 못한다(`noUnusedLocals` 없음).

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/seo/title.ts` | 제목 조립 순수 함수 1개 | 생성 |
| `lib/region.ts` | 시도 풀네임 → 축약명 역인덱스 추가 | 수정 |
| `lib/region/from-address.ts` | 주소 → 시군구 코드/라벨. `lib/urban/region-from-address.ts`에서 이동 | 이동+수정 |
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | `generateMetadata` title | 수정 |
| `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` | 〃 | 수정 |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | 〃 | 수정 |
| `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | 〃 | 수정 |
| `app/(public)/amenity/[category]/[id]/page.tsx` | 〃 (4종 공용) | 수정 |
| `app/(public)/urban/[category]/[id]/page.tsx` | 〃 (park·parking 공용) | 수정 |
| `app/(public)/urban/charger/[id]/page.tsx` | 〃 | 수정 |
| `app/(public)/finance/[seq]/page.tsx` | 〃 (기관명 사용) | 수정 |
| `tests/lib/seo-title.test.ts` | `qualifiedTitle` 단위 | 생성 |
| `tests/lib/region-short-sido.test.ts` | `shortSido` 단위 | 생성 |
| `tests/lib/urban-region-from-address.test.ts` | 기존 + 라벨 케이스 | 수정 |
| `tests/components/facility-title-metadata.test.ts` | `generateMetadata` 2종 | 생성 |

**Task 1**이 `lib/seo/title.ts` + `shortSido()`를 만들고, **Task 2**가 파일 이동 + 라벨 함수를 만든다. **Task 3~6**이 라우트를 붙인다. Task 3~6은 서로 독립이라 순서를 바꿔도 된다.

---

### Task 1: `qualifiedTitle` + `shortSido`

두 함수 모두 순수 함수이고 DB를 타지 않는다. 여기서 만들어 두면 Task 2가 `shortSido`를 쓸 수 있다.

**Files:**
- Create: `lib/seo/title.ts`
- Create: `tests/lib/seo-title.test.ts`
- Modify: `lib/region.ts` (`SIDO_LIST` 정의 아래, `shortSidoFromRegionCode` 근처)
- Create: `tests/lib/region-short-sido.test.ts`

**Interfaces:**
- Consumes: `lib/region.ts`의 `SIDO_LIST` (파일 상단 private 상수, `{ code, sido, fullName }[]`)
- Produces:
  - `qualifiedTitle(name: string, qualifier: string | null, tail: string): string`
  - `shortSido(fullName: string): string | undefined`

- [ ] **Step 1: `qualifiedTitle` 실패 테스트 작성**

`tests/lib/seo-title.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { qualifiedTitle } from '@/lib/seo/title';

describe('qualifiedTitle', () => {
  it('qualifier가 있으면 이름 뒤 괄호로 붙인다', () => {
    expect(qualifiedTitle('서울치과의원', '강남구', '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 (강남구) — 치과의원 정보·주변 아파트');
  });

  it('시도가 붙은 qualifier도 그대로 넣는다', () => {
    expect(qualifiedTitle('하나약국', '부산 중구', '— 약국 정보·주변 아파트'))
      .toBe('하나약국 (부산 중구) — 약국 정보·주변 아파트');
  });

  // 지역 해석 실패가 회귀를 만들지 않는다는 것이 이 함수의 핵심 계약이다.
  it('qualifier가 null이면 접미사 없이 기존 문자열을 낸다', () => {
    expect(qualifiedTitle('서울치과의원', null, '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 — 치과의원 정보·주변 아파트');
  });

  it('qualifier가 빈 문자열이어도 접미사를 만들지 않는다', () => {
    expect(qualifiedTitle('서울치과의원', '', '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 — 치과의원 정보·주변 아파트');
  });

  it('tail이 구분자를 직접 들고 있어도 강제하지 않는다', () => {
    expect(qualifiedTitle('햇살론15', '서민금융진흥원', '한도·금리 — 주거금융'))
      .toBe('햇살론15 (서민금융진흥원) 한도·금리 — 주거금융');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/seo-title.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/title"`

- [ ] **Step 3: `qualifiedTitle` 구현**

`lib/seo/title.ts` (신규):

```ts
/**
 * 시설 상세 제목을 조립한다. 제목 조립의 유일한 지점.
 *
 * qualifier가 비어 있으면 접미사 없이 기존과 동일한 문자열을 낸다 —
 * 지역 해석 실패가 제목 회귀를 만들지 않는다.
 * tail은 자체 구분자를 포함한다('— 약국 정보·주변 아파트', '한도·금리 — 주거금융').
 * 라우트마다 꼬리 모양이 달라 구분자를 강제하지 않는다.
 */
export function qualifiedTitle(name: string, qualifier: string | null, tail: string): string {
  return qualifier ? `${name} (${qualifier}) ${tail}` : `${name} ${tail}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/seo-title.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: `shortSido` 실패 테스트 작성**

`tests/lib/region-short-sido.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shortSido } from '@/lib/region';

describe('shortSido', () => {
  it('시도 풀네임을 축약명으로 바꾼다', () => {
    expect(shortSido('대전광역시')).toBe('대전');
    expect(shortSido('서울특별시')).toBe('서울');
    expect(shortSido('경기도')).toBe('경기');
    expect(shortSido('강원특별자치도')).toBe('강원');
  });

  // 2026-07-01 광주+전남 통합
  it('통합 시도도 축약명을 낸다', () => {
    expect(shortSido('전남광주통합특별시')).toBe('전남광주');
  });

  // sidoPrefix()는 행정구역 코드 앞 2자리를 내므로 표시용으로 쓸 수 없다. 혼동 방지용 회귀선.
  it('코드가 아니라 이름을 낸다', () => {
    expect(shortSido('대전광역시')).not.toBe('30');
  });

  it('SIDO_LIST에 없는 시도는 undefined', () => {
    expect(shortSido('없는시도')).toBeUndefined();
    expect(shortSido('')).toBeUndefined();
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/region-short-sido.test.ts`
Expected: FAIL — `shortSido is not a function`

- [ ] **Step 7: `shortSido` 구현**

`lib/region.ts`의 `SIDO_LIST` 배열 정의(파일 상단) 바로 아래에 추가한다:

```ts
/**
 * 시도 풀네임 → 축약명. Region.sido에는 풀네임이 담기므로 표시용 축약이 필요하다.
 * sidoFullName()의 역방향이며, sidoPrefix()와 달리 코드가 아니라 이름을 낸다.
 * SIDO_LIST가 정적 상수(20개 미만)라 선형 탐색 비용이 없다.
 */
export function shortSido(fullName: string): string | undefined {
  if (!fullName) return undefined;
  return SIDO_LIST.find(s => s.fullName === fullName)?.sido;
}
```

- [ ] **Step 8: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/region-short-sido.test.ts tests/lib/seo-title.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 9: lint**

Run: `pnpm lint`
Expected: `✔ No ESLint warnings or errors`

- [ ] **Step 10: 커밋**

```bash
git add lib/seo/title.ts lib/region.ts tests/lib/seo-title.test.ts tests/lib/region-short-sido.test.ts
git commit -m "feat(seo): qualifiedTitle + shortSido 헬퍼 추가"
```

---

### Task 2: 주소 → 시군구 라벨

파일을 `lib/urban/` 밖으로 옮기고(소비자가 urban 하나에서 12개 라우트로 늘어난다), 라벨 계산을 카탈로그 적재 시점으로 끌어올린다.

**Files:**
- Create: `lib/region/from-address.ts` (`lib/urban/region-from-address.ts`에서 이동)
- Delete: `lib/urban/region-from-address.ts`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx:8` (import 경로만)
- Modify: `app/(public)/urban/charger/[id]/page.tsx:6` (import 경로만)
- Modify: `tests/lib/urban-region-from-address.test.ts` (import 경로 + 라벨 케이스)

**Interfaces:**
- Consumes: `shortSido(fullName: string): string | undefined` (Task 1), `getAllSigungus()` (`lib/region.ts`, `{ sido: string; sigungu: string | null; sigunguCode: string | null }[]` 반환)
- Produces:
  - `resolveSigunguLabelFromAddress(addr: string | null | undefined): Promise<string | null>`
  - `resolveSigunguFromAddress(addr: string | null | undefined): Promise<string | null>` (시그니처 불변)
  - `__resetRegionCatalogCacheForTests(): void` (이름 불변)

**주의 — `getAllSigungus()`는 세종 읍면동 33행을 그대로 낸다.** 이 행들은 `sigunguCode`가 전부 `36110`이고 `sigungu`가 동 이름이다. 주소 매칭에는 이 동 단위 행이 필요하므로 **접지 말고**, 라벨만 시 이름으로 접는다.

- [ ] **Step 1: 파일 이동 (내용 변경 없음)**

```bash
mkdir -p lib/region
git mv lib/urban/region-from-address.ts lib/region/from-address.ts
```

`lib/region.ts`(파일)와 `lib/region/`(디렉터리)는 공존한다 — Next.js/TypeScript 모두 `@/lib/region`은 파일을, `@/lib/region/from-address`는 디렉터리 안 파일을 가리킨다.

- [ ] **Step 2: import 경로 3곳 갱신**

`app/(public)/urban/[category]/[id]/page.tsx:8`
`app/(public)/urban/charger/[id]/page.tsx:6`

```ts
// 변경 전
import { resolveSigunguFromAddress } from '@/lib/urban/region-from-address';
// 변경 후
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
```

`tests/lib/urban-region-from-address.test.ts:3`

```ts
// 변경 전
import { resolveSigunguFromAddress, __resetRegionCatalogCacheForTests } from '@/lib/urban/region-from-address';
// 변경 후
import { resolveSigunguFromAddress, __resetRegionCatalogCacheForTests } from '@/lib/region/from-address';
```

- [ ] **Step 3: 이동만으로 기존 테스트가 통과하는지 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/urban-region-from-address.test.ts && pnpm typecheck`
Expected: PASS (6 tests) + typecheck 무출력

여기서 실패하면 라벨 작업을 시작하지 말고 경로부터 고친다.

- [ ] **Step 4: 이동만 커밋**

```bash
git add -A lib/region lib/urban app tests
git commit -m "refactor(region): region-from-address를 lib/region/ 아래로 이동"
```

- [ ] **Step 5: 라벨 실패 테스트 작성**

`tests/lib/urban-region-from-address.test.ts`의 `beforeAll`에 시드 3개를 추가한다. 기존 `서울특별시 서초구`(`1165000000`)와 `전남광주통합특별시 북구`(`1220000000`) 시드는 그대로 둔다.

```ts
  // 동명 시군구 — '서구'는 대구·대전·부산·전남광주에 있다
  await prisma.region.upsert({
    where: { code: '3017000000' },
    create: {
      code: '3017000000', sido: '대전광역시', sigungu: '서구',
      level: 2, isAbolished: false, fullName: '대전광역시 서구', sourceVersion: 'test',
    },
    update: {},
  });
  await prisma.region.upsert({
    where: { code: '2714000000' },
    create: {
      code: '2714000000', sido: '대구광역시', sigungu: '서구',
      level: 2, isAbolished: false, fullName: '대구광역시 서구', sourceVersion: 'test',
    },
    update: {},
  });
  // 구·군이 없는 시 — 세종은 읍면동이 sigunguCode 36110을 공유한다
  await prisma.region.upsert({
    where: { code: '3611025000' },
    create: {
      code: '3611025000', sido: '세종특별자치시', sigungu: '조치원읍',
      level: 2, isAbolished: false, fullName: '세종특별자치시 조치원읍', sourceVersion: 'test',
    },
    update: {},
  });
  await prisma.region.upsert({
    where: { code: '3611051000' },
    create: {
      code: '3611051000', sido: '세종특별자치시', sigungu: '한솔동',
      level: 2, isAbolished: false, fullName: '세종특별자치시 한솔동', sourceVersion: 'test',
    },
    update: {},
  });
  __resetRegionCatalogCacheForTests();
```

`sigunguCode`는 `code` 앞 5자리 생성 컬럼이므로 명시 전달하지 않는다(전달하면 CI가 거부한다). 세종 두 행은 앞 5자리가 모두 `36110`이라 자동으로 코드를 공유한다.

같은 파일 아래쪽에 describe 블록을 추가한다:

```ts
describe('resolveSigunguLabelFromAddress', () => {
  it('이름이 유일한 시군구는 시군구만 낸다', async () => {
    expect(await resolveSigunguLabelFromAddress('서울특별시 서초구 서초동 1234')).toBe('서초구');
  });

  // 전국 243개 중 26곳이 여러 시도에 걸친다. '(서구)'만으로는 어디인지 알 수 없다.
  it('여러 시도에 걸치는 시군구는 시도 축약명을 앞에 붙인다', async () => {
    expect(await resolveSigunguLabelFromAddress('대전광역시 서구 둔산동 1')).toBe('대전 서구');
    expect(await resolveSigunguLabelFromAddress('대구광역시 서구 내당동 1')).toBe('대구 서구');
  });

  // 세종은 구·군이 없어 읍면동이 한 sigunguCode를 공유한다 → 동 이름 대신 시 이름
  it('구·군이 없는 시는 시 축약명으로 접는다', async () => {
    expect(await resolveSigunguLabelFromAddress('세종특별자치시 조치원읍 로1')).toBe('세종');
    expect(await resolveSigunguLabelFromAddress('세종특별자치시 한솔동 로1')).toBe('세종');
  });

  it('구 명칭 주소도 통합 시도 라벨을 낸다', async () => {
    expect(await resolveSigunguLabelFromAddress('광주광역시 북구 운암동 1')).toBe('북구');
  });

  it('매칭 실패는 null — 호출부가 접미사를 생략한다', async () => {
    expect(await resolveSigunguLabelFromAddress('미상지역 어딘가')).toBeNull();
    expect(await resolveSigunguLabelFromAddress(null)).toBeNull();
    expect(await resolveSigunguLabelFromAddress('')).toBeNull();
  });
});
```

import 줄에 `resolveSigunguLabelFromAddress`를 추가한다.

> `광주광역시 북구` 케이스가 `북구`인 이유: 테스트 DB에는 `북구`가 전남광주통합특별시 하나뿐이라 시도 접두가 붙지 않는다. 운영 DB에는 대구·부산·울산에도 있어 `전남광주 북구`가 된다. 이 테스트는 **구 명칭 주소가 라벨 경로에서도 매칭된다**는 것만 확인한다.

- [ ] **Step 6: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/urban-region-from-address.test.ts`
Expected: FAIL — `resolveSigunguLabelFromAddress is not a function`

- [ ] **Step 7: 카탈로그에 라벨 추가**

`lib/region/from-address.ts`의 상단 캐시 타입과 `loadCatalog()`를 교체한다. `SIDO_ALIASES`와 `resolveSigunguFromAddress`의 매칭 루프는 건드리지 않는다.

```ts
import { getAllSigungus, shortSido } from '@/lib/region';

interface CatalogRow {
  sido: string;
  sigungu: string;
  sigunguCode: string;
  /** 제목 표시용 라벨. 동명 시군구는 시도 접두, 구·군 없는 시는 시 이름. */
  label: string;
}

let cache: CatalogRow[] | null = null;

async function loadCatalog() {
  if (cache) return cache;
  const rows = (await getAllSigungus()).filter(
    (r): r is { sido: string; sigungu: string; sigunguCode: string } =>
      typeof r.sido === 'string' && typeof r.sigungu === 'string' && typeof r.sigunguCode === 'string',
  );

  // 같은 sigungu 이름을 쓰는 시도를 센다. distinct 시도 수로 세므로
  // 같은 시도 안의 여러 행(세종 읍면동 등)에 흔들리지 않는다.
  const sidosByName = new Map<string, Set<string>>();
  // 한 sigunguCode를 여러 행이 공유 = 구·군이 없는 시(세종).
  const rowsPerCode = new Map<string, number>();
  for (const r of rows) {
    let set = sidosByName.get(r.sigungu);
    if (!set) sidosByName.set(r.sigungu, (set = new Set()));
    set.add(r.sido);
    rowsPerCode.set(r.sigunguCode, (rowsPerCode.get(r.sigunguCode) ?? 0) + 1);
  }

  cache = rows
    .map(r => ({
      ...r,
      label:
        rowsPerCode.get(r.sigunguCode)! > 1
          ? (shortSido(r.sido) ?? r.sido)
          : sidosByName.get(r.sigungu)!.size > 1
            ? `${shortSido(r.sido) ?? r.sido} ${r.sigungu}`
            : r.sigungu,
    }))
    // 긴 sigungu name 우선 (수원시 영통구 vs 수원시)
    .sort((a, b) => b.sigungu.length - a.sigungu.length);
  return cache;
}
```

`shortSido()`가 `undefined`를 낼 때 `?? r.sido`로 풀네임을 쓴다. 앞으로 행정구역이 개편돼 `SIDO_LIST`에 없는 시도가 `Region`에 먼저 들어와도 `undefined`가 제목에 박히지 않는다.

- [ ] **Step 8: 매칭을 공통 함수로 뽑고 라벨 함수 추가**

같은 파일 하단. 기존 `resolveSigunguFromAddress`의 루프를 `matchRow()`로 옮기고 두 공개 함수가 공유한다.

```ts
async function matchRow(addr: string | null | undefined): Promise<CatalogRow | null> {
  if (!addr) return null;
  const catalog = await loadCatalog();
  for (const r of catalog) {
    const aliases = SIDO_ALIASES[r.sido] ?? [r.sido];
    for (const sidoForm of aliases) {
      if (addr.startsWith(`${sidoForm} ${r.sigungu}`)) return r;
    }
  }
  return null;
}

export async function resolveSigunguFromAddress(addr: string | null | undefined): Promise<string | null> {
  return (await matchRow(addr))?.sigunguCode ?? null;
}

/** 제목 접미사용 시군구 라벨. 매칭 실패 시 null — 호출부가 접미사를 생략한다. */
export async function resolveSigunguLabelFromAddress(addr: string | null | undefined): Promise<string | null> {
  return (await matchRow(addr))?.label ?? null;
}
```

- [ ] **Step 9: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/urban-region-from-address.test.ts`
Expected: PASS (12 tests) — 기존 6개 + 신규 6개. 기존 6개가 하나라도 깨지면 매칭 동작이 바뀐 것이므로 되돌린다.

- [ ] **Step 10: lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: `✔ No ESLint warnings or errors` + typecheck 무출력

- [ ] **Step 11: 커밋**

```bash
git add lib/region/from-address.ts tests/lib/urban-region-from-address.test.ts
git commit -m "feat(region): 주소→시군구 라벨 해석 추가 (동명 시도접두·세종 접기)"
```

---

### Task 3: 의료 2종 (hospital, pharmacy)

**Files:**
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx:44-50` (`generateMetadata` 반환의 `title`만)
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx:38-46` (〃)

**Interfaces:**
- Consumes: `qualifiedTitle(name, qualifier, tail)` (Task 1), `resolveSigunguLabelFromAddress(addr)` (Task 2)
- Produces: 없음

`getHospitalById`/`getPharmacyById`는 `select` 없이 `findUnique`를 쓰므로 `address`가 이미 들어온다. 로더를 고칠 필요가 없다.

- [ ] **Step 1: hospital `generateMetadata` 수정**

파일 상단 import에 두 줄을 추가한다:

```ts
import { qualifiedTitle } from '@/lib/seo/title';
import { resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
```

`generateMetadata` 안에서 `const docs = ...` 줄 바로 아래에 라벨을 구하고, `title`만 바꾼다:

```ts
  const locality = await resolveSigunguLabelFromAddress(hospital.address);
  return {
    title: qualifiedTitle(hospital.name, locality, `— ${hospital.typeName} 정보·주변 아파트`),
    description: narrative?.text.slice(0, 150) ?? `${hospital.name} ${hospital.typeName}${docs}. 진료·시설·교통 정보와 도보권 아파트 실거래가를 함께 확인하세요.`,
    robots: robotsFor(indexable),
    alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
  };
```

`description`·`robots`·`alternates`는 그대로다.

- [ ] **Step 2: pharmacy `generateMetadata` 수정**

같은 두 import를 추가하고, `const regionPart = ...` 줄 아래에서:

```ts
  const locality = await resolveSigunguLabelFromAddress(pharmacy.address);
  return {
    title: qualifiedTitle(pharmacy.name, locality, '— 약국 정보·주변 아파트'),
    description: `${pharmacy.name} 위치·연락처와 도보권 아파트 실거래가. ${regionPart}주변 생활 인프라를 한눈에 확인하세요.`,
    // 약국 상세는 고유 콘텐츠(이름·주소·시간)가 얇고 나머지는 전 위치 공통 파생이라
    // near-duplicate 색인 부풀림 요인. 로컬 열람용으로 렌더는 유지하되 색인에서만 배제.
    // follow 유지로 근접 아파트 실거래 링크에쿼티는 전달. (docs/adsense/approval-strategy-2026-07-08.md P0-A)
    robots: { index: false, follow: true },
    alternates: { canonical: `/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
  };
```

기존 `region`/`regionPart` 변수는 `description`이 계속 쓰므로 지우지 않는다.

- [ ] **Step 3: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/medical"
git commit -m "feat(seo): 병원·약국 상세 title에 시군구 접미사"
```

---

### Task 4: 학교 + 어린이집

**Files:**
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:47-57` (`title`만)
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx:46-61` (〃)

**Interfaces:**
- Consumes: `qualifiedTitle(name, qualifier, tail)` (Task 1), `resolveSigunguLabelFromAddress(addr)` (Task 2)
- Produces: 없음

`School.region`은 **시군구가 아니라 시도**를 담는다(`lib/school.ts:27`이 `f.sido`로 필터). 라벨은 주소에서만 구한다.

- [ ] **Step 1: school `generateMetadata` 수정**

import 두 줄을 추가한다:

```ts
import { qualifiedTitle } from '@/lib/seo/title';
import { resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
```

`const regionPart = ...` 줄 아래에서:

```ts
  const locality = await resolveSigunguLabelFromAddress(school.address);
  return {
    title: qualifiedTitle(school.name, locality, `— ${school.schoolKind ?? '학교'} 정보·주변 아파트`),
    description: narrative?.text.slice(0, 150) ?? `${school.name}${tagPart} ${school.schoolKind ?? '학교'} 정보와 도보권 아파트 실거래가. ${regionPart}통학 정보를 공공데이터로 확인하세요.`,
    robots: robotsFor(indexable),
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
```

- [ ] **Step 2: childcare `generateMetadata` 수정**

같은 import 두 줄을 추가하고, `const type = ...` 줄 아래에서:

```ts
  const locality = await resolveSigunguLabelFromAddress(item.address);
  return {
    title: qualifiedTitle(item.name, locality, `— ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`),
    description: narrative?.text.slice(0, 150) ?? `${item.name}${type}${stat}. 도보권 아파트 실거래가와 보육정보를 한눈에.`,
    robots: robotsFor(indexable),
    alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
  };
```

- [ ] **Step 3: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/school" "app/(public)/childcare"
git commit -m "feat(seo): 학교·어린이집 상세 title에 시군구 접미사"
```

---

### Task 5: amenity 4종 + urban 3종

`amenity/[category]/[id]`는 `convenience`·`cafe`·`mart`·`market` 4종을, `urban/[category]/[id]`는 `park`·`parking` 2종을 공유한다. `urban/charger/[id]`만 별도 파일이다.

**Files:**
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx:44-56` (`title`만)
- Modify: `app/(public)/urban/[category]/[id]/page.tsx` (`generateMetadata`의 park 분기 + 기본 분기 `title` 2곳)
- Modify: `app/(public)/urban/charger/[id]/page.tsx:44-53` (`title`만)

**Interfaces:**
- Consumes: `qualifiedTitle(name, qualifier, tail)` (Task 1), `resolveSigunguLabelFromAddress(addr)` (Task 2)
- Produces: 없음

`AmenityItem`·`UrbanItem` 모두 `address: string`을 갖는다(`lib/amenity/category.ts:19`, `lib/urban/category.ts:16`).
`urban/[category]/[id]/page.tsx`는 이미 `@/lib/region/from-address`에서 `resolveSigunguFromAddress`를 import하고 있다(Task 2 Step 2에서 경로 갱신됨) — 같은 import 문에 라벨 함수를 더한다.

- [ ] **Step 1: amenity 수정**

import 두 줄을 추가한다:

```ts
import { qualifiedTitle } from '@/lib/seo/title';
import { resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
```

`generateMetadata`의 `if (!item) return {};` 아래에서:

```ts
  const locality = await resolveSigunguLabelFromAddress(item.address);
  return {
    title: qualifiedTitle(item.name, locality, `— ${def.label} 정보·주변 아파트`),
    description: `${item.name} ${def.label} 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/amenity/${def.slug}/${id}` },
  };
```

- [ ] **Step 2: urban/[category] 수정 (분기 2곳)**

`qualifiedTitle` import를 추가하고, 기존 `resolveSigunguFromAddress` import 문에 라벨 함수를 더한다:

```ts
import { resolveSigunguFromAddress, resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
import { qualifiedTitle } from '@/lib/seo/title';
```

`if (!item) return {};` 아래에 라벨을 한 번만 구하고 두 분기가 공유한다:

```ts
  const locality = await resolveSigunguLabelFromAddress(item.address);
  if (def.slug === 'park') {
    const { narrative } = await loadParkInsight(BigInt(id));
    const indexable = isNarrativeIndexable(narrative, 2);
    return {
      title: qualifiedTitle(item.name, locality, '— 공원 정보·주변 아파트'),
      description:
        narrative?.text.slice(0, 150) ??
        `${item.name} 공원 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
      robots: robotsFor(indexable),
      alternates: { canonical: `/urban/park/${id}` },
    };
  }
  return {
    title: qualifiedTitle(item.name, locality, `— ${def.label} 정보·주변 아파트`),
    description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/urban/${def.slug}/${id}` },
  };
```

- [ ] **Step 3: urban/charger 수정**

import 두 줄을 추가한다. 이 파일은 `resolveSigunguFromAddress`를 이미 import하고 있으므로 같은 문에 더한다:

```ts
import { resolveSigunguFromAddress, resolveSigunguLabelFromAddress } from '@/lib/region/from-address';
import { qualifiedTitle } from '@/lib/seo/title';
```

```ts
  const locality = await resolveSigunguLabelFromAddress(item.address);
  return {
    title: qualifiedTitle(item.name, locality, '— 전기차충전소 정보·주변 아파트'),
    description: `${item.name} 전기차충전소 실시간 충전기 현황과 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
    robots: robotsFor(false),
    alternates: { canonical: `/urban/charger/${id}` },
  };
```

- [ ] **Step 4: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

lint가 `resolveSigunguFromAddress` 미사용을 잡으면 해당 파일이 본문에서 그 함수를 쓰지 않는다는 뜻이다 — import에서 빼되, **본문 사용처는 지우지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/amenity" "app/(public)/urban"
git commit -m "feat(seo): 편의시설·도시시설 상세 title에 시군구 접미사"
```

---

### Task 6: finance (기관명)

금융상품에는 지역 개념이 없다. 구분자는 제공기관명이다. `ofrinstnm`은 이미 조회돼 `description`에 쓰이고 있다.

**Files:**
- Modify: `app/(public)/finance/[seq]/page.tsx:37-44` (`title`만)

**Interfaces:**
- Consumes: `qualifiedTitle(name, qualifier, tail)` (Task 1)
- Produces: 없음

- [ ] **Step 1: 수정**

import를 추가한다:

```ts
import { qualifiedTitle } from '@/lib/seo/title';
```

`const provider = ...` 줄은 그대로 두고(`description`이 쓴다), `title`만 바꾼다:

```ts
  return {
    title: qualifiedTitle(product.finprdnm, product.ofrinstnm, '한도·금리 — 주거금융'),
    description: `${provider}${product.finprdnm}${limit}${target}. 금리·자격요건·신청방법을 한눈에 확인하세요.`,
    alternates: { canonical: `/finance/${seq}` },
  };
```

`LoanProduct.ofrinstnm`은 `String?`(`prisma/schema.prisma:205`)이라 타입이 `string | null` — `qualifiedTitle`의 2번째 인자와 그대로 맞는다. `?? null`을 덧붙이지 않는다.

`ofrinstnm`이 없는 상품 1건은 `qualifiedTitle`이 접미사를 생략해 기존 문자열을 낸다.

- [ ] **Step 2: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/finance"
git commit -m "feat(seo): 금융상품 상세 title에 제공기관명 접미사"
```

---

### Task 7: `generateMetadata` 회귀 테스트 + 전체 검증

라우트별 SSR 테스트를 전부 만들지는 않는다. 조립이 `qualifiedTitle` 하나에 모여 있고 나머지는 인자 전달이다. 대표 2종만 건다 — **컬럼이 아닌 주소에서 라벨이 나온다는 것**과 **카테고리 라벨 경로**를 각각 확인한다.

**Files:**
- Create: `tests/components/facility-title-metadata.test.ts`

**Interfaces:**
- Consumes: `generateMetadata` (hospital·amenity 라우트), `__resetRegionCatalogCacheForTests()` (Task 2)
- Produces: 없음

- [ ] **Step 1: 테스트 작성**

`tests/components/facility-title-metadata.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '@/lib/db';
import { __resetRegionCatalogCacheForTests } from '@/lib/region/from-address';
import { generateMetadata as hospitalMeta } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/page';
import { generateMetadata as amenityMeta } from '@/app/(public)/amenity/[category]/[id]/page';

const HOSPITAL_ID = 990001n;
const STORE_ID = 990002n;

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: '1168000000' },
    create: {
      code: '1168000000', sido: '서울특별시', sigungu: '강남구',
      level: 2, isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
    },
    update: {},
  });
  __resetRegionCatalogCacheForTests();

  await prisma.hospital.upsert({
    where: { id: HOSPITAL_ID },
    create: {
      id: HOSPITAL_ID,
      sourceId: 'test-hosp-990001',
      name: '서울치과의원',
      // typeCode는 non-null (prisma/schema.prisma:494)
      typeCode: '81',
      typeName: '치과의원',
      // sigunguCode는 심평원 코드라 Region과 조인되지 않는다 — 라벨은 주소에서 나와야 한다.
      sigunguCode: '110019',
      sido: '서울',
      sigungu: '강남구',
      address: '서울특별시 강남구 테헤란로 1',
    },
    update: {},
  });

  await prisma.store.upsert({
    where: { id: STORE_ID },
    create: {
      id: STORE_ID,
      sourceId: 'test-store-990002',
      name: '씨유',
      industryCode: 'G20405',
      industryName: '체인화 편의점',
      sigunguCode: '11680',
      address: '서울특별시 강남구 테헤란로 2',
    },
    update: {},
  });
});

const params = (o: Record<string, string>) => ({ params: Promise.resolve(o) });

describe('시설 상세 generateMetadata title', () => {
  // Hospital.sigunguCode는 Region과 조인이 되지 않으므로(실측 0%),
  // 라벨이 나온다는 것은 주소 파싱 경로가 살아 있다는 뜻이다.
  it('병원 title은 주소에서 뽑은 시군구를 괄호로 단다', async () => {
    const meta = await hospitalMeta(params({ sigunguCode: '110019', id: String(HOSPITAL_ID) }));
    expect(meta.title).toBe('서울치과의원 (강남구) — 치과의원 정보·주변 아파트');
  });

  it('편의점 title은 카테고리 라벨과 시군구를 함께 단다', async () => {
    const meta = await amenityMeta(params({ category: 'convenience', id: String(STORE_ID) }));
    expect(meta.title).toBe('씨유 (강남구) — 편의점 정보·주변 아파트');
  });

  // 지역 해석 실패가 제목을 깨뜨리지 않는다는 계약
  it('주소가 매칭되지 않으면 접미사 없이 기존 형식을 낸다', async () => {
    await prisma.hospital.update({
      where: { id: HOSPITAL_ID },
      data: { address: '미상지역 어딘가 1' },
    });
    const meta = await hospitalMeta(params({ sigunguCode: '110019', id: String(HOSPITAL_ID) }));
    expect(meta.title).toBe('서울치과의원 — 치과의원 정보·주변 아파트');
    await prisma.hospital.update({
      where: { id: HOSPITAL_ID },
      data: { address: '서울특별시 강남구 테헤란로 1' },
    });
  });
});
```

`generateMetadata`는 `loadHospitalInsight`를 호출한다. narrative가 없으면 `{ narrative: null }`을 내고 `description`이 폴백을 쓰므로 `title` 단언에는 영향이 없다.

`Store` 필수 컬럼은 `sourceId`·`name`·`address`·`sigunguCode`, `Hospital`은 `sourceId`·`name`·`typeCode`·`typeName`·`address`다(`prisma/schema.prisma:301`, `:490`). 위 `create`가 모두 채운다.

**페이지 모듈 import가 vitest에서 실패하면** — 기존 `tests/components/*-ssr.test.ts`는 컴포넌트만 import하고 페이지를 import한 전례가 없다. `next/navigation` 등에서 막히면 이 태스크를 다음으로 축소한다: 페이지 import를 버리고, Task 2의 `resolveSigunguLabelFromAddress`와 Task 1의 `qualifiedTitle`을 직접 조합해 세 라우트의 `tail` 문자열이 실제 페이지 코드와 일치하는지 확인하는 테스트로 대체한다. 배선 검증은 Step 5의 `pnpm build`가 대신 맡는다. **축소했다면 그 사실을 커밋 메시지에 남긴다.**

- [ ] **Step 2: 테스트 실행**

Run: `pnpm dotenv -e .env.test -- vitest run tests/components/facility-title-metadata.test.ts`
Expected: PASS (3 tests)

`Hospital`/`Store`의 필수 컬럼이 더 있어 `upsert`가 실패하면, 에러가 지목한 컬럼만 `create`에 채운다 — 스키마를 바꾸지 않는다.

- [ ] **Step 3: 전체 스위트 실행**

Run: `pnpm test:unit`
Expected: 전부 PASS. 기존 `tests/lib/urban-region-from-address.test.ts` 6개가 그대로 통과해야 한다 — 매칭 동작 회귀 감시선이다.

- [ ] **Step 4: lint (완료 게이트)**

Run: `pnpm lint`
Expected: `✔ No ESLint warnings or errors`

`typecheck`는 미사용 변수를 잡지 못한다(`noUnusedLocals` 미설정). Task 3~6에서 변수를 정리했다면 여기서 걸린다.

- [ ] **Step 5: 빌드 확인**

Run: `pnpm build`
Expected: 성공

CI(`ci.yml`)에는 `pnpm build`가 없어 빌드 에러가 배포 시점까지 숨는다. 라우트 파일을 8개 고쳤으므로 여기서 한 번 돌린다.

- [ ] **Step 6: 커밋**

```bash
git add tests/components/facility-title-metadata.test.ts
git commit -m "test(seo): 시설 상세 title 회귀 테스트 (주소 경로·폴백)"
```

---

## 검증

전 태스크 완료 후 확인할 것:

| 항목 | 방법 | 기대 |
|---|---|---|
| 제목 형식 | `pnpm test:unit` | 전부 통과 |
| 매칭 회귀 | `tests/lib/urban-region-from-address.test.ts` 기존 6개 | 통과 |
| 빌드 | `pnpm build` | 성공 |
| lint | `pnpm lint` | 클린 |
| 스코프 | `git diff main --stat` | `description`·`robots`·`canonical` 변경 0 |

`git diff main -- "app/(public)"`을 읽어 `title:` 줄 외의 변경이 없는지 눈으로 확인한다. 스펙의 Global Constraints가 명시적으로 금지한다.

## 배포 후

DB·마이그레이션 변경이 없으므로 `prisma:deploy`가 필요 없다.

상세 페이지는 ISR(`revalidate` 최대 604,800초 = 7일)이라 **기존 캐시가 만료돼야 새 제목이 나간다.** 강제 재검증은 하지 않는다. 네이버 재진단도 캐시 만료 뒤라야 의미가 있다.

프로덕션에 curl 버스트를 보내 확인하지 않는다 — 자동 챌린지(403)에 걸린다. 확인이 필요하면 GitHub Actions 로그나 서치어드바이저를 쓴다.
