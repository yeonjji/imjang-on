import { describe, it, expect } from 'vitest';
import { buildJeonseFaq } from '@/lib/faq/builders/jeonse';

describe('buildJeonseFaq 한도비율 반올림', () => {
  it('rate를 정수%로', () => {
    const items = buildJeonseFaq({
      rcmdProdNm: '테스트보증', maxLoanLmtAmt: null, rentGrntMaxLoanLmtRate: 79.99999,
      exptGrfeRateCont: null, grntReqTrgtDvcd: null, rcmdGrntProdDvcd: null,
      trtBankCont: null, updatedAt: new Date('2026-07-01'),
    });
    const f = items.find((i) => i.a.includes('한도비율'));
    expect(f).toBeDefined();
    expect(f!.a).toContain('한도비율은 80%');
    expect(f!.a).not.toMatch(/\d+\.\d{3,}/);
  });
});
