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
           -- 상세 행이 있어도 시간이 전부 비어 있는 곳(약 10%)은 '공개'로 세지 않는다.
           count(DISTINCT x.id) FILTER (
             WHERE COALESCE(d."openMon", d."closeMon", d."openTue", d."closeTue", d."openWed", d."closeWed",
                            d."openThu", d."closeThu", d."openFri", d."closeFri", d."openSat", d."closeSat",
                            d."openSun", d."closeSun") IS NOT NULL
           )::int AS with_hours,
           count(DISTINCT x.id) FILTER (
             WHERE d."openSat" BETWEEN 0 AND 2400 AND d."closeSat" BETWEEN 0 AND 2400 AND d."closeSat" > d."openSat"
           )::int AS saturday,
           count(DISTINCT x.id) FILTER (
             -- 20:00 정각 종료는 '20시 이후'가 아니다. 시작 < 종료인 유효 시간대만.
             WHERE (d."closeMon" > 2000 AND d."closeMon" <= 2400 AND d."openMon" < d."closeMon")
                OR (d."closeTue" > 2000 AND d."closeTue" <= 2400 AND d."openTue" < d."closeTue")
                OR (d."closeWed" > 2000 AND d."closeWed" <= 2400 AND d."openWed" < d."closeWed")
                OR (d."closeThu" > 2000 AND d."closeThu" <= 2400 AND d."openThu" < d."closeThu")
                OR (d."closeFri" > 2000 AND d."closeFri" <= 2400 AND d."openFri" < d."closeFri")
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
