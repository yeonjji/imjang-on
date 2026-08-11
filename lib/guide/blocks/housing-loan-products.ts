import { prisma } from '@/lib/db';

export interface HousingLoanRow {
  instCtg: string;
  products: number;
  avgLimitManwon: number | null;
  maxLimitManwon: number | null;
}
export interface HousingLoanProductsResult {
  rows: HousingLoanRow[];
  total: number;
  asOf: Date | null;
}

/**
 * 자금 용도에 '주거'가 붙은 정책·공공 대출상품을 제공기관 구분별로 집계. 실측 44개, 3ms.
 * 보금자리론·디딤돌대출·버팀목·신혼희망타운 전용 대출 등이 들어 있다.
 *
 * 한도는 상품 상한이고 실제 한도는 심사로 정해진다 — 호출부가 그렇게 표기한다.
 */
export async function getHousingLoanProducts(): Promise<HousingLoanProductsResult> {
  const rows = await prisma.$queryRaw<
    Array<{ inst_ctg: string | null; n: bigint; avg_limit: number | null; max_limit: number | null; as_of: Date | null }>
  >`
    SELECT "instCtg" AS inst_ctg,
           COUNT(*) AS n,
           ROUND(AVG(lnlmt))::int AS avg_limit,
           MAX(lnlmt) AS max_limit,
           MAX("updatedAt") AS as_of
    FROM "LoanProduct"
    WHERE '주거' = ANY("usageTags")
    GROUP BY "instCtg"
    ORDER BY COUNT(*) DESC
  `;
  return {
    rows: rows.map((r) => ({
      instCtg: r.inst_ctg ?? '기타',
      products: Number(r.n),
      avgLimitManwon: r.avg_limit,
      maxLimitManwon: r.max_limit,
    })),
    total: rows.reduce((s, r) => s + Number(r.n), 0),
    asOf: rows.reduce<Date | null>((a, r) => (r.as_of && (!a || r.as_of > a) ? r.as_of : a), null),
  };
}
