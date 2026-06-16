import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { isBoardPublic } from '@/lib/board/visibility';

export default function robots(): MetadataRoute.Robots {
  const allow = ['/', '/apt/', '/officetel/', '/villa/', '/region/', ...(isBoardPublic() ? ['/board/'] : [])];
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
