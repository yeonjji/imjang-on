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
    expect((s.author as { '@type': string })['@type']).toBe('Person');
    expect((s.author as { name: string }).name).toBe(EDITORIAL.name);
  });
});
