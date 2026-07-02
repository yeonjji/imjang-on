import { cache } from 'react';
import type { Park } from '@prisma/client';
import { getUrbanById, getUrbanLatLng } from '@/lib/urban/detail';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildParkNarrative } from '@/lib/insights/park';
import type { Narrative } from '@/lib/insights/shared';

export const cachedParkById = cache((id: bigint) => getUrbanById('park', id));
export const cachedParkLatLng = cache((id: bigint) => getUrbanLatLng('park', id));
export const cachedNearbyAptsPark = cache(getNearbyApartments);
// park 페이지 infra fetch는 excludeParkId를 넘긴다. 3인자를 그대로 받아 cache 키를 맞춘다.
export const cachedNearbyInfraPark = cache((lat: number, lng: number, excludeParkId: bigint) =>
  getNearbyInfra(lat, lng, { excludeParkId, includeChildcare: true }),
);
export const cachedNearbySubwayPark = cache(getNearbySubwayStations);

export const loadParkInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null; dateModified?: string }> => {
    const item = await cachedParkById(id);
    if (!item) return { narrative: null };
    const park = item.raw as Park;
    const coord = await cachedParkLatLng(id);
    const [apts, infra, subway] = await Promise.all([
      coord ? cachedNearbyAptsPark(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraPark(coord.lat, coord.lng, id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayPark(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    ]);

    const narrative = buildParkNarrative({
      name: item.name,
      parkType: park.parkType,
      area: park.area,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    const dateModified = park.referenceDate ? park.referenceDate.toISOString().slice(0, 10) : undefined;
    return { narrative, dateModified };
  },
);
