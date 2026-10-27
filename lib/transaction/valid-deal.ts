// 유효 거래(통계 대상) 기준 — 단일 소스. 해제 신고된 거래는 평균·건수·최근가·그래프·비교·색인 판정에서 뺀다.
// 해제 판단: 해제 구분값 'O' 또는 해제일이 있음. 운영 데이터에 해제 구분값만 있고 해제일이 비어 있는
// 행(2,863건, 2026-10-27)이 있어 해제일만 보면 새어 들어간다. 내역 표는 해제 거래도 보여주고 '해제' 배지를 단다.
// 설계: docs/superpowers/specs/2026-10-27-property-aggregate-integrity-design.md §5
import { Prisma } from '@prisma/client';

export const CANCELLED_TYPE = 'O';

/** Prisma where 조건. 다른 조건과 합칠 때는 withValidDeal()을 쓴다(OR 키 충돌 방지). */
export const VALID_DEAL_WHERE: Prisma.TransactionWhereInput = {
  cancelDate: null,
  OR: [{ cancelType: null }, { cancelType: { not: CANCELLED_TYPE } }],
};

export function withValidDeal(where: Prisma.TransactionWhereInput): Prisma.TransactionWhereInput {
  return { AND: [where, VALID_DEAL_WHERE] };
}

/**
 * raw SQL 조건 조각. alias는 코드 상수만 넘긴다(사용자 입력 금지).
 * 예: WHERE "propertyId" = ${id} AND ${validDealSql()} / JOIN … t WHERE ${validDealSql('t')}
 */
export function validDealSql(alias?: 't'): Prisma.Sql {
  const p = alias ? `${alias}.` : '';
  return Prisma.raw(`(${p}"cancelType" IS DISTINCT FROM '${CANCELLED_TYPE}' AND ${p}"cancelDate" IS NULL)`);
}

/** 해제 거래 조건(유효 거래의 반대). 해제 건수 표시용. */
export function cancelledDealSql(alias?: 't'): Prisma.Sql {
  const p = alias ? `${alias}.` : '';
  return Prisma.raw(`(${p}"cancelType" = '${CANCELLED_TYPE}' OR ${p}"cancelDate" IS NOT NULL)`);
}

export function isCancelledDeal(t: { cancelType: string | null; cancelDate: Date | string | null }): boolean {
  return t.cancelType === CANCELLED_TYPE || t.cancelDate != null;
}
