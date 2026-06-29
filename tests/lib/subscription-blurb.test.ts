import { describe, it, expect } from 'vitest';
import { subscriptionBlurb } from '@/lib/seo/blurb';

describe('subscriptionBlurb', () => {
  it('지역·세대수·접수일정을 한 문단으로 조립한다', () => {
    const text = subscriptionBlurb({
      name: '힐스테이트 강남',
      regionName: '서울 강남구',
      categoryLabel: '민영',
      totalSupply: 1200,
      receiptBegin: new Date('2026-07-01'),
      receiptEnd: new Date('2026-07-03'),
    });
    expect(text).toContain('힐스테이트 강남');
    expect(text).toContain('서울 강남구');
    expect(text).toContain('1,200세대');
    expect(text).toContain('2026.07.01~2026.07.03');
    expect(text).toContain('청약입니다');
  });

  it('접수 시작일만 있으면 "...부터"로 폴백한다', () => {
    const text = subscriptionBlurb({
      name: '시작만단지',
      regionName: '경기 성남시',
      categoryLabel: '민영',
      totalSupply: 300,
      receiptBegin: new Date('2026-07-01'),
      receiptEnd: null,
    });
    expect(text).toContain('2026.07.01부터');
  });

  it('데이터가 비면 우아하게 폴백한다(세대수 생략, 일정 안내문)', () => {
    const text = subscriptionBlurb({
      name: '무명단지',
      regionName: null,
      categoryLabel: '국민',
      totalSupply: null,
      receiptBegin: null,
      receiptEnd: null,
    });
    expect(text).toContain('공급되는');
    expect(text).toContain('접수 일정은 공고에서 확인하세요');
    expect(text).not.toContain('세대 규모');
  });
});
