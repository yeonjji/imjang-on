'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterLoans,
  type LoanSummary,
  type LoanFacets,
  type LoanFilterCriteria,
} from '@/lib/loan/list';
import { LoanCard } from './loan-card';

const EMPTY: LoanFilterCriteria = { usage: [], inst: [], region: [], target: [], query: '', sort: null };
const FACET_KEYS = ['usage', 'inst', 'region', 'target'] as const;
type FacetKey = (typeof FACET_KEYS)[number];
const FACET_LABEL: Record<FacetKey, string> = {
  usage: '자금용도', inst: '기관', region: '지역', target: '대상',
};

// URL searchParams ↔ criteria (정적 ISR 유지 위해 useSearchParams 대신 location 사용).
function readFromUrl(): LoanFilterCriteria {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  const arr = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').filter(Boolean) : []);
  const sort = sp.get('sort');
  return {
    usage: arr('usage'), inst: arr('inst'), region: arr('region'), target: arr('target'),
    query: sp.get('q') ?? '',
    sort: sort === 'limitDesc' || sort === 'limitAsc' ? sort : null,
  };
}

function writeToUrl(c: LoanFilterCriteria): void {
  const sp = new URLSearchParams();
  for (const k of FACET_KEYS) if (c[k].length) sp.set(k, c[k].join(','));
  if (c.query) sp.set('q', c.query);
  if (c.sort) sp.set('sort', c.sort);
  const qs = sp.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

export function LoanExplorer({ rows, facets }: { rows: LoanSummary[]; facets: LoanFacets }) {
  const [criteria, setCriteria] = useState<LoanFilterCriteria>(EMPTY);

  // 마운트 시 URL에서 초기 필터 복원
  useEffect(() => {
    setCriteria(readFromUrl());
  }, []);

  useEffect(() => {
    writeToUrl(criteria);
  }, [criteria]);

  const visible = useMemo(() => filterLoans(rows, criteria), [rows, criteria]);

  function toggle(key: FacetKey, value: string) {
    setCriteria((c) => {
      const has = c[key].includes(value);
      return { ...c, [key]: has ? c[key].filter((v) => v !== value) : [...c[key], value] };
    });
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <aside className="md:w-64 md:shrink-0">
        <input
          type="search"
          placeholder="상품명 검색"
          value={criteria.query}
          onChange={(e) => setCriteria((c) => ({ ...c, query: e.target.value }))}
          className="mb-4 w-full rounded-md border border-[var(--color-line)] px-3 py-2 text-sm"
        />
        {FACET_KEYS.map((key) => (
          <fieldset key={key} className="mb-4">
            <legend className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">{FACET_LABEL[key]}</legend>
            <div className="flex max-h-48 flex-col gap-1 overflow-auto">
              {facets[key].map((f) => (
                <label key={f.value} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={criteria[key].includes(f.value)}
                    onChange={() => toggle(key, f.value)}
                  />
                  <span className="flex-1">{f.value}</span>
                  <span className="text-xs text-[var(--color-muted)]">{f.count}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </aside>

      <div className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-[var(--color-muted)]">{visible.length}개 상품</p>
          <select
            value={criteria.sort ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({ ...c, sort: (e.target.value || null) as LoanFilterCriteria['sort'] }))
            }
            className="rounded-md border border-[var(--color-line)] px-2 py-1 text-sm"
          >
            <option value="">정렬</option>
            <option value="limitDesc">한도 높은순</option>
            <option value="limitAsc">한도 낮은순</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((item) => (
            <LoanCard key={item.seq} item={item} />
          ))}
        </div>
        {visible.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--color-muted)]">조건에 맞는 상품이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
