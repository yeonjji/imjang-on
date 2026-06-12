import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPharmacyById } from '@/lib/pharmacy';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '약국 정보·주변 아파트';

export default async function Image({
  params,
}: {
  params: Promise<{ sigunguCode: string; id: string }>;
}) {
  const { id } = await params;
  const pharmacy = /^\d+$/.test(id) ? await getPharmacyById(BigInt(id)).catch(() => null) : null;
  const title = pharmacy?.name ?? '약국 정보';
  const subtitle = pharmacy ? '약국 · 주변 아파트 실거래가' : '주변 아파트 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
