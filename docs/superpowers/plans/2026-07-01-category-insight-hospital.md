# 병원 카테고리 인사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원·의원 상세 페이지에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex를, 카테고리 인사이트 프레임워크를 재사용해 추가한다.

**Architecture:** 어린이집과 동일 패턴. 신규는 병원 엔티티 모듈(`lib/insights/hospital.ts`)과 캐시 로더(`lib/insights/hospital-loader.ts`)뿐. 공유 `accessInsight`/`priceContextInsight`/`assembleNarrative`, `provenanceNodes`, `InsightSection`을 그대로 쓴다. 벤치마크 집계 없음(린).

**Tech Stack:** Next.js App Router(RSC/ISR), TypeScript, Prisma, Vitest, React `cache()`.

## Global Constraints

- **린**: 진료과 밀도/벤치마크 사전집계 없음. 병원 자체 데이터(진료과·의사수·병상) 파생 판단 + 공유 A/C.
- **dateModified 생략**: 병원은 소스 기준일(dataStdDate) 없음. `updatedAt`(매 실행 튐) 사용 금지 → provenanceNodes에 dateModified 전달 안 함.
- **금액 단위 만원**: `NearbyApartment.saleLastPrice`(만원) → priceContextInsight(공유)가 formatBillion 처리.
- **파생만·표 재서술 금지·synonym spinning 금지·표시값 일치.**
- **데이터 부족 시 침묵**: narrative null → InsightSection 미렌더 + `robots:{index:false,follow:true}`. indexable iff `narrative && fired.length>=3`.
- **아파트·어린이집 무회귀**: 공유 모듈·provenanceNodes 무변경.
- **의존 브랜치**: `feat/category-insight-hospital`(프레임워크 #181 위 스택). 테스트는 `pnpm exec dotenv -e .env.test -- vitest run <파일>`.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/insights/hospital.ts` | buildHospitalNarrative + 엔티티 모듈(intro/depts/doctors/beds) | 신규 |
| `lib/insights/hospital-loader.ts` | 캐시 로더(병원 nearby 옵션), depts/facility→입력 산출 | 신규 |
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | 로더·robots·description·프로즈·provenance·placeSchema id | 수정 |
| `tests/lib/insights-hospital.test.ts` | 엔티티 모듈 유닛 | 신규 |

---

## Task 1: 병원 엔티티 모듈 `lib/insights/hospital.ts`

순수. 공유 모듈 재사용.

**Files:**
- Create: `lib/insights/hospital.ts`
- Test: `tests/lib/insights-hospital.test.ts`

**Interfaces:**
- Consumes: `accessInsight`, `priceContextInsight`, `assembleNarrative`, `type Insight`, `type Narrative` (`./shared`); `josa` (`@/lib/seo/josa`)
- Produces:
  ```ts
  export interface HospitalInsightInput {
    name: string; typeName: string;
    deptCount: number; deptWithSpecialistCount: number; topDeptNames: string[];
    totalDoctors: number | null; specialistTotal: number | null;
    bedCounts: { label: string; count: number }[];
    nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
    infra: { label: string; count: number }[]; nearbyAptSaleManwon: number[];
  }
  export function buildHospitalNarrative(d: HospitalInsightInput): Narrative | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/insights-hospital.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildHospitalNarrative, type HospitalInsightInput } from '@/lib/insights/hospital';

const base: HospitalInsightInput = {
  name: '서울정형외과의원',
  typeName: '의원',
  deptCount: 5,
  deptWithSpecialistCount: 3,
  topDeptNames: ['정형외과', '내과', '재활의학과'],
  totalDoctors: 12,
  specialistTotal: 10,
  bedCounts: [{ label: '일반병상', count: 30 }, { label: '수술실', count: 2 }],
  nearestStation: { name: '강남역', lines: ['2호선'], distanceMeters: 320 },
  infra: [{ label: '카페', count: 9 }, { label: '약국', count: 4 }],
  nearbyAptSaleManwon: [130000, 180000, 240000],
};

describe('buildHospitalNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 스타 모듈 발화', () => {
    const n = buildHospitalNarrative(base)!;
    expect(n.sentences[0].startsWith('서울정형외과의원은')).toBe(true);
    expect(n.fired).toContain('depts');
    expect(n.fired).toContain('doctors');
    expect(n.fired).toContain('access');
    expect(n.fired).toContain('price');
  });
  it('소개: 유형 + 진료과 수', () => {
    expect(buildHospitalNarrative(base)!.text).toContain('의원으로 진료과 5개과를 운영합니다');
  });
  it('진료과: 전문의 배치 과 수 + 주요 과목', () => {
    const t = buildHospitalNarrative(base)!.text;
    expect(t).toContain('전문의가 배치된 과는 3개');
    expect(t).toContain('정형외과·내과·재활의학과');
  });
  it('의사수 구간: 10/12≈83% → 전문의 중심', () => {
    expect(buildHospitalNarrative(base)!.text).toContain('전문의가 10명(약 83%)으로 전문의 중심으로 운영됩니다');
  });
  it('의사수 구간: <50% → 일반의·전공의 함께', () => {
    const n = buildHospitalNarrative({ ...base, totalDoctors: 12, specialistTotal: 4 })!; // 33%
    expect(n.text).toContain('일반의·전공의도 함께 근무합니다');
  });
  it('병상: 조합으로 규모 판단', () => {
    const t = buildHospitalNarrative(base)!.text;
    expect(t).toContain('일반병상 30·수술실 2');
    expect(t).toContain('수술이 가능한 시설을 갖췄습니다'); // 응급실·중환자실 없고 수술실 있음
  });
  it('specialistTotal null이면 단순 의사수 문장', () => {
    const n = buildHospitalNarrative({ ...base, specialistTotal: null })!;
    expect(n.text).toContain('의사 12명이 근무합니다');
    expect(n.text).not.toContain('전문의가');
  });
  it('가드: 스타(진료과·의사수) 미발화 & 3모듈 미만이면 null', () => {
    const n = buildHospitalNarrative({
      ...base, typeName: '', deptCount: 0, deptWithSpecialistCount: 0, topDeptNames: [],
      totalDoctors: null, specialistTotal: null, bedCounts: [],
      nearestStation: null, infra: [{ label: '카페', count: 9 }], nearbyAptSaleManwon: [],
    });
    expect(n).toBeNull();
  });
  it('고유성: 전문의 비율이 다르면 결론 문장이 달라진다', () => {
    const a = buildHospitalNarrative(base)!;
    const b = buildHospitalNarrative({ ...base, specialistTotal: 4 })!;
    expect(a.text).not.toEqual(b.text);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-hospital.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/insights/hospital.ts`:

```ts
import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';
import { josa } from '@/lib/seo/josa';

export interface HospitalInsightInput {
  name: string;
  typeName: string;
  deptCount: number;
  deptWithSpecialistCount: number;
  topDeptNames: string[];
  totalDoctors: number | null;
  specialistTotal: number | null;
  bedCounts: { label: string; count: number }[];
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function intro(d: HospitalInsightInput): Insight | null {
  if (!d.typeName && d.deptCount < 1) return null;
  const type = d.typeName || '의료기관';
  return {
    key: 'intro',
    text: d.deptCount >= 1
      ? `${josa(type, '으로', '로')} 진료과 ${d.deptCount}개과를 운영합니다.`
      : `${type}입니다.`,
  };
}

function depts(d: HospitalInsightInput): Insight | null {
  if (d.deptCount < 1) return null;
  const names = d.topDeptNames.filter(Boolean).slice(0, 3);
  const parts: string[] = [];
  if (d.deptWithSpecialistCount > 0) parts.push(`전문의가 배치된 과는 ${d.deptWithSpecialistCount}개`);
  if (names.length) parts.push(`주요 진료과는 ${names.join('·')}`);
  if (!parts.length) return null;
  return { key: 'depts', text: `${parts.join(', ')}입니다.` };
}

function doctors(d: HospitalInsightInput): Insight | null {
  if (!d.totalDoctors || d.totalDoctors < 1) return null;
  if (d.specialistTotal != null && d.specialistTotal > 0) {
    const pct = Math.round((d.specialistTotal / d.totalDoctors) * 100);
    const judge = pct >= 80 ? '전문의 중심으로 운영됩니다'
      : pct >= 50 ? '전문의 비중이 높은 편입니다'
      : '일반의·전공의도 함께 근무합니다';
    return { key: 'doctors', text: `의사 ${d.totalDoctors}명 중 전문의가 ${d.specialistTotal}명(약 ${pct}%)으로 ${judge}.` };
  }
  return { key: 'doctors', text: `의사 ${d.totalDoctors}명이 근무합니다.` };
}

function beds(d: HospitalInsightInput): Insight | null {
  const b = d.bedCounts.filter((x) => x.count > 0);
  if (!b.length) return null;
  const total = b.reduce((s, x) => s + x.count, 0);
  const has = (label: string) => b.some((x) => x.label === label);
  const list = b.map((x) => `${x.label} ${x.count}`).join('·');
  const scale = (has('응급실') || has('중환자실')) ? '입원·응급 진료가 가능한 규모입니다'
    : has('수술실') ? '수술이 가능한 시설을 갖췄습니다'
    : total >= 30 ? '입원 병상을 갖춘 규모입니다'
    : '소규모 병상을 운영합니다';
  return { key: 'beds', text: `${list} 등 ${scale}` };
}

export function buildHospitalNarrative(d: HospitalInsightInput): Narrative | null {
  // 자연 순서: 소개(유형·진료과 수) → 진료과 구성 → 의사 → 병상 → 입지 → 시세.
  const mods = [
    intro(d),
    depts(d),
    doctors(d),
    beds(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['depts', 'doctors'] });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-hospital.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/insights/hospital.ts tests/lib/insights-hospital.test.ts
git commit -m "feat(insights): 병원 해석 프로즈 엔진(진료과·의사수·병상 파생판단)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 2: 병원 로더 + 페이지 배선

**Files:**
- Create: `lib/insights/hospital-loader.ts`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildHospitalNarrative` (Task 1); `getHospitalById`, `getHospitalLatLng` (`@/lib/hospital`); `getNearbyApartments`, `getNearbyInfra` (`@/lib/amenity/nearby`); `getNearbySubwayStations` (`@/lib/subway/nearby`); `provenanceNodes`, `placeSchema` (framework); `InsightSection` (`@/components/ui/insight-section`); `type Narrative` (`@/lib/insights/shared`)
- Produces:
  ```ts
  export const cachedHospitalById, cachedHospitalLatLng, cachedNearbyApartmentsHosp, cachedNearbyInfraHosp, cachedNearbySubwayHosp;
  export const loadHospitalInsight: (id: bigint) => Promise<{ narrative: Narrative | null }>;
  ```

- [ ] **Step 1: Create the loader**

Create `lib/insights/hospital-loader.ts`:

```ts
import { cache } from 'react';
import { getHospitalById, getHospitalLatLng } from '@/lib/hospital';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildHospitalNarrative } from '@/lib/insights/hospital';
import type { Narrative } from '@/lib/insights/shared';

export const cachedHospitalById = cache(getHospitalById);
export const cachedHospitalLatLng = cache(getHospitalLatLng);
export const cachedNearbyApartmentsHosp = cache(getNearbyApartments);
// 병원 페이지의 infra fetch는 excludeHospitalId를 넘긴다. 3인자를 그대로 받아 cache 키를 맞춘다.
export const cachedNearbyInfraHosp = cache((lat: number, lng: number, excludeHospitalId: bigint) =>
  getNearbyInfra(lat, lng, { excludeHospitalId, includeChildcare: true }),
);
export const cachedNearbySubwayHosp = cache(getNearbySubwayStations);

export const loadHospitalInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null }> => {
    const hospital = await cachedHospitalById(id);
    if (!hospital) return { narrative: null };
    const coord = await cachedHospitalLatLng(id);
    const [apts, infra, subway] = await Promise.all([
      coord ? cachedNearbyApartmentsHosp(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraHosp(coord.lat, coord.lng, hospital.id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayHosp(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    ]);

    const specialistSum =
      (hospital.drMedSpecialist ?? 0) + (hospital.drDentSpecialist ?? 0) + (hospital.drKorSpecialist ?? 0);
    const f = hospital.facility;
    const bedCounts = f
      ? [
          { label: '일반병상', count: (f.generalBedNormal ?? 0) + (f.generalBedPremium ?? 0) },
          { label: '중환자실', count: (f.icuAdultBed ?? 0) + (f.icuPediatricBed ?? 0) + (f.icuNeonatalBed ?? 0) },
          { label: '응급실', count: f.erBed ?? 0 },
          { label: '수술실', count: f.operatingRoomBed ?? 0 },
          { label: '분만실', count: f.deliveryBed ?? 0 },
        ].filter((x) => x.count > 0)
      : [];

    const narrative = buildHospitalNarrative({
      name: hospital.name,
      typeName: hospital.typeName,
      deptCount: hospital.depts.length,
      deptWithSpecialistCount: hospital.depts.filter((x) => (x.specialistCount ?? 0) > 0).length,
      topDeptNames: [...hospital.depts]
        .sort((a, b) => (b.specialistCount ?? 0) - (a.specialistCount ?? 0))
        .slice(0, 3)
        .map((x) => x.deptName),
      totalDoctors: hospital.totalDoctors,
      specialistTotal: specialistSum > 0 ? specialistSum : null,
      bedCounts,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    return { narrative };
  },
);
```

> `getHospitalById` returns the Hospital row with `facility`, `depts` (ordered), `specialties`, `specialTreatments` included, plus scalar doctor fields (`drMedSpecialist` etc.). `NearbyApartment.saleLastPrice` is 만원. `getNearbyInfra` returns `{label, items}[]`.

- [ ] **Step 2: Wire generateMetadata**

In `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`, add imports:
```tsx
import { loadHospitalInsight, cachedHospitalById, cachedHospitalLatLng, cachedNearbyApartmentsHosp, cachedNearbyInfraHosp, cachedNearbySubwayHosp } from '@/lib/insights/hospital-loader';
import { InsightSection } from '@/components/ui/insight-section';
```
Add `provenanceNodes` to the existing json-ld import:
```tsx
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
```
Remove `getHospitalById`, `getHospitalLatLng` from the `@/lib/hospital` import (keep `getHospitalList`), and remove `getNearbyApartments`/`getNearbyInfra` from `@/lib/amenity/nearby` (keep `type NearbyApartment` if still used elsewhere; if not, drop it) and `getNearbySubwayStations` from `@/lib/subway/nearby` — since the page now uses cached wrappers. (Verify with grep in Step 4; keep only what remains referenced.)

Replace `generateMetadata` body:
```tsx
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const hospital = await cachedHospitalById(BigInt(id)).catch(() => null);
  if (!hospital) return {};
  const { narrative } = await loadHospitalInsight(BigInt(id));
  const indexable = !!narrative && narrative.fired.length >= 3;
  const docs = hospital.totalDoctors ? `, 의사 ${hospital.totalDoctors.toLocaleString('ko-KR')}명` : '';
  return {
    title: `${hospital.name} — ${hospital.typeName} 정보·주변 아파트`,
    description: narrative?.text.slice(0, 150) ?? `${hospital.name} ${hospital.typeName}${docs}. 진료·시설·교통 정보와 도보권 아파트 실거래가를 함께 확인하세요.`,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
  };
```

- [ ] **Step 3: Wire the page body**

In `HospitalDetailPage`:

(a) `const hospital = await getHospitalById(hospitalId);` → `const hospital = await cachedHospitalById(hospitalId);`

(b) `const coord = await getHospitalLatLng(hospitalId);` → `const coord = await cachedHospitalLatLng(hospitalId);`

(c) In the `Promise.all`: `getNearbyApartments(coord.lat, coord.lng)` → `cachedNearbyApartmentsHosp(coord.lat, coord.lng)`; `getNearbyInfra(coord.lat, coord.lng, { excludeHospitalId: hospital.id, includeChildcare: true })` → `cachedNearbyInfraHosp(coord.lat, coord.lng, hospital.id)`; `getNearbySubwayStations(coord.lat, coord.lng)` → `cachedNearbySubwayHosp(coord.lat, coord.lng)`. Leave `getHospitalList` unchanged.

(d) After the `Promise.all` block (after `const others = …`), add:
```tsx
  const { narrative } = await loadHospitalInsight(hospitalId);
```

(e) In `<JsonLd data={[...]}/>`, extend `placeSchema` and append provenance (note: NO dateModified):
```tsx
          placeSchema({
            type: 'Hospital',
            name: hospital.name,
            address: hospital.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            telephone: hospital.tel,
            id: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#hospital`,
            mainEntityOfPageId: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#webpage`,
          }),
          breadcrumbSchema([ /* 기존 그대로 */
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '병원·의원', url: `${SITE_URL}/medical/hospital` },
            { name: hospital.name, url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}` },
          ]),
          ...provenanceNodes({
            url: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}`,
            name: hospital.name,
            sourceId: 'hira',
            entityId: `${SITE_URL}/medical/hospital/${hospital.sigunguCode}/${id}#hospital`,
          }),
```

(f) Add the prose section right after `<HospitalHero hospital={hospital} />` (or whatever the hero element is — locate the `HospitalHero` usage):
```tsx
      {narrative && <InsightSection sentences={narrative.sentences} />}
```

- [ ] **Step 4: Verify no stale refs + typecheck + build**

Run: `grep -n 'getHospitalById\|getHospitalLatLng\|getNearbyApartments\|getNearbyInfra\|getNearbySubwayStations' "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx"`
Expected: only the cached wrapper names (or none of the raw ones); no direct raw call remains.

Run: `pnpm tsc --noEmit`
Expected: no errors.

Run: `pnpm build 2>&1 | tail -20`
Expected: build succeeds; `/medical/hospital/[sigunguCode]/[id]` compiles.

- [ ] **Step 5: Manual acceptance (dev server)**

Run: `pnpm exec dotenv -e .env.local -- next dev` and open a data-rich hospital (종합병원: 진료과·의사·병상 많음) and a sparse 의원.

Verify:
- Rich: `view-source:`에 "한눈에 보기" 문단 + `application/ld+json`의 `WebPage`/`Dataset`(sourceOrganization=건강보험심사평가원) 노드가 JS 없이. 문장에 진료과·전문의·병상 파생 판단. **dateModified 키 없음**.
- Sparse(데이터 극빈): 프로즈 없음 + `noindex, follow`.

- [ ] **Step 6: Commit**

```bash
git add lib/insights/hospital-loader.ts "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(hospital): 한눈에 보기+출처 JSON-LD+조건부 noindex 배선(캐시 로더)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## Task 3: 전체 회귀 확인

**Files:** 없음(검증만)

- [ ] **Step 1: 유닛 스위트**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/insights-hospital.test.ts tests/lib/insights-childcare.test.ts tests/lib/insights-apt.test.ts tests/lib/insights-shared.test.ts tests/lib/json-ld-provenance.test.ts`
Expected: 전부 PASS (hospital 9 + childcare 12 + apt 13 + shared 7 + provenance 9).

- [ ] **Step 2: 타입체크 전체**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: 어린이집·아파트 무회귀 육안**

dev 서버로 어린이집 상세 1건·아파트 상세 1건이 여전히 "한눈에 보기" + 프로버넌스 정상 렌더되는지 확인.

---

## Self-Review (플랜 작성자 체크)

**Spec coverage**
- 병원 엔티티 모듈(§4) → Task 1 ✅
- 로더·병원 nearby 옵션·depts/facility 산출(§6) → Task 2 Step 1 ✅
- robots·description·프로즈·provenance(hira, dateModified 생략)·placeSchema id(§5,6) → Task 2 Step 2,3 ✅
- 테스트·회귀(§7) → Task 1 유닛 + Task 2 수동 + Task 3 회귀 ✅
- 아파트·어린이집 무회귀(Global Constraint) → Task 3 ✅

**Placeholder scan**: TBD/TODO 없음. 코드 블록 완성.

**Type consistency**: `HospitalInsightInput`/`Narrative`(Task1) ↔ 로더(Task2) 일치. `provenanceNodes({url,name,sourceId,entityId})` dateModified 미전달(optional) ↔ 페이지 호출 일치. `InsightSection({sentences})` ↔ 페이지. bed 라벨(일반병상/중환자실/응급실/수술실/분만실) ↔ facility 필드 매핑 일치. 단위 만원 일관.
