import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

// GONE_SUBSCRIPTION_IDS를 '123' 하나만 담도록 모킹한다 — 커밋된 실제 목록은 빈 Set 플레이스홀더라
// 정규화 버그(앞자리 0)를 재현하려면 최소 하나의 대상 id가 필요하다.
vi.mock('@/lib/subscription/gone-ids', () => ({
  GONE_SUBSCRIPTION_IDS: new Set(['123']),
  GONE_IDS_GENERATED_AT: '2026-08-12',
}));

import { middleware } from '@/middleware';

function req(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://localhost'));
}

describe('middleware 410 게이트 — 앞자리 0 정규화 (Fix B)', () => {
  it('/subscription/123 은 410', () => {
    const res = middleware(req('/subscription/123'));
    expect(res.status).toBe(410);
  });

  it('/subscription/0123 도 410이어야 한다 — BigInt 정규화가 없으면 Set.has("0123")가 false라 새서 200이 난다', () => {
    const res = middleware(req('/subscription/0123'));
    expect(res.status).toBe(410);
  });

  it('목록에 없는 id(/subscription/456)는 통과한다', () => {
    const res = middleware(req('/subscription/456'));
    expect(res.status).not.toBe(410);
  });
});
