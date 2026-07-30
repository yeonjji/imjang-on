# 생활편의 상세 메타 타이틀 변별 키워드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생활편의 상세 페이지 9종의 검색결과 제목에서 모든 페이지에 동일하게 들어가는 `정보·주변 아파트`(9자)를 걷어내고, 그 자리에 시설별 변별 키워드(병원 진료과목, 주차장 무료/유료 등)를 넣는다.

**Architecture:** 키워드 도출을 DB를 타지 않는 순수 함수 모듈 `lib/seo/facility-descriptor.ts` 하나로 분리한다. 각 상세 페이지의 `generateMetadata`는 이미 로드해둔 row를 그 함수에 넘기고 반환된 명사구를 `qualifiedTitle()`의 tail로 쓴다. `qualifiedTitle()` 자체는 손대지 않아 제목 조립 단일 지점 규칙이 유지된다.

**Tech Stack:** Next.js App Router (`generateMetadata`), TypeScript, Prisma, Vitest

**스펙:** `docs/superpowers/specs/2026-07-30-facility-meta-title-keyword-design.md`

## Global Constraints

- `description`, `robots`, `alternates.canonical`은 **전부 무변경**이다. `title`만 바꾼다.
- `주변 아파트` 키워드는 description에 그대로 남긴다. 제목에서만 뺀다.
- 색인 정책(`robotsFor`, `isNarrativeIndexable`)은 이 작업에서 건드리지 않는다.
- `lib/seo/title.ts`의 `qualifiedTitle()`은 수정하지 않는다.
- `app/(public)/childcare/[sigunguCode]/[id]/page.tsx`는 대상이 아니다 — 이미 `crType`+정원이 제목에 있고 공통 문구가 없다.
- descriptor 함수는 **항상 문자열을 반환**한다. 데이터가 없으면 기존 시설명으로 폴백해 호출부에 null 분기를 만들지 않는다.
- 죽은 코드 정리·인접 코드 개선은 범위 밖이다. 바뀌는 줄은 전부 제목 조립 줄과 그 import여야 한다.
- 기존 `tests/lib/seo-title.test.ts`는 **수정하지 않는다.** 그 파일은 `qualifiedTitle`이 tail을 임의 문자열로 받는다는 계약을 테스트하며, 기대값에 `정보·주변 아파트`가 남아 있어도 무해하다.
- 테스트 실행 전 로컬 테스트 DB가 떠 있어야 한다: `docker compose up -d` (postgis, 호스트 포트 **5433**). `tests/components/**`가 Prisma를 탄다. 최초 1회는 `pnpm test:db:migrate`도 필요하다.
- vitest는 `globals: false`다. 모든 테스트 파일은 `import { describe, it, expect } from 'vitest'`를 명시해야 한다.

---

## File Structure

**Create:**

| 파일 | 책임 |
|---|---|
| `lib/seo/facility-descriptor.ts` | 시설 row → 제목 꼬리 명사구. 순수 함수 7개. DB·I/O 없음 |
| `tests/lib/facility-descriptor.test.ts` | 위 모듈의 순수 단위 테스트. 픽스처·DB 불필요 |

**Modify:**

| 파일 | 변경 |
|---|---|
| `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx` | `:49` 제목 줄 + import |
| `app/(public)/school/[sigunguCode]/[id]/page.tsx` | `:61` 제목 줄 + import |
| `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx` | `:43` 제목 줄 + import |
| `app/(public)/amenity/[category]/[id]/page.tsx` | `:55` 제목 줄 + import |
| `app/(public)/urban/[category]/[id]/page.tsx` | `:64`(park 분기) + `:73`(parking 분기) + import |
| `app/(public)/urban/charger/[id]/page.tsx` | `:53` 제목 줄 + import |
| `tests/components/facility-title-metadata.test.ts` | 옛 제목을 단정하는 기대값 3건 갱신 |

**충전소 라우트 주의:** `charger`는 `/urban/[category]/[id]`가 아니라 전용 정적 라우트 `/urban/charger/[id]`가 처리한다(Next 라우트 우선순위상 정적 세그먼트가 `[category]`를 이긴다). 두 파일 모두 손대야 한다. `/urban/[category]/[id]`의 일반 분기는 실질적으로 parking만 태우지만 `def.label` 폴백은 그대로 남긴다.

---

## Task 1: hospitalDescriptor — 진료과목 키워드

가장 로직이 많은 함수라 모듈 스캐폴드와 함께 먼저 만든다.

**Files:**
- Create: `lib/seo/facility-descriptor.ts`
- Test: `tests/lib/facility-descriptor.test.ts`

**Interfaces:**
- Consumes: 없음 (신규 모듈)
- Produces: `hospitalDescriptor(depts: DeptLike[], typeName: string): string`, `interface DeptLike { deptName: string; specialistCount: number | null }`

- [ ] **Step 1: Write the failing test**

`tests/lib/facility-descriptor.test.ts` 신규 생성:

```ts
import { describe, it, expect } from 'vitest';
import { hospitalDescriptor } from '@/lib/seo/facility-descriptor';

const dept = (deptName: string, specialistCount: number | null = null) => ({
  deptName,
  specialistCount,
});

describe('hospitalDescriptor', () => {
  it('전문의 수 상위 2개 진료과를 앞에 붙인다', () => {
    expect(hospitalDescriptor([dept('내과', 3), dept('정형외과', 8), dept('피부과', 1)], '병원'))
      .toBe('정형외과·내과 병원');
  });

  it('진료과가 1개면 그 과만 쓴다', () => {
    expect(hospitalDescriptor([dept('안과', 2)], '의원')).toBe('안과 의원');
  });

  it('진료과가 없으면 시설 종류만 낸다', () => {
    expect(hospitalDescriptor([], '치과의원')).toBe('치과의원');
  });

  it('전문의 배치가 없으면 전체 진료과에서 앞의 2개를 쓴다', () => {
    expect(hospitalDescriptor([dept('내과'), dept('소아과'), dept('이비인후과')], '의원'))
      .toBe('내과·소아과 의원');
  });

  it('두 과목 결합이 10자를 넘으면 1개만 쓴다', () => {
    // '소아청소년과·영상의학과' = 12자
    expect(hospitalDescriptor([dept('소아청소년과', 5), dept('영상의학과', 4)], '종합병원'))
      .toBe('소아청소년과 종합병원');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/seo/facility-descriptor"`

- [ ] **Step 3: Write minimal implementation**

`lib/seo/facility-descriptor.ts` 신규 생성:

```ts
/**
 * 시설 상세 제목의 꼬리 명사구를 만든다.
 *
 * 제목 패턴은 `{이름} ({지역}) — {변별 키워드} {시설명}`이고 이 모듈은 뒤쪽
 * `{변별 키워드} {시설명}`만 담당한다. 조립 자체는 qualifiedTitle()이 한다.
 *
 * 모든 함수는 항상 문자열을 반환한다 — 키워드 소재가 없으면 시설명으로
 * 폴백해서 호출부에 null 분기를 만들지 않는다. DB를 타지 않는 순수 함수라
 * 단위 테스트가 픽스처 없이 돈다.
 */

/** 진료과목 2개를 이어붙일 수 있는 상한. 초과하면 1개만 쓴다. */
const DEPT_COMBINED_MAX = 10;

export interface DeptLike {
  deptName: string;
  specialistCount: number | null;
}

/**
 * 병원: 전문의 배치 수가 많은 진료과 상위 2개를 앞에 붙인다.
 *
 * getHospitalById는 depts를 deptName 오름차순으로 주므로(lib/hospital/index.ts:9)
 * 여기서 전문의 수로 다시 정렬한다. Array#sort가 안정 정렬이라 동수인 과들은
 * deptName 순서를 유지해 결과가 결정적이다.
 *
 * 전문의가 배치된 과가 없으면 전체 과목에서 앞의 2개를 쓴다 — 의원급은
 * specialistCount가 전부 0/null이라 이 경로를 탄다.
 */
export function hospitalDescriptor(depts: DeptLike[], typeName: string): string {
  const withSpecialist = depts.filter((d) => (d.specialistCount ?? 0) > 0);
  const pool = withSpecialist.length > 0 ? withSpecialist : depts;
  const picked = [...pool]
    .sort((a, b) => (b.specialistCount ?? 0) - (a.specialistCount ?? 0))
    .slice(0, 2)
    .map((d) => d.deptName);

  if (picked.length === 0) return typeName;

  const combined = picked.join('·');
  const keyword = combined.length > DEPT_COMBINED_MAX ? picked[0] : combined;
  return `${keyword} ${typeName}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/seo/facility-descriptor.ts tests/lib/facility-descriptor.test.ts
git commit -m "feat(seo): 병원 제목 꼬리에 진료과목 키워드 도출 함수 추가"
```

---

## Task 2: schoolDescriptor · pharmacyDescriptor

**Files:**
- Modify: `lib/seo/facility-descriptor.ts`
- Test: `tests/lib/facility-descriptor.test.ts`

**Interfaces:**
- Consumes: Task 1의 `lib/seo/facility-descriptor.ts` 모듈
- Produces: `schoolDescriptor(foundType: string | null, coeduType: string | null, schoolKind: string | null): string`, `pharmacyDescriptor(eupmyeondong: string | null): string`

- [ ] **Step 1: Write the failing test**

`tests/lib/facility-descriptor.test.ts`의 import 줄을 다음으로 바꾼다:

```ts
import {
  hospitalDescriptor,
  schoolDescriptor,
  pharmacyDescriptor,
} from '@/lib/seo/facility-descriptor';
```

파일 끝에 다음 describe 두 개를 추가한다:

```ts
describe('schoolDescriptor', () => {
  it('설립구분을 앞에 붙인다', () => {
    expect(schoolDescriptor('공립', '남녀공학', '중학교')).toBe('공립 중학교');
  });

  it('공학은 표기 형태와 무관하게 생략한다', () => {
    // NEIS 원값이 정규화 없이 저장돼 '남녀공학'/'남여공학' 둘 다 올 수 있다
    expect(schoolDescriptor('사립', '남여공학', '고등학교')).toBe('사립 고등학교');
  });

  it('단성 학교는 남자·여자를 붙인다', () => {
    expect(schoolDescriptor('사립', '여', '고등학교')).toBe('사립 여자 고등학교');
    expect(schoolDescriptor('공립', '남', '중학교')).toBe('공립 남자 중학교');
  });

  it('예상 못한 coeduType은 키워드를 생략한다', () => {
    expect(schoolDescriptor('공립', '기타', '초등학교')).toBe('공립 초등학교');
  });

  it('설립구분이 없으면 학교 종류만 낸다', () => {
    expect(schoolDescriptor(null, null, '초등학교')).toBe('초등학교');
  });

  it('학교 종류도 없으면 학교로 폴백한다', () => {
    expect(schoolDescriptor(null, null, null)).toBe('학교');
  });
});

describe('pharmacyDescriptor', () => {
  it('읍면동을 앞에 붙인다', () => {
    expect(pharmacyDescriptor('역삼동')).toBe('역삼동 약국');
  });

  it('읍면동이 없으면 약국만 낸다', () => {
    expect(pharmacyDescriptor(null)).toBe('약국');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: FAIL — `schoolDescriptor is not a function` (또는 import 해석 실패)

- [ ] **Step 3: Write minimal implementation**

`lib/seo/facility-descriptor.ts` 끝에 추가:

```ts
/**
 * 단성 학교 표기. coeduType은 NEIS COEDU_SC_NM 원값이 정규화 없이 저장돼
 * 있어(scripts/ingest/amenities/adapter-school.ts) 값 형태를 코드에서 확정할 수
 * 없다('남녀공학'/'남여공학' 표기 차이 등). 그래서 '공학이 아닌 것'을 부등호로
 * 걸러내지 않고, 남·여로 시작하고 '공학'을 포함하지 않는 값만 통과시킨다.
 * 예상 못한 값의 실패 모드는 '키워드가 빠진다'이지 오표기가 아니다.
 */
function singleGenderLabel(coeduType: string | null): string | null {
  const v = coeduType?.trim();
  if (!v || v.includes('공학')) return null;
  if (v.startsWith('남')) return '남자';
  if (v.startsWith('여')) return '여자';
  return null;
}

/** 학교: 설립구분(공립/사립)과 단성 여부를 앞에 붙인다. 지금 description에만 있는 값을 제목으로 승격한다. */
export function schoolDescriptor(
  foundType: string | null,
  coeduType: string | null,
  schoolKind: string | null,
): string {
  const kind = schoolKind ?? '학교';
  const keyword = [foundType?.trim(), singleGenderLabel(coeduType)].filter(Boolean).join(' ');
  return keyword ? `${keyword} ${kind}` : kind;
}

/**
 * 약국: 읍면동을 앞에 붙인다. Pharmacy 모델에 영업시간·심야·공휴일 컬럼이
 * 없어 '심야약국' 같은 실검색어를 만들 소재가 없고, eupmyeondong이 유일한
 * 변별 축이다.
 */
export function pharmacyDescriptor(eupmyeondong: string | null): string {
  const dong = eupmyeondong?.trim();
  return dong ? `${dong} 약국` : '약국';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: PASS — 13 passed

- [ ] **Step 5: Commit**

```bash
git add lib/seo/facility-descriptor.ts tests/lib/facility-descriptor.test.ts
git commit -m "feat(seo): 학교 설립구분·단성, 약국 읍면동 키워드 도출 추가"
```

---

## Task 3: amenityDescriptor · urban descriptor 3종

**Files:**
- Modify: `lib/seo/facility-descriptor.ts`
- Test: `tests/lib/facility-descriptor.test.ts`

**Interfaces:**
- Consumes: Task 1·2의 `lib/seo/facility-descriptor.ts` 모듈
- Produces:
  - `amenityDescriptor(slug: string, item: AmenityFields, label: string): string`
  - `interface AmenityFields { industryName?: string | null; marketType?: string | null }`
  - `urbanParkDescriptor(parkType: string | null): string`
  - `urbanParkingDescriptor(chargeInfo: string | null, prkplceSe: string | null): string`
  - `urbanChargerDescriptor(chargeSpeed: string | null): string`

- [ ] **Step 1: Write the failing test**

`tests/lib/facility-descriptor.test.ts`의 import 줄을 다음으로 바꾼다:

```ts
import {
  hospitalDescriptor,
  schoolDescriptor,
  pharmacyDescriptor,
  amenityDescriptor,
  urbanParkDescriptor,
  urbanParkingDescriptor,
  urbanChargerDescriptor,
} from '@/lib/seo/facility-descriptor';
```

파일 끝에 추가:

```ts
describe('amenityDescriptor', () => {
  it('전통시장은 상설·정기를 앞에 붙인다', () => {
    expect(amenityDescriptor('market', { marketType: '상설시장' }, '전통시장')).toBe('상설 전통시장');
    expect(amenityDescriptor('market', { marketType: '정기시장' }, '전통시장')).toBe('정기 전통시장');
  });

  it('전통시장 유형이 미분류면 라벨만 낸다', () => {
    expect(amenityDescriptor('market', { marketType: null }, '전통시장')).toBe('전통시장');
  });

  it('마트는 업종명이 라벨을 대체한다', () => {
    expect(amenityDescriptor('mart', { industryName: '슈퍼마켓' }, '마트')).toBe('슈퍼마켓');
  });

  it('마트 업종명이 없으면 라벨만 낸다', () => {
    expect(amenityDescriptor('mart', { industryName: null }, '마트')).toBe('마트');
  });

  it('편의점·카페는 업종명을 쓰지 않는다 — 라벨과 동어반복이다', () => {
    expect(amenityDescriptor('convenience', { industryName: '체인화 편의점' }, '편의점')).toBe('편의점');
    expect(amenityDescriptor('cafe', { industryName: '커피전문점/카페/다방' }, '카페')).toBe('카페');
  });
});

describe('urbanParkDescriptor', () => {
  it('공원 유형이 시설명을 흡수한다', () => {
    expect(urbanParkDescriptor('근린공원')).toBe('근린공원');
    expect(urbanParkDescriptor('어린이공원')).toBe('어린이공원');
  });

  it('유형이 없으면 공원으로 폴백한다', () => {
    expect(urbanParkDescriptor(null)).toBe('공원');
  });
});

describe('urbanParkingDescriptor', () => {
  it('요금과 운영주체를 함께 붙인다', () => {
    expect(urbanParkingDescriptor('무료', '공영')).toBe('무료 공영주차장');
  });

  it('요금만 있으면 요금만 붙인다', () => {
    expect(urbanParkingDescriptor('유료', null)).toBe('유료 주차장');
  });

  it('운영주체만 있으면 운영주체만 붙인다', () => {
    expect(urbanParkingDescriptor(null, '민영')).toBe('민영주차장');
  });

  it('둘 다 없으면 주차장으로 폴백한다', () => {
    expect(urbanParkingDescriptor(null, null)).toBe('주차장');
  });
});

describe('urbanChargerDescriptor', () => {
  it('충전 속도를 앞에 붙인다', () => {
    expect(urbanChargerDescriptor('급속')).toBe('급속 전기차충전소');
    expect(urbanChargerDescriptor('완속')).toBe('완속 전기차충전소');
  });

  it('속도가 없으면 전기차충전소만 낸다', () => {
    expect(urbanChargerDescriptor(null)).toBe('전기차충전소');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: FAIL — `amenityDescriptor is not a function` (또는 import 해석 실패)

- [ ] **Step 3: Write minimal implementation**

`lib/seo/facility-descriptor.ts` 끝에 추가:

```ts
export interface AmenityFields {
  industryName?: string | null;
  marketType?: string | null;
}

/**
 * 상권·편의 4종. 호출 지점이 amenity/[category]/[id] 하나라 slug로 분기한다.
 * - market: marketType에서 상설·정기를 뽑는다(classifyMarketSub와 같은 기준)
 * - mart: industryName(슈퍼마켓·대형마트 등)이 '마트'를 흡수한다
 * - convenience·cafe: industryName이 '체인화 편의점'·'커피전문점'처럼 라벨과
 *   동어반복이라 키워드 없이 라벨만 낸다. 없는 변별력을 만들지 않는다.
 */
export function amenityDescriptor(slug: string, item: AmenityFields, label: string): string {
  if (slug === 'market') {
    const type = item.marketType ?? '';
    if (type.includes('상설')) return `상설 ${label}`;
    if (type.includes('정기') || type.includes('일장')) return `정기 ${label}`;
    return label;
  }
  if (slug === 'mart') {
    return item.industryName?.trim() || label;
  }
  return label;
}

/** 공원: parkType이 '근린공원'처럼 이미 '공원'으로 끝나 시설명을 흡수한다. */
export function urbanParkDescriptor(parkType: string | null): string {
  return parkType?.trim() || '공원';
}

/**
 * 주차장: 무료/유료 + 공영/민영. "무료 주차장"이 가장 강한 검색 의도다.
 * 무료/유료는 chargeInfo 컬럼이다(parkingchrgeInfo 매핑). feedingSe는
 * 급지구분이라 쓰지 않는다.
 */
export function urbanParkingDescriptor(chargeInfo: string | null, prkplceSe: string | null): string {
  const charge = chargeInfo?.trim();
  const operator = prkplceSe?.trim();
  if (charge && operator) return `${charge} ${operator}주차장`;
  if (charge) return `${charge} 주차장`;
  if (operator) return `${operator}주차장`;
  return '주차장';
}

/** 충전소: 급속·완속. '전기차 충전소'가 실검색어라 시설명을 '충전소'로 줄이지 않는다. */
export function urbanChargerDescriptor(chargeSpeed: string | null): string {
  const speed = chargeSpeed?.trim();
  return speed ? `${speed} 전기차충전소` : '전기차충전소';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/facility-descriptor.test.ts`
Expected: PASS — 26 passed (기존 13 + 이번 13)

- [ ] **Step 5: Commit**

```bash
git add lib/seo/facility-descriptor.ts tests/lib/facility-descriptor.test.ts
git commit -m "feat(seo): 상권·편의 4종과 공원·주차장·충전소 키워드 도출 추가"
```

---

## Task 4: 병원·학교·약국 페이지 배선

여기서부터 실제 제목이 바뀐다. 기존 테스트의 기대값도 함께 갱신해야 한다.

**Files:**
- Modify: `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx:49`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx:61`
- Modify: `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx:43`
- Modify: `tests/components/facility-title-metadata.test.ts:61,77`

**Interfaces:**
- Consumes: `hospitalDescriptor`, `schoolDescriptor`, `pharmacyDescriptor` (Task 1·2)
- Produces: 없음 (배선 작업)

- [ ] **Step 1: 기존 테스트의 기대값을 새 제목으로 바꿔 실패시킨다**

`tests/components/facility-title-metadata.test.ts`에서 두 줄을 바꾼다.

`:61` — 지역 매칭 성공 케이스:
```ts
    expect(meta.title).toBe('서울치과의원 (강남구) — 치과의원');
```

`:77` — 지역 매칭 실패 케이스:
```ts
      expect(meta.title).toBe('서울치과의원 — 치과의원');
```

병원 픽스처(`HOSPITAL_ID = 990001n`)는 `HospitalDept` 행을 만들지 않으므로 진료과목 0개 경로를 타고 `typeName`만 남는다. 픽스처는 **손대지 않는다** — 폴백 경로를 검증하는 셈이고, 키워드가 붙는 경로는 Task 1의 순수 테스트가 담당한다.

- [ ] **Step 2: Run test to verify it fails**

먼저 테스트 DB가 떠 있는지 확인한다: `docker compose up -d`

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/facility-title-metadata.test.ts`
Expected: FAIL 2건 — 병원 케이스 2개가 `expected '서울치과의원 (강남구) — 치과의원' but got '서울치과의원 (강남구) — 치과의원 정보·주변 아파트'`. 편의점 케이스는 아직 PASS.

- [ ] **Step 3: 세 페이지의 제목 줄을 바꾼다**

**병원** — `app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { hospitalDescriptor } from '@/lib/seo/facility-descriptor';
```

`:49` 교체:
```ts
    title: qualifiedTitle(hospital.name, locality, `— ${hospitalDescriptor(hospital.depts, hospital.typeName)}`),
```

`hospital.depts`는 `cachedHospitalById`가 이미 include로 실어온다(`lib/hospital/index.ts:9`). 추가 쿼리가 없다.

**학교** — `app/(public)/school/[sigunguCode]/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { schoolDescriptor } from '@/lib/seo/facility-descriptor';
```

`:61` 교체:
```ts
    title: qualifiedTitle(school.name, locality, `— ${schoolDescriptor(school.foundType, school.coeduType, school.schoolKind)}`),
```

바로 아래 `description` 줄은 **건드리지 않는다.** `tagPart`·`regionPart` 지역 변수도 description이 계속 쓰므로 그대로 둔다.

**약국** — `app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { pharmacyDescriptor } from '@/lib/seo/facility-descriptor';
```

`:43` 교체:
```ts
    title: qualifiedTitle(pharmacy.name, locality, `— ${pharmacyDescriptor(pharmacy.eupmyeondong)}`),
```

`robots: { index: false, follow: true }`와 그 위 주석 3줄은 **그대로 둔다.**

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/facility-title-metadata.test.ts`
Expected: PASS — 3 passed

Run: `pnpm typecheck`
Expected: 에러 0

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/medical/hospital/[sigunguCode]/[id]/page.tsx" \
        "app/(public)/school/[sigunguCode]/[id]/page.tsx" \
        "app/(public)/medical/pharmacy/[sigunguCode]/[id]/page.tsx" \
        tests/components/facility-title-metadata.test.ts
git commit -m "feat(seo): 병원·학교·약국 제목에 변별 키워드 적용"
```

---

## Task 5: 상권·편의 페이지 배선

**Files:**
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx:55`
- Modify: `tests/components/facility-title-metadata.test.ts:66`

**Interfaces:**
- Consumes: `amenityDescriptor` (Task 3)
- Produces: 없음 (배선 작업)

- [ ] **Step 1: 기존 테스트의 기대값을 새 제목으로 바꿔 실패시킨다**

`tests/components/facility-title-metadata.test.ts:66`:
```ts
    expect(meta.title).toBe('씨유 (강남구) — 편의점');
```

편의점 픽스처의 `industryName`은 `'체인화 편의점'`이지만 편의점은 `industryName`을 쓰지 않으므로 라벨 `'편의점'`이 그대로 나온다. 픽스처는 손대지 않는다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/facility-title-metadata.test.ts`
Expected: FAIL 1건 — 편의점 케이스가 `expected '씨유 (강남구) — 편의점' but got '씨유 (강남구) — 편의점 정보·주변 아파트'`. 병원 케이스 2개는 PASS(Task 4에서 이미 처리).

- [ ] **Step 3: amenity 페이지의 제목 줄을 바꾼다**

`app/(public)/amenity/[category]/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { amenityDescriptor } from '@/lib/seo/facility-descriptor';
```

`:55` 교체:
```ts
    title: qualifiedTitle(item.name, locality, `— ${amenityDescriptor(def.slug, item, def.label)}`),
```

`item`은 `AmenityItem`이라 `industryName`·`marketType`이 옵셔널 필드로 이미 붙어 있고(`lib/amenity/category.ts:25`), mart·market의 `getById`가 각각 그 컬럼을 select한다. 추가 쿼리가 없다.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/facility-title-metadata.test.ts`
Expected: PASS — 3 passed

Run: `pnpm typecheck`
Expected: 에러 0

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/amenity/[category]/[id]/page.tsx" tests/components/facility-title-metadata.test.ts
git commit -m "feat(seo): 상권·편의 4종 제목에 변별 키워드 적용"
```

---

## Task 6: 도시인프라 페이지 배선 + 최종 게이트

공원·주차장은 `/urban/[category]/[id]`, 충전소는 전용 라우트 `/urban/charger/[id]`다. 두 파일 모두 손대야 한다.

**Files:**
- Modify: `app/(public)/urban/[category]/[id]/page.tsx:64,73`
- Modify: `app/(public)/urban/charger/[id]/page.tsx:53`

**Interfaces:**
- Consumes: `urbanParkDescriptor`, `urbanParkingDescriptor`, `urbanChargerDescriptor` (Task 3)
- Produces: 없음 (배선 작업)

이 세 라우트는 옛 제목을 단정하는 기존 테스트가 없다. 순수 테스트(Task 3)가 로직을 이미 덮고 있고 배선은 타입 검사와 빌드로 확인한다.

- [ ] **Step 1: 공원·주차장 제목 줄을 바꾼다**

`app/(public)/urban/[category]/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { urbanParkDescriptor, urbanParkingDescriptor } from '@/lib/seo/facility-descriptor';
```

`ParkRaw`(`:31`)와 `ParkingRaw`(`:28`)는 이미 import돼 있어 새 타입 import가 필요 없다.

`:64` — park 분기의 제목 줄 교체:
```ts
      title: qualifiedTitle(item.name, locality, `— ${urbanParkDescriptor((item.raw as ParkRaw).parkType)}`),
```

같은 분기의 `description`(narrative 폴백)·`robots`·`alternates`는 그대로 둔다.

`:73` 일반 분기는 반환문 앞에 지역 변수를 하나 두고 교체한다. `charger`는 전용 라우트가 가로채므로 이 분기는 실질적으로 parking만 태우지만, `def.label` 폴백은 남겨 다른 카테고리가 들어와도 깨지지 않게 한다.

```ts
  const parkingRaw = def.slug === 'parking' ? (item.raw as ParkingRaw) : null;
  return {
    title: qualifiedTitle(
      item.name,
      locality,
      `— ${parkingRaw ? urbanParkingDescriptor(parkingRaw.chargeInfo, parkingRaw.prkplceSe) : def.label}`,
    ),
```

`description`부터 그 아래 줄은 손대지 않는다.

- [ ] **Step 2: 충전소 전용 라우트의 제목 줄을 바꾼다**

`app/(public)/urban/charger/[id]/page.tsx`

`import { qualifiedTitle } from '@/lib/seo/title';` 바로 아래에 추가:
```ts
import { urbanChargerDescriptor } from '@/lib/seo/facility-descriptor';
```

`ChargerRaw`는 이미 import돼 있다(`:13`).

`:53` 교체:
```ts
    title: qualifiedTitle(item.name, locality, `— ${urbanChargerDescriptor((item.raw as ChargerRaw).chargeSpeed)}`),
```

- [ ] **Step 3: 타입 검사와 잔여 문구 확인**

Run: `pnpm typecheck`
Expected: 에러 0

Run: `grep -rn "정보·주변 아파트" --include="*.tsx" --include="*.ts" app/ lib/`
Expected: **`lib/seo/title.ts:6` 한 줄만** 나온다. 그 줄은 tail 인자의 형태를 설명하는 주석 예시라 손대지 않는다. `app/` 아래에서 한 건이라도 나오면 배선이 빠진 라우트가 있다는 뜻이다.

- [ ] **Step 4: 전체 게이트를 돌린다**

Run: `pnpm lint`
Expected: 에러 0. 사용처가 사라진 지역 변수가 있으면 여기서 `no-unused-vars`로 잡힌다.

Run: `pnpm test`
Expected: `test:unit` PASS. `test:integration`은 CI에서 `continue-on-error`이므로 여기서 실패가 나오면 이번 변경과 무관한 기존 flake인지 먼저 확인한다 — 제목 관련 단정이 없는 파일의 실패는 이번 작업 소관이 아니다.

Run: `pnpm build`
Expected: 성공. CI(`ci.yml`)에는 `pnpm build`가 없어 빌드 에러는 배포 시점에야 드러난다 — 여기서 한 번 돌려 막는다.

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/urban/[category]/[id]/page.tsx" "app/(public)/urban/charger/[id]/page.tsx"
git commit -m "feat(seo): 공원·주차장·충전소 제목에 변별 키워드 적용"
```

---

## 완료 후 확인

- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm build` 전부 통과
- [ ] `app/`·`lib/`에 `정보·주변 아파트` 문자열 잔존 없음 (`lib/seo/title.ts` 주석 예시 제외)
- [ ] `lib/seo/title.ts`의 `qualifiedTitle()` 무변경
- [ ] 6개 페이지에서 바뀐 줄이 제목 조립 줄 + import + urban 일반 분기의 `parkingRaw` 지역 변수뿐
- [ ] `description`·`robots`·`alternates.canonical` 무변경
- [ ] PR은 `feat/facility-meta-title-keyword` → `main` 직접 PR (단일 트렁크)
- [ ] 새 마이그레이션이 없으므로 `prisma:deploy` 불필요

**머지 후:** 색인된 4종(병원·학교·어린이집·공원) 중 실제 SERP 반영은 구글 재크롤 이후다. 즉시 확인은 안 되고, GSC에서 해당 URL의 렌더 결과로 확인한다. 프로덕션에 curl 버스트를 넣지 않는다.
