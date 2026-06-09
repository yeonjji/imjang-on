import Link from 'next/link';
import {
  GraduationCap, Stethoscope, ShoppingCart, TreePine,
  School, Baby, Hospital, Pill, Store, Coffee, Tent, SquareParking, Trees, Zap,
  MapPin, type LucideIcon,
} from 'lucide-react';
import { LIFE_GROUPS, type LifeGroupSlug } from './life-menu';

export const GROUP_ICONS: Record<LifeGroupSlug, LucideIcon> = {
  education: GraduationCap,
  medical: Stethoscope,
  amenity: ShoppingCart,
  urban: TreePine,
};

export const ITEM_ICONS: Record<string, LucideIcon> = {
  '학교': School,
  '어린이집': Baby,
  '병원·의원': Hospital,
  '약국': Pill,
  '편의점': Store,
  '마트': ShoppingCart,
  '카페': Coffee,
  '전통시장': Tent,
  '주차장': SquareParking,
  '공원': Trees,
  '충전소': Zap,
};

export function AmenityHub() {
  return (
    <section className="mt-10">
      <h2 className="mb-1 text-xl font-bold tracking-tight text-[var(--color-blue-dark)]">
        생활권까지 함께 보기
      </h2>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        학교·병원·상권·도시인프라 — 우리 동네 편의시설을 카테고리별로 둘러보세요.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {LIFE_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICONS[group.slug] ?? MapPin;
          return (
            <article
              key={group.slug}
              className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow)]"
            >
              <Link
                href={`/life/${group.slug}`}
                aria-label={`${group.label} 전체 보기`}
                className="group flex items-center gap-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--color-soft)] text-[var(--color-muted)]">
                  <GroupIcon size={20} aria-hidden />
                </span>
                <span className="text-base font-bold text-[var(--color-blue-dark)]">
                  {group.label}
                </span>
                <span className="ml-auto text-xs font-bold text-[var(--color-blue)] transition group-hover:translate-x-0.5">
                  더보기 →
                </span>
              </Link>

              <div className="mt-4 flex flex-wrap gap-2">
                {group.items.map((item) => {
                  const ItemIcon = ITEM_ICONS[item.label] ?? MapPin;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-blue)] hover:text-[var(--color-blue)]"
                    >
                      <ItemIcon
                        size={15}
                        className="text-[var(--color-muted)] transition group-hover:text-[var(--color-blue)]"
                        aria-hidden
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
