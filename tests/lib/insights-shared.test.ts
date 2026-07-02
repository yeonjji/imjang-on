import { describe, it, expect } from 'vitest';
import { accessInsight, priceContextInsight, assembleNarrative } from '@/lib/insights/shared';

describe('accessInsight', () => {
  it('역+인프라≥2면 발화, 도보분 계산', () => {
    const r = accessInsight({
      nearestStation: { name: '상현역', lines: ['신분당선'], distanceMeters: 400 },
      infra: [{ label: '카페', count: 8 }, { label: '병원', count: 2 }],
    })!;
    expect(r.key).toBe('access');
    expect(r.text).toContain('상현역');
    expect(r.text).toContain('도보 약 5분');
  });
  it('역 없고 인프라<2면 null', () => {
    expect(accessInsight({ nearestStation: null, infra: [{ label: '카페', count: 8 }] })).toBeNull();
  });
});

describe('priceContextInsight', () => {
  it('표본≥3이면 억 범위 발화', () => {
    const r = priceContextInsight({ nearbyAptSaleManwon: [90000, 120000, 165000] })!;
    expect(r.key).toBe('price');
    expect(r.text).toContain('9억');
    expect(r.text).toContain('16.5억');
  });
  it('표본<3이면 null', () => {
    expect(priceContextInsight({ nearbyAptSaleManwon: [90000, 120000] })).toBeNull();
  });
});

describe('assembleNarrative', () => {
  const A = { key: 'a', text: 'A문장입니다.' };
  const B = { key: 'b', text: 'B문장입니다.' };
  const C = { key: 'c', text: 'C문장입니다.' };
  it('발화≥minFired & requireKey 충족 시 첫 문장에 이름 prefix', () => {
    const n = assembleNarrative('○○원', [A, B, C, null], { minFired: 3, requireKeys: ['b'] })!;
    expect(n.sentences).toHaveLength(3);
    expect(n.sentences[0].startsWith('○○원은')).toBe(true);
    expect(n.text).toBe('○○원은 A문장입니다. B문장입니다. C문장입니다.');
    expect(n.fired).toEqual(['a', 'b', 'c']);
  });
  it('발화<minFired면 null', () => {
    expect(assembleNarrative('x', [A, B, null], { minFired: 3, requireKeys: ['a'] })).toBeNull();
  });
  it('requireKey 미발화면 null', () => {
    expect(assembleNarrative('x', [A, B, C], { minFired: 3, requireKeys: ['z'] })).toBeNull();
  });
});
