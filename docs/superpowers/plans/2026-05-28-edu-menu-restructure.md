# 교육시설 메뉴 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생활편의 드롭다운의 "학교" 그룹을 "교육시설"로 재명명하고 하위 항목을 `학교 / 어린이집`로 단순화한다. 학교 종류 구분은 list 페이지 필터에 위임, 어린이집은 Soon 배지로 노출.

**Architecture:** `LIFE_GROUPS` 상수만 갱신하면 드롭다운·모바일 드로어가 자동 반영되는 데이터 주도 구조. `LifeGroup.route` 필드 제거(현재 테스트에서만 쓰이고, 교육시설이 두 라우트에 걸쳐 불변식이 깨짐). 테스트도 새 구조에 맞춰 재작성.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Tailwind v4, pnpm

**Spec:** `docs/superpowers/specs/2026-05-28-edu-menu-restructure-design.md`

---

## File Structure

- Modify: `app/(public)/_components/life-menu.ts` — 그룹 라벨/항목 갱신, `LifeGroup.route` 필드 제거
- Modify: `tests/lib/life-menu.test.ts` — 5개 케이스 재작성 (route 불변식 케이스는 제거)

수정만 2파일. 신규/삭제 파일 없음. `life-dropdown.tsx`·`mobile-drawer.tsx`·`nav.tsx`·`/school` 페이지는 변경 없음.

---

### Task 1: 메뉴 데이터·테스트 동시 갱신 (TDD)

**Files:**
- Modify: `tests/lib/life-menu.test.ts` (전체 재작성)
- Modify: `app/(public)/_components/life-menu.ts` (인터페이스·상수 갱신)

- [ ] **Step 1: 새 테스트 작성 (red)**

`tests/lib/life-menu.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect } from 'vitest';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

describe('LIFE_GROUPS', () => {
  it('교육시설·의료시설·상권·편의·도시인프라 4개 그룹을 가진다', () => {
    expect(LIFE_GROUPS.map((g) => g.label)).toEqual([
      '교육시설',
      '의료시설',
      '상권·편의',
      '도시인프라',
    ]);
  });

  it('교육시설 하위는 학교(live, /school)와 어린이집(soon, /childcare)이다', () => {
    const edu = LIFE_GROUPS.find((g) => g.label === '교육시설')!;
    expect(edu.items).toEqual([
      { label: '학교', href: '/school', live: true },
      { label: '어린이집', href: '/childcare', live: false, soon: true },
    ]);
  });

  it('교육시설 외 그룹 하위는 아직 라이브가 아니다', () => {
    const others = LIFE_GROUPS.filter((g) => g.label !== '교육시설');
    expect(others.flatMap((g) => g.items).every((i) => !i.live)).toBe(true);
  });

  it('데이터 없는 항목(어린이집·보건소·주차장)만 soon 배지를 가진다', () => {
    const soon = LIFE_GROUPS.flatMap((g) => g.items).filter((i) => i.soon);
    expect(soon.map((i) => i.label)).toEqual(['어린이집', '보건소', '주차장']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
pnpm exec vitest run tests/lib/life-menu.test.ts
```

Expected: FAIL — 1번째 케이스에서 그룹 라벨 `['학교', ...]` vs `['교육시설', ...]` 불일치. 동시에 `LifeGroup` import 타입은 여전히 통과 (인터페이스 호환).

- [ ] **Step 3: 데이터 파일 재작성 (green)**

`app/(public)/_components/life-menu.ts` 전체를 다음으로 교체:

```ts
export interface LifeSubItem {
  label: string;
  href: string;
  /** false면 클릭 시 SoonModal — 페이지 완성 시 true로만 전환하면 라이브 */
  live: boolean;
  /** 데이터 자체가 없는 항목에 'Soon' 배지 */
  soon?: boolean;
}

export interface LifeGroup {
  label: string;
  items: LifeSubItem[];
}

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

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
pnpm exec vitest run tests/lib/life-menu.test.ts
```

Expected: PASS — 4개 케이스 모두 그린.

- [ ] **Step 5: 타입 체크**

Run:
```bash
pnpm exec tsc --noEmit
```

Expected: 에러 없음. `LifeGroup.route` 제거로 인한 컴파일 에러가 다른 파일에서 발생하지 않아야 함 (컴포넌트는 `route` 미참조 — 사전 확인 완료).

- [ ] **Step 6: 전체 단위 테스트 회귀 확인**

Run:
```bash
pnpm exec vitest run tests/lib tests/ingest
```

Expected: 모든 스위트 그린. 다른 테스트는 `LIFE_GROUPS` 의존하지 않음.

- [ ] **Step 7: Lint**

Run:
```bash
pnpm lint
```

Expected: 클린.

- [ ] **Step 8: 데스크톱·모바일 UI 수동 확인**

Run:
```bash
pnpm dev
```

브라우저에서 `http://localhost:3000` 접속 후:

데스크톱 (md 이상):
- 네비의 `생활편의` 클릭 → 4컬럼 드롭다운 표시
- 첫 컬럼 헤더가 `교육시설`로 표시되는지 확인
- 그 아래에 `학교`(보통 텍스트, 클릭 시 `/school` 이동)와 `어린이집`(회색 + `Soon` 배지, 클릭 시 SoonModal "어린이집") 노출 확인
- 다른 컬럼(의료시설/상권·편의/도시인프라)은 기존과 동일

모바일 (md 미만, 반응형 도구):
- 햄버거 → `생활편의` 토글 펼침
- `교육시설` 헤더 아래 `학교`(이동 가능) + `어린이집`(Soon 배지, 모달)

학교 페이지 동작:
- `/school` 직접 진입 시 종류 필터로 초/중/고/특수 전환되는지 (기존 동작 유지)

- [ ] **Step 9: 커밋**

```bash
git add app/\(public\)/_components/life-menu.ts tests/lib/life-menu.test.ts
git commit -m "feat(nav): 학교 그룹을 교육시설로 재편, 어린이집 항목 추가(Soon)

- LIFE_GROUPS 상위 라벨: 학교 → 교육시설
- 하위: 초/중/고/특수 4개 → 학교(live) / 어린이집(Soon) 2개
- 학교 종류 구분은 /school 페이지 필터에 위임
- LifeGroup.route 필드 제거(교육시설은 /school·/childcare 두 라우트에
  걸쳐 단일 prefix 불변식이 깨짐, 컴포넌트 미참조)"
```

---

## 검증 체크리스트 (작업 완료 시)

- [x] `pnpm exec tsc --noEmit` 그린
- [x] `pnpm exec vitest run tests/lib/life-menu.test.ts` 그린
- [x] `pnpm exec vitest run tests/lib tests/ingest` 그린 (회귀 없음)
- [x] `pnpm lint` 클린
- [x] 데스크톱 드롭다운에 `교육시설` 컬럼, 학교(live)·어린이집(Soon) 노출
- [x] 모바일 드로어에서도 동일하게 노출
- [x] 어린이집 클릭 시 SoonModal "어린이집"
- [x] `/school` 직접 진입 시 종류 필터 동작 (기존 회귀 없음)
