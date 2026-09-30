import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function req(path: string, extra: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'), {
    headers: { 'user-agent': 'TestBot/1.0', 'cf-connecting-ip': '203.0.113.1', 'cf-ipcountry': 'KR', ...extra },
  });
}

describe('middleware 임시 UA 로그', () => {
  afterEach(() => vi.restoreAllMocks());

  it('상세·og 경로는 UA를 한 줄 JSON으로 남기고 통과시킨다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = middleware(req('/medical/hospital/110001/79511', { rsc: '1', 'next-router-prefetch': '1' }));
    expect(res.status).toBe(200);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({
      msg: 'ua-probe',
      path: '/medical/hospital/110001/79511',
      rsc: true,
      prefetch: true,
      ua: 'TestBot/1.0',
      ip: '203.0.113.1',
      country: 'KR',
    });
  });

  it('admin 경로는 로그 없이 기존 인증 흐름을 탄다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    middleware(req('/admin'));
    expect(log).not.toHaveBeenCalled();
  });
});
