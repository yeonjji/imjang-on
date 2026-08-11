# 가이드 데이터 블록 G-4 구현 계획 — 나머지 편 확대

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans.

**Goal:** 표식이 없는 21편 중 우리 데이터로 뒷받침되는 6편에 블록을 붙여 커버리지를 7/28 → 13/28로 올린다.

**Architecture:** 전부 **가벼운 블록**이다 — 렌더 시 직접 조회. 스냅샷·ETL 훅이 필요 없다.
G-1의 `lib/guide/blocks/*.ts` 경로를 그대로 확장한다. 최악이 `HospitalDept` 435,588행 집계인데
실측 109ms라 `revalidate=86_400`인 가이드에서 문제가 없다.

**Tech Stack:** Prisma(`groupBy` 또는 `$queryRaw`), Next.js server component.

## Global Constraints

- 블록키는 `lib/guide/data-blocks.ts`에 추가한다. `Record<GuideDataBlockKey, ...>` 매핑이라 컴포넌트를 빠뜨리면 컴파일이 깨진다.
- 모든 블록에 **데이터 기준일 + 출처 캡션**. 레지스트리 블록은 `_max: { updatedAt: true }`를 쓴다.
- 표본이 없으면 `null` 반환 → 그 자리만 비고 본문은 그대로 읽힌다.
- **지역명을 화면에 노출하는 블록을 만들지 않는다.** `Childcare`·`Region`의 2026-07-01 개편 미반영 문제(`서구(구)`)가 아직 살아 있다. 6종 모두 지역 라벨을 쓰지 않는다.
- 인과를 단정하지 않는다. 수치와 집계 기준만 쓴다.
- `pnpm lint` → `typecheck` → `test:unit` → `build` → e2e 순으로 검증.

## 스펙 §4.3을 뒤집는 근거

`docs/superpowers/specs/2026-08-10-guide-data-blocks-design.md` §4.3은 "대상에서 뺀 20편 —
우리 데이터로 뒷받침되지 않는 편"이라고 했다. **실측 결과 그 판단이 과소평가였다.**

| 가이드 | 데이터 | 실측 보유량 | 집계 시간 |
|---|---|---|---|
| `school-highschool-types` | `School.schoolKind/foundType/coeduType` | 고등학교 2,454곳, 두 컬럼 100% | 7.5ms |
| `medical-find-hospital-by-specialty` | `HospitalDept.deptName/specialistCount` | 435,588행 / 47개 과목 | 109ms |
| `medical-public-health-center` | `Hospital.typeName LIKE '보건%'` | 3,450곳 4종 | 74ms |
| `subscription-special-supply-types` | `SubscriptionUnit.rawJson` 특공 유형 | 최근 12개월 85,068세대 | — |
| `finance-policy-housing-loans` | `LoanProduct` 주거 용도 | 44개 상품 | 3ms |
| `life-infra-checklist` | 전 카테고리 시설 수 | 9종 합계 약 282,000곳 | 각 7ms |

## 하지 않는 것 (근거 포함)

1. **`finance-jeonse-guarantee-limit`은 뺀다.** 그 가이드는 HUG **전세보증금 반환보증**을 다루는데
   우리 `JeonseGuaranteeProduct`는 HF **전세자금보증** 추천 상품이다. 이름이 비슷할 뿐 다른 상품이라,
   붙이면 독자가 두 제도를 혼동한다. 47개 상품 데이터는 `/jeonse-guarantee` 기능 페이지에 이미 쓰인다.
2. **스크린샷은 넣지 않는다.** 인터넷등기소·청약홈은 로그인·인증이 필요해 실제 화면을 취득할 수 없다.
   비슷하게 그려 "실제 화면"으로 붙이는 것은 이용자를 속이는 것이다. 사람이 직접 캡처해 주면 그때 넣는다.
3. **약국·공시가격·학구·돌봄·치안·유치원 편은 대상이 아니다.** `Pharmacy`는 25,760곳을 보유하지만
   **운영시간 컬럼이 없어** 야간·공휴일 편을 뒷받침하지 못한다. 나머지는 데이터 자체가 없다.
4. **차트(SVG) 전환은 이 계획에 넣지 않는다.** 표 6종을 먼저 붙이고, 시각화는 별도로 판단한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/guide/blocks/school-highschool-types.ts` (신규) | 고등학교 설립·성별 유형 |
| `lib/guide/blocks/hospital-by-dept.ts` (신규) | 진료과목별 기관 수·전문의 수 |
| `lib/guide/blocks/public-health-centers.ts` (신규) | 보건기관 종별 |
| `lib/guide/blocks/special-supply-mix.ts` (신규) | 특별공급 유형별 배분 |
| `lib/guide/blocks/housing-loan-products.ts` (신규) | 주거 용도 정책대출 상품 |
| `lib/guide/blocks/infra-inventory.ts` (신규) | 카테고리별 시설 수 |
| `lib/guide/data-blocks.ts` (수정) | 키 6종 추가 |
| `app/(public)/guide/[slug]/_components/data-block.tsx` (수정) | 컴포넌트 6종 + 매핑 |
| `lib/guide/insert-blocks.ts` (수정) | placement 6건 추가 |
| `tests/lib/guide-g4-blocks.test.ts` (신규) | 계약 테스트 |

---

## Task 1: 집계 6종

**Files:** 위 6개 신규 파일 · Test: `tests/lib/guide-g4-blocks.test.ts`

**Interfaces:** 각각 `Promise<{ rows: ..., asOf: Date | string | null }>`. G-1의 `blocks/shared.ts`의
`latestUpdatedAt`을 재사용한다.

- [ ] **Step 1: school-highschool-types**

```ts
import { prisma } from '@/lib/db';
import { latestUpdatedAt } from './shared';

export interface SchoolTypeRow { foundType: string; coeduType: string; count: number }
export interface SchoolHighschoolTypesResult { rows: SchoolTypeRow[]; asOf: Date | null }

/** 고등학교를 설립유형 × 남녀공학 구분으로 집계. 실측 2,454곳 9조합, 7.5ms. */
export async function getSchoolHighschoolTypes(): Promise<SchoolHighschoolTypesResult> {
  const rows = await prisma.school.groupBy({
    by: ['foundType', 'coeduType'],
    where: { schoolKind: '고등학교', foundType: { not: null }, coeduType: { not: null } },
    _count: { _all: true },
    _max: { updatedAt: true },
    orderBy: { _count: { id: 'desc' } },
  });
  return {
    rows: rows.map((r) => ({
      foundType: r.foundType ?? '-',
      coeduType: r.coeduType ?? '-',
      count: r._count._all,
    })),
    asOf: latestUpdatedAt(rows.map((r) => r._max.updatedAt)),
  };
}
```

기대값: 공립·남여공학 1,128 / 사립·남여공학 462 / 사립·여 253 / 사립·남 230 / 공립·남 160 /
공립·여 148 / 국립·남여공학 19 / 기타·남여공학 3 / 국립·남 1.
**라벨은 원본 그대로 `남여공학`을 쓴다**(교육부 표기). 임의로 `남녀공학`으로 고치지 않는다.

- [ ] **Step 2: hospital-by-dept**

```ts
export interface HospitalDeptRow { deptName: string; facilities: number; specialists: number }
export interface HospitalByDeptResult { rows: HospitalDeptRow[]; asOf: Date | null }

/** 진료과목별 개설 기관 수와 전문의 합계 상위 12개. 435,588행 집계, 실측 109ms. */
export async function getHospitalByDept(): Promise<HospitalByDeptResult> {
  const rows = await prisma.hospitalDept.groupBy({
    by: ['deptName'],
    _count: { _all: true },
    _sum: { specialistCount: true },
    orderBy: { _sum: { specialistCount: 'desc' } },
    take: 12,
  });
  return {
    rows: rows.map((r) => ({
      deptName: r.deptName,
      facilities: r._count._all,
      specialists: r._sum.specialistCount ?? 0,
    })),
    asOf: await deptAsOf(),
  };
}

/** HospitalDept에는 updatedAt이 없다. 부모 Hospital의 최신 갱신일을 쓴다. */
async function deptAsOf(): Promise<Date | null> {
  const r = await prisma.hospital.aggregate({ _max: { updatedAt: true } });
  return r._max.updatedAt ?? null;
}
```

기대값: 내과 23,827기관/18,655명 · 정형외과 12,695/7,297 · 외과 9,284/6,147 ·
소아청소년과 15,489/5,899 · 가정의학과 10,825/5,884 · 산부인과 4,315/5,302 …

> `HospitalDept`에 `updatedAt`이 있는지 구현 시 스키마로 확인한다. 있으면 `_max`로 바꾸고
> `deptAsOf`를 지운다.

- [ ] **Step 3: public-health-centers**

```ts
export interface PublicHealthRow { typeName: string; count: number; sidoCount: number }
export interface PublicHealthResult { rows: PublicHealthRow[]; asOf: Date | null }

/** 보건소·보건지소·보건진료소·보건의료원 수와 분포 시도 수. 실측 3,450곳, 74ms. */
export async function getPublicHealthCenters(): Promise<PublicHealthResult> {
  const rows = await prisma.$queryRaw<Array<{ type_name: string; n: bigint; sido_count: bigint }>>`
    SELECT "typeName" AS type_name, COUNT(*) AS n, COUNT(DISTINCT sido) AS sido_count
    FROM "Hospital" WHERE "typeName" LIKE '보건%'
    GROUP BY "typeName" ORDER BY COUNT(*) DESC
  `;
  const agg = await prisma.hospital.aggregate({ _max: { updatedAt: true } });
  return {
    rows: rows.map((r) => ({
      typeName: r.type_name, count: Number(r.n), sidoCount: Number(r.sido_count),
    })),
    asOf: agg._max.updatedAt ?? null,
  };
}
```

기대값: 보건진료소 1,898(15개 시도) / 보건지소 1,288(16) / 보건소 248(16) / 보건의료원 16(8).

- [ ] **Step 4: special-supply-mix**

```ts
export interface SpecialSupplyRow { label: string; households: number }
export interface SpecialSupplyMixResult {
  rows: SpecialSupplyRow[];
  specialTotal: number;
  generalTotal: number;
  asOf: string | null; // 집계 대상의 최신 접수 시작일
}

/**
 * 최근 12개월 접수 공고의 특별공급 유형별 세대 수. 유형은 청약홈 원본 JSON 키에 들어 있다.
 * 계 대비 합계가 모자라는 몫은 '이전기관종사자 등'으로 묶는다 — 실측에서 4,035세대 차이가 났다.
 */
export async function getSpecialSupplyMix(): Promise<SpecialSupplyMixResult> {
  const rows = await prisma.$queryRaw<Array<{
    다자녀: bigint; 신혼부부: bigint; 생애최초: bigint; 노부모: bigint;
    청년: bigint; 신생아: bigint; 기관추천: bigint; 기타: bigint;
    특공계: bigint; 일반계: bigint; as_of: Date | null;
  }>>`
    SELECT
      SUM((su."rawJson"::jsonb->>'MNYCH_HSHLDCO')::int)              AS "다자녀",
      SUM((su."rawJson"::jsonb->>'NWWDS_HSHLDCO')::int)              AS "신혼부부",
      SUM((su."rawJson"::jsonb->>'LFE_FRST_HSHLDCO')::int)           AS "생애최초",
      SUM((su."rawJson"::jsonb->>'OLD_PARNTS_SUPORT_HSHLDCO')::int)  AS "노부모",
      SUM((su."rawJson"::jsonb->>'YGMN_HSHLDCO')::int)               AS "청년",
      SUM((su."rawJson"::jsonb->>'NWBB_HSHLDCO')::int)               AS "신생아",
      SUM((su."rawJson"::jsonb->>'INSTT_RECOMEND_HSHLDCO')::int)     AS "기관추천",
      SUM((su."rawJson"::jsonb->>'ETC_HSHLDCO')::int)                AS "기타",
      SUM(su."specialSupply")                                        AS "특공계",
      SUM(su."generalSupply")                                        AS "일반계",
      MAX(n."receiptBegin")                                          AS as_of
    FROM "SubscriptionUnit" su
    JOIN "SubscriptionNotice" n ON n.id = su."noticeId"
    WHERE n."receiptBegin" >= (CURRENT_DATE - INTERVAL '12 months')
      AND su."specialSupply" IS NOT NULL
  `;
  const r = rows[0];
  if (!r || !r.특공계) return { rows: [], specialTotal: 0, generalTotal: 0, asOf: null };

  const named: SpecialSupplyRow[] = [
    { label: '신혼부부', households: Number(r.신혼부부 ?? 0) },
    { label: '다자녀가구', households: Number(r.다자녀 ?? 0) },
    { label: '생애최초', households: Number(r.생애최초 ?? 0) },
    { label: '기관추천', households: Number(r.기관추천 ?? 0) },
    { label: '노부모부양', households: Number(r.노부모 ?? 0) },
    { label: '신생아', households: Number(r.신생아 ?? 0) },
    { label: '청년', households: Number(r.청년 ?? 0) },
    { label: '기타', households: Number(r.기타 ?? 0) },
  ].filter((x) => x.households > 0).sort((a, b) => b.households - a.households);

  const specialTotal = Number(r.특공계);
  const rest = specialTotal - named.reduce((s, x) => s + x.households, 0);
  if (rest > 0) named.push({ label: '이전기관종사자 등', households: rest });

  return {
    rows: named,
    specialTotal,
    generalTotal: Number(r.일반계 ?? 0),
    asOf: r.as_of ? r.as_of.toISOString().slice(0, 10) : null,
  };
}
```

기대값(최근 12개월): 신혼부부 27,093 · 다자녀 15,622 · 생애최초 15,356 · 기관추천 13,382 ·
노부모부양 4,705 · 신생아 4,090 · 기타 627 · 청년 158 · 이전기관종사자 등 4,035.
특공계 85,068 / 일반 106,422 → 특공이 전체 191,490세대의 44.4%.

- [ ] **Step 5: housing-loan-products**

```ts
export interface HousingLoanRow { instCtg: string; products: number; avgLimitManwon: number | null; maxLimitManwon: number | null }
export interface HousingLoanProductsResult { rows: HousingLoanRow[]; total: number; asOf: Date | null }

/** 자금 용도에 '주거'가 붙은 정책·공공 대출상품을 제공기관 구분별로. 실측 44개, 3ms. */
export async function getHousingLoanProducts(): Promise<HousingLoanProductsResult> {
  const rows = await prisma.$queryRaw<Array<{
    inst_ctg: string | null; n: bigint; avg_limit: number | null; max_limit: number | null; as_of: Date | null;
  }>>`
    SELECT "instCtg" AS inst_ctg, COUNT(*) AS n,
           ROUND(AVG(lnlmt))::int AS avg_limit, MAX(lnlmt) AS max_limit, MAX("updatedAt") AS as_of
    FROM "LoanProduct" WHERE '주거' = ANY("usageTags")
    GROUP BY "instCtg" ORDER BY COUNT(*) DESC
  `;
  return {
    rows: rows.map((r) => ({
      instCtg: r.inst_ctg ?? '기타',
      products: Number(r.n),
      avgLimitManwon: r.avg_limit,
      maxLimitManwon: r.max_limit,
    })),
    total: rows.reduce((s, r) => s + Number(r.n), 0),
    asOf: rows.reduce<Date | null>((a, r) => (r.as_of && (!a || r.as_of > a) ? r.as_of : a), null),
  };
}
```

기대값: 공공기관 28개(평균 2.19억·최대 5억) / 지자체 6 / 기금 4 / 시중은행 4 / 상호금융 1 / 준정부기관 1.
실제 상품에 보금자리론·디딤돌대출·버팀목·신혼희망타운 전용 대출이 들어 있어 "정책 주택자금"이라는 제목과 맞는다.

- [ ] **Step 6: infra-inventory**

```ts
export interface InfraInventoryRow { label: string; count: number }
export interface InfraInventoryResult { rows: InfraInventoryRow[]; total: number }

/** 임장ON이 보유한 생활 인프라 시설 수. 각 테이블 COUNT(*) 실측 7ms(대상 테이블이 10만 행 이하). */
export async function getInfraInventory(): Promise<InfraInventoryResult> {
  const [hospital, pharmacy, school, childcare, park, parking, market, subway, charger] =
    await Promise.all([
      prisma.hospital.count(), prisma.pharmacy.count(), prisma.school.count(),
      prisma.childcare.count(), prisma.park.count(), prisma.parking.count(),
      prisma.traditionalMarket.count(), prisma.subwayStation.count(), prisma.evCharger.count(),
    ]);
  const rows: InfraInventoryRow[] = [
    { label: '전기차 충전소', count: charger }, { label: '병원·의원', count: hospital },
    { label: '약국', count: pharmacy }, { label: '어린이집', count: childcare },
    { label: '주차장', count: parking }, { label: '공원', count: park },
    { label: '학교', count: school }, { label: '전통시장', count: market },
    { label: '지하철역', count: subway },
  ].sort((a, b) => b.count - a.count);
  return { rows, total: rows.reduce((s, r) => s + r.count, 0) };
}
```

기대값: 충전소 101,703 · 병원 79,772 · 약국 25,760 · 어린이집 25,151 · 주차장 17,747 ·
공원 17,137 · 학교 12,566 · 전통시장 1,393 · 지하철역 1,005. 합계 282,234.
**기준일을 달지 않는다** — 소스마다 갱신일이 달라 하나로 묶으면 거짓이 된다. 대신 출처 캡션에 소스 9종을 전부 단다.

- [ ] **Step 7: 계약 테스트 후 커밋**

```ts
it('빈 데이터에서도 던지지 않는다', async () => {
  await expect(getSchoolHighschoolTypes()).resolves.toMatchObject({ rows: expect.any(Array) });
  await expect(getHospitalByDept()).resolves.toMatchObject({ rows: expect.any(Array) });
  await expect(getPublicHealthCenters()).resolves.toMatchObject({ rows: expect.any(Array) });
  await expect(getSpecialSupplyMix()).resolves.toMatchObject({ rows: expect.any(Array) });
  await expect(getHousingLoanProducts()).resolves.toMatchObject({ rows: expect.any(Array) });
  await expect(getInfraInventory()).resolves.toMatchObject({ rows: expect.any(Array) });
});
it('시설 목록 합계가 각 항목의 합과 같다', async () => {
  const r = await getInfraInventory();
  expect(r.total).toBe(r.rows.reduce((s, x) => s + x.count, 0));
});
```

---

## Task 2: 블록키·컴포넌트 6종

**Files:** `lib/guide/data-blocks.ts`, `app/(public)/guide/[slug]/_components/data-block.tsx`

- [ ] **Step 1: 키 6종 추가** — `school-highschool-types`, `hospital-by-dept`, `public-health-centers`,
      `special-supply-mix`, `housing-loan-products`, `infra-inventory`

- [ ] **Step 2: 컴포넌트 6종** — 기존 `BlockShell`을 그대로 쓴다. 출처 id는
      `neis`(학교) · `hira`(병원·보건기관) · `applyhome`(특별공급) · `kinfa-loan`(대출) ·
      인프라는 `['kepco-ev','hira','childcare','mois-parking','mois-park','neis','mois-market','subway']`.

note 문구에 반드시 넣을 것:
- `hospital-by-dept` — "한 기관이 여러 과목을 개설하므로 기관 수 합계는 전체 기관 수보다 큽니다."
- `special-supply-mix` — "최근 12개월 접수 공고 기준. 특별공급이 전체 공급의 44%입니다." (수치는 계산값)
- `housing-loan-products` — "자금 용도에 '주거'가 표시된 상품만 셌습니다. 한도는 상품 상한이며 실제 한도는 심사로 정해집니다."
- `infra-inventory` — "임장ON이 수집해 보관 중인 시설 수입니다. 소스마다 갱신 주기가 달라 기준일은 각 시설 페이지에서 확인할 수 있습니다."

- [ ] **Step 3: `pnpm lint` → `typecheck` → `test:unit` → `build` 후 커밋**

---

## Task 3: 표식 삽입

**Files:** `lib/guide/insert-blocks.ts` · 운영 반영

앵커는 운영 본문에서 확인한 값이다(2026-08-11).

- [ ] **Step 1: placement 6건 추가**

```ts
  { dedupeKey: 'school-highschool-types', blockKey: 'school-highschool-types',
    anchorHeading: '## 고등학교 유형, 어떻게 다를까요?' },
  { dedupeKey: 'medical-find-hospital-by-specialty', blockKey: 'hospital-by-dept',
    anchorHeading: '## 병원·진료과목 찾는 단계별 방법' },
  { dedupeKey: 'medical-public-health-center', blockKey: 'public-health-centers',
    anchorHeading: '## 보건소·보건지소란?' },
  { dedupeKey: 'subscription-special-supply-types', blockKey: 'special-supply-mix',
    anchorHeading: '## 특별공급이란? 주요 유형과 대상' },
  { dedupeKey: 'finance-policy-housing-loans', blockKey: 'housing-loan-products',
    anchorHeading: '## 주요 상품별 자격과 이용 구조' },
  { dedupeKey: 'life-infra-checklist', blockKey: 'infra-inventory',
    anchorHeading: '## 생활 인프라란 무엇일까?' },
```

- [ ] **Step 2: 배포 후 dry-run 검토 → `--apply` → 퍼센트 인코딩 경로로 재검증 → 렌더 확인**

---

## Self-Review

**스펙 커버리지:** 이 계획은 원 스펙 §4.3을 실측으로 뒤집는다. 근거를 표로 남겼다.
`finance-jeonse-guarantee-limit`을 뺀 이유(반환보증 vs 자금보증)도 적었다.

**플레이스홀더:** 없음. 6종 모두 운영 DB에서 실행해 결과·소요 시간을 확인했다.
단 하나 미확인은 `HospitalDept.updatedAt` 존재 여부이고, Step 2에 확인 절차를 적었다.

**타입 일관성:** 6개 키가 `GUIDE_DATA_BLOCK_KEYS`와 `GUIDE_DATA_BLOCK_COMPONENTS`에 동시에 들어가야
컴파일된다. `insert-blocks.ts`의 `blockKey`는 `GuideDataBlockKey` 타입이라 오타가 컴파일에서 걸린다.

**미확인:** 특별공급 유형 키 9개가 청약홈 원본에서 항상 채워지는지. 실측 2,981행에서는 채워졌지만
공고 유형에 따라 빠질 수 있어, 합계와의 차이를 '이전기관종사자 등'으로 흡수하도록 설계했다.
그 몫이 음수가 되면 표에 넣지 않는다.
