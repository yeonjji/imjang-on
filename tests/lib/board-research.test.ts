import { describe, it, expect } from 'vitest';
import { researchTopic } from '@/lib/board/research';

const CREDS = { clientId: 'id', clientSecret: 'secret' };
const TODAY = new Date('2026-06-23T00:00:00Z');

/** URL별로 응답을 라우팅하는 fake fetch. */
function routedFetch(routes: { search: unknown; pages: Record<string, string> }): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('openapi.naver.com')) {
      return { ok: true, json: async () => routes.search } as Response;
    }
    const html = routes.pages[url];
    if (html == null) return { ok: false, text: async () => '' } as Response;
    return { ok: true, text: async () => html } as Response;
  }) as unknown as typeof fetch;
}

const LONG = '국토교통부는 전세 사기 피해자 지원 대책을 발표했다. '.repeat(40); // >800자

describe('researchTopic', () => {
  it('공공누리 제1유형 공식 페이지만 근거로 채택', async () => {
    const search = {
      items: [
        { title: '전세사기 대책', link: 'https://www.korea.kr/news/a', description: '스니펫텍스트유니크토큰' },
        { title: '뉴스기사', link: 'https://news.naver.com/x', description: '뉴스' },
      ],
    };
    const pages = { 'https://www.korea.kr/news/a': `<html><body><p>${LONG}</p><footer>공공누리 제1유형</footer></body></html>` };
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).not.toBeNull();
    expect(r.grounded!.sourceUrl).toBe('https://www.korea.kr/news/a');
    expect(r.grounded!.sourceName).toBe('정책브리핑');
    // 뉴스 도메인은 후보에서 제외(추출 시도조차 안 함)
    expect(r.candidates.some((c) => c.domain.includes('naver.com'))).toBe(false);
  });

  it('스니펫은 sourceText/근거에 들어가지 않는다', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: '스니펫텍스트유니크토큰' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>공공누리 제1유형` };
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded!.sourceText).not.toContain('스니펫텍스트유니크토큰');
    expect(r.grounded!.sourceText).toContain('국토교통부는');
  });

  it('공공누리 마커 없으면(unknown) 배제 → grounded null', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>` }; // 마커 없음
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates[0].koglType).toBe('unknown');
    expect(r.candidates[0].usable).toBe(false);
  });

  it('자격증명 없으면 검색 0건 → grounded null(graceful)', async () => {
    const r = await researchTopic('x', TODAY, { clientId: '', clientSecret: '', fetchImpl: routedFetch({ search: {}, pages: {} }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates).toEqual([]);
  });
});
