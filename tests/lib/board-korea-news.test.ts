import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchWindow, _resetKoreaNewsCache } from '@/lib/board/sources/korea-news';

const SAMPLE = readFileSync(fileURLToPath(new URL('./fixtures/korea-news-sample.xml', import.meta.url)), 'utf8');

function fakeFetch(xml: string, status = 200): typeof fetch {
  return (async () => ({ ok: status === 200, status, text: async () => xml } as Response)) as unknown as typeof fetch;
}

describe('fetchWindow', () => {
  beforeEach(() => _resetKoreaNewsCache());

  it('정상 XML을 KoreaNewsArticle[]로 파싱', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts.length).toBeGreaterThan(0);
    const a = arts[0];
    expect(a.title.length).toBeGreaterThan(0);
    expect(a.url).toMatch(/^https?:\/\//);
    expect(a.body.length).toBeGreaterThan(0);
    // 본문은 HTML 태그가 제거된 평문
    expect(a.body).not.toContain('<');
  });

  it('serviceKey 없으면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: '', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts).toEqual([]);
  });

  it('HTTP 오류면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: fakeFetch('', 500) });
    expect(arts).toEqual([]);
  });

  it('동일 윈도우 재호출은 캐시 사용(fetch 1회)', async () => {
    let calls = 0;
    const counting = (async () => { calls++; return { ok: true, status: 200, text: async () => SAMPLE } as Response; }) as unknown as typeof fetch;
    await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: counting });
    await fetchWindow('20260601', '20260607', { serviceKey: 'k', fetchImpl: counting });
    expect(calls).toBe(1);
  });
});
