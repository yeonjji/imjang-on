'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import type { LoanFacets, LoanFilterCriteria } from '@/lib/loan/list';

const FACET_KEYS = ['usage', 'inst', 'region', 'target'] as const;
type FacetKey = (typeof FACET_KEYS)[number];
const FACET_LABEL: Record<FacetKey, string> = {
  usage: '자금용도',
  inst: '기관',
  region: '지역',
  target: '대상',
};

interface Props {
  facets: LoanFacets;
  criteria: LoanFilterCriteria;
  onChange: (next: LoanFilterCriteria) => void;
}

export function LoanFilterPanel({ facets, criteria, onChange }: Props) {
  const uid = useId();
  function addValue(key: FacetKey, value: string) {
    if (!value || criteria[key].includes(value)) return;
    onChange({ ...criteria, [key]: [...criteria[key], value] });
  }
  function removeValue(key: FacetKey, value: string) {
    onChange({ ...criteria, [key]: criteria[key].filter((v) => v !== value) });
  }
  function reset() {
    onChange({ usage: [], inst: [], region: [], target: [], query: '', sort: criteria.sort });
  }

  const activeChips = FACET_KEYS.flatMap((key) =>
    criteria[key].map((value) => ({ key, value })),
  );
  const hasActive = activeChips.length > 0 || criteria.query !== '';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label
          htmlFor={`${uid}-q`}
          className="mb-1.5 block text-sm font-bold text-[var(--color-blue-dark)]"
        >
          상품명
        </label>
        <input
          id={`${uid}-q`}
          type="search"
          placeholder="상품명 검색"
          value={criteria.query}
          onChange={(e) => onChange({ ...criteria, query: e.target.value })}
          className="w-full rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
        />
      </div>

      {FACET_KEYS.map((key) => {
        const available = facets[key].filter((f) => !criteria[key].includes(f.value));
        return (
          <div key={key}>
            <label
              htmlFor={`${uid}-facet-${key}`}
              className="mb-1.5 block text-sm font-bold text-[var(--color-blue-dark)]"
            >
              {FACET_LABEL[key]}
            </label>
            <select
              id={`${uid}-facet-${key}`}
              value=""
              onChange={(e) => addValue(key, e.target.value)}
              disabled={available.length === 0}
              className="w-full rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm text-[var(--color-blue-dark)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)] disabled:opacity-50"
            >
              <option value="">선택…</option>
              {available.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value} ({f.count})
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {activeChips.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">적용된 필터</p>
          <div className="flex flex-wrap gap-2">
            {activeChips.map(({ key, value }) => (
              <button
                key={`${key}:${value}`}
                type="button"
                onClick={() => removeValue(key, value)}
                aria-label={`${FACET_LABEL[key]} ${value} 제거`}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--color-blue)] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--color-blue-dark)]"
              >
                {value}
                <span aria-hidden>✕</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={reset} className="self-start">
          필터 초기화
        </Button>
      )}
    </div>
  );
}
