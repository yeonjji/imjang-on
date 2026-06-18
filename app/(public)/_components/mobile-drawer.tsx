'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';
import { LIFE_GROUPS } from './life-menu';
import { isBoardPublic } from '@/lib/board/visibility';

interface Props {
  open: boolean;
  onClose: () => void;
  onSoonClick: (topic: string) => void;
}

const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/subscription', label: '청약' },
  { href: '/finance', label: '금융정보' },
];

export function MobileDrawer({ open, onClose, onSoonClick }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [lifeOpen, setLifeOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      setLifeOpen(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="md:hidden" aria-hidden={!open} inert={!open}>
      <div
        data-testid="mobile-drawer-overlay"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/45 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <div
        data-testid="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="모바일 메뉴"
        className={`fixed right-0 top-0 z-40 flex h-full w-[78%] max-w-[320px] flex-col gap-1 overflow-y-auto bg-white p-5 shadow-[var(--shadow-soft)] transition-transform ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-2 flex justify-end">
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-3">
          <SearchInput />
        </div>

        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="rounded-lg px-2 py-3 text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
          >
            {l.label}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setLifeOpen((v) => !v)}
          aria-expanded={lifeOpen}
          className="inline-flex items-center justify-between rounded-lg px-2 py-3 text-left text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          생활편의
          <ChevronDown size={18} className={`transition-transform ${lifeOpen ? 'rotate-180' : ''}`} />
        </button>

        {lifeOpen && (
          <div className="mb-1 flex flex-col gap-0.5 pl-2">
            {LIFE_GROUPS.map((group) => (
              <div key={group.slug} className="py-1">
                <Link
                  href={`/life/${group.slug}`}
                  onClick={onClose}
                  className="mb-1 flex items-center justify-between rounded-lg border-b border-[var(--color-line)] px-2 py-3 text-[14px] font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
                >
                  {group.label}
                  <span aria-hidden className="text-[var(--color-muted)]">›</span>
                </Link>
                {group.items.map((item) =>
                  item.live ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onClose}
                      className="block rounded-lg px-3 py-2 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-soft)]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onSoonClick(item.label)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                    >
                      {item.label}
                      {item.soon && <Badge tone="gray">Soon</Badge>}
                    </button>
                  ),
                )}
              </div>
            ))}
          </div>
        )}

        {isBoardPublic() && (
          <Link
            href="/board"
            onClick={onClose}
            className="rounded-lg px-2 py-3 text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
          >
            오늘의 소식
          </Link>
        )}

      </div>
    </div>
  );
}
