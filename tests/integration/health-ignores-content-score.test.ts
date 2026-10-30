import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/health/route';

// 헬스 체크의 "최근 24시간 성공 수집"은 실제 수집 잡만 센다. 목록 점수 배치(content-score)는 매일 성공해서
// 이걸 세면 실제 수집이 전부 멈춰도 healthy로 보인다.
const REGION = 'UT99999999';
let saved: { id: bigint; finishedAt: Date | null }[] = [];
const created: bigint[] = [];

beforeAll(async () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  // 다른 테스트가 남긴 최근 OK 기록을 잠시 24시간 밖으로 밀어 두고 끝나면 되돌린다.
  saved = await prisma.ingestionRun.findMany({ where: { status: 'OK', finishedAt: { gte: yesterday } }, select: { id: true, finishedAt: true } });
  await prisma.ingestionRun.updateMany({ where: { id: { in: saved.map((s) => s.id) } }, data: { finishedAt: new Date(Date.now() - 3 * 86_400_000) } });
  await prisma.region.upsert({ where: { code: REGION }, update: {}, create: { code: REGION, sido: 'UT', fullName: 'UT', level: 1, sourceVersion: 'UT' } });
  created.push((await prisma.ingestionRun.create({ data: { source: 'content-score', targetKey: 'daily:hospital', status: 'OK', finishedAt: new Date() } })).id);
});

afterAll(async () => {
  // 이 테스트가 만든 기록만 지우고, 밀어 둔 다른 기록은 원래 시각으로 되돌린다.
  await prisma.ingestionRun.deleteMany({ where: { id: { in: created } } });
  for (const s of saved) await prisma.ingestionRun.updateMany({ where: { id: s.id }, data: { finishedAt: s.finishedAt } });
  await prisma.region.deleteMany({ where: { code: REGION } });
  await prisma.$disconnect();
});

describe('health', () => {
  it('content-score 성공 기록만 있으면 degraded(503)', async () => {
    expect((await GET()).status).toBe(503);
  });
  it('실제 수집 성공 기록이 있으면 ok(200)', async () => {
    created.push((await prisma.ingestionRun.create({ data: { source: 'UT-health', targetKey: 'x', status: 'OK', finishedAt: new Date() } })).id);
    expect((await GET()).status).toBe(200);
  });
});
