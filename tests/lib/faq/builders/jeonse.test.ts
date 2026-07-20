import { describe, it, expect } from 'vitest';
import { buildJeonseFaq } from '@/lib/faq/builders/jeonse';

const base = {
  rcmdProdNm: '샘플전세보증',
  maxLoanLmtAmt: 200_000_000, // 2억 원
  rentGrntMaxLoanLmtRate: 80,
  exptGrfeRateCont: '연 0.05%~',
  grntReqTrgtDvcd: '01', // 청년
  rcmdGrntProdDvcd: '01', // 일반
  trtBankCont: '004|088', // 국민, 신한
  updatedAt: new Date('2026-07-15T00:00:00Z'),
};

describe('buildJeonseFaq', () => {
  it('substitutes 최대한도(formatWon)/비율 with HF source', () => {
    const q = buildJeonseFaq(base).find((i) => i.q.includes('최대 보증한도'));
    expect(q!.a).toContain('2억');
    expect(q!.a).toContain('80%');
    expect(q!.source).toBe('한국주택금융공사');
  });

  it('lists 취급 은행 names from codes', () => {
    const q = buildJeonseFaq(base).find((i) => i.q.includes('은행'));
    expect(q!.a).toContain('국민은행');
    expect(q!.a).toContain('신한은행');
  });

  it('always includes 기준일 and yields >= 2', () => {
    const items = buildJeonseFaq(base);
    expect(items.find((i) => i.q.includes('기준 자료'))!.a).toContain('2026.07.15');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
