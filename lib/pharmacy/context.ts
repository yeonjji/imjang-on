// 약국 상세의 계산값: 영업 연차, 같은 읍면동 약국 중 개설 순서, 도보권 일요일 진료 병·의원 수.
// 진료시간(HospitalDetail)은 의원의 약 31%만 공개돼 있어, 0을 "없음"으로 단정하지 않는다(호출부가 0이면 숨김).
import { prisma } from '@/lib/db';

export function pharmacyYears(openedAt: Date | null, nowYear: number): number | null {
  if (!openedAt) return null;
  const y = openedAt.getUTCFullYear();
  return y > nowYear ? null : nowYear - y + 1;
}

export interface PharmacyDong {
  dong: string;
  count: number;
  openedRank: number;
}

export async function getPharmacyDong(p: {
  sigunguCode: string | null;
  eupmyeondong: string | null;
  openedAt: Date | null;
}): Promise<PharmacyDong | null> {
  if (!p.sigunguCode || !p.eupmyeondong) return null;
  const rows = await prisma.$queryRaw<{ total: number; older: number }[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE ${p.openedAt}::date IS NOT NULL AND "openedAt" < ${p.openedAt}::date)::int AS older
    FROM "Pharmacy"
    WHERE "sigunguCode" = ${p.sigunguCode} AND eupmyeondong = ${p.eupmyeondong}
  `;
  const r = rows[0];
  if (!r || r.total < 2) return null;
  return { dong: p.eupmyeondong, count: r.total, openedRank: r.older + 1 };
}

export async function countSundayClinicsNearby(lat: number, lng: number, radius = 500): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Hospital" h JOIN "HospitalDetail" d ON d."hospitalId" = h.id
    WHERE h.location IS NOT NULL
      AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
      AND d."openSun" BETWEEN 0 AND 2400 AND d."closeSun" BETWEEN 0 AND 2400 AND d."closeSun" > d."openSun"
  `;
  return rows[0]?.n ?? 0;
}
