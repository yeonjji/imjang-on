/**
 * 좌표가 잘못/누락된 Property를 탐지해 재지오코딩한다 (옵션 B: 의심 건만).
 *
 * 의심 기준:
 *   1) location IS NULL                         — 좌표 없음
 *   2) 50m 내에 다른 시군구 단지와 좌표 충돌      — 동명 모호성으로 인한 오지오코딩 의심
 *      (예: "금호동 787"이 광주/광양/속초인데 서울 금호동으로 찍힌 케이스)
 *
 * 기본은 DRY-RUN(집계만). 실제 갱신은 --apply (KAKAO_REST_KEY 필요).
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/regeocode-suspect-properties.ts
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ops/regeocode-suspect-properties.ts --apply --limit=200
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode, buildGeocodeQuery } from '@/scripts/ingest/geocoder';

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const PROXIMITY_M = 50;

interface Suspect {
  id: bigint;
  name: string;
  address: string;
  full_name: string | null;
  reason: string;
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
    merged AS (
      SELECT id, reason FROM null_loc
      UNION
      SELECT id, reason FROM cross_sgg
    )
    SELECT m.id, p.name, p.address, r."fullName" AS full_name, m.reason
    FROM merged m
    JOIN "Property" p ON p.id = m.id
    LEFT JOIN "Region" r ON r.code = p."regionCode"
    ORDER BY m.reason, m.id
  `;
}

async function main() {
  const suspects = await detectSuspects();
  const byReason = suspects.reduce<Record<string, number>>((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {});
  logger.info(
    { total: suspects.length, byReason, apply: APPLY, limit: LIMIT },
    '의심 단지 탐지 완료',
  );

  if (!APPLY) {
    console.log('\n[DRY-RUN] 샘플 20건:');
    for (const s of suspects.slice(0, 20)) {
      console.log(`#${s.id} [${s.reason}] ${s.name} | ${s.full_name ?? '(지역없음)'} | "${s.address}"`);
    }
    console.log('\n실제 갱신하려면 --apply 추가 (KAKAO_REST_KEY 필요). --limit=N 으로 건수 제한 가능.');
    await prisma.$disconnect();
    return;
  }

  const targets = LIMIT ? suspects.slice(0, LIMIT) : suspects;
  let updated = 0;
  let skipped = 0;
  for (const s of targets) {
    const query = buildGeocodeQuery(s.full_name, s.address);
    const coord = await geocode(query);
    if (!coord) {
      skipped++;
      logger.warn({ id: String(s.id), query }, '지오코딩 실패 — 건너뜀');
      continue;
    }
    await prisma.$executeRaw`
      UPDATE "Property"
      SET location = ST_SetSRID(ST_MakePoint(${coord.lng}, ${coord.lat}), 4326)::geography
      WHERE id = ${s.id}
    `;
    updated++;
    logger.info(
      { id: String(s.id), query, region1: coord.region1, region2: coord.region2 },
      '재지오코딩',
    );
    await new Promise((r) => setTimeout(r, 50)); // 카카오 레이트리밋 여유
  }
  logger.info({ updated, skipped, total: targets.length }, '백필 완료');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  logger.error({ err }, '재지오코딩 실패');
  await prisma.$disconnect();
  process.exit(1);
});
