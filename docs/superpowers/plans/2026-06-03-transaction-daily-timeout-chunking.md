# transaction-daily 타임아웃 해결 (resume 복구 + 청크 분산) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** daily 인제스트가 매 실행마다 458개 타깃을 처음부터 전부 재처리해 2시간 타임아웃 나는 문제를, "오늘(KST) 완료분 스킵 + 하루 여러 패스 청크 분산"으로 해결한다.

**Architecture:** resume 결정 로직을 `runner.ts`의 `main()` 안 인라인에서 순수 함수 모듈(`resume.ts`)로 추출해 단위 테스트 가능하게 만든다. daily 모드는 `IngestionRun.finishedAt >= 오늘 0시(KST)` 인 완료분만 `doneKeys`로 스킵하고, 날짜가 바뀌면 전체 재처리(self-heal 유지). 워크플로는 `--limit=150` + 하루 5회 cron으로 청크를 누적 완주시킨다.

**Tech Stack:** TypeScript, Vitest, Prisma, GitHub Actions.

---

## File Structure

- **Create** `scripts/ingest/transactions/resume.ts` — resume 결정 순수 함수(`kstMidnightUtc`, `doneRunFilter`, `buildDoneKeys`). DB·IO 없음.
- **Create** `tests/ingest/resume.test.ts` — 위 순수 함수 단위 테스트.
- **Modify** `scripts/ingest/transactions/runner.ts` — `reprocessMonths` 인라인 로직 제거하고 `resume.ts` 사용.
- **Modify** `.github/workflows/ingest-transactions-daily.yml` — `--limit`, `timeout-minutes`, `cron`, concurrency group.

설계 근거: `runner.ts`는 모듈 로드 시 `main()`을 즉시 실행하므로 테스트에서 import 불가. resume 로직을 별도 모듈로 빼야 단위 테스트가 가능하다.

---

### Task 1: `resume.ts` — KST 자정(UTC 환산) 순수 함수

**Files:**
- Create: `scripts/ingest/transactions/resume.ts`
- Test: `tests/ingest/resume.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ingest/resume.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { kstMidnightUtc } from '@/scripts/ingest/transactions/resume';

describe('kstMidnightUtc', () => {
  it('KST 오전(UTC 같은 날)의 자정을 전날 15:00 UTC로 환산', () => {
    // 2026-06-03T10:00:00Z = KST 2026-06-03 19:00 → KST 자정 = 2026-06-02T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-03T10:00:00Z')).toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });

  it('UTC가 다음날로 넘어가도 같은 KST 날짜면 동일 자정', () => {
    // 2026-06-03T14:00:00Z = KST 2026-06-03 23:00 → KST 자정 = 2026-06-02T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-03T14:00:00Z')).toISOString()).toBe('2026-06-02T15:00:00.000Z');
  });

  it('KST 자정 직전(UTC 14:59:59)은 전 KST 날짜의 자정', () => {
    // 2026-06-02T14:59:59Z = KST 2026-06-02 23:59:59 → KST 자정 = 2026-06-01T15:00:00Z
    expect(kstMidnightUtc(new Date('2026-06-02T14:59:59Z')).toISOString()).toBe('2026-06-01T15:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/ingest/resume.test.ts`
Expected: FAIL — `Failed to resolve import "@/scripts/ingest/transactions/resume"` (모듈 없음).

- [ ] **Step 3: Write minimal implementation**

`scripts/ingest/transactions/resume.ts`:

```ts
// 서버는 UTC로 동작. 오늘 0시(KST)에 해당하는 UTC 시각을 구한다.
// KST = UTC+9 이므로, KST 날짜의 자정은 UTC로는 그 전날 15:00.
export function kstMidnightUtc(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/ingest/resume.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/transactions/resume.ts tests/ingest/resume.test.ts
git commit -m "feat(ingest): KST 자정 UTC 환산 순수 함수 추가"
```

---

### Task 2: `resume.ts` — doneRunFilter + buildDoneKeys

**Files:**
- Modify: `scripts/ingest/transactions/resume.ts`
- Test: `tests/ingest/resume.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ingest/resume.test.ts` 에 import 추가 후 describe 블록 추가:

```ts
import { kstMidnightUtc, doneRunFilter, buildDoneKeys } from '@/scripts/ingest/transactions/resume';
```

```ts
describe('doneRunFilter', () => {
  it('daily 모드는 오늘(KST) 자정 이후 완료분만 조회하도록 finishedAt 하한 반환', () => {
    const now = new Date('2026-06-03T10:00:00Z');
    expect(doneRunFilter('daily', now)).toEqual({ finishedAt: { gte: new Date('2026-06-02T15:00:00Z') } });
  });

  it('backfill 모드는 날짜 제한 없음(빈 객체)', () => {
    expect(doneRunFilter('backfill', new Date('2026-06-03T10:00:00Z'))).toEqual({});
  });
});

describe('buildDoneKeys', () => {
  it('source:targetKey 형태의 Set 생성', () => {
    const keys = buildDoneKeys([
      { source: 'apt-trade', targetKey: '11650-202606' },
      { source: 'apt-rent', targetKey: '11650-202605' },
    ]);
    expect(keys.has('apt-trade:11650-202606')).toBe(true);
    expect(keys.has('apt-rent:11650-202605')).toBe(true);
    expect(keys.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/ingest/resume.test.ts`
Expected: FAIL — `doneRunFilter is not a function` / `buildDoneKeys is not a function`.

- [ ] **Step 3: Write minimal implementation**

`scripts/ingest/transactions/resume.ts` 에 추가:

```ts
import type { Mode } from '@/scripts/ingest/types';

// daily: 오늘(KST) 완료분만 doneKeys 대상으로 조회 → 같은 날 패스끼리만 resume.
//        날짜가 바뀌면 어제 완료분은 제외되어 전체 재처리(self-heal).
// backfill: 제한 없음(누적 완료분 전체 스킵).
export function doneRunFilter(mode: Mode, now: Date): { finishedAt?: { gte: Date } } {
  return mode === 'daily' ? { finishedAt: { gte: kstMidnightUtc(now) } } : {};
}

export function buildDoneKeys(doneRuns: Array<{ source: string; targetKey: string }>): Set<string> {
  return new Set(doneRuns.map((r) => `${r.source}:${r.targetKey}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/ingest/resume.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/transactions/resume.ts tests/ingest/resume.test.ts
git commit -m "feat(ingest): daily resume 필터·doneKeys 빌더 추가"
```

---

### Task 3: `runner.ts` — resume.ts 적용, reprocessMonths 제거

**Files:**
- Modify: `scripts/ingest/transactions/runner.ts:72-83`

기존 코드(제거 대상):

```ts
  const doneRuns = await prisma.ingestionRun.findMany({
    where: { source: { in: sources }, status: 'OK' },
    select: { source: true, targetKey: true },
  });
  // daily 모드에서 이번달·전달 모두 항상 재처리 — DB 복원 등으로 전달 데이터에 구멍이 생겨도 자동 보완
  const reprocessMonths = args.mode === 'daily' ? new Set(getDailyMonths()) : null;
  const doneKeys = new Set(
    doneRuns
      .filter((r) => !reprocessMonths || !Array.from(reprocessMonths).some((m) => r.targetKey.endsWith(`-${m}`)))
      .map((r) => `${r.source}:${r.targetKey}`),
  );
  logger.info({ skippable: doneKeys.size }, 'resume: loaded completed keys');
```

- [ ] **Step 1: import 추가**

`runner.ts` 상단 import 블록(다른 `./` import들 근처)에 추가:

```ts
import { doneRunFilter, buildDoneKeys } from './resume';
```

- [ ] **Step 2: doneRuns 조회 + doneKeys 생성 교체**

위 "제거 대상" 블록 전체를 아래로 교체:

```ts
  const doneRuns = await prisma.ingestionRun.findMany({
    where: { source: { in: sources }, status: 'OK', ...doneRunFilter(args.mode, new Date()) },
    select: { source: true, targetKey: true },
  });
  // daily: 오늘(KST) 완료분만 스킵 → 날짜가 바뀌면 이번달·전달 전체 재처리(self-heal 유지)
  const doneKeys = buildDoneKeys(doneRuns);
  logger.info({ skippable: doneKeys.size }, 'resume: loaded completed keys');
```

- [ ] **Step 3: 미사용 심볼 확인**

`getDailyMonths`는 `getDailyMonths()`가 `months` 산출(`runner.ts:51`)과 `reprocessMonths`에서 쓰였음. reprocessMonths 제거 후에도 `months` 산출에서 여전히 사용되므로 **함수는 그대로 둔다**. 다른 미사용 import 없음.

- [ ] **Step 4: 타입체크 + 기존 단위 테스트**

Run: `pnpm typecheck`
Expected: 에러 없음.

Run: `pnpm exec vitest run tests/ingest/resume.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest/transactions/runner.ts
git commit -m "fix(ingest): daily가 오늘 완료분만 스킵하도록 resume 적용"
```

---

### Task 4: 워크플로 청크·스케줄 변경

**Files:**
- Modify: `.github/workflows/ingest-transactions-daily.yml`

- [ ] **Step 1: cron + concurrency 변경**

상단 `on:` 블록을 아래로 교체:

```yaml
on:
  schedule:
    - cron: '0 15,18,21,0,3 * * *'  # KST 00·03·06·09·12, 3시간 간격 5회
  workflow_dispatch:

concurrency:
  group: ingest-transactions-daily
  cancel-in-progress: false
```

- [ ] **Step 2: 실행 스텝의 limit + timeout 변경**

마지막 run 스텝을 아래로 교체:

```yaml
      - run: pnpm tsx scripts/ingest/transactions/runner.ts --api=${{ matrix.api }} --mode=daily --limit=150
        timeout-minutes: 90
```

- [ ] **Step 3: YAML 유효성 확인**

Run: `pnpm exec js-yaml .github/workflows/ingest-transactions-daily.yml > /dev/null && echo OK`
Expected: `OK` (파싱 성공). js-yaml 미설치 시: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ingest-transactions-daily.yml')); print('OK')"`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ingest-transactions-daily.yml
git commit -m "ci(ingest): daily를 --limit=150 + 하루 5회 cron으로 청크 분산"
```

---

### Task 5: 로컬 resume 동작 검증 (수동)

코드가 아닌 동작 검증. 로컬 docker DB(`.env.local`/`.env.test`의 로컬 호스트)에서 수행 — 운영 DB 금지(`assert-local-db` 가드 참고).

- [ ] **Step 1: 1차 소량 실행**

Run: `pnpm dotenv -e .env.local -- tsx scripts/ingest/transactions/runner.ts --api=offi-trade --mode=daily --limit=5`
Expected 로그: `tasks to run this pass` 의 `pending: 5`, 끝에 `runner done` 의 `skipped` 작음.

- [ ] **Step 2: 2차 연속 실행 (resume 확인)**

같은 명령 재실행.
Expected: `resume: loaded completed keys` 의 `skippable >= 5`, 그리고 1차에서 OK된 5개 타깃이 이번엔 `skipped`로 잡혀 `pending`이 줄어듦.

- [ ] **Step 3: 결과 기록**

resume가 같은 KST 날짜 내에서 완료분을 건너뛰는 것을 확인했으면 완료. (날짜 경계 self-heal은 `kstMidnightUtc` 단위 테스트로 커버됨.)

---

## 배포 후 검증 (머지 이후)

1. `workflow_dispatch`로 1패스 수동 실행 → 90분 내 종료, `IngestionRun` OK 기록, 부분 진행 확인.
2. 2~3일 모니터링: 6개 leg 전부 `success`, 하루 누적으로 458 완주, Discord 알림 정상.

---

## Self-Review

- **Spec 커버리지:** ① resume 조건 변경 → Task 1·2·3. ② 워크플로(`--limit`/timeout/cron/concurrency) → Task 4. ③ 검증 → Task 5 + 배포 후 검증. self-heal 유지는 `doneRunFilter`(daily만 날짜 하한) + 날짜 경계 테스트로 보장. 누락 없음.
- **플레이스홀더:** 없음. 모든 코드 스텝에 실제 코드/명령/기대출력 포함.
- **타입 일관성:** `kstMidnightUtc(now: Date): Date`, `doneRunFilter(mode: Mode, now: Date)`, `buildDoneKeys(rows): Set<string>` — Task 1·2 정의와 Task 3 사용처 시그니처 일치. `Mode`는 `@/scripts/ingest/types`에서 import(runner.ts와 동일 출처).
