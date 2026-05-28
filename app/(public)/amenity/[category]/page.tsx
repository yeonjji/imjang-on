import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllSigungus } from '@/lib/region';
import { getCategoryDef, AMENITY_SLUGS } from '@/lib/amenity/category';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ category: string }>; }

export async function generateStaticParams() {
  return AMENITY_SLUGS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) return {};
  return {
    title: `${def.label} 찾기 — 전국`,
    description: `${def.label} 위치와 주변 아파트 실거래가까지 한 화면에서 확인하세요.`,
    alternates: { canonical: `/amenity/${def.slug}` },
  };
}

export default async function AmenityHubPage({ params }: Params) {
  const { category } = await params;
  const def = getCategoryDef(category);
  if (!def) notFound();

  const [sigungus, counts] = await Promise.all([
    getAllSigungus().catch(() => []),
    def.getCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  // 인기 시군구 8개 (카운트 내림차순)
  const top = sigungus
    .filter((s) => !!s.sigunguCode)
    .map((s) => ({ ...s, sigunguCode: s.sigunguCode!, count: counts.get(s.sigunguCode!) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{def.breadcrumbLabel}</span>
      </nav>

      <div className="mb-8 rounded-[26px] border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-soft)]">
        <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의 · {def.breadcrumbLabel}</p>
        <h1 className="text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">{def.emoji} {def.label} 찾기</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">시·군·구를 선택하면 해당 지역의 {def.label} 목록과 위치, 주변 아파트 실거래가까지 확인할 수 있어요.</p>
        <Link
          href={`/amenity/${def.slug}/regions`}
          className="mt-4 inline-flex items-center gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-4 py-2 text-sm font-semibold text-[var(--color-blue)] transition hover:border-[var(--color-sky)]"
        >
          📍 지역별 {def.label} 찾기 →
        </Link>
      </div>

      {top.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">인기 지역</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {top.map((sg) => (
              <Link key={sg.sigunguCode} href={`/amenity/${def.slug}/${sg.sigunguCode}`}
                className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm transition hover:border-[var(--color-sky)]">
                <span className="font-semibold text-[var(--color-blue-dark)]">{sg.sido} {sg.sigungu}</span>
                <span className="ml-1 text-xs text-[var(--color-muted)]">{sg.count.toLocaleString('ko-KR')}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[22px] border border-dashed border-[#93c5fd] bg-white/65 p-7 text-center text-sm text-[var(--color-muted)]">
        시도를 직접 고르고 싶다면{' '}
        <Link href={`/amenity/${def.slug}/regions`} className="font-semibold text-[var(--color-blue)]">지역별 {def.label} 찾기</Link>로 이동하세요.
      </div>
    </section>
  );
}
