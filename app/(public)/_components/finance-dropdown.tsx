'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FINANCE_ITEMS } from './finance-menu';

export function FinanceDropdown() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex items-center gap-1"
      >
        금융정보
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          aria-label="금융정보 메뉴"
          className="absolute left-0 top-[calc(100%+14px)] z-30 flex w-[220px] flex-col gap-1 rounded-2xl border border-[var(--color-line)] bg-white p-3 shadow-[var(--shadow-soft)]"
        >
          {FINANCE_ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-soft)]"
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
