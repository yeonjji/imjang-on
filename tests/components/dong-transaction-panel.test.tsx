import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DongTransactionPanel } from '@/app/(public)/_components/dong-transaction-panel';
import type { DongTransaction } from '@/lib/transaction/dong';

(globalThis as unknown as { React: typeof React }).React = React;

const ITEMS: DongTransaction[] = [
  {
    id: '1', contractDate: '2026-09-09', propertyId: '10',
    propertyName: '올림픽훼밀리타운', propertyType: 'APARTMENT',
    exclusiveArea: 84.12, floor: 11, dealType: 'JEONSE',
    dealAmount: null, deposit: 95000, monthlyRent: null,
  },
  {
    id: '2', contractDate: '2019-03-04', propertyId: '11',
    propertyName: '문정래미안', propertyType: 'APARTMENT',
    exclusiveArea: 115, floor: null, dealType: 'WOLSE',
    dealAmount: null, deposit: 5000, monthlyRent: 150,
  },
];

const html = (items: DongTransaction[]) =>
  renderToStaticMarkup(
    <DongTransactionPanel
      initialSido="서울"
      initialSigunguCode="11710"
      initialSigunguName="송파구"
      initialUmd="문정동"
      initialDongs={[{ umd: '가락동', txCount: 100 }, { umd: '문정동', txCount: 300 }]}
      initialItems={items}
    />,
  );

describe('DongTransactionPanel', () => {
  it('제목과 초기 지역을 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('문정동');
  });

  it('건물유형과 거래유형 선택지를 보여준다', () => {
    const out = html(ITEMS);
    expect(out).toContain('아파트');
    expect(out).toContain('전체');
    expect(out).toContain('매매');
    expect(out).toContain('전세');
    expect(out).toContain('월세');
  });

  it('날짜에 연도를 표기한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('26.09.09');
    expect(out).toContain('19.03.04');
  });

  it('월세를 라벨과 함께 쓴다', () => {
    expect(html(ITEMS)).toContain('보 5,000만원 / 월 150만');
  });

  it('층이 없으면 그 조각을 생략한다', () => {
    const out = html(ITEMS);
    expect(out).toContain('84㎡ · 11층 · 26.09.09');
    expect(out).toContain('115㎡ · 19.03.04');
  });

  // 홈 패널은 0건이어도 사라지지 않는다. 필터를 눌렀는데 패널이 없어지면
  // 사용자는 고장으로 받아들인다.
  it('0건이어도 패널과 필터가 남고 안내를 보여준다', () => {
    const out = html([]);
    expect(out).toContain('동네별 최근 실거래가');
    expect(out).toContain('이 조건에 해당하는 거래가 없습니다');
  });

  it('「더 보기」 링크를 두지 않는다', () => {
    const out = html(ITEMS);
    expect(out).not.toContain('더 보기');
    expect(out).not.toContain('전체 보기');
    expect(out).not.toContain('매물 보기');
  });
});
