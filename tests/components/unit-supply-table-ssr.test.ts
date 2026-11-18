import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnitSupplyTable } from '@/app/(public)/subscription/[id]/_components/unit-supply-table';
import type { SubscriptionUnit } from '@prisma/client';

(globalThis as unknown as { React: typeof React }).React = React;

const unit = {
  id: BigInt(1), noticeId: BigInt(1), modelNo: '01', houseType: '059.9288A',
  area: 84.1857, generalSupply: 17, specialSupply: 66, topAmount: 7200,
  rawJson: { SUPLY_AR: '84.1857' },
} as unknown as SubscriptionUnit;

const html = (rental?: boolean) =>
  renderToStaticMarkup(createElement(UnitSupplyTable, { units: [unit], rental }));

describe('UnitSupplyTable 금액 표기', () => {
  it('분양 공고는 기존대로 분양가', () => {
    const h = html(false);
    expect(h).toContain('>분양가<');
    expect(h).not.toContain('공급금액');
  });
  it('임대 공고는 공급금액(최고)와 공고문 안내, 분양가 헤더 없음', () => {
    const h = html(true);
    expect(h).toContain('공급금액(최고)');
    expect(h).toContain('임대주택입니다');
    expect(h).not.toContain('>분양가<');
    expect(h).not.toContain('분양가와');
  });
});
