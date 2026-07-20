import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { readXlsxRows } from '@/scripts/ingest/amenities/xlsx-parse';
import { parseHospitalRows } from '@/scripts/ingest/amenities/adapter-hospital';
import { parsePharmacyRows } from '@/scripts/ingest/amenities/adapter-pharmacy';

// upsert 방식 ingest는 새 파일에서 사라진(폐업 등) 기관을 지우지 않는다.
// 이 스크립트는 최신 xlsx에 존재하는 sourceId 집합을 "정답"으로 삼아,
// 그에 없는 DB 행을 삭제해 테이블을 파일과 정확히 일치시킨다.
// Hospital 자식 11개 테이블은 onDelete: Cascade 라 병원 삭제 시 함께 정리된다.

const INSERT_CHUNK = 5000;
const ORPHAN_GUARD_RATIO = 0.2; // 고아가 DB의 20% 초과면 --force 없이 거부

type Target = 'hospital' | 'pharmacy';
const TABLE: Record<Target, string> = { hospital: 'Hospital', pharmacy: 'Pharmacy' };
const FILE_NUM: Record<Target, number> = { hospital: 1, pharmacy: 2 };

function parseArgs(): { dir: string; targets: Target[]; apply: boolean; force: boolean } {
  const args = process.argv.slice(2);
  const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1];
  if (!dir) throw new Error('--dir=<xlsx 디렉토리 경로> 가 필요합니다');
  const targetArg = args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'all';
  const targets: Target[] = targetArg === 'all' ? ['hospital', 'pharmacy'] : [targetArg as Target];
  for (const t of targets) {
    if (t !== 'hospital' && t !== 'pharmacy') {
      throw new Error('--target= 은 hospital | pharmacy | all 중 하나여야 합니다');
    }
  }
  return { dir, targets, apply: args.includes('--apply'), force: args.includes('--force') };
}

function findXlsx(dir: string, fileNum: number): string {
  const prefix = `${fileNum}.`;
  const found = readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith('.xlsx'));
  if (!found) throw new Error(`${dir} 에서 "${prefix}"로 시작하는 xlsx 파일을 찾을 수 없습니다`);
  return join(dir, found);
}

// ingest 스크립트와 동일한 어댑터로 sourceId 를 뽑아 정확히 같은 "살아있는" 집합을 만든다.
function liveSourceIds(target: Target, dir: string): string[] {
  const rows = readXlsxRows(findXlsx(dir, FILE_NUM[target]));
  const parsed = target === 'hospital' ? parseHospitalRows(rows) : parsePharmacyRows(rows);
  return [...new Set(parsed.map((r) => r.sourceId))];
}

interface PruneResult {
  table: string;
  fileIds: number;
  dbTotal: number;
  orphans: number;
  deleted: number;
}

async function pruneTarget(target: Target, ids: string[], apply: boolean, force: boolean): Promise<PruneResult> {
  const table = TABLE[target];
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE _live (source_id text PRIMARY KEY) ON COMMIT DROP');
      for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
        const chunk = ids.slice(i, i + INSERT_CHUNK);
        const values = Prisma.join(chunk.map((id) => Prisma.sql`(${id})`));
        await tx.$executeRaw(Prisma.sql`INSERT INTO _live (source_id) VALUES ${values} ON CONFLICT DO NOTHING`);
      }
      const totalRes = await tx.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*)::bigint AS c FROM "${table}"`);
      const orphanRes = await tx.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT count(*)::bigint AS c FROM "${table}" t WHERE NOT EXISTS (SELECT 1 FROM _live l WHERE l.source_id = t."sourceId")`,
      );
      const dbTotal = Number(totalRes[0].c);
      const orphans = Number(orphanRes[0].c);

      let deleted = 0;
      if (apply && orphans > 0) {
        if (dbTotal > 0 && orphans / dbTotal > ORPHAN_GUARD_RATIO && !force) {
          throw new Error(
            `[안전장치] ${table}: 고아 ${orphans}/${dbTotal} (${((orphans / dbTotal) * 100).toFixed(1)}%) 가 ${ORPHAN_GUARD_RATIO * 100}% 초과. ` +
              `파싱 회귀 가능성이 있어 삭제를 중단합니다. 의도한 것이라면 --force 를 붙이세요.`,
          );
        }
        deleted = await tx.$executeRawUnsafe(
          `DELETE FROM "${table}" t WHERE NOT EXISTS (SELECT 1 FROM _live l WHERE l.source_id = t."sourceId")`,
        );
      }
      return { table, fileIds: ids.length, dbTotal, orphans, deleted };
    },
    { timeout: 180_000, maxWait: 30_000 },
  );
}

async function main() {
  const { dir, targets, apply, force } = parseArgs();
  console.log(`[prune ${apply ? 'APPLY(실삭제)' : 'REPORT(dry-run)'}] targets=${targets.join(',')} force=${force}`);

  for (const target of targets) {
    const ids = liveSourceIds(target, dir);
    // 안전장치: 파일 파싱이 0건이면 테이블 전체가 고아로 잡혀 통째로 지워진다 → 절대 금지.
    if (ids.length === 0) {
      throw new Error(`[안전장치] ${target}: 파일에서 sourceId 를 0건 파싱했습니다. 파일 손상 가능성 — 중단합니다.`);
    }
    const res = await pruneTarget(target, ids, apply, force);
    console.log(
      `prune ${target}: DB ${res.dbTotal}건 / 파일 ${res.fileIds}건 / 고아 ${res.orphans}건` +
        (apply ? ` → ${res.deleted}건 삭제` : ' (dry-run, 삭제 안 함)'),
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'prune-amenities fatal');
  process.exit(1);
});
