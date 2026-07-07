import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchWindow, _resetKoreaNewsCache, scoreArticle, matchArticles, collectKoreaNews } from '@/lib/board/sources/korea-news';

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

describe('matchArticles', () => {
  const arts = [
    { title: '전세보증금 반환보증 개편', url: 'https://www.korea.kr/a', body: '전세 보증 관련 상세 내용', agency: '정책브리핑' },
    { title: '청년 자산형성 지원', url: 'https://www.korea.kr/b', body: '청약 및 대출 관련 내용 전세 언급 한번', agency: '정책브리핑' },
    { title: '농업 통계 발표', url: 'https://www.korea.kr/c', body: '농산물 가격 동향', agency: '정책브리핑' },
  ];

  it('제목 매칭이 본문 매칭보다 높은 점수', () => {
    const tokens = ['전세'];
    expect(scoreArticle(arts[0], tokens)).toBeGreaterThan(scoreArticle(arts[1], tokens));
  });

  it('관련 기사만 점수 임계 이상으로 상위 반환', () => {
    const m = matchArticles(arts, '전세보증', 3);
    expect(m[0].url).toBe('https://www.korea.kr/a');
    expect(m.some((a) => a.url === 'https://www.korea.kr/c')).toBe(false); // 무관 기사 배제
  });

  it('limit 준수', () => {
    expect(matchArticles(arts, '전세 청약', 1)).toHaveLength(1);
  });

  it('빈 주제 토큰이면 빈 배열', () => {
    expect(matchArticles(arts, '  ', 3)).toEqual([]);
  });
});

describe('collectKoreaNews', () => {
  beforeEach(() => _resetKoreaNewsCache());
  it('serviceKey 없으면 빈 배열', async () => {
    const r = await collectKoreaNews('전세', new Date('2026-06-23T00:00:00Z'), { serviceKey: '' });
    expect(r).toEqual([]);
  });
});
