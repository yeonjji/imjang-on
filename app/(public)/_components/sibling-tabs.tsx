'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SoonModal } from './soon-modal';
import { getSiblingTabs } from '@/lib/life/sibling-tabs';

interface Props {
  /** 현재 LIST의 정확한 path (쿼리 제외). 예: '/amenity/convenience', '/school' */
  currentHref: string;
}

export function SiblingTabs({ currentHref }: Props) {
  const tabs = getSiblingTabs(currentHref);
  const [soonTopic, setSoonTopic] = useState<string | null>(null);
  if (!tabs) return null;

  return (
    <>
      <div
        data-testid="sibling-tabs"
        className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-4 shadow-[var(--shadow-soft)]"
      >
        <nav aria-label="형제 카테고리" className="flex gap-6 overflow-x-auto overflow-y-hidden">
          {tabs.items.map((item) => {
            const active = item.href === currentHref;
            const base = '-mb-px py-3 text-sm whitespace-nowrap';
            const cls = active
              ? `${base} border-b-2 border-[var(--color-blue)] text-[var(--color-blue-dark)] font-extrabold`
              : `${base} border-b-2 border-transparent text-[var(--color-muted)] font-semibold hover:text-[var(--color-blue-dark)]`;
            if (item.live) {
              if (active) {
                return (
                  <span key={item.href} aria-current="page" className={cls}>
                    {item.label}
                  </span>
                );
              }
              return (
                <Link key={item.href} href={item.href} className={cls}>
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => setSoonTopic(item.label)}
                className={`${cls} inline-flex items-center gap-1.5`}
              >
                {item.label}
                {item.soon && <Badge tone="gray">Soon</Badge>}
              </button>
            );
          })}
        </nav>
      </div>
      <SoonModal open={!!soonTopic} topic={soonTopic} onClose={() => setSoonTopic(null)} />
    </>
  );
}
