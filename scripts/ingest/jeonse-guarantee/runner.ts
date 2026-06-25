import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { revalidatePaths } from '@/scripts/ingest/revalidator';
import { GRNT_DVCD_CODES } from './codes';
import { fetchProductDetail, fetchRegionLimits } from './http';
import { parseProductDetail, parseRegionLimits } from './adapter';
import { JEONSE_INGEST_SOURCE } from './types';
import type { JeonseProductRow, JeonseRegionRow } from './types';

const SLEEP_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 전 보증구분코드 순회: op3 상세 + op4 지역한도 수집. NODATA 코드는 건너뜀. */
export async function fetchAll(): Promise<{ products: JeonseProductRow[]; regions: JeonseRegionRow[] }> {
  const products: JeonseProductRow[] = [];
  const regions: JeonseRegionRow[] = [];
  const seen = new Set<string>(); // grntDvcd|trgtLwdgCd 중복 방지

  for (const code of GRNT_DVCD_CODES) {
    const detail = parseProductDetail(await fetchProductDetail(code), code);
    if (!detail) {
      logger.info({ code }, 'jeonse: detail NODATA, skip');
      await sleep(SLEEP_MS);
      continue;
    }
    products.push(detail);

    for (const r of parseRegionLimits(await fetchRegionLimits(code), code)) {
      const key = `${r.grntDvcd}|${r.trgtLwdgCd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      regions.push(r);
    }
    await sleep(SLEEP_MS);
  }
  return { products, regions };
}

/** 원자 스냅샷 교체. 상품 0건이면 거부(API 일시 오류로 테이블이 비는 사고 방지). */
export async function replaceSnapshot(products: JeonseProductRow[], regions: JeonseRegionRow[]): Promise<void> {
  if (products.length === 0) {
    throw new Error('parsed 0 products — refusing to wipe JeonseGuaranteeProduct snapshot');
  }
  const productData = products.map((p) => ({
    grntDvcd: p.grntDvcd,
    rcmdProdNm: p.rcmdProdNm,
    rcmdGrntProdDvcd: p.rcmdGrntProdDvcd,
    grntReqTrgtDvcd: p.grntReqTrgtDvcd,
    reqTrgtCont: p.reqTrgtCont,
    exptGrfeRateCont: p.exptGrfeRateCont,
    intSprtCont: p.intSprtCont,
    grntPrmeCont: p.grntPrmeCont,
    rentGrntMaxLoanLmtRate: p.rentGrntMaxLoanLmtRate,
    maxLoanLmtAmt: p.maxLoanLmtAmt,
    trtBankCont: p.trtBankCont,
    guidUrl: p.guidUrl,
    rawJson: p.rawJson as Prisma.InputJsonValue,
  }));
  await prisma.$transaction([
    prisma.jeonseRegionLimit.deleteMany({}),
    prisma.jeonseGuaranteeProduct.deleteMany({}),
    prisma.jeonseGuaranteeProduct.createMany({ data: productData }),
    prisma.jeonseRegionLimit.createMany({ data: regions }),
  ]);
}

async function main(): Promise<void> {
  const run = await prisma.ingestionRun.create({
    data: { source: JEONSE_INGEST_SOURCE, targetKey: 'all', status: 'RUNNING' },
  });
  try {
    const { products, regions } = await fetchAll();
    logger.info({ products: products.length, regions: regions.length }, 'jeonse guarantee fetched');
    await replaceSnapshot(products, regions);
    await revalidatePaths(['/jeonse-guarantee']);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: products.length + regions.length, finishedAt: new Date() },
    });
    logger.info({ products: products.length, regions: regions.length }, 'jeonse ingest done');
    await notify('info', 'jeonse guarantee ingest complete', { products: products.length, regions: regions.length });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err }, 'jeonse ingest failed');
    await notify('error', 'jeonse guarantee ingest failed', { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('jeonse-guarantee/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'jeonse runner fatal');
    process.exit(1);
  });
}
