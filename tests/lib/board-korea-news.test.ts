import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  fetchWindow,
  _resetKoreaNewsCache,
  scoreArticle,
  matchArticles,
  collectKoreaNews,
  type KoreaNewsArticle,
} from '@/lib/board/sources/korea-news';

const SAMPLE = readFileSync(fileURLToPath(new URL('./fixtures/korea-news-sample.xml', import.meta.url)), 'utf8');

function fakeFetch(xml: string, status = 200): typeof fetch {
  return (async () => ({ ok: status === 200, status, text: async () => xml } as Response)) as unknown as typeof fetch;
}

describe('fetchWindow', () => {
  beforeEach(() => _resetKoreaNewsCache());

  it('실제 <NewsItem> 구조를 KoreaNewsArticle[]로 파싱(제목·URL·본문·KoglType)', async () => {
    const arts = await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts).toHaveLength(3); // 배열 <NewsItem> 3건
    const a = arts[0];
    expect(a.title).toBe('전세보증금 반환보증 제도 개편');
    expect(a.url).toMatch(/^https:\/\/www\.korea\.kr\/news/);
    expect(a.koglType).toBe('1');
    expect(a.body).not.toContain('<'); // 평문화
  });

  it('KoglType 필드를 그대로 옮긴다(제1·제4유형 구분)', async () => {
    const arts = await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts.map((a) => a.koglType)).toEqual(['1', '1', '4']);
  });

  it('언론 사진 캡션·저작권 고지(ⓒ뉴스1, 무단 전재)를 본문에서 제거', async () => {
    const arts = await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    const withMedia = arts.find((a) => a.title.includes('전세보증금'))!;
    expect(withMedia.body).not.toContain('무단 전재');
    expect(withMedia.body).not.toContain('뉴스1');
    expect(withMedia.body).toContain('전세보증금'); // 정책 본문 자체는 유지
  });

  it('serviceKey 없으면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260705', '20260707', { serviceKey: '', fetchImpl: fakeFetch(SAMPLE) });
    expect(arts).toEqual([]);
  });

  it('HTTP 오류면 빈 배열(graceful)', async () => {
    const arts = await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: fakeFetch('', 500) });
    expect(arts).toEqual([]);
  });

  it('동일 윈도우 재호출은 캐시 사용(fetch 1회)', async () => {
    let calls = 0;
    const counting = (async () => { calls++; return { ok: true, status: 200, text: async () => SAMPLE } as Response; }) as unknown as typeof fetch;
    await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: counting });
    await fetchWindow('20260705', '20260707', { serviceKey: 'k', fetchImpl: counting });
    expect(calls).toBe(1);
  });
});

describe('matchArticles', () => {
  const arts: KoreaNewsArticle[] = [
    { title: '전세보증금 반환보증 개편', url: 'https://www.korea.kr/a', body: '전세 보증 관련 상세 내용', agency: '정책브리핑', koglType: '1' },
    { title: '청년 자산형성 지원', url: 'https://www.korea.kr/b', body: '청약 및 대출 관련 내용 전세 언급 한번', agency: '정책브리핑', koglType: '1' },
    { title: '농업 통계 발표', url: 'https://www.korea.kr/c', body: '농산물 가격 동향', agency: '정책브리핑', koglType: '1' },
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
    // '전세 청약 관련'은 arts[0](score 5)과 arts[1](score 3) 모두 MIN_SCORE 통과 → slice 동작 검증
    expect(matchArticles(arts, '전세 청약 관련', 1)).toHaveLength(1);
    expect(matchArticles(arts, '전세 청약 관련', 2)).toHaveLength(2);
  });

  it('빈 주제 토큰이면 빈 배열', () => {
    expect(matchArticles(arts, '  ', 3)).toEqual([]);
  });
});

describe('collectKoreaNews', () => {
  beforeEach(() => _resetKoreaNewsCache());

  it('serviceKey 없으면 빈 배열', async () => {
    const r = await collectKoreaNews('전세', new Date('2026-07-07T00:00:00Z'), { serviceKey: '' });
    expect(r).toEqual([]);
  });

  it('빈 주제면 API 호출 없이 빈 배열', async () => {
    let calls = 0;
    const counting = (async () => { calls++; return { ok: true, status: 200, text: async () => SAMPLE } as Response; }) as unknown as typeof fetch;
    const r = await collectKoreaNews('   ', new Date('2026-07-07T00:00:00Z'), { serviceKey: 'k', fetchImpl: counting });
    expect(r).toEqual([]);
    expect(calls).toBe(0);
  });

  it('여러 3일 청크를 합쳐 매칭(중복 URL 제거)', async () => {
    // 모든 윈도우가 동일 픽스처를 반환 → dedup으로 3건만 남아야 함
    const r = await collectKoreaNews('전세보증', new Date('2026-07-07T00:00:00Z'), { serviceKey: 'k', fetchImpl: fakeFetch(SAMPLE) });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].title).toContain('전세보증금');
    expect(r[0].koglType).toBe('1');
    expect(r[0].body).not.toContain('무단 전재');
    // 동일 기사가 중복으로 들어오지 않음
    expect(new Set(r.map((a) => a.url)).size).toBe(r.length);
  });
});
