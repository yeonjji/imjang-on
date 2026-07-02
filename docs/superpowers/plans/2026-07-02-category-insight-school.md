# 학교 카테고리 인사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학교 상세(`school/[sigunguCode]/[id]`)에 "한눈에 보기" 해석 프로즈 + 출처 JSON-LD + 조건부 noindex를 프레임워크 재사용으로 도입하되, 도보권 학교 밀도(학군)를 star 모듈로 필수화한다.

**Architecture:** 프레임워크(`shared.ts`·`provenanceNodes`·`InsightSection`, 이미 main 머지됨)와 병원/공원 로더 패턴을 재사용. 신규는 학교 엔티티 모듈(`school.ts`) + 로더 + nearby-schools 집계 쿼리. `getNearbyInfra`엔 학교가 없어 학군용 집계를 별도 추가. 전용 라우트라 배선 단순, base = main(스택 아님).

**Tech Stack:** Next.js App Router(RSC/ISR `revalidate=86_400`), TypeScript, Prisma+Supabase(PostGIS), React `cache()`, Vitest, pnpm.

## Global Constraints

- 표 재서술 최소화 — 파생·학군 중심. synonym spinning(뜻 같은 문구 로테이션) 금지.
- 과장 금지 — "배정 학교"·학군 등급 등 **미보유 데이터 주장 금지**. 도보권 학교 수는 실측이므로 사실 진술.
- 데이터 부족 시 침묵 + `noindex, follow`. 프로즈와 JSON-LD 병행. 표시값과 프로즈 값 일치.
- 돈은 만원 입력, 억 표시(공유 C가 처리).
- `dateModified` **생략** — School에 소스 기준일 없음. `updatedAt` 사용 금지.
- 공유 모듈(`shared.ts`)·`provenanceNodes`·`InsightSection` **무변경**(재사용만).
- coeduType DB 원값은 `남여공학`·`남`·`여` — 프로즈 표기는 `남녀공학`으로 정규화.

---

### Task 1: 학교 엔티티 모듈 `lib/insights/school.ts`

**Files:**
- Create: `lib/insights/school.ts`
- Test: `tests/lib/insights-school.test.ts`

**Interfaces:**
- Consumes: `@/lib/insights/shared`의 `accessInsight(d)`, `priceContextInsight(d)`, `assembleNarrative(name, mods, opts)`, `type Insight`, `type Narrative`.
  - `assembleNarrative(name, mods, { minFired, requireKeys })` → 첫 발화 모듈 text에 `${name}은/는 ` prefix. `minFired` 미만이거나 requireKeys 중 아무것도 발화 안 하면 null.
- Produces: `buildSchoolNarrative(input: SchoolInsightInput): Narrative | null`, `interface SchoolInsightInput`.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/lib/insights-school.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSchoolNarrative, type SchoolInsightInput } from '@/lib/insights/school';

const base: SchoolInsightInput = {
  name: '서울중앙중학교',
  schoolKind: '중학교',
  foundType: '공립',
  coeduType: '남여공학',
  nearbySchoolCounts: [{ kind: '중학교', count: 1 }, { kind: '초등학교', count: 2 }],
  nearestStation: { name: '시청역', lines: ['1호선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 5 }, { label: '병원', count: 3 }, { label: '약국', count: 2 }],
  nearbyAptSaleManwon: [90000, 130000, 175000],
};

describe('buildSchoolNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 intro+district+access+price 발화', () => {
    const n = buildSchoolNarrative(base)!;
    expect(n.sentences[0].startsWith('서울중앙중학교은') || n.sentences[0].startsWith('서울중앙중학교는')).toBe(true);
    expect(n.fired).toEqual(['intro', 'district', 'access', 'price']);
  });

  it('intro: 공립 + 남여공학 → "공립 남녀공학 중학교"(정규화)', () => {
    expect(buildSchoolNarrative(base)!.text).toContain('공립 남녀공학 중학교입니다');
  });

  it('intro: 사립 + 남 → "사립 남자고등학교"', () => {
    const n = buildSchoolNarrative({ ...base, schoolKind: '고등학교', foundType: '사립', coeduType: '남' })!;
    expect(n.text).toContain('사립 남자고등학교입니다');
  });

  it('intro: found 기타/null이면 접두 생략, 여 → "여자중학교"', () => {
    const n = buildSchoolNarrative({ ...base, foundType: '기타', coeduType: '여' })!;
    expect(n.text).toContain('여자중학교입니다');
    expect(n.text).not.toContain('기타');
  });

  it('intro: schoolKind 없고 foundType만 있으면 "공립 학교"', () => {
    const n = buildSchoolNarrative({ ...base, schoolKind: null, coeduType: null })!;
    expect(n.text).toContain('공립 학교입니다');
  });

  it('district: 고정 순서(초→중)로 정렬·나열', () => {
    // 입력은 중학교 먼저지만 출력은 초등학교 먼저
    expect(buildSchoolNarrative(base)!.text).toContain('도보권에 초등학교 2곳·중학교 1곳이 있어 학령기 학교가 가깝습니다');
  });

  it('district: count 0은 제외', () => {
    const n = buildSchoolNarrative({ ...base, nearbySchoolCounts: [{ kind: '초등학교', count: 2 }, { kind: '고등학교', count: 0 }] })!;
    expect(n.text).toContain('초등학교 2곳이 있어');
    expect(n.text).not.toContain('고등학교');
  });

  it('게이트: district 미발화(도보권 학교 없음)면 intro+access+price라도 null', () => {
    expect(buildSchoolNarrative({ ...base, nearbySchoolCounts: [] })).toBeNull();
  });

  it('게이트: district+intro만(access·price 없음)이면 minFired 3 미달 → null', () => {
    expect(
      buildSchoolNarrative({ ...base, nearestStation: null, infra: [], nearbyAptSaleManwon: [] }),
    ).toBeNull();
  });

  it('게이트: district+intro+access면 발화(3개)', () => {
    const n = buildSchoolNarrative({ ...base, nearbyAptSaleManwon: [] })!;
    expect(n.fired).toEqual(['intro', 'district', 'access']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run tests/lib/insights-school.test.ts`
Expected: FAIL — `Cannot find module '@/lib/insights/school'`.

- [ ] **Step 3: 모듈 구현**

Create `lib/insights/school.ts`:

```ts
import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface SchoolInsightInput {
  name: string;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  nearbySchoolCounts: { kind: string; count: number }[];
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

const FOUND_LABELS = ['공립', '국립', '사립'];
const KIND_ORDER = ['초등학교', '중학교', '고등학교', '특수학교'];

function intro(d: SchoolInsightInput): Insight | null {
  if (!d.schoolKind && !d.foundType) return null;
  const kind = d.schoolKind || '학교';
  let kindPhrase: string;
  if (d.coeduType === '남') kindPhrase = `남자${kind}`;
  else if (d.coeduType === '여') kindPhrase = `여자${kind}`;
  else if (d.coeduType === '남여공학') kindPhrase = `남녀공학 ${kind}`;
  else kindPhrase = kind;
  const foundPrefix = d.foundType && FOUND_LABELS.includes(d.foundType) ? `${d.foundType} ` : '';
  return { key: 'intro', text: `${foundPrefix}${kindPhrase}입니다.` };
}

function district(d: SchoolInsightInput): Insight | null {
  const counts = d.nearbySchoolCounts.filter((c) => c.count > 0);
  if (!counts.length) return null;
  const rank = (k: string) => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const sorted = [...counts].sort((a, b) => rank(a.kind) - rank(b.kind));
  const list = sorted.map((c) => `${c.kind} ${c.count}곳`).join('·');
  return { key: 'district', text: `도보권에 ${list}이 있어 학령기 학교가 가깝습니다.` };
}

export function buildSchoolNarrative(d: SchoolInsightInput): Narrative | null {
  // 자연 순서: 소개(급별·설립·성별) → 학군(도보권 학교 밀도) → 입지 → 시세.
  const mods = [
    intro(d),
    district(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['district'] });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run tests/lib/insights-school.test.ts`
Expected: PASS(10 tests).

- [ ] **Step 5: 커밋**

```bash
git add lib/insights/school.ts tests/lib/insights-school.test.ts
git commit -m "feat(insights): 학교 해석 프로즈 엔진(급별·설립·성별 intro + 학군 밀도 star)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

### Task 2: nearby-schools 집계 `getNearbySchoolCounts`

**Files:**
- Modify: `lib/amenity/nearby.ts` (신규 export 추가)

**Interfaces:**
- Consumes: 기존 파일의 `prisma`(이미 import됨), `getNearbyChildcare`의 `$queryRaw`+`ST_DWithin` 패턴.
- Produces: `interface NearbySchoolCount { kind: string; count: number }`, `getNearbySchoolCounts(lat: number, lng: number, excludeId: bigint, radiusMeters?: number): Promise<NearbySchoolCount[]>`.

- [ ] **Step 1: 인터페이스 + 함수 추가**

`lib/amenity/nearby.ts`에 아래를 추가(파일 끝, 다른 `getNearby*` 함수들 옆). `prisma`는 파일 상단에 이미 import되어 있으니 재import하지 않는다.

```ts
export interface NearbySchoolCount {
  kind: string;
  count: number;
}

// 반경 내 학교를 schoolKind별로 집계(자기 자신 제외). 학군 밀도 판단용.
export async function getNearbySchoolCounts(
  lat: number,
  lng: number,
  excludeId: bigint,
  radiusMeters = 1000,
): Promise<NearbySchoolCount[]> {
  const rows = await prisma.$queryRaw<{ kind: string; count: bigint }[]>`
    SELECT "schoolKind" AS kind, COUNT(*)::bigint AS count
    FROM "School"
    WHERE location IS NOT NULL
      AND "schoolKind" IS NOT NULL
      AND id <> ${excludeId}
      AND ST_DWithin(
        location::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    GROUP BY "schoolKind"
  `;
  return rows.map((r) => ({ kind: r.kind, count: Number(r.count) }));
}
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 통과.

- [ ] **Step 3: 운영 데이터로 스모크(집계 정상 여부)**

임시 스크립트로 실 좌표 1곳 집계 확인(읽기 전용). 프로젝트 루트에 작성 후 삭제:

```bash
cat > _tmp_smoke.ts <<'EOF'
import { prisma } from '@/lib/db';
import { getNearbySchoolCounts } from '@/lib/amenity/nearby';
async function main() {
  const s = await prisma.$queryRaw<{id:bigint;lat:number;lng:number}[]>`
    SELECT id, ST_Y(location::geometry) lat, ST_X(location::geometry) lng
    FROM "School" WHERE location IS NOT NULL LIMIT 1`;
  const r = await getNearbySchoolCounts(s[0].lat, s[0].lng, s[0].id);
  console.log('nearby school counts:', r);
  await prisma.$disconnect();
}
main();
EOF
pnpm dotenv -e .env.local -- tsx _tmp_smoke.ts 2>&1 | tail -3; rm -f _tmp_smoke.ts
```

Expected: `nearby school counts: [ { kind: '...', count: N }, ... ]` 형태 출력(에러 없음). count는 number.

- [ ] **Step 4: 커밋**

```bash
git add lib/amenity/nearby.ts
git commit -m "feat(nearby): 반경 내 학교 schoolKind별 집계 getNearbySchoolCounts(학군용)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

### Task 3: 로더 + 페이지 배선

**Files:**
- Create: `lib/insights/school-loader.ts`
- Modify: `app/(public)/school/[sigunguCode]/[id]/page.tsx`

**Interfaces:**
- Consumes:
  - Task 1 `buildSchoolNarrative(SchoolInsightInput)`.
  - Task 2 `getNearbySchoolCounts(lat, lng, excludeId, radius?)`.
  - `@/lib/school`: `getSchoolById(id) → Promise<School|null>`(Prisma 전체 스칼라: `schoolKind`·`foundType`·`coeduType`·`sigunguCode`·`name`·`address`·`tel` 등).
  - `@/lib/amenity/nearby`: `getNearbyApartments(lat,lng) → NearbyApartment[]`(`.saleLastPrice: number|null`), `getNearbyInfra(lat,lng) → {label,items[]}[]`.
  - `@/lib/subway/nearby`: `getNearbySubwayStations(lat,lng) → {stations:{name,lines,distanceMeters}[], fallback}`.
  - `@/lib/db`: `prisma`(학교 좌표 raw 쿼리).
  - `@/lib/seo/json-ld`: `placeSchema`(type 'School' 이미 지원), `breadcrumbSchema`, `provenanceNodes`, `JsonLd`.
  - `@/components/ui/insight-section`: `InsightSection`.
- Produces: `loadSchoolInsight(id) → Promise<{narrative:Narrative|null}>` + 캐시 래퍼 `cachedSchoolById`·`cachedSchoolLatLng`·`cachedNearbyAptsSchool`·`cachedNearbyInfraSchool`·`cachedNearbySubwaySchool`·`cachedNearbySchoolCounts`.

- [ ] **Step 1: 로더 작성**

Create `lib/insights/school-loader.ts`:

```ts
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getSchoolById } from '@/lib/school';
import { getNearbyApartments, getNearbyInfra, getNearbySchoolCounts } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildSchoolNarrative } from '@/lib/insights/school';
import type { Narrative } from '@/lib/insights/shared';

export const cachedSchoolById = cache(getSchoolById);

export const cachedSchoolLatLng = cache(async (id: bigint): Promise<{ lat: number; lng: number } | null> => {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "School" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
});

export const cachedNearbyAptsSchool = cache(getNearbyApartments);
export const cachedNearbyInfraSchool = cache(getNearbyInfra);
export const cachedNearbySubwaySchool = cache(getNearbySubwayStations);
export const cachedNearbySchoolCounts = cache((lat: number, lng: number, excludeId: bigint) =>
  getNearbySchoolCounts(lat, lng, excludeId),
);

export const loadSchoolInsight = cache(async (id: bigint): Promise<{ narrative: Narrative | null }> => {
  const school = await cachedSchoolById(id);
  if (!school) return { narrative: null };
  const coord = await cachedSchoolLatLng(id);
  const [apts, infra, subway, schoolCounts] = await Promise.all([
    coord ? cachedNearbyAptsSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
    coord ? cachedNearbyInfraSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? cachedNearbySubwaySchool(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    coord ? cachedNearbySchoolCounts(coord.lat, coord.lng, id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbySchoolCounts>>),
  ]);

  const narrative = buildSchoolNarrative({
    name: school.name,
    schoolKind: school.schoolKind,
    foundType: school.foundType,
    coeduType: school.coeduType,
    nearbySchoolCounts: schoolCounts,
    nearestStation: subway.stations[0]
      ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
      : null,
    infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
    nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
  });

  return { narrative };
});
```

- [ ] **Step 2: 로더 타입 확인**

Run: `pnpm tsc --noEmit`
Expected: 통과.

- [ ] **Step 3: 페이지 import 교체/추가**

`app/(public)/school/[sigunguCode]/[id]/page.tsx` 상단:
- `import { JsonLd, placeSchema, breadcrumbSchema } from '@/lib/seo/json-ld';` → `provenanceNodes` 추가:

```ts
import { JsonLd, placeSchema, breadcrumbSchema, provenanceNodes } from '@/lib/seo/json-ld';
import { InsightSection } from '@/components/ui/insight-section';
import {
  loadSchoolInsight,
  cachedSchoolById,
  cachedSchoolLatLng,
  cachedNearbyAptsSchool,
  cachedNearbyInfraSchool,
  cachedNearbySubwaySchool,
} from '@/lib/insights/school-loader';
```

- [ ] **Step 4: 페이지 내부 `getSchoolLatLng` 정의 제거**

기존 파일에 정의된 로컬 함수(아래)를 삭제한다(로더의 `cachedSchoolLatLng`로 대체):

```ts
async function getSchoolLatLng(id: bigint): Promise<{ lat: number; lng: number } | null> {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "School" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
}
```

제거 후 `prisma` import가 이 파일에서 더 이상 쓰이지 않으면 해당 import도 제거한다(사용처가 남아있으면 유지 — 제거 전 `prisma` 잔여 사용 grep 확인).

- [ ] **Step 5: generateMetadata에 robots·description 추가**

`generateMetadata` 내부에서 `getSchoolById` 호출을 `cachedSchoolById`로 바꾸고, insight 기반 robots·description을 추가한다. 기존:

```ts
  const school = await getSchoolById(BigInt(id)).catch(() => null);
  if (!school) return {};
  const tags = [school.foundType, school.coeduType].filter(Boolean).join('·');
  const tagPart = tags ? `(${tags})` : '';
  const regionPart = school.region ? `${school.region} ` : '';
  return {
    title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
    description: `${school.name}${tagPart} ${school.schoolKind ?? '학교'} 정보와 도보권 아파트 실거래가. ${regionPart}배정·통학 정보를 공공데이터로 확인하세요.`,
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
```

로 →

```ts
  const school = await cachedSchoolById(BigInt(id)).catch(() => null);
  if (!school) return {};
  const { narrative } = await loadSchoolInsight(BigInt(id));
  const indexable = !!narrative && narrative.fired.length >= 3;
  const tags = [school.foundType, school.coeduType].filter(Boolean).join('·');
  const tagPart = tags ? `(${tags})` : '';
  const regionPart = school.region ? `${school.region} ` : '';
  return {
    title: `${school.name} — ${school.schoolKind ?? '학교'} 정보·주변 아파트`,
    description: narrative?.text.slice(0, 150) ?? `${school.name}${tagPart} ${school.schoolKind ?? '학교'} 정보와 도보권 아파트 실거래가. ${regionPart}통학 정보를 공공데이터로 확인하세요.`,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/school/${sigunguCode}/${id}` },
  };
```

(폴백 description에서 "배정·"을 제거 — 과장 금지.)

- [ ] **Step 6: 본문 fetch를 캐시 래퍼로 교체 + narrative 로드**

`SchoolDetailPage` 본문에서:
- `getSchoolById(schoolId)` → `cachedSchoolById(schoolId)`
- `const coord = await getSchoolLatLng(schoolId);` → `const coord = await cachedSchoolLatLng(schoolId);`
- nearby `Promise.all`의 apts/infra/subway를 캐시 래퍼로:

기존:
```ts
  const [apts, infra, nearbyChildren, otherList, subway] = await Promise.all([
    coord ? getNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? getNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
    getSchoolList({ sigunguCode }, 1),
    coord
      ? getNearbySubwayStations(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);
```
→
```ts
  const [apts, infra, nearbyChildren, otherList, subway] = await Promise.all([
    coord ? cachedNearbyAptsSchool(coord.lat, coord.lng) : Promise.resolve([] as NearbyApartment[]),
    coord ? cachedNearbyInfraSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? getNearbyChildcare(coord.lat, coord.lng, 1000, 5) : Promise.resolve([]),
    getSchoolList({ sigunguCode }, 1),
    coord
      ? cachedNearbySubwaySchool(coord.lat, coord.lng)
      : Promise.resolve({ stations: [], fallback: false }),
  ]);

  const { narrative } = await loadSchoolInsight(schoolId);
```
(`getNearbyChildcare`·`getSchoolList`은 그대로 — 별도 표시 컴포넌트용. `getNearbyInfra`/`getNearbyApartments`/`getNearbySubwayStations` 직접 import가 이 교체로 미사용이 되면 제거.)

- [ ] **Step 7: JSON-LD에 id·provenance 추가**

`placeSchema` 호출에 `id`·`mainEntityOfPageId` 추가, 그리고 breadcrumb 뒤에 `provenanceNodes` 전개:

```tsx
          placeSchema({
            type: 'School',
            name: school.name,
            address: school.address,
            lat: coord?.lat,
            lng: coord?.lng,
            url: `${SITE_URL}/school/${sigunguCode}/${id}`,
            image: coord ? staticMapUrl(coord) : undefined,
            telephone: school.tel,
            id: `${SITE_URL}/school/${sigunguCode}/${id}#school`,
            mainEntityOfPageId: `${SITE_URL}/school/${sigunguCode}/${id}#webpage`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '생활편의', url: `${SITE_URL}/life` },
            { name: '학교찾기', url: `${SITE_URL}/school` },
            { name: school.name, url: `${SITE_URL}/school/${sigunguCode}/${id}` },
          ]),
          ...provenanceNodes({
            url: `${SITE_URL}/school/${sigunguCode}/${id}`,
            name: school.name,
            sourceId: 'neis',
            entityId: `${SITE_URL}/school/${sigunguCode}/${id}#school`,
          }),
```

- [ ] **Step 8: InsightSection 렌더 추가**

`<SchoolHero school={school} />` 바로 아래:

```tsx
      <SchoolHero school={school} />
      {narrative && <InsightSection sentences={narrative.sentences} />}
```

- [ ] **Step 9: 타입 + 인사이트 스위트 확인**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/lib/insights-school.test.ts tests/lib/insights-hospital.test.ts tests/lib/insights-park.test.ts`
Expected: tsc 통과, 학교·병원·공원 스위트 PASS(회귀 없음).

- [ ] **Step 10: 프로덕션 빌드로 라우트 컴파일 확인**

Run: `pnpm build 2>&1 | tail -20`
Expected: 빌드 성공. `school/[sigunguCode]/[id]` 라우트 에러 없음.

- [ ] **Step 11: 커밋**

```bash
git add lib/insights/school-loader.ts "app/(public)/school/[sigunguCode]/[id]/page.tsx"
git commit -m "feat(school): 한눈에 보기+출처 JSON-LD+조건부 noindex 배선(캐시 로더, 학군 게이트)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NZePMDVHkNVrrqyBUhqRjr"
```

---

## 자체 검토 결과 (writing-plans self-review)

**1. 스펙 커버리지:**
- §4 nearby-schools 집계 → Task 2.
- §5 엔티티 모듈(intro 규칙·district 규칙·게이트 minFired3/requireKeys district) → Task 1.
- §6 출처(placeSchema School id·provenanceNodes neis·dateModified 생략) → Task 3 Step 7.
- §7 로더·페이지 배선(캐시 dedup·robots·description·InsightSection) → Task 3.
- §8 테스트(유닛·회귀·빌드) → Task 1 Step 4, Task 3 Step 9·10.
- 갭 없음.

**2. Placeholder 스캔:** 없음. 모든 코드 스텝에 완전한 코드 포함. Task 2 Step 3 스모크 스크립트는 삭제까지 포함한 실제 명령.

**3. 타입 일관성:** `SchoolInsightInput`(Task 1) ↔ Task 3 로더의 `buildSchoolNarrative` 호출 인자 필드/nullability 일치. `NearbySchoolCount{kind,count}`(Task 2) ↔ 로더 `schoolCounts` ↔ `nearbySchoolCounts:{kind,count}[]`(Task 1 입력) 일치. `cachedNearbySchoolCounts(lat,lng,excludeId)` 3인자 ↔ 호출 `(coord.lat, coord.lng, id)` 일치. `loadSchoolInsight → {narrative}` ↔ 페이지 소비 일치. `getSchoolLatLng` 로컬 정의 제거(Task 3 Step 4) ↔ `cachedSchoolLatLng` 대체 일치.
