/**
 * 법정동코드 조회표 적재(연 1회 수동, 국토교통부 파일 갱신 후).
 *   pnpm ingest:legal-dong              # data.go.kr에서 직접 받음
 *   pnpm ingest:legal-dong --csv=…      # 받아 둔 파일로
 */
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { downloadFileData } from '@/scripts/ingest/school-zone/download';
import { parseLegalDongCsv } from './parse';
import { replaceLegalDongs } from './load';

const DATASET = { publicDataPk: '15123287', detailPk: 'uddi:d6c67241-a722-48c4-8041-d66ff243cf57' };

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({ data: { source: 'legal-dong', targetKey: 'loading', status: 'RUNNING' } });
  try {
    const path = arg('csv');
    const bytes = path ? new Uint8Array(readFileSync(path)) : await downloadFileData(DATASET);
    const rows = parseLegalDongCsv(bytes);
    const n = await replaceLegalDongs(rows);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', targetKey: 'latest', rowsUpserted: n, finishedAt: new Date() } });
    await notify('info', `legal-dong 적재 완료 ${n}행`);
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'legal-dong failed');
    await notify('error', 'legal-dong failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('legal-dong/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'legal-dong runner fatal');
    process.exit(1);
  });
}
