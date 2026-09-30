import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GONE_SUBSCRIPTION_IDS } from '@/lib/subscription/gone-ids';

// ⚠️임시(2026-09-30): 상세·og 요청을 몰아오는 크롤러의 정체를 잡기 위한 UA 로그.
// CF 무료 플랜 대시보드엔 User-Agent 집계가 없다. 원인을 확인하면 이 블록과 matcher 항목을 지운다.
const UA_PROBE = /^\/(apt|villa|officetel|medical|amenity|childcare|urban|school)\//;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (UA_PROBE.test(pathname)) {
    console.log(
      JSON.stringify({
        msg: 'ua-probe',
        path: pathname,
        // Next가 미들웨어 전에 _rsc 쿼리를 떼므로 헤더로 판정한다.
        rsc: req.headers.get('rsc') === '1',
        prefetch: req.headers.get('next-router-prefetch') === '1',
        ua: req.headers.get('user-agent'),
        ip: req.headers.get('cf-connecting-ip'),
        country: req.headers.get('cf-ipcountry'),
      }),
    );
    return NextResponse.next();
  }

  // 좌표 없는 청약 공고는 410. 페이지(Next 15)는 임의 상태 코드를 낼 수 없어 여기서 처리한다.
  // \d+만 받는다 — 페이지도 /^\d+$/가 아니면 notFound()한다.
  const goneMatch = /^\/subscription\/(\d+)$/.exec(pathname);
  if (goneMatch) {
    // "0123" 같은 앞자리 0은 정규식은 통과하지만 Set의 키(String(BigInt))와 형태가 달라 그냥
    // 비교하면 새고, 페이지는 BigInt(id)로 파싱해 "0123"과 "123"을 같은 공고로 200 렌더한다.
    // 미들웨어도 같은 정규화를 거쳐야 페이지와 판정이 일치한다.
    const normalizedId = String(BigInt(goneMatch[1]));
    if (GONE_SUBSCRIPTION_IDS.has(normalizedId)) {
      return new NextResponse('Gone', { status: 410 });
    }
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

export const config = {
  matcher: [
    '/admin/:path*',
    '/subscription/:id',
    // ⚠️임시 UA 로그(위 UA_PROBE) — 제거 시 함께 지운다.
    '/apt/:path+',
    '/villa/:path+',
    '/officetel/:path+',
    '/medical/:path+',
    '/amenity/:path+',
    '/childcare/:path+',
    '/urban/:path+',
    '/school/:path+',
  ],
};
