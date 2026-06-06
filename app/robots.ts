import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com';

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
    sitemap: `${SITE}/sitemap.xml`,
  };
}
