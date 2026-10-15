# 아파트 상세 관리비 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** K-apt 관리비 API 3종(31개 오퍼레이션)을 온박스 ETL로 수집해 DB에 저장하고, 아파트 상세 페이지 `ComplexInfoSection` 아래에 "관리비" 섹션을 렌더한다.

**Architecture:** ETL(`scripts/ingest/apt-maintenance-cost/`)이 단지 × 연월 한 행(`AptMaintenanceCost`)을 저장하고, 시군구 × 월 공용관리비 ㎡당 중앙값(`AptMaintenanceCostStat`)을 계산해 둔다. 화면은 DB만 읽는다. 순수 함수 `buildMaintenanceView`가 행 → 표시 모델을 만들고, 서버 컴포넌트 `MaintenanceCostSection`이 그린다.

**Tech Stack:** Next.js App Router(서버 컴포넌트, ISR), Prisma + PostgreSQL, Vitest(유닛·통합·SSR), Playwright(e2e), tsx 스크립트, 온박스 systemd 타이머

**Spec:** `docs/superpowers/specs/2026-10-15-apt-maintenance-cost-design.md` (상위: `2026-10-15-detail-public-data-section-plan.md` 1단계). UI 확정본: https://claude.ai/artifact/RAyfGp18iJhwWo5ppo24nr

## Global Constraints

- 작업 브랜치: `feat/apt-maintenance-cost` (main에서 분기). main 직접 커밋 금지. 머지 = 운영 배포이므로 모든 확인 + 사용자 승인 후에만 머지.
- 화면은 DB만 읽는다. 페이지 렌더 중 외부 API 호출 금지.
- 개별사용료 오퍼레이션명은 `...InfoV3`다(Swagger 명세의 `V2`는 `NO_OPENAPI_SERVICE_ERROR`).
- 수집 동시성 기본 3. 오퍼레이션은 단지 안에서 순차 호출(동시 6에서 429 실측).
- 한도 초과(`LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS`)를 만나면 즉시 전체 중단, 다음 실행이 이어 받는다.
- 단지 간 비교는 **공용관리비 ㎡당만**. 개별사용료는 비교하지 않는다. 구 비교는 표본 5개 이상일 때만, ±5% 안이면 "비슷함".
- 장기수선충당금은 숫자만. 평가 문구 금지. 적립요율은 0보다 클 때만 표시(월부과액이 있어도 0으로 오는 미기재가 흔함).
- 빈 값은 표시하지 않는다. 0원 항목은 항목 줄에서 숨긴다.
- 자체 계산값은 "임장ON 계산"과 계산식을 함께 표시한다. 출처 줄: "국토교통부 공동주택관리정보시스템(K-apt) · 단지 관리주체 공개 자료 · {YYYY년 M월} 부과분 · {조회일} 조회".
- 세대당 금액은 단지 부과액 ÷ 세대수 평균이므로 "실제 세대별 고지액과 다릅니다"를 표시한다.
- 데이터가 없으면 섹션 전체를 렌더하지 않는다(`null`).
- 완료 전 `pnpm lint` 필수(ESLint no-unused-vars=error, typecheck는 못 잡음). UI 문구가 바뀌므로 e2e도 돌린다.
- 마이그레이션 폴더만 좁게 `git add`. `prisma migrate dev`는 쓰지 않는다(잔여 마이그레이션을 쓸어담는 사고 이력).

## Review Focus

1. **관리면적 없음**: `AptComplex.rawJson.kaptMarea`가 없거나 0·문자열이면 ㎡당·구 비교·추이를 숨기고 세대당 값만 보여야 한다 (Task 4 테스트).
2. **세대수 없음**: `households`가 null이면 금액을 단지 전체 기준으로 표시하고 "단지 전체" 단위 표기를 해야 한다. 0으로 나누면 안 된다 (Task 4 테스트).
3. **불완전 행**: 수집 도중 오퍼레이션 하나라도 실패한 행(`complete=false`)은 화면에 쓰지 않고 다음 실행에서 다시 받아야 한다 (Task 3·5 테스트).
4. **0이 섞인 응답**: 개별난방 단지(난방 0), 한전 직접 계약(전기 0), 적립요율 0. 0인 항목은 숨기고, 겨울·여름 비교는 지역·중앙난방에서만 보여야 한다 (Task 4 테스트).
5. **값 타입 혼합**: 같은 응답 안에 int·"0"·float·null·"1,234"가 섞여도 합계가 맞아야 한다 (Task 2 테스트).

---

## File Structure

| 파일 | 책임 |
|---|---|
| Create `prisma/migrations/20261015000000_add_apt_maintenance_cost/migration.sql` | 테이블 2개 |
| Modify `prisma/schema.prisma` | 모델 2개 추가 |
| Create `scripts/ingest/apt-maintenance-cost/ops.ts` | 31개 오퍼레이션 정의와 묶음 |
| Create `scripts/ingest/apt-maintenance-cost/adapter.ts` | 응답 정규화·월 요약(순수) |
| Create `scripts/ingest/apt-maintenance-cost/http.ts` | 오퍼레이션 1회 호출 |
| Modify `scripts/ingest/apt-complex/http.ts` | `getJson` export (재사용) |
| Create `scripts/ingest/apt-maintenance-cost/runner.ts` | 월 결정·수집·통계·CLI |
| Create `lib/insights/maintenance-cost.ts` | 표시 모델(순수)·포맷터 |
| Create `lib/maintenance-cost-query.ts` | DB → 표시 모델 |
| Create `app/(public)/apt/[id]/_components/maintenance-cost-section.tsx` | 섹션 UI |
| Modify `app/(public)/apt/[id]/page.tsx` | 섹션 배치 |
| Modify `app/(public)/apt/[id]/_components/detail-sidebar.tsx` | 바로가기 항목 |
| Modify `lib/data-sources.ts` | 출처 `kapt-maintenance-cost` |
| Modify `package.json`, `deploy/run-etl.sh`, `deploy/systemd/install-timers.sh` | 실행 배선 |
| Modify `tests/_helpers/seed-e2e.ts`, `tests/e2e/apt-detail.spec.ts` | e2e |

---

### Task 0: 브랜치

- [ ] **Step 1: main 최신화 후 브랜치 생성**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/apt-maintenance-cost
```

---

### Task 1: 스키마와 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (AptComplex 모델 뒤, `enum DealType` 앞)
- Create: `prisma/migrations/20261015000000_add_apt_maintenance_cost/migration.sql`

**Interfaces:**
- Produces: Prisma 모델 `aptMaintenanceCost`(복합키 `kaptCode_yearMonth`), `aptMaintenanceCostStat`(복합키 `sigunguCode_yearMonth`)

- [ ] **Step 1: schema.prisma에 모델 추가**

```prisma
/// K-apt 관리비. 단지 × 부과연월 한 행. 금액 단위는 원(단지 월 총액).
/// 화면은 complete=true 행만 쓴다. 수집 도중 오퍼레이션이 하나라도 실패하면 false로 남고 다음 실행이 다시 받는다.
model AptMaintenanceCost {
  kaptCode  String @db.VarChar(20)
  yearMonth String @db.Char(6)

  labor         BigInt?
  cleaning      BigInt?
  guard         BigInt?
  disinfection  BigInt?
  elevator      BigInt?
  homeNetwork   BigInt?
  consignFee    BigInt?
  repairs       BigInt?
  commonEtc     BigInt?
  commonTotal   BigInt?

  heat          BigInt?
  hotWater      BigInt?
  gas           BigInt?
  electricity   BigInt?
  water         BigInt?
  individualEtc BigInt?

  ltrLevy    BigInt?
  ltrUse     BigInt?
  ltrBalance BigInt?
  ltrRate    Decimal? @db.Decimal(6, 2)

  complete  Boolean
  raw       Json
  fetchedAt DateTime

  @@id([kaptCode, yearMonth])
  @@index([yearMonth])
}

/// 시군구 × 월 공용관리비 ㎡당 중앙값. ETL이 계산해 저장한다(표본 5개 이상만).
model AptMaintenanceCostStat {
  sigunguCode       String   @db.VarChar(5)
  yearMonth         String   @db.Char(6)
  medianCommonPerM2 Int
  sampleCount       Int
  computedAt        DateTime

  @@id([sigunguCode, yearMonth])
}
```

- [ ] **Step 2: migration.sql 작성**

```sql
-- CreateTable
CREATE TABLE "AptMaintenanceCost" (
    "kaptCode" VARCHAR(20) NOT NULL,
    "yearMonth" CHAR(6) NOT NULL,
    "labor" BIGINT,
    "cleaning" BIGINT,
    "guard" BIGINT,
    "disinfection" BIGINT,
    "elevator" BIGINT,
    "homeNetwork" BIGINT,
    "consignFee" BIGINT,
    "repairs" BIGINT,
    "commonEtc" BIGINT,
    "commonTotal" BIGINT,
    "heat" BIGINT,
    "hotWater" BIGINT,
    "gas" BIGINT,
    "electricity" BIGINT,
    "water" BIGINT,
    "individualEtc" BIGINT,
    "ltrLevy" BIGINT,
    "ltrUse" BIGINT,
    "ltrBalance" BIGINT,
    "ltrRate" DECIMAL(6,2),
    "complete" BOOLEAN NOT NULL,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptMaintenanceCost_pkey" PRIMARY KEY ("kaptCode","yearMonth")
);

-- CreateTable
CREATE TABLE "AptMaintenanceCostStat" (
    "sigunguCode" VARCHAR(5) NOT NULL,
    "yearMonth" CHAR(6) NOT NULL,
    "medianCommonPerM2" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AptMaintenanceCostStat_pkey" PRIMARY KEY ("sigunguCode","yearMonth")
);

-- CreateIndex
CREATE INDEX "AptMaintenanceCost_yearMonth_idx" ON "AptMaintenanceCost"("yearMonth");
```

- [ ] **Step 3: 테스트 DB에 적용하고 스키마와 어긋남이 없는지 확인**

Run:
```bash
pnpm test:db:migrate
pnpm exec dotenv -e .env.test -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
pnpm prisma generate
```
Expected: migrate가 `20261015000000_add_apt_maintenance_cost` 적용. diff는 "No difference detected", exit 0.

- [ ] **Step 4: 커밋 (새 마이그레이션 폴더만)**

```bash
git add prisma/schema.prisma prisma/migrations/20261015000000_add_apt_maintenance_cost
git status --short   # 다른 마이그레이션 폴더가 스테이징되지 않았는지 확인
git commit -m "feat(db): 관리비 테이블 AptMaintenanceCost·AptMaintenanceCostStat 추가"
```

---

### Task 2: 오퍼레이션 정의와 응답 요약 (순수)

**Files:**
- Create: `scripts/ingest/apt-maintenance-cost/ops.ts`
- Create: `scripts/ingest/apt-maintenance-cost/adapter.ts`
- Test: `tests/ingest/apt-maintenance-cost/adapter.test.ts`

**Interfaces:**
- Produces:
  - `ops.ts`: `type SumGroup`, `type LtrField`, `type CostOp`, `COST_OPS: readonly CostOp[]`(31개), `COMMON_GROUPS`, `INDIVIDUAL_GROUPS`
  - `adapter.ts`: `toAmount(v: unknown): number | null`, `readItem(payload: unknown): { ok: boolean; item: Record<string, unknown> | null }`, `type OpResult = { op: CostOp; ok: boolean; item: Record<string, unknown> | null }`, `type MaintenanceAmounts`, `summarizeMonth(results: OpResult[]): { amounts: MaintenanceAmounts; complete: boolean; raw: Record<string, Record<string, unknown> | null> }`

- [ ] **Step 1: ops.ts 작성**

```ts
/**
 * K-apt 관리비 API 3종의 오퍼레이션. 단지 × 연월 1회 수집에 31번 호출한다.
 *
 * 개별사용료 오퍼레이션명은 Swagger 명세에 `...InfoV2`로 적혀 있지만 실제로는 V3다
 * (V2는 NO_OPENAPI_SERVICE_ERROR, 2026-10-15 실호출 확인).
 */
export const CMN = 'AptCmnuseManageCostServiceV3';
export const IND = 'AptIndvdlzManageCostServiceV3';
export const REP = 'AptRepairsCostServiceV3';

export type SumGroup =
  | 'labor' | 'cleaning' | 'guard' | 'disinfection' | 'elevator' | 'homeNetwork' | 'consignFee' | 'repairs' | 'commonEtc'
  | 'heat' | 'hotWater' | 'gas' | 'electricity' | 'water' | 'individualEtc';

export type LtrField = 'ltrLevy' | 'ltrUse' | 'ltrBalance' | 'ltrRate';

/** sum: item의 금액 필드를 모두 더해 group에 누적. ltr: item[key] 하나를 field에 그대로. */
export type CostOp =
  | { service: string; op: string; kind: 'sum'; group: SumGroup }
  | { service: string; op: string; kind: 'ltr'; field: LtrField; key: string };

const sum = (service: string, op: string, group: SumGroup): CostOp => ({ service, op, kind: 'sum', group });
const ltr = (op: string, field: LtrField, key: string): CostOp => ({ service: REP, op, kind: 'ltr', field, key });

export const COST_OPS: readonly CostOp[] = [
  sum(CMN, 'getHsmpLaborCostInfoV3', 'labor'),
  sum(CMN, 'getHsmpTaxdueInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpVhcleMntncCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpEtcCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpOfcrkCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpClothingCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpEduTraingCostInfoV3', 'commonEtc'),
  sum(CMN, 'getHsmpCleaningCostInfoV3', 'cleaning'),
  sum(CMN, 'getHsmpGuardCostInfoV3', 'guard'),
  sum(CMN, 'getHsmpDisinfectionCostInfoV3', 'disinfection'),
  sum(CMN, 'getHsmpElevatorMntncCostInfoV3', 'elevator'),
  sum(CMN, 'getHsmpHomeNetworkMntncCostInfoV3', 'homeNetwork'),
  sum(CMN, 'getHsmpRepairsCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpFacilityMntncCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpSafetyCheckUpCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpDisasterPreventionCostInfoV3', 'repairs'),
  sum(CMN, 'getHsmpConsignManageFeeInfoV3', 'consignFee'),
  sum(IND, 'getHsmpHeatCostInfoV3', 'heat'),
  sum(IND, 'getHsmpHotWaterCostInfoV3', 'hotWater'),
  sum(IND, 'getHsmpGasRentalFeeInfoV3', 'gas'),
  sum(IND, 'getHsmpElectricityCostInfoV3', 'electricity'),
  sum(IND, 'getHsmpWaterCostInfoV3', 'water'),
  sum(IND, 'getHsmpDomesticWasteFeeInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpMovingInRepresentationMtgInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpBuildingInsuranceFeeInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpElectionOrpnsInfoV3', 'individualEtc'),
  sum(IND, 'getHsmpWaterPurifierTankFeeInfoV3', 'individualEtc'),
  ltr('getHsmpMonthFeeInfoV3', 'ltrLevy', 'sLevy'),
  ltr('getHsmpMonthRetalFeeInfoV3', 'ltrUse', 'sUse'),
  ltr('getHsmpReserveBalanceInfoV3', 'ltrBalance', 'sTot'),
  ltr('getHsmpAccumulationTariffInfoV3', 'ltrRate', 'sPer'),
];

/** 공용관리비 = 이 묶음의 합(㎡당 비교의 분자). */
export const COMMON_GROUPS: readonly SumGroup[] = [
  'labor', 'cleaning', 'guard', 'disinfection', 'elevator', 'homeNetwork', 'consignFee', 'repairs', 'commonEtc',
];
export const INDIVIDUAL_GROUPS: readonly SumGroup[] = ['heat', 'hotWater', 'gas', 'electricity', 'water', 'individualEtc'];
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/ingest/apt-maintenance-cost/adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toAmount, readItem, summarizeMonth, type OpResult } from '@/scripts/ingest/apt-maintenance-cost/adapter';
import { COST_OPS } from '@/scripts/ingest/apt-maintenance-cost/ops';

const ok = (item: Record<string, unknown> | null) => ({ response: { header: { resultCode: '00' }, body: item ? { item } : {} } });
const byOp = (name: string) => COST_OPS.find((o) => o.op === name)!;
/** 31개 전부 정상 응답 + 지정한 오퍼레이션만 item을 갖는 결과 */
function results(items: Record<string, Record<string, unknown>>): OpResult[] {
  return COST_OPS.map((op) => ({ op, ok: true, item: items[op.op] ?? { kaptCode: 'A1', kaptName: 'x' } }));
}

describe('COST_OPS', () => {
  it('31개이고 중복이 없다', () => {
    expect(COST_OPS).toHaveLength(31);
    expect(new Set(COST_OPS.map((o) => o.op)).size).toBe(31);
  });
  it('개별사용료는 V3 오퍼레이션명을 쓴다', () => {
    expect(COST_OPS.filter((o) => o.service === 'AptIndvdlzManageCostServiceV3').every((o) => o.op.endsWith('V3'))).toBe(true);
  });
});

describe('toAmount', () => {
  it('타입이 섞여 와도 숫자로 바꾼다', () => {
    expect(toAmount(1506766)).toBe(1506766);
    expect(toAmount('0')).toBe(0);
    expect(toAmount('1,234')).toBe(1234);
    expect(toAmount(3.5)).toBe(3.5);
  });
  it('null·빈 문자열·숫자 아닌 값은 null', () => {
    expect(toAmount(null)).toBeNull();
    expect(toAmount(undefined)).toBeNull();
    expect(toAmount('')).toBeNull();
    expect(toAmount('  ')).toBeNull();
    expect(toAmount('abc')).toBeNull();
    expect(toAmount({})).toBeNull();
  });
});

describe('readItem', () => {
  it('resultCode 00이면 ok와 item', () => {
    expect(readItem(ok({ cleanCost: 1 }))).toEqual({ ok: true, item: { cleanCost: 1 } });
  });
  it('item이 없는 정상 응답은 ok, item null', () => {
    expect(readItem(ok(null))).toEqual({ ok: true, item: null });
  });
  it('XML 오류 문자열·다른 resultCode는 ok=false', () => {
    expect(readItem('<errMsg>NO_OPENAPI_SERVICE_ERROR</errMsg>').ok).toBe(false);
    expect(readItem({ response: { header: { resultCode: '03' } } }).ok).toBe(false);
    expect(readItem(null).ok).toBe(false);
  });
});

describe('summarizeMonth', () => {
  it('묶음별로 item의 금액 필드를 모두 더한다(kaptCode·kaptName 제외)', () => {
    const r = summarizeMonth(results({
      getHsmpLaborCostInfoV3: { kaptCode: 'A1', kaptName: 'x', pay: '100', bonus: 0, pension: 50, welfareBenefit: null },
      getHsmpRepairsCostInfoV3: { lrefCost1: 10 },
      getHsmpFacilityMntncCostInfoV3: { lrefCost2: '20' },
      getHsmpCleaningCostInfoV3: { cleanCost: 7 },
    }));
    expect(r.amounts.labor).toBe(150);
    expect(r.amounts.repairs).toBe(30);
    expect(r.amounts.cleaning).toBe(7);
    expect(r.amounts.commonTotal).toBe(187);
    expect(r.complete).toBe(true);
  });

  it('개별난방 단지의 난방 0은 0으로 남는다(null이 아니다)', () => {
    const r = summarizeMonth(results({ getHsmpHeatCostInfoV3: { heatP: '0', heatC: 0 } }));
    expect(r.amounts.heat).toBe(0);
  });

  it('장기수선충당금은 지정 필드 하나만 읽는다', () => {
    const r = summarizeMonth(results({
      getHsmpMonthFeeInfoV3: { sLevy: 52459240 },
      getHsmpReserveBalanceInfoV3: { sTot: 1312406334 },
      getHsmpAccumulationTariffInfoV3: { sPer: 0 },
    }));
    expect(r.amounts.ltrLevy).toBe(52459240);
    expect(r.amounts.ltrBalance).toBe(1312406334);
    expect(r.amounts.ltrRate).toBe(0);
  });

  it('모든 값이 비어 있는 달은 금액이 전부 null이지만 complete=true', () => {
    const empty = COST_OPS.map((op) => ({ op, ok: true, item: { kaptCode: 'A1', kaptName: 'x', v: null } }));
    const r = summarizeMonth(empty);
    expect(r.amounts.commonTotal).toBeNull();
    expect(r.amounts.heat).toBeNull();
    expect(r.complete).toBe(true);
  });

  it('하나라도 실패했거나 31개가 아니면 complete=false', () => {
    const rs = results({});
    rs[3] = { ...rs[3], ok: false, item: null };
    expect(summarizeMonth(rs).complete).toBe(false);
    expect(summarizeMonth(results({}).slice(0, 30)).complete).toBe(false);
  });

  it('원 응답을 오퍼레이션별로 보존한다', () => {
    const r = summarizeMonth(results({ getHsmpGuardCostInfoV3: { guardCost: 5 } }));
    expect(r.raw.getHsmpGuardCostInfoV3).toEqual({ guardCost: 5 });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-maintenance-cost/adapter.test.ts`
Expected: FAIL — `Cannot find module '@/scripts/ingest/apt-maintenance-cost/adapter'`

- [ ] **Step 4: adapter.ts 작성**

```ts
/**
 * 관리비 응답 정규화. 같은 응답 안에서 int·"0"·float·null이 섞여 온다(2026-10-15 표본 100단지 실측).
 */
import { COST_OPS, COMMON_GROUPS, INDIVIDUAL_GROUPS, type CostOp, type SumGroup, type LtrField } from './ops';

type Rec = Record<string, unknown>;
const ID_KEYS = new Set(['kaptCode', 'kaptName']);

export function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.replace(/,/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** resultCode 00이면 ok. item이 없는 정상 응답은 "그 달 미공개"로 item=null. */
export function readItem(payload: unknown): { ok: boolean; item: Rec | null } {
  if (!payload || typeof payload !== 'object') return { ok: false, item: null };
  const res = (payload as Rec).response as Rec | undefined;
  const header = res?.header as Rec | undefined;
  if (header?.resultCode !== '00') return { ok: false, item: null };
  const item = (res?.body as Rec | undefined)?.item;
  return { ok: true, item: item && typeof item === 'object' && !Array.isArray(item) ? (item as Rec) : null };
}

export interface OpResult {
  op: CostOp;
  ok: boolean;
  item: Rec | null;
}

export type MaintenanceAmounts = Record<SumGroup | 'commonTotal' | LtrField, number | null>;

const AMOUNT_KEYS: (SumGroup | 'commonTotal' | LtrField)[] = [
  ...COMMON_GROUPS, ...INDIVIDUAL_GROUPS, 'commonTotal', 'ltrLevy', 'ltrUse', 'ltrBalance', 'ltrRate',
];

function add(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export function summarizeMonth(results: OpResult[]): {
  amounts: MaintenanceAmounts;
  complete: boolean;
  raw: Record<string, Rec | null>;
} {
  const amounts = Object.fromEntries(AMOUNT_KEYS.map((k) => [k, null])) as MaintenanceAmounts;
  const raw: Record<string, Rec | null> = {};

  for (const r of results) {
    raw[r.op.op] = r.item;
    if (!r.item) continue;
    if (r.op.kind === 'sum') {
      let s: number | null = null;
      for (const [k, v] of Object.entries(r.item)) {
        if (!ID_KEYS.has(k)) s = add(s, toAmount(v));
      }
      amounts[r.op.group] = add(amounts[r.op.group], s);
    } else {
      amounts[r.op.field] = toAmount(r.item[r.op.key]);
    }
  }

  amounts.commonTotal = COMMON_GROUPS.reduce<number | null>((acc, g) => add(acc, amounts[g]), null);
  const complete = results.length === COST_OPS.length && results.every((r) => r.ok);
  return { amounts, complete, raw };
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-maintenance-cost/adapter.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/ingest/apt-maintenance-cost/ops.ts scripts/ingest/apt-maintenance-cost/adapter.ts tests/ingest/apt-maintenance-cost/adapter.test.ts
git commit -m "feat(ingest): 관리비 31개 오퍼레이션 정의와 응답 요약"
```

---

### Task 3: 수집 러너 (HTTP·월 결정·저장·통계·CLI)

**Files:**
- Modify: `scripts/ingest/apt-complex/http.ts` (`async function getJson` → `export async function getJson`)
- Create: `scripts/ingest/apt-maintenance-cost/http.ts`
- Create: `scripts/ingest/apt-maintenance-cost/runner.ts`
- Test: `tests/ingest/apt-maintenance-cost/months.test.ts`, `tests/integration/apt-maintenance-cost-runner.test.ts`

**Interfaces:**
- Consumes: Task 2의 `COST_OPS`, `readItem`, `summarizeMonth`, `toAmount`, `OpResult`, `MaintenanceAmounts`; `getJson`, `QuotaExceededError` (apt-complex/http)
- Produces: `MAINTENANCE_COST_SOURCE = 'apt-maintenance-cost'`, `type FetchItem = (op: CostOp, kaptCode: string, yearMonth: string) => Promise<unknown>`, `shiftMonth(ym, delta)`, `ymOf(date)`, `targetMonths(latest)`, `resolveLatestMonth(now, probeCodes, fetchItem?)`, `runCollect(opts): Promise<{ saved: number; quotaHit: boolean }>`, `refreshStats(yearMonth): Promise<number>`

- [ ] **Step 1: getJson export**

`scripts/ingest/apt-complex/http.ts`에서 한 단어만 바꾼다:

```ts
export async function getJson(url: URL, label: string): Promise<unknown> {
```

- [ ] **Step 2: http.ts 작성**

```ts
/** 관리비 오퍼레이션 1회 호출. 재시도·한도 초과 감지는 apt-complex의 getJson을 그대로 쓴다. */
import { getJson } from '@/scripts/ingest/apt-complex/http';
import type { CostOp } from './ops';

const BASE = 'https://apis.data.go.kr/1613000';

export async function fetchCostItem(op: CostOp, kaptCode: string, yearMonth: string): Promise<unknown> {
  const url = new URL(`${BASE}/${op.service}/${op.op}`);
  url.searchParams.set('kaptCode', kaptCode);
  url.searchParams.set('searchDate', yearMonth);
  return getJson(url, `maintenance-cost ${op.op} ${kaptCode} ${yearMonth}`);
}
```

- [ ] **Step 3: 월 계산 실패 테스트**

`tests/ingest/apt-maintenance-cost/months.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: {} }));
import { shiftMonth, ymOf, targetMonths, resolveLatestMonth } from '@/scripts/ingest/apt-maintenance-cost/runner';

const hit = (cleanCost: unknown) => ({ response: { header: { resultCode: '00' }, body: { item: { cleanCost } } } });

describe('월 계산', () => {
  it('shiftMonth는 연도 경계를 넘는다', () => {
    expect(shiftMonth('202601', -1)).toBe('202512');
    expect(shiftMonth('202512', 1)).toBe('202601');
    expect(shiftMonth('202610', -2)).toBe('202608');
  });
  it('ymOf', () => {
    expect(ymOf(new Date(Date.UTC(2026, 9, 15)))).toBe('202610');
  });
  it('targetMonths는 최신 월과 같은 해 1월', () => {
    expect(targetMonths('202608')).toEqual(['202608', '202601']);
    expect(targetMonths('202601')).toEqual(['202601']);
  });
});

describe('resolveLatestMonth', () => {
  it('1개월 전부터 거꾸로 찾아 청소비 값이 있는 첫 달을 돌려준다', async () => {
    const fetchItem = vi.fn(async (_op, _code, ym: string) => (ym === '202608' ? hit(1506766) : hit(null)));
    expect(await resolveLatestMonth(new Date(Date.UTC(2026, 9, 15)), ['A1'], fetchItem)).toBe('202608');
  });
  it('6개월 안에 없으면 null', async () => {
    const fetchItem = vi.fn(async () => hit(null));
    expect(await resolveLatestMonth(new Date(Date.UTC(2026, 9, 15)), ['A1'], fetchItem)).toBeNull();
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-maintenance-cost/months.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: runner.ts 작성**

```ts
/**
 * K-apt 관리비 수집 러너.
 *
 *   pnpm ingest:maintenance-cost [--month=YYYYMM] [--limit=N] [--concurrency=N]
 *
 * 대상은 우리 페이지가 있는 단지(AptComplex.propertyId 있음, inUse)다. 최신 공개 월과 같은 해 1월
 * (겨울·여름 비교용)만 받는다. 이미 complete인 (단지, 월)은 건너뛰므로, 일일 한도에 걸려
 * 멈춰도 다음 실행이 이어 받는다. 화면은 DB만 읽으므로 revalidate를 호출하지 않는다(ISR 주기로 반영).
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { fetchCostItem } from './http';
import { COST_OPS, type CostOp } from './ops';
import { readItem, summarizeMonth, toAmount, type OpResult, type MaintenanceAmounts } from './adapter';

export const MAINTENANCE_COST_SOURCE = 'apt-maintenance-cost';
const DEFAULT_CONCURRENCY = 3; // 동시 6에서 429 실측(2026-10-15)
const MIN_STAT_SAMPLE = 5;

export type FetchItem = (op: CostOp, kaptCode: string, yearMonth: string) => Promise<unknown>;

export function shiftMonth(ym: string, delta: number): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 최신 월 + 같은 해 1월(겨울·여름 비교). 최신이 1월이면 하나. */
export function targetMonths(latest: string): string[] {
  const jan = `${latest.slice(0, 4)}01`;
  return latest === jan ? [latest] : [latest, jan];
}

/** 약 2개월 지연 공개(실측). 1~6개월 전을 최근부터 거꾸로 probe한다. */
export async function resolveLatestMonth(
  now: Date,
  probeCodes: string[],
  fetchItem: FetchItem = fetchCostItem,
): Promise<string | null> {
  const probeOp = COST_OPS.find((o) => o.op === 'getHsmpCleaningCostInfoV3')!;
  const current = ymOf(now);
  for (let back = 1; back <= 6; back++) {
    const ym = shiftMonth(current, -back);
    for (const code of probeCodes) {
      const { item } = readItem(await fetchItem(probeOp, code, ym));
      if (item && toAmount(item.cleanCost) !== null) return ym;
    }
  }
  return null;
}

function toDb(a: MaintenanceAmounts) {
  const big = (n: number | null) => (n === null ? null : BigInt(Math.round(n)));
  return {
    labor: big(a.labor), cleaning: big(a.cleaning), guard: big(a.guard), disinfection: big(a.disinfection),
    elevator: big(a.elevator), homeNetwork: big(a.homeNetwork), consignFee: big(a.consignFee),
    repairs: big(a.repairs), commonEtc: big(a.commonEtc), commonTotal: big(a.commonTotal),
    heat: big(a.heat), hotWater: big(a.hotWater), gas: big(a.gas), electricity: big(a.electricity),
    water: big(a.water), individualEtc: big(a.individualEtc),
    ltrLevy: big(a.ltrLevy), ltrUse: big(a.ltrUse), ltrBalance: big(a.ltrBalance),
    ltrRate: a.ltrRate,
  };
}

export async function runCollect(opts: {
  months: string[];
  limit?: number;
  concurrency?: number;
  fetchItem?: FetchItem;
  /** 테스트 전용 — 대상 단지를 좁힌다. */
  kaptCodes?: string[];
}): Promise<{ saved: number; quotaHit: boolean }> {
  const fetchItem = opts.fetchItem ?? fetchCostItem;
  const complexes = await prisma.aptComplex.findMany({
    where: {
      inUse: true,
      propertyId: { not: null },
      ...(opts.kaptCodes ? { kaptCode: { in: opts.kaptCodes } } : {}),
    },
    select: { kaptCode: true },
    orderBy: [{ sigunguCode: 'asc' }, { kaptCode: 'asc' }],
  });

  let saved = 0;
  let quotaHit = false;

  for (const ym of opts.months) {
    if (quotaHit) break;
    const done = new Set(
      (await prisma.aptMaintenanceCost.findMany({
        where: { yearMonth: ym, complete: true },
        select: { kaptCode: true },
      })).map((r) => r.kaptCode),
    );
    let todo = complexes.map((c) => c.kaptCode).filter((k) => !done.has(k));
    if (opts.limit) todo = todo.slice(0, opts.limit);

    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (quotaHit) return;
        const i = next++;
        if (i >= todo.length) return;
        const kaptCode = todo[i];
        const results: OpResult[] = [];
        for (const op of COST_OPS) {
          if (quotaHit) return;
          try {
            const { ok, item } = readItem(await fetchItem(op, kaptCode, ym));
            results.push({ op, ok, item });
          } catch (err) {
            if (err instanceof QuotaExceededError) {
              quotaHit = true; // 이 단지는 저장하지 않는다. 다음 실행이 처음부터 받는다.
              return;
            }
            logger.warn({ err, kaptCode, ym, op: op.op }, 'maintenance-cost op failed');
            results.push({ op, ok: false, item: null });
          }
        }
        const row = summarizeMonth(results);
        const data = { ...toDb(row.amounts), complete: row.complete, raw: row.raw as object, fetchedAt: new Date() };
        await prisma.aptMaintenanceCost.upsert({
          where: { kaptCode_yearMonth: { kaptCode, yearMonth: ym } },
          create: { kaptCode, yearMonth: ym, ...data },
          update: data,
        });
        saved++;
        if (saved % 500 === 0) logger.info({ saved, ym }, 'maintenance-cost progress');
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY) }, () => worker()));
    logger.info({ ym, todo: todo.length, saved, quotaHit }, 'maintenance-cost month pass');
  }
  return { saved, quotaHit };
}

/**
 * 시군구 × 월 공용관리비 ㎡당 중앙값. 분모는 K-apt 기본정보의 관리비부과면적(rawJson.kaptMarea).
 * 표본 5개 미만 시군구는 저장하지 않는다(화면에서 비교 칸이 빠진다).
 */
export async function refreshStats(yearMonth: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.aptMaintenanceCostStat.deleteMany({ where: { yearMonth } });
    return tx.$executeRaw`
      INSERT INTO "AptMaintenanceCostStat" ("sigunguCode", "yearMonth", "medianCommonPerM2", "sampleCount", "computedAt")
      SELECT ac."sigunguCode", m."yearMonth",
             ROUND(percentile_cont(0.5) WITHIN GROUP (
               ORDER BY m."commonTotal"::float8 / (ac."rawJson"->>'kaptMarea')::float8
             ))::int,
             COUNT(*)::int,
             now()
      FROM "AptMaintenanceCost" m
      JOIN "AptComplex" ac ON ac."kaptCode" = m."kaptCode"
      WHERE m."yearMonth" = ${yearMonth}
        AND m.complete
        AND m."commonTotal" > 0
        AND (ac."rawJson"->>'kaptMarea') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (ac."rawJson"->>'kaptMarea')::float8 > 0
      GROUP BY ac."sigunguCode", m."yearMonth"
      HAVING COUNT(*) >= ${MIN_STAT_SAMPLE}
    `;
  });
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({
    data: { source: MAINTENANCE_COST_SOURCE, targetKey: 'resolving', status: 'RUNNING' },
  });
  try {
    let latest = arg('month') ?? null;
    if (!latest) {
      const probes = (await prisma.aptComplex.findMany({
        where: { inUse: true, propertyId: { not: null } },
        select: { kaptCode: true },
        orderBy: { kaptCode: 'asc' },
        take: 3,
      })).map((r) => r.kaptCode);
      latest = await resolveLatestMonth(new Date(), probes);
    }
    if (!latest) throw new Error('최근 6개월 안에 공개된 관리비 월을 찾지 못했다');

    const months = targetMonths(latest);
    const limit = Number(arg('limit')) || undefined;
    const concurrency = Number(arg('concurrency')) || undefined;
    const { saved, quotaHit } = await runCollect({ months, limit, concurrency });
    for (const ym of months) await refreshStats(ym);

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', targetKey: latest, rowsUpserted: saved, finishedAt: new Date() },
    });
    await notify(quotaHit ? 'warn' : 'info', `apt-maintenance-cost ${latest}${quotaHit ? ' 한도 도달로 중단(다음 실행이 이어 받음)' : ' 완료'}`, { months, saved });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'apt-maintenance-cost failed');
    await notify('error', 'apt-maintenance-cost failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('apt-maintenance-cost/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'apt-maintenance-cost runner fatal');
    process.exit(1);
  });
}
```

- [ ] **Step 5: 월 계산 테스트 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/apt-maintenance-cost/months.test.ts`
Expected: PASS

- [ ] **Step 6: 수집·통계 통합 테스트 작성**

`tests/integration/apt-maintenance-cost-runner.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { runCollect, refreshStats, type FetchItem } from '@/scripts/ingest/apt-maintenance-cost/runner';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';
import { COST_OPS } from '@/scripts/ingest/apt-maintenance-cost/ops';

const REGION_CODE = '1171000000';
const SGG = '11710';
const PREFIX = 'UT-MC-';
const YM = '202608';
const codes = Array.from({ length: 6 }, (_, i) => `${PREFIX}${i}`);

const ok = (item: Record<string, unknown>) => ({ response: { header: { resultCode: '00' }, body: { item } } });
/** 단지마다 청소비만 (i+1)*1000원, 나머지는 0 */
const fakeFetch: FetchItem = async (op, kaptCode) => {
  const i = Number(kaptCode.slice(PREFIX.length));
  if (op.op === 'getHsmpCleaningCostInfoV3') return ok({ kaptCode, cleanCost: (i + 1) * 1000 });
  return ok({ kaptCode, v: 0 });
};

async function cleanup() {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: SGG, yearMonth: YM } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'test' },
    update: {},
  });
  for (const code of codes) {
    const p = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: code, nameNorm: code.toLowerCase(), regionCode: REGION_CODE, address: '서울특별시 송파구' },
    });
    await prisma.aptComplex.create({
      data: {
        kaptCode: code, kaptName: code, nameNorm: code.toLowerCase(), bjdCode: REGION_CODE, sigunguCode: SGG,
        propertyId: p.id, rawJson: { kaptMarea: '1000' },
      },
    });
  }
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: { startsWith: PREFIX } } });
});

describe('runCollect', () => {
  it('단지마다 31번 호출해 complete 행을 저장한다', async () => {
    let calls = 0;
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: async (...a) => { calls++; return fakeFetch(...a); } });
    expect(r).toEqual({ saved: 6, quotaHit: false });
    expect(calls).toBe(6 * COST_OPS.length);
    const row = await prisma.aptMaintenanceCost.findUniqueOrThrow({ where: { kaptCode_yearMonth: { kaptCode: `${PREFIX}0`, yearMonth: YM } } });
    expect(row.complete).toBe(true);
    expect(row.cleaning).toBe(1000n);
    expect(row.commonTotal).toBe(1000n);
    expect(row.heat).toBe(0n);
  });

  it('이미 complete인 (단지, 월)은 다시 부르지 않는다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    let calls = 0;
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: async (...a) => { calls++; return fakeFetch(...a); } });
    expect(r.saved).toBe(0);
    expect(calls).toBe(0);
  });

  it('오퍼레이션 하나가 실패하면 complete=false로 저장되고 다음 실행에서 다시 받는다', async () => {
    const flaky: FetchItem = async (op, kaptCode, ym) => {
      if (kaptCode === `${PREFIX}0` && op.op === 'getHsmpGuardCostInfoV3') throw new Error('HTTP 500');
      return fakeFetch(op, kaptCode, ym);
    };
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: flaky, concurrency: 1 });
    const bad = await prisma.aptMaintenanceCost.findUniqueOrThrow({ where: { kaptCode_yearMonth: { kaptCode: `${PREFIX}0`, yearMonth: YM } } });
    expect(bad.complete).toBe(false);
    const again = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    expect(again.saved).toBe(1);
  });

  it('한도 초과를 만나면 그 단지는 저장하지 않고 즉시 멈춘다', async () => {
    let n = 0;
    const quota: FetchItem = async (op, kaptCode, ym) => {
      if (++n > COST_OPS.length + 5) throw new QuotaExceededError();
      return fakeFetch(op, kaptCode, ym);
    };
    const r = await runCollect({ months: [YM], kaptCodes: codes, fetchItem: quota, concurrency: 1 });
    expect(r).toEqual({ saved: 1, quotaHit: true });
    expect(await prisma.aptMaintenanceCost.count({ where: { kaptCode: { startsWith: PREFIX } } })).toBe(1);
  });
});

describe('refreshStats', () => {
  it('공용관리비 ㎡당 중앙값을 시군구 × 월로 저장한다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes, fetchItem: fakeFetch });
    await refreshStats(YM);
    const stat = await prisma.aptMaintenanceCostStat.findUniqueOrThrow({ where: { sigunguCode_yearMonth: { sigunguCode: SGG, yearMonth: YM } } });
    // ㎡당 = 1,2,3,4,5,6 → 중앙값 3.5 → ROUND 4
    expect(stat.sampleCount).toBe(6);
    expect(stat.medianCommonPerM2).toBe(4);
  });

  it('표본이 5개 미만이면 저장하지 않는다', async () => {
    await runCollect({ months: [YM], kaptCodes: codes.slice(0, 4), fetchItem: fakeFetch });
    await refreshStats(YM);
    expect(await prisma.aptMaintenanceCostStat.findUnique({ where: { sigunguCode_yearMonth: { sigunguCode: SGG, yearMonth: YM } } })).toBeNull();
  });
});
```

주의: `refreshStats`는 시군구 전체를 집계하므로 테스트 DB에 같은 시군구(11710)의 다른 관리비 행이 없어야 한다. 이 테스트만 해당 테이블을 쓰므로 현재는 안전하다.

- [ ] **Step 7: 통합 테스트 실행**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/apt-maintenance-cost-runner.test.ts --no-file-parallelism`
Expected: PASS (6 tests)

- [ ] **Step 8: 커밋**

```bash
git add scripts/ingest/apt-complex/http.ts scripts/ingest/apt-maintenance-cost/http.ts scripts/ingest/apt-maintenance-cost/runner.ts tests/ingest/apt-maintenance-cost/months.test.ts tests/integration/apt-maintenance-cost-runner.test.ts
git commit -m "feat(ingest): 관리비 수집 러너 — 최신 월 탐색·이어받기·한도 중단·시군구 중앙값"
```

---

### Task 4: 표시 모델 (순수)

**Files:**
- Create: `lib/insights/maintenance-cost.ts`
- Test: `tests/lib/maintenance-cost.test.ts`

**Interfaces:**
- Produces: `type MaintenanceMonth`, `type MaintenanceBasis`, `type SigunguStat`, `type CostItem`, `type MaintenanceView`, `parseManageArea(raw: unknown): number | null`, `heatKind(t: string | null): 'shared' | 'individual' | 'other'`, `buildMaintenanceView(months, basis, stat): MaintenanceView | null`, `won(n)`, `manWon(n)`, `monthLabel(ym)`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/maintenance-cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildMaintenanceView, parseManageArea, heatKind, won, manWon, monthLabel, type MaintenanceMonth,
} from '@/lib/insights/maintenance-cost';

const F = new Date('2026-10-15T00:00:00Z');
function month(ym: string, o: Partial<MaintenanceMonth> = {}): MaintenanceMonth {
  return {
    yearMonth: ym,
    labor: 43_728_000, cleaning: 39_403_000, guard: 28_206_000, disinfection: 1_135_000, elevator: 2_077_000,
    homeNetwork: 0, consignFee: 830_000, repairs: 15_499_000, commonEtc: 5_273_000, commonTotal: 136_151_000,
    heat: 9_729_000, hotWater: 13_344_000, gas: 0, electricity: 172_894_000, water: 26_382_000, individualEtc: 10_684_000,
    ltrLevy: 52_459_240, ltrBalance: 1_312_406_334, ltrRate: 0,
    fetchedAt: F,
    ...o,
  };
}
const basis = { households: 1000, heatType: '지역난방', manageArea: 150_000, sigunguName: '연수구' };

describe('포맷터', () => {
  it('won·manWon·monthLabel', () => {
    expect(won(136291)).toBe('136,291원');
    expect(manWon(1_312_406_334)).toBe('13억 1,241만 원');
    expect(manWon(52_459_240)).toBe('5,246만 원');
    expect(manWon(200_000_000)).toBe('2억 원');
    expect(monthLabel('202608')).toBe('2026년 8월');
  });
});

describe('parseManageArea·heatKind', () => {
  it('rawJson.kaptMarea를 숫자로 읽고, 없거나 0이면 null', () => {
    expect(parseManageArea({ kaptMarea: '147835.27' })).toBeCloseTo(147835.27);
    expect(parseManageArea({ kaptMarea: 92214 })).toBe(92214);
    expect(parseManageArea({ kaptMarea: '0' })).toBeNull();
    expect(parseManageArea({})).toBeNull();
    expect(parseManageArea(null)).toBeNull();
  });
  it('난방 방식 분류', () => {
    expect(heatKind('지역난방')).toBe('shared');
    expect(heatKind('중앙난방')).toBe('shared');
    expect(heatKind('개별난방')).toBe('individual');
    expect(heatKind('개별난방+기타')).toBe('individual');
    expect(heatKind('')).toBe('other');
    expect(heatKind(null)).toBe('other');
  });
});

describe('buildMaintenanceView', () => {
  it('데이터 있는 달이 없으면 null', () => {
    expect(buildMaintenanceView([], basis, null)).toBeNull();
    expect(buildMaintenanceView([month('202608', { commonTotal: null })], basis, null)).toBeNull();
  });

  it('최신 월 기준으로 ㎡당·세대당·합계를 계산한다', () => {
    const v = buildMaintenanceView([month('202601'), month('202608')], basis, null)!;
    expect(v.yearMonth).toBe('202608');
    expect(v.commonPerM2).toBe(908); // 136,151,000 / 150,000
    expect(v.commonAmount).toBe(136_151); // ÷ 1000세대
    expect(v.perHousehold).toBe(true);
    // 공용 136,151,000 + 개별 233,033,000 + 장충 52,459,240 → ÷1000
    expect(v.totalAmount).toBe(421_643);
  });

  it('0원 항목은 빼고, 금액 내림차순, 기타는 마지막', () => {
    const v = buildMaintenanceView([month('202608')], basis, null)!;
    expect(v.commonItems.map((i) => i.label)).toEqual(['인건비', '청소비', '경비비', '수선·시설유지', '승강기', '소독비', '위탁수수료', '기타']);
    expect(v.individualItems.map((i) => i.label)).toEqual(['전기', '수도', '급탕', '난방', '기타']);
    expect(v.barMax).toBe(172_894);
  });

  it('구 비교: 표본 5개 이상만, ±5% 안은 비슷함', () => {
    const one = [month('202608')];
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 1000, sampleCount: 4 })!.comparison).toBeNull();
    const lower = buildMaintenanceView(one, basis, { medianCommonPerM2: 1000, sampleCount: 30 })!.comparison!;
    expect(lower).toEqual({ sigunguName: '연수구', pct: -9, label: '낮음', sampleCount: 30, medianPerM2: 1000 });
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 880, sampleCount: 30 })!.comparison!.label).toBe('비슷함');
    expect(buildMaintenanceView(one, basis, { medianCommonPerM2: 700, sampleCount: 30 })!.comparison!.label).toBe('높음');
  });

  it('관리면적이 없으면 ㎡당·구 비교·추이를 숨긴다', () => {
    const v = buildMaintenanceView(
      ['202603', '202604', '202605', '202608'].map((m) => month(m)),
      { ...basis, manageArea: null },
      { medianCommonPerM2: 1000, sampleCount: 30 },
    )!;
    expect(v.commonPerM2).toBeNull();
    expect(v.comparison).toBeNull();
    expect(v.trend).toBeNull();
    expect(v.commonAmount).toBe(136_151);
  });

  it('세대수가 없으면 단지 전체 금액으로 표시한다', () => {
    const v = buildMaintenanceView([month('202608')], { ...basis, households: null }, null)!;
    expect(v.perHousehold).toBe(false);
    expect(v.commonAmount).toBe(136_151_000);
    expect(v.ltr!.levyPerHousehold).toBeNull();
  });

  it('추이는 데이터 있는 달이 3개 이상일 때만', () => {
    expect(buildMaintenanceView([month('202601'), month('202608')], basis, null)!.trend).toBeNull();
    const v = buildMaintenanceView(['202606', '202607', '202608'].map((m) => month(m)), basis, null)!;
    expect(v.trend!.map((t) => t.label)).toEqual(['6월', '7월', '8월']);
  });

  it('겨울·여름: 지역·중앙난방이고 같은 해 1월과 8월(없으면 7월)이 있을 때만', () => {
    const months = [month('202601', { heat: 222_167_000, electricity: 103_614_000, hotWater: 19_457_000 }), month('202608')];
    const v = buildMaintenanceView(months, basis, null)!;
    expect(v.seasonal!.winterLabel).toBe('2026년 1월');
    expect(v.seasonal!.summerLabel).toBe('2026년 8월');
    expect(v.seasonal!.rows[0]).toEqual({ label: '난방', winter: 222_167, summer: 9_729 });
    expect(buildMaintenanceView(months, { ...basis, heatType: '개별난방' }, null)!.seasonal).toBeNull();
    expect(buildMaintenanceView([month('202608')], basis, null)!.seasonal).toBeNull();
  });

  it('개별난방이면 안내 플래그', () => {
    expect(buildMaintenanceView([month('202608')], { ...basis, heatType: '개별난방' }, null)!.individualHeating).toBe(true);
    expect(buildMaintenanceView([month('202608')], basis, null)!.individualHeating).toBe(false);
  });

  it('장기수선충당금: 적립요율 0은 숨기고, 둘 다 없으면 블록 없음', () => {
    const v = buildMaintenanceView([month('202608')], basis, null)!;
    expect(v.ltr).toEqual({ levy: 52_459_240, levyPerHousehold: 52_459, levyPerM2: 350, balance: 1_312_406_334, rate: null });
    expect(buildMaintenanceView([month('202608', { ltrRate: 3 })], basis, null)!.ltr!.rate).toBe(3);
    expect(buildMaintenanceView([month('202608', { ltrLevy: null, ltrBalance: null })], basis, null)!.ltr).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/maintenance-cost.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: lib/insights/maintenance-cost.ts 작성**

```ts
/**
 * 관리비 섹션 표시 모델. DB 행 → 화면 값. 순수 함수만 둔다(테스트 대상).
 *
 * 단지 간 비교는 공용관리비 ㎡당만 한다. 개별사용료는 단지마다 포함 항목이 다르다
 * (개별난방 단지는 난방비 0, 한전 직접 계약 단지는 전기 0 — 2026-10-15 실측).
 */
export interface MaintenanceMonth {
  yearMonth: string;
  labor: number | null; cleaning: number | null; guard: number | null; disinfection: number | null;
  elevator: number | null; homeNetwork: number | null; consignFee: number | null; repairs: number | null;
  commonEtc: number | null; commonTotal: number | null;
  heat: number | null; hotWater: number | null; gas: number | null; electricity: number | null;
  water: number | null; individualEtc: number | null;
  ltrLevy: number | null; ltrBalance: number | null; ltrRate: number | null;
  fetchedAt: Date;
}

export interface MaintenanceBasis {
  households: number | null;
  heatType: string | null;
  manageArea: number | null;
  sigunguName: string | null;
}

export interface SigunguStat {
  medianCommonPerM2: number;
  sampleCount: number;
}

export interface CostItem {
  label: string;
  amount: number;
}

export interface MaintenanceView {
  yearMonth: string;
  monthLabel: string;
  heatType: string | null;
  households: number | null;
  manageArea: number | null;
  /** true면 금액이 세대당 평균, false면 단지 전체(세대수 미상) */
  perHousehold: boolean;
  commonPerM2: number | null;
  commonAmount: number;
  comparison: { sigunguName: string; pct: number; label: '높음' | '낮음' | '비슷함'; sampleCount: number; medianPerM2: number } | null;
  totalAmount: number;
  commonItems: CostItem[];
  individualItems: CostItem[];
  individualTotal: number;
  barMax: number;
  trend: { label: string; perM2: number }[] | null;
  trendRangeLabel: string | null;
  seasonal: { winterLabel: string; summerLabel: string; rows: { label: string; winter: number; summer: number }[] } | null;
  individualHeating: boolean;
  ltr: { levy: number | null; levyPerHousehold: number | null; levyPerM2: number | null; balance: number | null; rate: number | null } | null;
  fetchedAt: Date;
}

const MIN_SAMPLE = 5;
const SIMILAR_PCT = 5;
const MIN_TREND = 3;

type AmountKey = Exclude<keyof MaintenanceMonth, 'yearMonth' | 'fetchedAt'>;
const COMMON_DEFS: [AmountKey, string][] = [
  ['labor', '인건비'], ['cleaning', '청소비'], ['guard', '경비비'], ['repairs', '수선·시설유지'],
  ['elevator', '승강기'], ['disinfection', '소독비'], ['consignFee', '위탁수수료'], ['homeNetwork', '홈네트워크'],
];
const INDIVIDUAL_DEFS: [AmountKey, string][] = [
  ['electricity', '전기'], ['water', '수도'], ['hotWater', '급탕'], ['heat', '난방'], ['gas', '가스'],
];
const INDIVIDUAL_KEYS: AmountKey[] = ['heat', 'hotWater', 'gas', 'electricity', 'water', 'individualEtc'];

export function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 원 → "13억 1,241만 원" / "5,246만 원" */
export function manWon(n: number): string {
  const man = Math.round(n / 10_000);
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  if (eok === 0) return `${man.toLocaleString('ko-KR')}만 원`;
  return rest === 0 ? `${eok.toLocaleString('ko-KR')}억 원` : `${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만 원`;
}

export function monthLabel(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export function parseManageArea(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).kaptMarea;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function heatKind(t: string | null): 'shared' | 'individual' | 'other' {
  if (!t) return 'other';
  if (t.startsWith('개별')) return 'individual';
  if (t === '지역난방' || t === '중앙난방') return 'shared';
  return 'other';
}

const hasData = (m: MaintenanceMonth) => m.commonTotal !== null && m.commonTotal > 0;

export function buildMaintenanceView(
  months: MaintenanceMonth[],
  basis: MaintenanceBasis,
  stat: SigunguStat | null,
): MaintenanceView | null {
  const sorted = months.filter(hasData).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const latest = sorted.at(-1);
  if (!latest) return null;

  const hh = basis.households && basis.households > 0 ? basis.households : null;
  const area = basis.manageArea && basis.manageArea > 0 ? basis.manageArea : null;
  const per = (n: number) => Math.round(hh ? n / hh : n);

  const commonPerM2 = area ? Math.round(latest.commonTotal! / area) : null;

  let comparison: MaintenanceView['comparison'] = null;
  if (stat && stat.sampleCount >= MIN_SAMPLE && commonPerM2 !== null && basis.sigunguName) {
    const pct = Math.round((commonPerM2 / stat.medianCommonPerM2 - 1) * 100);
    comparison = {
      sigunguName: basis.sigunguName,
      pct,
      label: Math.abs(pct) < SIMILAR_PCT ? '비슷함' : pct > 0 ? '높음' : '낮음',
      sampleCount: stat.sampleCount,
      medianPerM2: stat.medianCommonPerM2,
    };
  }

  const items = (defs: [AmountKey, string][], etcKey: AmountKey): CostItem[] => {
    const main = defs
      .map(([k, label]) => ({ label, amount: per(latest[k] ?? 0) }))
      .filter((i) => i.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const etc = per(latest[etcKey] ?? 0);
    return etc > 0 ? [...main, { label: '기타', amount: etc }] : main;
  };
  const commonItems = items(COMMON_DEFS, 'commonEtc');
  const individualItems = items(INDIVIDUAL_DEFS, 'individualEtc');
  const individualRaw = INDIVIDUAL_KEYS.reduce((s, k) => s + (latest[k] ?? 0), 0);

  const trendMonths = area ? sorted.slice(-12) : [];
  const trend = trendMonths.length >= MIN_TREND
    ? trendMonths.map((m) => ({ label: `${Number(m.yearMonth.slice(4, 6))}월`, perM2: Math.round(m.commonTotal! / area!) }))
    : null;
  const trendRangeLabel = trend
    ? trendMonths[0].yearMonth.slice(0, 4) === latest.yearMonth.slice(0, 4)
      ? `${latest.yearMonth.slice(0, 4)}년`
      : `${monthLabel(trendMonths[0].yearMonth)} ~ ${monthLabel(latest.yearMonth)}`
    : null;

  const kind = heatKind(basis.heatType);
  let seasonal: MaintenanceView['seasonal'] = null;
  if (kind === 'shared') {
    const byYm = new Map(sorted.map((m) => [m.yearMonth, m]));
    const years = [...new Set(sorted.map((m) => m.yearMonth.slice(0, 4)))].sort().reverse();
    for (const y of years) {
      const w = byYm.get(`${y}01`);
      const s = byYm.get(`${y}08`) ?? byYm.get(`${y}07`);
      if (!w || !s) continue;
      const rows = ([['heat', '난방'], ['electricity', '전기'], ['hotWater', '급탕']] as [AmountKey, string][])
        .filter(([k]) => w[k] !== null && s[k] !== null && (w[k]! > 0 || s[k]! > 0))
        .map(([k, label]) => ({ label, winter: per(w[k]!), summer: per(s[k]!) }));
      if (rows.length > 0) seasonal = { winterLabel: monthLabel(w.yearMonth), summerLabel: monthLabel(s.yearMonth), rows };
      break;
    }
  }

  const ltr = latest.ltrLevy === null && latest.ltrBalance === null
    ? null
    : {
        levy: latest.ltrLevy,
        levyPerHousehold: latest.ltrLevy !== null && hh ? Math.round(latest.ltrLevy / hh) : null,
        levyPerM2: latest.ltrLevy !== null && area ? Math.round(latest.ltrLevy / area) : null,
        balance: latest.ltrBalance,
        rate: latest.ltrRate !== null && latest.ltrRate > 0 ? latest.ltrRate : null,
      };

  return {
    yearMonth: latest.yearMonth,
    monthLabel: monthLabel(latest.yearMonth),
    heatType: basis.heatType,
    households: hh,
    manageArea: area,
    perHousehold: hh !== null,
    commonPerM2,
    commonAmount: per(latest.commonTotal!),
    comparison,
    totalAmount: per(latest.commonTotal! + individualRaw + (latest.ltrLevy ?? 0)),
    commonItems,
    individualItems,
    individualTotal: per(individualRaw),
    barMax: Math.max(1, ...commonItems.map((i) => i.amount), ...individualItems.map((i) => i.amount)),
    trend,
    trendRangeLabel,
    seasonal,
    individualHeating: kind === 'individual',
    ltr,
    fetchedAt: latest.fetchedAt,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/maintenance-cost.test.ts`
Expected: PASS. 계산값이 어긋나면 테스트 기대값이 아니라 위 규칙(반올림 위치)을 다시 확인한다 — 예: `levyPerHousehold`는 52,459,240 ÷ 1000 = 52,459, `levyPerM2`는 ÷ 150,000 = 350.

- [ ] **Step 5: 커밋**

```bash
git add lib/insights/maintenance-cost.ts tests/lib/maintenance-cost.test.ts
git commit -m "feat(insights): 관리비 표시 모델 — ㎡당·구 비교·추이·겨울여름·장기수선충당금"
```

---

### Task 5: DB 조회

**Files:**
- Create: `lib/maintenance-cost-query.ts`
- Test: `tests/integration/maintenance-cost-query.test.ts`

**Interfaces:**
- Consumes: Task 4의 `buildMaintenanceView`, `parseManageArea`, `MaintenanceMonth`, `MaintenanceView`
- Produces: `getMaintenanceCostView(propertyId: bigint, sigunguName: string | null): Promise<MaintenanceView | null>`

- [ ] **Step 1: 실패하는 통합 테스트**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { getMaintenanceCostView } from '@/lib/maintenance-cost-query';

const REGION_CODE = '1171000000';
const SGG = '11710';
const CODE = 'UT-MCQ-1';
let propertyId: bigint;
let bareId: bigint;

const amounts = { labor: 40_000_000n, cleaning: 30_000_000n, commonTotal: 70_000_000n, electricity: 50_000_000n, ltrLevy: 10_000_000n };

async function cleanup() {
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: CODE } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: SGG, yearMonth: '202608' } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: CODE } });
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-MCQ' } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'test' },
    update: {},
  });
  const p = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT-MCQ-A', nameNorm: 'ut-mcq-a', regionCode: REGION_CODE, address: '서울' } });
  const bare = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: 'UT-MCQ-B', nameNorm: 'ut-mcq-b', regionCode: REGION_CODE, address: '서울' } });
  propertyId = p.id;
  bareId = bare.id;
  await prisma.aptComplex.create({
    data: { kaptCode: CODE, kaptName: CODE, nameNorm: 'ut-mcq-1', bjdCode: REGION_CODE, sigunguCode: SGG, propertyId, households: 100, heatType: '지역난방', rawJson: { kaptMarea: '10000' } },
  });
  const base = { kaptCode: CODE, raw: {}, fetchedAt: new Date('2026-10-15T00:00:00Z') };
  await prisma.aptMaintenanceCost.create({ data: { ...base, yearMonth: '202608', complete: true, ...amounts } });
  // 불완전 행은 더 최신이어도 쓰지 않는다
  await prisma.aptMaintenanceCost.create({ data: { ...base, yearMonth: '202609', complete: false, ...amounts, commonTotal: 999_000_000n } });
  await prisma.aptMaintenanceCostStat.create({ data: { sigunguCode: SGG, yearMonth: '202608', medianCommonPerM2: 7000, sampleCount: 12, computedAt: new Date() } });
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('getMaintenanceCostView', () => {
  it('complete 행 중 최신 월과 그 달 구 통계로 표시 모델을 만든다', async () => {
    const v = (await getMaintenanceCostView(propertyId, '송파구'))!;
    expect(v.yearMonth).toBe('202608');
    expect(v.commonPerM2).toBe(7000);
    expect(v.comparison).toEqual({ sigunguName: '송파구', pct: 0, label: '비슷함', sampleCount: 12, medianPerM2: 7000 });
    expect(v.commonAmount).toBe(700_000);
  });
  it('연결된 단지가 없으면 null', async () => {
    expect(await getMaintenanceCostView(bareId, '송파구')).toBeNull();
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/maintenance-cost-query.test.ts --no-file-parallelism`
Expected: FAIL — module not found

- [ ] **Step 2: lib/maintenance-cost-query.ts 작성**

```ts
import { prisma } from '@/lib/db';
import {
  buildMaintenanceView,
  parseManageArea,
  type MaintenanceMonth,
  type MaintenanceView,
} from '@/lib/insights/maintenance-cost';

const num = (v: bigint | null) => (v === null ? null : Number(v));

/** 아파트 상세 관리비 섹션. 연결된 K-apt 단지가 없거나 데이터가 없으면 null. */
export async function getMaintenanceCostView(
  propertyId: bigint,
  sigunguName: string | null,
): Promise<MaintenanceView | null> {
  const complex = await prisma.aptComplex.findUnique({
    where: { propertyId },
    select: { kaptCode: true, households: true, heatType: true, rawJson: true, sigunguCode: true },
  });
  if (!complex) return null;

  const rows = await prisma.aptMaintenanceCost.findMany({
    where: { kaptCode: complex.kaptCode, complete: true },
    orderBy: { yearMonth: 'desc' },
    take: 24,
  });
  const months: MaintenanceMonth[] = rows.map((r) => ({
    yearMonth: r.yearMonth,
    labor: num(r.labor), cleaning: num(r.cleaning), guard: num(r.guard), disinfection: num(r.disinfection),
    elevator: num(r.elevator), homeNetwork: num(r.homeNetwork), consignFee: num(r.consignFee),
    repairs: num(r.repairs), commonEtc: num(r.commonEtc), commonTotal: num(r.commonTotal),
    heat: num(r.heat), hotWater: num(r.hotWater), gas: num(r.gas), electricity: num(r.electricity),
    water: num(r.water), individualEtc: num(r.individualEtc),
    ltrLevy: num(r.ltrLevy), ltrBalance: num(r.ltrBalance),
    ltrRate: r.ltrRate === null ? null : Number(r.ltrRate),
    fetchedAt: r.fetchedAt,
  }));

  const latestYm = months.find((m) => m.commonTotal !== null && m.commonTotal > 0)?.yearMonth;
  const stat = latestYm
    ? await prisma.aptMaintenanceCostStat.findUnique({
        where: { sigunguCode_yearMonth: { sigunguCode: complex.sigunguCode, yearMonth: latestYm } },
        select: { medianCommonPerM2: true, sampleCount: true },
      })
    : null;

  return buildMaintenanceView(
    months,
    {
      households: complex.households,
      heatType: complex.heatType,
      manageArea: parseManageArea(complex.rawJson),
      sigunguName,
    },
    stat,
  );
}
```

- [ ] **Step 3: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/maintenance-cost-query.test.ts --no-file-parallelism`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add lib/maintenance-cost-query.ts tests/integration/maintenance-cost-query.test.ts
git commit -m "feat(apt): 관리비 표시 모델 DB 조회"
```

---

### Task 6: 섹션 컴포넌트 + 출처 레지스트리

**Files:**
- Create: `app/(public)/apt/[id]/_components/maintenance-cost-section.tsx`
- Modify: `lib/data-sources.ts` (`DataSourceId` 유니온 끝과 `DATA_SOURCES` 끝에 추가)
- Test: `tests/components/maintenance-cost-section-ssr.test.ts`

**Interfaces:**
- Consumes: Task 4의 `MaintenanceView`, `won`, `manWon`
- Produces: `MaintenanceCostSection({ view, id }: { view: MaintenanceView | null; id?: string })`, `DataSourceId` 값 `'kapt-maintenance-cost'`

- [ ] **Step 1: 출처 등록**

`lib/data-sources.ts` 유니온의 `| 'molit-apt-complex';`를 다음으로 바꾼다:

```ts
  | 'molit-apt-complex'
  | 'kapt-maintenance-cost';
```

`DATA_SOURCES`의 `'molit-apt-complex': {...},` 항목 바로 뒤에 추가:

```ts
  'kapt-maintenance-cost': {
    id: 'kapt-maintenance-cost',
    provider: '국토교통부',
    dataset: '공동주택관리정보시스템(K-apt) 관리비 공개',
    url: 'https://www.data.go.kr/data/15057937/openapi.do',
    category: '부동산 거래',
  },
```

- [ ] **Step 2: 실패하는 SSR 테스트**

`tests/components/maintenance-cost-section-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaintenanceCostSection } from '@/app/(public)/apt/[id]/_components/maintenance-cost-section';
import type { MaintenanceView } from '@/lib/insights/maintenance-cost';

(globalThis as unknown as { React: typeof React }).React = React;

const base: MaintenanceView = {
  yearMonth: '202608', monthLabel: '2026년 8월', heatType: '지역난방', households: 980, manageArea: 147835,
  perHousehold: true, commonPerM2: 903, commonAmount: 136291,
  comparison: { sigunguName: '연수구', pct: -6, label: '낮음', sampleCount: 41, medianPerM2: 960 },
  totalAmount: 422854,
  commonItems: [{ label: '인건비', amount: 43728 }, { label: '기타', amount: 5273 }],
  individualItems: [{ label: '전기', amount: 172894 }],
  individualTotal: 233033, barMax: 172894,
  trend: [{ label: '6월', perM2: 939 }, { label: '7월', perM2: 932 }, { label: '8월', perM2: 903 }], trendRangeLabel: '2026년',
  seasonal: { winterLabel: '2026년 1월', summerLabel: '2026년 8월', rows: [{ label: '난방', winter: 222167, summer: 9729 }] },
  individualHeating: false,
  ltr: { levy: 52459240, levyPerHousehold: 53530, levyPerM2: 355, balance: 1312406334, rate: null },
  fetchedAt: new Date('2026-10-15T00:00:00Z'),
};
const html = (v: MaintenanceView | null) => renderToStaticMarkup(createElement(MaintenanceCostSection, { view: v, id: 'maintenance-cost' }));

describe('MaintenanceCostSection', () => {
  it('view가 없으면 렌더하지 않는다', () => {
    expect(html(null)).toBe('');
  });
  it('요약·구 비교·출처·계산식을 그린다', () => {
    const h = html(base);
    expect(h).toContain('id="maintenance-cost"');
    expect(h).toContain('관리비');
    expect(h).toContain('903원');
    expect(h).toContain('연수구 아파트 중앙값 대비');
    expect(h).toContain('6% 낮음');
    expect(h).toContain('2026년 8월 부과분');
    expect(h).toContain('2026-10-15 조회');
    expect(h).toContain('임장ON 계산');
    expect(h).toContain('13억 1,241만 원');
    expect(h).toContain('실제 세대별 고지액과 다릅니다');
  });
  it('비교가 비슷함이면 퍼센트 없이 "비슷함"', () => {
    const h = html({ ...base, comparison: { ...base.comparison!, pct: 2, label: '비슷함' } });
    expect(h).toContain('비슷함');
    expect(h).not.toContain('2% 비슷함');
  });
  it('비교·추이·겨울여름이 없으면 해당 블록을 그리지 않는다', () => {
    const h = html({ ...base, comparison: null, trend: null, trendRangeLabel: null, seasonal: null });
    expect(h).not.toContain('중앙값 대비');
    expect(h).not.toContain('㎡당 추이');
    expect(h).not.toContain('겨울과 여름');
  });
  it('개별난방 안내', () => {
    const h = html({ ...base, seasonal: null, individualHeating: true, heatType: '개별난방' });
    expect(h).toContain('난방비는 세대가 도시가스에 직접 내므로 관리비에 포함되지 않습니다');
  });
  it('세대수가 없으면 단지 전체 표기', () => {
    const h = html({ ...base, perHousehold: false, households: null });
    expect(h).toContain('단지 전체');
    expect(h).not.toContain('실제 세대별 고지액과 다릅니다');
  });
  it('장기수선충당금에 평가 문구가 없다', () => {
    const h = html(base);
    for (const w of ['부족', '충분', '양호', '위험']) expect(h).not.toContain(w);
  });
});
```

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/maintenance-cost-section-ssr.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 컴포넌트 작성** (확정 시안 A/B/C의 구조와 문구 그대로)

```tsx
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { won, manWon, type MaintenanceView, type CostItem } from '@/lib/insights/maintenance-cost';

/**
 * 아파트 상세 · 관리비. UI 확정본: https://claude.ai/artifact/RAyfGp18iJhwWo5ppo24nr
 * 단지 간 비교는 공용관리비 ㎡당만 한다. 장기수선충당금은 숫자만 보여주고 평가하지 않는다.
 */
export function MaintenanceCostSection({ view, id }: { view: MaintenanceView | null; id?: string }) {
  if (!view) return null;
  const v = view;
  const unit = v.perHousehold ? '세대당' : '단지 전체';

  return (
    <Card id={id}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">관리비</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {[`${v.monthLabel} 부과분`, v.heatType, v.households ? `${v.households.toLocaleString('ko-KR')}세대` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {v.commonPerM2 !== null ? (
          <Tile label="공용관리비 ㎡당" value={won(v.commonPerM2)} sub={`${unit} ${won(v.commonAmount)}`} />
        ) : (
          <Tile label={`공용관리비 ${unit}`} value={won(v.commonAmount)} />
        )}
        {v.comparison && (
          <Tile
            label={`${v.comparison.sigunguName} 아파트 중앙값 대비`}
            value={v.comparison.label === '비슷함' ? '비슷함' : `${Math.abs(v.comparison.pct)}% ${v.comparison.label}`}
            sub={`${v.comparison.sampleCount}개 단지 중앙값 ㎡당 ${won(v.comparison.medianPerM2)}`}
          />
        )}
        <div className="col-span-2 sm:col-span-1">
          <Tile label="이 단지 월 관리비 합계" value={`${unit} ${won(v.totalAmount)}`} sub="공용 + 개별사용료 + 장기수선충당금" />
        </div>
      </div>

      <h3 className="mt-6 text-[15px] font-bold text-[var(--color-text)]">
        항목별 내역 <span className="text-[13px] font-normal text-[var(--color-muted)]">{unit} · 0원 항목 제외</span>
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
        <ItemBars title={`공용관리비 ${won(v.commonAmount)}`} items={v.commonItems} max={v.barMax} color="bg-[var(--color-blue)]" />
        <div>
          <ItemBars title={`개별사용료 ${won(v.individualTotal)}`} items={v.individualItems} max={v.barMax} color="bg-[var(--color-blue-dark)]" />
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
            개별사용료는 단지마다 포함 항목이 달라(개별난방·한전 직접 계약 등) 다른 단지와 비교하지 않습니다.
          </p>
        </div>
      </div>

      {v.individualHeating && (
        <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-3.5 text-sm leading-relaxed">
          <strong className="text-[var(--color-blue-dark)]">개별난방 단지</strong> — 난방비는 세대가 도시가스에 직접 내므로 관리비에 포함되지 않습니다.
        </p>
      )}

      {(v.trend || v.seasonal) && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {v.trend && (
            <div>
              <h3 className="text-[15px] font-bold">공용관리비 ㎡당 추이</h3>
              <Trend points={v.trend} />
              <p className="mt-1 text-[13px] text-[var(--color-muted)]">단위 원/㎡ · {v.trendRangeLabel}</p>
            </div>
          )}
          {v.seasonal && (
            <div>
              <h3 className="text-[15px] font-bold">
                겨울과 여름 <span className="text-[13px] font-normal text-[var(--color-muted)]">{unit} · {v.heatType}</span>
              </h3>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="text-[13px] text-[var(--color-muted)]">
                    <th className="border-b border-[var(--color-line)] py-2 text-left font-medium">항목</th>
                    <th className="border-b border-[var(--color-line)] py-2 text-right font-medium">{v.seasonal.winterLabel}</th>
                    <th className="border-b border-[var(--color-line)] py-2 text-right font-medium">{v.seasonal.summerLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {v.seasonal.rows.map((r) => (
                    <tr key={r.label}>
                      <td className="border-b border-[var(--color-soft)] py-2.5">{r.label}</td>
                      <td className={`border-b border-[var(--color-soft)] py-2.5 text-right ${r.winter >= r.summer ? 'font-bold text-[var(--color-blue-dark)]' : ''}`}>{won(r.winter)}</td>
                      <td className={`border-b border-[var(--color-soft)] py-2.5 text-right ${r.summer > r.winter ? 'font-bold text-[var(--color-blue-dark)]' : ''}`}>{won(r.summer)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {v.perHousehold && (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
          세대당 금액은 단지 전체 부과액을 세대수로 나눈 평균이라 실제 세대별 고지액과 다릅니다.
        </p>
      )}

      {v.ltr && (
        <div className="mt-6">
          <h3 className="text-[15px] font-bold">장기수선충당금</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {v.ltr.levy !== null && (
              <Tile
                label="월 부과액 (단지 전체)"
                value={manWon(v.ltr.levy)}
                sub={[
                  v.ltr.levyPerHousehold !== null ? `세대당 ${won(v.ltr.levyPerHousehold)}` : null,
                  v.ltr.levyPerM2 !== null ? `㎡당 ${won(v.ltr.levyPerM2)}` : null,
                  v.ltr.rate !== null ? `적립요율 ${v.ltr.rate}%` : null,
                ].filter(Boolean).join(' · ') || undefined}
              />
            )}
            {v.ltr.balance !== null && (
              <Tile label="적립 잔액" value={manWon(v.ltr.balance)} sub={`${v.monthLabel} 말 기준`} />
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
            장기수선충당금은 승강기·외벽·배관 같은 큰 수선에 대비해 모으는 돈입니다. 적정 규모는 단지 연식과 장기수선계획에 따라 다릅니다.
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          국토교통부 공동주택관리정보시스템(K-apt) · 단지 관리주체 공개 자료 · {v.monthLabel} 부과분 ·{' '}
          {v.fetchedAt.toISOString().slice(0, 10)} 조회
        </p>
        <p className="mt-1">
          임장ON 계산:{' '}
          {[
            v.manageArea ? `㎡당 = 공용관리비 ÷ 관리비부과면적(${Math.round(v.manageArea).toLocaleString('ko-KR')}㎡)` : null,
            v.households ? `세대당 = 단지 부과액 ÷ ${v.households.toLocaleString('ko-KR')}세대` : null,
            v.comparison ? `구 중앙값 = 같은 달 ${v.comparison.sigunguName} 공용관리비 ㎡당의 중앙값` : null,
          ].filter(Boolean).join(' · ') || '단지 부과액 합계'}
        </p>
        <SourceCaption ids={['kapt-maintenance-cost']} className="mt-1" />
      </div>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="h-full rounded-2xl bg-[var(--color-soft)] p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold text-[var(--color-blue-dark)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

function ItemBars({ title, items, max, color }: { title: string; items: CostItem[]; max: number; color: string }) {
  return (
    <div>
      <p className="text-[13px] font-bold text-[var(--color-blue-dark)]">{title}</p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[88px_1fr_80px] items-center gap-2">
            <span>{i.label}</span>
            <span className="h-2 rounded-full bg-[var(--color-sky-soft)]" aria-hidden="true">
              <span className={`block h-2 rounded-full ${color}`} style={{ width: `${Math.max(1, (i.amount / max) * 100)}%` }} />
            </span>
            <span className="text-right">{won(i.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trend({ points }: { points: { label: string; perM2: number }[] }) {
  const max = Math.max(...points.map((p) => p.perM2));
  return (
    <div className="mt-2">
      <div className="flex h-40 items-end gap-2 border-b border-[var(--color-line)]" role="img" aria-label={points.map((p) => `${p.label} ${p.perM2}원`).join(', ')}>
        {points.map((p, i) => (
          <div key={p.label + i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={`text-xs ${i === points.length - 1 ? 'font-bold text-[var(--color-blue-dark)]' : 'text-[var(--color-muted)]'}`}>{p.perM2.toLocaleString('ko-KR')}</span>
            <div
              className={`w-full rounded-t-md ${i === points.length - 1 ? 'bg-[var(--color-blue)]' : 'bg-[var(--color-sky-soft)]'}`}
              style={{ height: `${Math.round((p.perM2 / max) * 120)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-xs text-[var(--color-muted)]">
        {points.map((p, i) => <span key={p.label + i} className="flex-1 text-center">{p.label}</span>)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인 (컴포넌트 + 레지스트리 테스트)**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/maintenance-cost-section-ssr.test.ts tests/lib/data-sources.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/apt/\[id\]/_components/maintenance-cost-section.tsx lib/data-sources.ts tests/components/maintenance-cost-section-ssr.test.ts
git commit -m "feat(apt): 관리비 섹션 컴포넌트와 출처 kapt-maintenance-cost"
```

---

### Task 7: 페이지 배치와 바로가기

**Files:**
- Modify: `app/(public)/apt/[id]/page.tsx`
- Modify: `app/(public)/apt/[id]/_components/detail-sidebar.tsx`

**Interfaces:**
- Consumes: `getMaintenanceCostView`(Task 5), `MaintenanceCostSection`(Task 6)

- [ ] **Step 1: 페이지에서 조회**

`page.tsx` import 블록에 추가:

```ts
import { MaintenanceCostSection } from './_components/maintenance-cost-section';
import { getMaintenanceCostView } from '@/lib/maintenance-cost-query';
```

`const showComplex = shouldRenderComplexInfo(complexFacts, now);` 바로 아래에 추가:

```ts
  const maintenance = await safe(
    getMaintenanceCostView(propId, property.region.sigungu ?? null),
    null,
    'getMaintenanceCostView',
  );
```

- [ ] **Step 2: 섹션 배치**

`<ComplexInfoSection id="complex" facts={complexFacts} unitMix={unitMix} now={now} />` 바로 아래에:

```tsx
          <MaintenanceCostSection id="maintenance-cost" view={maintenance} />
```

`<DetailSidebar property={property} showComplex={showComplex} showDong={dongTx.length > 0} />`를:

```tsx
          <DetailSidebar property={property} showComplex={showComplex} showDong={dongTx.length > 0} showMaintenance={maintenance !== null} />
```

- [ ] **Step 3: 사이드바 바로가기**

`detail-sidebar.tsx`의 `ANCHORS`에서 `{ href: '#complex', ... }` 바로 뒤에:

```ts
  { href: '#maintenance-cost', label: '관리비', needsMaintenance: true },
```

props와 필터를 바꾼다:

```tsx
export function DetailSidebar({
  property,
  showComplex = false,
  showDong = false,
  showMaintenance = false,
}: {
  property: Property;
  showComplex?: boolean;
  showDong?: boolean;
  showMaintenance?: boolean;
}) {
```

```tsx
          {ANCHORS.filter(
            (a) =>
              (!a.needsComplex || showComplex) &&
              (!a.needsDong || showDong) &&
              (!a.needsMaintenance || showMaintenance),
          ).map((a) => (
```

- [ ] **Step 4: 타입 검사와 기존 테스트**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: 모두 통과. `DetailSidebar`를 쓰는 오피스텔·빌라 페이지는 기본값 false라 변경 없음.

- [ ] **Step 5: 커밋**

```bash
git add app/\(public\)/apt/\[id\]/page.tsx app/\(public\)/apt/\[id\]/_components/detail-sidebar.tsx
git commit -m "feat(apt): 상세 페이지에 관리비 섹션과 바로가기 배치"
```

---

### Task 8: 실행 배선 (스크립트·온박스 타이머)

**Files:**
- Modify: `package.json` (scripts)
- Modify: `deploy/run-etl.sh`
- Modify: `deploy/systemd/install-timers.sh`

- [ ] **Step 1: package.json 스크립트**

`"ingest:subway": ...` 줄 뒤에:

```json
    "ingest:maintenance-cost": "dotenv -e .env.local -- tsx scripts/ingest/apt-maintenance-cost/runner.ts",
```

- [ ] **Step 2: run-etl.sh 잡 추가**

`subway)` 줄 뒤에:

```bash
  apt-maintenance-cost) $DC pnpm tsx scripts/ingest/apt-maintenance-cost/runner.ts ;;  # 일일 한도까지 진행, 다음 날 이어 받음
```

- [ ] **Step 3: 타이머 등록 (UTC 17:00 = KST 02:00, 한도 리셋 후·transactions-daily와 겹치지 않게)**

`install-timers.sh`의 `JOBS`에 한 줄 추가:

```
apt-maintenance-cost|*-*-* 17:00:00
```

- [ ] **Step 4: 로컬에서 실제 API로 소량 실행 (읽기: 공공 API, 쓰기: 로컬 DB)**

로컬 `.env.local`은 빈 docker DB라 대상 단지가 없다. 대상 없이도 월 탐색·종료가 정상인지 확인한다:

Run: `pnpm ingest:maintenance-cost --limit=1`
Expected: "maintenance-cost month pass" 로그(todo 0), 종료 코드 0, `IngestionRun`에 `apt-maintenance-cost` OK 행.

- [ ] **Step 5: 커밋**

```bash
git add package.json deploy/run-etl.sh deploy/systemd/install-timers.sh
git commit -m "chore(etl): 관리비 수집 잡·온박스 타이머 등록"
```

---

### Task 9: e2e

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts`
- Modify: `tests/e2e/apt-detail.spec.ts`

- [ ] **Step 1: 시드 추가**

`seed-e2e.ts`의 `main()` 시작부 `await prisma.transaction.deleteMany();` 앞에 추가:

```ts
  await prisma.aptMaintenanceCost.deleteMany({ where: { kaptCode: 'E2E-KAPT-1' } });
  await prisma.aptMaintenanceCostStat.deleteMany({ where: { sigunguCode: '11650' } });
  await prisma.aptComplex.deleteMany({ where: { kaptCode: 'E2E-KAPT-1' } });
```

`래미안서초에스티지` 생성(`const p = await prisma.property.create(...)`) 직후에 추가:

```ts
  // 관리비 섹션 e2e — 지역난방, 1월·8월 + 구 통계
  await prisma.aptComplex.create({
    data: {
      kaptCode: 'E2E-KAPT-1', kaptName: '래미안서초에스티지', nameNorm: '래미안서초에스티지', bjdCode: '1165010100',
      sigunguCode: '11650', propertyId: p.id, households: 1184, heatType: '지역난방', rawJson: { kaptMarea: '120000' },
    },
  });
  const mc = (yearMonth: string, heat: bigint) => ({
    kaptCode: 'E2E-KAPT-1', yearMonth, complete: true, raw: {}, fetchedAt: new Date(),
    labor: 50_000_000n, cleaning: 40_000_000n, guard: 30_000_000n, repairs: 10_000_000n, commonTotal: 130_000_000n,
    heat, electricity: 120_000_000n, water: 30_000_000n, ltrLevy: 40_000_000n, ltrBalance: 1_500_000_000n,
  });
  await prisma.aptMaintenanceCost.createMany({ data: [mc('202601', 200_000_000n), mc('202608', 10_000_000n)] });
  await prisma.aptMaintenanceCostStat.create({
    data: { sigunguCode: '11650', yearMonth: '202608', medianCommonPerM2: 1200, sampleCount: 20, computedAt: new Date() },
  });
```

- [ ] **Step 2: e2e 테스트 추가**

`apt-detail.spec.ts` 끝에:

```ts
test('apt detail: 관리비 섹션이 단지 정보 아래에 렌더된다', async ({ page }) => {
  await page.goto(`/apt/${propertyId}`);
  const sec = page.locator('#maintenance-cost');
  await expect(sec).toBeVisible();
  await expect(sec.getByRole('heading', { name: '관리비' })).toBeVisible();
  await expect(sec.getByText('공용관리비 ㎡당')).toBeVisible();
  await expect(sec.getByText('서초구 아파트 중앙값 대비')).toBeVisible();
  await expect(sec.getByText('겨울과 여름')).toBeVisible();
  await expect(sec.getByText(/2026년 8월 부과분/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: '관리비' })).toBeVisible();
});
```

(시드 Region `1165010100`의 sigungu는 '서초구' — 2026-10-15 확인.)

- [ ] **Step 3: 로컬 e2e 실행**

Run:
```bash
pnpm test:db:migrate && pnpm seed:e2e && pnpm test:e2e:local tests/e2e/apt-detail.spec.ts
```
Expected: PASS (기존 테스트 포함)

- [ ] **Step 4: 커밋**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/apt-detail.spec.ts
git commit -m "test(e2e): 아파트 상세 관리비 섹션"
```

---

### Task 10: 머지 전 전체 확인 (사용자 승인 게이트)

- [ ] **Step 1: 전체 검사**

Run:
```bash
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm build
```
Expected: 전부 통과. (CI에는 build가 없으므로 로컬 build 필수.)

- [ ] **Step 2: 실데이터 QA (읽기전용 터널)**

운영 DB SSH 터널 + read-only 세션으로 `.env.qa.local`을 써서 로컬 dev를 띄운다. 운영에는 아직 관리비 행이 없으므로, 확인 내용은:
1. 마이그레이션 전 운영 DB에서 상세 페이지가 깨지지 않는지 — 테이블이 없으면 `safe()`가 null로 떨어지고 섹션이 없어야 한다(로그 1줄).
2. 대상 단지 수: `SELECT count(*) FROM "AptComplex" WHERE "inUse" AND "propertyId" IS NOT NULL;` → 하루 진행량(개발계정 약 290단지) 기준 완료 예상일 계산.

- [ ] **Step 3: PR 생성 후 사용자 보고 — 머지는 승인 후**

```bash
git push -u origin feat/apt-maintenance-cost
gh pr create --base main --title "feat(apt): 아파트 상세 관리비 섹션 (K-apt 관리비 수집 + 화면)" --body "<요약·테스트 결과·QA 결과·배포 후 할 일>"
```

PR 본문의 "배포 후 할 일":
1. 박스에서 타이머 설치: `sudo bash /opt/imjang/deploy/systemd/install-timers.sh` 후 `systemctl list-timers | grep maintenance` 확인 (deploy/** 변경은 배포 후 박스에 반영된 다음 실행해야 한다).
2. 첫 실행 수동 트리거: `sudo systemctl start imjang-etl@apt-maintenance-cost` → `IngestionRun` 확인.
3. 수집이 진행된 단지 상세 1~2곳을 브라우저로 확인(ISR 24h 이후 반영).
