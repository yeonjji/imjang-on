import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: {} }));
import { shiftMonth, ymOf, targetMonths, resolveLatestMonth } from '@/scripts/ingest/apt-maintenance-cost/runner';

const hit = (cleanCost: unknown) => ({ response: { header: { resultCode: '00' }, body: { item: { cleanCost } } } });

describe('월 계산', () => {
  it('shiftMonth는 연도 경계를 넘는다', () => {
    expect(shiftMonth('202601', -1)).toBe('202512');
    expect(shiftMonth('202512', 1)).toBe('202601');
    expect(shiftMonth('202610', -2)).toBe('202608');
  });
  it('ymOf', () => {
    expect(ymOf(new Date(Date.UTC(2026, 9, 15)))).toBe('202610');
  });
  it('targetMonths는 최신 월과 같은 해 1월', () => {
    expect(targetMonths('202608')).toEqual(['202608', '202601']);
    expect(targetMonths('202601')).toEqual(['202601']);
  });
});

describe('resolveLatestMonth', () => {
  it('1개월 전부터 거꾸로 찾아 청소비 값이 있는 첫 달을 돌려준다', async () => {
    const fetchItem = vi.fn(async (_op, _code, ym: string) => (ym === '202608' ? hit(1506766) : hit(null)));
    expect(await resolveLatestMonth(new Date(Date.UTC(2026, 9, 15)), ['A1'], fetchItem)).toBe('202608');
  });
  it('6개월 안에 없으면 null', async () => {
    const fetchItem = vi.fn(async () => hit(null));
    expect(await resolveLatestMonth(new Date(Date.UTC(2026, 9, 15)), ['A1'], fetchItem)).toBeNull();
  });
});
