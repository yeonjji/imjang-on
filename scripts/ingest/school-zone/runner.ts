/**
 * 학구도 적재(반기 수동). 3·9월 배포 후 실행한다.
 *   pnpm ingest:school-zone                      # data.go.kr에서 직접 받음
 *   pnpm ingest:school-zone --zone-zip=… --link-csv=…   # 받아 둔 파일로
 * 화면은 ISR 주기로 반영되므로 revalidate를 호출하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { SCHOOL_ZONE_DATASETS, downloadFileData } from './download';
import { readZoneZip, parseLinkCsv } from './parse';
import { replaceSchoolZones } from './load';

export const SCHOOL_ZONE_SOURCE = 'school-zone';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({ data: { source: SCHOOL_ZONE_SOURCE, targetKey: 'loading', status: 'RUNNING' } });
  try {
    const zonePath = arg('zone-zip');
    const linkPath = arg('link-csv');
    const zoneBytes = zonePath ? new Uint8Array(readFileSync(zonePath)) : await downloadFileData(SCHOOL_ZONE_DATASETS.zone);
    const linkBytes = linkPath ? new Uint8Array(readFileSync(linkPath)) : await downloadFileData(SCHOOL_ZONE_DATASETS.link);
    const zones = await readZoneZip(zoneBytes);
    const links = parseLinkCsv(linkBytes);
    const baseDate = zones[0]?.baseDate ?? 'unknown';
    logger.info({ zones: zones.length, links: links.length, baseDate }, 'school-zone parsed');
    const r = await replaceSchoolZones(zones, links);
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', targetKey: baseDate, rowsUpserted: r.zones, finishedAt: new Date() } });
    await notify('info', `school-zone ${baseDate} 적재 완료`, r);
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'school-zone failed');
    await notify('error', 'school-zone failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('school-zone/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'school-zone runner fatal');
    process.exit(1);
  });
}
