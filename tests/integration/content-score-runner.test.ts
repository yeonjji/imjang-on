import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { runContentScore } from '@/scripts/ingest/content-score/runner';

const pt = (lat: number, lng: number) => `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
let rich: bigint, poor: bigint, seoul: bigint;
const before = new Date('2020-01-01T00:00:00Z');

async function insHospital(src: string, sgg: string, doctors: number | null, loc: string | null) {
  const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
    `INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,"sigunguCode","totalDoctors",location,"updatedAt")
     VALUES ($1,$2,'31','의원','UT',$3,$4,${loc ?? 'NULL'},$5) RETURNING id`,
    src, `UT${src}`, sgg, doctors, before,
  );
  return rows[0].id;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CSR-%'`);
  rich = await insHospital('UT-CSR-RICH', '99999', 6, pt(37.9, 130.0));
  poor = await insHospital('UT-CSR-POOR', '99999', null, null);
  seoul = await insHospital('UT-CSR-SEOUL', '11680', 6, null);
  for (const h of [rich, seoul]) {
    await prisma.hospitalDept.createMany({ data: ['01', '02', '03', '04'].map((c) => ({ hospitalId: h, deptCode: c, deptName: `과${c}` })) });
  }
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CSR-%'`);
  await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
  await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
  await prisma.$disconnect();
});

const read = (id: bigint) =>
  prisma.hospital.findUniqueOrThrow({ where: { id }, select: { contentScore: true, contentNearby: true, listRank: true, updatedAt: true } });

describe('content-score runner', () => {
  it('daily: 점수·정렬 키 계산, updatedAt 불변', async () => {
    await runContentScore({ entities: ['hospital'], mode: 'daily' });
    const r = await read(rich); const p = await read(poor); const s = await read(seoul);
    // rich: 깊이(과 4→2, 의사 6→2) + 진료과 2 + 지도 1 = 7 (의사 행은 dr* 컬럼이 없어 의료진 블록 0)
    expect(r.contentScore).toBe(7);
    expect(p.contentScore).toBe(0);
    expect(s.contentScore).toBe(6);
    expect(s.listRank).toBe(10006); // 서울
    expect(r.listRank).toBe(7);
    expect(r.updatedAt.toISOString()).toBe(before.toISOString());
  });
  it('재실행은 0행 갱신(멱등)', async () => {
    const res = await runContentScore({ entities: ['hospital'], mode: 'daily' });
    expect(res.find((x) => x.entity === 'hospital')!.updated).toBe(0);
  });
  it('weekly: 좌표 없는 행은 주변 0, 합계는 자체 점수 + 주간 점수', async () => {
    await runContentScore({ entities: ['hospital'], mode: 'weekly', pauseMs: 0 });
    const p = await read(poor); const r = await read(rich);
    expect(p.contentNearby).toBe(0);
    expect(r.contentScore).toBe(7 + r.contentNearby);
    expect(r.updatedAt.toISOString()).toBe(before.toISOString());
  });
  it('weekly 뒤 daily는 저장된 주간 점수를 유지한다', async () => {
    await prisma.$executeRawUnsafe(`UPDATE "Hospital" SET "contentNearby" = 2, "contentScore" = 9, "listRank" = 9 WHERE id = $1`, rich);
    await runContentScore({ entities: ['hospital'], mode: 'daily' });
    const r = await read(rich);
    expect(r.contentNearby).toBe(2);
    expect(r.contentScore).toBe(9);
  });
  it('주소 해석 안 되는 공원·주차장도 실패하지 않는다', async () => {
    await prisma.park.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
    await prisma.park.create({ data: { sourceId: 'UT-CSR-PK', name: 'UT공원', address: '해석불가 주소', parkType: '근린공원', area: 100 } });
    await prisma.parking.deleteMany({ where: { sourceId: { startsWith: 'UT-CSR-' } } });
    await prisma.parking.create({ data: { sourceId: 'UT-CSR-PG', name: 'UT주차', address: '해석불가 주소', chargeInfo: '무료' } });
    await expect(runContentScore({ entities: ['park', 'parking'], mode: 'weekly', pauseMs: 0 })).resolves.toBeDefined();
    const pk = await prisma.park.findFirstOrThrow({ where: { sourceId: 'UT-CSR-PK' }, select: { contentNearby: true, contentScore: true } });
    expect(pk.contentNearby).toBe(0);
    const pg = await prisma.parking.findFirstOrThrow({ where: { sourceId: 'UT-CSR-PG' }, select: { contentScore: true } });
    expect(pg.contentScore).toBeGreaterThanOrEqual(2); // 무료 → 요금 블록 2
  });
});
