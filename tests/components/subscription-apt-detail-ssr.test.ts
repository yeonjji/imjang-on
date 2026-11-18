import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnitSupplyTable } from '@/app/(public)/subscription/[id]/_components/unit-supply-table';
import { ScheduleTimeline } from '@/app/(public)/subscription/[id]/_components/schedule-timeline';
import { SubscriptionHero } from '@/app/(public)/subscription/[id]/_components/subscription-hero';
import { SpecialSupplyBreakdown } from '@/app/(public)/subscription/[id]/_components/special-supply-breakdown';
import { specialSupplyBreakdown } from '@/lib/subscription/apt-detail';
import { AMOUNT_CORRECTIONS } from '@/lib/subscription/amount-corrections';
import type { SubscriptionUnit } from '@prisma/client';
import type { SubscriptionDetail } from '@/lib/subscription';

(globalThis as unknown as { React: typeof React }).React = React;

const unitRaw = {
  SUPLY_AR: '81.0969', SPSPLY_HSHLDCO: 205, NWBB_HSHLDCO: 49, LFE_FRST_HSHLDCO: 36, INSTT_RECOMEND_HSHLDCO: 36,
  MNYCH_HSHLDCO: 24, NWWDS_HSHLDCO: 24, OLD_PARNTS_SUPORT_HSHLDCO: 12, YGMN_HSHLDCO: 0,
  TRANSR_INSTT_ENFSN_HSHLDCO: 0, ETC_HSHLDCO: 24,
};
const unit = {
  id: BigInt(7), noticeId: BigInt(1), modelNo: '01', houseType: '059.7100A', area: 81.0969,
  generalSupply: 37, specialSupply: 205, topAmount: 61345, rawJson: unitRaw,
} as unknown as SubscriptionUnit;

const notice = (category: string, rawJson: Record<string, unknown>) =>
  ({
    id: BigInt(1), category, name: '테스트', regionName: '경기', developer: null, rawJson,
    noticeDate: new Date('2026-11-12'), receiptBegin: new Date('2026-11-23'), receiptEnd: new Date('2026-11-25'),
    winnerDate: null, contractBegin: null, contractEnd: null, moveInYm: null, units: [unit],
  }) as unknown as SubscriptionDetail;

describe('UnitSupplyTable APT 보강', () => {
  const special = specialSupplyBreakdown([unit]);
  const h = renderToStaticMarkup(
    createElement(UnitSupplyTable, { units: [unit], perPyeong: { '7': 2501 }, special }),
  );
  it('3.3㎡당 열과 값, 단가 각주', () => {
    expect(h).toContain('3.3㎡당');
    expect(h).toContain('2,501만원');
    expect(h).toContain('공급면적(주거전용+주거공용)');
    expect(h).not.toContain('면적당 단가는 따로 계산하지 않았습니다');
  });
  it('모바일 카드에 특공 유형별 접힘', () => {
    expect(h).toContain('특별공급 유형별 보기');
    expect(h).toContain('신생아');
  });
  it('값이 없으면 열·각주는 기존 그대로', () => {
    const plain = renderToStaticMarkup(createElement(UnitSupplyTable, { units: [unit] }));
    expect(plain).not.toContain('3.3㎡당');
    expect(plain).toContain('면적당 단가는 따로 계산하지 않았습니다');
  });
  it('보정한 금액이면 원자료 값과 함께 밝힌다', () => {
    const c = renderToStaticMarkup(createElement(UnitSupplyTable, { units: [unit], corrections: [...AMOUNT_CORRECTIONS] }));
    expect(c).toContain('693,790만원');
    expect(c).toContain('공고문을 확인해 바로잡은 값');
  });
});

describe('SpecialSupplyBreakdown', () => {
  it('유형 열·합계', () => {
    const h = renderToStaticMarkup(createElement(SpecialSupplyBreakdown, { data: specialSupplyBreakdown([unit]) }));
    expect(h).toContain('특별공급 유형별 세대수');
    expect(h).toContain('특별공급 합계 205세대');
    expect(h).not.toContain('청년');
  });
  it('데이터 없으면 렌더 안 함', () => {
    expect(renderToStaticMarkup(createElement(SpecialSupplyBreakdown, { data: null }))).toBe('');
  });
});

describe('ScheduleTimeline / Hero', () => {
  const apt = {
    RENT_SECD_NM: '분양주택', HOUSE_DTL_SECD_NM: '민영', SPECLT_RDN_EARTH_AT: 'Y',
    SPSPLY_RCEPT_BGNDE: '2026-11-23', SPSPLY_RCEPT_ENDDE: '2026-11-23',
    GNRL_RNK1_CRSPAREA_RCPTDE: '2026-11-24', GNRL_RNK1_CRSPAREA_ENDDE: '2026-11-24',
    GNRL_RNK1_ETC_AREA_RCPTDE: '2026-11-25', GNRL_RNK1_ETC_AREA_ENDDE: '2026-11-25',
  };
  it('APT: 특공·1순위(지역 다르면 펼침), 접수 시작/마감 줄 없음', () => {
    const h = renderToStaticMarkup(createElement(ScheduleTimeline, { notice: notice('APT', apt) }));
    expect(h).toContain('특별공급 접수');
    expect(h).toContain('일반공급 1순위');
    expect(h).toContain('해당지역');
    expect(h).toContain('기타지역');
    expect(h).not.toContain('접수 시작');
  });
  it('비APT: 기존 접수 시작/마감', () => {
    const h = renderToStaticMarkup(createElement(ScheduleTimeline, { notice: notice('REMNANT', {}) }));
    expect(h).toContain('접수 시작');
    expect(h).not.toContain('일반공급 1순위');
  });
  it('Hero 배지: Y 항목만', () => {
    const h = renderToStaticMarkup(createElement(SubscriptionHero, { notice: notice('APT', apt) }));
    expect(h).toContain('민영주택');
    expect(h).toContain('투기과열지구');
    expect(h).not.toContain('분양가상한제');
    expect(h).toContain('청약홈 공고 기준');
  });
});
