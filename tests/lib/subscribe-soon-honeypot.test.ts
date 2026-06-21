import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma를 모킹하여 DB 없이 라우트 핸들러를 단위 테스트한다.
vi.mock('@/lib/db', () => ({
  prisma: { emailSignup: { upsert: vi.fn() } },
}));

import { prisma } from '@/lib/db';
import { POST } from '@/app/api/subscribe-soon/route';

const upsert = prisma.emailSignup.upsert as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/subscribe-soon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('subscribe-soon honeypot', () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({});
  });

  it('(a) 허니팟 키 부재 → 정상 저장', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('(b) 허니팟 빈 문자열 → 정상 저장', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약', company: '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('(c) 허니팟 trim 후 non-empty → 저장 스킵 + ok', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약', company: '  spam  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('(d) 잘못된 email → 400, 저장 안 함', async () => {
    const res = await post({ email: 'not-an-email', topic: '청약' });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
