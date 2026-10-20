import { describe, it, expect } from 'vitest';
import { readItems } from '@/scripts/ingest/building-register/http';

const ok = (items: unknown, totalCount = 1) => ({ response: { header: { resultCode: '00' }, body: { items, totalCount } } });

describe('readItems', () => {
  it('배열·단건·빈 값을 모두 배열로', () => {
    expect(readItems(ok({ item: [{ a: 1 }, { a: 2 }] }, 2))).toEqual({ items: [{ a: 1 }, { a: 2 }], totalCount: 2 });
    expect(readItems(ok({ item: { a: 1 } }))).toEqual({ items: [{ a: 1 }], totalCount: 1 });
    expect(readItems(ok('', 0))).toEqual({ items: [], totalCount: 0 });
    expect(readItems(ok(null, 0))).toEqual({ items: [], totalCount: 0 });
  });
  it('정상 응답이 아니면 throw', () => {
    expect(() => readItems({ response: { header: { resultCode: '03' } } })).toThrow();
    expect(() => readItems('<errMsg>SERVICE ERROR</errMsg>')).toThrow();
  });
});
