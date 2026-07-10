import { ImageResponse } from 'next/og';
import { OG_SIZE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPublishedPostById } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';

export const runtime = 'nodejs';
// Route Handler는 기본 동적이라 revalidate만으론 캐시가 안 된다.
// force-static + generateStaticParams(빈 배열)로 id당 첫 요청에 렌더 후 ISR 캐시에 옵트인.
export const dynamic = 'force-static';
export const revalidate = 86_400;
export function generateStaticParams() {
  return [];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = /^\d+$/.test(id) ? await getPublishedPostById(BigInt(id)).catch(() => null) : null;
  const title = post?.title ?? '임장ON 소식';
  const subtitle = post ? categoryLabel(post.category) : '공공데이터 부동산';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
