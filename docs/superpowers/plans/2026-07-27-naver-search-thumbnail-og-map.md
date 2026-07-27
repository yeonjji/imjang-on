# 네이버 검색 썸네일 og:image 지도화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 상세 페이지의 `og:image`를 그 문서에 해당하는 지도로 직접 통제하고, 의미 있는 지도를 만들 수 없으면 메타 태그를 아예 내보내지 않는다.

**Architecture:** NCP Static Map 호출을 `lib/seo/static-map-fetch.ts` 함수 하나로 추출해 이미지 라우트와 OG 합성이 공유한다. 좌표를 URL로 받던 공개 프록시 `/api/staticmap`은 엔티티 참조 라우트 `/map/{kind}/{id}`로 대체해 캐시 키를 실제 엔티티 수로 묶는다. 매물 상세는 `Property.location`이 없으면 같은 읍면동/시군구 매물들의 centroid로 폴백하되, 그 폴백 지도는 og:image에만 쓰고 JSON-LD·본문에는 넣지 않는다.

**Tech Stack:** Next.js 15.5.18 App Router, `next/og`(satori), Prisma 5.22 + PostGIS, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md`

## Global Constraints

- **좌표 유효성 — 한반도 bbox:** `lat 33.0 ~ 38.7`, `lng 124.5 ~ 132.0`. 이 밖의 점은 centroid 집계에서 제외한다.
- **centroid 게이트 — 읍면동:** 최소 유효 표본 `5`건, 최대 산포 `20_000` m, 지도 배율 `level 13`.
- **centroid 게이트 — 시군구:** 최소 유효 표본 `20`건, 최대 산포 `150_000` m, 지도 배율 `level 11`.
- **정확 좌표 배율:** `level 16`, 마커 표시. **폴백 배율:** 마커 없음.
- **centroid 쿼리 제한시간:** `800` ms (DB측 `SET LOCAL statement_timeout`). 초과 시 `null` 반환.
- **캐시:** centroid는 `propertyType`+지역 스코프별 `revalidate: 86_400`. 엔티티 좌표 조회는 `revalidate: 86_400`. NCP fetch는 `revalidate: 2_592_000`.
- **지도 원본 크기:** 본문 카드 `600×400`, OG `1024×538` (NCP raster는 `w`/`h` 최대 1024라 1200×630 직접 요청 불가).
- **OG 캔버스:** `1200×630` (`OG_SIZE`), `image/png`.
- **폴백 지도는 og:image 전용.** JSON-LD `image`와 본문 `StaticMapImage`는 정확한 좌표일 때만 렌더한다.
- **테스트 배치:** DB를 건드리는 테스트는 `tests/integration/`, 순수 로직은 `tests/lib/`. 통합 테스트는 **반드시 자체 시드**한다 (CI의 check 잡은 seed를 돌리지 않아 앰비언트 데이터 의존은 flaky).
- **완료 게이트:** `pnpm lint`가 필수다. `pnpm typecheck`는 미사용 변수를 잡지 못하는데, 이 작업은 `staticMapUrl` 시그니처 변경으로 orphan import가 대량 발생한다.
- **프로덕션 요청 금지:** 배포 확인용 `curl`은 총 5건 이내. 버스트는 과거 차단 사고를 재현한다.

---

## 스펙 대비 정정 사항

구현 준비 중 실측으로 스펙의 두 곳을 정정한다. 스펙 본문이 아니라 이 계획이 우선한다.

1. **엔티티 `kind` 목록.** 스펙은 7종(`…/urban`)으로 적었으나, `LocationViewer`(→ 내부에서 `StaticMapImage` 렌더)가 실제로는 **11개 페이지**에서 쓰이고 `urban`은 카테고리별로 서로 다른 테이블(`Park`/`Parking`/`EvCharger`)에 매핑된다. 레지스트리를 **테이블 기준 11종**으로 확정한다: `property`(`Property`) · `subscription`(`SubscriptionNotice`) · `school`(`School`) · `hospital`(`Hospital`) · `pharmacy`(`Pharmacy`) · `childcare`(`Childcare`) · `park`(`Park`) · `parking`(`Parking`) · `charger`(`EvCharger`) · `store`(`Store`, 카페·마트·편의점 공용) · `market`(`TraditionalMarket`).
2. **`OgMapTarget.scopeLabel` 제거.** `alt` 문구는 호출부가 이미 들고 있는 `property.region.fullName`으로 만들 수 있어, 좌표 해석 모듈이 라벨까지 반환할 이유가 없다.

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `lib/seo/map-entity.ts` | `kind` 화이트리스트 ↔ 테이블 매핑, id 파싱, 엔티티 좌표 조회(캐시) |
| `lib/seo/static-map-fetch.ts` | NCP raster 호출 단 하나. PNG `ArrayBuffer` 반환 |
| `lib/seo/og-coord.ts` | `resolveOgMapTarget` — 정확 좌표 → 읍면동 centroid → 시군구 centroid → null |
| `lib/seo/og-map-route.tsx` | `createOgMapRoute` — 지도 OG 라우트의 메타데이터·합성·에러·캔버스 정책 전부. 8개 엔트리가 공유 |
| `app/map/[kind]/[id]/route.ts` | 본문·JSON-LD용 지도 이미지 (600×400, 마커, 파라미터 없음) |
| `tests/lib/map-entity.test.ts` | kind/id 검증 순수 로직 |
| `tests/lib/static-map-fetch.test.ts` | NCP 호출 URL 조립 (fetch 모킹) |
| `tests/lib/og-frame.test.tsx` | `OgMapFrame` 요소 트리 |
| `tests/integration/og-coord.test.ts` | centroid 폴백 6케이스 (자체 시드) |

**수정**

| 파일 | 변경 |
|---|---|
| `lib/seo/static-map.ts` | 좌표 기반 → 엔티티 기반 URL 빌더 |
| `lib/seo/og.tsx` | `OgMapFrame` 추가, `OgFrame` 중앙정렬 |
| `components/ui/static-map.tsx` | `kind`+`id` prop |
| `components/ui/location-viewer.tsx` | `kind`+`id` prop 통과 |
| `app/robots.ts` | `/api/staticmap` allow 예외 제거 |
| 상세 페이지 11개 | `LocationViewer`에 `kind`/`id` 전달 |
| 상세 페이지 8개 | JSON-LD `image` URL 이전 |
| `opengraph-image.tsx` 9개 | 지도 합성 + 조건부 생략 |

**삭제**

- `app/api/staticmap/route.ts`
- `app/(public)/board/[id]/opengraph-image.tsx`
- `app/(public)/finance/[seq]/opengraph-image.tsx`

---

## Task 1: `generateImageMetadata([])` 동작 검증 (결정 게이트)

계획 전체가 "빈 배열을 반환하면 `og:image` 메타 태그가 사라진다"는 가정 위에 서 있다. Next 15.5.18 문서로 확정하지 못했으므로 **코드를 쓰기 전에 실측한다.** 결과에 따라 Task 9~11의 구현 방식이 갈린다.

**Files:**
- Create: `app/(public)/__ogprobe/[id]/page.tsx` (임시, 이 태스크 끝에 삭제)
- Create: `app/(public)/__ogprobe/[id]/opengraph-image.tsx` (임시, 이 태스크 끝에 삭제)
- Modify: `docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md`

**Interfaces:**
- Consumes: 없음
- Produces: 스펙 6절의 ⚠️ 블록이 확정된 결론으로 대체된다. Task 9~11이 이 결론을 따른다.

- [ ] **Step 1: 임시 프로브 페이지 작성**

`app/(public)/__ogprobe/[id]/page.tsx`:

```tsx
export function generateStaticParams() {
  return [{ id: 'yes' }, { id: 'no' }];
}

export default async function ProbePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main>og probe: {id}</main>;
}
```

`app/(public)/__ogprobe/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// id === 'no' 일 때 빈 배열 → og:image 태그가 사라지는지가 이 프로브의 전부다.
export async function generateImageMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'no') return [];
  return [{ id: 'map', size, contentType, alt: '프로브 이미지' }];
}

export default async function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', backgroundColor: '#0f172a' }} />,
    size,
  );
}
```

- [ ] **Step 2: 빌드 후 두 페이지의 HTML을 확인**

```bash
pnpm build && pnpm start &
sleep 5
echo "--- id=yes (태그가 있어야 함) ---"
curl -s http://localhost:3000/__ogprobe/yes | grep -o '<meta property="og:image[^>]*>'
echo "--- id=no (아무것도 안 나와야 함) ---"
curl -s http://localhost:3000/__ogprobe/no | grep -o '<meta property="og:image[^>]*>'
kill %1
```

기대: `yes`는 `og:image` 태그가 1개 이상, `no`는 **출력 없음**.

- [ ] **Step 3: 결론을 스펙에 기록**

스펙 6절의 `> ⚠️ **선행 검증 필요.**` 로 시작하는 인용 블록 전체를 아래 둘 중 실측에 맞는 쪽으로 교체한다.

빈 배열이 태그를 없앤 경우:

```markdown
> ✅ **검증 완료 (2026-07-27, Next 15.5.18).** `generateImageMetadata()`가 빈 배열을 반환하면 `og:image` 메타 태그가 방출되지 않는다. 파일 기반 규약을 그대로 유지한다.
```

태그가 새어나온 경우:

```markdown
> ❌ **검증 실패 (2026-07-27, Next 15.5.18).** `generateImageMetadata()`가 빈 배열을 반환해도 `og:image` 태그가 남는다. 대안으로 전환한다: 매물·시설 상세의 `opengraph-image.tsx`를 삭제하고 `app/og/[kind]/[id]/route.tsx`(= `/api/` 밖이라 robots 통과)를 만든 뒤, 각 페이지의 `generateMetadata`에서 `openGraph.images`를 조건부로 지정한다. Task 9~11은 이 구조를 따른다.
```

- [ ] **Step 4: 임시 프로브 삭제**

```bash
rm -rf 'app/(public)/__ogprobe'
```

- [ ] **Step 5: 프로브가 남지 않았는지 확인**

```bash
git status --porcelain | grep ogprobe && echo "FAIL: 프로브 잔존" || echo "OK"
```

기대: `OK`

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md
git commit -m "docs(seo): generateImageMetadata 빈 배열 동작 실측 결과 반영"
```

---

## Task 2: 엔티티 지도 레지스트리 (`lib/seo/map-entity.ts`)

**Files:**
- Create: `lib/seo/map-entity.ts`
- Test: `tests/lib/map-entity.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`
- Produces:
  - `type MapEntityKind = 'property' | 'subscription' | 'school' | 'hospital' | 'pharmacy' | 'childcare' | 'park' | 'parking' | 'charger' | 'store' | 'market'`
  - `function isMapEntityKind(value: string): value is MapEntityKind`
  - `function parseMapEntityId(raw: string): bigint | null`
  - `function getMapEntityLatLng(kind: MapEntityKind, id: bigint): Promise<{ lat: number; lng: number } | null>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/map-entity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isMapEntityKind, parseMapEntityId } from '@/lib/seo/map-entity';

describe('isMapEntityKind', () => {
  it('화이트리스트에 있는 kind는 통과', () => {
    for (const k of ['property', 'subscription', 'school', 'hospital', 'pharmacy', 'childcare', 'park', 'parking', 'charger', 'store', 'market']) {
      expect(isMapEntityKind(k)).toBe(true);
    }
  });

  it('화이트리스트 밖은 거부', () => {
    expect(isMapEntityKind('urban')).toBe(false);
    expect(isMapEntityKind('Property')).toBe(false);
    expect(isMapEntityKind('')).toBe(false);
  });

  it('Object.prototype 상속 키를 kind로 오인하지 않는다', () => {
    expect(isMapEntityKind('toString')).toBe(false);
    expect(isMapEntityKind('constructor')).toBe(false);
  });
});

describe('parseMapEntityId', () => {
  it('양의 정수 문자열을 bigint로 파싱', () => {
    expect(parseMapEntityId('123')).toBe(123n);
  });

  it('숫자가 아니거나 음수·소수·과대 길이는 null', () => {
    expect(parseMapEntityId('12a')).toBeNull();
    expect(parseMapEntityId('-1')).toBeNull();
    expect(parseMapEntityId('1.5')).toBeNull();
    expect(parseMapEntityId('')).toBeNull();
    expect(parseMapEntityId('1'.repeat(20))).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test:unit -- tests/lib/map-entity.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/map-entity"`

- [ ] **Step 3: 구현 작성**

`lib/seo/map-entity.ts`:

```ts
import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';

// kind → 테이블명. 값은 코드에 박힌 리터럴만 쓰이므로 Prisma.raw 보간이 안전하다.
// 카페·마트·편의점은 모두 Store 한 테이블을 쓰므로 kind도 'store' 하나로 합친다.
const MAP_ENTITY_TABLES = {
  property: 'Property',
  subscription: 'SubscriptionNotice',
  school: 'School',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  childcare: 'Childcare',
  park: 'Park',
  parking: 'Parking',
  charger: 'EvCharger',
  store: 'Store',
  market: 'TraditionalMarket',
} as const;

export type MapEntityKind = keyof typeof MAP_ENTITY_TABLES;

export function isMapEntityKind(value: string): value is MapEntityKind {
  return Object.prototype.hasOwnProperty.call(MAP_ENTITY_TABLES, value);
}

/** URL 세그먼트는 kind마다 타입이 달라 불투명 문자열로 받고 여기서 파싱한다. */
export function parseMapEntityId(raw: string): bigint | null {
  if (!/^\d{1,19}$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function queryLatLng(
  kind: MapEntityKind,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const table = Prisma.raw(`"${MAP_ENTITY_TABLES[kind]}"`);
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM ${table} WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}

/** 이미지 라우트가 요청마다 DB를 때리지 않도록 엔티티당 24시간 캐시한다. */
export function getMapEntityLatLng(
  kind: MapEntityKind,
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  return unstable_cache(
    () => queryLatLng(kind, id),
    ['map-entity-latlng', kind, String(id)],
    { revalidate: 86_400 },
  )();
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `pnpm test:unit -- tests/lib/map-entity.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/map-entity.ts tests/lib/map-entity.test.ts
git commit -m "feat(seo): 지도 이미지용 엔티티 kind 레지스트리 추가"
```

---

## Task 3: NCP 호출 추출 (`lib/seo/static-map-fetch.ts`)

**Files:**
- Create: `lib/seo/static-map-fetch.ts`
- Test: `tests/lib/static-map-fetch.test.ts`

**Interfaces:**
- Consumes: `env` from `@/lib/env` (`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET` — 둘 다 `string | undefined`)
- Produces:
  - `class StaticMapUnavailableError extends Error`
  - `interface StaticMapRequest { lat: number; lng: number; w: number; h: number; level: number; marker: boolean }`
  - `function fetchStaticMapPng(req: StaticMapRequest): Promise<ArrayBuffer>`
  - `const STATIC_MAP_UPSTREAM_REVALIDATE = 2_592_000`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/static-map-fetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: 'test-key-id',
    NAVER_MAP_CLIENT_SECRET: 'test-secret',
  },
}));

import { fetchStaticMapPng } from '@/lib/seo/static-map-fetch';

function okResponse() {
  return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('fetchStaticMapPng', () => {
  it('NCP는 center를 lng,lat 순서로 기대한다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.4979, lng: 127.0276, w: 600, h: 400, level: 16, marker: true });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('center')).toBe('127.0276,37.4979');
    expect(url.searchParams.get('w')).toBe('600');
    expect(url.searchParams.get('h')).toBe('400');
    expect(url.searchParams.get('level')).toBe('16');
  });

  it('marker=true면 마커 파라미터를 붙인다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('markers')).toBe('type:d|size:mid|pos:127 37.5');
  });

  it('marker=false면 마커 파라미터가 없다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 1024, h: 538, level: 13, marker: false });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.searchParams.get('markers')).toBeNull();
  });

  it('인증 헤더를 싣는다', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    await fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-ncp-apigw-api-key-id']).toBe('test-key-id');
    expect((init.headers as Record<string, string>)['x-ncp-apigw-api-key']).toBe('test-secret');
  });

  it('상류가 4xx/5xx면 던진다', async () => {
    fetchSpy.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(
      fetchStaticMapPng({ lat: 37.5, lng: 127.0, w: 600, h: 400, level: 16, marker: true }),
    ).rejects.toThrow('ncp static map 500');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test:unit -- tests/lib/static-map-fetch.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/static-map-fetch"`

- [ ] **Step 3: 구현 작성**

`lib/seo/static-map-fetch.ts`:

```ts
// NCP Static Map(raster) 호출은 여기 한 곳뿐이다. 이미지 라우트와 OG 합성이 공유한다.
// 키를 클라이언트에 노출하지 않고, fetch 데이터 캐시로 상류 호출을 30일 묶는다.
import { env } from '@/lib/env';

const NCP_ENDPOINT = 'https://maps.apigw.ntruss.com/map-static/v2/raster';

export const STATIC_MAP_UPSTREAM_REVALIDATE = 2_592_000; // 30일

/** NCP 키가 설정되지 않은 상태. 호출부는 이걸 503으로 옮긴다. */
export class StaticMapUnavailableError extends Error {}

export interface StaticMapRequest {
  lat: number;
  lng: number;
  w: number;
  h: number;
  level: number;
  /** 정확한 좌표에만 마커를 찍는다. 지역 폴백 지도는 false. */
  marker: boolean;
}

export async function fetchStaticMapPng(req: StaticMapRequest): Promise<ArrayBuffer> {
  const keyId = env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = env.NAVER_MAP_CLIENT_SECRET;
  if (!keyId || !secret) throw new StaticMapUnavailableError('map not configured');

  const upstream = new URL(NCP_ENDPOINT);
  upstream.searchParams.set('w', String(req.w));
  upstream.searchParams.set('h', String(req.h));
  // NCP Static Map은 lng,lat 순서를 기대한다.
  upstream.searchParams.set('center', `${req.lng},${req.lat}`);
  upstream.searchParams.set('level', String(req.level));
  upstream.searchParams.set('format', 'png');
  // scale=1: cold-miss PNG 바이트를 scale=2 대비 ~¼로 줄인다. 썸네일 용도라 손실 미미.
  upstream.searchParams.set('scale', '1');
  if (req.marker) {
    upstream.searchParams.set('markers', `type:d|size:mid|pos:${req.lng} ${req.lat}`);
  }

  const res = await fetch(upstream, {
    headers: {
      'x-ncp-apigw-api-key-id': keyId,
      'x-ncp-apigw-api-key': secret,
    },
    next: { revalidate: STATIC_MAP_UPSTREAM_REVALIDATE },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`ncp static map ${res.status}`);
  return res.arrayBuffer();
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `pnpm test:unit -- tests/lib/static-map-fetch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/static-map-fetch.ts tests/lib/static-map-fetch.test.ts
git commit -m "feat(seo): NCP Static Map 호출을 공용 모듈로 추출"
```

---

## Task 4: 엔티티 지도 라우트 (`/map/{kind}/{id}`)

좌표를 URL로 받지 않는다. `kind`+`id`로 DB에서 조회하므로 임의 좌표 요청 자체가 불가능하고, 캐시 키가 실제 엔티티 수를 넘지 못한다.

**Files:**
- Create: `app/map/[kind]/[id]/route.ts`

**Interfaces:**
- Consumes: `isMapEntityKind` · `parseMapEntityId` · `getMapEntityLatLng` (Task 2), `fetchStaticMapPng` · `StaticMapUnavailableError` (Task 3)
- Produces: `GET /map/{kind}/{id}` → `200 image/png` (600×400, 마커) / `404` / `502` / `503`

- [ ] **Step 1: 라우트 작성**

`app/map/[kind]/[id]/route.ts`:

```ts
// 좌표를 URL로 받던 /api/staticmap을 대체한다. 좌표는 서버가 DB에서 조회하므로
// 외부에서 임의 좌표로 NCP 호출을 유발할 수 없고, 캐시 키가 엔티티 수로 묶인다.
// 크기·배율 파라미터를 받지 않는 것도 같은 이유다.
import { isMapEntityKind, parseMapEntityId, getMapEntityLatLng } from '@/lib/seo/map-entity';
import { fetchStaticMapPng, StaticMapUnavailableError } from '@/lib/seo/static-map-fetch';

const CARD = { w: 600, h: 400, level: 16 } as const;

function notFound() {
  return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (!isMapEntityKind(kind)) return notFound();

  const entityId = parseMapEntityId(id);
  if (entityId === null) return notFound();

  const coord = await getMapEntityLatLng(kind, entityId);
  if (!coord) return notFound();

  try {
    const png = await fetchStaticMapPng({ ...coord, ...CARD, marker: true });
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control':
          'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    const status = e instanceof StaticMapUnavailableError ? 503 : 502;
    return new Response('map unavailable', { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
```

라우트 자체에 `export const revalidate`를 걸지 않는다. 상류 NCP 응답이 이미 30일 데이터 캐시에 얹히고 좌표 조회도 24시간 캐시라, 라우트가 재실행돼도 외부 호출이 없다. 응답 캐시는 `Cache-Control` 헤더로 CDN에 맡긴다.

- [ ] **Step 2: 타입 검사**

Run: `pnpm typecheck`
Expected: 통과 (에러 0건)

- [ ] **Step 3: 라우트가 뜨는지 로컬 확인**

```bash
pnpm dev &
sleep 8
echo "--- 잘못된 kind → 404 ---"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/map/urban/1
echo "--- 잘못된 id → 404 ---"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/map/property/abc
kill %1
```

기대: 두 줄 모두 `404`

- [ ] **Step 4: 커밋**

```bash
git add 'app/map/[kind]/[id]/route.ts'
git commit -m "feat(seo): 엔티티 참조 지도 이미지 라우트 /map/[kind]/[id] 추가"
```

---

## Task 5: 호출부를 엔티티 URL로 이전

`StaticMapImage`·`LocationViewer`·JSON-LD `image`가 전부 좌표 기반 URL을 쓴다. 한 번에 옮긴다 — 같은 페이지 파일을 두 태스크가 나눠 건드리면 충돌만 는다.

**Files:**
- Modify: `lib/seo/static-map.ts` (전면 교체)
- Modify: `components/ui/static-map.tsx`
- Modify: `components/ui/location-viewer.tsx:14-21` (Props), `:125-130` (StaticMapImage 호출)
- Modify: `LocationViewer` 호출 11곳 —
  `app/(public)/apt/[id]/page.tsx:160` · `app/(public)/villa/[id]/page.tsx:166` · `app/(public)/officetel/[id]/page.tsx:162` · `app/(public)/subscription/[id]/page.tsx:138` · `app/(public)/childcare/[sigunguCode]/[id]/page.tsx:171` · `app/(public)/school/[sigunguCode]/[id]/page.tsx` · `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx:161` · `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx:120` · `app/(public)/urban/[category]/[id]/page.tsx:189` · `app/(public)/urban/charger/[id]/page.tsx:114` · `app/(public)/amenity/[category]/[id]/page.tsx:136`
- Modify: JSON-LD `image` 8곳 —
  `app/(public)/apt/[id]/page.tsx:134` · `app/(public)/villa/[id]/page.tsx:140` · `app/(public)/officetel/[id]/page.tsx:136` · `app/(public)/childcare/[sigunguCode]/[id]/page.tsx:131` · `app/(public)/school/[sigunguCode]/[id]/page.tsx:129` · `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx:110` · `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx:86` · `app/(public)/urban/[category]/[id]/page.tsx:142`

**Interfaces:**
- Consumes: `MapEntityKind` (Task 2)
- Produces:
  - `function mapImagePath(kind: MapEntityKind, id: string | bigint): string` → `/map/{kind}/{id}`
  - `function mapImageUrl(kind: MapEntityKind, id: string | bigint): string` → `${SITE_URL}/map/{kind}/{id}`
  - `<StaticMapImage kind id name className? width? height? />`
  - `<LocationViewer lat lng mapKind mapId name? height? />`

- [ ] **Step 1: URL 빌더 교체**

`lib/seo/static-map.ts` 전체를 아래로 바꾼다.

```ts
import { SITE_URL } from '@/lib/site';
import type { MapEntityKind } from '@/lib/seo/map-entity';

/** 지도 이미지 라우트의 상대 경로 (`<img src>`용). */
export function mapImagePath(kind: MapEntityKind, id: string | bigint): string {
  return `/map/${kind}/${id}`;
}

/** 절대 URL (JSON-LD `image`용). */
export function mapImageUrl(kind: MapEntityKind, id: string | bigint): string {
  return `${SITE_URL}${mapImagePath(kind, id)}`;
}
```

- [ ] **Step 2: `StaticMapImage`를 엔티티 참조로**

`components/ui/static-map.tsx` 전체를 아래로 바꾼다. `width`/`height`는 **표시 크기 전용**이며 URL에 반영되지 않는다 (고유 크기는 라우트가 600×400으로 고정).

```tsx
import { mapImagePath } from '@/lib/seo/static-map';
import type { MapEntityKind } from '@/lib/seo/map-entity';

interface Props {
  kind: MapEntityKind;
  id: string | bigint;
  name: string;
  /** 표시 너비/높이(px). 이미지 고유 크기는 라우트가 600x400으로 고정한다. */
  width?: number;
  height?: number;
  /** 기본 스타일 대신 사용할 클래스 (예: LocationViewer poster용 absolute fill). */
  className?: string;
}

/**
 * 검색 썸네일 후보가 되는 실제 <img>. 인터랙티브 지도(LocationViewer)와 별개로,
 * JS 없이도 마크업에 존재한다. next/image 대신 plain <img>로 직접 URL을 노출한다.
 */
export function StaticMapImage({ kind, id, name, width = 600, height = 400, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mapImagePath(kind, id)}
      alt={`${name} 위치 지도`}
      width={width}
      height={height}
      className={className ?? 'mb-3 w-full rounded-2xl border border-[var(--color-line)] object-cover'}
    />
  );
}
```

- [ ] **Step 3: `LocationViewer`가 엔티티 참조를 통과시키게**

`components/ui/location-viewer.tsx`의 `Props`(14-21행)에 두 필드를 추가한다.

```tsx
interface Props {
  lat: number;
  lng: number;
  /** SSR 정적 지도 poster가 가리킬 엔티티. 인터랙티브 지도의 lat/lng와는 별개다. */
  mapKind: MapEntityKind;
  mapId: string | bigint;
  name?: string;
  height?: number;
}

export function LocationViewer({ lat, lng, mapKind, mapId, name, height = 280 }: Props) {
```

파일 상단에 타입 import를 추가한다.

```tsx
import type { MapEntityKind } from '@/lib/seo/map-entity';
```

`StaticMapImage` 호출(125행 부근)을 바꾼다.

```tsx
          <StaticMapImage
            kind={mapKind}
            id={mapId}
            name={name ?? '위치'}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
```

- [ ] **Step 4: `LocationViewer` 호출 11곳에 `mapKind`/`mapId` 추가**

각 파일에서 `<LocationViewer lat={coord.lat} lng={coord.lng} name={…} />`에 두 prop을 더한다. kind와 id는 아래 표대로다.

| 파일 | `mapKind` | `mapId` |
|---|---|---|
| `apt/[id]/page.tsx` | `"property"` | `property.id` |
| `villa/[id]/page.tsx` | `"property"` | `property.id` |
| `officetel/[id]/page.tsx` | `"property"` | `property.id` |
| `subscription/[id]/page.tsx` | `"subscription"` | `notice.id` |
| `childcare/[sigunguCode]/[id]/page.tsx` | `"childcare"` | `item.id` |
| `school/[sigunguCode]/[id]/page.tsx` | `"school"` | `school.id` |
| `medical/hospital/[sigunguCode]/[id]/page.tsx` | `"hospital"` | `hospital.id` |
| `medical/pharmacy/[sigunguCode]/[id]/page.tsx` | `"pharmacy"` | `pharmacy.id` |
| `urban/[category]/[id]/page.tsx` | `def.slug === 'park' ? 'park' : 'parking'` | `item.id` |
| `urban/charger/[id]/page.tsx` | `"charger"` | `item.id` |
| `amenity/[category]/[id]/page.tsx` | `def.slug === 'market' ? 'market' : 'store'` | `item.id` |

예 (`apt/[id]/page.tsx:160`):

```tsx
<LocationViewer
  lat={coord.lat}
  lng={coord.lng}
  mapKind="property"
  mapId={property.id}
  name={property.name}
/>
```

`urban/[category]/[id]/page.tsx:189`은 카테고리가 둘이므로:

```tsx
<LocationViewer
  lat={coord.lat}
  lng={coord.lng}
  mapKind={def.slug === 'park' ? 'park' : 'parking'}
  mapId={item.id}
  name={item.name}
/>
```

`amenity/[category]/[id]/page.tsx:136`은 카페·마트·편의점이 모두 `Store`라 `market`만 갈라내면 된다:

```tsx
<LocationViewer
  lat={coord.lat}
  lng={coord.lng}
  mapKind={def.slug === 'market' ? 'market' : 'store'}
  mapId={item.id}
  name={item.name}
/>
```

- [ ] **Step 5: JSON-LD `image` 8곳 이전**

`staticMapUrl` import를 `mapImageUrl`로 바꾸고, `image: coord ? staticMapUrl(coord) : undefined`를 아래처럼 바꾼다. **`coord ?` 게이트는 그대로 둔다** — 폴백 지도는 JSON-LD에 넣지 않는다.

| 파일 | 바뀐 표현 |
|---|---|
| `apt/[id]/page.tsx:134` | `image: coord ? mapImageUrl('property', property.id) : undefined,` |
| `villa/[id]/page.tsx:140` | `image: coord ? mapImageUrl('property', property.id) : undefined,` |
| `officetel/[id]/page.tsx:136` | `image: coord ? mapImageUrl('property', property.id) : undefined,` |
| `childcare/[sigunguCode]/[id]/page.tsx:131` | `image: coord ? mapImageUrl('childcare', item.id) : undefined,` |
| `school/[sigunguCode]/[id]/page.tsx:129` | `image: coord ? mapImageUrl('school', school.id) : undefined,` |
| `medical/hospital/[sigunguCode]/[id]/page.tsx:110` | `image: coord ? mapImageUrl('hospital', hospital.id) : undefined,` |
| `medical/pharmacy/[sigunguCode]/[id]/page.tsx:86` | `image: coord ? mapImageUrl('pharmacy', pharmacy.id) : undefined,` |
| `urban/[category]/[id]/page.tsx:142` | `image: coord ? mapImageUrl('park', item.id) : undefined,` |

`urban` 쪽 JSON-LD 블록은 `isPark` 조건 안에만 있으므로 `'park'` 고정이 맞다.

- [ ] **Step 6: 좌표 기반 헬퍼가 남아 있지 않은지 확인**

```bash
grep -rn "staticMapUrl\|staticMapPath" app components lib && echo "FAIL: 잔존" || echo "OK: 전부 이전됨"
```

기대: `OK: 전부 이전됨`

- [ ] **Step 7: 타입·린트 검사**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과. `lint`가 orphan import(`staticMapUrl` 등)를 잡으면 해당 import 줄을 지운다.

- [ ] **Step 8: SSR 컴포넌트 테스트 통과 확인**

Run: `pnpm test:unit -- tests/components/location-viewer-ssr.test.ts`
Expected: PASS. 실패하면 그 테스트가 만드는 `LocationViewer` props에 `mapKind`/`mapId`를 추가한다.

- [ ] **Step 9: 커밋**

```bash
git add lib/seo/static-map.ts components/ui/static-map.tsx components/ui/location-viewer.tsx app tests
git commit -m "refactor(seo): 지도 이미지 URL을 좌표 기반에서 엔티티 참조로 이전"
```

---

## Task 6: `/api/staticmap` 삭제 + robots 예외 제거

임의 좌표를 받는 공개 프록시를 없앤다. 이 태스크가 끝나야 "외부에서 NCP 호출을 유발할 수 있는 경로"가 사라진다.

**Files:**
- Delete: `app/api/staticmap/route.ts`
- Modify: `app/robots.ts:6-7`

**Interfaces:**
- Consumes: Task 5의 이전 완료 (`/map/{kind}/{id}`가 모든 호출부에서 쓰이는 상태)
- Produces: 없음

- [ ] **Step 1: 라우트 삭제**

```bash
git rm -r app/api/staticmap
```

- [ ] **Step 2: robots에서 예외 줄 제거**

`app/robots.ts`의 6-7행을 아래로 바꾼다. `/map/`은 `/api/` 밖이라 기본 `allow: ['/']`로 이미 수집 가능하므로 별도 예외가 필요 없다.

```ts
  const allow = ['/', '/apt/', '/officetel/', '/villa/', ...(isBoardPublic() ? ['/board/'] : [])];
```

(`// '/api/staticmap'는 JSON-LD 대표 이미지/썸네일로 쓰여 …` 주석도 함께 지운다.)

- [ ] **Step 3: 참조가 남지 않았는지 확인**

```bash
grep -rn "api/staticmap" app lib components docs/superpowers/plans && echo "FAIL: 참조 잔존" || echo "OK"
```

기대: `OK`

- [ ] **Step 4: 빌드 통과 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과

- [ ] **Step 5: 커밋**

```bash
git add -A app/api app/robots.ts
git commit -m "refactor(seo): 임의 좌표 공개 프록시 /api/staticmap 삭제"
```

---

## Task 7: 지역 centroid 폴백 (`lib/seo/og-coord.ts`)

**Files:**
- Create: `lib/seo/og-coord.ts`
- Test: `tests/integration/og-coord.test.ts`

**Interfaces:**
- Consumes: `getPropertyLatLng` from `@/lib/property` (`(id: bigint) => Promise<{lat,lng} | null>`), `prisma` from `@/lib/db`
- Produces:
  - `type OgMapTarget = { kind: 'precise'; lat: number; lng: number; level: 16; marker: true } | { kind: 'region'; lat: number; lng: number; level: 13 | 11; marker: false }`
  - `function resolveOgMapTarget(propertyId: bigint): Promise<OgMapTarget | null>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/integration/og-coord.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PropertyType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { resolveOgMapTarget } from '@/lib/seo/og-coord';

// CI의 check 잡은 migrate만 하고 seed를 안 한다. 앰비언트 Property 데이터에 의존하면
// DB 상태에 따라 결과가 흔들리므로 지역·매물을 테스트가 직접 시드한다.
const SIDO = 'UT시';
const DONG_A = 'UT11111111'; // 표본 충분한 읍면동
const DONG_B = 'UT11122222'; // 표본 부족한 읍면동 (같은 시군구 UT111)
const DONG_C = 'UT11133333'; // 산포가 과대한 읍면동
const DONG_D = 'UT99911111'; // 시군구까지 표본 부족
const SGG_OK = 'UT111';
const SGG_THIN = 'UT999';

const ids = {
  precise: 900_000_001n,
  dong: 900_000_002n,
  sigungu: 900_000_003n,
  spread: 900_000_004n,
  none: 900_000_005n,
  outlier: 900_000_006n,
};

/** location은 Prisma create로 넣을 수 없어 raw로 세팅한다. */
async function setLocation(id: bigint, lat: number, lng: number) {
  await prisma.$executeRaw`
    UPDATE "Property" SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
    WHERE id = ${id}
  `;
}

async function seedFiller(
  regionCode: string,
  sigunguCode: string,
  count: number,
  baseLat: number,
  baseLng: number,
  stepDeg: number,
  startId: bigint,
) {
  for (let i = 0; i < count; i++) {
    const id = startId + BigInt(i);
    await prisma.property.create({
      data: {
        id,
        propertyType: PropertyType.ROW_HOUSE,
        name: `UT필러${i}`,
        nameNorm: `ut필러${i}`,
        regionCode,
        sigunguCode,
        address: `${SIDO} 어딘가 ${i}`,
      },
    });
    await setLocation(id, baseLat + i * stepDeg, baseLng + i * stepDeg);
  }
}

beforeAll(async () => {
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT' } } });
  await prisma.region.deleteMany({ where: { code: { startsWith: 'UT' } } });

  for (const [code, sigunguCode] of [
    [DONG_A, SGG_OK],
    [DONG_B, SGG_OK],
    [DONG_C, SGG_OK],
    [DONG_D, SGG_THIN],
  ] as const) {
    await prisma.region.create({
      data: {
        code,
        sido: SIDO,
        sigungu: 'UT구',
        fullName: `${SIDO} UT구`,
        level: 3,
        sourceVersion: 'ut',
        sigunguCode,
      },
    });
  }

  // 대상 매물 6건 — 전부 좌표 없음으로 시작
  for (const [key, regionCode, sigunguCode] of [
    ['precise', DONG_A, SGG_OK],
    ['dong', DONG_A, SGG_OK],
    ['sigungu', DONG_B, SGG_OK],
    ['spread', DONG_C, SGG_OK],
    ['none', DONG_D, SGG_THIN],
    ['outlier', DONG_A, SGG_OK],
  ] as const) {
    await prisma.property.create({
      data: {
        id: ids[key],
        propertyType: PropertyType.ROW_HOUSE,
        name: `UT대상-${key}`,
        nameNorm: `ut대상-${key}`,
        regionCode,
        sigunguCode,
        address: `${SIDO} UT구 어딘가`,
      },
    });
  }
  await setLocation(ids.precise, 37.5000, 127.0000);

  // DONG_A: 유효 6건 (게이트 5 통과), 서로 ~100m 간격 → 산포 20km 이내
  await seedFiller(DONG_A, SGG_OK, 6, 37.5000, 127.0000, 0.001, 910_000_000n);
  // DONG_A에 한반도 밖 오염점 1건 — 집계에서 제외돼야 한다
  await prisma.property.create({
    data: {
      id: 919_999_999n,
      propertyType: PropertyType.ROW_HOUSE,
      name: 'UT오염점',
      nameNorm: 'ut오염점',
      regionCode: DONG_A,
      sigunguCode: SGG_OK,
      address: `${SIDO} UT구 오염`,
    },
  });
  await setLocation(919_999_999n, 0, 0);

  // DONG_B: 유효 3건 (읍면동 게이트 5 미달) → 시군구로 승격
  await seedFiller(DONG_B, SGG_OK, 3, 37.6000, 127.1000, 0.001, 920_000_000n);
  // DONG_C: 유효 6건이지만 1도(≈110km) 간격 → 읍면동 산포 20km 초과 → 시군구로 승격
  await seedFiller(DONG_C, SGG_OK, 6, 34.0000, 127.0000, 1.0, 930_000_000n);
  // SGG_OK 총합: 6 + 3 + 6 = 15... 시군구 게이트 20을 넘기려 5건 더 채운다
  await seedFiller(DONG_B, SGG_OK, 5, 37.6100, 127.1100, 0.001, 940_000_000n);
  // DONG_D / SGG_THIN: 2건뿐 → 읍면동·시군구 게이트 모두 미달
  await seedFiller(DONG_D, SGG_THIN, 2, 36.0000, 128.0000, 0.001, 950_000_000n);
});

afterAll(async () => {
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT' } } });
  await prisma.region.deleteMany({ where: { code: { startsWith: 'UT' } } });
  await prisma.$disconnect();
});

describe('resolveOgMapTarget', () => {
  it('정확한 좌표가 있으면 precise + level 16 + 마커', async () => {
    const t = await resolveOgMapTarget(ids.precise);
    expect(t).toEqual({ kind: 'precise', lat: 37.5, lng: 127.0, level: 16, marker: true });
  });

  it('좌표가 없고 읍면동 표본이 충분하면 region + level 13 + 마커 없음', async () => {
    const t = await resolveOgMapTarget(ids.dong);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(13);
    expect(t?.marker).toBe(false);
  });

  it('한반도 bbox 밖 좌표는 centroid 집계에서 제외한다', async () => {
    // DONG_A에 (0,0) 오염점이 섞여 있다. 제외되지 않으면 centroid가 적도 쪽으로 끌려간다.
    const t = await resolveOgMapTarget(ids.outlier);
    expect(t?.kind).toBe('region');
    expect(t!.lat).toBeGreaterThan(37.0);
    expect(t!.lng).toBeGreaterThan(126.0);
  });

  it('읍면동 표본이 부족하면 시군구로 승격해 level 11', async () => {
    const t = await resolveOgMapTarget(ids.sigungu);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(11);
  });

  it('읍면동 산포가 20km를 넘으면 그 스코프를 버리고 시군구로 승격', async () => {
    const t = await resolveOgMapTarget(ids.spread);
    expect(t?.kind).toBe('region');
    expect(t?.level).toBe(11);
  });

  it('시군구 표본까지 부족하면 null', async () => {
    const t = await resolveOgMapTarget(ids.none);
    expect(t).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test:integration -- tests/integration/og-coord.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/og-coord"`

- [ ] **Step 3: 구현 작성**

`lib/seo/og-coord.ts`:

```ts
// og:image에 쓸 지도의 중심 좌표를 정한다.
// 정확한 좌표 → 같은 읍면동 매물들의 centroid → 같은 시군구 centroid → 포기.
// 폴백 좌표는 og:image 전용이다. JSON-LD image와 본문 지도에는 쓰지 않는다.
import { Prisma, PropertyType } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { getPropertyLatLng } from '@/lib/property';

export type OgMapTarget =
  | { kind: 'precise'; lat: number; lng: number; level: 16; marker: true }
  | { kind: 'region'; lat: number; lng: number; level: 13 | 11; marker: false };

// 한반도 bbox. (0,0)이나 lat/lng가 뒤바뀐 값 같은 총체적 오염을 집계 전에 거른다.
const KR = { latMin: 33.0, latMax: 38.7, lngMin: 124.5, lngMax: 132.0 } as const;

const DONG = { minSamples: 5, maxSpreadM: 20_000, level: 13 } as const;
const SIGUNGU = { minSamples: 20, maxSpreadM: 150_000, level: 11 } as const;

// OG 이미지 하나 때문에 페이지가 느려지면 안 된다. DB측에서 실제로 중단시킨다.
const CENTROID_TIMEOUT_MS = 800;

interface CentroidRow {
  n: number | null;
  lat: number | null;
  lng: number | null;
  spread_m: number | null;
}

async function runCentroidQuery(
  propertyType: PropertyType,
  where: Prisma.Sql,
): Promise<CentroidRow | null> {
  const [, rows] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${CENTROID_TIMEOUT_MS}`),
    prisma.$queryRaw<CentroidRow[]>`
      WITH pts AS (
        SELECT location::geometry AS g
        FROM "Property"
        WHERE "propertyType" = ${propertyType}::"PropertyType"
          AND ${where}
          AND location IS NOT NULL
          AND ST_Y(location::geometry) BETWEEN ${KR.latMin} AND ${KR.latMax}
          AND ST_X(location::geometry) BETWEEN ${KR.lngMin} AND ${KR.lngMax}
      ),
      agg AS (SELECT ST_Collect(g) AS c, count(*)::int AS n FROM pts)
      SELECT
        n,
        ST_Y(ST_Centroid(c)) AS lat,
        ST_X(ST_Centroid(c)) AS lng,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(ST_XMin(c), ST_YMin(c)), 4326)::geography,
          ST_SetSRID(ST_MakePoint(ST_XMax(c), ST_YMax(c)), 4326)::geography
        ) AS spread_m
      FROM agg
      WHERE n > 0
    `,
  ]);
  return rows[0] ?? null;
}

/**
 * 유효 점이 0개면 ST_Collect가 NULL을 반환한다. `WHERE n > 0`가 그 행을 거르지만
 * Postgres가 SELECT 목록을 먼저 평가하지 않는다는 보장이 없어 여기서도 확인한다.
 */
function accept(
  row: CentroidRow | null,
  gate: { minSamples: number; maxSpreadM: number },
): { lat: number; lng: number } | null {
  if (!row || row.n === null || row.lat === null || row.lng === null) return null;
  if (row.n < gate.minSamples) return null;
  if (row.spread_m !== null && row.spread_m > gate.maxSpreadM) return null;
  return { lat: row.lat, lng: row.lng };
}

async function safeCentroid(
  propertyType: PropertyType,
  where: Prisma.Sql,
  gate: { minSamples: number; maxSpreadM: number },
): Promise<{ lat: number; lng: number } | null> {
  try {
    return accept(await runCentroidQuery(propertyType, where), gate);
  } catch {
    // 타임아웃이든 다른 예외든 og:image를 포기할 뿐, 페이지 렌더에 영향을 주지 않는다.
    return null;
  }
}

// 같은 읍면동의 좌표 없는 매물이 여러 건이어도 스코프당 하루 1회만 조회한다.
// null 결과도 함께 캐시해 실패 스코프를 반복 조회하지 않는다.
function dongCentroid(propertyType: PropertyType, regionCode: string) {
  return unstable_cache(
    () => safeCentroid(propertyType, Prisma.sql`"regionCode" = ${regionCode}`, DONG),
    ['og-centroid', 'dong', propertyType, regionCode],
    { revalidate: 86_400 },
  )();
}

// sigunguCode는 generated column(LEFT(regionCode,5))이라 schema.prisma엔 안 보이지만
// DB엔 Property_sigunguCode_idx가 이미 있다. 이 쿼리는 regionCode LIKE prefix를 쓰는데,
// sigunguCode = ? 와 결과는 동일하다(sigunguCode가 정확히 LEFT(regionCode,5)이므로) —
// 어느 인덱스가 더 유리한지는 후속 태스크에서 실측으로 정한다.
function sigunguCentroid(propertyType: PropertyType, sigunguCode: string) {
  return unstable_cache(
    () => safeCentroid(propertyType, Prisma.sql`"regionCode" LIKE ${`${sigunguCode}%`}`, SIGUNGU),
    ['og-centroid', 'sigungu', propertyType, sigunguCode],
    { revalidate: 86_400 },
  )();
}

export async function resolveOgMapTarget(propertyId: bigint): Promise<OgMapTarget | null> {
  const precise = await getPropertyLatLng(propertyId).catch(() => null);
  if (precise) return { kind: 'precise', lat: precise.lat, lng: precise.lng, level: 16, marker: true };

  const p = await prisma.property
    .findUnique({
      where: { id: propertyId },
      select: { propertyType: true, regionCode: true, sigunguCode: true },
    })
    .catch(() => null);
  if (!p) return null;

  const dong = await dongCentroid(p.propertyType, p.regionCode);
  if (dong) return { kind: 'region', lat: dong.lat, lng: dong.lng, level: DONG.level, marker: false };

  if (p.sigunguCode) {
    const sgg = await sigunguCentroid(p.propertyType, p.sigunguCode);
    if (sgg) return { kind: 'region', lat: sgg.lat, lng: sgg.lng, level: SIGUNGU.level, marker: false };
  }

  return null;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `pnpm test:integration -- tests/integration/og-coord.test.ts`
Expected: PASS (6 tests)

`unstable_cache`가 테스트 환경에서 결과를 재사용해 케이스끼리 간섭하면, 각 케이스가 서로 다른 `regionCode`/`propertyType`를 쓰므로 캐시 키가 갈린다. 그래도 실패하면 시드 코드가 아니라 캐시 키 조합을 먼저 의심한다.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/og-coord.ts tests/integration/og-coord.test.ts
git commit -m "feat(seo): og:image용 지역 centroid 폴백 좌표 해석기 추가"
```

---

## Task 8: OG 프레임 (`lib/seo/og.tsx`)

**Files:**
- Modify: `lib/seo/og.tsx`
- Test: `tests/lib/og-frame.test.tsx`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `function OgMapFrame(props: { mapDataUri: string; title: string; subtitle: string }): JSX.Element`
  - `OgFrame`은 시그니처 그대로, 레이아웃만 중앙정렬로 바뀐다 (이제 홈에서만 쓰인다)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/og-frame.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { OgMapFrame } from '@/lib/seo/og';

/** satori에 넘길 요소 트리를 평탄화해 텍스트와 img src를 뽑는다. */
function collect(node: unknown, out: { texts: string[]; imgs: string[] }) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.texts.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collect(c, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === 'img' && typeof el.props?.src === 'string') out.imgs.push(el.props.src);
  if (el.props?.children !== undefined) collect(el.props.children, out);
  return out;
}

describe('OgMapFrame', () => {
  it('지도 data URI와 캡션 2줄을 담는다', () => {
    const tree = OgMapFrame({
      mapDataUri: 'data:image/png;base64,AAAA',
      title: '명성푸르지오',
      subtitle: '대구광역시 북구 · 임장ON',
    });
    const { texts, imgs } = collect(tree, { texts: [], imgs: [] });

    expect(imgs).toContain('data:image/png;base64,AAAA');
    expect(texts).toContain('명성푸르지오');
    expect(texts).toContain('대구광역시 북구 · 임장ON');
  });

  it('캡션 바는 네이버 정사각 크롭에서 살아남도록 중앙정렬이다', () => {
    const tree = OgMapFrame({ mapDataUri: 'data:image/png;base64,AAAA', title: 'A', subtitle: 'B' });
    const json = JSON.stringify(tree);
    expect(json).toContain('"alignItems":"center"');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm test:unit -- tests/lib/og-frame.test.tsx`
Expected: FAIL — `OgMapFrame is not a function` (또는 import 실패)

`vitest.config.ts`의 `include`가 `tests/**/*.test.ts`라 `.tsx`가 잡히지 않으면, `include`를 `['tests/**/*.test.ts', 'tests/**/*.test.tsx']`로 넓힌다.

- [ ] **Step 3: `OgMapFrame` 추가 + `OgFrame` 중앙정렬**

`lib/seo/og.tsx`의 `OgFrame`을 아래로 교체하고 `OgMapFrame`을 덧붙인다.

```tsx
/**
 * 지도 없는 페이지(홈)용 브랜드 카드. satori 제약상 flex/명시 스타일만 사용.
 * 네이버는 1200x630을 가로로 크롭해 정사각으로 보여주므로, 중앙에서 벗어난
 * 텍스트는 잘려 나가 배경색만 남는다. 그래서 전부 중앙정렬이다.
 */
export function OgFrame({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 72,
        backgroundColor: '#1e3a8a',
        color: '#ffffff',
        fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>임장ON</div>
      <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.2, marginTop: 24, textAlign: 'center' }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ display: 'flex', fontSize: 36, marginTop: 16, opacity: 0.9 }}>{subtitle}</div>
      ) : null}
      <div style={{ display: 'flex', fontSize: 28, marginTop: 32, opacity: 0.7 }}>
        공공데이터 부동산 실거래가
      </div>
    </div>
  );
}

/**
 * 지도 위에 캡션 바를 얹은 OG 카드. 지도는 data URI로 넘어온다(원격 URL fetch 없음).
 * 캡션이 중앙정렬인 이유는 OgFrame과 같다 — 정사각 크롭 후에도 남아야 한다.
 */
export function OgMapFrame({
  mapDataUri,
  title,
  subtitle,
}: {
  mapDataUri: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: 'Pretendard',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mapDataUri}
        alt=""
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 40px',
          backgroundColor: 'rgba(15,23,42,0.78)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 54, color: '#ffffff' }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 30, marginTop: 10, color: 'rgba(255,255,255,0.85)' }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `pnpm test:unit -- tests/lib/og-frame.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/og.tsx tests/lib/og-frame.test.tsx vitest.config.ts
git commit -m "feat(seo): 지도 OG 프레임 추가 + 브랜드 카드 중앙정렬"
```

---

## Task 9: 공용 OG 라우트 팩토리 + 매물 상세 3종

지도 OG 라우트가 총 8개다. 메타데이터 방출·지도 합성·에러 처리·캔버스 크기 정책을 엔트리마다 복사하면 정책 하나 바꿀 때 8곳을 동시에 고쳐야 한다. 팩토리에 모으고, 각 `opengraph-image.tsx`에는 **페이지별 `load`만** 남긴다.

**Files:**
- Create: `lib/seo/og-map-route.tsx`
- Modify: `app/(public)/apt/[id]/opengraph-image.tsx`
- Modify: `app/(public)/villa/[id]/opengraph-image.tsx`
- Modify: `app/(public)/officetel/[id]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `resolveOgMapTarget` (Task 7), `fetchStaticMapPng` (Task 3), `OgMapFrame` · `OG_SIZE` · `OG_CONTENT_TYPE` · `loadOgFonts` (Task 8), `getPropertyById` from `@/lib/property` (`include: { region: true }`)
- Produces:
  - `interface OgMapData { title: string; subtitle: string; alt: string; lat: number; lng: number; level: number; marker: boolean }`
  - `function createOgMapRoute<P>(load: (params: P) => Promise<OgMapData | null>): { generateImageMetadata: (ctx: { params: Promise<P> }) => Promise<Array<{ id: string; width: number; height: number; contentType: string; alt: string }>>; Image: (ctx: { params: Promise<P> }) => Promise<Response> }`
  - Task 10이 같은 팩토리를 쓴다.

**전제:** Task 1의 결론이 ✅면 아래대로. ❌면 팩토리는 그대로 두고 소비 방식만 바꾼다 — `app/og/[kind]/[id]/route.tsx`가 `createOgMapRoute(load).Image`를 재사용하고, 각 페이지의 `generateMetadata`가 `openGraph.images`를 조건부로 지정한다.

- [ ] **Step 1: 팩토리 작성**

`lib/seo/og-map-route.tsx`:

```tsx
// 지도 OG 라우트 8개가 공유하는 정책 한 벌: 메타데이터 방출, 지도 합성,
// 에러 처리, 캔버스 크기. 엔트리 파일에는 페이지별 load만 남는다.
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgMapFrame } from '@/lib/seo/og';
import { fetchStaticMapPng } from '@/lib/seo/static-map-fetch';

/** 지도 OG 한 장에 필요한 전부. load가 null을 주면 og:image를 내보내지 않는다. */
export interface OgMapData {
  title: string;
  subtitle: string;
  alt: string;
  lat: number;
  lng: number;
  level: number;
  marker: boolean;
}

// NCP raster는 w/h 최대 1024라 1200x630을 직접 요청할 수 없다.
// 같은 1.905 비율인 1024x538을 받아 satori에서 캔버스 크기로 늘린다.
const OG_MAP_SIZE = { w: 1024, h: 538 } as const;

export function createOgMapRoute<P>(load: (params: P) => Promise<OgMapData | null>) {
  async function generateImageMetadata({ params }: { params: Promise<P> }) {
    const data = await load(await params);
    // 지도를 만들 수 없으면 og:image 태그 자체를 내보내지 않는다.
    if (!data) return [];
    return [{ id: 'map', ...OG_SIZE, contentType: OG_CONTENT_TYPE, alt: data.alt }];
  }

  async function Image({ params }: { params: Promise<P> }) {
    const data = await load(await params);
    if (!data) {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    let png: ArrayBuffer;
    try {
      png = await fetchStaticMapPng({
        lat: data.lat,
        lng: data.lng,
        level: data.level,
        marker: data.marker,
        ...OG_MAP_SIZE,
      });
    } catch {
      // 파란 브랜드 카드로 폴백하지 않는다 — 그게 없애려는 대상이다.
      // no-store라 다음 크롤에 재시도된다.
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    return new ImageResponse(
      <OgMapFrame
        mapDataUri={`data:image/png;base64,${Buffer.from(png).toString('base64')}`}
        title={data.title}
        subtitle={data.subtitle}
      />,
      { ...OG_SIZE, fonts: await loadOgFonts() },
    );
  }

  return { generateImageMetadata, Image };
}
```

- [ ] **Step 2: `apt/[id]/opengraph-image.tsx` 교체**

```tsx
import { cache } from 'react';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo/og';
import { createOgMapRoute } from '@/lib/seo/og-map-route';
import { resolveOgMapTarget } from '@/lib/seo/og-coord';
import { getPropertyById } from '@/lib/property';
import { PropertyType } from '@prisma/client';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const ALLOWED: PropertyType[] = [PropertyType.APARTMENT];

// 팩토리가 generateImageMetadata와 Image에서 각각 부르므로 요청 단위로 dedupe한다.
const load = cache(async ({ id }: { id: string }) => {
  if (!/^\d+$/.test(id)) return null;
  const propId = BigInt(id);
  const property = await getPropertyById(propId).catch(() => null);
  // ID 공간 공유 → 유형 필터 필수. 없으면 타 유형의 OG를 방출한다.
  if (!property || !ALLOWED.includes(property.propertyType)) return null;
  const target = await resolveOgMapTarget(propId);
  if (!target) return null;
  return {
    title: property.name,
    subtitle: `${property.region.fullName} · 임장ON`,
    alt:
      target.kind === 'precise'
        ? `${property.name} 위치 지도`
        : `${property.region.fullName} 일대 지도`,
    lat: target.lat,
    lng: target.lng,
    level: target.level,
    marker: target.marker,
  };
});

const route = createOgMapRoute(load);
export const generateImageMetadata = route.generateImageMetadata;
export default route.Image;
```

기존의 `export const alt = '아파트 실거래가'`는 사라진다 — `alt`가 갈래마다 달라져야 해서 `load`가 만든다.

**빌드가 재내보내기(`export const generateImageMetadata = route.generateImageMetadata`)를 인식하지 못하면**, 그때만 얇은 위임 래퍼로 바꾼다. 로직은 여전히 팩토리에만 있다:

```tsx
export async function generateImageMetadata(ctx: { params: Promise<{ id: string }> }) {
  return route.generateImageMetadata(ctx);
}
export default async function Image(ctx: { params: Promise<{ id: string }> }) {
  return route.Image(ctx);
}
```

- [ ] **Step 3: `villa` / `officetel` 교체**

Step 2와 같되 `ALLOWED` 한 줄만 다르다. 나머지는 글자 하나까지 동일하다.

```tsx
// villa — 빌라 = 연립·다세대
const ALLOWED: PropertyType[] = [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX];
```

```tsx
// officetel
const ALLOWED: PropertyType[] = [PropertyType.OFFICETEL];
```

- [ ] **Step 4: 엔트리에 합성 로직이 남지 않았는지 확인**

```bash
grep -rn "ImageResponse\|fetchStaticMapPng\|base64" app/\(public\)/apt app/\(public\)/villa app/\(public\)/officetel
```

기대: **출력 없음.** 하나라도 걸리면 그 엔트리는 팩토리를 우회하고 있다.

- [ ] **Step 5: 타입·린트 검사**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과

- [ ] **Step 6: 빌드가 라우트를 받아들이는지 확인**

Run: `pnpm build`
Expected: 성공. `generateImageMetadata` 관련 에러가 나면 Step 2의 얇은 래퍼 대안으로 바꾸고 다시 빌드한다.

- [ ] **Step 7: 커밋**

```bash
git add lib/seo/og-map-route.tsx 'app/(public)/apt/[id]/opengraph-image.tsx' 'app/(public)/villa/[id]/opengraph-image.tsx' 'app/(public)/officetel/[id]/opengraph-image.tsx'
git commit -m "feat(seo): 지도 OG 공용 팩토리 + 매물 상세 og:image 교체"
```

---

## Task 10: 시설·청약 상세 OG 5종

지역 centroid 폴백을 적용하지 않는다. 좌표가 있으면 지도, 없으면 생략이다.

**Files:**
- Modify: `app/(public)/subscription/[id]/opengraph-image.tsx`
- Modify: `app/(public)/school/[sigunguCode]/[id]/opengraph-image.tsx`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/opengraph-image.tsx`
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/opengraph-image.tsx`
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/opengraph-image.tsx`

**Interfaces:**
- Consumes: `createOgMapRoute` · `OgMapData` (Task 9), `getMapEntityLatLng` (Task 2)
- Produces: 없음 (라우트)

각 엔트리는 Task 9의 매물 엔트리와 **같은 모양**이다: 상수 export + `load` + 팩토리 2줄. 합성 로직은 팩토리에만 있다.

- [ ] **Step 1: `subscription/[id]/opengraph-image.tsx` 교체**

```tsx
import { cache } from 'react';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/seo/og';
import { createOgMapRoute } from '@/lib/seo/og-map-route';
import { getMapEntityLatLng } from '@/lib/seo/map-entity';
import { getSubscriptionById } from '@/lib/subscription';

export const runtime = 'nodejs';
export const revalidate = 86_400;
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const load = cache(async ({ id }: { id: string }) => {
  if (!/^\d+$/.test(id)) return null;
  const noticeId = BigInt(id);
  const notice = await getSubscriptionById(noticeId).catch(() => null);
  if (!notice) return null;
  // 시설·청약은 원본 공공데이터에 좌표가 실려 오므로 지역 폴백을 두지 않는다.
  const coord = await getMapEntityLatLng('subscription', noticeId);
  if (!coord) return null;
  return {
    title: notice.name,
    subtitle: `${notice.regionName ?? '공공데이터 부동산'} · 임장ON`,
    alt: `${notice.name} 위치 지도`,
    lat: coord.lat,
    lng: coord.lng,
    level: 16,
    marker: true,
  };
});

const route = createOgMapRoute(load);
export const generateImageMetadata = route.generateImageMetadata;
export default route.Image;
```

`notice.name` / `notice.regionName`은 이 파일이 교체 전에도 쓰던 필드 그대로다 (`getSubscriptionById`는 `lib/subscription.ts:543`).

- [ ] **Step 2: 나머지 4개 교체**

Step 1과 같은 모양이다. 파일마다 다른 건 **엔티티 조회 함수, `kind`, `title`/`subtitle` 계산식** 셋뿐이며, 그 세 가지는 **교체 전 그 파일이 이미 쓰던 것을 그대로 재사용**한다 (기존 `const title = …` / `const subtitle = …` 줄이 이미 들어 있다). `alt`는 `` `${title} 위치 지도` ``, `level`은 `16`, `marker`는 `true`로 전부 같다.

| 파일 | `kind` |
|---|---|
| `school/[sigunguCode]/[id]/opengraph-image.tsx` | `'school'` |
| `medical/hospital/[sigunguCode]/[id]/opengraph-image.tsx` | `'hospital'` |
| `medical/pharmacy/[sigunguCode]/[id]/opengraph-image.tsx` | `'pharmacy'` |
| `childcare/[sigunguCode]/[id]/opengraph-image.tsx` | `'childcare'` |

이 4개는 라우트 세그먼트가 `[sigunguCode]/[id]`라 `load`의 인자 타입이 `{ sigunguCode: string; id: string }`이다. `sigunguCode`는 쓰지 않으므로 구조분해에서 `{ id }`만 꺼낸다.

- [ ] **Step 2b: 엔트리에 합성 로직이 남지 않았는지 확인**

```bash
grep -rn "ImageResponse\|fetchStaticMapPng\|base64\|OgMapFrame" app/\(public\)/subscription app/\(public\)/school app/\(public\)/medical app/\(public\)/childcare
```

기대: **출력 없음.**

- [ ] **Step 3: 정적 `alt` export가 남지 않았는지 확인**

```bash
grep -rn "^export const alt" app
```

기대: **`app/opengraph-image.tsx:7` 한 줄만** 나온다. 홈은 브랜드 카드 하나뿐이라 정적 `alt`가 맞다. 상세 페이지 쪽(`app/(public)/…`)이 한 줄이라도 걸리면 그 파일은 `generateImageMetadata`로 옮기다 만 상태다.

- [ ] **Step 4: 타입·린트 검사**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과

- [ ] **Step 5: 커밋**

```bash
git add 'app/(public)/subscription' 'app/(public)/school' 'app/(public)/medical' 'app/(public)/childcare'
git commit -m "feat(seo): 시설·청약 상세 og:image를 지도로 교체 + 좌표 없으면 생략"
```

---

## Task 11: 지도 없는 상세의 OG 제거 (board / finance)

**Files:**
- Delete: `app/(public)/board/[id]/opengraph-image.tsx`
- Delete: `app/(public)/finance/[seq]/opengraph-image.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 두 파일 삭제**

```bash
git rm 'app/(public)/board/[id]/opengraph-image.tsx' 'app/(public)/finance/[seq]/opengraph-image.tsx'
```

- [ ] **Step 2: `OgFrame`이 홈에서만 쓰이는지 확인**

```bash
grep -rn "OgFrame" app lib | grep -v "OgMapFrame"
```

기대: `lib/seo/og.tsx`의 정의 1줄과 `app/opengraph-image.tsx`의 사용 1줄, 총 2줄만 나온다.

- [ ] **Step 3: 타입·린트 검사**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 통과

- [ ] **Step 4: 커밋**

```bash
git add -A 'app/(public)/board' 'app/(public)/finance'
git commit -m "feat(seo): 지도 없는 게시판·금융 상세의 og:image 제거"
```

---

## Task 12: 성능 게이트 + 최종 검증

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md` (측정 결과 기록)

**Interfaces:**
- Consumes: Task 1~11 전부
- Produces: 없음

- [ ] **Step 1: 전체 테스트 통과 확인**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 셋 다 통과

- [ ] **Step 2: 프로덕션 DB에서 centroid 쿼리 실행계획 확인**

프로덕션 Postgres(OCI 박스)로 SSH 터널을 연 뒤, **읽기 전용**으로 아래를 실행한다. 매물이 가장 많은 읍면동·시군구를 먼저 찾고 그 코드로 실행계획을 본다.

```sql
-- 1) 대상 고르기
SELECT "regionCode", count(*) AS n
FROM "Property" WHERE "propertyType" = 'APARTMENT' AND location IS NOT NULL
GROUP BY "regionCode" ORDER BY n DESC LIMIT 1;

SELECT left("regionCode", 5) AS sgg, count(*) AS n
FROM "Property" WHERE "propertyType" = 'APARTMENT' AND location IS NOT NULL
GROUP BY 1 ORDER BY n DESC LIMIT 1;
```

```sql
-- 2) 읍면동 스코프 (위에서 얻은 regionCode로 치환)
EXPLAIN ANALYZE
WITH pts AS (
  SELECT location::geometry AS g FROM "Property"
  WHERE "propertyType" = 'APARTMENT'::"PropertyType"
    AND "regionCode" = '<TOP_DONG_CODE>'
    AND location IS NOT NULL
    AND ST_Y(location::geometry) BETWEEN 33.0 AND 38.7
    AND ST_X(location::geometry) BETWEEN 124.5 AND 132.0
), agg AS (SELECT ST_Collect(g) AS c, count(*)::int AS n FROM pts)
SELECT n, ST_Y(ST_Centroid(c)), ST_X(ST_Centroid(c)),
       ST_Distance(
         ST_SetSRID(ST_MakePoint(ST_XMin(c), ST_YMin(c)), 4326)::geography,
         ST_SetSRID(ST_MakePoint(ST_XMax(c), ST_YMax(c)), 4326)::geography
       )
FROM agg WHERE n > 0;
```

```sql
-- 3) 시군구 스코프 (LIKE prefix)
EXPLAIN ANALYZE
WITH pts AS (
  SELECT location::geometry AS g FROM "Property"
  WHERE "propertyType" = 'APARTMENT'::"PropertyType"
    AND "regionCode" LIKE '<TOP_SGG_CODE>%'
    AND location IS NOT NULL
    AND ST_Y(location::geometry) BETWEEN 33.0 AND 38.7
    AND ST_X(location::geometry) BETWEEN 124.5 AND 132.0
), agg AS (SELECT ST_Collect(g) AS c, count(*)::int AS n FROM pts)
SELECT n FROM agg WHERE n > 0;
```

**통과 조건:** 두 실행계획 모두 `Property` 접근이 `Index Scan` 또는 `Bitmap Index Scan`이다 — **어느 인덱스든 무방하다.** 실행 시간이 `800ms`에 근접하면 임계값 재검토가 필요하다.

> **인덱스 이름을 고정하지 않는 이유 (2026-07-27 정정).** 최초 계획은 `Property_propertyType_regionCode_idx`를 콕 집었는데, 그 근거였던 "`sigunguCode`엔 인덱스가 없다"가 **거짓**으로 드러났다. DB에는 `Property_sigunguCode_idx`와 `Property_type_sgg_lasttx_idx`도 있고, `sigunguCode`는 `LEFT(regionCode,5)` 생성 컬럼이다(`schema.prisma`엔 안 보인다 — Prisma가 생성 컬럼을 선언하지 못해 raw 마이그레이션으로 들어갔다). 플래너가 어느 걸 고르든 정확성은 같으므로, 실측 결과를 그대로 받는다.

**추가 측정 (시군구 스코프에 한해):** 현재 predicate `"regionCode" LIKE '<SGG>%'`와 대안 `"sigunguCode" = '<SGG>'`를 **둘 다** `EXPLAIN ANALYZE`로 돌려 비교한다. 두 predicate는 같은 행을 반환한다. 후자가 유의미하게 빠르면(예: 2배 이상) 그 사실을 기록하고 쿼리 교체를 별도 결정 항목으로 올린다 — 이 태스크에서 임의로 바꾸지 않는다.

**`Seq Scan`이면** 조건 순서와 enum 형변환을 점검한다 (`${propertyType}::"PropertyType"` 캐스트가 인덱스 사용을 막는지). 그래도 안 되면 여기서 멈추고 인덱스 추가 여부를 사람에게 물어본다 — 임의로 마이그레이션을 만들지 않는다.

- [ ] **Step 3: 측정 결과를 스펙에 기록**

스펙 8절 "성능 게이트" 항목 아래에 실측 한 줄을 덧붙인다.

```markdown
**실측 (2026-07-27, 프로덕션):** 읍면동 최대 스코프 `<code>` `<n>`건 → `<scan type>`, `<ms>` ms. 시군구 최대 스코프 `<code>` `<n>`건 → `<scan type>`, `<ms>` ms.
```

- [ ] **Step 4: 커밋 후 PR 생성**

```bash
git add docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md
git commit -m "docs(seo): centroid 쿼리 실행계획 실측 결과 기록"
git push -u origin HEAD
gh pr create --base main --title "feat(seo): 네이버 검색 썸네일 og:image 지도화" --body "$(cat <<'EOF'
## 요약

네이버 검색 결과의 빈 파란 썸네일을 없애고, 문서에 해당하는 지도가 대표 이미지로 나가게 한다.

- `og:image`를 지도(1024×538 NCP raster + 중앙정렬 캡션 바)로 합성
- 지도를 만들 수 없으면 `generateImageMetadata()`가 빈 배열을 반환해 메타 태그 자체를 생략
- 매물 상세는 좌표 결측 시 같은 읍면동/시군구 centroid로 폴백 (마커 없음, 넓은 배율, og:image 전용)
- 임의 좌표를 받던 공개 프록시 `/api/staticmap` 삭제 → 엔티티 참조 `/map/{kind}/{id}`로 대체

설계: `docs/superpowers/specs/2026-07-27-naver-search-thumbnail-og-map-design.md`

## 알려진 대가

이미 색인된 `/api/staticmap?...` 이미지 URL이 404가 되어, 현재 지도 썸네일이 나오던 문서가 재크롤 전까지 일시적으로 썸네일을 잃을 수 있다. 배포 후 서치어드바이저 수집 요청으로 앞당긴다.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JoosvD9WRmRs3dENhjyd2s
EOF
)"
```

- [ ] **Step 5: 배포 후 확인 (머지 이후)**

**총 5건 이내. 버스트 금지.**

> ⚠️ **`/apt/{id}/opengraph-image`를 직접 치면 404다.** `generateImageMetadata`가 `id: 'map'`인 항목을 반환하므로 Next가 실제 URL에 `/map` 세그먼트와 해시를 덧붙인다(`/apt/420/opengraph-image-7si1qk/map?c22574531c82b691`). 해시는 빌드마다 달라지므로 **추측하지 말고 HTML에서 뽑아 쓴다.** (2026-07-27 로컬 실측으로 확인.)

```bash
# 좌표 있는 매물: HTML에서 og:image URL을 뽑아 그 URL을 친다
OG=$(curl -s https://imjangon.co.kr/apt/<ID_WITH_COORD> \
     | grep -oE '<meta property="og:image" content="[^"]+"' | sed 's/.*content="//; s/"$//')
echo "$OG"
curl -sI "$OG" | grep -iE '^(HTTP/|content-type)'

# 새 지도 라우트 → 200 image/png
curl -sI https://imjangon.co.kr/map/property/<ID_WITH_COORD> | grep -iE '^(HTTP/|content-type)'

# 게시판 글 → og:image 태그 없음
curl -s https://imjangon.co.kr/board/<POST_ID> | grep -c 'og:image'
```

기대: 앞의 둘은 `200` + `content-type: image/png`, 마지막은 `0`.

**로컬 실측 기준선 (2026-07-27, property 420):** og:image는 662,017바이트 PNG(매직 `89504e47`), `og:image:alt`는 `"신규단지 위치 지도"`(precise 분기). 프로덕션 값이 이와 크게 다르면 원인을 찾는다.

- [ ] **Step 6: 네이버 서치어드바이저 수집 요청**

서치어드바이저 → 요청 → 웹 페이지 수집에 대표 URL 몇 개(매물 상세 2~3건, 게시판 1건)를 등록한다.

**썸네일이 실제로 바뀌는 건 크롤러 재수집 후 수 일이 걸린다. 배포 직후에 "고쳐졌다"고 판단할 수 없다.** 며칠 뒤 `site:imjangon.co.kr 실거래`로 재확인한다.

---

## Self-Review

**1. 스펙 coverage**

| 스펙 절 | 담당 태스크 |
|---|---|
| 3. og:image 결정 규칙 (매물) | Task 7, 9 |
| 3. 시설·청약 규칙 | Task 10 |
| 3. 홈 / board / finance | Task 8 (홈 중앙정렬), Task 11 |
| 3. 정직성 경계 (폴백은 og 전용) | Task 5 Step 5 (JSON-LD `coord ?` 게이트 유지), Task 7 |
| 3. 캡션 | Task 8 |
| 4. `resolveOgMapTarget` + 폴백 순서 | Task 7 |
| 4. 유효성 게이트 (bbox / 표본 / 산포) | Task 7 Step 1·3 |
| 4. 제한시간 800ms | Task 7 Step 3 (`SET LOCAL statement_timeout`) |
| 4. 캐싱 (스코프별 24h) | Task 7 Step 3 (`unstable_cache`) |
| 5. `/map/{kind}/{id}` | Task 2, 4 |
| 5. `/api/staticmap` 삭제 + robots | Task 6 |
| 5. `fetchStaticMapPng` | Task 3 |
| 5. `static-map.ts` 엔티티 URL 빌더 | Task 5 |
| 6. `OgMapFrame` / `OgFrame` | Task 8 |
| 6. 1024×538 원본 | Task 9, 10 |
| 6. 조건부 제거 + 검증 | Task 1, 9, 10 |
| 7. 에러 처리 | Task 4 (라우트), 7 (centroid), 9·10 (OG) |
| 8. 테스트 | Task 2, 3, 7, 8 |
| 8. EXPLAIN ANALYZE | Task 12 |
| 8. 배포 후 수동 확인 | Task 12 |
| 10. 완료 조건 | Task 12 |

**2. Placeholder scan**

Task 10 Step 2에 "그 파일이 지금 쓰고 있는 조회 함수와 title/subtitle 계산식을 재사용한다"는 지시가 남아 있다. 이건 플레이스홀더가 아니라 **의도적 위임**이다 — 4개 파일의 기존 조회 함수와 표시 문구가 제각각이라 여기 전부 복사하면 오히려 실제 코드와 어긋날 위험이 크다. 그 외 필드(`alt`·`level`·`marker`)는 전부 고정값으로 명시했고, 구조는 Step 1에 완전한 코드로 제시했다.

**3. 타입 일관성**

- `MapEntityKind` — Task 2 정의, Task 4·5에서 동일 이름 사용 ✓
- `parseMapEntityId` — Task 2 정의, Task 4 사용 ✓ (초안의 `parseEntityId`를 통일함)
- `fetchStaticMapPng(StaticMapRequest)` — Task 3 정의, Task 4·9·10 사용. 모든 호출부가 `lat/lng/w/h/level/marker` 6필드를 채운다 ✓
- `mapImagePath` / `mapImageUrl` — Task 5 정의, 같은 태스크 안에서 소비 ✓
- `OgMapTarget` — Task 7 정의(`scopeLabel` 없음), Task 9의 `load`가 `kind`/`lat`/`lng`/`level`/`marker`만 사용 ✓
- `OgMapFrame({ mapDataUri, title, subtitle })` — Task 8 정의, Task 9의 팩토리만 사용 (엔트리는 직접 안 씀) ✓
- `createOgMapRoute<P>(load)` / `OgMapData` — Task 9 정의, Task 10의 5개 엔트리가 소비. `load`는 **resolved params**를 받는다(팩토리가 `await params` 함) ✓
- `OgMapData.level`/`marker` — Task 9 매물 엔트리는 `target`에서, Task 10 시설 엔트리는 `16`/`true` 고정값에서 채운다 ✓
- `LocationViewer`의 `mapKind`/`mapId` — Task 5 Step 3 정의, Step 4 표의 11곳이 동일 이름 사용 ✓
