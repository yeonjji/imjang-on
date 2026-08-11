# 청약 상세 보강 구현 계획 (S-1 / S-2 / S-3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans로 태스크 단위 실행. 체크박스(`- [ ]`)로 진행 추적.

**Goal:** 청약 상세 5,911개에서 near-duplicate를 없앤다 — 위치를 백필해 지도·주변 실거래를 살리고, 공고마다 다른 분양가 비교를 붙이고, 그래도 남는 빈 페이지만 비공개한다.

**Architecture:** 3단계 순차. 1단계는 DB의 `location`만 채우면 `page.tsx`의 기존 `coord ? … : …` 분기가 지도·주변단지·지하철·인프라를 자동으로 살린다(페이지 코드 수정 없음). 2단계는 시군구별 실거래 중위가를 스냅샷으로 사전계산하고 상세에서 한 줄만 읽는다. 3단계는 1단계 결과로 대상이 정해진다.

**Tech Stack:** Prisma `$queryRaw`(PostGIS `ST_SetSRID`/`ST_MakePoint`), 카카오 로컬 API, Next.js server component, `DashboardSnapshot`(기존 모델 — 마이그레이션 없음).

**스펙:** `docs/superpowers/specs/2026-08-11-subscription-detail-enrichment-design.md`

## Global Constraints

- **`noindex`를 쓰지 않는다.** 애드센스 심사는 자체 크롤러라 `noindex`가 보이지 않는다. 축소는 410이다.
- **면적당 단가를 비교하지 않는다.** `SubscriptionUnit.area`의 기준이 행마다 다르다(공급 20,156 / 전용 3,107 / NULL 1,992). 총액끼리만 비교한다.
- **면적은 셀마다 기준을 병기한다** — `공급 82.86㎡` / `전용 59.99㎡`. 일괄 "공급면적"은 12%가 거짓이 된다.
- **좌표가 지역과 어긋나면 버린다.** 틀린 좌표는 빈 값보다 나쁘다 — 그 페이지의 주변 실거래·인프라가 통째로 다른 동네 것이 된다.
- **LLM으로 문장을 생성하지 않는다.** 자동 생성 텍스트 확대가 애드센스 거절의 원인이었다.
- 요청 경로에서 `Transaction`(7.6M행)을 집계하지 않는다.
- 검증 순서: `pnpm lint` → `typecheck` → `test:unit` → `build` → `seed:e2e` → Playwright 전량.

## 실측 기준값 (2026-08-11 운영 DB)

| 항목 | 값 |
|---|---|
| 공고 총계 / 사이트맵 등재 | 5,914 / 5,911 |
| 접수 마감 / 진행중·예정 | 5,890 / 24 |
| 위치 있음 / 없음 | 3,547 / 2,367 |
| 위치없음 중 주소 보유 | 2,364 |
| 주소 → 시군구 매칭 성공 | 5,587 / 5,911 (94.5%) |
| 실거래 표본 30건 이상 시군구 | 249곳 |
| `regionCode` → `Region.code` 매칭 | **0건** (regionCode는 3자리 시도 코드) |

## File Structure

| 파일 | 책임 | 단계 |
|---|---|---|
| `lib/subscription/geo-validate.ts` (신규) | 주소 토큰 ↔ 카카오 응답 지역 일치 판정(순수 함수) | S-1 |
| `scripts/ingest/subscriptions/geocode-fill.ts` (신규) | 백필 스크립트 (`--dry-run` / `--apply` / `--limit`) | S-1 |
| `scripts/ingest/subscriptions/adapter-applyhome.ts` (수정) | 적재 시 지오코딩 배선 | S-1 |
| `scripts/ingest/subscriptions/adapter-lh-presub.ts` (수정) | 같음 | S-1 |
| `lib/subscription/sigungu-from-address.ts` (신규) | 주소 → `sigunguCode` 조회 | S-2 |
| `lib/subscription/median-snapshot.ts` (신규) | 시군구별 중위가 스냅샷 읽기/쓰기 | S-2 |
| `scripts/subscription/refresh-median-snapshot.ts` (신규) | 스냅샷 갱신 | S-2 |
| `deploy/run-etl.sh` (수정) | `transactions-daily`에 한 줄 | S-2 |
| `app/(public)/subscription/[id]/_components/price-comparison.tsx` (신규) | 분양가 표 + 지역 중위가 비교 | S-2 |
| `app/(public)/subscription/[id]/page.tsx` (수정) | 비교 블록 배선 · 410 | S-2·S-3 |
| `lib/sitemap/sources.ts` (수정) | changefreq 분기 · 410 대상 제외 | S-3 |

---

## Task 1: 좌표 검증 순수 함수

**Files:**
- Create: `lib/subscription/geo-validate.ts`
- Test: `tests/lib/subscription-geo-validate.test.ts`

**Interfaces:**
- Produces: `parseAddressRegion(address: string): { sido: string; sigungu: string | null }`, `regionMatches(addr: {sido: string; sigungu: string | null}, coord: {region1: string | null; region2: string | null}): boolean`

`regionName`은 시도명뿐이라(`서울`, `경기`) 검증축으로 약하다. **주소의 앞 두 토큰**을 쓴다.
표기 차이(`서울` vs `서울특별시`)가 있으므로 **한쪽이 다른 쪽의 접두사면 일치**로 본다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
import { describe, it, expect } from 'vitest';
import { parseAddressRegion, regionMatches } from '@/lib/subscription/geo-validate';

describe('parseAddressRegion', () => {
  it('앞 두 토큰을 시도·시군구로 쪼갠다', () => {
    expect(parseAddressRegion('서울특별시 강동구 고덕로 399')).toEqual({ sido: '서울특별시', sigungu: '강동구' });
    expect(parseAddressRegion('경기도 양주시 옥정동 962-9')).toEqual({ sido: '경기도', sigungu: '양주시' });
  });
  it('토큰이 하나면 시군구는 null', () => {
    expect(parseAddressRegion('세종특별자치시')).toEqual({ sido: '세종특별자치시', sigungu: null });
  });
  it('앞뒤 공백과 중복 공백을 흡수한다', () => {
    expect(parseAddressRegion('  인천광역시   연수구 동춘동 ')).toEqual({ sido: '인천광역시', sigungu: '연수구' });
  });
});

describe('regionMatches', () => {
  it('시도·시군구가 모두 맞으면 통과', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });
  it('시도 표기가 달라도 접두사면 통과', () => {
    expect(regionMatches({ sido: '서울', sigungu: '강동구' }, { region1: '서울특별시', region2: '강동구' })).toBe(true);
  });
  it('시군구가 다르면 실패', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: '서울특별시', region2: '강남구' })).toBe(false);
  });
  it('시도가 다르면 실패', () => {
    expect(regionMatches({ sido: '경기도', sigungu: '양주시' }, { region1: '서울특별시', region2: '강동구' })).toBe(false);
  });
  it('주소에 시군구가 없으면 시도만 본다', () => {
    expect(regionMatches({ sido: '세종특별자치시', sigungu: null }, { region1: '세종특별자치시', region2: null })).toBe(true);
  });
  it('카카오가 지역을 안 주면 실패로 본다', () => {
    expect(regionMatches({ sido: '서울특별시', sigungu: '강동구' }, { region1: null, region2: null })).toBe(false);
  });
  it('한 글자 접두사는 우연 일치라 인정하지 않는다', () => {
    expect(regionMatches({ sido: '서', sigungu: null }, { region1: '서울특별시', region2: null })).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/subscription-geo-validate.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
export interface AddressRegion { sido: string; sigungu: string | null }

/** 주소 앞 두 토큰을 시도·시군구로 본다. 청약 공고의 시군구는 주소 문자열에만 있다. */
export function parseAddressRegion(address: string): AddressRegion {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  return { sido: tokens[0] ?? '', sigungu: tokens[1] ?? null };
}

/** `서울` vs `서울특별시`처럼 표기가 달라도 한쪽이 다른 쪽의 접두사면 같은 지역으로 본다. */
function prefixEq(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a.length < 2 || b.length < 2) return false; // 한 글자 접두사는 우연 일치가 잦다
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * 카카오가 준 지역이 주소의 지역과 맞는지. 어긋나면 좌표를 버린다 —
 * 엉뚱한 좌표는 그 페이지의 주변 실거래·인프라를 통째로 다른 동네 것으로 만든다.
 */
export function regionMatches(
  addr: AddressRegion,
  coord: { region1: string | null; region2: string | null },
): boolean {
  if (!prefixEq(addr.sido, coord.region1)) return false;
  if (addr.sigungu === null) return true; // 세종처럼 시군구 계층이 없는 주소
  return prefixEq(addr.sigungu, coord.region2);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/subscription-geo-validate.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/subscription/geo-validate.ts tests/lib/subscription-geo-validate.test.ts
git commit -m "feat(subscription): 지오코딩 좌표 지역 검증 순수 함수"
```

---

## Task 2: 지오코딩 백필 스크립트

**Files:**
- Create: `scripts/ingest/subscriptions/geocode-fill.ts`

**Interfaces:**
- Consumes: Task 1의 `parseAddressRegion`, `regionMatches`; 기존 `geocode(query)` from `@/scripts/ingest/geocoder` (반환 `{ lat, lng, region1, region2 } | null`)

좌표 저장은 `scripts/ingest/subscriptions/upsert.ts`와 같은 방식이다 —
`ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`.

`contentHash`는 lat/lng를 포함하지 않으므로(`content-hash.ts` 주석) 백필이 해시를 흔들지 않는다.

- [ ] **Step 1: 스크립트 작성**

```ts
/**
 * 1회성 + 재실행 가능: 좌표가 없는 청약 공고를 주소로 지오코딩해 채운다.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/subscriptions/geocode-fill.ts --limit 50
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/subscriptions/geocode-fill.ts --apply
 *
 * 대상은 `location IS NULL AND address IS NOT NULL`이라 중단 후 재실행해도 이어서 돈다.
 * 카카오 응답 지역이 주소와 어긋나면 좌표를 버린다 — 틀린 좌표는 빈 값보다 나쁘다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode } from '@/scripts/ingest/geocoder';
import { parseAddressRegion, regionMatches } from '@/lib/subscription/geo-validate';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes('--apply');
  const limit = argNum('--limit', 3000);

  const rows = await prisma.$queryRaw<Array<{ id: bigint; address: string; region_name: string | null }>>`
    SELECT id, address, "regionName" AS region_name
    FROM "SubscriptionNotice"
    WHERE location IS NULL AND address IS NOT NULL
    ORDER BY id
    LIMIT ${limit}
  `;
  logger.info({ target: rows.length, apply }, '청약 지오코딩 백필 시작');

  let ok = 0;
  let noResult = 0;
  let mismatch = 0;

  for (const r of rows) {
    const addr = parseAddressRegion(r.address);
    const coord = await geocode(r.address);
    await sleep(100); // 카카오 로컬 API 호출 간격

    if (!coord) {
      noResult++;
      continue;
    }
    if (!regionMatches(addr, coord)) {
      mismatch++;
      logger.warn(
        { id: String(r.id), addr, got: { region1: coord.region1, region2: coord.region2 } },
        '지역 불일치 — 좌표 버림',
      );
      continue;
    }
    ok++;
    if (!apply) continue;

    await prisma.$executeRaw`
      UPDATE "SubscriptionNotice"
      SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
      WHERE id = ${r.id}
    `;
  }

  console.log(
    `\n${apply ? '반영' : 'dry-run'}: 대상 ${rows.length}건 → 성공 ${ok} / 결과없음 ${noResult} / 지역불일치 ${mismatch}`,
  );
  if (!apply && ok) console.log('실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
}

main()
  .catch((err) => { logger.error({ err }, 'subscription geocode-fill fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
```

- [ ] **Step 2: 소규모 dry-run으로 성공률을 잰다**

Run: `pnpm exec dotenv -e <운영 env> -- tsx scripts/ingest/subscriptions/geocode-fill.ts --limit 50`
Expected: `대상 50건 → 성공 N / 결과없음 M / 지역불일치 K` 형태의 요약. 지역불일치가 절반을 넘으면 멈추고 `regionMatches` 규칙을 재검토한다.

- [ ] **Step 3: 전량 dry-run → 검토 → `--apply`**

Run: `… geocode-fill.ts` (limit 기본 3000) 후 `… geocode-fill.ts --apply`
Expected: 2,364건 대상. 반영 후 `SELECT count(*) FROM "SubscriptionNotice" WHERE location IS NULL` 로 잔여 확인.

- [ ] **Step 4: 커밋**

```bash
git add scripts/ingest/subscriptions/geocode-fill.ts
git commit -m "feat(subscription): 좌표 없는 공고 지오코딩 백필 스크립트"
```

---

## Task 3: 어댑터 배선

**Files:**
- Modify: `scripts/ingest/subscriptions/adapter-applyhome.ts` (`lat: null, lng: null` 지점)
- Modify: `scripts/ingest/subscriptions/adapter-lh-presub.ts` (같은 지점)
- Test: `tests/lib/subscription-geocode-enrich.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseAddressRegion`·`regionMatches`
- Produces: `enrichNoticesWithGeocode(notices: Array<{ address: string | null; lat: number | null; lng: number | null }>): Promise<void>` — 배열을 제자리에서 채운다

배선을 하지 않으면 앞으로 들어오는 공고가 같은 문제를 반복한다. 어댑터의 순수 정규화 함수는
그대로 두고, **러너가 upsert 직전에 배열을 채우는 방식**으로 붙인다 — 정규화 함수가 네트워크를
타면 단위 테스트가 불가능해진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** — `geocode`를 모킹해 검증 로직만 본다

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const geocodeMock = vi.fn();
vi.mock('@/scripts/ingest/geocoder', () => ({ geocode: (q: string) => geocodeMock(q) }));

import { enrichNoticesWithGeocode } from '@/scripts/ingest/subscriptions/geocode-enrich';

beforeEach(() => geocodeMock.mockReset());

describe('enrichNoticesWithGeocode', () => {
  it('지역이 맞으면 좌표를 채운다', async () => {
    geocodeMock.mockResolvedValue({ lat: 37.55, lng: 127.14, region1: '서울특별시', region2: '강동구' });
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: 37.55, lng: 127.14 });
  });

  it('지역이 어긋나면 채우지 않는다', async () => {
    geocodeMock.mockResolvedValue({ lat: 37.49, lng: 127.06, region1: '서울특별시', region2: '강남구' });
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(rows[0]).toMatchObject({ lat: null, lng: null });
  });

  it('이미 좌표가 있으면 호출하지 않는다', async () => {
    const rows = [{ address: '서울특별시 강동구 고덕로 399', lat: 1, lng: 2 }];
    await enrichNoticesWithGeocode(rows);
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('주소가 없으면 호출하지 않는다', async () => {
    const rows = [{ address: null, lat: null, lng: null }];
    await enrichNoticesWithGeocode(rows);
    expect(geocodeMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/subscription-geocode-enrich.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```ts
// scripts/ingest/subscriptions/geocode-enrich.ts
import { geocode } from '@/scripts/ingest/geocoder';
import { logger } from '@/lib/logger';
import { parseAddressRegion, regionMatches } from '@/lib/subscription/geo-validate';

interface Coordable { address: string | null; lat: number | null; lng: number | null }

/** upsert 직전에 좌표 없는 공고를 주소로 채운다. 지역이 어긋나면 채우지 않는다. */
export async function enrichNoticesWithGeocode<T extends Coordable>(rows: T[]): Promise<void> {
  let filled = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.lat != null && r.lng != null) continue;
    if (!r.address) { skipped++; continue; }
    const coord = await geocode(r.address);
    if (!coord || !regionMatches(parseAddressRegion(r.address), coord)) { skipped++; continue; }
    r.lat = coord.lat;
    r.lng = coord.lng;
    filled++;
  }
  if (filled || skipped) logger.info({ filled, skipped, total: rows.length }, 'subscription geocode enrichment');
}
```

- [ ] **Step 4: 러너에 배선** — `scripts/ingest/subscriptions/runner.ts`에서 upsert 직전에 호출

```ts
import { enrichNoticesWithGeocode } from './geocode-enrich';
// … 정규화 결과 배열을 만든 뒤, upsert 루프 직전에:
await enrichNoticesWithGeocode(notices);
```

> 구현 시 `runner.ts`의 실제 변수명을 확인해 맞춘다. 정규화 결과가 단건씩 처리되는 구조면
> 배열로 모은 뒤 한 번에 호출한다.

- [ ] **Step 5: 통과 확인 후 커밋**

Run: `pnpm vitest run tests/lib/subscription-geocode-enrich.test.ts` → PASS (4 tests)

```bash
git add scripts/ingest/subscriptions/geocode-enrich.ts scripts/ingest/subscriptions/runner.ts tests/lib/subscription-geocode-enrich.test.ts
git commit -m "feat(subscription): 적재 시 지오코딩 배선"
```

---

## Task 4: 시군구 중위가 스냅샷

**Files:**
- Create: `lib/subscription/median-snapshot.ts`
- Create: `scripts/subscription/refresh-median-snapshot.ts`
- Modify: `deploy/run-etl.sh` (`transactions-daily` 케이스)
- Test: `tests/lib/subscription-median-snapshot.test.ts`

**Interfaces:**
- Produces: `SIGUNGU_MEDIAN_KEY = 'subscription_sigungu_median'`, `SigunguMedian = { median: number; count: number }`, `computeSigunguMedians(): Promise<Record<string, SigunguMedian>>`, `writeSigunguMedianSnapshot(): Promise<void>`, `readSigunguMedianSnapshot(): Promise<Record<string, SigunguMedian> | null>`

`lib/guide/data-snapshot.ts`를 재사용하지 않는다 — 그쪽은 키를 `guide_` 접두사로 만들고
`HeavyBlockKey` 타입에 묶여 있다. `DashboardSnapshot` 테이블만 공유한다.

- [ ] **Step 1: 구현**

```ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const SIGUNGU_MEDIAN_KEY = 'subscription_sigungu_median';

export interface SigunguMedian { median: number; count: number }

/** 표본이 이보다 적은 시군구는 스냅샷에 넣지 않는다. */
export const MIN_SAMPLE = 30;

/** 시군구별 최근 12개월 아파트 매매 중위 거래가(만원)와 건수. 실측 대상 249곳. */
export async function computeSigunguMedians(): Promise<Record<string, SigunguMedian>> {
  const rows = await prisma.$queryRaw<Array<{ sgg: string; med: number; n: bigint }>>`
    SELECT "sigunguCode" AS sgg,
           ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY "dealAmount"))::int AS med,
           COUNT(*) AS n
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL
    GROUP BY "sigunguCode"
    HAVING COUNT(*) >= ${MIN_SAMPLE}
  `;
  const out: Record<string, SigunguMedian> = {};
  for (const r of rows) out[r.sgg] = { median: r.med, count: Number(r.n) };
  return out;
}

export async function writeSigunguMedianSnapshot(): Promise<void> {
  const payload = (await computeSigunguMedians()) as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key: SIGUNGU_MEDIAN_KEY },
    create: { key: SIGUNGU_MEDIAN_KEY, payload },
    update: { payload },
  });
}

/** 상세 페이지에서 호출. 없으면 null → 비교 줄을 렌더하지 않는다. */
export async function readSigunguMedianSnapshot(): Promise<Record<string, SigunguMedian> | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: SIGUNGU_MEDIAN_KEY } });
  return (row?.payload as unknown as Record<string, SigunguMedian>) ?? null;
}
```

- [ ] **Step 2: 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { computeSigunguMedians, MIN_SAMPLE, SIGUNGU_MEDIAN_KEY } from '@/lib/subscription/median-snapshot';

describe('시군구 중위가 스냅샷', () => {
  it('스냅샷 키는 DashboardSnapshot.key 길이 제한(40) 안이다', () => {
    expect(SIGUNGU_MEDIAN_KEY.length).toBeLessThanOrEqual(40);
  });
  it('표본 하한은 30이다', () => {
    expect(MIN_SAMPLE).toBe(30);
  });
  it('빈 데이터에서도 던지지 않고 객체를 돌려준다', async () => {
    const r = await computeSigunguMedians();
    expect(typeof r).toBe('object');
    for (const v of Object.values(r)) {
      expect(v.count).toBeGreaterThanOrEqual(MIN_SAMPLE);
      expect(Number.isFinite(v.median)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: 갱신 스크립트**

```ts
/**
 * 시군구별 실거래 중위가 스냅샷 갱신. 일일 실거래 ingest 이후 실행한다.
 * 무거운 집계라 세션 모드(DIRECT_URL) + 단일 커넥션으로 돈다.
 */
export {}; // 톱레벨 import가 없으면 전역 스크립트로 취급돼 다른 스크립트의 main과 충돌한다.

async function main() {
  const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${base}${sep}connection_limit=1&pool_timeout=600`;
  }
  const { prisma } = await import('@/lib/db');
  const { writeSigunguMedianSnapshot } = await import('@/lib/subscription/median-snapshot');

  await prisma.$executeRawUnsafe('SET statement_timeout = 0');
  const t = Date.now();
  await writeSigunguMedianSnapshot();
  console.log(`[subscription-median] refreshed in ${Date.now() - t}ms`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error('[subscription-median] failed', err); process.exit(1); });
```

- [ ] **Step 4: ETL 훅** — `deploy/run-etl.sh`의 `transactions-daily`, 가이드 스냅샷 갱신 **다음 줄**

```bash
  transactions-daily)
    $DC pnpm ingest:run
    $DC pnpm tsx scripts/dashboard/refresh-snapshot.ts
    $DC pnpm tsx scripts/guide/refresh-data-snapshot.ts
    $DC pnpm tsx scripts/subscription/refresh-median-snapshot.ts
    ;;
```

> `deploy/**` 수정은 한 배포 늦게 적용된다. 첫 스냅샷은 배포 후 박스에서 수동 실행한다.

- [ ] **Step 5: `pnpm test:unit` 통과 후 커밋**

```bash
git add lib/subscription/median-snapshot.ts scripts/subscription/refresh-median-snapshot.ts deploy/run-etl.sh tests/lib/subscription-median-snapshot.test.ts
git commit -m "feat(subscription): 시군구별 실거래 중위가 스냅샷 + ETL 훅"
```

---

## Task 5: 주소 → 시군구 조회

**Files:**
- Create: `lib/subscription/sigungu-from-address.ts`
- Test: `tests/lib/subscription-sigungu-from-address.test.ts`

**Interfaces:**
- Consumes: Task 1의 `parseAddressRegion`
- Produces: `sigunguCodeFromAddress(address: string | null): Promise<string | null>`

`regionCode`는 청약홈 자체 3자리 시도 코드라 `Region.code`와 매칭되지 않는다(실측 0건).
주소 앞 두 토큰으로 `Region`을 조회한다. 실측 성공률 5,587/5,911 (94.5%).

- [ ] **Step 1: 구현**

```ts
import { prisma } from '@/lib/db';
import { parseAddressRegion } from './geo-validate';

/**
 * 청약 공고 주소에서 시군구 코드를 얻는다.
 * `SubscriptionNotice.regionCode`는 청약홈 자체 3자리 시도 코드(100=서울)라 쓸 수 없다.
 * 세종처럼 시군구 계층이 없거나 일반구를 둔 시(주소는 `경기도 수원시 …`, Region은 `수원시 영통구`)는
 * 매칭되지 않는다 — 실측 324건. 그 경우 null을 돌려주고 호출부가 비교를 생략한다.
 */
export async function sigunguCodeFromAddress(address: string | null): Promise<string | null> {
  if (!address) return null;
  const { sido, sigungu } = parseAddressRegion(address);
  if (!sido || !sigungu) return null;

  const row = await prisma.region.findFirst({
    where: { sido, sigungu, sigunguCode: { not: null } },
    select: { sigunguCode: true },
  });
  return row?.sigunguCode ?? null;
}
```

- [ ] **Step 2: 테스트** — 통합 테스트(로컬 DB 시드 필요)

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { sigunguCodeFromAddress } from '@/lib/subscription/sigungu-from-address';

const CODE = '1174010100';
beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: CODE },
    create: { code: CODE, sido: '유닛서울시', sigungu: '유닛강동구', fullName: '유닛서울시 유닛강동구',
              level: 3, sourceVersion: 'ut', sigunguCode: '99999' },
    update: { sigunguCode: '99999' },
  });
});
afterAll(async () => {
  await prisma.region.deleteMany({ where: { code: CODE } });
  await prisma.$disconnect();
});

describe('sigunguCodeFromAddress', () => {
  it('주소 앞 두 토큰으로 시군구 코드를 찾는다', async () => {
    expect(await sigunguCodeFromAddress('유닛서울시 유닛강동구 고덕로 399')).toBe('99999');
  });
  it('주소가 없으면 null', async () => {
    expect(await sigunguCodeFromAddress(null)).toBeNull();
  });
  it('토큰이 하나뿐이면 null', async () => {
    expect(await sigunguCodeFromAddress('유닛세종시')).toBeNull();
  });
  it('매칭되는 지역이 없으면 null', async () => {
    expect(await sigunguCodeFromAddress('없는시도 없는구 어딘가로 1')).toBeNull();
  });
});
```

- [ ] **Step 3: 통과 확인 후 커밋**

Run: `pnpm dlx dotenv-cli -e .env.test -- pnpm vitest run tests/lib/subscription-sigungu-from-address.test.ts`

```bash
git add lib/subscription/sigungu-from-address.ts tests/lib/subscription-sigungu-from-address.test.ts
git commit -m "feat(subscription): 주소에서 시군구 코드 조회"
```

---

## Task 6: 분양가 비교 블록

**Files:**
- Create: `app/(public)/subscription/[id]/_components/price-comparison.tsx`
- Create: `lib/subscription/unit-area-basis.ts`
- Modify: `app/(public)/subscription/[id]/page.tsx` (`<UnitSupplyTable />` 다음)
- Test: `tests/lib/subscription-unit-area-basis.test.ts`

**Interfaces:**
- Consumes: Task 4의 `readSigunguMedianSnapshot`, Task 5의 `sigunguCodeFromAddress`
- Produces: `unitAreaBasis(rawJson: unknown): 'supply' | 'exclusive' | null`

- [ ] **Step 1: 면적 기준 판정 함수 + 테스트**

```ts
// lib/subscription/unit-area-basis.ts
/**
 * `SubscriptionUnit.area`가 공급면적인지 전용면적인지 판정한다.
 * 어댑터가 `area: num(SUPLY_AR) ?? num(EXCLUSE_AR)`로 채워 컬럼 의미가 섞여 있다.
 * 실측 25,255 units: SUPLY_AR 20,156 · EXCLUSE_AR만 3,107 · 둘 다 없음 1,992.
 */
export function unitAreaBasis(rawJson: unknown): 'supply' | 'exclusive' | null {
  if (!rawJson || typeof rawJson !== 'object') return null;
  const r = rawJson as Record<string, unknown>;
  if (r.SUPLY_AR != null && r.SUPLY_AR !== '') return 'supply';
  if (r.EXCLUSE_AR != null && r.EXCLUSE_AR !== '') return 'exclusive';
  return null;
}

export function areaBasisLabel(basis: 'supply' | 'exclusive' | null): string {
  return basis === 'supply' ? '공급' : basis === 'exclusive' ? '전용' : '';
}
```

```ts
// tests/lib/subscription-unit-area-basis.test.ts
import { describe, it, expect } from 'vitest';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';

describe('unitAreaBasis', () => {
  it('SUPLY_AR이 있으면 공급면적', () => {
    expect(unitAreaBasis({ SUPLY_AR: '82.8550' })).toBe('supply');
  });
  it('SUPLY_AR이 없고 EXCLUSE_AR만 있으면 전용면적', () => {
    expect(unitAreaBasis({ EXCLUSE_AR: '59.9900' })).toBe('exclusive');
  });
  it('둘 다 있으면 어댑터와 같이 SUPLY_AR을 택한다', () => {
    expect(unitAreaBasis({ SUPLY_AR: '82.85', EXCLUSE_AR: '59.99' })).toBe('supply');
  });
  it('둘 다 없으면 null', () => {
    expect(unitAreaBasis({ HOUSE_TY: '84A' })).toBeNull();
    expect(unitAreaBasis(null)).toBeNull();
  });
  it('빈 문자열은 값 없음으로 본다', () => {
    expect(unitAreaBasis({ SUPLY_AR: '', EXCLUSE_AR: '59.99' })).toBe('exclusive');
  });
  it('라벨', () => {
    expect(areaBasisLabel('supply')).toBe('공급');
    expect(areaBasisLabel('exclusive')).toBe('전용');
    expect(areaBasisLabel(null)).toBe('');
  });
});
```

Run: `pnpm vitest run tests/lib/subscription-unit-area-basis.test.ts` → PASS (6 tests)

- [ ] **Step 2: 컴포넌트 구현**

```tsx
import { readSigunguMedianSnapshot } from '@/lib/subscription/median-snapshot';
import { sigunguCodeFromAddress } from '@/lib/subscription/sigungu-from-address';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';
import { formatBillion } from '@/lib/format';
import { SourceCaption } from '@/components/ui/source-caption';

interface UnitRow { houseType: string | null; area: unknown; topAmount: number | null; rawJson: unknown }

/**
 * 이 공고의 주택형별 분양가와 같은 시군구 실거래 중위가를 나란히 놓는다.
 *
 * **면적당 단가는 비교하지 않는다.** `area`의 기준이 행마다 다르고(공급 80% / 전용 12%)
 * 실거래는 전용면적이라, 단가를 나란히 두면 행끼리도 실거래와도 비교가 안 된다. 총액끼리만 본다.
 */
export async function PriceComparison({ units, address }: { units: UnitRow[]; address: string | null }) {
  const priced = units.filter((u) => u.topAmount != null);
  if (priced.length === 0) return null;

  const sgg = await sigunguCodeFromAddress(address).catch(() => null);
  const snapshot = sgg ? await readSigunguMedianSnapshot().catch(() => null) : null;
  const local = sgg && snapshot ? snapshot[sgg] : null;

  return (
    <section className="my-8 rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-base font-bold text-[var(--color-blue-dark)]">이 공고의 분양가와 주변 시세</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)]">
              <th scope="col" className="py-2 text-left text-xs font-bold text-[var(--color-muted)]">주택형</th>
              <th scope="col" className="py-2 text-right text-xs font-bold text-[var(--color-muted)]">면적</th>
              <th scope="col" className="py-2 text-right text-xs font-bold text-[var(--color-muted)]">분양 최고가</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((u, i) => {
              const basis = unitAreaBasis(u.rawJson);
              const sqm = u.area == null ? null : Number(u.area);
              return (
                <tr key={i} className="border-b border-[var(--color-line)] last:border-b-0">
                  <td className="py-2 text-left text-[var(--color-text)]">{u.houseType ?? '-'}</td>
                  <td className="py-2 text-right text-[var(--color-text)]">
                    {sqm == null ? '-' : `${areaBasisLabel(basis)} ${sqm.toFixed(2)}㎡`}
                  </td>
                  <td className="py-2 text-right text-[var(--color-text)]">{formatBillion(u.topAmount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {local && (
        <p className="mt-3 text-sm text-[var(--color-text)]">
          같은 시군구 아파트 매매 중위가(최근 12개월) <strong>{formatBillion(local.median)}</strong>
          <span className="text-[var(--color-muted)]"> · 거래 {local.count.toLocaleString('ko-KR')}건</span>
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        분양가는 공고에 적힌 최고 공급금액입니다. 면적 기준이 주택형마다 다르고 실거래는 전용면적
        기준이라, 면적당 단가는 비교하지 않았습니다.
      </p>
      <SourceCaption ids={local ? ['applyhome', 'molit-rtms'] : ['applyhome']} />
    </section>
  );
}
```

- [ ] **Step 3: 페이지 배선** — `page.tsx`의 `<UnitSupplyTable units={notice.units} />` 바로 다음

```tsx
<PriceComparison units={notice.units} address={notice.address} />
```

`notice.units`가 `rawJson`을 포함하는지 `getSubscriptionById`의 select를 확인하고, 없으면 추가한다.

- [ ] **Step 4: `pnpm lint` → `typecheck` → `test:unit` → `build` 후 커밋**

```bash
git add app/(public)/subscription/[id]/_components/price-comparison.tsx lib/subscription/unit-area-basis.ts "app/(public)/subscription/[id]/page.tsx" tests/lib/subscription-unit-area-basis.test.ts
git commit -m "feat(subscription): 분양가 × 지역 실거래 중위가 비교 블록"
```

---

## Task 7: changefreq 교정 + 410 게이트

**Files:**
- Modify: `lib/sitemap/sources.ts:110-130` (subscription 소스)
- Modify: `app/(public)/subscription/[id]/page.tsx` (410 반환)
- Test: `tests/lib/sitemap-subscription.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `SUBSCRIPTION_PUBLIC: Prisma.SubscriptionNoticeWhereInput` — 사이트맵과 페이지가 공유하는 단일 게이트

**사전 조건:** Task 2의 `--apply`가 끝나 `location IS NULL` 잔여가 확정돼야 한다.
410 대상 목록을 사람이 검토한 뒤 적용한다.

- [ ] **Step 1: 공개 게이트와 changefreq 분기**

```ts
/**
 * 공개 게이트. 좌표가 없는 공고는 지도·주변 실거래·인프라가 통째로 빠져
 * 공급표와 공용 블록만 남는 near-duplicate가 된다. 지오코딩 백필 후에도 좌표가 없으면 비공개한다.
 * noindex를 쓰지 않는 이유: 애드센스 심사는 자체 크롤러라 noindex가 보이지 않는다.
 */
export const SUBSCRIPTION_PUBLIC: Prisma.SubscriptionNoticeWhereInput = {
  location: { not: null },
  OR: [{ totalSupply: { not: null } }, { units: { some: {} } }],
};
```

> Prisma는 `Unsupported("geography")` 컬럼을 `where`에 담지 못한다. 구현 시
> `location IS NOT NULL` 조건은 `$queryRaw`로 id 목록을 얻거나 `prisma.$queryRaw`
> 기반 소스로 바꾼다. 어느 쪽이든 **사이트맵과 페이지가 같은 판정을 쓰도록** 한 곳에 둔다.

changefreq는 `toEntry`에서 `receiptEnd`로 나눈다. `findMany`의 select에 `receiptEnd`를 추가한다.

```ts
  toEntry: (s) => ({
    url: `${SITE_URL}/subscription/${s.id}`,
    lastModified: s.updatedAt,
    // 99.6%가 마감된 공고다. 전부 daily로 신고하면 크롤 예산을 낭비한다.
    changeFrequency: s.receiptEnd && s.receiptEnd < new Date() ? 'yearly' : 'daily',
    priority: 0.7,
  }),
```

- [ ] **Step 2: 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { subscriptionChangeFrequency } from '@/lib/sitemap/sources';

describe('청약 사이트맵 changefreq', () => {
  it('마감된 공고는 yearly', () => {
    expect(subscriptionChangeFrequency(new Date('2020-01-01'), new Date('2026-08-11'))).toBe('yearly');
  });
  it('진행중·예정은 daily', () => {
    expect(subscriptionChangeFrequency(new Date('2026-12-31'), new Date('2026-08-11'))).toBe('daily');
  });
  it('마감일이 없으면 daily', () => {
    expect(subscriptionChangeFrequency(null, new Date('2026-08-11'))).toBe('daily');
  });
});
```

판정을 `subscriptionChangeFrequency(receiptEnd: Date | null, now: Date)`로 뽑아 테스트 가능하게 한다.

- [ ] **Step 3: 페이지 410**

```tsx
// getSubscriptionById 이후, notFound() 자리 근처
const coord = await getSubscriptionLatLng(noticeId);
if (!coord) {
  // 좌표가 없으면 공급표와 공용 블록만 남는 near-duplicate다. 색인이 아니라 비공개다.
  const { notFound } = await import('next/navigation');
  notFound(); // 410은 Next 15에서 라우트 세그먼트 설정으로 처리한다 — 구현 시 아래 주 참조
}
```

> **구현 주의:** Next.js App Router는 `notFound()`가 404를 낸다. 410을 내려면 상세 라우트에
> `route.ts`를 두거나 미들웨어에서 처리해야 한다. `docs/superpowers/plans/2026-08-10-d1-d2b-route-removal.md`가
> 같은 문제를 다뤘으므로 그 방식을 따른다. 저장소에 410 사용처가 아직 없으므로(실측) 이 태스크가 첫 도입이다.
> 방식이 확정되지 않으면 **이 단계에서 멈추고 사람에게 확인한다.**

- [ ] **Step 4: 검증 후 커밋**

Run: `pnpm test:unit` → `pnpm build` → `pnpm seed:e2e` → `pnpm test:e2e`

```bash
git add lib/sitemap/sources.ts "app/(public)/subscription/[id]/page.tsx" tests/lib/sitemap-subscription.test.ts
git commit -m "feat(subscription): 마감 공고 changefreq 교정 + 좌표 없는 공고 비공개"
```

---

## Self-Review

**스펙 커버리지**

| 스펙 절 | 태스크 |
|---|---|
| §4 지오코딩 백필·좌표 검증 | Task 1·2 |
| §4.3 어댑터 배선 | Task 3 |
| §5.1 분양가 표 · §5.2 면적 기준 병기 | Task 6 |
| §5.3 주소 → 시군구 | Task 5 |
| §5.4 중위가 스냅샷·ETL 훅 | Task 4 |
| §6.1 410 · §6.2 changefreq | Task 7 |
| §7 오류 처리 | 각 태스크의 null·실패 경로에 분산 |
| §8 테스트 | Task 1·3·4·5·6·7의 테스트 단계 |

**플레이스홀더 스캔:** Task 3 Step 4의 "`runner.ts`의 실제 변수명을 확인해 맞춘다"와 Task 7 Step 3의
410 구현 방식은 **의도적으로 열어 둔 두 곳**이다. 전자는 러너 구조를 읽어야 정해지고, 후자는 저장소에
선례가 없어 사람 확인이 필요하다. Task 7에 "확정되지 않으면 멈추고 확인한다"를 명시했다.

**타입 일관성:** `parseAddressRegion`(Task 1)을 Task 3·5가 쓴다. `SigunguMedian`(Task 4)을 Task 6이 읽는다.
`unitAreaBasis`의 반환 `'supply' | 'exclusive' | null`이 `areaBasisLabel`의 입력과 같다.

**미확인(스펙 §10에서 이어짐):** 지오코딩 성공률은 Task 2 Step 2의 50건 표본으로 먼저 잰다.
그 수치가 Task 7의 410 대상 규모를 정한다.
