import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://imjang-on.com'),
  title: {
    default: '임장온 — 공공데이터 부동산 실거래가',
    template: '%s | 임장온',
  },
  description: '공공데이터로 보는 전국 아파트·오피스텔·연립다세대 실거래가 통합 정보',
  alternates: { canonical: '/' },
  openGraph: {
    locale: 'ko_KR',
    type: 'website',
    siteName: '임장온',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
