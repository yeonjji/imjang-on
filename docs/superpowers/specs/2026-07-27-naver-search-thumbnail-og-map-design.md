# 네이버 검색 썸네일 — og:image를 지도로 통제하기

**작성일:** 2026-07-27
**상태:** 설계 승인 대기

## 1. 문제

네이버 검색 결과에서 임장ON 문서의 우측 썸네일에 **내용과 무관한 빈 파란 사각형**이 자주 노출된다.

정체는 `lib/seo/og.tsx`의 `OgFrame`이다. 모든 상세 페이지가 `opengraph-image.tsx`로 찍어내는 1200×630 브랜드 카드(배경 `#1e3a8a`)인데, 레이아웃이 좌측정렬 + `justify-content: space-between`이라 네이버가 정사각으로 크롭하면(1200 → 중앙 630px) 텍스트가 크롭 영역 밖으로 밀려난다. 제목이 짧을수록(`한스빌`, `늘푸름`) 완전히 잘려 나가 배경색만 남는다.

지도가 뜨는 경우도 있다. `/api/staticmap`(NCP Static Map 프록시)이 JSON-LD `image`와 본문 `<img>` 두 곳에 노출되어 크롤러가 그걸 집어갈 때다. 다만 **좌표가 있을 때만** 렌더된다(`app/(public)/villa/[id]/page.tsx:104` — `coord ? staticMapUrl(coord) : undefined`).

즉 현재 구조는 **og:image에 지도가 전혀 들어가지 않고**, 크롤러가 본문/JSON-LD 이미지를 주워갈지 og:image로 폴백할지에 썸네일이 맡겨져 있다. 결과가 문서마다 갈리는 이유다.

파란 썸네일이 뜨는 세 갈래:

1. `Property.location`이 `NULL`인 매물 — 페이지에 지도가 아예 없음 (보고된 한스빌·늘푸름 사례)
2. 게시판 글(`/board/[id]`), 금융상품(`/finance/[seq]`) — 지도 개념이 없는 문서
3. 크롤러가 본문 이미지를 집지 못하고 og:image로 폴백한 경우

## 2. 목표

- 가능한 모든 상세 문서에서 **그 문서에 해당하는 지도**가 썸네일로 뜬다.
- 의미 있는 지도를 만들 수 없으면 **og:image를 아예 내보내지 않는다** — 빈 파란 카드보다 무이미지가 낫다.
- 부정확한 위치를 정확한 것처럼 주장하지 않는다.
- NCP Static Map 호출량과 서버 부하가 캐시로 묶여 있고, 외부에서 임의로 유발할 수 없다.

### 비목표

- 좌표 결측 자체를 고치는 지오코딩 백필 (별도 과제)
- 네이버 썸네일 갱신 시점 제어 — 크롤러 재수집에 달려 있어 통제 불가
- 지역 폴백 지도의 배율을 데이터 산포에 맞춰 자동 계산하는 것 (고정 배율로 간다)

## 3. og:image 결정 규칙

### 매물 상세 (`/apt/[id]`, `/officetel/[id]`, `/villa/[id]`)

| 조건 | og:image |
|---|---|
| `Property.location` 있음 | 지도 `level 16` + **마커 O** + 캡션 |
| 없음 → 읍면동 centroid 유효 | 지도 `level 13` + **마커 X** + 캡션 |
| 없음 → 시군구 centroid 유효 | 지도 `level 11` + **마커 X** + 캡션 |
| 전부 실패 | **없음** (메타 태그 미방출) |

### 시설·청약 상세 (`/subscription/[id]`, `/school/…`, `/medical/hospital/…`, `/medical/pharmacy/…`, `/childcare/…`)

좌표 있으면 `level 16` + 마커 + 캡션, 없으면 og:image 없음. **지역 centroid 폴백을 적용하지 않는다.**

근거: 이 엔티티들의 좌표는 원본 공공데이터(HIRA·학교알리미·청약홈 등)에 포함되어 들어오므로 결측이 사실상 없다. 그럼에도 폴백을 붙이면 "학교의 위치를 주변 매물 좌표로 추정"하는 부자연스러운 결합이 생긴다. 보고된 파란 썸네일 사례는 전부 빌라라 매물 상세만으로 커버된다.

### 그 외

- **홈** — `OgFrame` 유지하되 **중앙정렬로 재디자인**해 정사각 크롭에서도 제목이 살아남게 한다.
- **`/board/[id]`, `/finance/[seq]`** — `opengraph-image.tsx` 파일 **삭제**. 조건 분기가 필요 없다.
- **`/urban/[category]/[id]`** — 범위 밖. 이 페이지는 애초에 `opengraph-image.tsx`가 없어 파란 카드가 뜬 적이 없으므로 고칠 것이 없다. 다만 JSON-LD `image`는 쓰고 있으므로 `/api/staticmap` 삭제에 맞춰 새 이미지 URL로 이전만 한다.

### 정직성 경계 — 폴백 지도는 og:image 전용

지역 centroid 지도는 **og:image에만** 쓴다. JSON-LD `residenceSchema.image`와 본문 `StaticMapImage`는 지금처럼 **정확한 좌표일 때만** 렌더한다.

`residenceSchema.image`는 의미상 "이 주거지의 이미지"이므로, 동네 지도를 거기 넣으면 구조화 데이터로 거짓을 주장하는 셈이 된다. 본문도 마찬가지로 사용자에게 부정확한 지도를 보여주지 않는다.

폴백임을 드러내는 장치:

- 마커를 찍지 않는다 — "여기가 그 건물"이라고 말하지 않는다.
- 배율을 넓게 잡는다 (`level 13`/`11`).
- `alt`를 구분한다: 정확 좌표는 `"명성푸르지오 위치 지도"`, 폴백은 `"대구 북구 일대 지도"`.

### 캡션

두 갈래 모두 동일한 2줄, 중앙정렬, 하단 반투명 바(`rgba(15,23,42,0.78)`):

```
명성푸르지오
대구 북구 · 임장ON
```

## 4. 좌표 해결

### `resolveOgMapTarget(propertyId)` — `lib/seo/og-coord.ts` (신규)

```ts
type OgMapTarget =
  | { kind: 'precise'; lat: number; lng: number; level: 16; marker: true }
  | { kind: 'region';  lat: number; lng: number; level: 13 | 11; marker: false; scopeLabel: string }
  | null;
```

이 모듈은 이 함수 하나만 export한다. 호출자(각 `opengraph-image.tsx`)는 좌표가 정확한지 폴백인지만 알면 되고, centroid 계산·게이트·캐싱은 전부 내부 사정이다.

폴백 순서:

1. `getPropertyLatLng(id)` → 있으면 `precise`
2. 같은 `propertyType` + 같은 `regionCode`(읍면동) centroid → `level 13`
3. 같은 `propertyType` + `regionCode LIKE '<sigunguCode>%'` centroid → `level 11`
4. `null`

`sigunguCode` 컬럼 대신 `regionCode` 접두사로 시군구를 잡는 이유는 **기존 `@@index([propertyType, regionCode])`를 그대로 타기 위해서**다. `sigunguCode`에는 인덱스가 없고, 시군구 5자리는 법정동코드 `regionCode`의 접두사라 prefix range 스캔으로 같은 복합 인덱스에 얹힌다. 마이그레이션 없이 간다.

`propertyType`을 조건에 포함시키는 것은 인덱스 선두 컬럼을 채우기 위해서이기도 하고, 아파트 상세의 지역 중심을 아파트 좌표로 잡는 게 의미상으로도 맞기 때문이다.

### 좌표 유효성 게이트

집계 **전에** 개별 점을 거르고, 집계 **후에** 산포를 본다.

| 게이트 | 읍면동 | 시군구 |
|---|---|---|
| 개별 점 한반도 bbox | `lat 33.0~38.7`, `lng 124.5~132.0` 밖 제외 | 동일 |
| 최소 유효 표본 `n` | **5** | **20** |
| 최대 산포 `spread_m` | **20 km** | **150 km** |

`spread_m`은 유효 점들의 bbox 대각 거리다. 하나라도 실패하면 그 스코프를 버리고 다음 단계로 내려가며, 마지막까지 실패하면 `null`을 반환해 og:image를 생략한다.

bbox 필터는 `(0,0)`이나 lat/lng가 뒤바뀐 값 같은 총체적 오염을 잡는다. 산포 상한은 "읍면동 하나에 20km 흩어진 점들"처럼 지역-좌표 매칭 자체가 깨진 경우를 잡는다.

### centroid 쿼리

스코프당 단일 쿼리로 `n`, `centroid`, `spread_m`을 함께 받는다.

```sql
WITH pts AS (
  SELECT location::geometry AS g
  FROM "Property"
  WHERE "propertyType" = $1
    AND "regionCode" = $2              -- 시군구 스코프는 LIKE $2 || '%'
    AND location IS NOT NULL
    AND ST_Y(location::geometry) BETWEEN 33.0 AND 38.7
    AND ST_X(location::geometry) BETWEEN 124.5 AND 132.0
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
WHERE n > 0;
```

유효 점이 0개면 `ST_Collect`가 `NULL`을 반환한다. `WHERE n > 0`가 그 행을 거르지만 Postgres가 SELECT 목록을 먼저 평가하지 않는다는 보장은 없으므로, **TS 쪽에서도 `n`·`lat`·`lng`가 모두 non-null인지 확인한 뒤에만 결과를 채택한다.**

### 제한시간

centroid 쿼리는 **800ms** statement timeout 안에서 실행한다. Prisma `$transaction` 안에서 `SET LOCAL statement_timeout = 800`을 먼저 실행해 DB 측에서 실제로 중단되게 한다(애플리케이션 타이머는 쿼리를 취소하지 못한다). 타임아웃이든 다른 예외든 **잡아서 `null`을 반환**하고 og:image를 생략한다 — OG 이미지 하나 때문에 페이지 렌더가 느려지거나 실패하면 안 된다.

### 캐싱

centroid 결과는 `unstable_cache`로 **`propertyId`가 아니라 스코프별로** 캐시한다.

- 키: `['og-centroid', propertyType, 'dong' | 'sigungu', code]`
- `revalidate: 86_400` (24시간)

같은 읍면동의 좌표 없는 매물이 100개여도 하루에 쿼리 1회다. `null` 결과도 함께 캐시해 실패 스코프를 반복 조회하지 않는다.

## 5. 지도 이미지 조달 — `/api/staticmap` 대체

### 현재 구조의 문제

`/api/staticmap?lat=&lng=&w=&h=&level=`은 **인증 없는 공개 프록시**다. 임의 좌표를 받아 NCP를 호출하므로, 외부에서 좌표를 조금씩 바꿔 요청하면 캐시 미스가 무한히 발생하고 NCP 과금이 그대로 따라온다. 실제로 이 라우트를 향한 스크래핑성 트래픽이 관측된 적이 있다.

### 대체: 엔티티 참조 라우트

**`app/map/[kind]/[id]/route.ts` (신규)** — `/map/property/123` 형태. 좌표를 URL에서 받지 않고 **`kind`+`id`로 DB에서 조회**한다.

- `kind`는 화이트리스트: `property` / `subscription` / `school` / `hospital` / `pharmacy` / `childcare` / `urban`. 각 항목이 Prisma 모델과 `location` 컬럼에 매핑되는 작은 레지스트리(`lib/seo/map-entity.ts`)로 관리한다. `id`는 kind마다 타입이 달라(매물·청약은 `BigInt`, 시설은 문자열 코드) **불투명 문자열로 받고 kind별 검증기가 파싱**한다.
- **크기·배율 파라미터를 받지 않는다.** 600×400, `level 16` 고정. 캐시 키가 엔티티 ID 하나로 묶여, 남용해도 NCP 호출 상한이 실제 엔티티 수를 넘지 못한다.
- 엔티티가 없거나 `location`이 `NULL`이면 404.
- 좌표 조회는 `unstable_cache`(`revalidate: 86_400`).
- `export const revalidate = 2_592_000`(30일) + 응답 헤더 `public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400`.

`/api/` 밖이라 `robots.txt`의 `Disallow: /api/`에 걸리지 않는다. **`app/robots.ts`의 `/api/staticmap` allow 예외 줄과 주석을 제거한다.**

### `/api/staticmap` 삭제

`app/api/staticmap/route.ts`를 삭제한다. 사용자가 필수 조건으로 요구한 "임의 좌표 공개 프록시 제거"를 유예 없이 달성한다.

**트레이드오프 (명시적으로 수용):** 이미 색인된 `/api/staticmap?...` 이미지 URL이 404가 되어, 현재 지도 썸네일이 잘 나오던 문서가 재크롤 전까지 일시적으로 썸네일을 잃을 수 있다. 다만 이번 작업의 핵심이 **og:image를 대표 이미지로 확립**하는 것이라 본문 이미지 URL에 대한 의존 자체가 줄고, 새 `/map/{kind}/{id}`는 좌표가 아닌 ID 기반이라 앞으로 안정적이다. 배포 후 네이버 서치어드바이저 수집 요청으로 재크롤을 앞당긴다.

### NCP 호출 모듈

**`lib/seo/static-map-fetch.ts` (신규)** — `fetchStaticMapPng({ lat, lng, w, h, level, marker })`가 NCP raster를 PNG `ArrayBuffer`로 반환한다. 지금 `app/api/staticmap/route.ts`가 통째로 들고 있는 NCP 호출 로직(엔드포인트, 헤더 인증, `lng,lat` 순서, `scale=1`, 마커 파라미터)이 여기로 옮겨온다.

- `AbortSignal.timeout(5000)`
- `next: { revalidate: 2_592_000 }` — NCP 응답 자체를 30일 데이터 캐시
- 실패 시 예외를 던진다 (호출자가 처리)

`/map/[kind]/[id]` 라우트와 OG 합성이 **둘 다 이 함수를 직접 호출**한다. OG는 반환 버퍼를 base64 data URI로 만들어 satori에 넘기므로, 자기 자신에게 HTTP 요청을 되쏘지 않고 새 이미지 URL의 robots 노출도 필요 없다.

### `lib/seo/static-map.ts` 변경

좌표 기반 URL 빌더(`staticMapPath` / `staticMapUrl`)를 엔티티 기반으로 바꾼다.

```ts
export function mapImagePath(kind: MapEntityKind, id: string | bigint): string;
export function mapImageUrl(kind: MapEntityKind, id: string | bigint): string;
```

`components/ui/static-map.tsx`의 `StaticMapImage`는 `kind`+`id`를 받는다. `width`/`height` prop은 **표시 크기 전용**으로 남기고 URL에는 반영하지 않는다(고유 크기는 600×400 고정).

JSON-LD `image`를 쓰는 8개 페이지의 `coord ? staticMapUrl(coord) : undefined`는 `coord ? mapImageUrl(kind, id) : undefined`로 바뀐다. **좌표 유무로 게이트하는 현재 조건은 그대로 유지한다** — 폴백 지도는 JSON-LD에 들어가지 않는다.

## 6. OG 프레임과 합성

### `lib/seo/og.tsx` 변경

**`OgMapFrame({ mapDataUri, title, subtitle })` 추가**

```
┌───────────────────────────────────────┐
│                                       │
│              (지도 1200×630)           │
│                                       │
│ ░░░░░░░░░░░ 명성푸르지오 ░░░░░░░░░░░░░ │
│ ░░░░░░░ 대구 북구 · 임장ON ░░░░░░░░░░░ │
└───────────────────────────────────────┘
```

- 지도 `<img>`가 프레임을 채우고, 하단에 `position: absolute` 반투명 바.
- 캡션 2줄 모두 **중앙정렬** — 네이버의 정사각 크롭(중앙 630px)에서 살아남는 유일한 정렬이다.
- satori 제약상 flex + 명시 스타일만 사용 (기존 `OgFrame`과 동일한 제약).

**`OgFrame` 재디자인** — `justify-content`/`align-items`를 중앙으로 바꿔 홈에서 크롭돼도 제목이 보이게 한다. 이제 홈에서만 쓰인다.

### 지도 원본 크기

NCP raster는 `w`/`h` 최대 1024라 1200×630을 직접 요청할 수 없다. OG용으로는 **1024×538**(1200×630과 같은 1.905 비율)을 요청해 satori에서 1200×630으로 업스케일한다. 17% 확대라 썸네일 용도에서는 열화가 눈에 띄지 않는다. `scale=2` 도입은 이번 범위 밖으로 둔다.

### 공용 팩토리 `lib/seo/og-map-route.tsx`

지도 OG 라우트가 8개다. 메타데이터 방출·지도 합성·에러 처리·캔버스 크기 정책을 엔트리마다 복사하면 정책 하나 바꿀 때 8곳을 동시에 고쳐야 한다. `createOgMapRoute(load)`에 모으고 `{ generateImageMetadata, Image }`를 반환한다.

```
createOgMapRoute(load)
  ├ generateImageMetadata: load() === null → []  (메타 태그 없음)
  │                        아니면 [{ id, ...OG_SIZE, contentType, alt }]
  └ Image:                 load() === null → 404
                           fetchStaticMapPng(1024×538) → data URI
                           ImageResponse(<OgMapFrame …/>)
                           NCP 실패 → 502 + no-store
```

각 `opengraph-image.tsx`에는 **페이지별 `load`만** 남는다. `load`는 엔티티를 조회해 좌표·문구를 정하고, 지도를 만들 수 없으면 `null`을 준다.

```
1. 엔티티 조회 (기존과 동일)
2. resolveOgMapTarget(id)  ← 매물만. 시설·청약은 getMapEntityLatLng로 직접 조회
3. 좌표 없음 → null 반환 (팩토리가 메타 태그 생략 + 404 처리)
4. 아니면 { title, subtitle, alt, lat, lng, level, marker } 반환
```

`load`는 `react`의 `cache()`로 감싼다 — 팩토리가 `generateImageMetadata`와 `Image`에서 각각 호출하므로 요청 단위 dedupe가 필요하다.

`revalidate`는 현행 `86_400`을 유지한다. NCP 응답은 그 아래 30일 데이터 캐시에 얹히므로, OG 재생성이 일어나도 NCP를 다시 때리지 않는다. 캐시가 2겹이다.

- **1겹 — OG 라우트 ISR(24시간):** `id`당 하루 1회만 satori 렌더
- **2겹 — NCP fetch 데이터 캐시(30일):** OG 재생성 시에도 NCP 호출 없음

### 조건부 og:image 제거

파일 기반 규약을 유지하고, 각 `opengraph-image.tsx`에 `generateImageMetadata()`를 추가해 **타깃이 없으면 빈 배열을 반환**한다.

`alt`도 여기서 나간다. 현재 각 파일이 `export const alt = '아파트 실거래가'`처럼 **정적 상수**로 들고 있는데, 정확 좌표와 지역 폴백의 문구를 구분하려면 동적이어야 한다. 정적 `export const alt`를 제거하고 `generateImageMetadata()`가 반환하는 항목의 `alt` 필드에 실어 보낸다.

> ⚠️ **선행 검증 필요.** `generateImageMetadata()`가 `[]`를 반환할 때 Next 15.5.18이 `og:image` 메타 태그를 실제로 생략하는지 문서로 확정하지 못했다. **구현 계획의 첫 단계를 이 동작 검증으로 잡는다.** 빈 태그나 깨진 URL이 새어나오면 대안으로 전환한다: 해당 라우트의 `opengraph-image.tsx`를 삭제하고 `app/og/[kind]/[id]/route.tsx`(= `/api/` 밖이라 robots 통과)를 만든 뒤, `generateMetadata`에서 `openGraph.images`를 조건부로 지정한다.

## 7. 에러 처리

| 상황 | 처리 |
|---|---|
| centroid 쿼리 타임아웃/예외 | `null` 반환 → og:image 생략. 페이지 렌더에 영향 없음 |
| NCP fetch 실패·타임아웃 (OG) | `new Response(null, { status: 502, 'Cache-Control': 'no-store' })`. **파란 카드로 폴백하지 않는다** — 그게 없애려는 대상이다. 메타 태그는 남지만 크롤러가 이미지를 못 받아 썸네일이 안 붙고, `no-store`라 다음 크롤에 재시도된다 |
| NCP fetch 실패 (`/map/` 라우트) | `502` + `no-store`. 본문 `<img>`는 alt 텍스트로 degrade |
| `kind` 화이트리스트 밖 / 엔티티 없음 / `location` NULL | `404` |
| NCP 키 미설정 | `503` + `no-store` (현행 동작 유지) |

## 8. 테스트

### 단위·통합

**`lib/seo/og-coord.test.ts`** — **자체 시드**로 6케이스. 앰비언트 데이터에 의존하지 않는다(과거 통합 테스트 flake의 원인이었고, check 잡은 시드를 돌리지 않는다).

1. 정확 좌표 있음 → `precise`, `level 16`
2. 좌표 없음 + 읍면동 표본 충분 → `region`, `level 13`
3. 읍면동 표본 5 미만 → 시군구로 승격, `level 11`
4. 시군구 표본도 20 미만 → `null`
5. 한반도 bbox 밖 점이 섞여 있음 → 그 점만 제외하고 나머지로 계산
6. 산포 20km 초과(읍면동) → 그 스코프 거부 후 시군구로 승격

**`lib/seo/og.test.tsx`** — `OgMapFrame`이 반환하는 요소 트리에 data URI와 캡션 2줄이 들어가는지.

**`lib/seo/map-entity.test.ts`** — `kind` 화이트리스트 밖 값이 거부되는지.

### 성능 게이트 (구현 중 1회)

프로덕션 DB(OCI, SSH 터널, 읽기 전용)에서 **매물이 가장 많은 읍면동과 시군구**를 골라 centroid 쿼리에 `EXPLAIN ANALYZE`를 돌린다.

- **`Index Scan`/`Bitmap Index Scan` on `Property_propertyType_regionCode_idx` 확인이 통과 조건.**
- `Seq Scan`이면 쿼리를 고친다(조건 순서·형변환 점검). 그래도 안 되면 인덱스 추가를 별도 결정 항목으로 올린다.
- 실행 시간이 800ms timeout에 근접하면 임계값을 재검토한다.

### 배포 후 수동 확인

- `curl -I https://imjangon.co.kr/villa/{id}/opengraph-image` → `200 image/png` (좌표 있는 것 1건, 없는 것 1건)
- `curl -I https://imjangon.co.kr/map/property/{id}` → `200 image/png`
- 게시판 글 HTML에 `og:image` 태그가 없는지
- **총 5건 이내. 버스트 금지** — 과거 프로덕션 자동 요청 버스트로 차단당한 전례가 있다.

### 최종 확인 (즉시 불가)

네이버 썸네일이 실제로 바뀌는 것은 **크롤러 재수집 후**다. 배포 후 서치어드바이저에서 대표 URL 몇 개를 수집 요청하고 수 일 뒤 확인한다. **배포 직후에 "고쳐졌다"고 판단할 수 없음을 전제로 한다.**

## 9. 변경 파일

**신규**

- `lib/seo/og-coord.ts` — `resolveOgMapTarget`
- `lib/seo/static-map-fetch.ts` — `fetchStaticMapPng`
- `lib/seo/map-entity.ts` — `kind` 레지스트리
- `lib/seo/og-map-route.tsx` — `createOgMapRoute` 공용 팩토리
- `app/map/[kind]/[id]/route.ts`
- 테스트 3종

**수정**

- `lib/seo/static-map.ts` — 좌표 기반 → 엔티티 기반 URL 빌더
- `lib/seo/og.tsx` — `OgMapFrame` 추가, `OgFrame` 중앙정렬
- `components/ui/static-map.tsx` — `kind`+`id` prop
- `app/robots.ts` — `/api/staticmap` allow 예외 제거
- `opengraph-image.tsx` × 9 (홈 제외 8 + 홈 1)
- JSON-LD `image`를 쓰는 페이지 8개

**삭제**

- `app/api/staticmap/route.ts`
- `app/(public)/board/[id]/opengraph-image.tsx`
- `app/(public)/finance/[seq]/opengraph-image.tsx`

## 10. 완료 조건

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` 통과 — 특히 **`lint`는 필수 게이트**(`typecheck`는 미사용 변수를 잡지 못하고, `staticMapUrl` 시그니처 변경으로 orphan import가 생기기 쉽다).
2. `EXPLAIN ANALYZE`에서 centroid 쿼리가 기존 인덱스를 탄다.
3. 좌표 있는 매물 / 없는 매물 / 게시판 글 각 1건의 HTML에서 `og:image` 태그 유무와 URL이 규칙대로다.
4. 임의 좌표로 지도 이미지를 얻을 수 있는 공개 경로가 남아 있지 않다.
5. 배포 후 서치어드바이저 수집 요청 완료. (썸네일 실제 교체 확인은 후속)
