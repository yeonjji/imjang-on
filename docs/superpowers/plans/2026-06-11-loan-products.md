# 서민금융 대출상품 리스트+상세 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서민금융진흥원 대출상품 323개를 수집해 `/finance` 다중 패세트 리스트와 `/finance/[seq]` 상세 페이지로 보여준다.

**Architecture:** 기존 ETL 패턴(`scripts/ingest/<cat>/` + `IngestionRun` + 원자 스냅샷 교체)으로 Postgres `LoanProduct`(요약 컬럼 + `rawJson`)에 적재. 데이터가 작고 정적(323행·연1회)이라 리스트는 ISR로 전량 서버 렌더(SEO) + 클라이언트 메모리 패세트. 상세는 ISR + `generateStaticParams`.

**Tech Stack:** Next.js(App Router, ISR) · Prisma + Postgres(String[]·Json) · fast-xml-parser · vitest · Tailwind · GitHub Actions

**Spec:** `docs/superpowers/specs/2026-06-11-loan-products-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` (수정) + 마이그레이션 | `LoanProduct` 모델 |
| `lib/data-sources.ts` (수정) | `kinfa-loan` 소스 + `주거금융` 카테고리 |
| `scripts/ingest/loan/types.ts` | `LoanProductRow` + 소스 식별자 |
| `scripts/ingest/loan/normalize.ts` | 콤마 다값 → 태그 배열, 빈값 정규화 (순수) |
| `scripts/ingest/loan/adapter.ts` | XML → `{rows, totalCount}` |
| `scripts/ingest/loan/http.ts` | rate-list 페이지 fetch |
| `scripts/ingest/loan/runner.ts` | 다페이지 수집 + 원자 스냅샷 교체 |
| `lib/loan/list.ts` | 요약 조회 + `collectFacets` + `filterLoans` (순수 포함) |
| `lib/loan/detail.ts` | 단건 조회 + seq 목록 + 필드 라벨/섹션 맵 |
| `app/(public)/finance/page.tsx` | 리스트(ISR) |
| `app/(public)/finance/_components/loan-explorer.tsx` | 클라이언트 패세트/검색/정렬 |
| `app/(public)/finance/_components/loan-card.tsx` | 리스트 행 카드 |
| `app/(public)/finance/[seq]/page.tsx` | 상세(ISR + generateStaticParams) |
| `lib/sitemap/static-entries.ts` (수정) | `/finance` |
| `package.json` (수정) | `ingest:loan` |
| `.github/workflows/ingest-loan.yml` | 월 1회 수집 |
| 테스트 | normalize·adapter·filterLoans·collectFacets·snapshot |

---

## Task 1: Prisma 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (`IngestionRun` 모델 아래)
- Create: `prisma/migrations/<ts>_loan_product/migration.sql`

- [ ] **Step 1: 모델 추가**

`prisma/schema.prisma`의 `IngestionRun` 모델 바로 아래:
```prisma
model LoanProduct {
  seq        Int      @id // API 자연키
  finprdnm   String   @db.VarChar(200) // 상품명
  ofrinstnm  String?  @db.VarChar(120) // 제공기관
  instCtg    String?  @db.VarChar(40) // 기관구분
  lnlmt      Int? // 한도(만원)
  irt        String?  @db.VarChar(60) // 금리(텍스트)
  irtCtg     String?  @db.VarChar(40) // 금리구분
  usageTags  String[] @default([]) // 자금용도 태그
  targetTags String[] @default([]) // 대상 태그
  regionTags String[] @default([]) // 시도 태그
  rawJson    Json // 전체 원본
  updatedAt  DateTime @default(now())

  @@index([finprdnm])
}
```

- [ ] **Step 2: 마이그레이션 생성 (docker DB)**

> ⚠️ 프로젝트 주의: `migrate dev`가 docker 잔여 마이그레이션을 쓸어담을 수 있다. 새 폴더만 좁게 `git add`.

Run: `pnpm exec dotenv -e .env.test -- pnpm prisma migrate dev --name loan_product`
Expected: `prisma/migrations/<ts>_loan_product/migration.sql`에 `CREATE TABLE "LoanProduct"`.

DB 리셋/무관 드리프트를 시도하면 STOP하고 BLOCKED 보고.

- [ ] **Step 3: SQL 확인**

Run: `cat prisma/migrations/*_loan_product/migration.sql`
Expected: `CREATE TABLE "LoanProduct"`과 `finprdnm` 인덱스만. 타 테이블 DDL 섞이면 그 줄 제거.

- [ ] **Step 4: client 재생성 + 타입체크**

Run: `pnpm prisma generate && npx tsc --noEmit 2>&1 | grep -i loanproduct; echo "tsc done"`
Expected: 빈 grep.

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(loan): LoanProduct 모델 + 마이그레이션"
```
`git status`로 무관 파일 스테이징 없는지 먼저 확인.

---

## Task 2: 데이터 출처 레지스트리

**Files:** Modify `lib/data-sources.ts`

- [ ] **Step 1: 4곳 수정**

`lib/data-sources.ts`를 먼저 읽고:

1) `DataSourceId` 유니온 끝(`| 'kakao-local';`)에 추가:
```ts
  | 'kakao-local'
  | 'kinfa-loan';
```
2) `DataSourceCategory` 유니온에서 `'교통'`과 `'공통'` 사이에 `'주거금융'` 추가.
3) `DATA_SOURCES`에 `'kakao-local'` 항목 뒤:
```ts
  'kinfa-loan': {
    id: 'kinfa-loan',
    provider: '서민금융진흥원',
    dataset: '대출상품한눈에',
    url: 'https://www.kinfa.or.kr',
    category: '주거금융',
  },
```
4) `DATA_SOURCE_CATEGORY_ORDER`에서 `'청약',` 다음에 `'주거금융',` 삽입.
5) `CATEGORY_ICON`에서 `교통`과 `공통` 사이에 `주거금융: '🏦',`.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -iE "data-sources|주거금융|kinfa|CATEGORY_ICON"; echo "tsc done"`
Expected: 빈 grep. (`DataSourceCategory`/`CATEGORY_ICON`은 전수 매핑이라 누락 시 여기서 실패)

- [ ] **Step 3: Commit**
```bash
git add lib/data-sources.ts
git commit -m "feat(loan): 데이터 출처 레지스트리에 kinfa-loan/주거금융 등록"
```

---

## Task 3: ETL 타입 + normalize (TDD)

**Files:**
- Create: `scripts/ingest/loan/types.ts`
- Test: `tests/ingest/loan/normalize.test.ts`
- Create: `scripts/ingest/loan/normalize.ts`

- [ ] **Step 1: 타입 작성** `scripts/ingest/loan/types.ts`:
```ts
// 정규화된 대출상품 1행 (DB LoanProduct 와 1:1)
export interface LoanProductRow {
  seq: number;
  finprdnm: string;
  ofrinstnm: string | null;
  instCtg: string | null;
  lnlmt: number | null;
  irt: string | null;
  irtCtg: string | null;
  usageTags: string[];
  targetTags: string[];
  regionTags: string[];
  rawJson: Record<string, unknown>;
}

export const LOAN_INGEST_SOURCE = 'kinfa-loan';
```

- [ ] **Step 2: 실패 테스트** `tests/ingest/loan/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toTags, emptyToNull } from '@/scripts/ingest/loan/normalize';

describe('toTags', () => {
  it('콤마 다값을 트림해 태그 배열로 만든다', () => {
    expect(toTags('근로자, 사업자, 연금소득자')).toEqual(['근로자', '사업자', '연금소득자']);
  });
  it('접미사 "등"을 제거한다', () => {
    expect(toTags('금융취약계층 등')).toEqual(['금융취약계층']);
  });
  it('"등" 제거 후 생긴 중복을 제거한다', () => {
    expect(toTags('금융취약계층, 금융취약계층 등')).toEqual(['금융취약계층']);
  });
  it('"-"·빈값·null 은 빈 배열', () => {
    expect(toTags('-')).toEqual([]);
    expect(toTags('')).toEqual([]);
    expect(toTags(null)).toEqual([]);
    expect(toTags(undefined)).toEqual([]);
  });
  it('단일 값(콤마 없음)도 1개 태그', () => {
    expect(toTags('운영·시설')).toEqual(['운영·시설']);
  });
});

describe('emptyToNull', () => {
  it('빈값·"-"·null 은 null, 그 외는 문자열', () => {
    expect(emptyToNull('-')).toBeNull();
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull('변동금리')).toBe('변동금리');
    expect(emptyToNull(2000)).toBe('2000');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/normalize.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현** `scripts/ingest/loan/normalize.ts`:
```ts
// 콤마 다값 문자열 → 정규화 태그 배열. "-"·빈값 제거, 접미사 "등" 제거, dedup.
export function toTags(raw: unknown): string[] {
  if (raw == null) return [];
  const out: string[] = [];
  for (const part of String(raw).split(',')) {
    const cleaned = part.trim().replace(/\s*등$/, '').trim();
    if (!cleaned || cleaned === '-') continue;
    if (!out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

// 빈값/"-"/null → null, 그 외 String 변환.
export function emptyToNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === '' || s === '-' ? null : s;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/normalize.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add scripts/ingest/loan/types.ts scripts/ingest/loan/normalize.ts tests/ingest/loan/normalize.test.ts
git commit -m "feat(loan): ETL 타입 + 태그 정규화"
```

---

## Task 4: XML 어댑터 (TDD)

**Files:**
- Create: `tests/ingest/fixtures/loan-sample.xml`
- Test: `tests/ingest/loan/adapter.test.ts`
- Create: `scripts/ingest/loan/adapter.ts`

- [ ] **Step 1: 픽스처** `tests/ingest/fixtures/loan-sample.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <seq>8</seq>
        <finprdnm>사잇돌Ⅱ대출_대환형</finprdnm>
        <lnlmt>2000</lnlmt>
        <irtCtg>변동금리</irtCtg>
        <irt>~19.99</irt>
        <usge>생계</usge>
        <trgt>근로자, 사업자, 연금소득자</trgt>
        <instCtg>민간기업</instCtg>
        <ofrinstnm>SGI서울보증</ofrinstnm>
        <rsdAreaPamtEqltIstm>전국</rsdAreaPamtEqltIstm>
        <cnpl>1397</cnpl>
        <rltsite>https://www.fsb.or.kr</rltsite>
      </item>
      <item>
        <seq>12</seq>
        <finprdnm>저소득주민 융자사업(주택매입 및 전세임대자금)</finprdnm>
        <lnlmt>3000</lnlmt>
        <irtCtg>고정금리</irtCtg>
        <irt>0</irt>
        <usge>주거</usge>
        <trgt>저소득가구 및 무주택세대주</trgt>
        <instCtg>지자체</instCtg>
        <ofrinstnm>강원도 영월군</ofrinstnm>
        <rsdAreaPamtEqltIstm>강원</rsdAreaPamtEqltIstm>
      </item>
    </items>
    <numOfRows>100</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>2</totalCount>
  </body>
</response>
```

- [ ] **Step 2: 실패 테스트** `tests/ingest/loan/adapter.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseLoanProducts } from '@/scripts/ingest/loan/adapter';

const xml = readFileSync(join(__dirname, '../fixtures/loan-sample.xml'), 'utf-8');

describe('parseLoanProducts', () => {
  it('item 을 LoanProductRow 로 매핑하고 totalCount 를 반환한다', () => {
    const { rows, totalCount } = parseLoanProducts(xml);
    expect(totalCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      seq: 8,
      finprdnm: '사잇돌Ⅱ대출_대환형',
      ofrinstnm: 'SGI서울보증',
      instCtg: '민간기업',
      lnlmt: 2000,
      irt: '~19.99',
      irtCtg: '변동금리',
      usageTags: ['생계'],
      targetTags: ['근로자', '사업자', '연금소득자'],
      regionTags: ['전국'],
    });
  });
  it('rawJson 에 원본 필드를 보존한다', () => {
    const { rows } = parseLoanProducts(xml);
    expect((rows[0].rawJson as any).rltsite).toBe('https://www.fsb.or.kr');
    expect((rows[0].rawJson as any).cnpl).toBe(1397);
  });
  it('resultCode 가 비정상이면 throw 한다', () => {
    const bad = xml.replace('<resultCode>00</resultCode>', '<resultCode>30</resultCode>');
    expect(() => parseLoanProducts(bad)).toThrow();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/adapter.test.ts`
Expected: FAIL

- [ ] **Step 4: 구현** `scripts/ingest/loan/adapter.ts`:
```ts
import {
  parseXml,
  getItems,
  getTotalCount,
  parseCommaNumber,
  assertNormalResponse,
} from '@/scripts/ingest/xml-parse';
import { toTags, emptyToNull } from './normalize';
import type { LoanProductRow } from './types';

// 대출상품 응답(XML 한 페이지) → 행 + totalCount.
export function parseLoanProducts(xml: string): { rows: LoanProductRow[]; totalCount: number } {
  const parsed = parseXml(xml);
  assertNormalResponse(parsed); // resultCode !== 00 이면 throw
  const totalCount = getTotalCount(parsed);
  const items = getItems(parsed);

  const rows: LoanProductRow[] = items.map((raw) => {
    const it = raw as Record<string, unknown>;
    return {
      seq: Number(it.seq),
      finprdnm: String(it.finprdnm ?? ''),
      ofrinstnm: emptyToNull(it.ofrinstnm),
      instCtg: emptyToNull(it.instCtg),
      lnlmt: parseCommaNumber(it.lnlmt),
      irt: emptyToNull(it.irt),
      irtCtg: emptyToNull(it.irtCtg),
      usageTags: toTags(it.usge),
      targetTags: toTags(it.trgt),
      regionTags: toTags(it.rsdAreaPamtEqltIstm),
      rawJson: it,
    };
  });
  return { rows, totalCount };
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/adapter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**
```bash
git add scripts/ingest/loan/adapter.ts tests/ingest/loan/adapter.test.ts tests/ingest/fixtures/loan-sample.xml
git commit -m "feat(loan): XML 어댑터(rows + totalCount)"
```

---

## Task 5: HTTP fetch

**Files:** Create `scripts/ingest/loan/http.ts`

- [ ] **Step 1: 구현** (상위 `scripts/ingest/http.ts` 재시도 패턴):
```ts
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// 서비스명이 2회 반복되는 실제 경로(가이드 없음, 실측 확인).
const URL_BASE =
  'https://apis.data.go.kr/B553701/LoanProductSearchingInfo/LoanProductSearchingInfo/getLoanProductSearchingInfo';
const TIMEOUT_MS = 15_000;
const SLEEP_MS = 80;
const MAX_RETRIES = 3;

export async function fetchLoanPage(pageNo: number, numOfRows = 100): Promise<string> {
  if (!env.PUBLIC_DATA_KEY) throw new Error('PUBLIC_DATA_KEY is required');

  const url = new URL(URL_BASE);
  url.searchParams.set('serviceKey', env.PUBLIC_DATA_KEY);
  url.searchParams.set('numOfRows', String(numOfRows));
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('dataType', 'XML');

  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'imjang-on/1.0 (+https://imjang-on.com)',
          Accept: 'application/xml,text/xml',
        },
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = SLEEP_MS * Math.pow(3, attempt);
          logger.warn({ status: res.status, attempt, backoff }, 'loan http retry');
          await sleep(backoff);
          continue;
        }
        throw new Error(`HTTP ${res.status} for loan page ${pageNo}`);
      }
      return await res.text();
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES) {
        const backoff = SLEEP_MS * Math.pow(3, attempt);
        logger.warn({ err, attempt, backoff }, 'loan http error retry');
        await sleep(backoff);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -i loan/http; echo "tsc done"`
Expected: 빈 grep.

- [ ] **Step 3: Commit**
```bash
git add scripts/ingest/loan/http.ts
git commit -m "feat(loan): 페이지 fetch"
```

---

## Task 6: Runner — 다페이지 수집 + 원자 스냅샷 교체 (통합 TDD)

**Files:**
- Create: `scripts/ingest/loan/runner.ts`
- Test: `tests/ingest/loan/replace-snapshot.test.ts`

- [ ] **Step 1: 실패 테스트** `tests/ingest/loan/replace-snapshot.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { replaceSnapshot } from '@/scripts/ingest/loan/runner';
import type { LoanProductRow } from '@/scripts/ingest/loan/types';

const rowsA: LoanProductRow[] = [
  { seq: 8, finprdnm: '사잇돌Ⅱ', ofrinstnm: 'SGI서울보증', instCtg: '민간기업', lnlmt: 2000, irt: '~19.99', irtCtg: '변동금리', usageTags: ['생계'], targetTags: ['근로자'], regionTags: ['전국'], rawJson: { seq: 8 } },
  { seq: 12, finprdnm: '저소득주민 융자', ofrinstnm: '강원도 영월군', instCtg: '지자체', lnlmt: 3000, irt: '0', irtCtg: '고정금리', usageTags: ['주거'], targetTags: ['무주택세대주'], regionTags: ['강원'], rawJson: { seq: 12 } },
];

beforeEach(async () => {
  await prisma.loanProduct.deleteMany({});
});
afterAll(async () => {
  await prisma.loanProduct.deleteMany({});
  await prisma.$disconnect();
});

describe('replaceSnapshot', () => {
  it('교체 후 재실행해도 개수가 일정하다(멱등)', async () => {
    await replaceSnapshot(rowsA);
    expect(await prisma.loanProduct.count()).toBe(2);
    await replaceSnapshot(rowsA);
    expect(await prisma.loanProduct.count()).toBe(2);
  });
  it('빈 배열이면 거부하고 기존 스냅샷 유지', async () => {
    await replaceSnapshot(rowsA);
    await expect(replaceSnapshot([])).rejects.toThrow();
    expect(await prisma.loanProduct.count()).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/replace-snapshot.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현** `scripts/ingest/loan/runner.ts`:
```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { revalidatePaths } from '@/scripts/ingest/revalidator';
import { fetchLoanPage } from './http';
import { parseLoanProducts } from './adapter';
import { LOAN_INGEST_SOURCE } from './types';
import type { LoanProductRow } from './types';

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // 안전장치

// 전 페이지 순회 수집. seq 기준 dedup.
export async function fetchAllLoanRows(): Promise<LoanProductRow[]> {
  const bySeq = new Map<number, LoanProductRow>();
  let pageNo = 1;
  while (pageNo <= MAX_PAGES) {
    const xml = await fetchLoanPage(pageNo, PAGE_SIZE);
    const { rows, totalCount } = parseLoanProducts(xml);
    for (const r of rows) bySeq.set(r.seq, r);
    if (rows.length === 0 || bySeq.size >= totalCount) break;
    pageNo++;
  }
  return Array.from(bySeq.values());
}

// 원자 스냅샷 교체. 0건이면 거부(API 일시 오류로 테이블이 비는 사고 방지).
export async function replaceSnapshot(rows: LoanProductRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error('parsed 0 rows — refusing to wipe LoanProduct snapshot');
  }
  const data = rows.map((r) => ({
    seq: r.seq,
    finprdnm: r.finprdnm,
    ofrinstnm: r.ofrinstnm,
    instCtg: r.instCtg,
    lnlmt: r.lnlmt,
    irt: r.irt,
    irtCtg: r.irtCtg,
    usageTags: r.usageTags,
    targetTags: r.targetTags,
    regionTags: r.regionTags,
    rawJson: r.rawJson as Prisma.InputJsonValue,
  }));
  await prisma.$transaction([
    prisma.loanProduct.deleteMany({}),
    prisma.loanProduct.createMany({ data }),
  ]);
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({
    data: { source: LOAN_INGEST_SOURCE, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const rows = await fetchAllLoanRows();
    logger.info({ rows: rows.length }, 'loan products fetched');
    await replaceSnapshot(rows);
    await revalidatePaths(['/finance']);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: rows.length, finishedAt: new Date() },
    });
    logger.info({ rows: rows.length }, 'loan ingest done');
    await notify('info', 'loan ingest complete', { rows: rows.length });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'loan ingest failed');
    await notify('error', 'loan ingest failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('loan/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'loan runner fatal');
    process.exit(1);
  });
}
```

- [ ] **Step 4: 통과 확인** (docker DB 필요)

Run: `docker ps --format '{{.Names}}' | grep imjang-on-db && pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan/replace-snapshot.test.ts`
Expected: PASS (2 tests). 컨테이너 없으면 먼저 기동.

- [ ] **Step 5: Commit**
```bash
git add scripts/ingest/loan/runner.ts tests/ingest/loan/replace-snapshot.test.ts
git commit -m "feat(loan): 다페이지 수집 + 원자 스냅샷 교체 runner"
```

---

## Task 7: 리스트 조회 + 패세트 + 필터 (TDD)

**Files:**
- Test: `tests/lib/loan-list.test.ts`
- Create: `lib/loan/list.ts`

- [ ] **Step 1: 실패 테스트** `tests/lib/loan-list.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { collectFacets, filterLoans, type LoanSummary } from '@/lib/loan/list';

const rows: LoanSummary[] = [
  { seq: 1, finprdnm: '청년전세대출', ofrinstnm: 'A', instCtg: '시중은행', lnlmt: 2000, irt: '3', usageTags: ['주거'], targetTags: ['청년'], regionTags: ['전국'] },
  { seq: 2, finprdnm: '소상공인 운영자금', ofrinstnm: 'B', instCtg: '지자체', lnlmt: 5000, irt: '2', usageTags: ['운영'], targetTags: ['소상공인'], regionTags: ['서울'] },
  { seq: 3, finprdnm: '주거안정 자금', ofrinstnm: 'C', instCtg: '시중은행', lnlmt: 3000, irt: '1', usageTags: ['주거', '생계'], targetTags: ['청년', '근로자'], regionTags: ['전국', '서울'] },
];

describe('collectFacets', () => {
  it('태그별 고유값+카운트를 모은다', () => {
    const f = collectFacets(rows);
    expect(f.usage).toContainEqual({ value: '주거', count: 2 });
    expect(f.inst).toContainEqual({ value: '시중은행', count: 2 });
    expect(f.region).toContainEqual({ value: '전국', count: 2 });
  });
});

describe('filterLoans', () => {
  const base = { usage: [], inst: [], region: [], target: [], query: '', sort: null } as const;

  it('같은 패세트 내 선택은 OR', () => {
    const r = filterLoans(rows, { ...base, usage: ['주거', '운영'] });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 2, 3]);
  });
  it('패세트 간 선택은 AND', () => {
    const r = filterLoans(rows, { ...base, usage: ['주거'], inst: ['시중은행'] });
    expect(r.map((x) => x.seq).sort()).toEqual([1, 3]);
  });
  it('상품명 검색(대소문자 무시 부분일치)', () => {
    const r = filterLoans(rows, { ...base, query: '주거' });
    expect(r.map((x) => x.seq)).toEqual([3]);
  });
  it('한도 내림차순 정렬', () => {
    const r = filterLoans(rows, { ...base, sort: 'limitDesc' });
    expect(r.map((x) => x.lnlmt)).toEqual([5000, 3000, 2000]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/loan-list.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현** `lib/loan/list.ts`:
```ts
import { prisma } from '@/lib/db';

export interface LoanSummary {
  seq: number;
  finprdnm: string;
  ofrinstnm: string | null;
  instCtg: string | null;
  lnlmt: number | null;
  irt: string | null;
  usageTags: string[];
  targetTags: string[];
  regionTags: string[];
}

export interface FacetCount {
  value: string;
  count: number;
}
export interface LoanFacets {
  usage: FacetCount[];
  inst: FacetCount[];
  region: FacetCount[];
  target: FacetCount[];
}
export interface LoanFilterCriteria {
  usage: string[];
  inst: string[];
  region: string[];
  target: string[];
  query: string;
  sort: 'limitDesc' | 'limitAsc' | null;
}

function countTags(rows: LoanSummary[], pick: (r: LoanSummary) => string[]): FacetCount[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of pick(r)) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m, ([value, count]) => ({ value, count })).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko'),
  );
}

export function collectFacets(rows: LoanSummary[]): LoanFacets {
  return {
    usage: countTags(rows, (r) => r.usageTags),
    target: countTags(rows, (r) => r.targetTags),
    region: countTags(rows, (r) => r.regionTags),
    inst: countTags(rows, (r) => (r.instCtg ? [r.instCtg] : [])),
  };
}

// 같은 패세트 내 OR, 패세트 간 AND.
function matchesAny(selected: string[], values: string[]): boolean {
  return selected.length === 0 || selected.some((s) => values.includes(s));
}

export function filterLoans(rows: LoanSummary[], c: LoanFilterCriteria): LoanSummary[] {
  const q = c.query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      matchesAny(c.usage, r.usageTags) &&
      matchesAny(c.target, r.targetTags) &&
      matchesAny(c.region, r.regionTags) &&
      matchesAny(c.inst, r.instCtg ? [r.instCtg] : []) &&
      (q === '' || r.finprdnm.toLowerCase().includes(q)),
  );
  if (c.sort === 'limitDesc' || c.sort === 'limitAsc') {
    const dir = c.sort === 'limitDesc' ? -1 : 1;
    filtered.sort((a, b) => ((a.lnlmt ?? 0) - (b.lnlmt ?? 0)) * dir);
  }
  return filtered;
}

export async function getLoanSummaries(): Promise<LoanSummary[]> {
  return prisma.loanProduct.findMany({
    select: {
      seq: true, finprdnm: true, ofrinstnm: true, instCtg: true,
      lnlmt: true, irt: true, usageTags: true, targetTags: true, regionTags: true,
    },
    orderBy: { finprdnm: 'asc' },
  });
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/lib/loan-list.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add lib/loan/list.ts tests/lib/loan-list.test.ts
git commit -m "feat(loan): 리스트 조회 + 패세트 + 필터"
```

---

## Task 8: 상세 조회 + 필드 라벨/섹션 맵

**Files:** Create `lib/loan/detail.ts`

- [ ] **Step 1: 구현** `lib/loan/detail.ts`:
```ts
import { prisma } from '@/lib/db';

export interface LoanField {
  key: string; // rawJson 키
  label: string;
}
export interface LoanSection {
  title: string;
  fields: LoanField[];
}

// 상세 페이지 섹션 구성. rawJson 키 → 라벨.
export const LOAN_SECTIONS: LoanSection[] = [
  {
    title: '한눈에',
    fields: [
      { key: 'lnlmt', label: '대출한도(만원)' },
      { key: 'irt', label: '금리' },
      { key: 'irtCtg', label: '금리구분' },
      { key: 'maxtotlntrm', label: '최대 총 대출기간' },
      { key: 'maxdfrmtrm', label: '최대 거치기간' },
      { key: 'maxrdpttrm', label: '최대 상환기간' },
      { key: 'rdptmthd', label: '상환방식' },
    ],
  },
  {
    title: '자격요건',
    fields: [
      { key: 'trgt', label: '대출대상' },
      { key: 'suprtgtdtlcond', label: '지원대상 상세조건' },
      { key: 'age', label: '연령' },
      { key: 'incm', label: '소득' },
      { key: 'crdtsc', label: '신용' },
      { key: 'rsdAreaPamtEqltIstm', label: '거주지역' },
      { key: 'housholdcnt', label: '가구수' },
    ],
  },
  {
    title: '비용·우대',
    fields: [
      { key: 'rpymdcfe', label: '중도상환수수료' },
      { key: 'lnicdcst', label: '부대비용' },
      { key: 'ovitryr', label: '연체이율' },
      { key: 'prftaddirtcond', label: '우대금리조건' },
      { key: 'grninst', label: '보증기관' },
      { key: 'etcrefsbjc', label: '기타참고' },
    ],
  },
  {
    title: '신청',
    fields: [
      { key: 'jnmthd', label: '가입방법' },
      { key: 'hdlinst', label: '취급기관' },
      { key: 'hdlinstdtlvw', label: '취급기관 상세' },
      { key: 'cnpl', label: '고객센터' },
    ],
  },
];

// 표시 가능한 값인지(빈값·"-"만 숨김. "없음"은 의미있는 정보라 표시).
export function isDisplayable(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '-';
}

export async function getLoanProduct(seq: number) {
  return prisma.loanProduct.findUnique({ where: { seq } });
}

export async function getAllLoanSeqs(): Promise<number[]> {
  const rows = await prisma.loanProduct.findMany({ select: { seq: true } });
  return rows.map((r) => r.seq);
}
```

> 설계 §6은 "-/없음/빈값 생략"이라 했으나, "중도상환수수료: 없음"처럼 "없음"은 유용한 정보라 **빈값·"-"만 숨기고 "없음"은 표시**하도록 구현(스펙보다 정확한 처리).

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -i loan/detail; echo "tsc done"`
Expected: 빈 grep.

- [ ] **Step 3: Commit**
```bash
git add lib/loan/detail.ts
git commit -m "feat(loan): 상세 조회 + 필드 섹션 맵"
```

---

## Task 9: 리스트 페이지 + 클라이언트 탐색 컴포넌트

**Files:**
- Create: `app/(public)/finance/_components/loan-card.tsx`
- Create: `app/(public)/finance/_components/loan-explorer.tsx`
- Create: `app/(public)/finance/page.tsx`

> CSS 토큰은 실제 존재하는 것만 사용: `--color-line`(테두리), `--color-soft`(연한 배경), `--color-blue`, `--color-blue-dark`, `--color-muted`, `--color-text`. (`--color-border`/`--color-surface`는 없음.) 작성 후 grep으로 확인.

- [ ] **Step 1: 카드** `app/(public)/finance/_components/loan-card.tsx`:
```tsx
import Link from 'next/link';
import type { LoanSummary } from '@/lib/loan/list';

export function LoanCard({ item }: { item: LoanSummary }) {
  return (
    <Link
      href={`/finance/${item.seq}`}
      className="block rounded-lg border border-[var(--color-line)] p-4 transition hover:border-[var(--color-blue)]"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <span className="font-bold text-[var(--color-text)]">{item.finprdnm}</span>
        {item.lnlmt != null && (
          <span className="shrink-0 text-sm tabular-nums text-[var(--color-blue-dark)]">
            한도 {item.lnlmt.toLocaleString()}만원
          </span>
        )}
      </div>
      <p className="mb-2 text-xs text-[var(--color-muted)]">
        {item.ofrinstnm ?? '—'}
        {item.instCtg ? ` · ${item.instCtg}` : ''}
        {item.irt ? ` · 금리 ${item.irt}` : ''}
      </p>
      <div className="flex flex-wrap gap-1">
        {item.usageTags.map((t) => (
          <span key={t} className="rounded bg-[var(--color-soft)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 탐색기(클라이언트)** `app/(public)/finance/_components/loan-explorer.tsx`:
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterLoans,
  type LoanSummary,
  type LoanFacets,
  type LoanFilterCriteria,
} from '@/lib/loan/list';
import { LoanCard } from './loan-card';

const EMPTY: LoanFilterCriteria = { usage: [], inst: [], region: [], target: [], query: '', sort: null };
const FACET_KEYS = ['usage', 'inst', 'region', 'target'] as const;
type FacetKey = (typeof FACET_KEYS)[number];
const FACET_LABEL: Record<FacetKey, string> = {
  usage: '자금용도', inst: '기관', region: '지역', target: '대상',
};

// URL searchParams ↔ criteria (정적 ISR 유지 위해 useSearchParams 대신 location 사용).
function readFromUrl(): LoanFilterCriteria {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  const arr = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : []);
  const sort = sp.get('sort');
  return {
    usage: arr('usage'), inst: arr('inst'), region: arr('region'), target: arr('target'),
    query: sp.get('q') ?? '',
    sort: sort === 'limitDesc' || sort === 'limitAsc' ? sort : null,
  };
}

function writeToUrl(c: LoanFilterCriteria): void {
  const sp = new URLSearchParams();
  for (const k of FACET_KEYS) if (c[k].length) sp.set(k, c[k].join(','));
  if (c.query) sp.set('q', c.query);
  if (c.sort) sp.set('sort', c.sort);
  const qs = sp.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

export function LoanExplorer({ rows, facets }: { rows: LoanSummary[]; facets: LoanFacets }) {
  const [criteria, setCriteria] = useState<LoanFilterCriteria>(EMPTY);

  // 마운트 시 URL에서 초기 필터 복원
  useEffect(() => {
    setCriteria(readFromUrl());
  }, []);

  useEffect(() => {
    writeToUrl(criteria);
  }, [criteria]);

  const visible = useMemo(() => filterLoans(rows, criteria), [rows, criteria]);

  function toggle(key: FacetKey, value: string) {
    setCriteria((c) => {
      const has = c[key].includes(value);
      return { ...c, [key]: has ? c[key].filter((v) => v !== value) : [...c[key], value] };
    });
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="md:w-64 md:shrink-0">
        <input
          type="search"
          placeholder="상품명 검색"
          value={criteria.query}
          onChange={(e) => setCriteria((c) => ({ ...c, query: e.target.value }))}
          className="mb-4 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm"
        />
        {FACET_KEYS.map((key) => (
          <fieldset key={key} className="mb-4">
            <legend className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">{FACET_LABEL[key]}</legend>
            <div className="flex max-h-48 flex-col gap-1 overflow-auto">
              {facets[key].map((f) => (
                <label key={f.value} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={criteria[key].includes(f.value)}
                    onChange={() => toggle(key, f.value)}
                  />
                  <span className="flex-1">{f.value}</span>
                  <span className="text-xs text-[var(--color-muted)]">{f.count}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </aside>

      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-[var(--color-muted)]">{visible.length}개 상품</p>
          <select
            value={criteria.sort ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({ ...c, sort: (e.target.value || null) as LoanFilterCriteria['sort'] }))
            }
            className="rounded-md border border-[var(--color-line)] px-2 py-1 text-sm"
          >
            <option value="">정렬</option>
            <option value="limitDesc">한도 높은순</option>
            <option value="limitAsc">한도 낮은순</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <LoanCard key={item.seq} item={item} />
          ))}
        </div>
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--color-muted)]">조건에 맞는 상품이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 페이지** `app/(public)/finance/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { getLoanSummaries, collectFacets } from '@/lib/loan/list';
import { SourceCaption } from '@/components/ui/source-caption';
import { LoanExplorer } from './_components/loan-explorer';

export const metadata: Metadata = {
  title: '서민금융 대출상품 — 주거금융',
  description: '정부·정책·지자체·민간이 제공하는 서민금융 대출상품을 자금용도·대상·지역으로 비교해 보세요.',
  alternates: { canonical: '/finance' },
};

export const revalidate = 86_400;

export default async function FinancePage() {
  const rows = await getLoanSummaries();
  const facets = collectFacets(rows);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">주거금융</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        서민금융 대출상품
      </h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        서민금융진흥원이 모은 정부·정책·지자체·민간 대출상품입니다. 자금용도·대상·지역으로 좁혀 보세요.
      </p>

      <LoanExplorer rows={rows} facets={facets} />

      <SourceCaption ids={['kinfa-loan']} />
    </section>
  );
}
```

- [ ] **Step 4: 토큰 확인 + 타입체크**

Run: `grep -rhoE "var\(--color-[a-z-]+\)" "app/(public)/finance/" | sort -u` → `--color-border`/`--color-surface` 없어야 함.
Run: `npx tsc --noEmit 2>&1 | grep -iE "finance/page|loan-explorer|loan-card"; echo "tsc done"`
Expected: 빈 grep.

- [ ] **Step 5: Commit**
```bash
git add "app/(public)/finance"
git commit -m "feat(loan): /finance 리스트 + 클라이언트 패세트 탐색"
```

---

## Task 10: 상세 페이지

**Files:** Create `app/(public)/finance/[seq]/page.tsx`

- [ ] **Step 1: 구현** `app/(public)/finance/[seq]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getLoanProduct, getAllLoanSeqs, LOAN_SECTIONS, isDisplayable } from '@/lib/loan/detail';
import { SourceCaption } from '@/components/ui/source-caption';

export const revalidate = 86_400;

export async function generateStaticParams() {
  const seqs = await getAllLoanSeqs();
  return seqs.map((seq) => ({ seq: String(seq) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ seq: string }>;
}): Promise<Metadata> {
  const { seq } = await params;
  const product = await getLoanProduct(Number(seq));
  if (!product) return {};
  return {
    title: `${product.finprdnm} — 주거금융`,
    description: `${product.ofrinstnm ?? ''} 대출상품 ${product.finprdnm}의 한도·금리·자격요건·신청방법.`,
    alternates: { canonical: `/finance/${seq}` },
  };
}

export default async function LoanDetailPage({ params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const product = await getLoanProduct(Number(seq));
  if (!product) notFound();

  const raw = product.rawJson as Record<string, unknown>;
  const rltsite = raw.rltsite;

  return (
    <section className="mx-auto max-w-[820px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">주거금융 · 대출상품</p>
      <h1 className="mb-2 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {product.finprdnm}
      </h1>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        {product.ofrinstnm ?? '—'}
        {product.instCtg ? ` · ${product.instCtg}` : ''}
      </p>
      <div className="mb-8 flex flex-wrap gap-1">
        {product.usageTags.map((t) => (
          <span key={t} className="rounded bg-[var(--color-soft)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
            {t}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {LOAN_SECTIONS.map((section) => {
          const visible = section.fields.filter((f) => isDisplayable(raw[f.key]));
          if (visible.length === 0) return null;
          return (
            <div key={section.title}>
              <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{section.title}</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[160px_1fr]">
                {visible.map((f) => (
                  <div key={f.key} className="contents">
                    <dt className="text-sm font-semibold text-[var(--color-muted)]">{f.label}</dt>
                    <dd className="mb-2 text-sm text-[var(--color-text)] sm:mb-0">{String(raw[f.key])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}

        {isDisplayable(rltsite) && (
          <a
            href={String(rltsite)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-semibold text-[var(--color-blue)] hover:underline"
          >
            관련 사이트에서 자세히 보기 →
          </a>
        )}
      </div>

      <SourceCaption ids={['kinfa-loan']} />
    </section>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -iE "finance/\[seq\]"; echo "tsc done"`
Expected: 빈 grep.

- [ ] **Step 3: Commit**
```bash
git add "app/(public)/finance/[seq]"
git commit -m "feat(loan): /finance/[seq] 상세 페이지(섹션 + 원문 링크)"
```

---

## Task 11: 사이트맵 + npm 스크립트

**Files:** Modify `lib/sitemap/static-entries.ts`, `package.json`

- [ ] **Step 1: 사이트맵** `lib/sitemap/static-entries.ts`의 `/subscription` 항목 다음 줄:
```ts
  { url: `${SITE_URL}/finance`, changeFrequency: 'monthly', priority: 0.8 },
```

- [ ] **Step 2: 스크립트** `package.json`의 `"ingest:subscriptions"` 줄 다음:
```json
    "ingest:loan": "dotenv -e .env.local -- tsx scripts/ingest/loan/runner.ts",
```

- [ ] **Step 3: 확인**

Run: `node -e "require('./package.json').scripts['ingest:loan']||(()=>{throw 0})(); console.log('ok')" && grep -c "/finance" lib/sitemap/static-entries.ts`
Expected: `ok`, grep `1`.

- [ ] **Step 4: Commit**
```bash
git add lib/sitemap/static-entries.ts package.json
git commit -m "feat(loan): 사이트맵 /finance + ingest:loan 스크립트"
```

---

## Task 12: GitHub Actions 워크플로

**Files:** Create `.github/workflows/ingest-loan.yml`

- [ ] **Step 1: 작성** `.github/workflows/ingest-loan.yml`:
```yaml
name: ingest-loan

on:
  schedule:
    - cron: '0 20 1 * *'
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      REVALIDATE_TOKEN: ${{ secrets.REVALIDATE_TOKEN }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      LOG_LEVEL: info
      PRISMA_INGEST: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm tsx scripts/ingest/loan/runner.ts
        timeout-minutes: 10
```

- [ ] **Step 2: 확인**

Run: `npx --yes js-yaml .github/workflows/ingest-loan.yml >/dev/null && echo "yaml ok"` (js-yaml 없으면 `ingest-subscriptions.yml`과 들여쓰기 육안 대조)

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/ingest-loan.yml
git commit -m "feat(loan): 월 1회 대출상품 수집 워크플로"
```

---

## Task 13: 전체 검증

- [ ] **Step 1: loan 테스트 전체**

Run: `pnpm exec dotenv -e .env.test -- vitest run tests/ingest/loan tests/lib/loan-list.test.ts`
Expected: 전부 PASS (normalize 6 + adapter 3 + replace-snapshot 2 + loan-list 6 = 17).

- [ ] **Step 2: 타입 + 린트**

Run: `npx tsc --noEmit && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 3: 로컬 수집 스모크(.env.local 운영키 사용, docker 타깃)**

> 실제 API 호출엔 운영 `PUBLIC_DATA_KEY`가 필요하나 `.env.test`엔 없다. docker DB에 적재하려면 두 env를 합쳐 실행:

Run: `pnpm exec dotenv -e .env.test -e .env.local -- tsx -e "import {fetchAllLoanRows,replaceSnapshot} from './scripts/ingest/loan/runner'; import {prisma} from './lib/db'; (async()=>{const r=await fetchAllLoanRows(); await replaceSnapshot(r); console.log('seeded', await prisma.loanProduct.count()); await prisma.\$disconnect()})().catch(async e=>{console.error(e); process.exit(1)})"`
Expected: `seeded N`(N≈323). dotenv는 첫 파일 우선이라 `.env.test`의 `DATABASE_URL`(docker)이 이기고 `.env.local`의 `PUBLIC_DATA_KEY`가 채워진다. (키 없으면 이 스텝 생략, 운영에서 `workflow_dispatch`로 확인)

- [ ] **Step 4: 페이지 렌더 확인(docker 타깃 dev)**

Run: `pnpm exec dotenv -e .env.test -- next dev` 백그라운드 → `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/finance` → `200`, 그리고 `curl -s http://localhost:3000/finance | grep -oE "서민금융 대출상품"`. 시드된 seq로 `/finance/<seq>`도 200 확인 후 서버 종료.

- [ ] **Step 5: 최종 — 푸시·PR은 사용자 확인 후**

모든 태스크 개별 커밋됨. 푸시/배포는 사용자 승인 시.

---

## Self-Review 결과

- **Spec 커버리지:** §1 모델→T1, §2 매핑→T4/T8, §3 ETL(normalize·adapter·http·runner·격리)→T3·4·5·6, §4 출처→T2, §5 리스트(패세트·필터·URL동기화·반응형)→T7·9, §6 상세(섹션·원문링크·빈값가드)→T8·10, §7 테스트→T3·4·6·7·13, 사이트맵·스크립트→T11, 워크플로→T12. 누락 없음.
- **범위 밖 확인:** 매물 노출·region 심층연동·HF 금리·페이지네이션 미포함(스펙 일치).
- **타입 일관성:** `LoanProductRow`(ETL, rawJson 포함) vs `LoanSummary`(조회, rawJson 제외) 의도적 분리. `parseLoanProducts`→`{rows,totalCount}`, `fetchAllLoanRows`/`replaceSnapshot`/`collectFacets`/`filterLoans`/`getLoanSummaries`/`getLoanProduct`/`getAllLoanSeqs` 시그니처가 태스크 간 일치. `LoanFilterCriteria` 필드명(usage·inst·region·target·query·sort)이 T7 정의와 T9 사용에서 동일.
- **스펙과의 의도적 차이 1건:** 상세 빈값 처리 — 스펙 "−/없음/빈값 생략" 대신 **"−/빈값만 숨기고 '없음'은 표시"**(중도상환수수료=없음 등 유용). T8에 명시.
- **주의:** `lnlmt` 단위(만원)·`irt` 텍스트 표기는 T13 스모크에서 첫 실데이터로 확인.
