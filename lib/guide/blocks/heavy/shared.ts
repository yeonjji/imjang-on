import { prisma } from '@/lib/db';

/**
 * 무거운 블록의 데이터 기준일 = 집계에 쓰인 **최신 계약일**.
 * 레코드의 `updatedAt`이 아니다 — 실거래는 계약일이 기준이고, 신고 지연 때문에
 * 적재 시각과 계약일이 몇 주씩 벌어진다.
 */
export async function lastContractDate(): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ d: Date | null }>>`
    SELECT MAX("contractDate") AS d FROM "Transaction"
    WHERE "propertyType" = 'APARTMENT' AND "dealType" = 'SALE' AND "cancelDate" IS NULL
  `;
  const d = rows[0]?.d;
  return d ? d.toISOString().slice(0, 10) : null;
}

/** 소수 자릿수를 맞춘 숫자. percentile_cont는 float를 돌려주므로 표시 전에 자른다. */
export function round(v: number | null | undefined, digits: number): number {
  return Number((v ?? 0).toFixed(digits));
}
