# SEO Title/Description CTR 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전 페이지 generateMetadata의 title/description을 "정보형+수치" CTR 톤 + 상세별 고유 특징으로 교체한다.

**Architecture:** 매물 3종(apt/officetel/villa)은 `lib/seo/blurb.ts`의 공통 헬퍼 `propertyMetaDescription()`로 DRY. 나머지 상세/정적은 각 페이지 generateMetadata 직접 수정. 모든 동적 description은 "부분 배열→조건부 push→join"으로 빈 토큰/`-`/앞공백을 방지. region만 Tier2(getRegionStats 1쿼리 추가).

**Tech Stack:** Next.js App Router, TypeScript, Prisma, vitest.

설계 근거: `docs/superpowers/specs/2026-06-12-seo-meta-title-description-ctr-design.md`

---

### Task 1: 매물 메타 description 공통 헬퍼 (TDD)

**Files:**
- Modify: `lib/seo/blurb.ts` (파일 끝에 추가)
- Test: `tests/lib/property-meta.test.ts` (신규)

- [ ] **Step 1: 실패 테스트 작성**

```ts
// tests/lib/property-meta.test.ts
import { describe, it, expect } from 'vitest';
import { propertyMetaDescription } from '@/lib/seo/blurb';

const base = {
  name: '래미안대치팰리스',
  typeLabel: '아파트',
  regionFullName: '서울 강남구 대치동',
  builtYear: 2015,
  households: 1608,
  saleAvgPrice12m: 352000,
  jeonseAvgDeposit12m: 180000,
  txCount12m: 42,
};

describe('propertyMetaDescription', () => {
  it('데이터 풍부: 가격·전세가율·준공·세대수를 포함한다', () => {
    const d = propertyMetaDescription(base);
    expect(d).toContain('매매 35.2억');
    expect(d).toContain('전세 18억');
    expect(d).toContain('전세가율 51%');
    expect(d).toContain('2015년 준공');
    expect(d).toContain('1,608세대');
    expect(d).toContain('서울 강남구 대치동');
    expect(d.endsWith('공공데이터로 확인하세요.')).toBe(true);
  });

  it('가격 없음: 데이터부족 폴백 문장을 반환한다', () => {
    const d = propertyMetaDescription({ ...base, saleAvgPrice12m: null, jeonseAvgDeposit12m: null });
    expect(d).toContain('신고 거래는 아직 적습니다');
    expect(d).not.toContain('전세가율');
    expect(d).not.toContain('-'); // 빈 가격 토큰 노출 금지
  });

  it('전세만 없음: 전세가율을 생략한다', () => {
    const d = propertyMetaDescription({ ...base, jeonseAvgDeposit12m: null });
    expect(d).toContain('매매 35.2억');
    expect(d).not.toContain('전세 ');
    expect(d).not.toContain('전세가율');
  });

  it('준공·세대수 없음: 앞 콤마 없이 깔끔하게 조립한다', () => {
    const d = propertyMetaDescription({ ...base, builtYear: null, households: null });
    expect(d).not.toContain('. , ');
    expect(d).toContain('서울 강남구 대치동 실거래가를');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/lib/property-meta.test.ts`
Expected: FAIL — `propertyMetaDescription is not a function` (export 없음)

- [ ] **Step 3: 헬퍼 구현 (lib/seo/blurb.ts 끝에 추가)**

```ts
export interface PropertyMetaInput {
  name: string;
  typeLabel: string;           // '아파트' | '오피스텔' | '연립·다세대'
  regionFullName: string;
  builtYear: number | null;
  households: number | null;
  saleAvgPrice12m: number | null;    // 만원
  jeonseAvgDeposit12m: number | null;
  txCount12m: number;
}

/** 매물 상세 메타 description. 가격 없으면 데이터부족 폴백, 있으면 전세가율·준공·세대수 조립. */
export function propertyMetaDescription(i: PropertyMetaInput): string {
  const priceParts: string[] = [];
  if (i.saleAvgPrice12m) priceParts.push(`매매 ${formatBillion(i.saleAvgPrice12m)}`);
  if (i.jeonseAvgDeposit12m) priceParts.push(`전세 ${formatBillion(i.jeonseAvgDeposit12m)}`);

  if (priceParts.length === 0) {
    return `${i.name} ${i.typeLabel} 실거래가. ${i.regionFullName} 단지 정보와 매매·전세 시세를 공공데이터로 확인하세요. (최근 1년 신고 거래는 아직 적습니다.)`;
  }

  const ratio =
    i.saleAvgPrice12m && i.jeonseAvgDeposit12m
      ? Math.round((i.jeonseAvgDeposit12m / i.saleAvgPrice12m) * 100)
      : null;
  const price = `${priceParts.join('·')}${ratio ? `(전세가율 ${ratio}%)` : ''}`;

  const specParts: string[] = [];
  if (i.builtYear) specParts.push(`${i.builtYear}년 준공`);
  if (i.households) specParts.push(`${i.households.toLocaleString('ko-KR')}세대`);
  const spec = specParts.length ? `${specParts.join(' ')}, ` : '';

  return `${i.name} ${price}. ${spec}${i.regionFullName} 실거래가를 공공데이터로 확인하세요.`;
}
```

> `formatBillion`은 이미 `lib/seo/blurb.ts` 상단에서 import됨(`import { formatBillion } from '@/lib/format'`). 추가 import 불필요.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lib/property-meta.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/seo/blurb.ts tests/lib/property-meta.test.ts
git commit -m "feat(seo): 매물 메타 description 공통 헬퍼 propertyMetaDescription"
```

---

### Task 2: 매물 상세 3종 generateMetadata 적용

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx` (generateMetadata)
- Modify: `app/(public)/officetel/[id]/page.tsx` (generateMetadata)
- Modify: `app/(public)/villa/[id]/page.tsx` (generateMetadata)

- [ ] **Step 1: apt generateMetadata 교체**

기존 return 블록을 아래로 교체 (`propertyMetaDescription` import 추가):

```ts
import { propertyBlurb, salePriceTrend, propertyMetaDescription } from '@/lib/seo/blurb';
// ...
return {
  title: `${property.name} 실거래가 · ${property.region.sigungu}`,
  description: propertyMetaDescription({
    name: property.name,
    typeLabel: '아파트',
    regionFullName: property.region.fullName,
    builtYear: property.builtYear,
    households: property.households,
    saleAvgPrice12m: property.saleAvgPrice12m ? Number(property.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: property.jeonseAvgDeposit12m ? Number(property.jeonseAvgDeposit12m) : null,
    txCount12m: property.txCount12m,
  }),
  alternates: { canonical: `/apt/${property.id}` },
};
```

- [ ] **Step 2: officetel generateMetadata 교체** — Task2 Step1과 동일, `typeLabel: '오피스텔'`, canonical `/officetel/${p.id}`, 변수명 `p`. import 추가.

```ts
import { propertyBlurb, salePriceTrend, propertyMetaDescription } from '@/lib/seo/blurb';
// ...
return {
  title: `${p.name} 실거래가 · ${p.region.sigungu}`,
  description: propertyMetaDescription({
    name: p.name,
    typeLabel: '오피스텔',
    regionFullName: p.region.fullName,
    builtYear: p.builtYear,
    households: p.households,
    saleAvgPrice12m: p.saleAvgPrice12m ? Number(p.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: p.jeonseAvgDeposit12m ? Number(p.jeonseAvgDeposit12m) : null,
    txCount12m: p.txCount12m,
  }),
  alternates: { canonical: `/officetel/${p.id}` },
};
```

> officetel 페이지가 현재 `propertyBlurb`/`salePriceTrend`를 import하는지 확인 후, 없으면 `import { propertyMetaDescription } from '@/lib/seo/blurb';` 단독 추가.

- [ ] **Step 3: villa generateMetadata 교체** — `typeLabel: '연립·다세대'`, canonical `/villa/${p.id}`, 변수명 `p`.

```ts
import { propertyBlurb, salePriceTrend, propertyMetaDescription } from '@/lib/seo/blurb';
// ...
return {
  title: `${p.name} 실거래가 · ${p.region.sigungu}`,
  description: propertyMetaDescription({
    name: p.name,
    typeLabel: '연립·다세대',
    regionFullName: p.region.fullName,
    builtYear: p.builtYear,
    households: p.households,
    saleAvgPrice12m: p.saleAvgPrice12m ? Number(p.saleAvgPrice12m) : null,
    jeonseAvgDeposit12m: p.jeonseAvgDeposit12m ? Number(p.jeonseAvgDeposit12m) : null,
    txCount12m: p.txCount12m,
  }),
  alternates: { canonical: `/villa/${p.id}` },
};
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/apt/[id]/page.tsx" "app/(public)/officetel/[id]/page.tsx" "app/(public)/villa/[id]/page.tsx"
git commit -m "feat(seo): 매물 상세 title 지역 축약 + 헬퍼 기반 description"
```

---

### Task 3: region/[code] Tier2 (getRegionStats)

**Files:**
- Modify: `app/(public)/region/[code]/page.tsx` (generateMetadata)

> `getRegionStats`는 이 페이지가 이미 import 중(`import { getTopPropertiesByVolume, getRegionStats } from '@/lib/property'`). 추가 import 불필요.

- [ ] **Step 1: generateMetadata 교체**

```ts
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const r = await getSigunguByCode(code);
  if (!r || !r.sigunguCode) return {};
  const stats = await getRegionStats(r.sigunguCode).catch(() => null);
  const description =
    stats && stats.complexCount > 0
      ? `${r.fullName} 아파트 ${stats.complexCount.toLocaleString('ko-KR')}개 단지·최근 1년 ${stats.txCount12m.toLocaleString('ko-KR')}건 실거래. 매매·전세·월세 시세와 거래 많은 단지를 공공데이터로 확인하세요.`
      : `${r.fullName} 아파트·오피스텔·연립다세대 매매·전세·월세 실거래가. 거래 많은 단지와 시세 흐름을 공공데이터로 확인하세요.`;
  return {
    title: `${r.fullName} 아파트 실거래가·시세`,
    description,
    alternates: { canonical: `/region/${r.sigunguCode}` },
  };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 커밋**

```bash
git add "app/(public)/region/[code]/page.tsx"
git commit -m "feat(seo): region 상세 메타에 단지수·거래수 노출(Tier2)"
```

---

### Task 4: subscription + finance 상세

**Files:**
- Modify: `app/(public)/subscription/[id]/page.tsx` (generateMetadata)
- Modify: `app/(public)/finance/[seq]/page.tsx` (generateMetadata)

- [ ] **Step 1: subscription description 교체** (title 유지)

```ts
const region = notice.regionName ? `${notice.regionName} ` : '';
const supply = notice.totalSupply ? `, ${notice.totalSupply.toLocaleString('ko-KR')}세대 공급` : '';
return {
  title: `${notice.name} 청약 · ${categoryLabel(notice.category)}`,
  description: `${region}${notice.name} 청약${supply}. 접수 일정·주택형별 분양가와 주변 단지 시세를 한눈에 확인하세요.`,
  alternates: { canonical: `/subscription/${notice.id}` },
};
```

> 기존 canonical 표현 그대로 유지(파일 현재 값 확인 후 일치시킬 것).

- [ ] **Step 2: finance description·title 교체**

```ts
const provider = product.ofrinstnm ? `${product.ofrinstnm} ` : '';
const limit = product.lnlmt ? ` 한도 ${product.lnlmt.toLocaleString('ko-KR')}만원` : '';
const target = product.targetTags.length ? `, ${product.targetTags.slice(0, 2).join('·')} 대상` : '';
return {
  title: `${product.finprdnm} 한도·금리 — 주거금융`,
  description: `${provider}${product.finprdnm}${limit}${target}. 금리·자격요건·신청방법을 한눈에 확인하세요.`,
  alternates: { canonical: `/finance/${seq}` },
};
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: 커밋**

```bash
git add "app/(public)/subscription/[id]/page.tsx" "app/(public)/finance/[seq]/page.tsx"
git commit -m "feat(seo): 청약·대출상품 상세 메타에 공급세대·한도·대상 반영"
```

---

### Task 5: 생활편의 상세 (school·hospital·childcare·pharmacy)

**Files:**
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx`
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`
- Modify: `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`

- [ ] **Step 1: school description 교체** (title 유지)

```ts
const tags = [school.foundType, school.coeduType].filter(Boolean).join('·');
const tagPart = tags ? `(${tags})` : '';
const regionPart = school.region ? `${school.region} ` : '';
return {
  title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
  description: `${school.name}${tagPart} ${school.schoolKind ?? '학교'} 정보와 도보권 아파트 실거래가. ${regionPart}배정·통학 정보를 공공데이터로 확인하세요.`,
  alternates: { canonical: `/school/${sigunguCode}/${id}` },
};
```

- [ ] **Step 2: hospital description 교체** (title 유지)

```ts
const docs = hospital.totalDoctors ? `, 의사 ${hospital.totalDoctors.toLocaleString('ko-KR')}명` : '';
return {
  title: `${hospital.name} — ${hospital.typeName} 정보·주변 아파트`,
  description: `${hospital.name} ${hospital.typeName}${docs}. 진료·시설·교통 정보와 도보권 아파트 실거래가를 함께 확인하세요.`,
  alternates: { canonical: `/medical/hospital/${hospital.sigunguCode}/${id}` },
};
```

- [ ] **Step 3: pharmacy description 교체** (title 유지)

```ts
const region = pharmacy.sigungu ?? pharmacy.sido;
const regionPart = region ? `${region} ` : '';
return {
  title: `${pharmacy.name} — 약국 정보·주변 아파트`,
  description: `${pharmacy.name} 위치·연락처와 도보권 아파트 실거래가. ${regionPart}주변 생활 인프라를 한눈에 확인하세요.`,
  alternates: { canonical: `/medical/pharmacy/${pharmacy.sigunguCode}/${id}` },
};
```

- [ ] **Step 4: childcare description 교체** (title 유지)

```ts
const parts: string[] = [];
if (item.capacity != null) parts.push(`정원 ${item.capacity.toLocaleString('ko-KR')}명`);
if (item.currentCount != null) parts.push(`현원 ${item.currentCount.toLocaleString('ko-KR')}명`);
if (item.staffCount != null) parts.push(`교직원 ${item.staffCount.toLocaleString('ko-KR')}명`);
const stat = parts.length ? ` ${parts.join('·')}` : '';
const type = item.crType ? `(${item.crType})` : '';
return {
  title: `${item.name} — ${item.crType ?? '어린이집'} 정원 ${item.capacity ?? '-'}`,
  description: `${item.name}${type}${stat}. 도보권 아파트 실거래가와 보육정보를 한눈에.`,
  alternates: { canonical: `/childcare/${sigunguCode}/${id}` },
};
```

- [ ] **Step 5: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 0 errors
```bash
git add "app/(public)/school/[sigunguCode]/[id]/page.tsx" "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx" "app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx" "app/(public)/childcare/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(seo): 학교·병원·약국·어린이집 상세 메타에 고유 특징 반영"
```

---

### Task 6: amenity·urban·charger 상세 description

**Files:**
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx`
- Modify: `app/(public)/urban/[category]/[id]/page.tsx`
- Modify: `app/(public)/urban/charger/[id]/page.tsx`

- [ ] **Step 1: amenity description 교체** (title 유지)

```ts
description: `${item.name} ${def.label} 정보와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
```

- [ ] **Step 2: urban description 교체** (title 유지)

```ts
description: `${item.name} ${def.label} 정보(운영시간·요금)와 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
```

- [ ] **Step 3: charger description 교체** (title 유지)

```ts
description: `${item.name} 전기차충전소 실시간 충전기 현황과 도보권 아파트 실거래가. 주변 시세를 공공데이터로 확인하세요.`,
```

- [ ] **Step 4: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 0 errors
```bash
git add "app/(public)/amenity/[category]/[id]/page.tsx" "app/(public)/urban/[category]/[id]/page.tsx" "app/(public)/urban/charger/[id]/page.tsx"
git commit -m "feat(seo): 상권·도시인프라 상세 메타 도보권 후크 통일"
```

---

### Task 7: 허브/정적 페이지 고정 description

**Files:**
- Modify: `app/(public)/page.tsx`
- Modify: `app/(public)/apt/page.tsx`
- Modify: `app/(public)/officetel/page.tsx`
- Modify: `app/(public)/villa/page.tsx`
- Modify: `app/(public)/medical/pharmacy/page.tsx`
- Modify: `app/(public)/medical/hospital/page.tsx`
- Modify: `app/(public)/childcare/regions/page.tsx`

- [ ] **Step 1: 각 파일 description 문자열 교체** (title 유지)

| 파일 | 새 description |
|---|---|
| `(public)/page.tsx` | 아파트·오피스텔·빌라 실거래가부터 청약·학군·생활편의까지. 공공데이터로 보는 전국 부동산 시세를 한 곳에서 확인하세요. |
| `apt/page.tsx` | 전국 아파트 매매·전세·월세 실거래가를 단지별로. 평균 시세·거래량·최근 거래 흐름을 공공데이터로 매일 업데이트. |
| `officetel/page.tsx` | 전국 오피스텔 매매·전세·월세 실거래가. 단지별 시세·거래량을 공공데이터로 한눈에. |
| `villa/page.tsx` | 전국 연립·다세대 매매·전세·월세 실거래가. 단지별 시세·거래량을 공공데이터로 한눈에. |
| `medical/pharmacy/page.tsx` | 전국 시·군·구별 약국 위치·연락처를 찾고, 주변 아파트 실거래가까지 함께 확인하세요. |
| `medical/hospital/page.tsx` | 전국 시·군·구별 병원·의원·종합병원 진료·위치 정보와 주변 아파트 실거래가를 한눈에. |
| `childcare/regions/page.tsx` | 전국 시·도·시군구별 어린이집 분포를 보고 우리 동네 국공립·민간·가정 어린이집을 찾아보세요. |

- [ ] **Step 2: 타입체크 + 커밋**

Run: `npx tsc --noEmit` → Expected: 0 errors
```bash
git add "app/(public)/page.tsx" "app/(public)/apt/page.tsx" "app/(public)/officetel/page.tsx" "app/(public)/villa/page.tsx" "app/(public)/medical/pharmacy/page.tsx" "app/(public)/medical/hospital/page.tsx" "app/(public)/childcare/regions/page.tsx"
git commit -m "feat(seo): 허브·홈 description CTR 문구 보강"
```

---

### Task 8: 최종 검증

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 린트**

Run: `npx next lint`
Expected: No ESLint warnings or errors

- [ ] **Step 3: 헬퍼 테스트 재실행**

Run: `npx vitest run tests/lib/property-meta.test.ts`
Expected: PASS (4 tests)

---

## Self-Review 결과
- **Spec 커버리지**: 매물(T1·T2)·region(T3)·청약/금융(T4)·학교/병원/약국/어린이집(T5)·amenity/urban/charger(T6)·허브/정적(T7) → 스펙 전 페이지 매핑됨.
- **플레이스홀더**: 모든 코드/명령/기대출력 구체화. 없음.
- **타입 일관성**: `PropertyMetaInput` 필드명이 Task2 호출부와 일치. `getRegionStats` 반환 필드(`complexCount`·`txCount12m`)가 Task3에서 일치.
