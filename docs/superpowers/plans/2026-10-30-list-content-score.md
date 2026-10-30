# 목록 기본 정렬(contentScore) — 1단계 시설 7종 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병원·약국·어린이집·학교·공원·주차장·충전소 목록의 기본 정렬을 `서울 → 상세 내용 점수 → id`로 바꾼다.

**Architecture:** 7개 테이블에 `contentScore`(합계)·`contentNearby`(주간 계산분)·`listRank`(정렬 키) 컬럼을 추가한다. 점수는 엔터티별 순수 함수(`lib/content-score/*`)가 상세 화면과 **같은 표시 판정 함수**로 계산하고, 배치(`scripts/ingest/content-score/runner.ts`)가 daily(자체 정보)·weekly(주변·비교 정보)로 갱신한다. 목록은 `ORDER BY listRank DESC, id ASC`.

**Tech Stack:** Next.js, Prisma 5.22, PostgreSQL 17 + PostGIS, vitest, systemd 타이머(온박스 ETL).

**Spec:** `docs/superpowers/specs/2026-10-30-list-content-score-design.md`

**범위:** 스펙 §7의 0단계(로컬 실측)·1단계(시설 7종). **매물(2단계)은 S1~S3 운영 반영 후 별도 계획**으로 작성한다(점수 입력인 집계 컬럼이 S1~S3에서 바뀜).

## Global Constraints

- 점수는 화면에 실제로 보이는 유효 정보만. `return null`·빈 상태 카드("등록되어 있지 않습니다")·`-` 표시는 0점(스펙 §2-1).
- 핵심 2점, 부가 1점, 깊이 0~4점. 주변 정보 블록당 1점·**합계 최대 2점**(스펙 §2-2·4).
- 제외: 브리핑·관련 가이드·출처·사이드바·요약 문장·FAQ·Hero 고정 요소(스펙 §2-3).
- 서울 판정: 병원·약국·어린이집·학교는 `sigunguCode LIKE '11%'`, 공원·주차장·충전소는 `address LIKE '서울%'`(스펙 §4.1).
- `listRank = (서울 ? 10000 : 0) + contentScore`. 목록 기본 정렬 `listRank DESC, id ASC`. 사용자가 고르는 다른 정렬·필터는 그대로.
- 배치 UPDATE는 raw SQL로 **`updatedAt`을 바꾸지 않는다**, 값이 바뀐 행만 쓴다(스펙 §4.1).
- 운영 DB에 쓰는 작업(마이그레이션 적용·배치 실행·타이머 설치)은 **Task 11 로컬 검증 통과 + 사용자 승인 후**에만. 운영 DB 조회는 읽기 전용 세션(`default_transaction_read_only=on`)만.
- 운영 사이트에 HTTP 요청 버스트 금지. `.env.*.local` 커밋 금지. 비밀번호 출력 금지. main 직접 커밋 금지.
- 완료 전 `pnpm lint`·`pnpm typecheck`·`pnpm test:unit`·`pnpm test:integration` 통과.
- 화면 변화는 목록 순서뿐 — 문구·레이아웃 변경 없음(시안 불필요).
- 필수 오류·운영 안정성 문제만 고치고 선택적 개선은 하지 않는다(사용자 지시 2026-10-30).

## Review Focus

1. 좌표 없는 시설 — 지도·주변·비교 블록 0점, 배치가 실패하지 않고 목록 맨 뒤 쪽으로(→ Task 5·7 테스트).
2. 주소가 시군구로 해석되지 않는 공원·주차장(`resolveAddrPrefix`가 null/`__NO_MATCH__`) — 면적 순위·요금 비교 0점, 예외 없음(→ Task 7 테스트).
3. 재실행 멱등 + `updatedAt` 불변 — 두 번째 실행은 0행 갱신, 사이트맵 lastmod 흔들림 없음(→ Task 7 테스트).
4. 점수 동점 다수에서 페이지 경계 — 1·2페이지 사이 중복·누락 없음(→ Task 8 테스트).
5. 수집 잡이 새로 넣은 행(기본값 0) — 다음 daily 전까지 목록 맨 뒤, 에러 없음(→ Task 8 테스트: listRank 0 행 포함 정렬).

## 판단 기록(Rulings) — 스펙 해석

- R1: 스펙 §4.1의 `contentNearby`는 "주간 배치가 채우는 점수"로 해석한다 — 주변(최대 2) **+ 다른 행에 의존하는 비교 블록**(약국 같은 동·일요일 진료, 공원 면적 순위, 주차장 요금 비교). 이 블록들은 주변 데이터처럼 매일 바뀌지 않고 행마다 쿼리가 필요하다. 상한 2점은 주변 블록에만 적용(스펙 §3 표 그대로).
- R2: 생활 인프라 블록은 상세가 가장 가까운 상가 12곳을 업종 분류한 뒤 일부 분류를 숨겨서 그린다 — 이를 공간 EXISTS로 정확히 재현할 수 없다. **상가(Store)를 제외한 6종**(병원·약국·공원·충전소·주차장·어린이집) 존재로 판정한다. 불일치: 주변에 상가만 있는 시설은 화면엔 인프라 블록이 있는데 0점(검증 Task 11에서 불일치율 보고).
- R3: 컴포넌트 안에 인라인으로 있던 표시 판정(학교·어린이집·공원 기본 정보 행, 어린이집 교직원·시설, 주차장 부가 정보, 충전소 이용 안내, 병원 의료진·진료시간·병상)을 lib 함수로 **추출**해 컴포넌트와 점수 함수가 같은 함수를 쓰게 한다(스펙 §2-5 "같은 판정 함수" 충족에 필요한 최소 변경, 출력 불변).

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261030000000_add_content_score/migration.sql` | 7개 모델에 컬럼 3개 + 인덱스 |
| `lib/content-score/core.ts` | 공통: `tier`, `nearbyPoints`, `listRankOf`, `sum`, `filled` |
| `lib/content-score/{hospital,pharmacy,childcare,school,park,parking,charger}.ts` | 엔터티별 `own*`(daily)·`weekly*` 순수 점수 함수 |
| `lib/content-score/nearby-sql.ts` | 주간 주변 판정 SQL(id 청크 단위, 반경·필터는 상세와 동일) |
| `lib/hospital/display.ts`(신규), `lib/school-display.ts`, `lib/childcare.ts`, `lib/urban/park-display.ts`, `lib/urban/parking-display.ts`(신규), `lib/urban/charger-display.ts` | R3 추출 함수 |
| 상세 컴포넌트 8개 | 추출 함수 사용으로 교체(출력 불변) |
| `scripts/ingest/content-score/runner.ts`, `scripts/ingest/content-score/entities.ts` | 배치: 엔터티별 청크 로드 → 점수 → 바뀐 행 UPDATE |
| `lib/hospital/index.ts`, `lib/pharmacy/index.ts`, `lib/childcare.ts`, `lib/school.ts`, `lib/urban/adapters/{park,parking,charger}.ts` | 목록 기본 정렬 교체 |
| `deploy/run-etl.sh`, `deploy/systemd/install-timers.sh` | `content-score-daily`·`content-score-weekly` 잡 |
| `tests/lib/content-score/*.test.ts`, `tests/integration/content-score-*.test.ts` | 테스트 |

---

### Task 1: 스키마·마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (모델 Hospital, Pharmacy, Childcare, School, Park, Parking, EvCharger)
- Create: `prisma/migrations/20261030000000_add_content_score/migration.sql`

**Interfaces:**
- Produces: 7개 모델 필드 `contentScore Int`, `contentNearby Int`, `listRank Int`(모두 기본 0), 인덱스 `(listRank DESC, id)`.

- [ ] **Step 1: 스키마에 필드 추가** — 7개 모델 각각 `updatedAt` 줄 위에 추가:

```prisma
  /// 상세 내용 점수(목록 기본 정렬). scripts/ingest/content-score가 갱신 — 설계 docs/superpowers/specs/2026-10-30-list-content-score-design.md
  contentScore  Int @default(0) @db.SmallInt
  /// 주간 배치 계산분(주변 최대 2 + 비교 블록). contentScore에 포함된 값
  contentNearby Int @default(0) @db.SmallInt
  /// 정렬 키 = 서울 10000 + contentScore
  listRank      Int @default(0)
```
그리고 각 모델 `@@index` 묶음에 `@@index([listRank(sort: Desc), id])` 추가.

- [ ] **Step 2: 마이그레이션 SQL 생성(로컬 test DB 대상)**

Run: `pnpm dotenv -e .env.test -- prisma migrate dev --create-only --name add_content_score`
그 뒤 생성된 폴더 이름을 `20261030000000_add_content_score`로 바꾸고, 내용이 아래와 같은지 확인(다르면 아래로 교체):

```sql
-- 목록 기본 정렬용 상세 내용 점수(설계 2026-10-30). 상수 기본값이라 테이블 재작성 없음.
ALTER TABLE "Hospital"   ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Pharmacy"   ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Childcare"  ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "School"     ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Park"       ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Parking"    ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EvCharger"  ADD COLUMN "contentScore" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "contentNearby" SMALLINT NOT NULL DEFAULT 0, ADD COLUMN "listRank" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Hospital_listRank_id_idx"  ON "Hospital"("listRank" DESC, "id");
CREATE INDEX "Pharmacy_listRank_id_idx"  ON "Pharmacy"("listRank" DESC, "id");
CREATE INDEX "Childcare_listRank_id_idx" ON "Childcare"("listRank" DESC, "id");
CREATE INDEX "School_listRank_id_idx"    ON "School"("listRank" DESC, "id");
CREATE INDEX "Park_listRank_id_idx"      ON "Park"("listRank" DESC, "id");
CREATE INDEX "Parking_listRank_id_idx"   ON "Parking"("listRank" DESC, "id");
CREATE INDEX "EvCharger_listRank_id_idx" ON "EvCharger"("listRank" DESC, "id");
```
메모리 규칙(Prisma 마이그레이션 스테이징 주의): `migrate dev`가 다른 잔여 폴더를 만들었으면 지우고 **이 폴더만** 남긴다.

- [ ] **Step 3: 적용·드리프트 확인**

Run: `pnpm test:db:migrate && pnpm dotenv -e .env.test -- prisma migrate status && pnpm prisma generate && pnpm typecheck`
Expected: "Database schema is up to date", typecheck 0 errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261030000000_add_content_score/migration.sql
git commit -m "feat(content-score): 시설 7종 contentScore·contentNearby·listRank 컬럼과 정렬 인덱스"
```

---

### Task 2: 공통 점수 유틸

**Files:**
- Create: `lib/content-score/core.ts`
- Test: `tests/lib/content-score/core.test.ts`

**Interfaces:**
- Produces:
  - `type Breakdown = Record<string, number>`
  - `NEARBY_CAP = 2`
  - `sum(b: Breakdown): number`
  - `tier(n: number | null | undefined, cuts: number[]): number` — `cuts` 오름차순 하한, `n`이 넘은 하한 개수
  - `nearbyPoints(flags: boolean[]): number` — `min(2, true 개수)`
  - `filled(v: unknown): boolean` — null·undefined·공백·`'-'`이면 false
  - `listRankOf(isSeoul: boolean, score: number): number`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { tier, nearbyPoints, filled, listRankOf, sum, NEARBY_CAP } from '@/lib/content-score/core';

describe('content-score core', () => {
  it('tier: 하한을 넘은 개수', () => {
    expect(tier(0, [1, 4])).toBe(0);
    expect(tier(1, [1, 4])).toBe(1);
    expect(tier(3, [1, 4])).toBe(1);
    expect(tier(4, [1, 4])).toBe(2);
    expect(tier(null, [1, 4])).toBe(0);
    expect(tier(undefined, [2, 5, 10])).toBe(0);
  });
  it('nearbyPoints: 최대 2', () => {
    expect(NEARBY_CAP).toBe(2);
    expect(nearbyPoints([])).toBe(0);
    expect(nearbyPoints([true, false])).toBe(1);
    expect(nearbyPoints([true, true, true, true])).toBe(2);
  });
  it('filled: 빈 값·하이픈은 false', () => {
    expect(filled(null)).toBe(false);
    expect(filled(undefined)).toBe(false);
    expect(filled('')).toBe(false);
    expect(filled('  ')).toBe(false);
    expect(filled('-')).toBe(false);
    expect(filled('02-123')).toBe(true);
    expect(filled(0)).toBe(true);
  });
  it('listRankOf: 서울이 항상 위', () => {
    expect(listRankOf(true, 0)).toBeGreaterThan(listRankOf(false, 22));
    expect(listRankOf(false, 7)).toBe(7);
    expect(listRankOf(true, 7)).toBe(10007);
  });
  it('sum', () => {
    expect(sum({ a: 2, b: 1, c: 0 })).toBe(3);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/core.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/content-score/core'"

- [ ] **Step 3: 구현**

```ts
/**
 * 목록 기본 정렬용 상세 내용 점수 공통 유틸.
 * 설계: docs/superpowers/specs/2026-10-30-list-content-score-design.md (핵심 2·부가 1·깊이 0~4·주변 합계 최대 2)
 */
export type Breakdown = Record<string, number>;

export const NEARBY_CAP = 2;
const SEOUL_RANK = 10_000;

export function sum(b: Breakdown): number {
  return Object.values(b).reduce((a, v) => a + v, 0);
}

/** cuts(오름차순 하한) 중 n이 넘은 개수. 예: tier(4, [1, 4]) = 2 */
export function tier(n: number | null | undefined, cuts: number[]): number {
  if (n == null) return 0;
  return cuts.filter((c) => n >= c).length;
}

export function nearbyPoints(flags: boolean[]): number {
  return Math.min(NEARBY_CAP, flags.filter(Boolean).length);
}

/** 화면에 값으로 보이는가 — null·빈 문자열·'-'(빈 칸 표기)는 아님 */
export function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    const t = v.trim();
    return t !== '' && t !== '-';
  }
  return true;
}

export function listRankOf(isSeoul: boolean, score: number): number {
  return (isSeoul ? SEOUL_RANK : 0) + score;
}
```

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/core.test.ts`
Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add lib/content-score/core.ts tests/lib/content-score/core.test.ts
git commit -m "feat(content-score): 공통 점수 유틸(구간·주변 상한·정렬 키)"
```

---

### Task 3: 표시 판정 함수 추출(R3, 출력 불변)

**Files:**
- Create: `lib/hospital/display.ts`, `lib/urban/parking-display.ts`
- Modify: `lib/school-display.ts`, `lib/childcare.ts`, `lib/urban/park-display.ts`, `lib/urban/charger-display.ts`
- Modify(컴포넌트가 추출 함수 사용): `app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tab-diagnosis.tsx`, `.../hospital-tab-facility.tsx`, `.../hospital-tab-operation.tsx`, `app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx`, `app/(public)/childcare/[sigunguCode]/[id]/_components/childcare-info.tsx`, `.../childcare-staff.tsx`, `.../childcare-facility.tsx`, `app/(public)/urban/[category]/_components/park-info.tsx`, `.../parking-extras.tsx`, `.../parking-hours-table.tsx`, `app/(public)/urban/charger/[id]/_components/charger-guide.tsx`
- Test: `tests/lib/content-score/display-extract.test.ts`

**Interfaces:**
- Produces:
  - `lib/hospital/display.ts`: `type DoctorCounts`, `hospitalDoctorParts(c: DoctorCounts): string | null`, `hospitalDoctorRows(d: HospitalDoctorInput): { label: string; parts: string }[]`, `hospitalDoctorsFrom(h: HospitalDoctorFields): HospitalDoctorInput`, `BED_ROWS`, `hospitalVisibleBeds(f): { key; label }[]`, `hospitalHasHourInfo(detail, hours: HoursView | null): boolean`
  - `lib/school-display.ts`: `schoolInfoRows(school): [string, string | null][]`
  - `lib/childcare.ts`: `childcareInfoRows(item, regionFullName): [string, string | null][]`, `childcareStaffRows(item): { roleRows; tenRows }`, `childcareFacilityRows(item): { label: string; value: string }[]`
  - `lib/urban/park-display.ts`: `parkInfoRows(r, areaRank): [string, string | null][]`
  - `lib/urban/parking-display.ts`: `parkingHourBlocks(row): HourBlocks`, `parkingExtrasFlags(row): { hasBadges: boolean; hasNote: boolean }`
  - `lib/urban/charger-display.ts`: `chargerGuideItems(raw, units): { tiles: {label;value}[]; rows: [string, string][] }`

- [ ] **Step 1: 실패하는 테스트**(추출 함수가 기존 인라인 규칙과 같은 결과를 내는지)

```ts
import { describe, it, expect } from 'vitest';
import { hospitalDoctorRows, hospitalVisibleBeds, hospitalHasHourInfo } from '@/lib/hospital/display';
import { schoolInfoRows } from '@/lib/school-display';
import { childcareInfoRows, childcareStaffRows, childcareFacilityRows } from '@/lib/childcare';
import { parkInfoRows } from '@/lib/urban/park-display';
import { parkingHourBlocks, parkingExtrasFlags } from '@/lib/urban/parking-display';
import { chargerGuideItems } from '@/lib/urban/charger-display';

const z = { general: null, intern: null, resident: null, specialist: null };

describe('표시 판정 추출', () => {
  it('병원 의료진 행: 0·null 자격은 생략, 전부 없으면 빈 배열', () => {
    expect(hospitalDoctorRows({ med: z, dent: z, kor: z })).toEqual([]);
    expect(hospitalDoctorRows({ med: { ...z, specialist: 2, general: 0 }, dent: z, kor: z }))
      .toEqual([{ label: '의사', parts: '전문의 2명' }]);
  });
  it('병원 병상: 0보다 큰 칸만', () => {
    expect(hospitalVisibleBeds({ generalBedNormal: 10, erBed: 0 } as never).map((b) => b.key)).toEqual(['generalBedNormal']);
    expect(hospitalVisibleBeds(null)).toEqual([]);
  });
  it('병원 진료시간 표시: 요일 시간 또는 비고, 심평원 출처면 점심·휴진 문구도', () => {
    expect(hospitalHasHourInfo(null, null)).toBe(false);
    expect(hospitalHasHourInfo(null, { source: 'nemc', days: [], monday: null, note: '야간 진료', fetchedAt: null })).toBe(true);
    expect(hospitalHasHourInfo({ lunchWeekday: '12:30~13:30' } as never, null)).toBe(true);
    expect(hospitalHasHourInfo({ lunchWeekday: '12:30~13:30' } as never, { source: 'nemc', days: [], monday: null, note: null, fetchedAt: null })).toBe(false);
  });
  it('학교 기본 정보: 고교만 고교 항목 3개', () => {
    const base = { schoolKind: '중학교', foundType: '공립', coeduType: '남여공학', hsType: null, hsTrack: null, specialPurpose: null, admissionPeriod: null, foundedAt: null, anniversaryAt: null, eduOffice: '서울특별시교육청', tel: null };
    expect(schoolInfoRows(base as never)).toHaveLength(7);
    expect(schoolInfoRows({ ...base, schoolKind: '고등학교' } as never)).toHaveLength(10);
  });
  it('어린이집 기본 정보 10행(지역 포함), 운영상태 기본 정상', () => {
    const rows = childcareInfoRows({ address: 'a', tel: null, fax: null, homepage: null, repName: null, confirmDate: null, vehicleOp: null, services: null, status: null } as never, '서울 강남구');
    expect(rows).toHaveLength(10);
    expect(rows.find(([k]) => k === '운영상태')?.[1]).toBe('정상');
    expect(rows.find(([k]) => k === '인가일')?.[1]).toBe('-');
  });
  it('어린이집 교직원: 역할은 >0, 근속은 not null', () => {
    const r = childcareStaffRows({ emRoleTeacher: 3, emRoleCook: 0, emTenure0y: 0 } as never);
    expect(r.roleRows.map((x) => x.label)).toEqual(['보육교사']);
    expect(r.tenRows.map((x) => x.label)).toEqual(['1년 미만']);
  });
  it('어린이집 시설 4항목: 값 없으면 -', () => {
    const rows = childcareFacilityRows({ roomCount: 3, roomSize: null, playgroundCount: null, cctvCount: 5, staffCount: null } as never);
    expect(rows.map((r) => r.value)).toEqual(['3실', '-', '5대', '-']);
  });
  it('공원 기본 정보 6행(면적 순위 포함)', () => {
    expect(parkInfoRows({ parkType: '근린공원', area: 1000, designatedAt: null, managingOrg: null, tel: null } as never, null)).toHaveLength(6);
  });
  it('주차장 운영시간·부가 정보', () => {
    expect(parkingHourBlocks({ weekdayOpenHhmm: '09:00', weekdayCloseHhmm: null, satOpenHhmm: null, satCloseHhmm: null, holidayOpenHhmm: null, holidayCloseHhmm: null } as never).weekdayOpen).toBe('09:00');
    expect(parkingExtrasFlags({ pwdbsPpkZoneYn: false, enforceSe: null, feedingSe: null, spcmnt: '  ' } as never)).toEqual({ hasBadges: false, hasNote: false });
  });
  it('충전소 이용 안내: 타일·행', () => {
    const g = chargerGuideItems({ useTime: '24시간', parkingFree: null, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null }, []);
    expect(g.tiles.map((t) => t.label)).toEqual(['이용 시간']);
    expect(g.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/display-extract.test.ts`
Expected: FAIL — 추출 함수 import 실패

- [ ] **Step 3: 추출 구현** — 각 컴포넌트의 인라인 코드를 **그대로 옮기고** 컴포넌트는 함수를 호출하도록 바꾼다.

`lib/hospital/display.ts`:
```ts
// 병원 상세 탭의 표시 판정(컴포넌트·목록 점수 공용). 출력 규칙을 바꾸면 화면과 점수가 같이 바뀐다.
import type { HospitalWithRelations } from '@/lib/hospital';
import type { HoursView } from '@/lib/hospital/hours';

export type DoctorCounts = { general: number | null; intern: number | null; resident: number | null; specialist: number | null };
export interface HospitalDoctorInput { med: DoctorCounts; dent: DoctorCounts; kor: DoctorCounts }

// 자격별 인원을 "전문의 N명 · 레지던트 N명 · ..." 형태로 (0/null은 생략)
export function hospitalDoctorParts(c: DoctorCounts): string | null {
  const parts = ([
    ['specialist', '전문의'],
    ['resident', '레지던트'],
    ['intern', '인턴'],
    ['general', '일반의'],
  ] as const)
    .filter(([k]) => (c[k] ?? 0) > 0)
    .map(([k, label]) => `${label} ${c[k]}명`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function hospitalDoctorRows(d: HospitalDoctorInput): { label: string; parts: string }[] {
  return [
    { label: '의사', parts: hospitalDoctorParts(d.med) },
    { label: '치과의사', parts: hospitalDoctorParts(d.dent) },
    { label: '한의사', parts: hospitalDoctorParts(d.kor) },
  ].filter((r): r is { label: string; parts: string } => r.parts != null);
}

type DrFields = Pick<HospitalWithRelations,
  'drMedGeneral' | 'drMedIntern' | 'drMedResident' | 'drMedSpecialist' |
  'drDentGeneral' | 'drDentIntern' | 'drDentResident' | 'drDentSpecialist' |
  'drKorGeneral' | 'drKorIntern' | 'drKorResident' | 'drKorSpecialist'>;

export function hospitalDoctorsFrom(h: DrFields): HospitalDoctorInput {
  return {
    med: { general: h.drMedGeneral, intern: h.drMedIntern, resident: h.drMedResident, specialist: h.drMedSpecialist },
    dent: { general: h.drDentGeneral, intern: h.drDentIntern, resident: h.drDentResident, specialist: h.drDentSpecialist },
    kor: { general: h.drKorGeneral, intern: h.drKorIntern, resident: h.drKorResident, specialist: h.drKorSpecialist },
  };
}

// hospital-tab-facility.tsx의 BED_ROWS를 그대로 옮긴다(15종).
export const BED_ROWS = [
  { key: 'generalBedPremium', label: '일반병상(상급)' },
  { key: 'generalBedNormal', label: '일반병상(일반)' },
  { key: 'icuAdultBed', label: '중환자실(성인)' },
  { key: 'icuPediatricBed', label: '중환자실(소아)' },
  { key: 'icuNeonatalBed', label: '중환자실(신생아)' },
  { key: 'deliveryBed', label: '분만실' },
  { key: 'operatingRoomBed', label: '수술실' },
  { key: 'erBed', label: '응급실 병상' },
  { key: 'physicalTherapyBed', label: '물리치료실' },
  { key: 'isolationBed', label: '격리실' },
  { key: 'sterileRoomBed', label: '무균실' },
  { key: 'psychiatryClosedPremium', label: '정신병동(폐쇄·상급)' },
  { key: 'psychiatryClosedNormal', label: '정신병동(폐쇄·일반)' },
  { key: 'psychiatryOpenPremium', label: '정신병동(개방·상급)' },
  { key: 'psychiatryOpenNormal', label: '정신병동(개방·일반)' },
] as const;
export type BedKey = (typeof BED_ROWS)[number]['key'];

export function hospitalVisibleBeds(f: Partial<Record<BedKey, number | null>> | null): (typeof BED_ROWS)[number][] {
  if (!f) return [];
  return BED_ROWS.filter((r) => (f[r.key] ?? 0) > 0);
}

type DetailHourFields = Pick<NonNullable<HospitalWithRelations['detail']>, 'lunchWeekday' | 'lunchSaturday' | 'closedSunday' | 'closedHoliday'>;

// hospital-tab-operation.tsx의 hasHourInfo 규칙: 점심·휴진 문구는 심평원 출처일 때만.
export function hospitalHasHourInfo(detail: Partial<DetailHourFields> | null, hours: HoursView | null): boolean {
  const hira = hours?.source !== 'nemc';
  const days = hours?.days ?? [];
  return (
    days.length > 0 ||
    !!hours?.note ||
    (hira && !!(detail?.lunchWeekday || detail?.lunchSaturday || detail?.closedSunday || detail?.closedHoliday))
  );
}
```
- `hospital-tab-diagnosis.tsx`: 로컬 `DoctorCounts`·`doctorParts`·`doctorRows` 계산을 지우고 `hospitalDoctorRows(doctors)` 사용(Props의 `doctors.midwife`는 그대로).
- `hospital-tab-facility.tsx`: 로컬 `BED_ROWS`·`BedKey`를 지우고 `import { BED_ROWS, hospitalVisibleBeds } from '@/lib/hospital/display'`, `BED_ROWS.filter(...)`를 `hospitalVisibleBeds(facility)`로.
- `hospital-tab-operation.tsx`: `hasHourInfo` 계산을 `hospitalHasHourInfo(detail, hours)`로(`hira`·`days`는 렌더에 계속 쓰므로 유지).

`lib/school-display.ts`에 추가(school-info.tsx의 rows 배열을 그대로 옮김):
```ts
import type { School } from '@prisma/client';

export function schoolInfoRows(
  school: Pick<School, 'schoolKind' | 'foundType' | 'coeduType' | 'hsType' | 'hsTrack' | 'specialPurpose' | 'admissionPeriod' | 'foundedAt' | 'anniversaryAt' | 'eduOffice' | 'tel'>,
): [string, string | null][] {
  const high = isHighSchool(school.schoolKind);
  // '일반계'는 일반고에선 중복, 특목고에선 모순처럼 읽혀 붙이지 않는다. 전문계 등만 덧붙인다.
  const track = school.hsTrack && school.hsTrack !== '일반계' ? school.hsTrack : null;
  const hsTypeTrack = [school.hsType, track].filter(Boolean).join(' · ') || null;
  return [
    ['학교급', school.schoolKind],
    ['설립유형', school.foundType],
    ['남녀공학', school.coeduType],
    ...(high
      ? ([
          ['고교 유형', hsTypeTrack],
          ['특목고 계열', school.specialPurpose],
          ['입학 전형', school.admissionPeriod],
        ] as [string, string | null][])
      : []),
    ['설립일', formatYmd(school.foundedAt)],
    ['개교일', formatYmdKo(school.anniversaryAt)],
    ['관할 교육청', school.eduOffice],
    ['전화', school.tel],
  ];
}
```
(`isHighSchool`·`formatYmd`·`formatYmdKo`는 같은 파일에 이미 있음.) `school-info.tsx`는 `const rows = schoolInfoRows(school);`.

`lib/childcare.ts`에 추가(childcare-info·staff·facility의 배열을 그대로 옮김):
```ts
function fmtDate(d: Date | null): string {
  if (!d) return '-';
  return d.toISOString().slice(0, 10);
}

export function childcareInfoRows(
  item: Pick<Childcare, 'address' | 'tel' | 'fax' | 'homepage' | 'repName' | 'confirmDate' | 'vehicleOp' | 'services' | 'status'>,
  regionFullName: string,
): [string, string | null][] {
  return [
    ['지역', regionFullName],
    ['주소', item.address],
    ['전화', item.tel],
    ['팩스', item.fax],
    ['홈페이지', item.homepage],
    ['대표자', item.repName],
    ['인가일', fmtDate(item.confirmDate)],
    ['통학차량', item.vehicleOp],
    ['제공서비스', item.services],
    ['운영상태', item.status ?? '정상'],
  ];
}

export const CHILDCARE_ROLES = [
  ['emRoleDirector', '원장'], ['emRoleTeacher', '보육교사'], ['emRoleSpecial', '특수교사'],
  ['emRoleTherapy', '치료교사'], ['emRoleNutrition', '영양사'], ['emRoleNurse', '간호사'],
  ['emRoleNurseAssist', '간호조무사'], ['emRoleCook', '조리원'], ['emRoleOffice', '사무직원'],
] as const;
// 근속 구간은 실인원이 아니라 비율(%) — childcare-staff.tsx 주석 참고.
export const CHILDCARE_TENURES = [
  ['emTenure0y', '1년 미만'], ['emTenure1y', '1~2년'], ['emTenure2y', '2~4년'],
  ['emTenure4y', '4~6년'], ['emTenure6y', '6년 이상'],
] as const;

export function childcareStaffRows(item: Childcare) {
  const roleRows = CHILDCARE_ROLES.map(([k, label]) => ({ label, v: childcareCount(item, k) })).filter((r) => r.v != null && r.v > 0);
  const tenRows = CHILDCARE_TENURES.map(([k, label]) => ({ label, v: childcareCount(item, k) })).filter((r) => r.v != null);
  return { roleRows, tenRows };
}

export function childcareFacilityRows(
  item: Pick<Childcare, 'roomCount' | 'roomSize' | 'playgroundCount' | 'cctvCount' | 'staffCount'>,
): { label: string; value: string }[] {
  return [
    { label: '보육실', value: item.roomCount != null ? `${item.roomCount}실${item.roomSize != null ? ` · ${item.roomSize}㎡` : ''}` : '-' },
    { label: '놀이터', value: item.playgroundCount != null ? `${item.playgroundCount}개` : '-' },
    { label: 'CCTV', value: item.cctvCount != null ? `${item.cctvCount}대` : '-' },
    { label: '교직원', value: item.staffCount != null ? `${item.staffCount}명` : '-' },
  ];
}
```
`childcare-facility.tsx`의 배열이 위 4개와 다르면(항목 추가가 있으면) **컴포넌트 쪽을 기준**으로 옮기고 테스트 기대값을 맞춘다. 세 컴포넌트는 각각 `childcareInfoRows(item, regionFullName)`, `childcareStaffRows(item)`, `childcareFacilityRows(item)` 사용.

`lib/urban/park-display.ts`에 추가:
```ts
export function parkInfoRows(
  r: { parkType: string | null; area: number | null; designatedAt: Date | null; managingOrg: string | null; tel: string | null },
  areaRank: { rank: number; total: number; scope: string } | null | undefined,
): Array<[string, string | null]> {
  return [
    ['공원 유형', r.parkType],
    ['면적', formatParkArea(r.area)],
    ['면적 순위', areaRank ? `${areaRank.scope} ${areaRank.total}곳 중 ${areaRank.rank}위` : null],
    ['지정 고시일', r.designatedAt ? r.designatedAt.toISOString().slice(0, 10) : null],
    ['관리기관', r.managingOrg],
    ['전화', r.tel],
  ];
}
```
(`formatParkArea`는 `@/lib/urban/adapters/park`에서 import — 순환 import가 생기면 `parkInfoRows`를 `lib/urban/adapters/park.ts`에 두고 테스트 import 경로를 맞춘다.) `park-info.tsx`는 `const rows = parkInfoRows(r, areaRank);`.

`lib/urban/parking-display.ts`(신규):
```ts
// 주차장 상세의 표시 판정(컴포넌트·목록 점수 공용).
import type { HourBlocks } from '@/lib/urban/parking-hours';

type HourRow = { weekdayOpenHhmm: string | null; weekdayCloseHhmm: string | null; satOpenHhmm: string | null; satCloseHhmm: string | null; holidayOpenHhmm: string | null; holidayCloseHhmm: string | null };

export function parkingHourBlocks(row: HourRow): HourBlocks {
  return {
    weekdayOpen: row.weekdayOpenHhmm, weekdayClose: row.weekdayCloseHhmm,
    satOpen: row.satOpenHhmm, satClose: row.satCloseHhmm,
    holidayOpen: row.holidayOpenHhmm, holidayClose: row.holidayCloseHhmm,
  };
}

export function parkingExtrasFlags(row: { pwdbsPpkZoneYn: boolean | null; enforceSe: string | null; feedingSe: string | null; spcmnt: string | null }) {
  return {
    hasBadges: !!row.pwdbsPpkZoneYn || !!row.enforceSe || !!row.feedingSe,
    hasNote: (row.spcmnt ?? '').trim().length > 0,
  };
}
```
(`pwdbsPpkZoneYn`의 실제 타입은 `lib/urban/adapters/parking.ts`의 `ParkingRaw`를 따른다 — 문자열이면 타입만 맞추고 판정식 `row.pwdbsPpkZoneYn ||`는 기존과 같게.) `parking-hours-table.tsx`·`parking-extras.tsx`는 이 함수 사용.

`lib/urban/charger-display.ts`에 추가(charger-guide.tsx 그대로):
```ts
export interface ChargerGuideRaw {
  useTime: string | null; parkingFree: boolean | null; floorType: string | null; floorNum: number | null;
  facilityKind: string | null; operatorTel: string | null; locationDetail: string | null;
}

export function chargerGuideItems(raw: ChargerGuideRaw, units: { outputKw?: number | null; installYear?: number | null }[]) {
  const maxKw = maxOutputKw(units);
  const floor = floorLabel(raw.floorType, raw.floorNum);
  const tiles: { label: string; value: string }[] = [];
  if (raw.useTime) tiles.push({ label: '이용 시간', value: raw.useTime });
  if (maxKw !== null) tiles.push({ label: '출력', value: `최대 ${maxKw}kW` });
  if (raw.parkingFree !== null) tiles.push({ label: '주차료', value: raw.parkingFree ? '무료' : '유료' });
  if (floor) tiles.push({ label: '설치 위치', value: floor });
  const all: [string, string | null][] = [
    ['시설 구분', facilityKindLabel(raw.facilityKind)],
    ['운영사 연락처', raw.operatorTel],
    ['설치 연도', installYearRange(units)],
    ['상세 위치', raw.locationDetail],
  ];
  const rows = all.filter((r): r is [string, string] => !!r[1]);
  return { tiles, rows };
}
```
`charger-guide.tsx`는 `const { tiles, rows: shownRows } = chargerGuideItems(raw, units);`.

- [ ] **Step 4: 테스트·기존 테스트·타입 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/display-extract.test.ts && pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: 새 테스트 PASS 10/10, 기존 unit 전부 PASS, typecheck·lint 0 오류.

- [ ] **Step 5: 화면 불변 확인(로컬 e2e)** — 상세 화면 문구가 그대로인지 Playwright로 확인(메모리: UI 문구 변경 시 e2e 필수).

Run: `pnpm dotenv -e .env.test -- tsx tests/_helpers/seed-e2e.ts && pnpm test:e2e:local`
Expected: 기존 e2e 전부 PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/hospital/display.ts lib/urban/parking-display.ts lib/school-display.ts lib/childcare.ts lib/urban/park-display.ts lib/urban/charger-display.ts "app/(public)/medical/hospital/[sigunguCode]/[id]/_components" "app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx" "app/(public)/childcare/[sigunguCode]/[id]/_components" "app/(public)/urban/[category]/_components" "app/(public)/urban/charger/[id]/_components/charger-guide.tsx" tests/lib/content-score/display-extract.test.ts
git commit -m "refactor(detail): 상세 표시 판정을 lib 함수로 추출 — 목록 점수와 같은 판정 공유(출력 불변)"
```
커밋 후 `git show --stat HEAD`로 의도한 파일만 들어갔는지 확인(메모리: 커밋 범위 감사).

---

### Task 4: 의료·보육·학교 점수 함수(병원·약국·어린이집·학교)

**Files:**
- Create: `lib/content-score/hospital.ts`, `lib/content-score/pharmacy.ts`, `lib/content-score/childcare.ts`, `lib/content-score/school.ts`
- Test: `tests/lib/content-score/medical-school.test.ts`

**Interfaces:**
- Consumes: Task 2 `Breakdown, tier, nearbyPoints, filled`; Task 3 `hospitalDoctorRows, hospitalDoctorsFrom, hospitalVisibleBeds, hospitalHasHourInfo, schoolInfoRows, childcareInfoRows, childcareStaffRows, childcareFacilityRows`; 기존 `effectiveHours`(`lib/hospital/hours`), `buildPharmacyInfoRows`(`lib/pharmacy/utils`), `pharmacyYears`(`lib/pharmacy/context`), `isHighSchool`.
- Produces:
  - `ownHospital(h: HospitalScoreInput): Breakdown`, `weeklyHospital(f: { sameDept: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `ownPharmacy(p: PharmacyScoreInput, nowYear: number): Breakdown`, `weeklyPharmacy(f: { dong: boolean; sunday: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `ownChildcare(c: Childcare, hasLocation: boolean): Breakdown`, `weeklyChildcare(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `ownSchool(s: School, hasLocation: boolean): Breakdown`, `weeklySchool(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `type HospitalScoreInput = Pick<HospitalWithRelations, 'totalDoctors' | 'midwifeCount' | dr* 12개 | 'facility' | 'detail' | 'nemcHours'> & { counts: { depts; equipment; specialties; specialTreatments; nursingGrades; staff; transits; mealSurcharges: number }; hasLocation: boolean }`
  - `type PharmacyScoreInput = { typeName; openedAt; tel; zipcode; sido; sigungu; eupmyeondong; hasLocation: boolean }`

- [ ] **Step 1: 실패하는 테스트** — 유형별 최대 점수(스펙 §3)와 빈 상태 0점을 고정:

```ts
import { describe, it, expect } from 'vitest';
import { sum } from '@/lib/content-score/core';
import { ownHospital, weeklyHospital } from '@/lib/content-score/hospital';
import { ownPharmacy, weeklyPharmacy } from '@/lib/content-score/pharmacy';
import { ownChildcare, weeklyChildcare } from '@/lib/content-score/childcare';
import { ownSchool, weeklySchool } from '@/lib/content-score/school';

const dr0 = { drMedGeneral: null, drMedIntern: null, drMedResident: null, drMedSpecialist: null, drDentGeneral: null, drDentIntern: null, drDentResident: null, drDentSpecialist: null, drKorGeneral: null, drKorIntern: null, drKorResident: null, drKorSpecialist: null };
const zeroCounts = { depts: 0, equipment: 0, specialties: 0, specialTreatments: 0, nursingGrades: 0, staff: 0, transits: 0, mealSurcharges: 0 };
const emptyHospital = { ...dr0, totalDoctors: null, midwifeCount: null, facility: null, detail: null, nemcHours: null, counts: zeroCounts, hasLocation: false };

describe('병원 점수(최대 22)', () => {
  it('정보 없음 → 0', () => {
    expect(sum(ownHospital(emptyHospital as never))).toBe(0);
    expect(sum(weeklyHospital({ sameDept: false, apts: false, subway: false, infra: false }))).toBe(0);
  });
  it('병상 0개뿐인 시설 정보는 0점(빈 표)', () => {
    expect(ownHospital({ ...emptyHospital, facility: { foundTypeName: null, generalBedNormal: 0 } } as never).facility).toBe(0);
    expect(ownHospital({ ...emptyHospital, facility: { foundTypeName: '법인' } } as never).facility).toBe(1);
  });
  it('모든 블록 → 22', () => {
    const full = {
      ...dr0, drMedSpecialist: 12, totalDoctors: 12, midwifeCount: 0,
      facility: { foundTypeName: '법인', generalBedNormal: 100 },
      detail: { openMon: 900, closeMon: 1800, erDayOpen: 'Y', erNightOpen: null, parkingCapacity: 30, lunchWeekday: null, lunchSaturday: null, closedSunday: null, closedHoliday: null },
      nemcHours: null,
      counts: { depts: 8, equipment: 2, specialties: 1, specialTreatments: 0, nursingGrades: 1, staff: 3, transits: 2, mealSurcharges: 1 },
      hasLocation: true,
    };
    expect(sum(ownHospital(full as never)) + sum(weeklyHospital({ sameDept: true, apts: true, subway: true, infra: true }))).toBe(22);
  });
});

describe('약국 점수(최대 9)', () => {
  it('전부 → 9, 주변은 2점 상한', () => {
    const p = { typeName: '약국', openedAt: new Date('2010-01-01T00:00:00Z'), tel: '02', zipcode: '1', sido: '서울', sigungu: '강남구', eupmyeondong: '역삼동', hasLocation: true };
    expect(sum(ownPharmacy(p, 2026)) + sum(weeklyPharmacy({ dong: true, sunday: true, apts: true, subway: true, infra: true }))).toBe(9);
  });
  it('기본 정보 2행 이하 → 깊이 0', () => {
    expect(ownPharmacy({ typeName: '약국', openedAt: null, tel: '02', zipcode: null, sido: null, sigungu: null, eupmyeondong: null, hasLocation: false }, 2026).depth).toBe(0);
  });
});

const cc0 = { address: 'a', tel: null, fax: null, homepage: null, repName: null, confirmDate: null, vehicleOp: null, services: null, status: null, roomCount: null, roomSize: null, playgroundCount: null, cctvCount: null, staffCount: null, classCntTot: null, childCntTot: null, waitCntTot: null };

describe('어린이집 점수(최대 14)', () => {
  it('시설 전부 - 이면 시설 0점', () => {
    expect(ownChildcare(cc0 as never, false).facility).toBe(0);
  });
  it('전부 → 14', () => {
    const c = { ...cc0, tel: '02', fax: '02', homepage: 'h', repName: 'r', confirmDate: new Date(), vehicleOp: '운영', services: '일반', status: '정상', roomCount: 3, playgroundCount: 1, cctvCount: 5, staffCount: 4, classCntTot: 3, childCntTot: 40, waitCntTot: 2, emRoleTeacher: 4 };
    expect(sum(ownChildcare(c as never, true)) + sum(weeklyChildcare({ childcare: true, apts: true, subway: true, infra: true }))).toBe(14);
  });
});

const sc0 = { schoolKind: '고등학교', foundType: null, coeduType: null, hsType: null, hsTrack: null, specialPurpose: null, admissionPeriod: null, foundedAt: null, anniversaryAt: null, eduOffice: null, tel: null, homepage: null };

describe('학교 점수(고교 최대 9, 초·중 최대 8)', () => {
  it('고교 전부 → 9', () => {
    const s = { ...sc0, foundType: '공립', coeduType: '남여공학', hsType: '일반고', specialPurpose: '-', admissionPeriod: '전기', foundedAt: new Date(), anniversaryAt: new Date(), eduOffice: '교육청', tel: '02', homepage: 'h' };
    expect(sum(ownSchool({ ...s, specialPurpose: '과학' } as never, true)) + sum(weeklySchool({ childcare: true, apts: true, subway: true, infra: true }))).toBe(9);
  });
  it('중학교는 고교 블록 없음 → 최대 8', () => {
    const s = { ...sc0, schoolKind: '중학교', foundType: '공립', coeduType: '남여공학', foundedAt: new Date(), anniversaryAt: new Date(), eduOffice: '교육청', tel: '02' };
    expect(sum(ownSchool(s as never, true)) + sum(weeklySchool({ childcare: true, apts: true, subway: true, infra: true }))).toBe(8);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/medical-school.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`lib/content-score/hospital.ts`:
```ts
// 병원 상세 내용 점수(최대 22) — 설계 §3.2. 판정은 상세 탭과 같은 함수(lib/hospital/display).
import type { HospitalWithRelations } from '@/lib/hospital';
import { effectiveHours } from '@/lib/hospital/hours';
import { hospitalDoctorRows, hospitalDoctorsFrom, hospitalVisibleBeds, hospitalHasHourInfo } from '@/lib/hospital/display';
import { type Breakdown, tier, nearbyPoints } from './core';

export interface HospitalCounts {
  depts: number; equipment: number; specialties: number; specialTreatments: number;
  nursingGrades: number; staff: number; transits: number; mealSurcharges: number;
}

export type HospitalScoreInput = Pick<HospitalWithRelations,
  'totalDoctors' | 'midwifeCount' | 'facility' | 'detail' | 'nemcHours' |
  'drMedGeneral' | 'drMedIntern' | 'drMedResident' | 'drMedSpecialist' |
  'drDentGeneral' | 'drDentIntern' | 'drDentResident' | 'drDentSpecialist' |
  'drKorGeneral' | 'drKorIntern' | 'drKorResident' | 'drKorSpecialist'> & { counts: HospitalCounts; hasLocation: boolean };

export function ownHospital(h: HospitalScoreInput): Breakdown {
  const hours = effectiveHours(h.detail, h.nemcHours);
  const hoursView = hours ? { source: hours.source, days: hours.days, monday: hours.monday, note: hours.note, fetchedAt: hours.fetchedAt } : null;
  const doctorShown = hospitalDoctorRows(hospitalDoctorsFrom(h)).length > 0 || (h.midwifeCount ?? 0) > 0;
  const facilityShown = !!h.facility && (!!h.facility.foundTypeName || hospitalVisibleBeds(h.facility).length > 0);
  const c = h.counts;
  return {
    depthDepts: tier(c.depts, [1, 4]),
    depthDoctors: tier(h.totalDoctors, [1, 5]),
    depts: c.depts > 0 ? 2 : 0,
    doctors: doctorShown ? 2 : 0,
    hours: hospitalHasHourInfo(h.detail, hoursView) ? 2 : 0,
    facility: facilityShown ? 1 : 0,
    equipment: c.equipment > 0 ? 1 : 0,
    specialty: c.specialties + c.specialTreatments > 0 ? 1 : 0,
    nursing: c.nursingGrades > 0 ? 1 : 0,
    staff: c.staff > 0 ? 1 : 0,
    er: h.detail && (h.detail.erDayOpen != null || h.detail.erNightOpen != null) ? 1 : 0,
    parking: h.detail?.parkingCapacity != null ? 1 : 0,
    transit: c.transits > 0 ? 1 : 0,
    meal: c.mealSurcharges > 0 ? 1 : 0,
    map: h.hasLocation ? 1 : 0,
  };
}

/** 주간: 같은 진료과 비교·주변 아파트·지하철·생활 인프라(합계 최대 2) */
export function weeklyHospital(f: { sameDept: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.sameDept, f.apts, f.subway, f.infra]) };
}
```

`lib/content-score/pharmacy.ts`:
```ts
// 약국 상세 내용 점수(최대 9) — 설계 §3.3
import { buildPharmacyInfoRows } from '@/lib/pharmacy/utils';
import { pharmacyYears } from '@/lib/pharmacy/context';
import { type Breakdown, tier, nearbyPoints } from './core';

export interface PharmacyScoreInput {
  typeName: string | null; openedAt: Date | null; tel: string | null; zipcode: string | null;
  sido: string | null; sigungu: string | null; eupmyeondong: string | null; hasLocation: boolean;
}

export function ownPharmacy(p: PharmacyScoreInput, nowYear: number): Breakdown {
  return {
    depth: tier(buildPharmacyInfoRows(p).length, [3, 4]),
    years: pharmacyYears(p.openedAt, nowYear) !== null ? 2 : 0,
    map: p.hasLocation ? 1 : 0,
  };
}

/** 주간: 같은 동 약국(부가 1)·도보권 일요일 진료(부가 1)·주변(최대 2) */
export function weeklyPharmacy(f: { dong: boolean; sunday: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return {
    dong: f.dong ? 1 : 0,
    sunday: f.sunday ? 1 : 0,
    nearby: nearbyPoints([f.apts, f.subway, f.infra]),
  };
}
```

`lib/content-score/childcare.ts`:
```ts
// 어린이집 상세 내용 점수(최대 14) — 설계 §3.4
import type { Childcare } from '@prisma/client';
import { childcareInfoRows, childcareStaffRows, childcareFacilityRows } from '@/lib/childcare';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownChildcare(c: Childcare, hasLocation: boolean): Breakdown {
  // '지역'은 지역 이름이라 시설 정보가 아니다 — 9항목만 센다.
  const info = childcareInfoRows(c, '').filter(([k]) => k !== '지역');
  const infoFilled = info.filter(([, v]) => filled(v)).length;
  const fac = childcareFacilityRows(c).filter((r) => filled(r.value)).length;
  const staff = childcareStaffRows(c);
  return {
    depthInfo: tier(infoFilled, [4, 6, 8]),
    depthFacility: fac >= 3 ? 1 : 0,
    ages: c.classCntTot != null || c.childCntTot != null ? 2 : 0,
    staff: staff.roleRows.length + staff.tenRows.length > 0 ? 2 : 0,
    facility: fac > 0 ? 2 : 0,
    wait: c.waitCntTot != null && c.waitCntTot > 0 ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

export function weeklyChildcare(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.childcare, f.apts, f.subway, f.infra]) };
}
```

`lib/content-score/school.ts`:
```ts
// 학교 상세 내용 점수(고교 최대 9, 초·중 8) — 설계 §3.5
import type { School } from '@prisma/client';
import { schoolInfoRows, isHighSchool } from '@/lib/school-display';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownSchool(s: School, hasLocation: boolean): Breakdown {
  const rows = schoolInfoRows(s);
  const pct = rows.length ? (rows.filter(([, v]) => filled(v)).length / rows.length) * 100 : 0;
  const high = isHighSchool(s.schoolKind);
  const hsShown = high && rows.some(([k, v]) => (k === '고교 유형' || k === '특목고 계열' || k === '입학 전형') && filled(v));
  return {
    depth: tier(pct, [50, 70, 90]),
    contact: filled(s.tel) || filled(s.homepage) ? 2 : 0, // 전화는 정보 표·Hero, 홈페이지는 Hero 링크
    map: hasLocation ? 1 : 0,
    highSchool: hsShown ? 1 : 0,
  };
}

export function weeklySchool(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.childcare, f.apts, f.subway, f.infra]) };
}
```

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/medical-school.test.ts`
Expected: PASS 9/9. 최대 점수가 다르면 **스펙 §3 표가 기준** — 함수 쪽을 고친다.

- [ ] **Step 5: Commit**

```bash
git add lib/content-score/hospital.ts lib/content-score/pharmacy.ts lib/content-score/childcare.ts lib/content-score/school.ts tests/lib/content-score/medical-school.test.ts
git commit -m "feat(content-score): 병원·약국·어린이집·학교 점수 함수"
```

---

### Task 5: 도시시설 점수 함수(공원·주차장·충전소)

**Files:**
- Create: `lib/content-score/park.ts`, `lib/content-score/parking.ts`, `lib/content-score/charger.ts`
- Test: `tests/lib/content-score/urban.test.ts`

**Interfaces:**
- Consumes: Task 2 유틸; Task 3 `parkInfoRows, parkingHourBlocks, parkingExtrasFlags, chargerGuideItems`; 기존 `parkFacilityGroups`, `normalizeFees`, `hasAnyHours`, `parkingAdapter/chargerAdapter.detailFields`(`lib/urban/category`의 정의).
- Produces:
  - `ownPark(r: ParkRaw, hasLocation: boolean): Breakdown`, `weeklyPark(f: { areaRank: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `ownParking(r: ParkingRaw, hasLocation: boolean): Breakdown`, `weeklyParking(f: { feeCompare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown`
  - `feeCompareShown(cmp: ParkingFeeComparison | null): boolean`
  - `ownCharger(r: { operatorName: string | null } & ChargerGuideRaw, units: { outputKw: number | null; installYear: number | null }[], hasLocation: boolean): Breakdown`, `weeklyCharger(f: { apts: boolean; subway: boolean; infra: boolean }): Breakdown`

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { sum } from '@/lib/content-score/core';
import { ownPark, weeklyPark } from '@/lib/content-score/park';
import { ownParking, weeklyParking, feeCompareShown } from '@/lib/content-score/parking';
import { ownCharger, weeklyCharger } from '@/lib/content-score/charger';

const allNear = { apts: true, subway: true, infra: true };

describe('공원(최대 10)', () => {
  it('전부 → 10, 좌표 없으면 지도 0', () => {
    const r = { parkType: '근린공원', area: 5000, designatedAt: new Date(), managingOrg: '구청', tel: '02', facilityPlay: '그네', facilitySport: null, facilityConvenience: null, facilityCulture: null };
    expect(sum(ownPark(r as never, true)) + sum(weeklyPark({ areaRank: true, ...allNear }))).toBe(10);
    expect(ownPark(r as never, false).map).toBe(0);
  });
});

describe('주차장(최대 11)', () => {
  const base = { prkplceSe: '공영', prkplceType: '노외', rdnmadr: 'r', lnmadr: 'l', institutionNm: 'i', insttNm: null, phoneNumber: '02', referenceDate: new Date(), metpay: '카드',
    chargeInfo: '유료', basicTime: 30, basicCharge: 1000, addUnitTime: null, addUnitCharge: null, dayCmmtkt: null, monthCmmtkt: null,
    weekdayOpenHhmm: '09:00', weekdayCloseHhmm: '18:00', satOpenHhmm: null, satCloseHhmm: null, holidayOpenHhmm: null, holidayCloseHhmm: null,
    pwdbsPpkZoneYn: true, enforceSe: null, feedingSe: null, spcmnt: null };
  it('전부 → 11', () => {
    expect(sum(ownParking(base as never, true)) + sum(weeklyParking({ feeCompare: true, ...allNear }))).toBe(11);
  });
  it('요금 정보 없음(빈 상태 카드) → 요금 0점', () => {
    expect(ownParking({ ...base, chargeInfo: '유료', basicTime: null, basicCharge: null } as never, true).fee).toBe(0);
    expect(ownParking({ ...base, chargeInfo: '무료', basicTime: null, basicCharge: null } as never, true).fee).toBe(2);
  });
  it('요금 비교: 비교 타일이 하나라도 있어야', () => {
    expect(feeCompareShown(null)).toBe(false);
    expect(feeCompareShown({ own30: 1000, median30: null, count30: 2, ownMonthly: null, medianMonthly: null, countMonthly: 0 })).toBe(false);
    expect(feeCompareShown({ own30: 1000, median30: 900, count30: 5, ownMonthly: null, medianMonthly: null, countMonthly: 0 })).toBe(true);
  });
});

describe('충전소(최대 11)', () => {
  const raw = { operatorName: '환경부', useTime: '24시간', parkingFree: true, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null };
  it('충전기 10대 이상·전부 → 11', () => {
    const units = Array.from({ length: 10 }, () => ({ outputKw: 50, installYear: 2020 }));
    expect(sum(ownCharger(raw, units, true)) + sum(weeklyCharger(allNear))).toBe(11);
  });
  it('충전기 없음 → 상태 표 0·깊이 0', () => {
    const b = ownCharger({ ...raw, operatorName: null }, [], false);
    expect(b.status).toBe(0);
    expect(b.depth).toBe(0);
    expect(b.operator).toBe(0);
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/urban.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`lib/content-score/park.ts`:
```ts
// 공원 상세 내용 점수(최대 10) — 설계 §3.6
import { parkFacilityGroups, parkInfoRows } from '@/lib/urban/park-display';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownPark(r: ParkRaw, hasLocation: boolean): Breakdown {
  // 면적 순위는 주간 계산(weeklyPark) — 여기선 그 행을 빼고 5항목만 센다.
  const info = parkInfoRows(r, null).filter(([k]) => k !== '면적 순위');
  return {
    depth: tier(info.filter(([, v]) => filled(v)).length, [3, 4, 5]),
    facilities: parkFacilityGroups(r).length > 0 ? 2 : 0,
    map: hasLocation ? 1 : 0, // 좌표 없으면 상세는 빈 상태 카드
  };
}

export function weeklyPark(f: { areaRank: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { areaRank: f.areaRank ? 2 : 0, nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
```

`lib/content-score/parking.ts`:
```ts
// 주차장 상세 내용 점수(최대 11) — 설계 §3.7
import { normalizeFees } from '@/lib/urban/parking-fees';
import { hasAnyHours } from '@/lib/urban/parking-hours';
import { parkingHourBlocks, parkingExtrasFlags } from '@/lib/urban/parking-display';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import type { ParkingFeeComparison } from '@/lib/urban/parking-context';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownParking(r: ParkingRaw, hasLocation: boolean): Breakdown {
  const fee = normalizeFees(r);
  const def = getUrbanCategoryDef('parking')!;
  const fields = def.detailFields({ id: r.id, name: r.name, address: r.address, sigunguCode: null, raw: r }, { regionFullName: '' });
  const extras = parkingExtrasFlags(r);
  return {
    depth: tier(fields.filter((f) => filled(f.value)).length, [4, 7]),
    fee: fee.free || fee.items.length > 0 ? 2 : 0, // 그 외는 "요금 정보가 등록되어 있지 않습니다" 카드
    hours: hasAnyHours(parkingHourBlocks(r)) ? 2 : 0,
    extras: extras.hasBadges || extras.hasNote ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

/** parking-fee-compare.tsx의 타일 조건 그대로 */
export function feeCompareShown(cmp: ParkingFeeComparison | null): boolean {
  if (!cmp) return false;
  return (cmp.own30 !== null && cmp.median30 !== null) || (cmp.ownMonthly !== null && cmp.medianMonthly !== null);
}

export function weeklyParking(f: { feeCompare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { feeCompare: f.feeCompare ? 1 : 0, nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
```
(`detailFields`의 두 번째 인자 형태는 `lib/urban/category.ts`의 `UrbanCategoryDef` 시그니처에 맞춘다.)

`lib/content-score/charger.ts`:
```ts
// 전기차충전소 상세 내용 점수(최대 11) — 설계 §3.8
import { chargerGuideItems, type ChargerGuideRaw } from '@/lib/urban/charger-display';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownCharger(
  r: { operatorName: string | null } & ChargerGuideRaw,
  units: { outputKw: number | null; installYear: number | null }[],
  hasLocation: boolean,
): Breakdown {
  const g = chargerGuideItems(r, units);
  return {
    depth: tier(units.length, [2, 5, 10]),
    status: units.length > 0 ? 2 : 0,
    guide: g.tiles.length + g.rows.length > 0 ? 2 : 0,
    operator: filled(r.operatorName) ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

export function weeklyCharger(f: { apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
```

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/lib/content-score/urban.test.ts && pnpm typecheck`
Expected: PASS 6/6, typecheck 0.

- [ ] **Step 5: Commit**

```bash
git add lib/content-score/park.ts lib/content-score/parking.ts lib/content-score/charger.ts tests/lib/content-score/urban.test.ts
git commit -m "feat(content-score): 공원·주차장·충전소 점수 함수"
```

---

### Task 6: 주간 주변 판정 SQL + 상세 함수와의 일치 테스트

**Files:**
- Create: `lib/content-score/nearby-sql.ts`
- Test: `tests/integration/content-score-nearby.test.ts`

**Interfaces:**
- Consumes: 상세가 쓰는 반경 — 아파트 1000m(`getNearbyApartments` 기본값), 지하철 5000m(`FALLBACK_MAX_METERS`, 800m 안이 없으면 5km 안 최근접을 보여주므로 "표시 여부"는 5km), 인프라(R2: 병원·약국·주차장·충전소 500m, 공원·어린이집 1000m), 주변 어린이집 1000m.
- Produces:
  - `type NearbyTable = 'Hospital' | 'Pharmacy' | 'Childcare' | 'School' | 'Park' | 'Parking' | 'EvCharger'`
  - `nearbyFlags(table: NearbyTable, ids: bigint[], opts: { infraChildcare: boolean; nearChildcare: boolean }): Promise<Map<string, { apts: boolean; subway: boolean; infra: boolean; childcare: boolean }>>` — 좌표 없는 행은 Map에 없음(=전부 false)
  - `NEARBY_RADIUS` 상수

- [ ] **Step 1: 실패하는 통합 테스트** — 바다 좌표(실데이터와 겹치지 않음)에 시드하고, SQL 판정이 상세 함수 결과(`length > 0`)와 같은지 비교:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { nearbyFlags } from '@/lib/content-score/nearby-sql';
import { getNearbyApartments, getNearbyInfra, getNearbyChildcare } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';

// 동해 바다 좌표(실데이터 없음). A: 주변이 꽉 찬 점, B: 아무것도 없는 점(A에서 50km)
const A = { lat: 37.9, lng: 130.0 };
const B = { lat: 37.9, lng: 130.6 };
const pt = (p: { lat: number; lng: number }) => `ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;
let hA: bigint, hB: bigint;

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Pharmacy" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SubwayStation" WHERE name LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Property" WHERE name LIKE 'UT-CS-%'`);
  const ins = async (sql: string) => (await prisma.$queryRawUnsafe<{ id: bigint }[]>(sql))[0].id;
  hA = await ins(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,location,"updatedAt") VALUES ('UT-CS-HA','UT병원A','31','의원','UT',${pt(A)},now()) RETURNING id`);
  hB = await ins(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,location,"updatedAt") VALUES ('UT-CS-HB','UT병원B','31','의원','UT',${pt(B)},now()) RETURNING id`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Pharmacy"("sourceId",name,address,location,"updatedAt") VALUES ('UT-CS-RA','UT약국','UT',${pt({ lat: A.lat + 0.001, lng: A.lng })},now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO "SubwayStation"(name,lines,location) VALUES ('UT-CS-역','{}',${pt({ lat: A.lat + 0.02, lng: A.lng })})`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Pharmacy" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SubwayStation" WHERE name LIKE 'UT-CS-%'`);
});

describe('주변 판정 SQL = 상세 함수', () => {
  it('병원 A/B: 아파트·지하철·인프라가 상세 함수 결과와 같다', async () => {
    const m = await nearbyFlags('Hospital', [hA, hB], { infraChildcare: true, nearChildcare: false });
    for (const [id, p] of [[hA, A], [hB, B]] as const) {
      const f = m.get(String(id))!;
      const apts = await getNearbyApartments(p.lat, p.lng);
      const sub = await getNearbySubwayStations(p.lat, p.lng);
      const infra = await getNearbyInfra(p.lat, p.lng, { excludeHospitalId: id, includeChildcare: true });
      expect(f.apts).toBe(apts.length > 0);
      expect(f.subway).toBe(sub.stations.length > 0);
      expect(f.infra).toBe(infra.length > 0); // 시드에 상가 없음(R2 범위 안)
    }
    expect(m.get(String(hA))!.infra).toBe(true);
    expect(m.get(String(hB))!.subway).toBe(false);
  });
  it('자기 자신은 인프라에 세지 않는다', async () => {
    const m = await nearbyFlags('Hospital', [hB], { infraChildcare: true, nearChildcare: false });
    expect(m.get(String(hB))!.infra).toBe(false);
  });
  it('좌표 없는 행은 결과에 없다', async () => {
    const id = (await prisma.$queryRawUnsafe<{ id: bigint }[]>(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,"updatedAt") VALUES ('UT-CS-HN','UT무좌표','31','의원','UT',now()) RETURNING id`))[0].id;
    const m = await nearbyFlags('Hospital', [id], { infraChildcare: true, nearChildcare: false });
    expect(m.has(String(id))).toBe(false);
  });
  it('주변 어린이집 판정은 getNearbyChildcare와 같다(자기 제외)', async () => {
    const m = await nearbyFlags('Hospital', [hA], { infraChildcare: false, nearChildcare: true });
    const cc = await getNearbyChildcare(A.lat, A.lng, 1000, 5);
    expect(m.get(String(hA))!.childcare).toBe(cc.length > 0);
  });
});
```
(시드 컬럼이 스키마의 NOT NULL과 다르면 — 예: `SubwayStation.lines` 타입 — `prisma/schema.prisma`를 보고 최소 필수 컬럼만 맞춘다. `tests/integration/subway-nearby.test.ts`의 시드 방식을 그대로 따른다.)

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-nearby.test.ts`
Expected: FAIL — `nearby-sql` 모듈 없음

- [ ] **Step 3: 구현** `lib/content-score/nearby-sql.ts`:

```ts
/**
 * 주간 주변 판정(목록 점수). 상세 페이지의 주변 블록이 "결과 1건 이상"일 때 보이는 것과 같은 조건을
 * 공간 인덱스(GIST) EXISTS로 id 청크 단위 일괄 판정한다 — 행마다 상세 함수를 부르면(정렬·LIMIT 포함) 비싸다.
 * 반경·필터는 lib/amenity/nearby.ts·lib/subway/nearby.ts와 같아야 한다(tests/integration/content-score-nearby.test.ts가 대조).
 * 생활 인프라는 상가(Store)를 뺀 6종으로 판정(설계 R2 — 상가는 업종 분류·숨김 규칙 때문에 EXISTS로 재현 불가).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type NearbyTable = 'Hospital' | 'Pharmacy' | 'Childcare' | 'School' | 'Park' | 'Parking' | 'EvCharger';

export const NEARBY_RADIUS = {
  apts: 1000, // getNearbyApartments 기본
  subway: 5000, // getNearbySubwayStations: 800m 안 없으면 5km 안 최근접 표시
  hospital: 500, pharmacy: 500, parking: 500, charger: 500, // getNearbyInfra
  park: 1000, childcareInfra: 1000,
  childcare: 1000, // 주변 어린이집 섹션
} as const;

export interface NearbyFlag { apts: boolean; subway: boolean; infra: boolean; childcare: boolean }

const CC_ACTIVE = Prisma.sql`("status" IN ('정상', '재개') OR "status" IS NULL)`;

function infraExists(table: NearbyTable, withChildcare: boolean): Prisma.Sql {
  const self = (t: NearbyTable) => (t === table ? Prisma.sql`AND x.id <> t.id` : Prisma.empty);
  const r = NEARBY_RADIUS;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "Hospital" x WHERE x.location IS NOT NULL ${self('Hospital')} AND ST_DWithin(x.location, t.location, ${r.hospital}))
    OR EXISTS (SELECT 1 FROM "Pharmacy" x WHERE x.location IS NOT NULL ${self('Pharmacy')} AND ST_DWithin(x.location, t.location, ${r.pharmacy}))
    OR EXISTS (SELECT 1 FROM "Park" x WHERE x.location IS NOT NULL ${self('Park')} AND ST_DWithin(x.location, t.location, ${r.park}))
    OR EXISTS (SELECT 1 FROM "EvCharger" x WHERE x.location IS NOT NULL ${self('EvCharger')} AND ST_DWithin(x.location, t.location, ${r.charger}))
    OR EXISTS (SELECT 1 FROM "Parking" x WHERE x.location IS NOT NULL ${self('Parking')} AND ST_DWithin(x.location, t.location, ${r.parking}))
    ${withChildcare ? Prisma.sql`OR EXISTS (SELECT 1 FROM "Childcare" x WHERE x.location IS NOT NULL AND ${CC_ACTIVE} AND ST_DWithin(x.location, t.location, ${r.childcareInfra}))` : Prisma.empty}
  )`;
}

export async function nearbyFlags(
  table: NearbyTable,
  ids: bigint[],
  opts: { infraChildcare: boolean; nearChildcare: boolean },
): Promise<Map<string, NearbyFlag>> {
  if (ids.length === 0) return new Map();
  const r = NEARBY_RADIUS;
  const nearCc = opts.nearChildcare
    ? Prisma.sql`EXISTS (SELECT 1 FROM "Childcare" x WHERE x.location IS NOT NULL AND ${CC_ACTIVE} ${table === 'Childcare' ? Prisma.sql`AND x.id <> t.id` : Prisma.empty} AND ST_DWithin(x.location, t.location, ${r.childcare}))`
    : Prisma.sql`false`;
  const rows = await prisma.$queryRaw<{ id: bigint; apts: boolean; subway: boolean; infra: boolean; childcare: boolean }[]>`
    SELECT t.id,
      EXISTS (SELECT 1 FROM "Property" p WHERE p."propertyType" = 'APARTMENT' AND p.location IS NOT NULL AND p."txCount12m" > 0
              AND ST_DWithin(p.location, t.location, ${r.apts})) AS apts,
      EXISTS (SELECT 1 FROM "SubwayStation" s WHERE s.location IS NOT NULL AND ST_DWithin(s.location, t.location, ${r.subway})) AS subway,
      ${infraExists(table, opts.infraChildcare)} AS infra,
      ${nearCc} AS childcare
    FROM ${Prisma.raw(`"${table}"`)} t
    WHERE t.id = ANY(${ids}::bigint[]) AND t.location IS NOT NULL
  `;
  return new Map(rows.map((x) => [String(x.id), { apts: x.apts, subway: x.subway, infra: x.infra, childcare: x.childcare }]));
}
```
`getNearbyApartments`의 WHERE에 위 조건 외 다른 조건(예: `redirectToId IS NULL`)이 있으면 **그 조건을 그대로 추가**한다 — 테스트가 일치를 강제한다.

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-nearby.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add lib/content-score/nearby-sql.ts tests/integration/content-score-nearby.test.ts
git commit -m "feat(content-score): 주간 주변 판정 SQL — 상세 함수와 같은 반경·필터(일치 테스트)"
```

---

### Task 7: 배치 러너(daily/weekly)

**Files:**
- Create: `scripts/ingest/content-score/entities.ts`, `scripts/ingest/content-score/runner.ts`
- Modify: `package.json` (script `ingest:content-score`)
- Test: `tests/integration/content-score-runner.test.ts`

**Interfaces:**
- Consumes: Task 4·5 점수 함수, Task 6 `nearbyFlags`, 기존 `getSameDeptNearby`·`primaryDept`(`lib/hospital/context`), `getPharmacyDong`·`countSundayClinicsNearby`(`lib/pharmacy/context`), `getParkAreaRank`(`lib/urban/park-context`), `getParkingFeeComparison`(`lib/urban/parking-context`), `resolveSigunguFromAddress`(`lib/region/from-address`), `resolveAddrPrefix`(`lib/urban/_shared`).
- Produces:
  - `type EntityKey = 'hospital' | 'pharmacy' | 'childcare' | 'school' | 'park' | 'parking' | 'charger'`
  - `runContentScore(opts: { entities: EntityKey[]; mode: 'daily' | 'weekly'; chunk?: number; pauseMs?: number }): Promise<{ entity: EntityKey; scanned: number; updated: number; ms: number }[]>`
  - CLI: `pnpm ingest:content-score --mode=daily|weekly [--entity=hospital,park] [--chunk=1000] [--pause-ms=200]`

**규칙:**
- 청크: `id > lastId ORDER BY id LIMIT chunk` 커서(오프셋 금지).
- daily: `own(row) + 저장된 contentNearby` → `contentScore`, `listRank`.
- weekly: `weekly(row)` 계산 → `contentNearby` 저장 후 daily와 같은 합산.
- UPDATE는 `unnest` 배열 + `IS DISTINCT FROM`으로 바뀐 행만, `updatedAt` 미변경.
- 청크 사이 `pauseMs` 쉬기(기본 daily 0, weekly 200).
- 시작·끝을 `IngestionRun`(`source='content-score'`, `targetKey='<mode>:<entity>'`)에 기록, 실패 시 `status='ERROR'`·errorMessage.

- [ ] **Step 1: 실패하는 통합 테스트**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { runContentScore } from '@/scripts/ingest/content-score/runner';

const pt = (lat: number, lng: number) => `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
let rich: bigint, poor: bigint, seoul: bigint;
const before = new Date('2020-01-01T00:00:00Z');

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CSR-%'`);
  const ins = async (src: string, sgg: string, loc: string | null) =>
    (await prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,"sigunguCode","totalDoctors",location,"updatedAt")
       VALUES ('${src}','UT${src}','31','의원','UT','${sgg}',${src.endsWith('RICH') || src.endsWith('SEOUL') ? 6 : 'NULL'},${loc ?? 'NULL'},'${before.toISOString()}') RETURNING id`))[0].id;
  rich = await ins('UT-CSR-RICH', '99999', pt(37.9, 130.0));
  poor = await ins('UT-CSR-POOR', '99999', null);
  seoul = await ins('UT-CSR-SEOUL', '11680', null);
  for (const h of [rich, seoul]) {
    await prisma.hospitalDept.createMany({ data: ['01', '02', '03', '04'].map((c) => ({ hospitalId: h, deptCode: c, deptName: `과${c}` })) });
  }
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CSR-%'`);
});

const read = (id: bigint) => prisma.hospital.findUniqueOrThrow({ where: { id }, select: { contentScore: true, contentNearby: true, listRank: true, updatedAt: true } });

describe('content-score runner', () => {
  it('daily: 점수·정렬 키 계산, updatedAt 불변', async () => {
    await runContentScore({ entities: ['hospital'], mode: 'daily' });
    const r = await read(rich); const p = await read(poor); const s = await read(seoul);
    // rich: 깊이(과 4→2, 의사 6→2) + 진료과 2 + 의료진(totalDoctors만으론 행 없음 → 0) + 지도 1 = 7
    expect(r.contentScore).toBe(7);
    expect(p.contentScore).toBe(0);
    expect(s.listRank).toBe(10000 + s.contentScore); // 서울
    expect(r.listRank).toBe(r.contentScore);
    expect(r.updatedAt.toISOString()).toBe(before.toISOString());
  });
  it('재실행은 0행 갱신(멱등)', async () => {
    const res = await runContentScore({ entities: ['hospital'], mode: 'daily' });
    const h = res.find((x) => x.entity === 'hospital')!;
    expect(h.updated).toBe(0);
  });
  it('weekly: 좌표 없는 행은 주변 0, 좌표 있는 행은 contentNearby 반영 후 합산', async () => {
    await runContentScore({ entities: ['hospital'], mode: 'weekly', pauseMs: 0 });
    const p = await read(poor); const r = await read(rich);
    expect(p.contentNearby).toBe(0);
    expect(r.contentScore).toBe(7 + r.contentNearby);
  });
  it('주소 해석 안 되는 공원·주차장도 실패하지 않는다', async () => {
    await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
    await prisma.park.create({ data: { sourceId: 'UT-CSR-PK', name: 'UT공원', address: '해석불가 주소', parkType: '근린공원', area: 100 } });
    await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
    await prisma.parking.create({ data: { sourceId: 'UT-CSR-PG', name: 'UT주차', address: '해석불가 주소', chargeInfo: '무료' } });
    await expect(runContentScore({ entities: ['park', 'parking'], mode: 'weekly', pauseMs: 0 })).resolves.toBeDefined();
    const pk = await prisma.park.findFirstOrThrow({ where: { sourceId: 'UT-CSR-PK' }, select: { contentNearby: true } });
    expect(pk.contentNearby).toBe(0);
    await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
    await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
  });
});
```
(시드의 필수 컬럼이 스키마와 다르면 schema를 보고 최소 필수 컬럼만 맞춘다. 기대값 7은 Task 4 `ownHospital` 규칙에서 나온다 — 의사 행은 `dr*` 컬럼에서 오므로 `totalDoctors`만 있으면 의료진 블록 0.)

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-runner.test.ts`
Expected: FAIL — runner 모듈 없음

- [ ] **Step 3: 엔터티 정의 구현** `scripts/ingest/content-score/entities.ts`:

```ts
/**
 * 엔터티별 청크 로드 → 점수(daily=자체 정보, weekly=주변·비교) 정의.
 * 화면 판정은 lib/content-score/* 순수 함수가 맡고, 여기는 상세 페이지가 읽는 것과 같은 데이터를 읽어 넘긴다.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sum } from '@/lib/content-score/core';
import { ownHospital, weeklyHospital } from '@/lib/content-score/hospital';
import { ownPharmacy, weeklyPharmacy } from '@/lib/content-score/pharmacy';
import { ownChildcare, weeklyChildcare } from '@/lib/content-score/childcare';
import { ownSchool, weeklySchool } from '@/lib/content-score/school';
import { ownPark, weeklyPark } from '@/lib/content-score/park';
import { ownParking, weeklyParking, feeCompareShown } from '@/lib/content-score/parking';
import { ownCharger, weeklyCharger } from '@/lib/content-score/charger';
import { nearbyFlags, type NearbyTable } from '@/lib/content-score/nearby-sql';
import { primaryDept, getSameDeptNearby } from '@/lib/hospital/context';
import { getPharmacyDong, countSundayClinicsNearby } from '@/lib/pharmacy/context';
import { getParkAreaRank } from '@/lib/urban/park-context';
import { getParkingFeeComparison } from '@/lib/urban/parking-context';
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
import { resolveAddrPrefix } from '@/lib/urban/_shared';

export type EntityKey = 'hospital' | 'pharmacy' | 'childcare' | 'school' | 'park' | 'parking' | 'charger';

export interface ScoredRow { id: bigint; own: number; weekly?: number; seoul: boolean }

export interface EntityDef {
  table: NearbyTable;
  /** id 커서 청크를 읽어 자체 점수(+weekly면 주간 점수)를 낸다 */
  score(afterId: bigint, limit: number, weekly: boolean): Promise<ScoredRow[]>;
}

const NO_FLAG = { apts: false, subway: false, infra: false, childcare: false };

async function coords(table: NearbyTable, ids: bigint[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ id: bigint; lat: number; lng: number }[]>(
    `SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "${table}" WHERE id = ANY($1::bigint[]) AND location IS NOT NULL`,
    ids,
  );
  return new Map(rows.map((r) => [String(r.id), { lat: r.lat, lng: r.lng }]));
}

const memo = <T>() => new Map<string, Promise<T>>();
async function prefixOf(address: string, cache: Map<string, Promise<string | null>>): Promise<string | null> {
  // 상세 페이지와 같은 경로: 주소 → 시군구 코드 → '시도 시군구' 접두어
  if (!cache.has(address)) {
    cache.set(address, (async () => {
      const sgg = await resolveSigunguFromAddress(address);
      const p = sgg ? await resolveAddrPrefix({ sigunguCode: sgg }) : null;
      return p && p !== '__NO_MATCH__' ? p : null;
    })());
  }
  return cache.get(address)!;
}

const nowYear = () => new Date().getUTCFullYear();

export const ENTITIES: Record<EntityKey, EntityDef> = {
  hospital: {
    table: 'Hospital',
    async score(afterId, limit, weekly) {
      const rows = await prisma.hospital.findMany({
        where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit,
        include: {
          facility: true, detail: true, nemcHours: true,
          depts: { select: { deptName: true } },
          _count: { select: { equipment: true, specialties: true, specialTreatments: true, nursingGrades: true, staff: true, transits: true, mealSurcharges: true } },
        },
      });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Hospital', ids);
      const near = weekly ? await nearbyFlags('Hospital', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const out: ScoredRow[] = [];
      for (const h of rows) {
        const c = xy.get(String(h.id));
        const own = sum(ownHospital({ ...h, counts: { depts: h.depts.length, ...h._count }, hasLocation: !!c }));
        let wk: number | undefined;
        if (weekly) {
          const dept = primaryDept(h.name, h.depts.map((d) => d.deptName));
          const same = c && dept ? (await getSameDeptNearby(h, dept, c.lat, c.lng)) !== null : false;
          const f = near!.get(String(h.id)) ?? NO_FLAG;
          wk = sum(weeklyHospital({ sameDept: same, apts: f.apts, subway: f.subway, infra: f.infra }));
        }
        out.push({ id: h.id, own, weekly: wk, seoul: (h.sigunguCode ?? '').startsWith('11') });
      }
      return out;
    },
  },
  pharmacy: {
    table: 'Pharmacy',
    async score(afterId, limit, weekly) {
      const rows = await prisma.pharmacy.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Pharmacy', ids);
      const near = weekly ? await nearbyFlags('Pharmacy', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const out: ScoredRow[] = [];
      for (const p of rows) {
        const c = xy.get(String(p.id));
        const own = sum(ownPharmacy({ ...p, hasLocation: !!c }, nowYear()));
        let wk: number | undefined;
        if (weekly) {
          const dong = (await getPharmacyDong(p)) !== null;
          const sunday = c ? (await countSundayClinicsNearby(c.lat, c.lng)) > 0 : false;
          const f = near!.get(String(p.id)) ?? NO_FLAG;
          wk = sum(weeklyPharmacy({ dong, sunday, apts: f.apts, subway: f.subway, infra: f.infra }));
        }
        out.push({ id: p.id, own, weekly: wk, seoul: (p.sigunguCode ?? '').startsWith('11') });
      }
      return out;
    },
  },
  childcare: {
    table: 'Childcare',
    async score(afterId, limit, weekly) {
      const rows = await prisma.childcare.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Childcare', ids);
      // 어린이집 상세: 인프라는 어린이집 미포함(getNearbyInfra 기본), 주변 어린이집 섹션은 자기 제외
      const near = weekly ? await nearbyFlags('Childcare', ids, { infraChildcare: false, nearChildcare: true }) : null;
      return rows.map((c) => {
        const f = near?.get(String(c.id)) ?? NO_FLAG;
        return {
          id: c.id,
          own: sum(ownChildcare(c, xy.has(String(c.id)))),
          weekly: weekly ? sum(weeklyChildcare(f)) : undefined,
          seoul: c.sigunguCode.startsWith('11'),
        };
      });
    },
  },
  school: {
    table: 'School',
    async score(afterId, limit, weekly) {
      const rows = await prisma.school.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('School', ids);
      // 학교 상세: cachedNearbyInfraSchool = getNearbyInfra(lat, lng) 옵션 없음 → 인프라에 어린이집 미포함. 주변 어린이집 섹션은 별도
      const near = weekly ? await nearbyFlags('School', ids, { infraChildcare: false, nearChildcare: true }) : null;
      return rows.map((s) => ({
        id: s.id,
        own: sum(ownSchool(s, xy.has(String(s.id)))),
        weekly: weekly ? sum(weeklySchool(near?.get(String(s.id)) ?? NO_FLAG)) : undefined,
        seoul: (s.sigunguCode ?? '').startsWith('11'),
      }));
    },
  },
  park: {
    table: 'Park',
    async score(afterId, limit, weekly) {
      const rows = await prisma.park.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Park', ids);
      const near = weekly ? await nearbyFlags('Park', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const prefixes = memo<string | null>();
      const out: ScoredRow[] = [];
      for (const p of rows) {
        let wk: number | undefined;
        if (weekly) {
          const prefix = await prefixOf(p.address, prefixes);
          const rank = (await getParkAreaRank(p, prefix)) !== null;
          wk = sum(weeklyPark({ areaRank: rank, ...(near!.get(String(p.id)) ?? NO_FLAG) }));
        }
        out.push({ id: p.id, own: sum(ownPark(p, xy.has(String(p.id)))), weekly: wk, seoul: p.address.startsWith('서울') });
      }
      return out;
    },
  },
  parking: {
    table: 'Parking',
    async score(afterId, limit, weekly) {
      const rows = await prisma.parking.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Parking', ids);
      const near = weekly ? await nearbyFlags('Parking', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const prefixes = memo<string | null>();
      const out: ScoredRow[] = [];
      for (const r of rows) {
        let wk: number | undefined;
        if (weekly) {
          // 상세는 rdnmadr ?? lnmadr ?? address로 시군구를 찾는다(app/(public)/urban/[category]/[id]/page.tsx)
          const prefix = await prefixOf(r.rdnmadr ?? r.lnmadr ?? r.address, prefixes);
          const cmp = await getParkingFeeComparison(r, prefix);
          wk = sum(weeklyParking({ feeCompare: feeCompareShown(cmp), ...(near!.get(String(r.id)) ?? NO_FLAG) }));
        }
        out.push({ id: r.id, own: sum(ownParking(r, xy.has(String(r.id)))), weekly: wk, seoul: r.address.startsWith('서울') });
      }
      return out;
    },
  },
  charger: {
    table: 'EvCharger',
    async score(afterId, limit, weekly) {
      const rows = await prisma.evCharger.findMany({
        where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit,
        include: { units: { select: { outputKw: true, installYear: true } } },
      });
      const ids = rows.map((r) => r.id);
      const xy = await coords('EvCharger', ids);
      const near = weekly ? await nearbyFlags('EvCharger', ids, { infraChildcare: true, nearChildcare: false }) : null;
      return rows.map((c) => ({
        id: c.id,
        own: sum(ownCharger(c, c.units, xy.has(String(c.id)))),
        weekly: weekly ? sum(weeklyCharger(near?.get(String(c.id)) ?? NO_FLAG)) : undefined,
        seoul: c.address.startsWith('서울'),
      }));
    },
  },
};

export type { Prisma };
```
학교·어린이집의 `infraChildcare=false`는 각 상세 로더(`cachedNearbyInfraSchool`·`cachedNearbyInfraCC` = 옵션 없는 `getNearbyInfra`)와 같다(2026-10-30 확인). 마지막 줄 `export type { Prisma }`는 lint가 미사용 import를 잡으면 지우고 `import type { Prisma }`도 지운다.

- [ ] **Step 4: 러너 구현** `scripts/ingest/content-score/runner.ts`:

```ts
/**
 * 목록 기본 정렬용 상세 내용 점수 배치.
 *
 *   pnpm ingest:content-score --mode=daily|weekly [--entity=hospital,park] [--chunk=1000] [--pause-ms=200]
 *
 * daily = 자체 정보(가벼움, 매일), weekly = 주변·비교 정보(공간 조회, 주 1회·청크 사이 쉬기).
 * 값이 바뀐 행만 raw SQL로 쓰고 updatedAt은 건드리지 않는다(사이트맵 lastmod 보호).
 * 설계: docs/superpowers/specs/2026-10-30-list-content-score-design.md
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { listRankOf } from '@/lib/content-score/core';
import { ENTITIES, type EntityKey, type ScoredRow } from './entities';

export const CONTENT_SCORE_SOURCE = 'content-score';
const ALL: EntityKey[] = ['hospital', 'pharmacy', 'childcare', 'school', 'park', 'parking', 'charger'];

async function writeChunk(table: string, rows: ScoredRow[], weekly: boolean): Promise<number> {
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const own = rows.map((r) => r.own);
  const wk = rows.map((r) => r.weekly ?? 0);
  const seoul = rows.map((r) => r.seoul);
  const t = Prisma.raw(`"${table}"`);
  // weekly면 새 주간값, daily면 저장된 contentNearby를 그대로 더한다.
  const nearbyExpr = weekly ? Prisma.sql`v.wk` : Prisma.sql`t."contentNearby"`;
  return prisma.$executeRaw`
    UPDATE ${t} AS t SET
      "contentNearby" = ${nearbyExpr},
      "contentScore"  = v.own + ${nearbyExpr},
      "listRank"      = (CASE WHEN v.seoul THEN 10000 ELSE 0 END) + v.own + ${nearbyExpr}
    FROM (SELECT unnest(${ids}::bigint[]) AS id, unnest(${own}::int[]) AS own, unnest(${wk}::int[]) AS wk, unnest(${seoul}::boolean[]) AS seoul) v
    WHERE t.id = v.id
      AND (t."contentNearby", t."contentScore", t."listRank")
          IS DISTINCT FROM (${nearbyExpr}, v.own + ${nearbyExpr}, (CASE WHEN v.seoul THEN 10000 ELSE 0 END) + v.own + ${nearbyExpr})
  `;
}

export async function runContentScore(opts: { entities?: EntityKey[]; mode: 'daily' | 'weekly'; chunk?: number; pauseMs?: number }) {
  const entities = opts.entities ?? ALL;
  const weekly = opts.mode === 'weekly';
  const chunk = opts.chunk ?? 1000;
  const pauseMs = opts.pauseMs ?? (weekly ? 200 : 0);
  const results: { entity: EntityKey; scanned: number; updated: number; ms: number }[] = [];
  for (const entity of entities) {
    const def = ENTITIES[entity];
    const run = await prisma.ingestionRun.create({ data: { source: CONTENT_SCORE_SOURCE, targetKey: `${opts.mode}:${entity}`, status: 'RUNNING' } });
    const t0 = Date.now();
    let after = 0n, scanned = 0, updated = 0;
    try {
      for (;;) {
        const rows = await def.score(after, chunk, weekly);
        if (rows.length === 0) break;
        updated += await writeChunk(def.table, rows, weekly);
        scanned += rows.length;
        after = rows[rows.length - 1].id;
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', finishedAt: new Date(), errorMessage: JSON.stringify({ scanned, updated }) } });
    } catch (e) {
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', finishedAt: new Date(), errorMessage: String(e).slice(0, 2000) } });
      throw e;
    }
    const ms = Date.now() - t0;
    logger.info({ entity, mode: opts.mode, scanned, updated, ms }, 'content-score done');
    results.push({ entity, scanned, updated, ms });
  }
  return results;
}

// listRankOf는 SQL과 같은 규칙(서울 10000 + 점수) — 테스트·검증 스크립트용 재노출
export { listRankOf };

if (require.main === module) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const mode = arg('mode');
  if (mode !== 'daily' && mode !== 'weekly') { console.error('--mode=daily|weekly 필요'); process.exit(2); }
  const entities = arg('entity')?.split(',') as EntityKey[] | undefined;
  runContentScore({ mode, entities, chunk: arg('chunk') ? Number(arg('chunk')) : undefined, pauseMs: arg('pause-ms') ? Number(arg('pause-ms')) : undefined })
    .then(() => prisma.$disconnect())
    .catch(async (e) => { logger.error({ err: String(e) }, 'content-score failed'); await prisma.$disconnect(); process.exit(1); });
}
```
`IngestionRun`의 필수 필드·상태 enum이 다르면 `scripts/ingest/apt-maintenance-cost/runner.ts`의 기록 방식을 그대로 따른다. `require.main` 진입 방식도 다른 러너(`scripts/ingest/building-register/runner.ts`)와 같게 맞춘다(ESM이면 그 파일의 방식).

`package.json` scripts에 추가: `"ingest:content-score": "tsx scripts/ingest/content-score/runner.ts"`.

- [ ] **Step 5: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-runner.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS 4/4, typecheck·lint 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest/content-score package.json tests/integration/content-score-runner.test.ts
git commit -m "feat(content-score): 점수 배치(daily 자체 정보·weekly 주변·비교) — 바뀐 행만, updatedAt 불변"
```

---

### Task 8: 목록 기본 정렬 교체

**Files:**
- Modify: `lib/hospital/index.ts` (`getHospitalList`), `lib/pharmacy/index.ts` (`getPharmacyList`), `lib/childcare.ts` (`getChildcareList`), `lib/school.ts` (`getSchoolList`), `lib/urban/adapters/park.ts`·`parking.ts`·`charger.ts` (`getList`)
- Test: `tests/integration/content-score-list-order.test.ts`

**Interfaces:**
- Consumes: Task 1 컬럼.
- Produces: 7개 목록의 기본 `orderBy: [{ listRank: 'desc' }, { id: 'asc' }]`. 필터·페이지 크기·select는 그대로.

- [ ] **Step 1: 실패하는 테스트** — 동점 다수·새 행(0점)·페이지 경계:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getHospitalList } from '@/lib/hospital';

const SGG = '99998';
beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-CSL-' } } });
  // 25곳: 점수 5가 22곳(동점), 9가 2곳, 새 행(0) 1곳
  const data = Array.from({ length: 25 }, (_, i) => ({
    sourceId: `UT-CSL-${String(i).padStart(2, '0')}`, name: `가UT${i}`, typeCode: '31', typeName: '의원', address: 'UT', sigunguCode: SGG,
    listRank: i < 2 ? 9 : i === 24 ? 0 : 5,
  }));
  await prisma.hospital.createMany({ data });
});
afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-CSL-' } } });
});

describe('목록 기본 정렬', () => {
  it('listRank 내림차순 → id 오름차순, 페이지 경계 중복·누락 없음', async () => {
    const p1 = await getHospitalList({ sigunguCode: SGG }, 1, 20);
    const p2 = await getHospitalList({ sigunguCode: SGG }, 2, 20);
    const ids = [...p1.rows, ...p2.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(25);
    expect(p1.rows.slice(0, 2).map((r) => r.listRank)).toEqual([9, 9]);
    expect(p2.rows.at(-1)!.listRank).toBe(0); // 새 행은 맨 뒤
    const fives = [...p1.rows, ...p2.rows].filter((r) => r.listRank === 5).map((r) => r.id);
    expect(fives).toEqual([...fives].sort((a, b) => (a < b ? -1 : 1)));
  });
});
```
(다른 6개 목록은 같은 한 줄 변경이라 Step 4에서 SQL 로그 대신 typecheck와 아래 grep으로 확인.)

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-list-order.test.ts`
Expected: FAIL — 첫 두 행이 가나다순이라 `[9, 9]`가 아님

- [ ] **Step 3: 구현** — 7곳의 기본 정렬을 교체:

- `lib/hospital/index.ts` `getHospitalList`: `orderBy: { name: 'asc' }` → `orderBy: [{ listRank: 'desc' }, { id: 'asc' }]` (위에 주석 한 줄: `// 기본 정렬: 서울 → 상세 내용 점수 → id (docs/superpowers/specs/2026-10-30-list-content-score-design.md)`)
- `lib/pharmacy/index.ts` `getPharmacyList`: 같은 교체.
- `lib/childcare.ts` `getChildcareList`: `orderBy: [{ name: 'asc' }]` → 같은 교체.
- `lib/school.ts` `getSchoolList`: `orderBy: [{ schoolKind: 'asc' }, { name: 'asc' }]` → 같은 교체.
- `lib/urban/adapters/park.ts`·`parking.ts`·`charger.ts` `getList`: `orderBy: { name: 'asc' }` → 같은 교체.

상세 하위 목록(약품·장비 등 relation의 `orderBy`)과 지역 목록(`getHospitalRegions` 등)은 **바꾸지 않는다**.

- [ ] **Step 4: 확인**

Run: `pnpm dotenv -e .env.test -- vitest run tests/integration/content-score-list-order.test.ts && pnpm typecheck && grep -n "listRank: 'desc'" lib/hospital/index.ts lib/pharmacy/index.ts lib/childcare.ts lib/school.ts lib/urban/adapters/park.ts lib/urban/adapters/parking.ts lib/urban/adapters/charger.ts | wc -l`
Expected: PASS, typecheck 0, grep 개수 `7`.

- [ ] **Step 5: 허브 요약·e2e 회귀 확인** — 허브 요약 통합 테스트와 e2e가 목록 순서(가나다)를 기대하고 있으면 실패한다. 실패하면 **테스트 기대값을 새 정렬 규칙에 맞춘다**(제품 동작 변경이 의도됨).

Run: `pnpm test:integration && pnpm dotenv -e .env.test -- tsx tests/_helpers/seed-e2e.ts && pnpm test:e2e:local`
Expected: 전부 PASS(수정한 테스트가 있으면 커밋 메시지에 명시).

- [ ] **Step 6: Commit**

```bash
git add lib/hospital/index.ts lib/pharmacy/index.ts lib/childcare.ts lib/school.ts lib/urban/adapters/park.ts lib/urban/adapters/parking.ts lib/urban/adapters/charger.ts tests/integration/content-score-list-order.test.ts
git commit -m "feat(list): 시설 7종 목록 기본 정렬을 서울 → 상세 내용 점수 → id로"
```

---

### Task 9: ETL 잡·타이머

**Files:**
- Modify: `deploy/run-etl.sh`, `deploy/systemd/install-timers.sh`
- Test: `tests/ops/content-score-etl-wiring.test.ts`

**Interfaces:**
- Produces: 잡 키 `content-score-daily`(매일 23:00 UTC = 08:00 KST), `content-score-weekly`(일 23:30 UTC = 월 08:30 KST — daily 직후, 다른 수집 타이머와 겹치지 않음: 기존 최종은 building-register 21:00 + 100분 예산 ≈ 22:40).

- [ ] **Step 1: 실패하는 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const etl = readFileSync('deploy/run-etl.sh', 'utf8');
const timers = readFileSync('deploy/systemd/install-timers.sh', 'utf8');

describe('content-score ETL 배선', () => {
  it('run-etl.sh에 daily·weekly 잡이 있다', () => {
    expect(etl).toMatch(/content-score-daily\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=daily/);
    expect(etl).toMatch(/content-score-weekly\)\s+\$DC pnpm tsx scripts\/ingest\/content-score\/runner\.ts --mode=weekly/);
  });
  it('타이머: daily 매일 23:00, weekly 일요일 23:30 UTC', () => {
    expect(timers).toContain('content-score-daily|*-*-* 23:00:00');
    expect(timers).toContain('content-score-weekly|Sun *-*-* 23:30:00');
  });
});
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ops/content-score-etl-wiring.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`deploy/run-etl.sh`의 `hospital-nemc)` 줄 아래:
```bash
  content-score-daily)  $DC pnpm tsx scripts/ingest/content-score/runner.ts --mode=daily ;;   # 목록 정렬 점수(자체 정보)
  content-score-weekly) $DC pnpm tsx scripts/ingest/content-score/runner.ts --mode=weekly ;;  # 주변·비교 정보, 청크 사이 쉬기
```
`deploy/systemd/install-timers.sh`의 `JOBS` 끝(닫는 `'` 위)에:
```
content-score-daily|*-*-* 23:00:00
content-score-weekly|Sun *-*-* 23:30:00
```
(메모리: install-timers의 start 목록이 하드코딩된 곳이 있으면 같이 추가.)

- [ ] **Step 4: 실행 → 통과**

Run: `pnpm dotenv -e .env.test -- vitest run tests/ops/content-score-etl-wiring.test.ts && bash -n deploy/run-etl.sh && bash -n deploy/systemd/install-timers.sh`
Expected: PASS 2/2, 문법 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add deploy/run-etl.sh deploy/systemd/install-timers.sh tests/ops/content-score-etl-wiring.test.ts
git commit -m "feat(etl): content-score daily·weekly 잡과 타이머"
```

---

### Task 10: 전체 검증(로컬 테스트 DB)

- [ ] **Step 1:** Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration`
Expected: 전부 PASS. 실패 시 원인 수정(필수 오류만) 후 재실행.

- [ ] **Step 2:** Run: `pnpm build`
Expected: 빌드 성공(CI에 build가 없어 배포 시점에야 드러나는 오류 방지 — 메모리 'CI 초록 ≠ 안전').

---

### Task 11: 로컬 복원본 실측·표본 화면 대조(운영 반영 전 관문)

운영 DB에는 아무것도 쓰지 않는다. 2026-10-28 운영 백업(`~/imjang-backups/imjang-prod-20261028.dump`, 저장소 밖)을 로컬 컨테이너에 복원해 검증한다. 결과물(캡처·원자료)은 `~/imjang-backups/content-score-validation/`(저장소 밖, 권한 700), 요약 수치만 리포에 남긴다.

- [ ] **Step 1: 복원** — 운영과 같은 이미지·버전, `template0` 기반 DB(PostGIS 이미지가 만드는 tiger/topology 스키마 충돌 회피 — 런북 §8):

```bash
umask 077
docker run -d --name imjang-cs-verify -e POSTGRES_PASSWORD=verify -p 5434:5432 imresamu/postgis:17-3.5
until docker exec imjang-cs-verify pg_isready -U postgres; do sleep 2; done
docker exec imjang-cs-verify createdb -U postgres -T template0 imjang
docker exec -i imjang-cs-verify pg_restore -U postgres -d imjang --no-owner < ~/imjang-backups/imjang-prod-20261028.dump
```
`.env.verify.local`(커밋 금지 — `.gitignore`의 `.env*.local` 확인)에 `DATABASE_URL=postgresql://postgres:verify@localhost:5434/imjang` 저장. 비밀번호는 출력하지 않는다.

- [ ] **Step 2: 마이그레이션·배치 실측**

```bash
pnpm dotenv -e .env.verify.local -- prisma migrate deploy
/usr/bin/time -l pnpm dotenv -e .env.verify.local -- tsx scripts/ingest/content-score/runner.ts --mode=weekly 2>&1 | tee ~/imjang-backups/content-score-validation/weekly.log
/usr/bin/time -l pnpm dotenv -e .env.verify.local -- tsx scripts/ingest/content-score/runner.ts --mode=daily 2>&1 | tee ~/imjang-backups/content-score-validation/daily.log
/usr/bin/time -l pnpm dotenv -e .env.verify.local -- tsx scripts/ingest/content-score/runner.ts --mode=daily 2>&1 | tee ~/imjang-backups/content-score-validation/daily-rerun.log
```
기록: 엔터티별 scanned·updated·ms, 전체 실행 시간, DB 컨테이너 CPU(`docker stats --no-stream` 1분 간격). 재실행 updated는 0이어야 한다.
**관문 A(부하):** weekly 전체 DB CPU 합계 ≤ 30분, daily ≤ 3분. 노트북은 운영 박스(2 OCPU)보다 빠르므로 **측정값 × 3**을 박스 추정치로 기록. 넘으면 중단하고 보고(스펙 §5의 격자 근사 전환은 사용자 결정).

- [ ] **Step 3: 점수 분포**

```sql
-- 유형별(예: Hospital) 점수 분포
SELECT "contentScore", count(*) FROM "Hospital" GROUP BY 1 ORDER BY 1;
```
7개 테이블 모두. **관문 B:** 한 점수에 70% 이상 몰린 유형은 보고(깊이 구간 조정은 사용자 결정 — 이번 범위에서 임의 변경 금지).

- [ ] **Step 4: 표본 화면 대조** — 유형별 상위 10·중앙 10·하위 10(좌표 있는 행 기준, 지역 무관)을 뽑아 로컬 dev 서버(`pnpm dotenv -e .env.verify.local -- next dev -p 3100`)로 상세를 열고, 블록별 표시 여부를 Playwright로 기록한다. 판정 기준: 각 블록의 제목 문구(예: 병원 "진료과", "병상 현황", 공원 "공원 시설", 주차장 "요금"의 빈 상태 문구 유무). 스크립트는 `scratchpad`에 두고 커밋하지 않는다.
  - 출력: 블록 × (예측 표시, 실제 표시) 표 → 블록별 불일치율.
  - 상위·하위 각 2쌍 전체 화면 캡처를 `~/imjang-backups/content-score-validation/`에 저장.
  - **관문 C(정확도):** "정확" 항목 불일치 0건. 인프라(R2)는 불일치율만 보고. 0건이 아니면 원인을 찾아 해당 점수 함수/SQL을 고친다(필수 오류) → Step 2부터 재실행.

- [ ] **Step 5: 첫 페이지 확인** — 복원본에서 필터 없는 기본 정렬 첫 페이지 20개가 서울·점수 상위인지 `getHospitalList({},1,20)` 등 7개 목록으로 확인(스크립트 출력).

- [ ] **Step 6: 결과 문서화·정리**

`docs/superpowers/specs/2026-10-30-list-content-score-design.md` 끝에 `## 8. 로컬 검증 결과(YYYY-MM-DD)` 추가: 관문 A·B·C 수치표, 불일치율, 박스 추정 부하, 첫 페이지 확인 결과(개인정보 없는 집계 수치만).

```bash
docker rm -f imjang-cs-verify
git add docs/superpowers/specs/2026-10-30-list-content-score-design.md
git commit -m "docs(spec): content-score 로컬 복원본 검증 결과"
```

---

### Task 12: PR·CI·운영 반영 절차(사용자 승인 단계)

- [ ] **Step 1: PR 생성** — 원격 push 후 main 대상 PR. 본문: 요약, 스펙·계획 링크, 관문 A·B·C 결과, 운영 반영 절차(아래), "머지 = 배포 + 마이그레이션 자동 적용" 경고.

```bash
git push -u origin feat/content-score-sort
gh pr create --base main --title "feat: 목록 기본 정렬 — 상세 내용 점수 순(시설 7종)" --body-file <(작성한 본문)
```
- [ ] **Step 2: CI 확인** — `gh pr checks --watch`. 실패는 필수 오류만 수정.
- [ ] **Step 3: 여기서 멈추고 사용자 승인 대기.** 머지·배포·운영 배치·타이머 설치는 승인 후에만:
  1. 머지 시각: 수집 타이머가 없는 시간. 머지 → 배포가 `prisma migrate deploy`로 컬럼·인덱스 추가(7개 테이블, 최대 10.6만 행 — 수 초).
  2. 배포 확인: 박스 `git log -1`이 머지 커밋인지(메모리: CI 초록 ≠ 배포).
  3. 첫 계산: 박스에서 `deploy/run-etl.sh content-score-weekly` → `content-score-daily` 수동 1회(nice). 진행 중 `docker stats`로 CPU 확인, 80% 이상 지속 시 중단.
  4. 타이머 설치: `deploy/systemd/install-timers.sh`(박스, sudo) — 새 타이머 2개 `systemctl list-timers`로 확인.
  5. 확인: 운영 DB **읽기 전용 세션**으로 7개 목록 기본 정렬 첫 20행(`ORDER BY "listRank" DESC, id LIMIT 20`)이 서울·점수 상위인지 조회. 사이트 HTTP 확인은 목록 페이지 각 1회만.
  6. 되돌리기: 정렬만 되돌리려면 Task 8 커밋 revert PR(컬럼은 남겨도 무해). 점수 배치 중단은 타이머 disable.
