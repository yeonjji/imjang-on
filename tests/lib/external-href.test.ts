import { describe, it, expect } from 'vitest';
import { externalHref, isLinkableUrl } from '@/lib/external-href';

describe('externalHref', () => {
  it('스킴이 없으면 https를 붙인다', () => {
    expect(externalHref('cafe.daum.net/starlight7053')).toBe('https://cafe.daum.net/starlight7053');
    expect(externalHref('  www.i-sh.co.kr  ')).toBe('https://www.i-sh.co.kr');
  });
  it('이미 절대 URL이면 그대로 둔다', () => {
    expect(externalHref('http://www.i-sh.co.kr/')).toBe('http://www.i-sh.co.kr/');
    expect(externalHref('https://www.law.go.kr/법령/종합부동산세법')).toBe(
      'https://www.law.go.kr/법령/종합부동산세법',
    );
  });
  it('프로토콜 상대경로는 https로 채운다', () => {
    expect(externalHref('//example.go.kr/a')).toBe('https://example.go.kr/a');
  });
});

describe('isLinkableUrl', () => {
  it('URL이 아니라 안내 문구인 값은 링크로 만들지 않는다 — /finance/1 사고', () => {
    // LoanProduct.rawJson.rltsite 운영 실제값들
    expect(isLinkableUrl('취급은행 홈페이지')).toBe(false);
    expect(isLinkableUrl('전북신용보증재단 홈페이지')).toBe(false);
    expect(isLinkableUrl('NH농협은행, 전북은행')).toBe(false);
    expect(isLinkableUrl('대구신용보증재단 홈페이지(https://ttg.co.kr)')).toBe(false);
    expect(isLinkableUrl('재단 홈페이지(www.kosaf.go.kr) > 학자금대출 > 학자금대출 신청')).toBe(
      false,
    );
    expect(isLinkableUrl('한국장학재단 홈페이지>학자금대출>특별상환유예대출')).toBe(false);
  });

  it('공백 없는 한글 문구도 punycode 호스트가 되므로 막는다', () => {
    expect(isLinkableUrl('취급은행홈페이지')).toBe(false);
  });

  it('맨 호스트와 절대 URL은 링크로 만든다', () => {
    expect(isLinkableUrl('www.gnsinbo.or.kr')).toBe(true);
    expect(isLinkableUrl('www.ols.semas.or.kr')).toBe(true);
    expect(isLinkableUrl('https://ttg.co.kr')).toBe(true);
    expect(isLinkableUrl('http://www.i-sh.co.kr/app/index.do')).toBe(true);
  });

  it('경로·쿼리의 한글은 링크를 막지 않는다', () => {
    expect(isLinkableUrl('https://www.law.go.kr/법령/종합부동산세법')).toBe(true);
  });

  it('빈 값·점 없는 호스트·비http 스킴은 막는다', () => {
    expect(isLinkableUrl('')).toBe(false);
    expect(isLinkableUrl('   ')).toBe(false);
    expect(isLinkableUrl('-')).toBe(false);
    expect(isLinkableUrl('mailto:a@b.co.kr')).toBe(false);
  });
});
