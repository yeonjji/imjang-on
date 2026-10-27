# 병원 진료시간 보강(국립중앙의료원) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심평원 진료시간이 없는 병원 상세에 국립중앙의료원 진료시간을 채워, 진료시간 탭·오늘 진료 카드·FAQ·주변 집계가 같은 값을 쓰게 한다.

**Architecture:** 새 테이블 `HospitalNemcHours`에 주 1회 전국 수집(이름+도로명 주소 → 이름+전화 1:1 매칭)으로 저장한다. 표시 우선순위는 `lib/hospital/hours.ts`의 `effectiveHours()` 하나(TS)와 같은 규칙의 SQL 조각(집계 2곳)이 정한다. 심평원 값이 하나라도 있으면 심평원만 쓴다.

**Tech Stack:** Next.js App Router, Prisma(PostgreSQL+PostGIS), vitest(unit `pnpm test:unit`, integration `pnpm test:integration`), Playwright, fast-xml-parser, systemd 타이머(박스).

**Spec:** `docs/superpowers/specs/2026-10-27-hospital-hours-nemc-design.md` · 시안 `docs/superpowers/mockups/2026-10-27-hospital-hours-nemc.html`

## Global Constraints

- API: `https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire`, `env.PUBLIC_DATA_KEY`, `numOfRows=5000`, 요일 `dutyTime{1..8}s/c`(1=월 … 7=일, 8=공휴일, `'1430'` 문자열).
- 호출마다 시간 제한 30초 + 1회 재시도, `resultCode !== '00'`이면 실패. XML 파서는 `parseTagValue: false`(값을 문자열로).
- 매칭: ① 정규화 이름 + 도로명 주소 1:1 ② 없으면 정규화 이름 + 전화(숫자만) 1:1 ③ 둘 이상이면 버림.
- 우선순위: 심평원 `HospitalDetail`의 open/close 14칸(월~일) 중 하나라도 non-null이면 심평원만. 아니면 nemc.
- nemc 출처일 때 출처 줄 문구(정확히): `출처: 국립중앙의료원 전국 병·의원 찾기 · {YYYY-MM-DD} 조회` 다음 줄 `진료시간은 바뀔 수 있으니 방문 전 전화({tel})로 확인하세요.` (tel 없으면 `방문 전 전화로 확인하세요.`), 안내는 `안내: {note}`.
- 실행이 끝까지 성공했을 때만 이번에 못 본 행 삭제. 받은 건수 0이면 실패.
- 주기: 일요일 KST 04:00 = `Sat *-*-* 19:00:00`(박스 TZ=UTC).
- 브랜치 `feat/hospital-hours-nemc`. main 머지 = 운영 배포 → test·lint·build·실데이터 QA·사용자 승인 후에만 머지.
- 마이그레이션: `prisma migrate dev --create-only`로 만들고 **새 폴더만** `git add`(다른 잔여 마이그레이션 쓸어담기 금지). RLS 문 없음.
- 완료 전 `pnpm lint` 필수(no-unused-vars).

## Review Focus

1. **심평원 값이 전부 모순(종료<시작)인 병원** — 14칸이 non-null이라 심평원 우선 → 진료시간 섹션이 비어도 nemc로 넘어가지 않는다(스펙의 의도적 단순화). Task 3 테스트로 고정.
2. **nemc 진료시간이 `'0000'~'0000'`·`'2500'`·빈 문자열** — 파싱은 숫자로 저장하되 표시는 기존 `formatHospitalHours` 검사로 걸러야 한다. Task 2·3 테스트.
3. **이름은 같고 주소가 다른 체인(예: 같은 이름 치과 2곳)** — 주소 일치가 1곳이면 매칭, 주소가 둘 다 다르고 전화도 다르면 미매칭. 같은 키 후보가 2곳이면 버림. Task 2 테스트.
4. **수집 중간 실패(2페이지에서 시간 초과)** — 기존 행을 지우면 안 된다. Task 4 테스트.
5. **공휴일만 있는 nemc 데이터** — 요일표엔 '공휴일' 줄만, 오늘 진료 카드엔 안 나온다(요일 기준). Task 5 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/20261027000000_add_hospital_nemc_hours/` | 테이블 |
| `lib/hospital/nemc.ts` (생성) | 응답 XML → `NemcHospital[]` 파싱, HHMM 변환 |
| `lib/hospital/nemc-match.ts` (생성) | 매칭 순수 함수 |
| `lib/hospital/hours.ts` (생성) | `effectiveHours()` + SQL 조각 `effectiveHoursSql` |
| `scripts/ingest/hospital-nemc/http.ts` (생성) | 페이지 호출(시간 제한·재시도·resultCode) |
| `scripts/ingest/hospital-nemc/load.ts` (생성) | 매칭·upsert·정리 |
| `scripts/ingest/hospital-nemc/runner.ts` (생성) | 실행·ingestionRun·notify |
| `lib/data-sources.ts` | `nemc` 등록 |
| `lib/hospital/index.ts` | `nemcHours` include |
| `.../[id]/_components/hospital-tab-operation.tsx`, `hospital-summary-cards.tsx`, `hospital-tabs.tsx`, `page.tsx` | 표시 |
| `lib/faq/builders/hospital.ts` | FAQ 월요일 시간 + 출처 |
| `lib/hospital/context.ts`, `lib/pharmacy/context.ts` | 집계 SQL |
| `deploy/run-etl.sh`, `deploy/systemd/install-timers.sh`, `package.json` | 실행 배선 |

---

### Task 1: 테이블

**Files:**
- Modify: `prisma/schema.prisma` (model Hospital 관계 1줄 + 새 model)
- Create: `prisma/migrations/20261027000000_add_hospital_nemc_hours/migration.sql`

**Interfaces:**
- Produces: Prisma 모델 `HospitalNemcHours`(필드: `hospitalId BigInt @id`, `hpid`, `openMon..closeSun`, `openHol`, `closeHol`, `note`, `fetchedAt`), `Hospital.nemcHours`.

- [ ] **Step 1: 스키마 추가** — `model Hospital`의 `staff HospitalStaff[]` 아래에 `nemcHours HospitalNemcHours?`를 넣고, 파일 끝(Hospital 관련 모델 근처)에:

```prisma
/// 국립중앙의료원 병·의원 찾기 진료시간. 심평원(HospitalDetail)과 섞지 않는다 — 표시 우선순위는 lib/hospital/hours.ts.
model HospitalNemcHours {
  hospitalId BigInt   @id
  hospital   Hospital @relation(fields: [hospitalId], references: [id], onDelete: Cascade)
  hpid       String   @db.VarChar(20)
  openMon  Int?
  closeMon Int?
  openTue  Int?
  closeTue Int?
  openWed  Int?
  closeWed Int?
  openThu  Int?
  closeThu Int?
  openFri  Int?
  closeFri Int?
  openSat  Int?
  closeSat Int?
  openSun  Int?
  closeSun Int?
  openHol  Int?
  closeHol Int?
  note      String?  @db.VarChar(300)
  fetchedAt DateTime
}
```

- [ ] **Step 2: 마이그레이션 생성(새 폴더만)**

Run: `pnpm exec dotenv -e .env.test -- prisma migrate dev --create-only --name add_hospital_nemc_hours`
그 뒤 생성된 폴더 이름을 `20261027000000_add_hospital_nemc_hours`로 바꾸고, SQL이 아래만 담는지 확인(다른 테이블 변경이 섞였으면 제거):

```sql
-- CreateTable
CREATE TABLE "HospitalNemcHours" (
    "hospitalId" BIGINT NOT NULL,
    "hpid" VARCHAR(20) NOT NULL,
    "openMon" INTEGER, "closeMon" INTEGER, "openTue" INTEGER, "closeTue" INTEGER,
    "openWed" INTEGER, "closeWed" INTEGER, "openThu" INTEGER, "closeThu" INTEGER,
    "openFri" INTEGER, "closeFri" INTEGER, "openSat" INTEGER, "closeSat" INTEGER,
    "openSun" INTEGER, "closeSun" INTEGER, "openHol" INTEGER, "closeHol" INTEGER,
    "note" VARCHAR(300),
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HospitalNemcHours_pkey" PRIMARY KEY ("hospitalId")
);

-- AddForeignKey
ALTER TABLE "HospitalNemcHours" ADD CONSTRAINT "HospitalNemcHours_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: 적용·생성 확인**

Run: `pnpm test:db:migrate && pnpm exec prisma generate && pnpm exec dotenv -e .env.test -- prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261027000000_add_hospital_nemc_hours
git commit -m "feat(db): HospitalNemcHours — 국립중앙의료원 진료시간(심평원과 분리)"
```

---

### Task 2: 파싱·매칭 (순수 함수)

**Files:**
- Create: `lib/hospital/nemc.ts`, `lib/hospital/nemc-match.ts`
- Test: `tests/lib/hospital-nemc.test.ts`

**Interfaces:**
- Produces:
  - `type NemcHospital = { hpid: string; name: string; addr: string; tel: string; hours: NemcHoursValues; note: string | null }`
  - `type NemcHoursValues = { openMon: number|null; closeMon: number|null; … openSun; closeSun; openHol; closeHol }` (16키, 이름은 Prisma 컬럼과 동일)
  - `parseNemcPage(xml: string): { resultCode: string; totalCount: number; items: NemcHospital[] }`
  - `toHhmm(v: string | undefined): number | null`
  - `type OurHospital = { id: bigint; name: string; address: string; tel: string | null }`
  - `buildMatcher(ours: OurHospital[]): (n: NemcHospital) => bigint | null`
  - `normName(s)`, `normRoad(s)`, `normTel(s)` (export, 테스트용)

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { parseNemcPage, toHhmm } from '@/lib/hospital/nemc';
import { buildMatcher, normName, normRoad } from '@/lib/hospital/nemc-match';

const item = (o: Record<string, string>) => `<item>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`;
const page = (code: string, items: string, total = 1) =>
  `<?xml version="1.0"?><response><header><resultCode>${code}</resultCode></header><body><items>${items}</items><totalCount>${total}</totalCount></body></response>`;

describe('parseNemcPage', () => {
  it('요일·공휴일 시간과 안내를 읽는다', () => {
    const r = parseNemcPage(page('00', item({
      hpid: 'A2801836', dutyName: '자연미소치과의원', dutyAddr: '경상남도 창원시 마산합포구 북성로 92 (상남동)',
      dutyTel1: '055-245-3567', dutyTime1s: '1430', dutyTime1c: '2100', dutyTime6s: '1000', dutyTime6c: '1400',
      dutyTime8s: '0900', dutyTime8c: '1300', dutyEtc: '점심시간 13:00~14:30',
    })));
    expect(r.resultCode).toBe('00');
    expect(r.items[0]).toMatchObject({ hpid: 'A2801836', tel: '055-245-3567', note: '점심시간 13:00~14:30' });
    expect(r.items[0].hours).toMatchObject({ openMon: 1430, closeMon: 2100, openSat: 1000, closeSat: 1400, openHol: 900, closeHol: 1300, openSun: null });
  });
  it('item이 1개여도 배열, 0건이면 빈 배열', () => {
    expect(parseNemcPage(page('00', '', 0)).items).toEqual([]);
  });
  it('resultCode를 문자열 그대로 둔다(00이 0이 되지 않음)', () => {
    expect(parseNemcPage(page('00', '')).resultCode).toBe('00');
  });
  it('안내는 300자에서 자른다', () => {
    const r = parseNemcPage(page('00', item({ hpid: 'X', dutyName: 'a', dutyAddr: 'b', dutyEtc: '가'.repeat(400) })));
    expect(r.items[0].note).toHaveLength(300);
  });
});

describe('toHhmm', () => {
  it('HHMM 숫자 문자열만', () => {
    expect(toHhmm('0930')).toBe(930);
    expect(toHhmm('2500')).toBe(2500); // 저장은 하되 표시는 formatHospitalHours가 거른다
    expect(toHhmm('')).toBeNull();
    expect(toHhmm(undefined)).toBeNull();
    expect(toHhmm('9시')).toBeNull();
  });
});

describe('정규화', () => {
  it('이름은 공백·괄호 제거, 주소는 괄호·쉼표 뒤 제거', () => {
    expect(normName('(의)동남의료재단 동남병원')).toBe('동남병원');
    expect(normRoad('경상남도 창원시 마산합포구 북성로 92, (상남동)')).toBe('경상남도 창원시 마산합포구 북성로 92');
    expect(normRoad('경상남도 창원시 마산합포구 북성로 92 (상남동)')).toBe('경상남도 창원시 마산합포구 북성로 92');
  });
});

describe('buildMatcher', () => {
  const n = (name: string, addr: string, tel = '') =>
    ({ hpid: 'H', name, addr, tel, note: null, hours: {} as never });
  const ours = [
    { id: 1n, name: '자연미소치과의원', address: '경상남도 창원시 마산합포구 북성로 92, (상남동)', tel: '055-245-3567' },
    { id: 2n, name: '미소치과의원', address: '서울특별시 강남구 테헤란로 1', tel: '02-111-2222' },
    { id: 3n, name: '미소치과의원', address: '서울특별시 강남구 테헤란로 9', tel: '02-333-4444' },
    { id: 4n, name: '중복의원', address: '부산광역시 중구 중앙대로 1', tel: '051-1' },
    { id: 5n, name: '중복의원', address: '부산광역시 중구 중앙대로 1', tel: '051-2' },
  ];
  const match = buildMatcher(ours);
  it('이름+도로명 주소 1:1', () => {
    expect(match(n('자연미소치과의원', '경상남도 창원시 마산합포구 북성로 92 (상남동)'))).toBe(1n);
  });
  it('같은 이름 체인은 주소로 가른다', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 테헤란로 9'))).toBe(3n);
  });
  it('주소가 다르면 이름+전화로', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 다른로 5', '02-111-2222'))).toBe(2n);
  });
  it('주소도 전화도 안 맞으면 null', () => {
    expect(match(n('미소치과의원', '서울특별시 강남구 다른로 5', '02-999'))).toBeNull();
  });
  it('후보가 둘 이상이면 버린다', () => {
    expect(match(n('중복의원', '부산광역시 중구 중앙대로 1'))).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hospital-nemc.test.ts`
Expected: FAIL — `Cannot find module '@/lib/hospital/nemc'`

- [ ] **Step 3: 구현** — `lib/hospital/nemc.ts`:

```ts
// 국립중앙의료원 병·의원 찾기(getHsptlMdcncListInfoInqire) 응답 파싱. 서버·스크립트 공용 순수 함수.
import { XMLParser } from 'fast-xml-parser';

export type NemcHoursValues = {
  openMon: number | null; closeMon: number | null; openTue: number | null; closeTue: number | null;
  openWed: number | null; closeWed: number | null; openThu: number | null; closeThu: number | null;
  openFri: number | null; closeFri: number | null; openSat: number | null; closeSat: number | null;
  openSun: number | null; closeSun: number | null; openHol: number | null; closeHol: number | null;
};

export interface NemcHospital {
  hpid: string;
  name: string;
  addr: string;
  tel: string;
  hours: NemcHoursValues;
  note: string | null;
}

// dutyTime 번호 → 컬럼 접미사 (1=월 … 7=일, 8=공휴일)
const DAY_SUFFIX = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Hol'] as const;

// '00'이 숫자 0이 되지 않게 값을 문자열로 둔다(ev-status 교훈).
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export function toHhmm(v: string | undefined): number | null {
  if (!v || !/^\d{3,4}$/.test(v)) return null;
  return Number(v);
}

export function parseNemcPage(xml: string): { resultCode: string; totalCount: number; items: NemcHospital[] } {
  const doc = parser.parse(xml) as {
    response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } | ''; totalCount?: string } };
  };
  const body = doc.response?.body;
  const raw = body?.items && typeof body.items === 'object' ? body.items.item : undefined;
  const arr = (raw ? (Array.isArray(raw) ? raw : [raw]) : []) as Record<string, string | undefined>[];
  return {
    resultCode: String(doc.response?.header?.resultCode ?? ''),
    totalCount: Number(body?.totalCount ?? 0),
    items: arr.map((it) => {
      const hours = {} as NemcHoursValues;
      DAY_SUFFIX.forEach((d, i) => {
        hours[`open${d}`] = toHhmm(it[`dutyTime${i + 1}s`]);
        hours[`close${d}`] = toHhmm(it[`dutyTime${i + 1}c`]);
      });
      const etc = (it.dutyEtc ?? '').trim();
      return {
        hpid: String(it.hpid ?? ''),
        name: String(it.dutyName ?? ''),
        addr: String(it.dutyAddr ?? ''),
        tel: String(it.dutyTel1 ?? ''),
        hours,
        note: etc ? etc.slice(0, 300) : null,
      };
    }),
  };
}
```

`lib/hospital/nemc-match.ts`:

```ts
// 국립중앙의료원 기관을 우리 Hospital에 붙인다. 확실할 때(1:1)만 — 잘못 붙이는 것보다 비워 두는 게 낫다.
// 경남 실측(2026-10-27): 이름+도로명 주소로 95% 이상 1:1.
import type { NemcHospital } from './nemc';

export interface OurHospital {
  id: bigint;
  name: string;
  address: string;
  tel: string | null;
}

export const normName = (s: string) => s.replace(/\(.*?\)/g, '').replace(/\s+/g, '');
export const normRoad = (s: string) =>
  s.replace(/\(.*?\)/g, '').split(',')[0].replace(/\s+/g, ' ').trim();
export const normTel = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function buildMatcher(ours: OurHospital[]): (n: NemcHospital) => bigint | null {
  const byNameAddr = new Map<string, bigint[]>();
  const byNameTel = new Map<string, bigint[]>();
  const push = (m: Map<string, bigint[]>, k: string, id: bigint) => m.set(k, [...(m.get(k) ?? []), id]);
  for (const h of ours) {
    push(byNameAddr, `${normName(h.name)}|${normRoad(h.address)}`, h.id);
    const t = normTel(h.tel);
    if (t) push(byNameTel, `${normName(h.name)}|${t}`, h.id);
  }
  return (n) => {
    const a = byNameAddr.get(`${normName(n.name)}|${normRoad(n.addr)}`);
    if (a) return a.length === 1 ? a[0] : null;
    const t = normTel(n.tel);
    const b = t ? byNameTel.get(`${normName(n.name)}|${t}`) : undefined;
    return b && b.length === 1 ? b[0] : null;
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hospital-nemc.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/hospital/nemc.ts lib/hospital/nemc-match.ts tests/lib/hospital-nemc.test.ts
git commit -m "feat(hospital): 국립중앙의료원 응답 파싱·1:1 매칭"
```

---

### Task 3: 표시 우선순위 `effectiveHours` + SQL 조각

**Files:**
- Create: `lib/hospital/hours.ts`
- Test: `tests/lib/hospital-hours.test.ts`

**Interfaces:**
- Consumes: Prisma 타입 `HospitalDetail`, `HospitalNemcHours`
- Produces:
  - `type HoursView = Omit<EffectiveHours, 'at'>` (client 컴포넌트 전달용)
  - `type DayHours = { label: string; hours: string }`
  - `type EffectiveHours = { source: 'hira' | 'nemc'; days: DayHours[]; at: (jsDay: number) => string | null; monday: string | null; note: string | null; fetchedAt: Date | null }`
  - `effectiveHours(detail: HospitalDetail | null, nemc: HospitalNemcHours | null): EffectiveHours | null`
  - `hiraHasHours(detail): boolean`
  - `EFFECTIVE_HOURS_LATERAL: Prisma.Sql` — `LEFT JOIN LATERAL`로 `e."openMon"…e."closeSun"`를 내는 SQL 조각. 사용처는 `d`(HospitalDetail), `n`(HospitalNemcHours), `x`/`h`가 아닌 **병원 별칭을 인자로** 받는 함수 `effectiveHoursJoin(hospitalAlias: string): Prisma.Sql`.

- [ ] **Step 1: 실패 테스트**

```ts
import { describe, it, expect } from 'vitest';
import { effectiveHours, hiraHasHours } from '@/lib/hospital/hours';

const empty = {
  openMon: null, closeMon: null, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: null, closeSat: null,
  openSun: null, closeSun: null,
};
const detail = (o: Partial<typeof empty>) => ({ ...empty, ...o }) as never;
const nemc = (o: Record<string, unknown>) =>
  ({ ...empty, openHol: null, closeHol: null, note: null, hpid: 'H', hospitalId: 1n, fetchedAt: new Date('2026-10-27T00:00:00Z'), ...o }) as never;

describe('effectiveHours', () => {
  it('심평원 값이 하나라도 있으면 심평원만(요일 섞지 않음)', () => {
    const r = effectiveHours(detail({ openMon: 900, closeMon: 1800 }), nemc({ openTue: 900, closeTue: 1800 }))!;
    expect(r.source).toBe('hira');
    expect(r.days).toEqual([{ label: '월', hours: '09:00 ~ 18:00' }]);
  });
  it('심평원이 비어 있으면 nemc, 공휴일 줄은 맨 아래', () => {
    const r = effectiveHours(detail({}), nemc({ openMon: 1430, closeMon: 2100, openHol: 900, closeHol: 1300, note: '점심시간 13:00~14:30' }))!;
    expect(r.source).toBe('nemc');
    expect(r.days.map((d) => d.label)).toEqual(['월', '공휴일']);
    expect(r.note).toBe('점심시간 13:00~14:30');
    expect(r.fetchedAt).toEqual(new Date('2026-10-27T00:00:00Z'));
  });
  it('심평원 값이 모순(종료<시작)뿐이어도 심평원 우선 — 표시할 요일 없음', () => {
    const r = effectiveHours(detail({ openMon: 1800, closeMon: 900 }), nemc({ openMon: 900, closeMon: 1800 }));
    expect(r?.source).toBe('hira');
    expect(r?.days).toEqual([]);
  });
  it('nemc의 잘못된 값(2500, 0000~0000)은 요일표에서 빠진다', () => {
    const r = effectiveHours(null, nemc({ openMon: 900, closeMon: 2500, openTue: 0, closeTue: 0, openWed: 900, closeWed: 1800 }))!;
    expect(r.days).toEqual([{ label: '수', hours: '09:00 ~ 18:00' }]);
  });
  it('공휴일만 있으면 요일표엔 공휴일, 오늘 진료(at)는 null', () => {
    const r = effectiveHours(null, nemc({ openHol: 900, closeHol: 1300 }))!;
    expect(r.days).toEqual([{ label: '공휴일', hours: '09:00 ~ 13:00' }]);
    expect(r.at(1)).toBeNull();
  });
  it('at(jsDay)·monday는 같은 출처에서', () => {
    const r = effectiveHours(null, nemc({ openMon: 930, closeMon: 1830, openSun: 1000, closeSun: 1300 }))!;
    expect(r.at(1)).toBe('09:30 ~ 18:30');
    expect(r.at(0)).toBe('10:00 ~ 13:00');
    expect(r.monday).toBe('09:30 ~ 18:30');
  });
  it('둘 다 없으면 null', () => {
    expect(effectiveHours(null, null)).toBeNull();
    expect(effectiveHours(detail({}), null)).toBeNull();
  });
  it('hiraHasHours는 14칸 중 하나라도 non-null', () => {
    expect(hiraHasHours(detail({ closeSat: 1300 }))).toBe(true);
    expect(hiraHasHours(detail({}))).toBe(false);
    expect(hiraHasHours(null)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hospital-hours.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 구현** `lib/hospital/hours.ts`:

```ts
// 병원 진료시간의 표시 우선순위(스펙 2026-10-27 1안): 심평원 14칸 중 하나라도 값이 있으면 심평원만,
// 없으면 국립중앙의료원. 화면(탭·카드·FAQ)은 effectiveHours, 집계 SQL은 effectiveHoursJoin — 같은 규칙.
import { Prisma, type HospitalDetail, type HospitalNemcHours } from '@prisma/client';
import { formatHospitalHours } from './utils';

const WEEK = [
  ['월', 'Mon'], ['화', 'Tue'], ['수', 'Wed'], ['목', 'Thu'], ['금', 'Fri'], ['토', 'Sat'], ['일', 'Sun'],
] as const;
// Date#getDay() 0=일 … 6=토
const JS_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type Week = Pick<HospitalDetail,
  'openMon' | 'closeMon' | 'openTue' | 'closeTue' | 'openWed' | 'closeWed' | 'openThu' | 'closeThu' |
  'openFri' | 'closeFri' | 'openSat' | 'closeSat' | 'openSun' | 'closeSun'>;

export interface DayHours { label: string; hours: string }
export interface EffectiveHours {
  source: 'hira' | 'nemc';
  days: DayHours[];
  at: (jsDay: number) => string | null;
  monday: string | null;
  note: string | null;
  fetchedAt: Date | null;
}

export function hiraHasHours(d: Week | null): boolean {
  if (!d) return false;
  return WEEK.some(([, s]) => d[`open${s}`] != null || d[`close${s}`] != null);
}

function build(w: Week, extra: DayHours[]) {
  const fmt = (s: (typeof WEEK)[number][1]) => formatHospitalHours(w[`open${s}`], w[`close${s}`]);
  const days = WEEK.map(([label, s]) => ({ label, hours: fmt(s) }))
    .filter((d): d is DayHours => d.hours != null)
    .concat(extra);
  return { days, at: (jsDay: number) => fmt(JS_DAY[jsDay]), monday: fmt('Mon') };
}

export function effectiveHours(detail: Week | null, nemc: HospitalNemcHours | null): EffectiveHours | null {
  if (hiraHasHours(detail)) {
    return { source: 'hira', ...build(detail!, []), note: null, fetchedAt: null };
  }
  if (!nemc) return null;
  const hol = formatHospitalHours(nemc.openHol, nemc.closeHol);
  const b = build(nemc, hol ? [{ label: '공휴일', hours: hol }] : []);
  if (b.days.length === 0 && !nemc.note) return null;
  return { source: 'nemc', ...b, note: nemc.note, fetchedAt: nemc.fetchedAt };
}

const COLS = WEEK.flatMap(([, s]) => [`open${s}`, `close${s}`]);

/**
 * 집계 SQL용: `${effectiveHoursJoin('x')}` 뒤에서 e."openSat" 등을 쓴다. 규칙은 effectiveHours와 같다.
 * hospitalAlias는 코드 상수만 넘긴다(사용자 입력 금지).
 */
export function effectiveHoursJoin(hospitalAlias: 'x' | 'h'): Prisma.Sql {
  const anyHira = COLS.map((c) => `d."${c}"`).join(', ');
  const pick = COLS.map((c) => `CASE WHEN COALESCE(${anyHira}) IS NOT NULL THEN d."${c}" ELSE n."${c}" END AS "${c}"`).join(',\n      ');
  return Prisma.raw(`
    LEFT JOIN "HospitalDetail" d ON d."hospitalId" = ${hospitalAlias}.id
    LEFT JOIN "HospitalNemcHours" n ON n."hospitalId" = ${hospitalAlias}.id
    CROSS JOIN LATERAL (SELECT
      ${pick}) e`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/hospital-hours.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/hospital/hours.ts tests/lib/hospital-hours.test.ts
git commit -m "feat(hospital): 진료시간 표시 우선순위 effectiveHours — 심평원 우선, 없으면 국립중앙의료원"
```

---

### Task 4: 수집 (http·load·runner) + 배선

**Files:**
- Create: `scripts/ingest/hospital-nemc/http.ts`, `load.ts`, `runner.ts`
- Modify: `package.json`(scripts), `deploy/run-etl.sh`, `deploy/systemd/install-timers.sh`
- Test: `tests/integration/hospital-nemc-load.test.ts`

**Interfaces:**
- Consumes: `parseNemcPage`, `NemcHospital`(Task 2), `buildMatcher`, `OurHospital`(Task 2)
- Produces:
  - `fetchNemcPage(pageNo: number): Promise<string>` (실패 시 throw)
  - `loadNemcHours(items: NemcHospital[], opts: { complete: boolean; fetchedAt: Date }): Promise<{ received: number; matched: number; unmatched: number; upserted: number; deleted: number }>`
  - `runCollect(fetchPage?: (pageNo: number) => Promise<string>): Promise<{ complete: boolean; pages: number; result: LoadResult }>`

- [ ] **Step 1: 실패 통합 테스트**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { loadNemcHours } from '@/scripts/ingest/hospital-nemc/load';
import { runCollect } from '@/scripts/ingest/hospital-nemc/runner';
import type { NemcHospital } from '@/lib/hospital/nemc';

const PFX = 'UT-NEMC-';
const hours = (o: Record<string, number>) => ({
  openMon: null, closeMon: null, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: null, closeSat: null,
  openSun: null, closeSun: null, openHol: null, closeHol: null, ...o,
});
const n = (name: string, addr: string, h: Record<string, number> = { openMon: 900, closeMon: 1800 }): NemcHospital =>
  ({ hpid: `H-${name}`, name, addr, tel: '', note: '점심 13:00~14:00', hours: hours(h) });
let a: bigint; let b: bigint;

beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  a = (await prisma.hospital.create({ data: { sourceId: `${PFX}A`, name: 'UT가나의원', typeCode: '31', typeName: '의원', address: 'UT도 UT시 가나로 1, (UT동)' } })).id;
  b = (await prisma.hospital.create({ data: { sourceId: `${PFX}B`, name: 'UT다라의원', typeCode: '31', typeName: '의원', address: 'UT도 UT시 다라로 2' } })).id;
});
afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('loadNemcHours', () => {
  it('매칭된 곳만 upsert', async () => {
    const r = await loadNemcHours([n('UT가나의원', 'UT도 UT시 가나로 1 (UT동)'), n('UT없는의원', 'UT도 UT시 없는로 9')], { complete: true, fetchedAt: new Date() });
    expect(r).toMatchObject({ received: 2, matched: 1, unmatched: 1, upserted: 1 });
    const row = await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: a } });
    expect(row).toMatchObject({ openMon: 900, closeMon: 1800, note: '점심 13:00~14:00' });
  });
  it('중간 실패(complete=false)면 못 본 행을 지우지 않는다', async () => {
    const r = await loadNemcHours([n('UT다라의원', 'UT도 UT시 다라로 2')], { complete: false, fetchedAt: new Date() });
    expect(r.deleted).toBe(0);
    expect(await prisma.hospitalNemcHours.count({ where: { hospitalId: { in: [a, b] } } })).toBe(2);
  });
  it('끝까지 성공하면 이번에 못 본 행을 지운다', async () => {
    const r = await loadNemcHours([n('UT다라의원', 'UT도 UT시 다라로 2')], { complete: true, fetchedAt: new Date() });
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: a } })).toBeNull();
  });
});

describe('runCollect', () => {
  const xml = (items: string, total: number) =>
    `<response><header><resultCode>00</resultCode></header><body><items>${items}</items><totalCount>${total}</totalCount></body></response>`;
  it('2페이지에서 실패하면 complete=false로 적재하고 throw하지 않는다', async () => {
    const r = await runCollect(async (p) => {
      if (p === 1) return xml('<item><hpid>H1</hpid><dutyName>UT다라의원</dutyName><dutyAddr>UT도 UT시 다라로 2</dutyAddr></item>', 6000);
      throw new Error('timeout');
    });
    expect(r.complete).toBe(false);
    expect(await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: b } })).not.toBeNull();
  });
  it('0건이면 throw(\'OK · 0건\' 금지)', async () => {
    await expect(runCollect(async () => xml('', 0))).rejects.toThrow(/0건/);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hospital-nemc-load.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 구현**

`scripts/ingest/hospital-nemc/http.ts`:

```ts
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { parseNemcPage } from '@/lib/hospital/nemc';

const BASE_URL = 'https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire';
export const PAGE_SIZE = 5000; // 2026-10-27 실측: 5000건 한 번에 2.3초
const TIMEOUT_MS = 30_000;

/** 한 페이지 XML. 시간 제한 + 1회 재시도, resultCode≠00이면 throw. */
export async function fetchNemcPage(pageNo: number): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY 미설정');
  const url = new URL(BASE_URL);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('numOfRows', String(PAGE_SIZE));
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const code = parseNemcPage(xml).resultCode;
      if (code !== '00') throw new Error(`resultCode ${code || '(없음)'}: ${xml.slice(0, 200)}`);
      return xml;
    } catch (err) {
      last = err;
      logger.warn({ pageNo, attempt, err }, 'hospital-nemc page failed');
    }
  }
  throw last;
}
```

`scripts/ingest/hospital-nemc/load.ts`:

```ts
import { prisma } from '@/lib/db';
import { buildMatcher } from '@/lib/hospital/nemc-match';
import type { NemcHospital } from '@/lib/hospital/nemc';

export interface LoadResult { received: number; matched: number; unmatched: number; upserted: number; deleted: number }

/** 매칭된 기관만 upsert. complete일 때만 이번 실행에서 못 본 행을 지운다(폐업·매칭 해제). */
export async function loadNemcHours(items: NemcHospital[], opts: { complete: boolean; fetchedAt: Date }): Promise<LoadResult> {
  const ours = await prisma.hospital.findMany({ select: { id: true, name: true, address: true, tel: true } });
  const match = buildMatcher(ours);
  const seen = new Map<bigint, NemcHospital>();
  let unmatched = 0;
  for (const it of items) {
    const id = match(it);
    if (id == null) unmatched++;
    else seen.set(id, it); // 같은 병원에 두 기관이 붙으면 마지막 것 — 드묾, 매칭 단계에서 1:1을 보장
  }
  const rows = [...seen.entries()];
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.$transaction(rows.slice(i, i + 500).map(([hospitalId, it]) => {
      const data = { hpid: it.hpid.slice(0, 20), ...it.hours, note: it.note, fetchedAt: opts.fetchedAt };
      return prisma.hospitalNemcHours.upsert({ where: { hospitalId }, create: { hospitalId, ...data }, update: data });
    }));
  }
  let deleted = 0;
  if (opts.complete) {
    deleted = (await prisma.hospitalNemcHours.deleteMany({ where: { fetchedAt: { lt: opts.fetchedAt } } })).count;
  }
  return { received: items.length, matched: rows.length, unmatched, upserted: rows.length, deleted };
}
```

`scripts/ingest/hospital-nemc/runner.ts`:

```ts
/**
 * 국립중앙의료원 병·의원 찾기 → HospitalNemcHours. 주 1회 전국(약 16페이지).
 *   pnpm ingest:hospital-nemc
 * 화면은 DB만 읽는다(ISR 주기로 반영).
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { parseNemcPage, type NemcHospital } from '@/lib/hospital/nemc';
import { fetchNemcPage, PAGE_SIZE } from './http';
import { loadNemcHours, type LoadResult } from './load';

export const HOSPITAL_NEMC_SOURCE = 'hospital-nemc';

export async function runCollect(
  fetchPage: (pageNo: number) => Promise<string> = fetchNemcPage,
): Promise<{ complete: boolean; pages: number; result: LoadResult }> {
  const fetchedAt = new Date();
  const items: NemcHospital[] = [];
  let complete = false;
  let pages = 0;
  for (let p = 1; p <= 100; p++) {
    let page;
    try {
      page = parseNemcPage(await fetchPage(p));
    } catch (err) {
      logger.warn({ pageNo: p, err }, 'hospital-nemc stopped early');
      break;
    }
    pages = p;
    items.push(...page.items);
    if (p * PAGE_SIZE >= page.totalCount || page.items.length === 0) { complete = true; break; }
  }
  if (items.length === 0) throw new Error('hospital-nemc 수집 0건 — 호출 실패로 본다');
  const result = await loadNemcHours(items, { complete, fetchedAt });
  return { complete, pages, result };
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({ data: { source: HOSPITAL_NEMC_SOURCE, targetKey: 'weekly', status: 'RUNNING' } });
  try {
    const r = await runCollect();
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: r.complete ? 'OK' : 'ERROR', rowsUpserted: r.result.upserted, finishedAt: new Date(),
        errorMessage: r.complete ? null : `중간 중단: ${r.pages}페이지까지 적재, 정리 생략` },
    });
    await notify(r.complete ? 'info' : 'warn', `hospital-nemc ${r.complete ? '완료' : '중간 중단'}`, { pages: r.pages, ...r.result });
    if (!r.complete) process.exitCode = 1;
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'hospital-nemc failed');
    await notify('error', 'hospital-nemc failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('hospital-nemc/runner')) {
  main().catch((err) => { logger.error({ err }, 'hospital-nemc runner fatal'); process.exit(1); });
}
```

배선:
- `package.json` scripts에 `"ingest:hospital-nemc": "dotenv -e .env.local -- tsx scripts/ingest/hospital-nemc/runner.ts",` (`ingest:building-register` 다음 줄)
- `deploy/run-etl.sh` case에 `  hospital-nemc)     $DC pnpm tsx scripts/ingest/hospital-nemc/runner.ts ;;  # 주 1회 전국 진료시간` (`building-register` 줄 다음)
- `deploy/systemd/install-timers.sh`: JOBS에 `hospital-nemc|Sat *-*-* 19:00:00` 추가, `sudo systemctl start` 줄 끝에 ` imjang-etl@hospital-nemc.timer` 추가(**두 군데 모두**)

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/hospital-nemc-load.test.ts && grep -c "hospital-nemc" deploy/systemd/install-timers.sh`
Expected: PASS (5 tests), grep 결과 `2`

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/hospital-nemc tests/integration/hospital-nemc-load.test.ts package.json deploy/run-etl.sh deploy/systemd/install-timers.sh
git commit -m "feat(etl): 국립중앙의료원 진료시간 주간 수집 — 완주 시에만 정리, 0건은 실패"
```

---

### Task 5: 화면 (탭·카드·FAQ·출처)

**Files:**
- Modify: `lib/data-sources.ts`(`DataSourceId`에 `'nemc'`, `DATA_SOURCES`에 항목), `lib/hospital/index.ts`(include `nemcHours: true`), `.../[id]/_components/hospital-tab-operation.tsx`, `hospital-tabs.tsx`, `hospital-summary-cards.tsx`, `.../[id]/page.tsx`, `lib/faq/builders/hospital.ts`
- Test: `tests/components/hospital-hours-ssr.test.ts`, `tests/lib/faq-hospital.test.ts`(있으면 수정, 없으면 생성)

**Interfaces:**
- Consumes: `effectiveHours`, `EffectiveHours`(Task 3), `HospitalWithRelations['nemcHours']`
- Produces: `HospitalTabOperation({ detail, transits, hours, tel })`, `HospitalSummaryCards({ totalDoctors, facility, detail, todayHours })`, `HospitalFaqInput.hours: { monday: string | null; source: 'hira' | 'nemc' } | null` (기존 `detail.openMon/closeMon` 대체)

- [ ] **Step 1: 실패 테스트** `tests/components/hospital-hours-ssr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HospitalTabOperation } from '@/app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-tab-operation';
import { effectiveHours } from '@/lib/hospital/hours';
import { buildHospitalFaq } from '@/lib/faq/builders/hospital';

(globalThis as unknown as { React: typeof React }).React = React;

const nemc = {
  hospitalId: 1n, hpid: 'A1', openMon: 1430, closeMon: 2100, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: 1000, closeSat: 1400, openSun: null, closeSun: null,
  openHol: null, closeHol: null, note: '점심시간 13:00~14:30', fetchedAt: new Date('2026-10-27T03:00:00Z'),
};

describe('진료시간 탭', () => {
  it('nemc 출처면 요일표·안내·출처 줄(조회일·전화)', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, {
      detail: null, transits: [], hours: effectiveHours(null, nemc as never), tel: '055-245-3567',
    }));
    expect(html).toContain('14:30 ~ 21:00');
    expect(html).toContain('안내: 점심시간 13:00~14:30');
    expect(html).toContain('출처: 국립중앙의료원 전국 병·의원 찾기 · 2026-10-27 조회');
    expect(html).toContain('방문 전 전화(055-245-3567)로 확인하세요.');
  });
  it('hira 출처면 출처 줄 없음(기존 화면 그대로)', () => {
    const detail = { openMon: 900, closeMon: 1800 } as never;
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, {
      detail, transits: [], hours: effectiveHours(detail, nemc as never), tel: null,
    }));
    expect(html).toContain('09:00 ~ 18:00');
    expect(html).not.toContain('국립중앙의료원');
  });
  it('진료시간도 상세도 교통도 없으면 기존 빈 문구', () => {
    const html = renderToStaticMarkup(createElement(HospitalTabOperation, { detail: null, transits: [], hours: null, tel: null }));
    expect(html).toContain('운영·교통 정보가 등록되어 있지 않습니다.');
  });
});

describe('FAQ 진료시간', () => {
  const base = { name: 'X의원', typeName: '의원', sigungu: null, sido: null, depts: [], totalDoctors: null, detail: null };
  it('nemc 값이면 출처도 국립중앙의료원', () => {
    const items = buildHospitalFaq({ ...base, hours: { monday: '14:30 ~ 21:00', source: 'nemc' } });
    const q = items.find((i) => i.q.includes('진료시간'))!;
    expect(q.a).toContain('14:30 ~ 21:00');
    expect(q.source).toBe('국립중앙의료원');
  });
  it('월요일 값이 없으면 문항 없음', () => {
    expect(buildHospitalFaq({ ...base, hours: null }).some((i) => i.q.includes('진료시간'))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/hospital-hours-ssr.test.ts`
Expected: FAIL (props·타입 불일치, 출처 문구 없음)

- [ ] **Step 3: 구현**

`lib/data-sources.ts` — 타입 유니온에 `| 'nemc'`, 객체에 `hira` 다음:

```ts
  nemc: {
    id: 'nemc',
    provider: '국립중앙의료원',
    dataset: '전국 병·의원 찾기',
    url: 'https://www.data.go.kr/data/15000736/openapi.do',
    category: '의료',
  },
```

`lib/hospital/index.ts` include에 `nemcHours: true,` (`staff: true,` 다음).

`hospital-tab-operation.tsx` — props와 진료시간 섹션 교체(응급실·주차·교통 부분은 그대로):

```tsx
import type { HospitalWithRelations } from '@/lib/hospital';
import type { HoursView } from '@/lib/hospital/hours';

interface Props {
  detail: HospitalWithRelations['detail'];
  transits: HospitalWithRelations['transits'];
  hours: HoursView | null;
  tel: string | null;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function HospitalTabOperation({ detail, transits, hours, tel }: Props) {
  if (!detail && !transits.length && !hours) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">운영·교통 정보가 등록되어 있지 않습니다.</p>;
  }
  const hira = hours?.source === 'hira';
  const days = hours?.days ?? [];
  // 점심·일요일·공휴일 휴진 문구는 심평원 값이므로 심평원 출처일 때만.
  const hasHourInfo =
    days.length > 0 || !!hours?.note ||
    (hira && !!(detail?.lunchWeekday || detail?.lunchSaturday || detail?.closedSunday || detail?.closedHoliday));
  return (
    <div className="flex flex-col gap-6">
      {hasHourInfo && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료시간</h3>
          {days.length > 0 && (
            <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {days.map(d => (
                <div key={d.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-semibold text-[var(--color-blue-dark)]">{d.label}</span>
                  <span className="text-[var(--color-muted)]">{d.hours}</span>
                </div>
              ))}
            </div>
          )}
          {hira && detail?.lunchWeekday && <p className="mt-2 text-xs text-[var(--color-muted)]">점심(평일): {detail.lunchWeekday}</p>}
          {hira && detail?.lunchSaturday && <p className="mt-1 text-xs text-[var(--color-muted)]">점심(토요일): {detail.lunchSaturday}</p>}
          {hira && detail?.closedSunday && <p className="mt-1 text-xs text-[var(--color-muted)]">일요일: {detail.closedSunday}</p>}
          {hira && detail?.closedHoliday && <p className="mt-1 text-xs text-[var(--color-muted)]">공휴일: {detail.closedHoliday}</p>}
          {hours?.source === 'nemc' && (
            <>
              {hours.note && <p className="mt-2 text-sm">안내: {hours.note}</p>}
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                출처: 국립중앙의료원 전국 병·의원 찾기{hours.fetchedAt ? ` · ${ymd(hours.fetchedAt)} 조회` : ''}
                <br />
                진료시간은 바뀔 수 있으니 방문 전 {tel ? `전화(${tel})로` : '전화로'} 확인하세요.
              </p>
            </>
          )}
        </section>
      )}
      {detail && (
        <>
          {/* 응급실·주차 섹션: 기존 코드 그대로 이동(변경 없음) */}
        </>
      )}
      {/* 교통편 섹션: 기존 코드 그대로 */}
    </div>
  );
}
```

(구현 시 주석 자리에 기존 응급실·주차·교통 JSX를 그대로 옮긴다. 기존 `DAYS` 상수와 `formatHospitalHours` import는 제거.)

`hospital-tabs.tsx`는 `'use client'`라 함수(`at`)가 든 `EffectiveHours`를 그대로 못 받는다. `lib/hospital/hours.ts`에 `export type HoursView = Omit<EffectiveHours, 'at'>;`를 추가하고, `HospitalTabs` props에 `hours: HoursView | null`을 더해 `<HospitalTabOperation detail={hospital.detail} transits={hospital.transits} hours={hours} tel={hospital.tel} />`로 넘긴다. `HospitalTabOperation`의 `hours` prop 타입도 `HoursView | null`로 둔다(`EffectiveHours`는 `HoursView`에 할당 가능하므로 Task 5 테스트 그대로 통과). `fetchedAt`(Date)은 RSC → client props로 전달된다.

`hospital-summary-cards.tsx`: prop `todayHours?: (jsDay: number) => string | null`는 함수라 client 컴포넌트로 못 넘긴다 → 대신 `weekHours: (string | null)[]`(길이 7, jsDay 인덱스)를 page에서 `[0..6].map(hours.at)`으로 만들어 넘기고, 카드에서 `weekHours?.[new Date().getDay()]`를 쓴다. 기존 `DAY_KEYS`·detail 기반 오늘 진료 계산은 제거.

`page.tsx`:

```tsx
import { effectiveHours } from '@/lib/hospital/hours';
// …
const hours = effectiveHours(hospital.detail, hospital.nemcHours);
const weekHours = hours ? [0, 1, 2, 3, 4, 5, 6].map((d) => hours.at(d)) : null;
const hoursView = hours ? { source: hours.source, days: hours.days, monday: hours.monday, note: hours.note, fetchedAt: hours.fetchedAt } : null;
```

- `<HospitalTabs hospital={hospital} hours={hoursView} />`

- `<HospitalSummaryCards … weekHours={weekHours} />`
- FAQ 입력: `detail`의 `openMon/closeMon` 제거하고 `hours: hours ? { monday: hours.monday, source: hours.source } : null`
- 출처 캡션: `<SourceCaption ids={hours?.source === 'nemc' ? ['hira', 'nemc'] : ['hira']} />`

`lib/faq/builders/hospital.ts`:

```ts
export interface HospitalFaqInput {
  // … 기존 필드
  hours: { monday: string | null; source: 'hira' | 'nemc' } | null;
  detail: { erDayOpen: string | null; erNightOpen: string | null } | null;
}
// …
  if (h.hours?.monday) {
    items.push({
      q: `${name}의 진료시간은 어떻게 되나요?`,
      a: `평일(월) 기준 ${h.hours.monday}에 진료합니다. 요일별 진료시간·점심시간은 병원 사정으로 달라질 수 있어 방문 전 확인을 권장합니다.`,
      source: h.hours.source === 'nemc' ? '국립중앙의료원' : HIRA,
    });
  }
```

(`formatHospitalHours` import가 더 안 쓰이면 제거. 기존 테스트 `tests/lib/faq/builders/hospital.test.ts`가 `detail.openMon/closeMon`을 넘기므로 `hours: { monday: '09:00 ~ 18:00', source: 'hira' }` 형태로 고치고 기대 출처 `건강보험심사평가원`은 유지.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/components/hospital-hours-ssr.test.ts && pnpm test:unit && pnpm exec tsc --noEmit && pnpm lint`
Expected: 전부 PASS, tsc 출력 없음, `✔ No ESLint warnings or errors`

- [ ] **Step 5: Commit**

```bash
git add lib/data-sources.ts lib/hospital/index.ts "app/(public)/medical/hospital/[sigunguCode]/[id]" lib/faq/builders/hospital.ts tests/components/hospital-hours-ssr.test.ts tests/lib
git commit -m "feat(hospital): 진료시간 탭·오늘 진료·FAQ를 effectiveHours로 — 국립중앙의료원 출처 줄"
```

---

### Task 6: 집계 SQL 2곳

**Files:**
- Modify: `lib/hospital/context.ts`, `lib/pharmacy/context.ts`
- Test: `tests/integration/pr6-context.test.ts`(케이스 추가)

**Interfaces:**
- Consumes: `effectiveHoursJoin('x' | 'h')`(Task 3)

- [ ] **Step 1: 실패 테스트 추가** — `pr6-context.test.ts`의 `beforeAll` 끝에 심평원 시간이 없는(H3 소아청소년과처럼) 내과 의원 하나를 nemc 시간만으로 추가하고, 기대값을 갱신:

```ts
  // nemc 전용 의원: 심평원 진료시간 없음, 국립중앙의료원에 토요일·야간·일요일 진료
  const h7 = await mk('UT-PR6-H7', 'UT등대내과의원', '의원');
  await prisma.hospitalDept.create({ data: { hospitalId: h7.id, deptCode: '01', deptName: '내과' } });
  await prisma.$executeRaw`UPDATE "Hospital" SET location = ST_SetSRID(ST_MakePoint(124.5001, 33.0001), 4326)::geography WHERE id = ${h7.id}`;
  await prisma.hospitalNemcHours.create({ data: {
    hospitalId: h7.id, hpid: 'UT-H7', fetchedAt: new Date(),
    openMon: 900, closeMon: 2100, openSat: 900, closeSat: 1300, openSun: 1000, closeSun: 1300,
  } });
```

(`mk`·deptCode 형식·좌표는 같은 파일의 H1 생성 코드와 맞춘다 — 파일에서 `hospitalDept.create`/`createMany`와 H1 좌표 설정 줄을 확인해 동일 패턴으로.)

기대값 변경:

```ts
    expect(await getSameDeptNearby({ typeName: '의원' }, '내과', 33.0, 124.5)).toEqual({
      // H7(nemc 전용) 추가: 공개 +1, 토요일 +1, 야간(21:00 종료) +1
      dept: '내과', typeName: '의원', total: 5, withHours: 4, saturday: 3, night: 2,
    });
```

```ts
    expect(await countSundayClinicsNearby(33.0, 124.5)).toBe(2); // H1(심평원) + H7(nemc)
```

그리고 심평원 우선 규칙 고정 케이스: H1에도 nemc 행을 넣되 일요일 값을 비워 두고(`openSun: null`), 일요일 수가 여전히 2인지 — 심평원 일요일이 쓰인다는 증거. `afterAll`/정리 코드에 `UT-PR6-H7` 포함(접두어 삭제라 자동).

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/pr6-context.test.ts`
Expected: FAIL — total 5 기대, 실제 total 5 withHours 3 …(nemc 미반영)

- [ ] **Step 3: 구현** — `lib/hospital/context.ts`의 쿼리에서 `d.` 시간 컬럼 참조를 전부 `e.`로 바꾸고 JOIN을 교체:

```ts
import { effectiveHoursJoin } from './hours';
// …
           count(DISTINCT x.id) FILTER (
             WHERE COALESCE(e."openMon", e."closeMon", e."openTue", e."closeTue", e."openWed", e."closeWed",
                            e."openThu", e."closeThu", e."openFri", e."closeFri", e."openSat", e."closeSat",
                            e."openSun", e."closeSun") IS NOT NULL
           )::int AS with_hours,
           count(DISTINCT x.id) FILTER (
             WHERE e."openSat" BETWEEN 0 AND 2400 AND e."closeSat" BETWEEN 0 AND 2400 AND e."closeSat" > e."openSat"
           )::int AS saturday,
           count(DISTINCT x.id) FILTER (
             WHERE (e."closeMon" > 2000 AND e."closeMon" <= 2400 AND e."openMon" < e."closeMon")
                OR (e."closeTue" > 2000 AND e."closeTue" <= 2400 AND e."openTue" < e."closeTue")
                OR (e."closeWed" > 2000 AND e."closeWed" <= 2400 AND e."openWed" < e."closeWed")
                OR (e."closeThu" > 2000 AND e."closeThu" <= 2400 AND e."openThu" < e."closeThu")
                OR (e."closeFri" > 2000 AND e."closeFri" <= 2400 AND e."openFri" < e."closeFri")
           )::int AS night
    FROM "Hospital" x
    JOIN "HospitalDept" dp ON dp."hospitalId" = x.id AND dp."deptName" = ${dept}
    ${effectiveHoursJoin('x')}
    WHERE …(그대로)
```

파일 상단 주석 "진료시간은 일부만 공개돼 있어…" 뒤에 `심평원 우선, 없으면 국립중앙의료원(lib/hospital/hours.ts와 같은 규칙).` 한 줄 추가.

`lib/pharmacy/context.ts` `countSundayClinicsNearby`:

```ts
import { effectiveHoursJoin } from '@/lib/hospital/hours';
// …
    SELECT count(*)::int AS n
    FROM "Hospital" h
    ${effectiveHoursJoin('h')}
    WHERE h.location IS NOT NULL
      AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
      AND e."openSun" BETWEEN 0 AND 2400 AND e."closeSun" BETWEEN 0 AND 2400 AND e."closeSun" > e."openSun"
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/integration/pr6-context.test.ts && pnpm test:integration`
Expected: PASS (기존 briefing 병렬 flake는 메모리에 기록된 잔존 이슈 — 그것만 실패하면 단독 재실행으로 확인)

- [ ] **Step 5: Commit**

```bash
git add lib/hospital/context.ts lib/pharmacy/context.ts tests/integration/pr6-context.test.ts
git commit -m "feat(hospital): 같은 진료과·일요일 진료 집계도 같은 우선순위(심평원 우선, 없으면 국립중앙의료원)"
```

---

### Task 7: e2e·빌드·실데이터 QA·문서

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts`(병원 시드가 있으면 nemc 전용 1곳 추가), e2e spec(병원 상세가 있으면 출처 줄 검증)
- Modify: `docs/superpowers/specs/2026-10-27-hospital-hours-nemc-design.md`(상태·전국 실측 기록)

- [ ] **Step 1: e2e** — 2026-10-27 확인: `seed-e2e.ts`에 병원 시드가 없고 병원 상세 e2e도 없다 → 이 단계는 건너뛰고 Task 5 SSR 테스트로 갈음했다고 PR에 적는다. (참고용 원래 지시: 병원 시드가 있으면 그 병원의 `HospitalDetail` 시간을 비우고 `HospitalNemcHours`(월 14:30~21:00, note '점심시간 13:00~14:30')를 넣은 뒤, 병원 상세 e2e(`grep -rln "medical/hospital" tests/e2e`)에 운영·교통 탭 클릭 후 `국립중앙의료원 전국 병·의원 찾기` 텍스트 검증을 추가. 병원 시드·spec이 없으면 이 단계는 건너뛰고 SSR 테스트(Task 5)로 갈음했다고 PR에 적는다.

Run: `pnpm exec dotenv -e .env.test -- tsx tests/_helpers/seed-e2e.ts && pnpm test:e2e:local`
Expected: PASS

- [ ] **Step 2: 빌드** — Run: `pnpm build` · Expected: exit 0

- [ ] **Step 3: 실데이터 QA(쓰기 없는 경로)** — 운영 DB에 아직 테이블이 없으므로, 로컬 docker DB(5433, `.env.test` 아님 `.env.local`)에 운영 병원 슬라이스(경상남도 창원시, `Hospital`·`HospitalDetail`·`HospitalDept`)를 메모리 기록 방식(`\copy`, 생성열 제외, ANALYZE)으로 복사 → `pnpm ingest:hospital-nemc` 실행 → `PORT=3123 pnpm start`로 자연미소치과의원(진료시간 없던 곳)·속편한삼성내과의원(심평원 있음) 상세를 Playwright로 열어 운영·교통 탭 스크린샷. 시안 A·B와 대조. **끝나면 로컬 DB 되비우기.**

- [ ] **Step 4: 스펙 갱신** — 상태를 `구현 완료(PR #…)`로, 로컬 전국 수집 로그(받은 건수·매칭·미매칭)를 1절 아래에 `전국 실측(로컬 수집, 2026-10-27)` 표로 추가.

- [ ] **Step 5: Commit + PR(머지는 사용자 승인 후)**

```bash
git add -A tests docs
git commit -m "test(e2e),docs: 진료시간 출처 줄 검증, 전국 실측 기록"
git push -u origin feat/hospital-hours-nemc
gh pr create --base main --title "feat(hospital): 국립중앙의료원 진료시간 보강 — 심평원 우선" --body "<스펙·QA 스크린샷·실측 요약>"
```

배포 후(사용자 승인·머지 뒤): 박스에서 `sudo bash /opt/imjang/deploy/systemd/install-timers.sh`(타이머 등록) → `sudo systemctl start imjang-etl@hospital-nemc.service`로 첫 수집 → `systemctl list-timers 'imjang-etl@hospital-nemc*'` 확인 → 운영에서 자연미소치과의원 상세 확인.
