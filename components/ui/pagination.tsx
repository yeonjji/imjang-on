'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildPager } from '@/lib/pagination';

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

  const pager = buildPager(current, totalPages);
  const start = (current - 1) * perPage + 1;
  const end = Math.min(current * perPage, totalItems);

  return (
    <nav className="py-3" aria-label="페이지네이션">
      {/* 위치 캡션 (중앙) */}
      <p className="mb-3 text-center text-xs text-[var(--color-muted)]">
        {totalItems.toLocaleString('ko-KR')}건 중{' '}
        <span className="font-semibold text-[var(--color-blue-dark)]">
          {start.toLocaleString('ko-KR')}–{end.toLocaleString('ko-KR')}
        </span>{' '}
        표시중
      </p>

      {/* 모바일: 이전 / 페이지 점프 / 다음 */}
      <MobilePager current={current} totalPages={totalPages} onChange={onChange} disabled={disabled} />

      {/* 데스크톱 */}
      <div className="hidden md:flex flex-wrap items-center justify-center gap-2">
        {pager.first && (
          <JumpBtn label="처음 페이지로" onClick={() => onChange(1)} disabled={disabled}>
            ⟪ 처음
          </JumpBtn>
        )}
        {pager.prev10 != null && (
          <JumpBtn label="10페이지 뒤로" onClick={() => onChange(pager.prev10!)} disabled={disabled}>
            ⟪ -10
          </JumpBtn>
        )}

        <StepBtn label="이전 페이지" onClick={() => onChange(current - 1)} disabled={disabled || current === 1}>
          <ChevronLeft size={16} /> 이전
        </StepBtn>

        {pager.pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            disabled={disabled}
            aria-current={p === current ? 'page' : undefined}
            className={cn(
              'h-11 min-w-[44px] rounded-xl px-2 text-sm font-bold',
              p === current
                ? 'bg-[var(--color-blue)] text-white'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-soft)]',
            )}
          >
            {p}
          </button>
        ))}

        <StepBtn
          label="다음 페이지"
          onClick={() => onChange(current + 1)}
          disabled={disabled || current === totalPages}
        >
          다음 <ChevronRight size={16} />
        </StepBtn>

        {(pager.next10 != null || pager.last != null) && (
          <span className="mx-1 h-6 w-px bg-[var(--color-line)]" aria-hidden />
        )}
        {pager.next10 != null && (
          <JumpBtn label="10페이지 앞으로" onClick={() => onChange(pager.next10!)} disabled={disabled}>
            +10 ⟫
          </JumpBtn>
        )}
        {pager.last != null && (
          <JumpBtn label="마지막 페이지로" onClick={() => onChange(pager.last!)} disabled={disabled}>
            마지막 {totalPages.toLocaleString('ko-KR')} ⟫
          </JumpBtn>
        )}
      </div>
    </nav>
  );
}

function StepBtn({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] hover:bg-[var(--color-soft)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function JumpBtn({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-11 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] px-3 text-xs font-semibold text-[var(--color-muted)] hover:bg-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function MobilePager({
  current,
  totalPages,
  onChange,
  disabled,
}: {
  current: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  function submit() {
    const n = Math.min(totalPages, Math.max(1, Number(value) || current));
    setOpen(false);
    setValue('');
    onChange(n);
  }

  return (
    <div className="flex w-full items-center justify-between gap-2 md:hidden">
      <button
        aria-label="이전 페이지"
        onClick={() => onChange(current - 1)}
        disabled={disabled || current === 1}
        className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
      >
        <ChevronLeft size={16} /> 이전
      </button>

      {open ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={String(current)}
            aria-label="페이지 번호 입력"
            className="h-9 w-16 rounded-lg border border-[var(--color-line)] px-2 text-center text-sm"
          />
          <button
            onClick={submit}
            className="h-9 rounded-lg bg-[var(--color-blue)] px-3 text-sm font-bold text-white"
          >
            이동
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="페이지 이동"
          className="flex h-11 items-center text-sm font-bold text-[var(--color-blue-dark)]"
        >
          {current.toLocaleString('ko-KR')} / {totalPages.toLocaleString('ko-KR')}
        </button>
      )}

      <button
        aria-label="다음 페이지"
        onClick={() => onChange(current + 1)}
        disabled={disabled || current === totalPages}
        className="flex h-11 items-center gap-1 rounded-xl border border-[var(--color-blue)] px-4 text-sm font-bold text-[var(--color-blue)] disabled:border-[var(--color-line)] disabled:text-[var(--color-muted)] disabled:opacity-50"
      >
        다음 <ChevronRight size={16} />
      </button>
    </div>
  );
}
