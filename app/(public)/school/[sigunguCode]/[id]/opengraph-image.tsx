import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getSchoolById } from '@/lib/school';

export const runtime = 'nodejs';
export const revalidate = 86_400;
// generateStaticParams 없이는 revalidate가 무시되고 매 요청 satori 렌더된다. 빈 배열 → id당 첫 요청에 렌더 후 ISR 캐시.
export function generateStaticParams() {
  return [];
}
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '학교 정보·주변 아파트';

export default async function Image({
  params,
}: {
  params: Promise<{ sigunguCode: string; id: string }>;
}) {
  const { id } = await params;
  const school = /^\d+$/.test(id) ? await getSchoolById(BigInt(id)).catch(() => null) : null;
  const title = school?.name ?? '학교 정보';
  const subtitle = school ? `${school.schoolKind ?? '학교'} · 주변 아파트 실거래가` : '주변 아파트 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
