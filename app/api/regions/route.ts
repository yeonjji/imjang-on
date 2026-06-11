import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSigungusBySido } from '@/lib/region';

export async function GET(request: NextRequest) {
  const sido = request.nextUrl.searchParams.get('sido');
  if (!sido) return NextResponse.json([]);
  // gu=1: 일반구 통합시를 구 단위로(실거래가·상가 등 구 코드 적재 데이터셋). 미지정 시 기존 시 단위.
  const gu = request.nextUrl.searchParams.get('gu') === '1';
  const list = await getSigungusBySido(sido, { gu });
  return NextResponse.json(list);
}
