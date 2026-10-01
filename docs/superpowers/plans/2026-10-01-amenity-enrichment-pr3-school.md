# 생활시설 상세 보강 PR 3 — 학교 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 나이스 학교기본정보(schoolInfo)에서 버리던 6개 필드를 저장하고, 학교 상세(`/school/[sigunguCode]/[id]`)에 고교 유형·계열·입학 전형·설립일·개교기념일 행과 히어로의 고교 유형 배지·"개교 N년"을 추가한다.

**Architecture:** PR 1·2와 같은 패턴이다. nullable 컬럼 마이그레이션 → 어댑터 파서와 러너 upsert → 화면. 상세는 `prisma.school.findUnique`(`lib/school.ts:57`)로 행 전체를 읽으므로 조회 코드는 바꾸지 않는다. 날짜 가공은 순수 함수 모듈 `lib/school-display.ts`에 둔다.

**Tech Stack:** Next.js App Router(ISR), Prisma + PostgreSQL, 나이스 Open API(JSON), Vitest(SSR은 `renderToStaticMarkup`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` (4·5·6·8·9절, 학교 부분)

## 실측 근거 (2026-10-01, 나이스 공개 표본)

| 필드 | 고등학교 | 초·중·특수학교 |
|---|---|---|
| `HS_SC_NM` 고교 유형 | 일반고·특목고·자율고 등 | null |
| `HS_GNRL_BUSNS_SC_NM` 계열 | 일반계 등 | **"일반계" 또는 "해당없음"** — 의미 없음 |
| `SPCLY_PURPS_HS_ORD_NM` 특목고 계열 | 특목고만 값 | null |
| `ENE_BFE_SEHF_SC_NM` 입학 전형 | 후기 등 | **"전기"** — 의미 없음 |
| `FOND_YMD` 설립일 | `19881223` | `18820908`처럼 아주 오래된 값도 있음 |
| `FOAS_MEMRD` 개교기념일 | `19890428` | 설립일과 같은 경우가 많음 |

따라서 계열·입학 전형은 **고등학교에서만 표시**한다. 저장은 원문 그대로 하되 `"해당없음"`은 null로 바꾼다.

## Global Constraints

- 새 컬럼은 전부 nullable. 백필 마이그레이션 금지.
- 원본 문자열을 저장하고, 가공은 표시 시점에 한다. 단 `"해당없음"`은 값이 아니므로 파서에서 null로 바꾼다.
- 고교 전용 필드(고교 유형·계열·특목고 계열·입학 전형)는 `schoolKind === '고등학교'`일 때만 표시한다(스펙 6절).
- 값이 null이면 행을 숨긴다. `'-'` 행을 만들지 않는다(기존 행 포함, PR 2 공원과 같은 원칙).
- 색은 `--color-*` 토큰만, 한글 본문 14px 이상.
- 마이그레이션은 손으로 쓴 SQL 폴더 하나만 좁게 `git add`.
- **로컬에는 `NEIS_API_KEY`가 없다.** 로컬 실수집 단계는 없고, 파서는 실측 응답 픽스처로 검증하며, 실수집은 배포 후 박스에서 한다. 운영 키를 로컬로 복사하지 않는다.
- 커밋 메시지 끝에 다음 두 줄:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
  ```

## Review Focus

1. **초·중학교의 무의미한 고교 필드**: 초등학교에 "계열 일반계"·"입학 전형 전기"가 보이면 안 된다. → Task 3 테스트
2. **"해당없음" 문자열**: 값처럼 저장·표시되면 안 된다. → Task 1 테스트
3. **잘못된 날짜 문자열**: `YYYYMMDD` 8자리가 아니거나 존재하지 않는 날짜(`20240231`)는 null. → Task 1 테스트
4. **개교기념일이 없는 학교**: 히어로에 "개교 N년"이 빠지고 나머지는 그대로. 미래 연도면 표시하지 않는다. → Task 2·3 테스트
5. **기존 `'-'` 행**: 지금 학교 정보의 null 값은 `'-'`로 나온다. 같은 원칙으로 숨긴다(지역 행은 기존대로). → Task 3 테스트

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `prisma/schema.prisma` | `School` 컬럼 6개 | 수정 |
| `prisma/migrations/20261001000002_add_school_detail_fields/migration.sql` | ALTER TABLE | 생성 |
| `scripts/ingest/amenities/types.ts` | `NormalizedSchool` 필드 6개 | 수정 |
| `scripts/ingest/amenities/adapter-school.ts` | 새 필드 파싱, 날짜 헬퍼 | 수정 |
| `scripts/ingest/amenities/runner.ts` | `ingestSchools` upsert 컬럼 | 수정 |
| `lib/school-display.ts` | 개교 햇수, 월일 표기, 고교 여부 | 생성 |
| `app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx` | 행 추가, null 행 숨김, 고교 전용 게이트 | 수정 |
| `app/(public)/school/[sigunguCode]/[id]/_components/school-hero.tsx` | 고교 유형 배지, "개교 N년" | 수정 |
| `tests/ingest/amenities/adapter-school.test.ts` | 파서 테스트 | 생성 |
| `tests/lib/school-display.test.ts` | 표시 헬퍼 테스트 | 생성 |
| `tests/components/school-detail-ssr.test.ts` | 정보·히어로 SSR 테스트 | 생성 |
| `tests/_helpers/seed-e2e.ts` | e2e 고등학교 시드 | 수정 |
| `tests/e2e/school-detail.spec.ts` | 상세 e2e | 생성 |

---

### Task 1: 스키마·마이그레이션·파서·러너

**Files:**
- Modify: `prisma/schema.prisma` (`model School`)
- Create: `prisma/migrations/20261001000002_add_school_detail_fields/migration.sql`
- Modify: `scripts/ingest/amenities/types.ts` (`NormalizedSchool`)
- Modify: `scripts/ingest/amenities/adapter-school.ts` (`parseSchoolJson`의 `rows.push`, 헬퍼 추가)
- Modify: `scripts/ingest/amenities/runner.ts` (`ingestSchools`)
- Test: `tests/ingest/amenities/adapter-school.test.ts`

**Interfaces:**
- Produces: `NormalizedSchool`과 Prisma `School`에 같은 이름의 필드
  ```ts
  hsType: string | null;          // HS_SC_NM
  hsTrack: string | null;         // HS_GNRL_BUSNS_SC_NM ("해당없음" → null)
  specialPurpose: string | null;  // SPCLY_PURPS_HS_ORD_NM
  admissionPeriod: string | null; // ENE_BFE_SEHF_SC_NM
  foundedAt: Date | null;         // FOND_YMD (YYYYMMDD)
  anniversaryAt: Date | null;     // FOAS_MEMRD (YYYYMMDD)
  ```
- Produces (adapter 내부, export): `parseYyyymmdd(v: unknown): Date | null`

- [ ] **Step 1: 실패하는 테스트 작성** (픽스처는 2026-10-01 나이스 공개 응답을 그대로 옮긴 인라인 JSON)

```ts
// tests/ingest/amenities/adapter-school.test.ts
import { describe, it, expect } from 'vitest';
import { parseSchoolJson, parseYyyymmdd } from '@/scripts/ingest/amenities/adapter-school';

const base = {
  ATPT_OFCDC_SC_NM: '서울특별시교육청', LCTN_SC_NM: '서울특별시', FOND_SC_NM: '공립',
  COEDU_SC_NM: '남여공학', ORG_TELNO: '02-000-0000', HMPG_ADRES: null,
};
const body = JSON.stringify({
  schoolInfo: [
    { head: [{ list_total_count: 3 }, { RESULT: { CODE: 'INFO-000', MESSAGE: '정상' } }] },
    {
      row: [
        { ...base, SD_SCHUL_CODE: '7010057', SCHUL_NM: '가락고등학교', SCHUL_KND_SC_NM: '고등학교',
          ORG_RDNMA: '서울특별시 송파구 송이로 42', HS_SC_NM: '일반고', HS_GNRL_BUSNS_SC_NM: '일반계',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '후기', FOND_YMD: '19881223', FOAS_MEMRD: '19890428' },
        { ...base, SD_SCHUL_CODE: '7000001', SCHUL_NM: '교남학교', SCHUL_KND_SC_NM: '특수학교',
          ORG_RDNMA: '서울특별시 종로구 1', HS_SC_NM: null, HS_GNRL_BUSNS_SC_NM: '해당없음',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '전기', FOND_YMD: '19830125', FOAS_MEMRD: '19830321' },
        { ...base, SD_SCHUL_CODE: '7000002', SCHUL_NM: '날짜이상학교', SCHUL_KND_SC_NM: '초등학교',
          ORG_RDNMA: '서울특별시 중구 1', HS_SC_NM: null, HS_GNRL_BUSNS_SC_NM: '일반계',
          SPCLY_PURPS_HS_ORD_NM: null, ENE_BFE_SEHF_SC_NM: '전기', FOND_YMD: '20240231', FOAS_MEMRD: '1989' },
      ],
    },
  ],
});
const rows = parseSchoolJson(body).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-school 상세 필드', () => {
  it('고등학교: 고교 유형·계열·입학 전형·설립일·개교기념일', () => {
    const s = byName('가락고등학교');
    expect(s.hsType).toBe('일반고');
    expect(s.hsTrack).toBe('일반계');
    expect(s.specialPurpose).toBeNull();
    expect(s.admissionPeriod).toBe('후기');
    expect(s.foundedAt?.toISOString()).toBe('1988-12-23T00:00:00.000Z');
    expect(s.anniversaryAt?.toISOString()).toBe('1989-04-28T00:00:00.000Z');
  });

  it('"해당없음"은 null로 바꾼다', () => {
    expect(byName('교남학교').hsTrack).toBeNull();
  });

  it('존재하지 않는 날짜·8자리 아닌 값은 null', () => {
    const s = byName('날짜이상학교');
    expect(s.foundedAt).toBeNull();
    expect(s.anniversaryAt).toBeNull();
  });
});

describe('parseYyyymmdd', () => {
  it('8자리 유효 날짜만 UTC 자정으로', () => {
    expect(parseYyyymmdd('18820908')?.toISOString()).toBe('1882-09-08T00:00:00.000Z');
    expect(parseYyyymmdd(19881223)?.toISOString()).toBe('1988-12-23T00:00:00.000Z');
    expect(parseYyyymmdd('20240231')).toBeNull();
    expect(parseYyyymmdd('1988-12-23')).toBeNull();
    expect(parseYyyymmdd(null)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-school.test.ts`
Expected: FAIL — `parseYyyymmdd`가 export되지 않아 `is not a function`, 또는 `expected undefined to be '일반고'`

- [ ] **Step 3: 스키마와 마이그레이션**

`prisma/schema.prisma`의 `model School`에서 `sigunguCode` 줄 아래에 추가한다.

```prisma
  hsType          String?   @db.VarChar(20)
  hsTrack         String?   @db.VarChar(20)
  specialPurpose  String?   @db.VarChar(40)
  admissionPeriod String?   @db.VarChar(10)
  foundedAt       DateTime? @db.Date
  anniversaryAt   DateTime? @db.Date
```

```sql
-- prisma/migrations/20261001000002_add_school_detail_fields/migration.sql
-- 나이스 학교기본정보에서 버리던 필드를 저장한다(생활시설 상세 보강 PR 3).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "School"
  ADD COLUMN "hsType" VARCHAR(20),
  ADD COLUMN "hsTrack" VARCHAR(20),
  ADD COLUMN "specialPurpose" VARCHAR(40),
  ADD COLUMN "admissionPeriod" VARCHAR(10),
  ADD COLUMN "foundedAt" DATE,
  ADD COLUMN "anniversaryAt" DATE;
```

Run: `pnpm test:db:migrate && pnpm prisma generate`
Expected: `Applying migration 20261001000002_add_school_detail_fields` → `All migrations have been successfully applied.`

- [ ] **Step 4: 타입·파서·러너**

`types.ts`의 `NormalizedSchool`에 Interfaces의 6개 필드를 `homepage` 아래에 추가한다.

`adapter-school.ts`: import에 `clip`을 추가하고, `pick` 함수 아래에 헬퍼를 추가한다.

```ts
import { clip } from './parse-helpers';
```

```ts
/** '해당없음'은 값이 아니다(초·중·특수학교의 고교 계열 칸). */
function pickValue(item: Record<string, unknown>, key: string): string | null {
  const v = pick(item, key);
  return v === '해당없음' ? null : v;
}

/** 나이스 날짜(YYYYMMDD). 8자리가 아니거나 존재하지 않는 날짜는 null. */
export function parseYyyymmdd(v: unknown): Date | null {
  if (v == null) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(v).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}
```

`rows.push({ ... homepage: pick(item, 'HMPG_ADRES'), })`의 `homepage` 줄 다음에 추가한다.

```ts
      hsType: clip(pickValue(item, 'HS_SC_NM'), 20),
      hsTrack: clip(pickValue(item, 'HS_GNRL_BUSNS_SC_NM'), 20),
      specialPurpose: clip(pickValue(item, 'SPCLY_PURPS_HS_ORD_NM'), 40),
      admissionPeriod: clip(pickValue(item, 'ENE_BFE_SEHF_SC_NM'), 10),
      foundedAt: parseYyyymmdd(item.FOND_YMD),
      anniversaryAt: parseYyyymmdd(item.FOAS_MEMRD),
```

`runner.ts`의 `ingestSchools` 안 `values`와 SQL을 바꾼다.

```ts
    const values = chunk.map((r: NormalizedSchool) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${locationSql(r.lat, r.lng)}, ${r.schoolKind ?? null}, ${r.foundType ?? null}, ${r.coeduType ?? null}, ${r.region ?? null}, ${r.eduOffice ?? null}, ${r.tel ?? null}, ${r.homepage ?? null},
        ${r.hsType}, ${r.hsTrack}, ${r.specialPurpose}, ${r.admissionPeriod}, ${r.foundedAt}::date, ${r.anniversaryAt}::date, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "School" ("sourceId", name, address, location, "schoolKind", "foundType", "coeduType", region, "eduOffice", tel, homepage,
        "hsType", "hsTrack", "specialPurpose", "admissionPeriod", "foundedAt", "anniversaryAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        location = EXCLUDED.location,
        "schoolKind" = EXCLUDED."schoolKind",
        "foundType" = EXCLUDED."foundType",
        "coeduType" = EXCLUDED."coeduType",
        region = EXCLUDED.region,
        "eduOffice" = EXCLUDED."eduOffice",
        tel = EXCLUDED.tel,
        homepage = EXCLUDED.homepage,
        "hsType" = EXCLUDED."hsType",
        "hsTrack" = EXCLUDED."hsTrack",
        "specialPurpose" = EXCLUDED."specialPurpose",
        "admissionPeriod" = EXCLUDED."admissionPeriod",
        "foundedAt" = EXCLUDED."foundedAt",
        "anniversaryAt" = EXCLUDED."anniversaryAt",
        "updatedAt" = NOW()
    `;
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-school.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 6: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations/20261001000002_add_school_detail_fields scripts/ingest/amenities/types.ts scripts/ingest/amenities/adapter-school.ts scripts/ingest/amenities/runner.ts tests/ingest/amenities/adapter-school.test.ts
git status --short prisma/migrations
git commit -m "feat(ingest): 학교 고교유형·계열·입학전형·설립일·개교기념일 수집

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 2: 학교 표시 헬퍼

**Files:**
- Create: `lib/school-display.ts`
- Test: `tests/lib/school-display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function isHighSchool(kind: string | null | undefined): boolean; // '고등학교'만 true
  export function schoolOpenYears(anniversaryAt: Date | null | undefined, nowYear: number): number | null; // 미래·없음 → null
  export function formatYmd(d: Date | null | undefined): string | null; // '1988-12-23'
  export function formatMonthDay(d: Date | null | undefined): string | null; // '4월 28일'
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/school-display.test.ts
import { describe, it, expect } from 'vitest';
import { isHighSchool, schoolOpenYears, formatYmd, formatMonthDay } from '@/lib/school-display';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('isHighSchool', () => {
  it('고등학교만 true', () => {
    expect(isHighSchool('고등학교')).toBe(true);
    expect(isHighSchool('초등학교')).toBe(false);
    expect(isHighSchool('특수학교')).toBe(false);
    expect(isHighSchool(null)).toBe(false);
  });
});

describe('schoolOpenYears', () => {
  it('개교 햇수', () => {
    expect(schoolOpenYears(d('1989-04-28'), 2026)).toBe(37);
  });
  it('올해 개교는 0, 미래·없음은 null', () => {
    expect(schoolOpenYears(d('2026-03-02'), 2026)).toBe(0);
    expect(schoolOpenYears(d('2027-03-02'), 2026)).toBeNull();
    expect(schoolOpenYears(null, 2026)).toBeNull();
  });
});

describe('formatYmd / formatMonthDay', () => {
  it('날짜 표기', () => {
    expect(formatYmd(d('1988-12-23'))).toBe('1988-12-23');
    expect(formatMonthDay(d('1989-04-28'))).toBe('4월 28일');
  });
  it('없으면 null', () => {
    expect(formatYmd(null)).toBeNull();
    expect(formatMonthDay(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/school-display.test.ts`
Expected: FAIL — `Cannot find module '@/lib/school-display'`

- [ ] **Step 3: 구현**

```ts
// lib/school-display.ts
// 나이스 학교 필드를 화면 문구로 바꾸는 순수 함수.

/** 계열·입학 전형은 고등학교에서만 의미가 있다(초·중·특수학교는 '일반계'·'전기'가 기본값으로 채워져 온다). */
export function isHighSchool(kind: string | null | undefined): boolean {
  return kind === '고등학교';
}

export function schoolOpenYears(anniversaryAt: Date | null | undefined, nowYear: number): number | null {
  if (!anniversaryAt) return null;
  const y = anniversaryAt.getUTCFullYear();
  return y > nowYear ? null : nowYear - y;
}

export function formatYmd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function formatMonthDay(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/school-display.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/school-display.ts tests/lib/school-display.test.ts
git commit -m "feat(school): 개교 햇수·날짜 표기·고교 여부 표시 헬퍼

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 3: 학교 정보·히어로

**Files:**
- Modify: `app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx`
- Modify: `app/(public)/school/[sigunguCode]/[id]/_components/school-hero.tsx`
- Test: `tests/components/school-detail-ssr.test.ts`

**Interfaces:**
- Consumes: Task 1의 Prisma `School` 새 필드, Task 2의 `isHighSchool`, `schoolOpenYears`, `formatYmd`, `formatMonthDay`
- Produces:
  - `SchoolInfo({ school, regionFullName })`: 값 있는 행만. 고교 전용 4행은 고등학교만. 지역 행은 항상.
  - `SchoolHero({ school, nowYear })`: `nowYear?: number` 선택 prop(기본 `new Date().getUTCFullYear()`). 고등학교면 `hsType` 배지, 개교 햇수가 있으면 주소 줄에 "개교 N년"(0이면 "올해 개교").

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/components/school-detail-ssr.test.ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { School } from '@prisma/client';
import { SchoolInfo } from '@/app/(public)/school/[sigunguCode]/[id]/_components/school-info';
import { SchoolHero } from '@/app/(public)/school/[sigunguCode]/[id]/_components/school-hero';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const d = (s: string) => new Date(`${s}T00:00:00Z`);
function school(over: Partial<School>): School {
  return {
    id: 1n, sourceId: 'S1', name: '가락고등학교', address: '서울특별시 송파구 송이로 42',
    schoolKind: '고등학교', foundType: '공립', coeduType: '남여공학', region: '서울특별시',
    eduOffice: '서울특별시교육청', tel: '02-416-4658', homepage: null, sigunguCode: '11710',
    hsType: '일반고', hsTrack: '일반계', specialPurpose: null, admissionPeriod: '후기',
    foundedAt: d('1988-12-23'), anniversaryAt: d('1989-04-28'), updatedAt: new Date(),
    ...over,
  } as School;
}

describe('SchoolInfo', () => {
  it('고등학교: 고교 유형·계열·입학 전형·설립일·개교기념일', () => {
    const html = renderToStaticMarkup(createElement(SchoolInfo, { school: school({}), regionFullName: '서울 송파구' }));
    expect(html).toContain('일반고 · 일반계');
    expect(html).toContain('후기');
    expect(html).toContain('1988-12-23');
    expect(html).toContain('4월 28일');
  });

  it('초등학교에는 고교 전용 행이 없다(일반계·전기 기본값 무시)', () => {
    const html = renderToStaticMarkup(
      createElement(SchoolInfo, {
        school: school({ name: '경기초등학교', schoolKind: '초등학교', hsType: null, hsTrack: '일반계', admissionPeriod: '전기' }),
        regionFullName: '서울 종로구',
      }),
    );
    expect(html).not.toContain('고교 유형');
    expect(html).not.toContain('입학 전형');
    expect(html).not.toContain('전기');
  });

  it('값이 없는 행은 숨기고 지역 행은 남긴다', () => {
    const html = renderToStaticMarkup(
      createElement(SchoolInfo, {
        school: school({ tel: null, eduOffice: null, foundedAt: null, anniversaryAt: null }),
        regionFullName: '서울 송파구',
      }),
    );
    expect(html).not.toContain('>-<');
    expect(html).not.toContain('관할 교육청');
    expect(html).toContain('서울 송파구');
  });
});

describe('SchoolHero', () => {
  it('고등학교: 고교 유형 배지와 개교 N년', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({}), nowYear: 2026 }));
    expect(html).toContain('일반고');
    expect(html).toContain('개교 37년');
  });

  it('개교기념일이 없으면 개교 문구 없음', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({ anniversaryAt: null }), nowYear: 2026 }));
    expect(html).not.toContain('개교');
  });

  it('올해 개교는 "올해 개교"', () => {
    const html = renderToStaticMarkup(createElement(SchoolHero, { school: school({ anniversaryAt: d('2026-03-02') }), nowYear: 2026 }));
    expect(html).toContain('올해 개교');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/components/school-detail-ssr.test.ts`
Expected: FAIL — `expected … to contain '일반고 · 일반계'` 등

- [ ] **Step 3: 구현**

`school-info.tsx` 전체를 바꾼다.

```tsx
import { Card } from '@/components/ui/card';
import type { School } from '@prisma/client';
import { isHighSchool, formatYmd, formatMonthDay } from '@/lib/school-display';

export function SchoolInfo({ school, regionFullName }: { school: School; regionFullName: string }) {
  const high = isHighSchool(school.schoolKind);
  const hsTypeTrack = [school.hsType, school.hsTrack].filter(Boolean).join(' · ') || null;
  const rows: [string, string | null][] = [
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
    ['개교기념일', formatMonthDay(school.anniversaryAt)],
    ['관할 교육청', school.eduOffice],
    ['전화', school.tel],
  ];
  return (
    <Card id="info">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">학교 정보</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows
          .filter((row): row is [string, string] => !!row[1])
          .map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
              <span className="text-sm text-[var(--color-muted)]">{k}</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{v}</span>
            </div>
          ))}
        <div className="flex justify-between border-b border-[var(--color-line)] pb-2.5">
          <span className="text-sm text-[var(--color-muted)]">지역</span>
          <span className="text-sm font-semibold text-[var(--color-text)]">{regionFullName || '-'}</span>
        </div>
      </div>
    </Card>
  );
}
```

`school-hero.tsx`:

import 추가.

```tsx
import { isHighSchool, schoolOpenYears } from '@/lib/school-display';
```

시그니처를 바꾸고 계산을 추가한다.

```tsx
export function SchoolHero({ school, nowYear = new Date().getUTCFullYear() }: { school: School; nowYear?: number }) {
  const openYears = schoolOpenYears(school.anniversaryAt, nowYear);
```

배지 줄에서 `coeduType` 배지 다음에 추가한다.

```tsx
          {isHighSchool(school.schoolKind) && school.hsType && <Badge tone="blue">{school.hsType}</Badge>}
```

주소 줄에서 `📍` span 다음에 추가한다.

```tsx
          {openYears !== null && (
            <span className="font-semibold text-[var(--color-blue)]">
              {openYears === 0 ? '올해 개교' : `개교 ${openYears}년`}
            </span>
          )}
```

`page.tsx`는 바꾸지 않는다(`nowYear` 기본값 사용).

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/components/school-detail-ssr.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/school/[sigunguCode]/[id]/_components/school-info.tsx" "app/(public)/school/[sigunguCode]/[id]/_components/school-hero.tsx" tests/components/school-detail-ssr.test.ts
git commit -m "feat(school): 학교 상세에 고교유형·입학전형·설립일·개교기념일, 히어로 개교 햇수

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 4: e2e 시드와 상세 시나리오

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts` (`E2E_SCH_0001` 생성 블록 다음)
- Create: `tests/e2e/school-detail.spec.ts`

- [ ] **Step 1: 시드 추가** (`deleteMany({ sourceId: { startsWith: 'E2E_' } })`가 앞에서 지우므로 `create`로 충분)

```ts
  // 학교 상세 보강 e2e용 — 고교 필드가 채워진 고등학교
  await prisma.school.create({
    data: {
      sourceId: 'E2E_SCH_0002',
      name: 'E2E 가락고등학교',
      address: '서울특별시 송파구 송이로 42',
      sigunguCode: '11710',
      schoolKind: '고등학교',
      region: '서울특별시',
      hsType: '일반고',
      hsTrack: '일반계',
      admissionPeriod: '후기',
      foundedAt: new Date('1988-12-23T00:00:00Z'),
      anniversaryAt: new Date('1989-04-28T00:00:00Z'),
    },
  });
```

- [ ] **Step 2: e2e 작성**

```ts
// tests/e2e/school-detail.spec.ts
import { test, expect } from '@playwright/test';

test.describe('학교 상세 보강', () => {
  test('고등학교: 고교 유형 배지, 개교 햇수, 입학 전형·개교기념일 행', async ({ page }) => {
    await page.goto('/school/11710');
    await page.locator('a:has(article):has-text("E2E 가락고등학교")').first().click();

    await expect(page.getByRole('heading', { name: '학교 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/개교 \d+년/)).toBeVisible();
    await expect(page.getByText('일반고 · 일반계')).toBeVisible();
    await expect(page.getByText('4월 28일')).toBeVisible();
  });

  test('초등학교: 고교 전용 행이 없다', async ({ page }) => {
    await page.goto('/school/11710');
    await page.locator('a:has(article):has-text("E2E 거마초등학교")').first().click();

    await expect(page.getByRole('heading', { name: '학교 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('입학 전형')).toHaveCount(0);
  });
});
```

- [ ] **Step 3: 실행**

Run: `pnpm seed:e2e && pnpm test:e2e:local tests/e2e/school-detail.spec.ts tests/e2e/childcare.spec.ts`
Expected: 전부 PASS. `childcare.spec.ts`는 같은 송파구 학교 시드를 쓰는 기존 시나리오의 회귀 확인용이다.

목록이 페이지를 나누어 시드 학교가 첫 페이지에 없으면, `/school/11710?kind=high`처럼 학교급 필터를 붙인다(`app/(public)/school/[sigunguCode]/page.tsx`의 `sp.kind` 슬러그를 확인해 맞춘다).

- [ ] **Step 4: 커밋**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/school-detail.spec.ts
git commit -m "test(e2e): 학교 상세 보강 시나리오

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 5: 전체 게이트

**Files:** 없음

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`
Expected: lint 경고·오류 0, 단위 테스트 전부 PASS, build 성공

- [ ] **Step 2: push·PR·머지·운영 수집은 사용자 확인 후** (PR 1·2와 같은 절차)

로컬에 나이스 키가 없어 로컬 실수집은 하지 않는다. 머지·배포 후 박스에서 실행한다(약 13분, 지오코딩 포함).
```bash
cd /opt/imjang && docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production run --rm etl pnpm tsx scripts/ingest/amenities/runner.ts --source=school
```
그 다음 읽기 전용 쿼리로 확인한다.
```sql
SELECT "schoolKind", count(*) total, count("hsType") hs_type, count("hsTrack") hs_track,
       count("admissionPeriod") adm, count("foundedAt") founded, count("anniversaryAt") anniv
FROM "School" GROUP BY 1 ORDER BY 2 DESC;
```
기대: 고등학교의 `hsType`이 대부분 채워지고, 초·중학교는 `hsType`이 0에 가깝다. 설립일·개교기념일은 학교급 전반에서 대부분 채워진다.
