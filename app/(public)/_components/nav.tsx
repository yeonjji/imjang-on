'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';
import { useState } from 'react';
import { SoonModal } from './soon-modal';

export function Nav() {
  const [soonOpen, setSoonOpen] = useState<string | null>(null);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-xl bg-gradient-to-br from-[var(--color-blue)] to-[var(--color-sky)] text-base font-black text-white">
              임
            </span>
            <span className="text-[22px] font-black tracking-tighter text-[var(--color-blue-dark)]">
              임장온
            </span>
          </Link>

          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/">홈</Link>
            <Link href="/list">실거래가</Link>
<button onClick={() => setSoonOpen('청약')} className="inline-flex items-center gap-1.5">
              청약 <Badge tone="gray">Soon</Badge>
            </button>
            <button onClick={() => setSoonOpen('생활권')} className="inline-flex items-center gap-1.5">
              생활권 <Badge tone="gray">Soon</Badge>
            </button>
          </div>

          <div className="ml-auto w-48 lg:w-64">
            <SearchInput />
          </div>
        </nav>
      </header>

      <SoonModal open={!!soonOpen} topic={soonOpen} onClose={() => setSoonOpen(null)} />
    </>
  );
}
