# 동네 실거래 목록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 동네의 최근 실거래를 거래 단위로 나열하는 목록을 홈 히어로 오른쪽과 실거래가 상세에 넣는다.

**Architecture:** 조회 함수와 표기 규칙은 공유하고 배치는 분리한다 — 홈은 좁은 패널의 두 줄 압축 목록, 상세는 넓은 본문의 비교 표. 동은 코드가 없고 `Transaction.umd` 이름 문자열로만 존재하므로 `(sigunguCode, umd)` 쌍으로 조회한다. 읍·면·동·리 드롭다운 옵션은 실거래 데이터에서 만들어 ETL 스냅샷에 넣는다.

**Tech Stack:** Next.js 15 App Router · TypeScript · Prisma · vitest(`environment: 'node'`) · `renderToStaticMarkup` SSR 계약 테스트 · Tailwind CSS

## Global Constraints

- **날짜는 연도를 포함한다** — `YY.MM.DD`. 기간 제한이 없어 몇 년 전 거래가 섞이므로 `MM.DD`만 쓰면 올해 거래처럼 보인다.
- **금액은 바로 위 섹션과 같은 표기를 쓴다** — `formatBillion` 기반의 `9.5억`, 월세는 `보 5,000만원 / 월 150만`. `unified-transaction-table.tsx:25-31`과 동일. 목업의 `9억 5,000`을 쓰면 인접 섹션과 어긋난다.
- **`excludePropertyId`는 조회 단계 `WHERE`에 넣는다.** 가져온 뒤 거르면 앞 N건이 전부 자기 건물일 때 다른 거래를 놓친다.
- **취소된 거래를 제외한다** — `cancelDate IS NULL`.
- **정렬은 `[contractDate desc, id desc]`.** 같은 계약일 안에서 순서가 흔들리지 않게 한다.
- **옵션에 거래 건수 임계값을 두지 않는다.** 거래가 1건이라도 있는 `(sigunguCode, umd)` 조합을 모두 옵션으로 쓴다.
- **목록 하단 「더 보기」를 두지 않는다.** 홈·상세 둘 다.
- **빈 결과·로딩·실패를 구분한다.** 최초 0건은 섹션 숨김, 필터 변경 후 0건은 패널 유지 + 안내, 로딩은 스켈레톤, 실패는 재시도.
- **건물 유형을 행에 표기하지 않는다.** 목록 전체가 하나의 유형으로 필터돼 있다.
- **두 칸 전환은 `xl`(1280px)부터.** `lg`에서는 오른쪽 패널이 323px로 부족하다.
- 결측은 렌더하지 않는다. `—`·`정보 없음` 금지.
- 그림자는 `--shadow-soft` 하나. 한글 본문 14px 이상. 접근성 WCAG 2.1 AA.
- 스펙: `docs/superpowers/specs/2026-09-16-dong-transactions-design.md`

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/transaction/dong-format.ts` | **신규.** 날짜·금액·면적·층 표기. 순수 함수 |
| `lib/transaction/dong.ts` | **신규.** `umdOfProperty`, `getDongTransactions` |
| `lib/dong-options.ts` | **신규.** 읍·면·동·리 옵션 스냅샷 read/write |
| `scripts/dashboard/refresh-snapshot.ts` | **수정.** 옵션 스냅샷 갱신 추가 |
| `app/api/dongs/route.ts` | **신규.** 시군구별 읍·면·동·리 목록 |
| `app/api/dong-transactions/route.ts` | **신규.** 홈 패널의 목록 조회 |
| `app/(public)/apt/[id]/_components/dong-transaction-section.tsx` | **신규.** 상세 표 |
| `app/(public)/{apt,villa,officetel}/[id]/page.tsx` | **수정.** 섹션 배선 |
| `app/(public)/apt/[id]/_components/detail-sidebar.tsx` | **수정.** 목차 항목 |
| `app/(public)/_components/dong-transaction-panel.tsx` | **신규.** 홈 패널(클라이언트) |
| `app/(public)/_components/hero-section.tsx` | **수정.** 2단 재구성 |
| `app/(public)/page.tsx` | **수정.** `StatsBar` 이동, 패널 데이터 전달 |

---

## Task 1: 표기 규칙 (순수 함수)

**Files:**
- Create: `lib/transaction/dong-format.ts`
- Test: `tests/lib/dong-format.test.ts`

**Interfaces:**
- Produces: `formatDongDate(iso: string): string`, `formatDongPrice(tx: Pick<DongTransaction,'dealType'|'dealAmount'|'deposit'|'monthlyRent'>): string`, `formatDongMeta(tx: Pick<DongTransaction,'exclusiveArea'|'floor'|'contractDate'>): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lib/dong-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDongDate, formatDongPrice, formatDongMeta } from '@/lib/transaction/dong-format';

describe('formatDongDate — 연도를 반드시 포함한다', () => {
  it('YY.MM.DD로 쓴다', () => {
    expect(formatDongDate('2026-09-09')).toBe('26.09.09');
  });
  it('몇 년 전 거래도 연도로 구분된다', () => {
    expect(formatDongDate('2019-03-04')).toBe('19.03.04');
  });
  it('한 자리 월·일을 0으로 채운다', () => {
    expect(formatDongDate('2026-01-02')).toBe('26.01.02');
  });
});

// 바로 위 섹션(unified-transaction-table.tsx:25-31)과 같은 표기를 쓴다.
// formatBillion 실측: 95000 → '9.5억', 8000 → '8,000만원', 290000 → '29억'
describe('formatDongPrice — 인접 섹션과 같은 표기', () => {
  it('매매는 거래가', () => {
    expect(formatDongPrice({ dealType: 'SALE', dealAmount: 95000, deposit: null, monthlyRent: null }))
      .toBe('9.5억');
  });
  it('전세는 보증금', () => {
    expect(formatDongPrice({ dealType: 'JEONSE', dealAmount: null, deposit: 95000, monthlyRent: null }))
      .toBe('9.5억');
  });
  it('월세는 보증금과 월세를 라벨과 함께 쓴다', () => {
    expect(formatDongPrice({ dealType: 'WOLSE', dealAmount: null, deposit: 5000, monthlyRent: 150 }))
      .toBe('보 5,000만원 / 월 150만');
  });
  it('월세 축약(5,000/150)을 쓰지 않는다', () => {
    const out = formatDongPrice({ dealType: 'WOLSE', dealAmount: null, deposit: 5000, monthlyRent: 150 });
    expect(out).toContain('보 ');
    expect(out).toContain('월 ');
  });
  it('억 미만은 만원으로만 쓴다', () => {
    expect(formatDongPrice({ dealType: 'JEONSE', dealAmount: null, deposit: 8000, monthlyRent: null }))
      .toBe('8,000만원');
  });
  it('금액이 없으면 빈 문자열', () => {
    expect(formatDongPrice({ dealType: 'SALE', dealAmount: null, deposit: null, monthlyRent: null })).toBe('');
  });
});

describe('formatDongMeta — 면적 · 층 · 날짜', () => {
  it('셋을 가운뎃점으로 잇는다', () => {
    expect(formatDongMeta({ exclusiveArea: 84.12, floor: 11, contractDate: '2026-09-09' }))
      .toBe('84㎡ · 11층 · 26.09.09');
  });
  it('층이 없으면 그 조각을 생략한다 — —를 찍지 않는다', () => {
    const out = formatDongMeta({ exclusiveArea: 59.9, floor: null, contractDate: '2026-09-09' });
    expect(out).toBe('60㎡ · 26.09.09');
    expect(out).not.toContain('—');
  });
  it('면적은 반올림한 정수로 쓴다', () => {
    expect(formatDongMeta({ exclusiveArea: 84.97, floor: 3, contractDate: '2026-01-02' }))
      .toBe('85㎡ · 3층 · 26.01.02');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/dong-format.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`lib/transaction/dong-format.ts`:

```ts
import { formatBillion } from '@/lib/format';
import type { DealType } from '@prisma/client';

/**
 * 동네 거래 목록의 표기 규칙. 홈 패널과 상세 표가 공유한다.
 *
 * 날짜에 연도를 반드시 넣는다 — 이 목록은 기간 제한이 없어 몇 년 전 거래가 섞인다.
 * MM.DD만 쓰면 2019년 거래가 올해 거래처럼 보인다(스펙 §3.5, §4.3).
 */
export function formatDongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${y.slice(2)}.${m}.${d}`;
}

type PriceFields = {
  dealType: DealType;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
};

/**
 * 상세에서 이 목록 바로 위에 있는 「이 단지 최근 실거래 내역」과 같은 표기를 쓴다
 * (unified-transaction-table.tsx:25-31). 인접한 두 섹션이 같은 종류의 값을 다르게
 * 적으면 같은 지표가 두 값으로 읽힌다.
 *
 * '보'·'월' 라벨이 있어 5,000/150 축약의 문제(어느 쪽이 보증금인지 읽을 수 없음)는 없다.
 */
export function formatDongPrice(tx: PriceFields): string {
  if (tx.dealType === 'SALE') return tx.dealAmount == null ? '' : formatBillion(tx.dealAmount);
  if (tx.dealType === 'JEONSE') return tx.deposit == null ? '' : formatBillion(tx.deposit);
  if (tx.deposit == null || tx.monthlyRent == null) return '';
  return `보 ${formatBillion(tx.deposit)} / 월 ${tx.monthlyRent.toLocaleString('ko-KR')}만`;
}

type MetaFields = { exclusiveArea: number; floor: number | null; contractDate: string };

/** 층이 없으면 그 조각을 통째로 뺀다. 결측에 자리표시자를 두지 않는다. */
export function formatDongMeta(tx: MetaFields): string {
  const parts = [`${Math.round(tx.exclusiveArea)}㎡`];
  if (tx.floor != null) parts.push(`${tx.floor}층`);
  parts.push(formatDongDate(tx.contractDate));
  return parts.join(' · ');
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/dong-format.test.ts`
Expected: PASS (12개)

기대값은 `formatBillion`의 실제 출력을 확인해 적은 것이다 — `95000 → '9.5억'`, `8000 → '8,000만원'`, `290000 → '29억'`.

- [ ] **Step 5: 커밋**

```bash
git add lib/transaction/dong-format.ts tests/lib/dong-format.test.ts
git commit -m "feat(dong): 동네 거래 목록 표기 규칙

날짜에 연도를 넣는다. 이 목록은 기간 제한이 없어 몇 년 전 거래가 섞이는데
MM.DD만 쓰면 올해 거래처럼 보인다.

금액은 바로 위 섹션(이 단지 최근 실거래 내역)과 같은 표기를 쓴다. 인접한 두
섹션이 같은 종류의 값을 다르게 적으면 같은 지표가 두 값으로 읽힌다."
```

---

## Task 2: 조회 계층

**Files:**
- Create: `lib/transaction/dong.ts`
- Test: `tests/lib/dong-umd.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `DongTransaction` 타입, `umdOfProperty(address: string): string`, `getDongTransactions(opts): Promise<DongTransaction[]>`

- [ ] **Step 1: `umdOfProperty` 테스트를 쓴다**

`tests/lib/dong-umd.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { umdOfProperty } from '@/lib/transaction/dong';

// Property.address는 umd + ' ' + jibun으로 조립된다(lib/property.ts:93).
// 마지막 토큰만 떼면 실거래 Transaction.umd와 같은 형식이 나온다.
// 실측: 표본 3,000건 중 2,970건(99.0%) 일치.
describe('umdOfProperty', () => {
  it('지번을 뗀다', () => {
    expect(umdOfProperty('범어동 2272')).toBe('범어동');
  });
  it('가지번도 하나의 토큰으로 본다', () => {
    expect(umdOfProperty('가락동 164-1')).toBe('가락동');
  });
  it('읍면+리는 통째로 남긴다 — 실거래 umd가 그 형식이다', () => {
    expect(umdOfProperty('고촌읍 신곡리 100')).toBe('고촌읍 신곡리');
  });
  it('동1가 표기를 유지한다', () => {
    expect(umdOfProperty('수성동1가 15')).toBe('수성동1가');
  });
  it('공백이 여러 개여도 마지막 토큰만 뗀다', () => {
    expect(umdOfProperty('범어동   2272')).toBe('범어동');
  });
  it('토큰이 하나뿐이면 그대로 둔다', () => {
    expect(umdOfProperty('범어동')).toBe('범어동');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/dong-umd.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

`lib/transaction/dong.ts`:

```ts
import { Prisma } from '@prisma/client';
import type { DealType, PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface DongTransaction {
  id: string;
  contractDate: string; // 'YYYY-MM-DD'
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  exclusiveArea: number;
  floor: number | null;
  dealType: DealType;
  dealAmount: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}

/**
 * Property에서 읍·면·동·리를 얻는다.
 *
 * Property에 umd 컬럼은 없다. 대신 address가 `umd + ' ' + jibun`으로 조립되므로
 * (lib/property.ts:93) 마지막 토큰만 떼면 실거래 Transaction.umd와 같은 형식이 된다.
 * 실측 표본 3,000건 중 2,970건(99.0%) 일치.
 *
 * scripts/ingest/apt-complex/match.ts의 dongOfAddress()를 쓰면 안 된다 — 그 함수는
 * **앞** 토큰을 뽑아 '고촌읍 신곡리 100' → '고촌읍'을 반환하는데, 실거래 umd는
 * '고촌읍 신곡리'라 지방에서 어긋난다.
 */
export function umdOfProperty(address: string): string {
  return address.trim().replace(/\s+\S+$/, '');
}

export async function getDongTransactions(opts: {
  sigunguCode: string;
  umd: string;
  dealType?: DealType;
  propertyType?: PropertyType;
  excludePropertyId?: bigint;
  limit?: number;
}): Promise<DongTransaction[]> {
  const { sigunguCode, umd, dealType, propertyType, excludePropertyId, limit = 8 } = opts;

  // regionCode는 법정동이 아니라 시군구 코드에 0을 채운 값이다(스펙 §3.1).
  // 이렇게 넘겨야 [regionCode, contractDate desc] 인덱스를 탄다.
  const regionCode = `${sigunguCode}00000`;

  const rows = await prisma.transaction.findMany({
    where: {
      regionCode,
      umd,
      // 해제 신고된 거래를 '최근 거래'로 보여주지 않는다.
      cancelDate: null,
      ...(dealType ? { dealType } : {}),
      ...(propertyType ? { propertyType } : {}),
      // 조회 단계에서 제외한다. 가져온 뒤 거르면 앞 N건이 전부 자기 건물일 때
      // 다른 거래를 놓친다.
      ...(excludePropertyId ? { propertyId: { not: excludePropertyId } } : {}),
    },
    // 같은 계약일 안에서 순서가 흔들리지 않게 id로 잇는다(저장소 관례).
    orderBy: [{ contractDate: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      contractDate: true,
      propertyId: true,
      propertyType: true,
      exclusiveArea: true,
      floor: true,
      dealType: true,
      dealAmount: true,
      deposit: true,
      monthlyRent: true,
      property: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: String(r.id),
    contractDate: r.contractDate.toISOString().slice(0, 10),
    propertyId: String(r.propertyId),
    propertyName: r.property.name,
    propertyType: r.propertyType,
    exclusiveArea: Number(r.exclusiveArea),
    floor: r.floor,
    dealType: r.dealType,
    dealAmount: r.dealAmount,
    deposit: r.deposit,
    monthlyRent: r.monthlyRent,
  }));
}
```

`Transaction` 모델에 `property` 관계 필드가 없으면 `include` 대신 `propertyId`로 2차 조회하지 말고, 스키마의 실제 관계 이름을 확인해 그것을 쓴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/dong-umd.test.ts && pnpm typecheck`
Expected: PASS (6개), 타입 오류 없음

`getDongTransactions`는 DB가 필요해 유닛 테스트를 두지 않는다. 로컬 DB는 비어 있어 의미 있는 검증이 안 된다. **실데이터 확인은 컨트롤러가 운영 읽기전용으로 수행한다.**

- [ ] **Step 5: 커밋**

```bash
git add lib/transaction/dong.ts tests/lib/dong-umd.test.ts
git commit -m "feat(dong): 동네 거래 조회 계층

동은 코드가 없고 Transaction.umd 이름 문자열로만 존재한다. regionCode는
법정동이 아니라 시군구 코드에 0을 채운 값이라 (sigunguCode, umd) 쌍으로 조회한다.

excludePropertyId를 WHERE에 넣는다. 가져온 뒤 거르면 앞 N건이 전부 자기
건물일 때 다른 거래를 놓친다. 취소 거래(cancelDate)는 제외한다.

umdOfProperty는 주소의 마지막 토큰을 뗀다. 기존 dongOfAddress()는 앞 토큰을
뽑아 '고촌읍 신곡리 100'을 '고촌읍'으로 만들어 지방에서 어긋난다."
```

---

## Task 3: 읍·면·동·리 옵션 스냅샷과 API

**Files:**
- Create: `lib/dong-options.ts`
- Create: `app/api/dongs/route.ts`
- Create: `app/api/dong-transactions/route.ts`
- Modify: `scripts/dashboard/refresh-snapshot.ts`

**Interfaces:**
- Consumes: Task 2의 `getDongTransactions`
- Produces: `DongOption { umd: string; txCount: number }`, `writeDongOptions(): Promise<void>`, `readDongOptions(sigunguCode: string): Promise<DongOption[]>`, `readTopDong(sigunguCode: string): Promise<DongOption | null>`

- [ ] **Step 1: 스냅샷 모듈을 만든다**

라이브 조회는 강남구에서 101ms가 걸리고 병렬 워커 3개를 쓴다. 드롭다운마다 돌릴 수 없어 사전계산한다. 이 저장소가 홈 브리핑·인기지역에 이미 쓰는 방식이다(`lib/dashboard-snapshot.ts`).

`lib/dong-options.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const KEY = 'dong_options';

export interface DongOption {
  umd: string;
  txCount: number;
}

/** sigunguCode → 그 시군구의 읍·면·동·리 목록. 가나다순으로 저장한다. */
type Payload = Record<string, DongOption[]>;

/**
 * ETL에서 호출. 실거래 데이터의 실제 (시군구, 동) 조합을 옵션으로 만든다.
 *
 * Region 테이블로 만들면 안 된다 — 실거래의 조합 5,285개 중 Region과 이름이 맞는 건
 * 40%뿐이다. 지방은 '읍면 + 리'가 통째로 들어오고 Region 쪽에 결손·행정동 혼재가 있다.
 * 데이터에서 만들면 모든 선택지가 구조적으로 결과를 갖는다(스펙 §3.2).
 *
 * 거래 건수로 거르지 않는다. 뜸한 동도 그 동네 사람에게는 유효한 조회 대상이고,
 * 건수는 데이터 오류를 판정하지 못한다(스펙 §3.3).
 */
export async function writeDongOptions(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ sigungu_code: string; umd: string; n: bigint }>>`
    SELECT "sigunguCode" AS sigungu_code, umd, COUNT(*) AS n
    FROM "Transaction"
    WHERE umd IS NOT NULL AND "sigunguCode" IS NOT NULL
    GROUP BY 1, 2
  `;

  const payload: Payload = {};
  for (const r of rows) {
    (payload[r.sigungu_code] ??= []).push({ umd: r.umd, txCount: Number(r.n) });
  }
  // 드롭다운은 가나다순이다. 거래량순은 사용자가 특정 동의 위치를 예측할 수 없다.
  for (const list of Object.values(payload)) {
    list.sort((a, b) => a.umd.localeCompare(b.umd, 'ko'));
  }

  await prisma.dashboardSnapshot.upsert({
    where: { key: KEY },
    create: { key: KEY, payload: payload as unknown as Prisma.InputJsonValue },
    update: { payload: payload as unknown as Prisma.InputJsonValue },
  });
}

async function readPayload(): Promise<Payload> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: KEY } });
  return (row?.payload as unknown as Payload) ?? {};
}

/** 가나다순 목록. 스냅샷이 없으면 빈 배열. */
export async function readDongOptions(sigunguCode: string): Promise<DongOption[]> {
  return (await readPayload())[sigunguCode] ?? [];
}

/**
 * 홈 첫 화면의 기본 동. 거래량이 가장 많은 동을 고른다.
 * 드롭다운 정렬(가나다순)과 달리 여기서는 거래량이 기준이다 — 첫 화면에 빈 목록을
 * 띄우지 않기 위해서다.
 */
export async function readTopDong(sigunguCode: string): Promise<DongOption | null> {
  const list = await readDongOptions(sigunguCode);
  if (list.length === 0) return null;
  return list.reduce((best, cur) => (cur.txCount > best.txCount ? cur : best));
}
```

- [ ] **Step 2: ETL에 붙인다**

`scripts/dashboard/refresh-snapshot.ts`의 `writeHomeSnapshot` 호출부를 교체한다:

```ts
  const { writeHomeSnapshot } = await import('@/lib/dashboard-snapshot');
  const { writeDongOptions } = await import('@/lib/dong-options');

  // 단일 커넥션에 statement_timeout 해제(대량 집계가 기본 한도에 걸리지 않도록).
  await prisma.$executeRawUnsafe(`SET statement_timeout = 0`);

  const t = Date.now();
  await writeHomeSnapshot();
  await writeDongOptions();
  console.log(`[dashboard-snapshot] refreshed in ${Date.now() - t}ms`);
```

`deploy/run-etl.sh`는 이미 이 스크립트를 부르므로 **수정하지 않는다.**

- [ ] **Step 3: API 두 개를 만든다**

`app/api/dongs/route.ts`:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readDongOptions } from '@/lib/dong-options';

export async function GET(request: NextRequest) {
  const sigunguCode = request.nextUrl.searchParams.get('sigunguCode');
  if (!sigunguCode) return NextResponse.json([]);
  return NextResponse.json(await readDongOptions(sigunguCode));
}
```

`app/api/dong-transactions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { DealType, PropertyType } from '@prisma/client';
import { getDongTransactions } from '@/lib/transaction/dong';

const DEAL_TYPES = new Set<string>(['SALE', 'JEONSE', 'WOLSE']);
const PROPERTY_TYPES = new Set<string>(['APARTMENT', 'OFFICETEL', 'MULTIPLEX', 'ROW_HOUSE']);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const sigunguCode = p.get('sigunguCode');
  const umd = p.get('umd');
  if (!sigunguCode || !umd) return NextResponse.json([]);

  const dealRaw = p.get('dealType');
  const typeRaw = p.get('propertyType');

  return NextResponse.json(
    await getDongTransactions({
      sigunguCode,
      umd,
      dealType: dealRaw && DEAL_TYPES.has(dealRaw) ? (dealRaw as DealType) : undefined,
      propertyType: typeRaw && PROPERTY_TYPES.has(typeRaw) ? (typeRaw as PropertyType) : undefined,
      limit: 8,
    }),
  );
}
```

`PROPERTY_TYPES`의 값이 `@prisma/client`의 `PropertyType` enum과 다르면, 스키마의 실제 enum 멤버를 확인해 맞춘다.

- [ ] **Step 4: 타입체크·린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 통과

스냅샷이 아직 비어 있어 `/api/dongs`는 빈 배열을 돌려준다. 정상이다. **운영 스냅샷 생성은 컨트롤러가 배포 후 ETL로 수행한다.**

- [ ] **Step 5: 커밋**

```bash
git add lib/dong-options.ts app/api/dongs/route.ts app/api/dong-transactions/route.ts scripts/dashboard/refresh-snapshot.ts
git commit -m "feat(dong): 읍·면·동·리 옵션 스냅샷과 API

드롭다운 옵션을 실거래 데이터에서 만든다. Region 테이블로 만들면 이름이 맞는
조합이 40%뿐이라 0건 옵션이 대량 발생한다.

라이브 DISTINCT는 강남구에서 101ms에 병렬 워커 3개를 쓴다. 드롭다운마다 돌릴 수
없어 기존 대시보드 스냅샷 경로에 붙였다.

거래 건수로 거르지 않는다. 뜸한 동도 유효한 조회 대상이고 건수는 데이터 오류를
판정하지 못한다. 드롭다운은 가나다순, 기본 동 선정만 거래량순이다."
```

---

## Task 4: 상세 페이지 섹션

**Files:**
- Create: `app/(public)/apt/[id]/_components/dong-transaction-section.tsx`
- Test: `tests/components/dong-transaction-section.test.tsx`
- Modify: `app/(public)/apt/[id]/page.tsx`, `app/(public)/villa/[id]/page.tsx`, `app/(public)/officetel/[id]/page.tsx`
- Modify: `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

**Interfaces:**
- Consumes: Task 1의 `formatDongDate`·`formatDongPrice`, Task 2의 `DongTransaction`·`getDongTransactions`·`umdOfProperty`
- Produces: `<DongTransactionSection items dongLabel propertyType id? />`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/components/dong-transaction-section.test.tsx`:

```tsx
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DongTransactionSection } from '@/app/(public)/apt/[id]/_components/dong-transaction-section';
import type { DongTransaction } from '@/lib/transaction/dong';

// 이 저장소 vitest는 esbuild classic JSX 변환을 쓴다. .tsx 테스트에서 JSX를 쓰려면
// React가 전역에 있어야 한다(tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

const TX: DongTransaction[] = [
  {
    id: '1', contractDate: '2026-09-09', propertyId: '10',
    propertyName: '올림픽훼밀리타운', propertyType: 'APARTMENT',
    exclusiveArea: 84.12, floor: 11, dealType: 'JEONSE',
    dealAmount: null, deposit: 95000, monthlyRent: null,
  },
  {
    id: '2', contractDate: '2019-03-04', propertyId: '11',
    propertyName: '문정래미안', propertyType: 'APARTMENT',
    exclusiveArea: 115.0, floor: null, dealType: 'WOLSE',
    dealAmount: null, deposit: 5000, monthlyRent: 150,
  },
];

const html = (items: DongTransaction[], propertyType: DongTransaction['propertyType'] = 'APARTMENT') =>
  renderToStaticMarkup(
    <DongTransactionSection items={items} dongLabel="문정동" propertyType={propertyType} />,
  );

describe('DongTransactionSection', () => {
  it('제목에 동 이름과 정렬 기준을 밝힌다', () => {
    const out = html(TX);
    expect(out).toContain('문정동 최근 거래');
    expect(out).toContain('계약일순');
  });

  it('아파트는 "다른 단지"라고 쓴다', () => {
    expect(html(TX, 'APARTMENT')).toContain('다른 단지');
  });

  it('빌라·오피스텔은 "다른 건물"이라고 쓴다', () => {
    expect(html(TX, 'OFFICETEL')).toContain('다른 건물');
    expect(html(TX, 'MULTIPLEX')).toContain('다른 건물');
  });

  it('날짜에 연도를 표기한다 — 몇 년 전 거래가 올해처럼 보이면 안 된다', () => {
    const out = html(TX);
    expect(out).toContain('26.09.09');
    expect(out).toContain('19.03.04');
  });

  it('월세를 라벨과 함께 쓴다', () => {
    const out = html(TX);
    expect(out).toContain('보 5,000만원');
    expect(out).toContain('월 150만');
  });

  it('층이 없으면 그 칸을 비우고 —를 찍지 않는다', () => {
    expect(html(TX)).not.toContain('—');
  });

  it('items가 비면 아무것도 렌더하지 않는다', () => {
    expect(html([])).toBe('');
  });

  it('「더 보기」 링크를 두지 않는다', () => {
    const out = html(TX);
    expect(out).not.toContain('더 보기');
    expect(out).not.toContain('전체 보기');
  });

  it('건물명을 상세로 링크한다', () => {
    expect(html(TX)).toContain('/apt/10');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-section.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트를 만든다**

착수 전 `DESIGN.md`를 읽고 인접 컴포넌트(`app/(public)/apt/[id]/_components/`)의 마크업·클래스 관례에 맞춘다.

`app/(public)/apt/[id]/_components/dong-transaction-section.tsx`:

```tsx
import Link from 'next/link';
import type { PropertyType } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type { DongTransaction } from '@/lib/transaction/dong';
import { formatDongDate, formatDongPrice } from '@/lib/transaction/dong-format';

const SLUG: Record<string, string> = {
  APARTMENT: 'apt',
  OFFICETEL: 'officetel',
  MULTIPLEX: 'villa',
  ROW_HOUSE: 'villa',
};

const DEAL_LABEL: Record<string, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

/**
 * 같은 동네의 최근 거래. 아래 「주변 단지 가격 비교」(반경 2km·거리순)와 다른 섹션이라
 * 제목에 정렬 기준을 밝혀 성격 차이를 드러낸다(스펙 §2).
 *
 * 5건 고정이고 「더 보기」를 두지 않는다. /list는 건물 목록이라 거기로 보내면 탐색의
 * 성격이 바뀐다(스펙 §6.8).
 */
export function DongTransactionSection({
  items,
  dongLabel,
  propertyType,
  id,
}: {
  items: DongTransaction[];
  dongLabel: string;
  propertyType: PropertyType;
  id?: string;
}) {
  if (items.length === 0) return null;

  const unitWord = propertyType === 'APARTMENT' ? '다른 단지' : '다른 건물';

  return (
    <Card id={id}>
      <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">{dongLabel} 최근 거래</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        같은 동네 {unitWord}의 계약일순 내역입니다
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
              <th scope="col" className="py-2 font-normal">계약일</th>
              <th scope="col" className="py-2 font-normal">건물명</th>
              <th scope="col" className="py-2 font-normal">전용면적</th>
              <th scope="col" className="py-2 font-normal">거래유형</th>
              <th scope="col" className="py-2 text-right font-normal">거래가</th>
              <th scope="col" className="py-2 text-right font-normal">층</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="py-3 text-[var(--color-muted)]">{formatDongDate(t.contractDate)}</td>
                <td className="py-3">
                  <Link
                    href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                    className="font-semibold text-[var(--color-blue-dark)] hover:underline"
                  >
                    {t.propertyName}
                  </Link>
                </td>
                <td className="py-3 text-[var(--color-muted)]">{Math.round(t.exclusiveArea)}㎡</td>
                <td className="py-3 text-[var(--color-muted)]">{DEAL_LABEL[t.dealType]}</td>
                <td className="py-3 text-right font-bold text-[var(--color-blue-dark)]">
                  {formatDongPrice(t)}
                </td>
                <td className="py-3 text-right text-[var(--color-muted)]">
                  {t.floor != null ? `${t.floor}층` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceCaption ids={['molit-rtms']} />
    </Card>
  );
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-section.test.tsx`
Expected: PASS (9개)

- [ ] **Step 5: 세 페이지에 배선한다**

세 파일 모두 **줄 번호가 아니라 문자열로 찾아** 바꾼다.

`app/(public)/apt/[id]/page.tsx`에 import를 더한다:

```tsx
import { DongTransactionSection } from './_components/dong-transaction-section';
import { getDongTransactions, umdOfProperty } from '@/lib/transaction/dong';
```

villa·officetel은 상대경로가 다르다:

```tsx
import { DongTransactionSection } from '../../apt/[id]/_components/dong-transaction-section';
```

세 페이지 모두 데이터 조회를 더한다. 기존 `Promise.all` 블록 뒤에 둔다:

```tsx
  const dongUmd = umdOfProperty(property.address);
  const dongTx = property.sigunguCode
    ? await getDongTransactions({
        sigunguCode: property.sigunguCode,
        umd: dongUmd,
        propertyType: property.propertyType,
        excludePropertyId: property.id,
        limit: 5,
      })
    : [];
```

`<PriceCharts ... />` **바로 다음 줄**에 섹션을 넣는다:

```tsx
          <DongTransactionSection
            id="dong"
            items={dongTx}
            dongLabel={dongUmd}
            propertyType={property.propertyType}
          />
```

- [ ] **Step 6: 사이드바 목차에 항목을 더한다**

`app/(public)/apt/[id]/_components/detail-sidebar.tsx`의 `ANCHORS` 배열에서 `{ href: '#chart', ... }` 다음에 한 줄을 넣는다:

```tsx
  { href: '#dong', label: '동네 최근 거래', needsDong: true },
```

`showComplex`와 같은 방식으로 `showDong` prop을 더하고 필터에 반영한다:

```tsx
          {ANCHORS.filter((a) => (!a.needsComplex || showComplex) && (!a.needsDong || showDong)).map((a) => (
```

세 페이지에서 `<DetailSidebar ... showDong={dongTx.length > 0} />`를 넘긴다. **본문 렌더 조건(`items.length === 0`이면 `null`)과 같은 값을 쓴다** — 항목만 남고 앵커가 없으면 클릭해도 아무 데도 가지 않는다.

`ANCHORS`의 실제 키 이름이 `needsComplex`가 아니면 그 파일의 실제 형태에 맞춘다.

- [ ] **Step 7: 타입체크·린트·빌드·e2e**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 통과

Run: `pnpm seed:e2e && pnpm exec dotenv -e .env.test -- playwright test tests/e2e/apt-detail.spec.ts`
Expected: PASS

**주의:** 로컬 `.env.local`·`.env.test`는 비어 있는 로컬 docker DB(5433)를 가리킨다. 빌드가 성공해도 내용이 없는 게 정상이라 "빌드 통과 = 화면 정상"이 아니다.

전체 유닛 스위트에서 `tests/lib/briefing.test.ts`가 실패할 수 있다 — 자체 시드 대신 DB 잔여 데이터를 집는 기존 앰비언트 의존 이슈다. **고치려 하지 마라.**

- [ ] **Step 8: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/dong-transaction-section.tsx" \
        tests/components/dong-transaction-section.test.tsx \
        "app/(public)/apt/[id]/page.tsx" "app/(public)/villa/[id]/page.tsx" "app/(public)/officetel/[id]/page.tsx" \
        "app/(public)/apt/[id]/_components/detail-sidebar.tsx"
git commit -m "feat(dong): 상세에 동네 최근 거래 섹션

가격 추이 아래에 둔다. 그 단지를 다 본 뒤 동네로 시선을 넓히는 순서다.

아래 '주변 단지 가격 비교'는 반경 2km 단지 목록이고 이건 같은 동의 거래
목록이다. 제목에 정렬 기준(계약일순·가까운 순)을 밝혀 성격을 구분한다.

5건 고정, 더 보기 없음. 자기 건물은 조회 단계에서 제외한다."
```

---

## Task 5: 홈 패널 컴포넌트

**Files:**
- Create: `app/(public)/_components/dong-transaction-panel.tsx`
- Test: `tests/components/dong-transaction-panel.test.tsx`

**Interfaces:**
- Consumes: Task 1의 포맷터, Task 2의 `DongTransaction`, Task 3의 `DongOption`
- Produces: `<DongTransactionPanel initialSido initialSigunguCode initialSigunguName initialUmd initialDongs initialItems />`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

클라이언트 컴포넌트지만 SSR 초기 상태는 검증할 수 있다. 이 저장소에는 `@testing-library`가 없어 상호작용은 테스트하지 않는다.

`tests/components/dong-transaction-panel.test.tsx`:

```tsx
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DongTransactionPanel } from '@/app/(public)/_components/dong-transaction-panel';
import type { DongTransaction } from '@/lib/transaction/dong';

(globalThis as unknown as { React: typeof React }).React = React;

const ITEMS: DongTransaction[] = [
  {
    id: '1', contractDate: '2026-09-09', propertyId: '10',
    propertyName: '올림픽훼밀리타운', propertyType: 'APARTMENT',
    exclusiveArea: 84.12, floor: 11, dealType: 'JEONSE',
    dealAmount: null, deposit: 95000, monthlyRent: null,
  },
  {
    id: '2', contractDate: '2019-03-04', propertyId: '11',
    propertyName: '문정래미안', propertyType: 'APARTMENT',
    exclusiveArea: 115, floor: null, dealType: 'WOLSE',
    dealAmount: null, deposit: 5000, monthlyRent: 150,
  },
];

const html = (items: DongTransaction[]) =>
  renderToStaticMarkup(
    <DongTransactionPanel
      initialSido="서울"
      initialSigunguCode="11710"
      initialSigunguName="송파구"
      initialUmd="문정동"
      initialDongs={[{ umd: '가락동', txCount: 100 }, { umd: '문정동', txCount: 300 }]}
      initialItems={items}
    />,
  );

describe('DongTransactionPanel', () => {
  it('제목과 초기 지역을 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('문정동');
  });

  it('건물유형과 거래유형 선택지를 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('아파트');
    expect(out).toContain('전체');
    expect(out).toContain('매매');
    expect(out).toContain('전세');
    expect(out).toContain('월세');
  });

  it('날짜에 연도를 표기한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('26.09.09');
    expect(out).toContain('19.03.04');
  });

  it('월세를 라벨과 함께 쓴다', () => {
    expect(html(ITEMS)).toContain('보 5,000만원 / 월 150만');
  });

  it('층이 없으면 그 조각을 생략한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('84㎡ · 11층 · 26.09.09');
    expect(out).toContain('115㎡ · 19.03.04');
  });

  // 홈 패널은 0건이어도 사라지지 않는다. 필터를 눌렀는데 패널이 없어지면
  // 사용자는 고장으로 받아들인다.
  it('0건이어도 패널과 필터가 남고 안내를 보여준다', () => {
    const out = html([]);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('이 조건에 해당하는 거래가 없습니다');
  });

  it('「더 보기」 링크를 두지 않는다', () => {
    const out = html(ITEMS);
    expect(out).not.toContain('더 보기');
    expect(out).not.toContain('전체 보기');
    expect(out).not.toContain('매물 보기');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-panel.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 컴포넌트를 만든다**

`app/(public)/_components/dong-transaction-panel.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DealType, PropertyType } from '@prisma/client';
import type { DongTransaction } from '@/lib/transaction/dong';
import type { DongOption } from '@/lib/dong-options';
import { formatDongMeta, formatDongPrice } from '@/lib/transaction/dong-format';

const PROPERTY_TYPES: { key: PropertyType; label: string }[] = [
  { key: 'APARTMENT', label: '아파트' },
  { key: 'OFFICETEL', label: '오피스텔' },
  { key: 'MULTIPLEX', label: '다세대' },
  { key: 'ROW_HOUSE', label: '연립' },
];

const DEAL_TABS: { key: DealType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

const DEAL_BADGE: Record<string, string> = {
  SALE: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)]',
  JEONSE: 'bg-[#fee2e2] text-[#b91c1c]',
  WOLSE: 'bg-[#fef3c7] text-[#b45309]',
};
const DEAL_LABEL: Record<string, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

const SLUG: Record<string, string> = {
  APARTMENT: 'apt', OFFICETEL: 'officetel', MULTIPLEX: 'villa', ROW_HOUSE: 'villa',
};

type Status = 'idle' | 'loading' | 'error';

/**
 * 홈 히어로 오른쪽의 동네 거래 패널.
 *
 * 좁은 폭이라 두 줄 압축 형태다. 상세의 표와 데이터·포맷은 공유하지만 배치는 다르다.
 * 0건이어도 패널이 사라지지 않는다 — 필터를 눌렀는데 없어지면 고장으로 읽힌다.
 */
export function DongTransactionPanel({
  initialSido,
  initialSigunguCode,
  initialSigunguName,
  initialUmd,
  initialDongs,
  initialItems,
}: {
  initialSido: string;
  initialSigunguCode: string;
  initialSigunguName: string;
  initialUmd: string;
  initialDongs: DongOption[];
  initialItems: DongTransaction[];
}) {
  const [sigunguCode] = useState(initialSigunguCode);
  const [dongs] = useState<DongOption[]>(initialDongs);
  const [umd, setUmd] = useState(initialUmd);
  const [propertyType, setPropertyType] = useState<PropertyType>('APARTMENT');
  const [deal, setDeal] = useState<DealType | 'ALL'>('ALL');
  const [items, setItems] = useState<DongTransaction[]>(initialItems);
  const [status, setStatus] = useState<Status>('idle');

  // 지역을 빠르게 바꾸면 늦게 온 이전 응답이 최신 결과를 덮을 수 있다.
  // 시퀀스로 최신 것만 반영하고 이전 요청은 취소한다.
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  useEffect(() => {
    // 서버가 그려 준 초기 결과를 그대로 쓴다. 마운트 직후 중복 조회를 하지 않는다.
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus('loading');

    const qs = new URLSearchParams({ sigunguCode, umd, propertyType });
    if (deal !== 'ALL') qs.set('dealType', deal);

    fetch(`/api/dong-transactions?${qs}`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((rows: DongTransaction[]) => {
        if (mine !== seq.current) return;
        setItems(rows);
        setStatus('idle');
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || mine !== seq.current) return;
        void e;
        setStatus('error');
      });

    return () => ctl.abort();
  }, [sigunguCode, umd, propertyType, deal]);

  return (
    <section
      aria-label="동네별 최근 실거래가"
      className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)] p-5"
    >
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">동네별 최근 실거래가</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">관심 지역의 거래 내역을 확인하세요</p>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
          {initialSido}
        </span>
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
          {initialSigunguName}
        </span>
        <label className="sr-only" htmlFor="dong-select">읍·면·동·리</label>
        <select
          id="dong-select"
          value={umd}
          onChange={(e) => setUmd(e.target.value)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
        >
          {dongs.map((d) => (
            <option key={d.umd} value={d.umd}>{d.umd}</option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="type-select">건물 유형</label>
        <select
          id="type-select"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as PropertyType)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {DEAL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDeal(t.key)}
              aria-pressed={deal === t.key}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                deal === t.key ? 'bg-white text-[var(--color-blue-dark)]' : 'text-[var(--color-muted)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)]">
        {status === 'loading' && (
          <ul className="divide-y divide-[var(--color-line)]" aria-busy="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i} className="py-3">
                <div className="h-4 w-2/3 rounded bg-[var(--color-soft)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-soft)]" />
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">잠시 후 다시 시도해 주세요</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-blue-dark)]"
            >
              다시 시도
            </button>
          </div>
        )}

        {status === 'idle' && items.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            이 조건에 해당하는 거래가 없습니다
          </p>
        )}

        {status === 'idle' && items.length > 0 && (
          <ul className="divide-y divide-[var(--color-line)]">
            {items.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                    className="block truncate text-sm font-bold text-[var(--color-blue-dark)] hover:underline"
                  >
                    {t.propertyName}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatDongMeta(t)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${DEAL_BADGE[t.dealType]}`}>
                    {DEAL_LABEL[t.dealType]}
                  </span>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
                    {formatDongPrice(t)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/dong-transaction-panel.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS (7개), 타입·린트 통과

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/_components/dong-transaction-panel.tsx" tests/components/dong-transaction-panel.test.tsx
git commit -m "feat(dong): 홈 동네 거래 패널

좁은 폭이라 두 줄 압축 형태다. 상세 표와 데이터·포맷은 공유하고 배치만 다르다.

0건이어도 패널이 사라지지 않는다 — 필터를 눌렀는데 없어지면 고장으로 읽힌다.
로딩(스켈레톤)·실패(재시도)·빈 결과를 각각 구분한다.

지역을 빠르게 바꿀 때 늦게 온 응답이 최신 결과를 덮지 않도록 시퀀스와
AbortController로 막는다."
```

---

## Task 6: 홈 히어로 재구성

**Files:**
- Modify: `app/(public)/_components/hero-section.tsx`
- Modify: `app/(public)/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `readDongOptions`·`readTopDong`, Task 2의 `getDongTransactions`, Task 5의 `<DongTransactionPanel />`

- [ ] **Step 1: 히어로를 2단으로 재구성한다**

`app/(public)/_components/hero-section.tsx`를 아래로 교체한다. `HeroSearch`·`TypeIconGrid` import는 그대로 두고 `StatsBar`와 패널을 받는다.

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroSearch } from './hero-search';
import type { PopularRegion } from '@/lib/region';
import { TypeIconGrid } from './type-icon-grid';

/**
 * 두 칸 전환은 xl(1280px)부터다.
 *
 * lg(1024px)에서 나누면 오른쪽 실폭이 323px다 — 컨테이너 여백 48 + 히어로 패딩 80 +
 * 열 간격 40을 빼고 1.65:1로 나눈 값이다. 지역 선택과 두 줄 목록을 넣기에 부족하다.
 * 1280px에서 400px가 나온다(스펙 §6.1).
 */
export function HeroSection({
  popularRegions,
  statsSlot,
  panelSlot,
}: {
  popularRegions: PopularRegion[];
  statsSlot: ReactNode;
  panelSlot: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-gradient-to-br from-[#eaf2ff] via-[#f3f8ff] to-white p-6 xl:grid xl:grid-cols-[1.65fr_1fr] xl:items-start xl:gap-10 xl:p-10">
      <div>
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3.5 py-2 text-xs font-extrabold text-[var(--color-blue-dark)]">
          📍 실거래가·생활권 정보 통합 플랫폼
        </span>
        <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
          어디든, <span className="text-[var(--color-blue)]">임장ON</span>에서 바로 검색하세요
        </h1>

        <HeroSearch popularRegions={popularRegions} />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/list"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-blue)] px-6 py-3.5 font-extrabold text-white"
          >
            🔍 실거래가 찾기
          </Link>
          <Link
            href="/subscription"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-6 py-3.5 font-extrabold text-[var(--color-blue-dark)]"
          >
            📅 청약 일정 보기
          </Link>
        </div>

        {/* 아이콘은 보조 탐색 수단이다. 왼쪽이 넓어졌다고 키우지 않는다 —
            커지면 검색 영역이 아래로 길어져 통계가 접힘선 밖으로 밀린다. */}
        <div className="mt-6">
          <TypeIconGrid />
        </div>

        <div className="mt-6">{statsSlot}</div>
      </div>

      <div className="mt-8 xl:mt-0">{panelSlot}</div>
    </section>
  );
}
```

- [ ] **Step 2: 홈 페이지를 배선한다**

`app/(public)/page.tsx`. import를 더한다:

```tsx
import { DongTransactionPanel } from './_components/dong-transaction-panel';
import { readDongOptions, readTopDong } from '@/lib/dong-options';
import { getDongTransactions } from '@/lib/transaction/dong';
```

`const { briefing, popularRegions } = snapshot;` 다음에 패널 데이터를 만든다:

```tsx
  // 첫 화면은 인기 지역 1위 시군구의 거래 최다 동을 서버가 그린다.
  // 드롭다운을 바꾸면 그때부터 클라이언트가 조회한다.
  const top = popularRegions[0] ?? null;
  const topDong = top ? await safe(readTopDong(top.sigunguCode), null) : null;
  const dongs = top ? await safe(readDongOptions(top.sigunguCode), []) : [];
  const dongItems =
    top && topDong
      ? await safe(
          getDongTransactions({
            sigunguCode: top.sigunguCode,
            umd: topDong.umd,
            propertyType: 'APARTMENT',
            limit: 8,
          }),
          [],
        )
      : [];
```

`<HeroSection popularRegions={popularRegions} />`와 그 다음 줄 `<StatsBar stats={stats} />`를 아래로 교체한다. **`StatsBar`는 히어로 바깥에서 왼쪽 열 안으로 들어간다.**

```tsx
      <HeroSection
        popularRegions={popularRegions}
        statsSlot={<StatsBar stats={stats} />}
        panelSlot={
          top && topDong ? (
            <DongTransactionPanel
              initialSido={top.sido}
              initialSigunguCode={top.sigunguCode}
              initialSigunguName={top.sigungu}
              initialUmd={topDong.umd}
              initialDongs={dongs}
              initialItems={dongItems}
            />
          ) : null
        }
      />
```

스냅샷이 비어 있으면 `topDong`이 `null`이라 패널이 렌더되지 않고 히어로는 1단처럼 보인다. 배포 후 ETL이 스냅샷을 채우면 나타난다.

`safe()` 헬퍼의 실제 시그니처가 다르면 그 파일의 실제 형태에 맞춘다.

- [ ] **Step 3: 타입체크·린트·빌드**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 통과

- [ ] **Step 4: e2e**

Run: `pnpm seed:e2e && pnpm exec dotenv -e .env.test -- playwright test tests/e2e`
Expected: PASS

홈 스펙이 `StatsBar` 위치나 히어로 구조를 단언하고 있으면 깨질 수 있다. **깨지면 스펙을 고치지 말고 먼저 보고하라** — 기존 화면 계약을 깬 것일 수 있다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/_components/hero-section.tsx" "app/(public)/page.tsx"
git commit -m "feat(dong): 홈 히어로를 2단으로 재구성

왼쪽은 검색 + 바로가기 아이콘 + 통계, 오른쪽은 동네 거래 패널이다.
StatsBar를 히어로 바깥에서 왼쪽 열 안으로 옮겼다.

두 칸 전환은 xl(1280px)부터다. lg에서 나누면 오른쪽 실폭이 323px라
지역 선택과 두 줄 목록을 넣을 수 없다. 1280px에서 400px가 나온다.

아이콘은 키우지 않는다. 커지면 검색 영역이 길어져 통계가 접힘선 밖으로 밀린다."
```

---

## Task 7: 운영 확인 (머지·배포 후)

코드가 아니라 확인 절차다. **머지·배포 후에 한다.**

- [ ] **Step 1: 스냅샷을 채운다**

배포 후 ETL을 한 번 돌려 `dong_options` 스냅샷을 만든다. 이것이 없으면 홈 패널이 렌더되지 않는다.

- [ ] **Step 2: 옵션 건전성**

드롭다운 옵션 중 **결과가 0건인 조합이 실제로 없는지** 확인한다. 옵션을 실거래 데이터에서 만들었으므로 0건이 나오면 조회 쪽 조건(`cancelDate`·`propertyType` 필터)이 옵션 생성 기준과 어긋난 것이다.

`propertyType` 필터를 걸면 0건이 나올 수 있다 — 아파트 거래가 없는 동에서 기본값 `APARTMENT`를 쓰면 그렇다. 그 비율을 재고, 첫 화면 기본 동 선정에 `propertyType`을 반영해야 하는지 판단한다.

- [ ] **Step 3: 화면 확인**

- 홈: 1280px 이상에서 2단인지, 오른쪽 패널 실폭이 400px인지, 1024~1279px에서 세로로 쌓이는지
- 홈: 드롭다운을 바꿨을 때 목록이 갱신되는지, 빠르게 여러 번 바꿔도 이전 결과가 덮지 않는지
- 상세: 가격 추이 아래에 뜨는지, 자기 건물이 빠졌는지, 사이드바 항목과 본문이 함께 나타나고 함께 사라지는지
- 리 단위 표기(`돌산읍 우두리`)가 드롭다운에 어떻게 보이는지

- [ ] **Step 4: 성능**

홈 응답 시간이 이전과 비슷한지 확인한다. 패널 데이터 조회 3개(`readTopDong`·`readDongOptions`·`getDongTransactions`)가 추가됐다.

- [ ] **Step 5: 결과를 스펙 문서 하단에 실측 기록으로 추가한다.**

---

## 배포

**애드센스 심사 중이다.** main에 머지하면 CI 통과 후 자동 배포되고 `web` 컨테이너가 재생성된다.

- 브랜치에서 작업한다
- **Task 1~6이 모두 끝난 뒤 한 번에 머지한다.** 배포를 1회로 줄인다
- 머지 전에 운영 데이터로 홈 화면을 확인한다. 홈은 심사 중 가장 많이 크롤링되는 페이지이고 이번 작업은 그 히어로를 재구성한다

## 참고

- 스펙: `docs/superpowers/specs/2026-09-16-dong-transactions-design.md`
- 기존 테스트 관례: `tests/components/property-detail-hero-ssr.test.ts`(React 전역 바인딩)
- 기존 스냅샷 경로: `lib/dashboard-snapshot.ts` · `scripts/dashboard/refresh-snapshot.ts`
- 기존 캐스케이드 패턴: `app/(public)/list/_components/list-filter-panel.tsx`
