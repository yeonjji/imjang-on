import { describe, it, expect } from 'vitest';
import { buildGuideSlug } from '@/lib/guide/slug';

describe('buildGuideSlug', () => {
  it('제목을 정규화한 evergreen slug(날짜 없음)를 만든다', () => {
    const s = buildGuideSlug('야간·공휴일 약국 찾는 법');
    expect(s).not.toMatch(/^\d{4}-\d{2}-\d{2}/); // board와 달리 날짜 prefix 없음
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toContain(' ');
  });
  it('충돌 시 suffix(>=2)를 붙인다', () => {
    const base = buildGuideSlug('전세가율 이해하기');
    expect(buildGuideSlug('전세가율 이해하기', 2)).toBe(`${base}-2`);
    expect(buildGuideSlug('전세가율 이해하기', 1)).toBe(base); // 1은 무접미
  });
});
