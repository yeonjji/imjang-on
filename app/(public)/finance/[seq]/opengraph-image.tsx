import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getLoanProduct } from '@/lib/loan/detail';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '주거금융 대출상품';

export default async function Image({ params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const product = await getLoanProduct(Number(seq)).catch(() => null);
  const title = product?.finprdnm ?? '주거금융 대출상품';
  const subtitle = product ? `${product.ofrinstnm ?? '주거금융'} · 대출상품` : '한도·금리·자격요건';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
