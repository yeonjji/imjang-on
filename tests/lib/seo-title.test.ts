import { describe, it, expect } from 'vitest';
import { qualifiedTitle } from '@/lib/seo/title';

describe('qualifiedTitle', () => {
  it('qualifier가 있으면 이름 뒤 괄호로 붙인다', () => {
    expect(qualifiedTitle('서울치과의원', '강남구', '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 (강남구) — 치과의원 정보·주변 아파트');
  });

  it('시도가 붙은 qualifier도 그대로 넣는다', () => {
    expect(qualifiedTitle('하나약국', '부산 중구', '— 약국 정보·주변 아파트'))
      .toBe('하나약국 (부산 중구) — 약국 정보·주변 아파트');
  });

  // 지역 해석 실패가 회귀를 만들지 않는다는 것이 이 함수의 핵심 계약이다.
  it('qualifier가 null이면 접미사 없이 기존 문자열을 낸다', () => {
    expect(qualifiedTitle('서울치과의원', null, '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 — 치과의원 정보·주변 아파트');
  });

  it('qualifier가 빈 문자열이어도 접미사를 만들지 않는다', () => {
    expect(qualifiedTitle('서울치과의원', '', '— 치과의원 정보·주변 아파트'))
      .toBe('서울치과의원 — 치과의원 정보·주변 아파트');
  });

  it('tail이 구분자를 직접 들고 있어도 강제하지 않는다', () => {
    expect(qualifiedTitle('햇살론15', '서민금융진흥원', '한도·금리 — 주거금융'))
      .toBe('햇살론15 (서민금융진흥원) 한도·금리 — 주거금융');
  });
});
