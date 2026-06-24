import { describe, it, expect } from 'vitest';
import {
  matchGuarantees,
  regionPrefix,
  regionApplies,
  targetMatches,
  estimateLoanCap,
  type JeonseProductLite,
  type RegionLimitLite,
} from '@/lib/jeonse/match';

const P2D: JeonseProductLite = {
  grntDvcd: '2D',
  rcmdProdNm: '일반전세자금보증',
  rcmdGrntProdDvcd: '01',
  grntReqTrgtDvcd: '03',
  exptGrfeRateCont: '0.02%~0.40%',
  rentGrntMaxLoanLmtRate: 89,
  maxLoanLmtAmt: 444444444,
};
const P4J: JeonseProductLite = {
  grntDvcd: '4J',
  rcmdProdNm: '서울시 청년 협약전세자금보증',
  rcmdGrntProdDvcd: '02',
  grntReqTrgtDvcd: '01',
  exptGrfeRateCont: null,
  rentGrntMaxLoanLmtRate: 90,
  maxLoanLmtAmt: 200000000,
};
const P2Q: JeonseProductLite = {
  grntDvcd: '2Q',
  rcmdProdNm: '다자녀가구 특례전세',
  rcmdGrntProdDvcd: '03',
  grntReqTrgtDvcd: '00',
  exptGrfeRateCont: null,
  rentGrntMaxLoanLmtRate: 80,
  maxLoanLmtAmt: 300000000,
};
const PRODUCTS = [P2D, P4J, P2Q];

const REGIONS: RegionLimitLite[] = [
  { grntDvcd: '2D', trgtLwdgCd: '1100000000', maxRentGrntAmt: 700000000 },
  { grntDvcd: '2D', trgtLwdgCd: '2600000000', maxRentGrntAmt: 500000000 },
  { grntDvcd: '4J', trgtLwdgCd: '1100000000', maxRentGrntAmt: 700000000 }, // 서울만
  { grntDvcd: '2Q', trgtLwdgCd: '1100000000', maxRentGrntAmt: 700000000 },
  { grntDvcd: '2Q', trgtLwdgCd: '2600000000', maxRentGrntAmt: 500000000 },
];

describe('regionPrefix / regionApplies', () => {
  it('시도 코드는 앞2자리 접두', () => {
    expect(regionPrefix('1100000000')).toBe('11');
    expect(regionApplies('1100000000', '1168000000')).toBe(true); // 서울 강남
    expect(regionApplies('1100000000', '2611000000')).toBe(false); // 부산
  });
  it('시군구 코드는 더 구체적으로 매칭', () => {
    expect(regionPrefix('4615000000')).toBe('4615');
    expect(regionApplies('4615000000', '4615012300')).toBe(true); // 순천 내
    expect(regionApplies('4615000000', '4621000000')).toBe(false); // 같은 전남 다른 시군구
  });
});

describe('targetMatches', () => {
  it('전체(00)·null은 항상 OK', () => {
    expect(targetMatches('00', 'youth')).toBe(true);
    expect(targetMatches(null, 'newlywed')).toBe(true);
  });
  it('청년/신혼 좁히기', () => {
    expect(targetMatches('01', 'youth')).toBe(true);
    expect(targetMatches('03', 'youth')).toBe(false);
    expect(targetMatches('02', 'newlywed')).toBe(true);
  });
  it('target 없거나 all이면 통과', () => {
    expect(targetMatches('03', 'all')).toBe(true);
    expect(targetMatches('03', undefined)).toBe(true);
  });
});

describe('estimateLoanCap', () => {
  it('보증금×비율, 상품한도로 cap', () => {
    expect(estimateLoanCap(200000000, P2D)).toBe(178000000); // 2억×89% < 4.44억
    expect(estimateLoanCap(300000000, P4J)).toBe(200000000); // 3억×90%=2.7억 > 상품한도 2억 → 2억
  });
  it('비율 없으면 상품 최대한도', () => {
    expect(estimateLoanCap(200000000, { ...P2D, rentGrntMaxLoanLmtRate: null })).toBe(444444444);
  });
});

describe('matchGuarantees', () => {
  it('서울 강남·2억·전체 → 서울 제공 상품 전부, 한도 내', () => {
    const r = matchGuarantees({ lawdCd: '1168000000', depositAmount: 200000000, target: 'all' }, PRODUCTS, REGIONS);
    expect(r.map((m) => m.product.grntDvcd).sort()).toEqual(['2D', '2Q', '4J']);
    expect(r.every((m) => m.depositWithinLimit)).toBe(true);
    const d2 = r.find((m) => m.product.grntDvcd === '2D')!;
    expect(d2.regionMaxDeposit).toBe(700000000);
    expect(d2.estMaxLoanAmt).toBe(178000000);
  });
  it('청년 좁히기 → 청년(01)·전체(00)만', () => {
    const r = matchGuarantees({ lawdCd: '1168000000', depositAmount: 200000000, target: 'youth' }, PRODUCTS, REGIONS);
    expect(r.map((m) => m.product.grntDvcd).sort()).toEqual(['2Q', '4J']); // 2D(03) 제외
  });
  it('부산 → 서울 전용 협약상품(4J) 제외', () => {
    const r = matchGuarantees({ lawdCd: '2611000000', depositAmount: 200000000, target: 'all' }, PRODUCTS, REGIONS);
    expect(r.map((m) => m.product.grntDvcd).sort()).toEqual(['2D', '2Q']);
  });
  it('보증금 한도 초과 → depositWithinLimit false', () => {
    const r = matchGuarantees({ lawdCd: '2611000000', depositAmount: 800000000, target: 'all' }, PRODUCTS, REGIONS);
    expect(r.every((m) => !m.depositWithinLimit)).toBe(true); // 부산 max 5억 < 8억
  });
});
