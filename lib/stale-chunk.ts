/**
 * 배포 직후 옛 빌드 청크로 인한 클라이언트 에러를 새로고침 한 번으로 복구한다.
 *
 * 원인(2026-09-30 운영 실측): 페이지·RSC 응답의 `stale-while-revalidate`(Next 기본 ≈1년) 때문에
 * 재방문 브라우저가 prefetch 시 **옛 빌드 RSC를 캐시에서 먼저** 꺼낸다. 그 응답이 옛 청크
 * (`4224-<옛해시>.js`)를 로드해 청크 id를 선점하면, 새 빌드 모듈(같은 id 4224의 새 파일에 있음)을
 * 못 찾아 `reading 'call'` TypeError → error.tsx(500 화면)가 된다. 서버는 정상이라 서버 로그가 없다.
 * 전체 새로고침이면 JS 런타임이 새로 떠서 복구된다.
 */

const STALE_CHUNK_PATTERNS = [
  /reading 'call'/, // Chrome
  /can't access property "call"/, // Firefox
  /evaluating '[^']*\.call'\)/, // Safari
  /Loading chunk [\w-]+ failed/,
  /Failed to load chunk/,
];

export function isStaleChunkError(error: Error): boolean {
  if (error.name === 'ChunkLoadError') return true;
  return STALE_CHUNK_PATTERNS.some((re) => re.test(error.message));
}

const KEY = 'imjang:stale-chunk-reload-at';
/** 이 안에 또 요청되면 새로고침으로 안 풀리는 에러로 보고 멈춘다(무한 새로고침 방지). */
const RETRY_WINDOW_MS = 60_000;

/** 새로고침해도 되면 true를 돌려주며 시각을 기록한다. storage를 못 쓰면 반복을 막을 수 없어 false. */
export function claimStaleChunkReload(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  now: number,
): boolean {
  try {
    const last = Number(storage.getItem(KEY));
    if (last && now - last < RETRY_WINDOW_MS) return false;
    storage.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

/** error boundary용: 옛 청크 에러면 한 번 새로고침하고 true. */
export function reloadIfStaleChunk(error: Error): boolean {
  if (!isStaleChunkError(error)) return false;
  let storage: Storage;
  try {
    storage = window.sessionStorage;
  } catch {
    return false;
  }
  if (!claimStaleChunkReload(storage, Date.now())) return false;
  window.location.reload();
  return true;
}
