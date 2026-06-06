# 한입 브리핑 항목 → 실거래가 목록 필터 진입

작성일: 2026-06-06

## 목표

메인 페이지 "오늘의 부동산 한입 브리핑"의 각 항목을 클릭하면, 해당 항목 기준으로
필터링된 실거래가 목록(`/list`)으로 진입하게 한다.

- 최다 거래 평형 클릭 → 그 평형으로 필터된 목록
- 오늘 등록된 실거래 클릭 → 일반 목록
- 급증 지역(예: 부안군)·인기 동네(예: 평택시)·가장 많이 거래된 지역 클릭 → 해당 시군구로 필터된 목록

## 결정 사항 (사용자 확인 완료)

- **평형 매핑**: 브리핑 5구간 → 목록 4구간으로 *가장 가까운 구간* 매핑. 화면 표시는 5구간 유지.
- **지역 링크**: 인기 동네·급증 지역·가장 많이 거래된 지역 모두 `/region` 상세 대신 `/list` 필터로 변경.
- **거래유형**: `deal` 파라미터를 붙이지 않음 (전체, `deal=all`).

## 데이터 사실

- `/list`는 쿼리 파라미터 `region`(=sigunguCode, 5자리), `area`(small/medium/large/xlarge),
  `sido`, `deal` 등을 읽는다. `region`만 있어도 서버 필터링은 동작 (`lib/property.ts:87`).
- 사이드바 필터 패널이 선택 시군구를 드롭다운에 *표시*하려면 `sido`도 필요
  (패널은 `sido` → `/api/regions`로 시군구 목록을 fetch). → 지역 진입 시 `region` + `sido` 동시 전달.
- 브리핑은 내부적으로 `sigunguCode`(groupBy 키)를 갖지만 외부로는 `code`(10자리 `region.code`, `/region/[code]`용)만
  노출한다. `/list`엔 `code`를 쓸 수 없으므로 `sigunguCode`(+`sido`)를 새로 노출해야 한다.

## 평형 라벨 → 목록 면적 구간 매핑

목록 면적 구간: `small ~59㎡`, `medium 60~84㎡`, `large 85~114㎡`, `xlarge 115㎡~`.

| 브리핑 평형 라벨 | 목록 area | 근거 |
|---|---|---|
| 전용 60㎡ 미만 | small | 동일 |
| 전용 60~85㎡ | medium | 동일 |
| 전용 85~102㎡ | large | 85~114에 포함 |
| 전용 102~135㎡ | xlarge | 115~와 겹치는 면적(20㎡)이 large와 겹치는 면적(12㎡)보다 큼 |
| 전용 135㎡ 초과 | xlarge | 115~ 포함 |

## 변경 1 — `lib/briefing.ts`

- 평형 라벨 → `AreaRange` 매핑 헬퍼 추가 (위 표). `AreaRange`는 `@/lib/property`에서 import.
- 인터페이스 확장:
  - `RegionCount`, `SurgeRegion`에 `sigunguCode: string`, `sido: string` 추가.
  - `summary.topAreaBand`에 `areaRange: AreaRange` 추가.
- `resolveRegions`에서 `sido`도 조회해 매핑값에 포함 (매칭 region 없으면 `sido: ''` 폴백).
- 조립부에서 `popularRegions` / `surgeRegions` / `topRegion`에 `sigunguCode`(groupBy 키), `sido` 채움.
- 기존 `code` 필드는 그대로 유지 (다른 영향 없게).

## 변경 2 — `app/(public)/_components/market-briefing.tsx`

링크만 교체. `deal` 파라미터는 추가하지 않음.

| 항목 | 새 링크 |
|---|---|
| 💡 최다 거래 평형 타일 | `/list?area={areaRange}` (신규 링크) |
| 🧾 오늘 등록된 실거래 타일 | `/list` (신규 링크) |
| 🚀 가장 많이 거래된 지역 타일 | `/list?region={sigunguCode}&sido={sido}` (기존 `/region` 교체) |
| 인기있는 동네 각 행 | `/list?region={sigunguCode}&sido={sido}` (기존 `/region` 교체) |
| 오늘의 발견/급증 지역 각 행 | `/list?region={sigunguCode}&sido={sido}` (기존 `/region` 교체) |

- 최고가/최저가 타일은 특정 단지이므로 `/apt/{id}` 유지.
- 지역 링크 생성은 작은 헬퍼 `listRegionHref({ sigunguCode, sido })`로 중복 제거 (`sido` 빈 값이면 생략).

## 변경 3 — 테스트 (`tests/lib/briefing.test.ts`)

- 평형 라벨 → `AreaRange` 매핑 헬퍼 단위 테스트 추가 (5개 케이스).
- `getMarketBriefing` 결과의 지역 항목이 `sigunguCode`를 담는지 1개 추가.
- 기존 테스트는 영향 없음.

## 검증 기준

1. `pnpm test` (briefing 테스트) 통과 → 매핑·필드 검증.
2. 메인에서 각 항목 클릭 시 올바른 쿼리스트링으로 `/list` 진입, 결과가 해당 필터로 좁혀짐.
3. 지역 클릭 시 사이드바에 해당 시/도·시군구가 선택 상태로 표시.
