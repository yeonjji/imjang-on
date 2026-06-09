'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PopularRegion } from '@/lib/region';

interface Result {
  properties: Array<{ id: string; name: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}


export function HeroSearch({ popularRegions }: { popularRegions: PopularRegion[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function submit() {
    const term = q.trim();
    if (term) router.push(`/list?q=${encodeURIComponent(term)}`);
  }

  return (
    <div ref={ref} className="relative mt-6">
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-line)] bg-white p-2 pl-4 shadow-[var(--shadow)]">
        <span className="text-[var(--color-muted)]" aria-hidden>🔍</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="단지명·지역명으로 검색"
          className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-[var(--color-text)] outline-none"
        />
        <button
          type="button"
          onClick={submit}
          className="shrink-0 rounded-xl bg-[var(--color-blue)] px-6 py-3 font-bold text-white"
        >
          검색
        </button>
      </div>

      {open && results && (results.properties.length > 0 || results.regions.length > 0) && (
        <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow)]">
          {results.properties.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-bold text-[var(--color-muted)]">단지</p>
              {results.properties.map((p) => (
                <Link key={p.id} href={`/list?q=${encodeURIComponent(p.name)}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Link>
              ))}
            </>
          )}
          {results.regions.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1 text-xs font-bold text-[var(--color-muted)]">지역</p>
              {results.regions.map((r) => (
                <Link key={r.code} href={`/list?region=${r.code.slice(0, 5)}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]" onClick={() => setOpen(false)}>
                  <p className="text-sm">{r.fullName}</p>
                </Link>
              ))}
            </>
          )}
        </div>
      )}

      {popularRegions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[var(--color-muted)]">인기 지역</span>
          {popularRegions.map((r) => (
            <Link key={r.sigunguCode} href={`/list?sido=${encodeURIComponent(r.sido)}&region=${encodeURIComponent(r.sigunguCode)}`} className="rounded-full border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--color-blue-dark)] hover:border-[var(--color-blue)]">
              # {r.sigungu}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
