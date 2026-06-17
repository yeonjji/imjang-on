# 주변 생활 인프라 항목 → 시설 상세 링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공용 `NearbyInfra` 컴포넌트의 각 인프라 항목을 클릭하면 해당 시설의 상세 페이지로 이동하게 한다(11개 상세 페이지 전체에 동시 적용).

**Architecture:** 데이터 빌더(`buildInfraCategories`)에서 카테고리 키 + id (+ 병원/약국/어린이집은 sigunguCode)로 항목별 `href`를 계산해 `InfraItem`에 싣고, 컴포넌트는 `href`가 있을 때 행을 `<Link>`로 감싸 렌더한다. 바로 옆 `NearbyApartments`의 행-링크 패턴과 동일.

**Tech Stack:** Next.js(App Router) · TypeScript · Prisma($queryRaw) · Tailwind(CSS 변수 토큰) · Vitest

**Spec:** `docs/superpowers/specs/2026-06-17-nearby-infra-item-links-design.md`
**Branch:** `feat/nearby-infra-item-links` (이미 생성됨, 스펙 커밋 `a92f17c`)

---

## File Structure

- `lib/amenity/infra.ts` — 순수 로직. `InfraItem.href` 필드, `infraHref()` 매핑 함수, `buildInfraCategories`에서 href 세팅. (책임: 인프라 데이터 정규화 + URL 매핑)
- `lib/amenity/nearby.ts` — DB 집계. `NearbyHospital`/`NearbyPharmacy`에 `sigunguCode` 추가. (책임: 좌표 기반 nearby 쿼리)
- `components/ui/nearby-infra.tsx` — 표시. 행 `<Link>` 래핑 + 호버 + 화살표. (책임: 인프라 섹션 렌더)
- `tests/lib/amenity-infra.test.ts` — 기존 테스트 확장(infraHref 매핑 + 빌더 href + 픽스처 sigunguCode).

작업 순서는 의존성 기준: ① infraHref(순수, 독립) → ② nearby sigunguCode(+픽스처) → ③ InfraItem.href + 빌더 → ④ 컴포넌트 → ⑤ 전체 검증.

---

## Task 1: `infraHref()` 순수 매핑 함수

**Files:**
- Modify: `lib/amenity/infra.ts` (현재 `InfraCategoryKey`는 16-18행, 함수는 파일 하단에 추가)
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/amenity-infra.test.ts` 1행 import에 `infraHref`를 추가하고, 파일 끝에 describe 블록을 추가한다.

import 줄(2행)을 다음으로 교체:

```ts
import { classifyStore, buildInfraCategories, infraHref, INFRA_FETCH_LIMIT, type RawInfra } from '@/lib/amenity/infra';
```

파일 맨 끝에 추가:

```ts
describe('infraHref', () => {
  it('id만으로 해석되는 카테고리는 올바른 경로를 만든다', () => {
    expect(infraHref('store', '10')).toBe('/amenity/mart/10');
    expect(infraHref('cafe', '11')).toBe('/amenity/cafe/11');
    expect(infraHref('etc', '12')).toBe('/amenity/convenience/12');
    expect(infraHref('market', '13')).toBe('/amenity/market/13');
    expect(infraHref('park', '14')).toBe('/urban/park/14');
    expect(infraHref('parking', '15')).toBe('/urban/parking/15');
    expect(infraHref('charger', '16')).toBe('/urban/charger/16');
  });

  it('병원·약국·어린이집은 sigunguCode가 있으면 경로, 없으면 null', () => {
    expect(infraHref('hospital', '20', '11680')).toBe('/medical/hospital/11680/20');
    expect(infraHref('pharmacy', '21', '11680')).toBe('/medical/pharmacy/11680/21');
    expect(infraHref('childcare', '22', '11680')).toBe('/childcare/11680/22');

    expect(infraHref('hospital', '20', null)).toBeNull();
    expect(infraHref('pharmacy', '21', undefined)).toBeNull();
    expect(infraHref('childcare', '22', null)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-infra.test.ts -t infraHref`
Expected: FAIL — `infraHref is not a function` 또는 import 해석 실패(TS) / 정의되지 않음.

- [ ] **Step 3: 최소 구현**

`lib/amenity/infra.ts` 파일 끝(`buildInfraCategories` 아래)에 추가:

```ts
/** 인프라 항목 → 해당 시설 상세 페이지 경로. sigunguCode가 필요한데 없으면 null(비클릭). */
export function infraHref(
  key: InfraCategoryKey,
  id: string,
  sigunguCode?: string | null,
): string | null {
  switch (key) {
    case 'store':     return `/amenity/mart/${id}`;
    case 'cafe':      return `/amenity/cafe/${id}`;
    case 'etc':       return `/amenity/convenience/${id}`;
    case 'market':    return `/amenity/market/${id}`;
    case 'park':      return `/urban/park/${id}`;
    case 'parking':   return `/urban/parking/${id}`;
    case 'charger':   return `/urban/charger/${id}`;
    case 'hospital':  return sigunguCode ? `/medical/hospital/${sigunguCode}/${id}` : null;
    case 'pharmacy':  return sigunguCode ? `/medical/pharmacy/${sigunguCode}/${id}` : null;
    case 'childcare': return sigunguCode ? `/childcare/${sigunguCode}/${id}` : null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-infra.test.ts -t infraHref`
Expected: PASS (2 passing)

추가로 타입 확인: `pnpm typecheck`
Expected: 에러 없음(종료코드 0). switch가 `InfraCategoryKey` 10개를 모두 처리하므로 trailing return 없이도 통과.

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/infra.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): 인프라 카테고리→시설 상세 경로 매핑 infraHref 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: nearby 병원·약국 쿼리에 sigunguCode 추가 (+ 기존 픽스처 보정)

**Files:**
- Modify: `lib/amenity/nearby.ts` (`NearbyPharmacy` 233-239행 / `getNearbyPharmacies` 241-266행 / `NearbyHospital` 268-274행 / `getNearbyHospitals` 276-301행)
- Modify: `tests/lib/amenity-infra.test.ts` (병원/약국 픽스처 74·83·92·127행)

> `NearbyHospital`/`NearbyPharmacy`에 필수 `sigunguCode: string | null`을 추가한다(쿼리가 항상 반환하므로 필수가 옳고, `NearbyChildcare`와 일관). 이로 인해 기존 인라인 픽스처가 타입 에러를 내므로 같은 태스크에서 보정한다.

- [ ] **Step 1: 인터페이스에 sigunguCode 추가**

`lib/amenity/nearby.ts`의 `NearbyPharmacy`를 다음으로 교체:

```ts
export interface NearbyPharmacy {
  id: bigint;
  name: string;
  address: string;
  tel: string | null;
  sigunguCode: string | null;
  distanceMeters: number;
}
```

`NearbyHospital`을 다음으로 교체:

```ts
export interface NearbyHospital {
  id: bigint;
  name: string;
  typeName: string;
  address: string;
  sigunguCode: string | null;
  distanceMeters: number;
}
```

- [ ] **Step 2: SQL SELECT에 sigunguCode 추가**

`getNearbyPharmacies`의 SELECT 절 `id, name, address, tel,` 를 다음으로 교체:

```sql
      id, name, address, tel, "sigunguCode",
```

`getNearbyHospitals`의 SELECT 절 `id, name, "typeName", address,` 를 다음으로 교체:

```sql
      id, name, "typeName", address, "sigunguCode",
```

- [ ] **Step 3: 타입 확인 — 기존 픽스처 실패 재현**

Run: `pnpm typecheck`
Expected: FAIL — `tests/lib/amenity-infra.test.ts`의 병원/약국 객체 리터럴에서 `sigunguCode` 누락 에러(74·83·92·127행 부근).

- [ ] **Step 4: 기존 픽스처에 sigunguCode 추가**

`tests/lib/amenity-infra.test.ts`에서 4곳을 보정한다.

74행 — 교체:
```ts
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', sigunguCode: null, distanceMeters: 100 }],
```

82-84행(capped 테스트의 Array 생성) — 교체:
```ts
    const hospitals = Array.from({ length: INFRA_FETCH_LIMIT }, (_, i) => ({
      id: BigInt(i + 1), name: `병원${i}`, typeName: '의원', address: '', sigunguCode: null, distanceMeters: 100 + i,
    }));
```

92행 — 교체:
```ts
      pharmacies: [{ id: 1n, name: '약국', address: '', tel: null, sigunguCode: null, distanceMeters: 100 }],
```

127행 — 교체:
```ts
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', sigunguCode: null, distanceMeters: 100 }],
```

- [ ] **Step 5: 타입·테스트 통과 확인**

Run: `pnpm typecheck`
Expected: 에러 없음(종료코드 0).

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (전체 통과 — href 미사용 기존 테스트는 영향 없음).

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/nearby.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): nearby 병원·약국 쿼리에 sigunguCode 추가

상세 링크 생성에 필요. 두 테이블 모두 컬럼 보유. 기존 픽스처 보정.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `InfraItem.href` + `buildInfraCategories`에서 href 세팅

**Files:**
- Modify: `lib/amenity/infra.ts` (`InfraItem` 9-14행 / `buildInfraCategories`의 cats 매핑 69-90행)
- Test: `tests/lib/amenity-infra.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/amenity-infra.test.ts`의 `describe('buildInfraCategories', …)` 블록 안 마지막에 추가:

```ts
  it('각 항목에 시설 상세 href를 세팅한다', () => {
    const cats = buildInfraCategories({
      ...empty,
      stores: [{ id: 1n, name: 'GS25', address: '', industryCode: 'G20405', industryName: '편의점', distanceMeters: 80 }],
      hospitals: [{ id: 9n, name: '세브란스의원', typeName: '의원', address: '', sigunguCode: '11680', distanceMeters: 100 }],
    });
    expect(cats.find((c) => c.key === 'store')?.items[0].href).toBe('/amenity/mart/1');
    expect(cats.find((c) => c.key === 'hospital')?.items[0].href).toBe('/medical/hospital/11680/9');
  });

  it('sigunguCode 없는 병원 항목은 href=null', () => {
    const cats = buildInfraCategories({
      ...empty,
      hospitals: [{ id: 9n, name: '내과', typeName: '의원', address: '', sigunguCode: null, distanceMeters: 100 }],
    });
    expect(cats.find((c) => c.key === 'hospital')?.items[0].href).toBeNull();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-infra.test.ts -t href`
Expected: FAIL — `items[0].href`가 `undefined`(InfraItem에 href 없음).

- [ ] **Step 3: InfraItem에 href 추가**

`lib/amenity/infra.ts`의 `InfraItem`을 교체:

```ts
export interface InfraItem {
  id: string;
  name: string;
  sub: string | null;
  distanceMeters: number;
  href: string | null;
}
```

- [ ] **Step 4: buildInfraCategories의 10개 매핑에 href 추가**

`buildInfraCategories` 내부 `cats` 배열(69-90행)의 각 `items:` 매핑에 `href`를 추가한다. 전체 배열을 다음으로 교체:

```ts
  const cats: Omit<InfraCategory, 'capped'>[] = [
    { key: 'store', label: '편의·마트', icon: '🛒', radiusLabel: '반경 500m 내',
      items: mart.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: infraHref('store', String(s.id)) })) },
    { key: 'cafe', label: '카페', icon: '☕', radiusLabel: '반경 500m 내',
      items: cafe.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: infraHref('cafe', String(s.id)) })) },
    { key: 'hospital', label: '병원', icon: '🏥', radiusLabel: '반경 500m 내',
      items: raw.hospitals.map((h) => ({ id: String(h.id), name: h.name, sub: h.typeName ?? null, distanceMeters: h.distanceMeters, href: infraHref('hospital', String(h.id), h.sigunguCode) })) },
    { key: 'pharmacy', label: '약국', icon: '💊', radiusLabel: '반경 500m 내',
      items: raw.pharmacies.map((p) => ({ id: String(p.id), name: p.name, sub: p.address ?? null, distanceMeters: p.distanceMeters, href: infraHref('pharmacy', String(p.id), p.sigunguCode) })) },
    { key: 'park', label: '공원', icon: '🌳', radiusLabel: '반경 1km 내',
      items: raw.parks.map((p) => ({ id: String(p.id), name: p.name, sub: parkSub(p), distanceMeters: p.distanceMeters, href: infraHref('park', String(p.id)) })) },
    { key: 'market', label: '전통시장', icon: '🏬', radiusLabel: '반경 1km 내',
      items: raw.markets.map((m) => ({ id: String(m.id), name: m.name, sub: m.marketType ?? null, distanceMeters: m.distanceMeters, href: infraHref('market', String(m.id)) })) },
    { key: 'charger', label: '전기차 충전소', icon: '⚡', radiusLabel: '반경 500m 내',
      items: raw.chargers.map((c) => ({ id: String(c.id), name: c.name, sub: `${c.chargeSpeed} · ${c.chargerCount}기`, distanceMeters: c.distanceMeters, href: infraHref('charger', String(c.id)) })) },
    { key: 'parking', label: '주차장', icon: '🅿️', radiusLabel: '반경 500m 내',
      items: raw.parking.map((p) => ({ id: String(p.id), name: p.name, sub: parkingSub(p), distanceMeters: p.distanceMeters, href: infraHref('parking', String(p.id)) })) },
    { key: 'childcare', label: '어린이집', icon: '👶', radiusLabel: '반경 1km 내',
      items: (raw.childcare ?? []).map((c) => ({ id: String(c.id), name: c.name, sub: c.crType ?? null, distanceMeters: c.distanceMeters, href: infraHref('childcare', String(c.id), c.sigunguCode) })) },
    { key: 'etc', label: '기타 생활편의', icon: '🏪', radiusLabel: '반경 500m 내',
      items: etc.map((s) => ({ id: String(s.id), name: s.name, sub: s.industryName ?? null, distanceMeters: s.distanceMeters, href: infraHref('etc', String(s.id)) })) },
  ];
```

> 주의: 하단 정규화 `items: c.items.map((it) => ({ ...it, distanceMeters: Number(it.distanceMeters) }))`는 그대로 둔다 — 스프레드로 `href`가 보존된다.

- [ ] **Step 5: 테스트·타입 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/amenity-infra.test.ts`
Expected: PASS (전체 통과).

Run: `pnpm typecheck`
Expected: 에러 없음. (InfraItem을 만드는 모든 지점에 href가 있으므로 통과)

- [ ] **Step 6: 커밋**

```bash
git add lib/amenity/infra.ts tests/lib/amenity-infra.test.ts
git commit -m "feat(infra): InfraItem에 href 추가하고 빌더에서 시설 상세 경로 세팅

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `NearbyInfra` 컴포넌트 — 행 Link 래핑 + 호버 + 화살표

**Files:**
- Modify: `components/ui/nearby-infra.tsx` (import 추가 / `InfraBlock`의 `<ul>` 67-82행)

- [ ] **Step 1: next/link import 추가**

`components/ui/nearby-infra.tsx` 2행 `import { useState } from 'react';` 아래에 추가:

```tsx
import Link from 'next/link';
```

- [ ] **Step 2: 항목 행을 href 유무에 따라 Link/div로 렌더**

`InfraBlock`의 `<ul>…</ul>` 블록(현재 67-82행)을 다음으로 교체:

```tsx
      <ul>
        {visible.map((it) => {
          const inner = (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--color-text)]">{it.name}</p>
                {it.sub && <p className="truncate text-xs text-[var(--color-muted)]">{it.sub}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-blue)]">
                  {it.distanceMeters}m
                </span>
                {it.href && <span aria-hidden className="text-[var(--color-muted)]">›</span>}
              </div>
            </>
          );
          return (
            <li key={it.id} className="border-b border-[var(--color-line)] last:border-0">
              {it.href ? (
                <Link
                  href={it.href}
                  className="-mx-1.5 flex items-center justify-between gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-[var(--color-sky-soft)]"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-2.5 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
```

> 어포던스: 행 전체 클릭 + `hover:bg-[var(--color-sky-soft)]` 은은한 배경 + 우측 화살표 `›`(href 있을 때만). `-mx-1.5/px-1.5`로 호버 배경이 블록 안쪽 여백까지 살짝 확장된다. 그림자 추가 없음(DESIGN: `--shadow-soft` 하나 원칙). 거리 배지·간격은 기존 유지.

- [ ] **Step 3: 타입·린트 확인**

Run: `pnpm typecheck`
Expected: 에러 없음.

Run: `pnpm lint`
Expected: 에러 없음(경고 무관).

- [ ] **Step 4: 커밋**

```bash
git add components/ui/nearby-infra.tsx
git commit -m "feat(infra): 주변 생활 인프라 항목을 시설 상세로 링크(호버+화살표)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 전체 검증 (회귀 + 수동 클릭)

**Files:** (코드 변경 없음 — 게이트 통과 확인)

- [ ] **Step 1: 타입·린트·단위 테스트 전체**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 모두 통과(종료코드 0). `amenity-infra.test.ts`의 infraHref·href 테스트 포함 PASS.

- [ ] **Step 2: dev 서버 기동**

Run: `pnpm dev` (백그라운드, `http://localhost:3000` Ready 확인)

- [ ] **Step 3: 실데이터 수동 클릭 확인**

좌표가 있는 아파트 상세(예: `/apt/{실재 id}`)를 열고 "주변 생활 인프라" 섹션에서 카테고리별로 1건씩 클릭해 경로 해석을 확인한다.
- 병원 행 클릭 → `/medical/hospital/{sigunguCode}/{id}` 정상 페이지(404 아님).
- 마트/카페/공원/주차장/충전소/전통시장/기타 행 클릭 → 각 상세 정상.
- 호버 시 은은한 배경 + 우측 `›` 표시. sigunguCode 없는 병원/약국 행(있다면)은 비클릭.

Expected: 표본 클릭 전부 정상 상세 페이지 진입.

- [ ] **Step 4: (선택) 기존 e2e 회귀**

e2e 환경(시드 DB + Playwright)이 구성돼 있으면:
Run: `pnpm exec playwright test tests/e2e/apt-detail.spec.ts tests/e2e/officetel-villa-infra.spec.ts`
Expected: 통과(텍스트 단언 위주라 링크 추가로 깨지지 않음). 환경 미구성 시 Step 3 수동 확인으로 갈음.

- [ ] **Step 5: dev 서버 종료**

Run: `pkill -f "next dev"` (또는 백그라운드 잡 종료)

---

## Self-Review (작성자 체크리스트 결과)

**Spec coverage:**
- 카테고리→URL 매핑 10종 → Task 1(infraHref) + Task 3(빌더). ✓
- 병원/약국 sigunguCode 조회 → Task 2. ✓
- InfraItem.href + 빌더 세팅 → Task 3. ✓
- 컴포넌트 Link+호버+화살표 → Task 4. ✓
- infraHref 단위 테스트 + 빌더 href 테스트 → Task 1·3. ✓
- 검증(tsc/lint/unit/e2e/수동) → Task 5. ✓
- 엣지(sigunguCode null → href null → 비클릭) → Task 1·3 테스트 + Task 4 분기. ✓

**Placeholder scan:** 모든 코드 step에 실제 코드/명령/기대출력 포함. TBD/TODO 없음. ✓

**Type consistency:** `infraHref(key, id, sigunguCode?)` 시그니처가 Task 1 정의 ↔ Task 3 호출 일치. `InfraItem.href: string | null`가 Task 3 정의 ↔ Task 4 사용(`it.href`) 일치. `NearbyHospital/NearbyPharmacy.sigunguCode: string | null`가 Task 2 정의 ↔ Task 3 사용(`h.sigunguCode`/`p.sigunguCode`) 일치. ✓
