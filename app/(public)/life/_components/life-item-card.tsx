'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SoonModal } from '../../_components/soon-modal';
import type { LifeSubItem } from '../../_components/life-menu';

export function LifeItemCard({ item, emoji }: { item: LifeSubItem; emoji: string }) {
  const [openSoon, setOpenSoon] = useState(false);

  if (item.live) {
    return (
      <Link
        href={item.href}
        className="flex h-full flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-white p-4 transition hover:border-[var(--color-sky)] hover:shadow-[var(--shadow-soft)]"
      >
        <div className="text-2xl">{emoji}</div>
        <div className="mt-1 text-sm font-bold text-[var(--color-blue-dark)]">{item.label}</div>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenSoon(true)}
        className="flex h-full flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-white/70 p-4 text-left transition hover:border-[var(--color-sky)]"
      >
        <div className="text-2xl opacity-70">{emoji}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-sm font-bold text-[var(--color-muted)]">{item.label}</span>
          {item.soon && <Badge tone="gray">Soon</Badge>}
        </div>
      </button>
      <SoonModal open={openSoon} topic={item.label} onClose={() => setOpenSoon(false)} />
    </>
  );
}
