# SEO 개선 설계 (imjang-on)

- 작성일: 2026-06-07
- 브랜치: `feat/seo-improvements`
- 상태: 설계 승인됨, 구현 계획 작성 대기

## 배경

imjang-on(공공데이터 부동산 통합 플랫폼)의 SEO 구성을 감사한 결과 **기초는 매우 탄탄**하다. 메타데이터(루트 title 템플릿 + 17개 라우트 동적 `generateMetadata`), 사이트맵(7소스 인덱스 분할 + 샤딩), robots.txt(Google/Naver), canonical(40+ 라우트), ISR revalidate 튜닝, 사이트 소유권 인증, 시맨틱 HTML, `lang="ko"`, PWA manifest, 애널리틱스가 모두 갖춰져 있다.

따라서 이번 작업은 전면 재작성이 아니라 **비어있는 곳을 채우는** 작업이다. Next.js 네이티브 기능(`next/og` 내장, `generateMetadata`, 라우트 핸들러) 위에 얹으며, 새 런타임 의존성은 없다. 추가 자산은 한글 폰트 서브셋 1개 + 서버 전용 env 1개뿐이다.

## 현황 감사 요약

### 잘 갖춰진 것 (변경 대상 아님)
- **메타데이터**: `app/layout.tsx`에 `metadataBase`, title 템플릿(`%s | 임장온`), 기본 OG(locale/type/siteName), robots, verification. 17개 동적 라우트에 `generateMetadata`.
- **사이트맵**: `app/sitemap.xml/route.ts`(인덱스) + `app/sitemaps/[id]/route.ts`(샤드, CHUNK 10k), `lib/sitemap/sources.ts` 7개 소스, 24h revalidate.
- **robots.txt**: `app/robots.ts` — `*` 및 `Yeti`(네이버) 규칙, `/list`·`/api`·`/admin` 차단, sitemap 참조.
- **canonical**: 거의 모든 라우트에 명시적 `alternates.canonical`, 쿼리파라미터 인식.
- **렌더링**: 콘텐츠 타입별 ISR revalidate(60s~24h) 튜닝.
- **사이트 인증**: `public/google*.html`, `public/naver*.html` + 메타 태그(env 기반).
- **시맨틱/기타**: h1/h2 위계, `lang="ko"`, `app/manifest.ts`, Vercel/Google 애널리틱스.

### 비어있는 것 (이번 작업 대상)
1. **JSON-LD 구조화 데이터**: 전무.
2. **per-page OG 이미지 / 트위터 카드**: 루트 OG만 있고 페이지별 og:image·트위터 카드 없음.
3. **검색 결과 지도 썸네일**: 현재 인터랙티브 네이버 SDK만 있고 정적 지도 이미지가 없어 구글이 썸네일로 쓸 `<img>`가 없음.
4. (경미) trailing slash 미명시 — 단, 이미 일관되게 동작.

## 목표 / 비목표

**목표**
- 부동산/시설/지역 상세에 JSON-LD 구조화 데이터 제공(리치 결과 적격).
- 상세 페이지별 동적 OG 이미지 + 트위터 카드로 SNS 공유 품질 향상.
- 검색 결과에 지도 썸네일이 노출되도록 정적 지도 이미지를 상세 페이지에 실제 `<img>`로 삽입하고, JSON-LD `image` 및 OG 이미지에 재사용.

**비목표**
- 기존 메타데이터/사이트맵/robots/canonical 구조 재작성.
- 인터랙티브 네이버 지도(`LocationViewer`) 교체. (정적 지도는 별도로 추가)
- 다국어(hreflang) — 한국어 전용 사이트.
- 외부 이미지 CDN 도입.

## 설계

### 섹션 1 · JSON-LD 구조화 데이터

**중앙 헬퍼** `lib/seo/json-ld.tsx`:
- 순수 빌더 함수들 + `<JsonLd data={...} />` 컴포넌트(`<script type="application/ld+json">` 렌더).
- 빌더는 **이미 fetch된 데이터를 인자로 받는다** → 추가 DB 쿼리 0. (페이지가 이미 상세 데이터를 조회하므로 그 결과를 전달)

**페이지 타입별 스키마**

| 위치 | 스키마 | 비고 |
|---|---|---|
| 루트 레이아웃(`app/layout.tsx`) | `Organization` + `WebSite`(`potentialAction: SearchAction`) | 1회 주입. SearchAction은 `/list` 검색으로 연결(사이트링크 검색창 후보) |
| 아파트/오피스텔/빌라 상세 | `Residence` (name, `address: PostalAddress`, `geo: GeoCoordinates`, `image`) + `BreadcrumbList` | 거래 데이터는 "매물"이 아니므로 `Place` 계열로 보수적 적용 |
| 학교 상세 | `School` + `BreadcrumbList` | CivicStructure 계열 |
| 병원 상세 | `Hospital` + `BreadcrumbList` | MedicalOrganization 계열 |
| 약국 상세 | `Pharmacy` + `BreadcrumbList` | |
| 어린이집 상세 | `ChildCare` + `BreadcrumbList` | |
| 지역(`/region/[code]`) | `BreadcrumbList` | 선택적으로 `CollectionPage` |

- 각 Place/시설 스키마의 `image` 필드에 **섹션 4의 정적 지도 URL**을 연결한다.
- 주소는 PostalAddress(`addressCountry: "KR"`, `addressRegion`, `streetAddress`)로 매핑. geo는 PostGIS lat/lng 사용.
- **검증**: Google Rich Results Test로 대표 URL 수동 확인. 부동산 거래 데이터의 schema.org 매핑이 미묘하므로 보수적으로 시작하고 경고/오류를 보고 조정.

### 섹션 2 · 동적 OG 이미지 + 트위터 카드

- **Next.js 컨벤션**: 라우트 폴더에 `opengraph-image.tsx`(`next/og`의 `ImageResponse` 반환). og:image / twitter:image / 크기 메타가 자동 연결됨.
- **공용 템플릿** `lib/seo/og-template.tsx`: 로고 + 타이틀 + 서브라인(지역/가격/유형 등) 일관 레이아웃.
- **적용 라우트**: 부동산 상세(apt/officetel/villa), 지역(`/region/[code]`), 청약(`/subscription/[id]`), 시설 상세(학교/병원/약국/어린이집) + **루트 기본 OG 이미지 1장**(나머지 fallback).
- **트위터 카드**: 루트 메타데이터에 `twitter: { card: 'summary_large_image' }` 추가(페이지별 image는 opengraph-image가 자동 연결).
- **한글 폰트 (필수 리스크)**: `ImageResponse`에는 시스템 폰트가 없어 한글이 깨진다(□). 한글 서브셋 폰트(Pretendard 또는 Noto Sans KR)를 프로젝트에 번들하고 런타임에 로드해야 한다. 폰트 파일 1~2개(weight) 추가. 이 작업에서 가장 까다로운 지점.
- **연계**: 가능하면 OG 이미지 배경/측면에 섹션 4 정적 지도를 합성해 시각적으로 풍부하게. (선택, 복잡도 보면서 결정)

### 섹션 3 · 기술 위생

- **trailing slash**: Next 기본값(`false`)에서 `/foo/` → `/foo` 308 자동 리다이렉트가 이미 동작하고, canonical/sitemap 모두 슬래시 없이 일관됨 → **실질 변경 불필요**. `next.config`에 명시 여부만 검토.
- **remotePatterns**: 정적 지도는 동일 출처(`/api/staticmap`) 프록시라 무관 → 무변경.
- 결론: 섹션 3은 "확인 후 유지". 별도 구현 산출물 거의 없음.

### 섹션 4 · 검색 썸네일용 정적 지도 ⭐

**문제**: 구글 검색 결과의 지도 썸네일은 OG 이미지가 아니라 **페이지 내 실제 `<img>`** 에서 선택된다. 인터랙티브 JS 지도(네이버 SDK)는 스냅샷이 불가능해 후보가 안 된다. 좌표는 모든 모델에 PostGIS로 보유 중이므로 데이터는 준비돼 있다.

**`/api/staticmap` 프록시 라우트**
- 쿼리: `?lat&lng&w&h&level`(기본값 제공).
- 동작: NCP Static Map(raster) API를 **헤더 인증**으로 서버 fetch → 이미지 스트리밍.
- 캐싱: 장기 `Cache-Control` + 라우트 revalidate(좌표별 이미지는 거의 불변).
- 마커: 중심에 마커 1개.
- 이 라우트가 필요한 이유: NCP Static Map은 API 키를 헤더로 요구해 `<img src>`에 직접 키를 노출할 수 없음 → 서버 프록시로 시크릿 은닉 + 캐시.

**적용**
- 좌표 보유한 모든 상세 페이지(부동산/학교/병원/약국/어린이집/편의/도시인프라/청약)에 `next/image`(또는 `<img>`)로 정적 지도 삽입. 의미있는 `alt`(예: `"{시설명} 위치 지도"`).
- 인터랙티브 `LocationViewer`는 유지하고 정적 지도를 함께/위에 배치(인터랙티브 로드 전 LCP 후보로도 유리).
- 같은 URL을 **JSON-LD `image`** 와 **OG 이미지**에 재사용.

**의존성 상태 (해소됨)**
- NCP 콘솔에서 **Static Map API 신청 완료** ✅
- Vercel(운영)에 서버 전용 시크릿 **`NAVER_MAP_CLIENT_SECRET` 등록 완료** ✅ (인증 헤더: `x-ncp-apigw-api-key-id`=Client ID, `x-ncp-apigw-api-key`=Client Secret)
- 남은 작업: 로컬 개발/테스트용으로 `.env.local`에 동일 값 추가, `lib/env.ts` 스키마에 `NAVER_MAP_CLIENT_SECRET` 추가.
- 구현 착수 시 가장 먼저 `/api/staticmap`로 실제 이미지가 반환되는지 검증한 뒤 페이지 통합 진행.

## 데이터/의존성

- **좌표 소스**: PostGIS `geography(Point,4326)`. 기존 유틸(`getPropertyLatLng`, `getHospitalLatLng`, `getPharmacyLatLng`, `getChildcareLatLng`, `getAmenityLatLng`, `getUrbanLatLng`, `getSubscriptionLatLng`) 재사용.
- **신규 env**: `NAVER_MAP_CLIENT_SECRET`(서버 전용). Vercel 등록 완료, `.env.local` + `lib/env.ts` 스키마에 추가 필요.
- **신규 자산**: 한글 서브셋 폰트 파일(1~2개).
- **신규 의존성**: 없음(`next/og`는 Next 내장).

## 검증 전략

1. `pnpm build` 통과.
2. JSON-LD 빌더 **단위 테스트**(순수 함수 → 입력 객체 → 기대 JSON 구조 단언).
3. `/api/staticmap?lat=..&lng=..` 직접 호출 → 이미지·마커 렌더 확인, 캐시 헤더 확인.
4. `/apt/[id]/opengraph-image` 등 직접 열어 **한글 렌더 깨짐 없는지** 확인.
5. 대표 상세 URL을 Google Rich Results Test로 스키마 검증(오류/경고 0 목표, 경미한 경고는 기록).
6. 상세 페이지 HTML에 정적 지도 `<img>`가 실제 마크업으로 존재하는지(JS 비활성 상태에서도) 확인.

## 리스크

- **한글 폰트 로딩**(섹션 2): `ImageResponse` 폰트 미설정 시 한글 깨짐. → 서브셋 번들 + 로드로 해소, OG 라우트별로 검증.
- **NCP Static Map 할당량**(섹션 4): 인증은 해소됨(API 신청 + Vercel 시크릿 등록 완료). 남은 리스크는 호출 할당량 → 프록시 캐싱으로 절감.
- **schema.org 매핑 모호성**(섹션 1): 거래 데이터 ↔ `Residence` 매핑이 완벽치 않을 수 있음. → 보수적 적용 + Rich Results Test로 조정.

## 산출물 요약

- `lib/seo/json-ld.tsx` (빌더 + 컴포넌트)
- `lib/seo/og-template.tsx` + 라우트별 `opengraph-image.tsx` + 한글 폰트 자산
- 루트 메타데이터에 트위터 카드, 루트 레이아웃에 Organization/WebSite JSON-LD
- 상세 페이지들에 JSON-LD 주입 + 정적 지도 `<img>`
- `app/api/staticmap/route.ts` 프록시
- `lib/env.ts`에 신규 env 추가
- JSON-LD 빌더 단위 테스트
