import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPropertyById } from '@/lib/property';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '아파트 실거래가';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = /^\d+$/.test(id) ? await getPropertyById(BigInt(id)).catch(() => null) : null;
  const title = property?.name ?? '아파트 실거래가';
  const subtitle = property?.region.fullName ?? '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
