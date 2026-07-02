import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getSchoolById } from '@/lib/school';
import { getNearbyApartments, getNearbyInfra, getNearbySchoolCounts } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildSchoolNarrative } from '@/lib/insights/school';
import type { Narrative } from '@/lib/insights/shared';

export const cachedSchoolById = cache(getSchoolById);

export const cachedSchoolLatLng = cache(async (id: bigint): Promise<{ lat: number; lng: number } | null> => {
  const rows = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
    SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
    FROM "School" WHERE id = ${id} AND location IS NOT NULL
  `;
  return rows[0] ?? null;
});

export const cachedNearbyAptsSchool = cache(getNearbyApartments);
export const cachedNearbyInfraSchool = cache(getNearbyInfra);
export const cachedNearbySubwaySchool = cache(getNearbySubwayStations);
export const cachedNearbySchoolCounts = cache((lat: number, lng: number, excludeId: bigint) =>
  getNearbySchoolCounts(lat, lng, excludeId),
);

export const loadSchoolInsight = cache(async (id: bigint): Promise<{ narrative: Narrative | null }> => {
  const school = await cachedSchoolById(id);
  if (!school) return { narrative: null };
  const coord = await cachedSchoolLatLng(id);
  const [apts, infra, subway, schoolCounts] = await Promise.all([
    coord ? cachedNearbyAptsSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
    coord ? cachedNearbyInfraSchool(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    coord ? cachedNearbySubwaySchool(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    coord ? cachedNearbySchoolCounts(coord.lat, coord.lng, id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbySchoolCounts>>),
  ]);

  const narrative = buildSchoolNarrative({
    name: school.name,
    schoolKind: school.schoolKind,
    foundType: school.foundType,
    coeduType: school.coeduType,
    nearbySchoolCounts: schoolCounts,
    nearestStation: subway.stations[0]
      ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
      : null,
    infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
    nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
  });

  return { narrative };
});
