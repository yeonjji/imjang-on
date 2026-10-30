/**
 * 목록 기본 정렬용 상세 내용 점수 배치.
 *
 *   pnpm ingest:content-score --mode=daily|weekly [--entity=hospital,park] [--chunk=1000] [--pause-ms=200]
 *
 * daily = 자체 정보(가벼움, 매일), weekly = 주변·비교 정보(공간 조회, 주 1회·청크 사이 쉬기).
 * 값이 바뀐 행만 raw SQL로 쓰고 updatedAt은 건드리지 않는다(사이트맵 lastmod 보호).
 * 설계: docs/superpowers/specs/2026-10-30-list-content-score-design.md
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/scripts/ingest/notify';
import { ENTITIES, type EntityKey, type ScoredRow } from './entities';

export const CONTENT_SCORE_SOURCE = 'content-score';
const ALL: EntityKey[] = ['hospital', 'pharmacy', 'childcare', 'school', 'park', 'parking', 'charger'];

async function writeChunk(table: string, rows: ScoredRow[], weekly: boolean): Promise<number> {
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const own = rows.map((r) => r.own);
  const wk = rows.map((r) => r.weekly ?? 0);
  const seoul = rows.map((r) => r.seoul);
  // weekly면 새 주간값, daily면 저장된 contentNearby를 그대로 더한다.
  const nearby = weekly ? Prisma.sql`v.wk` : Prisma.sql`t."contentNearby"`;
  const score = Prisma.sql`(v.own + ${nearby})`;
  const rank = Prisma.sql`((CASE WHEN v.seoul THEN 10000 ELSE 0 END) + v.own + ${nearby})`;
  return prisma.$executeRaw`
    UPDATE ${Prisma.raw(`"${table}"`)} AS t SET
      "contentNearby" = ${nearby},
      "contentScore"  = ${score},
      "listRank"      = ${rank}
    FROM (SELECT unnest(${ids}::bigint[]) AS id, unnest(${own}::int[]) AS own,
                 unnest(${wk}::int[]) AS wk, unnest(${seoul}::boolean[]) AS seoul) v
    WHERE t.id = v.id
      AND (t."contentNearby", t."contentScore", t."listRank") IS DISTINCT FROM (${nearby}, ${score}, ${rank})
  `;
}

export async function runContentScore(opts: { entities?: EntityKey[]; mode: 'daily' | 'weekly'; chunk?: number; pauseMs?: number }) {
  const entities = opts.entities ?? ALL;
  const weekly = opts.mode === 'weekly';
  const chunk = opts.chunk ?? 1000;
  const pauseMs = opts.pauseMs ?? (weekly ? 200 : 0);
  const results: { entity: EntityKey; scanned: number; updated: number; ms: number }[] = [];
  for (const entity of entities) {
    const def = ENTITIES[entity];
    const run = await prisma.ingestionRun.create({ data: { source: CONTENT_SCORE_SOURCE, targetKey: `${opts.mode}:${entity}`, status: 'RUNNING' } });
    const t0 = Date.now();
    let after = 0n;
    let scanned = 0;
    let updated = 0;
    try {
      for (;;) {
        const rows = await def.score(after, chunk, weekly);
        if (rows.length === 0) break;
        updated += await writeChunk(def.table, rows, weekly);
        scanned += rows.length;
        after = rows[rows.length - 1].id;
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', rowsUpserted: updated, finishedAt: new Date() } });
    } catch (err) {
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } });
      throw err;
    }
    const ms = Date.now() - t0;
    logger.info({ entity, mode: opts.mode, scanned, updated, ms }, 'content-score done');
    results.push({ entity, scanned, updated, ms });
  }
  return results;
}

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  const mode = arg('mode');
  if (mode !== 'daily' && mode !== 'weekly') {
    logger.error('--mode=daily|weekly 필요');
    process.exitCode = 2;
    return;
  }
  const entities = arg('entity')?.split(',') as EntityKey[] | undefined;
  if (entities?.some((e) => !ALL.includes(e))) {
    logger.error({ entities }, `--entity는 ${ALL.join(',')} 중에서`);
    process.exitCode = 2;
    return;
  }
  try {
    const r = await runContentScore({
      mode,
      entities,
      chunk: arg('chunk') ? Number(arg('chunk')) : undefined,
      pauseMs: arg('pause-ms') ? Number(arg('pause-ms')) : undefined,
    });
    await notify('info', `content-score ${mode} 완료`, { results: r });
  } catch (err) {
    logger.error({ err }, 'content-score failed');
    await notify('error', `content-score ${mode} failed`, { err: String(err) });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes('content-score/runner')) {
  main().catch((err) => {
    logger.error({ err }, 'content-score runner fatal');
    process.exit(1);
  });
}
