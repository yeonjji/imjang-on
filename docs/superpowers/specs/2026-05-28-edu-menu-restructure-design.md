# 생활편의 메뉴: 교육시설 그룹 재구성 설계

작성일: 2026-05-28
브랜치: `feature/childcare-ingest`
선행: `2026-05-27-life-menu-structure-design.md` (LIFE_GROUPS 도입), `2026-05-28-childcare-ingest-design.md` (어린이집 데이터 적재)

## 배경

어린이집 데이터 적재가 완료되어 생활편의 드롭다운에 노출이 필요하다. 동시에 기존 "학교" 그룹의 하위 메뉴(초등/중학교/고등/특수)는 학교 list 페이지의 `kind` 필터로 이미 커버되고 있어 드롭다운에서 중복 노출 중이다. 이 작업에서 그룹 라벨을 "교육시설"로 재명명하고 하위를 "학교 / 어린이집"으로 단순화한다.

## 목표

- 드롭다운 최상위 그룹 라벨: `학교` → `교육시설`
- 하위 항목 단순화: `초등 / 중학교 / 고등 / 특수` (4개) → `학교 / 어린이집` (2개)
- 학교 종류 구분은 list 페이지의 필터 UI에 위임 (이미 구현되어 있음)
- 어린이집 페이지는 별도 PR로 분리. 메뉴에는 "Soon" 배지로 선노출

## 비목표

- `/childcare` 페이지·라우트 신규 구현 (후속 작업)
- 어린이집 종류(국공립/민간/가정/직장 등) 별 메뉴 분기
- 학교 종류별 별도 라우트
- `LifeGroup` 데이터 구조의 3-레벨 계층화

## 메뉴 데이터 변경 (`app/(public)/_components/life-menu.ts`)

### 인터페이스 변경

`LifeGroup.route` 필드 제거. 사유:

- 현재 유일한 사용처가 `tests/lib/life-menu.test.ts` 의 "모든 하위 href는 자기 그룹 route 로 시작" 불변식
- 교육시설 그룹이 `/school`과 `/childcare` 두 라우트에 걸쳐서 단일 route prefix 불변식이 의미를 잃음
- 컴포넌트(`life-dropdown.tsx`, `mobile-drawer.tsx`)에서는 참조하지 않음
- 추후 그룹 랜딩 페이지가 실제로 필요해지면 그 시점에 재도입

변경 후 인터페이스:

```ts
export interface LifeGroup {
  label: string;
  items: LifeSubItem[];
}
```

### LIFE_GROUPS 새 형태

```ts
export const LIFE_GROUPS: LifeGroup[] = [
  {
    label: '교육시설',
    items: [
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ],
  },
  {
    label: '의료시설',
    items: [
      { label: '병원·의원', href: '/medical?type=hospital', live: false },
      { label: '약국', href: '/medical?type=pharmacy', live: false },
      { label: '보건소', href: '/medical?type=health-center', live: false, soon: true },
    ],
  },
  {
    label: '상권·편의',
    items: [
      { label: '편의점', href: '/amenity?type=convenience', live: false },
      { label: '마트', href: '/amenity?type=mart', live: false },
      { label: '카페', href: '/amenity?type=cafe', live: false },
      { label: '전통시장', href: '/amenity?type=market', live: false },
    ],
  },
  {
    label: '도시인프라',
    items: [
      { label: '공원', href: '/urban?type=park', live: false },
      { label: '충전소', href: '/urban?type=charger', live: false },
      { label: '주차장', href: '/urban?type=parking', live: false, soon: true },
    ],
  },
];
```

`LifeSubItem` 인터페이스는 변경 없음.

## 컴포넌트 영향

- `life-dropdown.tsx`: 변경 없음. `LIFE_GROUPS`를 그대로 순회하므로 데이터 교체만으로 반영. 4컬럼 그리드 유지.
- `mobile-drawer.tsx`: 변경 없음. 동일 사유.
- `nav.tsx`: 변경 없음.

## 라우트 영향

- `/school`: 변경 없음. 페이지가 이미 `kind` 기본값을 `'all'`로 처리하므로 (`app/(public)/school/page.tsx:29`) 쿼리 없이 진입 가능.
- `/childcare`: 신규 라우트 만들지 않음. 메뉴는 `live: false, soon: true` 로 SoonModal을 띄움.

## 테스트 변경 (`tests/lib/life-menu.test.ts`)

5개 케이스 모두 영향. 변경 후 의도:

1. **그룹 라벨**: `['교육시설', '의료시설', '상권·편의', '도시인프라']` 4개를 가진다.
2. **교육시설 하위**: 2개 항목. `학교`는 `live: true`, href `/school`. `어린이집`은 `live: false, soon: true`, href `/childcare`.
3. **교육시설 외 그룹 하위는 모두 live 아님**: 그대로 유지 (`label !== '교육시설'` 기준으로 변경).
4. **Soon 배지 항목**: `['어린이집', '보건소', '주차장']` (LIFE_GROUPS 순회 순서).
5. **모든 하위 href는 자기 그룹 route 로 시작** 불변식 테스트는 제거. `route` 필드 제거에 따른 정리.

## 마이그레이션·롤백

- 마이그레이션 없음 (DB·환경변수 변동 없음).
- 롤백: 단일 커밋 revert로 원복.

## 검증 체크리스트

- `pnpm exec tsc --noEmit` 통과
- `pnpm exec vitest run tests/lib/life-menu.test.ts` 그린
- `pnpm lint` 통과
- 데스크톱 드롭다운에서 "교육시설" 그룹 클릭 시 학교(live)·어린이집(Soon 배지) 두 항목만 표시
- 모바일 드로어 동일 동작
- 학교 클릭 → `/school` 진입 후 list에서 종류 필터링 가능
- 어린이집 클릭 → SoonModal 노출

## 작업 범위

- 수정 2파일: `app/(public)/_components/life-menu.ts`, `tests/lib/life-menu.test.ts`
- 신규/삭제 없음
- 예상 diff < 100 lines
