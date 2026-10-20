import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { readZoneZip, parseLinkCsv } from '@/scripts/ingest/school-zone/parse';
import { replaceSchoolZones } from '@/scripts/ingest/school-zone/load';

const FX = 'tests/ingest/fixtures/school-zone/';
const PFX = 'UT-SZ-';

async function school(name: string, eduOffice: string, lng: number, lat: number) {
  const s = await prisma.school.create({ data: { sourceId: `${PFX}${name}-${lng}`, name, address: 'x', schoolKind: '초등학교', eduOffice, sigunguCode: '11650' } });
  await prisma.$executeRaw`UPDATE "School" SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography WHERE id = ${s.id}`;
  return s.id;
}
let near: bigint; let gaNear: bigint;

beforeAll(async () => {
  // 이 테스트는 학구 테이블 전체를 교체한다. 앞서 남은 학구(실데이터 적재·e2e 시드)가 있으면
  // 90% 가드가 정상적으로 적재를 거부하므로, 시작 상태를 비워 둔다.
  await prisma.$executeRaw`DELETE FROM "SchoolZone"`;
  await prisma.school.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  near = await school('테스트초등학교', '서울특별시교육청', 127.026, 37.4966);      // 학구1 안
  gaNear = await school('가람초등학교', '서울특별시교육청', 127.051, 37.5005);      // 학구2 옆
  await school('가람초등학교', '서울특별시교육청', 127.30, 37.60);                  // 같은 이름, 20km+ 밖
});
afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "SchoolZone"`;
  await prisma.school.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('replaceSchoolZones', () => {
  it('5186 폴리곤을 4326으로 적재하고 학교를 확실할 때만 매칭한다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    const r = await replaceSchoolZones(zones, links);
    expect(r).toMatchObject({ zones: 3, links: 5 });
    const [hit] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "hakgudoId" AS id FROM "SchoolZone" WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(127.026, 37.4965), 4326))`;
    expect(hit.id).toBe('Z000000001');
    const rows = await prisma.schoolZoneSchool.findMany({ orderBy: [{ hakgudoId: 'asc' }, { schId: 'asc' }] });
    const by = (z: string, n: string) => rows.find((x) => x.hakgudoId === z && x.schoolName === n)!;
    expect(by('Z000000001', '테스트초등학교').schoolId).toBe(near);
    expect(by('Z000000002', '가람초등학교').schoolId).toBe(gaNear);      // 같은 이름 2곳 → 3km 이내 1곳
    expect(by('Z000000002', '나래초등학교').schoolId).toBeNull();        // 우리 DB에 없음
    expect(by('Z000000003', '먼산초등학교').isPrimary).toBe(false);      // 광역 비기본
    expect(by('Z000000003', '가람초등학교').isPrimary).toBe(true);
  });

  it('같은 학구 ID가 두 번 오면 폴리곤을 합친다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    const dup = [...zones, { ...zones[1], hakgudoId: zones[0].hakgudoId }];
    const r = await replaceSchoolZones(dup, links);
    expect(r.zones).toBe(3);
    const [n] = await prisma.$queryRaw<{ n: number }[]>`SELECT ST_NumGeometries(geom)::int AS n FROM "SchoolZone" WHERE "hakgudoId" = 'Z000000001'`;
    expect(n.n).toBe(2);
  });

  it('이전의 90% 미만이면 거부하고 기존 데이터를 지킨다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    await replaceSchoolZones(zones, links);
    await expect(replaceSchoolZones(zones.slice(0, 1), links)).rejects.toThrow(/90%/);
    expect(await prisma.schoolZone.count()).toBe(3);
  });

  it('두 파일의 기준일이 다르면 적재하지 않는다(판 섞임 방지)', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv'))).map((l) => ({ ...l, baseDate: '2026-03-22' }));
    await expect(replaceSchoolZones(zones, links)).rejects.toThrow(/기준일/);
  });

  it('학교 연계가 이전의 90% 미만이면 거부한다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    await replaceSchoolZones(zones, links);
    await expect(replaceSchoolZones(zones, links.slice(0, 2))).rejects.toThrow(/90%/);
    expect(await prisma.schoolZoneSchool.count()).toBe(5);
  });
});
