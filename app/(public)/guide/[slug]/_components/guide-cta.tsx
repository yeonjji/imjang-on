import Link from 'next/link';
import type { GuideCategory } from '@prisma/client';
import { LIFE_GROUPS, LIFE_ITEM_EMOJI, type LifeSubItem } from '@/app/(public)/_components/life-menu';
import { LifeGroupCards } from '@/app/(public)/_components/life-group-cards';
import { BoardDetailCta } from '@/app/(public)/board/[id]/_components/board-detail-cta';

function pick(slug: (typeof LIFE_GROUPS)[number]['slug']) {
  return LIFE_GROUPS.find((g) => g.slug === slug)!;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-black tracking-tight md:text-[22px]">{title}</h2>
      <p className="mt-1 text-[13px] text-[var(--color-muted)]">{subtitle}</p>
      {children}
    </section>
  );
}

/** 좌표 앵커가 없어 각 시설의 전국 목록으로 보내는 카드(이모지 + 라벨). */
function ItemCards({ items }: { items: LifeSubItem[] }) {
  return (
    <div className="mt-[18px] grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center justify-between gap-2 rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
        >
          <span className="flex items-center gap-2.5 text-[15px] font-black tracking-tight text-[var(--color-blue-dark)]">
            <span aria-hidden className="text-lg">
              {LIFE_ITEM_EMOJI[item.label]}
            </span>
            {item.label}
          </span>
          <span aria-hidden className="shrink-0 text-[var(--color-blue)]">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * 가이드 상세 하단 CTA. 글의 카테고리에 맞는 시설/데이터로 안내한다.
 * - 의료: 병원·약국 / 학교·보육: 학교·어린이집 / 생활: 생활편의 4종
 * - 부동산·청약·금융: 실거래가·청약·금융 데이터 CTA(BoardDetailCta)가 곧 주제 CTA
 */
export function GuideCta({ category }: { category: GuideCategory }) {
  switch (category) {
    case 'MEDICAL': {
      const g = pick('medical');
      return (
        <Section title="우리 동네 의료 인프라" subtitle={g.intro}>
          <ItemCards items={g.items} />
        </Section>
      );
    }
    case 'SCHOOL':
    case 'CHILDCARE': {
      const g = pick('education');
      return (
        <Section title="교육·보육 시설 둘러보기" subtitle={g.intro}>
          <ItemCards items={g.items} />
        </Section>
      );
    }
    case 'LIFE':
      return (
        <Section title="생활편의 둘러보기" subtitle="교육·의료·상권·도시인프라를 한눈에">
          <div className="mt-[18px]">
            <LifeGroupCards />
          </div>
        </Section>
      );
    default:
      return <BoardDetailCta />;
  }
}
