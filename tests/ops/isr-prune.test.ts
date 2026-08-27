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
