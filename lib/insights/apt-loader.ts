import { cache } from 'react';
import { getPropertyById, getPropertyLatLng, getRegionStats, hasSingleJibun } from '@/lib/property';
import {
  getUnifiedTransactions,
  getAreaSummary,
  getLatestTransactionsByType,
  getFloorPremium,
  getTransactionFlags,
} from '@/lib/transaction';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { buildAptNarrative, type AptNarrative } from '@/lib/insights/apt';

// 요청 스코프 캐시: generateMetadata와 본문에서 같은 인자로 호출하면 1회만 실행된다.
export const cachedPropertyById = cache(getPropertyById);
export const cachedHasSingleJibun = cache(hasSingleJibun);
export const cachedPropertyLatLng = cache(getPropertyLatLng);
export const cachedNearbySubway = cache(getNearbySubwayStations);
export const cachedNearbyInfra = cache((lat: number, lng: number) =>
  getNearbyInfra(lat, lng, { includeChildcare: true }),
);
// 상세 페이지의 카드도 이 캐시 별칭을 쓰게 해서, 산문(loadAptInsight)과 카드가 요청당 1회만 조회하도록 dedupe한다.
export const cachedFloorPremium = cache(getFloorPremium);
export const cachedTransactionFlags = cache(getTransactionFlags);

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

// 아파트·오피스텔·빌라 상세가 공용으로 쓴다(모두 국토부 실거래가 기반).
// 벤치마크는 해당 매물의 propertyType으로 좁혀 또래끼리 비교한다.
export const loadAptInsight = cache(
  async (propId: bigint): Promise<{ narrative: AptNarrative | null; dateModified?: string }> => {
    const property = await cachedPropertyById(propId);
    if (!property) return { narrative: null };

    const coord = await cachedPropertyLatLng(propId);
    const [salesResult, region, subway, infra, areaSummary, latestTx, floorPremium, flags] = await Promise.all([
      getUnifiedTransactions(propId, { page: 1, perPage: 30, dealType: 'SALE' }),
      getRegionStats(property.sigunguCode ?? '', property.propertyType),
      coord ? cachedNearbySubway(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      coord ? cachedNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      getAreaSummary(propId),
      getLatestTransactionsByType(propId),
      cachedFloorPremium(propId),
      cachedTransactionFlags(propId),
    ]);
    // 산문 변동률을 가격 흐름 카드와 동일 기준(최근 실거래의 평형, 표본 2건 가드)으로 맞춘다.
    // 평형이 섞인 월평균은 근거로 쓰지 않는다.
    const latestSale = latestTx.SALE;
    const saleArea = latestSale ? areaSummary.find((a) => a.area === latestSale.pyeong) : undefined;
    const saleTrend =
      saleArea?.changePct12m != null
        ? { changePct: saleArea.changePct12m, pyeong: saleArea.area, sampleCount: saleArea.count12m }
        : null;

    const saleDeals = salesResult.rows
      .filter((r) => r.dealAmount != null)
      .map((r) => ({ contractDate: r.contractDate, amountManwon: r.dealAmount as number }));

    const narrative = buildAptNarrative({
      name: property.name,
      sigunguName: property.region.sigungu ?? property.region.sido,
      builtYear: property.builtYear,
      households: property.households,
      saleDeals,
      saleTrend,
      regionAvgSaleManwon: region.saleAvgPrice12m,
      regionSampleCount: region.complexCount,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length, capped: c.capped })).filter((c) => c.count > 0).slice(0, 5),
      floorPremium,
      flags,
    });

    const dateModified = toUtcDate(property.saleLastAt ?? property.jeonseLastAt ?? property.wolseLastAt);
    return { narrative, dateModified };
  },
);
