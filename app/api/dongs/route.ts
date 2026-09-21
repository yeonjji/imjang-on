import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readDongOptions } from '@/lib/dong-options';

export async function GET(request: NextRequest) {
  const sigunguCode = request.nextUrl.searchParams.get('sigunguCode');
  if (!sigunguCode) return NextResponse.json([]);
  return NextResponse.json(await readDongOptions(sigunguCode));
}
