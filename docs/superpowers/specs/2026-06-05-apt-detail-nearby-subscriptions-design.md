# 실거래가 상세 — "이 지역 청약" 섹션 설계

- 작성일: 2026-06-05
- 대상 화면: 아파트 실거래가 상세 (`app/(public)/apt/[id]/page.tsx`)
- 목표: 해당 아파트와 같은 지역에서 진행 중·예정이거나 최근 마감된 청약 공고를 보조 섹션으로 노출한다.

## 배경 / 데이터 현황

운영 DB 기준(2026-06-05 조회):

- 청약 공고(`SubscriptionNotice`) 총 **3,824건**, 좌표 보유 **2,468건(65%)** — 35%는 좌표 없음(주로 LH).
- `regionName`은 **시·도 단위 단축형**(`서울`·`경기`…)으로만 저장. 구/군 컬럼은 없음.
- `address`에 전체 주소 텍스트가 있어(`"서울특별시 강서구 가로공원로…"`) **시군구 문자열 매칭은 가능**.
- 현재 진행 중·예정(`receiptEnd >= today`) 공고는 전국 **~22건뿐** → "진행 중/예정만" 노출 시 대부분의 상세에서 섹션이 빈다. 최근 마감 공고로 보충해야 콘텐츠가 유지된다.

이 현실에 따른 확정 방향:

- **매칭**: 구/군 우선, 구/군 0건이면 시·도로 확장.
- **상태**: 진행 중·예정 우선 + 최근 마감으로 보충.
- **형태**: 컴팩트 리스트.
- **개수**: 최대 3건.

## 레이아웃 / 위치

`page.tsx`의 `<NearbyPriceComparison>` 다음, **`<NearbyInfra>` 바로 위**에 삽입한다.

컴팩트 리스트 형태:

```
이 지역 청약                    [강서구]
────────────────────────────────────────
[접수중 D-3]  마곡 9단지
              84㎡ · 9.8억 · 06.10~06.16
────────────────────────────────────────
[마감]      가양역 센트레빌
              59㎡ · 7.2억 · 05.02~05.08
────────────────────────────────────────
[마감]      마곡지구 8BL
              74㎡ · 8.9억 · 04.11~04.17
                       서울 청약 더보기 →
```

## 컴포넌트 — `app/(public)/apt/[id]/_components/nearby-subscriptions.tsx`

Props:

```ts
interface NearbySubscriptionsProps {
  id?: string;                  // 앵커용(섹션 id)
  items: SubscriptionListItem[]; // 최대 3건
  scope: 'sigungu' | 'sido';
  scopeLabel: string;           // 칩 표기 (예: "강서구" 또는 "서울")
  sido: string;                 // 단축 시도 (더보기 링크/텍스트용)
}
```

- 헤더: `이 지역 청약` + scopeLabel 칩 — 사용자가 매칭 범위를 인지.
- 각 행:
  - 상태 뱃지: `STATUS_LABEL` / `STATUS_TONE` + `ddayLabel` (기존 `lib/subscription.ts` 재사용).
  - 단지명(`item.name`).
  - 메타 라인: `면적 · 분양가 · MM.DD~MM.DD`.
    - 면적: `formatAreaRange(item.minArea, item.maxArea)`.
    - 분양가: `formatPriceRange(item.minPrice, item.maxPrice)`.
    - 접수기간: `receiptBegin`/`receiptEnd`를 `MM.DD~MM.DD` 단축 표기(연도 생략). 둘 다 없으면 "일정 미정".
  - 행 클릭 → `/subscription/{item.id}`.
- 하단 더보기 링크 → `/subscription?sido={sido}`, 텍스트는 `"{sido} 청약 더보기 →"`.
  - 청약 목록 페이지는 **시·도 필터만** 존재하므로, 칩이 구/군(`강서구`)이어도 더보기 링크·텍스트는 **시·도 기준**으로 일치시킨다.

## 데이터 레이어 — `lib/subscription.ts`

신규 함수:

```ts
export async function getNearbySubscriptions(opts: {
  sido: string;            // 단축 시도 (예: "서울")
  sigungu: string | null;  // 예: "강서구" (없으면 시·도 범위로 직행)
  limit?: number;          // 기본 3
}): Promise<{
  items: SubscriptionListItem[];
  scope: 'sigungu' | 'sido';
  scopeLabel: string;
}>;
```

동작:

1. `sigungu`가 있으면 **구/군 범위** 조회: `WHERE n."regionName" = sido AND n.address ILIKE '%{sigungu}%'`.
2. 구/군 결과가 0건이거나 `sigungu`가 null이면 **시·도 범위**로 재조회: `WHERE n."regionName" = sido`. 이때 `scope='sido'`, `scopeLabel=sido`.
3. 구/군 결과가 1건 이상이면 `scope='sigungu'`, `scopeLabel=sigungu`.

조회 SQL:

- 집계(분양가 min/max·면적 min/max·주택형 수)는 기존 `getSubscriptionList`의 `SubscriptionNotice LEFT JOIN SubscriptionUnit ... GROUP BY n.id` 패턴 재사용.
- 정렬: 진행 중·예정 먼저, 그다음 최근 마감순.

  ```sql
  ORDER BY (CASE WHEN n."receiptEnd" >= CURRENT_DATE THEN 0 ELSE 1 END),
           n."receiptEnd" DESC NULLS LAST,
           n.id DESC
  LIMIT {limit}
  ```

- 반환 행을 기존 `SubscriptionListItem` 형태로 매핑해 포맷 헬퍼를 그대로 활용.

`address ILIKE`의 `{sigungu}`는 Prisma 파라미터 바인딩으로 안전하게 처리하며, `%` 와일드카드를 양옆에 붙인 패턴 문자열로 전달한다.

## 단축 시도 매핑 — `lib/region.ts`

property의 `region.code` 앞 2자리를 `SIDO_LIST`의 `code` 앞 2자리와 매칭해 단축 시도(`서울`·`경기`)를 얻는 헬퍼 추가:

```ts
export function shortSidoFromRegionCode(regionCode: string): string | null;
```

- `region.code`가 없거나 매칭 실패 시 `null` → 섹션을 렌더하지 않는다.

## 페이지 연결 — `page.tsx`

- property의 `region.code`로 단축 시도, `region.sigungu`로 구/군을 구한다.
- `Promise.all`에 `getNearbySubscriptions({ sido, sigungu })` 추가(단축 시도가 null이면 스킵).
- 렌더: `<NearbyPriceComparison>` 다음, `<NearbyInfra>` 앞에 `<NearbySubscriptions>` 삽입.

## 빈 상태

- 단축 시도 매핑 실패, 또는 시·도 폴백까지 0건이면 섹션 전체를 렌더하지 않는다(`return null`).

## 테스트

- 순수 로직(scope 결정/폴백 분기, `MM.DD~MM.DD` 포맷, 단축 시도 매핑)은 단위 테스트(`tests/lib/subscription.test.ts` 등 기존 패턴).
- DB 쿼리(구/군 매칭·정렬·폴백)는 `.env.test` 시드 데이터 기반 통합 테스트로 커버 — 기존 `tests/` 구조 준수.

## 범위 밖 (YAGNI)

- 좌표 기반 거리 매칭(데이터 35% 좌표 없음 → 제외).
- 청약 목록 페이지의 구/군 필터 신설(이번 작업 범위 아님 — 더보기는 시·도 필터로 연결).
- 멀티 지역 공고(`"경기,서울,인천"` 등)의 정교한 분해 — `regionName` 정확 일치 기준을 따른다.
