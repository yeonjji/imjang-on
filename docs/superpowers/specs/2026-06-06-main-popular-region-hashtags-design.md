# 메인 인기 지역 해시태그 → 실거래가 목록 딥링크

작성일: 2026-06-06

## 배경 / 문제

메인 화면 검색창(`hero-search.tsx`) 아래에는 현재 **"인기검색"** 칩이 있다. 값은 정적 상수
`POPULAR = ['마포', '송도', '동탄', '강남']`이며, 클릭 시 `/search?q=<키워드>`(검색 결과 페이지)로 이동한다.

사용자는 이 칩을 **지역 해시태그**로 보고, 누르면 해당 지역으로 **바로 실거래가 목록(`/list`)** 으로
진입하길 원한다.

`/list`는 이미 지역 필터를 지원한다:
- `?region=<sigunguCode>` — 시군구 단위 정확 필터 (`PropertyList`의 `sigunguCode` prop)
- `?sido=<단축명>` — 시도 단위 필터 + 필터 패널의 시군구 드롭다운 로딩 트리거

`ListFilterPanel`은 URL의 `sido`(단축명)로 `/api/regions`를 호출해 시군구 목록을 받고,
`region`(sigunguCode)으로 드롭다운 선택 상태를 표시한다. 따라서 딥링크가 필터 패널에까지
올바르게 반영되려면 **`/list?sido=<단축명>&region=<sigunguCode>`** 형태여야 한다.

## 결정 사항 (확정)

1. **지역 단위:** 시군구(구/시) 단위로 통일한다. `/list` 필터가 시군구까지만 정확히 지원하므로,
   동/지구 단위(송도·동탄 등)는 다루지 않는다.
2. **태그 소스:** 정적 상수가 아니라 **거래량 기반 동적 TOP N**으로 노출한다.
3. **라벨:** 칩 섹션 라벨을 "인기검색" → **"인기 지역"** 으로 변경한다.
4. **집계 윈도우:** 최근 90일 거래량 기준, 결과 부족 시 전체 기간으로 폴백.

## 설계

### 1. 동작 (UX)

- `hero-search.tsx`의 "인기검색" 칩 영역을 "인기 지역" 칩으로 교체.
- 각 칩은 시군구 1개를 나타내며, 라벨은 시군구명(예: `강남구`, `송파구`)으로 표시한다.
- 클릭 시 `/list?sido=<단축명>&region=<sigunguCode>`로 이동한다.
  - 결과: 해당 시군구로 필터된 실거래가 목록 + 필터 패널의 시도/시군구가 선택된 상태로 표시.
- 검색창 자동완성(`/api/search` 디바운스 호출 + 드롭다운) 동작은 변경하지 않는다.

### 2. 데이터 — `getPopularSigungus(limit = 6)`

`lib/region.ts`에 신규 함수 추가 (region 도메인이므로 region.ts에 둔다).

처리 흐름:
1. `prisma.transaction.groupBy({ by: ['sigunguCode'], _count: { sigunguCode: true }, where: { contractDate >= (today - 90d) }, orderBy: { _count: { sigunguCode: 'desc' } }, take: limit })`.
2. 결과가 `limit` 미만이면 `where`의 `contractDate` 조건을 제거하고 전체 기간으로 재집계(폴백).
3. 상위 `sigunguCode` 목록을 `Region`에서 일괄 조회해 라벨(`sigungu`)을 얻는다
   (`where: { sigunguCode: { in: [...] }, level: 2, isAbolished: false }`).
4. 각 항목의 시도 단축명은 `sidoFromPrefix(sigunguCode.slice(0, 2))`로 변환한다.
5. `Region`에서 찾지 못한 `sigunguCode`(폐지 등)는 결과에서 스킵한다.
6. 반환: `{ sigunguCode: string; sido: string; sigungu: string }[]`.
   - 정렬은 1~2단계의 거래량 내림차순을 유지한다.

성능: 인덱스 `Transaction[sigunguCode, propertyType, dealType, contractDate]`가 grouping을 받쳐준다.
홈은 `revalidate = 3600`(ISR)이라 집계는 시간당 최대 1회만 수행된다.

### 3. 와이어링

- `app/(public)/page.tsx`: 기존 `Promise.all([getSidoList(), getHomeStats(), getMarketBriefing()])`에
  `getPopularSigungus()`를 추가하고, 결과를 `HeroSection`에 prop으로 전달.
- `hero-section.tsx`: 받은 `popularRegions`를 `HeroSearch`로 전달.
- `hero-search.tsx`: 정적 `POPULAR` 상수를 제거하고, prop으로 받은 `popularRegions`를 렌더.
  각 칩의 `href`를 `/list?sido=...&region=...`로 구성.

타입: `interface PopularRegion { sigunguCode: string; sido: string; sigungu: string }`를
공유(예: `lib/region.ts`에서 export)하고 `HeroSection`/`HeroSearch` props에서 재사용.

### 4. 엣지 케이스

- 최근 90일 + 전체 기간 폴백 모두 0건이면 "인기 지역" 칩 섹션 전체를 렌더하지 않는다(빈 섹션 숨김).
- `sigunguCode`가 `Region`에 없으면 해당 항목 스킵(2.5단계). 그 결과 노출 개수가 `limit`보다 적을 수 있으며 허용한다.

## 범위 밖 (Non-goals)

- 동/지구(level 3) 단위 필터 지원.
- `/search` 페이지나 자동완성 로직 변경.
- 칩 개수 N의 사용자 설정/관리자 UI (코드 상수 기본값 6으로 고정).
- 인기 지역 집계 결과의 별도 캐시 계층(홈 ISR로 충분).

## 검증

- `getPopularSigungus()` 단위 동작: 시드/운영 데이터로 거래량 상위 시군구가 count 내림차순으로 반환되는지, 폴백 경로가 동작하는지 확인.
- 메인 화면에서 "인기 지역" 칩이 시군구명으로 렌더되는지.
- 칩 클릭 시 `/list?sido=...&region=...`로 이동하고, 목록이 해당 시군구로 필터되며 필터 패널의 시도/시군구가 선택 표시되는지(수동 확인).
- 거래 0건 환경에서 칩 섹션이 숨겨지는지.
