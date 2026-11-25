import { describe, it, expect } from 'vitest';
import {
  computePeers,
  isCancelResale,
  noticePpa,
  overallRate,
  MIN_PEERS,
  type PeerNotice,
} from '@/lib/subscription/peer-competition';

const d = (s: string) => new Date(`${s}T00:00:00+09:00`);
const peer = (id: string, ppa: number, rate: number | null, date = '2026-05-01', extra: Partial<PeerNotice> = {}): PeerNotice => ({
  id, name: `공고${id}`, sido: '경기', date: d(date), ppa, rate, ...extra,
});
const target = peer('T', 1000, 0.47, '2026-11-06');

describe('noticePpa', () => {
  it('주택형별 최고 분양가 ÷ 전용면적의 중간값', () => {
    expect(noticePpa([
      { houseType: '059.9777', topAmount: 60000 },
      { houseType: '084.7415A', topAmount: 84741 },
      { houseType: '101.0000', topAmount: 150000 },
    ])).toBeCloseTo(1000.37, 1);
  });
  it('면적·금액이 없으면 빼고, 남는 게 없으면 null', () => {
    expect(noticePpa([{ houseType: 'A형', topAmount: 50000 }, { houseType: '084', topAmount: null }])).toBeNull();
  });
});

describe('overallRate', () => {
  const row = (ty: string, rank: number, secd: string, sup: number, req: number, rate: string) => ({
    HOUSE_TY: ty, SUBSCRPT_RANK_CODE: rank, RESIDE_SECD: secd, SUPLY_HSHLDCO: sup, REQ_CNT: req, CMPET_RATE: rate,
  });
  it('1순위 해당지역 접수 합 ÷ 공급 합', () => {
    const cmp = [row('059.9777', 1, '01', 100, 50, '0.50'), row('084.7415A', 1, '01', 100, 150, '1.50')];
    expect(overallRate(cmp, [], [])).toBe(1);
  });
  it('해당지역 일부 배정 공고(공식 경쟁률 ≠ 접수÷공급)는 null', () => {
    const cmp = [row('084.0000', 1, '01', 100, 50, '1.67')];
    expect(overallRate(cmp, [], [])).toBeNull();
  });
  it('결과가 비면 null', () => {
    expect(overallRate([], [], [])).toBeNull();
  });
});

describe('isCancelResale', () => {
  it('조합원 취소분 공고', () => {
    expect(isCancelResale('오남역 서희스타힐스 여의재 3단지 (조합원 취소분)')).toBe(true);
    expect(isCancelResale('오남역 서희스타힐스 여의재 3단지')).toBe(false);
  });
});

describe('computePeers', () => {
  const base = [peer('1', 1010, 0.2), peer('2', 990, 0.4), peer('3', 1100, 0.6), peer('4', 900, 1.2), peer('5', 1190, 3)];

  it(`비교 공고 ${MIN_PEERS}건 이상이면 중간값·가까운 가격순 상위 공고`, () => {
    const s = computePeers(target, [target, ...base])!;
    expect(s.n).toBe(5);
    expect(s.med).toBe(0.6);
    expect(s.own).toBe(0.47);
    expect(s.lo).toBe(800);
    expect(s.hi).toBe(1200);
    expect(s.top.map((p) => p.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(s.top[0].ym).toBe('2026.05');
  });

  it(`${MIN_PEERS}건 미만이면 null`, () => {
    expect(computePeers(target, base.slice(0, 4))).toBeNull();
  });

  it('다른 시도·±20% 밖·24개월 밖·이후 공고·결과 없음·취소분은 제외', () => {
    const noise = [
      peer('a', 1000, 1, '2026-05-01', { sido: '서울' }),
      peer('b', 1250, 1),
      peer('c', 790, 1),
      peer('d', 1000, 1, '2024-11-01'),
      peer('e', 1000, 1, '2026-11-20'),
      peer('f', 1000, null),
      peer('g', 1000, 1, '2026-05-01', { name: '어느 단지(조합원 취소분)' }),
    ];
    const s = computePeers(target, [...base, ...noise])!;
    expect(s.n).toBe(5);
    expect(s.top.map((p) => p.id).sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('이 공고 결과가 없으면 own은 null', () => {
    expect(computePeers({ ...target, rate: null }, base)!.own).toBeNull();
  });
});
