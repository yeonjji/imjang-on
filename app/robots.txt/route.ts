import { buildRobotsTxt } from '@/lib/seo/robots';

// MetadataRoute.Robots(app/robots.ts) 대신 라우트 핸들러인 이유는 lib/seo/robots.ts 주석 참고.
// 기존 metadata 라우트가 내보내던 Cache-Control(public, max-age=14400)을 유지한다.
export const revalidate = 14_400;

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
