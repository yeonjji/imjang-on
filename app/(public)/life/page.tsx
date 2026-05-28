import { LIFE_GROUPS } from '../_components/life-menu';
import { LifeItemCard } from './_components/life-item-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '생활편의 — 학교·병원·상권·도시인프라',
  description: '아파트 주변 학교, 병원·약국, 편의점·마트·카페·전통시장, 공원·충전소 등 생활편의 정보를 한곳에서.',
  alternates: { canonical: '/life' },
};

export const revalidate = 86_400;

const ITEM_EMOJI: Record<string, string> = {
  '학교': '🏫', '어린이집': '👶',
  '병원·의원': '🏥', '약국': '💊', '보건소': '🩺',
  '편의점': '🏪', '마트': '🛒', '카페': '☕', '전통시장': '🏬',
  '공원': '🌳', '충전소': '⚡', '주차장': '🅿️',
};

export default function LifeHubPage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        우리 동네 생활편의
      </h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        교육·의료·상권·도시인프라를 한 화면에서. 카테고리를 누르면 해당 목록으로 이동합니다.
      </p>

      <div className="flex flex-col gap-12">
        {LIFE_GROUPS.map((group) => (
          <section key={group.slug} id={group.slug} className="scroll-mt-20">
            <h2 className="mb-3 text-xl font-bold text-[var(--color-blue-dark)]">{group.label}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {group.items.map((item) => (
                <LifeItemCard key={item.label} item={item} emoji={ITEM_EMOJI[item.label] ?? '📍'} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
