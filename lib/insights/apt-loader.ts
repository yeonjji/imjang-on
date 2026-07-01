import { cache } from 'react';
import { getPropertyById, getPropertyLatLng, getRegionStats } from '@/lib/property';
import { getUnifiedTransactions } from '@/lib/transaction';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { buildAptNarrative, type AptNarrative } from '@/lib/insights/apt';

// 요청 스코프 캐시: generateMetadata와 본문에서 같은 인자로 호출하면 1회만 실행된다.
export const cachedPropertyById = cache(getPropertyById);
export const cachedPropertyLatLng = cache(getPropertyLatLng);
export const cachedNearbySubway = cache(getNearbySubwayStations);
export const cachedNearbyInfra = cache((lat: number, lng: number) =>
  getNearbyInfra(lat, lng, { includeChildcare: true }),
);

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export const loadAptInsight = cache(
  async (propId: bigint): Promise<{ narrative: AptNarrative | null; dateModified?: string }> => {
    const property = await cachedPropertyById(propId);
    if (!property) return { narrative: null };

    const coord = await cachedPropertyLatLng(propId);
    const [salesResult, region, subway, infra] = await Promise.all([
      getUnifiedTransactions(propId, { page: 1, perPage: 30, dealType: 'SALE' }),
      getRegionStats(property.sigunguCode ?? ''),
      coord ? cachedNearbySubway(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      coord ? cachedNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
    ]);

    const saleDeals = salesResult.rows
      .filter((r) => r.dealAmount != null)
      .map((r) => ({ contractDate: r.contractDate, amountManwon: r.dealAmount as number }));

    const narrative = buildAptNarrative({
      name: property.name,
      sigunguName: property.region.sigungu ?? '',
      builtYear: property.builtYear,
      households: property.households,
      saleDeals,
      regionAvgSaleManwon: region.saleAvgPrice12m,
      regionSampleCount: region.complexCount,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
    });

    const dateModified = toUtcDate(property.saleLastAt ?? property.jeonseLastAt ?? property.wolseLastAt);
    return { narrative, dateModified };
  },
);
