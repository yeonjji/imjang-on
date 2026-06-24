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

  it('마커 없어도(unknown) 공식 도메인이면 사용 → grounded 생성(공공저작물 자유이용)', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>` }; // 공공누리 마커 없음
    const r = await researchTopic('전세 사기', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).not.toBeNull();
    expect(r.candidates[0].koglType).toBe('unknown');
    expect(r.candidates[0].usable).toBe(true);
  });

  it('명시적 공공누리 제2유형(상업금지)은 배제 → grounded null', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>공공누리 제2유형` };
    const r = await researchTopic('x', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates[0].koglType).toBe('2');
    expect(r.candidates[0].usable).toBe(false);
  });

  it('script/style 내용은 근거 본문에서 제거된다', async () => {
    const search = { items: [{ title: 't', link: 'https://www.korea.kr/news/a', description: 's' }] };
    const pages = { 'https://www.korea.kr/news/a': `<script>var x='SCRIPTNOISE토큰';</script><p>${LONG}</p>` };
    const r = await researchTopic('x', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded).not.toBeNull();
    expect(r.grounded!.sourceText).not.toContain('SCRIPTNOISE토큰');
    expect(r.grounded!.sourceText).toContain('국토교통부는');
  });

  it('자격증명 없으면 검색 0건 → grounded null(graceful)', async () => {
    const r = await researchTopic('x', TODAY, { clientId: '', clientSecret: '', fetchImpl: routedFetch({ search: {}, pages: {} }) });
    expect(r.grounded).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it('동일 URL 중복은 한 번만 처리(중복 React key·이중 근거 방지)', async () => {
    const search = {
      items: [
        { title: 'a', link: 'https://www.korea.kr/news/a', description: 's' },
        { title: 'a 중복', link: 'https://www.korea.kr/news/a', description: 's' },
      ],
    };
    const pages = { 'https://www.korea.kr/news/a': `<p>${LONG}</p>공공누리 제1유형` };
    const r = await researchTopic('x', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.candidates).toHaveLength(1);
    expect(r.grounded!.used).toHaveLength(1);
  });

  it('복수 사용가능 출처: korea.kr 대표, sourceText엔 둘 다·excerpt는 대표만', async () => {
    const goBody = `GOKR고유본문 ${'국토부 정책 상세 내용. '.repeat(100)}`;
    const search = {
      items: [
        { title: 'go', link: 'https://www.molit.go.kr/p', description: 's' },
        { title: 'korea', link: 'https://www.korea.kr/news/b', description: 's' },
      ],
    };
    const pages = {
      'https://www.molit.go.kr/p': `<p>${goBody}</p>공공누리 제1유형`,
      'https://www.korea.kr/news/b': `<p>${LONG}</p>공공누리 제1유형`,
    };
    const r = await researchTopic('x', TODAY, { ...CREDS, fetchImpl: routedFetch({ search, pages }) });
    expect(r.grounded!.sourceUrl).toBe('https://www.korea.kr/news/b'); // korea.kr 우선
    expect(r.grounded!.used).toHaveLength(2);
    expect(r.grounded!.sourceText).toContain('GOKR고유본문'); // 두 출처 모두 근거에
    expect(r.grounded!.sourceText).toContain('국토교통부는');
    expect(r.grounded!.sourceExcerpt).not.toContain('GOKR고유본문'); // excerpt는 대표(korea)만
  });

  it('리다이렉트로 허용외 호스트 도달 시 배제', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.includes('openapi.naver.com')) {
        return { ok: true, json: async () => ({ items: [{ title: 't', link: 'https://www.korea.kr/r', description: 's' }] }) } as Response;
      }
      // 최종 도달 URL이 허용외 호스트(리다이렉트)
      return { ok: true, url: 'https://evil.com/x', text: async () => `<p>${LONG}</p>공공누리 제1유형` } as Response;
    }) as unknown as typeof fetch;
    const r = await researchTopic('x', TODAY, { ...CREDS, fetchImpl });
    expect(r.grounded).toBeNull();
  });
});
