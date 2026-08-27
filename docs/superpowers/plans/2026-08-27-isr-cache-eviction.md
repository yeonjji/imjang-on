# ISR 캐시 축출 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web 컨테이너를 재생성하지 않고 ISR 캐시를 상한 아래로 유지해, 디스크 포화와 그로 인한 502를 없앤다.

**Architecture:** 순수 계산(어떤 페이지를 지울지)과 파일시스템 IO를 분리한 Node ESM 스크립트를 만들고, `deploy/maintenance.sh`가 이를 컨테이너 안에서 실행한다. 컨테이너에는 node 20만 있고 tsx·typescript가 없으므로 실행 파일은 순수 `.mjs`이며, 타입은 인접 `.d.mts`로 선언해 vitest에서 테스트한다.

**Tech Stack:** Node 20 ESM (의존성 0), bash, vitest, docker exec/cp

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-27-isr-cache-eviction-design.md`
- 컨테이너(`imjang-web-1`) 런타임은 **node v20.20.2, 의존성 설치 불가**. 실행 스크립트는 외부 패키지를 import하지 않는다
- `tsconfig.json`의 `allowJs`는 **false**다. `.mjs`를 테스트에서 import하려면 인접 `.d.mts` 선언이 필요하다
- 빌드 산출물(이미지 Created 이전 mtime)은 절대 삭제하지 않는다. 기준선을 얻지 못하면 아무것도 지우지 않는다. (참고: 325개는 2026-08-27 컨테이너 StartedAt 기준 실측치다 — 기준선이 이미지 Created로 바뀌면서(재시작 무력화 대응) 정확한 수는 달라질 수 있고, Task 5에서 다시 잰다)
- 페이지 캐시는 `.html`·`.rsc`·`.meta` 3종이 한 벌이다. 반드시 함께 지운다(부분 삭제 금지)
- 그 3종 외 확장자는 mtime이 기준선 이후여도 건드리지 않는다
- 로그 접두사는 기존과 동일하게 `[maint] `를 쓴다
- 기본 상한 `ISR_MAX_GB=8`. env로 오버라이드 가능해야 한다
- 커밋 메시지는 한국어, `type(scope): 제목` 형식

---

### Task 1: 축출 계획 순수 함수

**Files:**
- Create: `scripts/ops/isr-prune/prune.mjs`
- Create: `scripts/ops/isr-prune/prune.d.mts`
- Test: `tests/ops/isr-prune.test.ts`

**Interfaces:**
- Produces: `planEviction({ pages, protectedBytes, maxBytes })` → `{ deleteKeys: string[]; freedBytes: number; remainingBytes: number }`
  - `pages`: `Array<{ key: string; bytes: number; atimeMs: number }>` — `key`는 확장자를 뺀 경로
  - 정렬은 `atimeMs` 오름차순(오래된 것 우선). 동률이면 `key` 사전순으로 결정적 순서를 만든다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ops/isr-prune.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planEviction } from '@/scripts/ops/isr-prune/prune.mjs';

describe('planEviction', () => {
  it('상한 아래면 아무것도 지우지 않는다', () => {
    const r = planEviction({
      pages: [{ key: 'a', bytes: 100, atimeMs: 1 }],
      protectedBytes: 50,
      maxBytes: 1000,
    });
    expect(r.deleteKeys).toEqual([]);
    expect(r.freedBytes).toBe(0);
    expect(r.remainingBytes).toBe(150);
  });

  it('atime이 오래된 페이지부터 지워 상한 아래로 내린다', () => {
    const r = planEviction({
      pages: [
        { key: 'new', bytes: 100, atimeMs: 300 },
        { key: 'old', bytes: 100, atimeMs: 100 },
        { key: 'mid', bytes: 100, atimeMs: 200 },
      ],
      protectedBytes: 0,
      maxBytes: 150,
    });
    expect(r.deleteKeys).toEqual(['old', 'mid']);
    expect(r.freedBytes).toBe(200);
    expect(r.remainingBytes).toBe(100);
  });

  it('상한 아래로 내려가면 즉시 멈춘다', () => {
    const r = planEviction({
      pages: [
        { key: 'a', bytes: 100, atimeMs: 1 },
        { key: 'b', bytes: 100, atimeMs: 2 },
        { key: 'c', bytes: 100, atimeMs: 3 },
      ],
      protectedBytes: 0,
      maxBytes: 250,
    });
    expect(r.deleteKeys).toEqual(['a']);
  });

  // 보호 대상만으로 상한을 넘으면 지울 수 있는 건 다 지우되 그 이상은 못 한다.
  it('보호 용량이 상한을 넘으면 후보를 전부 지우고 멈춘다', () => {
    const r = planEviction({
      pages: [{ key: 'a', bytes: 100, atimeMs: 1 }],
      protectedBytes: 500,
      maxBytes: 200,
    });
    expect(r.deleteKeys).toEqual(['a']);
    expect(r.remainingBytes).toBe(500);
  });

  // atime 동률에서 순서가 흔들리면 재실행마다 결과가 달라져 검증이 불가능해진다.
  it('atime이 같으면 key 사전순으로 결정적이다', () => {
    const r = planEviction({
      pages: [
        { key: 'b', bytes: 100, atimeMs: 5 },
        { key: 'a', bytes: 100, atimeMs: 5 },
      ],
      protectedBytes: 0,
      maxBytes: 100,
    });
    expect(r.deleteKeys).toEqual(['a']);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run tests/ops/isr-prune.test.ts`
Expected: FAIL — 모듈을 찾을 수 없음

- [ ] **Step 3: 타입 선언을 쓴다**

`scripts/ops/isr-prune/prune.d.mts`:

```ts
export interface PageEntry {
  /** 확장자를 뺀 경로. `.html`·`.rsc`·`.meta`가 이 key를 공유한다. */
  key: string;
  /** 3종 파일 크기 합계(바이트). */
  bytes: number;
  /** 3종 중 가장 이른 atime(ms). */
  atimeMs: number;
}

export interface EvictionPlan {
  deleteKeys: string[];
  freedBytes: number;
  remainingBytes: number;
}

export function planEviction(input: {
  pages: PageEntry[];
  protectedBytes: number;
  maxBytes: number;
}): EvictionPlan;

export interface PruneResult {
  totalBytes: number;
  maxBytes: number;
  protectedFiles: number;
  protectedBytes: number;
  candidatePages: number;
  deletedPages: number;
  freedBytes: number;
  remainingBytes: number;
  durationMs: number;
  dryRun: boolean;
}

export function prune(input: {
  dir: string;
  baselineMs: number;
  maxBytes: number;
  dryRun?: boolean;
}): Promise<PruneResult>;
```

- [ ] **Step 4: 최소 구현을 쓴다**

`scripts/ops/isr-prune/prune.mjs`:

```js
// ISR 캐시 축출 — 컨테이너 안에서 node로 직접 실행된다(tsx 없음, 의존성 0).
// 설계: docs/superpowers/specs/2026-08-27-isr-cache-eviction-design.md

/**
 * 어떤 페이지를 지울지 정한다. 파일시스템을 건드리지 않는 순수 함수라 테스트가 쉽다.
 *
 * 정렬 기준은 atime이지만 루트가 relatime 마운트라 사실상 '생성 후 첫 접근'이고,
 * 엄밀한 LRU가 아니라 FIFO에 가깝다(설계 문서 §2.3). 목표가 핫 페이지 보호가 아니라
 * 총량 상한이므로 그대로 채택한다.
 */
export function planEviction({ pages, protectedBytes, maxBytes }) {
  // atime 동률에서 순서가 흔들리면 재실행 결과가 달라져 검증이 불가능해진다. key로 고정한다.
  const ordered = [...pages].sort((a, b) => a.atimeMs - b.atimeMs || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  let remaining = protectedBytes + pages.reduce((sum, p) => sum + p.bytes, 0);
  const deleteKeys = [];
  let freed = 0;

  for (const page of ordered) {
    if (remaining <= maxBytes) break;
    deleteKeys.push(page.key);
    freed += page.bytes;
    remaining -= page.bytes;
  }

  return { deleteKeys, freedBytes: freed, remainingBytes: remaining };
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm vitest run tests/ops/isr-prune.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: typecheck·lint를 확인한다**

Run: `pnpm typecheck && pnpm lint`
Expected: 둘 다 클린. `.d.mts`가 인식되지 않으면 `tsconfig.json`의 `include`에 `scripts/**/*.d.mts`가 필요한지 확인한다

- [ ] **Step 7: 커밋**

```bash
git add scripts/ops/isr-prune/prune.mjs scripts/ops/isr-prune/prune.d.mts tests/ops/isr-prune.test.ts
git commit -m "feat(ops): ISR 축출 계획 순수 함수

atime 오름차순으로 상한 아래까지 지울 페이지를 고른다. 파일시스템을 건드리지
않아 단위 테스트가 가능하다. atime 동률은 key 사전순으로 고정해 재실행 결과를
결정적으로 만든다 — 흔들리면 박스 검증이 성립하지 않는다."
```

---

### Task 2: 파일시스템 스캔과 삭제

**Files:**
- Modify: `scripts/ops/isr-prune/prune.mjs`
- Test: `tests/ops/isr-prune.test.ts`

**Interfaces:**
- Consumes: `planEviction` (Task 1)
- Produces: `prune({ dir, baselineMs, maxBytes, dryRun })` → `Promise<PruneResult>` (필드는 Task 1의 `.d.mts` 참조)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/ops/isr-prune.test.ts` 하단에 추가:

```ts
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prune } from '@/scripts/ops/isr-prune/prune.mjs';

/** 페이지 한 벌(.html·.rsc·.meta)을 만들고 mtime·atime을 지정한다. */
function makePage(dir: string, name: string, bytes: number, epochSec: number) {
  for (const ext of ['html', 'rsc', 'meta']) {
    const p = join(dir, `${name}.${ext}`);
    writeFileSync(p, 'x'.repeat(Math.max(1, Math.floor(bytes / 3))));
    utimesSync(p, epochSec, epochSec); // atime, mtime
  }
}

describe('prune', () => {
  it('기준선 이전 파일은 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'build-artifact', 300, 1000); // 기준선 이전
    makePage(dir, 'runtime-page', 300, 3000); // 기준선 이후

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(existsSync(join(dir, 'build-artifact.html'))).toBe(true);
    expect(existsSync(join(dir, 'runtime-page.html'))).toBe(false);
    expect(r.protectedFiles).toBe(3);
    expect(r.deletedPages).toBe(1);
  });

  it('페이지 3종을 함께 지운다 — 부분 삭제가 남으면 안 된다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(readdirSync(dir)).toEqual([]);
  });

  it('.html/.rsc/.meta 외 확장자는 건드리지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);
    const other = join(dir, 'route.js');
    writeFileSync(other, 'x');
    utimesSync(other, 3000, 3000); // 기준선 이후지만 대상 확장자가 아니다

    await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(existsSync(other)).toBe(true);
  });

  it('하위 디렉터리를 재귀 탐색한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    const sub = join(dir, 'amenity', 'cafe');
    mkdirSync(sub, { recursive: true });
    makePage(sub, '172547', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: false });

    expect(r.deletedPages).toBe(1);
    expect(existsSync(join(sub, '172547.html'))).toBe(false);
  });

  it('dryRun이면 계산만 하고 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 1, dryRun: true });

    expect(r.deletedPages).toBe(1);
    expect(r.dryRun).toBe(true);
    expect(existsSync(join(dir, 'p.html'))).toBe(true);
  });

  it('상한 아래면 아무것도 지우지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'isr-'));
    makePage(dir, 'p', 300, 3000);

    const r = await prune({ dir, baselineMs: 2000 * 1000, maxBytes: 10_000_000, dryRun: false });

    expect(r.deletedPages).toBe(0);
    expect(existsSync(join(dir, 'p.html'))).toBe(true);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run tests/ops/isr-prune.test.ts`
Expected: FAIL — `prune is not a function`

- [ ] **Step 3: 구현을 쓴다**

`scripts/ops/isr-prune/prune.mjs`의 `planEviction` 아래에 추가:

```js
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** 런타임 ISR이 만드는 확장자. 이 셋만 축출 대상이다. */
const PAGE_EXTS = ['.html', '.rsc', '.meta'];

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // 스캔 중 사라진 디렉터리는 무시한다
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * dir을 훑어 기준선 이후 생성된 ISR 페이지를 상한까지 지운다.
 *
 * baselineMs = 컨테이너 StartedAt. 그 이전 mtime은 이미지에 구워진 빌드 산출물이라
 * 절대 지우면 안 된다(실측 325개). 동적 상세는 generateStaticParams가 빈 배열이라
 * 빌드 시 프리렌더되지 않으므로, 상세 캐시는 전부 기준선 이후에 있다.
 */
export async function prune({ dir, baselineMs, maxBytes, dryRun = false }) {
  const startedAt = Date.now();
  const files = await walk(dir, []);

  let protectedFiles = 0;
  let protectedBytes = 0;
  /** key(확장자 제거 경로) → { bytes, atimeMs } */
  const pageMap = new Map();

  for (const file of files) {
    const ext = PAGE_EXTS.find((x) => file.endsWith(x));
    let st;
    try {
      st = await stat(file);
    } catch {
      continue; // 스캔과 삭제 사이에 사라진 파일
    }
    // 대상 확장자가 아니면 크기만 총량에 반영하고 후보로 삼지 않는다.
    if (!ext || st.mtimeMs <= baselineMs) {
      protectedFiles += 1;
      protectedBytes += st.size;
      continue;
    }
    const key = file.slice(0, -ext.length);
    const prev = pageMap.get(key);
    if (prev) {
      prev.bytes += st.size;
      prev.atimeMs = Math.min(prev.atimeMs, st.atimeMs);
    } else {
      pageMap.set(key, { bytes: st.size, atimeMs: st.atimeMs });
    }
  }

  const pages = [...pageMap].map(([key, v]) => ({ key, bytes: v.bytes, atimeMs: v.atimeMs }));
  const plan = planEviction({ pages, protectedBytes, maxBytes });

  if (!dryRun) {
    for (const key of plan.deleteKeys) {
      // 3종을 함께 지운다. 하나만 남으면 Next가 불완전한 캐시를 읽는다.
      for (const ext of PAGE_EXTS) {
        await unlink(key + ext).catch(() => {});
      }
    }
  }

  return {
    totalBytes: protectedBytes + pages.reduce((s, p) => s + p.bytes, 0),
    maxBytes,
    protectedFiles,
    protectedBytes,
    candidatePages: pages.length,
    deletedPages: plan.deleteKeys.length,
    freedBytes: plan.freedBytes,
    remainingBytes: plan.remainingBytes,
    durationMs: Date.now() - startedAt,
    dryRun,
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm vitest run tests/ops/isr-prune.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 전체 게이트**

Run: `pnpm test:unit && pnpm typecheck && pnpm lint`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add scripts/ops/isr-prune/prune.mjs scripts/ops/isr-prune/prune.d.mts tests/ops/isr-prune.test.ts
git commit -m "feat(ops): ISR 캐시 스캔·삭제 구현

기준선(컨테이너 StartedAt) 이전 mtime은 빌드 산출물이라 보호하고, 이후 생성된
.html/.rsc/.meta만 페이지 단위로 함께 지운다. 부분 삭제가 남으면 Next가 불완전한
캐시를 읽으므로 3종을 한 벌로 다룬다. 그 외 확장자는 총량에만 반영하고 건드리지 않는다."
```

---

### Task 3: CLI 진입점

**Files:**
- Modify: `scripts/ops/isr-prune/prune.mjs`

**Interfaces:**
- Consumes: `prune` (Task 2)
- Produces: CLI — `node prune.mjs --dir <path> --baseline-ms <int> --max-bytes <int> [--dry-run]`, stdout에 한 줄 JSON

- [ ] **Step 1: CLI를 추가한다**

`scripts/ops/isr-prune/prune.mjs` 맨 아래에 추가:

```js
/** `--flag value` 형식만 받는다. 컨테이너 안에서 maintenance.sh가 호출하는 전용 진입점이다. */
function parseArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    dir: get('dir'),
    baselineMs: Number(get('baseline-ms')),
    maxBytes: Number(get('max-bytes')),
    dryRun: argv.includes('--dry-run'),
  };
}

// 직접 실행될 때만 CLI로 동작한다(테스트에서 import할 때는 실행되지 않는다).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir || !Number.isFinite(args.baselineMs) || !Number.isFinite(args.maxBytes)) {
    console.error('usage: node prune.mjs --dir <path> --baseline-ms <int> --max-bytes <int> [--dry-run]');
    process.exit(2);
  }
  prune(args).then(
    (r) => console.log(JSON.stringify(r)),
    (err) => {
      console.error(String(err?.message ?? err));
      process.exit(1);
    },
  );
}
```

- [ ] **Step 2: CLI를 임시 디렉터리로 실행해본다**

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/apt"
for e in html rsc meta; do printf 'xxxxx' > "$TMP/apt/1.$e"; done
node scripts/ops/isr-prune/prune.mjs --dir "$TMP" --baseline-ms 0 --max-bytes 1 --dry-run
```

Expected: `{"totalBytes":15,...,"deletedPages":1,...,"dryRun":true}` 형태의 한 줄 JSON. 파일은 남아 있어야 한다

- [ ] **Step 3: 인자 누락 시 종료코드를 확인한다**

```bash
node scripts/ops/isr-prune/prune.mjs --dir /tmp; echo "exit=$?"
```

Expected: usage 출력 + `exit=2`

- [ ] **Step 4: 테스트가 여전히 통과하는지 확인한다**

Run: `pnpm vitest run tests/ops/isr-prune.test.ts && pnpm typecheck && pnpm lint`
Expected: 전부 통과 — `import.meta.url` 가드 덕분에 import 시 CLI가 돌지 않아야 한다

- [ ] **Step 5: 커밋**

```bash
git add scripts/ops/isr-prune/prune.mjs
git commit -m "feat(ops): ISR 축출 CLI 진입점

maintenance.sh가 컨테이너 안에서 호출한다. import.meta.url 가드로 테스트에서
import할 때는 실행되지 않게 했다. 결과는 한 줄 JSON이라 로그에 그대로 실을 수 있다."
```

---

### Task 4: maintenance.sh 통합

**Files:**
- Modify: `deploy/maintenance.sh:5` (주석 교정), `:16` (WEEKLY_RECREATE 제거), `:17` 이후(ISR_MAX_GB 추가), `:29-38` (cleanup_safe), `:51-59` (weekly 분기)

**Interfaces:**
- Consumes: `scripts/ops/isr-prune/prune.mjs` CLI (Task 3)

- [ ] **Step 1: 잘못된 주석을 고친다**

`deploy/maintenance.sh:5`의 다음 줄을

```
#   - .next/server/app: ISR 전체경로 캐시(.html/.rsc/.meta). 실행 컨테이너에서 안전삭제 불가 → 이미지에서 재생성(recreate).
```

이렇게 바꾼다:

```
#   - .next/server/app: ISR 전체경로 캐시(.html/.rsc/.meta). 축출이 없어 무한 증가한다(revalidate는 신선도 기준이지 보존 정책이 아니다).
#     2026-08-27 실측으로 '실행 중 안전삭제 불가'는 반증됐다 — 컨테이너 StartedAt 이전 mtime(빌드 산출물 325개)만 피하면 무중단 삭제가 가능하고,
#     삭제 직후 요청도 200/53ms였다. prune_isr()가 이를 수행한다. 설계: docs/superpowers/specs/2026-08-27-isr-cache-eviction-design.md
```

- [ ] **Step 2: 파라미터를 교체한다**

`deploy/maintenance.sh:16`의 `WEEKLY_RECREATE` 줄을 지우고 그 자리에 넣는다:

```bash
ISR_MAX_GB=${ISR_MAX_GB:-8}       # ISR 캐시 상한(GB). 기타 사용 ≈14.4GB + 8GB ≈ 디스크 50%
```

- [ ] **Step 3: prune_isr 함수를 추가한다**

`recreate_web()` 정의 **위**에 넣는다:

```bash
# ISR 캐시 축출 — 컨테이너를 죽이지 않고 오래된 페이지 캐시만 지운다.
# 기준선을 얻지 못하면 아무것도 지우지 않는다(빌드 산출물 325개를 보호할 수 없기 때문).
prune_isr() {
  local started baseline_ms max_bytes out
  started=$(docker inspect --format '{{.State.StartedAt}}' "$WEB" 2>/dev/null)
  if [ -z "$started" ]; then
    log "WARN: web StartedAt 확인 실패 — ISR 축출 건너뜀"
    return 0
  fi
  baseline_ms=$(date -d "$started" +%s%3N 2>/dev/null)
  if [ -z "$baseline_ms" ]; then
    log "WARN: StartedAt 파싱 실패($started) — ISR 축출 건너뜀"
    return 0
  fi
  max_bytes=$((ISR_MAX_GB * 1024 * 1024 * 1024))

  docker cp scripts/ops/isr-prune/prune.mjs "$WEB":/tmp/isr-prune.mjs >/dev/null 2>&1 || {
    log "WARN: prune 스크립트 복사 실패 — ISR 축출 건너뜀"
    return 0
  }
  out=$(docker exec "$WEB" node /tmp/isr-prune.mjs \
        --dir /app/.next/server/app --baseline-ms "$baseline_ms" --max-bytes "$max_bytes" 2>&1)
  if [ $? -ne 0 ]; then
    log "WARN: ISR 축출 실패 — $out"
    return 0
  fi
  log "isr prune: $out"
}
```

- [ ] **Step 4: cleanup_safe에서 호출한다**

`cleanup_safe()`의 `log "safe-cleanup done ..."` **직전**에 한 줄 추가:

```bash
  prune_isr
```

- [ ] **Step 5: weekly의 무조건 recreate를 제거한다**

`weekly)` 분기를 이렇게 바꾼다:

```bash
  weekly)
    log "weekly start (disk $(disk_pct)%)"
    cleanup_safe
    # 종전에는 60% 이상이면 무조건 recreate_web을 불렀고, 그게 매주 502의 출처였다.
    # 이제 cleanup_safe 안의 prune_isr이 같은 공간을 무중단으로 회수한다.
    log "weekly done (disk $(disk_pct)%)"
    ;;
```

`guard)` 분기는 그대로 둔다 — `GUARD_CRIT`(90%) 초과 시의 `recreate_web`은 축출이 실패했을 때의 최후수단으로 남긴다.

- [ ] **Step 6: 문법을 검사한다**

Run: `bash -n deploy/maintenance.sh && echo "문법 OK"`
Expected: `문법 OK`

- [ ] **Step 7: WEEKLY_RECREATE 잔재가 없는지 확인한다**

Run: `grep -n "WEEKLY_RECREATE" deploy/maintenance.sh || echo "잔재 없음"`
Expected: `잔재 없음`

- [ ] **Step 8: 커밋**

```bash
git add deploy/maintenance.sh
git commit -m "fix(ops): ISR 캐시 회수를 컨테이너 재생성에서 선택적 삭제로 교체

weekly가 디스크 60% 이상이면 무조건 web을 재생성했고, 그게 매주 502를 만들었다.
prune_isr이 같은 공간을 무중단으로 회수하므로 그 호출을 제거한다. guard의
GUARD_CRIT(90%) recreate는 축출 실패 시의 최후수단으로 남긴다.

maintenance.sh:5의 '실행 컨테이너에서 안전삭제 불가' 주석도 교정했다 —
2026-08-27 실측으로 반증됐다."
```

---

### Task 5: 운영 박스 검증

**Files:** 없음(검증만)

**Interfaces:**
- Consumes: Task 4까지의 배포된 `deploy/maintenance.sh`

> 이 태스크는 **PR 머지·배포 이후** 수행한다. `deploy/**` 변경은 박스의 `/opt/imjang`이 갱신돼야 반영된다.

- [ ] **Step 1: dry-run으로 먼저 규모를 본다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 '
  cd /opt/imjang
  IMG=$(docker inspect --format "{{.Image}}" imjang-web-1)
  S=$(docker inspect --format "{{.Created}}" "$IMG")
  B=$(date -d "$S" +%s%3N)
  docker cp scripts/ops/isr-prune/prune.mjs imjang-web-1:/tmp/isr-prune.mjs
  docker exec imjang-web-1 node /tmp/isr-prune.mjs \
    --dir /app/.next/server/app --baseline-ms "$B" \
    --max-bytes $((8*1024*1024*1024)) --dry-run
'
```

`$S`는 이미지 생성 시각이다(2026-08-27 재시작 무력화 수정 이후 `maintenance.sh`의 `prune_isr()`와 동일한 기준선 계산 — 컨테이너 기동 시각이 아니다).

**수용 기준 — 절대값이 아니라 Step 2와의 합산 일치다:**

```
baselineProtectedFiles + nonPageFiles  ==  Step 2의 find ! -newermt 결과
```

`find`는 **확장자를 가리지 않고** mtime만 본다. 반면 `prune.mjs`는 `!ext`(대상 외 확장자)를 **먼저** 걸러내므로, 기준선 이전 mtime의 `.js`·`.nft.json`은 `baselineProtectedFiles`가 아니라 `nonPageFiles`로 간다. 따라서 `baselineProtectedFiles` **단독**은 `find` 결과와 일치하지 않는다 — 두 카운터의 **합**이 일치해야 정상이다.

> **2026-08-27 배포 직후 실측:** `find` 348 · `baselineProtectedFiles` 59 · `nonPageFiles` 289 → 59 + 289 = 348 ✅
> 이 산식을 확인하지 않고 `baselineProtectedFiles` 단독(59)을 `find`(348)와 비교하면 멀쩡한 시스템에서 중단하게 된다.

**중단 조건:** 합이 `find` 결과와 다르거나, `baselineProtectedFiles + nonPageFiles`가 0이면 멈추고 기준선 계산을 다시 본다(기준선이 무의미하다는 뜻).

`deletedPages`는 캐시가 상한(8GB) 아래면 0이 정상이다. 배포 직후에는 컨테이너 재생성으로 캐시가 비어 있어 항상 0이 나온다 — 의미 있는 축출 검증은 캐시가 상한 근처까지 찬 뒤에 해야 한다(측정 증가율 1.24GB/시간 기준 6~8시간).

(참고: 이전엔 `{{.State.StartedAt}}` 기준으로 **325개 부근**을 기대했다. 기준선이 이미지 Created로 바뀌었고 배포마다 이미지가 새로 만들어지므로 이 수는 고정값이 아니다. 절대값을 게이트로 쓰지 않는 이유다.)

- [ ] **Step 2: V1 — 빌드 산출물 수를 기록한다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 '
  IMG=$(docker inspect --format "{{.Image}}" imjang-web-1)
  S=$(docker inspect --format "{{.Created}}" "$IMG")
  docker exec imjang-web-1 sh -c "find /app/.next/server/app ! -newermt \"$(date -d "$S" -u "+%Y-%m-%d %H:%M:%S")\" -type f | wc -l"
'
```

`$S`는 이미지 생성 시각이다(Step 1과 동일한 기준선 계산).

Expected: Step 1의 `baselineProtectedFiles + nonPageFiles`와 같은 값(`find`는 확장자를 안 가리므로 두 카운터의 합에 대응한다). 이 값을 적어둔다 — 이하 **V1 기준치**로 쓴다.

절대값은 배포마다 달라지므로 미리 단정하지 않는다. 2026-08-27 배포 직후 실측은 **348**이었다.

- [ ] **Step 3: 실제 축출을 1회 실행한다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 'cd /opt/imjang && sudo -u ubuntu ISR_MAX_GB=8 bash deploy/maintenance.sh weekly'
```

Expected: `[maint] isr prune: {...}` 한 줄이 찍히고, `recreating web` 로그는 **없어야 한다**

- [ ] **Step 4: V1·V2·V4를 확인한다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 '
  IMG=$(docker inspect --format "{{.Image}}" imjang-web-1)
  S=$(docker inspect --format "{{.Created}}" "$IMG")
  docker exec imjang-web-1 sh -c "
    echo \"보호(V1): \$(find /app/.next/server/app ! -newermt \"$(date -d "$S" -u "+%Y-%m-%d %H:%M:%S")\" -type f | wc -l)\"
    echo \"html: \$(find /app/.next/server/app -name \"*.html\" | wc -l)\"
    echo \"rsc:  \$(find /app/.next/server/app -name \"*.rsc\" | wc -l)\"
    echo \"총량(V4): \$(du -sm /app/.next/server/app | cut -f1) MB\"
  "
'
```

`$S`는 이미지 생성 시각이다(Step 1·2와 동일한 기준선 계산 — 컨테이너 기동 시각이 아니다).

Expected:
- **V1** 보호 = Step 2에서 적어둔 값과 동일(같은 `$S`를 쓰므로 일치해야 한다). 도구 출력과 대조할 때는 `baselineProtectedFiles + nonPageFiles`와 비교한다 — `find`는 확장자를 안 가린다
- **V2** `.html` 수 == `.rsc` 수. 여기에 더해 **`.meta` − `.html` ≈ `.body`**여야 한다 — 라우트 핸들러 캐시(`.body`+`.meta`)의 짝이 맞는지 보는 검사다. `.meta`가 그보다 많으면 고아가 생긴 것이다(2026-08-27 이전 코드의 결함이었다)
- **V4** 총량 ≤ **8192MB**. 단 `du -sm`은 블록 사용량, 도구의 `remainingBytes`는 apparent size라 수백 MB 차이가 정상이다 — 판정은 **`remainingBytes`**로 하고 `du`는 참고치로 본다

- [ ] **Step 5: V3 — 사이트가 정상인지 확인한다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 '
  docker exec imjang-web-1 node -e "
    const urls = [\"/\", \"/board\", \"/list\"];
    Promise.all(urls.map(u => fetch(\"http://127.0.0.1:3000\"+u).then(r => u+\" \"+r.status)))
      .then(rs => console.log(rs.join(\"\n\")));
  "
'
```

Expected: 세 경로 모두 `200`

- [ ] **Step 6: V5 — 컨테이너가 재시작되지 않았는지 확인한다**

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 'docker ps --format "{{.Names}}\t{{.Status}}" | grep web'
```

Expected: `Up` 시간이 Step 1 이전부터 이어져야 한다(재시작 시 초기화됨)

- [ ] **Step 7: V6 — 2~3일 안정성을 확인한다**

2~3일 뒤 실행:

```bash
ssh -i "$OCI_KEY" ubuntu@161.33.160.159 '
  df -h / | tail -1
  sudo journalctl -u "imjang-maintenance@*" --since "3 days ago" --no-pager | grep -E "isr prune|recreat" | tail -20
'
```

Expected: 디스크가 상한 근처에서 유지되고, `recreating web`이 **한 번도** 나오지 않아야 한다. 이 조건이 애드센스 재신청의 선행 조건이다

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 태스크 |
|---|---|
| §3.1 축출 규칙 1(기준선) | Task 4 Step 3 (`docker inspect` + 실패 시 건너뜀) |
| §3.1 규칙 2(대상 필터) | Task 2 Step 3 (`mtimeMs <= baselineMs` 보호) |
| §3.1 규칙 3(atime 정렬) | Task 1 Step 4 (`planEviction` 정렬) |
| §3.1 규칙 4(3종 함께 삭제) | Task 2 Step 3 (`PAGE_EXTS` 루프) + Step 1 테스트 2번 |
| §3.1 규칙 5(상한에서 중단) | Task 1 Step 4 (`if (remaining <= maxBytes) break`) |
| §3.1 총량 측정 비용 | Task 2 `durationMs` + Task 4 로그 |
| §3.1 기준선 실패 시 | Task 4 Step 3 (두 갈래 WARN 후 return 0) |
| §3.2 weekly recreate 제거 | Task 4 Step 5 |
| §3.2 guard CRIT 유지 | Task 4 Step 5 (명시적으로 그대로 둠) |
| §3.3 ISR_MAX_GB=8 | Task 4 Step 2 |
| §3.4 관측성 | Task 3 (JSON) + Task 4 Step 3 (`log "isr prune: $out"`) |
| §4 V1~V6 | Task 5 Step 2·4·5·6·7 |

빠진 항목 없음.

**2. 플레이스홀더** — TBD·TODO·"적절히 처리" 없음. 모든 코드 단계에 실제 코드가 있다.

**3. 타입 일관성** — `planEviction`/`prune`의 인자·반환 필드가 `.d.mts`(Task 1) → 구현(Task 1·2) → CLI(Task 3) → 로그(Task 4)에서 동일하다. `PruneResult` 필드명(`protectedFiles`·`deletedPages`·`freedBytes`)이 Task 5 검증 단계의 기대값과 일치한다.

**주의로 남기는 것**

- Task 1 Step 6에서 `.d.mts` 인식 문제가 나올 수 있다. `tsconfig.json`의 `allowJs`가 false라 `.mjs` import가 선언 파일을 요구한다. 해결이 안 되면 대안은 `include`에 경로 추가이며, 그래도 안 되면 `allowJs: true`가 마지막 수단이다(전역 변경이라 되도록 피한다)
- Task 4의 `docker cp`는 `cd /opt/imjang` 상태를 전제한다. `maintenance.sh`가 이미 9행에서 `cd /opt/imjang`을 하므로 상대 경로가 성립한다
