import { describe, it, expect } from 'vitest';
import { isRelevant, isExcluded, categoryHint, matchedKeywords } from '@/scripts/ingest/posts/relevance';

describe('isRelevant', () => {
  it('화이트리스트 부처 + 키워드 + 제외어 없음이면 통과', () => {
    expect(isRelevant({ agency: '국토교통부', title: '디딤돌 대출 한도 상향', bodyText: '주택 구입 자금' })).toBe(true);
    expect(isRelevant({ agency: '한국은행', title: '기준금리 동결', bodyText: '통화정책방향 결정' })).toBe(true);
  });
  it('화이트리스트 밖 부처는 탈락(무관 기관 제거)', () => {
    expect(isRelevant({ agency: '농촌진흥청', title: '고유가 농식품 조사', bodyText: '가계 부담' })).toBe(false);
  });
  it('화이트리스트 부처라도 관련 키워드 없으면 탈락', () => {
    expect(isRelevant({ agency: '기획재정부', title: 'APEC 정상회의 참석', bodyText: '외교 일정' })).toBe(false);
  });
  it('제외어(인사·거시통계)면 키워드 있어도 탈락', () => {
    // 한국은행 정례 노이즈 — 인사/지수/사용실적 등
    expect(isRelevant({ agency: '한국은행', title: '부총재보 인사', bodyText: '금융 관련' })).toBe(false);
    expect(isRelevant({ agency: '한국은행', title: '수출입물가지수', bodyText: '대출' })).toBe(false);
    expect(isRelevant({ agency: '한국은행', title: '예금취급기관 산업별 대출금', bodyText: '대출 통계' })).toBe(false);
  });
  it('agency null이면 탈락', () => {
    expect(isRelevant({ agency: null, title: '대출 금리 인하', bodyText: '주택' })).toBe(false);
  });
});

describe('isExcluded', () => {
  it('인사·통계 마커를 잡는다', () => {
    expect(isExcluded('부총재보 인사')).toBe(true);
    expect(isExcluded('5월 수출입물가지수')).toBe(true);
    expect(isExcluded('국민계정 잠정치')).toBe(true);
  });
  it('정책·제도 제목은 통과', () => {
    expect(isExcluded('디딤돌 대출 한도 상향')).toBe(false);
    expect(isExcluded('뉴홈 사전청약 공고')).toBe(false);
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
    expect(matchedKeywords('주택 대출 청약')).toContain('대출');
  });
});
