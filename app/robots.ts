import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { isBoardPublic } from '@/lib/board/visibility';

export default function robots(): MetadataRoute.Robots {
  // '/api/staticmap'는 JSON-LD 대표 이미지/썸네일로 쓰여 검색 수집이 필요하므로 /api/ 차단에서 예외.
  const allow = ['/', '/apt/', '/officetel/', '/villa/', '/api/staticmap', ...(isBoardPublic() ? ['/board/'] : [])];
  // '/*_rsc='는 Next.js RSC 프리페치 복제 URL(text/x-component). 색인 대상이 아닌데 실제 페이지마다
  // 별도 크롤돼 크롤 예산·서버 부하(cold ISR → DB)를 낭비하므로 차단. '?_rsc='·'&_rsc=' 모두 매칭.
  const disallow = ['/list', '/api/', '/admin', '/*_rsc='];
  return {
    rules: [
      { userAgent: '*', allow, disallow },
      { userAgent: 'Yeti', allow, disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
