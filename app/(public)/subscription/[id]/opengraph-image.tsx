import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getSubscriptionById } from '@/lib/subscription';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '청약 공고';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const notice = /^\d+$/.test(id) ? await getSubscriptionById(BigInt(id)).catch(() => null) : null;
  const title = notice?.name ?? '청약 공고';
  const subtitle = notice?.regionName ?? '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
