# 통합검색 → 실거래가 목록 진입 설계

날짜: 2026-06-06

## 배경 / 문제

현재 통합검색창에서 검색어를 제출(Enter / 검색 버튼)하면 `/search?q=` 페이지로 이동한다.
이 페이지는 단지·지역 카드를 보여줄 뿐 **실거래가 목록**이 아니다.

실거래가 목록(`/list`)은 유형·거래유형·가격·면적·정렬·지역 필터를 갖춘 본 목록이지만,
**키워드(검색어) 필터가 없다** (`getPropertyList`에 이름 검색 파라미터 부재).

## 목표

통합검색창에서 검색하면 **검색어를 포함한 실거래가 목록(`/list`)으로 진입**한다.

## 결정 사항 (확정)

- **매칭 기준:** 단지명 + 지역명.
- **적용 범위:** 홈 히어로 검색창(`hero-search.tsx`) + 상단 네비 검색창(`search-input.tsx`) 둘 다.
- **드롭다운 항목 클릭:** 모두 목록으로 이동.
  - 단지 항목 → `/list?q=<단지명>`
  - 지역 항목 → `/list?region=<sigunguCode>` (목록이 이미 지원하는 정밀 지역 필터 재사용)
- **`/search` 페이지:** 삭제 (리다이렉트 아님).

## 구현 접근

키워드 매칭은 **Prisma `contains` 부분일치**로 구현한다.
- 기존 구조적 필터(거래유형·가격·면적·정렬)·페이지네이션과 그대로 결합.
- raw SQL 불필요, 손상 최소.
- "검색어 **포함**한 목록"이라는 요구에 의미상 정확히 부합.
- (오타 보정 trigram 유사도는 범위 밖. 자동완성 드롭다운은 기존 유사도 검색 유지.)

## 변경 상세

### 1. 데이터 계층 — `lib/property.ts`

- `PropertyListParams`에 `q?: string` 추가.
- `getPropertyList`에서 `q`(trim 후 비어있지 않을 때)가 있으면 키워드 조건을 `where.AND` 배열에 push:
  ```ts
  where.AND = [
    {
      OR: [
        { nameNorm: { contains: normalizeName(q) } },
        { region: { is: { fullName: { contains: q } } } },
      ],
    },
  ];
  ```
- 기존 `where.OR`(deal=all + 가격 조건)와 충돌하지 않도록 키워드는 **`AND` 배열로 분리**한다.
- `txCount12m > 0` 등 기존 deal 조건은 유지(실거래가 목록 성격 유지).
- `normalizeName`은 `lib/slug.ts`에서 import (이미 `nameNorm` 생성에 쓰는 정규화 함수).

### 2. 페이지 — `app/(public)/list/page.tsx`

- `SearchParams`에 `q?: string` 추가.
- `q`를 trim 하여 `PropertyList`에 전달.
- 헤더 카드: `q`가 있으면 부제 문구를 검색어 노출형으로 교체
  (예: 기본 안내문 대신 `"<q>" 검색 결과` 표시). 검색 건수는 기존대로 `PropertyList` 상단에 노출.

### 3. `PropertyList` — `app/(public)/list/_components/property-list.tsx`

- `Props`에 `q?: string` 추가, `getPropertyList` 호출에 전달.

### 4. 검색창 라우팅 변경

- `hero-search.tsx`:
  - `submit()`의 `router.push('/search?q=...')` → `router.push('/list?q=...')`.
  - 단지 드롭다운 `Link href`: `typeToHref(...)` → `/list?q=<name>`.
  - 지역 드롭다운 `Link href`: `/region/...` → `/list?region=<sigunguCode>`.
- `search-input.tsx` (네비):
  - `useRouter` import 추가, 입력에 `onKeyDown` Enter 핸들러 추가 → `/list?q=...`.
  - 단지/지역 드롭다운 href를 위와 동일하게 교체.
- 두 컴포넌트의 자동완성 데이터에는 지역 `code`가 이미 포함됨(`regions[].code`). `code.slice(0,5)`가 sigunguCode.

### 5. `/search` 페이지 삭제 + robots 정리

- `app/(public)/search/page.tsx` 삭제 (디렉터리 포함).
- `lib/search.ts`의 `autocomplete`는 **유지** (`app/api/search/route.ts`가 사용).
- `app/robots.ts`의 disallow 배열에서 `/search` 항목 제거.

## 영향 없는 것 (유지)

- `/api/search` 자동완성 엔드포인트, `lib/search.ts` autocomplete.
- 인기 지역 칩(`/list?sido=...&region=...`) — 기존 동작 유지.
- 목록의 기타 필터·정렬·페이지네이션.

## 검증

- `tsc --noEmit` 통과.
- `tests/lib`에 `getPropertyList` 단위 테스트 추가(기존 테스트 패턴 따름):
  - 단지명 `q` → 해당 단지 매칭.
  - 지역명 `q` → 해당 지역 단지 매칭.
  - `q` 미지정 → 기존과 동일 결과.
- 수동: 히어로/네비 검색창에서 Enter, 드롭다운 단지·지역 클릭 → `/list` 진입 및 결과 확인.

## 비범위 (YAGNI)

- trigram 유사도 기반 목록 검색(오타 보정).
- 지하철역 검색(자동완성·목록 모두 현재 미지원).
- 검색 결과 정렬을 유사도순으로 바꾸는 것(기존 정렬 옵션 유지).
