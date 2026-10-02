// 병원 상세의 계산값: 반경 1km 같은 진료과·같은 종별 의료기관 수와, 그중 토요일·평일 야간 진료 수.
// 의원은 진료과가 평균 3.8개라 "대표 과"는 이름에 포함된 진료과로 정한다(의원의 약 69%). 없으면 카드 생략.
// 진료시간은 일부만 공개돼 있어 토요일·야간 수는 공개분(withHours) 기준으로 함께 보인다.
import { prisma } from '@/lib/db';

const strip = (s: string) => s.replace(/\s+/g, '');

export function primaryDept(name: string, deptNames: string[]): string | null {
  const n = strip(name);
  const hits = deptNames.filter((d) => d && n.includes(strip(d)));
  if (hits.length === 0) return null;
  return hits.sort((a, b) => strip(b).length - strip(a).length)[0];
}

export interface SameDeptNearby {
  dept: string;
  typeName: string;
  total: number;
  withHours: number;
  saturday: number;
  night: number;
}

export async function getSameDeptNearby(
  h: { typeName: string },
  dept: string,
  lat: number,
  lng: number,
  radius = 1000,
): Promise<SameDeptNearby | null> {
  const rows = await prisma.$queryRaw<{ total: number; with_hours: number; saturday: number; night: number }[]>`
    SELECT count(DISTINCT x.id)::int AS total,
           count(DISTINCT x.id) FILTER (WHERE d.id IS NOT NULL)::int AS with_hours,
           count(DISTINCT x.id) FILTER (
             WHERE d."openSat" BETWEEN 0 AND 2400 AND d."closeSat" BETWEEN 0 AND 2400 AND d."closeSat" > d."openSat"
           )::int AS saturday,
           count(DISTINCT x.id) FILTER (
             WHERE d."closeMon" BETWEEN 2000 AND 2400 OR d."closeTue" BETWEEN 2000 AND 2400
                OR d."closeWed" BETWEEN 2000 AND 2400 OR d."closeThu" BETWEEN 2000 AND 2400
                OR d."closeFri" BETWEEN 2000 AND 2400
           )::int AS night
    FROM "Hospital" x
    JOIN "HospitalDept" dp ON dp."hospitalId" = x.id AND dp."deptName" = ${dept}
    LEFT JOIN "HospitalDetail" d ON d."hospitalId" = x.id
    WHERE x."typeName" = ${h.typeName} AND x.location IS NOT NULL
      AND ST_DWithin(x.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
  `;
  const r = rows[0];
  if (!r || r.total < 2) return null;
  return { dept, typeName: h.typeName, total: r.total, withHours: r.with_hours, saturday: r.saturday, night: r.night };
}
