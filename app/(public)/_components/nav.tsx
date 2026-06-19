'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { SearchInput } from './search-input';
import { useState } from 'react';
import { SoonModal } from './soon-modal';
import { MobileDrawer } from './mobile-drawer';
import { LifeDropdown } from './life-dropdown';
import { isBoardPublic } from '@/lib/board/visibility';

export function Nav() {
  const [soonOpen, setSoonOpen] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-white/85 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-[1180px] items-center gap-6 px-6">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="임장ON"
              width={1814}
              height={867}
              priority
              className="h-14 w-auto md:h-14"
            />
          </Link>

          <div className="hidden gap-6 text-[15px] font-semibold text-[var(--color-muted)] md:flex md:items-center">
            <Link href="/list">실거래가</Link>
            <Link href="/subscription">청약</Link>
            <Link href="/finance">금융정보</Link>
            <LifeDropdown onSoon={(topic) => setSoonOpen(topic)} />
            {isBoardPublic() && <Link href="/board">임장ON 브리핑</Link>}
          </div>

          <div className="ml-auto hidden w-48 md:block lg:w-64">
            <SearchInput />
          </div>

          <button
            onClick={() => setMenuOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
            className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-[var(--color-text)] hover:bg-[var(--color-soft)] md:hidden"
          >
            <Menu size={22} />
          </button>
        </nav>
      </header>

      <MobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSoonClick={(topic) => {
          setSoonOpen(topic);
          setMenuOpen(false);
        }}
      />

      <SoonModal open={!!soonOpen} topic={soonOpen} onClose={() => setSoonOpen(null)} />
    </>
  );
}
