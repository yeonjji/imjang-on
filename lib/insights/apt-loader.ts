import { cache } from 'react';
import { getPropertyById, getPropertyLatLng, getRegionStats, hasSingleJibun, getComplexFacts } from '@/lib/property';
import {
  getUnifiedTransactions,
  getAreaSummary,
  getLatestTransactionsByType,
  getFloorPremium,
  getTransactionFlags,
} from '@/lib/transaction';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { getNearbyInfra } from '@/lib/amenity/nearby';
import { buildAptNarrative, type AptNarrative, type AptInsightInput } from '@/lib/insights/apt';
import { readAptRegionSnapshot } from '@/lib/apt-region/snapshot';
import { areaBand, areaRegionRow, bandChangePct } from '@/lib/apt-region/compare';
import {
  buildUnitMix,
  buildDensity,
  resolveBuiltYear,
  type ComplexFacts,
} from '@/lib/insights/apt-complex';

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
export const cachedComplexFacts = cache(getComplexFacts);

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

// 아파트·오피스텔·빌라 상세가 공용으로 쓴다(모두 국토부 실거래가 기반).
// 벤치마크는 해당 매물의 propertyType으로 좁혀 또래끼리 비교한다.
export const loadAptInsight = cache(
  async (propId: bigint): Promise<{
    narrative: AptNarrative | null;
    dateModified?: string;
    complexFacts: ComplexFacts | null;
  }> => {
    const property = await cachedPropertyById(propId);
    if (!property) return { narrative: null, complexFacts: null };

    const coord = await cachedPropertyLatLng(propId);
    // 아파트는 시군구 같은 면적대 분포(야간 스냅샷)로 비교한다. 나머지 유형은 옛 단지 평균 비교를 유지.
    const isApt = property.propertyType === 'APARTMENT';
    const [salesResult, region, subway, infra, areaSummary, latestTx, floorPremium, flags, complexFacts] = await Promise.all([
      // 요약 문장의 근거라 유효 거래만(해제 제외).
      getUnifiedTransactions(propId, { page: 1, perPage: 30, dealType: 'SALE', includeCancelled: false }),
      isApt ? readAptRegionSnapshot(property.sigunguCode) : getRegionStats(property.sigunguCode ?? '', property.propertyType),
      coord ? cachedNearbySubway(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      coord ? cachedNearbyInfra(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      getAreaSummary(propId),
      getLatestTransactionsByType(propId),
      cachedFloorPremium(propId),
      cachedTransactionFlags(propId),
      cachedComplexFacts(propId),
    ]);
    // 산문 변동률을 가격 흐름 카드와 동일 기준(최근 실거래의 평형, 표본 2건 가드)으로 맞춘다.
    // 평형이 섞인 월평균은 근거로 쓰지 않는다.
    const latestSale = latestTx.SALE;
    const saleArea = latestSale ? areaSummary.find((a) => a.area === latestSale.pyeong) : undefined;
    const snap = isApt ? (region as Awaited<ReturnType<typeof readAptRegionSnapshot>>) : null;
    const regionStats = isApt ? null : (region as Awaited<ReturnType<typeof getRegionStats>>);
    const trendRegionPct =
      snap && saleArea?.areaSqm != null ? bandChangePct(snap.bands[areaBand(saleArea.areaSqm)]) : null;
    const saleTrend =
      saleArea?.changePct12m != null
        ? {
            changePct: saleArea.changePct12m,
            pyeong: saleArea.area,
            sampleCount: saleArea.count12m,
            region: snap && trendRegionPct != null ? { label: snap.label, changePct: trendRegionPct } : null,
          }
        : null;
    // 가격 수준: 최근 12개월 거래가 가장 많은 평형부터, 단지·지역 표본이 모두 충분한 첫 평형(getAreaSummary는 건수순).
    let regionPeer: AptInsightInput['regionPeer'] = undefined;
    if (isApt) {
      regionPeer = null;
      for (const a of areaSummary) {
        const row = areaRegionRow(a, snap);
        if (row && snap) {
          regionPeer = { label: snap.label, pyeong: a.area, bandLabel: row.bandLabel, ppa: row.ppa, position: row.position, regionMedian: row.regionMedian };
          break;
        }
      }
    }

    const saleDeals = salesResult.rows
      .filter((r) => r.dealAmount != null)
      .map((r) => ({ contractDate: r.contractDate, amountManwon: r.dealAmount as number }));

    const narrative = buildAptNarrative({
      name: property.name,
      sigunguName: property.region.sigungu ?? property.region.sido,
      // 사용승인일이 있으면 그 연도를 쓴다 — 히어로·타일과 같은 값이어야 한 페이지에
      // 다른 준공연도가 뜨지 않는다. 아파트는 builtYear가 100% 있어 bScale 발화는 불변이다.
      builtYear: resolveBuiltYear(property.builtYear, complexFacts?.usedate ?? null),
      households: property.households,
      saleDeals,
      saleTrend,
      regionAvgSaleManwon: regionStats?.saleAvgPrice12m ?? null,
      regionSampleCount: regionStats?.complexCount ?? 0,
      regionPeer,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length, capped: c.capped })).filter((c) => c.count > 0).slice(0, 5),
      floorPremium,
      flags,
      unitMix: complexFacts ? buildUnitMix(complexFacts) : null,
      density: complexFacts ? buildDensity(complexFacts) : null,
    });

    const dateModified = toUtcDate(property.saleLastAt ?? property.jeonseLastAt ?? property.wolseLastAt);
    return { narrative, dateModified, complexFacts };
  },
);
