import { describe, it, expect } from 'vitest';
import { buildGuideDraft } from '@/lib/guide/draft';
import { GUIDE_SEEDS } from '@/lib/guide/seeds';
import { GuideCategory } from '@prisma/client';

const seed = GUIDE_SEEDS.find((s) => s.category === GuideCategory.REALESTATE)!;
const llm = { title: '실거래가 읽는 법', summary: '요약', body: '본문 '.repeat(200) };

describe('buildGuideDraft', () => {
  it('시드+LLM 결과를 Guide insert 객체로 조립한다', () => {
    const d = buildGuideDraft(seed, llm);
    expect(d.category).toBe(seed.category);
    expect(d.dedupeKey).toBe(seed.key);            // 재생성 방지 키 = 시드 키
    expect(d.title).toBe('실거래가 읽는 법');
    expect(d.slug.length).toBeGreaterThan(0);
    expect(d.sourceName).toBe(seed.source.name);
    expect(d.sourceUrl).toBe(seed.source.url);
    expect(d.sourceDate).toBeInstanceOf(Date);      // ISO → Date 변환
    expect(d.sourceExcerpt).toBe(seed.source.excerpt);
  });
});
