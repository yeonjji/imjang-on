# 좌표 커버리지·품질 보정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 장소 데이터의 `location` 좌표를 완성한다 — NULL 371행을 채우고, bbox 이탈·시군구 충돌로 잘못 찍힌 좌표를 주소로 재지오코딩해 교정하며, 병원·약국 ingest에 지오코딩 폴백을 추가해 재발을 막는다.

**Architecture:** PostGIS `geography(Point,4326)` 단일 컬럼에 좌표 저장. 검출은 순수 SQL(NULL/bbox/시군구충돌), 교정은 기존 카카오 지오코더(`scripts/ingest/geocoder.ts`) 재사용. 통합 ops 스크립트 1개(`coord-quality.ts`)가 10개 테이블을 설정 배열로 처리하고, GitHub Actions 수동 트리거로 운영 DB에 DRY-RUN→apply 순서로 실행한다.

**Tech Stack:** TypeScript, tsx, Prisma(`$queryRaw`/`$executeRaw`), PostGIS, Kakao Local API, vitest, GitHub Actions.

설계 출처: `docs/superpowers/specs/2026-06-04-coordinate-coverage-quality-design.md`

---

## 참고: 기존 패턴 (구현 전 읽을 것)

- `scripts/ingest/geocoder.ts` — `geocode(query)`, `buildGeocodeQuery(prefix, address)`. 카카오 주소검색, 인메모리 캐시. `env.KAKAO_REST_KEY` 없으면 null 반환.
- `scripts/ops/regeocode-suspect-properties.ts` — 본 계획의 원형. CTE로 의심행 검출 → DRY-RUN 기본 → `--apply`로 재지오코딩. `coord-quality.ts`는 이걸 다중 테이블로 일반화한 것.
- `scripts/ingest/amenities/geocode-fill.ts` — `enrichWithGeocode<T extends {address:string;lat:number|null;lng:number|null}>(rows)`. lat/lng가 이미 있으면 skip, 없으면 `geocode(address)`로 채움.
- 좌표 쓰기 규약: `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` — **(경도, 위도)** 순서.
- 좌표 읽기: 경도 `ST_X(location::geometry)`, 위도 `ST_Y(location::geometry)`.

---

## Task 1: 한국 bbox 공용 헬퍼 (TDD)

SQL 검출과 JS 결과검증이 같은 bbox 숫자를 쓰도록 단일 출처를 만든다.

**Files:**
- Create: `lib/geo/korea-bbox.ts`
- Test: `tests/lib/korea-bbox.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/korea-bbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KOREA_BBOX, isInKoreaBbox } from '@/lib/geo/korea-bbox';

describe('korea-bbox', () => {
  it('서울 좌표는 내부', () => {
    expect(isInKoreaBbox(126.978, 37.5665)).toBe(true); // 서울시청
  });
  it('제주 남단·서해5도 경계 근처도 내부', () => {
    expect(isInKoreaBbox(126.27, 33.1)).toBe(true);  // 제주
    expect(isInKoreaBbox(124.7, 37.96)).toBe(true);  // 백령도 인근
  });
  it('위경도 뒤바뀜은 외부', () => {
    expect(isInKoreaBbox(37.5665, 126.978)).toBe(false); // lng/lat swap
  });
  it('0좌표·해외는 외부', () => {
    expect(isInKoreaBbox(0, 0)).toBe(false);
    expect(isInKoreaBbox(-122.4, 37.77)).toBe(false); // SF
  });
  it('상수는 위도 33.0~38.7 / 경도 124.0~132.0', () => {
    expect(KOREA_BBOX).toEqual({ minLat: 33.0, maxLat: 38.7, minLng: 124.0, maxLng: 132.0 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/korea-bbox.test.ts`
Expected: FAIL — `Cannot find module '@/lib/geo/korea-bbox'`

- [ ] **Step 3: 구현**

`lib/geo/korea-bbox.ts`:

```ts
/**
 * 한국(본토+주요 도서) 좌표 bbox. 좌표 위생 검사의 단일 출처.
 * 보수적으로 잡아 정상 좌표 오탐을 피한다 (제주 남단·서해5도·독도 포함).
 */
export const KOREA_BBOX = {
  minLat: 33.0,
  maxLat: 38.7,
  minLng: 124.0,
  maxLng: 132.0,
} as const;

/** 경도(lng)·위도(lat)가 한국 bbox 내부인지. 인자 순서는 (경도, 위도). */
export function isInKoreaBbox(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= KOREA_BBOX.minLat &&
    lat <= KOREA_BBOX.maxLat &&
    lng >= KOREA_BBOX.minLng &&
    lng <= KOREA_BBOX.maxLng
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/korea-bbox.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/geo/korea-bbox.ts tests/lib/korea-bbox.test.ts
git commit -m "feat(geo): 한국 bbox 공용 헬퍼 + 단위테스트"
```

---

## Task 2: 병원·약국 GIST 공간 인덱스 마이그레이션

cross-sigungu 대상은 아니지만 향후 거리쿼리 이득 + 인덱스 세트 완성. 나머지 8개 테이블엔 이미 존재.

**Files:**
- Create: `prisma/migrations/20260604000000_hospital_pharmacy_location_gist/migration.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`prisma/migrations/20260604000000_hospital_pharmacy_location_gist/migration.sql`:

```sql
-- Hospital·Pharmacy location GiST 인덱스 (누락분 보완)
CREATE INDEX IF NOT EXISTS "Hospital_location_idx" ON "Hospital" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "Pharmacy_location_idx" ON "Pharmacy" USING GIST ("location");
```

- [ ] **Step 2: 로컬 test DB에 적용해 SQL 유효성 검증**

Run: `pnpm test:db:migrate`
Expected: `prisma migrate deploy`가 새 마이그레이션을 적용하고 에러 없이 종료. (로컬 docker DB 기동 필요: `docker compose up -d`)

- [ ] **Step 3: 인덱스 생성 확인**

Run:
```bash
pnpm dotenv -e .env.test -- tsx -e "import {prisma} from '@/lib/db'; prisma.\$queryRawUnsafe(\`SELECT indexname FROM pg_indexes WHERE indexname IN ('Hospital_location_idx','Pharmacy_location_idx')\`).then(r=>{console.log(r);process.exit(0)})"
```
Expected: 두 인덱스명이 출력됨.

- [ ] **Step 4: 커밋**

```bash
git add prisma/migrations/20260604000000_hospital_pharmacy_location_gist
git commit -m "feat(db): Hospital·Pharmacy location GiST 인덱스"
```

> 운영(Supabase) 적용은 기존 마이그레이션 배포 경로(`pnpm prisma:deploy` 또는 CI)로 별도 수행. Task 7에서 다룸.

---

## Task 3: coverage-audit.ts 확장 (NULL + bbox 카운트)

검증/모니터링 도구를 임시본에서 bbox 이탈 카운트까지 재도록 확장하고 정식 커밋.

**Files:**
- Modify: `scripts/ops/coverage-audit.ts` (전체 교체)

- [ ] **Step 1: 전체 내용 교체**

`scripts/ops/coverage-audit.ts`:

```ts
/**
 * 테이블별 좌표 커버리지 집계 (읽기 전용).
 * total / location NULL / bbox 이탈 카운트. 백필 전후 검증·모니터링용.
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coverage-audit.ts
 */
import { prisma } from '@/lib/db';
import { KOREA_BBOX } from '@/lib/geo/korea-bbox';

const TABLES = [
  'Property', 'School', 'Park', 'Store', 'TraditionalMarket',
  'EvCharger', 'Childcare', 'Parking', 'Hospital', 'Pharmacy',
];

function outOfBboxSql(): string {
  const g = 'location::geometry';
  return `location IS NOT NULL AND (
    ST_Y(${g}) NOT BETWEEN ${KOREA_BBOX.minLat} AND ${KOREA_BBOX.maxLat}
    OR ST_X(${g}) NOT BETWEEN ${KOREA_BBOX.minLng} AND ${KOREA_BBOX.maxLng})`;
}

async function main() {
  const parts = TABLES.map(
    (t) => `SELECT '${t}' AS tbl, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE location IS NULL)::int AS null_loc,
      COUNT(*) FILTER (WHERE ${outOfBboxSql()})::int AS out_bbox
      FROM "${t}"`,
  );
  const sql = parts.join('\nUNION ALL\n') + '\nORDER BY tbl';
  const rows = await prisma.$queryRawUnsafe<
    { tbl: string; total: number; null_loc: number; out_bbox: number }[]
  >(sql);

  console.log(
    'table'.padEnd(20), 'total'.padStart(10), 'null_loc'.padStart(10),
    'out_bbox'.padStart(10), 'bad_%'.padStart(8),
  );
  for (const r of rows) {
    const bad = r.null_loc + r.out_bbox;
    const pct = r.total ? ((bad / r.total) * 100).toFixed(2) : '0.00';
    console.log(
      r.tbl.padEnd(20), String(r.total).padStart(10), String(r.null_loc).padStart(10),
      String(r.out_bbox).padStart(10), pct.padStart(8),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 test DB로 쿼리 실행(스모크)**

Run: `pnpm dotenv -e .env.test -- tsx scripts/ops/coverage-audit.ts`
Expected: 테이블 10행 출력(데이터 없으면 total 0). SQL이 에러 없이 도는 것을 확인.

- [ ] **Step 4: 커밋**

```bash
git add scripts/ops/coverage-audit.ts
git commit -m "feat(ops): coverage-audit — NULL+bbox이탈 카운트 정식화"
```

---

## Task 4: coord-quality.ts — 통합 검출·교정 스크립트

**Files:**
- Create: `scripts/ops/coord-quality.ts`

- [ ] **Step 1: 전체 작성**

`scripts/ops/coord-quality.ts`:

```ts
/**
 * 좌표 품질 통합 점검·교정 (범위 C).
 *
 * 검출 신호:
 *   null          — location IS NULL
 *   bbox          — 한국 bbox 이탈 (위경도 뒤바뀜·0좌표·이상치)
 *   sigungu       — 50m 내 다른 sigunguCode 행과 충돌 (지오코딩 파생: Property·School 한정)
 * 교정: 의심행을 주소로 재지오코딩(Kakao)해 location 갱신. 재지오코딩 결과가 bbox 밖이면 skip.
 *
 * 기본 DRY-RUN. 실제 갱신은 --apply (KAKAO_REST_KEY 필요).
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coord-quality.ts
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coord-quality.ts --apply --table=School --limit=50
 *   옵션: --table=<name> --reason=<null|bbox|sigungu> --limit=N
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode, buildGeocodeQuery } from '@/scripts/ingest/geocoder';
import { KOREA_BBOX, isInKoreaBbox } from '@/lib/geo/korea-bbox';

const APPLY = process.argv.includes('--apply');
const TABLE = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1] ?? null;
const REASON = process.argv.find((a) => a.startsWith('--reason='))?.split('=')[1] ?? null;
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const PROXIMITY_M = 50;

type Reason = 'null' | 'bbox' | 'sigungu';

interface TableConfig {
  table: string;
  prefixExpr: string | null; // alias t 기준 지역 접두사 SQL, 없으면 null
  joinSql?: string;          // prefix 해석용 JOIN (예: Region)
  crossSigungu: boolean;     // 시군구 충돌 검출 (지오코딩 파생 테이블만)
}

const CONFIGS: TableConfig[] = [
  { table: 'Property', prefixExpr: 'r."fullName"', joinSql: 'LEFT JOIN "Region" r ON r.code = t."regionCode"', crossSigungu: true },
  { table: 'School', prefixExpr: 't.region', crossSigungu: true },
  { table: 'Hospital', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'Pharmacy', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'Childcare', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'TraditionalMarket', prefixExpr: null, crossSigungu: false },
  { table: 'Parking', prefixExpr: null, crossSigungu: false },
  { table: 'Store', prefixExpr: null, crossSigungu: false },
  { table: 'EvCharger', prefixExpr: null, crossSigungu: false },
  { table: 'Park', prefixExpr: null, crossSigungu: false },
];

interface Suspect {
  table: string;
  id: string; // bigint as text
  address: string | null;
  prefix: string | null;
  reason: Reason;
}

function bboxOutsidePredicate(): string {
  const g = 't.location::geometry';
  return `(ST_Y(${g}) NOT BETWEEN ${KOREA_BBOX.minLat} AND ${KOREA_BBOX.maxLat}
        OR ST_X(${g}) NOT BETWEEN ${KOREA_BBOX.minLng} AND ${KOREA_BBOX.maxLng})`;
}

function detectSql(cfg: TableConfig): string {
  const join = cfg.joinSql ?? '';
  const prefix = cfg.prefixExpr ?? `''`;
  const select = (reason: Reason, where: string, distinct = false) => `
    SELECT ${distinct ? 'DISTINCT' : ''} t.id::text AS id, t.address AS address,
           ${prefix} AS prefix, '${reason}' AS reason
    FROM "${cfg.table}" t ${join}
    WHERE ${where}`;

  const parts: string[] = [];
  if (!REASON || REASON === 'null') parts.push(select('null', 't.location IS NULL'));
  if (!REASON || REASON === 'bbox') parts.push(select('bbox', `t.location IS NOT NULL AND ${bboxOutsidePredicate()}`));
  if (cfg.crossSigungu && (!REASON || REASON === 'sigungu')) {
    parts.push(select('sigungu', `t.location IS NOT NULL AND EXISTS (
      SELECT 1 FROM "${cfg.table}" q
      WHERE q.id <> t.id AND q.location IS NOT NULL
        AND q."sigunguCode" IS DISTINCT FROM t."sigunguCode"
        AND ST_DWithin(t.location, q.location, ${PROXIMITY_M})
    )`, true));
  }
  return parts.join('\nUNION ALL\n');
}

async function detect(cfg: TableConfig): Promise<Suspect[]> {
  const sql = detectSql(cfg);
  if (!sql.trim()) return [];
  const rows = await prisma.$queryRawUnsafe<
    { id: string; address: string | null; prefix: string | null; reason: Reason }[]
  >(sql);
  return rows.map((r) => ({ ...r, table: cfg.table }));
}

async function applyOne(s: Suspect): Promise<'updated' | 'skipped'> {
  if (!s.address) return 'skipped';
  const coord = await geocode(buildGeocodeQuery(s.prefix, s.address));
  if (!coord || !isInKoreaBbox(coord.lng, coord.lat)) {
    logger.warn({ table: s.table, id: s.id, reason: s.reason }, '재지오코딩 실패/범위밖 — 건너뜀');
    return 'skipped';
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "${s.table}" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
    coord.lng, coord.lat, BigInt(s.id),
  );
  return 'updated';
}

async function main() {
  const configs = TABLE ? CONFIGS.filter((c) => c.table === TABLE) : CONFIGS;
  if (configs.length === 0) throw new Error(`--table=${TABLE} 은 알 수 없는 테이블`);

  const all: Suspect[] = [];
  for (const cfg of configs) all.push(...(await detect(cfg)));

  const byKey = all.reduce<Record<string, number>>((acc, s) => {
    const k = `${s.table}/${s.reason}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  logger.info({ total: all.length, byKey, apply: APPLY, limit: LIMIT }, '좌표 의심행 검출 완료');

  if (!APPLY) {
    console.log('\n[DRY-RUN] 사유별 건수:');
    for (const [k, n] of Object.entries(byKey).sort()) console.log(`  ${k}: ${n}`);
    console.log('\n샘플 20건:');
    for (const s of all.slice(0, 20)) {
      console.log(`  ${s.table}#${s.id} [${s.reason}] "${s.prefix ?? ''}" | "${s.address ?? ''}"`);
    }
    console.log('\n실제 갱신: --apply 추가 (KAKAO_REST_KEY 필요). --table=/--reason=/--limit= 로 범위 제한.');
    await prisma.$disconnect();
    return;
  }

  const targets = LIMIT ? all.slice(0, LIMIT) : all;
  let updated = 0;
  let skipped = 0;
  for (const s of targets) {
    const r = await applyOne(s);
    if (r === 'updated') updated++; else skipped++;
    await new Promise((res) => setTimeout(res, 50)); // 카카오 레이트리밋 여유
  }
  logger.info({ updated, skipped, total: targets.length }, '좌표 교정 완료');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  logger.error({ err }, 'coord-quality 실패');
  await prisma.$disconnect();
  process.exit(1);
});
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 test DB로 DRY-RUN 스모크**

Run: `pnpm dotenv -e .env.test -- tsx scripts/ops/coord-quality.ts`
Expected: 검출 SQL 10개 테이블 모두 에러 없이 실행, "사유별 건수" 출력(데이터 없으면 0). cross-sigungu self-join(Property·School)도 에러 없이 도는지 확인.

- [ ] **Step 4: 단일 테이블/사유 필터 동작 확인**

Run: `pnpm dotenv -e .env.test -- tsx scripts/ops/coord-quality.ts --table=School --reason=bbox`
Expected: School·bbox만 검출 시도. 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add scripts/ops/coord-quality.ts
git commit -m "feat(ops): coord-quality — NULL/bbox/시군구충돌 검출+재지오코딩 교정"
```

---

## Task 5: 병원·약국 ingest 지오코딩 폴백

소스 좌표가 없는 행이 NULL로 남지 않도록, upsert 전에 주소 폴백 지오코딩.

**Files:**
- Modify: `scripts/ingest-hospital.ts`
- Modify: `scripts/ingest-pharmacy.ts`

- [ ] **Step 1: hospital — import 추가**

`scripts/ingest-hospital.ts` 상단 import 블록 끝(`from '@/scripts/ingest/amenities/types';` 다음 줄)에 추가:

```ts
import { enrichWithGeocode } from '@/scripts/ingest/amenities/geocode-fill';
```

- [ ] **Step 2: hospital — upsert 전 폴백 호출**

`scripts/ingest-hospital.ts`의 `main()`에서 아래 한 줄을:

```ts
    const hospitalRows = dedupeBySourceId(parseHospitalRows(readXlsxRows(findXlsx(dir, 1))));
```

다음과 같이 폴백 호출을 끼운다:

```ts
    const hospitalRows = dedupeBySourceId(parseHospitalRows(readXlsxRows(findXlsx(dir, 1))));
    await enrichWithGeocode(hospitalRows); // 소스 좌표 누락 행을 주소로 폴백 지오코딩
```

- [ ] **Step 3: pharmacy — import 추가**

`scripts/ingest-pharmacy.ts` 상단 import 블록 끝(`from '@/scripts/ingest/amenities/types';` 다음 줄)에 추가:

```ts
import { enrichWithGeocode } from '@/scripts/ingest/amenities/geocode-fill';
```

- [ ] **Step 4: pharmacy — upsert 전 폴백 호출**

`scripts/ingest-pharmacy.ts`의 `main()`에서:

```ts
    const rows = dedupeBySourceId(parsePharmacyRows(readXlsxRows(findXlsx(dir, 2))));
```

다음으로:

```ts
    const rows = dedupeBySourceId(parsePharmacyRows(readXlsxRows(findXlsx(dir, 2))));
    await enrichWithGeocode(rows); // 소스 좌표 누락 행을 주소로 폴백 지오코딩
```

- [ ] **Step 5: 타입체크 (Coordable 충족 확인)**

Run: `pnpm typecheck`
Expected: 에러 없음. (`NormalizedHospital`/`NormalizedPharmacy`는 `address:string`·`lat:number|null`·`lng:number|null`을 가져 `enrichWithGeocode`의 제약을 만족.)

만약 타입 에러가 나면 `NormalizedHospital`/`NormalizedPharmacy`의 `lat`/`lng`가 readonly이거나 `address`가 nullable인지 `scripts/ingest/amenities/types.ts`에서 확인하고, `enrichWithGeocode`는 mutable `lat`/`lng`·non-null `address`를 요구하므로 타입을 맞춘다.

- [ ] **Step 6: 기존 ingest 테스트 회귀 확인**

Run: `pnpm test:unit`
Expected: 기존 ingest 단위테스트 + Task 1 bbox 테스트 모두 PASS.

- [ ] **Step 7: 커밋**

```bash
git add scripts/ingest-hospital.ts scripts/ingest-pharmacy.ts
git commit -m "fix(ingest): 병원·약국 좌표 누락 행 주소 폴백 지오코딩"
```

---

## Task 6: GitHub Actions 워크플로

`regeocode-properties.yml`을 일반화한 수동 트리거. 운영 시크릿이 운영 DB를 가리킴.

**Files:**
- Create: `.github/workflows/coord-quality.yml`

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/coord-quality.yml`:

```yaml
name: coord-quality

# 좌표 NULL/bbox이탈/시군구충돌을 검출해 주소로 재지오코딩한다 (수동 트리거 전용).
# 기본 dry-run(집계만). 실제 갱신은 apply=true.
on:
  workflow_dispatch:
    inputs:
      apply:
        description: '실제 갱신 여부 (false=dry-run 집계만)'
        type: choice
        options:
          - 'false'
          - 'true'
        default: 'false'
      table:
        description: '대상 테이블 1개 (빈 값=전체). 예: School, Property'
        default: ''
      reason:
        description: '사유 필터 (빈 값=전체). null | bbox | sigungu'
        default: ''
      limit:
        description: '최대 처리 건수 (빈 값=제한 없음). 첫 apply는 50 권장.'
        default: ''

jobs:
  coord-quality:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      KAKAO_REST_KEY: ${{ secrets.KAKAO_REST_KEY }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
      PRISMA_INGEST: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - name: Coord quality detect/fix
        run: |
          ARGS=""
          if [ "${{ inputs.apply }}" = "true" ]; then ARGS="$ARGS --apply"; fi
          if [ -n "${{ inputs.table }}" ]; then ARGS="$ARGS --table=${{ inputs.table }}"; fi
          if [ -n "${{ inputs.reason }}" ]; then ARGS="$ARGS --reason=${{ inputs.reason }}"; fi
          if [ -n "${{ inputs.limit }}" ]; then ARGS="$ARGS --limit=${{ inputs.limit }}"; fi
          echo "Running: coord-quality.ts$ARGS"
          pnpm tsx scripts/ops/coord-quality.ts $ARGS
        timeout-minutes: 120
```

- [ ] **Step 2: YAML 유효성 확인**

Run: `pnpm dlx js-yaml .github/workflows/coord-quality.yml > /dev/null && echo OK`
Expected: `OK` (파싱 에러 없음). (js-yaml 미설치 시 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/coord-quality.yml')); print('OK')"`)

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/coord-quality.yml
git commit -m "ci(ops): coord-quality 수동 트리거 워크플로"
```

---

## Task 7: 운영 적용 & 최종 검증 (수동 운영 작업)

> 코드가 아니라 운영 실행 절차. PR 머지 후, GitHub Actions UI에서 수행.

- [ ] **Step 1: 운영 마이그레이션 배포** — 기존 마이그레이션 배포 경로로 Task 2 인덱스 적용 (`pnpm prisma:deploy` 또는 CI 배포 잡).

- [ ] **Step 2: 적용 전 베이스라인** — 운영에서 coverage-audit 실행, NULL·out_bbox 수치 기록.

Run(또는 Actions로): `pnpm dotenv -e .env.local -- tsx scripts/ops/coverage-audit.ts`
Expected: NULL 합계 ≈ 371. out_bbox 수치 확인(미지).

- [ ] **Step 3: DRY-RUN 검출** — `coord-quality` 워크플로를 `apply=false`로 실행. Actions 로그에서 사유별 건수(null/bbox/sigungu)와 샘플 확인. 규모 파악.

- [ ] **Step 4: 소량 검증 적용** — `apply=true`, `limit=50`로 실행. 로그의 updated/skipped 확인. 샘플 좌표를 지도/`ST_AsText`로 육안 확인.

- [ ] **Step 5: 전체 적용** — `apply=true`(limit 없음). 필요 시 `table`/`reason`으로 분할 실행(대형 sigungu 충돌은 Property·School만 발생).

- [ ] **Step 6: 적용 후 검증** — coverage-audit 재실행. NULL·out_bbox가 "지오코딩 불가 잔여"만 남고 급감했는지 확인. Step 2 베이스라인과 비교.

성공 기준 충족: ① NULL·bbox이탈 급감, ② 폴백 2개로 차기 ingest NULL 자가치유(병원·약국 재인제스트 시 확인), ③ `pnpm typecheck`+`pnpm lint` 통과·기존 테스트 회귀 없음.

---

## Self-Review

**Spec coverage:**
- §5.1 검출 3신호(NULL/bbox/시군구충돌) → Task 4 `detectSql`. ✅
- §5.2 주소 재지오코딩 교정 → Task 4 `applyOne`. ✅
- §5.3-1 `coord-quality.ts` → Task 4. ✅
- §5.3-2 폴백 2개(병원·약국) → Task 5. ✅ (EV·어린이집은 기존 보유, 변경 없음 — 정정 반영)
- §5.3-3 coverage-audit 정식화 → Task 3. ✅
- §5.3-4 Hospital·Pharmacy GIST → Task 2. ✅
- §5.3-5 워크플로 → Task 6. ✅
- §5.4 실행 순서 → Task 7. ✅
- §6 성능(GIST 의존 self-join은 Property·School만, 둘 다 인덱스 보유) → Task 4 `crossSigungu` 플래그로 제한. ✅
- bbox 단일 출처(§5.1) → Task 1 `KOREA_BBOX`, Task 3·4에서 import. ✅

**Placeholder scan:** "적절히/적당히/TODO/유사함" 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `KOREA_BBOX`/`isInKoreaBbox`(Task 1) ↔ Task 3·4 import 일치. `geocode`/`buildGeocodeQuery`/`enrichWithGeocode` 시그니처는 기존 파일 그대로 사용. `Suspect.id`는 text로 select → `BigInt(s.id)`로 UPDATE 바인딩(일관). `TableConfig.crossSigungu` 명칭 Task 4 내 일관.

**미해결 가정 1건:** Task 5 Step 5 — `NormalizedHospital`/`NormalizedPharmacy`의 `lat`/`lng` mutable·`address` non-null 여부는 타입체크로 검증(가정이 틀리면 동 Step의 보정 지침대로 처리).
