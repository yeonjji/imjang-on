import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { DealType, PropertyType } from '@prisma/client';
import { getDongTransactions } from '@/lib/transaction/dong';

const DEAL_TYPES = new Set<string>(['SALE', 'JEONSE', 'WOLSE']);
const PROPERTY_TYPES = new Set<string>(['APARTMENT', 'OFFICETEL', 'MULTIPLEX', 'ROW_HOUSE']);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const sigunguCode = p.get('sigunguCode');
  const umd = p.get('umd');
  if (!sigunguCode || !umd) return NextResponse.json([]);

  const dealRaw = p.get('dealType');
  const typeRaw = p.get('propertyType');

  return NextResponse.json(
    await getDongTransactions({
      sigunguCode,
      umd,
      dealType: dealRaw && DEAL_TYPES.has(dealRaw) ? (dealRaw as DealType) : undefined,
      propertyType: typeRaw && PROPERTY_TYPES.has(typeRaw) ? (typeRaw as PropertyType) : undefined,
      limit: 8,
    }),
  );
}
