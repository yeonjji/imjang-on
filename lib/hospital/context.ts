// 병원 상세의 계산값: 반경 1km 같은 진료과·같은 종별 의료기관 수와, 그중 토요일·평일 야간 진료 수.
// 의원은 진료과가 평균 3.8개라 "대표 과"는 이름에 포함된 진료과로 정한다(의원의 약 69%). 없으면 카드 생략.
// 진료시간은 일부만 공개돼 있어 토요일·야간 수는 공개분(withHours) 기준으로 함께 보인다.
// 진료시간은 심평원 우선, 없으면 국립중앙의료원(lib/hospital/hours.ts와 같은 규칙).
import { prisma } from '@/lib/db';
import { effectiveHoursJoin } from './hours';

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
             WHERE COALESCE(e."openMon", e."closeMon", e."openTue", e."closeTue", e."openWed", e."closeWed",
                            e."openThu", e."closeThu", e."openFri", e."closeFri", e."openSat", e."closeSat",
                            e."openSun", e."closeSun") IS NOT NULL
           )::int AS with_hours,
           count(DISTINCT x.id) FILTER (
             WHERE e."openSat" BETWEEN 0 AND 2400 AND e."closeSat" BETWEEN 0 AND 2400 AND e."closeSat" > e."openSat"
           )::int AS saturday,
           count(DISTINCT x.id) FILTER (
             -- 20:00 정각 종료는 '20시 이후'가 아니다. 시작 < 종료인 유효 시간대만.
             WHERE (e."closeMon" > 2000 AND e."closeMon" <= 2400 AND e."openMon" < e."closeMon")
                OR (e."closeTue" > 2000 AND e."closeTue" <= 2400 AND e."openTue" < e."closeTue")
                OR (e."closeWed" > 2000 AND e."closeWed" <= 2400 AND e."openWed" < e."closeWed")
                OR (e."closeThu" > 2000 AND e."closeThu" <= 2400 AND e."openThu" < e."closeThu")
                OR (e."closeFri" > 2000 AND e."closeFri" <= 2400 AND e."openFri" < e."closeFri")
           )::int AS night
    FROM "Hospital" x
    JOIN "HospitalDept" dp ON dp."hospitalId" = x.id AND dp."deptName" = ${dept}
    ${effectiveHoursJoin('x')}
    WHERE x."typeName" = ${h.typeName} AND x.location IS NOT NULL
      AND ST_DWithin(x.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radius})
  `;
  const r = rows[0];
  if (!r || r.total < 2) return null;
  return { dept, typeName: h.typeName, total: r.total, withHours: r.with_hours, saturday: r.saturday, night: r.night };
}
