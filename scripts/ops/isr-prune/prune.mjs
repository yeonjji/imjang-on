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

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

// 런타임 ISR이 만드는 확장자. .html/.rsc는 일반 페이지, .body+.meta는 라우트 핸들러
// (APP_ROUTE — OG 이미지·sitemap·favicon 등) 캐시 한 벌이다. .body를 빼면 그 바이트가
// protectedBytes로 잘못 계상돼 영구 회수 불가능해지고(운영 실측: .body 3,801개 2,282MB,
// 평균 615KB — 이미 8GB 상한의 28%), 삭제 루프가 짝인 .meta만 지워 고아를 남긴다
// (실측: .meta - .html = 3,803 ≈ .body 개수, 정확히 짝을 잃은 수만큼).
const PAGE_EXTS = ['.html', '.rsc', '.meta', '.body'];

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

  // 두 모집단을 분리해 센다 — 섞으면 운영 모니터링에서 '325 불변식'을 확인할 수 없다.
  let baselineProtectedFiles = 0; // 기준선 이전 mtime = 빌드 산출물(불변식, 실측 325개)
  let baselineProtectedBytes = 0;
  let nonPageFiles = 0; // 대상 확장자가 아님(mtime 무관) — 예: .js, .nft.json
  let nonPageBytes = 0;
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
    if (!ext) {
      // 대상 확장자가 아니면 mtime과 무관하게 크기만 총량에 반영하고 후보로 삼지 않는다.
      nonPageFiles += 1;
      nonPageBytes += st.size;
      continue;
    }
    if (st.mtimeMs <= baselineMs) {
      baselineProtectedFiles += 1;
      baselineProtectedBytes += st.size;
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
  const protectedBytes = baselineProtectedBytes + nonPageBytes;
  const plan = planEviction({ pages, protectedBytes, maxBytes });

  if (!dryRun) {
    for (const key of plan.deleteKeys) {
      // 한 벌(페이지는 .html+.rsc+.meta, 라우트 핸들러는 .body+.meta)을 함께 지운다.
      // 하나만 남으면 Next가 불완전한 캐시를 읽는다.
      // 실패는 삼킨다: 크롤러가 계속 쓰는 디렉터리라 계획 수립 이후 파일이 이미
      // 지워졌거나 애초에 일부 확장자가 없을 수 있다(예: 라우트 핸들러엔 .html/.rsc가 없다)
      // — 그래도 나머지는 마저 지운다.
      for (const ext of PAGE_EXTS) {
        await unlink(key + ext).catch(() => {});
      }
    }
  }

  return {
    totalBytes: protectedBytes + pages.reduce((s, p) => s + p.bytes, 0),
    maxBytes,
    baselineProtectedFiles,
    baselineProtectedBytes,
    nonPageFiles,
    nonPageBytes,
    candidatePages: pages.length,
    deletedPages: plan.deleteKeys.length,
    freedBytes: plan.freedBytes,
    remainingBytes: plan.remainingBytes,
    durationMs: Date.now() - startedAt,
    dryRun,
  };
}

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
  // Number('') === 0이고 Number.isFinite(0) === true라 빈 문자열이 유한성 검사를 통과했다.
  // 그러면 baselineMs = 0 → mtimeMs <= 0인 파일이 없어 빌드 산출물까지 전부 삭제 후보가 된다.
  // > 0 비교는 NaN·빈 문자열·음수·0을 한 번에 거른다(NaN > 0은 false).
  if (!args.dir || !(args.baselineMs > 0) || !(args.maxBytes > 0)) {
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
