# 어린이집 상세 주변 생활 인프라 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어린이집 상세 페이지의 주변 인프라 섹션을 학교 상세와 동일한 "요약 배지줄 + 균일 2열 그리드"(8개 카테고리)로 교체하고, 그 과정에서 공용 컴포넌트·집계 함수를 승격하고 더 이상 쓰이지 않는 옛 탭 코드를 제거한다.

**Architecture:** 학교에 이미 구현·승인된 `NearbyInfra` 컴포넌트와 `getSchoolNearbyInfra` 집계 함수를 공용 위치(`components/ui`, 범용 이름 `getNearbyInfra`)로 승격한 뒤, 어린이집 페이지가 옛 `getSchoolNearbyAmenities` + 탭형 `NearbyAmenities`를 새 자산으로 교체한다. 어린이집은 인프라 8종 카테고리에 속하지 않으므로 자기 제외(excludeId) 로직은 불필요하다. 모바일 대응은 공용 컴포넌트가 이미 내장(`grid-cols-1 md:grid-cols-2`, 배지줄 `overflow-x-auto`)하므로 추가 작업 없음.

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Prisma/PostGIS, Tailwind, Vitest, Playwright.

**Reference spec (재사용):** `docs/superpowers/specs/2026-06-02-school-nearby-infra-redesign-design.md`

**Verify commands:**
- `pnpm typecheck` (tsc --noEmit)
- `pnpm lint`
- `pnpm test:unit` (vitest: `tests/lib` + `tests/ingest`)

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `components/ui/nearby-infra.tsx` | **Create** (이동) | 공용 `NearbyInfra({ categories })` 표시 컴포넌트 |
| `app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx` | **Delete** (이동 원본) | — |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | Modify | import 경로 갱신 + `getNearbyInfra` 호출명 갱신 |
| `lib/amenity/nearby.ts` | Modify | `getSchoolNearbyInfra` → `getNearbyInfra` rename, 옛 `getSchoolNearbyAmenities` 제거 |
| `app/(public)/childcare/[sigunguCode]/[id]/page.tsx` | Modify | 옛 탭 → `<NearbyInfra categories={infra} />` 교체 |
| `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx` | **Delete** | 옛 탭 컴포넌트(마지막 사용처가 어린이집이었음) |

---

### Task 1: NearbyInfra 컴포넌트 공용화 (school → components/ui)

순수 이동 + import 경로 갱신. 동작 변화 없음.

**Files:**
- Create: `components/ui/nearby-infra.tsx`
- Delete: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:11`

- [ ] **Step 1: 새 위치에 컴포넌트 파일 생성 (내용 동일)**

`components/ui/nearby-infra.tsx` 를 아래 내용으로 생성 (기존 school 파일과 100% 동일):

```tsx
'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { InfraCategory } from '@/lib/amenity/infra';

const DISPLAY_CAP = 5;

export function NearbyInfra({ categories }: { categories: InfraCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <Card id="poi">
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">주변 생활 인프라</h2>
      <p className="mb-3 text-xs text-[var(--color-muted)]">반경 500m~1km · 가까운 순</p>

      <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto border-b border-[var(--color-line)] px-1 pb-4">
        {categories.map((c) => (
          <span
            key={c.key}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-blue-dark)]"
          >
            <span>{c.icon}</span>
            {c.label}
            <span className="text-[var(--color-blue)]">{c.items.length}{c.capped ? '+' : ''} · {c.items[0].distanceMeters}m</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 [grid-auto-rows:1fr] md:grid-cols-2">
        {categories.map((c) => (
          <InfraBlock key={c.key} category={c} />
        ))}
      </div>
    </Card>
  );
}

function InfraBlock({ category }: { category: InfraCategory }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? category.items : category.items.slice(0, DISPLAY_CAP);
  const hiddenCount = category.items.length - DISPLAY_CAP;

  return (
    <div className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] p-3.5">
      <div className="mb-1.5 text-sm font-bold text-[var(--color-blue-dark)]">
        <span className="mr-1">{category.icon}</span>
        {category.label}
        <span className="ml-1 text-xs font-semibold text-[var(--color-muted)]">{category.items.length}{category.capped ? '+' : ''}곳</span>
      </div>
      <ul>
        {visible.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2.5 border-b border-[var(--color-line)] py-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{it.name}</p>
              {it.sub && <p className="truncate text-[11px] text-[var(--color-muted)]">{it.sub}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue)]">
              {it.distanceMeters}m
            </span>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mt-auto pt-2 text-left text-xs font-bold text-[var(--color-blue)]"
        >
          +{hiddenCount}곳 더보기 →
        </button>
      ) : (
        <p className="mt-auto pt-2 text-[11px] text-[var(--color-muted)]">
          {category.radiusLabel} {category.items.length}{category.capped ? '+' : ''}곳
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 옛 위치 파일 삭제**

```bash
git rm "app/(public)/school/[sigunguCode]/[id]/_components/nearby-infra.tsx"
```

- [ ] **Step 3: school 페이지 import 경로 갱신**

`app/(public)/school/[sigunguCode]/[id]/page.tsx:11` 변경:

```tsx
// before
import { NearbyInfra } from './_components/nearby-infra';
// after
import { NearbyInfra } from '@/components/ui/nearby-infra';
```

- [ ] **Step 4: 타입 체크로 이동 검증**

Run: `pnpm typecheck`
Expected: PASS (에러 0건). school 페이지가 새 경로에서 컴포넌트를 찾는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add components/ui/nearby-infra.tsx "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "refactor(infra): NearbyInfra 컴포넌트를 components/ui로 공용화"
```

---

### Task 2: 집계 함수 rename (getSchoolNearbyInfra → getNearbyInfra)

범용 이름으로 변경. 시그니처·동작 동일. 호출처는 현재 school 페이지 1곳뿐.

**Files:**
- Modify: `lib/amenity/nearby.ts:405-417`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:6,61`

- [ ] **Step 1: 함수 rename + 주석 일반화**

`lib/amenity/nearby.ts` 의 함수 정의(현재 405행 주석 + 406행 선언) 변경:

```ts
// before
// 학교 상세 "주변 생활 인프라" — 8개 카테고리를 정규화해 반환. 빈 카테고리는 제외됨.
export async function getSchoolNearbyInfra(lat: number, lng: number): Promise<InfraCategory[]> {
// after
// 상세 "주변 생활 인프라" — 8개 카테고리를 정규화해 반환. 빈 카테고리는 제외됨. (좌표만 받는 범용)
export async function getNearbyInfra(lat: number, lng: number): Promise<InfraCategory[]> {
```

(함수 본문은 그대로 둔다.)

- [ ] **Step 2: school 페이지 호출부 갱신**

`app/(public)/school/[sigunguCode]/[id]/page.tsx`:

```tsx
// line 6 — import 갱신
import { getNearbyApartments, getNearbyInfra, getNearbyChildcare } from '@/lib/amenity/nearby';

// line 61 — 호출 갱신
    coord ? getNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
```

- [ ] **Step 3: 남은 옛 이름 참조 없음 확인**

Run: `grep -rn "getSchoolNearbyInfra" --include='*.ts' --include='*.tsx' app lib`
Expected: 출력 없음 (0건).

- [ ] **Step 4: 타입 체크**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/nearby.ts "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "refactor(infra): getSchoolNearbyInfra → getNearbyInfra 범용 rename"
```

---

### Task 3: 어린이집 페이지를 NearbyInfra로 교체

옛 `getSchoolNearbyAmenities` + 탭형 `NearbyAmenities`(공원/마트/충전소) 를 새 8카테고리 `NearbyInfra`로 교체. `coord`는 이미 53행에서 취득하므로 재사용(새 쿼리 없음). `NearbyChildcare`(주변 어린이집 목록) 섹션은 그대로 둔다.

**Files:**
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx:5,14,55-62,95-101`

- [ ] **Step 1: import 교체**

`app/(public)/childcare/[sigunguCode]/[id]/page.tsx`:

```tsx
// line 5 — getSchoolNearbyAmenities 제거, getNearbyInfra 추가
import { getNearbyApartments, getNearbyChildcare, getNearbyInfra } from '@/lib/amenity/nearby';

// line 14 — 옛 탭 import 삭제하고 공용 컴포넌트 import로 교체
import { NearbyInfra } from '@/components/ui/nearby-infra';
```

- [ ] **Step 2: 데이터 fetch 블록 교체 (현재 55-62행)**

```tsx
// before
  const [apts, schoolAmenities, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord
      ? getSchoolNearbyAmenities(coord.lat, coord.lng)
      : Promise.resolve({ parks: [], mart: [], chargers: [] } as Awaited<ReturnType<typeof getSchoolNearbyAmenities>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5, itemId) : Promise.resolve([]),
    getChildcareList({ sigunguCode }, 1),
  ]);
// after
  const [apts, infra, nearbyChildren, otherList] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5, itemId) : Promise.resolve([]),
    getChildcareList({ sigunguCode }, 1),
  ]);
```

- [ ] **Step 3: 렌더 블록 교체 (현재 95-101행)**

```tsx
// before
          {coord && (
            <NearbyAmenities
              parks={schoolAmenities.parks}
              mart={schoolAmenities.mart}
              chargers={schoolAmenities.chargers}
            />
          )}
// after
          {coord && <NearbyInfra categories={infra} />}
```

- [ ] **Step 4: 타입 체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. 어린이집 페이지에서 `schoolAmenities`/`NearbyAmenities`/`getSchoolNearbyAmenities` 참조가 모두 사라졌는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/childcare/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(childcare): 주변 생활 인프라 섹션을 NearbyInfra(8카테고리)로 교체"
```

---

### Task 4: 죽은 코드 제거 (옛 탭 컴포넌트 + getSchoolNearbyAmenities)

Task 3 이후 두 자산 모두 사용처 0건. 안전 삭제.

**Files:**
- Delete: `app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx`
- Modify: `lib/amenity/nearby.ts:196-208` (getSchoolNearbyAmenities 함수 제거)

- [ ] **Step 1: 삭제 전 참조 0건 재확인**

```bash
grep -rn "getSchoolNearbyAmenities" --include='*.ts' --include='*.tsx' app lib
grep -rn "nearby-amenities'" --include='*.tsx' app
```
Expected: 둘 다 출력 없음 (0건). 출력이 있으면 멈추고 사용처를 먼저 정리.

- [ ] **Step 2: 옛 탭 컴포넌트 파일 삭제**

```bash
git rm "app/(public)/school/[sigunguCode]/[id]/_components/nearby-amenities.tsx"
```

- [ ] **Step 3: getSchoolNearbyAmenities 함수 제거**

`lib/amenity/nearby.ts` 에서 아래 블록(현재 196-208행) 전체 삭제:

```ts
// 학교 상세 "주변 생활 인프라" 탭(공원 / 마트·편의 / 충전소). 병원·약국은 보류(제외).
export async function getSchoolNearbyAmenities(lat: number, lng: number) {
  const [parks, stores, chargers] = await Promise.all([
    getNearbyParks(lat, lng),
    getNearbyStores(lat, lng),
    getNearbyEvChargers(lat, lng),
  ]);
  const mart = stores.filter((s) => {
    const c = s.industryCode ?? '';
    return ['G20405', 'G20404', 'G20402', 'I21201'].some((p) => c.startsWith(p));
  });
  return { parks, mart, chargers };
}
```

주의: 이 함수가 호출하던 `getNearbyParks` / `getNearbyStores` / `getNearbyEvChargers`는 `getNearbyInfra` 등 다른 곳에서도 쓰이므로 **남겨둔다**.

- [ ] **Step 4: 타입 체크 + 린트로 고아 import 없음 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (삭제로 인해 안 쓰이게 된 import가 생기면 정리.)

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/nearby.ts
git commit -m "chore(infra): 미사용 옛 탭 컴포넌트·getSchoolNearbyAmenities 제거"
```

---

### Task 5: 전체 검증 (단위 테스트 + 실데이터 스크린샷)

순수 로직 변경은 없으므로 기존 단위 테스트가 그대로 통과해야 한다. 그 뒤 dev 서버에서 데스크탑·모바일 스크린샷으로 실데이터 회귀를 확인한다.

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 단위 테스트 + 타입 + 린트 전체 통과**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 전부 PASS. 특히 `tests/lib/amenity-infra.test.ts` 통과(`buildInfraCategories` 순수 로직 불변).

- [ ] **Step 2: dev 서버 기동**

Run (백그라운드): `pnpm dev`
Expected: `http://localhost:3000` 기동.

- [ ] **Step 3: 어린이집 상세 — 데스크탑 스크린샷**

실데이터가 있는 어린이집 상세 URL로 이동(예: 인프라가 풍부한 도심 어린이집). Playwright로 viewport 1280×900 스크린샷.
확인 항목:
- 상단 요약 배지줄(카테고리·개수·최단거리) 노출
- 균일 2열 그리드, 블록 높이 정렬(`auto-rows:1fr`)
- 카테고리당 최대 5곳 + `더보기` 동작
- 0곳 카테고리 숨김
- 옛 탭 UI(공원/마트/충전소 토글)가 더 이상 보이지 않음
- `NearbyChildcare`(주변 어린이집) 섹션은 그대로 존재

- [ ] **Step 4: 어린이집 상세 — 모바일 스크린샷**

같은 URL을 viewport 390×844(모바일)로 스크린샷.
확인 항목:
- 그리드 1열로 떨어짐
- 배지줄 가로 스크롤(`overflow-x-auto`)로 잘림 없이 접근 가능
- 카드/거리 배지 레이아웃 깨짐 없음

- [ ] **Step 5: 학교 상세 회귀 확인**

학교 상세 URL 1건을 데스크탑으로 스크린샷 → 공용화/리네임 이후에도 인프라 섹션이 PR #20과 동일하게 보이는지 확인(회귀 없음).

- [ ] **Step 6: dev 서버 종료**

백그라운드 dev 서버 종료.

---

## Self-Review

**Spec coverage:** 스펙의 디자인 규칙(탭 금지·요약줄·2열 그리드·cap5+더보기·0곳 숨김·N+ 배지·#poi 앵커)은 공용 `NearbyInfra` 컴포넌트(Task 1)가 그대로 보유 → 어린이집에 자동 적용. 자기 제외는 어린이집이 인프라 8종에 없어 불필요(스펙/롤아웃 표 일치). 모바일 요건은 컴포넌트 내장 + Task 5 Step 4에서 검증.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드/명령 포함.

**Type consistency:** 함수명 `getNearbyInfra`(Task 2 정의 → Task 3 사용) 일치. 컴포넌트 `NearbyInfra`/prop `categories: InfraCategory[]` 일치. 삭제 대상(`getSchoolNearbyAmenities`, 옛 `NearbyAmenities`)은 Task 3에서 사용처 제거 후 Task 4에서 삭제 — 순서 일관.
