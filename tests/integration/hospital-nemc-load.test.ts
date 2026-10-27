import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { loadNemcHours } from '@/scripts/ingest/hospital-nemc/load';
import { runCollect } from '@/scripts/ingest/hospital-nemc/runner';
import type { NemcHospital } from '@/lib/hospital/nemc';

const PFX = 'UT-NEMC-';
const hours = (o: Record<string, number>) => ({
  openMon: null, closeMon: null, openTue: null, closeTue: null, openWed: null, closeWed: null,
  openThu: null, closeThu: null, openFri: null, closeFri: null, openSat: null, closeSat: null,
  openSun: null, closeSun: null, openHol: null, closeHol: null, ...o,
});
const n = (name: string, addr: string, h: Record<string, number> = { openMon: 900, closeMon: 1800 }): NemcHospital =>
  ({ hpid: `H-${name}`, name, addr, tel: '', note: '점심 13:00~14:00', hours: hours(h) });
let a: bigint; let b: bigint;

beforeAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  a = (await prisma.hospital.create({ data: { sourceId: `${PFX}A`, name: 'UT가나의원', typeCode: '31', typeName: '의원', address: 'UT도 UT시 가나로 1, (UT동)' } })).id;
  b = (await prisma.hospital.create({ data: { sourceId: `${PFX}B`, name: 'UT다라의원', typeCode: '31', typeName: '의원', address: 'UT도 UT시 다라로 2' } })).id;
});
afterAll(async () => {
  await prisma.hospital.deleteMany({ where: { sourceId: { startsWith: PFX } } });
  await prisma.$disconnect();
});

describe('loadNemcHours', () => {
  it('매칭된 곳만 upsert', async () => {
    const r = await loadNemcHours([n('UT가나의원', 'UT도 UT시 가나로 1 (UT동)'), n('UT없는의원', 'UT도 UT시 없는로 9')], { complete: true, fetchedAt: new Date() });
    expect(r).toMatchObject({ received: 2, matched: 1, unmatched: 1, upserted: 1 });
    const row = await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: a } });
    expect(row).toMatchObject({ openMon: 900, closeMon: 1800, note: '점심 13:00~14:00' });
  });
  it('중간 실패(complete=false)면 못 본 행을 지우지 않는다', async () => {
    const r = await loadNemcHours([n('UT다라의원', 'UT도 UT시 다라로 2')], { complete: false, fetchedAt: new Date() });
    expect(r.deleted).toBe(0);
    expect(await prisma.hospitalNemcHours.count({ where: { hospitalId: { in: [a, b] } } })).toBe(2);
  });
  it('끝까지 성공하면 이번에 못 본 행을 지운다', async () => {
    const r = await loadNemcHours([n('UT다라의원', 'UT도 UT시 다라로 2')], { complete: true, fetchedAt: new Date() });
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: a } })).toBeNull();
  });
});

describe('runCollect', () => {
  const xml = (items: string, total: number) =>
    `<response><header><resultCode>00</resultCode></header><body><items>${items}</items><totalCount>${total}</totalCount></body></response>`;
  it('2페이지에서 실패하면 complete=false로 적재하고 throw하지 않는다', async () => {
    const r = await runCollect(async (p) => {
      if (p === 1) return xml('<item><hpid>H1</hpid><dutyName>UT다라의원</dutyName><dutyAddr>UT도 UT시 다라로 2</dutyAddr></item>', 6000);
      throw new Error('timeout');
    });
    expect(r.complete).toBe(false);
    expect(await prisma.hospitalNemcHours.findUnique({ where: { hospitalId: b } })).not.toBeNull();
  });
  it('0건이면 throw(\'OK · 0건\' 금지)', async () => {
    await expect(runCollect(async () => xml('', 0))).rejects.toThrow(/0건/);
  });
});
