'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PaginationProps {
  current: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({
  current,
  totalPages,
  totalItems,
  perPage,
  onChange,
  disabled,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const window = pageWindow(current, totalPages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, totalItems);

  return (
    <div className="py-3">
      {/* 모바일: 이전 / 페이지수 / 다음 */}
      <div className="flex md:hidden items-center justify-between w-full">
        <IconBtn label="prev" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
          <ChevronLeft size={16} />
        </IconBtn>
        <span className="text-sm font-semibold text-[var(--color-blue-dark)]">
          {current} / {totalPages}
        </span>
        <IconBtn label="next" onClick={() => onChange(current + 1)} disabled={disabled || current === totalPages}>
          <ChevronRight size={16} />
        </IconBtn>
      </div>

      {/* 데스크톱: 기존 전체 */}
      <div className="hidden md:flex items-center justify-between gap-3">
        <nav className="flex items-center gap-1" aria-label="pagination">
          <IconBtn label="first" onClick={() => onChange(1)} disabled={disabled || current === 1}>
            <ChevronsLeft size={14} />
          </IconBtn>
          <IconBtn label="prev" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
            <ChevronLeft size={14} />
          </IconBtn>
          {window.map((p, i) =>
            p === '…' ? (
              <span key={`g${i}`} className="px-2 text-sm text-[var(--color-muted)]">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p)}
                disabled={disabled}
                aria-current={p === current ? 'page' : undefined}
                className={cn(
                  'min-w-[32px] rounded-lg px-2.5 py-1 text-sm font-semibold',
                  p === current
                    ? 'bg-[var(--color-blue)] text-white'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]',
                )}
              >
                {p}
              </button>
            ),
          )}
          <IconBtn label="next" onClick={() => onChange(current + 1)} disabled={disabled || current === totalPages}>
            <ChevronRight size={14} />
          </IconBtn>
          <IconBtn label="last" onClick={() => onChange(totalPages)} disabled={disabled || current === totalPages}>
            <ChevronsRight size={14} />
          </IconBtn>
        </nav>
        <span className="text-xs text-[var(--color-muted)]">
          {totalItems}건 중 {start}–{end} 표시
        </span>
      </div>
    </div>
  );
}

function IconBtn({
  label,
  children,
  onClick,
  disabled,
}: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-soft)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  const left = Math.max(2, current - 2);
  const right = Math.min(total - 1, current + 2);
  if (left > 2) pages.push('…');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}
