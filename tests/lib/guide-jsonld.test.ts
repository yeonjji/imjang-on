import { describe, it, expect } from 'vitest';
import { guideArticleSchema } from '@/lib/seo/json-ld';
import { EDITORIAL } from '@/lib/editorial';

describe('guideArticleSchema', () => {
  it('Article 타입 JSON-LD를 만든다', () => {
    const s = guideArticleSchema({
      headline: '실거래가 읽는 법',
      url: 'https://imjangon.co.kr/guide/실거래가-읽는-법',
      description: '실거래가의 의미',
      datePublished: '2026-06-29',
    });
    expect(s['@type']).toBe('Article');
    expect(s.headline).toBe('실거래가 읽는 법');
    expect((s.publisher as { name: string }).name).toBe('임장ON');
    // 본문은 언어모델 초안을 운영자가 검수해 게시한다 → 자연인 집필을 단언하는 Person은 쓰지 않는다.
    expect((s.author as { '@type': string })['@type']).toBe('Organization');
    expect((s.author as { name: string }).name).toBe(EDITORIAL.name);
  });
});
