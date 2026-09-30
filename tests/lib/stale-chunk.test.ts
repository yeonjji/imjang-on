import { describe, it, expect } from 'vitest';
import { isStaleChunkError, claimStaleChunkReload } from '@/lib/stale-chunk';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('isStaleChunkError', () => {
  it('webpack 모듈 누락(브라우저별 문구)을 잡는다', () => {
    // 2026-09-30 운영 실측(Chrome): 옛 빌드 RSC가 옛 청크를 등록해 새 모듈을 못 찾음
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'call')"))).toBe(true);
    expect(isStaleChunkError(new TypeError('can\'t access property "call", e[r] is undefined'))).toBe(true);
    expect(isStaleChunkError(new TypeError("undefined is not an object (evaluating 'e[r].call')"))).toBe(true);
  });

  it('청크 로드 실패를 잡는다', () => {
    const e = new Error('Loading chunk 4224 failed.');
    e.name = 'ChunkLoadError';
    expect(isStaleChunkError(e)).toBe(true);
    expect(isStaleChunkError(new Error('Failed to load chunk /_next/static/chunks/4224-x.js'))).toBe(true);
  });

  it('일반 에러는 새로고침 대상이 아니다', () => {
    expect(isStaleChunkError(new Error('An error occurred in the Server Components render.'))).toBe(false);
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'price')"))).toBe(false);
  });
});

describe('claimStaleChunkReload', () => {
  it('처음엔 허용하고, 같은 창에서 곧바로 다시 요청하면 거부한다(무한 새로고침 방지)', () => {
    const s = memoryStorage();
    expect(claimStaleChunkReload(s, 1_000)).toBe(true);
    expect(claimStaleChunkReload(s, 5_000)).toBe(false);
  });

  it('충분히 시간이 지나면(다음 배포 등) 다시 허용한다', () => {
    const s = memoryStorage();
    expect(claimStaleChunkReload(s, 1_000)).toBe(true);
    expect(claimStaleChunkReload(s, 1_000 + 60_001)).toBe(true);
  });

  it('storage 접근이 막히면 새로고침하지 않는다(반복 여부를 보장할 수 없으므로)', () => {
    const broken = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
    };
    expect(claimStaleChunkReload(broken, 1_000)).toBe(false);
  });
});
