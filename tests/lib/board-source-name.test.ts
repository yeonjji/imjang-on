import { describe, it, expect } from 'vitest';
import { sanitizeSourceName, canonicalizeSourceName } from '@/lib/board/source-name';

describe('sanitizeSourceName', () => {
  it('크롤 네비 찌꺼기를 제거한다(공백 없이 붙은 경우 포함)', () => {
    expect(sanitizeSourceName('기후에너지환경부부처별 뉴스 이동')).toBe('기후에너지환경부');
    expect(sanitizeSourceName('국토교통부 본문 바로가기')).toBe('국토교통부');
    expect(sanitizeSourceName('금융위원회 출처 이동')).toBe('금융위원회');
  });
  it('앞뒤 공백·중복 공백을 정리한다', () => {
    expect(sanitizeSourceName('  국토교통부   ')).toBe('국토교통부');
  });
  it('찌꺼기 없는 값은 그대로 둔다(비손실)', () => {
    expect(sanitizeSourceName('정책브리핑')).toBe('정책브리핑');
    expect(sanitizeSourceName('임장ON 청약 집계(원자료: 청약홈·LH)')).toBe(
      '임장ON 청약 집계(원자료: 청약홈·LH)',
    );
  });
  it('빈/누락 입력은 빈 문자열', () => {
    expect(sanitizeSourceName('')).toBe('');
    expect(sanitizeSourceName('   ')).toBe('');
  });
});

describe('canonicalizeSourceName', () => {
  it('정식 기관명은 그대로 유지', () => {
    expect(canonicalizeSourceName('정책브리핑')).toBe('정책브리핑');
    expect(canonicalizeSourceName('한국은행')).toBe('한국은행');
    expect(canonicalizeSourceName('금융위원회')).toBe('금융위원회');
  });
  it('장황한 서술형을 짧은 정식 기관명으로 축약', () => {
    expect(canonicalizeSourceName('한국주택금융공사(HF) 디딤돌대출 상품소개·금리안내')).toBe(
      '한국주택금융공사',
    );
    expect(canonicalizeSourceName('국토교통부 「주택공급에 관한 규칙」')).toBe('국토교통부');
    expect(canonicalizeSourceName('대한민국 정책브리핑(국토교통부)')).toBe('정책브리핑');
    expect(canonicalizeSourceName('한국부동산원 「2026년 5월 전국주택가격동향조사」')).toBe(
      '한국부동산원',
    );
    expect(canonicalizeSourceName('주택도시보증공사(HUG) 주택정보포털 HOUSTA')).toBe(
      '주택도시보증공사',
    );
    expect(canonicalizeSourceName('법제처 국가법령정보센터(지방세법·지방세특례제한법)')).toBe(
      '국가법령정보센터',
    );
  });
  it('개별 등재한 공공 사이트 host를 정식 명칭으로', () => {
    expect(canonicalizeSourceName('www.nabis.go.kr')).toBe('균형발전종합정보시스템');
    expect(canonicalizeSourceName('www.sejong.go.kr')).toBe('세종특별자치시');
  });
  it('임장ON 자체 집계는 청약홈보다 우선해 자체 라벨로', () => {
    expect(canonicalizeSourceName('임장ON 청약 집계(원자료: 청약홈·LH)')).toBe('임장ON 청약 집계');
  });
  it('크롤 찌꺼기는 제거 후 매핑 없으면 정제값 유지', () => {
    expect(canonicalizeSourceName('기후에너지환경부부처별 뉴스 이동')).toBe('기후에너지환경부');
  });
  it('매핑 없는 raw host는 스킴·www를 벗겨 읽기 쉽게', () => {
    expect(canonicalizeSourceName('www.data.go.kr')).toBe('data.go.kr');
    expect(canonicalizeSourceName('https://www.example.go.kr')).toBe('example.go.kr');
  });
});
