import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { getHospitalRegions, getHospitalTypeCodes } from '@/lib/hospital';
import { getPharmacyRegions } from '@/lib/pharmacy';

// 필터 옵션은 DB DISTINCT로 접는다 — 시군구·종별당 한 행, 키 이름·정렬 유지.
const P = 'UT-MFO-';
const SGG = ['99991', '99992'];
beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: P } } });
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: P } } });
  const rows = [0, 1, 2].map((i) => ({
    sourceId: `${P}${i}`, name: `UT${i}`, address: 'UT', sido: '유닛시', sigungu: i < 2 ? '가구' : '나구', sigunguCode: i < 2 ? SGG[0] : SGG[1],
  }));
  await prisma.hospital.createMany({ data: rows.map((r, i) => ({ ...r, typeCode: i < 2 ? 'U1' : 'U2', typeName: i < 2 ? '유닛A' : '유닛B' })) });
  await prisma.pharmacy.createMany({ data: rows });
});
afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: P } } });
  await prisma.pharmacy.deleteMany({ where: { sourceId: { startsWith: P } } });
  await prisma.$disconnect();
});

describe('의료 목록 필터 옵션', () => {
  it('병원 지역: 시군구당 한 행, sido·sigungu 순', async () => {
    const mine = (await getHospitalRegions()).filter((r) => SGG.includes(r.sigunguCode));
    expect(mine).toEqual([
      { sido: '유닛시', sigungu: '가구', sigunguCode: '99991' },
      { sido: '유닛시', sigungu: '나구', sigunguCode: '99992' },
    ]);
  });
  it('병원 종별: 종별당 한 행', async () => {
    const mine = (await getHospitalTypeCodes()).filter((r) => r.typeCode.startsWith('U'));
    expect(mine).toEqual([{ typeCode: 'U1', typeName: '유닛A' }, { typeCode: 'U2', typeName: '유닛B' }]);
  });
  it('약국 지역: 시군구당 한 행', async () => {
    const mine = (await getPharmacyRegions()).filter((r) => SGG.includes(r.sigunguCode));
    expect(mine.map((r) => r.sigunguCode)).toEqual(SGG);
  });
});
