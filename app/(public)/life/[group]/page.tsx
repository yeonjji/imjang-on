import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LIFE_GROUPS, LIFE_ITEM_EMOJI } from '../../_components/life-menu';
import { LifeItemCard } from '../_components/life-item-card';
import type { Metadata } from 'next';
import { BoardBriefingSection } from '../../_components/board-briefing-section';
import { RelatedGuides } from '../../_components/related-guides';

export const revalidate = 86_400;

interface Params { params: Promise<{ group: string }>; }

export async function generateStaticParams() {
  return LIFE_GROUPS.map((g) => ({ group: g.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { group } = await params;
  const g = LIFE_GROUPS.find((x) => x.slug === group);
  if (!g) return {};
  return {
    title: `${g.label} — 우리 동네 생활편의`,
    description: g.intro,
    alternates: { canonical: `/life/${g.slug}` },
  };
}

export default async function LifeGroupHubPage({ params }: Params) {
  const { group } = await params;
  const g = LIFE_GROUPS.find((x) => x.slug === group);
  if (!g) return notFound();

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav aria-label="이동 경로" className="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span aria-hidden>›</span>
        <Link href="/life">생활편의</Link><span aria-hidden>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{g.label}</span>
      </nav>
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">{g.label}</h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">{g.intro}</p>

      <div data-testid="life-group-cards" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {g.items.map((item) => (
          <LifeItemCard key={item.label} item={item} emoji={LIFE_ITEM_EMOJI[item.label] ?? '📍'} />
        ))}
      </div>
      <BoardBriefingSection className="mt-16" />
      <RelatedGuides pageKey="life" className="mt-16" />
    </section>
  );
}
