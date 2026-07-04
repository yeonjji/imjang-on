import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { isBoardPublic } from '@/lib/board/visibility';

export default function robots(): MetadataRoute.Robots {
  // '/api/staticmap'는 JSON-LD 대표 이미지/썸네일로 쓰여 검색 수집이 필요하므로 /api/ 차단에서 예외.
  const allow = ['/', '/apt/', '/officetel/', '/villa/', '/api/staticmap', ...(isBoardPublic() ? ['/board/'] : [])];
  return {
    rules: [
      {
        userAgent: '*',
        allow,
        disallow: ['/list', '/api/', '/admin'],
      },
      {
        userAgent: 'Yeti',
        allow,
        disallow: ['/list', '/api/', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
