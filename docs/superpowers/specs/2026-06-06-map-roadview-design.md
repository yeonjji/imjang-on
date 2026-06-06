# 지도 + 로드뷰 상세페이지 적용 설계

작성일: 2026-06-06

## 배경 / 문제

1. **버그**: 상세페이지 지도가 "지도 준비 중" 플레이스홀더만 표시됨.
   - 근본 원인: `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` 미설정 → `NaverMap`이 SDK를 로드하지 않고 폴백.
   - 조치: `.env.local`에 Client ID 추가 (적용 완료).
2. **기능 요청**: 상세페이지에 **지도 + 로드뷰(네이버 파노라마)** 를 가로 1:1로 나란히 표시.

## 범위 (전 상세페이지 11종)

| 그룹 | 페이지 | 현재 상태 | 작업 |
|------|--------|-----------|------|
| 실거래가 | `apt/[id]`, `officetel/[id]`, `villa/[id]` | 지도 없음 | 핵심요약 아래 지도+로드뷰 **신규 추가** |
| 청약 | `subscription/[id]` | NaverMap 단독 | 지도+로드뷰로 **교체** |
| 편의시설 | `school`, `urban/[category]`, `urban/charger`, `amenity/[category]`, `childcare`, `medical/hospital`, `medical/pharmacy` | NaverMap 단독 | 지도+로드뷰로 **교체** |

## 컴포넌트 설계

### `components/ui/location-viewer.tsx` (신규, client)

기존 `naver-map.tsx`를 흡수하는 단일 컴포넌트.

- **Props**: `{ lat: number; lng: number; name?: string; height?: number }` (기존 NaverMap과 동일 → 교체 용이)
- **SDK 로딩**: `next/script` 1회.
  `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=panorama`
  - 기존 URL에 `&submodules=panorama` 추가 → 로드뷰(`naver.maps.Panorama`) 활성화.
- **레이아웃**:
  - 데스크탑: `grid-cols-2` (좌 지도 / 우 로드뷰), gap.
  - 모바일: 세로 스택 (`grid-cols-1`).
- **지도**: 기존과 동일 (`naver.maps.Map` + `Marker`, zoom 16).
- **로드뷰**: `new naver.maps.Panorama(el, { position: LatLng(lat,lng), pov: { pan:0, tilt:0, fov:100 } })`.
  - 커버리지 없음 폴백: 파노라마 init 실패/빈 결과 시 우측에 "이 위치는 로드뷰를 제공하지 않습니다" 안내.
- **키 미설정 폴백**: 기존 "지도 준비 중 (좌표)" 유지 (지도·로드뷰 영역 공통).

### 제거

- `components/ui/naver-map.tsx` → 사용처 0이 되면 삭제, import 8곳 교체.

## 적용 방식

- **실거래가 3종**: `<DealSummarySection id="summary" .../>` 바로 아래에 삽입.
  ```tsx
  {coord && (
    <Card id="map">
      <h2 className="...">위치 · 로드뷰</h2>
      <LocationViewer lat={coord.lat} lng={coord.lng} name={property.name} />
    </Card>
  )}
  ```
  (apt/officetel/villa는 `coord` 이미 fetch 중 → 추가 쿼리 불필요)
- **나머지 8종**: 기존 `<NaverMap .../>` 한 줄을 `<LocationViewer .../>`로 교체. Card/heading 래퍼 유지.

## 검증

1. dev 서버 재시작 후 `apt/[id]` 진입 → 핵심요약 아래 지도+로드뷰 1:1 표시.
2. 8개 페이지 중 표본(school, subscription) → 로드뷰 추가 확인.
3. 로드뷰 없는 좌표 → 폴백 문구 표시.
4. `npx tsc --noEmit` 통과.

## 비범위 (하지 않음)

- 로드뷰 커버리지 사전 조회 API 연동(없으면 폴백으로 충분).
- 지도 클릭/로드뷰 연동 인터랙션(추후).
- officetel/villa 외 신규 상세 타입.
