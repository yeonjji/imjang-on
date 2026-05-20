import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSigungusBySido } from '@/lib/region';

export async function GET(request: NextRequest) {
  const sido = request.nextUrl.searchParams.get('sido');
  if (!sido) return NextResponse.json([]);
  const list = await getSigungusBySido(sido);
  return NextResponse.json(list);
}
