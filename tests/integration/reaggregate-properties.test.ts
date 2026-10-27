import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { PropertyType, DealType } from '@prisma/client';
import { runReaggregate, rollbackFromBackup } from '@/scripts/ops/reaggregate-properties';

// S2 재집계 도구: dry-run 기본(쓰기 없음), --apply는 백업 후 바뀐 행만 쓰기, 롤백, 체크포인트 재개, 정지 파일.
const REGION = '9991000000';
const DAY = 86_400_000;
const ago = (n: number) => { const d = new Date(Date.now() - n * DAY); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
let seq = 0;
const tx = (propertyId: bigint, days: number, amount: number, cancelType: string | null = null) => ({
  rawHash: `UT-REAGG-${++seq}`, propertyId, propertyType: PropertyType.APARTMENT, regionCode: REGION, sigunguCode: '99910',
  dealType: DealType.SALE, contractDate: ago(days), exclusiveArea: 84.9, floor: 3, dealAmount: amount, cancelType, source: 'test',
});
let ids: bigint[] = [];
let dir: string;

async function seed() {
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  ids = [];
  for (let i = 0; i < 5; i++) {
    const p = await prisma.property.create({ data: { propertyType: PropertyType.APARTMENT, name: `UT재집계${i}`, nameNorm: `UT재집계${i}`, regionCode: REGION, address: 'UT' } });
    ids.push(p.id);
  }
  // 0: 집계 누락(D1) — 거래 있는데 저장 0 / 1: 해제가 최근가로 저장 / 2: 이미 정확 / 3: 12개월 고정(D2) / 4: 거래 없음, 저장도 0
  await prisma.transaction.createMany({ data: [
    tx(ids[0], 30, 100000),
    tx(ids[1], 40, 110000), tx(ids[1], 5, 300000, 'O'),
    tx(ids[2], 50, 120000),
    tx(ids[3], 400, 130000),
  ] });
  await prisma.property.update({ where: { id: ids[1] }, data: { txCountTotal: 2, txCount12m: 2, saleCount12m: 2, saleLastPrice: 300000n, saleAvgPrice12m: 205000n } });
  await prisma.property.update({ where: { id: ids[3] }, data: { txCountTotal: 1, txCount12m: 1, saleCount12m: 1, saleAvgPrice12m: 130000n } });
  // 2는 정확한 값으로 맞춰 둔다
  await runReaggregate({ target: { kind: 'ids', ids: [ids[2]] }, apply: true, backupDir: dir, pauseMs: 0 });
}

beforeAll(async () => {
  await prisma.region.upsert({
    where: { code: REGION },
    create: { code: REGION, sido: 'UT도', sigungu: 'UT재집계시', level: 2, isAbolished: false, fullName: 'UT도 UT재집계시', sourceVersion: 'test' },
    update: {},
  });
});
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'reagg-'));
  await seed();
});
afterAll(async () => {
  await prisma.transaction.deleteMany({ where: { regionCode: REGION } });
  await prisma.property.deleteMany({ where: { regionCode: REGION } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

const snapshot = () => prisma.property.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });

describe('dry-run(기본)', () => {
  it('바뀔 행 수만 세고 아무것도 쓰지 않는다', async () => {
    const before = await snapshot();
    const r = await runReaggregate({ target: { kind: 'ids', ids }, pauseMs: 0 });
    expect(r).toMatchObject({ apply: false, scanned: 5, changed: 3, stoppedBy: 'done' }); // 0·1·3
    expect(await snapshot()).toEqual(before);
  });
});

describe('--apply', () => {
  it('백업을 남기고 바뀐 행만 고친다', async () => {
    const r = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, pauseMs: 0 });
    expect(r).toMatchObject({ apply: true, scanned: 5, changed: 3 });
    const after = await snapshot();
    expect(after[0]).toMatchObject({ txCountTotal: 1, saleLastPrice: 100000n });
    expect(after[1]).toMatchObject({ txCountTotal: 1, saleLastPrice: 110000n, saleCount12m: 1 });
    expect(after[3]).toMatchObject({ txCountTotal: 1, saleCount12m: 0, saleAvgPrice12m: null });
    const lines = readFileSync(r.backupFile!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id)).toEqual([ids[0], ids[1], ids[3]].map(String));
    expect(lines[1].old.saleLastPrice).toBe(300000);
  });

  it('백업 디렉터리 없이 --apply는 거부한다', async () => {
    await expect(runReaggregate({ target: { kind: 'ids', ids }, apply: true })).rejects.toThrow(/backupDir/);
  });

  it('롤백하면 실행 전 값으로 돌아간다(백업 파일 기준)', async () => {
    const before = await snapshot();
    const r = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, pauseMs: 0 });
    expect(await rollbackFromBackup(r.backupFile!)).toBe(3);
    expect(await snapshot()).toEqual(before);
  });
});

describe('중단·재개', () => {
  it('maxBatches로 멈춘 뒤 체크포인트에서 이어 간다(같은 행을 두 번 처리하지 않음)', async () => {
    const checkpointFile = join(dir, 'cp.json');
    const r1 = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, batchSize: 2, maxBatches: 1, checkpointFile, pauseMs: 0 });
    expect(r1).toMatchObject({ scanned: 2, stoppedBy: 'maxBatches' });
    const r2 = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, batchSize: 2, checkpointFile, resume: true, pauseMs: 0 });
    expect(r2).toMatchObject({ scanned: 3, stoppedBy: 'done' });
    expect(r1.changed + r2.changed).toBe(3);
  });

  it('정지 파일이 있으면 다음 묶음을 시작하지 않는다', async () => {
    const stopFile = join(dir, 'stop');
    writeFileSync(stopFile, '');
    const r = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, stopFile, pauseMs: 0 });
    expect(r).toMatchObject({ scanned: 0, stoppedBy: 'stopFile' });
  });

  it('디스크 여유가 기준보다 적으면 멈춘다', async () => {
    const r = await runReaggregate({ target: { kind: 'ids', ids }, apply: true, backupDir: dir, minFreeGb: 1e9, pauseMs: 0 });
    expect(r.stoppedBy).toBe('disk');
  });

  it('같은 잠금 파일로 두 번 동시에 실행할 수 없다', async () => {
    const lockFile = join(dir, 'reagg.lock');
    writeFileSync(lockFile, 'other');
    await expect(runReaggregate({ target: { kind: 'ids', ids }, lockFile, pauseMs: 0 })).rejects.toThrow(/실행 중/);
    rmSync(lockFile);
    await runReaggregate({ target: { kind: 'ids', ids }, lockFile, pauseMs: 0 });
    expect(existsSync(lockFile)).toBe(false); // 끝나면 잠금 해제
  });
});

describe('대상 선택', () => {
  it('cancelled-apartments는 해제 거래가 있는 아파트만', async () => {
    const r = await runReaggregate({ target: { kind: 'cancelled-apartments', regionCode: REGION }, pauseMs: 0 });
    expect(r).toMatchObject({ scanned: 1, changed: 1 });
  });

  it('enqueueDiff는 쓰지 않고 바뀔 매물을 대기열에 넣는다(주간 점검)', async () => {
    await prisma.propertyAggregateQueue.deleteMany({});
    const r = await runReaggregate({ target: { kind: 'ids', ids }, enqueueDiff: true, pauseMs: 0 });
    expect(r.changed).toBe(3);
    expect((await prisma.propertyAggregateQueue.findMany({ orderBy: { propertyId: 'asc' } })).map((q) => q.propertyId)).toEqual([ids[0], ids[1], ids[3]]);
    await prisma.propertyAggregateQueue.deleteMany({});
  });
});
