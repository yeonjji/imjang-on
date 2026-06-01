import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE_VERSION = process.env.REGION_SOURCE_VERSION ?? new Date().toISOString().slice(0, 7);

async function main() {
  const path = resolve(process.argv[2] ?? './data/regions.txt');
  logger.info({ path, version: SOURCE_VERSION }, 'seeding regions');

  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('법정동코드'));

  const records = lines.map((line) => {
    const [code, fullName, status, abolishedDate] = line.split('\t');
    const parts = (fullName ?? '').split(/\s+/);
    const sido = parts[0] ?? '';
    const sigungu = parts[1] ?? null;
    const eupmyeondong = parts[2] ?? null;
    const ri = parts[3] ?? null;
    const level = (eupmyeondong ? (ri ? 4 : 3) : sigungu ? 2 : 1);
    return {
      code: code.trim(),
      sido,
      sigungu,
      eupmyeondong,
      ri,
      fullName: fullName?.trim() ?? '',
      level,
      parentCode: derivedParent(code, level),
      isAbolished: status?.trim() === '폐지',
      abolishedAt: abolishedDate?.trim() ? new Date(abolishedDate.trim()) : null,
      sourceVersion: SOURCE_VERSION,
    };
  });

  const chunkSize = 1000;
  let upserted = 0;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((r) =>
        prisma.region.upsert({
          where: { code: r.code },
          create: r,
          update: r,
        }),
      ),
    );
    upserted += chunk.length;
    logger.info({ upserted, total: records.length }, 'seeded region chunk');
  }
  await prisma.$disconnect();
  logger.info({ upserted }, 'region seed done');
}

function derivedParent(code: string, level: number): string | null {
  if (level <= 1) return null;
  if (level === 2) return code.slice(0, 2).padEnd(10, '0');
  if (level === 3) return code.slice(0, 5).padEnd(10, '0');
  return code.slice(0, 8).padEnd(10, '0');
}

main().catch((err) => {
  logger.error({ err }, 'region seed failed');
  process.exit(1);
});
