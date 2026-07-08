import type { ComponentProps } from 'react';

const baseCls =
  'w-full appearance-none rounded-xl border border-[var(--color-line)] bg-white px-3 py-2 pr-9 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';

/** 지역·종류 필터용 select. 네이티브 드롭다운 화살표를 감추고 조용한 chevron 하나로 통일한다. */
export function FilterSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select {...props} className={className ? `${baseCls} ${className}` : baseCls}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]"
      >
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
