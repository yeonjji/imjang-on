import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { runCollect, type FetchItems } from '@/scripts/ingest/building-register/runner';
import { QuotaExceededError } from '@/scripts/ingest/apt-complex/http';

const REGION_CODE = '1171000000';
const SGG = '11710';
const PFX = 'UT-BR-';
const ids: Record<string, bigint> = {};

async function prop(key: string, type: PropertyType, builtYear: number, txs: { umd: string; jibun: string }[]) {
  const p = await prisma.property.create({ data: { propertyType: type, name: `${PFX}${key}`, nameNorm: `${PFX}${key}`.toLowerCase(), regionCode: REGION_CODE, address: 'x', builtYear } });
  let i = 0;
  for (const t of txs) {
    await prisma.transaction.create({
      data: {
        propertyId: p.id, propertyType: type, regionCode: REGION_CODE, sigunguCode: SGG, dealType: DealType.SALE,
        contractDate: new Date('2026-01-05'), exclusiveArea: 59.9, umd: t.umd, jibun: t.jibun, source: 'ut-br',
        rawHash: `${PFX}${key}-${i++}`.padEnd(64, '0'),
      },
    });
  }
  ids[key] = p.id;
}

const title = { mainAtchGbCd: '0', mainPurpsCdNm: '공동주택', etcPurps: '공동주택, 제1종근린생활시설', useAprDay: '20190830', crtnDay: '20220813', strctCdNm: '철근콘크리트구조', grndFlrCnt: 6, hhldCnt: 14, rideUseElvtCnt: 1, indrAutoUtcnt: 9, oudrAutoUtcnt: 3, rserthqkDsgnApplyYn: '1' };
const fake: FetchItems = async (op) => {
  if (op === 'getBrRecapTitleInfo') return [];
  if (op === 'getBrTitleInfo') return [title];
  return [{ jijiguGbCdNm: '용도지역코드', jijiguCdNm: '제2종일반주거지역', reprYn: '1' }];
};

async function cleanup() {
  const ps = await prisma.property.findMany({ where: { name: { startsWith: PFX } }, select: { id: true } });
  const pids = ps.map((p) => p.id);
  await prisma.buildingRegister.deleteMany({ where: { propertyId: { in: pids } } });
  await prisma.transaction.deleteMany({ where: { source: 'ut-br' } });
  await prisma.property.deleteMany({ where: { id: { in: pids } } });
  await prisma.legalDong.deleteMany({ where: { code: { in: ['1171010100', '1171010200'] } } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.region.upsert({ where: { code: REGION_CODE }, update: {}, create: { code: REGION_CODE, sido: '서울특별시', sigungu: '송파구', fullName: '서울특별시 송파구', level: 2, sourceVersion: 'ut' } });
  await prisma.legalDong.createMany({ data: [{ code: '1171010100', sigunguCode: SGG, name: '잠실동' }, { code: '1171010200', sigunguCode: SGG, name: '신천동' }] });
  await prop('OK', PropertyType.MULTIPLEX, 2019, [{ umd: '잠실동', jibun: '165-18' }, { umd: '잠실동', jibun: '165-18' }]);
  await prop('MULTI', PropertyType.MULTIPLEX, 2019, [{ umd: '잠실동', jibun: '1' }, { umd: '신천동', jibun: '2' }]);
  await prop('BAD', PropertyType.MULTIPLEX, 2019, [{ umd: '없는동', jibun: '1' }]);
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.buildingRegister.deleteMany({ where: { propertyId: { in: Object.values(ids) } } });
});
const only = () => Object.values(ids);

describe('runCollect', () => {
  it('키를 못 만든 단지는 호출하지 않고 상태만 저장, 채택 단지는 정규화 저장', async () => {
    const calls: string[] = [];
    const r = await runCollect({ propertyIds: only(), fetchItems: async (op, key) => { calls.push(`${op}:${key.bun}-${key.ji}`); return fake(op, key); } });
    expect(r).toMatchObject({ processed: 3, matched: 1, quotaHit: false, timeUp: false });
    expect(calls).toEqual(['getBrRecapTitleInfo:0165-0018', 'getBrTitleInfo:0165-0018', 'getBrJijiguInfo:0165-0018']);
    const ok = await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.OK } });
    expect(ok).toMatchObject({ status: 'matched', bjdCode: '1171010100', bun: '0165', ji: '0018', parkingTotal: 12, seismicApplied: 1, zoningName: '제2종일반주거지역', hasNeighborhoodFacility: true });
    expect((await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.MULTI } })).status).toBe('multi_pair');
    expect((await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.BAD } })).status).toBe('bad_key');
  });

  it('API 오류는 api_error로 저장되고 다음 실행에서 다시 받는다', async () => {
    await runCollect({ propertyIds: only(), fetchItems: async () => { throw new Error('HTTP 500'); } });
    expect((await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.OK } })).status).toBe('api_error');
    const r = await runCollect({ propertyIds: only(), fetchItems: fake });
    expect(r.processed).toBe(1);
    expect((await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.OK } })).status).toBe('matched');
  });

  it('한도 초과면 저장 없이 즉시 멈춘다', async () => {
    const r = await runCollect({ propertyIds: [ids.OK], fetchItems: async () => { throw new QuotaExceededError(); } });
    expect(r).toMatchObject({ processed: 0, quotaHit: true });
    expect(await prisma.buildingRegister.findUnique({ where: { propertyId: ids.OK } })).toBeNull();
  });

  it('시간 예산이 지나면 시작하지 않는다', async () => {
    const r = await runCollect({ propertyIds: only(), deadline: Date.now() - 1, fetchItems: fake });
    expect(r).toMatchObject({ processed: 0, timeUp: true });
  });

  it('저장 실패는 api_error가 아니라 save_error로 남기고 다시 받지 않는다', async () => {
    const huge: FetchItems = async (op, key) => {
      if (op === 'getBrJijiguInfo') return [{ jijiguGbCdNm: '용도지역코드', jijiguCdNm: '제2종일반주거지역', reprYn: '1', note: '\u0000' }];
      return fake(op, key);
    };
    await runCollect({ propertyIds: [ids.OK], fetchItems: huge });
    expect((await prisma.buildingRegister.findUniqueOrThrow({ where: { propertyId: ids.OK } })).status).toBe('save_error');
    let calls = 0;
    await runCollect({ propertyIds: [ids.OK], fetchItems: async (...a) => { calls++; return fake(...a); } });
    expect(calls).toBe(0);
  });
});
