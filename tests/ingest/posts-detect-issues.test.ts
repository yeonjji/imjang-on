import { describe, it, expect } from 'vitest';
import { naverNewsCount } from '@/scripts/ingest/posts/detect-issues';

const CREDS = { clientId: 'id', clientSecret: 'secret' };

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

describe('naverNewsCount', () => {
  it('total을 반환', async () => {
    const n = await naverNewsCount('디딤돌 대출', { ...CREDS, fetchImpl: fakeFetch({ total: 123 }) });
    expect(n).toBe(123);
  });
  it('자격증명 없으면 null(graceful)', async () => {
    const n = await naverNewsCount('x', { clientId: '', clientSecret: '', fetchImpl: fakeFetch({ total: 1 }) });
    expect(n).toBeNull();
  });
  it('non-OK 응답이면 null', async () => {
    const n = await naverNewsCount('x', { ...CREDS, fetchImpl: fakeFetch({}, false) });
    expect(n).toBeNull();
  });
  it('fetch 예외면 null', async () => {
    const throwing = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
    const n = await naverNewsCount('x', { ...CREDS, fetchImpl: throwing });
    expect(n).toBeNull();
  });
});
