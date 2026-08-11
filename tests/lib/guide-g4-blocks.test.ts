import { describe, it, expect } from 'vitest';
import { getSchoolHighschoolTypes } from '@/lib/guide/blocks/school-highschool-types';
import { getHospitalByDept } from '@/lib/guide/blocks/hospital-by-dept';
import { getPublicHealthCenters } from '@/lib/guide/blocks/public-health-centers';
import { getSpecialSupplyMix } from '@/lib/guide/blocks/special-supply-mix';
import { getHousingLoanProducts } from '@/lib/guide/blocks/housing-loan-products';
import { getInfraInventory } from '@/lib/guide/blocks/infra-inventory';
import { GUIDE_DATA_BLOCK_KEYS } from '@/lib/guide/data-blocks';
import { GUIDE_BLOCK_PLACEMENTS } from '@/lib/guide/insert-blocks';

/**
 * 값 자체는 운영 규모 데이터에 기대므로 검증할 수 없다. 테스트는 계약만 본다 —
 * 빈 DB에서 던지지 않고, 형태가 맞고, 합계가 내부적으로 일관되는지.
 */
describe('G-4 블록 집계 계약', () => {
  it('빈 데이터에서도 던지지 않고 배열을 돌려준다', async () => {
    await expect(getSchoolHighschoolTypes()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(getHospitalByDept()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(getPublicHealthCenters()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(getSpecialSupplyMix()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(getHousingLoanProducts()).resolves.toMatchObject({ rows: expect.any(Array) });
    await expect(getInfraInventory()).resolves.toMatchObject({ rows: expect.any(Array) });
  });

  it('생활 인프라 합계는 각 항목의 합과 같고 내림차순이다', async () => {
    const r = await getInfraInventory();
    expect(r.total).toBe(r.rows.reduce((s, x) => s + x.count, 0));
    const counts = r.rows.map((x) => x.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('주거 대출 상품 수 합계가 total과 같다', async () => {
    const r = await getHousingLoanProducts();
    expect(r.total).toBe(r.rows.reduce((s, x) => s + x.products, 0));
  });

  it('특별공급 유형 합계가 특별공급 계를 넘지 않는다', async () => {
    const r = await getSpecialSupplyMix();
    const sum = r.rows.reduce((s, x) => s + x.households, 0);
    if (r.specialTotal > 0) expect(sum).toBe(r.specialTotal); // 나머지 몫을 한 줄로 흡수하므로 정확히 같다
    for (const row of r.rows) expect(row.households).toBeGreaterThan(0);
  });
});

describe('G-4 배치', () => {
  it('추가한 블록키가 전부 등록돼 있고 가이드는 중복되지 않는다', () => {
    const added = [
      'school-highschool-types', 'hospital-by-dept', 'public-health-centers',
      'special-supply-mix', 'housing-loan-products', 'infra-inventory',
    ] as const;
    for (const k of added) expect(GUIDE_DATA_BLOCK_KEYS).toContain(k);

    const dedupeKeys = GUIDE_BLOCK_PLACEMENTS.map((p) => p.dedupeKey);
    expect(new Set(dedupeKeys).size).toBe(dedupeKeys.length);
    const blockKeys = GUIDE_BLOCK_PLACEMENTS.map((p) => p.blockKey);
    expect(new Set(blockKeys).size).toBe(blockKeys.length);
  });
});
