import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { planGroupMerge, hashInputFromDbRow } from '@/scripts/ops/merge-duplicate-properties/core';

describe('planGroupMerge', () => {
  // 생존자 = 최소 id. 먼저 생성된 쪽이 색인·외부링크를 가졌을 가능성이 높아 SEO 손실이 작다.
  it('최소 id를 생존자로 고른다', () => {
    const plan = planGroupMerge([
      { id: 41205n, builtYear: 2001 },
      { id: 41203n, builtYear: 2001 },
      { id: 41210n, builtYear: 2001 },
    ])!;
    expect(plan.survivor.id).toBe(41203n);
    expect(plan.losers.map((l) => l.id)).toEqual([41205n, 41210n]);
  });

  it('입력 순서가 달라도 같은 결과를 낸다', () => {
    const a = planGroupMerge([{ id: 2n, builtYear: null }, { id: 1n, builtYear: null }])!;
    const b = planGroupMerge([{ id: 1n, builtYear: null }, { id: 2n, builtYear: null }])!;
    expect(a.survivor.id).toBe(b.survivor.id);
  });

  it('행이 1개 이하면 병합할 게 없어 null', () => {
    expect(planGroupMerge([{ id: 1n, builtYear: null }])).toBeNull();
    expect(planGroupMerge([])).toBeNull();
  });

  // 실측: 2,028그룹 중 15그룹만 준공년이 갈린다. 생존자가 비었을 때만 패자 값으로 채운다.
  it('생존자의 builtYear가 null이면 패자 값으로 보충한다', () => {
    const plan = planGroupMerge([
      { id: 1n, builtYear: null },
      { id: 2n, builtYear: 1998 },
    ])!;
    expect(plan.builtYear).toBe(1998);
  });

  it('생존자에 builtYear가 있으면 패자 값으로 덮지 않는다', () => {
    const plan = planGroupMerge([
      { id: 1n, builtYear: 2001 },
      { id: 2n, builtYear: 1998 },
    ])!;
    expect(plan.builtYear).toBe(2001);
  });

  it('전부 null이면 null', () => {
    const plan = planGroupMerge([{ id: 1n, builtYear: null }, { id: 2n, builtYear: null }])!;
    expect(plan.builtYear).toBeNull();
  });
});

describe('hashInputFromDbRow', () => {
  // computeHash는 JSON.stringify를 쓴다. Prisma Decimal은 문자열 "84.9"로 직렬화되어
  // ETL이 만드는 숫자 84.9와 다른 해시를 낸다 — 반드시 Number()로 변환해야 한다.
  it('Decimal exclusiveArea를 number로 바꾼다', () => {
    const out = hashInputFromDbRow({
      dealType: 'SALE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('84.90'),
      floor: 3, dealAmount: 120000, deposit: null, monthlyRent: null,
    });
    expect(out.exclusiveArea).toBe(84.9);
    expect(JSON.stringify({ a: out.exclusiveArea })).toBe('{"a":84.9}');
  });

  it('후행 0을 ETL과 같게 정규화한다', () => {
    const out = hashInputFromDbRow({
      dealType: 'SALE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('84.00'),
      floor: null, dealAmount: null, deposit: null, monthlyRent: null,
    });
    // ETL은 Number('84') → 84
    expect(JSON.stringify({ a: out.exclusiveArea })).toBe('{"a":84}');
  });

  it('null 필드를 undefined로 바꾸지 않는다', () => {
    const out = hashInputFromDbRow({
      dealType: 'JEONSE',
      contractDate: new Date(Date.UTC(2026, 0, 15)),
      exclusiveArea: new Prisma.Decimal('59.99'),
      floor: null, dealAmount: null, deposit: 50000, monthlyRent: null,
    });
    // JSON.stringify는 undefined인 키를 통째로 빼버려 해시가 달라진다
    expect(JSON.stringify(out)).toContain('"floor":null');
    expect(JSON.stringify(out)).toContain('"monthlyRent":null');
  });
});
