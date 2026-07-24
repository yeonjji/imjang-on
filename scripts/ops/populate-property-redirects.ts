// 폐지지역 구 property를 신 property로 매핑해 redirectToId를 채운다(301용). 삭제 없음, 멱등.
//   pnpm tsx scripts/ops/populate-property-redirects.ts
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { pickRedirectTarget, type Candidate } from './property-redirect-match';

// 폐지: 인천 중구(2811)·동구(2814)·서구(2826) + 광주(29) + 전남(46)
const OLD_PREFIXES = ['2811', '2814', '2826', '29', '46'];
// 신설: 제물포(28125)·영종(28155)·서해(28275)·검단(28290) + 전남광주(12)
const NEW_PREFIXES = ['28125', '28155', '28275', '28290', '12'];

function prefixClause(prefixes: string[]): string {
  return prefixes.map((p) => `"regionCode" LIKE '${p}%'`).join(' OR ');
}

interface Row {
  id: bigint;
  nameNorm: string;
  propertyType: string;
  lat: number | null;
  lng: number | null;
}

function loadRows(prefixes: string[]): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, "nameNorm", "propertyType"::text AS "propertyType",
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM "Property" WHERE ${prefixClause(prefixes)}`,
  );
}

// (propertyType, nameNorm) 조합 키. propertyType은 enum, nameNorm은 정규화명이라 '::' 충돌 없음.
function matchKey(propertyType: string, nameNorm: string): string {
  return `${propertyType}::${nameNorm}`;
}

async function main() {
  const [olds, news] = await Promise.all([loadRows(OLD_PREFIXES), loadRows(NEW_PREFIXES)]);
  logger.info({ olds: olds.length, news: news.length }, 'redirect crosswalk: loaded');

  const idx = new Map<string, Candidate[]>();
  for (const n of news) {
    const key = matchKey(n.propertyType, n.nameNorm);
    let arr = idx.get(key);
    if (!arr) {
      arr = [];
      idx.set(key, arr);
    }
    arr.push({ id: n.id, lat: n.lat, lng: n.lng });
  }

  let matched = 0;
  let unmatched = 0;
  const updates: Array<{ id: bigint; to: bigint }> = [];
  for (const o of olds) {
    const cands = idx.get(matchKey(o.propertyType, o.nameNorm)) ?? [];
    const to = pickRedirectTarget({ lat: o.lat, lng: o.lng }, cands);
    if (to && to !== o.id) {
      updates.push({ id: o.id, to });
      matched++;
    } else {
      unmatched++;
    }
  }
  logger.info({ matched, unmatched }, 'redirect crosswalk: matching done');

  const CHUNK = 1000;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((u) => prisma.property.update({ where: { id: u.id }, data: { redirectToId: u.to } })),
    );
  }
  logger.info({ updated: updates.length }, 'redirect crosswalk done (no deletes)');
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'redirect crosswalk fatal');
  process.exit(1);
});
