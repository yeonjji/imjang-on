import { prisma } from '@/lib/db';
import { CONTENT_SCORE_SOURCE } from '@/lib/content-score/core';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ts = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000);
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.region.count(),
    // 실제 수집 잡만 센다 — 목록 점수 배치(content-score)는 매일 성공해 수집 중단을 가린다.
    prisma.ingestionRun.findFirst({
      where: { status: 'OK', finishedAt: { gte: yesterday }, source: { not: CONTENT_SCORE_SOURCE } },
    }),
  ]);
  const ok = checks.every((c) => c.status === 'fulfilled' && c.value);
  return Response.json(
    {
      status: ok ? 'ok' : 'degraded',
      ts,
      checks: checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'fail')),
    },
    { status: ok ? 200 : 503 },
  );
}
