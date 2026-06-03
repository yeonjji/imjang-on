# 실거래가(아파트) 상세 — 주변 생활 인프라 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아파트 실거래가 상세 페이지 맨 아래에 공용 `NearbyInfra`(주변 생활 인프라) 블록을 재사용으로 추가한다.

**Architecture:** 이미 6개 상세 페이지에서 검증된 `getNearbyInfra` + `NearbyInfra` 파이프라인을 그대로 재사용한다. 신규 컴포넌트/UI 없음. 변경 지점은 (1) 좌표 헬퍼 `getPropertyLatLng`, (2) 페이지 데이터 fetch + 렌더, (3) 사이드바 앵커 한 줄, (4) e2e 시드에 아파트 좌표 부여.

**Tech Stack:** Next.js (App Router, RSC), Prisma + PostGIS raw SQL, Playwright e2e (chromium-desktop + chromium-mobile).

설계 문서: `docs/superpowers/specs/2026-06-03-apt-detail-nearby-infra-design.md`

---

## File Structure

- **Modify** `lib/property.ts` — `getPropertyLatLng(id)` 헬퍼 추가 (raw PostGIS 쿼리).
- **Modify** `tests/_helpers/seed-e2e.ts` — 시드 아파트(`래미안서초에스티지`)에 `location` 부여 (시드 주차장 반경 500m 내).
- **Modify** `app/(public)/apt/[id]/page.tsx` — 좌표 조회 + `getNearbyInfra` fetch + `<NearbyInfra>` 렌더.
- **Modify** `app/(public)/apt/[id]/_components/detail-sidebar.tsx` — `#poi` 앵커 추가.
- **Modify** `tests/e2e/apt-detail.spec.ts` — 주변 생활 인프라 블록 렌더 검증 (failing test 먼저).

---

## Task 1: e2e 실패 테스트 — 주변 생활 인프라 블록

먼저 실패하는 e2e를 추가해 목표를 고정한다. (이 저장소의 raw SQL 헬퍼는 단위 테스트 관례가 없으므로 e2e가 회귀 테스트 역할을 한다.)

**Files:**
- Test: `tests/e2e/apt-detail.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`tests/e2e/apt-detail.spec.ts` 파일 끝(기존 `test(...)` 블록 다음, 마지막 줄)에 아래 테스트를 추가한다:

```ts
test('apt detail: 주변 생활 인프라 블록이 렌더된다', async ({ page }) => {
  await page.goto(`/apt/${propertyId}`);

  const poi = page.locator('#poi');
  await expect(poi).toBeVisible();
  await expect(poi.getByRole('heading', { name: '주변 생활 인프라' })).toBeVisible();
  // 시드 주차장 2곳이 반경 500m 내 → '주차장' 카테고리가 노출되어야 함
  await expect(poi.getByText('주차장').first()).toBeVisible();
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

먼저 개발 서버가 떠 있지 않다면 띄운 채로(또는 playwright webServer가 자동 기동), 시드를 적용한다:

```bash
dotenv -e .env.local -- tsx tests/_helpers/seed-e2e.ts
```

Run:
```bash
pnpm exec playwright test apt-detail.spec.ts -g "주변 생활 인프라" --project=chromium-desktop
```
Expected: FAIL — `#poi` 요소가 존재하지 않아 `toBeVisible()` 타임아웃. (현재 페이지에 `NearbyInfra` 미렌더, 게다가 시드 아파트는 `location`이 없어 좌표 null.)

- [ ] **Step 3: 커밋(실패 테스트)**

```bash
git add tests/e2e/apt-detail.spec.ts
git commit -m "test(apt): 실거래가 상세 주변 생활 인프라 블록 e2e (red)"
```

---

## Task 2: `getPropertyLatLng` 헬퍼 추가

**Files:**
- Modify: `lib/property.ts` (파일 끝, `getTopPropertiesByVolume` 함수 다음)

- [ ] **Step 1: 헬퍼 추가**

`lib/property.ts` 맨 끝에 추가한다. (`getChildcareLatLng`(`lib/childcare.ts:92`)와 동일 패턴. `prisma`는 파일 상단에서 이미 import됨.)

```ts
export async function getPropertyLatLng(
  id: bigint,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "Property" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}
```

- [ ] **Step 2: 타입체크**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: PASS (에러 없음).

---

## Task 3: 시드 아파트에 좌표 부여

시드 아파트(`래미안서초에스티지`)에 `location`이 없어 현재는 좌표가 null이다. 시드 주차장(E2E-PRK-1 `127.027,37.498`, E2E-PRK-2 `127.025,37.495`) 반경 500m 안에 들도록 `127.026, 37.4965`를 부여한다.

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts` (아파트 `prisma.property.create` 직후, 트랜잭션 생성 루프 전)

- [ ] **Step 1: 아파트 좌표 UPDATE 추가**

`tests/_helpers/seed-e2e.ts`에서 `const p = await prisma.property.create({ ... });` 블록(라인 97~107) 바로 다음에 추가한다:

```ts
  // 주변 생활 인프라 e2e용 — 시드 주차장(E2E-PRK-1/2) 반경 500m 내 좌표 부여
  await prisma.$executeRaw`
    UPDATE "Property"
    SET location = ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326)::geography
    WHERE id = ${p.id}
  `;
```

- [ ] **Step 2: 시드 재적용 + 좌표 확인**

Run:
```bash
dotenv -e .env.local -- tsx tests/_helpers/seed-e2e.ts
```
Expected: `e2e seed done. propertyId = ...` 출력, 에러 없음.

---

## Task 4: 페이지 와이어링 + 사이드바 앵커

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`
- Modify: `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

- [ ] **Step 1: import 추가**

`app/(public)/apt/[id]/page.tsx` 상단 import 영역을 다음과 같이 보강한다.

- 라인 2 `import { getPropertyById } from '@/lib/property';` 를:
```ts
import { getPropertyById, getPropertyLatLng } from '@/lib/property';
```
- 기존 import들 다음(예: 라인 13 `formatBillion` import 아래)에 추가:
```ts
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { NearbyInfra } from '@/components/ui/nearby-infra';
```

- [ ] **Step 2: 좌표 조회 + infra fetch**

기존 데이터 fetch 블록(라인 39~44)을 아래로 교체한다:

```ts
  const coord = await getPropertyLatLng(propId);

  const [unified, chart, areaSummary, nearby, infra] = await Promise.all([
    getUnifiedTransactions(propId, { page: 1, perPage: 15 }),
    getMonthlyChartData(propId),
    getAreaSummary(propId),
    getNearbyProperties({ propertyId: propId, propertyType: PropertyType.APARTMENT }),
    coord
      ? getNearbyInfra(coord.lat, coord.lng, { includeChildcare: true })
      : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
  ]);
```

- [ ] **Step 3: 블록 렌더 (맨 아래)**

`<NearbyPriceComparison id="nearby" items={nearby} slug="apt" />` (라인 65) 바로 다음, `</main>` 닫기 전에 추가한다:

```tsx
          <NearbyInfra categories={infra} />
```

(`NearbyInfra`는 `categories.length === 0`이면 자체적으로 `null`을 반환하므로 별도 가드 불필요.)

- [ ] **Step 4: 사이드바 앵커 추가**

`app/(public)/apt/[id]/_components/detail-sidebar.tsx`의 `ANCHORS` 배열(라인 5~11) 마지막 항목 다음에 추가한다:

```ts
  { href: '#poi', label: '주변 생활 인프라' },
```

- [ ] **Step 5: 타입체크**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: PASS.

---

## Task 5: e2e 통과 확인 + 커밋

**Files:** (변경 없음 — 검증 단계)

- [ ] **Step 1: e2e 실행 (desktop + mobile)**

시드는 Task 3에서 이미 적용됨. 두 프로젝트(데스크톱 + 모바일)에서 실행한다:

```bash
pnpm exec playwright test apt-detail.spec.ts -g "주변 생활 인프라"
```
Expected: PASS — `chromium-desktop`, `chromium-mobile` 모두 통과. `#poi` 블록과 "주변 생활 인프라" 헤딩, "주차장" 텍스트가 보임.

- [ ] **Step 2: 기존 apt 회귀 테스트 확인**

Run:
```bash
pnpm exec playwright test apt-detail.spec.ts
```
Expected: 모든 테스트 PASS (기존 실거래 테이블 테스트 포함).

- [ ] **Step 3: 빌드 확인**

Run:
```bash
pnpm build
```
Expected: 빌드 성공, 타입/린트 에러 없음.

- [ ] **Step 4: 커밋(구현 green)**

```bash
git add lib/property.ts tests/_helpers/seed-e2e.ts \
  "app/(public)/apt/[id]/page.tsx" \
  "app/(public)/apt/[id]/_components/detail-sidebar.tsx"
git commit -m "feat(apt): 실거래가 상세에 주변 생활 인프라(NearbyInfra) 추가"
```

---

## Task 6: 시각 QA (데스크톱 + 모바일)

다른 상세 페이지 작업과 동일하게 실제 화면 스크린샷으로 확인한다.

**Files:** 산출물 `qa-apt-infra-desktop.png`, `qa-apt-infra-mobile.png` (저장소 루트, `.gitignore` 대상 — 커밋 불필요)

- [ ] **Step 1: 데스크톱 스크린샷**

개발 서버가 떠 있는 상태에서 Playwright로 `/apt/<시드 propertyId>` 접속, `#poi`까지 스크롤 후 풀페이지 캡처를 `qa-apt-infra-desktop.png`로 저장. (1280×720 뷰포트)

- [ ] **Step 2: 모바일 스크린샷**

Pixel 5 뷰포트(393×851)로 동일 캡처를 `qa-apt-infra-mobile.png`로 저장.

- [ ] **Step 3: 육안 확인**

확인 항목:
- 주변 생활 인프라 블록이 주변 단지 비교 다음(맨 아래)에 위치.
- 카테고리 칩이 가로 스크롤로 정상 표시, 0곳 카테고리는 숨김.
- 모바일에서 그리드가 1열로 떨어지고, 카드/칩이 잘리지 않음.
- 사이드바 "주변 생활 인프라" 앵커 클릭 시 `#poi`로 스크롤.

---

## Self-Review

**Spec coverage:**
- 공용 NearbyInfra 전체 카테고리 노출 → Task 4 Step 2~3 (`getNearbyInfra` + `<NearbyInfra>`). ✓
- 어린이집 포함 → Task 4 Step 2 `includeChildcare: true`. ✓
- 주변 단지 비교 유지 → 기존 `NearbyPriceComparison` 미변경(교체 아님, 다음에 추가). ✓
- 지도/학교 미포함 → 어느 task에도 없음. ✓
- 기본 5개 + 더보기 → 공용 컴포넌트 그대로 재사용, 변경 없음. ✓
- 배치 맨 아래 → Task 4 Step 3. ✓
- 사이드바 앵커 "주변 생활 인프라"(`#poi`) → Task 4 Step 4. ✓
- 모바일 고려 → 공용 컴포넌트 반응형 + Task 5/6 모바일 프로젝트·스크린샷. ✓
- 좌표 없음/빈 카테고리 graceful degrade → Task 4 Step 2(coord 가드) + Step 3 주석(컴포넌트 null 반환). ✓

**Placeholder scan:** 모든 코드 단계에 실제 코드/명령/기대값 명시. TODO/TBD 없음. ✓

**Type consistency:** `getPropertyLatLng` 반환 `{ lat; lng } | null` ↔ Task 4에서 `coord ? ... : Promise.resolve([])` 사용 일치. `getNearbyInfra(lat, lng, { includeChildcare })` 시그니처는 `lib/amenity/nearby.ts:334` 정의와 일치. `<NearbyInfra categories={...} />` prop은 `components/ui/nearby-infra.tsx:8` 정의와 일치. ✓
