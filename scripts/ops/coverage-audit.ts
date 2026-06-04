/**
 * 테이블별 좌표 커버리지 집계 (읽기 전용).
 * total / location NULL / bbox 이탈 카운트. 백필 전후 검증·모니터링용.
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coverage-audit.ts
 */
import { prisma } from '@/lib/db';
import { KOREA_BBOX } from '@/lib/geo/korea-bbox';

// 하드코딩된 컴파일타임 상수 — SQL에 직접 보간된다. 외부 입력(--table 등)을
// 이 목록에 연결하려면 반드시 화이트리스트 검증을 먼저 추가할 것 (인젝션 방지).
const TABLES = [
  'Property', 'School', 'Park', 'Store', 'TraditionalMarket',
  'EvCharger', 'Childcare', 'Parking', 'Hospital', 'Pharmacy',
];

function outOfBboxSql(): string {
  const g = 'location::geometry';
  return `location IS NOT NULL AND (
    ST_Y(${g}) NOT BETWEEN ${KOREA_BBOX.minLat} AND ${KOREA_BBOX.maxLat}
    OR ST_X(${g}) NOT BETWEEN ${KOREA_BBOX.minLng} AND ${KOREA_BBOX.maxLng})`;
}

async function main() {
  const parts = TABLES.map(
    (t) => `SELECT '${t}' AS tbl, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE location IS NULL)::int AS null_loc,
      COUNT(*) FILTER (WHERE ${outOfBboxSql()})::int AS out_bbox
      FROM "${t}"`,
  );
  const sql = parts.join('\nUNION ALL\n') + '\nORDER BY tbl';
  const rows = await prisma.$queryRawUnsafe<
    { tbl: string; total: number; null_loc: number; out_bbox: number }[]
  >(sql);

  console.log(
    'table'.padEnd(20), 'total'.padStart(10), 'null_loc'.padStart(10),
    'out_bbox'.padStart(10), 'bad_%'.padStart(8),
  );
  for (const r of rows) {
    const bad = r.null_loc + r.out_bbox;
    const pct = r.total ? ((bad / r.total) * 100).toFixed(2) : '0.00';
    console.log(
      r.tbl.padEnd(20), String(r.total).padStart(10), String(r.null_loc).padStart(10),
      String(r.out_bbox).padStart(10), pct.padStart(8),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
