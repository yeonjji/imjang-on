import { describe, it, expect } from 'vitest';
import { articleSchema } from '@/lib/seo/json-ld';
import { EDITORIAL } from '@/lib/editorial';

describe('articleSchema', () => {
  it('NewsArticle 스키마를 생성한다', () => {
    const s = articleSchema({ headline: '디딤돌 대출 한도 상향', url: 'https://imjangon.co.kr/board/test', datePublished: '2026-06-12', description: '요약', image: 'https://imjangon.co.kr/board/test/thumbnail' });
    expect(s['@type']).toBe('NewsArticle');
    expect(s.headline).toBe('디딤돌 대출 한도 상향');
    expect(s.url).toBe('https://imjangon.co.kr/board/test');
    expect(s.datePublished).toBe('2026-06-12');
    expect((s.publisher as Record<string, unknown>)['@type']).toBe('Organization');
    // 본문은 언어모델 초안을 운영자가 검수해 게시한다 → 자연인 집필을 단언하는 Person은 쓰지 않는다.
    expect((s.author as Record<string, unknown>)['@type']).toBe('Organization');
    expect((s.author as { name: string }).name).toBe(EDITORIAL.name);
    expect(s.image).toBe('https://imjangon.co.kr/board/test/thumbnail');
  });
});
