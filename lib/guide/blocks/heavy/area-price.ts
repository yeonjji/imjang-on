import { prisma } from '@/lib/db';
import { lastContractDate } from './shared';

export interface AreaPriceRow {
  band: string;
  n: number;
  manwonPerPyeong: number;
}
export interface AreaPriceResult {
  rows: AreaPriceRow[];
  asOf: string | null;
}

/**
 * 최근 12개월 아파트 매매의 전용면적 구간별 평당 거래가.
 * 구간은 `lib/briefing.ts`의 AREA_BANDS와 같은 경계를 쓴다(60/85/102/135㎡).
 * 실측 8.9초 — 렌더 경로가 아니라 ETL에서만 부른다.
 */
export async function computeAreaPrice(): Promise<AreaPriceResult> {
  const rows = await prisma.$queryRaw<Array<{ band: string; n: bigint; ppp: number }>>`
    SELECT CASE WHEN "exclusiveArea" < 60 THEN '전용 60㎡ 미만'
                WHEN "exclusiveArea" < 85 THEN '전용 60~85㎡'
                WHEN "exclusiveArea" < 102 THEN '전용 85~102㎡'
                WHEN "exclusiveArea" < 135 THEN '전용 102~135㎡'
                ELSE '전용 135㎡ 초과' END AS band,
           COUNT(*) AS n,
           ROUND(AVG("dealAmount"::numeric / "exclusiveArea") * 3.3057851239669422)::int AS ppp
    FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE'
      AND "contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
      AND "dealAmount" IS NOT NULL AND "cancelDate" IS NULL AND "exclusiveArea" > 0
    GROUP BY 1
    ORDER BY MIN("exclusiveArea")
  `;
  return {
    rows: rows.map((r) => ({ band: r.band, n: Number(r.n), manwonPerPyeong: r.ppp })),
    asOf: await lastContractDate(),
  };
}
