/**
 * 국립중앙의료원 병·의원 찾기 → HospitalNemcHours. 주 1회 전국(약 16페이지).
 *   pnpm ingest:hospital-nemc
 * 화면은 DB만 읽는다(ISR 주기로 반영).
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { parseNemcPage, type NemcHospital } from '@/lib/hospital/nemc';
import { fetchNemcPage } from './http';
import { loadNemcHours, type LoadResult } from './load';

export const HOSPITAL_NEMC_SOURCE = 'hospital-nemc';

export async function runCollect(
  fetchPage: (pageNo: number) => Promise<string> = fetchNemcPage,
): Promise<{ complete: boolean; pages: number; result: LoadResult }> {
  const fetchedAt = new Date();
  const items: NemcHospital[] = [];
  let complete = false;
  let pages = 0;
  for (let p = 1; p <= 100; p++) {
    let page;
    try {
      page = parseNemcPage(await fetchPage(p));
    } catch (err) {
      logger.warn({ pageNo: p, err }, 'hospital-nemc stopped early');
      break;
    }
    pages = p;
    items.push(...page.items);
    // 다 받았을 때만 완주로 본다. 빈 중간 페이지·totalCount 누락을 완주로 보면 정리 단계가 대량 삭제한다.
    if (page.totalCount > 0 && items.length >= page.totalCount) { complete = true; break; }
    if (page.items.length === 0) break;
  }
  if (items.length === 0) throw new Error('hospital-nemc 수집 0건 — 호출 실패로 본다');
  const result = await loadNemcHours(items, { complete, fetchedAt });
  return { complete, pages, result };
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({ data: { source: HOSPITAL_NEMC_SOURCE, targetKey: 'weekly', status: 'RUNNING' } });
  try {
    const r = await runCollect();
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: r.complete ? 'OK' : 'ERROR', rowsUpserted: r.result.upserted, finishedAt: new Date(),
        errorMessage: r.complete ? null : `중간 중단: ${r.pages}페이지까지 적재, 정리 생략` },
    });
    await notify(r.complete ? 'info' : 'warn', `hospital-nemc ${r.complete ? '완료' : '중간 중단'}`, { pages: r.pages, ...r.result });
    if (!r.complete) process.exitCode = 1;
  } catch (err) {
    await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
    logger.error({ err }, 'hospital-nemc failed');
    await notify('error', 'hospital-nemc failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('hospital-nemc/runner')) {
  main().catch((err) => { logger.error({ err }, 'hospital-nemc runner fatal'); process.exit(1); });
}
