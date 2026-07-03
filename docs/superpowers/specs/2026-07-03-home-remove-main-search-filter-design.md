# 홈 단순화 — `MainSearchFilter` 제거 + `TypeHub` 전폭 승격

- **날짜:** 2026-07-03
- **상태:** 승인됨
- **관련:** 이 변경은 `docs/superpowers/specs/2026-06-04-main-hero-search-design.md`의 히어로 "🔍 실거래가 찾기 → `#search-filter` 스크롤" CTA를 대체한다(해당 과거 문서는 당시 기록으로 보존).

## 배경 / 문제

홈에는 실거래가로 진입하는 표면이 세 개 있다:

1. **히어로 `HeroSearch`** — 단지명·지역명 텍스트 검색(자동완성 + 인기지역 칩).
2. **`MainSearchFilter`("조건으로 실거래가 찾기")** — 유형·거래유형·금액·평수·지역 칩/셀렉트를 담아 `/list?params`로 **이동만** 시키는 클라이언트 폼.
3. **`/list`의 `ListFilterPanel`** — 위 조건 전부 + **지하철역 + 정렬**까지 갖춘 상위집합.

`MainSearchFilter`는 `ListFilterPanel`의 **부분집합**이고, 하는 일은 "조건을 담아 `/list`로 보내기"뿐이다. 즉 사용자를 다른 페이지로 넘기는 **두 번째 출입문**일 뿐 홈에서 체류·가치를 만드는 콘텐츠가 아니다. 히어로 텍스트 검색과 `/list` 필터가 이미 그 기능을 커버하므로 **중복**이다.

## 결정

`MainSearchFilter` 섹션을 **삭제**해 홈을 단순화한다. 같은 2단 행에 있던 `TypeHub`("실거래가 보러가기", 3개 유형 카드)는 그 자리에 **전폭**으로 승격하고, 카드를 세로 스택 → **가로 3단 그리드**로 재배치한다.

- 범위 밖(이번에 안 건드림): `/list` 필터 패널, `HeroSearch`, `TypeIconGrid`.
- `TypeHub`와 히어로 `TypeIconGrid`의 부분 중복(아파트·오피스텔·다세대)은 이번 스코프에서 다루지 않는다.

## 변경 상세

### 1. `app/(public)/_components/main-search-filter.tsx` — 파일 삭제
공유 의존(`Chip`, `Button`, `formatBillion`, `/api/regions`)은 다른 곳에서 계속 쓰이므로 고아 없음.

### 2. `app/(public)/page.tsx`
- `MainSearchFilter` import·사용 제거.
- `getSidoList` import 및 `Promise.all`의 `getSidoList()` 항목·`sidoList` 변수 제거 — `sidoList`는 오직 `MainSearchFilter`에만 넘어갔으므로 고아 제거. (`getSidoList` 자체는 `/list`에서 계속 사용.)
- 2단 행(`<div className="...md:flex-row md:items-stretch">` + `<div id="search-filter" ... scroll-mt-24>` 래퍼 + `<aside md:w-[380px]>`)을 통째로 삭제하고, 그 자리에 `<div className="mt-10"><TypeHub /></div>`를 전폭 배치.

### 3. `app/(public)/_components/type-hub.tsx`
- 루트: `flex h-full flex-col ...` → `flex flex-col ...` (`h-full` 제거 — 늘어날 stretch 부모가 사라짐).
- 카드 컨테이너: `flex flex-1 flex-col gap-3` → `grid grid-cols-1 gap-4 md:grid-cols-3` (`flex-1`·`flex-col` 제거).
- 각 카드: `flex-1` 제거. 등높이는 `min-h-[84px]` + 그리드 기본 `items-stretch`로 유지.

### 4. `app/(public)/_components/hero-section.tsx`
- "🔍 실거래가 찾기" `<button onClick={scrollToFilter}>` → 동일 스타일의 `<Link href="/list">`로 교체.
- 사라진 `#search-filter`를 참조하던 `scrollToFilter` 헬퍼 제거.
- `scrollToFilter` 제거로 이 파일에 클라이언트 코드(핸들러/훅/브라우저 API)가 남지 않으므로 `'use client'` 지시어 제거 → 서버 컴포넌트화(클라이언트 JS 소폭 감소). `HeroSearch`(client child)는 서버 컴포넌트가 렌더해도 정상.

## 부수효과 감사 (완료)

저장소 전체 7개 각도 병렬 스윕 결과 **신규 부수효과 없음(SAFE)**:

- ✅ **외부 소비처** — `MainSearchFilter`/`getSidoList`의 다른 import 없음.
- ✅ **테스트/E2E** — 이 섹션·`#search-filter` 앵커·`sidoList`를 참조하는 테스트 없음.
- ✅ **고아 API/데이터** — `sidoList` 제거로 고아 되는 경로 없음(`/api/regions`는 `/list`가 계속 사용).
- ✅ **크로스페이지 CTA** — 다른 페이지·nav·footer·게시판에서 `#search-filter`나 이 폼으로 향하는 링크 없음.
- ⚠️ "blocker"로 잡힌 `hero-section` 스크롤 참조·`page.tsx` 앵커 래퍼는 위 편집 #2·#4가 그대로 제거하므로 자연 해소.

## 성공 기준 (검증)

1. `pnpm build` 성공.
2. `pnpm lint` 통과 (고아 import/미사용 변수 없음).
3. 홈에서 "조건으로 실거래가 찾기" 폼이 사라지고, `TypeHub`가 전폭 3단 그리드로 표시.
4. 히어로 "🔍 실거래가 찾기" 클릭 시 `/list`로 이동.
