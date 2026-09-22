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
      // 홈 패널은 4건만 그리고 나머지는 「거래 내역 더보기」로 펼친다. 추가 요청을
      // 하지 않으므로 그 여분까지 한 번에 내려준다.
      limit: 12,
    }),
  );
}
