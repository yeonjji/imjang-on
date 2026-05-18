import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ts = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000);
  const checks = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    prisma.region.count(),
    prisma.ingestionRun.findFirst({
      where: { status: 'OK', finishedAt: { gte: yesterday } },
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
