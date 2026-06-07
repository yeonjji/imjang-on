import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'],
        disallow: ['/list', '/api/', '/admin'],
      },
      {
        userAgent: 'Yeti',
        allow: ['/', '/apt/', '/officetel/', '/villa/', '/region/'],
        disallow: ['/list', '/api/', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
