import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GONE_SUBSCRIPTION_IDS } from '@/lib/subscription/gone-ids';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 좌표 없는 청약 공고는 410. 페이지(Next 15)는 임의 상태 코드를 낼 수 없어 여기서 처리한다.
  // \d+만 받는다 — 페이지도 /^\d+$/가 아니면 notFound()한다.
  const goneMatch = /^\/subscription\/(\d+)$/.exec(pathname);
  if (goneMatch && GONE_SUBSCRIPTION_IDS.has(goneMatch[1])) {
    return new NextResponse('Gone', { status: 410 });
  }

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return new NextResponse('Admin disabled', { status: 503 });

  const header = req.headers.get('authorization');
  if (header) {
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      if (decoded === `${user}:${pass}`) return NextResponse.next();
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="admin"' },
  });
}

export const config = { matcher: ['/admin/:path*', '/subscription/:id'] };
