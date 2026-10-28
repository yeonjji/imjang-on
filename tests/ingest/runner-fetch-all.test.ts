import { describe, it, expect } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';
import { fetchAll, getOffsetMonths, toApiTx } from '@/scripts/ingest/transactions/runner';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

// 원천 완전 수신 판단: 페이지 상한으로 조용히 자르지 않고, 건수가 totalCount와 같을 때만 complete.
const row = (n: number) => ({ name: `단지${n}` }) as unknown as NormalizedTransaction;
const OK = '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body></body></response>';
/** pages[i] = i+1 페이지의 { 행 수, totalCount }. 'err'면 비정상 응답. */
function fake(pages: Array<{ n: number; total: number } | 'err'>) {
  let i = 0;
  const calls: number[] = [];
  const adapter = {
    endpoint: 'X', source: 'x',
    parseRows: (xml: string) => { const p = JSON.parse(xml.slice(OK.length)); return { rows: Array.from({ length: p.n }, (_, k) => row(k)), totalCount: p.total }; },
  } as unknown as Adapter;
  const fetch = (async (o: { pageNo: number }) => {
    calls.push(o.pageNo);
    const p = pages[i++];
    if (p === 'err') return '<response><header><resultCode>22</resultCode><resultMsg>LIMITED</resultMsg></header></response>';
    return OK + JSON.stringify(p);
  }) as never;
  return { adapter, fetch, calls };
}

describe('fetchAll — 완전 수신 여부', () => {
  it('여러 페이지를 끝까지 받으면 complete', async () => {
    const f = fake([{ n: 1000, total: 2300 }, { n: 1000, total: 2300 }, { n: 300, total: 2300 }]);
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ totalCount: 2300, complete: true });
    expect(r.rows).toHaveLength(2300);
    expect(f.calls).toEqual([1, 2, 3]);
  });

  it('11페이지 이상도 받는다(옛 10페이지 상한 제거)', async () => {
    const f = fake([...Array.from({ length: 11 }, () => ({ n: 1000, total: 11500 })), { n: 500, total: 11500 }]);
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ complete: true });
    expect(r.rows).toHaveLength(11500);
  });

  it('중간 페이지가 비면(누락) 불완전', async () => {
    const f = fake([{ n: 1000, total: 2300 }, { n: 0, total: 2300 }]);
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false });
  });

  it('페이지 행 수가 모자라 건수가 totalCount에 못 미치면 불완전', async () => {
    const f = fake([{ n: 1000, total: 2300 }, { n: 800, total: 2300 }, { n: 0, total: 2300 }]);
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ complete: false });
    expect(r.rows).toHaveLength(1800);
  });

  it('받는 중 totalCount가 바뀌면 불완전', async () => {
    const f = fake([{ n: 1000, total: 2300 }, { n: 1000, total: 2301 }]);
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false });
  });

  it('비정상 응답(오류 코드)은 예외 — 단위가 ERROR로 남아 재실행된다', async () => {
    const f = fake([{ n: 1000, total: 2300 }, 'err']);
    await expect(fetchAll(f.adapter, '11110', '202606', f.fetch)).rejects.toThrow();
  });

  it('거래 0건(totalCount 0)은 complete', async () => {
    const f = fake([{ n: 0, total: 0 }]);
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ rows: [], complete: true });
  });
});

describe('getOffsetMonths', () => {
  it("'2-6'은 2~6개월 전", () => {
    expect(getOffsetMonths('2-6', new Date(2026, 9, 28))).toEqual(['202608', '202607', '202606', '202605', '202604']);
  });
  it("'7-12'는 연도를 넘긴다", () => {
    expect(getOffsetMonths('7-12', new Date(2026, 9, 28))).toEqual(['202603', '202602', '202601', '202512', '202511', '202510']);
  });
  it('형식 오류는 거부', () => {
    expect(() => getOffsetMonths('6-2', new Date())).toThrow();
    expect(() => getOffsetMonths('3', new Date())).toThrow();
  });
});

describe('toApiTx', () => {
  it('재정합 필드와 생성값(rawHash 제외)을 같은 값으로 만든다', () => {
    const r = {
      propertyType: PropertyType.OFFICETEL, dealType: DealType.SALE, name: 'A', sigunguCode: '11110',
      contractDate: new Date('2026-06-10T00:00:00Z'), exclusiveArea: 30.21, floor: 3, dealAmount: 20000, deposit: null, monthlyRent: null,
      cancelType: 'O', cancelDate: new Date('2026-07-01T00:00:00Z'),
    } as unknown as NormalizedTransaction;
    const a = toApiTx(r, 7n, '1111010100', 'molit-offi-trade');
    expect(a).toMatchObject({ propertyId: 7n, cancelType: 'O', exclusiveArea: 30.21 });
    expect(a.data).toMatchObject({ propertyId: 7n, regionCode: '1111010100', sigunguCode: '11110', source: 'molit-offi-trade', cancelType: 'O' });
    expect('rawHash' in a.data).toBe(false);
  });
});
