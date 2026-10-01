# 생활시설 상세 보강 PR 1 — 전통시장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국전통시장표준데이터에서 버리고 있던 9개 필드를 저장하고, 전통시장 상세(`/amenity/market/[id]`)에 "시장 한눈에"·"취급 품목" 카드와 히어로 요약을 추가한다.

**Architecture:** 마이그레이션으로 `TraditionalMarket`에 nullable 컬럼 9개를 더하고, 기존 어댑터 파서와 러너 upsert가 그 컬럼을 채운다. 화면은 공용 `AmenityItem`의 선택 필드로 값을 받아, 전통시장일 때만 새 카드를 렌더한다. 문자열 가공(장날 계산, 품목 분리)은 순수 함수 모듈 `lib/amenity/market-display.ts`에 모은다.

**Tech Stack:** Next.js App Router(ISR), Prisma + PostgreSQL/PostGIS, fast-xml-parser, Vitest(SSR은 `renderToStaticMarkup`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md` (특히 4·5·6·8·9절)

## Global Constraints

- 새 컬럼은 전부 nullable. 백필 마이그레이션 금지. 다음 수집의 `ON CONFLICT DO UPDATE`로 채운다.
- 원본 문자열을 저장하고, 분리·계산은 표시 시점에 한다.
- 전통시장 `sourceId`(이름+주소 해시)는 바꾸지 않는다.
- 값이 null이면 행·타일·카드를 숨긴다. `'-'` 행을 만들지 않는다.
- 장날은 "매월 4·9·14·19·24·29일" 같은 날짜 목록으로 표시한다. "다음 장날"은 쓰지 않는다(ISR 24시간 캐시 때문에 지난 날짜가 보일 수 있음).
- "전국 중앙값" 같은 집계 문구는 넣지 않는다.
- 홈페이지 링크는 `isLinkableUrl` 통과 시에만 `externalHref()`로 만든다.
- 색은 `app/globals.css`의 `--color-*` 토큰만 쓴다. 한글 본문 14px 이상(`text-sm` 이상), 보조 캡션만 `text-xs`.
- 마이그레이션은 손으로 쓴 SQL 폴더 하나만 좁게 `git add`한다(`prisma migrate dev` 금지: docker의 잔여 마이그레이션을 쓸어 담는다).
- 운영 사이트(imjangon.co.kr)에 자동 요청을 반복하지 않는다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
  ```

## Review Focus

1. **낯선 개설 주기 형식**(`'상설'`, `'15일'`, `'매일+5일장'`, 빈 문자열): 크래시 없이 원문을 그대로 보여주거나 숨겨야 한다. → Task 3 테스트
2. **값이 하나도 안 채워진 시장**(재수집 전 행): 페이지가 예전과 같이 렌더되고, 새 카드는 숨고, `'-'` 행이 생기지 않아야 한다. → Task 4·5 테스트
3. **XML 숫자 변환으로 깨지는 전화번호**: fast-xml-parser(`parseTagValue: true`)가 하이픈 없는 `0316438388`을 숫자 `316438388`로 바꾼다. 숫자로 온 전화번호는 버려야 한다(null). → Task 2 테스트
4. **컬럼 길이를 넘는 문자열**: VARCHAR 초과 1건이 청크 전체 INSERT를 실패시킨다. 파서가 컬럼 길이로 잘라야 한다. → Task 2 테스트
5. **링크가 아닌 홈페이지 값**(`'없음'`, 한글 문구): 링크를 만들지 않고 텍스트로만 보여야 한다. → Task 4 테스트

---

## File Structure

| 파일 | 역할 | 작업 |
|---|---|---|
| `scripts/ingest/amenities/parse-helpers.ts` | 어댑터 공용 파싱 헬퍼 | 생성 |
| `scripts/ingest/amenities/adapter-park.ts` | 로컬 `parseRefDate` 제거, 공용 헬퍼 사용 | 수정 |
| `scripts/ingest/amenities/adapter-parking.ts` | 로컬 `strOrNull`·`boolFromYn`·`parseRefDate` 제거, 공용 헬퍼 사용 | 수정 |
| `prisma/schema.prisma` | `TraditionalMarket` 컬럼 9개 | 수정 |
| `prisma/migrations/20261001000000_add_market_detail_fields/migration.sql` | ALTER TABLE | 생성 |
| `scripts/ingest/amenities/types.ts` | `NormalizedTraditionalMarket` 필드 9개 | 수정 |
| `scripts/ingest/amenities/adapter-traditional-market.ts` | 새 필드 파싱 | 수정 |
| `scripts/ingest/amenities/runner.ts` | `ingestTraditionalMarkets` upsert 컬럼 | 수정 |
| `lib/amenity/market-display.ts` | 장날·품목·햇수·히어로 문구 순수 함수 | 생성 |
| `lib/amenity/category.ts` | `AmenityItem` 선택 필드, `detailFields` 행 타입에 `href` | 수정 |
| `lib/amenity/adapters/market.ts` | `getById` select, `toItem`, `detailFields` | 수정 |
| `app/(public)/amenity/[category]/_components/amenity-info.tsx` | `href` 있으면 링크로 렌더 | 수정 |
| `app/(public)/amenity/[category]/_components/amenity-hero.tsx` | 선택 prop `summaryLine` | 수정 |
| `app/(public)/amenity/[category]/_components/market-overview.tsx` | "시장 한눈에" 카드 | 생성 |
| `app/(public)/amenity/[category]/_components/market-products.tsx` | "취급 품목" 카드 | 생성 |
| `app/(public)/amenity/[category]/[id]/page.tsx` | 전통시장일 때 새 카드·히어로 문구 | 수정 |
| `tests/ingest/amenities/parse-helpers.test.ts` | 헬퍼 테스트 | 생성 |
| `tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml` | 9/30 실측 기반 픽스처 | 생성 |
| `tests/ingest/amenities/adapter-traditional-market-detail.test.ts` | 새 필드 파서 테스트 | 생성 |
| `tests/lib/market-display.test.ts` | 표시 헬퍼 테스트 | 생성 |
| `tests/lib/market-adapter.test.ts` | `detailFields` 테스트 | 생성 |
| `tests/components/market-overview-ssr.test.ts` | 카드·히어로·정보 SSR 테스트 | 생성 |
| `tests/_helpers/seed-e2e.ts` | e2e 전통시장 시드 | 수정 |
| `tests/e2e/amenity-market-detail.spec.ts` | 상세 e2e | 생성 |

---

### Task 1: 공용 파싱 헬퍼

> 시작 전: 스펙·계획 커밋이 있는 `docs/amenity-detail-enrichment-spec` 브랜치에서 `git switch -c feat/amenity-enrich-market`으로 작업 브랜치를 만든다. 스펙과 이 계획 문서가 PR 1에 함께 실린다.

**Files:**
- Create: `scripts/ingest/amenities/parse-helpers.ts`
- Modify: `scripts/ingest/amenities/adapter-park.ts:7-13` (로컬 `parseRefDate` 삭제 후 import)
- Modify: `scripts/ingest/amenities/adapter-parking.ts:7-11, 26-40` (로컬 `strOrNull`, `boolFromYn`, `parseRefDate` 삭제 후 import. `numOrNull`·`coordOrNull`은 그대로 둔다)
- Test: `tests/ingest/amenities/parse-helpers.test.ts`

**Interfaces:**
- Produces:
  - `strOrNull(v: unknown): string | null`: 빈 값·공백은 null, 나머지는 trim한 문자열
  - `boolFromYn(v: unknown): boolean | null`: `'Y'`는 true, `'N'`은 false, 그 외 null
  - `parseRefDate(v: unknown): Date | null`: `YYYY-MM-DD`만 인정, UTC 자정 Date
  - `intInRange(v: unknown, min: number, max: number): number | null`: 숫자 또는 숫자 문자열이 정수이고 `[min, max]` 안이면 그 값, 아니면 null
  - `clip(s: string | null, max: number): string | null`: `max`자 초과 시 앞에서 `max`자만 남긴다

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/ingest/amenities/parse-helpers.test.ts
import { describe, it, expect } from 'vitest';
import {
  strOrNull,
  boolFromYn,
  parseRefDate,
  intInRange,
  clip,
} from '@/scripts/ingest/amenities/parse-helpers';

describe('parse-helpers', () => {
  it('strOrNull: 빈 값과 공백은 null, 나머지는 trim', () => {
    expect(strOrNull(undefined)).toBeNull();
    expect(strOrNull(null)).toBeNull();
    expect(strOrNull('')).toBeNull();
    expect(strOrNull('   ')).toBeNull();
    expect(strOrNull(' 매일 ')).toBe('매일');
    expect(strOrNull(62)).toBe('62');
  });

  it('boolFromYn: Y/N만 인정', () => {
    expect(boolFromYn('Y')).toBe(true);
    expect(boolFromYn('N')).toBe(false);
    expect(boolFromYn('')).toBeNull();
    expect(boolFromYn('y')).toBeNull();
    expect(boolFromYn(undefined)).toBeNull();
  });

  it('parseRefDate: YYYY-MM-DD만 UTC 자정으로', () => {
    expect(parseRefDate('2025-11-10')?.toISOString()).toBe('2025-11-10T00:00:00.000Z');
    expect(parseRefDate('20251110')).toBeNull();
    expect(parseRefDate('')).toBeNull();
    expect(parseRefDate(undefined)).toBeNull();
  });

  it('intInRange: 정수이고 범위 안일 때만', () => {
    expect(intInRange(1955, 1700, 2026)).toBe(1955);
    expect(intInRange('62', 1, 100000)).toBe(62);
    expect(intInRange('0', 1, 100000)).toBeNull();
    expect(intInRange(1650, 1700, 2026)).toBeNull();
    expect(intInRange(2099, 1700, 2026)).toBeNull();
    expect(intInRange('12.5', 1, 100)).toBeNull();
    expect(intInRange('abc', 1, 100)).toBeNull();
    expect(intInRange('', 1, 100)).toBeNull();
  });

  it('clip: 길이 초과분을 자른다', () => {
    expect(clip('abcdef', 3)).toBe('abc');
    expect(clip('ab', 3)).toBe('ab');
    expect(clip(null, 3)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/ingest/amenities/parse-helpers.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/ingest/amenities/parse-helpers"`

- [ ] **Step 3: 구현**

```ts
// scripts/ingest/amenities/parse-helpers.ts
// 어댑터 공용 파싱 헬퍼. 공공데이터 표준데이터 계열(공원·주차장·전통시장)이 같은 규칙을 쓴다.

export function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function boolFromYn(v: unknown): boolean | null {
  const s = strOrNull(v);
  if (s === 'Y') return true;
  if (s === 'N') return false;
  return null;
}

export function parseRefDate(v: unknown): Date | null {
  const s = strOrNull(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function intInRange(v: unknown, min: number, max: number): number | null {
  const s = strOrNull(v);
  if (!s || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** VARCHAR 길이 초과 1건이 청크 INSERT 전체를 실패시키므로 저장 전에 자른다. */
export function clip(s: string | null, max: number): string | null {
  if (s === null) return null;
  return s.length > max ? s.slice(0, max) : s;
}
```

`adapter-park.ts`: 7~13행의 로컬 `parseRefDate` 함수를 지우고 맨 위에 추가한다.

```ts
import { parseRefDate } from './parse-helpers';
```

`adapter-parking.ts`: 로컬 `strOrNull`(7~11행), `boolFromYn`(26~32행), `parseRefDate`(34~40행)를 지우고 맨 위에 추가한다.

```ts
import { strOrNull, boolFromYn, parseRefDate } from './parse-helpers';
```

- [ ] **Step 4: 통과 확인 (기존 어댑터 테스트 포함)**

Run: `pnpm vitest run tests/ingest/amenities/parse-helpers.test.ts tests/ingest/amenities/adapter-park.test.ts tests/ingest/amenities/adapter-parking.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/ingest/amenities/parse-helpers.ts scripts/ingest/amenities/adapter-park.ts scripts/ingest/amenities/adapter-parking.ts tests/ingest/amenities/parse-helpers.test.ts
git commit -m "refactor(ingest): 어댑터 공용 파싱 헬퍼 추출

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 2: 스키마·마이그레이션·파서·러너

**Files:**
- Modify: `prisma/schema.prisma` (`model TraditionalMarket`)
- Create: `prisma/migrations/20261001000000_add_market_detail_fields/migration.sql`
- Modify: `scripts/ingest/amenities/types.ts` (`NormalizedTraditionalMarket`)
- Modify: `scripts/ingest/amenities/adapter-traditional-market.ts` (`parseTraditionalMarketXml`의 `rows.push`)
- Modify: `scripts/ingest/amenities/runner.ts` (`ingestTraditionalMarkets`, 211~229행)
- Create: `tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml`
- Test: `tests/ingest/amenities/adapter-traditional-market-detail.test.ts`

**Interfaces:**
- Consumes: Task 1의 `strOrNull`, `boolFromYn`, `parseRefDate`, `intInRange`, `clip`
- Produces: `NormalizedTraditionalMarket`에 아래 필드가 추가되고, Prisma `TraditionalMarket` 모델에 같은 이름의 컬럼이 생긴다.
  ```ts
  storeCount: number | null;
  openCycle: string | null;
  establishedYear: number | null;
  products: string | null;
  hasParking: boolean | null;
  hasToilet: boolean | null;
  tel: string | null;
  homepage: string | null;
  referenceDate: Date | null;
  ```

- [ ] **Step 1: 픽스처 작성** (2026-09-30 실측 응답 2건 + 경계 사례 1건)

```xml
<!-- tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body>
    <items>
      <item>
        <mrktNm>장호원전통시장</mrktNm>
        <mrktType>상설장+4일장</mrktType>
        <rdnmadr>경기도 이천시 장호원읍 장감로77번길 14</rdnmadr>
        <lnmadr>경기도 이천시 장호원읍 장호원리 350</lnmadr>
        <mrktEstblCycle>4일+9일</mrktEstblCycle>
        <latitude>37.11809055</latitude>
        <longitude>127.631251</longitude>
        <storNumber>64</storNumber>
        <trtmntPrdlst>농산물+축산물+수산물+가공식품+의류+신발+가정용품+음식점+근린생활서비스</trtmntPrdlst>
        <useGcct></useGcct>
        <homepageUrl>http://www.jmarket.org/</homepageUrl>
        <pblicToiletYn>Y</pblicToiletYn>
        <prkplceYn>Y</prkplceYn>
        <estblYear>1955</estblYear>
        <phoneNumber>031-643-1330</phoneNumber>
        <referenceDate>2025-11-10</referenceDate>
      </item>
      <item>
        <mrktNm>사기막골도자기시장</mrktNm>
        <mrktType>상설장</mrktType>
        <rdnmadr>경기도 이천시 경충대로2993번길 24</rdnmadr>
        <lnmadr>경기도 이천시 사음동 536</lnmadr>
        <mrktEstblCycle>매일</mrktEstblCycle>
        <latitude>37.29483104</latitude>
        <longitude>127.4119796</longitude>
        <storNumber>62</storNumber>
        <trtmntPrdlst>의류+가정용품+음식점+근린생활서비스</trtmntPrdlst>
        <homepageUrl>www.sagimakgol.com</homepageUrl>
        <pblicToiletYn>Y</pblicToiletYn>
        <prkplceYn>N</prkplceYn>
        <estblYear>1978</estblYear>
        <phoneNumber>031-638-8388</phoneNumber>
        <referenceDate>2025-11-10</referenceDate>
      </item>
      <item>
        <mrktNm>경계사례시장</mrktNm>
        <mrktType>상설장</mrktType>
        <rdnmadr>서울특별시 중구 경계로 1</rdnmadr>
        <mrktEstblCycle></mrktEstblCycle>
        <storNumber>0</storNumber>
        <trtmntPrdlst>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</trtmntPrdlst>
        <pblicToiletYn>X</pblicToiletYn>
        <prkplceYn></prkplceYn>
        <estblYear>1650</estblYear>
        <phoneNumber>0316438388</phoneNumber>
        <referenceDate>20251110</referenceDate>
      </item>
    </items>
    <numOfRows>1000</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>3</totalCount>
  </body>
</response>
```

`경계사례시장`의 `trtmntPrdlst`는 `A` 330자다. 직접 확인할 때는 `node -e "console.log('A'.repeat(330))"`로 만든다.

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// tests/ingest/amenities/adapter-traditional-market-detail.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTraditionalMarketXml } from '@/scripts/ingest/amenities/adapter-traditional-market';

const xml = readFileSync(
  resolve('tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml'),
  'utf-8',
);
const rows = parseTraditionalMarketXml(xml).rows;
const byName = (n: string) => rows.find((r) => r.name === n)!;

describe('adapter-traditional-market 상세 필드', () => {
  it('장호원전통시장: 9개 필드를 원문 그대로 담는다', () => {
    const m = byName('장호원전통시장');
    expect(m.storeCount).toBe(64);
    expect(m.openCycle).toBe('4일+9일');
    expect(m.establishedYear).toBe(1955);
    expect(m.products).toBe('농산물+축산물+수산물+가공식품+의류+신발+가정용품+음식점+근린생활서비스');
    expect(m.hasParking).toBe(true);
    expect(m.hasToilet).toBe(true);
    expect(m.tel).toBe('031-643-1330');
    expect(m.homepage).toBe('http://www.jmarket.org/');
    expect(m.referenceDate?.toISOString()).toBe('2025-11-10T00:00:00.000Z');
  });

  it('사기막골도자기시장: 매일장, 주차장 N, 스킴 없는 홈페이지', () => {
    const m = byName('사기막골도자기시장');
    expect(m.openCycle).toBe('매일');
    expect(m.hasParking).toBe(false);
    expect(m.homepage).toBe('www.sagimakgol.com');
  });

  it('경계사례: 범위 밖·형식 위반 값은 null, 긴 문자열은 잘린다', () => {
    const m = byName('경계사례시장');
    expect(m.storeCount).toBeNull(); // 0곳은 의미 없음
    expect(m.openCycle).toBeNull(); // 빈 값
    expect(m.establishedYear).toBeNull(); // 1700 미만
    expect(m.hasToilet).toBeNull(); // 'X'
    expect(m.hasParking).toBeNull(); // 빈 값
    expect(m.referenceDate).toBeNull(); // YYYYMMDD 형식
    expect(m.products).toHaveLength(300); // VARCHAR(300)
  });

  it('경계사례: XML 파서가 숫자로 바꾼 전화번호(앞자리 0 유실)는 버린다', () => {
    expect(byName('경계사례시장').tel).toBeNull();
  });

  it('sourceId는 기존과 같은 이름+주소 해시 규칙을 유지한다', () => {
    expect(byName('장호원전통시장').sourceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-traditional-market-detail.test.ts`
Expected: FAIL — `expected undefined to be 64`

- [ ] **Step 4: 스키마와 마이그레이션**

`prisma/schema.prisma`의 `model TraditionalMarket`에서 `sigunguCode` 줄 아래에 추가한다.

```prisma
  storeCount      Int?
  openCycle       String?   @db.VarChar(40)
  establishedYear Int?
  products        String?   @db.VarChar(300)
  hasParking      Boolean?
  hasToilet       Boolean?
  tel             String?   @db.VarChar(30)
  homepage        String?   @db.VarChar(200)
  referenceDate   DateTime? @db.Date
```

```sql
-- prisma/migrations/20261001000000_add_market_detail_fields/migration.sql
-- 전국전통시장표준데이터에서 수집하던 응답 중 버리던 필드를 저장한다(생활시설 상세 보강 PR 1).
-- 전부 nullable: 다음 수집의 ON CONFLICT DO UPDATE가 채운다.
ALTER TABLE "TraditionalMarket"
  ADD COLUMN "storeCount" INTEGER,
  ADD COLUMN "openCycle" VARCHAR(40),
  ADD COLUMN "establishedYear" INTEGER,
  ADD COLUMN "products" VARCHAR(300),
  ADD COLUMN "hasParking" BOOLEAN,
  ADD COLUMN "hasToilet" BOOLEAN,
  ADD COLUMN "tel" VARCHAR(30),
  ADD COLUMN "homepage" VARCHAR(200),
  ADD COLUMN "referenceDate" DATE;
```

Run: `docker compose up -d && pnpm test:db:migrate && pnpm prisma generate`
Expected: `1 migration found … applied` 다음 `Generated Prisma Client`

Run (스키마와 DB 일치 확인): `pnpm dotenv -e .env.test -- prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code`
Expected: `No difference detected.` (exit 0)

- [ ] **Step 5: 타입과 파서**

`scripts/ingest/amenities/types.ts`의 `NormalizedTraditionalMarket`에 Interfaces의 9개 필드를 `marketType` 아래에 추가한다.

`adapter-traditional-market.ts` 맨 위 import에 추가한다.

```ts
import { strOrNull, boolFromYn, parseRefDate, intInRange, clip } from './parse-helpers';
```

`rows.push({ ... marketType: ... })` 안의 `marketType` 줄 다음에 추가한다.

```ts
      storeCount: intInRange(item.storNumber, 1, 100_000),
      openCycle: clip(strOrNull(item.mrktEstblCycle), 40),
      establishedYear: intInRange(item.estblYear, 1700, new Date().getUTCFullYear()),
      products: clip(
        item.trtmntPrdlst != null ? decodeEntities(String(item.trtmntPrdlst).trim()) || null : null,
        300,
      ),
      hasParking: boolFromYn(item.prkplceYn),
      hasToilet: boolFromYn(item.pblicToiletYn),
      // parseTagValue가 하이픈 없는 번호를 숫자로 바꿔 앞자리 0이 사라진다 → 문자열로 온 값만 신뢰.
      tel: typeof item.phoneNumber === 'string' ? clip(strOrNull(item.phoneNumber), 30) : null,
      homepage: clip(strOrNull(item.homepageUrl), 200),
      referenceDate: parseRefDate(item.referenceDate),
```

- [ ] **Step 6: 러너 upsert**

`runner.ts`의 `ingestTraditionalMarkets` 안 `values`와 SQL을 아래로 바꾼다.

```ts
    const values = chunk.map((r: NormalizedTraditionalMarket) =>
      Prisma.sql`(${r.sourceId}, ${r.name}, ${r.address}, ${r.marketType ?? null},
        ${r.storeCount}, ${r.openCycle}, ${r.establishedYear}, ${r.products},
        ${r.hasParking}, ${r.hasToilet}, ${r.tel}, ${r.homepage}, ${r.referenceDate}::date,
        ${locationSql(r.lat, r.lng)}, NOW())`,
    );
    await prisma.$executeRaw`
      INSERT INTO "TraditionalMarket" ("sourceId", name, address, "marketType",
        "storeCount", "openCycle", "establishedYear", products,
        "hasParking", "hasToilet", tel, homepage, "referenceDate",
        location, "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("sourceId") DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        "marketType" = EXCLUDED."marketType",
        "storeCount" = EXCLUDED."storeCount",
        "openCycle" = EXCLUDED."openCycle",
        "establishedYear" = EXCLUDED."establishedYear",
        products = EXCLUDED.products,
        "hasParking" = EXCLUDED."hasParking",
        "hasToilet" = EXCLUDED."hasToilet",
        tel = EXCLUDED.tel,
        homepage = EXCLUDED.homepage,
        "referenceDate" = EXCLUDED."referenceDate",
        location = EXCLUDED.location,
        "updatedAt" = NOW()
    `;
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm vitest run tests/ingest/amenities/adapter-traditional-market-detail.test.ts tests/ingest/amenities/adapter-traditional-market.test.ts && pnpm typecheck`
Expected: 테스트 전부 PASS, typecheck 오류 0

- [ ] **Step 8: 로컬 실수집으로 upsert 검증** (공공 API 2회 호출, 로컬 docker DB에 기록)

`.env.local`이 로컬 docker(5433)를 가리키는지 먼저 확인한다: `grep -c 5433 .env.local` → 1 이상이어야 한다. 0이면 이 단계를 멈추고 사용자에게 묻는다.

Run: `pnpm dotenv -e .env.local -- tsx scripts/ingest/amenities/runner.ts --source=traditional-market`
Expected: 로그 `{ source: 'traditional-market', upserted: 1393 }` 근처 값

Run:
```bash
docker exec imjang-on-db psql -U imjang -d imjang_on -c "SELECT count(*) total, count(\"storeCount\") store, count(\"openCycle\") cycle, count(\"establishedYear\") yr, count(products) prd, count(tel) tel, count(homepage) hp FROM \"TraditionalMarket\";"
```
Expected: 스펙 2절 채움률과 비슷 — store·cycle·prd ≈ total, yr ≈ 99%, tel ≈ 61%, hp ≈ 5%

- [ ] **Step 9: 커밋** (마이그레이션 폴더는 새 폴더 하나만)

```bash
git add prisma/schema.prisma prisma/migrations/20261001000000_add_market_detail_fields scripts/ingest/amenities/types.ts scripts/ingest/amenities/adapter-traditional-market.ts scripts/ingest/amenities/runner.ts tests/ingest/amenities/fixtures/traditional-market-detail-sample.xml tests/ingest/amenities/adapter-traditional-market-detail.test.ts
git status --short prisma/migrations   # 새 폴더 외 변경이 없어야 한다
git commit -m "feat(ingest): 전통시장 점포수·개설주기·품목 등 9개 필드 수집

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 3: 전통시장 표시 헬퍼

**Files:**
- Create: `lib/amenity/market-display.ts`
- Test: `tests/lib/market-display.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MarketDays =
    | { kind: 'daily' }
    | { kind: 'monthly'; cycle: number[]; days: number[] } // cycle=[4,9], days=[4,9,14,19,24,29]
    | { kind: 'raw'; text: string };
  export function parseMarketDays(openCycle: string | null | undefined): MarketDays | null;
  export function marketDaysShort(d: MarketDays): string; // '4·9일장' | '매일' | 원문
  export function marketDaysLong(d: MarketDays): string;  // '매월 4·9·14·19·24·29일' | '매일 개장' | 원문
  export function splitProducts(products: string | null | undefined): string[];
  export function marketAgeYears(year: number | null | undefined, nowYear: number): number | null;
  export function buildMarketHeroLine(
    m: { establishedYear?: number | null; storeCount?: number | null; openCycle?: string | null },
  ): string | null; // '1955년 개설 · 점포 64곳 · 4·9일 장날'
  ```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/market-display.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseMarketDays,
  marketDaysShort,
  marketDaysLong,
  splitProducts,
  marketAgeYears,
  buildMarketHeroLine,
} from '@/lib/amenity/market-display';

describe('parseMarketDays', () => {
  it('4일+9일 → 끝자리 4·9인 날', () => {
    expect(parseMarketDays('4일+9일')).toEqual({
      kind: 'monthly',
      cycle: [4, 9],
      days: [4, 9, 14, 19, 24, 29],
    });
  });

  it('5일+10일 → 끝자리 5·0인 날', () => {
    const d = parseMarketDays('5일+10일');
    expect(d).toEqual({ kind: 'monthly', cycle: [5, 10], days: [5, 10, 15, 20, 25, 30] });
  });

  it('1일+6일은 31일을 포함한다', () => {
    const d = parseMarketDays('1일+6일');
    expect(d && d.kind === 'monthly' && d.days).toEqual([1, 6, 11, 16, 21, 26, 31]);
  });

  it('공백은 무시한다', () => {
    expect(parseMarketDays(' 2일 + 7일 ')).toMatchObject({ kind: 'monthly', cycle: [2, 7] });
  });

  it('매일 → daily', () => {
    expect(parseMarketDays('매일')).toEqual({ kind: 'daily' });
  });

  it('낯선 형식은 원문(raw)으로 남긴다', () => {
    expect(parseMarketDays('상설')).toEqual({ kind: 'raw', text: '상설' });
    expect(parseMarketDays('15일')).toEqual({ kind: 'raw', text: '15일' });
    expect(parseMarketDays('매일+5일장')).toEqual({ kind: 'raw', text: '매일+5일장' });
  });

  it('빈 값은 null', () => {
    expect(parseMarketDays('')).toBeNull();
    expect(parseMarketDays('  ')).toBeNull();
    expect(parseMarketDays(null)).toBeNull();
    expect(parseMarketDays(undefined)).toBeNull();
  });
});

describe('marketDaysShort / marketDaysLong', () => {
  it('monthly', () => {
    const d = parseMarketDays('4일+9일')!;
    expect(marketDaysShort(d)).toBe('4·9일장');
    expect(marketDaysLong(d)).toBe('매월 4·9·14·19·24·29일');
  });
  it('daily', () => {
    const d = parseMarketDays('매일')!;
    expect(marketDaysShort(d)).toBe('매일');
    expect(marketDaysLong(d)).toBe('매일 개장');
  });
  it('raw', () => {
    const d = parseMarketDays('상설')!;
    expect(marketDaysShort(d)).toBe('상설');
    expect(marketDaysLong(d)).toBe('상설');
  });
});

describe('splitProducts', () => {
  it('+로 나누고 공백·빈 항목·중복을 정리한다', () => {
    expect(splitProducts('농산물+축산물++ 수산물+농산물+')).toEqual(['농산물', '축산물', '수산물']);
  });
  it('빈 값은 빈 배열', () => {
    expect(splitProducts(null)).toEqual([]);
    expect(splitProducts('')).toEqual([]);
  });
});

describe('marketAgeYears', () => {
  it('개설 햇수', () => {
    expect(marketAgeYears(1955, 2026)).toBe(71);
  });
  it('없거나 미래 연도면 null', () => {
    expect(marketAgeYears(null, 2026)).toBeNull();
    expect(marketAgeYears(2030, 2026)).toBeNull();
  });
});

describe('buildMarketHeroLine', () => {
  it('세 요소를 모두 잇는다', () => {
    expect(buildMarketHeroLine({ establishedYear: 1955, storeCount: 64, openCycle: '4일+9일' }))
      .toBe('1955년 개설 · 점포 64곳 · 4·9일 장날');
  });
  it('매일장은 매일 개장', () => {
    expect(buildMarketHeroLine({ establishedYear: 1978, storeCount: 62, openCycle: '매일' }))
      .toBe('1978년 개설 · 점포 62곳 · 매일 개장');
  });
  it('낯선 주기는 빼고, 점포 수는 천 단위 구분', () => {
    expect(buildMarketHeroLine({ storeCount: 5111, openCycle: '상설' })).toBe('점포 5,111곳');
  });
  it('아무 값도 없으면 null', () => {
    expect(buildMarketHeroLine({})).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/market-display.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/amenity/market-display"`

- [ ] **Step 3: 구현**

```ts
// lib/amenity/market-display.ts
// 전통시장 원문 필드(개설 주기·취급 품목·개설 연도)를 화면 문구로 바꾸는 순수 함수.
// "다음 장날"은 만들지 않는다 — 상세는 ISR 24시간 캐시라 지난 날짜가 보일 수 있다.

export type MarketDays =
  | { kind: 'daily' }
  | { kind: 'monthly'; cycle: number[]; days: number[] }
  | { kind: 'raw'; text: string };

/** '4일+9일'처럼 1~10일로 이뤄진 오일장 주기만 날짜로 펼친다. 그 외 형식은 원문 유지. */
export function parseMarketDays(openCycle: string | null | undefined): MarketDays | null {
  const raw = (openCycle ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, '');
  if (compact === '매일') return { kind: 'daily' };
  if (!/^\d{1,2}일(\+\d{1,2}일)*$/.test(compact)) return { kind: 'raw', text: raw };
  const cycle = Array.from(new Set(compact.split('+').map((t) => Number(t.replace('일', ''))))).sort(
    (a, b) => a - b,
  );
  if (cycle.some((n) => n < 1 || n > 10)) return { kind: 'raw', text: raw };
  const digits = cycle.map((n) => n % 10);
  const days: number[] = [];
  for (let d = 1; d <= 31; d++) if (digits.includes(d % 10)) days.push(d);
  return { kind: 'monthly', cycle, days };
}

export function marketDaysShort(d: MarketDays): string {
  if (d.kind === 'daily') return '매일';
  if (d.kind === 'monthly') return `${d.cycle.join('·')}일장`;
  return d.text;
}

export function marketDaysLong(d: MarketDays): string {
  if (d.kind === 'daily') return '매일 개장';
  if (d.kind === 'monthly') return `매월 ${d.days.join('·')}일`;
  return d.text;
}

export function splitProducts(products: string | null | undefined): string[] {
  if (!products) return [];
  const parts = products.split('+').map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

export function marketAgeYears(year: number | null | undefined, nowYear: number): number | null {
  if (year == null || year > nowYear) return null;
  return nowYear - year;
}

export function buildMarketHeroLine(m: {
  establishedYear?: number | null;
  storeCount?: number | null;
  openCycle?: string | null;
}): string | null {
  const parts: string[] = [];
  if (m.establishedYear) parts.push(`${m.establishedYear}년 개설`);
  if (m.storeCount) parts.push(`점포 ${m.storeCount.toLocaleString('ko-KR')}곳`);
  const days = parseMarketDays(m.openCycle);
  if (days?.kind === 'monthly') parts.push(`${days.cycle.join('·')}일 장날`);
  if (days?.kind === 'daily') parts.push('매일 개장');
  return parts.length ? parts.join(' · ') : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/market-display.test.ts`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/market-display.ts tests/lib/market-display.test.ts
git commit -m "feat(market): 장날·취급품목·개설햇수 표시 헬퍼

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 4: 상세 데이터 경로 (`AmenityItem`·어댑터·정보 카드)

**Files:**
- Modify: `lib/amenity/category.ts` (`AmenityItem`, `AmenityCategoryDef.detailFields` 반환 타입)
- Modify: `lib/amenity/adapters/market.ts` (`toItem`, `getById`, `detailFields`)
- Modify: `app/(public)/amenity/[category]/_components/amenity-info.tsx`
- Test: `tests/lib/market-adapter.test.ts`, `tests/components/market-overview-ssr.test.ts`(AmenityInfo 부분)

**Interfaces:**
- Consumes: Task 2의 Prisma 컬럼, `lib/external-href.ts`의 `externalHref`·`isLinkableUrl`
- Produces:
  - `AmenityItem`에 선택 필드 추가:
    ```ts
    storeCount?: number | null;
    openCycle?: string | null;
    establishedYear?: number | null;
    products?: string | null;
    hasParking?: boolean | null;
    hasToilet?: boolean | null;
    tel?: string | null;
    homepage?: string | null;
    referenceDate?: Date | null;
    ```
  - `export interface AmenityDetailField { label: string; value: string; href?: string }`를 `category.ts`에 정의하고, `detailFields(item: AmenityItem): AmenityDetailField[]`로 바꾼다(기존 어댑터는 `href`를 안 쓰므로 수정 불필요).

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/lib/market-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { marketDef } from '@/lib/amenity/adapters/market';
import type { AmenityItem } from '@/lib/amenity/category';

const base: AmenityItem = { id: 1n, name: '장호원전통시장', address: '경기도 이천시', sigunguCode: '41500' };

describe('marketDef.detailFields', () => {
  it('값이 하나도 없으면 행을 만들지 않는다 ("-" 금지)', () => {
    expect(marketDef.detailFields(base)).toEqual([]);
  });

  it('채워진 값만 순서대로 행으로', () => {
    const rows = marketDef.detailFields({
      ...base,
      marketType: '상설장+4일장',
      openCycle: '4일+9일',
      establishedYear: 1955,
      tel: '031-643-1330',
      homepage: 'http://www.jmarket.org/',
    });
    expect(rows.map((r) => r.label)).toEqual(['시장 유형', '분류', '개설 주기', '개설 연도', '전화', '홈페이지']);
    expect(rows.find((r) => r.label === '개설 연도')!.value).toBe('1955년');
    expect(rows.find((r) => r.label === '홈페이지')!.href).toBe('http://www.jmarket.org/');
  });

  it('스킴 없는 홈페이지는 https를 붙여 링크한다', () => {
    const rows = marketDef.detailFields({ ...base, homepage: 'www.sagimakgol.com' });
    expect(rows[0]).toEqual({ label: '홈페이지', value: 'www.sagimakgol.com', href: 'https://www.sagimakgol.com' });
  });

  it('링크가 아닌 홈페이지 값은 텍스트로만', () => {
    const rows = marketDef.detailFields({ ...base, homepage: '없음' });
    expect(rows[0]).toEqual({ label: '홈페이지', value: '없음' });
  });
});
```

`tests/components/market-overview-ssr.test.ts`를 만들고 AmenityInfo 테스트를 먼저 넣는다(Task 5에서 같은 파일에 카드 테스트를 추가한다).

```ts
// tests/components/market-overview-ssr.test.ts
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmenityInfo } from '@/app/(public)/amenity/[category]/_components/amenity-info';
import { marketDef } from '@/lib/amenity/adapters/market';
import type { AmenityItem } from '@/lib/amenity/category';

// vitest(esbuild) classic 런타임 shim — amenity-hero-ssr.test.ts와 동일
(globalThis as unknown as { React: typeof React }).React = React;

const filled: AmenityItem = {
  id: 1n,
  name: '장호원전통시장',
  address: '경기도 이천시 장호원읍 장감로77번길 14',
  sigunguCode: '41500',
  marketType: '상설장+4일장',
  storeCount: 64,
  openCycle: '4일+9일',
  establishedYear: 1955,
  products: '농산물+축산물+수산물',
  hasParking: true,
  hasToilet: true,
  tel: '031-643-1330',
  homepage: 'http://www.jmarket.org/',
  referenceDate: new Date('2025-11-10T00:00:00Z'),
};
const empty: AmenityItem = { id: 2n, name: '빈시장', address: '서울', sigunguCode: '11110' };

describe('AmenityInfo (전통시장)', () => {
  it('홈페이지는 새 창 외부 링크로', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: filled, def: marketDef, regionFullName: '경기도 이천시' }));
    expect(html).toContain('href="http://www.jmarket.org/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('빈 시장은 지역 행만 남고 "-" 값 행이 없다', () => {
    const html = renderToStaticMarkup(createElement(AmenityInfo, { item: empty, def: marketDef, regionFullName: '서울특별시 종로구' }));
    expect(html).toContain('서울특별시 종로구');
    expect(html).not.toContain('시장 유형');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/lib/market-adapter.test.ts tests/components/market-overview-ssr.test.ts`
Expected: FAIL — 첫 테스트가 `[{ label: '시장 유형', value: '-' }, …]`을 받아 실패, 링크 테스트는 `href` 미포함으로 실패

- [ ] **Step 3: 구현**

`lib/amenity/category.ts`: `AmenityItem`에 Interfaces의 9개 선택 필드를 `marketType` 아래에 추가하고, 인터페이스 위에 타입을 정의한다.

```ts
export interface AmenityDetailField {
  label: string;
  value: string;
  /** 있으면 외부 링크로 렌더(externalHref로 정규화된 값). */
  href?: string;
}
```

`AmenityCategoryDef`의 `detailFields(item: AmenityItem): Array<{ label: string; value: string }>;`를 `detailFields(item: AmenityItem): AmenityDetailField[];`로 바꾼다.

`lib/amenity/adapters/market.ts`:

맨 위 import에 추가한다.

```ts
import { externalHref, isLinkableUrl } from '@/lib/external-href';
import type { AmenityDetailField } from '@/lib/amenity/category';
```

`toItem`을 아래로 바꾼다(목록은 기존 5개 컬럼만 select하므로 새 필드는 선택 인자다).

```ts
type MarketRow = {
  id: bigint;
  name: string;
  address: string;
  sigunguCode: string | null;
  marketType: string | null;
  storeCount?: number | null;
  openCycle?: string | null;
  establishedYear?: number | null;
  products?: string | null;
  hasParking?: boolean | null;
  hasToilet?: boolean | null;
  tel?: string | null;
  homepage?: string | null;
  referenceDate?: Date | null;
};

function toItem(m: MarketRow): AmenityItem {
  return { ...m };
}
```

`getById`의 `select`를 넓힌다.

```ts
    select: {
      id: true, name: true, address: true, sigunguCode: true, marketType: true,
      storeCount: true, openCycle: true, establishedYear: true, products: true,
      hasParking: true, hasToilet: true, tel: true, homepage: true, referenceDate: true,
    },
```

`marketDef`의 `detailFields`를 바꾼다.

```ts
  detailFields: (item) => {
    const rows: AmenityDetailField[] = [];
    if (item.marketType) rows.push({ label: '시장 유형', value: item.marketType });
    const summary = inferRowSummary(item);
    if (summary) rows.push({ label: '분류', value: summary });
    if (item.openCycle) rows.push({ label: '개설 주기', value: item.openCycle });
    if (item.establishedYear) rows.push({ label: '개설 연도', value: `${item.establishedYear}년` });
    if (item.tel) rows.push({ label: '전화', value: item.tel });
    if (item.homepage) {
      rows.push(
        isLinkableUrl(item.homepage)
          ? { label: '홈페이지', value: item.homepage, href: externalHref(item.homepage) }
          : { label: '홈페이지', value: item.homepage },
      );
    }
    return rows;
  },
```

`amenity-info.tsx`의 값 `<span>`을 아래로 바꾼다.

```tsx
            {r.href ? (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-semibold text-[var(--color-blue)] hover:underline"
              >
                {r.value}
              </a>
            ) : (
              <span className="text-sm font-semibold text-[var(--color-text)]">{r.value || '-'}</span>
            )}
```

(`'-'` 대체는 지역 행처럼 기존 어댑터가 빈 문자열을 넘기는 경우를 위해 남긴다. 전통시장은 null 행을 만들지 않으므로 해당 없음.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/lib/market-adapter.test.ts tests/components/market-overview-ssr.test.ts tests/components/amenity-hero-ssr.test.ts tests/components/amenity-card-ssr.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add lib/amenity/category.ts lib/amenity/adapters/market.ts "app/(public)/amenity/[category]/_components/amenity-info.tsx" tests/lib/market-adapter.test.ts tests/components/market-overview-ssr.test.ts
git commit -m "feat(market): 상세 정보에 개설주기·연도·전화·홈페이지, 빈 값 행 제거

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 5: "시장 한눈에"·"취급 품목" 카드와 히어로 요약

**Files:**
- Create: `app/(public)/amenity/[category]/_components/market-overview.tsx`
- Create: `app/(public)/amenity/[category]/_components/market-products.tsx`
- Modify: `app/(public)/amenity/[category]/_components/amenity-hero.tsx`
- Modify: `app/(public)/amenity/[category]/[id]/page.tsx`
- Test: `tests/components/market-overview-ssr.test.ts` (Task 4 파일에 추가)

**Interfaces:**
- Consumes: Task 3의 `parseMarketDays`, `marketDaysShort`, `marketDaysLong`, `splitProducts`, `marketAgeYears`, `buildMarketHeroLine`; Task 4의 `AmenityItem` 선택 필드
- Produces:
  - `MarketOverview({ item, nowYear }: { item: AmenityItem; nowYear: number }): JSX.Element | null`
  - `MarketProducts({ item }: { item: AmenityItem }): JSX.Element | null`
  - `AmenityHero`에 선택 prop `summaryLine?: string | null`

- [ ] **Step 1: 실패하는 테스트 추가** (`tests/components/market-overview-ssr.test.ts`: 아래 import 3줄은 파일 맨 위 import 묶음에, describe 블록은 파일 끝에)

```ts
import { MarketOverview } from '@/app/(public)/amenity/[category]/_components/market-overview';
import { MarketProducts } from '@/app/(public)/amenity/[category]/_components/market-products';
import { AmenityHero } from '@/app/(public)/amenity/[category]/_components/amenity-hero';

describe('MarketOverview', () => {
  it('타일 4개: 점포 수, 개설 햇수, 장날 목록, 방문 편의 + 기준일', () => {
    const html = renderToStaticMarkup(createElement(MarketOverview, { item: filled, nowYear: 2026 }));
    expect(html).toContain('시장 한눈에');
    expect(html).toContain('64곳');
    expect(html).toContain('71년');
    expect(html).toContain('4·9일장');
    expect(html).toContain('매월 4·9·14·19·24·29일');
    expect(html).toContain('주차장·공중화장실');
    expect(html).toContain('2025-11-10');
    expect(html).not.toContain('다음 장날');
  });

  it('값이 하나도 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(MarketOverview, { item: empty, nowYear: 2026 }))).toBe('');
  });

  it('주차장·화장실이 모두 N이면 "없음"으로 표시', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, hasParking: false, hasToilet: false }, nowYear: 2026 }),
    );
    expect(html).toContain('주차장 없음 · 화장실 없음');
  });

  it('낯선 개설 주기는 원문으로', () => {
    const html = renderToStaticMarkup(
      createElement(MarketOverview, { item: { ...empty, openCycle: '상설' }, nowYear: 2026 }),
    );
    expect(html).toContain('상설');
  });
});

describe('MarketProducts', () => {
  it('품목을 칩으로', () => {
    const html = renderToStaticMarkup(createElement(MarketProducts, { item: filled }));
    expect(html).toContain('취급 품목');
    expect(html).toContain('>축산물<');
  });
  it('품목이 없으면 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(createElement(MarketProducts, { item: empty }))).toBe('');
  });
});

describe('AmenityHero summaryLine', () => {
  it('summaryLine이 있으면 보여준다', () => {
    const html = renderToStaticMarkup(
      createElement(AmenityHero, { item: filled, def: marketDef, summaryLine: '1955년 개설 · 점포 64곳 · 4·9일 장날' }),
    );
    expect(html).toContain('1955년 개설 · 점포 64곳 · 4·9일 장날');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run tests/components/market-overview-ssr.test.ts`
Expected: FAIL — `Failed to resolve import ".../market-overview"`

- [ ] **Step 3: 구현**

```tsx
// app/(public)/amenity/[category]/_components/market-overview.tsx
import { Card } from '@/components/ui/card';
import type { AmenityItem } from '@/lib/amenity/category';
import { parseMarketDays, marketDaysShort, marketDaysLong, marketAgeYears } from '@/lib/amenity/market-display';

interface Tile { label: string; value: string; sub?: string }

function yn(v: boolean | null | undefined): string {
  if (v === true) return '있음';
  if (v === false) return '없음';
  return '정보 없음';
}

export function MarketOverview({ item, nowYear }: { item: AmenityItem; nowYear: number }) {
  const tiles: Tile[] = [];
  if (item.storeCount) tiles.push({ label: '점포 수', value: `${item.storeCount.toLocaleString('ko-KR')}곳` });
  const age = marketAgeYears(item.establishedYear, nowYear);
  if (age !== null) tiles.push({ label: '개설', value: `${age}년`, sub: `${item.establishedYear}년 개설` });
  const days = parseMarketDays(item.openCycle);
  if (days) {
    tiles.push({
      label: '장날',
      value: marketDaysShort(days),
      sub: days.kind === 'raw' ? undefined : marketDaysLong(days),
    });
  }
  if (item.hasParking != null || item.hasToilet != null) {
    const have = [item.hasParking && '주차장', item.hasToilet && '공중화장실'].filter(Boolean);
    tiles.push({
      label: '방문 편의',
      value: have.length ? have.join('·') : '없음',
      sub: `주차장 ${yn(item.hasParking)} · 화장실 ${yn(item.hasToilet)}`,
    });
  }
  if (tiles.length === 0) return null;

  return (
    <Card id="market-overview">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">시장 한눈에</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold tracking-tight text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {item.referenceDate && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          공공데이터 기준일 {item.referenceDate.toISOString().slice(0, 10)}
        </p>
      )}
    </Card>
  );
}
```

`주차장 없음 · 화장실 없음` 테스트를 통과하려면 두 값이 모두 false일 때 `sub`가 그 문자열이어야 한다. 위 `yn` 구현이 그렇게 만든다.

```tsx
// app/(public)/amenity/[category]/_components/market-products.tsx
import { Card } from '@/components/ui/card';
import type { AmenityItem } from '@/lib/amenity/category';
import { splitProducts } from '@/lib/amenity/market-display';

export function MarketProducts({ item }: { item: AmenityItem }) {
  const products = splitProducts(item.products);
  if (products.length === 0) return null;
  return (
    <Card id="market-products">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">취급 품목</h2>
      <ul className="flex flex-wrap gap-2">
        {products.map((p) => (
          <li
            key={p}
            className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1.5 text-sm font-semibold text-[var(--color-blue-dark)]"
          >{p}</li>
        ))}
      </ul>
    </Card>
  );
}
```

`amenity-hero.tsx`: props 타입과 본문을 바꾼다.

```tsx
export function AmenityHero({
  item,
  def,
  summaryLine,
}: {
  item: AmenityItem;
  def: AmenityCategoryDef;
  summaryLine?: string | null;
}) {
```

주소 `<div>`(📍 줄) 다음, 바깥 `min-w-0` div 닫기 전에 추가한다.

```tsx
        {summaryLine && (
          <p className="mt-3 border-t border-[var(--color-line)] pt-3 text-sm font-bold text-[var(--color-blue)]">
            {summaryLine}
          </p>
        )}
```

`page.tsx`:

import 추가.

```tsx
import { MarketOverview } from '../_components/market-overview';
import { MarketProducts } from '../_components/market-products';
import { buildMarketHeroLine } from '@/lib/amenity/market-display';
```

`const displayName = …` 다음 줄에 추가한다.

```tsx
  const isMarket = def.slug === 'market';
```

`<AmenityHero item={item} def={def} />`를 바꾼다.

```tsx
      <AmenityHero item={item} def={def} summaryLine={isMarket ? buildMarketHeroLine(item) : null} />
```

`<main>` 안 `<AmenityInfo …/>` 바로 위에 추가한다(시안 순서: 한눈에 → 정보 → 품목).

```tsx
          {isMarket && <MarketOverview item={item} nowYear={new Date().getFullYear()} />}
```

`<SourceCaption ids={[AMENITY_SOURCE[def.slug]]} />` 바로 아래에 추가한다.

```tsx
          {isMarket && <MarketProducts item={item} />}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run tests/components/market-overview-ssr.test.ts tests/components/amenity-hero-ssr.test.ts && pnpm typecheck`
Expected: 전부 PASS, typecheck 오류 0

- [ ] **Step 5: 커밋**

```bash
git add "app/(public)/amenity/[category]/_components/market-overview.tsx" "app/(public)/amenity/[category]/_components/market-products.tsx" "app/(public)/amenity/[category]/_components/amenity-hero.tsx" "app/(public)/amenity/[category]/[id]/page.tsx" tests/components/market-overview-ssr.test.ts
git commit -m "feat(market): 전통시장 상세에 시장 한눈에·취급 품목 카드와 히어로 요약

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 6: e2e 시드와 상세 시나리오

**Files:**
- Modify: `tests/_helpers/seed-e2e.ts` (대형마트 시드 블록 다음)
- Create: `tests/e2e/amenity-market-detail.spec.ts`

**Interfaces:**
- Consumes: Task 2의 컬럼, Task 5의 화면 문구("시장 한눈에", "취급 품목", "4·9일장")

- [ ] **Step 1: 시드 추가**

`seed-e2e.ts`의 `e2e-mart-hyper-1` upsert 블록 바로 다음에 추가한다.

```ts
  // 전통시장 상세 e2e용 — 새 필드가 채워진 시장 1곳, 빈 시장 1곳(카드 숨김 검증)
  await prisma.traditionalMarket.upsert({
    where: { sourceId: 'e2e-market-filled' },
    create: {
      sourceId: 'e2e-market-filled',
      name: 'e2e 장날시장',
      address: '서울특별시 서초구 서초동',
      sigunguCode: '11650',
      marketType: '상설장+4일장',
      storeCount: 64,
      openCycle: '4일+9일',
      establishedYear: 1955,
      products: '농산물+축산물+수산물',
      hasParking: true,
      hasToilet: true,
      tel: '02-000-0000',
      referenceDate: new Date('2025-11-10T00:00:00Z'),
    },
    update: {},
  });
  await prisma.traditionalMarket.upsert({
    where: { sourceId: 'e2e-market-empty' },
    create: {
      sourceId: 'e2e-market-empty',
      name: 'e2e 빈시장',
      address: '서울특별시 서초구 서초동',
      sigunguCode: '11650',
    },
    update: {},
  });
```

- [ ] **Step 2: e2e 작성**

```ts
// tests/e2e/amenity-market-detail.spec.ts
import { test, expect } from '@playwright/test';

test.describe('전통시장 상세 보강', () => {
  test('채워진 시장: 히어로 요약, 시장 한눈에, 취급 품목', async ({ page }) => {
    await page.goto(`/amenity/market?q=${encodeURIComponent('e2e 장날시장')}`);
    await page.getByRole('link', { name: /e2e 장날시장/ }).first().click();

    await expect(page.getByText('1955년 개설 · 점포 64곳 · 4·9일 장날')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '시장 한눈에' })).toBeVisible();
    await expect(page.getByText('매월 4·9·14·19·24·29일')).toBeVisible();
    await expect(page.getByRole('heading', { name: '취급 품목' })).toBeVisible();
    await expect(page.getByText('축산물', { exact: true })).toBeVisible();
  });

  test('빈 시장: 새 카드 없이 기본 정보만', async ({ page }) => {
    await page.goto(`/amenity/market?q=${encodeURIComponent('e2e 빈시장')}`);
    await page.getByRole('link', { name: /e2e 빈시장/ }).first().click();

    await expect(page.getByRole('heading', { name: '전통시장 정보' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '시장 한눈에' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '취급 품목' })).toHaveCount(0);
  });
});
```

- [ ] **Step 3: 실행**

Run: `pnpm seed:e2e && pnpm test:e2e:local tests/e2e/amenity-market-detail.spec.ts tests/e2e/amenity-mart.spec.ts tests/e2e/sibling-tabs.spec.ts`
Expected: 전부 PASS (모바일 프로젝트 포함)

목록 카드 링크 이름이 `/e2e 장날시장/`로 잡히지 않으면 `tests/e2e/amenity-mart.spec.ts`처럼 `page.locator('a:has(article)').first()`로 바꾼다.

- [ ] **Step 4: 커밋**

```bash
git add tests/_helpers/seed-e2e.ts tests/e2e/amenity-market-detail.spec.ts
git commit -m "test(e2e): 전통시장 상세 보강 시나리오

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc"
```

---

### Task 7: 전체 게이트, 실데이터 QA, PR

**Files:** 없음 (검증·PR만)

- [ ] **Step 1: 전체 게이트**

Run: `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`
Expected: lint 경고·오류 0, 테스트 전부 PASS, `next build` 성공

- [ ] **Step 2: 실데이터 QA** (운영 DB 읽기 전용 터널, 메모리 `feedback-readonly-tunnel-qa` 절차)

`.env.qa.local`(커밋 금지 파일)로 로컬 dev를 띄우고, 운영 DB에는 아직 새 컬럼이 없으므로 **이 단계는 머지 후 배포·수동 수집 뒤로 미룬다.** 머지 전에는 Task 2 Step 8의 로컬 실수집 DB로 `pnpm dev` 후 아래 3곳을 눈으로 확인한다.
- 장호원전통시장(4일+9일, 홈페이지 있음)
- 사기막골도자기시장(매일, 주차장 없음)
- 홈페이지·전화가 없는 시장 1곳(행이 사라지는지)

- [ ] **Step 3: PR 생성**

```bash
git push -u origin feat/amenity-enrich-market
gh pr create --base main --title "feat: 전통시장 상세 보강 (생활시설 보강 PR 1)" --body "$(cat <<'EOF'
## 요약
- 전국전통시장표준데이터에서 버리던 9개 필드 저장(nullable, 마이그레이션 1개)
- 전통시장 상세: 히어로 요약, 시장 한눈에(점포 수·개설·장날·방문 편의), 취급 품목, 정보 행 추가
- 빈 값은 행·카드를 숨김("-" 행 제거)
- 어댑터 공용 파싱 헬퍼 추출(공원·주차장 어댑터 리팩터, 동작 동일)

스펙: docs/superpowers/specs/2026-10-01-amenity-detail-enrichment-design.md

## 배포 후 할 일
- 박스에서 `traditional-market` source 1회 수동 수집
- `IngestionRun` OK, non-null 비율 확인(점포 수·주기·품목 ≈100%, 전화 ≈61%)

## 테스트
- 단위·SSR: 파서 경계 사례, 장날 파싱, 빈 값 숨김
- e2e: 채워진 시장/빈 시장
- 로컬 실수집(1,393곳) 채움률 확인

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CYs4KqraLU7iLhAYmVjctc
EOF
)"
```

- [ ] **Step 4: 머지 후 운영 수집** (사용자 확인 후 실행)

박스에서:
```bash
cd /opt/imjang && docker compose run --rm etl pnpm tsx scripts/ingest/amenities/runner.ts --source=traditional-market
```
그 다음 읽기 전용 쿼리로 Task 2 Step 8의 채움률 쿼리를 운영 DB에 실행하고, 결과를 PR 코멘트로 남긴다.

---

## 후속 계획 (별도 문서로 작성)

PR 1이 머지되면 확정된 패턴(공용 헬퍼, `detailFields` null 생략, 카드 컴포넌트 구조)을 기준으로 다음 계획을 각각 쓴다.

| 계획 | 범위 | 선행 조건 |
|---|---|---|
| PR 2 | 공원 필드 + `ParkFacilities` + 히어로 축구장 환산 | PR 1 머지 |
| PR 3 | 학교 schoolInfo 필드 | PR 1 머지 |
| PR 4 | Store 필드 + 같은 건물 시설 | **10/31까지 배포** |
| PR 5 | EV 충전소 | 채움률 실측, 한도 초과 원인 확인 |
| PR 6 | 계산값 묶음 | PR 2·4 머지 |
