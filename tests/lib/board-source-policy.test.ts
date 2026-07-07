import { describe, it, expect } from 'vitest';
import { isAllowedDomain, detectKoglType, isUsableLicense, domainLabel, licenseLabel } from '@/lib/board/source-policy';

describe('isAllowedDomain', () => {
  it('korea.kr / go.kr 허용', () => {
    expect(isAllowedDomain('https://www.korea.kr/news/x')).toBe(true);
    expect(isAllowedDomain('https://www.molit.go.kr/a')).toBe(true);
  });
  it('등재된 공공기관 .or.kr만 허용', () => {
    expect(isAllowedDomain('https://www.bok.or.kr/p')).toBe(true);
    expect(isAllowedDomain('https://some-assoc.or.kr/p')).toBe(false); // 민간 협회 차단
  });
  it('등재된 공공기관 확장 호스트 허용', () => {
    expect(isAllowedDomain('https://kosis.kr/statHtml/x')).toBe(true);
    expect(isAllowedDomain('https://www.reb.or.kr/r/a')).toBe(true);
    expect(isAllowedDomain('https://www.khug.or.kr/p')).toBe(true);
    expect(isAllowedDomain('https://www.krihs.re.kr/x')).toBe(true);
    expect(isAllowedDomain('https://www.kdi.re.kr/x')).toBe(true);
  });
  it('미등재 .re.kr/.or.kr은 여전히 차단', () => {
    expect(isAllowedDomain('https://random.re.kr/x')).toBe(false);
    expect(isAllowedDomain('https://some-assoc.or.kr/x')).toBe(false);
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
  it('제한 유형이 섞이면(제2유형 본문 + 푸터 type01 배지) 가장 제한적인 제2유형 반환(배제 대상)', () => {
    expect(detectKoglType('공공누리 제2유형 <img src="opentype01.png">')).toBe('2');
  });
  it('제4유형이 있으면 제4유형(최제한) 반환', () => {
    expect(detectKoglType('공공누리 제1유형 제4유형')).toBe('4');
  });
  it('CSS/JS 파일명의 stray type1 토큰만으론 제1유형으로 오인하지 않는다', () => {
    expect(detectKoglType('공공누리 <link href="content-type01.css">')).toBe('unknown');
  });
  it('제3유형 본문 + 무관한 type1.css → 제3유형으로 인식(상충 아님)', () => {
    expect(detectKoglType('공공누리 제3유형 <link href="type1.css">')).toBe('3');
  });
});

describe('isUsableLicense', () => {
  it('제1유형·마커없음(unknown)은 사용 가능, 제2·3·4유형은 배제', () => {
    expect(isUsableLicense('1')).toBe(true);
    expect(isUsableLicense('unknown')).toBe(true);
    expect(isUsableLicense('2')).toBe(false);
    expect(isUsableLicense('3')).toBe(false);
    expect(isUsableLicense('4')).toBe(false);
  });
});

describe('licenseLabel', () => {
  it('유형 알려지면 공공누리 제N유형, unknown은 공공저작물 표기', () => {
    expect(licenseLabel('1')).toBe('공공누리 제1유형');
    expect(licenseLabel('unknown')).toContain('공공저작물');
  });
});

describe('domainLabel', () => {
  it('알려진 도메인은 한글 라벨', () => {
    expect(domainLabel('www.korea.kr')).toBe('정책브리핑');
  });
  it('확장 공공기관 라벨', () => {
    expect(domainLabel('kosis.kr')).toBe('국가통계포털');
    expect(domainLabel('www.reb.or.kr')).toBe('한국부동산원');
  });
  it('모르면 호스트 그대로', () => {
    expect(domainLabel('www.molit.go.kr')).toBe('www.molit.go.kr');
  });
});
