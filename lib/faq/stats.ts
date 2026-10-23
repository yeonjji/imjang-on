import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { kstDate } from '@/lib/insights/maintenance-cost';

/**
 * /faq·목록 페이지 FAQ 답에 넣는 임장ON 숫자. spec: docs/superpowers/specs/2026-10-23-faq-page-data-design.md
 * 하루 1회 계산(unstable_cache 24h). 모두 운영 실측 0.05초 미만인 집계만 쓴다 — 실거래 총건수(정확 count 0.86초,
 * pg_class 추정 5% 오차)는 넣지 않는다. 값은 JSON 직렬화돼 캐시되므로 number만.
 */
export interface FaqStats {
  apt: number;
  officetel: number;
  villa: number;
  maintenanceComplexes: number;
  subscriptionNotices: number;
  subscriptionResults: number;
  remnantNotices: number;
  arbitraryNotices: number;
  loanProducts: number;
  jeonseProducts: number;
  hospitals: number;
  pharmacies: number;
  schools: number;
  childcare: number;
  childcarePublic: number;
  parks: number;
  /** 공영 주차장(주차장 표준데이터에는 민영도 있다) */
  publicParkings: number;
  evStations: number;
  /** 계산한 날(KST) */
  asOf: string;
}

const n = (v: bigint | number) => Number(v);

export async function queryFaqStats(): Promise<FaqStats> {
  const [prop] = await prisma.$queryRaw<{ apt: bigint; officetel: bigint; villa: bigint }[]>`
    SELECT count(*) FILTER (WHERE "propertyType" = 'APARTMENT') AS apt,
           count(*) FILTER (WHERE "propertyType" = 'OFFICETEL') AS officetel,
           count(*) FILTER (WHERE "propertyType" IN ('ROW_HOUSE', 'MULTIPLEX')) AS villa
    FROM "Property" WHERE "redirectToId" IS NULL`;
  // 관리비 섹션이 실제로 보이는 단지: 단지(Property)와 연결되고 공용관리비 값이 있는 kaptCode.
  const [mc] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(DISTINCT m."kaptCode") AS c FROM "AptMaintenanceCost" m
    JOIN "AptComplex" a ON a."kaptCode" = m."kaptCode"
    WHERE a."propertyId" IS NOT NULL AND m."commonTotal" > 0`;
  const [sub] = await prisma.$queryRaw<{ total: bigint; remnant: bigint; arbitrary: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE category = 'REMNANT') AS remnant,
           count(*) FILTER (WHERE category = 'ARBITRARY') AS arbitrary
    FROM "SubscriptionNotice" WHERE source = 'APPLYHOME'`;
  // 목록 기본 필터와 같게(lib/childcare.ts buildChildcareWhere): 정상·재개·상태 없음.
  const [cc] = await prisma.$queryRaw<{ total: bigint; pub: bigint }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE "crType" = '국공립') AS pub
    FROM "Childcare" WHERE status IN ('정상', '재개') OR status IS NULL`;
  const [results, loans, jeonse, hospitals, pharmacies, schools, parks, parkings, ev] = await Promise.all([
    prisma.subscriptionResult.count({ where: { status: 'ok' } }),
    prisma.loanProduct.count(),
    prisma.jeonseGuaranteeProduct.count(),
    // 병원·약국 목록은 시군구가 있는 행만 보여준다(lib/hospital, lib/pharmacy).
    prisma.hospital.count({ where: { sigunguCode: { not: null } } }),
    prisma.pharmacy.count({ where: { sigunguCode: { not: null } } }),
    prisma.school.count(),
    prisma.park.count(),
    prisma.parking.count({ where: { prkplceSe: { contains: '공영' } } }),
    prisma.evCharger.count(),
  ]);
  return {
    apt: n(prop.apt),
    officetel: n(prop.officetel),
    villa: n(prop.villa),
    maintenanceComplexes: n(mc.c),
    subscriptionNotices: n(sub.total),
    subscriptionResults: results,
    remnantNotices: n(sub.remnant),
    arbitraryNotices: n(sub.arbitrary),
    loanProducts: loans,
    jeonseProducts: jeonse,
    hospitals,
    pharmacies,
    schools,
    childcare: n(cc.total),
    childcarePublic: n(cc.pub),
    parks,
    publicParkings: parkings,
    evStations: ev,
    asOf: kstDate(new Date()),
  };
}

/** 하루 캐시. 캐시 래퍼가 없는 환경(테스트·스크립트)이나 래퍼 오류면 직접 조회, 그것도 실패하면 null(숫자 없는 문장). */
export async function getFaqStats(): Promise<FaqStats | null> {
  try {
    return await unstable_cache(queryFaqStats, ['faq-stats-v2'], { revalidate: 86_400 })();
  } catch {
    try {
      return await queryFaqStats();
    } catch {
      return null;
    }
  }
}
