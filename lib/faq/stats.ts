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
  parkings: number;
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
  const [mc] = await prisma.$queryRaw<{ c: bigint }[]>`SELECT count(DISTINCT "kaptCode") AS c FROM "AptMaintenanceCost"`;
  const [sub] = await prisma.$queryRaw<{ total: bigint; remnant: bigint; arbitrary: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE category = 'REMNANT') AS remnant,
           count(*) FILTER (WHERE category = 'ARBITRARY') AS arbitrary
    FROM "SubscriptionNotice"`;
  // 목록 기본값과 같게 운영중지(휴지)는 뺀다.
  const [cc] = await prisma.$queryRaw<{ total: bigint; pub: bigint }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE "crType" = '국공립') AS pub
    FROM "Childcare" WHERE status IS DISTINCT FROM '휴지'`;
  const [results, loans, jeonse, hospitals, pharmacies, schools, parks, parkings, ev] = await Promise.all([
    prisma.subscriptionResult.count({ where: { status: 'ok' } }),
    prisma.loanProduct.count(),
    prisma.jeonseGuaranteeProduct.count(),
    prisma.hospital.count(),
    prisma.pharmacy.count(),
    prisma.school.count(),
    prisma.park.count(),
    prisma.parking.count(),
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
    parkings,
    evStations: ev,
    asOf: kstDate(new Date()),
  };
}

/** 하루 캐시. 캐시 래퍼가 없는 환경(테스트·스크립트)이나 래퍼 오류면 직접 조회, 그것도 실패하면 null(숫자 없는 문장). */
export async function getFaqStats(): Promise<FaqStats | null> {
  try {
    return await unstable_cache(queryFaqStats, ['faq-stats-v1'], { revalidate: 86_400 })();
  } catch {
    try {
      return await queryFaqStats();
    } catch {
      return null;
    }
  }
}
