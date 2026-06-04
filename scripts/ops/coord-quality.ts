/**
 * 좌표 품질 통합 점검·교정 (범위 C).
 *
 * 검출 신호:
 *   null          — location IS NULL
 *   bbox          — 한국 bbox 이탈 (위경도 뒤바뀜·0좌표·이상치)
 *   sigungu       — 50m 내 다른 sigunguCode 행과 충돌 (지오코딩 파생: Property·School 한정)
 * 교정: 의심행을 주소로 재지오코딩(Kakao)해 location 갱신. 재지오코딩 결과가 bbox 밖이면 skip.
 *
 * 기본 DRY-RUN. 실제 갱신은 --apply (KAKAO_REST_KEY 필요).
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coord-quality.ts
 *   pnpm dotenv -e .env.local -- tsx scripts/ops/coord-quality.ts --apply --table=School --limit=50
 *   옵션: --table=<name> --reason=<null|bbox|sigungu> --limit=N
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode, buildGeocodeQuery } from '@/scripts/ingest/geocoder';
import { KOREA_BBOX, isInKoreaBbox } from '@/lib/geo/korea-bbox';

const APPLY = process.argv.includes('--apply');
const TABLE = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1] ?? null;
const REASON = process.argv.find((a) => a.startsWith('--reason='))?.split('=')[1] ?? null;
const VALID_REASONS = ['null', 'bbox', 'sigungu'] as const;
if (REASON && !(VALID_REASONS as readonly string[]).includes(REASON))
  throw new Error(`--reason=${REASON} 은 알 수 없는 사유 (null | bbox | sigungu)`);
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
if (LIMIT !== null && !Number.isInteger(LIMIT)) throw new Error('--limit 은 정수여야 합니다');
const PROXIMITY_M = 50;

type Reason = 'null' | 'bbox' | 'sigungu';

interface TableConfig {
  table: string;
  prefixExpr: string | null; // alias t 기준 지역 접두사 SQL, 없으면 null
  joinSql?: string;          // prefix 해석용 JOIN (예: Region)
  crossSigungu: boolean;     // 시군구 충돌 검출 (지오코딩 파생 테이블만)
}

const CONFIGS: TableConfig[] = [
  { table: 'Property', prefixExpr: 'r."fullName"', joinSql: 'LEFT JOIN "Region" r ON r.code = t."regionCode"', crossSigungu: true },
  { table: 'School', prefixExpr: 't.region', crossSigungu: true },
  { table: 'Hospital', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'Pharmacy', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'Childcare', prefixExpr: `concat_ws(' ', t.sido, t.sigungu)`, crossSigungu: false },
  { table: 'TraditionalMarket', prefixExpr: null, crossSigungu: false },
  { table: 'Parking', prefixExpr: null, crossSigungu: false },
  { table: 'Store', prefixExpr: null, crossSigungu: false },
  { table: 'EvCharger', prefixExpr: null, crossSigungu: false },
  { table: 'Park', prefixExpr: null, crossSigungu: false },
];

interface Suspect {
  table: string;
  id: string; // bigint as text
  address: string | null;
  prefix: string | null;
  reason: Reason;
}

function bboxOutsidePredicate(): string {
  const g = 't.location::geometry';
  return `(ST_Y(${g}) NOT BETWEEN ${KOREA_BBOX.minLat} AND ${KOREA_BBOX.maxLat}
        OR ST_X(${g}) NOT BETWEEN ${KOREA_BBOX.minLng} AND ${KOREA_BBOX.maxLng})`;
}

function detectSql(cfg: TableConfig): string {
  const join = cfg.joinSql ?? '';
  const prefix = cfg.prefixExpr ?? `''`;
  const select = (reason: Reason, where: string, distinct = false) => `
    SELECT ${distinct ? 'DISTINCT' : ''} t.id::text AS id, t.address AS address,
           ${prefix} AS prefix, '${reason}' AS reason
    FROM "${cfg.table}" t ${join}
    WHERE ${where}`;

  const parts: string[] = [];
  if (!REASON || REASON === 'null') parts.push(select('null', 't.location IS NULL'));
  if (!REASON || REASON === 'bbox') parts.push(select('bbox', `t.location IS NOT NULL AND ${bboxOutsidePredicate()}`));
  if (cfg.crossSigungu && (!REASON || REASON === 'sigungu')) {
    parts.push(select('sigungu', `t.location IS NOT NULL AND EXISTS (
      SELECT 1 FROM "${cfg.table}" q
      WHERE q.id <> t.id AND q.location IS NOT NULL
        AND q."sigunguCode" IS DISTINCT FROM t."sigunguCode"
        AND ST_DWithin(t.location, q.location, ${PROXIMITY_M})
    )`, true));
  }
  return parts.join('\nUNION ALL\n');
}

async function detect(cfg: TableConfig): Promise<Suspect[]> {
  const sql = detectSql(cfg);
  if (!sql.trim()) return [];
  const rows = await prisma.$queryRawUnsafe<
    { id: string; address: string | null; prefix: string | null; reason: Reason }[]
  >(sql);
  return rows.map((r) => ({ ...r, table: cfg.table }));
}

async function applyOne(s: Suspect): Promise<'updated' | 'skipped'> {
  if (!s.address) return 'skipped';
  const coord = await geocode(buildGeocodeQuery(s.prefix, s.address));
  if (!coord || !isInKoreaBbox(coord.lng, coord.lat)) {
    logger.warn({ table: s.table, id: s.id, reason: s.reason }, '재지오코딩 실패/범위밖 — 건너뜀');
    return 'skipped';
  }
  // s.table는 항상 CONFIGS의 하드코딩된 테이블명 (사용자 입력 아님) → 인젝션 불가
  await prisma.$executeRawUnsafe(
    `UPDATE "${s.table}" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
    coord.lng, coord.lat, BigInt(s.id),
  );
  return 'updated';
}

async function main() {
  const configs = TABLE ? CONFIGS.filter((c) => c.table === TABLE) : CONFIGS;
  if (configs.length === 0) throw new Error(`--table=${TABLE} 은 알 수 없는 테이블`);

  const all: Suspect[] = [];
  for (const cfg of configs) all.push(...(await detect(cfg)));

  const byKey = all.reduce<Record<string, number>>((acc, s) => {
    const k = `${s.table}/${s.reason}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  logger.info({ total: all.length, byKey, apply: APPLY, limit: LIMIT }, '좌표 의심행 검출 완료');

  if (!APPLY) {
    console.log('\n[DRY-RUN] 사유별 건수:');
    for (const [k, n] of Object.entries(byKey).sort()) console.log(`  ${k}: ${n}`);
    console.log('\n샘플 20건:');
    for (const s of all.slice(0, 20)) {
      console.log(`  ${s.table}#${s.id} [${s.reason}] "${s.prefix ?? ''}" | "${s.address ?? ''}"`);
    }
    console.log('\n실제 갱신: --apply 추가 (KAKAO_REST_KEY 필요). --table=/--reason=/--limit= 로 범위 제한.');
    await prisma.$disconnect();
    return;
  }

  const targets = LIMIT ? all.slice(0, LIMIT) : all;
  let updated = 0;
  let skipped = 0;
  for (const s of targets) {
    try {
      const r = await applyOne(s);
      if (r === 'updated') updated++; else skipped++;
    } catch (err) {
      logger.error({ table: s.table, id: s.id, err }, '재지오코딩 중 예외 — 건너뜀');
      skipped++;
    }
    await new Promise((res) => setTimeout(res, 50)); // 카카오 레이트리밋 여유
  }
  logger.info({ updated, skipped, total: targets.length }, '좌표 교정 완료');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  logger.error({ err }, 'coord-quality 실패');
  await prisma.$disconnect();
  process.exit(1);
});
