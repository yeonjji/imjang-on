import { cache } from 'react';
import { getHospitalById, getHospitalLatLng } from '@/lib/hospital';
import { getNearbyApartments, getNearbyInfra } from '@/lib/amenity/nearby';
import { getNearbySubwayStations } from '@/lib/subway/nearby';
import { buildHospitalNarrative } from '@/lib/insights/hospital';
import type { Narrative } from '@/lib/insights/shared';

export const cachedHospitalById = cache(getHospitalById);
export const cachedHospitalLatLng = cache(getHospitalLatLng);
export const cachedNearbyApartmentsHosp = cache(getNearbyApartments);
// 병원 페이지의 infra fetch는 excludeHospitalId를 넘긴다. 3인자를 그대로 받아 cache 키를 맞춘다.
export const cachedNearbyInfraHosp = cache((lat: number, lng: number, excludeHospitalId: bigint) =>
  getNearbyInfra(lat, lng, { excludeHospitalId, includeChildcare: true }),
);
export const cachedNearbySubwayHosp = cache(getNearbySubwayStations);

export const loadHospitalInsight = cache(
  async (id: bigint): Promise<{ narrative: Narrative | null }> => {
    const hospital = await cachedHospitalById(id);
    if (!hospital) return { narrative: null };
    const coord = await cachedHospitalLatLng(id);
    const [apts, infra, subway] = await Promise.all([
      coord ? cachedNearbyApartmentsHosp(coord.lat, coord.lng) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyApartments>>),
      coord ? cachedNearbyInfraHosp(coord.lat, coord.lng, hospital.id) : Promise.resolve([] as Awaited<ReturnType<typeof getNearbyInfra>>),
      coord ? cachedNearbySubwayHosp(coord.lat, coord.lng) : Promise.resolve({ stations: [], fallback: false }),
    ]);

    const specialistSum =
      (hospital.drMedSpecialist ?? 0) + (hospital.drDentSpecialist ?? 0) + (hospital.drKorSpecialist ?? 0);
    const f = hospital.facility;
    const bedCounts = f
      ? [
          { label: '일반병상', count: (f.generalBedNormal ?? 0) + (f.generalBedPremium ?? 0) },
          { label: '중환자실', count: (f.icuAdultBed ?? 0) + (f.icuPediatricBed ?? 0) + (f.icuNeonatalBed ?? 0) },
          { label: '응급실', count: f.erBed ?? 0 },
          { label: '수술실', count: f.operatingRoomBed ?? 0 },
          { label: '분만실', count: f.deliveryBed ?? 0 },
        ].filter((x) => x.count > 0)
      : [];

    const narrative = buildHospitalNarrative({
      name: hospital.name,
      typeName: hospital.typeName,
      deptCount: hospital.depts.length,
      deptWithSpecialistCount: hospital.depts.filter((x) => (x.specialistCount ?? 0) > 0).length,
      topDeptNames: [...hospital.depts]
        .sort((a, b) => (b.specialistCount ?? 0) - (a.specialistCount ?? 0))
        .slice(0, 3)
        .map((x) => x.deptName),
      totalDoctors: hospital.totalDoctors,
      specialistTotal: specialistSum > 0 ? specialistSum : null,
      bedCounts,
      nearestStation: subway.stations[0]
        ? { name: subway.stations[0].name, lines: subway.stations[0].lines, distanceMeters: subway.stations[0].distanceMeters }
        : null,
      infra: infra.map((c) => ({ label: c.label, count: c.items.length })).filter((c) => c.count > 0).slice(0, 5),
      nearbyAptSaleManwon: apts.map((a) => a.saleLastPrice).filter((x): x is number => x != null && x > 0),
    });

    return { narrative };
  },
);
