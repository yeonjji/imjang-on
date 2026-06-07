import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getSigunguByCode } from '@/lib/region';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '지역 부동산 실거래가';

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const region = await getSigunguByCode(code).catch(() => null);
  const title = region ? `${region.fullName} 부동산` : '지역 부동산 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle="아파트 실거래가" />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
