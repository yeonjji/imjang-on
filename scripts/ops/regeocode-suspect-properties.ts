/**
 * 좌표가 잘못/누락된 Property를 탐지해 재지오코딩한다 (옵션 B: 의심 건만).
 *
 * 의심 기준:
 *   1) location IS NULL                         — 좌표 없음
 *   2) 50m 내에 다른 시군구 단지와 좌표 충돌      — 동명 모호성으로 인한 오지오코딩 의심
 *      (예: "금호동 787"이 광주/광양/속초인데 서울 금호동으로 찍힌 케이스)
 *   3) 자기 시군구 단지 좌표 중앙값에서 20km 초과 — 같은 모호성인데 빈 땅에 찍혀 2)로 안 잡힌 케이스
 *      (예: 부산 수영구 "민락동 705-1"이 의정부 민락동으로. 접두사 도입(2026-06-03) 전 적재분)
 *      섬·넓은 군 지역의 정상 단지도 걸리지만, 재지오코딩해도 1km 안이면 갱신하지 않는다.
 *
 * 주소검색이 실패하면 "지역 + 단지명" 키워드검색으로 보완하되, 응답 시군구가 단지 지역과 같을 때만 쓴다.
 * 기존 좌표에서 1km 미만으로 움직이는 결과는 갱신하지 않는다. 갱신 로그에 이전 좌표를 남긴다.
 *
 * 기본은 DRY-RUN(집계만). 실제 갱신은 --apply (KAKAO_REST_KEY 필요).
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/regeocode-suspect-properties.ts
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/regeocode-suspect-properties.ts --apply --reason=시군구이탈 --limit=200
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode, geocodeKeyword, buildGeocodeQuery } from '@/scripts/ingest/geocoder';

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const REASONS = ['좌표없음', '시군구충돌', '시군구이탈'] as const;
const REASON = process.argv.find((a) => a.startsWith('--reason='))?.split('=')[1] ?? null;
if (REASON && !(REASONS as readonly string[]).includes(REASON))
  throw new Error(`--reason=${REASON} 은 알 수 없는 사유 (${REASONS.join(' | ')})`);
const PROXIMITY_M = 50;
const FAR_M = 20_000;
const MIN_MOVE_M = 1_000;

interface Suspect {
  id: bigint;
  name: string;
  address: string;
  full_name: string | null;
  reason: string;
  old_lat: number | null;
  old_lng: number | null;
}

async function detectSuspects(): Promise<Suspect[]> {
  return prisma.$queryRaw<Suspect[]>`
    WITH null_loc AS (
      SELECT id, '좌표없음' AS reason FROM "Property" WHERE location IS NULL
    ),
    cross_sgg AS (
      SELECT DISTINCT p.id, '시군구충돌' AS reason
      FROM "Property" p
      WHERE p.location IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "Property" q
          WHERE q.id <> p.id
            AND q.location IS NOT NULL
            AND q."sigunguCode" IS DISTINCT FROM p."sigunguCode"
            AND ST_DWithin(p.location, q.location, ${PROXIMITY_M})
        )
    ),
    sgg_center AS (
      SELECT "sigunguCode",
             ST_SetSRID(ST_MakePoint(
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_X(location::geometry)),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY ST_Y(location::geometry))
             ), 4326)::geography AS center
      FROM "Property" WHERE location IS NOT NULL
      GROUP BY "sigunguCode"
    ),
    far_sgg AS (
      SELECT p.id, '시군구이탈' AS reason
      FROM "Property" p
      JOIN sgg_center c ON c."sigunguCode" = p."sigunguCode"
      WHERE p.location IS NOT NULL
        AND NOT ST_DWithin(p.location, c.center, ${FAR_M})
    ),
    merged AS (
      SELECT id, reason FROM null_loc
      UNION
      SELECT id, reason FROM cross_sgg
      UNION
      SELECT id, reason FROM far_sgg
    )
    SELECT m.id, p.name, p.address, r."fullName" AS full_name, m.reason,
           ST_Y(p.location::geometry) AS old_lat, ST_X(p.location::geometry) AS old_lng
    FROM merged m
    JOIN "Property" p ON p.id = m.id
    LEFT JOIN "Region" r ON r.code = p."regionCode"
    ORDER BY m.reason, m.id
  `;
}

/** 주소검색 실패 시 키워드검색. 응답 시군구가 단지 지역(fullName)에 들어 있을 때만 채택한다. */
async function geocodeWithFallback(s: Suspect) {
  const coord = await geocode(buildGeocodeQuery(s.full_name, s.address));
  if (coord) return { coord, via: 'address' as const };
  if (!s.full_name) return null;
  const kw = await geocodeKeyword(`${s.full_name} ${s.name}`);
  if (kw?.region2 && s.full_name.includes(kw.region2)) return { coord: kw, via: 'keyword' as const };
  return null;
}

async function main() {
  const all = await detectSuspects();
  const suspects = REASON ? all.filter((s) => s.reason === REASON) : all;
  const byReason = all.reduce<Record<string, number>>((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {});
  logger.info(
    { total: all.length, byReason, reason: REASON, selected: suspects.length, apply: APPLY, limit: LIMIT },
    '의심 단지 탐지 완료',
  );

  if (!APPLY) {
    console.log('\n[DRY-RUN] 샘플 20건:');
    for (const s of suspects.slice(0, 20)) {
      console.log(`#${s.id} [${s.reason}] ${s.name} | ${s.full_name ?? '(지역없음)'} | "${s.address}"`);
    }
    console.log('\n실제 갱신하려면 --apply 추가 (KAKAO_REST_KEY 필요). --reason=사유 --limit=N 으로 범위 제한 가능.');
    await prisma.$disconnect();
    return;
  }

  const targets = LIMIT ? suspects.slice(0, LIMIT) : suspects;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const s of targets) {
    const hit = await geocodeWithFallback(s);
    if (!hit) {
      skipped++;
      logger.warn({ id: String(s.id), name: s.name, address: s.address, fullName: s.full_name }, '지오코딩 실패 — 건너뜀');
      continue;
    }
    const { coord, via } = hit;
    const point = `SRID=4326;POINT(${coord.lng} ${coord.lat})`;
    // 좌표없음은 그대로 채우고, 기존 좌표가 있으면 1km 이상 움직일 때만 갱신한다.
    const n = await prisma.$executeRaw`
      UPDATE "Property"
      SET location = ${point}::geography
      WHERE id = ${s.id}
        AND (location IS NULL OR NOT ST_DWithin(location, ${point}::geography, ${MIN_MOVE_M}))
    `;
    if (n === 0) {
      unchanged++;
    } else {
      updated++;
      logger.info(
        {
          id: String(s.id), reason: s.reason, via,
          old: s.old_lat === null ? null : [s.old_lat, s.old_lng],
          new: [coord.lat, coord.lng],
          region1: coord.region1, region2: coord.region2,
        },
        '재지오코딩',
      );
    }
    await new Promise((r) => setTimeout(r, 50)); // 카카오 레이트리밋 여유
  }
  logger.info({ updated, unchanged, skipped, total: targets.length }, '백필 완료');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  logger.error({ err }, '재지오코딩 실패');
  await prisma.$disconnect();
  process.exit(1);
});
