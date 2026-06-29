# L1 — Hospital Tabs SSR (AdSense Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hospital detail page's 시설(facility)·운영(operation) 탭 콘텐츠가 서버 렌더 HTML에 포함되게 해, 크롤러·AdSense 심사 크롤러가 읽을 수 있게 한다(현재 client-only라 no-JS HTML에서 누락 — 2026-06-29 baseline 실측 확인).

**Architecture:** `HospitalTabs`는 `'use client'` 컴포넌트로 활성 탭만 **조건부 마운트**(`{active === 'x' && <Panel/>}`)해 비활성 두 패널이 SSR HTML에서 빠진다. 세 패널을 **항상 렌더**하고 `hidden` 속성으로 가시성만 토글하도록 바꾼다. 콘텐츠는 DOM에 상주(크롤 가능)하고, 하이드레이션 후 클릭 인터랙션은 그대로 유지된다.

**Tech Stack:** Next.js App Router(React 클라이언트 컴포넌트), vitest + `react-dom/server`의 `renderToStaticMarkup`(SSR 출력 테스트 — `tests/components/location-viewer-ssr.test.ts` 패턴 동일).

---

## File Structure

- **Modify:** `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx` — 세 패널 항상 렌더 + `hidden` 토글.
- **Create:** `tests/components/hospital-tabs-ssr.test.ts` — 세 패널 콘텐츠가 정적 마크업에 포함되는지 단언.
- **Modify:** `package.json`(`test:unit` 스크립트) — `tests/components`를 CI 단위 테스트에 포함(현재 제외돼 SSR 테스트가 게이트되지 않음; 기존 location-viewer SSR 테스트도 함께 활성화).

## 엔지니어가 알아야 할 배경

- 서버 컴포넌트 `.../[id]/page.tsx`가 `<HospitalTabs hospital={hospital} />`를 렌더한다. 클라이언트 부분은 이 탭 컴포넌트뿐.
- `HospitalTabOperation`은 `detail` prop이 truthy면(요일 값이 전부 null이어도) `진료시간` `<h3>`를 렌더한다. `HospitalTabFacility`는 `facility` prop이 truthy면 `병상 현황` `<h3>`를 렌더한다. 이 두 문자열을 SSR 단언으로 쓰는 이유: baseline no-JS HTML에서 정확히 이 콘텐츠가 빠져 있었다.
- `vitest.config.ts`가 이미 `environment: 'node'`, `globals: false`(→ `describe/it/expect`를 `vitest`에서 import), `include: ['tests/**/*.test.ts']`, alias `@`→repo root를 설정. 이 SSR 테스트는 DB·DOM 불필요.
- vitest(esbuild)는 JSX를 classic 런타임으로 변환해 전역 `React.createElement`를 찾지만, 컴포넌트는 자동 런타임(`React` import 없음)을 쓴다. 기존 SSR 테스트가 전역 shim `(globalThis as unknown as { React: typeof React }).React = React;`로 해결한다. 동일하게 적용.

---

## Task 1: 세 탭 패널이 서버 렌더되는지 증명하는 SSR 테스트

**Files:**
- Create: `tests/components/hospital-tabs-ssr.test.ts`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/components/hospital-tabs-ssr.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HospitalTabs } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs';
import type { HospitalWithRelations } from '@/lib/hospital';

// 컴포넌트는 자동 JSX 런타임(React import 없음)을 쓰지만 vitest(esbuild)는 classic 런타임으로
// 변환해 React.createElement를 전역에서 찾는다. 전역 shim으로 맞춘다.(location-viewer-ssr.test.ts와 동일)
(globalThis as unknown as { React: typeof React }).React = React;

// facility/detail가 truthy면 각 패널의 '병상 현황'/'진료시간' 헤딩이 렌더된다.
// 나머지 배열 필드는 빈 배열이면 충분(각 패널이 빈 상태를 안전하게 처리).
const mockHospital = {
  depts: [], staff: [], specialties: [], specialTreatments: [], nursingGrades: [],
  facility: {}, equipment: [], mealSurcharges: [],
  detail: {}, transits: [],
} as unknown as HospitalWithRelations;

describe('HospitalTabs SSR', () => {
  it('세 탭(진료·시설·운영) 패널 콘텐츠를 모두 초기 SSR 마크업에 포함한다', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabs, { hospital: mockHospital }));
    expect(html).toContain('병상 현황'); // 시설 탭 — 현재는 누락
    expect(html).toContain('진료시간');   // 운영 탭 — 현재는 누락
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

실행: `pnpm exec vitest run tests/components/hospital-tabs-ssr.test.ts`
기대: FAIL — 마크업에 '병상 현황'/'진료시간' 없음(활성 `diagnosis` 패널만 렌더됨).

- [ ] **Step 3: 패널을 서버 렌더로 바꾸는 수정(픽스)**

`app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx`에서 세 개의 조건부 마운트 블록(`{active === '...' && <...Panel .../>}`, 대략 38~56행)을 **항상 렌더 + `hidden` 토글**로 교체:

```tsx
      <div hidden={active !== 'diagnosis'}>
        <HospitalTabDiagnosis
          depts={hospital.depts}
          staff={hospital.staff}
          specialties={hospital.specialties}
          specialTreatments={hospital.specialTreatments}
          nursingGrades={hospital.nursingGrades}
        />
      </div>
      <div hidden={active !== 'facility'}>
        <HospitalTabFacility
          facility={hospital.facility}
          equipment={hospital.equipment}
          mealSurcharges={hospital.mealSurcharges}
        />
      </div>
      <div hidden={active !== 'operation'}>
        <HospitalTabOperation detail={hospital.detail} transits={hospital.transits} />
      </div>
```

파일의 나머지(탭 버튼, `useState`, `Card` 래퍼)는 그대로. 이제 첫 렌더에 세 패널이 모두 DOM에 있고 활성 패널만 보인다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

실행: `pnpm exec vitest run tests/components/hospital-tabs-ssr.test.ts`
기대: PASS.

- [ ] **Step 5: 타입체크**

실행: `pnpm typecheck`
기대: 에러 없음(`hidden`은 `div`의 유효 속성, props 불변).

- [ ] **Step 6: 커밋**

```bash
git add tests/components/hospital-tabs-ssr.test.ts "app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tabs.tsx"
git commit -m "fix(seo): 병원 탭 3종 모두 SSR 렌더 — 시설·운영 탭 크롤 가독성 복구 (L1)"
```

## Task 2: SSR 컴포넌트 테스트를 CI에서 실행

**Files:**
- Modify: `package.json`(`test:unit` 스크립트)

- [ ] **Step 1: 단위 테스트 경로에 `tests/components` 추가**

`package.json`에서:
```json
"test:unit": "dotenv -e .env.test -- vitest run tests/lib tests/ingest",
```
를
```json
"test:unit": "dotenv -e .env.test -- vitest run tests/lib tests/ingest tests/components",
```
로 변경. (CI는 `pnpm test:unit` 실행. `tests/components`가 빠져 있어 SSR 테스트들이 게이트되지 않았다 — 신규 + 기존 location-viewer 테스트를 함께 실행시킨다.)

- [ ] **Step 2: 단위 스위트 실행 → 통과 확인**

실행: `pnpm test:unit`
기대: PASS — `tests/components/hospital-tabs-ssr.test.ts` + 기존 `tests/components/location-viewer-ssr.test.ts` 포함.
참고: `test:unit`은 `.env.test`를 로드한다. location-viewer 테스트는 필요한 env를 `beforeAll`에서 직접 세팅한다. 만약 `.env.test` 부재로 스위트가 에러나면 `pnpm exec vitest run tests/components`로 직접 실행하고 env 갭을 보고할 것.

- [ ] **Step 3: 커밋**

```bash
git add package.json
git commit -m "test: CI 단위 테스트에 tests/components(SSR) 포함"
```

## Verification (스펙 §7 "봇 가독성" 게이트와 연결)

배포 후 L1의 pass/fail 게이트:
- `curl -sL https://imjangon.co.kr/medical/hospital/110003/4 | grep -c '진료시간'` → baseline(2026-06-29)에서 탭 콘텐츠 0건이었음. 목표: ≥1(이제 raw HTML에 존재).

## Out of scope (이 플랜)
- **L2(villa 폴백)·L9(청약/금융/전세 폴백)** — 아래 노트 참조.
- 탭 시각 리스타일·aria role(YAGNI; 동작 불변).

## L2/L9 노트 (후속 플랜 필요)
스펙은 Phase A에 L1·L2·L9를 둔다. 이 플랜은 의도적으로 **L1만** 다룬다: 코드 확인 중 villa 페이지(`app/(public)/villa/[id]/page.tsx`)가 **blurb + 주변 셸을 이미 무조건 렌더**(좌표 `coord`에만 의존)하는 것을 발견했다. 따라서 audit의 "거래 1~2건 → 섹션 붕괴" 전제는 부정확하며, 실제 thin 케이스는 **좌표 없는 페이지**(geo 셸 불가)와 빈 nearby 상태다. L2/L9는 (어떤 템플릿이 실제로 비는지, coord null 빈도) **짧은 동작 재스코프** 후에야 정확한 no-placeholder TDD 태스크로 쓸 수 있다. 이를 다음 단계로 권장.
