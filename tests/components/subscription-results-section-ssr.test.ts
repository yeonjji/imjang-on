import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubscriptionResultsSection } from '@/app/(public)/subscription/[id]/_components/subscription-results-section';
import { buildResultsView } from '@/lib/insights/subscription-results';

(globalThis as unknown as { React: typeof React }).React = React;

const cmp = (ty: string, rank: number, secd: string, rate: string, req: string, supply: number) => ({
  HOUSE_TY: ty, SUBSCRPT_RANK_CODE: rank, RESIDE_SECD: secd, CMPET_RATE: rate, REQ_CNT: req, SUPLY_HSHLDCO: supply,
});
const html = (view: ReturnType<typeof buildResultsView>, category = 'APT') =>
  renderToStaticMarkup(
    createElement(SubscriptionResultsSection, { data: view ? { view, fetchedLabel: '2026-10-20' } : null, category }),
  );

const competitive = buildResultsView(
  'APT',
  [cmp('059.9800 ', 1, '01', '1692.33', '10154', 6), cmp('059.9800 ', 1, '02', '-', '0', 6)],
  [{ HOUSE_TY: '059.9800 ', RESIDE_SENM: '해당지역', LWET_SCORE: '70', AVRG_SCORE: '70', TOP_SCORE: '70' }],
  [{ HOUSE_TY: '059.9800 ', LFE_FRST_HSHLDCO: 1, CRSPAREA_LFE_FRST_CNT: 3431 }],
);
const shortfall = buildResultsView(
  'APT',
  [
    cmp('084.9500A', 1, '01', '(△236)', '183', 419),
    cmp('084.9500A', 1, '02', '(△218)', '18', 419),
    cmp('084.9500A', 2, '01', '(△170)', '48', 419),
    cmp('084.9500A', 2, '02', '(△164)', '6', 419),
  ],
  null,
  null,
);

describe('SubscriptionResultsSection', () => {
  it('결과가 없으면 렌더하지 않는다', () => expect(html(null)).toBe(''));

  it('APT 경쟁 공고: 요약·주택형 표·가점·특별공급·출처', () => {
    const h = html(competitive);
    expect(h).toContain('id="results"');
    expect(h).toContain('청약 결과');
    expect(h).toContain('일반공급 기준');
    expect(h).toContain('1순위 해당지역 전체');
    expect(h).toContain('1,692.33대 1');
    expect(h).toContain('임장ON 계산: 1순위 해당지역 접수 합 10,154건 ÷ 일반공급 6세대');
    expect(h).toContain('최고 59.98㎡');
    expect(h).toContain('1,692.33 : 1');
    expect(h).toContain('— : 앞 순위 마감(경쟁률 미산정)');
    expect(h).not.toContain('접수하지 않음');
    expect(h).toContain('당첨 가점');
    expect(h).toContain('해당지역 · 가점제 당첨자');
    expect(h).toContain('특별공급 유형별');
    expect(h).toContain('생애최초');
    expect(h).toContain('3,431.00 : 1');
    expect(h).toContain('한국부동산원 청약홈 · 2026-10-20 조회');
    expect(h).toContain('특별공급 경쟁률은 임장ON 계산(접수 ÷ 배정, 기관추천 제외)');
    expect(h).toContain('은행 전산 사정으로 접수건수가 일부 변동될 수 있으며, 최종 결과는 청약홈에서 확인하세요.');
  });

  it('APT 미달 공고: 미달 표기·최종 미달·2순위 열', () => {
    const h = html(shortfall);
    expect(h).toContain('미달 236세대');
    expect(h).toContain('2순위');
    expect(h).toContain('2순위까지 최종 미달');
    expect(h).toContain('164세대');
    expect(h).toContain('미달 세대는 앞 단계부터 누적한 잔여 세대(청약홈 공식값)');
    expect(h).not.toContain('최고 ');
    expect(h).not.toContain('당첨 가점');
    expect(h).not.toContain('특별공급 유형별');
  });

  it('미달 공고 요약에는 최고 경쟁률을 넣지 않는다(시안 B)', () => {
    const v = buildResultsView(
      'APT',
      [cmp('084.0000A', 1, '01', '(△5)', '1', 6), cmp('084.0000F', 1, '01', '3.56', '32', 9)],
      null,
      null,
    );
    const h = html(v);
    expect(h).toContain('최종 미달');
    expect(h).not.toContain('최고 ');
  });

  it('전체 요약 경쟁률이 없어도 최종 미달은 보인다', () => {
    const v = buildResultsView('APT', [cmp('084.0000A', 1, '01', '4.05', '1', 67), cmp('084.0000B', 1, '01', '(△5)', '1', 6)], null, null);
    const h = html(v);
    expect(h).not.toContain('1순위 해당지역 전체');
    expect(h).not.toContain('임장ON 계산: 1순위');
    expect(h).toContain('최종 미달');
  });

  it('오피스텔: 한 표, 유형 라벨', () => {
    const v = buildResultsView('OFFICETEL_ETC', [{ HOUSE_TY: '1', RESIDNT_PRIOR_SENM: '전체', SUPLY_HSHLDCO: 14, REQ_CNT: '41', CMPET_RATE: '2.93' }], null, null);
    const h = html(v, 'OFFICETEL_ETC');
    expect(h).toContain('오피스텔·도시형생활주택');
    expect(h).toContain('타입');
    expect(h).toContain('구분');
    expect(h).toContain('2.93 : 1');
    expect(h).not.toContain('1순위 해당지역 전체');
  });

  it('당첨 가능성·유불리 문구는 쓰지 않는다', () => {
    for (const h of [html(competitive), html(shortfall)]) {
      expect(h).not.toMatch(/당첨 가능|유리|불리|확률/);
    }
  });
});
