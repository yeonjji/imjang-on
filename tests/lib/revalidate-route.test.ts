import { describe, it, expect, vi, beforeEach } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/env', () => ({ env: { REVALIDATE_TOKEN: 't0k' } }));

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/revalidate/route');
  return POST(new Request('http://x/api/revalidate', { method: 'POST', body: JSON.stringify(body) }));
};

describe('/api/revalidate', () => {
  beforeEach(() => revalidatePath.mockClear());
  it('paths는 그대로', async () => {
    const r = await post({ token: 't0k', paths: ['/guide'] });
    expect(r.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/guide');
  });
  it("routes는 동적 라우트를 'page'로 무효화(한글 slug 경로를 직접 넘기지 않기 위함)", async () => {
    const r = await post({ token: 't0k', paths: [], routes: ['/guide/[slug]'] });
    expect(r.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/guide/[slug]', 'page');
  });
  it('토큰이 틀리면 401', async () => {
    expect((await post({ token: 'x', paths: ['/'] })).status).toBe(401);
  });
});
