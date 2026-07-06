import Link from 'next/link';
import { LIFE_GROUPS } from '@/app/(public)/_components/life-menu';

/** 좌표 앵커가 없어 각 생활편의 그룹의 대표 리스트로 보내는 카드 4종. 전세보증·대출 상세 공용. */
export function LifeGroupCards() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LIFE_GROUPS.map((group) => (
        <Link
          key={group.slug}
          href={group.items[0].href}
          className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] bg-white px-4 py-3.5 transition hover:border-[var(--color-blue)]"
        >
          <span className="break-keep text-sm font-bold text-[var(--color-blue-dark)]">
            {group.label}
          </span>
          <span aria-hidden className="shrink-0 text-[var(--color-blue)]">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
