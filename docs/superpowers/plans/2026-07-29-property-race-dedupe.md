# 경합 중복 단지 병합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ETL 경합으로 갈라진 중복 단지 레코드를 병합하고, 같은 경합이 다시 나지 않게 태스크 순서를 고친다.

**Architecture:** 태스크 목록 생성을 순수 함수로 뽑아 `월 → 시군구` 순으로 뒤집으면, 동시에 도는 두 태스크가 항상 다른 시군구가 되어 같은 단지를 만들 수 없다. 병합은 순수 로직(생존자 선택·해시 재계산)과 DB 실행을 분리해, 로직은 단위 테스트로 고정하고 실행은 `--dry-run` 기본의 ops 스크립트로 감싼다.

**Tech Stack:** TypeScript, Prisma, PostgreSQL, vitest, tsx

**설계 문서:** `docs/superpowers/specs/2026-07-29-property-race-dedupe-design.md`

## Global Constraints

- 이 계획은 스펙의 **A(경합 방지)와 B(병합 스크립트)만** 다룬다. **C(유니크 제약 마이그레이션)는 이 계획에 포함하지 않는다** — B를 운영에 적용해 중복이 사라진 뒤에야 안전하므로 별도 계획으로 쓴다.
- 병합 그룹 키는 `(propertyType, nameNorm, regionCode, address)` 네 값이 모두 같은 행들. 생존자는 **최소 `id`**.
- 패자는 **삭제하지 않는다.** `redirectToId`를 생존자로 세워 301로 보낸다.
- 거래 이관 시 `rawHash`를 생존자 `id`로 **재계산해야 한다.** `rawHash`는 `propertyId`를 포함하고 `@@unique([rawHash])`다.
- 해시 재계산 시 `exclusiveArea`는 반드시 `Number()`로 변환한다. Prisma `Decimal`은 `JSON.stringify`에서 문자열 `"84.9"`가 되어 ETL의 `84.9`와 다른 해시를 낸다.
- ops 스크립트는 기본 dry-run, `--apply`가 있을 때만 쓴다 (`scripts/ops/coord-quality.ts:20` 관례).
- 통합 테스트는 자체 시드를 쓴다. CI의 check 잡은 시드를 돌리지 않으므로 앰비언트 데이터에 의존하면 깨진다.
- 완료 전 `pnpm lint`를 반드시 통과시킨다. `pnpm typecheck`는 미사용 변수를 잡지 못한다(`noUnusedLocals` 없음).

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `scripts/ingest/transactions/runner.ts` | 태스크 키 생성을 순수 함수로 추출 + 순서 반전, `computeHash` export | 수정 |
| `scripts/ops/merge-duplicate-properties/core.ts` | 순수 로직 — 생존자 선택, 해시 재계산 입력 조립 | 생성 |
| `scripts/ops/merge-duplicate-properties/index.ts` | DB 실행 + CLI (`--dry-run`/`--apply`) | 생성 |
| `tests/ingest/ingest-task-order.test.ts` | 태스크 순서 단위 | 생성 |
| `tests/ops/merge-properties-core.test.ts` | 병합 순수 로직 단위 | 생성 |
| `tests/integration/merge-duplicate-properties.test.ts` | 실 DB 병합 통합 | 생성 |

병합을 디렉터리로 나눈 이유는 순수 로직과 DB 실행의 경계를 파일로 강제하기 위해서다. `core.ts`는 prisma를 import하지 않으므로 단위 테스트가 DB 없이 돈다.

`tests/ops/`는 새 디렉터리다. `test:unit`이 `tests/lib tests/ingest tests/components`만 돌리므로 `package.json`에 추가해야 한다(Task 2에서 처리).

---

### Task 1: 태스크 순서 반전

동시에 도는 두 태스크가 항상 다른 시군구가 되게 한다. 이것만으로 실측된 경합 2,025그룹이 구조적으로 사라진다.

**Files:**
- Modify: `scripts/ingest/transactions/runner.ts` (`main()` 내 태스크 생성 루프, 약 89~110행)
- Test: `tests/ingest/ingest-task-order.test.ts` (생성)

**Interfaces:**
- Consumes: 없음
- Produces:
  ```ts
  export interface IngestTaskKey { api: string; source: string; sgg: string; yyyymm: string }
  export function buildIngestTaskKeys(
    apis: Array<{ api: string; source: string }>,
    months: string[],
    sigunguIds: string[],
    doneKeys: Set<string>,
  ): IngestTaskKey[]
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/ingest-task-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildIngestTaskKeys } from '@/scripts/ingest/transactions/runner';

const API = [{ api: 'aptTrade', source: 'MOLIT_APT_TRADE' }];

describe('buildIngestTaskKeys', () => {
  // 핵심 계약: runWithLimit(…, 2)가 동시에 돌리는 인접 두 태스크가 같은 시군구면
  // 같은 단지를 동시에 생성하는 경합이 난다. 시군구가 2개 이상이면 인접 쌍은 항상 달라야 한다.
  it('인접 태스크는 서로 다른 시군구를 갖는다', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140', '11170'], new Set());
    expect(keys).toHaveLength(6);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i].sgg).not.toBe(keys[i - 1].sgg);
    }
  });

  // 월 경계에서도 깨지지 않아야 한다 — 이전 달 마지막 시군구 vs 다음 달 첫 시군구
  it('월이 바뀌는 지점에서도 시군구가 겹치지 않는다', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110', '11140'], new Set());
    expect(keys.map((k) => `${k.yyyymm}:${k.sgg}`)).toEqual([
      '202601:11110', '202601:11140',
      '202602:11110', '202602:11140',
    ]);
    expect(keys[2].sgg).not.toBe(keys[1].sgg);
  });

  it('doneKeys에 있는 조합은 제외한다', () => {
    const done = new Set(['MOLIT_APT_TRADE:11110-202601']);
    const keys = buildIngestTaskKeys(API, ['202601'], ['11110', '11140'], done);
    expect(keys).toHaveLength(1);
    expect(keys[0].sgg).toBe('11140');
  });

  it('api가 여럿이면 api별로 전체 조합을 낸다', () => {
    const apis = [
      { api: 'aptTrade', source: 'MOLIT_APT_TRADE' },
      { api: 'aptRent', source: 'MOLIT_APT_RENT' },
    ];
    const keys = buildIngestTaskKeys(apis, ['202601'], ['11110', '11140'], new Set());
    expect(keys).toHaveLength(4);
    expect(keys.slice(0, 2).every((k) => k.source === 'MOLIT_APT_TRADE')).toBe(true);
  });

  // 알려진 한계: 시군구가 1개뿐이면 순서로는 못 막는다. 스펙 §4.1의 P2002 재조회(C)가 받는다.
  it('시군구가 1개면 인접 태스크가 같은 시군구다 (한계 문서화)', () => {
    const keys = buildIngestTaskKeys(API, ['202601', '202602'], ['11110'], new Set());
    expect(keys[0].sgg).toBe(keys[1].sgg);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ingest/ingest-task-order.test.ts`
Expected: FAIL — `buildIngestTaskKeys is not a function`

- [ ] **Step 3: 순수 함수 추출**

`scripts/ingest/transactions/runner.ts`에 추가한다. 위치는 `main()` 위, 다른 top-level export 근처.

```ts
export interface IngestTaskKey {
  api: string;
  source: string;
  sgg: string;
  yyyymm: string;
}

/**
 * 실행할 (api, 월, 시군구) 조합을 만든다.
 *
 * 월을 바깥, 시군구를 안쪽에 두는 순서가 load-bearing이다. runWithLimit이 동시에
 * 돌리는 인접 두 태스크가 같은 시군구면, 각 runOne의 propCache가 서로의 신규 생성을
 * 못 봐서 같은 단지를 둘 다 만든다(실측 2,025그룹). 시군구를 안쪽에 두면 인접 쌍이
 * 항상 다른 시군구가 되어 이 경합이 성립하지 않는다.
 */
export function buildIngestTaskKeys(
  apis: Array<{ api: string; source: string }>,
  months: string[],
  sigunguIds: string[],
  doneKeys: Set<string>,
): IngestTaskKey[] {
  const out: IngestTaskKey[] = [];
  for (const { api, source } of apis) {
    for (const yyyymm of months) {
      for (const sgg of sigunguIds) {
        if (doneKeys.has(`${source}:${sgg}-${yyyymm}`)) continue;
        out.push({ api, source, sgg, yyyymm });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ingest/ingest-task-order.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: `main()`이 새 함수를 쓰도록 교체**

기존 3중 루프(`for (const api of apis) { for (const sgg of sigunguIds) { for (const yyyymm of months) {`)를 통째로 아래로 바꾼다. `skipped` 카운터는 전체 조합 수에서 빼는 방식으로 유지한다.

```ts
  const taskKeys = buildIngestTaskKeys(
    apis.map((a) => ({ api: a, source: ADAPTERS[a].source })),
    months,
    sigunguIds,
    doneKeys,
  );
  skipped = apis.length * months.length * sigunguIds.length - taskKeys.length;

  const tasks: Array<() => Promise<void>> = taskKeys.map((k) => async () => {
    try {
      const upserted = await runOne(
        ADAPTERS[k.api as ApiType],
        k.sgg,
        sigunguToRegionCode.get(k.sgg)!,
        k.yyyymm,
        affectedPropertyIds,
      );
      totalUpserted += upserted;
    } catch (err) {
      failed++;
      logger.error({ err, api: k.source, sgg: k.sgg, yyyymm: k.yyyymm }, 'sigungu-month failed');
    }
  });
```

`let skipped = 0;` 선언은 그대로 두고 대입만 바뀐다. `--limit` 주석(“한 실행이 처리할 타깃 수 상한”)은 여전히 맞으므로 건드리지 않는다.

- [ ] **Step 6: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 7: 기존 ETL 테스트 회귀 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ingest`
Expected: 전부 PASS. `runner`의 다른 동작을 건드리지 않았으므로 하나라도 깨지면 추출이 잘못된 것이다.

- [ ] **Step 8: 커밋**

```bash
git add scripts/ingest/transactions/runner.ts tests/ingest/ingest-task-order.test.ts
git commit -m "fix(etl): 태스크 순서를 월→시군구로 반전해 단지 생성 경합 제거"
```

---

### Task 2: 병합 순수 로직

DB를 타지 않는 부분만 먼저 만든다. 생존자 선택과 해시 재계산 입력 조립이 여기 속한다.

**Files:**
- Create: `scripts/ops/merge-duplicate-properties/core.ts`
- Create: `tests/ops/merge-properties-core.test.ts`
- Modify: `scripts/ingest/transactions/runner.ts` (`computeHash`를 export)
- Modify: `package.json:17` (`test:unit`에 `tests/ops` 추가)

**Interfaces:**
- Consumes: `buildIngestTaskKeys`는 쓰지 않는다. `computeHash(row, propertyId)`를 Task 2에서 export로 바꿔 쓴다.
- Produces:
  ```ts
  export interface MergeRow { id: bigint; builtYear: number | null }
  export interface MergePlan<T extends MergeRow> { survivor: T; losers: T[]; builtYear: number | null }
  export function planGroupMerge<T extends MergeRow>(rows: T[]): MergePlan<T> | null

  export interface TxHashInput {
    dealType: string; contractDate: Date; exclusiveArea: unknown;
    floor: number | null; dealAmount: number | null;
    deposit: number | null; monthlyRent: number | null;
  }
  export function hashInputFromDbRow(tx: TxHashInput): {
    dealType: string; contractDate: Date; exclusiveArea: number;
    floor: number | null; dealAmount: number | null;
    deposit: number | null; monthlyRent: number | null;
  }
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ops/merge-properties-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { planGroupMerge, hashInputFromDbRow } from '@/scripts/ops/merge-duplicate-properties/core';

describe('planGroupMerge', () => {
  // 생존자 = 최소 id. 먼저 생성된 쪽이 색인·외부링크를 가졌을 가능성이 높아 SEO 손실이 작다.
  it('최소 id를 생존자로 고른다', () => {
    const plan = planGroupMerge([
      { id: 41205n, builtYear: 2001 },
      { id: 41203n, builtYear: 2001 },
      { id: 41210n, builtYear: 2001 },
    ])!;
    expect(plan.survivor.id).toBe(41203n);
    expect(plan.losers.map((l) => l.id)).toEqual([41205n, 41210n]);
  });

  it('입력 순서가 달라도 같은 결과를 낸다', () => {
    const a = planGroupMerge([{ id: 2n, builtYear: null }, { id: 1n, builtYear: null }])!;
    const b = planGroupMerge([{ id: 1n, builtYear: null }, { id: 2n, builtYear: null }])!;
    expect(a.survivor.id).toBe(b.survivor.id);
  });

  it('행이 1개 이하면 병합할 게 없어 null', () => {
    expect(planGroupMerge([{ id: 1n, builtYear: null }])).toBeNull();
    expect(planGroupMerge([])).toBeNull();
  });

  // 실측: 2,028그룹 중 15그룹만 준공년이 갈린다. 생존자가 비었을 때만 패자 값으로 채운다.
  it('생존자의 builtYear가 null이면 패자 값으로 보충한다', () => {
    const plan = planGroupMerge([
      { id: 1n, builtYear: null },
      { id: 2n, builtYear: 1998 },
    ])!;
    expect(plan.builtYear).toBe(1998);
  });

  it('생존자에 builtYear가 있으면 패자 값으로 덮지 않는다', () => {
    const plan = planGroupMerge([
      { id: 1n, builtYear: 2001 },
      { id: 2n, builtYear: 1998 },
    ])!;
    expect(plan.builtYear).toBe(2001);
  });

  it('전부 null이면 null', () => {
    const plan = planGroupMerge([{ id: 1n, builtYear: null }, { id: 2n, builtYear: null }])!;
    expect(plan.builtYear).toBeNull();
  });
});

describe('hashInputFromDbRow', () => {
  // computeHash는 JSON.stringify를 쓴다. Prisma Decimal은 문자열 "84.9"로 직렬화되어
  // ETL이 만드는 숫자 84.9와 다른 해시를 낸다 — 반드시 Number()로 변환해야 한다.
  it('Decimal exclusiveArea를 number로 바꾼다', () => {
    const out = hashInputFromDbRow({
      dealType: 'SALE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('84.90'),
      floor: 3, dealAmount: 120000, deposit: null, monthlyRent: null,
    });
    expect(out.exclusiveArea).toBe(84.9);
    expect(JSON.stringify({ a: out.exclusiveArea })).toBe('{"a":84.9}');
  });

  it('후행 0을 ETL과 같게 정규화한다', () => {
    const out = hashInputFromDbRow({
      dealType: 'SALE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('84.00'),
      floor: null, dealAmount: null, deposit: null, monthlyRent: null,
    });
    // ETL은 Number('84') → 84
    expect(JSON.stringify({ a: out.exclusiveArea })).toBe('{"a":84}');
  });

  it('null 필드를 undefined로 바꾸지 않는다', () => {
    const out = hashInputFromDbRow({
      dealType: 'JEONSE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('59.99'),
      floor: null, dealAmount: null, deposit: 50000, monthlyRent: null,
    });
    // JSON.stringify는 undefined인 키를 통째로 빼버려 해시가 달라진다
    expect(JSON.stringify(out)).toContain('"floor":null');
    expect(JSON.stringify(out)).toContain('"monthlyRent":null');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ops/merge-properties-core.test.ts`
Expected: FAIL — `Failed to resolve import ".../core"`

- [ ] **Step 3: `core.ts` 구현**

`scripts/ops/merge-duplicate-properties/core.ts` (신규). prisma를 import하지 않는다 — DB 없이 도는 순수 로직이다.

```ts
export interface MergeRow {
  id: bigint;
  builtYear: number | null;
}

export interface MergePlan<T extends MergeRow> {
  survivor: T;
  losers: T[];
  /** 생존자에 적용할 builtYear. 생존자가 비었을 때만 패자 값으로 채운다. */
  builtYear: number | null;
}

/**
 * 한 중복 그룹의 병합 계획을 세운다. 생존자는 최소 id —
 * 먼저 생성된 쪽이 색인·외부링크를 가졌을 가능성이 높아 301로 밀 때 손실이 가장 작고,
 * 규칙이 결정적이라 재실행해도 같은 결과가 나온다.
 */
export function planGroupMerge<T extends MergeRow>(rows: T[]): MergePlan<T> | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const [survivor, ...losers] = sorted;
  const builtYear = survivor.builtYear ?? losers.find((l) => l.builtYear != null)?.builtYear ?? null;
  return { survivor, losers, builtYear };
}

export interface TxHashInput {
  dealType: string;
  contractDate: Date;
  exclusiveArea: unknown;
  floor: number | null;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

/**
 * DB에서 읽은 Transaction 행을 computeHash가 기대하는 형태로 맞춘다.
 *
 * computeHash는 JSON.stringify를 쓰므로 타입이 다르면 같은 값이라도 해시가 달라진다.
 * Prisma Decimal은 {"a":"84.9"}로, ETL의 number는 {"a":84.9}로 직렬화된다.
 * Number()는 후행 0도 정규화해 ETL과 일치시킨다(Decimal('84.00') → 84).
 */
export function hashInputFromDbRow(tx: TxHashInput) {
  return {
    dealType: tx.dealType,
    contractDate: tx.contractDate,
    exclusiveArea: Number(tx.exclusiveArea),
    floor: tx.floor,
    dealAmount: tx.dealAmount,
    deposit: tx.deposit,
    monthlyRent: tx.monthlyRent,
  };
}
```

- [ ] **Step 4: `test:unit`이 `tests/ops`를 포함하도록 수정**

`package.json:17`:

```json
"test:unit": "dotenv -e .env.test -- vitest run tests/lib tests/ingest tests/components tests/ops",
```

- [ ] **Step 5: `computeHash`를 export로 변경**

`scripts/ingest/transactions/runner.ts:279`:

```ts
// 변경 전
function computeHash(row: NormalizedTransaction, propertyId: bigint): string {
// 변경 후
export function computeHash(row: NormalizedTransaction, propertyId: bigint): string {
```

본문은 건드리지 않는다. 병합 스크립트가 ETL과 **같은 함수**를 써야 해시가 어긋나지 않는다 — 복제하면 한쪽만 바뀔 때 조용히 깨진다.

- [ ] **Step 6: 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ops/merge-properties-core.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 7: typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: 무출력 + `✔ No ESLint warnings or errors`

- [ ] **Step 8: 커밋**

```bash
git add scripts/ops/merge-duplicate-properties/core.ts tests/ops/merge-properties-core.test.ts scripts/ingest/transactions/runner.ts package.json
git commit -m "feat(ops): 단지 병합 순수 로직 (생존자 선택·해시 입력 정규화)"
```

---

### Task 3: 병합 실행 스크립트

DB를 실제로 건드리는 부분. 기본 dry-run이고 `--apply`가 있을 때만 쓴다.

**Files:**
- Create: `scripts/ops/merge-duplicate-properties/index.ts`
- Create: `tests/integration/merge-duplicate-properties.test.ts`
- Modify: `package.json` (scripts에 `ops:merge-properties` 추가)

**Interfaces:**
- Consumes:
  ```ts
  // scripts/ops/merge-duplicate-properties/core.ts (Task 2)
  planGroupMerge<T extends MergeRow>(rows: T[]): MergePlan<T> | null
  hashInputFromDbRow(tx: TxHashInput): { dealType; contractDate; exclusiveArea: number; floor; dealAmount; deposit; monthlyRent }
  // scripts/ingest/transactions/runner.ts (Task 2에서 export로 변경)
  computeHash(row: NormalizedTransaction, propertyId: bigint): string
  // scripts/ingest/aggregator.ts (기존)
  updatePropertyAggregates(propertyIds: bigint[]): Promise<void>
  ```
- Produces:
  ```ts
  export interface MergeStats { groups: number; losers: number; moved: number; deleted: number }
  export async function mergeDuplicateProperties(opts: { apply: boolean; limit?: number }): Promise<MergeStats>
  ```

- [ ] **Step 1: 실패하는 통합 테스트 작성**

`tests/integration/merge-duplicate-properties.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { mergeDuplicateProperties } from '@/scripts/ops/merge-duplicate-properties';
import { computeHash } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';
import { assertLocalDatabase } from '../_helpers/assert-local-db';

const REGION = '1168000000';

async function seedRegion() {
  await prisma.region.upsert({
    where: { code: REGION },
    create: {
      code: REGION, sido: '서울특별시', sigungu: '강남구',
      level: 2, isAbolished: false, fullName: '서울특별시 강남구', sourceVersion: 'test',
    },
    update: {},
  });
}

// ETL이 만들 해시와 같은 방식으로 시드해야 병합의 재계산을 진짜로 검증할 수 있다.
function tx(propertyId: bigint, day: number, area: number, amount: number) {
  const row = {
    propertyType: PropertyType.APARTMENT,
    dealType: DealType.SALE,
    contractDate: new Date(Date.UTC(2026, 0, day)),
    exclusiveArea: area,
    floor: 3,
    dealAmount: amount,
    deposit: null,
    monthlyRent: null,
  };
  return {
    rawHash: computeHash(row as unknown as NormalizedTransaction, propertyId),
    propertyId,
    propertyType: PropertyType.APARTMENT,
    regionCode: REGION,
    sigunguCode: '11680',
    dealType: DealType.SALE,
    contractDate: row.contractDate,
    exclusiveArea: area,
    floor: 3,
    dealAmount: amount,
    source: 'TEST',
  };
}

describe('mergeDuplicateProperties', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    await prisma.transaction.deleteMany();
    await prisma.property.deleteMany();
    await seedRegion();
  });

  it('dry-run은 아무것도 바꾸지 않고 건수만 센다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(b.id, 5, 84.9, 120000) });

    const stats = await mergeDuplicateProperties({ apply: false });
    expect(stats.groups).toBe(1);
    expect(stats.losers).toBe(1);
    // dry-run도 해시·충돌 판정을 실제로 돌리므로 --apply와 같은 수치가 나와야 한다
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(0);

    expect((await prisma.property.findUnique({ where: { id: b.id } }))!.redirectToId).toBeNull();
    expect((await prisma.transaction.findFirst())!.propertyId).toBe(b.id);
    expect(a.id < b.id).toBe(true);
  });

  it('패자 둘의 거래 내용이 같으면 하나만 옮기고 나머지는 삭제한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const c = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    // 생존자 a에는 없고, 패자 b·c에 같은 내용의 거래가 하나씩.
    // 둘 다 같은 새 해시로 매핑되므로 하나만 살아남아야 한다 — 아니면 @@unique(rawHash) 위반.
    await prisma.transaction.create({ data: tx(b.id, 7, 84.9, 140000) });
    await prisma.transaction.create({ data: tx(c.id, 7, 84.9, 140000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(1);
    expect(await prisma.transaction.count()).toBe(1);
    expect((await prisma.transaction.findFirst())!.propertyId).toBe(a.id);
  });

  it('거래를 생존자로 옮기고 해시를 재계산한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 6, 84.9, 130000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.moved).toBe(1);
    expect(stats.deleted).toBe(0);

    const all = await prisma.transaction.findMany();
    expect(all).toHaveLength(2);
    expect(all.every((t) => t.propertyId === a.id)).toBe(true);

    // 재계산된 해시가 ETL이 다음에 만들 값과 같아야 한다. 아니면 재수집 때 중복이 다시 들어온다.
    const moved = all.find((t) => t.dealAmount === 130000)!;
    const expected = computeHash(
      { propertyType: PropertyType.APARTMENT, dealType: DealType.SALE,
        contractDate: new Date(Date.UTC(2026, 0, 6)), exclusiveArea: 84.9,
        floor: 3, dealAmount: 130000, deposit: null, monthlyRent: null } as never,
      a.id,
    );
    expect(moved.rawHash).toBe(expected);
  });

  it('생존자에 같은 거래가 이미 있으면 패자 쪽을 삭제한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    // 같은 내용의 거래가 양쪽에 하나씩 — 해시는 propertyId 때문에 다르다
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 5, 84.9, 120000) });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.deleted).toBe(1);
    expect(stats.moved).toBe(0);
    expect(await prisma.transaction.count()).toBe(1);
  });

  it('패자에 redirectToId를 세우고 삭제하지 않는다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });

    await mergeDuplicateProperties({ apply: true });

    const loser = await prisma.property.findUnique({ where: { id: b.id } });
    expect(loser).not.toBeNull();
    expect(loser!.redirectToId).toBe(a.id);
  });

  it('생존자 집계를 다시 계산한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    const b = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.transaction.create({ data: tx(a.id, 5, 84.9, 120000) });
    await prisma.transaction.create({ data: tx(b.id, 6, 84.9, 130000) });

    await mergeDuplicateProperties({ apply: true });

    const survivor = await prisma.property.findUnique({ where: { id: a.id } });
    expect(survivor!.txCountTotal).toBe(2);
  });

  it('주소가 다르면 같은 그룹으로 묶지 않는다', async () => {
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '동신', nameNorm: '동신', regionCode: REGION, address: '금동 10' },
    });
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '동신', nameNorm: '동신', regionCode: REGION, address: '수송동 904' },
    });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.groups).toBe(0);
    expect(await prisma.property.count({ where: { redirectToId: { not: null } } })).toBe(0);
  });

  it('이미 리다이렉트된 행은 그룹에서 제외한다', async () => {
    const a = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1' },
    });
    await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: REGION, address: '역삼동 1', redirectToId: a.id },
    });

    const stats = await mergeDuplicateProperties({ apply: true });
    expect(stats.groups).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/merge-duplicate-properties.test.ts`
Expected: FAIL — `Failed to resolve import ".../merge-duplicate-properties"`

- [ ] **Step 3: 실행 모듈 구현**

`scripts/ops/merge-duplicate-properties/index.ts` (신규):

```ts
// 경합으로 갈라진 중복 단지를 병합한다. 기본 DRY-RUN, 실제 반영은 --apply.
// 그룹 키: (propertyType, nameNorm, regionCode, address), 생존자: 최소 id.
// 패자는 삭제하지 않고 redirectToId로 301을 건다.
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { PropertyType } from '@prisma/client';
import { updatePropertyAggregates } from '@/scripts/ingest/aggregator';
import { computeHash } from '@/scripts/ingest/transactions/runner';
import type { NormalizedTransaction } from '@/scripts/ingest/types';
import { planGroupMerge, hashInputFromDbRow } from './core';

export interface MergeStats {
  groups: number;
  losers: number;
  moved: number;
  deleted: number;
}

interface GroupRow {
  propertyType: string;
  nameNorm: string;
  regionCode: string;
  address: string;
}

export async function mergeDuplicateProperties(opts: { apply: boolean; limit?: number }): Promise<MergeStats> {
  const stats: MergeStats = { groups: 0, losers: 0, moved: 0, deleted: 0 };

  // redirectToId IS NULL — 이미 리다이렉트된 행(2026-07-01 개편분, 이전 병합분)은 대상이 아니다.
  const groups = await prisma.$queryRaw<GroupRow[]>`
    SELECT "propertyType"::text AS "propertyType", "nameNorm", "regionCode", address
    FROM "Property"
    WHERE "redirectToId" IS NULL
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(*) > 1
    ORDER BY 1, 2, 3, 4
  `;

  const targets = opts.limit ? groups.slice(0, opts.limit) : groups;
  logger.info({ groups: targets.length, total: groups.length, apply: opts.apply }, 'merge targets');

  for (const g of targets) {
    const rows = await prisma.property.findMany({
      where: {
        propertyType: g.propertyType as PropertyType,
        nameNorm: g.nameNorm,
        regionCode: g.regionCode,
        address: g.address,
        redirectToId: null,
      },
      select: { id: true, builtYear: true },
    });
    const plan = planGroupMerge(rows);
    if (!plan) continue;

    stats.groups++;
    stats.losers += plan.losers.length;
    const loserIds = plan.losers.map((l) => l.id);

    const txs = await prisma.transaction.findMany({
      where: { propertyId: { in: loserIds } },
      select: {
        id: true, dealType: true, contractDate: true, exclusiveArea: true,
        floor: true, dealAmount: true, deposit: true, monthlyRent: true,
      },
    });

    // 해시 계산과 충돌 판정은 읽기 전용이라 dry-run에서도 그대로 돌린다.
    // 그래야 dry-run의 moved/deleted가 --apply의 실제 결과와 같아진다.
    const toMove: Array<{ id: bigint; hash: string }> = [];
    const toDelete: bigint[] = [];
    const claimed = new Set<string>();
    for (const row of txs) {
      // rawHash는 propertyId를 포함하고 @@unique다. 재계산하지 않으면 다음 수집 때
      // ETL이 생존자 id로 만든 해시와 달라 같은 거래가 다시 삽입된다.
      const newHash = computeHash(hashInputFromDbRow(row) as unknown as NormalizedTransaction, plan.survivor.id);
      // 패자가 둘 이상인 그룹에서는 서로 내용이 같은 거래가 같은 새 해시로 매핑될 수 있다.
      // claimed로 걸러내지 않으면 두 번째 update가 @@unique(rawHash)를 위반한다.
      if (claimed.has(newHash)) {
        toDelete.push(row.id);
        continue;
      }
      const clash = await prisma.transaction.findUnique({ where: { rawHash: newHash }, select: { id: true } });
      if (clash) {
        toDelete.push(row.id);
      } else {
        claimed.add(newHash);
        toMove.push({ id: row.id, hash: newHash });
      }
    }
    stats.moved += toMove.length;
    stats.deleted += toDelete.length;

    if (!opts.apply) {
      logger.info(
        { name: g.nameNorm, address: g.address, survivor: String(plan.survivor.id),
          losers: loserIds.map(String), move: toMove.length, del: toDelete.length },
        'DRY-RUN group',
      );
      continue;
    }

    await prisma.$transaction(async (t) => {
      if (toDelete.length > 0) {
        await t.transaction.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const m of toMove) {
        await t.transaction.update({
          where: { id: m.id },
          data: { propertyId: plan.survivor.id, rawHash: m.hash },
        });
      }
      if (plan.builtYear !== null) {
        await t.property.update({ where: { id: plan.survivor.id }, data: { builtYear: plan.builtYear } });
      }
      await t.property.updateMany({
        where: { id: { in: loserIds } },
        data: { redirectToId: plan.survivor.id },
      });
    });

    await updatePropertyAggregates([plan.survivor.id]);
  }

  logger.info(stats, opts.apply ? 'merge applied' : 'merge dry-run complete');
  return stats;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const stats = await mergeDuplicateProperties({ apply, limit });
  if (!apply) {
    console.log('\n[DRY-RUN] 실제 반영하려면 --apply');
  }
  console.log(JSON.stringify(stats, null, 2));
  await prisma.$disconnect();
}

// 테스트에서 import할 때는 main을 돌리지 않는다.
if (process.argv[1]?.includes('merge-duplicate-properties')) {
  main().catch((err) => {
    logger.error({ err }, 'merge failed');
    process.exit(1);
  });
}
```

- [ ] **Step 4: package.json에 스크립트 등록**

`scripts` 블록에 `ingest:run` 옆으로 추가한다:

```json
"ops:merge-properties": "dotenv -e .env.local -- tsx scripts/ops/merge-duplicate-properties/index.ts",
```

- [ ] **Step 5: 통합 테스트 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/merge-duplicate-properties.test.ts`
Expected: PASS (8 tests)

`assertLocalDatabase()`가 막으면 `.env.test`가 로컬 docker(5433)를 가리키는지 확인한다. 운영 DB를 가리킨 채로는 절대 돌리지 않는다.

- [ ] **Step 6: 전체 스위트 + typecheck + lint**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm dotenv -e .env.test -- vitest run tests/integration`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add scripts/ops/merge-duplicate-properties/index.ts tests/integration/merge-duplicate-properties.test.ts package.json
git commit -m "feat(ops): 중복 단지 병합 스크립트 (dry-run 기본, 해시 재계산)"
```

---

## 검증

전 태스크 완료 후:

| 항목 | 방법 | 기대 |
|---|---|---|
| 태스크 순서 | `tests/ingest/ingest-task-order.test.ts` | 인접 쌍 시군구 상이 |
| 병합 로직 | `tests/ops/merge-properties-core.test.ts` | 9개 통과 |
| 병합 실행 | `tests/integration/merge-duplicate-properties.test.ts` | 8개 통과 |
| ETL 회귀 | `pnpm dotenv -e .env.test -- vitest run tests/ingest` | 전부 통과 |
| 빌드 | `pnpm build` | 성공 |
| lint | `pnpm lint` | 클린 |

`pnpm build`는 CI에 없으므로 직접 돌린다.

## 운영 적용 (머지·배포 후)

이 계획은 **코드만** 담는다. 실제 병합은 배포 후 사람이 실행한다.

1. 운영 DB 백업 (`Property`, `Transaction`)
2. `--dry-run`으로 대상 확인 — 예상 2,012그룹 / 4,096행, 이관 대상 거래 약 48,264건
3. `--limit=50`으로 소규모 선반영 후 결과 확인
4. 전체 `--apply`
5. 생존자들의 거래 건수를 기록
6. **다음 daily ETL이 한 바퀴 돈 뒤 같은 수치를 다시 잰다.** 늘었다면 `exclusiveArea` 정밀도 문제로 해시가 어긋나 중복이 재삽입된 것이므로, 재계산 로직을 고치고 늘어난 행을 정리한다

이 스크립트는 운영 DB에 **쓰기**를 한다. 지금까지 쓰던 읽기전용 터널로는 실행할 수 없고, 실행 시점과 결과를 기록한다.

## 다음 계획 (이 계획 밖)

운영 병합이 끝나고 6번 검증까지 통과하면 **C(유니크 제약)**를 별도 계획으로 쓴다. 내용은 부분 유니크 인덱스 마이그레이션과 `findOrCreateProperty`의 P2002 재조회다. 중복이 남은 상태로 배포하면 `prisma migrate deploy`가 실패해 배포 전체가 죽으므로, 순서를 지켜야 한다.
