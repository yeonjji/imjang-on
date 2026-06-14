'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  filterLoans,
  type LoanSummary,
  type LoanFacets,
  type LoanFilterCriteria,
} from '@/lib/loan/list';
import { LoanCard } from './loan-card';
import { LoanFilterBar } from './loan-filter-bar';

const EMPTY: LoanFilterCriteria = { usage: null, inst: null, target: null, region: null, query: '', sort: null };

// URL searchParams ↔ criteria (정적 ISR 유지 위해 useSearchParams 대신 location 사용).
function readFromUrl(): LoanFilterCriteria {
  if (typeof window === 'undefined') return EMPTY;
  const sp = new URLSearchParams(window.location.search);
  const sort = sp.get('sort');
  return {
    usage: sp.get('usage'),
    inst: sp.get('inst'),
    target: sp.get('target'),
    region: sp.get('region'),
    query: sp.get('q') ?? '',
    sort: sort === 'limitDesc' || sort === 'limitAsc' ? sort : null,
  };
}

function writeToUrl(c: LoanFilterCriteria): void {
  const sp = new URLSearchParams();
  if (c.usage) sp.set('usage', c.usage);
  if (c.inst) sp.set('inst', c.inst);
  if (c.target) sp.set('target', c.target);
  if (c.region) sp.set('region', c.region);
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

  return (
    <div className="flex flex-col gap-6">
      <LoanFilterBar facets={facets} criteria={criteria} onChange={setCriteria} />

      <div>
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
      </div>
    </div>
  );
}
