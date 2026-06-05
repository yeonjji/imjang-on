# 실거래가 상세 "이 지역 청약" 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트 실거래가 상세 페이지의 주변 인프라 바로 위에, 같은 구/군(부족 시 시·도)에서 진행 중·예정이거나 최근 마감된 청약 공고를 최대 3건 보여주는 컴팩트 리스트 섹션을 추가한다.

**Architecture:** `lib/subscription.ts`에 구/군→시·도 폴백 매칭 조회 함수를 추가하고(기존 `getSubscriptionList`의 집계 SQL 패턴 재사용), 서버 컴포넌트 `NearbySubscriptions`로 렌더한 뒤 `apt/[id]/page.tsx`의 `<NearbyInfra>` 앞에 끼워 넣는다. 지역 매칭은 `regionName`(시·도 단축형) + `address ILIKE`(구/군 문자열)로 수행한다.

**Tech Stack:** Next.js (App Router, RSC), Prisma `$queryRaw`, PostgreSQL, Vitest, TailwindCSS.

설계 문서: `docs/superpowers/specs/2026-06-05-apt-detail-nearby-subscriptions-design.md`

---

### Task 1: `formatReceiptPeriodShort` 포맷 헬퍼

접수기간을 `MM.DD~MM.DD`로 압축 표기. 둘 다 없으면 `일정 미정`.

**Files:**
- Modify: `lib/format.ts` (파일 끝에 함수 추가)
- Test: `tests/lib/format.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/format.test.ts` 파일 끝에 추가. 파일 상단 import에 `formatReceiptPeriodShort`를 추가한다(기존 import 구문에 이름 추가).

```ts
import { formatReceiptPeriodShort } from '@/lib/format';

const RD = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('formatReceiptPeriodShort', () => {
  it('시작·마감을 MM.DD~MM.DD로 표기', () => {
    expect(formatReceiptPeriodShort(RD('2026-06-10'), RD('2026-06-16'))).toBe('06.10~06.16');
  });
  it('둘 다 없으면 일정 미정', () => {
    expect(formatReceiptPeriodShort(null, null)).toBe('일정 미정');
  });
  it('시작만 없으면 -~MM.DD', () => {
    expect(formatReceiptPeriodShort(null, RD('2026-06-16'))).toBe('-~06.16');
  });
  it('마감만 없으면 MM.DD~-', () => {
    expect(formatReceiptPeriodShort(RD('2026-06-10'), null)).toBe('06.10~-');
  });
});
```

> 주의: `tests/lib/format.test.ts`에 이미 `describe`/`it`/`expect` import와 다른 헬퍼 import가 있다. `formatReceiptPeriodShort`만 기존 `@/lib/format` import 목록에 추가하고, `RD` 헬퍼와 새 `describe` 블록을 파일 끝에 붙인다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/format.test.ts`
Expected: FAIL — `formatReceiptPeriodShort is not a function` (또는 import 에러).

- [ ] **Step 3: 최소 구현**

`lib/format.ts` 끝에 추가:

```ts
/** 접수기간 Date 두 개를 "MM.DD~MM.DD"로 압축 표기. 둘 다 없으면 "일정 미정". */
export function formatReceiptPeriodShort(
  begin: Date | null | undefined,
  end: Date | null | undefined,
): string {
  if (!begin && !end) return '일정 미정';
  const md = (d: Date | null | undefined): string => {
    if (!d) return '-';
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${m}.${day}`;
  };
  return `${md(begin)}~${md(end)}`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/format.test.ts`
Expected: PASS (전체 format 테스트 그린).

- [ ] **Step 5: 커밋**

```bash
git add lib/format.ts tests/lib/format.test.ts
git commit -m "feat(format): 접수기간 압축 표기 formatReceiptPeriodShort 추가"
```

---

### Task 2: `shortSidoFromRegionCode` 단축 시도 매핑

property의 `region.code` 앞 2자리로 시·도 단축명(`서울`·`경기`)을 얻는다. `regionName`이 단축형이라 매칭 키로 필요.

**Files:**
- Modify: `lib/region.ts` (`SIDO_LIST` 정의 아래에 함수 추가)
- Test: `tests/lib/region.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/region.test.ts` 파일 끝에 추가(상단 import에서 `@/lib/region`으로부터 `shortSidoFromRegionCode`를 가져오도록 이름 추가):

```ts
import { shortSidoFromRegionCode } from '@/lib/region';

describe('shortSidoFromRegionCode', () => {
  it('서울 코드(11..)를 서울로 매핑', () => {
    expect(shortSidoFromRegionCode('1168010100')).toBe('서울');
  });
  it('경기 코드(41..)를 경기로 매핑', () => {
    expect(shortSidoFromRegionCode('4113510300')).toBe('경기');
  });
  it('null/undefined는 null', () => {
    expect(shortSidoFromRegionCode(null)).toBeNull();
    expect(shortSidoFromRegionCode(undefined)).toBeNull();
  });
  it('매칭 안 되는 prefix는 null', () => {
    expect(shortSidoFromRegionCode('9900000000')).toBeNull();
  });
});
```

> `tests/lib/region.test.ts`에 이미 `describe`/`it`/`expect` import가 있다면 재선언하지 말고 새 `describe` 블록만 추가한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/region.test.ts`
Expected: FAIL — `shortSidoFromRegionCode is not a function`.

- [ ] **Step 3: 최소 구현**

`lib/region.ts`의 `SIDO_LIST` 상수 정의 바로 아래에 추가:

```ts
/** 행정구역 코드 앞 2자리로 시·도 단축명(SubscriptionNotice.regionName과 동일 표기)을 반환. */
export function shortSidoFromRegionCode(
  regionCode: string | null | undefined,
): string | null {
  if (!regionCode || regionCode.length < 2) return null;
  const prefix = regionCode.slice(0, 2);
  const found = SIDO_LIST.find((s) => s.code.slice(0, 2) === prefix);
  return found?.sido ?? null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/region.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/region.ts tests/lib/region.test.ts
git commit -m "feat(region): 코드→시·도 단축명 매핑 shortSidoFromRegionCode 추가"
```

---

### Task 3: `getNearbySubscriptions` 데이터 조회 함수

같은 구/군(부족 시 시·도) 청약을 진행 중·예정 우선·최근 마감순으로 최대 3건 조회. 기존 `getSubscriptionList`의 집계 매핑을 `mapListRow`로 추출해 재사용(DRY).

**Files:**
- Modify: `lib/subscription.ts`

- [ ] **Step 1: 매핑 헬퍼 추출**

`lib/subscription.ts`에서 `interface ListRow { ... }` 정의 바로 아래에 매핑 헬퍼를 추가한다:

```ts
function mapListRow(r: ListRow): SubscriptionListItem {
  return {
    id: String(r.id),
    name: r.name,
    category: r.category,
    regionName: r.region_name,
    receiptBegin: r.receipt_begin,
    receiptEnd: r.receipt_end,
    totalSupply: r.total_supply,
    unitCount: r.unit_count,
    minPrice: r.min_price,
    maxPrice: r.max_price,
    minArea: r.min_area,
    maxArea: r.max_area,
  };
}
```

그리고 `getSubscriptionList`의 `return` 안에 있는 `rows.map((r) => ({ ... }))` 블록을 `rows.map(mapListRow)`로 교체한다. (기존 객체 리터럴 매핑을 헬퍼 호출로 바꾸는 surgical 변경)

- [ ] **Step 2: `getNearbySubscriptions` 구현**

`lib/subscription.ts` 끝(파일 마지막 `getSubscriptionLatLng` 아래)에 추가:

```ts
export interface NearbySubscriptionsResult {
  items: SubscriptionListItem[];
  scope: 'sigungu' | 'sido';
  scopeLabel: string;
}

/**
 * 같은 구/군(부족 시 시·도)에서 진행 중·예정 우선, 그다음 최근 마감순으로 청약을 조회.
 * @param sido    단축 시도 (예: "서울") — SubscriptionNotice.regionName과 동일 표기
 * @param sigungu 구/군 (예: "강서구"). null이면 곧바로 시·도 범위로 조회
 */
export async function getNearbySubscriptions(opts: {
  sido: string;
  sigungu: string | null;
  limit?: number;
}): Promise<NearbySubscriptionsResult> {
  const { sido, sigungu, limit = 3 } = opts;

  const run = async (extraWhere: Prisma.Sql): Promise<SubscriptionListItem[]> => {
    const rows = await prisma.$queryRaw<ListRow[]>(Prisma.sql`
      SELECT
        n.id, n.name, n.category,
        n."regionName" AS region_name,
        n."receiptBegin" AS receipt_begin,
        n."receiptEnd" AS receipt_end,
        n."totalSupply" AS total_supply,
        COUNT(u.id)::int AS unit_count,
        MIN(u."topAmount")::int AS min_price,
        MAX(u."topAmount")::int AS max_price,
        MIN(u.area)::float AS min_area,
        MAX(u.area)::float AS max_area
      FROM "SubscriptionNotice" n
      LEFT JOIN "SubscriptionUnit" u ON u."noticeId" = n.id
      WHERE n."regionName" = ${sido}
      ${extraWhere}
      GROUP BY n.id
      ORDER BY (CASE WHEN n."receiptEnd" >= CURRENT_DATE THEN 0 ELSE 1 END),
               n."receiptEnd" DESC NULLS LAST,
               n.id DESC
      LIMIT ${limit}
    `);
    return rows.map(mapListRow);
  };

  if (sigungu) {
    const items = await run(Prisma.sql`AND n.address ILIKE ${`%${sigungu}%`}`);
    if (items.length > 0) return { items, scope: 'sigungu', scopeLabel: sigungu };
  }

  const items = await run(Prisma.empty);
  return { items, scope: 'sido', scopeLabel: sido };
}
```

- [ ] **Step 3: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음. (`ListRow`/`SubscriptionListItem`/`Prisma` 모두 동일 파일에 정의·import 되어 있음)

- [ ] **Step 4: 기존 단위 테스트 회귀 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/subscription.test.ts`
Expected: PASS (`mapListRow` 추출이 기존 동작을 바꾸지 않음).

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription.ts
git commit -m "feat(subscription): 구/군→시·도 폴백 getNearbySubscriptions 조회 추가"
```

---

### Task 4: `NearbySubscriptions` 서버 컴포넌트

컴팩트 리스트 UI. 상호작용 없음 → 서버 컴포넌트.

**Files:**
- Create: `app/(public)/apt/[id]/_components/nearby-subscriptions.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  formatPriceRange,
  formatAreaRange,
  type SubscriptionListItem,
} from '@/lib/subscription';
import { formatReceiptPeriodShort } from '@/lib/format';

interface NearbySubscriptionsProps {
  id?: string;
  items: SubscriptionListItem[];
  scopeLabel: string;
  sido: string;
}

export function NearbySubscriptions({ id, items, scopeLabel, sido }: NearbySubscriptionsProps) {
  if (items.length === 0) return null;

  return (
    <Card id={id}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">이 지역 청약</h2>
        <Badge tone="blue">{scopeLabel}</Badge>
      </div>
      <ul className="divide-y divide-[var(--color-line)]">
        {items.map((item) => {
          const st = deriveStatus(item.receiptBegin, item.receiptEnd);
          const dday = ddayLabel(st);
          return (
            <li key={item.id}>
              <Link
                href={`/subscription/${item.id}`}
                className="flex flex-col gap-1 py-3 transition hover:opacity-80"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
                    {STATUS_LABEL[st.status]}
                    {dday ? ` ${dday}` : ''}
                  </Badge>
                  <span className="break-keep font-bold text-[var(--color-blue-dark)]">
                    {item.name}
                  </span>
                </div>
                <span className="text-sm text-[var(--color-muted)]">
                  {formatAreaRange(item.minArea, item.maxArea)} ·{' '}
                  {formatPriceRange(item.minPrice, item.maxPrice)} ·{' '}
                  {formatReceiptPeriodShort(item.receiptBegin, item.receiptEnd)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href={`/subscription?sido=${encodeURIComponent(sido)}`}
        className="mt-4 block text-right text-sm font-semibold text-[var(--color-blue-dark)] hover:underline"
      >
        {sido} 청약 더보기 →
      </Link>
    </Card>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/apt/[id]/_components/nearby-subscriptions.tsx"
git commit -m "feat(apt): 이 지역 청약 컴팩트 리스트 컴포넌트 추가"
```

---

### Task 5: 상세 페이지 연결

`apt/[id]/page.tsx`에서 단축 시도·구/군을 구해 조회하고, 주변 인프라 바로 위에 렌더.

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`

- [ ] **Step 1: import 추가**

기존 import 블록에 다음을 추가한다:

```ts
import { getNearbySubscriptions } from '@/lib/subscription';
import { shortSidoFromRegionCode } from '@/lib/region';
import { NearbySubscriptions } from './_components/nearby-subscriptions';
```

- [ ] **Step 2: 단축 시도 계산 + 조회 추가**

`const coord = await getPropertyLatLng(propId);` 다음 줄에 추가:

```ts
const shortSido = shortSidoFromRegionCode(property.region.code);
```

그리고 기존 `Promise.all([...])`의 배열 **마지막 항목**으로 다음을 추가하고(앞 항목 끝에 콤마), 구조 분해 좌변에도 `nearbySubs`를 추가한다:

```ts
const [unified, counts, chart, areaSummary, nearby, infra, nearbySubs] = await Promise.all([
  // ...기존 6개 항목 그대로...
  shortSido
    ? getNearbySubscriptions({ sido: shortSido, sigungu: property.region.sigungu })
    : Promise.resolve(null),
]);
```

- [ ] **Step 3: 렌더 삽입**

`<NearbyPriceComparison ... />`(line 78 부근)와 `<NearbyInfra categories={infra} />`(line 79 부근) **사이**에 추가:

```tsx
{shortSido && nearbySubs && (
  <NearbySubscriptions
    id="subscriptions-nearby"
    items={nearbySubs.items}
    scopeLabel={nearbySubs.scopeLabel}
    sido={shortSido}
  />
)}
```

> `nearbySubs.items.length === 0`이면 컴포넌트가 `return null` 하므로 별도 가드는 불필요하지만, `nearbySubs`가 `null`(단축 시도 매핑 실패)인 경우를 위해 `shortSido && nearbySubs` 가드를 둔다.

- [ ] **Step 4: 타입체크 + 린트**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 5: 빌드 + 수동 확인**

Run: `pnpm build`
Expected: 빌드 성공.

수동 확인: `pnpm dev` 후 실제 아파트 상세(예: 서울/경기 소재 단지) 진입 → "주변 단지 실거래가 비교"와 "주변 인프라" 사이에 "이 지역 청약" 섹션이 보이고, 칩에 구/군(또는 폴백 시 시·도), 상태 뱃지·D-day·접수기간이 표기되며, "더보기"가 `/subscription?sido=...`로 이동하는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)/apt/[id]/page.tsx"
git commit -m "feat(apt): 상세 페이지에 이 지역 청약 섹션 연결"
```

---

## 자체 점검 (작성자 확인 완료)

- **스펙 커버리지**: 위치(주변 인프라 위, Task 5)·데이터 레이어(Task 3)·단축 시도 매핑(Task 2)·컴포넌트/칩/더보기(Task 4)·빈 상태(Task 4 `return null` + Task 5 가드)·테스트(Task 1·2 TDD, Task 3 회귀)·MM.DD~MM.DD 포맷(Task 1) 모두 대응됨.
- **플레이스홀더**: 없음. 모든 코드 단계에 실제 코드 포함.
- **타입 일관성**: `getNearbySubscriptions` 반환 `NearbySubscriptionsResult.{items,scope,scopeLabel}` ↔ `NearbySubscriptions` props(`items`/`scopeLabel`/`sido`) 일치. `mapListRow`/`ListRow`/`SubscriptionListItem` 동일 파일 정의. `formatReceiptPeriodShort` 시그니처가 Task 1 정의와 Task 4 사용에서 일치.
- **DB 통합 테스트**: 리포지토리에 통합 테스트 하니스(`tests/integration` 비어 있음)가 없어 `getNearbySubscriptions`는 타입체크 + 회귀 단위 테스트 + 수동 확인으로 검증(스펙의 "통합 테스트" 의도를 현 인프라에 맞춰 축소). 폴백 분기는 단순 길이 조건으로 리스크 낮음.
