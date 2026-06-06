# 청약 데일리 수집 증분화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** apt 등 청약 수집이 매일 전체 이력을 재처리하던 구조를 contentHash 기반 변경 감지로 바꿔, 신규·변경 공고만 units fetch + geocode + upsert 하도록 만들어 120분 타임아웃을 해소한다.

**Architecture:** notice를 units 없이 먼저 수집 → 각 notice의 contentHash 계산 → DB의 기존 (contentHash, address, 좌표)와 diff → 신규/변경 건만 units fetch·geocode·upsert, 나머지 skip. diff 오케스트레이션은 `runOne`에 공통으로 두고 source별 fetch만 어댑터로 분리한다.

**Tech Stack:** TypeScript, tsx, Prisma(PostgreSQL/PostGIS, Supabase), vitest, Node `crypto`.

**참고 spec:** `docs/superpowers/specs/2026-06-06-subscription-ingest-incremental-design.md`

**검증 환경 주의:** `.env.local`=운영 Supabase, `.env.test`=로컬 docker. 마이그레이션 생성·검증은 반드시 `.env.test`로 한다.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `prisma/schema.prisma` | `SubscriptionNotice.contentHash` 컬럼 | Modify |
| `prisma/migrations/*/migration.sql` | 컬럼 추가 마이그레이션 | Create (generated) |
| `scripts/ingest/subscriptions/types.ts` | `NormalizedNotice.contentHash`, `ExistingNotice` | Modify |
| `scripts/ingest/subscriptions/content-hash.ts` | `computeContentHash(notice)` | Create |
| `scripts/ingest/subscriptions/diff.ts` | `diffByHash(items, existing)` | Create |
| `scripts/ingest/subscriptions/upsert.ts` | INSERT/ON CONFLICT에 `contentHash` | Modify |
| `scripts/ingest/subscriptions/adapter-applyhome.ts` | `fetchApplyhomeNotices`(units 없는 목록) 분리, `fetchUnits` export | Modify |
| `scripts/ingest/subscriptions/runner.ts` | 증분 오케스트레이션(loadExisting/diff/geocodeNotice/로그) | Modify |
| `.github/workflows/ingest-subscriptions.yml` | `timeout-minutes` 일시 상향 | Modify |
| `tests/ingest/subscriptions/content-hash.test.ts` | computeContentHash 단위 테스트 | Create |
| `tests/ingest/subscriptions/diff.test.ts` | diffByHash 단위 테스트 | Create |

---

## Task 1: 스키마에 contentHash 컬럼 추가 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma:683` (SubscriptionNotice의 `rawJson Json` 아래)
- Create: `prisma/migrations/<timestamp>_add_subscription_content_hash/migration.sql` (생성됨)

- [ ] **Step 1: schema.prisma 수정**

`SubscriptionNotice` 모델의 `rawJson  Json` 줄 다음에 컬럼을 추가한다:

```prisma
  location Unsupported("geography(Point,4326)")?
  rawJson  Json
  contentHash String? @db.VarChar(64)

  updatedAt DateTime @updatedAt
```

- [ ] **Step 2: 로컬 test DB에 마이그레이션 생성·적용**

Run:
```bash
dotenv -e .env.test -- pnpm exec prisma migrate dev --name add_subscription_content_hash
```
Expected: `prisma/migrations/<ts>_add_subscription_content_hash/` 생성, `migration.sql`에 `ALTER TABLE "SubscriptionNotice" ADD COLUMN "contentHash" VARCHAR(64);` 포함, "Your database is now in sync" 출력.

- [ ] **Step 3: Prisma Client 재생성**

Run:
```bash
pnpm exec prisma generate
```
Expected: 성공. 이후 `prisma.subscriptionNotice` 타입에 `contentHash` 존재.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(subscription): add contentHash column for incremental ingest"
```

---

## Task 2: types에 contentHash 필드와 ExistingNotice 추가

**Files:**
- Modify: `scripts/ingest/subscriptions/types.ts`

- [ ] **Step 1: NormalizedNotice에 contentHash 추가**

`rawJson: unknown;` 줄 다음(인터페이스 닫기 `}` 직전)에 추가:

```ts
  rawJson: unknown;
  contentHash?: string;
}
```

- [ ] **Step 2: ExistingNotice 인터페이스 추가**

`NoticeWithUnits` 인터페이스 정의 아래에 추가:

```ts
// DB에서 diff 비교용으로 가볍게 로드한 기존 공고 상태
export interface ExistingNotice {
  contentHash: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음(기존 코드는 contentHash가 optional이라 영향 없음).

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/subscriptions/types.ts
git commit -m "feat(subscription): add contentHash field and ExistingNotice type"
```

---

## Task 3: computeContentHash (TDD)

**Files:**
- Create: `scripts/ingest/subscriptions/content-hash.ts`
- Test: `tests/ingest/subscriptions/content-hash.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/subscriptions/content-hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeContentHash } from '@/scripts/ingest/subscriptions/content-hash';
import type { NormalizedNotice } from '@/scripts/ingest/subscriptions/types';

function base(): NormalizedNotice {
  return {
    source: 'APPLYHOME' as NormalizedNotice['source'],
    category: 'APT' as NormalizedNotice['category'],
    sourceKey: 'H1-P1',
    houseManageNo: 'H1',
    pblancNo: 'P1',
    panId: null,
    origNoticeKey: null,
    name: '테스트아파트',
    status: null,
    regionCode: '100',
    regionName: '서울',
    address: '서울시 강남구 1',
    totalSupply: 100,
    noticeDate: new Date('2026-06-01'),
    receiptBegin: new Date('2026-06-10'),
    receiptEnd: new Date('2026-06-12'),
    winnerDate: null,
    contractBegin: null,
    contractEnd: null,
    moveInYm: '202712',
    homepage: null,
    noticeUrl: 'http://x',
    developer: '시행',
    constructor: '시공',
    tel: '02-0000',
    lat: null,
    lng: null,
    rawJson: { A: 1 },
  };
}

describe('computeContentHash', () => {
  it('같은 내용이면 같은 해시(64자 hex)', () => {
    const h = computeContentHash(base());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContentHash(base())).toBe(h);
  });

  it('lat/lng/rawJson 차이는 해시에 영향 없음', () => {
    const a = base();
    const b = { ...base(), lat: 37.5, lng: 127.0, rawJson: { B: 2 } };
    expect(computeContentHash(b)).toBe(computeContentHash(a));
  });

  it('영속 필드(address)가 바뀌면 해시가 달라짐', () => {
    const a = base();
    const b = { ...base(), address: '서울시 강남구 2' };
    expect(computeContentHash(b)).not.toBe(computeContentHash(a));
  });

  it('날짜 필드가 바뀌면 해시가 달라짐', () => {
    const a = base();
    const b = { ...base(), receiptEnd: new Date('2026-06-13') };
    expect(computeContentHash(b)).not.toBe(computeContentHash(a));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/ingest/subscriptions/content-hash.test.ts`
Expected: FAIL — `computeContentHash`를 찾을 수 없음(모듈 없음).

- [ ] **Step 3: 구현**

`scripts/ingest/subscriptions/content-hash.ts`:

```ts
import { createHash } from 'node:crypto';
import type { NormalizedNotice } from './types';

// 해시에 포함할 영속 필드(정렬됨). lat/lng/rawJson/sourceKey/contentHash 는 제외.
const HASH_FIELDS = [
  'category',
  'houseManageNo',
  'pblancNo',
  'panId',
  'origNoticeKey',
  'name',
  'status',
  'regionCode',
  'regionName',
  'address',
  'totalSupply',
  'noticeDate',
  'receiptBegin',
  'receiptEnd',
  'winnerDate',
  'contractBegin',
  'contractEnd',
  'moveInYm',
  'homepage',
  'noticeUrl',
  'developer',
  'constructor',
  'tel',
].sort() as (keyof NormalizedNotice)[];

export function computeContentHash(notice: NormalizedNotice): string {
  const canonical: Record<string, unknown> = {};
  for (const key of HASH_FIELDS) {
    const v = notice[key];
    canonical[key as string] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/ingest/subscriptions/content-hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/content-hash.ts tests/ingest/subscriptions/content-hash.test.ts
git commit -m "feat(subscription): add computeContentHash for change detection"
```

---

## Task 4: diffByHash (TDD)

**Files:**
- Create: `scripts/ingest/subscriptions/diff.ts`
- Test: `tests/ingest/subscriptions/diff.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/ingest/subscriptions/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffByHash } from '@/scripts/ingest/subscriptions/diff';
import type { NoticeWithUnits, ExistingNotice } from '@/scripts/ingest/subscriptions/types';

function item(sourceKey: string, contentHash: string): NoticeWithUnits {
  return {
    notice: { sourceKey, contentHash } as NoticeWithUnits['notice'],
    units: [],
  };
}

describe('diffByHash', () => {
  it('DB에 없는 신규 공고는 changed', () => {
    const existing = new Map<string, ExistingNotice>();
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed.map((i) => i.notice.sourceKey)).toEqual(['A']);
    expect(skipped).toBe(0);
  });

  it('해시가 같으면 skip', () => {
    const existing = new Map<string, ExistingNotice>([
      ['A', { contentHash: 'h1', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('해시가 다르면 changed', () => {
    const existing = new Map<string, ExistingNotice>([
      ['A', { contentHash: 'old', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash([item('A', 'h1')], existing);
    expect(changed.map((i) => i.notice.sourceKey)).toEqual(['A']);
    expect(skipped).toBe(0);
  });

  it('혼합: 신규+변경+동일을 정확히 분류', () => {
    const existing = new Map<string, ExistingNotice>([
      ['same', { contentHash: 'h', address: null, lat: null, lng: null }],
      ['changed', { contentHash: 'old', address: null, lat: null, lng: null }],
    ]);
    const { changed, skipped } = diffByHash(
      [item('same', 'h'), item('changed', 'new'), item('new', 'x')],
      existing,
    );
    expect(changed.map((i) => i.notice.sourceKey).sort()).toEqual(['changed', 'new']);
    expect(skipped).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec vitest run tests/ingest/subscriptions/diff.test.ts`
Expected: FAIL — `diffByHash` 모듈 없음.

- [ ] **Step 3: 구현**

`scripts/ingest/subscriptions/diff.ts`:

```ts
import type { NoticeWithUnits, ExistingNotice } from './types';

// notice.contentHash 와 DB 기존 contentHash 를 비교해 신규/변경분만 골라낸다.
// 각 item.notice.contentHash 는 호출 전에 채워져 있어야 한다.
export function diffByHash(
  items: NoticeWithUnits[],
  existing: Map<string, ExistingNotice>,
): { changed: NoticeWithUnits[]; skipped: number } {
  const changed: NoticeWithUnits[] = [];
  let skipped = 0;
  for (const item of items) {
    const prev = existing.get(item.notice.sourceKey);
    if (prev && prev.contentHash != null && prev.contentHash === item.notice.contentHash) {
      skipped++;
    } else {
      changed.push(item);
    }
  }
  return { changed, skipped };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec vitest run tests/ingest/subscriptions/diff.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/diff.ts tests/ingest/subscriptions/diff.test.ts
git commit -m "feat(subscription): add diffByHash change detection"
```

---

## Task 5: upsert에 contentHash 영속화

**Files:**
- Modify: `scripts/ingest/subscriptions/upsert.ts`

- [ ] **Step 1: INSERT 컬럼 목록에 contentHash 추가**

`upsertNotice`의 INSERT 컬럼 목록에서 `"location", "rawJson", "updatedAt"` 부분을 다음으로 교체:

```ts
      "location", "rawJson", "contentHash", "updatedAt"
```

- [ ] **Step 2: VALUES에 contentHash 값 추가**

`${locationSql(n.lat, n.lng)}, ${JSON.stringify(n.rawJson)}::jsonb, NOW()` 줄을 다음으로 교체:

```ts
      ${locationSql(n.lat, n.lng)}, ${JSON.stringify(n.rawJson)}::jsonb, ${n.contentHash ?? null}, NOW()
```

- [ ] **Step 3: ON CONFLICT DO UPDATE에 contentHash 추가**

`"rawJson" = EXCLUDED."rawJson",` 줄 다음에 추가:

```ts
      "rawJson" = EXCLUDED."rawJson",
      "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = NOW()
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/upsert.ts
git commit -m "feat(subscription): persist contentHash on upsert"
```

---

## Task 6: adapter-applyhome — notice 목록과 units 분리

**Files:**
- Modify: `scripts/ingest/subscriptions/adapter-applyhome.ts`

기존 `fetchApplyhomeCategory`(units를 페이징 안에서 같이 받음)는 Task 7에서 제거된다. 여기서는 units 없는 목록 함수를 새로 추가하고 `fetchUnits`를 export 한다.

- [ ] **Step 1: fetchApplyhomeNotices 추가 (units 미수집)**

`fetchApplyhomeCategory` 함수 정의 바로 위에 새 함수를 추가:

```ts
// detail 페이징만 수행. units 는 받지 않는다(변경 감지 후 대상만 fetchUnits).
export async function fetchApplyhomeNotices(
  cfg: ApplyhomeCategoryConfig,
): Promise<NormalizedNotice[]> {
  const out: NormalizedNotice[] = [];
  const PER = 100;
  let page = 1;
  while (true) {
    const { data, totalCount } = await fetchOdcloud(cfg.detailOp, { page, perPage: PER });
    for (const row of data) {
      const notice = normalizeNotice(row as Record<string, unknown>, cfg);
      if (!notice.houseManageNo || !notice.pblancNo) {
        logger.warn({ category: cfg.category, sourceKey: notice.sourceKey }, 'skip notice missing id');
        continue;
      }
      out.push(notice);
    }
    logger.info({ category: cfg.category, page, fetched: out.length, totalCount }, 'applyhome notice page');
    if (page * PER >= totalCount || data.length === 0) break;
    page++;
  }
  return out;
}
```

- [ ] **Step 2: fetchUnits export 화**

`async function fetchUnits(` 를 다음으로 변경:

```ts
export async function fetchUnits(
```

- [ ] **Step 3: NormalizedNotice import 확인**

파일 상단 import에 `NormalizedNotice`가 포함돼 있는지 확인. 현재 `import type { NormalizedNotice, NormalizedUnit, NoticeWithUnits } from './types';` 로 이미 포함됨 — 변경 불필요.

- [ ] **Step 4: 타입 체크 + 기존 테스트**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run tests/ingest/subscriptions/adapter-applyhome.test.ts`
Expected: 타입 OK, 기존 normalize 테스트 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subscriptions/adapter-applyhome.ts
git commit -m "feat(subscription): add units-free fetchApplyhomeNotices, export fetchUnits"
```

---

## Task 7: runner — 증분 오케스트레이션

**Files:**
- Modify: `scripts/ingest/subscriptions/runner.ts`
- Modify: `scripts/ingest/subscriptions/adapter-applyhome.ts` (사용처 없어진 `fetchApplyhomeCategory` 제거)

- [ ] **Step 1: runner.ts 상단 import 교체**

기존 import 블록(1-9행)을 다음으로 교체:

```ts
import { SubscriptionCategory, SubscriptionSource } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { geocode } from '@/scripts/ingest/geocoder';
import { APPLYHOME_CONFIG, fetchApplyhomeNotices, fetchUnits } from './adapter-applyhome';
import { fetchLhPresub } from './adapter-lh-presub';
import { computeContentHash } from './content-hash';
import { diffByHash } from './diff';
import { upsertNoticeWithUnits } from './upsert';
import { SUBSCRIPTION_INGEST_SOURCE } from './types';
import type { ExistingNotice, NoticeWithUnits, SubscriptionSourceKey } from './types';
```

- [ ] **Step 2: collect / geocodeItems 제거하고 헬퍼 추가**

`ALL_KEYS`/`parseArgs` 는 그대로 둔다. 기존 `collect`(22-25행)와 `geocodeItems`(27-37행) 함수를 삭제하고, 그 자리에 다음을 넣는다:

```ts
// key → SubscriptionNotice 의 (source, category) 스코프
function noticeScope(key: SubscriptionSourceKey): {
  source: SubscriptionSource;
  category: SubscriptionCategory;
} {
  if (key === 'lh') {
    return { source: SubscriptionSource.LH_PRESUB, category: SubscriptionCategory.LH_PRESUB };
  }
  return { source: SubscriptionSource.APPLYHOME, category: APPLYHOME_CONFIG[key].category };
}

// 해당 스코프의 기존 공고를 diff 비교용으로 가볍게 로드(rawJson 제외, 좌표는 lat/lng 로 환산)
async function loadExisting(
  source: SubscriptionSource,
  category: SubscriptionCategory,
): Promise<Map<string, ExistingNotice>> {
  const rows = await prisma.$queryRaw<
    { sourceKey: string; contentHash: string | null; address: string | null; lat: number | null; lng: number | null }[]
  >`
    SELECT "sourceKey", "contentHash", "address",
           ST_Y("location"::geometry) AS lat,
           ST_X("location"::geometry) AS lng
    FROM "SubscriptionNotice"
    WHERE "source" = ${source}::"SubscriptionSource"
      AND "category" = ${category}::"SubscriptionCategory"
  `;
  const map = new Map<string, ExistingNotice>();
  for (const r of rows) {
    map.set(r.sourceKey, { contentHash: r.contentHash, address: r.address, lat: r.lat, lng: r.lng });
  }
  return map;
}

// 신규/주소변경일 때만 카카오 호출, 주소 동일하면 기존 좌표 재사용
async function geocodeNotice(
  notice: NoticeWithUnits['notice'],
  prev: ExistingNotice | undefined,
): Promise<void> {
  if (!notice.address) return;
  if (prev && prev.lat != null && prev.lng != null && prev.address === notice.address) {
    notice.lat = prev.lat;
    notice.lng = prev.lng;
    return;
  }
  const coord = await geocode(notice.address);
  if (coord) {
    notice.lat = coord.lat;
    notice.lng = coord.lng;
  }
}
```

- [ ] **Step 3: runOne 본문 교체**

기존 `runOne`(39-65행)의 `try { ... } catch` 안 `try` 블록(45-57행, `const items = await collect(key);` 부터 `return upserted;` 까지)을 다음으로 교체:

```ts
  try {
    const isLh = key === 'lh';
    const items: NoticeWithUnits[] = isLh
      ? await fetchLhPresub()
      : (await fetchApplyhomeNotices(APPLYHOME_CONFIG[key])).map((notice) => ({ notice, units: [] }));
    for (const item of items) {
      item.notice.contentHash = computeContentHash(item.notice);
    }
    logger.info({ key, fetched: items.length }, 'notices fetched');

    const { source: noticeSource, category } = noticeScope(key);
    const existing = await loadExisting(noticeSource, category);
    const { changed, skipped } = diffByHash(items, existing);
    logger.info({ key, changed: changed.length, skipped }, 'change diff');

    let upserted = 0;
    for (const item of changed) {
      if (!isLh) {
        item.units = await fetchUnits(
          APPLYHOME_CONFIG[key],
          item.notice.houseManageNo,
          item.notice.pblancNo,
        );
      }
      await geocodeNotice(item.notice, existing.get(item.notice.sourceKey));
      await upsertNoticeWithUnits(item);
      upserted++;
      if (upserted % 50 === 0) {
        logger.info({ key, upserted, total: changed.length }, 'upsert progress');
      }
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: upserted, finishedAt: new Date() },
    });
    logger.info({ key, upserted, skipped }, 'subscription source done');
    return upserted;
  } catch (err) {
```

> 주: 위 교체는 기존 `try {` 와 `} catch (err) {` 사이를 통째로 바꾼다. `catch` 블록(58-64행)과 `runOne`의 시작부(`ingestionRun.create`)·`main`·파일 하단은 그대로 둔다.

- [ ] **Step 4: adapter-applyhome의 사용처 없어진 fetchApplyhomeCategory 제거**

`scripts/ingest/subscriptions/adapter-applyhome.ts`에서 더 이상 호출되지 않는 `fetchApplyhomeCategory` 함수(84-106행 전체)를 삭제한다. `fetchApplyhomeNotices`와 `fetchUnits`는 유지.

- [ ] **Step 5: 타입 체크 + 전체 단위 테스트**

Run: `pnpm exec tsc --noEmit && pnpm test:unit`
Expected: 타입 에러 없음, 기존 + 신규 단위 테스트 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/subscriptions/runner.ts scripts/ingest/subscriptions/adapter-applyhome.ts
git commit -m "feat(subscription): incremental ingest via contentHash diff in runner"
```

---

## Task 8: 워크플로 timeout 일시 상향

**Files:**
- Modify: `.github/workflows/ingest-subscriptions.yml:36`

- [ ] **Step 1: timeout-minutes 상향**

`timeout-minutes: 120` 을 다음으로 변경:

```yaml
        timeout-minutes: 300 # TEMP: 최초 backfill(전건 재처리) 대비. 정상화 후 120 으로 원복
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ingest-subscriptions.yml
git commit -m "chore(ci): bump subscription ingest timeout for first backfill run"
```

---

## Task 9: 로컬 검증 (2회 연속 실행)

> 외부 공공데이터/카카오 호출이 필요하므로 `.env.test`에 `PUBLIC_DATA_KEY`, `KAKAO_REST_KEY`가 있어야 한다. 없으면 운영자에게 1회 실행을 요청(`! pnpm ...`)하고 로그만 확인한다.

**Files:** 없음(실행/관찰만)

- [ ] **Step 1: 로컬 test DB 마이그레이션 적용 확인**

Run: `dotenv -e .env.test -- pnpm exec prisma migrate status`
Expected: `add_subscription_content_hash` 적용됨(Up to date).

- [ ] **Step 2: 1회차 실행 (backfill)**

Run: `dotenv -e .env.test -- pnpm tsx scripts/ingest/subscriptions/runner.ts --source=apt`
Expected: 로그에 `change diff` 의 `changed`가 전체에 가깝고 `skipped`≈0(첫 실행이라 기존 hash 없음). 정상 종료.

- [ ] **Step 3: 2회차 실행 (증분)**

Run: `dotenv -e .env.test -- pnpm tsx scripts/ingest/subscriptions/runner.ts --source=apt`
Expected: `change diff` 에서 `changed`≈0, `skipped`이 전체에 근접. 소요 시간이 1회차 대비 크게 감소(units fetch/geocode/upsert를 거의 안 함).

- [ ] **Step 4: 변경 감지 동작 검증**

임의 1건의 hash를 깨뜨린 뒤 재실행해 그 건만 잡히는지 확인:
```bash
dotenv -e .env.test -- pnpm exec prisma db execute --stdin <<'SQL'
UPDATE "SubscriptionNotice" SET "contentHash" = 'broken'
WHERE id = (SELECT id FROM "SubscriptionNotice" WHERE category='APT' LIMIT 1);
SQL
dotenv -e .env.test -- pnpm tsx scripts/ingest/subscriptions/runner.ts --source=apt
```
Expected: `change diff` 의 `changed`가 정확히 1.

- [ ] **Step 5: 무손실 확인**

Run:
```bash
dotenv -e .env.test -- pnpm exec prisma db execute --stdin <<'SQL'
SELECT count(*) AS notices FROM "SubscriptionNotice" WHERE category='APT';
SELECT count(*) AS units FROM "SubscriptionUnit";
SELECT count(*) AS geocoded FROM "SubscriptionNotice" WHERE category='APT' AND "location" IS NOT NULL;
SQL
```
Expected: skip이 대부분이어도 units·좌표 수가 1회차 대비 보존됨(증분이 기존 데이터를 지우지 않음).

---

## 실행 후 후속 (이 플랜 범위 밖, 잊지 말 것)

- 운영 DB 마이그레이션 배포: 평소 배포 경로(CI `prisma migrate deploy`)로 `add_subscription_content_hash` 반영.
- 최초 운영 backfill(전건) 1회가 무겁게 도는 것을 확인한 뒤 `.github/workflows/ingest-subscriptions.yml`의 `timeout-minutes`를 **120으로 원복**.
- (별개) Node 20→24 액션 deprecation 대응.

---

## Self-Review

- **Spec 커버리지:** §1 어댑터 재편→Task 6+7, §2 contentHash→Task 3, §3 스키마→Task 1, §4 geocode→Task 7(geocodeNotice), §5 upsert→Task 5, §6 관측성/timeout→Task 7(로그)+Task 8, §7 LH→Task 7(noticeScope/runOne 분기). 검증 §1~5→Task 9 + 각 TDD 태스크. 모든 spec 항목에 대응 태스크 존재.
- **Placeholder:** 없음(모든 코드 블록 실제 코드).
- **타입 일관성:** `computeContentHash`/`diffByHash`/`ExistingNotice`/`fetchApplyhomeNotices`/`fetchUnits`/`noticeScope`/`geocodeNotice`/`loadExisting` 시그니처가 정의처(Task 2~6)와 사용처(Task 7)에서 일치. `NoticeWithUnits['notice']`로 notice 타입 참조 통일.
