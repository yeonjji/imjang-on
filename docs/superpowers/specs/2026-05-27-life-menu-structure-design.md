# 생활편의 상위 메뉴 구조 재정비 — 메가 드롭다운 + URL 계약

**날짜:** 2026-05-27
**범위:** 상위 네비게이션(데스크톱 드롭다운 + 모바일 아코디언) + 향후 list/detail이 꽂힐 **URL 계약 확정**. 실제 list/detail 페이지 구현은 **이번 범위 제외**(별도 세션).

---

## 문제

현재 nav(`app/(public)/_components/nav.tsx`)는 평면 링크 4개(홈 / 실거래가 / 생활인프라 / 청약)뿐이다. `생활인프라`(→`/life`)는 5개 카테고리 카드 허브로만 연결되고, 실제로 완성된 것은 **학교**(`/school` + `?kind=` + `/school/[sigunguCode]/[id]`)뿐이다.

이미 수집된 데이터(`School`, `Store` 7개 업종, `TraditionalMarket`, `Park`, `EvCharger`)를 사용자가 그룹 단위로 탐색하고, 한 그룹 안에서 하위 항목을 **탭으로 왔다갔다** 할 수 있는 구조가 필요하다. 이를 위해 먼저 **상위 메뉴의 정보구조(IA)와 URL 계약**을 확정한다.

---

## 목표

- `생활인프라` → **`생활편의`**로 라벨 변경 후, **메가 드롭다운**(가로=그룹 4개, 세로=하위 항목)으로 확장
- 모바일 드로어에서는 동일 구조를 **아코디언**으로 제공
- 그룹/하위/디테일의 **URL 계약**을 확정해 향후 list/detail 작업이 그대로 꽂히도록 함
- 미빌드 그룹의 하위 클릭은 당분간 **SoonModal**로 처리, 페이지 완성 시 라이브 링크로 교체
- 데이터·스키마·실제 list/detail 페이지는 **건드리지 않음**

### 비목표 (이번 범위 제외)

- `/medical` · `/amenity` · `/urban` 의 list 페이지, 필터, 페이지네이션, detail 페이지 구현
- `Store` 업종 추가 수집(식당·학원 등)이나 ETL 변경
- 학교 기존 라우트/필터 동작 변경 (그대로 둔다)

---

## 택소노미 (확정)

데이터 기반 매핑. 그룹 라벨은 향후 확장을 고려해 결정됨.

| 그룹 (가로) | 라우트 | 하위 (세로 / 탭 후보) | `?type` 값 | 데이터 출처 |
|---|---|---|---|---|
| **학교** | `/school` | 초등 / 중학교 / 고등 / 특수 | `?kind=elem\|mid\|high\|special` *(기존)* | `School.schoolKind` |
| **의료시설** | `/medical` | 병원·의원 / 약국 / 보건소*(Soon)* | `?type=hospital\|pharmacy` | `Store` (Q101·Q102 / G21501) |
| **상권·편의** | `/amenity` | 편의점 / 마트 / 카페 / 전통시장 | `?type=convenience\|mart\|cafe\|market` | `Store` (G20405 / G20404·G20402 / I21201) + `TraditionalMarket` |
| **도시인프라** | `/urban` | 공원 / 충전소 / 주차장*(Soon)* | `?type=park\|charger` | `Park` + `EvCharger` |

병합 규칙: 병원(Q101)+의원(Q102) → 한 탭 `hospital`. 슈퍼마켓(G20404)+대형마트(G20402) → 한 탭 `mart`.
확장 여지: `상권·편의`는 향후 `restaurant`·`academy`·`bank` 등을 같은 `Store`(generic `industryCode`)에서 추가 가능. `도시인프라`는 `parking`·`library` 등 공공시설 추가 가능. 둘 다 스키마 변경 없이 탭만 추가.

---

## URL 계약

- **그룹 = 최상위 라우트:** `/school`(기존) · `/medical` · `/amenity` · `/urban`
- **하위 = 쿼리 파라미터:** `?type=` (학교는 기존 `?kind=` 유지 — 변경하지 않음)
- **디테일(추후):** `/{group}/[sigunguCode]/[id]` — 학교와 동일한 시군구 스코프 구조
- **탭 전환 = `?type` 링크 이동** (클라이언트 토글 아님) → 페이지별 ISR·SEO 유지, 기존 학교 list가 `searchParams`를 읽는 방식과 일치
- 미빌드 라우트(`/medical`·`/amenity`·`/urban`)는 **이번 범위에서 생성하지 않음**. 링크 타깃 문자열만 정의해 두고, 클릭 시 SoonModal로 가로챈다.

---

## 설계

### 1. 메뉴 정의 단일 소스

그룹·하위·라우트·`?type`·Soon 여부·라이브 여부를 한 곳에서 정의한다. nav(데스크톱)와 mobile-drawer(모바일)가 같은 정의를 공유한다.

신규 파일 `app/(public)/_components/life-menu.ts` (예시 형태):

```typescript
export interface LifeSubItem {
  label: string;
  href: string;      // 예: '/school?kind=elem' | '/medical?type=pharmacy'
  live: boolean;     // false면 클릭 시 SoonModal
  soon?: boolean;    // 데이터 자체가 없는 항목(보건소·주차장)에 'Soon' 배지
}
export interface LifeGroup {
  label: string;     // 학교 / 의료시설 / 상권·편의 / 도시인프라
  route: string;     // /school ...
  items: LifeSubItem[];
}
export const LIFE_GROUPS: LifeGroup[] = [ /* 위 택소노미 표 그대로 */ ];
```

- 학교 4개 항목: `live: true`
- 의료·상권·도시인프라 항목: `live: false` (현재) → list 페이지 완성 시 `true`로만 바꾸면 라이브
- 보건소·주차장: `live: false, soon: true` (데이터 없음 → 항상 'Soon' 배지)

### 2. 상위 라벨 변경

nav와 mobile-drawer의 `생활인프라` → `생활편의`. 라벨(또는 `/life` 링크) 클릭 시 기존 허브 `/life`로 이동은 유지하되, 데스크톱은 hover/클릭으로 드롭다운을 연다.

### 3. 데스크톱 메가 드롭다운 (`nav.tsx`)

- `생활편의` 항목을 버튼화(또는 링크+caret). hover 또는 클릭 시 nav 하단에 패널 표시.
- 패널: `LIFE_GROUPS`를 가로 4컬럼으로 렌더. 각 컬럼 = 그룹 라벨 + 세로 하위 링크 목록.
- 하위 링크:
  - `live` → `<Link href={item.href}>`
  - `!live` → 버튼, 클릭 시 SoonModal 오픈(`topic = group.label` 또는 `item.label`)
  - `soon` → 라벨 옆 `<Badge tone="gray">Soon</Badge>`
- 접근성: `aria-expanded`, `Esc`로 닫기, 외부 클릭 닫기, 패널 열림 시 첫 항목 포커스 가능. 기존 `mobile-drawer.tsx`의 키보드/포커스 패턴을 참고해 동일 수준 유지.
- 상태: `const [lifeOpen, setLifeOpen] = useState(false)` 추가.

### 4. 모바일 아코디언 (`mobile-drawer.tsx`)

- 기존 평면 링크 목록에서 `생활편의`를 **확장 가능한 섹션**으로 교체.
- 탭하면 그룹들이 펼쳐지고, 각 그룹 아래 하위 링크가 들여쓰기되어 표시.
- `live` 링크는 이동 후 드로어 닫기(`onClose`), `!live`는 SoonModal(드로어 닫고 모달 오픈, 기존 `onSoonClick` 패턴 확장).
- 기존 `inert`/`body overflow 잠금`/`Esc`/포커스 복원 로직은 유지.

### 5. SoonModal 일반화 (`soon-modal.tsx`)

- 현재 청약 전용 문구를 `topic` 기반으로 일반화(이미 `topic` prop 존재). "의료시설 준비 중입니다" 형태로 그룹/항목명을 받아 표시.
- 청약 동작은 회귀 없이 유지.

---

## 손대는 파일

| 파일 | 변경 |
|---|---|
| `app/(public)/_components/life-menu.ts` *(신규)* | 그룹·하위·URL·Soon 정의 단일 소스 |
| `app/(public)/_components/nav.tsx` | `생활편의` 라벨 + 메가 드롭다운 + `lifeOpen` 상태 |
| `app/(public)/_components/mobile-drawer.tsx` | `생활편의` 아코디언 섹션 |
| `app/(public)/_components/soon-modal.tsx` | `topic` 기반 문구 일반화(필요 시) |

데이터·Prisma·기존 학교 라우트·`/list` 등은 변경 없음.

---

## 인터랙션 / 회귀 체크리스트

- [ ] 데스크톱: `생활편의` hover/클릭 → 4컬럼 패널, 항목 보임. Esc·외부클릭으로 닫힘.
- [ ] 학교 하위(초/중/고/특수) → `/school?kind=...` 정상 이동.
- [ ] 의료·상권·도시인프라 하위 클릭 → SoonModal 표시(404 아님).
- [ ] 보건소·주차장 → 'Soon' 배지 표시.
- [ ] 모바일 드로어: `생활편의` 아코디언 펼침/접힘, 학교 링크 이동 시 드로어 닫힘.
- [ ] 모바일 검색 드롭다운 폭 넘침(기존 수정) 회귀 없음.
- [ ] 청약 SoonModal 기존 동작 유지.
- [ ] `생활인프라` 잔존 문구(`/life` 메타데이터 등) 라벨 일관성 확인.
- [ ] tsc / lint 통과.

---

## 추후 (별도 세션, 본 계약을 따름)

각 그룹의 list 페이지(`/medical` 등) + `?type` 탭 + detail(`/{group}/[sigunguCode]/[id]`)을 학교 패턴(`/school` list·필터·`SchoolCard`·`nearby-apartments` 교차링크) 복제로 구현. 완성된 그룹은 `life-menu.ts`에서 해당 항목 `live: true`로만 전환.
