'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterLoans,
  type LoanSummary,
  type LoanFacets,
  type LoanFilterCriteria,
} from '@/lib/loan/list';
import { LoanCard } from './loan-card';
import { LoanFilterPanel } from './loan-filter-panel';
import { LoanMobileFilterSheet } from './loan-mobile-filter-sheet';

const EMPTY: LoanFilterCriteria = { usage: [], inst: [], region: [], target: [], query: '', sort: null };
const FACET_KEYS = ['usage', 'inst', 'region', 'target'] as const;

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
  const activeCount =
    FACET_KEYS.reduce((n, k) => n + criteria[k].length, 0) + (criteria.query ? 1 : 0);

  return (
    <>
      <LoanMobileFilterSheet
        facets={facets}
        criteria={criteria}
        onChange={setCriteria}
        activeCount={activeCount}
        resultCount={visible.length}
      />

      <div className="flex items-start gap-6">
        <aside className="sticky top-[88px] hidden w-[280px] shrink-0 md:block">
          <div className="max-h-[calc(100vh-104px)] overflow-y-auto rounded-[22px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
            <LoanFilterPanel facets={facets} criteria={criteria} onChange={setCriteria} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-muted)]">{visible.length}개 상품</p>
            <select
              aria-label="정렬"
              value={criteria.sort ?? ''}
              onChange={(e) =>
                setCriteria((c) => ({ ...c, sort: (e.target.value || null) as LoanFilterCriteria['sort'] }))
              }
              className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
            >
              <option value="">정렬</option>
              <option value="limitDesc">한도 높은순</option>
              <option value="limitAsc">한도 낮은순</option>
            </select>
          </div>

          <div className="flex flex-col gap-4">
            {visible.map((item) => (
              <LoanCard key={item.seq} item={item} />
            ))}
          </div>

          {visible.length === 0 && (
            <p className="py-12 text-center text-sm text-[var(--color-muted)]">
              조건에 맞는 상품이 없습니다.
            </p>
          )}
        </main>
      </div>
    </>
  );
}
