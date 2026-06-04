# 메인 하단 편의시설 허브 섹션 — 설계 (Design)

작성일: 2026-06-04

## 1. 목적

메인 페이지(`app/(public)/page.tsx`)에는 현재 부동산 유형(아파트·오피스텔·빌라)으로 가는 진입점(`TypeHub`)만 있고, **생활편의(편의시설) 리스트 페이지로 가는 진입점이 없다.** 데이터와 리스트 페이지(`/school`, `/medical/*`, `/amenity/*`, `/urban/*`)는 이미 모두 존재하고 `/life` 풀 허브도 있으나, 메인에서 곧장 닿을 길이 없다.

이 작업은 **메인 페이지 맨 아래에 편의시설 허브 섹션을 추가**한다. 새 데이터·페이지를 만들지 않고, 기존 리스트 페이지로 연결하는 내비게이션 진입점만 붙인다.

## 2. 범위

### In scope
- 메인 페이지 하단에 들어가는 정적 표현 컴포넌트 1개 신규.
- 기존 카테고리 정의(`LIFE_GROUPS`)를 단일 출처로 재사용.
- 컬러 이모지 대신 `lucide-react` 단색 라인 아이콘 사용.

### Out of scope
- 건수(카운트) 표시 — 하지 않음. 순수 내비게이션. DB 쿼리 0건.
- 새 리스트/상세 페이지, 새 라우트, 데이터 적재.
- `/life` 허브 페이지나 `LIFE_GROUPS` 구조 변경(이모지 필드 추가 등) — 건드리지 않음.
- 좌표/지도 연동.

## 3. 디자인 결정 (확정)

브레인스토밍에서 확정한 사항:

1. **구성 단위: 하이브리드(C안)** — 4개 그룹 카드 + 각 카드 안에 항목 칩.
   - 그룹 헤더(아이콘 + 라벨 + "더보기 →") → 그룹 허브 `/life/{slug}`.
   - 각 항목 칩 → 해당 리스트 페이지로 직접 (`item.href`).
2. **건수 표시 없음** — 아이콘 + 라벨만. 위치 맥락 없는 전국 단위에서 숫자는 의미가 약하고 쿼리 비용만 발생.
3. **아이콘: 단색 라인(`lucide-react`)** — 색 최소화. 아이콘 기본색은 슬레이트, 브랜드 블루는 "더보기"와 hover에만.

## 4. 컴포넌트 설계

### 4.1 파일

- **신규:** `app/(public)/_components/amenity-hub.tsx` — 서버 컴포넌트, async 없음, props 없음. 순수 정적 렌더. 아이콘 매핑 상수(`GROUP_ICONS`, `ITEM_ICONS`)를 named export 한다(테스트에서 import).
- **수정:** `app/(public)/page.tsx` — 기존 `검색필터 + TypeHub` flex 블록 다음(맨 아래)에 `<AmenityHub />` 추가.
- **테스트(신규):** `tests/lib/amenity-hub-icons.test.ts` — 아이콘 매핑 완전성 검증(순수 단위, node 환경).

### 4.2 데이터 출처 (단일 정의 재사용)

`app/(public)/_components/life-menu.ts`의 기존 export를 그대로 사용:

- `LIFE_GROUPS: LifeGroup[]` — 4그룹(`education`/`medical`/`amenity`/`urban`), 각 그룹의 `slug`, `label`, `items[]`(각 항목 `label`, `href`, `live`).

→ 카테고리·라벨·href가 `life-menu.ts` 한 곳에만 존재하므로 `/life` 페이지·sibling 탭과 항상 일치한다. 이 컴포넌트는 데이터를 복제하지 않는다.

### 4.3 아이콘 매핑 (컴포넌트 로컬)

`life-menu.ts`의 `LIFE_ITEM_EMOJI`(컬러 이모지)는 사용하지 않는다. `lucide-react` 아이콘으로 매핑하는 로컬 상수 2개를 `amenity-hub.tsx` 안에 둔다(공유 파일 미변경, surgical).

그룹 아이콘 (`LifeGroupSlug` → 아이콘):

| slug | 라벨 | lucide 아이콘 |
|------|------|---------------|
| `education` | 교육시설 | `GraduationCap` |
| `medical` | 의료시설 | `Stethoscope` |
| `amenity` | 상권·편의 | `ShoppingCart` |
| `urban` | 도시인프라 | `TreePine` |

항목 아이콘 (항목 `label` → 아이콘):

| label | lucide 아이콘 |
|-------|---------------|
| 학교 | `School` |
| 어린이집 | `Baby` |
| 병원·의원 | `Hospital` |
| 약국 | `Pill` |
| 편의점 | `Store` |
| 마트 | `ShoppingCart` |
| 카페 | `Coffee` |
| 전통시장 | `Tent` |
| 주차장 | `SquareParking` |
| 공원 | `Trees` |
| 충전소 | `Zap` |

매핑은 `Record<string, LucideIcon>` 형태. 매핑에 없는 label은 폴백 아이콘(`MapPin`)을 쓴다(미래 항목 추가 시 깨지지 않도록).

### 4.4 마크업 / 동작

```
<section> (생활편의 허브)
  eyebrow: "생활편의"
  h2: "생활권까지 함께 보기"
  desc: "학교·병원·상권·도시인프라 — 우리 동네 편의시설을 카테고리별로 둘러보세요."

  grid (모바일 1열, md 2열):
    각 group:
      <article> 카드
        헤더: <Link href={`/life/${group.slug}`} aria-label={`${group.label} 전체 보기`}>
                [그룹아이콘] {group.label}  ...  "더보기 →"
              </Link>
        칩들: group.items.map(item =>
                <Link href={item.href}>[항목아이콘] {item.label}</Link>
              )
```

- 그룹 헤더 전체가 하나의 링크(허브로). 칩은 각각 개별 링크(리스트로).
- 모든 항목 `live: true`이므로 `SoonModal`/배지 처리 불필요. (만약 `live: false`인 항목이 생기면 향후 처리 — 현재 범위 밖.)

### 4.5 스타일 (기존 토큰 준수)

`TypeHub`와 동일 토큰:
- 카드: `rounded-[20px]` 내외, `border border-[var(--color-line)]`, `bg-white`, `shadow-[var(--shadow)]`.
- 제목/라벨: `text-[var(--color-blue-dark)]`, eyebrow/더보기: `text-[var(--color-blue)]`.
- 칩: 둥근 `rounded-full`, 보더 `--color-line`, 기본 텍스트 슬레이트(`text-[var(--color-muted)]` 또는 `text-slate-600`), 아이콘 슬레이트.
- hover: 칩 보더·텍스트·아이콘이 `--color-blue`로. 전환 `transition`.
- 아이콘 크기: 그룹 ~20px, 칩 ~15px. `aria-hidden` (라벨이 텍스트로 있으므로).

## 5. 데이터 흐름 / 렌더링

- 완전 정적. DB 접근·fetch 없음. 서버 컴포넌트에서 `LIFE_GROUPS`를 직접 매핑해 렌더.
- `page.tsx`의 `export const revalidate = 3600` 영향 없음(정적 콘텐츠).

## 6. 에러 처리

- 외부 의존(네트워크·DB) 없음 → 런타임 에러 경로 없음.
- 아이콘 매핑 누락 시 폴백 아이콘(`MapPin`)으로 안전 처리(4.3).

## 7. 테스트

`tests/lib/amenity-hub-icons.test.ts` (순수 vitest, node 환경 — 코드베이스 관례. Testing Library/jsdom 도입 안 함):

1. **그룹 아이콘 완전성** — `LIFE_GROUPS`의 모든 `slug`가 `GROUP_ICONS`에 매핑되어 있다.
2. **항목 아이콘 완전성** — `LIFE_GROUPS`의 모든 항목 `label`이 `ITEM_ICONS`에 매핑되어 있다(폴백 `MapPin`에 의존하지 않음 — 누락/오타 시 실패).
3. 매핑된 값이 모두 truthy(유효한 아이콘 컴포넌트 참조)이다.

→ 컴포넌트는 외부 입력 없는 정적 렌더라 런타임 분기·실패 경로가 없다. 유일한 실질적 회귀 위험은 "항목이 늘었는데 아이콘 매핑을 빠뜨리는 것"이며, 위 완전성 테스트가 이를 잡는다. 렌더 정확성은 `tsc` 타입체크 + 시각 미리보기로 검증(별도 DOM 테스트 불필요).

> 참고: 마크업/href 일치(그룹 헤더 → `/life/{slug}`, 칩 → `item.href`)는 `LIFE_GROUPS`를 직접 매핑해 렌더하므로 구조적으로 보장된다(별도 단언 불필요).

## 8. 영향 / 리스크

- 기존 페이지 동작 변화 없음(추가만). `page.tsx`에 컴포넌트 1줄 추가 + import.
- `lucide-react`는 이미 의존성에 존재(nav·search에서 사용 중) → 신규 패키지 없음.
- 번들 영향: 사용 아이콘 ~15개 tree-shaking, 미미.
