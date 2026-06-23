import { describe, it, expect } from 'vitest';
import { isAllowedDomain, detectKoglType, isUsableLicense, domainLabel } from '@/lib/board/source-policy';

describe('isAllowedDomain', () => {
  it('korea.kr / go.kr 허용', () => {
    expect(isAllowedDomain('https://www.korea.kr/news/x')).toBe(true);
    expect(isAllowedDomain('https://www.molit.go.kr/a')).toBe(true);
  });
  it('등재된 공공기관 .or.kr만 허용', () => {
    expect(isAllowedDomain('https://www.bok.or.kr/p')).toBe(true);
    expect(isAllowedDomain('https://some-assoc.or.kr/p')).toBe(false); // 민간 협회 차단
  });
  it('뉴스/일반 도메인 차단', () => {
    expect(isAllowedDomain('https://news.naver.com/a')).toBe(false);
    expect(isAllowedDomain('https://blog.example.com')).toBe(false);
  });
  it('잘못된 URL은 false', () => {
    expect(isAllowedDomain('not a url')).toBe(false);
  });
});

describe('detectKoglType', () => {
  it('제1유형 마커를 잡는다', () => {
    expect(detectKoglType('<div>공공누리 제1유형: 출처표시</div>')).toBe('1');
    expect(detectKoglType('<img class="kogl" src="/img/opentype01.png">')).toBe('1');
  });
  it('제2유형', () => {
    expect(detectKoglType('공공누리 제 2 유형(상업적 이용금지)')).toBe('2');
  });
  it('공공누리 언급 없으면 unknown', () => {
    expect(detectKoglType('<div>그냥 정부 페이지</div>')).toBe('unknown');
  });
  it('공공누리는 있으나 유형 불명이면 unknown', () => {
    expect(detectKoglType('본 저작물은 공공누리에 따라 이용 가능')).toBe('unknown');
  });
  it('서로 다른 유형이 섞이면(제2유형 본문 + 푸터 type01 배지) 보수적으로 unknown', () => {
    expect(detectKoglType('공공누리 제2유형 <img src="opentype01.png">')).toBe('unknown');
  });
  it('CSS/JS 파일명의 stray type1 토큰만으론 제1유형으로 오인하지 않는다', () => {
    expect(detectKoglType('공공누리 <link href="content-type01.css">')).toBe('unknown');
  });
  it('제3유형 본문 + 무관한 type1.css → 제3유형으로 인식(상충 아님)', () => {
    expect(detectKoglType('공공누리 제3유형 <link href="type1.css">')).toBe('3');
  });
});

describe('isUsableLicense', () => {
  it('제1유형만 사용 가능', () => {
    expect(isUsableLicense('1')).toBe(true);
    expect(isUsableLicense('2')).toBe(false);
    expect(isUsableLicense('unknown')).toBe(false);
  });
});

describe('domainLabel', () => {
  it('알려진 도메인은 한글 라벨', () => {
    expect(domainLabel('www.korea.kr')).toBe('정책브리핑');
  });
  it('모르면 호스트 그대로', () => {
    expect(domainLabel('www.molit.go.kr')).toBe('www.molit.go.kr');
  });
});
