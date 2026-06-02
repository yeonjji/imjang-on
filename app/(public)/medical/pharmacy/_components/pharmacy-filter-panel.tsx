'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface Region { sido: string; sigungu: string; sigunguCode: string; }

interface Props {
  regions: Region[];
  basePath?: string;
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function PharmacyFilterPanel({
  regions,
  basePath = '/medical/pharmacy',
  params: ext,
  onParamsChange,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const p = ext ?? sp;
  const sidos = [...new Set(regions.map(r => r.sido))].sort();

  const [selectedSido, setSelectedSido] = useState(() => {
    const regionCode = p.get('region') ?? '';
    return regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '';
  });

  useEffect(() => {
    if (!ext) return;
    const regionCode = ext.get('region') ?? '';
    setSelectedSido(regionCode ? (regions.find(r => r.sigunguCode === regionCode)?.sido ?? '') : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ext]);

  const sigungus = selectedSido ? regions.filter(r => r.sido === selectedSido) : [];

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(p.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) {
      onParamsChange(next);
    } else {
      router.push(`${basePath}?${next.toString()}`);
    }
  }

  const selectCls = 'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';
  const curRegion = p.get('region') ?? '';

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="mt-2 flex flex-col gap-2">
          <select
            className={selectCls}
            value={selectedSido}
            onChange={e => { setSelectedSido(e.target.value); update({ region: null }); }}
          >
            <option value="">시도 전체</option>
            {sidos.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {sigungus.length > 0 && (
            <select
              className={selectCls}
              value={curRegion}
              onChange={e => update({ region: e.target.value || null })}
            >
              <option value="">시군구 전체</option>
              {sigungus.map(r => <option key={r.sigunguCode} value={r.sigunguCode}>{r.sigungu}</option>)}
            </select>
          )}
        </div>
      </section>
    </div>
  );
}
