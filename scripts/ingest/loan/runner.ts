import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { revalidatePaths } from '@/scripts/ingest/revalidator';
import { fetchLoanPage } from './http';
import { parseLoanProducts } from './adapter';
import { LOAN_INGEST_SOURCE } from './types';
import type { LoanProductRow } from './types';

const PAGE_SIZE = 100;
const MAX_PAGES = 50; // 안전장치

// 전 페이지 순회 수집. seq 기준 dedup.
export async function fetchAllLoanRows(): Promise<LoanProductRow[]> {
  const bySeq = new Map<number, LoanProductRow>();
  let pageNo = 1;
  while (pageNo <= MAX_PAGES) {
    const xml = await fetchLoanPage(pageNo, PAGE_SIZE);
    const { rows, totalCount } = parseLoanProducts(xml);
    for (const r of rows) bySeq.set(r.seq, r);
    if (rows.length === 0 || bySeq.size >= totalCount) break;
    pageNo++;
  }
  return Array.from(bySeq.values());
}

// 원자 스냅샷 교체. 0건이면 거부(API 일시 오류로 테이블이 비는 사고 방지).
export async function replaceSnapshot(rows: LoanProductRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error('parsed 0 rows — refusing to wipe LoanProduct snapshot');
  }
  const data = rows.map((r) => ({
    seq: r.seq,
    finprdnm: r.finprdnm,
    ofrinstnm: r.ofrinstnm,
    instCtg: r.instCtg,
    lnlmt: r.lnlmt,
    irt: r.irt,
    irtCtg: r.irtCtg,
    usageTags: r.usageTags,
    targetTags: r.targetTags,
    regionTags: r.regionTags,
    rawJson: r.rawJson as Prisma.InputJsonValue,
  }));
  await prisma.$transaction([
    prisma.loanProduct.deleteMany({}),
    prisma.loanProduct.createMany({ data }),
  ]);
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({
    data: { source: LOAN_INGEST_SOURCE, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const rows = await fetchAllLoanRows();
    logger.info({ rows: rows.length }, 'loan products fetched');
    await replaceSnapshot(rows);
    await revalidatePaths(['/finance']);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: rows.length, finishedAt: new Date() },
    });
    logger.info({ rows: rows.length }, 'loan ingest done');
    await notify('info', 'loan ingest complete', { rows: rows.length });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'loan ingest failed');
    await notify('error', 'loan ingest failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('loan/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'loan runner fatal');
    process.exit(1);
  });
}
