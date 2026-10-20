import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';
import { getSchoolZoneView } from '@/lib/school-zone-query';

const REGION_CODE = '1171000000';
let insideId: bigint;
let outsideId: bigint;
let schoolId: bigint;

async function prop(name: string, lng: number, lat: number) {
  const p = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name, nameNorm: name.toLowerCase(), regionCode: REGION_CODE, address: 'x' } });
  await prisma.$executeRaw`UPDATE "Property" SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography WHERE id = ${p.id}`;
  return p.id;
}

beforeAll(async () => {
  await prisma.$executeRaw`DELETE FROM "SchoolZone" WHERE "hakgudoId" = 'UT-SZQ-1'`;
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-SZQ' } } });
  await prisma.school.deleteMany({ where: { sourceId: 'UT-SZQ-S1' } });
  await prisma.region.upsert({
    where: { code: REGION_CODE },
    create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'test' },
    update: {},
  });
  insideId = await prop('UT-SZQ-IN', 127.026, 37.4965);
  outsideId = await prop('UT-SZQ-OUT', 0.0, 0.0); // 국내 학구가 있을 수 없는 좌표(로컬 DB에 실데이터가 있어도 안전)
  const s = await prisma.school.create({ data: { sourceId: 'UT-SZQ-S1', name: '테스트초등학교', address: 'x', schoolKind: '초등학교', sigunguCode: '11650' } });
  schoolId = s.id;
  await prisma.$executeRaw`UPDATE "School" SET location = ST_SetSRID(ST_MakePoint(127.026, 37.4990), 4326)::geography WHERE id = ${schoolId}`;
  await prisma.$executeRaw`
    INSERT INTO "SchoolZone" ("hakgudoId", name, kind, "eduName", "baseDate", geom)
    VALUES ('UT-SZQ-1', '테스트초통학구역', 'general', '서울특별시강남서초교육지원청', '2025-09-22',
            ST_Multi(ST_MakeEnvelope(127.024, 37.4945, 127.028, 37.4985, 4326)))`;
  await prisma.schoolZoneSchool.create({ data: { hakgudoId: 'UT-SZQ-1', schId: 'B1', schoolName: '테스트초등학교', eduOffice: '서울특별시교육청', isPrimary: true, schoolId } });
});
afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "SchoolZone" WHERE "hakgudoId" = 'UT-SZQ-1'`;
  await prisma.property.deleteMany({ where: { name: { startsWith: 'UT-SZQ' } } });
  await prisma.school.deleteMany({ where: { sourceId: 'UT-SZQ-S1' } });
  await prisma.$disconnect();
});

describe('getSchoolZoneView', () => {
  it('아파트 좌표가 포함된 학구의 학교를 링크·직선거리와 함께 돌려준다', async () => {
    const v = (await getSchoolZoneView(insideId))!;
    expect(v.zoneName).toBe('테스트초통학구역');
    expect(v.eduName).toBe('서울특별시강남서초교육지원청');
    expect(v.primary).toEqual([{ name: '테스트초등학교', href: `/school/11650/${schoolId}`, distanceLabel: '약 280m' }]);
  });
  it('학구 밖이면 null', async () => {
    expect(await getSchoolZoneView(outsideId)).toBeNull();
  });
});
