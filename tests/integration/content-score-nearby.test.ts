import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { nearbyFlags } from '@/lib/content-score/nearby-sql';
import { getNearbyApartments, getNearbyInfra, getNearbyChildcare } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';

// 동해 바다 좌표(실데이터 없음). A: 약국·역이 가까운 점, B: 아무것도 없는 점(A에서 약 50km)
const A = { lat: 37.9, lng: 130.0 };
const B = { lat: 37.9, lng: 130.6 };
const pt = (p: { lat: number; lng: number }) => `ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography`;
let hA: bigint, hB: bigint;

const ins = async (sql: string) => (await prisma.$queryRawUnsafe<{ id: bigint }[]>(sql))[0].id;
async function cleanup() {
  await prisma.$executeRawUnsafe(`DELETE FROM "Hospital" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Pharmacy" WHERE "sourceId" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "SubwayStation" WHERE "sourceKey" LIKE 'UT-CS-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Childcare" WHERE "sourceId" LIKE 'UT-CS-%'`);
}

beforeAll(async () => {
  await cleanup();
  hA = await ins(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,location,"updatedAt") VALUES ('UT-CS-HA','UT병원A','31','의원','UT',${pt(A)},now()) RETURNING id`);
  hB = await ins(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,location,"updatedAt") VALUES ('UT-CS-HB','UT병원B','31','의원','UT',${pt(B)},now()) RETURNING id`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Pharmacy"("sourceId",name,address,location,"updatedAt") VALUES ('UT-CS-RA','UT약국','UT',${pt({ lat: A.lat + 0.001, lng: A.lng })},now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO "Childcare"("sourceId",name,"sigunguCode",address,location,"updatedAt") VALUES ('UT-CS-CC','UT어린이집','99999','UT',${pt({ lat: A.lat + 0.003, lng: A.lng })},now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO "SubwayStation"(name,"nameNorm","sourceKey",location,"updatedAt") VALUES ('UT역','UT역','UT-CS-SUB',${pt({ lat: A.lat + 0.02, lng: A.lng })},now())`);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('주변 판정 SQL = 상세 함수', () => {
  it('병원 A/B: 아파트·지하철·인프라가 상세 함수 결과와 같다', async () => {
    const m = await nearbyFlags('Hospital', [hA, hB], { infraChildcare: true, nearChildcare: false });
    for (const [id, p] of [[hA, A], [hB, B]] as const) {
      const f = m.get(String(id))!;
      const apts = await getNearbyApartments(p.lat, p.lng);
      const sub = await getNearbySubwayStations(p.lat, p.lng);
      const infra = await getNearbyInfra(p.lat, p.lng, { excludeHospitalId: id, includeChildcare: true });
      expect(f.apts).toBe(apts.length > 0);
      expect(f.subway).toBe(sub.stations.length > 0);
      expect(f.infra).toBe(infra.length > 0); // 시드에 상가 없음(R2 범위 안)
    }
    expect(m.get(String(hA))!.infra).toBe(true);
    expect(m.get(String(hA))!.subway).toBe(true);
    expect(m.get(String(hB))!.subway).toBe(false);
  });
  it('자기 자신은 인프라에 세지 않는다', async () => {
    const m = await nearbyFlags('Hospital', [hB], { infraChildcare: true, nearChildcare: false });
    expect(m.get(String(hB))!.infra).toBe(false);
  });
  it('좌표 없는 행은 결과에 없다', async () => {
    const id = await ins(`INSERT INTO "Hospital"("sourceId",name,"typeCode","typeName",address,"updatedAt") VALUES ('UT-CS-HN','UT무좌표','31','의원','UT',now()) RETURNING id`);
    const m = await nearbyFlags('Hospital', [id], { infraChildcare: true, nearChildcare: false });
    expect(m.has(String(id))).toBe(false);
  });
  it('주변 어린이집 판정은 getNearbyChildcare와 같다', async () => {
    const m = await nearbyFlags('Hospital', [hA], { infraChildcare: false, nearChildcare: true });
    const cc = await getNearbyChildcare(A.lat, A.lng, 1000, 5);
    expect(cc.length).toBeGreaterThan(0);
    expect(m.get(String(hA))!.childcare).toBe(true);
    const mb = await nearbyFlags('Hospital', [hB], { infraChildcare: false, nearChildcare: true });
    expect(mb.get(String(hB))!.childcare).toBe(false);
  });
});
