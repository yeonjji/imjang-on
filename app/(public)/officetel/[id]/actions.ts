'use server';
import { getTransactionsByType } from '@/lib/transaction';
import type { DealType } from '@prisma/client';

export async function fetchTxPage(propertyId: bigint, dealType: DealType, page: number) {
  const rows = await getTransactionsByType(propertyId, dealType, { page, perPage: 10 });
  return rows.map((t) => ({
    id: String(t.id),
    contractDate: t.contractDate.toISOString().slice(0, 10),
    exclusiveArea: Number(t.exclusiveArea),
    floor: t.floor,
    dealAmount: t.dealAmount,
    deposit: t.deposit,
    monthlyRent: t.monthlyRent,
  }));
}
