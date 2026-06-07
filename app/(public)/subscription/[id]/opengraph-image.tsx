import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getSubscriptionById } from '@/lib/subscription';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '청약 공고';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = await getSubscriptionById(BigInt(id)).catch(() => null);
  const title = notice?.name ?? '청약 공고';
  const subtitle = notice?.regionName ?? '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
