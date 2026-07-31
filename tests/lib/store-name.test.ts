import { describe, it, expect } from 'vitest';
import { displayStoreName } from '@/lib/amenity/store-name';

const split = { splitBrand: true };

describe('displayStoreName — 브랜드 분리(편의점)', () => {
  it('brchNm 꼬리를 결합하고 브랜드 뒤에 공백을 넣는다', () => {
    expect(displayStoreName({ name: '씨유켄싱턴리조트', branchName: '남원점' }, split))
      .toBe('씨유 켄싱턴리조트남원점');
    expect(displayStoreName({ name: '미니스톱', branchName: '서울역점' }, split))
      .toBe('미니스톱 서울역점');
    expect(displayStoreName({ name: '이마트24R정왕', branchName: '행복점' }, split))
      .toBe('이마트24 R정왕행복점');
  });

  it('brchNm이 없으면 name만으로 분리한다', () => {
    expect(displayStoreName({ name: '세븐일레븐포이중앙', branchName: null }, split))
      .toBe('세븐일레븐 포이중앙');
    expect(displayStoreName({ name: '씨유중구정동길점', branchName: '' }, split))
      .toBe('씨유 중구정동길점');
  });

  it('운영사 노이즈 코리아를 버리고 점주 꼬리를 점으로 되돌린다', () => {
    expect(displayStoreName({ name: '세븐혜화점주', branchName: '코리아' }, split))
      .toBe('세븐 혜화점');
    expect(displayStoreName({ name: '세븐효창공원점', branchName: '코리아' }, split))
      .toBe('세븐 효창공원점');
  });

  it('브랜드는 최장 일치로 고른다', () => {
    // '세븐'이 아니라 '세븐일레븐'
    expect(displayStoreName({ name: '세븐일레븐영등포', branchName: '본점' }, split))
      .toBe('세븐일레븐 영등포본점');
    // '지에스'가 아니라 '지에스25'
    expect(displayStoreName({ name: '지에스25익산', branchName: '오거리점' }, split))
      .toBe('지에스25 익산오거리점');
    // 25 없는 표기도 잡는다
    expect(displayStoreName({ name: '지에스노원하계점', branchName: null }, split))
      .toBe('지에스 노원하계점');
  });
});

describe('displayStoreName — 폴백', () => {
  it('브랜드를 못 찾으면 결합 결과를 그대로 준다', () => {
    expect(displayStoreName({ name: '금성세일마트', branchName: null }, split))
      .toBe('금성세일마트');
  });

  it('지점부가 비면 원본 name을 준다 (브랜드 뒤 공백만 남기지 않는다)', () => {
    expect(displayStoreName({ name: '씨유', branchName: null }, split)).toBe('씨유');
    expect(displayStoreName({ name: 'GS25', branchName: '' }, split)).toBe('GS25');
  });

  it('branchName이 코리아뿐이면 name만 남는다', () => {
    expect(displayStoreName({ name: '에이원', branchName: '코리아' }, split)).toBe('에이원');
  });

  it('빈 name은 그대로 반환한다', () => {
    expect(displayStoreName({ name: '', branchName: '서울역점' }, split)).toBe('');
  });
});

describe('displayStoreName — splitBrand 없음(카페·마트)', () => {
  it('결합만 하고 공백을 넣지 않는다', () => {
    expect(displayStoreName({ name: '컴포즈커피서산', branchName: '석림점' }))
      .toBe('컴포즈커피서산석림점');
    expect(displayStoreName({ name: '메가엠지씨커피', branchName: '구리돌다리점' }))
      .toBe('메가엠지씨커피구리돌다리점');
  });

  it('splitBrand 없이도 운영사 노이즈는 버린다', () => {
    expect(displayStoreName({ name: '세븐혜화점주', branchName: '코리아' }))
      .toBe('세븐혜화점');
  });

  it('branchName이 없으면 name 그대로다', () => {
    expect(displayStoreName({ name: '이디야커피', branchName: null }))
      .toBe('이디야커피');
  });
});
