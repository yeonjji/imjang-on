import { describe, it, expect } from 'vitest';
import { subscriptionChangeFrequency } from '@/lib/sitemap/sources';

const NOW = new Date('2026-08-12');

describe('청약 사이트맵 changefreq', () => {
  it('마감된 공고는 yearly', () => {
    expect(subscriptionChangeFrequency(new Date('2020-01-01'), NOW)).toBe('yearly');
  });
  it('진행중·예정은 daily', () => {
    expect(subscriptionChangeFrequency(new Date('2026-12-31'), NOW)).toBe('daily');
  });
  it('마감일이 없으면 daily', () => {
    expect(subscriptionChangeFrequency(null, NOW)).toBe('daily');
  });
  it('오늘 마감이면 아직 daily', () => {
    expect(subscriptionChangeFrequency(NOW, NOW)).toBe('daily');
  });
});
