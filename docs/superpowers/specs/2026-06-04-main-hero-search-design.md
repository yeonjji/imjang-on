# 메인 페이지 히어로(검색 중심) 재구성 — 설계 문서

- 작성일: 2026-06-04
- 브랜치: `feat/main-hero-search`
- 참고 목업: `html/hero-options.html` (옵션 A 채택), 사용자 제공 스크린샷

## 목표

메인 페이지에 **검색 중심 히어로**를 신규 추가하고, 통계바·유형 아이콘 그리드를 더해 스크린샷과 동일한 데이터 구성을 만든다. 하단의 "실거래가 찾기 / 실거래가 보러가기" 비율을 스크린샷처럼 뒤집고, "보러가기" UI를 리스타일한다. 전 구간 모바일 최적화한다.

## 비목표 (YAGNI)

- 청약 데이터/페이지 신규 구축 (현재 라우트에 없음)
- `/list`에 텍스트 검색(q) 기능 추가 (텍스트 검색은 `/search`가 담당)
- 헤더 검색(`search-input.tsx`) 변경 (그대로 둠)
- 이미지의 도시 일러스트(아이소메트릭) 1:1 재현 (배경 그라데이션으로 대체)

---

## 전체 구조

```
HeroSection
  [왼쪽] 배지 / 짧은 제목 / 통합 검색창(자동완성) / 인기검색 칩 / CTA 2개
  [오른쪽] 유형 아이콘 그리드 (4×2, 8개)
StatsBar  (실제 DB 카운트, 4칸)
필터 행
  [넓게 flex-1] MainSearchFilter (실거래가 찾기)   id="search-filter"
  [좁게 ~380px] TypeHub (실거래가 보러가기, 리스타일)
```

데스크탑 기준 비율: 히어로 `md:grid-cols-[1.05fr_0.95fr]`, 하단 행 필터 `flex-1` + 보러가기 `md:w-[380px]`.

---

## 동작 / 링크 연결

### 히어로 문구 (기본값)
- 배지: `📍 실거래가·생활권 정보 통합 플랫폼`
- 제목: `어디든, 임장ON에서 바로 검색하세요` (브랜드 `임장ON`만 컬러 강조)
- 검색창 placeholder: `단지명·지역명·지하철역으로 검색`
- 인기검색 라벨: `인기검색`

### 히어로 검색창 (자동완성 + 엔터 제출)
- 타이핑(2자 이상) → `GET /api/search?q=` 호출, 단지·지역 후보를 드롭다운 표시
  - 단지 클릭 → `/apt/:id` · `/officetel/:id` · `/villa/:id` (type별)
  - 지역 클릭 → `/region/:code5`
- 엔터 또는 검색 버튼 → `router.push('/search?q=<입력값>')`
- 인기검색 칩 → `/search?q=<키워드>` (초기값: 마포, 송도, 동탄, 강남)

### CTA 버튼
- `🔍 실거래가 찾기` → `document.getElementById('search-filter')?.scrollIntoView({ behavior: 'smooth' })`
- `📍 생활편의 둘러보기` → `/life`

### 유형 아이콘 그리드 (8개)

| 아이콘 | 라벨 | 링크 |
|---|---|---|
| 🏢 | 아파트 | `/list?type=apt` |
| 🏬 | 오피스텔 | `/list?type=officetel` |
| 🏘️ | 다세대 | `/list?type=villa` |
| 🏫 | 학교 | `/school` |
| 🌳 | 공원 | `/urban/park` |
| 🏬 | 전통시장 | `/amenity/market` |
| ⚡ | EV충전소 | `/urban/charger` |
| 🏥 | 병원/약국 | `/medical/hospital` |

### 통계바 — 실제 DB 카운트 (ISR `revalidate=3600`, 병렬 count)

| 표시 라벨 | 집계 |
|---|---|
| 실거래 데이터 | `Transaction` count |
| 아파트/오피스텔/다세대 | `Property` count |
| 학교 정보 | `School` count |
| 생활편의시설 | `EvCharger + TraditionalMarket + Store + Park + Childcare + Parking + Hospital + Pharmacy` 합 |

- 표기: 만 단위 반올림 + "+"(예: `16만+`). 만 미만은 천 단위 등 적절히. 실제값이므로 스크린샷 숫자와 다를 수 있음.

---

## 컴포넌트 / 파일 단위

### 신규
- `app/(public)/_components/hero-section.tsx` (client) — 왼쪽(검색·CTA) + 오른쪽(유형 그리드) 조립. "실거래가 찾기" 스크롤 핸들러 보유.
- `app/(public)/_components/hero-search.tsx` (client) — 큰 검색창 + 자동완성 드롭다운 + 키워드 칩. `search-input.tsx` 로직을 큰 사이즈로 별도 구현(헤더용은 유지). 엔터/버튼 시 `/search?q=`.
- `app/(public)/_components/type-icon-grid.tsx` (server) — 8개 유형 아이콘 카드 + 링크.
- `app/(public)/_components/stats-bar.tsx` (server) — counts props를 받아 4칸 렌더.
- `lib/stats.ts` (신규) — `getHomeStats()`: 위 4개 카운트를 `Promise.all` 병렬 집계해 반환.

### 수정
- `app/(public)/page.tsx`
  - `getHomeStats()` + `getSidoList()` 병렬 호출
  - 렌더 순서: `HeroSection` → `StatsBar` → 필터 행
  - 필터 래퍼에 `id="search-filter"` (스크롤 타깃)
  - 하단 행 비율 뒤집기: 필터 `flex-1`(넓게) + 보러가기 `md:w-[380px]`(좁게)
- `app/(public)/_components/type-hub.tsx`
  - "실거래가 보러가기" 카드 리스타일: 색상 원형 아이콘 + 제목 + 부제 + 우측 화살표
  - 폭 ~380px 컨테이너에 맞게 조정

---

## 모바일 최적화 (mobile-first + `md:` 확장)

### 히어로
- 모바일 1열 세로 스택 → `md:` 2열 그리드. 순서: 배지 → 제목 → 검색창 → 칩 → CTA → 유형 그리드
- 제목 `text-2xl` → `md:text-4xl`
- 검색창 한 줄 유지, 패딩 축소. "검색" 버튼 텍스트 유지
- CTA: 모바일 전체폭 세로 스택(`flex-col w-full`) → `md:` 가로
- 키워드 칩 `flex-wrap`, 모바일 4개로 2줄 이내
- 히어로 패딩 `p-6` → `md:p-10`

### 유형 아이콘 그리드
- 모바일 4열 유지(`grid-cols-4`), gap/패딩 축소 → `md:` 카드 패딩 확대
- 아이콘 `text-xl`, 라벨 `text-xs`

### 통계바
- 모바일 2×2(`grid-cols-2`) → `md:grid-cols-4` 1행
- 구분선: 모바일은 gap+보더, `md:`에서 세로 divider
- 패딩 `p-4` → `md:p-6`

### 필터 + 보러가기 행
- 모바일 1열(필터 먼저 → 보러가기) → `md:` 가로(필터 `flex-1` + 보러가기 `md:w-[380px]`)
- 보러가기 카드: 모바일 전체폭, 충분한 터치 타깃 높이(`min-h`)

---

## 검증 기준

1. `pnpm build` 통과 (타입/빌드 OK)
2. 데스크탑: 히어로·통계바·뒤집힌 비율 렌더, 8개 아이콘/CTA/검색 링크 동작
3. 통계바에 실제 카운트 표시(0 아님)
4. 모바일 폭(≤375px)에서 가로 스크롤 없음, 히어로/통계바/필터 행이 위 규칙대로 스택
5. "실거래가 찾기" 클릭 시 하단 필터로 부드럽게 스크롤
6. 히어로 검색: 타이핑 시 자동완성 드롭다운, 엔터 시 `/search?q=` 이동
