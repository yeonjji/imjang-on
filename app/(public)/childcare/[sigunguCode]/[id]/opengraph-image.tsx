import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getChildcareById } from '@/lib/childcare';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '어린이집 정보·주변 아파트';

export default async function Image({
  params,
}: {
  params: Promise<{ sigunguCode: string; id: string }>;
}) {
  const { id } = await params;
  const item = await getChildcareById(BigInt(id)).catch(() => null);
  const title = item?.name ?? '어린이집 정보';
  const subtitle = item ? `${item.crType ?? '어린이집'} · 정원 ${item.capacity ?? '-'}` : '주변 아파트 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
