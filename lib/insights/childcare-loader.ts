import { cache } from 'react';
import { getChildcareById, getChildcareLatLng, getSigunguChildcareFillMedian } from '@/lib/childcare';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildChildcareNarrative } from '@/lib/insights/childcare';
import type { Narrative } from '@/lib/insights/shared';

// 로더와 페이지가 같은 인자로 호출하면 요청당 1회로 dedupe된다.
export const cachedChildcareById = cache(getChildcareById);
export const cachedChildcareLatLng = cache(getChildcareLatLng);
export const cachedNearbyApartments = cache(getNearbyApartments);
export const cachedNearbyInfraCC = cache((lat: number, lng: number) => getNearbyInfra(lat, lng));
export const cachedNearbySubwayCC = cache(getNearbySubwayStations);
export const cachedSigunguFillMedian = cache(getSigunguChildcareFillMedian);

// cpmsapi030 대기 연령 코드 → 라벨 (childcare-wait-list.tsx와 동일)
const WAIT_AGES: [string, string][] = [
  ['waitCnt00', '만 0세'], ['waitCnt01', '만 1세'], ['waitCnt02', '만 2세'],
  ['waitCnt03', '만 3세'], ['waitCnt04', '만 4세'], ['waitCnt05', '만 5세'], ['waitCntM6', '6세 이상'],
];

function toUtcDate(d: Date | null | undefined): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export const loadChildcareInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null; dateModified?: string }> => {
    const item = await cachedChildcareById(id);
    if (!item) return { narrative: null };
    const coord = await cachedChildcareLatLng(id);
    const [apts, infra, subway, fillMedian] = await Promise.all([
      coord ? cachedNearbyApartments(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraCC(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayCC(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
      cachedSigunguFillMedian(item.sigunguCode),
    ]);

    const narrative = buildChildcareNarrative({
      name: item.name,
      crType: item.crType,
      capacity: item.capacity,
      currentCount: item.currentCount,
      emRoleTeacher: item.emRoleTeacher,
      sigunguFillMedian: fillMedian,
      waitByAge: WAIT_AGES.map(([k, label]) => ({ label, count: (item as Record<string, unknown>)[k] as number ?? 0 }))
        .filter((x) => x.count > 0),
      roomSize: item.roomSize,
      cctvCount: item.cctvCount,
      vehicleOp: item.vehicleOp,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    return { narrative, dateModified: toUtcDate(item.dataStdDate) };
  },
);
