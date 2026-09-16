import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DongTransactionSection } from '@/app/(public)/apt/[id]/_components/dong-transaction-section';
import type { DongTransaction } from '@/lib/transaction/dong';

// 이 저장소 vitest는 esbuild classic JSX 변환을 쓴다. .tsx 테스트에서 JSX를 쓰려면
// React가 전역에 있어야 한다(tests/components/property-detail-hero-ssr.test.ts와 동일 패턴).
(globalThis as unknown as { React: typeof React }).React = React;

const TX: DongTransaction[] = [
  {
    id: '1', contractDate: '2026-09-09', propertyId: '10',
    propertyName: '올림픽훼밀리타운', propertyType: 'APARTMENT',
    exclusiveArea: 84.12, floor: 11, dealType: 'JEONSE',
    dealAmount: null, deposit: 95000, monthlyRent: null,
  },
  {
    id: '2', contractDate: '2019-03-04', propertyId: '11',
    propertyName: '문정래미안', propertyType: 'APARTMENT',
    exclusiveArea: 115.0, floor: null, dealType: 'WOLSE',
    dealAmount: null, deposit: 5000, monthlyRent: 150,
  },
];

const html = (items: DongTransaction[], propertyType: DongTransaction['propertyType'] = 'APARTMENT') =>
  renderToStaticMarkup(
    <DongTransactionSection items={items} dongLabel="문정동" propertyType={propertyType} />,
  );

describe('DongTransactionSection', () => {
  it('제목에 동 이름과 정렬 기준을 밝힌다', () => {
    const out = html(TX);
    expect(out).toContain('문정동 최근 거래');
    expect(out).toContain('계약일순');
  });

  it('아파트는 "다른 단지"라고 쓴다', () => {
    expect(html(TX, 'APARTMENT')).toContain('다른 단지');
  });

  it('빌라·오피스텔은 "다른 건물"이라고 쓴다', () => {
    expect(html(TX, 'OFFICETEL')).toContain('다른 건물');
    expect(html(TX, 'MULTIPLEX')).toContain('다른 건물');
  });

  it('날짜에 연도를 표기한다 — 몇 년 전 거래가 올해처럼 보이면 안 된다', () => {
    const out = html(TX);
    expect(out).toContain('26.09.09');
    expect(out).toContain('19.03.04');
  });

  it('월세를 라벨과 함께 쓴다', () => {
    const out = html(TX);
    expect(out).toContain('보 5,000만원');
    expect(out).toContain('월 150만');
  });

  it('층이 없으면 그 칸을 비우고 —를 찍지 않는다', () => {
    expect(html(TX)).not.toContain('—');
  });

  it('items가 비면 아무것도 렌더하지 않는다', () => {
    expect(html([])).toBe('');
  });

  it('「더 보기」 링크를 두지 않는다', () => {
    const out = html(TX);
    expect(out).not.toContain('더 보기');
    expect(out).not.toContain('전체 보기');
  });

  it('건물명을 상세로 링크한다', () => {
    expect(html(TX)).toContain('/apt/10');
  });
});
