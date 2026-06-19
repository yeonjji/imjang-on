import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '임장ON — 공공데이터 부동산 실거래가';

export default async function Image() {
  return new ImageResponse(
    <OgFrame title="임장ON" subtitle="공공데이터로 보는 전국 부동산 실거래가" />,
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
