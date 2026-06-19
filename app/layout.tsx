import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { GoogleAnalytics } from '@next/third-parties/google';
import { SITE_URL } from '@/lib/site';
import { JsonLd, organizationSchema, webSiteSchema } from '@/lib/seo/json-ld';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '임장ON — 공공데이터 부동산 실거래가',
    template: '%s | 임장ON',
  },
  description: '공공데이터로 보는 전국 아파트·오피스텔·연립다세대 실거래가 통합 정보',
  alternates: { canonical: '/' },
  openGraph: {
    locale: 'ko_KR',
    type: 'website',
    siteName: '임장ON',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: { index: true, follow: true },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? { 'naver-site-verification': process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION }
      : {},
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* AdSense 인증·광고: 크롤러가 head에서 실제 <script>를 찾을 수 있도록
            next/script(preload만 남김) 대신 원본 태그를 그대로 둔다. */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7716793757405086"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <JsonLd data={[organizationSchema(), webSiteSchema()]} />
        {children}
        <Analytics />
        <SpeedInsights />
        {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      </body>
    </html>
  );
}
