# Sitemap 인덱스 분할 + 검색엔진 등록 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 `/sitemap.xml`(5만 URL 한도 초과로 무효)을 Next.js `generateSitemaps()` 기반 sitemap 인덱스로 분할하고, 사이트 URL 정규화·소유권 인증 메타 태그를 추가해 GSC·네이버 서치어드바이저 등록이 가능한 상태로 만든다.

**Architecture:** 소스 정의(DB 의존)와 청킹 로직(순수 함수)을 분리한다. `lib/sitemap/manifest.ts`가 소스별 count를 받아 `Shard[]`를 만드는 순수 함수, `lib/sitemap/sources.ts`가 각 소스의 `count()`/`page()`를 제공하는 레지스트리, `app/sitemap.ts`가 `generateSitemaps()`로 인덱스를 자동 생성한다. 사이트 URL은 `lib/site.ts` 한 곳에서 정규화한다.

**Tech Stack:** Next.js 15.5 (App Router, MetadataRoute), Prisma + Supabase Postgres, Vitest, TypeScript, pnpm.

---

## File Structure

- **Create** `lib/site.ts` — `SITE_URL` 공통 상수(개행/공백/끝슬래시 정규화)
- **Create** `lib/sitemap/manifest.ts` — 순수 함수 `buildManifest(counts, chunkSize)`
- **Create** `lib/sitemap/static-entries.ts` — 기존 `STATIC_ENTRIES` 이관(SITE_URL 사용)
- **Create** `lib/sitemap/sources.ts` — 소스 레지스트리(`core` + 6개 DB 소스), `CHUNK_SIZE`, `loadCounts`, `SOURCE_MAP`, `SOURCE_ORDER`
- **Rewrite** `app/sitemap.ts` — `generateSitemaps()` + 기본 `sitemap({id})` + `STATIC_ENTRIES` 재export
- **Modify** `app/robots.ts` — `SITE_URL` 상수 사용
- **Modify** `app/layout.tsx` — `metadataBase`를 `SITE_URL`로 + verification 메타 태그
- **Modify** `.env.example` — 인증 토큰 env 키 추가
- **Create** `tests/lib/site.test.ts` — `SITE_URL` 정규화 테스트
- **Create** `tests/lib/sitemap-manifest.test.ts` — `buildManifest` 테스트
- **Keep** `tests/lib/sitemap.test.ts` — `STATIC_ENTRIES` 단언(재export로 import 경로 유지)

**핵심 정합성 규칙:** `School`/`Hospital`/`Pharmacy`는 `sigunguCode`가 nullable이라 URL(`/.../{sigunguCode}/{id}`)을 만들 수 없는 행이 있다. 이 소스들은 `count()`와 `page()` **양쪽 모두** `where: { sigunguCode: { not: null } }`를 적용해 수가 일치해야 한다. `Childcare`는 non-null, `SubscriptionNotice`는 sigunguCode 없음, `Property`는 `txCount12m > 0` 필터.

---

## Task 1: `lib/site.ts` — 사이트 URL 공통 상수

**Files:**
- Create: `lib/site.ts`
- Test: `tests/lib/site.test.ts`

운영에서 `NEXT_PUBLIC_SITE_URL` 값 끝에 개행(`\n`)이 섞여 모든 URL이 `https://imjangon.co.kr\n/...`로 깨진 사고가 있었다. env 읽기를 한 곳으로 모으고 정규화한다. 정규화 로직을 테스트 가능하게 별도 함수로 분리한다.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/site.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeSiteUrl } from '@/lib/site';

describe('normalizeSiteUrl', () => {
  it('끝 개행을 제거한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr\n')).toBe('https://imjangon.co.kr');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeSiteUrl('  https://imjangon.co.kr  ')).toBe('https://imjangon.co.kr');
  });

  it('끝 슬래시를 제거한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr/')).toBe('https://imjangon.co.kr');
    expect(normalizeSiteUrl('https://imjangon.co.kr///')).toBe('https://imjangon.co.kr');
  });

  it('정상 값은 그대로 유지한다', () => {
    expect(normalizeSiteUrl('https://imjangon.co.kr')).toBe('https://imjangon.co.kr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/site.test.ts`
Expected: FAIL — `normalizeSiteUrl` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/site.ts`:

```ts
/** env 값의 개행·공백·끝 슬래시를 제거해 안전한 origin으로 정규화한다. */
export function normalizeSiteUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** 사이트 origin (canonical/sitemap/robots 공통). 폴백은 운영 도메인. */
export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjangon.co.kr',
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/site.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/site.ts tests/lib/site.test.ts
git commit -m "feat(site): SITE_URL 공통 상수 + 정규화 (개행/공백/끝슬래시 제거)"
```

---

## Task 2: `lib/sitemap/manifest.ts` — 순수 청킹 함수

**Files:**
- Create: `lib/sitemap/manifest.ts`
- Test: `tests/lib/sitemap-manifest.test.ts`

소스별 count를 받아 `CHUNK_SIZE` 단위로 끊어 연속 `id`를 부여한 `Shard[]`를 만든다. DB 의존이 없는 순수 함수.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/sitemap-manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildManifest, type SourceCount } from '@/lib/sitemap/manifest';

const CHUNK = 10_000;

describe('buildManifest', () => {
  it('소스별 샤드 수 = ceil(count / chunkSize)', () => {
    const counts: SourceCount[] = [
      { key: 'core', count: 1500 },
      { key: 'property', count: 74_759 },
      { key: 'hospital', count: 79_562 },
    ];
    const shards = buildManifest(counts, CHUNK);
    expect(shards.filter((s) => s.key === 'core')).toHaveLength(1);
    expect(shards.filter((s) => s.key === 'property')).toHaveLength(8);
    expect(shards.filter((s) => s.key === 'hospital')).toHaveLength(8);
  });

  it('id가 0부터 연속이고 중복이 없다', () => {
    const shards = buildManifest(
      [{ key: 'a', count: 25_000 }, { key: 'b', count: 5_000 }],
      CHUNK,
    );
    expect(shards.map((s) => s.id)).toEqual([0, 1, 2, 3]);
  });

  it('모든 샤드의 limit이 chunkSize 이하다', () => {
    const shards = buildManifest([{ key: 'a', count: 25_001 }], CHUNK);
    expect(shards.every((s) => s.limit <= CHUNK)).toBe(true);
    expect(shards.map((s) => s.limit)).toEqual([10_000, 10_000, 5_001]);
  });

  it('offset/limit이 소스 범위를 겹침·누락 없이 분할한다', () => {
    const shards = buildManifest([{ key: 'a', count: 25_001 }], CHUNK);
    expect(shards.map((s) => s.offset)).toEqual([0, 10_000, 20_000]);
  });

  it('count가 0이면 샤드를 만들지 않는다', () => {
    const shards = buildManifest([{ key: 'a', count: 0 }, { key: 'b', count: 1 }], CHUNK);
    expect(shards).toEqual([{ id: 0, key: 'b', offset: 0, limit: 1 }]);
  });

  it('count가 chunkSize의 정확한 배수면 정확히 두 샤드로 나눈다', () => {
    const shards = buildManifest([{ key: 'a', count: 20_000 }], CHUNK);
    expect(shards).toHaveLength(2);
    expect(shards.map((s) => s.limit)).toEqual([10_000, 10_000]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/lib/sitemap-manifest.test.ts`
Expected: FAIL — module `@/lib/sitemap/manifest` not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/sitemap/manifest.ts`:

```ts
export interface SourceCount {
  key: string;
  count: number;
}

export interface Shard {
  id: number;
  key: string;
  offset: number;
  limit: number;
}

/**
 * 소스별 count를 chunkSize 단위로 끊어 연속 id를 부여한 샤드 목록을 만든다.
 * count가 0인 소스는 샤드를 만들지 않는다(빈 sitemap 노출 방지).
 */
export function buildManifest(counts: SourceCount[], chunkSize: number): Shard[] {
  const shards: Shard[] = [];
  let id = 0;
  for (const { key, count } of counts) {
    for (let offset = 0; offset < count; offset += chunkSize) {
      shards.push({ id: id++, key, offset, limit: Math.min(chunkSize, count - offset) });
    }
  }
  return shards;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/lib/sitemap-manifest.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sitemap/manifest.ts tests/lib/sitemap-manifest.test.ts
git commit -m "feat(sitemap): 순수 청킹 함수 buildManifest 추가"
```

---

## Task 3: `lib/sitemap/static-entries.ts` — STATIC_ENTRIES 이관

**Files:**
- Create: `lib/sitemap/static-entries.ts`
- Reference: 기존 `app/sitemap.ts:11-39` (STATIC_ENTRIES 원본)

기존 `STATIC_ENTRIES`를 별도 모듈로 이관한다(순환 import 방지 + core 소스에서 재사용). `SITE` 지역 상수 대신 `SITE_URL`을 쓴다. 내용은 기존과 동일.

- [ ] **Step 1: Create the module**

Create `lib/sitemap/static-entries.ts`:

```ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AMENITY_SLUGS } from '@/lib/amenity/category';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

export const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE_URL}/apt`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/officetel`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/villa`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/region`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/life`, changeFrequency: 'weekly', priority: 0.8 },
  ...LIFE_GROUPS.map((g) => ({
    url: `${SITE_URL}/life/${g.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  })),
  { url: `${SITE_URL}/school`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${SITE_URL}/school/regions`, changeFrequency: 'weekly', priority: 0.7 },
  ...AMENITY_SLUGS.map((slug) => ({
    url: `${SITE_URL}/amenity/${slug}?sido=${encodeURIComponent('서울')}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  })),
  { url: `${SITE_URL}/urban/parking`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/urban/parking?sido=${encodeURIComponent('서울')}`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/subscription`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/data-source`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE_URL}/sitemap`, changeFrequency: 'monthly', priority: 0.3 },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음 (이 파일 관련). 기존 `app/sitemap.ts`는 아직 자체 STATIC_ENTRIES를 가지고 있어 중복 정의는 없음(다른 파일).

- [ ] **Step 3: Commit**

```bash
git add lib/sitemap/static-entries.ts
git commit -m "refactor(sitemap): STATIC_ENTRIES를 lib/sitemap로 이관 (SITE_URL 사용)"
```

---

## Task 4: `lib/sitemap/sources.ts` — 소스 레지스트리

**Files:**
- Create: `lib/sitemap/sources.ts`

각 소스의 `count()`/`page(offset, limit)`를 정의한다. `core`는 정적+허브(region/school/amenity 동적) 엔트리를 슬라이스로 제공, 6개 DB 소스는 페이지네이션. DB 오류 시 `page()`는 `[]`, `core`는 `STATIC_ENTRIES`로 폴백.

- [ ] **Step 1: Create the registry**

Create `lib/sitemap/sources.ts`:

```ts
import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/site';
import { getAllSigungus } from '@/lib/region';
import { AMENITY_CATEGORIES, AMENITY_SLUGS } from '@/lib/amenity/category';
import { STATIC_ENTRIES } from './static-entries';

export const CHUNK_SIZE = 10_000;

export interface SitemapSource {
  key: string;
  count: () => Promise<number>;
  page: (offset: number, limit: number) => Promise<MetadataRoute.Sitemap>;
}

/** Property.propertyType → URL prefix */
function propertyPrefix(type: string): string {
  if (type === 'APARTMENT') return 'apt';
  if (type === 'OFFICETEL') return 'officetel';
  return 'villa';
}

/** core: 정적 + region/school/amenity 허브 동적 엔트리. DB 오류 시 STATIC_ENTRIES로 폴백. */
async function coreEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const [sigungus, schoolSigungus, amenityCountsBySlug] = await Promise.all([
      prisma.region.findMany({
        where: { level: 2, isAbolished: false },
        select: { code: true },
      }),
      getAllSigungus().catch(() => []),
      Promise.all(
        AMENITY_SLUGS.map(async (slug) => ({
          slug,
          counts: await AMENITY_CATEGORIES[slug]
            .getCountsBySigungu()
            .catch(() => new Map<string, number>()),
        })),
      ),
    ]);

    const entries: MetadataRoute.Sitemap = [...STATIC_ENTRIES];

    for (const r of sigungus) {
      entries.push({
        url: `${SITE_URL}/region/${r.code.slice(0, 5)}`,
        changeFrequency: 'daily',
        priority: 0.7,
      });
    }
    for (const s of schoolSigungus) {
      entries.push({
        url: `${SITE_URL}/school/${s.sigunguCode}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
    for (const { slug, counts } of amenityCountsBySlug) {
      for (const [sigunguCode, count] of counts) {
        if (count <= 0) continue;
        entries.push({
          url: `${SITE_URL}/amenity/${slug}?region=${sigunguCode}`,
          changeFrequency: 'weekly',
          priority: 0.6,
        });
      }
    }
    return entries;
  } catch (err) {
    console.error('sitemap core: DB unavailable, static entries only', err);
    return STATIC_ENTRIES;
  }
}

/** DB 페이지네이션 소스 공통 헬퍼. page()는 오류 시 [] 반환. */
function dbSource<T>(opts: {
  key: string;
  count: () => Promise<number>;
  findMany: (skip: number, take: number) => Promise<T[]>;
  toEntry: (row: T) => MetadataRoute.Sitemap[number];
}): SitemapSource {
  return {
    key: opts.key,
    count: opts.count,
    page: async (offset, limit) => {
      try {
        const rows = await opts.findMany(offset, limit);
        return rows.map(opts.toEntry);
      } catch (err) {
        console.error(`sitemap ${opts.key}: page query failed`, err);
        return [];
      }
    },
  };
}

const core: SitemapSource = {
  key: 'core',
  count: async () => (await coreEntries()).length,
  page: async (offset, limit) => (await coreEntries()).slice(offset, offset + limit),
};

const property = dbSource({
  key: 'property',
  count: () => prisma.property.count({ where: { txCount12m: { gt: 0 } } }),
  findMany: (skip, take) =>
    prisma.property.findMany({
      where: { txCount12m: { gt: 0 } },
      select: { id: true, propertyType: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/${propertyPrefix(p.propertyType)}/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const subscription = dbSource({
  key: 'subscription',
  count: () => prisma.subscriptionNotice.count(),
  findMany: (skip, take) =>
    prisma.subscriptionNotice.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (s) => ({
    url: `${SITE_URL}/subscription/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }),
});

// School/Hospital/Pharmacy: sigunguCode nullable → count·findMany 모두 not-null 필터로 일치시킨다.
const school = dbSource({
  key: 'school',
  count: () => prisma.school.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.school.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (s) => ({
    url: `${SITE_URL}/school/${s.sigunguCode}/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const childcare = dbSource({
  key: 'childcare',
  count: () => prisma.childcare.count(),
  findMany: (skip, take) =>
    prisma.childcare.findMany({
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (c) => ({
    url: `${SITE_URL}/childcare/${c.sigunguCode}/${c.id}`,
    lastModified: c.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const pharmacy = dbSource({
  key: 'pharmacy',
  count: () => prisma.pharmacy.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.pharmacy.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (p) => ({
    url: `${SITE_URL}/medical/pharmacy/${p.sigunguCode}/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

const hospital = dbSource({
  key: 'hospital',
  count: () => prisma.hospital.count({ where: { sigunguCode: { not: null } } }),
  findMany: (skip, take) =>
    prisma.hospital.findMany({
      where: { sigunguCode: { not: null } },
      select: { id: true, sigunguCode: true, updatedAt: true },
      orderBy: { id: 'asc' },
      skip,
      take,
    }),
  toEntry: (h) => ({
    url: `${SITE_URL}/medical/hospital/${h.sigunguCode}/${h.id}`,
    lastModified: h.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }),
});

/** 샤드 id 부여 순서(고정). 변경 시 기존 인덱스 매핑이 바뀌므로 끝에만 추가할 것. */
export const SOURCE_ORDER: SitemapSource[] = [
  core,
  property,
  subscription,
  school,
  childcare,
  pharmacy,
  hospital,
];

export const SOURCE_MAP: Record<string, SitemapSource> = Object.fromEntries(
  SOURCE_ORDER.map((s) => [s.key, s]),
);

/** 모든 소스의 count를 SOURCE_ORDER 순서로 조회한다. */
export async function loadCounts() {
  return Promise.all(
    SOURCE_ORDER.map(async (s) => ({ key: s.key, count: await s.count() })),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음. (`p.id`는 BigInt지만 템플릿 리터럴에서 문자열로 강제됨. `s.sigunguCode`는 not-null 필터 덕분에 string으로 좁혀지지 않을 수 있으니, 타입 에러가 나면 `toEntry`에서 `${s.sigunguCode!}`로 단언.)

> 참고: Prisma `findMany`의 `where: { sigunguCode: { not: null } }`는 타입을 자동으로 non-null로 좁히지 않는다. 만약 `tsc`가 `string | null` 때문에 불평하면 해당 `toEntry`의 `${s.sigunguCode}`를 `${s.sigunguCode!}`로 바꾼다(런타임은 필터로 보장됨).

- [ ] **Step 3: Commit**

```bash
git add lib/sitemap/sources.ts
git commit -m "feat(sitemap): 소스 레지스트리(core + 6 DB 소스) 추가"
```

---

## Task 5: `app/sitemap.ts` — generateSitemaps 재작성

**Files:**
- Rewrite: `app/sitemap.ts`

기존 단일 `sitemap()`을 `generateSitemaps()` + 샤드별 `sitemap({id})`로 교체한다. `STATIC_ENTRIES`는 Task 3에서 `lib/sitemap/static-entries.ts`로 이미 옮겼으므로, 기존 테스트의 import 경로를 그쪽으로 갱신한다(Next 라우트 파일에 비표준 named export를 두지 않기 위함).

- [ ] **Step 1: Rewrite the file**

Replace entire contents of `app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next';
import { buildManifest } from '@/lib/sitemap/manifest';
import { CHUNK_SIZE, SOURCE_MAP, loadCounts } from '@/lib/sitemap/sources';

export const revalidate = 86_400;

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const counts = await loadCounts();
  return buildManifest(counts, CHUNK_SIZE).map((s) => ({ id: s.id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const counts = await loadCounts();
  const shard = buildManifest(counts, CHUNK_SIZE).find((s) => s.id === id);
  if (!shard) return [];
  const source = SOURCE_MAP[shard.key];
  if (!source) return [];
  return source.page(shard.offset, shard.limit);
}
```

- [ ] **Step 2: Update the existing test's import path**

In `tests/lib/sitemap.test.ts`, change the import line:

기존:
```ts
import { STATIC_ENTRIES } from '@/app/sitemap';
```
변경 후:
```ts
import { STATIC_ENTRIES } from '@/lib/sitemap/static-entries';
```

Run: `pnpm exec vitest run tests/lib/sitemap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts tests/lib/sitemap.test.ts
git commit -m "feat(sitemap): generateSitemaps 기반 인덱스 분할로 전환"
```

---

## Task 6: `app/robots.ts` — SITE_URL 사용

**Files:**
- Modify: `app/robots.ts`

지역 `SITE` 상수를 `SITE_URL`로 교체한다. 규칙 구조는 동일.

- [ ] **Step 1: Edit the file**

Replace the top of `app/robots.ts` — remove the local `SITE` constant and import `SITE_URL`:

기존:
```ts
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

export default function robots(): MetadataRoute.Robots {
```

변경 후:
```ts
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
```

그리고 함수 마지막의 `sitemap` 줄을 교체:

기존:
```ts
    sitemap: `${SITE}/sitemap.xml`,
```

변경 후:
```ts
    sitemap: `${SITE_URL}/sitemap.xml`,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음 (`SITE` 미사용 변수 경고도 없음 — 제거했으므로).

- [ ] **Step 3: Commit**

```bash
git add app/robots.ts
git commit -m "refactor(robots): SITE_URL 공통 상수 사용"
```

---

## Task 7: `app/layout.tsx` + `.env.example` — 인증 메타 태그

**Files:**
- Modify: `app/layout.tsx`
- Modify: `.env.example`

`metadataBase`를 `SITE_URL`로 바꾸고, GSC/네이버 소유권 인증 메타 태그를 env 주입으로 추가한다. 토큰이 없으면 태그가 출력되지 않는다.

- [ ] **Step 1: Edit `app/layout.tsx`**

`app/layout.tsx` 상단 import에 추가:
```ts
import { SITE_URL } from '@/lib/site';
```

`metadata` 객체에서 `metadataBase` 줄 교체:

기존:
```ts
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com'),
```

변경 후:
```ts
  metadataBase: new URL(SITE_URL),
```

그리고 `robots: { index: true, follow: true },` 바로 다음 줄에 `verification` 필드 추가:

```ts
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? { 'naver-site-verification': process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION }
      : {},
  },
```

- [ ] **Step 2: Edit `.env.example`**

`.env.example` 끝에 키 추가(값 비움):

```
# 검색엔진 소유권 인증 (콘솔에서 발급한 토큰)
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
NEXT_PUBLIC_NAVER_SITE_VERIFICATION=
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx .env.example
git commit -m "feat(seo): GSC/네이버 소유권 인증 메타 태그 + metadataBase SITE_URL화"
```

---

## Task 8: 전체 검증 (빌드 + 런타임)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm test:unit`
Expected: 전부 PASS (신규 site/manifest + 기존 sitemap 포함).

- [ ] **Step 2: Lint + Typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 dev에서 sitemap 인덱스 확인**

`.env.test`는 로컬 docker DB라 데이터가 적으므로, **운영 데이터로 보려면 `.env.local`로** dev를 띄운다(읽기 전용 조회만 발생):

Run (백그라운드): `pnpm dev`
그 다음:
```bash
curl -s http://localhost:3000/sitemap.xml | head -c 600
```
Expected: `<sitemapindex>`와 `<sitemap><loc>...//sitemap/0.xml</loc>...` 형태. (운영 데이터 기준 0~25번 샤드)

- [ ] **Step 4: 개별 샤드 + URL 형식 확인**

```bash
curl -s http://localhost:3000/sitemap/1.xml | head -c 400
curl -s "http://localhost:3000/sitemap/1.xml" | grep -c "<loc>"
```
Expected:
- 유효한 `<urlset>`.
- `<loc>`이 개행 없이 `http://localhost:3000/...`(또는 SITE_URL) 형태.
- URL 수가 10,000 이하.
- 매물/병원 등 상세 경로(`/apt/123`, `/medical/hospital/11110/456`)가 보임.

- [ ] **Step 5: dev 서버 종료**

백그라운드 dev 프로세스를 종료한다.

- [ ] **Step 6: 최종 빌드 확인**

Run: `pnpm build`
Expected: 빌드 성공. `app/sitemap` 라우트가 에러 없이 생성됨.

- [ ] **Step 7: 최종 커밋(있으면)**

검증 중 수정이 있었다면 커밋. 없으면 생략.

---

## 배포 후 수동 작업 (코드 외, 본인 콘솔)

플랜 구현과 별개로 등록 완료를 위해 필요:

1. Vercel env에 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` 설정(값 끝 개행 주의) 후 재배포.
2. GSC에 `https://imjangon.co.kr` 속성 추가 → sitemap `sitemap.xml` 제출.
3. 네이버 서치어드바이저에 사이트 등록 → 사이트맵 제출.
4. (권장) `...vercel.app` → `imjangon.co.kr` 301 리다이렉트로 중복 콘텐츠 방지.
5. (권장) 잔여 env(`PUBLIC_DATA_KEY`, `REVALIDATE_TOKEN`)의 끝 개행 제거.
