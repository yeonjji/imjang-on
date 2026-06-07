# /list 무한 스크롤(하이브리드) + 인피드 광고 — 설계 문서

- 날짜: 2026-06-07
- 대상: `/list`(실거래가 목록) 페이지 한정
- 선행: 페이지네이션 재설계(`components/ui/pagination.tsx`, `lib/pagination.ts`)는 이미 머지됨. **그대로 유지** — urban/amenity/subscription/childcare/school/apt-거래테이블 6개 표면이 계속 사용. 본 작업은 `/list`만 무한 스크롤로 전환.

## 방향 (사용자 결정)

- 패러다임: **하이브리드 무한 스크롤** — 스크롤 시 자동 로드 최대 **3회**(페이지 2~4), 이후 **"30개 더보기"** 버튼.
- 광고: 리스트 중간 **플레이스홀더 인피드 슬롯**(SPONSORED 라벨), **8카드마다 1개**. 실제 AdSense 연동은 별도 후속(현재 미연동).
- 근거/트레이드오프: 무한 스크롤은 페이지네이션 대비 pageview·노출 감소가 있으나, 인피드 광고로 스크롤 깊이를 수익화해 상쇄. 하이브리드(자동→버튼)는 푸터 도달성·viewability·AdSense 정책 측면에서 순수 무한 스크롤보다 안전.

## 핵심 제약: BigInt 직렬화

`getPropertyList`는 Prisma `Property & { region: Region }`를 반환하며 `id`와 가격 필드가 **BigInt**(`saleAvgPrice12m`, `saleLastPrice`, `jeonseAvgDeposit12m`, `jeonseLastDeposit`, `wolseAvgDeposit12m`, `wolseLastDeposit`)다. `Response.json()`은 BigInt에서 throw하므로 직렬화가 필요.

- 해법: `PropertyListItem` DTO + `serializeProperty(row)` (`lib/property.ts`). `id`→string, BigInt 가격→number(실거래가 won 값은 `Number.MAX_SAFE_INTEGER` 이내로 안전). `formatBillion`은 이미 `number | bigint`를 받으므로 카드 렌더 호환.
- `getPropertyList` 시그니처는 **변경하지 않음**. 직렬화는 렌더 경계(서버 컴포넌트·API 라우트) 양쪽에서 `rows.map(serializeProperty)`로 적용.
- `getPropertyList`/`PropertyListCard` 호출처는 각각 `property-list.tsx` 한 곳뿐 → DTO 전환 영향 범위 작음.

## 아키텍처

1. **API 라우트** `app/api/list/route.ts` — `app/api/search/route.ts` 패턴. 쿼리 파싱(`parseListParams`) → `getPropertyList` → `{ items: rows.map(serializeProperty), total, page, perPage, totalPages }` JSON 반환 + Cache-Control.
2. **공유 파라미터 파서** `lib/list-params.ts` — 현재 `page.tsx`에 인라인된 `TYPE_MAP` + searchParams 파싱을 `parseListParams(sp)`로 추출. `page.tsx`와 API 라우트가 공유(드리프트 방지).
3. **서버 첫 페이지** `property-list.tsx` — page 1을 SSR(ISR 유지·즉시 페인트·첫 광고 노출). `rows.map(serializeProperty)` → 카운트 카드 + `<InfinitePropertyList initialItems=... query=... />` 렌더. `PaginationNav` 제거.
4. **클라이언트** `infinite-property-list.tsx`(`'use client'`) — 초기 items 보유, IntersectionObserver 센티넬로 자동 로드(최대 3회), 이후 "30개 더보기" 버튼. `/api/list?<query>&page=<n>` fetch로 append. 로딩 스피너/에러 재시도/종료 문구("모든 결과를 불러왔습니다"). 렌더는 `withAdSlots(items, 8)`로 인피드 슬롯 인터리브.
5. **광고 슬롯** `ad-slot.tsx` — 플레이스홀더(점선 박스 + SPONSORED).
6. **정리** — `/list`가 `PaginationNav` 미사용 → 고아가 된 `pagination-nav.tsx` 삭제. 공유 `Pagination`은 유지.

## 순수 로직(TDD)

- `serializeProperty(row): PropertyListItem` — BigInt→string/number 변환.
- `withAdSlots(items, interval): FeedEntry[]` — N개마다 광고 엔트리 삽입(인터리브).

## 상태/엣지

- 필터 변경 → 서버 리렌더로 `InfinitePropertyList`가 새 `initialItems`/`query`로 리셋(쿼리 문자열 `key`).
- 첫 렌더는 항상 page 1(무한 스크롤은 1부터 시작). `?page=` 서버 점프는 `/list`에서 미사용.
- No-JS: 첫 페이지만 노출(목록은 `robots:noindex` → 허용 가능한 절충).
- 결과 0건: 기존 빈 상태 카드 유지(클라이언트 컴포넌트 미마운트).
- `perPage` 30 유지. 자동 로드 상수 `AUTO_MAX=3`, 광고 간격 `AD_INTERVAL=8`.

## 변경/생성 파일

- Create: `app/api/list/route.ts`, `lib/list-params.ts`, `app/(public)/list/_components/infinite-property-list.tsx`, `app/(public)/list/_components/ad-slot.tsx`
- Modify: `lib/property.ts`(DTO+serializeProperty), `app/(public)/list/page.tsx`(parseListParams+query 전달), `app/(public)/list/_components/property-list.tsx`(DTO+InfiniteList), `app/(public)/list/_components/property-list-card.tsx`(prop 타입 DTO)
- Delete: `app/(public)/list/_components/pagination-nav.tsx`
- Tests: `tests/lib/property-serialize.test.ts`, `tests/lib/list-feed.test.ts`, `tests/e2e/list.spec.ts`(페이지네이션 테스트 → 무한 스크롤 테스트로 교체)

## 검증

- vitest: `serializeProperty`, `withAdSlots`.
- typecheck/build: 4개 신규 + 4개 수정 파일.
- e2e(`/list`): 카드 렌더 + 인피드 슬롯(SPONSORED) 노출 + 스크롤 시 추가 로드/종료 문구. 기존 필터·정렬 테스트 그린 유지.
- 회귀: 다른 6개 표면 e2e(urban-parking-list 등) 그린 — 공유 Pagination 라벨 변경은 해당 e2e가 의존하지 않음(검증됨).
