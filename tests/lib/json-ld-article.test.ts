import { describe, it, expect } from 'vitest';
import { articleSchema } from '@/lib/seo/json-ld';

describe('articleSchema', () => {
  it('NewsArticle 스키마를 생성한다', () => {
    const s = articleSchema({ headline: '디딤돌 대출 한도 상향', url: 'https://imjangon.co.kr/board/test', datePublished: '2026-06-12', description: '요약' });
    expect(s['@type']).toBe('NewsArticle');
    expect(s.headline).toBe('디딤돌 대출 한도 상향');
    expect(s.url).toBe('https://imjangon.co.kr/board/test');
    expect(s.datePublished).toBe('2026-06-12');
    expect((s.publisher as Record<string, unknown>)['@type']).toBe('Organization');
  });
});
