import { describe, it, expect } from 'vitest';
import { PropertyType, DealType } from '@prisma/client';
import { fetchAll, getOffsetMonths, toApiTx } from '@/scripts/ingest/transactions/runner';
import type { Adapter, NormalizedTransaction } from '@/scripts/ingest/types';

// 원천 완전 수신: 5,000건 한 번 호출 우선, 안 되면 1,000건 페이지로 처음부터. 건수가 totalCount와 같을 때만 complete.
const OK = '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body></body></response>';
const ERR = '<response><header><resultCode>99</resultCode><resultMsg>SERVICE ERROR</resultMsg></header></response>';

/**
 * 가짜 원천: total건 데이터를 (pageNo, numOfRows)로 자른다. cap은 API가 실제로 돌려주는 최대 건수(요청보다 작으면 줄여 보냄).
 * fault(호출 정보)가 값을 돌려주면 그 응답으로 바꾼다.
 */
function fakeApi(total: number, o: {
  cap?: number;
  fault?: (c: { n: number; pageNo: number; numOfRows: number }) => 'err' | { rows: number[]; total: number } | undefined;
} = {}) {
  const calls: Array<{ pageNo: number; numOfRows: number }> = [];
  const adapter = {
    endpoint: 'X', source: 'x',
    parseRows: (xml: string) => {
      const p = JSON.parse(xml.slice(OK.length)) as { rows: number[]; total: number };
      return { rows: p.rows.map((k) => ({ name: `단지${k}` }) as unknown as NormalizedTransaction), totalCount: p.total };
    },
  } as unknown as Adapter;
  const fetch = (async ({ pageNo, numOfRows }: { pageNo: number; numOfRows: number }) => {
    calls.push({ pageNo, numOfRows });
    const f = o.fault?.({ n: calls.length, pageNo, numOfRows });
    if (f === 'err') return ERR;
    const size = Math.min(numOfRows, o.cap ?? Infinity);
    const body = f ?? { rows: Array.from({ length: Math.max(0, Math.min(size, total - (pageNo - 1) * size)) }, (_, i) => (pageNo - 1) * size + i), total };
    return OK + JSON.stringify(body);
  }) as never;
  return { adapter, fetch, calls };
}
const names = (r: { rows: NormalizedTransaction[] }) => r.rows.map((x) => x.name);
const expectAll = (r: { rows: NormalizedTransaction[] }, total: number) =>
  expect(names(r)).toEqual(Array.from({ length: total }, (_, k) => `단지${k}`));

describe('fetchAll — 단일 호출 우선 + 페이지 전환', () => {
  it('정상: 5,000건 이하면 numOfRows=5000 한 번 호출로 끝난다', async () => {
    const f = fakeApi(3506);
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ totalCount: 3506, complete: true, mode: 'single' });
    expectAll(r, 3506);
    expect(f.calls).toEqual([{ pageNo: 1, numOfRows: 5000 }]);
  });

  it('거래 0건(totalCount 0)도 한 번 호출로 complete', async () => {
    const f = fakeApi(0);
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ rows: [], complete: true, mode: 'single' });
    expect(f.calls).toHaveLength(1);
  });

  it('5,000건 초과: 1,000건 페이지로 처음부터 다시 받아 complete(중복·누락 없음)', async () => {
    const f = fakeApi(7300);
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ totalCount: 7300, complete: true, mode: 'paged' });
    expectAll(r, 7300);
    expect(f.calls).toEqual([{ pageNo: 1, numOfRows: 5000 }, ...Array.from({ length: 8 }, (_, i) => ({ pageNo: i + 1, numOfRows: 1000 }))]);
  });

  it('API가 요청 건수를 1,000건으로 줄여 보내도 페이지 수집으로 전체를 받는다', async () => {
    const f = fakeApi(2300, { cap: 1000 });
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ complete: true, mode: 'paged' });
    expectAll(r, 2300);
  });

  it('API가 100건으로 줄여 보내도(페이지 크기보다 작음) 끝까지 받는다', async () => {
    const f = fakeApi(2300, { cap: 100 });
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ complete: true, mode: 'paged' });
    expectAll(r, 2300);
  });

  it('부분 수신: 페이지 수집 중 빈 페이지가 오면 불완전', async () => {
    const f = fakeApi(7300, { fault: ({ pageNo, numOfRows }) => (numOfRows === 1000 && pageNo === 4 ? { rows: [], total: 7300 } : undefined) });
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false, mode: 'paged' });
  });

  it('부분 수신: 한 번 호출이 totalCount보다 적게 오고 페이지 수집도 모자라면 불완전', async () => {
    // 원천이 totalCount=2300이라 하지만 실제로 2,000건만 내준다
    const f = fakeApi(2000, { fault: ({ pageNo, numOfRows }) => {
      const size = numOfRows === 5000 ? 5000 : 1000;
      const rows = Array.from({ length: Math.max(0, Math.min(size, 2000 - (pageNo - 1) * size)) }, (_, i) => (pageNo - 1) * size + i);
      return { rows, total: 2300 };
    } });
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ totalCount: 2300, complete: false });
    expect(r.rows.length).toBeLessThan(2300);
  });

  it('API가 페이지 번호를 무시하고 같은 페이지를 반복하면 불완전(건수가 맞아도 중복으로 채우지 않는다)', async () => {
    const f = fakeApi(2000, { fault: ({ numOfRows }) => (numOfRows === 5000 ? { rows: Array.from({ length: 1000 }, (_, i) => i), total: 2000 }
      : { rows: Array.from({ length: 1000 }, (_, i) => i), total: 2000 }) });
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false, mode: 'paged' });
  });

  it('받는 중 totalCount가 바뀌면 불완전', async () => {
    const f = fakeApi(7300, { fault: ({ pageNo, numOfRows }) => (numOfRows === 1000 && pageNo === 2 ? { rows: Array.from({ length: 1000 }, (_, i) => 1000 + i), total: 7301 } : undefined) });
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false });
  });

  it('받은 건수가 totalCount보다 많으면 불완전', async () => {
    const f = fakeApi(10, { fault: () => ({ rows: Array.from({ length: 11 }, (_, i) => i), total: 10 }) });
    expect(await fetchAll(f.adapter, '11110', '202606', f.fetch)).toMatchObject({ complete: false, mode: 'single' });
  });

  it('API 오류(첫 호출): 예외 — 단위가 ERROR로 남고 DB는 바뀌지 않는다', async () => {
    const f = fakeApi(100, { fault: ({ n }) => (n === 1 ? 'err' : undefined) });
    await expect(fetchAll(f.adapter, '11110', '202606', f.fetch)).rejects.toThrow();
  });

  it('API 오류(페이지 수집 중): 예외', async () => {
    const f = fakeApi(7300, { fault: ({ pageNo, numOfRows }) => (numOfRows === 1000 && pageNo === 3 ? 'err' : undefined) });
    await expect(fetchAll(f.adapter, '11110', '202606', f.fetch)).rejects.toThrow();
  });

  it('페이지 상한(100쪽)을 넘는 범위는 불완전(조용히 자르지 않는다)', async () => {
    const f = fakeApi(10_050, { cap: 100 });
    const r = await fetchAll(f.adapter, '11110', '202606', f.fetch);
    expect(r).toMatchObject({ complete: false, mode: 'paged' });
    expect(r.rows).toHaveLength(10_000);
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
