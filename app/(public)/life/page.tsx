import { CategoryCard } from './_components/category-card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '생활편의 — 학교·의료·상권·도시인프라',
  description: '아파트 주변 학교, 공원, 마트·편의, 병원·약국, 충전소 등 생활편의 정보를 한곳에서.',
  alternates: { canonical: '/life' },
};

export const revalidate = 86_400;

const CATEGORIES = [
  { emoji: '🏫', title: '학교찾기', desc: '초·중·고·특수학교', href: '/school' },
  { emoji: '🏥', title: '병원·약국', desc: '준비 중입니다' },
  { emoji: '🛒', title: '마트·편의', desc: '편의점·마트·카페·전통시장' },
  { emoji: '🌳', title: '공원', desc: '근린·체육공원' },
  { emoji: '⚡', title: '충전소', desc: '전기차 충전소 (주차장 예정)' },
];

export default function LifeHubPage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <p className="mb-1 text-xs font-bold text-[var(--color-blue)]">생활편의</p>
      <h1 className="mb-3 text-3xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        우리 동네 생활편의
      </h1>
      <p className="mb-10 text-sm text-[var(--color-muted)]">
        학교부터 시작해 공원·마트·충전소까지 단계적으로 추가합니다.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {CATEGORIES.map((c) => (
          <CategoryCard key={c.title} {...c} />
        ))}
      </div>
    </section>
  );
}
