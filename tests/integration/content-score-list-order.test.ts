import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getHospitalList } from '@/lib/hospital';

const SGG = '99998';
beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-CSL-' } } });
  // 25곳: 점수 9가 2곳, 5가 22곳(동점), 새 행(0) 1곳. 이름은 가나다순이 점수순과 다르게.
  const data = Array.from({ length: 25 }, (_, i) => ({
    sourceId: `UT-CSL-${String(i).padStart(2, '0')}`, name: `UT${String(99 - i).padStart(2, '0')}`, typeCode: '31', typeName: '의원', address: 'UT', sigunguCode: SGG,
    listRank: i < 2 ? 9 : i === 24 ? 0 : 5,
  }));
  await prisma.hospital.createMany({ data });
});
afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: 'UT-CSL-' } } });
  await prisma.$disconnect();
});

describe('목록 기본 정렬', () => {
  it('listRank 내림차순 → id 오름차순, 페이지 경계 중복·누락 없음, 새 행은 맨 뒤', async () => {
    const p1 = await getHospitalList({ sigunguCode: SGG }, 1, 20);
    const p2 = await getHospitalList({ sigunguCode: SGG }, 2, 20);
    const all = [...p1.rows, ...p2.rows];
    expect(new Set(all.map((r) => r.id)).size).toBe(25);
    expect(p1.rows.slice(0, 2).map((r) => r.listRank)).toEqual([9, 9]);
    expect(all.at(-1)!.listRank).toBe(0);
    const fives = all.filter((r) => r.listRank === 5).map((r) => r.id);
    expect(fives).toEqual([...fives].sort((a, b) => (a < b ? -1 : 1)));
  });
});
