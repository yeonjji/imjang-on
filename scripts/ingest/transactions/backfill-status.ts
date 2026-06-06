import { appendFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { getRangeMonths } from './months';
import type { ApiType } from '@/scripts/ingest/types';

const SOURCE_BY_API: Record<ApiType, string> = {
  'apt-trade': 'molit-apt-trade',
  'apt-rent': 'molit-apt-rent',
  'offi-trade': 'molit-offi-trade',
  'offi-rent': 'molit-offi-rent',
  'rh-trade': 'molit-rh-trade',
  'rh-rent': 'molit-rh-rent',
};

function arg(key: string): string | undefined {
  return process.argv.slice(2).find((a) => a.startsWith(`--${key}=`))?.split('=')[1];
}

async function main() {
  const api = arg('api') as ApiType | undefined;
  const from = arg('from');
  const to = arg('to');
  if (!api || !SOURCE_BY_API[api] || !from || !to) {
    throw new Error('usage: backfill-status.ts --api=<apiType> --from=YYYYMM --to=YYYYMM');
  }
  const source = SOURCE_BY_API[api];
  const months = getRangeMonths(from, to);
  const monthSet = new Set(months);

  const sigunguCount = await prisma.region.count({ where: { level: 2, isAbolished: false } });
  const expected = sigunguCount * months.length;

  const okRuns = await prisma.ingestionRun.findMany({
    where: { source, status: 'OK' },
    select: { targetKey: true },
  });
  const okInRange = new Set<string>();
  for (const r of okRuns) {
    const m = r.targetKey.split('-')[1];
    if (monthSet.has(m)) okInRange.add(r.targetKey);
  }

  const pending = Math.max(0, expected - okInRange.size);
  console.log(`source=${source} months=${months.length} expected=${expected} ok=${okInRange.size} pending=${pending}`);

  // GitHub Actions step output (워크플로의 조건부 실행용)
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `pending=${pending}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
