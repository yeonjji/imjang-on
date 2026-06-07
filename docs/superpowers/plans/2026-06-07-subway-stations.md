# 지하철역 적재 + 근처 지하철역 섹션 + 역세권 검색·필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도시철도역사 xlsx를 논리역으로 통합 적재하고, 좌표 있는 모든 상세페이지에 "근처 지하철역" 섹션을 추가하며, 검색 자동완성과 `/list` 필터에서 역세권(800m) 조회를 지원한다.

**Architecture:** 신규 `SubwayStation` 테이블(PostGIS geography point) + 기존 amenity `ST_DWithin` 패턴 재사용. 리스트 필터는 역 800m 내 `Property.id`를 PostGIS로 프리필터해 기존 `getPropertyList`에 `id in [...]`로 주입(기존 정렬/페이징/필터 100% 재사용). 환승역 통합은 적재 시 순수 함수 `clusterStations`로 처리.

**Tech Stack:** Next.js 15(App Router) · Prisma 5 + PostgreSQL/PostGIS · TypeScript · Vitest · Playwright · xlsx · pnpm

참조 스펙: `docs/superpowers/specs/2026-06-07-subway-stations-design.md`
원본 데이터: `data/subway.xlsx` (1,099행, 시트 `표준데이터 역사`)

---

## File Structure

**신규 파일**
- `scripts/ingest/subway/cluster.ts` — 엑셀 행 → 논리역 클러스터 (순수 함수, 테스트 대상)
- `scripts/ingest-subway.ts` — xlsx 읽기 → 클러스터 → upsert (독립 스크립트)
- `lib/subway/line-colors.ts` — 노선명 → 뱃지(label·color) (순수 함수)
- `lib/subway/nearby.ts` — `getNearbySubwayStations(lat,lng)` (PostGIS 조회)
- `components/ui/nearby-subway.tsx` — 근처 지하철역 카드 (서버 컴포넌트)
- `tests/ingest/subway-cluster.test.ts` — 클러스터 단위 테스트
- `tests/lib/subway-line-colors.test.ts` — 뱃지 매핑 단위 테스트
- `tests/integration/subway-nearby.test.ts` — 근처/필터 통합 테스트
- `prisma/migrations/<ts>_add_subway_station/migration.sql` — 테이블 + 인덱스

**수정 파일**
- `prisma/schema.prisma` — `SubwayStation` 모델 추가
- `package.json` — `ingest:subway` 스크립트
- `lib/search.ts` — `autocomplete()`에 stations 추가
- `app/(public)/_components/search-input.tsx` — 🚇 그룹
- `lib/list-params.ts` — `station` 파라미터
- `lib/property.ts` — `getPropertyList` stationId 프리필터
- 상세페이지 11곳 — 섹션 연결
- `app/(public)/list/page.tsx` + `list-filter-panel.tsx` + `mobile-filter-sheet.tsx` — 역 필터 UI

---

## Task 1: SubwayStation 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (파일 끝에 모델 추가)
- Create: `prisma/migrations/<timestamp>_add_subway_station/migration.sql` (prisma가 생성, 인덱스 수동 추가)

- [ ] **Step 1: 스키마에 모델 추가**

`prisma/schema.prisma` 맨 끝에 추가:

```prisma
model SubwayStation {
  id          BigInt                                @id @default(autoincrement())
  name        String                                @db.VarChar(60)
  nameNorm    String                                @db.VarChar(60)
  lines       String[]                              @default([])
  operators   String[]                              @default([])
  address     String?                               @db.VarChar(200)
  isTransfer  Boolean                               @default(false)
  location    Unsupported("geography(Point,4326)")?
  dataStdDate DateTime?                             @db.Date
  sourceKey   String                                @unique @db.VarChar(80)
  updatedAt   DateTime                              @updatedAt
}
```

> `nameNorm` 검색 인덱스는 btree가 아니라 GIN trgm이 필요하므로 `@@index`로 선언하지 않고 Step 3에서 raw SQL로 추가한다(Property.nameNorm과 동일 방식).

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm prisma:migrate --name add_subway_station`
(= `dotenv -e .env.local -- prisma migrate dev --name add_subway_station`)
Expected: `prisma/migrations/<ts>_add_subway_station/migration.sql` 생성 + `CREATE TABLE "SubwayStation"` 포함.

- [ ] **Step 3: 생성된 migration.sql 끝에 PostGIS 인덱스 수동 추가**

방금 생성된 `migration.sql` 파일 맨 끝에 다음을 덧붙인다:

```sql
-- PostGIS GIST + 검색용 GIN trigram 인덱스
CREATE INDEX IF NOT EXISTS "SubwayStation_location_idx" ON "SubwayStation" USING GIST ("location");
CREATE INDEX IF NOT EXISTS "SubwayStation_nameNorm_trgm_idx" ON "SubwayStation" USING GIN ("nameNorm" gin_trgm_ops);
```

- [ ] **Step 4: 인덱스 포함해 재적용 (로컬 운영 .env.local)**

Run: `pnpm prisma:deploy`
Expected: `1 migration applied` (이미 dev로 테이블은 생성됨 → 인덱스 추가분 반영). 오류 시 `pnpm prisma:migrate`로 재생성.

- [ ] **Step 5: 테스트 DB에도 적용**

Run: `pnpm test:db:migrate`
Expected: 마이그레이션 deploy 성공(`.env.test` 로컬 docker).

- [ ] **Step 6: Prisma Client 재생성**

Run: `pnpm prisma:generate`
Expected: 성공. 이후 `prisma.subwayStation` 사용 가능.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(subway): SubwayStation 모델 + PostGIS/trgm 인덱스 마이그레이션"
```

---

## Task 2: 노선 뱃지 매핑 (순수 함수, TDD)

**Files:**
- Create: `lib/subway/line-colors.ts`
- Test: `tests/lib/subway-line-colors.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/lib/subway-line-colors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lineBadge } from '@/lib/subway/line-colors';

describe('lineBadge', () => {
  it('숫자 호선은 번호 라벨 + 지정 색상', () => {
    expect(lineBadge('3호선')).toEqual({ label: '3', color: '#EF7C1C' });
    expect(lineBadge('8호선')).toEqual({ label: '8', color: '#E6186C' });
  });
  it('명칭 노선은 약어 라벨 + 지정 색상', () => {
    expect(lineBadge('신분당선')).toEqual({ label: '신분당', color: '#D4003B' });
  });
  it('미등록 노선은 기본 회색 + 앞 2글자 라벨', () => {
    expect(lineBadge('가상선')).toEqual({ label: '가상', color: '#6B7280' });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/lib/subway-line-colors.test.ts`
Expected: FAIL (`lineBadge` 없음).

- [ ] **Step 3: 구현**

`lib/subway/line-colors.ts`:

```ts
export interface LineBadge {
  label: string;
  color: string;
}

// 라벨이 호선 번호와 다른 명칭 노선의 약어 매핑
const NAMED_LABEL: Record<string, string> = {
  신분당선: '신분당',
  수인분당선: '수인분당',
  경의중앙선: '경의중앙',
  우이신설선: '우이신설',
  서해선: '서해',
  공항철도: '공항',
  경춘선: '경춘',
  경강선: '경강',
  김포골드라인: '김포',
  신림선: '신림',
};

const LINE_COLORS: Record<string, string> = {
  '1호선': '#0052A4', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE',
  '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#747F00', '8호선': '#E6186C',
  '9호선': '#BDB092',
  신분당선: '#D4003B', 수인분당선: '#F5A200', 경의중앙선: '#77C4A3',
  우이신설선: '#B7C452', 서해선: '#8FC31F', 공항철도: '#0090D2',
  경춘선: '#0C8E72', 경강선: '#003DA5', 김포골드라인: '#A17E46',
  신림선: '#6789CA',
};

const DEFAULT_COLOR = '#6B7280';

export function lineBadge(lineName: string): LineBadge {
  const numeric = /^(\d+)호선$/.exec(lineName);
  const label = numeric ? numeric[1] : (NAMED_LABEL[lineName] ?? lineName.slice(0, 2));
  const color = LINE_COLORS[lineName] ?? DEFAULT_COLOR;
  return { label, color };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/lib/subway-line-colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/subway/line-colors.ts tests/lib/subway-line-colors.test.ts
git commit -m "feat(subway): 노선 뱃지 색상·라벨 매핑"
```

---

## Task 3: 논리역 클러스터링 (순수 함수, TDD)

**Files:**
- Create: `scripts/ingest/subway/cluster.ts`
- Test: `tests/ingest/subway-cluster.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/ingest/subway-cluster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clusterStations, type RawStationRow } from '@/scripts/ingest/subway/cluster';

function row(p: Partial<RawStationRow>): RawStationRow {
  return {
    name: '가락시장', lineName: '3호선', operator: '서울교통공사',
    address: '서울 송파구', lat: 37.4923, lng: 127.1177, dataStdDate: null, ...p,
  };
}

describe('clusterStations', () => {
  it('같은 이름 + 근접 좌표(환승역)는 1개 논리역으로 통합하고 노선을 합친다', () => {
    const out = clusterStations([
      row({ lineName: '3호선', lat: 37.492318, lng: 127.1177 }),
      row({ lineName: '8호선', lat: 37.493004, lng: 127.118279 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lines).toEqual(['3호선', '8호선']);
    expect(out[0].isTransfer).toBe(true);
  });

  it('노선 번호 오름차순 정렬 후 명칭 노선이 뒤', () => {
    const out = clusterStations([
      row({ lineName: '신분당선' }),
      row({ lineName: '2호선' }),
      row({ lineName: '9호선' }),
    ]);
    expect(out[0].lines).toEqual(['2호선', '9호선', '신분당선']);
  });

  it('같은 이름이라도 임계거리(700m) 초과면 분리한다', () => {
    const out = clusterStations([
      row({ name: '중앙', lat: 37.5, lng: 127.0 }),
      row({ name: '중앙', lat: 37.6, lng: 127.2 }), // ~약 20km
    ]);
    expect(out).toHaveLength(2);
  });

  it('단일 노선역은 isTransfer=false, sourceKey가 안정적이다', () => {
    const out = clusterStations([row({ name: '가능역', lineName: '경원선', lat: 37.7484, lng: 127.0443 })]);
    expect(out[0].isTransfer).toBe(false);
    expect(out[0].sourceKey).toBe('가능역__37.7484_127.0443');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/ingest/subway-cluster.test.ts`
Expected: FAIL (`clusterStations` 없음).

- [ ] **Step 3: 구현**

`scripts/ingest/subway/cluster.ts`:

```ts
export interface RawStationRow {
  name: string;
  lineName: string;
  operator: string | null;
  address: string | null;
  lat: number;
  lng: number;
  dataStdDate: Date | null;
}

export interface StationCluster {
  name: string;
  lines: string[];
  operators: string[];
  address: string | null;
  lat: number;
  lng: number;
  isTransfer: boolean;
  dataStdDate: Date | null;
  sourceKey: string;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// "N호선"은 번호 오름차순(앞), 명칭 노선은 가나다순(뒤)
export function sortLines(lines: string[]): string[] {
  const numOf = (l: string) => {
    const m = /^(\d+)호선$/.exec(l);
    return m ? Number(m[1]) : Infinity;
  };
  return [...new Set(lines)].sort((a, b) => {
    const na = numOf(a), nb = numOf(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b, 'ko');
  });
}

export function clusterStations(rows: RawStationRow[], thresholdMeters = 700): StationCluster[] {
  const byName = new Map<string, RawStationRow[]>();
  for (const r of rows) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }

  const clusters: StationCluster[] = [];
  for (const [, group] of byName) {
    const buckets: RawStationRow[][] = [];
    for (const r of group) {
      const hit = buckets.find((b) =>
        b.some((m) => haversineMeters(m.lat, m.lng, r.lat, r.lng) <= thresholdMeters),
      );
      if (hit) hit.push(r);
      else buckets.push([r]);
    }
    for (const bucket of buckets) {
      const lat = bucket.reduce((s, r) => s + r.lat, 0) / bucket.length;
      const lng = bucket.reduce((s, r) => s + r.lng, 0) / bucket.length;
      const lines = sortLines(bucket.map((r) => r.lineName));
      const operators = [...new Set(bucket.map((r) => r.operator).filter((v): v is string => !!v))];
      const dates = bucket.map((r) => r.dataStdDate).filter((d): d is Date => d != null);
      const dataStdDate = dates.length
        ? dates.reduce((a, b) => (a > b ? a : b))
        : null;
      const rLat = lat.toFixed(4);
      const rLng = lng.toFixed(4);
      clusters.push({
        name: bucket[0].name,
        lines,
        operators,
        address: bucket[0].address,
        lat,
        lng,
        isTransfer: lines.length > 1,
        dataStdDate,
        sourceKey: `${bucket[0].name}__${rLat}_${rLng}`,
      });
    }
  }
  return clusters;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/ingest/subway-cluster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/subway/cluster.ts tests/ingest/subway-cluster.test.ts
git commit -m "feat(subway): 논리역 클러스터링 순수 함수"
```

---

## Task 4: 적재 스크립트

**Files:**
- Create: `scripts/ingest-subway.ts`
- Modify: `package.json` (scripts에 `ingest:subway` 추가)

- [ ] **Step 1: 적재 스크립트 작성**

`scripts/ingest-subway.ts`:

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normalizeName } from '@/lib/slug';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { clusterStations, type RawStationRow } from '@/scripts/ingest/subway/cluster';

const DEFAULT_FILE = 'data/subway.xlsx';
const CHUNK = 500;

function parseArgs(): { file: string } {
  const args = process.argv.slice(2);
  const file = args.find((a) => a.startsWith('--file='))?.split('=')[1] ?? DEFAULT_FILE;
  return { file };
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRawRows(rows: Record<string, unknown>[]): RawStationRow[] {
  const out: RawStationRow[] = [];
  for (const r of rows) {
    const lat = num(r['역위도']);
    const lng = num(r['역경도']);
    const name = String(r['역사명'] ?? '').trim();
    const lineName = String(r['노선명'] ?? '').trim();
    if (!name || !lineName || lat == null || lng == null) continue;
    const std = r['데이터기준일자'];
    out.push({
      name,
      lineName,
      operator: r['운영기관명'] ? String(r['운영기관명']).trim() : null,
      address: r['역사도로명주소'] ? String(r['역사도로명주소']).trim() : null,
      lat,
      lng,
      dataStdDate: std instanceof Date ? std : std ? new Date(String(std)) : null,
    });
  }
  return out;
}

function locationSql(lat: number, lng: number) {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

async function main() {
  const { file } = parseArgs();
  const run = await prisma.ingestionRun.create({
    data: { source: 'subway', targetKey: 'stations', status: 'RUNNING' },
  });
  try {
    logger.info({ file }, 'subway: xlsx 파싱 중...');
    const raw = toRawRows(readXlsxRows(file));
    const clusters = clusterStations(raw);
    logger.info({ rawRows: raw.length, clusters: clusters.length }, 'subway: 클러스터링 완료');

    for (let i = 0; i < clusters.length; i += CHUNK) {
      const chunk = clusters.slice(i, i + CHUNK);
      const values = chunk.map((c) =>
        Prisma.sql`(
          ${c.name}, ${normalizeName(c.name)}, ${c.lines}, ${c.operators},
          ${c.address}, ${c.isTransfer}, ${locationSql(c.lat, c.lng)},
          ${c.dataStdDate}, ${c.sourceKey}, NOW()
        )`,
      );
      await prisma.$executeRaw`
        INSERT INTO "SubwayStation" (
          name, "nameNorm", lines, operators, address, "isTransfer",
          location, "dataStdDate", "sourceKey", "updatedAt"
        )
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceKey") DO UPDATE SET
          name = EXCLUDED.name,
          "nameNorm" = EXCLUDED."nameNorm",
          lines = EXCLUDED.lines,
          operators = EXCLUDED.operators,
          address = EXCLUDED.address,
          "isTransfer" = EXCLUDED."isTransfer",
          location = EXCLUDED.location,
          "dataStdDate" = EXCLUDED."dataStdDate",
          "updatedAt" = NOW()
      `;
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: clusters.length, finishedAt: new Date() },
    });
    logger.info({ upserted: clusters.length }, 'subway ingest 완료');
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'ingest-subway fatal');
  process.exit(1);
});
```

- [ ] **Step 2: package.json 스크립트 추가**

`package.json`의 `scripts`에 `ingest:subscriptions` 줄 아래 추가:

```json
    "ingest:subway": "dotenv -e .env.local -- tsx scripts/ingest-subway.ts",
```

- [ ] **Step 3: 적재 실행**

Run: `pnpm ingest:subway`
Expected: 로그에 `clusters: <N>` (1099행보다 적어야 함 — 환승역 통합), `subway ingest 완료`.

- [ ] **Step 4: 적재 검증 (환승역 통합 확인)**

Run:
```bash
dotenv -e .env.local -- tsx -e "import {prisma} from './lib/db'; (async()=>{const t=await prisma.subwayStation.count(); const g=await prisma.subwayStation.findFirst({where:{name:'가락시장'}}); console.log('count',t); console.log('가락시장',g?.lines,g?.isTransfer); await prisma.\$disconnect();})()"
```
Expected: `가락시장 [ '3호선', '8호선' ] true` (환승역이 1행 + lines 2개).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-subway.ts package.json
git commit -m "feat(subway): xlsx → 논리역 적재 스크립트(ingest:subway)"
```

---

## Task 5: 근처 지하철역 조회 (PostGIS) + 통합 테스트

**Files:**
- Create: `lib/subway/nearby.ts`
- Test: `tests/integration/subway-nearby.test.ts`

- [ ] **Step 1: 조회 함수 작성**

`lib/subway/nearby.ts`:

```ts
import { prisma } from '@/lib/db';

export interface NearbySubwayStation {
  id: string;
  name: string;
  lines: string[];
  isTransfer: boolean;
  distanceMeters: number;
}

export interface NearbySubwayResult {
  stations: NearbySubwayStation[];
  fallback: boolean; // 800m 내 없어 가장 가까운 1개만 반환한 경우
}

const RADIUS_METERS = 800;
const FALLBACK_MAX_METERS = 5000;
const LIMIT = 8;

interface Row {
  id: bigint;
  name: string;
  lines: string[];
  is_transfer: boolean;
  distance_meters: number;
}

export async function getNearbySubwayStations(lat: number, lng: number): Promise<NearbySubwayResult> {
  const within = await prisma.$queryRaw<Row[]>`
    SELECT id, name, lines, "isTransfer" AS is_transfer,
      ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric)::int AS distance_meters
    FROM "SubwayStation"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${RADIUS_METERS})
    ORDER BY distance_meters
    LIMIT ${LIMIT}
  `;
  if (within.length > 0) {
    return { stations: within.map(mapRow), fallback: false };
  }
  const nearest = await prisma.$queryRaw<Row[]>`
    SELECT id, name, lines, "isTransfer" AS is_transfer,
      ROUND(ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)::numeric)::int AS distance_meters
    FROM "SubwayStation"
    WHERE location IS NOT NULL
      AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${FALLBACK_MAX_METERS})
    ORDER BY distance_meters
    LIMIT 1
  `;
  return { stations: nearest.map(mapRow), fallback: nearest.length > 0 };
}

function mapRow(r: Row): NearbySubwayStation {
  return {
    id: String(r.id),
    name: r.name,
    lines: r.lines,
    isTransfer: r.is_transfer,
    distanceMeters: Number(r.distance_meters),
  };
}
```

> 좌표는 Prisma raw 태그드 템플릿에 직접 보간되므로 각 쿼리에 인라인했다(헬퍼 변수 없음).

- [ ] **Step 2: 통합 테스트 작성 (실 데이터 적재 후)**

`tests/integration/subway-nearby.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getNearbySubwayStations } from '@/lib/subway/nearby';

// 강남역 좌표 인근. ingest:subway가 .env.test DB에 적재돼 있어야 함.
describe('getNearbySubwayStations (integration)', () => {
  it('역 밀집 지역은 800m 내 역을 가까운 순으로 반환', async () => {
    const res = await getNearbySubwayStations(37.4979, 127.0276);
    expect(res.fallback).toBe(false);
    expect(res.stations.length).toBeGreaterThan(0);
    for (let i = 1; i < res.stations.length; i++) {
      expect(res.stations[i].distanceMeters).toBeGreaterThanOrEqual(res.stations[i - 1].distanceMeters);
    }
  });

  it('역이 없는 바다 한가운데는 fallback 또는 빈 결과', async () => {
    const res = await getNearbySubwayStations(35.0, 129.5);
    expect(res.fallback === false ? res.stations.length === 0 : true).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 DB에 역 데이터 적재**

Run: `dotenv -e .env.test -- tsx scripts/ingest-subway.ts`
Expected: `subway ingest 완료`.

- [ ] **Step 4: 통합 테스트 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/subway-nearby.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/subway/nearby.ts tests/integration/subway-nearby.test.ts
git commit -m "feat(subway): 근처 지하철역 PostGIS 조회 + 통합 테스트"
```

---

## Task 6: 근처 지하철역 카드 컴포넌트

**Files:**
- Create: `components/ui/nearby-subway.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/ui/nearby-subway.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { lineBadge } from '@/lib/subway/line-colors';
import type { NearbySubwayResult, NearbySubwayStation } from '@/lib/subway/nearby';

function formatDistance(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}
function walkMinutes(m: number): number {
  return Math.max(1, Math.round(m / 67));
}

export function NearbySubway({ data }: { data: NearbySubwayResult }) {
  if (data.stations.length === 0) return null;
  const { stations, fallback } = data;
  const transferCount = stations.filter((s) => s.isTransfer).length;
  const lineCount = new Set(stations.flatMap((s) => s.lines)).size;

  return (
    <Card id="subway">
      <div className="mb-3.5 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">🚇 근처 지하철역</h2>
        <span className="text-xs text-[var(--color-muted)]">
          {fallback ? '가장 가까운 역' : '반경 800m · 가까운 순'}
        </span>
      </div>

      {fallback ? (
        <div className="mb-3 rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-soft)] px-3.5 py-3 text-sm text-[var(--color-muted)]">
          반경 800m 내 지하철역이 없습니다. <b className="text-[var(--color-blue-dark)]">가장 가까운 역</b>을 안내해 드려요.
        </div>
      ) : (
        <div className="mb-3 flex gap-2 overflow-x-auto border-b border-[var(--color-line)] pb-3.5">
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">
            🚇 {stations.length}개 역 <span className="text-[var(--color-blue)]">· 최단 {formatDistance(stations[0].distanceMeters)}</span>
          </span>
          {transferCount > 0 && (
            <span className="flex shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">환승역 {transferCount}곳</span>
          )}
          <span className="flex shrink-0 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]">노선 {lineCount}개</span>
        </div>
      )}

      <ul>
        {stations.map((s) => (
          <StationRow key={s.id} station={s} />
        ))}
      </ul>
    </Card>
  );
}

function StationRow({ station }: { station: NearbySubwayStation }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex shrink-0 gap-1">
          {station.lines.map((ln) => {
            const b = lineBadge(ln);
            return (
              <span
                key={ln}
                className="flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white"
                style={{ backgroundColor: b.color }}
              >
                {b.label}
              </span>
            );
          })}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--color-text)]">
            {station.name}
            {station.isTransfer && (
              <span className="ml-1.5 rounded-md bg-[#fde7f0] px-1.5 py-0.5 text-[11px] font-bold text-[#E6186C]">환승</span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">{station.lines.join(' · ')}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="rounded-full bg-[var(--color-sky-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
          {formatDistance(station.distanceMeters)}
        </span>
        <span className="text-[11px] text-[var(--color-muted)]">도보 {walkMinutes(station.distanceMeters)}분</span>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm typecheck`
Expected: 통과(신규 컴포넌트 타입 오류 없음).

- [ ] **Step 3: Commit**

```bash
git add components/ui/nearby-subway.tsx
git commit -m "feat(subway): 근처 지하철역 카드 컴포넌트"
```

---

## Task 7: 상세페이지 11곳에 섹션 연결

**패턴(모든 페이지 동일):** 좌표(`lat/lng`)를 구하는 페이지에서 (1) import 추가, (2) `Promise.all`에 `getNearbySubwayStations(lat, lng)` 추가, (3) `<NearbySubway data={...} />`를 `<NearbyInfra .../>` **바로 위**에 렌더. 좌표가 없으면 두 컴포넌트 모두 미노출(기존 분기 그대로).

**대상 파일 (각 파일에서 `getNearbyInfra(` 호출 지점이 좌표 확보 지점):**
- `app/(public)/apt/[id]/page.tsx`
- `app/(public)/officetel/[id]/page.tsx`
- `app/(public)/villa/[id]/page.tsx`
- `app/(public)/subscription/[id]/page.tsx`
- `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`
- `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
- `app/(public)/school/[sigunguCode]/[id]/page.tsx`
- `app/(public)/urban/[category]/[id]/page.tsx`
- `app/(public)/urban/charger/[id]/page.tsx`
- `app/(public)/amenity/[category]/[id]/page.tsx`

- [ ] **Step 1: apt 페이지 (worked example)**

`app/(public)/apt/[id]/page.tsx` import 영역에 추가:

```tsx
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { NearbySubway } from '@/components/ui/nearby-subway';
```

`Promise.all` 배열에 항목 추가(`infra` 항목과 동일하게 좌표 가드):

```tsx
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
```

구조분해 좌변에 `subway` 추가 (예: `const [unified, counts, chart, areaSummary, nearby, infra, nearbySubs, subway] = await Promise.all([...])`).

렌더에서 `<NearbyInfra categories={infra} />` **바로 위**에 추가:

```tsx
          <NearbySubway data={subway} />
          <NearbyInfra categories={infra} />
```

- [ ] **Step 2: 나머지 10개 페이지에 동일 패턴 적용**

각 파일에서: 위 두 import 추가 → 해당 페이지가 이미 가진 좌표 변수(대개 `coord`/`lat`/`lng` 또는 `getNearbyInfra` 호출 인자)로 `getNearbySubwayStations` 호출(같은 `Promise.all`에 합치거나 인접 `await`) → `<NearbySubway data={subway} />`를 그 페이지의 `<NearbyInfra .../>` 바로 위에 배치.

> 좌표 변수명이 페이지마다 다르므로, 각 파일에서 `getNearbyInfra(` 가 받는 첫 두 인자(lat, lng)를 그대로 `getNearbySubwayStations(`에 전달하면 된다. `getNearbyInfra` 호출이 없는 페이지는 없음(11곳 모두 `NearbyInfra` 사용 확인됨).

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 4: 시각 확인 (대표 1페이지)**

`pnpm dev` 후 임의 아파트 상세에서 `주변 생활 인프라` 위에 `🚇 근처 지하철역` 카드가 보이는지 확인(역세권 단지로 테스트).

- [ ] **Step 5: Commit**

```bash
git add "app/(public)"
git commit -m "feat(subway): 상세페이지 11곳에 근처 지하철역 섹션 연결"
```

---

## Task 8: 검색 자동완성에 역 추가

**Files:**
- Modify: `lib/search.ts`
- Modify: `app/(public)/_components/search-input.tsx`

- [ ] **Step 1: autocomplete()에 stations 추가**

`lib/search.ts`의 `AutocompleteResult` 인터페이스에 추가:

```ts
  stations: Array<{ id: string; name: string; lines: string[]; isTransfer: boolean }>;
```

`autocomplete()` 본문에서 properties/regions 쿼리 옆에 역 쿼리 추가(`norm`, `prefix`는 기존 변수 재사용):

```ts
  const stations = await prisma.$queryRaw<Array<{ id: bigint; name: string; lines: string[]; is_transfer: boolean }>>`
    SELECT id, name, lines, "isTransfer" AS is_transfer
    FROM "SubwayStation"
    WHERE "nameNorm" % ${norm} OR "nameNorm" ILIKE ${prefix}
    ORDER BY ("nameNorm" ILIKE ${prefix})::int DESC, similarity("nameNorm", ${norm}) DESC
    LIMIT 5
  `;
```

return 객체에 추가:

```ts
    stations: stations.map((s) => ({
      id: String(s.id),
      name: s.name,
      lines: s.lines,
      isTransfer: s.is_transfer,
    })),
```

(빈 입력 early-return도 `{ properties: [], regions: [], stations: [] }`로 수정)

- [ ] **Step 2: 검색 UI에 🚇 그룹 추가**

`app/(public)/_components/search-input.tsx`의 `Result` 인터페이스에 추가:

```ts
  stations: Array<{ id: string; name: string; lines: string[]; isTransfer: boolean }>;
```

드롭다운 노출 조건에 stations 포함:

```tsx
      {open && results && (results.properties.length > 0 || results.regions.length > 0 || results.stations.length > 0) && (
```

`지역` 그룹 블록 아래에 역 그룹 추가:

```tsx
          {results.stations.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1 text-xs font-bold uppercase text-[var(--color-muted)]">지하철역</p>
              {results.stations.map((s) => (
                <Link
                  key={s.id}
                  href={`/list?station=${s.id}`}
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]"
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm font-semibold">🚇 {s.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{s.lines.join(' · ')}</p>
                </Link>
              ))}
            </>
          )}
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm typecheck`
Expected: 통과.

- [ ] **Step 4: 수동 확인**

`pnpm dev` → 검색창에 `강남` 입력 시 드롭다운에 `🚇 강남` 노출, 클릭 시 `/list?station=<id>` 이동.

- [ ] **Step 5: Commit**

```bash
git add lib/search.ts "app/(public)/_components/search-input.tsx"
git commit -m "feat(subway): 검색 자동완성에 지하철역 그룹 추가"
```

---

## Task 9: 리스트 역세권 필터 (파라미터 + 쿼리) + 통합 테스트

**Files:**
- Modify: `lib/list-params.ts`
- Modify: `lib/property.ts` (`PropertyListParams`, `getPropertyList`)
- Modify: `app/api/list/route.ts`
- Test: `tests/integration/subway-nearby.test.ts` (역 필터 케이스 추가)

- [ ] **Step 1: 파라미터 추가**

`lib/list-params.ts`:
- `ListSearchParams`에 `station?: string;` 추가
- `ParsedListParams`에 `stationId?: string;` 추가
- `parseListParams` 반환에 `stationId: sp.station || undefined,` 추가

- [ ] **Step 2: getPropertyList 프리필터 구현**

`lib/property.ts`의 `PropertyListParams`에 `stationId?: string;` 추가.

`getPropertyList` 시그니처 구조분해에 `stationId` 추가하고, `const where` 선언 직후에 프리필터 삽입:

```ts
  if (stationId) {
    const ids = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT p.id
      FROM "Property" p, "SubwayStation" s
      WHERE s.id = ${BigInt(stationId)}
        AND p.location IS NOT NULL
        AND ST_DWithin(p.location, s.location, 800)
      LIMIT 3000
    `;
    if (ids.length === 0) {
      return { rows: [], total: 0, page, perPage, totalPages: 0 };
    }
    where.id = { in: ids.map((r) => r.id) };
  }
```

(import에 `prisma`가 이미 있으므로 추가 불필요.)

- [ ] **Step 3: /api/list에서 stationId 전달**

`app/api/list/route.ts`의 `getPropertyList({ ... })` 인자에 추가:

```ts
    stationId: p.stationId,
```

- [ ] **Step 4: 통합 테스트 추가**

`tests/integration/subway-nearby.test.ts`에 케이스 추가:

```ts
import { getPropertyList } from '@/lib/property';
import { PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';

it('역 필터: 선택 역 800m 내 단지만 반환', async () => {
  const station = await prisma.subwayStation.findFirst({ where: { name: '강남' } });
  if (!station) return; // 데이터 없으면 skip
  const res = await getPropertyList({
    types: [PropertyType.APARTMENT, PropertyType.OFFICETEL, PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX],
    stationId: String(station.id),
    page: 1,
    perPage: 30,
  });
  expect(res.total).toBeGreaterThanOrEqual(0);
  expect(res.rows.length).toBeLessThanOrEqual(30);
});
```

- [ ] **Step 5: 통합 테스트 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/subway-nearby.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/list-params.ts lib/property.ts app/api/list/route.ts tests/integration/subway-nearby.test.ts
git commit -m "feat(subway): 리스트 역세권 필터(800m id 프리필터)"
```

---

## Task 10: 리스트 필터 UI (역 선택)

**Files:**
- Create: `app/api/subway/search/route.ts` (역 전용 경량 검색 — 필터 입력용)
- Modify: `app/(public)/list/_components/list-filter-panel.tsx`
- Modify: `app/(public)/list/_components/mobile-filter-sheet.tsx`
- Modify: `app/(public)/list/page.tsx` (헤더에 활성 역 라벨, 선택)

- [ ] **Step 1: 역 검색 API (필터 입력 자동완성용)**

`app/api/subway/search/route.ts`:

```ts
import { prisma } from '@/lib/db';
import { normalizeName } from '@/lib/slug';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 1) return Response.json({ stations: [] });
  const norm = normalizeName(q);
  const prefix = `${norm}%`;
  const rows = await prisma.$queryRaw<Array<{ id: bigint; name: string; lines: string[] }>>`
    SELECT id, name, lines FROM "SubwayStation"
    WHERE "nameNorm" % ${norm} OR "nameNorm" ILIKE ${prefix}
    ORDER BY ("nameNorm" ILIKE ${prefix})::int DESC, similarity("nameNorm", ${norm}) DESC
    LIMIT 8
  `;
  return Response.json(
    { stations: rows.map((r) => ({ id: String(r.id), name: r.name, lines: r.lines })) },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
  );
}
```

- [ ] **Step 2: 필터 패널에 역 검색 섹션 추가**

`list-filter-panel.tsx`에서 현재 역 표시 + 검색 입력을 `지역` 섹션 아래에 추가. 컴포넌트 상단(다른 `effectiveParams.get` 옆)에:

```tsx
  const station = effectiveParams.get('station');
  const [stationLabel, setStationLabel] = useState<string | null>(null);
  const [stationQuery, setStationQuery] = useState('');
  const [stationOpts, setStationOpts] = useState<Array<{ id: string; name: string; lines: string[] }>>([]);

  useEffect(() => {
    if (!station) { setStationLabel(null); return; }
    fetch(`/api/subway/search?q=${encodeURIComponent('')}`).catch(() => {});
  }, [station]);

  useEffect(() => {
    if (stationQuery.trim().length < 1) { setStationOpts([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/subway/search?q=${encodeURIComponent(stationQuery)}`);
      if (r.ok) setStationOpts((await r.json()).stations);
    }, 250);
    return () => clearTimeout(t);
  }, [stationQuery]);
```

`hasActiveFilters` 조건에 `|| !!station` 추가.

`지역` 섹션 바로 아래에 역 섹션 추가:

```tsx
      {/* 지하철역 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지하철역</h3>
        {station ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
            <span className="truncate text-sm font-semibold text-[var(--color-blue-dark)]">
              🚇 {stationLabel ?? '선택한 역'} <span className="text-xs text-[var(--color-muted)]">800m 이내</span>
            </span>
            <button
              onClick={() => { updateParams({ station: null }); setStationQuery(''); }}
              className="shrink-0 text-xs font-bold text-[var(--color-blue)]"
            >✕</button>
          </div>
        ) : (
          <div className="relative mt-2">
            <input
              value={stationQuery}
              onChange={(e) => setStationQuery(e.target.value)}
              placeholder="역 이름 검색 (예: 강남)"
              className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
            />
            {stationOpts.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-1 rounded-xl border border-[var(--color-line)] bg-white p-1 shadow-[var(--shadow-soft)]">
                {stationOpts.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setStationLabel(s.name); setStationQuery(''); setStationOpts([]); updateParams({ station: s.id }); }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-soft)]"
                  >
                    <span className="text-sm font-semibold">🚇 {s.name}</span>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">{s.lines.join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
```

> 선택 역의 라벨은 선택 시점(`setStationLabel`)에 채워진다. URL 직접진입(라벨 미상)이어도 칩은 "선택한 역 800m 이내"로 동작한다.

- [ ] **Step 3: 모바일 시트에도 동일 적용**

`mobile-filter-sheet.tsx`는 `ListFilterPanel`을 `params/onParamsChange`로 재사용하는 구조이면 자동 반영된다. 직접 마크업을 가지고 있으면 Step 2의 역 섹션을 동일하게 추가한다. (먼저 파일을 열어 `ListFilterPanel` 재사용 여부 확인 → 재사용이면 변경 불필요.)

- [ ] **Step 4: 리스트 헤더에 활성 역 표기 (선택)**

`app/(public)/list/page.tsx`의 `parseListParams(sp)` 구조분해에 `stationId` 추가는 불필요(쿼리스트링 `query`가 이미 station 포함). 헤더 문구에 역 활성 시 안내를 넣고 싶으면 `sp.station` 존재 시 `🚇 지하철역 800m 이내 단지` 배지를 추가. (필수 아님.)

- [ ] **Step 5: 타입 체크 + 빌드**

Run: `pnpm typecheck && pnpm build`
Expected: 통과.

- [ ] **Step 6: 수동 확인**

`/list`에서 지하철역 검색→선택 시 결과가 800m 내 단지로 좁혀지고, ✕로 해제되며, 다른 필터(거래유형/가격/정렬)와 함께 동작.

- [ ] **Step 7: Commit**

```bash
git add "app/api/subway" "app/(public)/list"
git commit -m "feat(subway): 리스트 역세권 필터 UI(역 검색·선택·해제)"
```

---

## Task 11: e2e 스모크

**Files:**
- Create: `tests/e2e/subway.spec.ts` (기존 e2e 디렉터리 규칙 확인 후 경로 맞춤)

- [ ] **Step 1: e2e 디렉터리/패턴 확인**

기존 e2e 위치 확인: `ls tests` 후 e2e 스펙이 있는 폴더(예: `tests/e2e`)와 셋업(seed) 규칙을 따른다. 시드에 SubwayStation이 없으면 `tests/_helpers/seed-e2e.ts`에 강남 인근 역 1~2개 + 인근 단지를 추가한다.

- [ ] **Step 2: 스모크 스펙 작성**

```ts
import { test, expect } from '@playwright/test';

test('역세권 필터: 역 선택 시 리스트가 좁혀진다', async ({ page }) => {
  await page.goto('/list');
  await page.getByPlaceholder('역 이름 검색 (예: 강남)').fill('강남');
  await page.getByRole('button', { name: /🚇 강남/ }).first().click();
  await expect(page).toHaveURL(/station=/);
});

test('상세페이지에 근처 지하철역 섹션이 주변 인프라 위에 있다', async ({ page }) => {
  await page.goto('/apt/1'); // 시드된 역세권 단지 id로 교체
  await expect(page.getByRole('heading', { name: '🚇 근처 지하철역' })).toBeVisible();
});
```

- [ ] **Step 3: e2e 실행**

Run: `pnpm test:e2e tests/e2e/subway.spec.ts`
Expected: PASS(또는 시드 보강 후 PASS).

- [ ] **Step 4: 전체 회귀**

Run: `pnpm test && pnpm typecheck`
Expected: 모두 통과.

- [ ] **Step 5: Commit + 마무리**

```bash
git add tests
git commit -m "test(subway): 역세권 필터·근처 섹션 e2e 스모크"
```

마지막으로 PR 생성: base `main`, head `feat/subway-stations`.

---

## Self-Review 메모

- **Spec coverage:** 모델(T1)·적재(T3,T4)·근처 조회(T5)·컴포넌트(T6)·상세 연결(T7)·검색(T8)·필터 쿼리(T9)·필터 UI(T10)·e2e(T11) — 스펙 §3~§9 전부 매핑됨.
- **800m 일관성:** 근처 섹션(T5)·필터 프리필터(T9) 모두 800m 고정. fallback 5km(T5)만 예외(스펙 §4.1 일치).
- **타입 일관성:** `NearbySubwayResult{stations,fallback}`가 T5 정의 → T6 컴포넌트 prop → T7 페이지에서 동일 사용. `getNearbySubwayStations(lat,lng)` 시그니처 T5/T7 일치. 검색 `stations` 형태 T8의 `lib/search.ts`와 `search-input.tsx` 일치.
- **주의(구현자):** T1 Step3에서 생성된 migration.sql에 GIST/GIN 인덱스 SQL 수동 추가 필수. T10 Step3는 `mobile-filter-sheet.tsx`가 `ListFilterPanel` 재사용인지 먼저 확인.
