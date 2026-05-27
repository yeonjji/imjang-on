'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from './search-input';

interface Props {
  open: boolean;
  onClose: () => void;
  onSoonClick: (topic: string) => void;
}

const links = [
  { href: '/', label: '홈' },
  { href: '/list', label: '실거래가' },
  { href: '/life', label: '생활인프라' },
];

export function MobileDrawer({ open, onClose, onSoonClick }: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
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
        className={`fixed right-0 top-0 z-40 flex h-full w-[78%] max-w-[320px] flex-col gap-1 bg-white p-5 shadow-[var(--shadow-soft)] transition-transform ${
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
          onClick={() => onSoonClick('청약')}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-3 text-left text-[15px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-soft)]"
        >
          청약 <Badge tone="gray">Soon</Badge>
        </button>
      </div>
    </div>
  );
}
