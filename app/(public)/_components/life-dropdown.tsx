'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LIFE_GROUPS } from './life-menu';

interface Props {
  /** 비라이브 항목 클릭 시 호출 — Nav가 SoonModal을 연다 */
  onSoon: (topic: string) => void;
}

export function LifeDropdown({ onSoon }: Props) {
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
        생활편의
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="life-dropdown"
          aria-label="생활편의 메뉴"
          className="absolute left-0 top-[calc(100%+14px)] z-30 grid w-[640px] grid-cols-4 gap-5 rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
        >
          {LIFE_GROUPS.map((group) => (
            <div key={group.slug} className="flex flex-col gap-1">
              <Link
                href={group.items[0].href}
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center justify-between gap-1 border-b border-[var(--color-line)] px-2 pb-1.5 text-[14px] font-bold text-[var(--color-blue-dark)] hover:bg-[var(--color-soft)]"
              >
                {group.label}
                <span aria-hidden className="text-[var(--color-muted)]">›</span>
              </Link>
              {group.items.map((item) =>
                item.live ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1.5 text-[14px] text-[var(--color-text)] hover:bg-[var(--color-soft)]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSoon(item.label);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
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
    </div>
  );
}
