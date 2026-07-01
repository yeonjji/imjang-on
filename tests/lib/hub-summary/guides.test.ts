import { describe, it, expect } from 'vitest';
import { getHubGuide, type HubGuideKey } from '@/lib/hub-summary/guides';

const ALL_KEYS: HubGuideKey[] = [
  'apt','officetel','villa','subscription','school','childcare',
  'hospital','pharmacy','convenience','mart','cafe','market',
  'parking','park','charger',
];

describe('getHubGuide', () => {
  it('15개 카테고리 전부 비지 않은 문단을 가진다', () => {
    for (const k of ALL_KEYS) {
      const g = getHubGuide(k);
      expect(g, k).toBeTruthy();
      expect(g!.length, k).toBeGreaterThan(20);
    }
  });

  it('광고성/과장 표현이 없다', () => {
    const banned = ['최고', '최저가', '무조건', '대박', '강력 추천', '완벽'];
    for (const k of ALL_KEYS) {
      const g = getHubGuide(k)!;
      for (const w of banned) expect(g.includes(w), `${k}:${w}`).toBe(false);
    }
  });

  it('미지의 키는 null', () => {
    expect(getHubGuide('nope')).toBeNull();
  });
});
