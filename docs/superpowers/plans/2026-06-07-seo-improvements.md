# SEO 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** imjang-on 상세 페이지에 JSON-LD 구조화 데이터, 동적 OG 이미지/트위터 카드, 검색 썸네일용 정적 지도(네이버 Static Map 프록시)를 추가해 SEO 노출을 강화한다.

**Architecture:** Next.js App Router 네이티브 기능만 사용. (1) `/api/staticmap` 라우트가 NCP Static Map raster를 헤더 인증으로 프록시·캐시 → 상세 페이지에 실제 `<img>`로 삽입하고 JSON-LD `image`·OG 배경에 재사용. (2) `lib/seo/`에 순수 빌더(JSON-LD, 정적 지도 URL)와 OG 템플릿을 모아 페이지에서 호출. 새 런타임 의존성 없음.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, `next/og`(내장), Vitest, zod, NCP Static Map API.

**참고 스펙:** `docs/superpowers/specs/2026-06-07-seo-improvements-design.md`

---

## File Structure

신규:
- `lib/seo/static-map.ts` — 정적 지도 프록시 URL 빌더(순수). `staticMapPath`, `staticMapUrl`.
- `app/api/staticmap/route.ts` — NCP Static Map 프록시 GET 핸들러.
- `components/ui/static-map.tsx` — 상세 페이지에 삽입할 정적 지도 `<img>` 서버 컴포넌트.
- `lib/seo/json-ld.tsx` — JSON-LD 빌더(순수) + `<JsonLd>` 컴포넌트.
- `lib/seo/og.tsx` — OG 공용 템플릿(`OgFrame`), 크기 상수(`OG_SIZE`), 한글 폰트 로더(`loadOgFonts`).
- `lib/seo/fonts/Pretendard-Bold.otf` — OG용 한글 폰트(번들 자산).
- `app/opengraph-image.tsx` — 사이트 기본 OG 이미지.
- `app/(public)/apt/[id]/opengraph-image.tsx`, `.../officetel/[id]/opengraph-image.tsx`, `.../villa/[id]/opengraph-image.tsx`, `.../region/[code]/opengraph-image.tsx`, `.../subscription/[id]/opengraph-image.tsx` — 라우트별 동적 OG.
- `tests/lib/static-map.test.ts`, `tests/lib/json-ld.test.ts` — 순수 빌더 단위 테스트.

수정:
- `lib/env.ts` — `NAVER_MAP_CLIENT_SECRET` 추가.
- `app/layout.tsx` — 트위터 카드 메타 + 루트 Organization/WebSite JSON-LD.
- 상세 페이지들 — 정적 지도 `<img>` + JSON-LD 주입.
- `.env.test`, `.env.local` — 로컬 테스트용 시크릿(수동, 값은 개발자가 입력).

---

## Task 1: 환경변수 추가

**Files:**
- Modify: `lib/env.ts:14`

- [ ] **Step 1: `NAVER_MAP_CLIENT_SECRET`를 env 스키마에 추가**

`lib/env.ts`의 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: z.string().optional(),` 다음 줄에 추가:

```ts
  NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: z.string().optional(),
  NAVER_MAP_CLIENT_SECRET: z.string().optional(),
```

- [ ] **Step 2: 타입체크로 검증**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/env.ts
git commit -m "feat(seo): NAVER_MAP_CLIENT_SECRET env 추가"
```

> 참고: 운영(Vercel)에는 이미 등록됨. 로컬 테스트 시 `.env.local`(개발), `.env.test`(테스트)에 동일 값을 직접 넣어야 `/api/staticmap`이 실제 이미지를 반환한다. 값이 없으면 라우트는 503을 반환한다(아래 Task 2에서 처리).

---

## Task 2: 정적 지도 URL 빌더 (TDD)

**Files:**
- Create: `lib/seo/static-map.ts`
- Test: `tests/lib/static-map.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/static-map.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { staticMapPath, staticMapUrl } from '@/lib/seo/static-map';

describe('staticMapPath', () => {
  it('builds a relative proxy path with defaults', () => {
    const path = staticMapPath({ lat: 37.5, lng: 127.1 });
    expect(path).toBe('/api/staticmap?lat=37.5&lng=127.1&w=600&h=400&level=16');
  });

  it('honors overrides', () => {
    const path = staticMapPath({ lat: 37.5, lng: 127.1, w: 800, h: 300, level: 14 });
    expect(path).toBe('/api/staticmap?lat=37.5&lng=127.1&w=800&h=300&level=14');
  });
});

describe('staticMapUrl', () => {
  it('prefixes the site origin for absolute usage (JSON-LD/OG)', () => {
    const url = staticMapUrl({ lat: 37.5, lng: 127.1 });
    expect(url.startsWith('http')).toBe(true);
    expect(url.endsWith('/api/staticmap?lat=37.5&lng=127.1&w=600&h=400&level=16')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:unit static-map`
Expected: FAIL — `Cannot find module '@/lib/seo/static-map'`.

- [ ] **Step 3: 구현**

`lib/seo/static-map.ts`:

```ts
import { SITE_URL } from '@/lib/site';

export interface StaticMapParams {
  lat: number;
  lng: number;
  w?: number;
  h?: number;
  level?: number;
}

const DEFAULTS = { w: 600, h: 400, level: 16 } as const;

/** 정적 지도 프록시의 상대 경로 (`<img src>`용). */
export function staticMapPath({
  lat,
  lng,
  w = DEFAULTS.w,
  h = DEFAULTS.h,
  level = DEFAULTS.level,
}: StaticMapParams): string {
  return `/api/staticmap?lat=${lat}&lng=${lng}&w=${w}&h=${h}&level=${level}`;
}

/** 절대 URL (JSON-LD `image`, OG fetch용). */
export function staticMapUrl(params: StaticMapParams): string {
  return `${SITE_URL}${staticMapPath(params)}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:unit static-map`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/static-map.ts tests/lib/static-map.test.ts
git commit -m "feat(seo): 정적 지도 프록시 URL 빌더"
```

---

## Task 3: 정적 지도 프록시 라우트

**Files:**
- Create: `app/api/staticmap/route.ts`

- [ ] **Step 1: 라우트 핸들러 작성**

`app/api/staticmap/route.ts`:

```ts
// NCP Static Map(raster)을 헤더 인증으로 프록시한다. 키를 클라이언트에 노출하지 않고
// 좌표별 이미지를 장기 캐시해 검색 썸네일/JSON-LD/OG에 재사용한다.
export const revalidate = 2_592_000; // 30일

const NCP_ENDPOINT = 'https://maps.apigw.ntruss.com/map-static/v2/raster';

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response('invalid coordinates', { status: 400 });
  }
  const w = clampInt(searchParams.get('w'), 600, 1, 1024);
  const h = clampInt(searchParams.get('h'), 400, 1, 1024);
  const level = clampInt(searchParams.get('level'), 16, 1, 20);

  const keyId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!keyId || !secret) return new Response('map not configured', { status: 503 });

  const upstream = new URL(NCP_ENDPOINT);
  upstream.searchParams.set('w', String(w));
  upstream.searchParams.set('h', String(h));
  upstream.searchParams.set('center', `${lng},${lat}`);
  upstream.searchParams.set('level', String(level));
  upstream.searchParams.set('format', 'png');
  upstream.searchParams.set('scale', '2');
  upstream.searchParams.set('markers', `type:d|size:mid|pos:${lng} ${lat}`);

  const res = await fetch(upstream, {
    headers: {
      'x-ncp-apigw-api-key-id': keyId,
      'x-ncp-apigw-api-key': secret,
    },
    next: { revalidate },
  });
  if (!res.ok) {
    return new Response(`upstream error ${res.status}`, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control':
        'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
    },
  });
}
```

- [ ] **Step 2: 실제 호출 검증 (외부 API — 필수)**

로컬 `.env.local`에 `NAVER_MAP_CLIENT_SECRET` 값을 넣은 뒤 `pnpm dev` 실행, 브라우저에서:
`http://localhost:3000/api/staticmap?lat=37.5759&lng=126.9769`

Expected: 마커가 찍힌 지도 PNG 이미지가 표시됨.

**만약 401/엔드포인트 오류가 나면:** NCP 신키(`ncpKeyId`) 체계와 APIGW 엔드포인트가 다를 수 있다. `NCP_ENDPOINT`를 `https://naveropenapi.apigw.ntruss.com/map-static/v2/raster`로 바꿔 재시도한다. 그래도 실패하면 NCP 콘솔의 Static Map "API 사용 신청" 상태와 인증 헤더 이름을 문서로 재확인한다. (이 단계는 외부 API라 코드만으로 보장 불가 — 반드시 실물 확인)

- [ ] **Step 3: 타입체크 + 빌드 확인**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/api/staticmap/route.ts
git commit -m "feat(seo): NCP Static Map 프록시 라우트"
```

---

## Task 4: 정적 지도 이미지 컴포넌트

**Files:**
- Create: `components/ui/static-map.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`components/ui/static-map.tsx`:

```tsx
import { staticMapPath } from '@/lib/seo/static-map';

interface Props {
  lat: number;
  lng: number;
  name: string;
  /** 표시 너비/높이(px). 기본 600x400. */
  width?: number;
  height?: number;
}

/**
 * 검색 썸네일 후보가 되는 실제 <img>. 인터랙티브 지도(LocationViewer)와 별개로,
 * JS 없이도 마크업에 존재한다. next/image 대신 plain <img>로 직접 URL을 노출한다.
 */
export function StaticMapImage({ lat, lng, name, width = 600, height = 400 }: Props) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={staticMapPath({ lat, lng, w: width, h: height })}
      alt={`${name} 위치 지도`}
      width={width}
      height={height}
      className="mb-3 w-full rounded-2xl border border-[var(--color-line)] object-cover"
    />
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add components/ui/static-map.tsx
git commit -m "feat(seo): 정적 지도 이미지 컴포넌트"
```

---

## Task 5: 상세 페이지에 정적 지도 삽입

각 상세 페이지의 기존 `{coord && (<Card id="map"> ... <LocationViewer .../> </Card>)}` 블록에서 `<LocationViewer ...>` **바로 위**에 `<StaticMapImage ...>`를 추가한다. import 한 줄과 컴포넌트 한 줄, 두 군데만 수정.

**대상 파일 (coord 보유):**
- `app/(public)/apt/[id]/page.tsx`
- `app/(public)/officetel/[id]/page.tsx`
- `app/(public)/villa/[id]/page.tsx`
- `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
- `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
- `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`
- `app/(public)/school/[sigunguCode]/[id]/page.tsx`
- `app/(public)/subscription/[id]/page.tsx`

> amenity/[category]/[id], urban/[category]/[id], urban/charger/[id]는 좌표 객체 이름이 다를 수 있으니, 해당 페이지에서 `LocationViewer`에 넘기는 lat/lng/name 변수를 그대로 사용한다(같은 패턴 적용).

- [ ] **Step 1: import 추가 (각 파일)**

기존 `import { LocationViewer } from '@/components/ui/location-viewer';` 아래에 추가:

```tsx
import { StaticMapImage } from '@/components/ui/static-map';
```

- [ ] **Step 2: `<StaticMapImage>` 삽입 (각 파일)**

예시 — `app/(public)/apt/[id]/page.tsx` (line 80~85 부근):

```tsx
            <Card id="map">
              <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">
                위치 · 로드뷰
              </h2>
              <StaticMapImage lat={coord.lat} lng={coord.lng} name={property.name} />
              <LocationViewer lat={coord.lat} lng={coord.lng} name={property.name} />
            </Card>
```

다른 페이지도 동일하게 `<LocationViewer ...>` 위에 같은 props로 `<StaticMapImage ...>` 한 줄 추가. (hospital은 `name={hospital.name}`, school은 `name={school.name}` 등 해당 페이지의 엔티티 이름 사용.)

- [ ] **Step 3: 빌드/타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 4: 시각 확인**

`pnpm dev` 후 아무 아파트 상세 페이지 접속 → 인터랙티브 지도 위에 정적 지도 이미지가 보이는지, 페이지 소스(HTML)에 `<img src="/api/staticmap...">`가 있는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)"
git commit -m "feat(seo): 상세 페이지에 검색 썸네일용 정적 지도 삽입"
```

---

## Task 6: JSON-LD 빌더 (TDD)

**Files:**
- Create: `lib/seo/json-ld.tsx`
- Test: `tests/lib/json-ld.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/json-ld.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  organizationSchema,
  webSiteSchema,
  breadcrumbSchema,
  residenceSchema,
  placeSchema,
} from '@/lib/seo/json-ld';

describe('organizationSchema', () => {
  it('has Organization type and name', () => {
    const s = organizationSchema();
    expect(s['@type']).toBe('Organization');
    expect(s.name).toBe('임장온');
    expect(typeof s.url).toBe('string');
  });
});

describe('webSiteSchema', () => {
  it('exposes a SearchAction pointing at the list page', () => {
    const s = webSiteSchema();
    expect(s['@type']).toBe('WebSite');
    expect(s.potentialAction['@type']).toBe('SearchAction');
    expect(String(s.potentialAction.target.urlTemplate)).toContain('/list');
  });
});

describe('breadcrumbSchema', () => {
  it('numbers positions starting at 1', () => {
    const s = breadcrumbSchema([
      { name: '홈', url: 'https://x/' },
      { name: '병원', url: 'https://x/medical/hospital' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement[0].position).toBe(1);
    expect(s.itemListElement[1].position).toBe(2);
    expect(s.itemListElement[1].name).toBe('병원');
  });
});

describe('residenceSchema', () => {
  it('maps address/geo/image', () => {
    const s = residenceSchema({
      name: '래미안',
      address: '서울 송파구 송파대로 345',
      lat: 37.5,
      lng: 127.1,
      url: 'https://x/apt/1',
      image: 'https://x/api/staticmap?lat=37.5&lng=127.1',
    });
    expect(s['@type']).toBe('Residence');
    expect(s.address['@type']).toBe('PostalAddress');
    expect(s.address.addressCountry).toBe('KR');
    expect(s.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 37.5, longitude: 127.1 });
    expect(s.image).toContain('/api/staticmap');
  });

  it('omits geo when coords missing', () => {
    const s = residenceSchema({ name: 'x', address: 'y', url: 'https://x/apt/2' });
    expect(s.geo).toBeUndefined();
  });
});

describe('placeSchema', () => {
  it('uses the given schema.org type', () => {
    const s = placeSchema({
      type: 'Hospital',
      name: '온가족정신건강의학과의원',
      address: '서울 송파구 송파대로 345',
      lat: 37.5,
      lng: 127.1,
      url: 'https://x/medical/hospital/11710/1',
    });
    expect(s['@type']).toBe('Hospital');
    expect(s.name).toContain('온가족');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test:unit json-ld`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

`lib/seo/json-ld.tsx`:

```tsx
import { SITE_URL } from '@/lib/site';

type Json = Record<string, unknown>;

const ctx = { '@context': 'https://schema.org' } as const;

export function organizationSchema(): Json {
  return {
    ...ctx,
    '@type': 'Organization',
    name: '임장온',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  };
}

export function webSiteSchema(): Json {
  return {
    ...ctx,
    '@type': 'WebSite',
    name: '임장온',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/list?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): Json {
  return {
    ...ctx,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

interface PlaceInput {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  image?: string;
}

function geoOf(lat?: number | null, lng?: number | null): Json | undefined {
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  return { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
}

function postalAddress(address: string): Json {
  return { '@type': 'PostalAddress', addressCountry: 'KR', streetAddress: address };
}

export function residenceSchema(input: PlaceInput): Json {
  return {
    ...ctx,
    '@type': 'Residence',
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
  };
}

export type PlaceType = 'School' | 'Hospital' | 'Pharmacy' | 'ChildCare';

export function placeSchema(input: PlaceInput & { type: PlaceType }): Json {
  return {
    ...ctx,
    '@type': input.type,
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
  };
}

/** JSON-LD를 <script>로 렌더한다. 페이지/레이아웃에서 직접 사용. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test:unit json-ld`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/json-ld.tsx tests/lib/json-ld.test.ts
git commit -m "feat(seo): JSON-LD 빌더 + JsonLd 컴포넌트"
```

---

## Task 7: 루트 Organization/WebSite JSON-LD + 트위터 카드

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: import 추가**

`app/layout.tsx` 상단 import 블록에 추가:

```tsx
import { JsonLd, organizationSchema, webSiteSchema } from '@/lib/seo/json-ld';
```

- [ ] **Step 2: 트위터 카드 메타 추가**

`metadata` 객체의 `openGraph` 블록 다음에 추가:

```tsx
  openGraph: {
    locale: 'ko_KR',
    type: 'website',
    siteName: '임장온',
  },
  twitter: {
    card: 'summary_large_image',
  },
```

- [ ] **Step 3: `<body>` 안에 JSON-LD 주입**

`<body>` 내부 `{children}` 위에 추가:

```tsx
      <body>
        <JsonLd data={[organizationSchema(), webSiteSchema()]} />
        {children}
```

- [ ] **Step 4: 타입체크 + 빌드 일부 확인**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add app/layout.tsx
git commit -m "feat(seo): 루트 Organization/WebSite JSON-LD + 트위터 카드"
```

---

## Task 8: 상세 페이지에 JSON-LD 주입

각 상세 페이지 반환 JSX 최상단에 `<JsonLd data={...} />`를 추가한다. `image`에는 `staticMapUrl(coord)`(좌표 있을 때)를 넣는다.

**대상 + 사용 빌더:**
- apt/officetel/villa `[id]` → `residenceSchema` + `breadcrumbSchema`
- hospital → `placeSchema({ type: 'Hospital', ... })` + breadcrumb
- pharmacy → `placeSchema({ type: 'Pharmacy', ... })` + breadcrumb
- childcare → `placeSchema({ type: 'ChildCare', ... })` + breadcrumb
- school → `placeSchema({ type: 'School', ... })` + breadcrumb

- [ ] **Step 1: import 추가 (각 파일)**

```tsx
import { JsonLd, residenceSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { staticMapUrl } from '@/lib/seo/static-map';
import { SITE_URL } from '@/lib/site';
```

(시설 페이지는 `residenceSchema` 대신 `placeSchema` import.)

- [ ] **Step 2: 아파트 예시 — `app/(public)/apt/[id]/page.tsx`**

`return (` 직후 최상단 컨테이너 안 첫 줄에 추가:

```tsx
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <JsonLd
        data={[
          residenceSchema({
            name: property.name,
            address: property.region.fullName,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/apt/${property.id}`,
            image: coord ? staticMapUrl(coord) : undefined,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '아파트', url: `${SITE_URL}/apt` },
            { name: property.name, url: `${SITE_URL}/apt/${property.id}` },
          ]),
        ]}
      />
      <PropertyDetailHero property={property} region={property.region} />
```

officetel/villa는 `/apt`→`/officetel`·`/villa`, 라벨 `아파트`→`오피스텔`·`빌라`로 치환.

- [ ] **Step 3: 병원 예시 — `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`**

`return (` 직후 컨테이너 첫 줄:

```tsx
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-10">
      <JsonLd
        data={[
          placeSchema({
            type: 'Hospital',
            name: hospital.name,
            address: hospital.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '병원·의원', url: `${SITE_URL}/medical/hospital` },
            { name: hospital.name, url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}` },
          ]),
        ]}
      />
      <HospitalHero hospital={hospital} />
```

pharmacy/childcare/school은 `type`, 경로, 라벨, 엔티티 변수명만 해당 페이지에 맞게 치환(약국 `Pharmacy`/`/medical/pharmacy`, 어린이집 `ChildCare`/`/childcare`, 학교 `School`/`/school`).

- [ ] **Step 4: 타입체크 + 빌드**

Run: `pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 5: 시각/소스 확인**

`pnpm dev` → 아파트·병원 상세 페이지 소스에 `<script type="application/ld+json">`가 있고 JSON에 `image`가 정적 지도 절대 URL인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add "app/(public)"
git commit -m "feat(seo): 상세 페이지 JSON-LD(Residence/Place + Breadcrumb) 주입"
```

---

## Task 9: OG 공용 템플릿 + 한글 폰트 + 기본 OG 이미지

**Files:**
- Create: `lib/seo/fonts/Pretendard-Bold.otf` (자산)
- Create: `lib/seo/og.tsx`
- Create: `app/opengraph-image.tsx`

- [ ] **Step 1: 한글 폰트 번들**

Pretendard Bold `.otf`를 받아 `lib/seo/fonts/Pretendard-Bold.otf`로 저장.

```bash
mkdir -p lib/seo/fonts
curl -L -o lib/seo/fonts/Pretendard-Bold.otf \
  https://github.com/orioncactus/pretendard/raw/main/packages/pretendard/dist/public/static/Pretendard-Bold.otf
```

확인: `ls -la lib/seo/fonts/Pretendard-Bold.otf` → 파일 크기 > 0 (수 MB).

> satori(next/og)는 ttf/otf/woff만 지원(woff2 ❌). 용량이 부담되면 한글 서브셋 .otf로 교체 가능하나, 우선 전체 폰트로 렌더 보장.

- [ ] **Step 2: OG 템플릿/폰트 로더 작성**

`lib/seo/og.tsx`:

```tsx
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

export async function loadOgFonts() {
  const data = await readFile(join(process.cwd(), 'lib/seo/fonts/Pretendard-Bold.otf'));
  return [{ name: 'Pretendard', data, weight: 700 as const, style: 'normal' as const }];
}

/** OG 이미지 공통 레이아웃. satori 제약상 flex/명시 스타일만 사용. */
export function OgFrame({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: '#0b3d91',
        color: '#ffffff',
        fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>임장온</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.2 }}>{title}</div>
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 36, marginTop: 16, opacity: 0.9 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', fontSize: 28, opacity: 0.7 }}>
        공공데이터 부동산 실거래가
      </div>
    </div>
  );
}
```

> `readFile` + `process.cwd()`를 쓰므로 OG 라우트는 기본(Node.js) 런타임이어야 한다. 각 `opengraph-image.tsx`에서 `export const runtime = 'nodejs';`를 명시한다(Edge 런타임 금지).

- [ ] **Step 3: 기본 OG 이미지 작성**

`app/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '임장온 — 공공데이터 부동산 실거래가';

export default async function Image() {
  return new ImageResponse(
    <OgFrame title="임장온" subtitle="공공데이터로 보는 전국 부동산 실거래가" />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
```

- [ ] **Step 4: 렌더 검증 (한글 깨짐 — 필수)**

`pnpm dev` → `http://localhost:3000/opengraph-image` 접속.
Expected: 1200x630 PNG, **한글이 정상 렌더**(□ 없음).

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/fonts/Pretendard-Bold.otf lib/seo/og.tsx app/opengraph-image.tsx
git commit -m "feat(seo): OG 공용 템플릿 + 한글 폰트 + 기본 OG 이미지"
```

---

## Task 10: 라우트별 동적 OG 이미지

**Files:**
- Create: `app/(public)/apt/[id]/opengraph-image.tsx`
- Create: `app/(public)/officetel/[id]/opengraph-image.tsx`
- Create: `app/(public)/villa/[id]/opengraph-image.tsx`
- Create: `app/(public)/region/[code]/opengraph-image.tsx`
- Create: `app/(public)/subscription/[id]/opengraph-image.tsx`

- [ ] **Step 1: 아파트 OG 작성**

`app/(public)/apt/[id]/opengraph-image.tsx`:

```tsx
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPropertyById } from '@/lib/property';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '아파트 실거래가';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyById(BigInt(id)).catch(() => null);
  const title = property?.name ?? '아파트 실거래가';
  const subtitle = property?.region.fullName ?? '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
```

> 주의: Next 15에서 `params`는 Promise다. page.tsx와 동일하게 `await params`로 풀어 쓴다.

- [ ] **Step 2: officetel/villa OG 작성**

apt와 동일하되 `alt`/기본 title만 오피스텔·빌라로 치환(데이터 소스 `getPropertyById` 공통).

- [ ] **Step 3: region OG 작성**

`app/(public)/region/[code]/opengraph-image.tsx` — 지역명을 타이틀로. region 조회 유틸은 `region/[code]/page.tsx`의 `generateMetadata`가 쓰는 함수를 그대로 재사용(해당 파일에서 import 경로 확인 후 동일 사용).

```tsx
import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getRegionByCode } from '@/lib/region';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '지역 부동산 실거래가';

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const region = await getRegionByCode(code).catch(() => null);
  const title = region ? `${region.fullName} 부동산` : '지역 부동산 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle="아파트 실거래가" />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
```

> `getRegionByCode`의 실제 함수명/시그니처는 `region/[code]/page.tsx`를 열어 확인하고 맞춘다(없으면 동일 역할 함수 사용).

- [ ] **Step 4: subscription OG 작성**

`app/(public)/subscription/[id]/opengraph-image.tsx` — `subscription/[id]/page.tsx`의 generateMetadata가 쓰는 조회 함수를 재사용해 공고명/지역을 title/subtitle로.

- [ ] **Step 5: 렌더 검증**

`pnpm dev` → `http://localhost:3000/apt/<실제ID>/opengraph-image` 등 각 라우트 접속, 한글 정상 렌더 + 데이터 반영 확인.

- [ ] **Step 6: 타입체크 + 커밋**

Run: `pnpm typecheck`

```bash
git add "app/(public)"
git commit -m "feat(seo): 라우트별 동적 OG 이미지(아파트/오피스텔/빌라/지역/청약)"
```

---

## Task 11: 최종 검증

- [ ] **Step 1: 전체 단위 테스트**

Run: `pnpm test:unit`
Expected: 신규 `static-map`, `json-ld` 포함 전부 PASS.

- [ ] **Step 2: 린트 + 타입체크**

Run: `pnpm lint && pnpm typecheck`
Expected: 에러 없음.

- [ ] **Step 3: 프로덕션 빌드**

Run: `pnpm build`
Expected: 성공. OG 메타데이터 라우트/`/api/staticmap`가 빌드 그래프에 포함, 에러 없음.

- [ ] **Step 4: 구조화 데이터 수동 검증**

배포(또는 프리뷰) 후 대표 URL을 [Google Rich Results Test](https://search.google.com/test/rich-results)에 넣어 Residence/Place/BreadcrumbList 인식 확인. 경고는 기록, 오류는 빌더 수정.

- [ ] **Step 5: 검색 썸네일 확인 경로 메모**

`/api/staticmap` 이미지가 상세 페이지 마크업에 실제 `<img>`로 존재 + JSON-LD `image`로도 노출됨을 확인(렌더링된 HTML 소스). 실제 검색 썸네일 반영은 구글 크롤링 후 수일 소요 — GSC URL 검사로 추적.

- [ ] **Step 6: PR 생성**

```bash
git push -u origin feat/seo-improvements
gh pr create --title "feat(seo): JSON-LD·동적 OG·정적 지도 썸네일 추가" --body "스펙: docs/superpowers/specs/2026-06-07-seo-improvements-design.md"
```

---

## Self-Review 결과

- **스펙 커버리지:** 섹션1(JSON-LD)=Task 6~8, 섹션2(OG/트위터)=Task 9~10 + Task 7(트위터), 섹션3(기술 위생)=무변경 결정(스펙 명시) → 별도 태스크 없음, 섹션4(정적 지도)=Task 1~5. 모두 매핑됨.
- **Placeholder:** 외부 API 의존(NCP 엔드포인트/파라미터, region·subscription 조회 함수명)은 "실물 확인 후 맞춤" 단계로 명시 — 추측 코드를 검증 스텝으로 보강함.
- **타입 일관성:** `staticMapPath`/`staticMapUrl`, `residenceSchema`/`placeSchema`/`breadcrumbSchema`/`JsonLd` 시그니처가 정의 태스크(Task 2·6)와 사용 태스크(Task 5·7·8)에서 일치.
