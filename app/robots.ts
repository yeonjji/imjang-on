import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { isBoardPublic } from '@/lib/board/visibility';

export default function robots(): MetadataRoute.Robots {
  const allow = ['/', '/apt/', '/officetel/', '/villa/', ...(isBoardPublic() ? ['/board/'] : [])];
  // '/*_rsc='는 Next.js RSC 프리페치 복제 URL(text/x-component). 색인 대상이 아닌데 실제 페이지마다
  // 별도 크롤돼 크롤 예산·서버 부하(cold ISR → DB)를 낭비하므로 차단. '?_rsc='·'&_rsc=' 모두 매칭.
  // '/list'는 disallow하지 않는다 — 페이지가 자체 noindex(meta)를 가지므로, disallow하면 크롤러가
  // 그 noindex를 읽지 못해 오히려 URL-only로 색인될 수 있고 홈 JSON-LD SearchAction(/list?q=) 타깃도
  // 막힌다. 필터는 client-side router.push라 facet 크롤 폭증도 없다(색인은 noindex가 막는다).
  const disallow = ['/api/', '/admin', '/*_rsc='];
  // 검색·광고 색인과 무관한 SEO 스크래퍼/AI 크롤러는 전면 차단 — 서버리스 비용만 유발하고
  // 색인 이득이 없다. Google·Mediapartners-Google(AdSense)·Bingbot·Yeti·Daum은 별도 그룹이 없어
  // 위 기본(*) 규칙으로 콘텐츠 크롤이 허용 유지된다.
  const blockedBots = [
    'AhrefsBot',
    'SemrushBot',
    'MJ12bot',
    'DotBot',
    'GPTBot',
    'ClaudeBot',
    'CCBot',
    'Bytespider',
    'PetalBot',
  ];
  return {
    rules: [
      { userAgent: '*', allow, disallow },
      { userAgent: 'Yeti', allow, disallow },
      { userAgent: blockedBots, disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
