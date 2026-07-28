# 실거래가 상세 지번주소 노출 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트·오피스텔·연립다세대 상세 페이지에 이미 보유한 지번주소를 노출하되, 검증되지 않은 주소는 확정 주소로 주장하지 않는다.

**Architecture:** `Property.address`("법정동 지번")를 파싱해 정확한 지번주소와 법정동 폴백을 타입 수준에서 분리하는 순수 함수를 만들고, 별도 쿼리로 "이 단지 거래가 단일 지번인가"를 확인하는 신뢰도 게이트를 둔다. 게이트를 통과한 경우에만 복사·JSON-LD `streetAddress`·description에 반영하고, 통과하지 못하면 화면에 `대표 지번` 배지를 단다. 스키마·마이그레이션·ETL 변경은 없다.

**Tech Stack:** Next.js App Router (서버 컴포넌트 기본), Prisma + PostgreSQL, vitest, React `cache()`

**Spec:** `docs/superpowers/specs/2026-07-28-property-jibun-address-display-design.md`

## Global Constraints

- 지번 판정 정규식은 정확히 `/^(?:산)?\d+(?:-\d+)?$/` — 접두 검사가 아니라 **전체 토큰 검사**다.
- 토큰이 1개뿐이면 지번으로 인정하지 않는다. 법정동 없는 맨 숫자는 주소가 아니다.
- `streetAddress`에 `region.fullName`(시군구) 폴백을 넣지 않는다. 값이 없으면 **속성 자체를 생략**한다.
- `AddressLine`은 서버 컴포넌트를 유지한다. `'use client'`는 `CopyButton`에만 붙인다.
- 출처 문구를 직접 쓰지 않는다. 항상 `<SourceCaption ids={['molit-rtms']} />`를 쓴다 (`lib/data-sources.ts`가 SSOT).
- `<title>`은 변경하지 않는다. `detailTitleLocality()`(`lib/region.ts:284`)도 건드리지 않는다.
- 통합 테스트는 **자체 시드**로 데이터를 만든다. CI의 check 잡은 migrate만 하고 seed를 하지 않으므로 앰비언트 데이터에 의존하면 flaky해진다.
- `Region.sigunguCode`와 `Property.sigunguCode`는 **생성 컬럼**(`GENERATED ALWAYS`)이므로 시드에서 값을 넣지 않는다. `Transaction.sigunguCode`는 일반 컬럼이라 **반드시 넣어야 한다**.
- 컴포넌트 SSR 테스트는 `renderToStaticMarkup` + `createElement`를 쓰고, 파일 상단에 React 전역 shim을 넣는다 (기존 `tests/components/*-ssr.test.ts`와 동일).
- 완료 전 `pnpm lint`를 반드시 통과시킨다. `typecheck`는 미사용 변수를 잡지 못하지만 ESLint `no-unused-vars`는 error라 CI를 막는다.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/property.ts` (수정) | `propertyAddress()` 순수 파싱 + `hasSingleJibun()` 게이트 쿼리 |
| `lib/insights/apt-loader.ts` (수정) | `cachedHasSingleJibun` — 요청 스코프 캐시 |
| `lib/seo/json-ld.tsx` (수정) | `postalAddress()`에 `addressRegion`/`addressLocality` 추가, `address` 선택화 |
| `components/ui/copy-button.tsx` (신규) | 클립보드 복사 버튼. 유일한 클라이언트 컴포넌트 |
| `components/ui/address-line.tsx` (신규) | 주소 줄 + `대표 지번` 배지 + 출처. 서버 컴포넌트 |
| `app/(public)/apt/[id]/_components/property-detail-hero.tsx` (수정) | 히어로 지역 표기를 `display`로 |
| `app/(public)/{apt,villa,officetel}/[id]/page.tsx` (수정) | 게이트 호출, `AddressLine` 삽입, JSON-LD·description 배선 |

---

### Task 1: `propertyAddress()` 순수 파싱 함수

**Files:**
- Modify: `lib/property.ts` (`typeToSlug` 아래, `getPropertyById` 위에 추가)
- Test: `tests/lib/property-address.test.ts` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `export interface PropertyAddress { locality: string | null; jibun: string | null; street: string | null; display: string }`
  - `export function propertyAddress(property: { address: string }, region: { fullName: string }): PropertyAddress`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/property-address.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { propertyAddress } from '@/lib/property';

const songpa = { fullName: '서울특별시 송파구' };
const gyeongju = { fullName: '경상북도 경주시' };
const seocho = { fullName: '서울특별시 서초구' };
const incheonSeo = { fullName: '인천광역시 서구' };
const gangnam = { fullName: '서울특별시 강남구' };

describe('propertyAddress', () => {
  it('법정동 + 지번이면 정확한 지번주소를 만든다', () => {
    expect(propertyAddress({ address: '가락동 913' }, songpa)).toEqual({
      locality: '가락동',
      jibun: '913',
      street: '가락동 913',
      display: '서울특별시 송파구 가락동 913',
    });
  });

  it('법정동이 두 단어여도 뒤에서 한 토큰만 지번으로 본다', () => {
    expect(propertyAddress({ address: '외동읍 모화리 1853' }, gyeongju)).toEqual({
      locality: '외동읍 모화리',
      jibun: '1853',
      street: '외동읍 모화리 1853',
      display: '경상북도 경주시 외동읍 모화리 1853',
    });
  });

  it('산번지를 지번으로 인정한다', () => {
    const r = propertyAddress({ address: '내곡동 산123' }, seocho);
    expect(r.jibun).toBe('산123');
    expect(r.street).toBe('내곡동 산123');
  });

  it('부번을 지번으로 인정한다', () => {
    const r = propertyAddress({ address: '잠실동 19-1' }, songpa);
    expect(r.jibun).toBe('19-1');
    expect(r.street).toBe('잠실동 19-1');
  });

  it('비정형 지번(가-)은 지번으로 인정하지 않고 법정동까지만 남긴다', () => {
    expect(propertyAddress({ address: '가정동 가-' }, incheonSeo)).toEqual({
      locality: '가정동',
      jibun: null,
      street: null,
      display: '인천광역시 서구 가정동',
    });
  });

  it('숫자로 시작해도 토큰 전체가 지번이 아니면 인정하지 않는다', () => {
    const r = propertyAddress({ address: '가정동 1234블록' }, incheonSeo);
    expect(r.jibun).toBeNull();
    expect(r.street).toBeNull();
    expect(r.locality).toBe('가정동');
  });

  it('지번이 결측이면 법정동만 남긴다', () => {
    expect(propertyAddress({ address: '역삼동' }, gangnam)).toEqual({
      locality: '역삼동',
      jibun: null,
      street: null,
      display: '서울특별시 강남구 역삼동',
    });
  });

  it('법정동 없는 단일 숫자 토큰은 주소로 인정하지 않는다', () => {
    expect(propertyAddress({ address: '913' }, songpa)).toEqual({
      locality: null,
      jibun: null,
      street: null,
      display: '서울특별시 송파구',
    });
  });

  it('빈 문자열이면 시군구까지만 표시한다', () => {
    expect(propertyAddress({ address: '' }, songpa)).toEqual({
      locality: null,
      jibun: null,
      street: null,
      display: '서울특별시 송파구',
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/property-address.test.ts`
Expected: FAIL — `propertyAddress is not a function` (또는 import 에러)

- [ ] **Step 3: 최소 구현**

`lib/property.ts`의 `typeToSlug` 함수 바로 아래에 추가:

```ts
/** 지번 토큰 판정. 접두가 아니라 전체 토큰이 매치해야 한다. */
const JIBUN_PATTERN = /^(?:산)?\d+(?:-\d+)?$/;

export interface PropertyAddress {
  /** 법정동(읍·면·리 포함). 지번이 없어도 이것은 정확한 정보다 */
  locality: string | null;
  /** 지번. 엄격 패턴을 통과했을 때만 채워진다 */
  jibun: string | null;
  /** 정확한 지번주소(locality + jibun). 둘 중 하나라도 없으면 null */
  street: string | null;
  /** 화면 표시용 최선의 문자열. street → locality → 시군구 순으로 낮아진다 */
  display: string;
}

/**
 * Property.address("법정동 지번")를 파싱해 정확한 지번주소와 법정동 폴백을 분리한다.
 * buildAddress()가 umd + jibun 순으로 조립하므로 마지막 토큰이 항상 지번 자리다.
 */
export function propertyAddress(
  property: { address: string },
  region: { fullName: string },
): PropertyAddress {
  const tokens = property.address.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  const lastIsJibun = last !== undefined && JIBUN_PATTERN.test(last);

  let locality: string | null = null;
  let jibun: string | null = null;

  if (tokens.length >= 2) {
    // 법정동 없는 맨 숫자를 주소로 승격하지 않기 위해 토큰 2개 이상일 때만 지번을 인정한다.
    locality = tokens.slice(0, -1).join(' ');
    if (lastIsJibun) jibun = last;
  } else if (tokens.length === 1 && !lastIsJibun) {
    locality = tokens[0];
  }

  const street = locality && jibun ? `${locality} ${jibun}` : null;
  const tail = street ?? locality;
  return {
    locality,
    jibun,
    street,
    display: tail ? `${region.fullName} ${tail}` : region.fullName,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/property-address.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts tests/lib/property-address.test.ts
git commit -m "feat(property): Property.address 파싱 유틸 추가

정확한 지번주소(street)와 법정동 폴백(locality)을 타입 수준에서 분리한다.
지번 판정은 전체 토큰 검사(^(산)?\\d+(-\\d+)?$)이고, 법정동 없는 단일 숫자
토큰은 주소로 인정하지 않는다."
```

---

### Task 2: `hasSingleJibun()` 신뢰도 게이트

동명 단지 병합(3.9%) 때문에 `Property.address`가 그 단지의 주소라고 단정할 수 없다. 거래가 단일 지번에 모여 있는지 측정해서 판별한다.

**Files:**
- Modify: `lib/property.ts` (`getPropertyById` 아래에 추가)
- Modify: `lib/insights/apt-loader.ts` (`cachedPropertyById` 옆에 캐시 래퍼 추가)
- Test: `tests/integration/property-jibun-gate.test.ts` (신규)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export async function hasSingleJibun(propertyId: bigint): Promise<boolean>` (`lib/property.ts`)
  - `export const cachedHasSingleJibun` — `cache(hasSingleJibun)` (`lib/insights/apt-loader.ts`)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/integration/property-jibun-gate.test.ts` 생성:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasSingleJibun } from '@/lib/property';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';

// CI의 check 잡은 migrate만 하고 seed를 안 한다. 앰비언트 Transaction에 의존하면
// DB 상태에 따라 결과가 갈리므로 테스트가 직접 시드한다.
const REGION_CODE = '1171000000';
const SGG = '11710';
const NAME_SINGLE = 'UT-JIBUN-SINGLE';
const NAME_MULTI = 'UT-JIBUN-MULTI';
const NAME_NULL = 'UT-JIBUN-NULL';

let singleId: bigint;
let multiId: bigint;
let nullId: bigint;

async function seedProperty(name: string, address: string): Promise<bigint> {
  const p = await prisma.property.create({
    data: {
      propertyType: PropertyType.APARTMENT,
      name,
      nameNorm: name.toLowerCase(),
      regionCode: REGION_CODE,
      address,
    },
  });
  return p.id;
}

async function seedTx(propertyId: bigint, jibun: string | null, hashSuffix: string) {
  await prisma.transaction.create({
    data: {
      propertyId,
      propertyType: PropertyType.APARTMENT,
      regionCode: REGION_CODE,
      sigunguCode: SGG, // 일반 컬럼이라 반드시 넣어야 한다 (Property/Region의 것은 생성 컬럼)
      dealType: DealType.SALE,
      contractDate: new Date('2026-01-05'),
      exclusiveArea: 84.97,
      umd: '가락동',
      jibun,
      source: 'ut-jibun-gate',
      rawHash: `ut-jibun-gate-${hashSuffix}`.padEnd(64, '0'),
    },
  });
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    update: {},
    create: {
      code: REGION_CODE,
      sido: '서울특별시',
      sigungu: '송파구',
      fullName: '서울특별시 송파구',
      level: 2,
      sourceVersion: 'ut',
    },
  });

  singleId = await seedProperty(NAME_SINGLE, '가락동 913');
  multiId = await seedProperty(NAME_MULTI, '가락동 913');
  nullId = await seedProperty(NAME_NULL, '가락동 913');

  await seedTx(singleId, '913', 'single-a');
  await seedTx(singleId, '913', 'single-b');
  await seedTx(multiId, '913', 'multi-a');
  await seedTx(multiId, '456-4', 'multi-b');
  await seedTx(nullId, null, 'null-a');
});

afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { source: 'ut-jibun-gate' } });
  await prisma.property.deleteMany({ where: { name: { in: [NAME_SINGLE, NAME_MULTI, NAME_NULL] } } });
  await prisma.$disconnect();
});

describe('hasSingleJibun (integration)', () => {
  it('거래가 모두 같은 지번이면 true', async () => {
    expect(await hasSingleJibun(singleId)).toBe(true);
  });

  it('거래가 여러 지번에 걸치면 false', async () => {
    expect(await hasSingleJibun(multiId)).toBe(false);
  });

  it('지번이 전부 null이면 확인 불가이므로 false', async () => {
    expect(await hasSingleJibun(nullId)).toBe(false);
  });

  it('거래가 없는 단지는 false', async () => {
    expect(await hasSingleJibun(9_999_999_999n)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/property-jibun-gate.test.ts`
Expected: FAIL — `hasSingleJibun is not a function`

- [ ] **Step 3: 최소 구현**

`lib/property.ts`의 `getPropertyById` 아래에 추가:

```ts
/**
 * 이 단지의 거래가 단일 지번에 모여 있는지.
 * false면 Property.address는 여러 지번 중 하나일 뿐이므로 '대표 지번'으로만 다뤄야 한다.
 * (동명 단지가 이름만으로 병합되는 문제 — 전체 단지의 3.9%)
 *
 * Transaction_propertyId_contractDate_idx 인덱스 스캔. 최다 거래 단지 기준 22.9ms.
 */
export async function hasSingleJibun(propertyId: bigint): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT jibun) AS n FROM "Transaction" WHERE "propertyId" = ${propertyId}
  `;
  return Number(rows[0]?.n ?? 0) === 1;
}
```

`lib/insights/apt-loader.ts`의 import를 확장하고 캐시 래퍼를 추가:

```ts
// 기존 import 줄에 hasSingleJibun 추가
import { getPropertyById, getPropertyLatLng, getRegionStats, hasSingleJibun } from '@/lib/property';

// cachedPropertyById 선언 아래에 추가
export const cachedHasSingleJibun = cache(hasSingleJibun);
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/property-jibun-gate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/property.ts lib/insights/apt-loader.ts tests/integration/property-jibun-gate.test.ts
git commit -m "feat(property): 단일 지번 신뢰도 게이트 추가

동명 단지 병합으로 Property.address를 확정 주소로 단정할 수 없는 경우가
3.9% 있다. COUNT(DISTINCT jibun)으로 판별한다. 요청 스코프 캐시로 감싸
generateMetadata와 본문에서 중복 조회되지 않게 한다."
```

---

### Task 3: `postalAddress()` 구조화 확장

**Files:**
- Modify: `lib/seo/json-ld.tsx:52-72` (`PlaceInput` 인터페이스와 `postalAddress` 함수), `residenceSchema`
- Test: `tests/lib/seo/json-ld.test.ts` (기존 파일에 describe 블록 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `PlaceInput`에 `address?: string`(선택으로 변경), `addressRegion?: string`, `addressLocality?: string` 추가
  - `residenceSchema(input)` — `address`가 없으면 `streetAddress` 속성을 생략

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/seo/json-ld.test.ts` 파일 맨 아래에 추가 (상단 import 줄에 `residenceSchema`, `placeSchema` 추가):

```ts
describe('residenceSchema address', () => {
  it('주소가 확정되면 streetAddress + addressRegion + addressLocality를 모두 낸다', () => {
    const s = residenceSchema({
      name: '헬리오시티',
      address: '가락동 913',
      addressRegion: '서울특별시',
      addressLocality: '송파구',
      url: 'https://x/apt/1',
    }) as Record<string, unknown>;
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'KR',
      addressRegion: '서울특별시',
      addressLocality: '송파구',
      streetAddress: '가락동 913',
    });
  });

  it('주소가 확정되지 않으면 streetAddress 속성 자체를 생략한다', () => {
    const s = residenceSchema({
      name: '포레나루원시티',
      addressRegion: '인천광역시',
      addressLocality: '서구',
      url: 'https://x/apt/2',
    }) as Record<string, unknown>;
    const addr = s.address as Record<string, unknown>;
    // undefined 통과를 막기 위해 키 존재 자체를 검사한다.
    expect('streetAddress' in addr).toBe(false);
    expect(addr.addressRegion).toBe('인천광역시');
    expect(addr.addressLocality).toBe('서구');
  });
});

describe('placeSchema 회귀 (공용 postalAddress 변경 방어)', () => {
  it('addressRegion/addressLocality를 주지 않으면 기존과 동일한 출력', () => {
    const s = placeSchema({
      type: 'Hospital',
      name: '서울대병원',
      address: '서울특별시 종로구 대학로 101',
      url: 'https://x/medical/hospital/11110/1',
    }) as Record<string, unknown>;
    expect(s.address).toEqual({
      '@type': 'PostalAddress',
      addressCountry: 'KR',
      streetAddress: '서울특별시 종로구 대학로 101',
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/seo/json-ld.test.ts`
Expected: FAIL — 두 번째 테스트가 `'streetAddress' in addr` 를 `true`로 받거나, 타입 에러로 `addressRegion`을 못 넘김

- [ ] **Step 3: 최소 구현**

`lib/seo/json-ld.tsx`의 `PlaceInput` 인터페이스를 수정:

```ts
interface PlaceInput {
  name: string;
  /** 확정된 주소가 없으면 생략한다. 시군구 등으로 대체 채우지 않는다. */
  address?: string;
  /** 시도 (Residence 전용, 그 외 소비자는 주지 않는다) */
  addressRegion?: string;
  /** 시군구 (Residence 전용) */
  addressLocality?: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  image?: string;
  telephone?: string | null;
  openingHours?: string | null;
}
```

`postalAddress` 함수를 교체:

```ts
function postalAddress(address?: string, region?: string, locality?: string): Json {
  return {
    '@type': 'PostalAddress',
    addressCountry: 'KR',
    ...(region ? { addressRegion: region } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(address ? { streetAddress: address } : {}),
  };
}
```

`residenceSchema`의 `address` 줄만 교체 (`placeSchema`는 손대지 않는다):

```ts
    address: postalAddress(input.address, input.addressRegion, input.addressLocality),
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/seo/json-ld.test.ts`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/json-ld.tsx tests/lib/seo/json-ld.test.ts
git commit -m "feat(seo): PostalAddress에 addressRegion/addressLocality 분리

streetAddress에 시군구를 통째로 넣던 부정확함을 제거한다. 확정 주소가
없으면 속성 자체를 생략한다. placeSchema 소비자는 출력이 불변임을
회귀 테스트로 고정."
```

---

### Task 4: `CopyButton` 클라이언트 컴포넌트

**Files:**
- Create: `components/ui/copy-button.tsx`
- Test: `tests/components/copy-button-ssr.test.ts` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `export function CopyButton({ value, label }: { value: string; label: string })`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/copy-button-ssr.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyButton } from '@/components/ui/copy-button';

// 컴포넌트는 자동 JSX 런타임을 쓰지만 vitest(esbuild)는 classic 런타임으로 변환해
// React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.
(globalThis as unknown as { React: typeof React }).React = React;

// 클립보드 지원 여부는 마운트 후에만 알 수 있으므로 SSR 출력에는 버튼이 없어야 한다.
// (동작하지 않는 버튼을 서버에서 그려놓고 나중에 죽이지 않는다)
describe('CopyButton SSR', () => {
  it('서버 렌더 시에는 아무것도 출력하지 않는다', () => {
    const html = renderToStaticMarkup(
      createElement(CopyButton, { value: '서울특별시 송파구 가락동 913', label: '주소 복사' }),
    );
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/copy-button-ssr.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현**

`components/ui/copy-button.tsx` 생성:

```tsx
'use client';

import { useEffect, useState } from 'react';

interface CopyButtonProps {
  /** 클립보드에 복사할 값 */
  value: string;
  /** 스크린리더용 레이블 (예: "주소 복사") */
  label: string;
}

/**
 * 클립보드 복사 버튼.
 * 클립보드 API를 쓸 수 없는 환경에서는 렌더하지 않는다 — 동작하지 않는 버튼을 보여주지 않는다.
 * 지원 여부는 마운트 후에만 알 수 있으므로 SSR 출력은 항상 비어 있다.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [supported, setSupported] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && !!navigator.clipboard);
  }, []);

  if (!supported) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)] transition hover:bg-[var(--color-soft)]"
      >
        복사
      </button>
      <span role="status" className="text-xs text-[var(--color-muted)]">
        {copied ? '복사됨' : ''}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/copy-button-ssr.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/ui/copy-button.tsx tests/components/copy-button-ssr.test.ts
git commit -m "feat(ui): 범용 클립보드 복사 버튼 추가

클립보드 API가 없으면 렌더하지 않는다. 상위 컴포넌트를 서버 컴포넌트로
유지하기 위해 이 버튼만 클라이언트 경계로 분리한다."
```

---

### Task 5: `AddressLine` 서버 컴포넌트

**Files:**
- Create: `components/ui/address-line.tsx`
- Test: `tests/components/address-line-ssr.test.ts` (신규)

**Interfaces:**
- Consumes: `CopyButton`(Task 4), `Badge`(`components/ui/badge.tsx`), `SourceCaption`(`components/ui/source-caption.tsx`)
- Produces: `export function AddressLine({ display, confirmed }: { display: string; confirmed: boolean })`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/address-line-ssr.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddressLine } from '@/components/ui/address-line';

(globalThis as unknown as { React: typeof React }).React = React;

describe('AddressLine SSR', () => {
  it('확정 주소는 주소 텍스트와 출처를 내고 대표 지번 배지는 없다', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLine, { display: '서울특별시 송파구 가락동 913', confirmed: true }),
    );
    expect(html).toContain('서울특별시 송파구 가락동 913');
    expect(html).toContain('출처:');
    expect(html).toContain('국토교통부');
    expect(html).not.toContain('대표 지번');
    expect(html).not.toContain('여러 지번에 걸쳐');
  });

  it('미확정 주소는 대표 지번 배지와 안내 문구를 함께 낸다', () => {
    const html = renderToStaticMarkup(
      createElement(AddressLine, { display: '광주광역시 남구 상대동 101', confirmed: false }),
    );
    expect(html).toContain('광주광역시 남구 상대동 101');
    expect(html).toContain('대표 지번');
    expect(html).toContain('이 단지의 거래는 여러 지번에 걸쳐 있습니다.');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/address-line-ssr.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 최소 구현**

`components/ui/address-line.tsx` 생성:

```tsx
import { Badge } from '@/components/ui/badge';
import { SourceCaption } from '@/components/ui/source-caption';
import { CopyButton } from '@/components/ui/copy-button';

interface AddressLineProps {
  /** 완성된 표시용 주소 문자열 */
  display: string;
  /** 이 단지의 거래가 단일 지번에 모여 있어 주소가 확정적인지 */
  confirmed: boolean;
}

/**
 * 지도 섹션 상단의 주소 줄. 서버 컴포넌트다.
 * 복사 기능만 CopyButton(클라이언트)으로 분리해 텍스트·배지·출처는 클라이언트 번들에
 * 넣지 않는다. Next는 클라이언트 컴포넌트도 SSR하므로 색인 목적의 분리가 아니라
 * 번들 크기 목적의 분리다.
 */
export function AddressLine({ display, confirmed }: AddressLineProps) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)]">{display}</p>
        {!confirmed && <Badge tone="gray">대표 지번</Badge>}
        <CopyButton value={display} label="주소 복사" />
      </div>
      {!confirmed && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          이 단지의 거래는 여러 지번에 걸쳐 있습니다.
        </p>
      )}
      <SourceCaption ids={['molit-rtms']} />
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/address-line-ssr.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/ui/address-line.tsx tests/components/address-line-ssr.test.ts
git commit -m "feat(ui): 주소 줄 컴포넌트 추가

확정 주소는 그대로, 미확정 주소는 '대표 지번' 배지와 안내 문구를 함께
노출한다. 출처는 SourceCaption 레지스트리를 재사용한다."
```

---

### Task 6: 히어로 지역 표기를 지번주소로

**Files:**
- Modify: `app/(public)/apt/[id]/_components/property-detail-hero.tsx` (아파트·오피스텔·빌라 상세가 공유)
- Test: `tests/components/property-detail-hero-ssr.test.ts` (신규)

**Interfaces:**
- Consumes: `propertyAddress()`(Task 1)
- Produces: 없음 (컴포넌트 props 시그니처는 변경하지 않는다 — 호출부 3곳이 그대로 동작해야 한다)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/property-detail-hero-ssr.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PropertyDetailHero } from '@/app/(public)/apt/[id]/_components/property-detail-hero';
import { PropertyType } from '@prisma/client';
import type { Property, Region } from '@prisma/client';

(globalThis as unknown as { React: typeof React }).React = React;

const region = {
  code: '1171000000',
  sido: '서울특별시',
  sigungu: '송파구',
  eupmyeondong: null,
  ri: null,
  fullName: '서울특별시 송파구',
  level: 2,
  parentCode: null,
  isAbolished: false,
  abolishedAt: null,
  sourceVersion: 'ut',
  updatedAt: new Date('2026-01-01'),
  sigunguCode: '11710',
} as Region;

function makeProperty(address: string): Property {
  return {
    id: 1n,
    propertyType: PropertyType.APARTMENT,
    name: '헬리오시티',
    nameNorm: '헬리오시티',
    regionCode: '1171000000',
    address,
    builtYear: 2018,
    households: 9510,
    buildingCount: null,
    areaTypes: [],
    txCountTotal: 0,
    txCount12m: 12,
    lastTxAt: null,
    saleCount12m: 0,
    saleAvgPrice12m: null,
    saleLastPrice: null,
    saleLastAt: null,
    jeonseCount12m: 0,
    jeonseAvgDeposit12m: null,
    jeonseLastDeposit: null,
    jeonseLastAt: null,
    wolseCount12m: 0,
    wolseAvgDeposit12m: null,
    wolseAvgRent12m: null,
    wolseLastDeposit: null,
    wolseLastRent: null,
    wolseLastAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sigunguCode: '11710',
    redirectToId: null,
  } as unknown as Property;
}

describe('PropertyDetailHero 지역 표기', () => {
  it('지번이 있으면 전체 지번주소를 표기한다', () => {
    const html = renderToStaticMarkup(
      createElement(PropertyDetailHero, { property: makeProperty('가락동 913'), region }),
    );
    expect(html).toContain('서울특별시 송파구 가락동 913');
  });

  it('지번이 비정형이면 법정동까지만 표기한다', () => {
    const html = renderToStaticMarkup(
      createElement(PropertyDetailHero, { property: makeProperty('가락동 가-'), region }),
    );
    expect(html).toContain('서울특별시 송파구 가락동');
    expect(html).not.toContain('가-');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/property-detail-hero-ssr.test.ts`
Expected: FAIL — 첫 테스트가 `서울특별시 송파구`만 찾고 `가락동 913`을 못 찾음

- [ ] **Step 3: 최소 구현**

`app/(public)/apt/[id]/_components/property-detail-hero.tsx` 수정.

import 줄에 추가:

```ts
import { propertyAddress } from '@/lib/property';
```

`const txCount = ...` 위에 추가:

```ts
  const { display } = propertyAddress(property, region);
```

`{region.fullName}` (36번 줄)을 교체:

```tsx
            {display}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/property-detail-hero-ssr.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/apt/\[id\]/_components/property-detail-hero.tsx tests/components/property-detail-hero-ssr.test.ts
git commit -m "feat(property): 상세 히어로에 지번주소 노출

아파트·오피스텔·빌라 상세가 공유하는 컴포넌트라 한 번의 변경으로 셋 다
반영된다. props 시그니처는 유지한다."
```

---

### Task 7: 상세 페이지 3곳 배선

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx` (generateMetadata, 본문 JSX, residenceSchema)
- Modify: `app/(public)/villa/[id]/page.tsx` (동일)
- Modify: `app/(public)/officetel/[id]/page.tsx` (동일)

**Interfaces:**
- Consumes: `propertyAddress()`(Task 1), `cachedHasSingleJibun`(Task 2), `residenceSchema`의 `addressRegion`/`addressLocality`(Task 3), `AddressLine`(Task 5)
- Produces: 없음 (마지막 태스크)

세 파일의 변경이 동일한 형태이므로, 아래 `apt` 기준 코드를 나머지 둘에 그대로 적용한다. **변수명만 다르다** — `villa`/`officetel`의 `generateMetadata`는 property 변수가 `p`이고, 본문은 셋 다 `property`다.

- [ ] **Step 1: 아파트 페이지 — import와 게이트 호출 추가**

`app/(public)/apt/[id]/page.tsx`

import 줄에 추가:

```ts
import { propertyAddress } from '@/lib/property';
import { AddressLine } from '@/components/ui/address-line';
```

`cachedPropertyById`를 가져오는 기존 import에 `cachedHasSingleJibun`를 추가한다 (같은 모듈 `@/lib/insights/apt-loader`).

`generateMetadata` 안, `const indexable = ...` 아래에 추가:

```ts
  const addr = propertyAddress(property, property.region);
  const jibunConfirmed = addr.street !== null ? await cachedHasSingleJibun(BigInt(id)) : false;
```

`propertyMetaDescription`의 `regionFullName` 줄을 교체:

```ts
      regionFullName: jibunConfirmed ? addr.display : property.region.fullName,
```

- [ ] **Step 2: 아파트 페이지 — 본문 게이트와 JSON-LD**

같은 파일의 `export default async function AptDetailPage` 안, `const aptFaq = ...` 아래에 추가:

```ts
  const addr = propertyAddress(property, property.region);
  const jibunConfirmed = addr.street !== null ? await cachedHasSingleJibun(propId) : false;
```

`residenceSchema({ ... })`의 `address:` 줄을 세 줄로 교체:

```ts
            address: jibunConfirmed && addr.street ? addr.street : undefined,
            addressRegion: property.region.sido,
            addressLocality: property.region.sigungu ?? undefined,
```

- [ ] **Step 3: 아파트 페이지 — 지도 섹션에 주소 줄 삽입**

같은 파일의 `<Card id="map">` 안, `<h2>` 아래 `<LocationViewer>` 위에 삽입:

```tsx
              {addr.street && <AddressLine display={addr.display} confirmed={jibunConfirmed} />}
```

- [ ] **Step 4: 타입·린트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과. 실패하면 미사용 import(`detailTitleLocality`는 title에서 계속 쓰므로 남아 있어야 한다)를 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/apt/\[id\]/page.tsx
git commit -m "feat(apt): 상세 페이지에 지번주소 배선

지도 섹션 주소 줄, JSON-LD PostalAddress, description을 신뢰도 게이트
결과에 따라 채운다. 미확정이면 streetAddress를 생략한다."
```

- [ ] **Step 6: 빌라 페이지에 동일 적용**

`app/(public)/villa/[id]/page.tsx`에 Step 1~3과 같은 변경을 한다. 차이는 두 가지뿐이다.

`generateMetadata`의 property 변수가 `p`이므로:

```ts
  const addr = propertyAddress(p, p.region);
  const jibunConfirmed = addr.street !== null ? await cachedHasSingleJibun(BigInt(id)) : false;
```

그리고 `regionFullName` 줄:

```ts
      regionFullName: jibunConfirmed ? addr.display : p.region.fullName,
```

본문(`VillaDetailPage`)은 변수가 `property`, id가 `propId`라 아파트와 완전히 동일하다.

- [ ] **Step 7: 오피스텔 페이지에 동일 적용**

`app/(public)/officetel/[id]/page.tsx`에 Step 6과 동일하게 적용한다. `generateMetadata`의 변수는 `p`, 본문은 `property`/`propId`다.

- [ ] **Step 8: 전체 검증**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 전부 통과

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/property-jibun-gate.test.ts`
Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add app/\(public\)/villa/\[id\]/page.tsx app/\(public\)/officetel/\[id\]/page.tsx
git commit -m "feat(villa,officetel): 상세 페이지에 지번주소 배선

아파트와 동일한 게이트·JSON-LD·description 배선을 적용한다."
```

---

## 완료 기준

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration` 전부 통과
- 아파트·오피스텔·빌라 상세 히어로에 지번주소가 보인다
- 지도 섹션에 주소 줄과 복사 버튼이 있다 (브라우저에서 실제 복사 동작 확인 — SSR 테스트로는 클릭 동작을 검증하지 않는다)
- 여러 지번에 걸친 단지에서 `대표 지번` 배지와 안내 문구가 보이고, 해당 페이지의 JSON-LD에 `streetAddress`가 **없다**
- 병원·학교 등 `placeSchema` 페이지의 JSON-LD 출력이 변하지 않았다

## 범위 밖 (spec §7)

- `roadnm` 필드명 오타로 인한 도로명주소 379만 행 유실
- 동명 단지 병합에 따른 통계 오염 (이번 작업은 주소 표기만 게이트하고 통계는 그대로다)
