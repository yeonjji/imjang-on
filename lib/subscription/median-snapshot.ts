import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const SIGUNGU_MEDIAN_KEY = 'subscription_sigungu_median';

export interface SigunguMedian {
  median: number;
  /** sigunguCode 1개가 아니라 Region의 (sido, sigungu) 그룹 전체의 거래 건수 — computeSigunguMedians 주석 참고. */
  count: number;
}

/** 표본이 이보다 적은 시군구는 스냅샷에 넣지 않는다. */
export const MIN_SAMPLE = 30;

/**
 * 시군구별 최근 12개월 아파트 매매 중위 거래가(만원)와 건수. 실측 대상 249곳.
 *
 * sigunguCode가 아니라 Region의 (sido, sigungu) 그룹 단위로 집계한다 — 수원·성남·고양 등
 * 일반구가 있는 시는 Region.sigungu 컬럼에 구 이름이 아니라 시 이름만 들어 있고, 그 시 이름
 * 아래 구별 sigunguCode가 여러 개 걸려 있다(resolveSigunguFromAddress는 "시도+시" 접두사까지만
 * 보고 매칭되는 코드 중 하나를 돌려주는데, 주소만으로는 그게 어느 구인지 알 수 없다). 그 코드가
 * Transaction.sigunguCode(구 단위)와 다르면 상세 페이지의 스냅샷 조회가 그대로 빗나간다.
 * 그래서 그룹 전체를 하나의 중위값으로 계산하고, 그 값을 그룹에 속한 모든 sigunguCode에 똑같이
 * 채워 넣는다 — 주소 해석이 시 코드를 돌려주든 구 코드를 돌려주든 스냅샷을 찾을 수 있게. 이건
 * 우리가 편의상 고른 근사가 아니라, 주소가 애초에 시 단위까지만 해석되는 한계에서 나오는
 * 정직한 해상도다.
 */
export async function computeSigunguMedians(): Promise<Record<string, SigunguMedian>> {
  const rows = await prisma.$queryRaw<Array<{ sgg: string; med: number; n: bigint }>>`
    WITH region_map AS (
      -- resolveSigunguFromAddress가 참조하는 것과 같은 카탈로그(lib/region.ts:getAllSigungus의
      -- level=2·isAbolished=false·sigunguCode not null 조건)를 (sido, sigungu, sigunguCode)
      -- 조합으로 좁힌다. 세종처럼 한 sigunguCode를 여러 읍면동 이름이 공유하는 경우가 섞여도,
      -- 최종 SELECT가 sigunguCode로 다시 접으므로 결과에는 영향이 없다.
      SELECT DISTINCT sido, sigungu, "sigunguCode"
      FROM "Region"
      WHERE level = 2 AND "isAbolished" = false AND "sigunguCode" IS NOT NULL
    ),
    group_medians AS (
      SELECT rm.sido, rm.sigungu,
             ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY t."dealAmount"))::int AS med,
             COUNT(*) AS n
      FROM "Transaction" t
      JOIN region_map rm ON rm."sigunguCode" = t."sigunguCode"
      WHERE t."propertyType" = 'APARTMENT' AND t."dealType" = 'SALE'
        AND t."contractDate" >= (CURRENT_DATE - INTERVAL '12 months')
        -- dealAmount=0은 결측이 아니라 degenerate 값이라 IS NOT NULL만으로는 안 걸러진다.
        -- lib/briefing.ts:176-181이 최저가 조회에 dealAmount: { gt: 0 }을 쓰는 이유와 같다 —
        -- 0원 거래가 섞이면 percentile_cont가 아래로 끌려 시군구 중위가가 왜곡된다.
        AND t."dealAmount" > 0 AND t."cancelDate" IS NULL
      GROUP BY rm.sido, rm.sigungu
      HAVING COUNT(*) >= ${MIN_SAMPLE}
    )
    -- 그룹 중위값을 그룹에 속한 모든 sigunguCode로 다시 펼친다.
    SELECT rm."sigunguCode" AS sgg, gm.med, gm.n
    FROM group_medians gm
    JOIN region_map rm ON rm.sido = gm.sido AND rm.sigungu = gm.sigungu
  `;
  const out: Record<string, SigunguMedian> = {};
  for (const r of rows) out[r.sgg] = { median: r.med, count: Number(r.n) };
  return out;
}

/**
 * 계산 결과를 스냅샷에 쓰고 반영된 시군구 개수를 돌려준다.
 * 빈 결과는 상류 일시 장애(집계 쿼리 실패 직전 상태 등)일 수 있어, 그걸 그대로 upsert하면
 * 정상 스냅샷(249곳)을 빈 값으로 덮어써 5,900여 공개 페이지가 한꺼번에 비교 줄을 잃는다.
 * 그래서 빈 결과는 쓰지 않고 기존 스냅샷을 그대로 둔 채 개수만 돌려준다 — 호출부가 실패로 취급한다.
 */
export async function writeSigunguMedianSnapshot(): Promise<number> {
  const medians = await computeSigunguMedians();
  const count = Object.keys(medians).length;
  if (count === 0) return 0;
  const payload = medians as unknown as Prisma.InputJsonValue;
  await prisma.dashboardSnapshot.upsert({
    where: { key: SIGUNGU_MEDIAN_KEY },
    create: { key: SIGUNGU_MEDIAN_KEY, payload },
    update: { payload },
  });
  return count;
}

/** 상세 페이지에서 호출. 없으면 null → 비교 줄을 렌더하지 않는다. */
export async function readSigunguMedianSnapshot(): Promise<Record<string, SigunguMedian> | null> {
  const row = await prisma.dashboardSnapshot.findUnique({ where: { key: SIGUNGU_MEDIAN_KEY } });
  return (row?.payload as unknown as Record<string, SigunguMedian>) ?? null;
}
