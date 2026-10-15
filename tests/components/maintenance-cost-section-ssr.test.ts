import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaintenanceCostSection } from '@/app/(public)/apt/[id]/_components/maintenance-cost-section';
import type { MaintenanceView } from '@/lib/insights/maintenance-cost';

(globalThis as unknown as { React: typeof React }).React = React;

const base: MaintenanceView = {
  yearMonth: '202608', monthLabel: '2026년 8월', heatType: '지역난방', households: 980, manageArea: 147835,
  perHousehold: true, commonPerM2: 903, commonAmount: 136291,
  comparison: { sigunguName: '연수구', pct: -6, label: '낮음', sampleCount: 41, medianPerM2: 960 },
  totalAmount: 422854,
  commonItems: [{ label: '인건비', amount: 43728 }, { label: '기타', amount: 5273 }],
  individualItems: [{ label: '전기', amount: 172894 }],
  individualTotal: 233033, barMax: 172894,
  trend: [{ label: '6월', perM2: 939 }, { label: '7월', perM2: 932 }, { label: '8월', perM2: 903 }], trendRangeLabel: '2026년',
  seasonal: { winterLabel: '2026년 1월', summerLabel: '2026년 8월', rows: [{ label: '난방', winter: 222167, summer: 9729 }] },
  individualHeating: false,
  ltr: { levy: 52459240, levyPerHousehold: 53530, levyPerM2: 355, balance: 1312406334, rate: null },
  fetchedAt: new Date('2026-10-15T00:00:00Z'),
};
const html = (v: MaintenanceView | null) => renderToStaticMarkup(createElement(MaintenanceCostSection, { view: v, id: 'maintenance-cost' }));

describe('MaintenanceCostSection', () => {
  it('view가 없으면 렌더하지 않는다', () => {
    expect(html(null)).toBe('');
  });
  it('요약·구 비교·출처·계산식을 그린다', () => {
    const h = html(base);
    expect(h).toContain('id="maintenance-cost"');
    expect(h).toContain('관리비');
    expect(h).toContain('903원');
    expect(h).toContain('연수구 아파트 중앙값 대비');
    expect(h).toContain('6% 낮음');
    expect(h).toContain('2026년 8월 부과분');
    expect(h).toContain('2026-10-15 조회');
    expect(h).toContain('임장ON 계산');
    expect(h).toContain('13억 1,241만 원');
    expect(h).toContain('실제 세대별 고지액과 다릅니다');
  });
  it('비교가 비슷함이면 퍼센트 없이 "비슷함"', () => {
    const h = html({ ...base, comparison: { ...base.comparison!, pct: 2, label: '비슷함' } });
    expect(h).toContain('비슷함');
    expect(h).not.toContain('2% 비슷함');
  });
  it('비교·추이·겨울여름이 없으면 해당 블록을 그리지 않는다', () => {
    const h = html({ ...base, comparison: null, trend: null, trendRangeLabel: null, seasonal: null });
    expect(h).not.toContain('중앙값 대비');
    expect(h).not.toContain('㎡당 추이');
    expect(h).not.toContain('겨울과 여름');
  });
  it('개별난방 안내', () => {
    const h = html({ ...base, seasonal: null, individualHeating: true, heatType: '개별난방' });
    expect(h).toContain('난방비는 세대가 도시가스에 직접 내므로 관리비에 포함되지 않습니다');
  });
  it('세대수가 없으면 단지 전체 표기', () => {
    const h = html({ ...base, perHousehold: false, households: null });
    expect(h).toContain('단지 전체');
    expect(h).not.toContain('실제 세대별 고지액과 다릅니다');
  });
  it('장기수선충당금에 평가 문구가 없다', () => {
    const h = html(base);
    for (const w of ['부족', '충분', '양호', '위험']) expect(h).not.toContain(w);
  });
});
