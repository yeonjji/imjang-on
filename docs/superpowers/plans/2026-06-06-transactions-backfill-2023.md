# 실거래가 역사 구간 백필 (2023-01 → 2025-05) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2023-01~2025-05(29개월) 6종 실거래/전월세 데이터를, 공공API quota·Supabase 디스크 제약을 지키며 매시간 cron으로 안전하게 백필한다.

**Architecture:** 기존 `transactions/runner.ts`(backfill 모드 + resume + `--limit`)에 명시적 구간(`--from`/`--to`)을 추가하고, API quota 초과 응답(resultCode 22 / 레거시 게이트웨이 에러)을 에러로 승격하는 guard를 `xml-parse.ts`에 넣어 "조용한 0건 OK 마킹"을 막는다. 신규 매시간 cron 워크플로가 API당 1개월치(`--limit=261`)씩 resume로 이어 달려 완주한다.

**Tech Stack:** TypeScript, tsx, Prisma, Vitest, GitHub Actions, 공공데이터포털 RTMSData API.

---

## File Structure

| File | 책임 |
|------|------|
| `scripts/ingest/transactions/months.ts` (신규) | `getRangeMonths(from,to)` — 구간 월 목록(최신→과거). 순수 함수. runner·status 공용. |
| `scripts/ingest/xml-parse.ts` (수정) | `QuotaExceededError`, `assertNormalResponse` 추가 — 표준/레거시 두 에러 envelope 검증. |
| `scripts/ingest/transactions/runner.ts` (수정) | `--from`/`--to` 파싱, `getRangeMonths` 사용, `fetchAll`에서 guard 호출. |
| `scripts/ingest/transactions/backfill-status.ts` (신규) | 구간 pending 타깃 수 계산 + `$GITHUB_OUTPUT`에 `pending=N` 출력. |
| `.github/workflows/backfill-transactions-loop.yml` (신규) | 매시간 cron, API 매트릭스, pending=0이면 skip. |
| `tests/ingest/months.test.ts` (신규) | `getRangeMonths` 단위 테스트. |
| `tests/ingest/xml-parse.test.ts` (수정) | guard 단위 테스트(표준 22 / 레거시 22 / 정상 빈 응답 / 정상). |

---

## Task 1: 구간 월 목록 함수 `getRangeMonths`

**Files:**
- Create: `scripts/ingest/transactions/months.ts`
- Test: `tests/ingest/months.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ingest/months.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getRangeMonths } from '@/scripts/ingest/transactions/months';

describe('getRangeMonths', () => {
  it('to부터 from까지 최신→과거 내림차순으로 YYYYMM 목록 생성', () => {
    expect(getRangeMonths('202403', '202406')).toEqual(['202406', '202405', '202404', '202403']);
  });

  it('연도 경계를 넘어 내려간다', () => {
    expect(getRangeMonths('202211', '202301')).toEqual(['202301', '202212', '202211']);
  });

  it('from === to면 단일 월', () => {
    expect(getRangeMonths('202505', '202505')).toEqual(['202505']);
  });

  it('전체 백필 구간은 29개월', () => {
    const months = getRangeMonths('202301', '202505');
    expect(months.length).toBe(29);
    expect(months[0]).toBe('202505');
    expect(months[months.length - 1]).toBe('202301');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/ingest/months.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/ingest/transactions/months"`.

- [ ] **Step 3: Write minimal implementation**

`scripts/ingest/transactions/months.ts`:

```ts
// 'YYYYMM' 구간 [from, to]를 최신(to) → 과거(from) 내림차순 목록으로 반환.
// 백필을 기존 데이터에 인접한 월부터 채워, 차트가 과거로 점진 확장되도록 한다.
export function getRangeMonths(from: string, to: string): string[] {
  const fromY = Number(from.slice(0, 4));
  const fromM = Number(from.slice(4, 6));
  let y = Number(to.slice(0, 4));
  let m = Number(to.slice(4, 6));
  const out: string[] = [];
  while (y > fromY || (y === fromY && m >= fromM)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/ingest/months.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/transactions/months.ts tests/ingest/months.test.ts
git commit -m "feat(ingest): add getRangeMonths for explicit backfill range"
```

---

## Task 2: 공공API 에러 응답 guard (`assertNormalResponse`)

배경: `getItems()`는 item이 없으면 `[]`를, `getTotalCount()`는 `0`을 반환한다. 공공데이터포털은 quota 초과/인증 에러를 **HTTP 200**으로 내려보내는데, 두 가지 envelope이 있다.
1. 표준: `<response><header><resultCode>22</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg></header>`
2. 레거시 게이트웨이: `<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>`

둘 다 `getItems()`가 `[]`라서, guard가 없으면 `runOne`이 해당 시군구-월을 **OK / 0건**으로 마킹 → resume가 영구 스킵(조용한 유실). guard는 비정상 코드에서 throw해 run을 ERROR로 만들고 다음 패스 재시도를 유도한다.

**Files:**
- Modify: `scripts/ingest/xml-parse.ts`
- Test: `tests/ingest/xml-parse.test.ts:1-28` (기존 파일에 케이스 추가)

- [ ] **Step 1: Write the failing tests**

`tests/ingest/xml-parse.test.ts`에 import와 describe 블록을 추가한다. 파일 상단 import를 다음으로 교체:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseXml,
  getItems,
  getTotalCount,
  assertNormalResponse,
  QuotaExceededError,
} from '@/scripts/ingest/xml-parse';
```

파일 맨 끝(기존 `describe('xml-parse', ...)` 블록 다음)에 추가:

```ts
describe('assertNormalResponse', () => {
  it('정상 응답(resultCode 00)은 통과', () => {
    const xml = `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).not.toThrow();
  });

  it('header 없는 빈 응답도 통과(정상 0건과 구분)', () => {
    const xml = `<response><body><totalCount>0</totalCount><items/></body></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).not.toThrow();
  });

  it('표준 quota 초과(resultCode 22)는 QuotaExceededError', () => {
    const xml = `<response><header><resultCode>22</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg></header></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(QuotaExceededError);
  });

  it('레거시 게이트웨이 quota 초과(returnReasonCode 22)도 QuotaExceededError', () => {
    const xml = `<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(QuotaExceededError);
  });

  it('기타 비정상 코드는 일반 Error', () => {
    const xml = `<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR</resultMsg></header></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(/resultCode=30/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/ingest/xml-parse.test.ts`
Expected: FAIL — `assertNormalResponse`/`QuotaExceededError` are not exported.

- [ ] **Step 3: Add implementation to `xml-parse.ts`**

`scripts/ingest/xml-parse.ts` 맨 끝에 추가(기존 export는 그대로):

```ts
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

const NORMAL_CODES = new Set(['00']);

// 공공데이터포털 응답의 에러 코드를 검증한다. 비정상이면 throw하여
// runOne이 해당 run을 ERROR로 마킹 → resume가 다음 패스에서 재시도하도록 한다.
// (정상 0건은 header.resultCode=00 이므로 통과 → 그대로 done 처리됨)
export function assertNormalResponse(parsed: Record<string, unknown>): void {
  const root = parsed as any;

  // 1) 레거시 게이트웨이 에러: <OpenAPI_ServiceResponse><cmmMsgHeader>...
  const cmm = root?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm) {
    const code = cmm.returnReasonCode != null ? String(cmm.returnReasonCode).padStart(2, '0') : '';
    const msg = String(cmm.returnAuthMsg ?? cmm.errMsg ?? '');
    if (code === '22' || /LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(msg)) {
      throw new QuotaExceededError(`API quota exceeded (returnReasonCode=${code}, ${msg})`);
    }
    throw new Error(`API gateway error (returnReasonCode=${code}, ${msg})`);
  }

  // 2) 표준 응답: <response><header><resultCode>...
  const header = root?.response?.header;
  if (header && header.resultCode != null) {
    const code = String(header.resultCode).padStart(2, '0');
    if (!NORMAL_CODES.has(code)) {
      const msg = String(header.resultMsg ?? '');
      if (code === '22') {
        throw new QuotaExceededError(`API quota exceeded (resultCode=${code}, ${msg})`);
      }
      throw new Error(`API error (resultCode=${code}, ${msg})`);
    }
  }
}
```

> 주의: fast-xml-parser(`parseTagValue: true`)는 `<resultCode>00</resultCode>`를 숫자 `0`으로 파싱한다. `String(0).padStart(2,'0') === '00'`이므로 정상 코드는 통과한다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run tests/ingest/xml-parse.test.ts`
Expected: PASS — 기존 3개 + 신규 5개 = 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/xml-parse.ts tests/ingest/xml-parse.test.ts
git commit -m "feat(ingest): guard against API error/quota envelopes in responses"
```

---

## Task 3: runner에 `--from`/`--to` + guard 연결

**Files:**
- Modify: `scripts/ingest/transactions/runner.ts`

이 태스크는 통합 배선이라 단위 테스트 대신 타입체크로 검증한다. (핵심 순수 로직 `getRangeMonths`·`assertNormalResponse`는 Task 1·2에서 테스트 완료.)

- [ ] **Step 1: import 추가**

`runner.ts:18` (`import { createHash } ...` 다음 줄)에 추가:

```ts
import { getRangeMonths } from './months';
import { parseXml, assertNormalResponse } from '@/scripts/ingest/xml-parse';
```

- [ ] **Step 2: `RunArgs`에 from/to 추가**

`runner.ts:29-35`의 인터페이스를 교체:

```ts
interface RunArgs {
  api: ApiType | 'all';
  mode: Mode;
  months: number;
  monthOffset?: number;
  limit?: number;
  from?: string;
  to?: string;
}
```

- [ ] **Step 3: `parseArgs`에서 from/to 파싱**

`runner.ts:45`의 `return { api, mode, months, monthOffset, limit };`를 교체:

```ts
  const from = get('from');
  const to = get('to');
  return { api, mode, months, monthOffset, limit, from, to };
```

- [ ] **Step 4: 월 목록 선택에 구간 우선 적용**

`runner.ts:51-56`의 months 계산을 교체:

```ts
  const months =
    args.mode === 'daily'
      ? getDailyMonths()
      : args.from && args.to
        ? getRangeMonths(args.from, args.to)
        : args.monthOffset !== undefined
          ? [getMonthByOffset(args.monthOffset)]
          : getBackfillMonths(args.months);
```

- [ ] **Step 5: `fetchAll`에서 guard 호출**

`runner.ts:250-257` 영역, `const xml = await fetchPage({ ... });` 직후·`adapter.parseRows` 호출 직전에 한 줄 추가. 해당 while 루프 본문을 다음으로 교체:

```ts
    const xml = await fetchPage({
      operation: adapter.endpoint,
      lawdCd: sigungu,
      dealYmd: yyyymm,
      pageNo,
      numOfRows: 1000,
    });
    assertNormalResponse(parseXml(xml));
    const { rows, totalCount } = adapter.parseRows(xml, sigungu);
```

- [ ] **Step 6: 타입체크로 검증**

Run: `npx tsc --noEmit 2>&1 | head -30; echo "=== exit: $? ==="`
Expected: 신규 에러 없음, `exit: 0`.

- [ ] **Step 7: 기존 ingest 테스트 회귀 확인**

Run: `pnpm exec vitest run tests/ingest/`
Expected: 전부 PASS (months 4 + xml-parse 8 + resume + adapter + property-matcher 등 기존 통과 유지).

- [ ] **Step 8: Commit**

```bash
git add scripts/ingest/transactions/runner.ts
git commit -m "feat(ingest): support --from/--to range and apply response guard in backfill"
```

---

## Task 4: 백필 진행도 스크립트 `backfill-status.ts`

워크플로의 매시간 패스가 "남은 타깃이 있을 때만" runner를 돌리고, 0이면 skip하도록 pending 수를 계산한다. `getRangeMonths`를 재사용(DRY)한다.

**Files:**
- Create: `scripts/ingest/transactions/backfill-status.ts`

- [ ] **Step 1: 스크립트 작성**

`scripts/ingest/transactions/backfill-status.ts`:

```ts
import { appendFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { getRangeMonths } from './months';
import type { ApiType } from '@/scripts/ingest/types';

const SOURCE_BY_API: Record<ApiType, string> = {
  'apt-trade': 'molit-apt-trade',
  'apt-rent': 'molit-apt-rent',
  'offi-trade': 'molit-offi-trade',
  'offi-rent': 'molit-offi-rent',
  'rh-trade': 'molit-rh-trade',
  'rh-rent': 'molit-rh-rent',
};

function arg(key: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${key}=`))?.split('=')[1];
}

async function main() {
  const api = arg('api') as ApiType | undefined;
  const from = arg('from');
  const to = arg('to');
  if (!api || !SOURCE_BY_API[api] || !from || !to) {
    throw new Error('usage: backfill-status.ts --api=<apiType> --from=YYYYMM --to=YYYYMM');
  }
  const source = SOURCE_BY_API[api];
  const months = getRangeMonths(from, to);
  const monthSet = new Set(months);

  const sigunguCount = await prisma.region.count({ where: { level: 2, isAbolished: false } });
  const expected = sigunguCount * months.length;

  const okRuns = await prisma.ingestionRun.findMany({
    where: { source, status: 'OK' },
    select: { targetKey: true },
  });
  const okInRange = new Set<string>();
  for (const r of okRuns) {
    const m = r.targetKey.split('-')[1];
    if (monthSet.has(m)) okInRange.add(r.targetKey);
  }

  const pending = Math.max(0, expected - okInRange.size);
  console.log(`source=${source} months=${months.length} expected=${expected} ok=${okInRange.size} pending=${pending}`);

  // GitHub Actions step output (워크플로의 조건부 실행용)
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `pending=${pending}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | head -30; echo "=== exit: $? ==="`
Expected: 신규 에러 없음, `exit: 0`.

- [ ] **Step 3: 로컬 수동 실행으로 출력 형태 확인 (운영 DB, 읽기 전용)**

Run: `pnpm exec dotenv -e .env.local -- tsx scripts/ingest/transactions/backfill-status.ts --api=apt-trade --from=202301 --to=202505`
Expected: `source=molit-apt-trade months=29 expected=7569 ok=0 pending=7569` 형태의 한 줄 (ok 값은 현재 백필 진행 정도에 따라 달라짐; 시작 전이면 0).

> 261 시군구 × 29개월 = 7,569. `ok`는 아직 백필 전이면 0이어야 한다(현 데이터는 2025-06 이후라 구간 밖).

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest/transactions/backfill-status.ts
git commit -m "feat(ingest): add backfill-status script for range pending count"
```

---

## Task 5: 매시간 cron 워크플로

**Files:**
- Create: `.github/workflows/backfill-transactions-loop.yml`

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/backfill-transactions-loop.yml`:

```yaml
name: backfill-transactions-loop
on:
  schedule:
    - cron: '7 * * * *'  # 매시간 :07 (daily ingest 15·19시와 분 단위로 분리)
  workflow_dispatch:

concurrency:
  group: backfill-transactions-loop
  cancel-in-progress: false

env:
  BACKFILL_FROM: '202301'
  BACKFILL_TO: '202505'
  BACKFILL_LIMIT: '261'  # API job당 ≈1개월치 시군구

jobs:
  backfill:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        api: [apt-trade, apt-rent, offi-trade, offi-rent, rh-trade, rh-rent]
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      DIRECT_URL: ${{ secrets.DIRECT_URL }}
      PUBLIC_DATA_KEY: ${{ secrets.PUBLIC_DATA_KEY }}
      KAKAO_REST_KEY: ${{ secrets.KAKAO_REST_KEY }}
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
      - id: check
        run: pnpm tsx scripts/ingest/transactions/backfill-status.ts --api=${{ matrix.api }} --from=${{ env.BACKFILL_FROM }} --to=${{ env.BACKFILL_TO }}
      - if: ${{ steps.check.outputs.pending != '0' }}
        run: pnpm tsx scripts/ingest/transactions/runner.ts --api=${{ matrix.api }} --mode=backfill --from=${{ env.BACKFILL_FROM }} --to=${{ env.BACKFILL_TO }} --limit=${{ env.BACKFILL_LIMIT }}
        timeout-minutes: 350
```

- [ ] **Step 2: YAML 파싱 검증**

Run: `pnpm exec tsx -e "import {readFileSync} from 'node:fs'; import YAML from 'yaml'; YAML.parse(readFileSync('.github/workflows/backfill-transactions-loop.yml','utf8')); console.log('YAML OK')"`
Expected: `YAML OK`. (`yaml` 패키지가 없으면 실패 — 그 경우 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/backfill-transactions-loop.yml')); print('YAML OK')"` 사용.)

- [ ] **Step 3: 워크플로 내용 검수 (수동 체크리스트)**

확인:
- `check` step이 `pending`을 `$GITHUB_OUTPUT`에 쓰고, 다음 step의 `if`가 `steps.check.outputs.pending != '0'`로 참조.
- 매트릭스 6개 API가 `backfill-transactions.yml`과 동일한 source 매핑.
- `concurrency.cancel-in-progress: false` — 패스 간 겹침 방지.
- secrets 키가 기존 `ingest-transactions-daily.yml`와 동일.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/backfill-transactions-loop.yml
git commit -m "feat(ci): hourly backfill-transactions-loop workflow (2023-01~2025-05)"
```

---

## Task 6: 운영 준비 & 검증 계획 (문서/실행 단계)

코드 변경 아님. 머지 후 운영자가 수행.

- [ ] **Step 1: 사전 점검 — Supabase 디스크 여유**

현재 ~1.65M rows. 백필로 +3~4M rows 예상(총 ~5–6M). Supabase 대시보드에서 디스크 사용량/플랜 한도 확인. 여유 부족 시 플랜 상향 후 시작.

- [ ] **Step 2: 첫 패스 수동 트리거**

GitHub → Actions → `backfill-transactions-loop` → Run workflow. 6개 매트릭스 job 로그에서:
- `check` step: `pending=7569`(또는 진행 후 감소값) 출력.
- runner step: `runner done` 요약 `{ totalUpserted, skipped, failed }`. `failed`가 크면(특히 `QuotaExceededError`) quota 소진 — 정상 동작(다음 패스 재시도).

- [ ] **Step 3: 진행 모니터링 (매시간 자동)**

하루 뒤 임의 API로 진행도 확인:

Run: `pnpm exec dotenv -e .env.local -- tsx scripts/ingest/transactions/backfill-status.ts --api=apt-trade --from=202301 --to=202505`
Expected: `pending` 값이 패스마다 감소.

- [ ] **Step 4: 완주 확인 & cron 제거**

6개 API 모두 `pending=0`이면(각 API status 스크립트로 확인) 완주. 최종 검증:

Run: `pnpm exec dotenv -e .env.local -- tsx /tmp/coverage.ts` (또는 동등 쿼리로 `transaction._min.contractDate` 확인)
Expected: `min contractDate`가 `2023-01-01`로 내려감.

완주 후 `.github/workflows/backfill-transactions-loop.yml`의 `schedule:` 블록을 제거(또는 워크플로 파일 삭제)하여 매시간 no-op을 멈춘다.

```bash
git rm .github/workflows/backfill-transactions-loop.yml
git commit -m "chore(ci): remove backfill-transactions-loop after 2023 backfill complete"
```

---

## Self-Review Notes

- **Spec coverage**: §2 runner(--from/--to, 최신→과거)=Task 1·3 / §2-1 result-code guard(표준+레거시)=Task 2·3 / §3 cron 워크플로(매시간, limit=261, pending=0 skip)=Task 4·5 / §4 검증·리스크(pending=0, 디스크, quota)=Task 6. 전 항목 매핑됨.
- **Spec과의 의도적 차이**: 스펙 §3은 완주 시 Discord notify를 언급했으나, 매시간 6개 job이 반복 알림을 보내면 스팸이 된다. 대신 `pending=0`일 때 runner를 **skip**하고(저비용 no-op), 완주는 `backfill-status` 출력/Actions 로그로 확인 후 cron을 수동 제거하는 방식으로 단순화함(Task 5·6). runner 자체의 per-run notify는 유지.
- **Type 일관성**: `getRangeMonths(from,to)`·`assertNormalResponse(parsed)`·`QuotaExceededError`·`SOURCE_BY_API` 이름이 Task 1·2·3·4 전반에서 일치. source 매핑은 어댑터의 `source` 값(`molit-*`)과 동일.
- **Placeholder 없음**: 모든 코드/명령/기대값 명시.
