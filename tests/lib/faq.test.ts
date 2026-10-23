import { describe, it, expect } from 'vitest';
import { FAQ, FAQ_CATEGORY_LABEL, FAQ_PAGE_ORDER, resolveFaq, type FaqCategory } from '@/lib/faq/data';
import type { FaqStats } from '@/lib/faq/stats';

const CATEGORIES = Object.keys(FAQ) as FaqCategory[];
const STATS: FaqStats = {
  apt: 44573, officetel: 17547, villa: 214574, maintenanceComplexes: 12544,
  subscriptionNotices: 5917, subscriptionResults: 5436, remnantNotices: 1724, arbitraryNotices: 687,
  loanProducts: 318, jeonseProducts: 47, hospitals: 79772, pharmacies: 25760, schools: 12567,
  childcare: 24672, childcarePublic: 6650, parks: 17281, publicParkings: 9876, evStations: 106477, asOf: '2026-10-23',
};
const FORBIDDEN = /하는 것이 좋습니다|바람직|꼼꼼히|유리|추천/;

describe('FAQ 레지스트리 무결성', () => {
  it('모든 카테고리가 2개 이상, q는 물음표, a는 비어있지 않음(숫자 있음/없음 둘 다)', () => {
    for (const c of CATEGORIES) {
      for (const stats of [STATS, null]) {
        const items = resolveFaq(c, stats);
        expect(items.length, `${c}`).toBeGreaterThanOrEqual(2);
        for (const it of items) {
          expect(it.q.trim().endsWith('?'), `${c} q="${it.q}"`).toBe(true);
          expect(it.a.trim().length, `${c} a`).toBeGreaterThan(20);
          expect(it.a, `${c} "${it.q}"`).not.toMatch(FORBIDDEN);
          expect(it.a, `${c} 빈 숫자`).not.toMatch(/undefined|NaN|null/);
        }
      }
    }
  });

  it('카테고리 내 질문 중복 없음', () => {
    for (const c of CATEGORIES) {
      const qs = FAQ[c].map((i) => i.q);
      expect(new Set(qs).size, `${c} 중복`).toBe(qs.length);
    }
  });

  it('모든 카테고리에 라벨이 있고 노출 순서에 포함된다', () => {
    for (const c of CATEGORIES) {
      expect(FAQ_CATEGORY_LABEL[c], `${c} 라벨`).toBeTruthy();
      expect(FAQ_PAGE_ORDER, `${c} 순서`).toContain(c);
    }
    expect(new Set(FAQ_PAGE_ORDER).size).toBe(FAQ_PAGE_ORDER.length);
  });
});

describe('사이트가 실제로 하는 일과 맞는 문장(리뷰 지적)', () => {
  const a = (c: FaqCategory, q: RegExp, st: FaqStats | null = STATS) => resolveFaq(c, st).find((i) => q.test(i.q))!.a;
  it('약국 운영시간은 아직 제공하지 않는다', () => {
    for (const st of [STATS, null]) {
      expect(a('pharmacy', /어디서 가져오나요/, st)).not.toContain('운영시간을 정리');
      expect(a('pharmacy', /어디서 가져오나요/, st)).toContain('운영시간은 아직 제공하지 않아');
    }
  });
  it('병원 요일별 진료시간은 공개한 병원만', () => {
    expect(a('hospital', /야간·주말/)).toContain('진료시간을 공개한 병원은');
  });
  it('LH 공고는 LH 청약플러스에서 신청', () => {
    expect(a('subscription', /신청도 임장ON/)).toContain('LH 청약플러스');
  });
});

describe('resolveFaq 숫자', () => {
  const a = (c: FaqCategory, q: RegExp, s: FaqStats | null) => resolveFaq(c, s).find((i) => q.test(i.q))!.a;
  it('stats가 있으면 숫자를 넣는다', () => {
    expect(a('apt', /어디서 가져오나요/, STATS)).toContain('44,573개 단지');
    expect(a('subscription', /경쟁률과 당첨 가점/, STATS)).toContain('5,436건');
    expect(a('childcare', /유형/, STATS)).toContain('24,672곳 중 국공립은 6,650곳(약 27%)');
    expect(a('life', /어떤 생활편의/, STATS)).toContain('전기차 충전소 106,477곳');
  });
  it('stats가 null이면 숫자 없는 문장', () => {
    expect(a('apt', /어디서 가져오나요/, null)).not.toMatch(/\d+,\d{3}/);
    expect(a('apt', /어디서 가져오나요/, null)).toContain('매일 밤 자정과 새벽 4시');
    expect(a('childcare', /유형/, null)).not.toContain('국공립은');
    expect(a('subscription', /무순위/, null)).not.toMatch(/\d+건/);
  });
});
