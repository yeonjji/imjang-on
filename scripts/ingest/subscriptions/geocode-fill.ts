/**
 * 1회성 + 재실행 가능: 좌표가 없는 청약 공고를 주소로 지오코딩해 채운다.
 *
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/subscriptions/geocode-fill.ts --limit 50
 *   pnpm exec dotenv -e .env.local -- tsx scripts/ingest/subscriptions/geocode-fill.ts --apply
 *
 * 대상은 `location IS NULL AND address IS NOT NULL`이라 중단 후 재실행해도 이어서 돈다.
 * 카카오 응답 지역이 주소와 어긋나면 좌표를 버린다 — 틀린 좌표는 빈 값보다 나쁘다.
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { geocode, geocodeKeyword } from '@/scripts/ingest/geocoder';
import { parseAddressRegion, regionMatches, geocodeCandidates } from '@/lib/subscription/geo-validate';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apply = process.argv.includes('--apply');
  const limit = argNum('--limit', 3000);

  const rows = await prisma.$queryRaw<Array<{ id: bigint; address: string }>>`
    SELECT id, address
    FROM "SubscriptionNotice"
    WHERE location IS NULL AND address IS NOT NULL
    ORDER BY id
    LIMIT ${limit}
  `;
  logger.info({ target: rows.length, apply }, '청약 지오코딩 백필 시작');

  let ok = 0;
  let noResult = 0;
  let mismatch = 0;

  for (const r of rows) {
    const addr = parseAddressRegion(r.address);

    // 원문 주소를 그대로 넣으면 카카오가 못 찾는다(운영 40건 표본 0/40).
    // 좁은 후보부터 시도하고, 주소검색이 비면 키워드검색으로 폴백한다.
    // 후보가 좌표를 찾아도 지역이 어긋나면 버리고 다음 후보를 마저 시도한다 —
    // 첫 후보에서 바로 break하면, 뒤 후보라면 맞았을 좌표까지 놓친다.
    let validCoord: Awaited<ReturnType<typeof geocode>> = null;
    let sawInvalidCoord = false;
    for (const q of geocodeCandidates(r.address)) {
      let coord = await geocode(q);
      if (!coord) {
        await sleep(100); // 카카오 로컬 API 호출 간격 — 주소검색과 키워드검색 사이에도 간격을 둔다
        coord = await geocodeKeyword(q);
      }
      await sleep(100); // 카카오 로컬 API 호출 간격

      if (!coord) continue;
      if (regionMatches(addr, coord)) {
        validCoord = coord;
        break;
      }
      sawInvalidCoord = true;
      logger.warn(
        { id: String(r.id), addr, got: { region1: coord.region1, region2: coord.region2 } },
        '지역 불일치 — 다음 후보 시도',
      );
    }

    if (!validCoord) {
      // 지역이 맞는 후보가 하나도 없었을 때, 애초에 좌표를 준 후보가 있었는지로
      // "결과없음"과 "지역불일치"를 구분한다 — 운영자가 원인을 다르게 다뤄야 한다.
      if (sawInvalidCoord) mismatch++; else noResult++;
      continue;
    }
    ok++;
    if (!apply) continue;

    await prisma.$executeRaw`
      UPDATE "SubscriptionNotice"
      SET location = ST_SetSRID(ST_MakePoint(${validCoord.lng}, ${validCoord.lat}), 4326)::geography
      WHERE id = ${r.id}
    `;
  }

  console.log(
    `\n${apply ? '반영' : 'dry-run'}: 대상 ${rows.length}건 → 성공 ${ok} / 결과없음 ${noResult} / 지역불일치 ${mismatch}`,
  );
  if (!apply && ok) console.log('실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
}

main()
  .catch((err) => { logger.error({ err }, 'subscription geocode-fill fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
