import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPropertyById } from '@/lib/property';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '오피스텔 실거래가';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = /^\d+$/.test(id) ? await getPropertyById(BigInt(id)).catch(() => null) : null;
  const title = property?.name ?? '오피스텔 실거래가';
  const subtitle = property?.region.fullName ?? '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
