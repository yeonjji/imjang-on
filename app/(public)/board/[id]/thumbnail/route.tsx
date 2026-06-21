import { ImageResponse } from 'next/og';
import { OG_SIZE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getPublishedPostById } from '@/lib/board/post';
import { categoryLabel } from '@/lib/board/labels';

export const runtime = 'nodejs';
export const revalidate = 86_400;

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
