# 생활시설 상세 보강 PR 5 — EV 충전소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국환경공단 충전소 API에서 버리던 필드를 저장하고, 충전소 상세(`/urban/charger/[id]`)에 **이용 제한 경고**, "이용 안내" 카드(이용 시간·최대 출력·주차료·설치 위치), 정보 행(시설 구분·운영사 연락처·설치 연도·상세 위치), 충전기별 출력을 추가한다.

**Architecture:** PR 1~3과 같은 패턴이다. nullable 컬럼 마이그레이션 → `buildEvChargerData`·러너 upsert → 화면. 충전소 단위 필드는 그 충전소의 첫 행 값을 쓴다. 상세는 `findUnique({ include: { units: true } })`로 읽으므로 조회 코드는 바꾸지 않는다.

**Tech Stack:** Next.js App Router(ISR), Prisma, fast-xml-parser, Vitest(SSR).

**Spec:** `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` 4·5·6절(EV 부분, PR 5는 "실측 후 확정"으로 남아 있던 항목)

## 실측 근거 (2026-10-02, API 2페이지 2,000행)

| 필드 | 채움률 | 값 | 저장 컬럼 |
|---|---|---|---|
| `limitYn` | 100% | **Y 48%** / N 52% | `EvCharger.accessLimited` Boolean |
| `limitDetail` | 48% | "거주자외 출입제한" 대부분 | `EvCharger.limitDetail` VarChar(200) |
| `useTime` | 100% | "24시간 이용가능", "08:00~20:00" | `EvCharger.useTime` VarChar(100) |
| `parkingFree` | 100% | Y 96% | `EvCharger.parkingFree` Boolean |
| `floorType`·`floorNum` | 100% | F/B + 숫자 | `EvCharger.floorType` VarChar(1), `floorNum` Int |
| `kind`·`kindDetail` | 100% | H0 49%·A0·B0·D0 / H001… | `EvCharger.facilityKind` VarChar(2), `facilityKindDetail` VarChar(4) |
| `busiCall` | 100% | 1600-4047 | `EvCharger.operatorTel` VarChar(30) |
| `location` | 49% | "B2(102동 3대, 104동 2대) 총 5대" | `EvCharger.locationDetail` VarChar(300) |
| `output` | 100% | 7·50·100·200 | `EvChargerUnit.outputKw` Int |
| `year` | 100% | 2018·2022 | `EvChargerUnit.installYear` Int |

저장하지 않는 것: `maker`·`method`(독자 정보 아님), `note`·`powerType`·`delDetail`(0%), `zscode`(쓰는 곳이 생길 때 추가).

**시설 구분 코드표**: 공식 가이드(docx v1.25)는 포털에 첨부파일로만 있어 직접 확인하지 못했다. 공개 프로젝트 [ev_charger_map](https://github.com/murianwind/ev_charger_map) README의 표가 실측 표본과 일치한다(H0/H001 행은 아파트, A0 행은 공공기관). 그래서 **대분류 10개(A0~J0) 라벨만** 쓰고, 표에 없는 코드는 표시하지 않는다.

**호출 한도**: 개발계정 하루 1,000회(포털 명시). 10/2에 전체 재수집으로 527회를 썼다. 그래서 이 계획은 **새 API 호출 없이** 이미 저장한 2페이지 응답으로 검증한다. 운영 재수집은 자정(KST) 이후 또는 운영계정 승인 뒤에 한다.

## Global Constraints

- 새 컬럼은 전부 nullable. 백필 마이그레이션 금지.
- 값이 null이면 행·타일·경고를 숨긴다.
- 이용 제한은 **카드보다 위**에 경고로 보인다. 제한 내용(`limitDetail`)이 없으면 "운영기관에 이용 가능 여부를 확인하세요"라고 쓰고, 이유를 지어내지 않는다.
- 시설 구분은 A0~J0 대분류 라벨만 쓴다.
- 색은 `--color-*` 토큰만, 한글 본문 14px 이상. 경고는 `--color-red` 테두리(정보 신호 용도)로 한다.
- 마이그레이션은 손으로 쓴 SQL 폴더 하나만 좁게 `git add`한다.
- 이 PR 작업 중에는 EV API를 새로 호출하지 않는다(일일 한도).
- 커밋 메시지 끝에 다음 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
  ```

## Review Focus

1. **제한 사유 지어내기 금지**: `limitYn=Y`인데 `limitDetail`이 비면, 사유 없이 "확인 필요"로만 안내한다. → Task 3 테스트
2. **층 0·이상값**: `floorNum` 0이나 99 초과, `floorType`이 F/B가 아니면 설치 위치를 숨긴다. → Task 2 테스트
3. **충전기별 값이 섞인 충전소**: 출력·연도는 충전기마다 다르다. 최대 출력, 연도 범위(2017~2022년)로 요약한다. → Task 2 테스트
4. **XML 숫자 변환**: `busiCall`이 하이픈 없는 숫자면 앞자리 0이 사라진다. 문자열만 저장한다(PR 1과 같은 규칙). → Task 1 테스트
5. **"00:00~24:00" 같은 이용 시간 원문**: 그대로 보여준다(해석하지 않음). 빈 값은 숨긴다. → Task 3 테스트

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `prisma/schema.prisma` | `EvCharger` 10개, `EvChargerUnit` 2개 컬럼 | 수정 |
| `prisma/migrations/20261002000000_add_ev_detail_fields/migration.sql` | ALTER TABLE ×2 | 생성 |
| `scripts/ingest/amenities/types.ts` | `NormalizedEvCharger`·`NormalizedEvChargerUnit` 필드 | 수정 |
| `scripts/ingest/amenities/adapter-ev-charger.ts` | `buildEvChargerData`에서 새 필드 파싱 | 수정 |
| `scripts/ingest/amenities/runner.ts` | `writeEvChargerStations`·`writeEvChargerUnits` | 수정 |
| `lib/urban/charger-display.ts` | 시설 구분 라벨, 층 표기, 출력·연도 요약 | 생성 |
| `lib/urban/ev-status-shared.ts` | `ChargerUnitPlain`에 `outputKw` | 수정 |
| `app/(public)/urban/charger/[id]/_components/charger-access-notice.tsx` | 이용 제한 경고 | 생성 |
| `app/(public)/urban/charger/[id]/_components/charger-guide.tsx` | "이용 안내" 카드 | 생성 |
| `app/(public)/urban/charger/[id]/_components/charger-hero.tsx` | "이용 제한" 배지 | 수정 |
| `app/(public)/urban/charger/[id]/_components/charger-status-table.tsx` | 충전기별 출력 | 수정 |
| `app/(public)/urban/charger/[id]/page.tsx` | 연결 | 수정 |
| `tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml` | 실측 2행 + 경계 1행 | 생성 |
| `tests/ingest/amenities/adapter-ev-charger-detail.test.ts` | 파서 테스트 | 생성 |
| `tests/lib/charger-display.test.ts` | 표시 헬퍼 테스트 | 생성 |
| `tests/components/charger-detail-ssr.test.ts` | 경고·카드·표 SSR 테스트 | 생성 |

---

### Task 1: 스키마·마이그레이션·파서·러너

**Files:**
- Modify: `prisma/schema.prisma` (`model EvCharger`, `model EvChargerUnit`)
- Create: `prisma/migrations/20261002000000_add_ev_detail_fields/migration.sql`
- Modify: `scripts/ingest/amenities/types.ts`
- Modify: `scripts/ingest/amenities/adapter-ev-charger.ts` (`buildEvChargerData`)
- Modify: `scripts/ingest/amenities/runner.ts` (`writeEvChargerStations`, `writeEvChargerUnits`)
- Create: `tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml`
- Test: `tests/ingest/amenities/adapter-ev-charger-detail.test.ts`

**Interfaces:**
- Consumes: `parse-helpers.ts`의 `strOrNull`, `boolFromYn`, `intInRange`, `clip`
- Produces:
  ```ts
  // NormalizedEvCharger 추가 필드 (= Prisma EvCharger 컬럼)
  accessLimited: boolean | null;     // limitYn
  limitDetail: string | null;        // limitDetail, 200자
  useTime: string | null;            // 100자
  parkingFree: boolean | null;
  floorType: string | null;          // 'F' | 'B' 만, 그 외 null
  floorNum: number | null;           // 1~99
  facilityKind: string | null;       // kind, 2자
  facilityKindDetail: string | null; // kindDetail, 4자
  operatorTel: string | null;        // busiCall, 문자열로 온 값만
  locationDetail: string | null;     // location, 300자
  // NormalizedEvChargerUnit 추가 필드 (= Prisma EvChargerUnit 컬럼)
  outputKw: number | null;           // output, 1~1000
  installYear: number | null;        // year, 1990~올해
  ```

- [ ] **Step 1: 픽스처 작성** (2026-10-02 실측 응답 2행 + 경계 1행)

```xml
<!-- tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <statNm>양정퀸즈팰리스</statNm><statId>PI707748</statId><chgerId>01</chgerId><chgerType>02</chgerType>
        <addr>부산광역시 부산진구 거제대로48번길 20</addr><addrDetail>양정퀸즈팰리스</addrDetail>
        <location>B2(102동 3대, 104동 2대) 총 5대</location><useTime>08:00~20:00</useTime>
        <busiNm>GS차지비</busiNm><busiCall>1600-4047</busiCall>
        <lat>35.172677028</lat><lng>129.06847806</lng><output>7</output><year>2022</year>
        <floorNum>2</floorNum><floorType>B</floorType><kind>H0</kind><kindDetail>H001</kindDetail>
        <limitYn>Y</limitYn><limitDetail>거주자외 출입제한</limitDetail><parkingFree>Y</parkingFree>
      </item>
      <item>
        <statNm>서울추모공원</statNm><statId>ME174027</statId><chgerId>01</chgerId><chgerType>06</chgerType>
        <addr>서울특별시 서초구 양재대로12길 74</addr><addrDetail>1층 입구</addrDetail>
        <location></location><useTime>24시간 이용가능</useTime>
        <busiNm>기후에너지환경부</busiNm><busiCall>1661-9408</busiCall>
        <lat>37.4536062</lat><lng>127.0428005</lng><output>50</output><year>2017</year>
        <floorNum>1</floorNum><floorType>F</floorType><kind>A0</kind><kindDetail>A004</kindDetail>
        <limitYn>N</limitYn><limitDetail></limitDetail><parkingFree>N</parkingFree>
      </item>
      <item>
        <statNm>경계충전소</statNm><statId>XX000001</statId><chgerId>01</chgerId><chgerType>02</chgerType>
        <addr>서울특별시 중구 1</addr><useTime></useTime>
        <busiNm>테스트</busiNm><busiCall>16004047</busiCall>
        <lat>37.5</lat><lng>127.0</lng><output></output><year>1890</year>
        <floorNum>0</floorNum><floorType>X</floorType><kind></kind>
        <limitYn></limitYn><parkingFree></parkingFree>
      </item>
    </items>
    <numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>3</totalCount>
  </body>
</response>
```

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// tests/ingest/amenities/adapter-ev-charger-detail.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEvChargerXml } from '@/scripts/ingest/amenities/adapter-ev-charger';

const xml = readFileSync(resolve('tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml'), 'utf-8');
const { stations, units } = parseEvChargerXml(xml);
const st = (id: string) => stations.find((s) => s.sourceId === id)!;
const un = (id: string) => units.find((u) => u.stationSourceId === id)!;

describe('adapter-ev-charger 상세 필드', () => {
  it('아파트 충전소: 이용 제한·이용 시간·지하 2층·시설 구분·상세 위치', () => {
    const s = st('PI707748');
    expect(s.accessLimited).toBe(true);
    expect(s.limitDetail).toBe('거주자외 출입제한');
    expect(s.useTime).toBe('08:00~20:00');
    expect(s.parkingFree).toBe(true);
    expect(s.floorType).toBe('B');
    expect(s.floorNum).toBe(2);
    expect(s.facilityKind).toBe('H0');
    expect(s.facilityKindDetail).toBe('H001');
    expect(s.operatorTel).toBe('1600-4047');
    expect(s.locationDetail).toBe('B2(102동 3대, 104동 2대) 총 5대');
  });

  it('공공 충전소: 제한 없음, 유료 주차, 빈 상세 위치는 null', () => {
    const s = st('ME174027');
    expect(s.accessLimited).toBe(false);
    expect(s.limitDetail).toBeNull();
    expect(s.parkingFree).toBe(false);
    expect(s.locationDetail).toBeNull();
  });

  it('충전기 단위: 출력·설치 연도', () => {
    expect(un('PI707748')).toMatchObject({ outputKw: 7, installYear: 2022 });
    expect(un('ME174027')).toMatchObject({ outputKw: 50, installYear: 2017 });
  });

  it('경계: 빈 값·범위 밖·형식 위반은 null, 숫자로 바뀐 전화번호는 버린다', () => {
    const s = st('XX000001');
    expect(s.accessLimited).toBeNull();
    expect(s.useTime).toBeNull();
    expect(s.parkingFree).toBeNull();
    expect(s.floorType).toBeNull();
    expect(s.floorNum).toBeNull();
    expect(s.facilityKind).toBeNull();
    expect(s.operatorTel).toBeNull();
    expect(un('XX000001')).toMatchObject({ outputKw: null, installYear: null });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/amenities/adapter-ev-charger-detail.test.ts`
Expected: FAIL — `expected undefined to be true`

- [ ] **Step 4: 스키마와 마이그레이션**

`model EvCharger`의 `operatorName` 줄 아래:

```prisma
  accessLimited      Boolean?
  limitDetail        String?  @db.VarChar(200)
  useTime            String?  @db.VarChar(100)
  parkingFree        Boolean?
  floorType          String?  @db.VarChar(1)
  floorNum           Int?
  facilityKind       String?  @db.VarChar(2)
  facilityKindDetail String?  @db.VarChar(4)
  operatorTel        String?  @db.VarChar(30)
  locationDetail     String?  @db.VarChar(300)
```

`model EvChargerUnit`의 `isFast` 줄 아래:

```prisma
  outputKw        Int?
  installYear     Int?
```

```sql
-- prisma/migrations/20261002000000_add_ev_detail_fields/migration.sql
-- 한국환경공단 충전소 API에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 5).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "EvCharger"
  ADD COLUMN "accessLimited" BOOLEAN,
  ADD COLUMN "limitDetail" VARCHAR(200),
  ADD COLUMN "useTime" VARCHAR(100),
  ADD COLUMN "parkingFree" BOOLEAN,
  ADD COLUMN "floorType" VARCHAR(1),
  ADD COLUMN "floorNum" INTEGER,
  ADD COLUMN "facilityKind" VARCHAR(2),
  ADD COLUMN "facilityKindDetail" VARCHAR(4),
  ADD COLUMN "operatorTel" VARCHAR(30),
  ADD COLUMN "locationDetail" VARCHAR(300);

ALTER TABLE "EvChargerUnit"
  ADD COLUMN "outputKw" INTEGER,
  ADD COLUMN "installYear" INTEGER;
```

Run: `pnpm test:db:migrate && pnpm prisma generate`
Expected: `Applying migration 20261002000000_add_ev_detail_fields` → `All migrations have been successfully applied.`

- [ ] **Step 5: 타입·파서·러너**

`types.ts`: Interfaces의 필드를 `NormalizedEvCharger`(`operatorName` 아래)와 `NormalizedEvChargerUnit`(`isFast` 아래)에 추가한다.

`adapter-ev-charger.ts` 맨 위 import 추가:

```ts
import { strOrNull, boolFromYn, intInRange, clip } from './parse-helpers';
```

`buildEvChargerData` 함수 안, `const lng = …` 줄 다음에 충전소 단위 필드를 계산한다.

```ts
    const floorType = strOrNull(item.floorType);
    const stationDetail = {
      accessLimited: boolFromYn(item.limitYn),
      limitDetail: clip(strOrNull(item.limitDetail), 200),
      useTime: clip(strOrNull(item.useTime), 100),
      parkingFree: boolFromYn(item.parkingFree),
      floorType: floorType === 'F' || floorType === 'B' ? floorType : null,
      floorNum: intInRange(item.floorNum, 1, 99),
      facilityKind: clip(strOrNull(item.kind), 2),
      facilityKindDetail: clip(strOrNull(item.kindDetail), 4),
      // parseTagValue가 하이픈 없는 번호를 숫자로 바꿔 앞자리 0이 사라진다 → 문자열로 온 값만 신뢰.
      operatorTel: typeof item.busiCall === 'string' ? clip(strOrNull(item.busiCall), 30) : null,
      locationDetail: clip(strOrNull(item.location), 300),
    };
```

`stationMap.set(statId, { … operatorName: … })` 객체 끝에 `...stationDetail,`를 추가한다(충전소의 첫 행 값을 쓴다).

`units.push({ … isFast, })` 객체에 추가한다.

```ts
      outputKw: intInRange(item.output, 1, 1000),
      installYear: intInRange(item.year, 1990, new Date().getUTCFullYear()),
```

`runner.ts` `writeEvChargerStations`:

```ts
    const values = chunk.map((r: NormalizedEvCharger) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.chargeSpeed}, ${r.chargerCount}, ${r.operatorName ?? null}, ${locationSql(r.lat, r.lng)},
        ${r.accessLimited}, ${r.limitDetail}, ${r.useTime}, ${r.parkingFree}, ${r.floorType}, ${r.floorNum},
        ${r.facilityKind}, ${r.facilityKindDetail}, ${r.operatorTel}, ${r.locationDetail}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "EvCharger" ("sourceId", name, address, "chargeSpeed", "chargerCount", "operatorName", location,
        "accessLimited", "limitDetail", "useTime", "parkingFree", "floorType", "floorNum",
        "facilityKind", "facilityKindDetail", "operatorTel", "locationDetail", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "operatorName" = EXCLUDED."operatorName",
        location = EXCLUDED.location,
        "accessLimited" = EXCLUDED."accessLimited",
        "limitDetail" = EXCLUDED."limitDetail",
        "useTime" = EXCLUDED."useTime",
        "parkingFree" = EXCLUDED."parkingFree",
        "floorType" = EXCLUDED."floorType",
        "floorNum" = EXCLUDED."floorNum",
        "facilityKind" = EXCLUDED."facilityKind",
        "facilityKindDetail" = EXCLUDED."facilityKindDetail",
        "operatorTel" = EXCLUDED."operatorTel",
        "locationDetail" = EXCLUDED."locationDetail",
        "updatedAt" = NOW()
    `;
```

`writeEvChargerUnits`:

```ts
    const values = chunk.map((u: NormalizedEvChargerUnit) =>
      Prisma.sql`(${u.sourceId}, ${u.stationSourceId}, ${u.chgerId}, ${u.chgerType}, ${u.isFast}, ${u.outputKw}, ${u.installYear}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "EvChargerUnit" ("sourceId", "stationSourceId", "chgerId", "chgerType", "isFast", "outputKw", "installYear", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        "stationSourceId" = EXCLUDED."stationSourceId",
        "chgerId" = EXCLUDED."chgerId",
        "chgerType" = EXCLUDED."chgerType",
        "isFast" = EXCLUDED."isFast",
        "outputKw" = EXCLUDED."outputKw",
        "installYear" = EXCLUDED."installYear",
        "updatedAt" = NOW()
    `;
```

- [ ] **Step 6: 통과 확인 (기존 EV 파서 테스트 포함)**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/amenities/adapter-ev-charger-detail.test.ts tests/ingest/amenities/adapter-ev-charger.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 7: 저장해 둔 실제 응답으로 스모크** (새 API 호출 없음)

이미 받아 둔 `scratchpad/ev_1.xml`, `ev_300.xml`(각 1,000행)을 `parseEvChargerXml`로 읽어, 충전소 단위 필드의 non-null 비율을 출력하는 일회성 스크립트를 scratchpad에 만들어 실행한다(커밋하지 않음).
Expected: `accessLimited`·`useTime`·`parkingFree`·`floorType`·`facilityKind`·`operatorTel` 약 100%, `limitDetail` 약 50%, `locationDetail` 약 50%, 충전기 `outputKw`·`installYear` 약 100%.

- [ ] **Step 8: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/20261002000000_add_ev_detail_fields scripts/ingest/amenities/types.ts scripts/ingest/amenities/adapter-ev-charger.ts scripts/ingest/amenities/runner.ts tests/ingest/amenities/fixtures/ev-charger-detail-sample.xml tests/ingest/amenities/adapter-ev-charger-detail.test.ts
git status --short prisma/migrations
git commit -m "feat(ingest): EV 이용제한·이용시간·주차료·설치층·시설구분·출력·설치연도 수집

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 2: 충전소 표시 헬퍼

**Files:**
- Create: `lib/urban/charger-display.ts`
- Test: `tests/lib/charger-display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function facilityKindLabel(code: string | null | undefined): string | null; // A0~J0만
  export function floorLabel(type: string | null | undefined, num: number | null | undefined): string | null; // '지하 2층' | '지상 1층'
  export function maxOutputKw(units: { outputKw?: number | null }[]): number | null;
  export function installYearRange(units: { installYear?: number | null }[]): string | null; // '2018년' | '2017~2022년'
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/charger-display.test.ts
import { describe, it, expect } from 'vitest';
import { facilityKindLabel, floorLabel, maxOutputKw, installYearRange } from '@/lib/urban/charger-display';

describe('facilityKindLabel', () => {
  it('대분류 코드만 라벨로', () => {
    expect(facilityKindLabel('H0')).toBe('공동주택시설');
    expect(facilityKindLabel('A0')).toBe('공공시설');
    expect(facilityKindLabel('J0')).toBe('교육문화시설');
  });
  it('표에 없는 코드·빈 값은 null(추측 금지)', () => {
    expect(facilityKindLabel('Z9')).toBeNull();
    expect(facilityKindLabel('H001')).toBeNull();
    expect(facilityKindLabel(null)).toBeNull();
  });
});

describe('floorLabel', () => {
  it('지하·지상 층', () => {
    expect(floorLabel('B', 2)).toBe('지하 2층');
    expect(floorLabel('F', 1)).toBe('지상 1층');
  });
  it('형식·범위 밖은 null', () => {
    expect(floorLabel('X', 1)).toBeNull();
    expect(floorLabel('B', 0)).toBeNull();
    expect(floorLabel('F', null)).toBeNull();
  });
});

describe('maxOutputKw / installYearRange', () => {
  it('충전기별 값 요약', () => {
    const units = [{ outputKw: 7, installYear: 2022 }, { outputKw: 50, installYear: 2017 }, { outputKw: null, installYear: null }];
    expect(maxOutputKw(units)).toBe(50);
    expect(installYearRange(units)).toBe('2017~2022년');
  });
  it('한 해면 단일 연도, 값이 없으면 null', () => {
    expect(installYearRange([{ installYear: 2018 }, { installYear: 2018 }])).toBe('2018년');
    expect(maxOutputKw([{ outputKw: null }])).toBeNull();
    expect(installYearRange([])).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/charger-display.test.ts`
Expected: FAIL — `Cannot find module '@/lib/urban/charger-display'`

- [ ] **Step 3: 구현**

```ts
// lib/urban/charger-display.ts
// 충전소 원문 필드를 화면 문구로 바꾸는 순수 함수.

/**
 * 시설 구분 대분류. 공식 가이드(docx)는 포털 첨부로만 있어, 공개 프로젝트
 * (github.com/murianwind/ev_charger_map) 표를 쓰되 2026-10-02 실측 표본과 대조했다
 * (H0 행 = 아파트, A0 행 = 공공기관). 표에 없는 코드는 표시하지 않는다.
 */
const FACILITY_KIND: Record<string, string> = {
  A0: '공공시설',
  B0: '주차시설',
  C0: '휴게시설',
  D0: '관광시설',
  E0: '상업시설',
  F0: '차량정비시설',
  G0: '기타시설',
  H0: '공동주택시설',
  I0: '근린생활시설',
  J0: '교육문화시설',
};

export function facilityKindLabel(code: string | null | undefined): string | null {
  return code ? FACILITY_KIND[code] ?? null : null;
}

export function floorLabel(type: string | null | undefined, num: number | null | undefined): string | null {
  if (!num || num < 1 || num > 99) return null;
  if (type === 'B') return `지하 ${num}층`;
  if (type === 'F') return `지상 ${num}층`;
  return null;
}

export function maxOutputKw(units: { outputKw?: number | null }[]): number | null {
  const vals = units.map((u) => u.outputKw).filter((v): v is number => typeof v === 'number');
  return vals.length ? Math.max(...vals) : null;
}

export function installYearRange(units: { installYear?: number | null }[]): string | null {
  const ys = units.map((u) => u.installYear).filter((v): v is number => typeof v === 'number');
  if (!ys.length) return null;
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  return min === max ? `${min}년` : `${min}~${max}년`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/charger-display.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/urban/charger-display.ts tests/lib/charger-display.test.ts
git commit -m "feat(ev): 시설 구분·설치 층·최대 출력·설치 연도 표시 헬퍼

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 3: 이용 제한 경고·이용 안내 카드·충전기 출력

**Files:**
- Create: `app/(public)/urban/charger/[id]/_components/charger-access-notice.tsx`
- Create: `app/(public)/urban/charger/[id]/_components/charger-guide.tsx`
- Modify: `app/(public)/urban/charger/[id]/_components/charger-hero.tsx`
- Modify: `app/(public)/urban/charger/[id]/_components/charger-status-table.tsx`
- Modify: `lib/urban/ev-status-shared.ts` (`ChargerUnitPlain`에 `outputKw?: number | null`)
- Modify: `app/(public)/urban/charger/[id]/page.tsx`
- Test: `tests/components/charger-detail-ssr.test.ts`

**Interfaces:**
- Consumes: Task 1의 Prisma 컬럼, Task 2의 헬퍼
- Produces:
  - `ChargerAccessNotice({ accessLimited, limitDetail }): JSX.Element | null` — `accessLimited === true`일 때만
  - `ChargerGuide({ raw, units }): JSX.Element | null` — `raw`는 `ChargerRaw`(EvCharger + units)
  - `ChargerHero`: `accessLimited`면 "이용 제한" 배지
  - `ChargerStatusTable`: 각 행에 `outputKw`가 있으면 "50kW"

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/components/charger-detail-ssr.test.ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChargerAccessNotice } from '@/app/(public)/urban/charger/[id]/_components/charger-access-notice';
import { ChargerGuide } from '@/app/(public)/urban/charger/[id]/_components/charger-guide';
import { ChargerStatusTable } from '@/app/(public)/urban/charger/[id]/_components/charger-status-table';

// vitest(esbuild) classic 런타임 shim — copy-button-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

describe('ChargerAccessNotice', () => {
  it('제한이 있으면 사유와 함께 경고', () => {
    const html = renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: true, limitDetail: '거주자외 출입제한' }));
    expect(html).toContain('이용 제한');
    expect(html).toContain('거주자외 출입제한');
  });
  it('사유가 없으면 지어내지 않고 확인 안내', () => {
    const html = renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: true, limitDetail: null }));
    expect(html).toContain('운영기관에 이용 가능 여부를 확인하세요');
  });
  it('제한이 없거나 모르면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: false, limitDetail: null }))).toBe('');
    expect(renderToStaticMarkup(createElement(ChargerAccessNotice, { accessLimited: null, limitDetail: null }))).toBe('');
  });
});

const raw = {
  useTime: '08:00~20:00', parkingFree: true, floorType: 'B', floorNum: 2,
  facilityKind: 'H0', operatorTel: '1600-4047', locationDetail: 'B2(102동 3대, 104동 2대) 총 5대',
};
const units = [{ outputKw: 7, installYear: 2022 }, { outputKw: 50, installYear: 2017 }];

describe('ChargerGuide', () => {
  it('이용 시간·최대 출력·주차료·설치 위치 타일과 정보 행', () => {
    const html = renderToStaticMarkup(createElement(ChargerGuide, { raw, units }));
    expect(html).toContain('이용 안내');
    expect(html).toContain('08:00~20:00');
    expect(html).toContain('최대 50kW');
    expect(html).toContain('무료');
    expect(html).toContain('지하 2층');
    expect(html).toContain('공동주택시설');
    expect(html).toContain('1600-4047');
    expect(html).toContain('2017~2022년');
    expect(html).toContain('B2(102동 3대, 104동 2대) 총 5대');
  });
  it('값이 하나도 없으면 렌더하지 않는다', () => {
    const empty = { useTime: null, parkingFree: null, floorType: null, floorNum: null, facilityKind: null, operatorTel: null, locationDetail: null };
    expect(renderToStaticMarkup(createElement(ChargerGuide, { raw: empty, units: [] }))).toBe('');
  });
});

describe('ChargerStatusTable 출력', () => {
  it('충전기별 출력 표시', () => {
    const html = renderToStaticMarkup(
      createElement(ChargerStatusTable, { statId: 'PI707748', units: [{ chgerId: '01', chgerType: '04', isFast: true, outputKw: 100 }] }),
    );
    expect(html).toContain('100kW');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/charger-detail-ssr.test.ts`
Expected: FAIL — `Cannot find module '.../charger-access-notice'`

- [ ] **Step 3: 구현**

```tsx
// app/(public)/urban/charger/[id]/_components/charger-access-notice.tsx
// 표본의 약 48%가 '거주자 외 출입제한'(아파트 단지). 외부인이 쓸 수 없다는 사실을 카드보다 먼저 알린다.
export function ChargerAccessNotice({
  accessLimited,
  limitDetail,
}: {
  accessLimited: boolean | null;
  limitDetail: string | null;
}) {
  if (accessLimited !== true) return null;
  return (
    <div role="note" className="rounded-2xl border-2 border-[var(--color-red)] bg-[var(--color-card)] px-5 py-4">
      <p className="text-base font-bold text-[var(--color-text)]">이용 제한이 있는 충전소입니다</p>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        {limitDetail ?? '운영기관에 이용 가능 여부를 확인하세요.'}
      </p>
    </div>
  );
}
```

```tsx
// app/(public)/urban/charger/[id]/_components/charger-guide.tsx
import { Card } from '@/components/ui/card';
import { facilityKindLabel, floorLabel, maxOutputKw, installYearRange } from '@/lib/urban/charger-display';

interface GuideRaw {
  useTime: string | null;
  parkingFree: boolean | null;
  floorType: string | null;
  floorNum: number | null;
  facilityKind: string | null;
  operatorTel: string | null;
  locationDetail: string | null;
}

export function ChargerGuide({
  raw,
  units,
}: {
  raw: GuideRaw;
  units: { outputKw?: number | null; installYear?: number | null }[];
}) {
  const maxKw = maxOutputKw(units);
  const floor = floorLabel(raw.floorType, raw.floorNum);
  const tiles: { label: string; value: string }[] = [];
  if (raw.useTime) tiles.push({ label: '이용 시간', value: raw.useTime });
  if (maxKw !== null) tiles.push({ label: '출력', value: `최대 ${maxKw}kW` });
  if (raw.parkingFree !== null) tiles.push({ label: '주차료', value: raw.parkingFree ? '무료' : '유료' });
  if (floor) tiles.push({ label: '설치 위치', value: floor });

  const rows: [string, string | null][] = [
    ['시설 구분', facilityKindLabel(raw.facilityKind)],
    ['운영사 연락처', raw.operatorTel],
    ['설치 연도', installYearRange(units)],
    ['상세 위치', raw.locationDetail],
  ];
  const shownRows = rows.filter((r): r is [string, string] => !!r[1]);
  if (tiles.length === 0 && shownRows.length === 0) return null;

  return (
    <Card id="guide">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">이용 안내</h2>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
              <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
              <p className="mt-1.5 text-base font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            </div>
          ))}
        </div>
      )}
      {shownRows.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {shownRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-2.5">
              <dt className="shrink-0 text-sm text-[var(--color-muted)]">{k}</dt>
              <dd className="text-right text-sm font-semibold text-[var(--color-text)]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
```

`ev-status-shared.ts`의 `ChargerUnitPlain`에 `outputKw?: number | null;`을 추가한다.

`charger-status-table.tsx`의 행 렌더에서 타입 라벨 `<span className="ml-1 text-xs …">(…)</span>` 다음에 추가한다.

```tsx
              {r.outputKw ? <span className="ml-1 text-xs text-[var(--color-muted)]">{r.outputKw}kW</span> : null}
```

`mergeUnitStatuses`는 `...u`로 펼치므로 `outputKw`가 그대로 따라온다.

`charger-hero.tsx`: 배지 줄의 `{r.chargerCount}기` 배지 다음에 추가한다.

```tsx
          {r.accessLimited === true && <Badge tone="orange">이용 제한</Badge>}
```

`Badge`의 `tone`에 `orange`가 있는지 확인한다(`urban-hero.tsx`가 이미 `tone="orange"`를 쓴다).

`page.tsx`(charger): import 추가.

```tsx
import { ChargerAccessNotice } from './_components/charger-access-notice';
import { ChargerGuide } from './_components/charger-guide';
```

`<ChargerHero item={item} />` 다음, 그리드 `div` 앞에 추가한다.

```tsx
      <div className="mt-4">
        <ChargerAccessNotice accessLimited={r.accessLimited} limitDetail={r.limitDetail} />
      </div>
```

`ChargerStatusTable`의 `units` 매핑에 `outputKw: u.outputKw`를 추가하고, `ChargerStatusTable` 바로 다음에 추가한다.

```tsx
          <ChargerGuide raw={r} units={r.units} />
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/charger-detail-ssr.test.ts tests/components/charger-status-ssr.test.ts tests/lib/ev-status-helpers.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/urban/charger/[id]/_components/charger-access-notice.tsx" "app/(public)/urban/charger/[id]/_components/charger-guide.tsx" "app/(public)/urban/charger/[id]/_components/charger-hero.tsx" "app/(public)/urban/charger/[id]/_components/charger-status-table.tsx" lib/urban/ev-status-shared.ts "app/(public)/urban/charger/[id]/page.tsx" tests/components/charger-detail-ssr.test.ts
git commit -m "feat(ev): 충전소 상세에 이용 제한 경고·이용 안내 카드·충전기별 출력

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 4: 전체 게이트

- [ ] **Step 1**

Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`
Expected: lint 경고·오류 0, 단위 테스트 전부 PASS, build 성공

- [ ] **Step 2: push·PR·머지·운영 재수집은 사용자 확인 후**

운영 재수집은 일일 한도 때문에 **자정(KST) 이후**, 또는 운영계정 승인 뒤에 한다. 이번에는 체크포인트가 OK라 1페이지부터 시작한다.
```bash
cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm tsx scripts/ingest/amenities/runner.ts --source=ev-charger
```
확인(읽기 전용):
```sql
SELECT count(*) total, count("accessLimited") lim, count(*) FILTER (WHERE "accessLimited") lim_y,
       count("useTime") ut, count("floorNum") fl, count("facilityKind") fk, count("locationDetail") loc
FROM "EvCharger" WHERE "updatedAt" >= now() - interval '1 day';
```
