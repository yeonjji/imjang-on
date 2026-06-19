import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '임장ON',
    short_name: '임장ON',
    description: '공공데이터 부동산 실거래가',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7fbff',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
