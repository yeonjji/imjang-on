/**
 * 공동주택 단지정보 수집 러너.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=list
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/apt-complex/runner.ts --mode=detail [--limit=N]
 *
 * 1단계(수집)만 담는다. 매칭 모드(audit·match)는 2단계에서 추가한다.
 * 이 단계는 화면에 아무것도 노출하지 않으므로 revalidate를 호출하지 않는다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { fetchAptListPage, fetchAptBasis, fetchAptDetail, QuotaExceededError } from './http';
import { parseAptList, parseAptDetail } from './adapter';
import { APT_COMPLEX_SOURCE } from './types';

const LIST_PAGE_SIZE = 1000;
const MAX_LIST_PAGES = 50; // 22,301건 기준 23페이지. 안전장치.

/**
 * 목록 upsert. 스냅샷 교체(deleteMany+createMany)를 쓰지 않는다 —
 * 목록 재수집이 이미 채운 상세 필드를 날려버린다.
 */
export async function runList(): Promise<number> {
  let pageNo = 1;
  let upserted = 0;
  let totalCount = 0;

  while (pageNo <= MAX_LIST_PAGES) {
    const payload = await fetchAptListPage(pageNo, LIST_PAGE_SIZE);
    const { rows, totalCount: tc } = parseAptList(payload);
    if (tc > 0) totalCount = tc;
    if (rows.length === 0) break;

    for (const r of rows) {
      await prisma.aptComplex.upsert({
        where: { kaptCode: r.kaptCode },
        create: r,
        update: {
          kaptName: r.kaptName,
          nameNorm: r.nameNorm,
          bjdCode: r.bjdCode,
          sigunguCode: r.sigunguCode,
          as3: r.as3,
        },
      });
      upserted++;
    }
    logger.info({ pageNo, rows: rows.length, upserted, totalCount }, 'apt-complex list page');
    if (totalCount > 0 && upserted >= totalCount) break;
    pageNo++;
  }

  // API 일시 오류로 목록이 통째로 비는 사고를 막는다.
  if (upserted === 0) throw new Error('parsed 0 rows — refusing to proceed');
  return upserted;
}

/**
 * 상세 수집. 대상은 `fetchedAt IS NULL`(미수집분)이라 며칠에 걸쳐 나눠 돌려도 수렴한다.
 * 한도 초과를 만나면 즉시 중단한다 — 계속 두드리면 차단당한다.
 */
export async function runDetail(limit?: number): Promise<number> {
  const targets = await prisma.aptComplex.findMany({
    where: { fetchedAt: null },
    select: { kaptCode: true },
    orderBy: { kaptCode: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  logger.info({ targets: targets.length }, 'apt-complex detail targets');

  let done = 0;
  for (const { kaptCode } of targets) {
    try {
      const basis = await fetchAptBasis(kaptCode);
      const dtl = await fetchAptDetail(kaptCode);
      const row = parseAptDetail(kaptCode, basis, dtl);
      const { kaptCode: _key, rawJson, ...fields } = row;
      await prisma.aptComplex.update({
        where: { kaptCode },
        data: { ...fields, rawJson: rawJson as object, fetchedAt: new Date() },
      });
      done++;
      if (done % 500 === 0) logger.info({ done, of: targets.length }, 'apt-complex detail progress');
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        logger.warn({ done, remaining: targets.length - done }, 'quota exceeded — stopping');
        await notify('warn', 'apt-complex detail 한도 초과로 중단', {
          done,
          remaining: targets.length - done,
        });
        break;
      }
      // 단건 실패는 건너뛴다. fetchedAt이 그대로 NULL이라 다음 회차에 재시도된다.
      logger.warn({ err, kaptCode }, 'apt-complex detail skip');
    }
  }
  return done;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main(): Promise<void> {
  const mode = arg('mode');
  if (mode !== 'list' && mode !== 'detail') {
    throw new Error(`--mode=list | --mode=detail 만 지원한다 (받은 값: ${mode ?? '없음'})`);
  }
  const run = await prisma.ingestionRun.create({
    data: { source: APT_COMPLEX_SOURCE, targetKey: mode, status: 'RUNNING' },
  });
  try {
    let rows: number;
    if (mode === 'list') {
      rows = await runList();
    } else {
      const raw = arg('limit');
      const limit = raw ? Number(raw) : undefined;
      rows = await runDetail(Number.isFinite(limit) ? limit : undefined);
    }
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'OK', rowsUpserted: rows, finishedAt: new Date() },
    });
    logger.info({ mode, rows }, 'apt-complex done');
    await notify('info', `apt-complex ${mode} complete`, { rows });
  } catch (err) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() },
    });
    logger.error({ err, mode }, 'apt-complex failed');
    await notify('error', `apt-complex ${mode} failed`, { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// 직접 실행될 때만 main() (테스트 import 시 실행 방지)
if (process.argv[1] && process.argv[1].includes('apt-complex/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'apt-complex runner fatal');
    process.exit(1);
  });
}
