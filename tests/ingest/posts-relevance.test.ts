import { describe, it, expect } from 'vitest';
import { isRelevant, categoryHint, matchedKeywords } from '@/scripts/ingest/posts/relevance';

describe('isRelevant', () => {
  it('화이트리스트 부처 + 키워드면 통과', () => {
    expect(isRelevant({ agency: '국토교통부', title: '디딤돌 대출 한도 상향', bodyText: '주택 구입 자금' })).toBe(true);
    expect(isRelevant({ agency: '한국은행', title: '기준금리 동결', bodyText: '통화정책방향' })).toBe(true);
  });
  it('화이트리스트 밖 부처는 키워드 있어도 탈락(무관 기관 제거)', () => {
    // 농촌진흥청 고유가/물가 보도 — 물가 키워드 있어도 부처가 화이트리스트 밖이라 탈락
    expect(isRelevant({ agency: '농촌진흥청', title: '고유가 농식품 조사', bodyText: '물가 상승 가계 부담' })).toBe(false);
  });
  it('화이트리스트 부처라도 관련 키워드 없으면 탈락', () => {
    expect(isRelevant({ agency: '기획재정부', title: 'APEC 정상회의 참석', bodyText: '외교 일정' })).toBe(false);
  });
  it('agency null이면 탈락', () => {
    expect(isRelevant({ agency: null, title: '대출 금리 인하', bodyText: '주택' })).toBe(false);
  });
});

describe('categoryHint', () => {
  it('청약 우선', () => expect(categoryHint('공공분양 청약 일정 안내')).toBe('SUBSCRIPTION'));
  it('대출 키워드', () => expect(categoryHint('디딤돌 대출 한도')).toBe('LOAN'));
  it('부동산', () => expect(categoryHint('아파트 매매 동향')).toBe('REALESTATE'));
  it('매칭 없으면 null', () => expect(categoryHint('무관한 내용')).toBeNull());
});

describe('matchedKeywords', () => {
  it('여러 키워드 수집', () => {
    expect(matchedKeywords('주택 대출 청약').sort()).toContain('대출');
  });
});
