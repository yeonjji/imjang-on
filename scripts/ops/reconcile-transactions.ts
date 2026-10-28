/**
 * 거래 재정합(S3) 운영 도구. 적용은 수집기(transactions/runner.ts)가 하고, 이 도구는 dry-run과 롤백만 한다.
 *
 *   # dry-run(기본, DB 쓰기 없음 — 읽기 전용 세션에서 돌 수 있다). 원천 API를 범위마다 호출한다(호출량 = api × 시군구 × 월).
 *   pnpm tsx scripts/ops/reconcile-transactions.ts --api=apt-trade --sgg=11110,11680 --offsets=0-12 [--out=/tmp/rec.jsonl]
 *   pnpm tsx scripts/ops/reconcile-transactions.ts --api=all --months=202606,202605 --sgg=all
 *   # 롤백: 재정합 실행(IngestionRun id) 하나를 되돌린다 — 최신 실행부터
 *   pnpm tsx scripts/ops/reconcile-transactions.ts --rollback-run=123456
 *
 * dry-run에서는 매물을 만들지 않는다. 아직 없는 매물의 원천 행은 newPropertyRows로 세고(실제 실행에서는 삽입) 계획에서 뺀다.
 */
import { appendFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ApiType } from '@/scripts/ingest/types';
import { ADAPTERS, fetchAll, getOffsetMonths, resolveApiRows } from '@/scripts/ingest/transactions/runner';
import { getSigunguTargets } from '@/scripts/ingest/transactions/sigungu';
import { dryRunReconcile, rollbackReconcileRun } from '@/scripts/ingest/transactions/reconcile';

export interface ReconcileCliArgs {
  rollbackRun?: bigint;
  apis: ApiType[];
  sgg: string[] | 'all';
  months: string[];
  out?: string;
}

export function parseReconcileArgs(argv: string[], now = new Date()): ReconcileCliArgs {
  const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const rb = arg('rollback-run');
  if (rb) return { rollbackRun: BigInt(rb), apis: [], sgg: [], months: [] };
  const api = arg('api') ?? 'all';
  const apis = api === 'all' ? (Object.keys(ADAPTERS) as ApiType[]) : api.split(',') as ApiType[];
  for (const a of apis) if (!(a in ADAPTERS)) throw new Error(`알 수 없는 --api=${a}`);
  const sggArg = arg('sgg');
  if (!sggArg) throw new Error('--sgg=11110,11680 또는 --sgg=all이 필요하다(호출량을 의식해서 고른다)');
  const months = arg('months')?.split(',').filter(Boolean) ?? (arg('offsets') ? getOffsetMonths(arg('offsets')!, now) : []);
  if (months.length === 0 || months.some((m) => !/^\d{6}$/.test(m))) throw new Error('--months=YYYYMM,… 또는 --offsets=0-12가 필요하다');
  return { apis, sgg: sggArg === 'all' ? 'all' : sggArg.split(',').filter(Boolean), months, out: arg('out') };
}

async function dryRun(a: ReconcileCliArgs) {
  const targets = await getSigunguTargets();
  const sggs = a.sgg === 'all' ? [...targets.keys()] : a.sgg;
  const total = { scopes: 0, api: 0, db: 0, inserted: 0, newPropertyRows: 0, archived: 0, orphans: 0, propertyMismatch: 0, cancelDateRepaired: 0, outOfScope: 0, outOfMonth: 0,
    properties: 0, skipped: {} as Record<string, number>, errors: 0 };
  for (const api of a.apis) {
    const adapter = ADAPTERS[api];
    for (const yyyymm of a.months) {
      for (const sgg of sggs) {
        const regionCode = targets.get(sgg);
        if (!regionCode) { logger.warn({ sgg }, 'unknown sigungu — skip'); continue; }
        try {
          const { rows, totalCount, complete } = await fetchAll(adapter, sgg, yyyymm);
          const { api: rowsApi, excluded, unknownProperty } = await resolveApiRows(adapter, sgg, regionCode, rows, { create: false });
          const r = await dryRunReconcile({ source: adapter.source, sigunguCode: sgg, yyyymm, api: rowsApi, complete, totalCount, excluded: excluded + unknownProperty });
          const line = { ...r, apiType: api, sgg, yyyymm, totalCount, newPropertyRows: unknownProperty, affectedPropertyIds: r.affectedPropertyIds.length };
          if (a.out) appendFileSync(a.out, JSON.stringify(line) + '\n');
          total.scopes++; total.api += r.api; total.db += r.db; total.inserted += r.inserted; total.newPropertyRows += unknownProperty;
          total.archived += r.archived.cancel + r.archived.correction; total.propertyMismatch += r.propertyMismatch; total.orphans += r.orphans;
          total.cancelDateRepaired += r.cancelDateRepaired; total.outOfScope += r.outOfScope; total.outOfMonth += r.outOfMonth;
          total.properties += r.affectedPropertyIds.length;
          if (r.skipReason) total.skipped[r.skipReason] = (total.skipped[r.skipReason] ?? 0) + 1;
        } catch (err) {
          total.errors++;
          logger.error({ err, api, sgg, yyyymm }, 'dry-run scope failed');
        }
      }
    }
  }
  return total;
}

async function main() {
  const a = parseReconcileArgs(process.argv);
  if (a.rollbackRun != null) { console.log(JSON.stringify(await rollbackReconcileRun(a.rollbackRun))); return; }
  console.log(JSON.stringify(await dryRun(a)));
}

if (process.argv[1] && process.argv[1].includes('reconcile-transactions')) {
  main()
    .catch((err) => { logger.error({ err }, 'reconcile-transactions failed'); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
