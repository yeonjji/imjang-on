'use client';

import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import type { LoanFacets, LoanFilterCriteria } from '@/lib/loan/list';

const DIMENSIONS = [
  { key: 'usage', label: '자금용도' },
  { key: 'inst', label: '기관' },
  { key: 'target', label: '대상' },
] as const;

interface Props {
  facets: LoanFacets;
  criteria: LoanFilterCriteria;
  onChange: (next: LoanFilterCriteria) => void;
}

export function LoanFilterBar({ facets, criteria, onChange }: Props) {
  function set(patch: Partial<LoanFilterCriteria>) {
    onChange({ ...criteria, ...patch });
  }
  function reset() {
    onChange({ usage: null, inst: null, target: null, region: null, query: '', sort: criteria.sort });
  }

  const hasActive =
    !!criteria.usage || !!criteria.inst || !!criteria.target || !!criteria.region || criteria.query !== '';

  return (
    <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          placeholder="상품명 검색"
          value={criteria.query}
          onChange={(e) => set({ query: e.target.value })}
          className="w-full max-w-xs rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
        />
        {hasActive && (
          <Button variant="ghost" size="sm" onClick={reset} className="ml-auto shrink-0">
            초기화
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {DIMENSIONS.map((dim) => {
          const selected = criteria[dim.key];
          return (
            <div key={dim.key} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <span className="shrink-0 pt-1.5 text-sm font-bold text-[var(--color-blue-dark)] sm:w-20">
                {dim.label}
              </span>
              <div className="flex flex-wrap gap-2">
                <Chip active={!selected} onClick={() => set({ [dim.key]: null })}>
                  전체
                </Chip>
                {facets[dim.key].map((c) => (
                  <Chip
                    key={c.slug}
                    active={selected === c.slug}
                    onClick={() => set({ [dim.key]: selected === c.slug ? null : c.slug })}
                  >
                    {c.label}
                    <span className="ml-1 tabular-nums opacity-70">{c.count}</span>
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 text-sm font-bold text-[var(--color-blue-dark)] sm:w-20">지역</span>
          <select
            aria-label="지역"
            value={criteria.region ?? ''}
            onChange={(e) => set({ region: e.target.value || null })}
            className="w-full max-w-[220px] rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
          >
            <option value="">전체</option>
            {facets.region.map((r) => (
              <option key={r.value} value={r.value}>
                {r.value} ({r.count})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
