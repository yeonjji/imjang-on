import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts, OgFrame } from '@/lib/seo/og';
import { getHospitalById } from '@/lib/hospital';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = '병원·의원 정보·주변 아파트';

export default async function Image({
  params,
}: {
  params: Promise<{ sigunguCode: string; id: string }>;
}) {
  const { id } = await params;
  const hospital = /^\d+$/.test(id) ? await getHospitalById(BigInt(id)).catch(() => null) : null;
  const title = hospital?.name ?? '병원·의원 정보';
  const subtitle = hospital ? `${hospital.typeName} · 주변 아파트 실거래가` : '주변 아파트 실거래가';
  return new ImageResponse(<OgFrame title={title} subtitle={subtitle} />, {
    ...OG_SIZE,
    fonts: await loadOgFonts(),
  });
}
