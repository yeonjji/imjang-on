# 상권·편의 진입 흐름 재설계 (지역 picker 제거 + /life 그룹 허브)

작성일: 2026-05-28
상태: 설계 확정 대기 (사용자 리뷰 중)

## 1. 배경 & 목표

직전 작업(`2026-05-28-amenity-list-detail-design.md`)으로 상권·편의 4종이 라이브 전환됐다. 그 구조는 `/amenity/[category]` 허브 → `/regions` → `[sigunguCode]` → DETAIL 의 4단계로, 학교 페이지 구조를 그대로 포팅한 결과다. 사용자가 LIST에 닿기 전에 카테고리 허브 + 지역 picker 라는 2단계 게이트를 통과해야 한다.

이번 변경은 **그 게이트를 제거**한다. nav에서 `편의점`을 누르면 곧장 LIST 로 들어가고, 그룹 라벨 `상권·편의`는 4 카테고리를 한 화면에서 비교할 수 있는 `/life`(그룹 허브) 의 해당 섹션으로 이동한다. 정보 구조 한 층이 압축돼 사용자 이탈이 줄고, 라우트도 단순해진다.

## 2. 범위

### 포함
- nav 그룹 라벨 `상권·편의` → `/life#amenity` 앵커 점프 (`life-dropdown`, `mobile-drawer` 양쪽)
- `/life` 단일 페이지를 4 그룹(`교육시설`/`의료시설`/`상권·편의`/`도시인프라`) 섹션 구조로 재편
- `/amenity/[category]` 를 카테고리 허브에서 **LIST 자체**로 전환 (4종 동시 마이그레이션)
- `/amenity/[category]/[sigunguCode]` 의 LIST 로직을 `[category]/page.tsx` 로 이전 후 폴더 삭제
- `/amenity/[category]/regions/` 폴더 삭제
- DETAIL URL 단순화: `/amenity/[category]/[sigunguCode]/[id]` → `/amenity/[category]/[id]`
- `AmenityListFilter` 에 `sido` 필드 추가 + 4 어댑터의 `buildXxxWhere` 분기
- `next.config.mjs` 의 `redirects()` 3종 (regions, sigungu LIST, sigungu DETAIL) → 새 URL로 301
- 사이트맵 (`app/sitemap.ts`) URL 패턴 갱신
- 모바일 분기 (드로어 그룹 라벨 링크화, `/life` 섹션 grid-cols 분기, 필터 시트의 active count 확장)

### 제외 (후속)
- 의료시설(`/medical`) · 도시인프라(`/urban`) 진입 흐름 재설계 — 4종 검증 후 동일 패턴 확산
- 지오로케이션 기반 기본 시도 추정 — 본 작업은 단순 시드(`?sido=서울`)로 고정
- 사이트맵 fan-out (시도 11종, 시군구 N종)
- `Store.name` 의 `pg_trgm` 인덱스 등 검색 성능 후속

## 3. 정보구조(IA) & 라우팅

### 새 라우트 트리
```
/life                              ← 4 그룹 섹션 (교육·의료·상권·인프라)
/amenity/[category]                ← LIST (was: 허브 + 인기 시군구)
/amenity/[category]/[id]           ← DETAIL (was: /[sigunguCode]/[id])
```
`[category]` ∈ `convenience` | `mart` | `cafe` | `market`. 어댑터·DETAIL 컴포넌트 구성은 직전 작업과 동일.

### 삭제 라우트 & 301 redirect

`next.config.mjs` 에 `redirects()` 추가. 정규식으로 `[id]` 와 `[sigunguCode]` 충돌 가드.

```js
async redirects() {
  return [
    {
      source: '/amenity/:category/regions',
      destination: '/amenity/:category',
      permanent: true,
    },
    {
      source: '/amenity/:category/:sigunguCode(\\d{5})',
      destination: '/amenity/:category?region=:sigunguCode',
      permanent: true,
    },
    {
      source: '/amenity/:category/:sigunguCode(\\d{5})/:id(\\d+)',
      destination: '/amenity/:category/:id',
      permanent: true,
    },
  ];
}
```

행정구역코드(sigunguCode) 는 정확히 5자리, DETAIL `id`(bigint) 는 일반적으로 6자리 이상이지만 명시적 가드를 두어 모호함을 차단한다.

### 진입 흐름
```
nav 그룹 라벨 "상권·편의"  → /life#amenity (앵커 점프)
nav 하위 "편의점"          → /amenity/convenience (LIST, ?sido=서울 시드)
/life 섹션 내 카드 "편의점" → /amenity/convenience (동일)
LIST 카드 클릭             → /amenity/convenience/{id}
DETAIL 의 같은 카테고리 N건 → /amenity/convenience?region={sigunguCode}
```

## 4. /life 4 그룹 섹션 재편

### 현재
평면 5카드 그리드(`학교찾기 / 병원·약국 / 마트·편의 / 공원 / 충전소`). 이는 라이브 전환 이전 임시 구조.

### 변경
`LIFE_GROUPS`(`app/(public)/_components/life-menu.ts`) 를 그대로 import 해 그룹 단위 섹션을 렌더. nav 드롭다운과 단일 진실 소스 공유.

```tsx
const SECTIONS = LIFE_GROUPS; // [{label, slug, items: [...]}]

return (
  <section className="mx-auto max-w-[1180px] px-6 py-12">
    <h1>우리 동네 생활편의</h1>
    {SECTIONS.map((group) => (
      <section
        key={group.slug}
        id={group.slug}
        className="mt-10 scroll-mt-20"
      >
        <h2>{group.label}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {group.items.map((item) => <LifeItemCard key={item.label} item={item} />)}
        </div>
      </section>
    ))}
  </section>
);
```

`LifeGroup` 인터페이스에 `slug: 'education' | 'medical' | 'amenity' | 'urban'` 추가. 카드는 `item.live` 분기:

- `live: true` → `<Link href={item.href}>`
- `live: false, soon: true` → "Soon" 배지 + SoonModal
- `live: false` → SoonModal

`scroll-mt-20` 은 sticky 헤더 높이만큼 오프셋. 실제 헤더 높이는 `nav.tsx` 확인 후 정확한 값으로 결정.

`revalidate = 86_400` 유지.

## 5. nav 그룹 라벨 클릭 활성화

### `LifeDropdown` (데스크톱)
4컬럼 그리드의 각 컬럼 헤더(`<p>`) → `<Link href={`/life#${group.slug}`}>`. `onClick` 에서 `setOpen(false)` 호출 (드롭다운 닫고 이동).

### `MobileDrawer` (모바일)
"생활편의" 토글 아코디언 안의 각 그룹 라벨(`<p>`) → `<Link href={`/life#${group.slug}`}>`. 우측에 `›` 아이콘 추가 (탭 가능 affordance). `onClick={onClose}` 로 드로어 닫고 이동. 라벨 영역 최소 44px (현재 `py-3` ≈ 48px 유지).

그룹 라벨과 하위 항목은 **탭 영역이 분리**되어, 라벨 탭 → 그룹 허브, 하위 탭 → LIST 직행.

## 6. /amenity/[category] LIST 재설계

### URL 모양
```
/amenity/convenience                        → ?sido=서울 자동 적용 (시드)
/amenity/convenience?sido=경기
/amenity/convenience?sido=서울&region=11680  → 시군구 좁힘
/amenity/convenience?q=GS25&sido=서울
/amenity/mart?sub=hyper&sido=서울
```

### 시드 정책
페이지 SSR 진입에서 `searchParams.sido` 가 비었으면 `redirect('/amenity/${category}?sido=서울')`. URL 에 시드를 노출해 공유·뒤로가기·SEO 가 일관되게 동작.

서울을 시드로 고른 이유: 사용자 분포 가정 + 모든 4 카테고리에서 시군구 수·데이터 밀도 1위. 후속에서 지오로케이션·사용자 설정 기반으로 교체 가능한 지점.

### 페이지 구조
```
nav: 홈 › 생활편의 › 상권·편의 › 편의점
hero-card: "🏪 편의점 — {sido} {region?}"
           "{total}개" (전국 전체 보기 링크 제거)
mobile-filter-sheet (기존)
┌─ aside (md+) ────────┬─ main ─────────────────┐
│ 필터 패널            │ "N개 편의점"           │
│  - 이름 검색         │ <AmenityCard …>         │
│  - 시도(default서울) │  …                      │
│  - 시군구(동적)      │ <Pagination …>          │
│  - sub-filter        │                         │
│ 광고 영역            │                         │
└──────────────────────┴─────────────────────────┘
```

### `AmenityListFilter` 확장 (`lib/amenity/category.ts`)
```ts
export interface AmenityListFilter {
  sigunguCode?: string;
  sido?: string;          // NEW
  q?: string;
  sub?: string;
}
```

각 어댑터 `buildXxxWhere(filter)` 에서:
```ts
if (filter.sigunguCode) {
  where.sigunguCode = filter.sigunguCode;
} else if (filter.sido) {
  where.sigunguCode = { startsWith: sidoPrefix(filter.sido) };
}
```
시군구 코드가 있으면 시도는 무시(더 좁은 조건 우선). 같은 분기를 `getList` · `getCountsBySigungu` 양쪽에서 일관되게 적용 (카운트는 시군구가 있어도 의미가 다르므로 별도 검토 — 현 작업은 LIST 만 우선).

### 시도 → sigunguCode prefix 매핑
행정구역코드 첫 2자리 = 시도. `lib/region` 에 정적 매핑 함수 추가:
```ts
const SIDO_PREFIX: Record<string, string> = {
  '서울': '11', '부산': '26', '대구': '27', '인천': '28',
  '광주': '29', '대전': '30', '울산': '31', '세종': '36',
  '경기': '41', '강원': '51', '충북': '43', '충남': '44',
  '전북': '52', '전남': '46', '경북': '47', '경남': '48',
  '제주': '50',
};
export function sidoPrefix(sido: string): string | undefined {
  return SIDO_PREFIX[sido] ?? SIDO_PREFIX[sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')];
}
// 역방향: prefix 2자리 → 시도명 (region 만 있는 LIST 진입 시 hero/필터 hydration 용)
const PREFIX_TO_SIDO = Object.fromEntries(Object.entries(SIDO_PREFIX).map(([k, v]) => [v, k]));
export function sidoFromPrefix(prefix: string): string | undefined {
  return PREFIX_TO_SIDO[prefix];
}
```
DB 조회 비용 0. 시도 명에서 행정 접미사 제거해 매칭 견고성 확보.

### LIST SSR 데이터 흐름
```ts
const { category } = await params;
const sp = await searchParams;
const def = getCategoryDef(category);
if (!def) notFound();

if (!sp.sido && !sp.region) {
  redirect(`/amenity/${category}?sido=서울`);
}
// region 만 있을 때 sido 는 region 의 첫 2자리에서 역추출 (sitemap/redirect로 유입된 케이스)
const effectiveSido = sp.sido ?? (sp.region ? sidoFromPrefix(sp.region.slice(0, 2)) : undefined);

const page = normalizePage(sp.page);
const subKey = def.subFilters?.paramKey ?? 'sub';

const [{ rows, total, totalPages, perPage }, sidoList] = await Promise.all([
  getAmenityList(category, {
    sigunguCode: sp.region,
    sido: sp.sido,
    q: sp.q,
    sub: sp[subKey],
  }, page),
  getSidoList().catch(() => []),
]);
```

### 필터 패널 변경
`AmenityFilterPanel` 자체는 수정 거의 없음 (이미 sido/region 모두 query param으로 다룸). 호출부에서 `basePath = `/amenity/${category}`` 로 변경만.

`AmenityCard` 의 detail 링크: 현재 `${basePath}/${item.id}` → `/amenity/${def.slug}/${item.id}` 로 직접 조립. (basePath 가 쿼리 포함될 수 있어 안전).

### 파일 이동
```
[삭제] app/(public)/amenity/[category]/page.tsx                  (기존 카테고리 허브)
[삭제] app/(public)/amenity/[category]/regions/page.tsx          (지역 picker)
[삭제] app/(public)/amenity/[category]/[sigunguCode]/page.tsx    (기존 LIST 위치)
[신규] app/(public)/amenity/[category]/page.tsx                  (LIST — 기존 [sigunguCode]/page.tsx 로직 이전)
```

`_components/` 의 hero/info/sidebar/nearby/card/pagination/filter-panel 등은 그대로 유지.

## 7. /amenity/[category]/[id] DETAIL 단순화

### 변경
`params: { category, sigunguCode, id }` → `params: { category, id }`. `getAmenityById(id)` 결과의 row 에서 `sigunguCode` 를 가져와 region 조회 → breadcrumb·hero 에 사용. path/조회결과 불일치 위험 자체가 사라진다.

### 페이지 구조 (대부분 유지)
```
nav: 홈 › 생활편의 › 상권·편의 › 편의점 › {region.fullName} › {item.name}
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^
                              /amenity/{category}?region={sigunguCode} 로 진입
<AmenityHero …>
<AmenityInfo …>     기본정보 (detailFields)
<map>               kakao map (lat/lng = getLatLng)
<NearbyApartments>  주변 아파트
<NearbyAmenitiesMixed> 주변 상권 종합 (타 카테고리 mixed)
<SameCategoryNearby> 같은 카테고리 가까운 N건
                    "더 보기" 링크 = /amenity/{cat}?region={sigunguCode}
```

### 파일 이동
```
[삭제] app/(public)/amenity/[category]/[sigunguCode]/[id]/page.tsx
[삭제] app/(public)/amenity/[category]/[sigunguCode]/                 (폴더 자체)
[신규] app/(public)/amenity/[category]/[id]/page.tsx
```

`_components/` 위치 변경 없음.

## 8. 모바일 분기

### 8-1. nav 모바일 (`MobileDrawer`)
- 그룹 라벨 `<p>` → `<Link href="/life#{slug}">` (5절 참조)
- 라벨 우측 `›` 아이콘
- `onClick={onClose}` 로 드로어 닫고 이동
- 탭 영역 ≥ 44px 유지

### 8-2. /life 4섹션 모바일 레이아웃
- 컨테이너: `max-w-[1180px] px-6 py-12`
- 그룹 내 카드 그리드: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`
- 섹션 사이 간격: `mt-10`
- 앵커 sticky 보정: `<section id="amenity" className="scroll-mt-20">`

### 8-3. LIST 모바일 (`/amenity/[category]`)
- `AmenityMobileFilterSheet` 그대로 활용 (바텀시트 + 활성 카운트 배지)
- `activeKeys` 확장: `['sido', 'q', def.subFilters?.paramKey]` → `['sido', 'region', 'q', def.subFilters?.paramKey]` (시드 기본값 `sido=서울` 은 카운트에서 제외할지 판단 — 사용자가 직접 변경한 값만 카운트하도록 `sp.get('sido') !== '서울'` 가드 권장)
- "필터" 버튼 sticky 처리: 상단 헤더 높이 + scroll z-index
- Hero 카드 padding 분기: `p-5 md:p-7`, 제목 폰트 `text-2xl md:text-3xl`

### 8-4. DETAIL 모바일
- 단일 컬럼 레이아웃 기존 유지
- breadcrumb 마지막 세그먼트(가게명) `truncate` 처리
- 지도 컴포넌트 명시적 높이 (`h-[280px]` 또는 `aspect-square`) — `naver-map.tsx` 확인 후 결정

### 8-5. 모바일 공통 체크
- 모든 새 인터랙티브 요소 ≥ 44×44px
- iOS Safari `scroll-behavior: smooth` + `scroll-mt-*` 동작 확인
- 드로어 → 앵커 점프 순서: `onClose()` → `router.push()` (Next Link 기본 동작이 처리)

## 9. SEO · 사이트맵

### `app/sitemap.ts`
```ts
// before
{ url: `${SITE}/amenity/${slug}`, … }
{ url: `${SITE}/amenity/${slug}/regions`, … }
{ url: `${SITE}/amenity/${slug}/${sigunguCode}`, … }
// + DETAIL N건

// after
{ url: `${SITE}/amenity/${slug}?sido=서울`, … }   // LIST 시드 URL
// /regions, /[sigunguCode] 라인 제거
// DETAIL: /amenity/${slug}/${id} 로 패턴만 변경
```

LIST 시드 URL 은 단일(`?sido=서울`)로 시작. 시도 11종 fan-out 은 후속 작업.

### 301 redirect 효과
기존 외부 링크·검색엔진 인덱스가 자연 이전. 6 ~ 12 주 모니터링.

## 10. 테스트

### 단위 (Vitest)
- `tests/lib/amenity/*` — 어댑터 `buildXxxWhere` 에 `sido` 만 / `sigunguCode` 만 / 둘 다 케이스 추가
- `sidoPrefix()` — 정상명("서울"), 풀명("서울특별시"), 미존재("존재하지않음")

### 통합
- `/amenity/convenience` (시드 없음) → 301/RSC redirect → `/amenity/convenience?sido=서울` 검증
- `/amenity/convenience/regions` → 301 → `/amenity/convenience` 검증
- `/amenity/convenience/11680` → 301 → `/amenity/convenience?region=11680` 검증
- `/amenity/convenience/11680/12345` → 301 → `/amenity/convenience/12345` 검증

### 수동 (Playwright 권장)
- 모바일 드로어에서 그룹 라벨 → `/life#amenity` 점프 + 섹션이 헤더에 가리지 않는지
- LIST 필터 시트의 active count 가 `region` 포함해 정확한지
- DETAIL → "같은 카테고리 가까운 N건" "더 보기" → 시군구 사전선택 LIST

## 11. 관측 · 롤백

- Sentry release 태그 끊고 배포
- 데이터 마이그레이션 없음 → 롤백 = git revert 1회로 종료
- 변경 폭이 크므로 PR 1개로 묶되 커밋은 단계별 (life-menu/슬러그 → /life 재편 → LIST 이동 → DETAIL 이동 → redirect/sitemap → 모바일 보정)

## 12. 미해결 / 결정 보류

- `/life` 섹션 헤더의 sticky 여부 — 첫 구현에서 비sticky 로 두고 사용성 보고 결정
- `getCountsBySigungu()` 가 `sido` 인지 — 본 작업은 LIST 만 sido 분기, 카운트는 전국 그대로 유지. 그룹 허브에 시도별 카운트가 필요해질 때 후속
- 사이트맵 fan-out 정책 — 단일 시드 → 11 시도 fan-out 으로 갈 시점·기준
