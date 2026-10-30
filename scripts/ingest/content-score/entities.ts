/**
 * 엔터티별 청크 로드 → 점수(daily=자체 정보, weekly=주변·비교) 정의.
 * 화면 판정은 lib/content-score/* 순수 함수가 맡고, 여기는 상세 페이지가 읽는 것과 같은 데이터를 읽어 넘긴다.
 */
import { prisma } from '@/lib/db';
import { sum } from '@/lib/content-score/core';
import { ownHospital, weeklyHospital } from '@/lib/content-score/hospital';
import { ownPharmacy, weeklyPharmacy } from '@/lib/content-score/pharmacy';
import { ownChildcare, weeklyChildcare } from '@/lib/content-score/childcare';
import { ownSchool, weeklySchool } from '@/lib/content-score/school';
import { ownPark, weeklyPark } from '@/lib/content-score/park';
import { ownParking, weeklyParking, feeCompareShown } from '@/lib/content-score/parking';
import { ownCharger, weeklyCharger } from '@/lib/content-score/charger';
import { nearbyFlags, type NearbyTable } from '@/lib/content-score/nearby-sql';
import { primaryDept, getSameDeptNearby } from '@/lib/hospital/context';
import { getPharmacyDong, countSundayClinicsNearby } from '@/lib/pharmacy/context';
import { getParkAreaRank } from '@/lib/urban/park-context';
import { getParkingFeeComparison } from '@/lib/urban/parking-context';
import { resolveSigunguFromAddress } from '@/lib/region/from-address';
import { resolveAddrPrefix } from '@/lib/urban/_shared';

export type EntityKey = 'hospital' | 'pharmacy' | 'childcare' | 'school' | 'park' | 'parking' | 'charger';

export interface ScoredRow { id: bigint; own: number; weekly?: number; seoul: boolean }

export interface EntityDef {
  table: NearbyTable;
  /** id 커서 청크를 읽어 자체 점수(+weekly면 주간 점수)를 낸다 */
  score(afterId: bigint, limit: number, weekly: boolean): Promise<ScoredRow[]>;
}

const NO_FLAG = { apts: false, subway: false, infra: false, childcare: false };

async function coords(table: NearbyTable, ids: bigint[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<{ id: bigint; lat: number; lng: number }[]>(
    `SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM "${table}" WHERE id = ANY($1::bigint[]) AND location IS NOT NULL`,
    ids,
  );
  return new Map(rows.map((r) => [String(r.id), { lat: r.lat, lng: r.lng }]));
}

/** 상세 페이지와 같은 경로: 주소 → 시군구 코드 → '시도 시군구' 접두어. 같은 주소는 한 번만 푼다. */
function prefixResolver() {
  const cache = new Map<string, Promise<string | null>>();
  return (address: string): Promise<string | null> => {
    let p = cache.get(address);
    if (!p) {
      p = (async () => {
        const sgg = await resolveSigunguFromAddress(address);
        const prefix = sgg ? await resolveAddrPrefix({ sigunguCode: sgg }) : null;
        return prefix && prefix !== '__NO_MATCH__' ? prefix : null;
      })();
      cache.set(address, p);
    }
    return p;
  };
}

const nowYear = () => new Date().getUTCFullYear();
const isSeoulCode = (code: string | null) => (code ?? '').startsWith('11');

export const ENTITIES: Record<EntityKey, EntityDef> = {
  hospital: {
    table: 'Hospital',
    async score(afterId, limit, weekly) {
      const rows = await prisma.hospital.findMany({
        where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit,
        include: {
          facility: true, detail: true, nemcHours: true,
          depts: { select: { deptName: true } },
          _count: { select: { equipment: true, specialties: true, specialTreatments: true, nursingGrades: true, staff: true, transits: true, mealSurcharges: true } },
        },
      });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Hospital', ids);
      const near = weekly ? await nearbyFlags('Hospital', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const out: ScoredRow[] = [];
      for (const h of rows) {
        const c = xy.get(String(h.id));
        const own = sum(ownHospital({ ...h, counts: { depts: h.depts.length, ...h._count }, hasLocation: !!c }));
        let wk: number | undefined;
        if (weekly) {
          const dept = primaryDept(h.name, h.depts.map((d) => d.deptName));
          const same = c && dept ? (await getSameDeptNearby(h, dept, c.lat, c.lng)) !== null : false;
          const f = near!.get(String(h.id)) ?? NO_FLAG;
          wk = sum(weeklyHospital({ sameDept: same, apts: f.apts, subway: f.subway, infra: f.infra }));
        }
        out.push({ id: h.id, own, weekly: wk, seoul: isSeoulCode(h.sigunguCode) });
      }
      return out;
    },
  },
  pharmacy: {
    table: 'Pharmacy',
    async score(afterId, limit, weekly) {
      const rows = await prisma.pharmacy.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Pharmacy', ids);
      const near = weekly ? await nearbyFlags('Pharmacy', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const out: ScoredRow[] = [];
      for (const p of rows) {
        const c = xy.get(String(p.id));
        const own = sum(ownPharmacy({ ...p, hasLocation: !!c }, nowYear()));
        let wk: number | undefined;
        if (weekly) {
          const dong = (await getPharmacyDong(p)) !== null;
          const sunday = c ? (await countSundayClinicsNearby(c.lat, c.lng)) > 0 : false;
          const f = near!.get(String(p.id)) ?? NO_FLAG;
          wk = sum(weeklyPharmacy({ dong, sunday, apts: f.apts, subway: f.subway, infra: f.infra }));
        }
        out.push({ id: p.id, own, weekly: wk, seoul: isSeoulCode(p.sigunguCode) });
      }
      return out;
    },
  },
  childcare: {
    table: 'Childcare',
    async score(afterId, limit, weekly) {
      const rows = await prisma.childcare.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Childcare', ids);
      // 어린이집 상세: 인프라는 어린이집 미포함(cachedNearbyInfraCC = 옵션 없는 getNearbyInfra), 주변 어린이집 섹션은 자기 제외
      const near = weekly ? await nearbyFlags('Childcare', ids, { infraChildcare: false, nearChildcare: true }) : null;
      return rows.map((c) => ({
        id: c.id,
        own: sum(ownChildcare(c, xy.has(String(c.id)))),
        weekly: weekly ? sum(weeklyChildcare(near!.get(String(c.id)) ?? NO_FLAG)) : undefined,
        seoul: isSeoulCode(c.sigunguCode),
      }));
    },
  },
  school: {
    table: 'School',
    async score(afterId, limit, weekly) {
      const rows = await prisma.school.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('School', ids);
      // 학교 상세: cachedNearbyInfraSchool = 옵션 없는 getNearbyInfra → 인프라에 어린이집 미포함. 주변 어린이집 섹션은 별도
      const near = weekly ? await nearbyFlags('School', ids, { infraChildcare: false, nearChildcare: true }) : null;
      return rows.map((s) => ({
        id: s.id,
        own: sum(ownSchool(s, xy.has(String(s.id)))),
        weekly: weekly ? sum(weeklySchool(near!.get(String(s.id)) ?? NO_FLAG)) : undefined,
        seoul: isSeoulCode(s.sigunguCode),
      }));
    },
  },
  park: {
    table: 'Park',
    async score(afterId, limit, weekly) {
      const rows = await prisma.park.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Park', ids);
      const near = weekly ? await nearbyFlags('Park', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const prefixOf = prefixResolver();
      const out: ScoredRow[] = [];
      for (const p of rows) {
        let wk: number | undefined;
        if (weekly) {
          const rank = (await getParkAreaRank(p, await prefixOf(p.address))) !== null;
          wk = sum(weeklyPark({ areaRank: rank, ...(near!.get(String(p.id)) ?? NO_FLAG) }));
        }
        out.push({ id: p.id, own: sum(ownPark(p, xy.has(String(p.id)))), weekly: wk, seoul: p.address.startsWith('서울') });
      }
      return out;
    },
  },
  parking: {
    table: 'Parking',
    async score(afterId, limit, weekly) {
      const rows = await prisma.parking.findMany({ where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit });
      const ids = rows.map((r) => r.id);
      const xy = await coords('Parking', ids);
      const near = weekly ? await nearbyFlags('Parking', ids, { infraChildcare: true, nearChildcare: false }) : null;
      const prefixOf = prefixResolver();
      const out: ScoredRow[] = [];
      for (const r of rows) {
        let wk: number | undefined;
        if (weekly) {
          // 상세는 rdnmadr ?? lnmadr ?? address로 시군구를 찾는다(app/(public)/urban/[category]/[id]/page.tsx)
          const cmp = await getParkingFeeComparison(r, await prefixOf(r.rdnmadr ?? r.lnmadr ?? r.address));
          wk = sum(weeklyParking({ feeCompare: feeCompareShown(cmp), ...(near!.get(String(r.id)) ?? NO_FLAG) }));
        }
        out.push({ id: r.id, own: sum(ownParking(r, xy.has(String(r.id)))), weekly: wk, seoul: r.address.startsWith('서울') });
      }
      return out;
    },
  },
  charger: {
    table: 'EvCharger',
    async score(afterId, limit, weekly) {
      const rows = await prisma.evCharger.findMany({
        where: { id: { gt: afterId } }, orderBy: { id: 'asc' }, take: limit,
        include: { units: { select: { outputKw: true, installYear: true } } },
      });
      const ids = rows.map((r) => r.id);
      const xy = await coords('EvCharger', ids);
      const near = weekly ? await nearbyFlags('EvCharger', ids, { infraChildcare: true, nearChildcare: false }) : null;
      return rows.map((c) => ({
        id: c.id,
        own: sum(ownCharger(c, c.units, xy.has(String(c.id)))),
        weekly: weekly ? sum(weeklyCharger(near!.get(String(c.id)) ?? NO_FLAG)) : undefined,
        seoul: c.address.startsWith('서울'),
      }));
    },
  },
};
