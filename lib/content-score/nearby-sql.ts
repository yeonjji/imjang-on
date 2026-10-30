/**
 * 주간 주변 판정(목록 점수). 상세 페이지의 주변 블록이 "결과 1건 이상"일 때 보이는 것과 같은 조건을
 * 공간 인덱스(GIST) EXISTS로 id 청크 단위 일괄 판정한다 — 행마다 상세 함수를 부르면(정렬·LIMIT 포함) 비싸다.
 * 반경·필터는 lib/amenity/nearby.ts·lib/subway/nearby.ts와 같아야 한다(tests/integration/content-score-nearby.test.ts가 대조).
 * 생활 인프라는 상가(Store)를 뺀 6종으로 판정(설계 R2 — 상가는 업종 분류·숨김 규칙 때문에 EXISTS로 재현 불가).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type NearbyTable = 'Hospital' | 'Pharmacy' | 'Childcare' | 'School' | 'Park' | 'Parking' | 'EvCharger';

export const NEARBY_RADIUS = {
  apts: 1000, // getNearbyApartments 기본
  subway: 5000, // getNearbySubwayStations: 800m 안 없으면 5km 안 최근접 표시
  hospital: 500, pharmacy: 500, parking: 500, charger: 500, // getNearbyInfra
  park: 1000, childcareInfra: 1000,
  childcare: 1000, // 주변 어린이집 섹션
} as const;

export interface NearbyFlag { apts: boolean; subway: boolean; infra: boolean; childcare: boolean }

const CC_ACTIVE = Prisma.sql`(x."status" IN ('정상', '재개') OR x."status" IS NULL)`;

function infraExists(table: NearbyTable, withChildcare: boolean): Prisma.Sql {
  const self = (t: NearbyTable) => (t === table ? Prisma.sql`AND x.id <> t.id` : Prisma.empty);
  const r = NEARBY_RADIUS;
  return Prisma.sql`(
    EXISTS (SELECT 1 FROM "Hospital" x WHERE x.location IS NOT NULL ${self('Hospital')} AND ST_DWithin(x.location, t.location, ${r.hospital}))
    OR EXISTS (SELECT 1 FROM "Pharmacy" x WHERE x.location IS NOT NULL ${self('Pharmacy')} AND ST_DWithin(x.location, t.location, ${r.pharmacy}))
    OR EXISTS (SELECT 1 FROM "Park" x WHERE x.location IS NOT NULL ${self('Park')} AND ST_DWithin(x.location, t.location, ${r.park}))
    OR EXISTS (SELECT 1 FROM "EvCharger" x WHERE x.location IS NOT NULL ${self('EvCharger')} AND ST_DWithin(x.location, t.location, ${r.charger}))
    OR EXISTS (SELECT 1 FROM "Parking" x WHERE x.location IS NOT NULL ${self('Parking')} AND ST_DWithin(x.location, t.location, ${r.parking}))
    ${withChildcare ? Prisma.sql`OR EXISTS (SELECT 1 FROM "Childcare" x WHERE x.location IS NOT NULL AND ${CC_ACTIVE} AND ST_DWithin(x.location, t.location, ${r.childcareInfra}))` : Prisma.empty}
  )`;
}

export async function nearbyFlags(
  table: NearbyTable,
  ids: bigint[],
  opts: { infraChildcare: boolean; nearChildcare: boolean },
): Promise<Map<string, NearbyFlag>> {
  if (ids.length === 0) return new Map();
  const r = NEARBY_RADIUS;
  const nearCc = opts.nearChildcare
    ? Prisma.sql`EXISTS (SELECT 1 FROM "Childcare" x WHERE x.location IS NOT NULL AND ${CC_ACTIVE} ${table === 'Childcare' ? Prisma.sql`AND x.id <> t.id` : Prisma.empty} AND ST_DWithin(x.location, t.location, ${r.childcare}))`
    : Prisma.sql`false`;
  const rows = await prisma.$queryRaw<{ id: bigint; apts: boolean; subway: boolean; infra: boolean; childcare: boolean }[]>`
    SELECT t.id,
      EXISTS (SELECT 1 FROM "Property" p WHERE p."propertyType" = 'APARTMENT' AND p.location IS NOT NULL AND p."txCount12m" > 0
              AND ST_DWithin(p.location, t.location, ${r.apts})) AS apts,
      EXISTS (SELECT 1 FROM "SubwayStation" s WHERE s.location IS NOT NULL AND ST_DWithin(s.location, t.location, ${r.subway})) AS subway,
      ${infraExists(table, opts.infraChildcare)} AS infra,
      ${nearCc} AS childcare
    FROM ${Prisma.raw(`"${table}"`)} t
    WHERE t.id = ANY(${ids}::bigint[]) AND t.location IS NOT NULL
  `;
  return new Map(rows.map((x) => [String(x.id), { apts: x.apts, subway: x.subway, infra: x.infra, childcare: x.childcare }]));
}
