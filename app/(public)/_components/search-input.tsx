'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface Result {
  properties: Array<{ id: string; name: string; address: string; region: string; type: string }>;
  regions: Array<{ code: string; fullName: string }>;
}

export function SearchInput() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
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

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const term = q.trim();
              if (term) { setOpen(false); router.push(`/list?q=${encodeURIComponent(term)}`); }
            }
          }}
          placeholder="단지/지역명 검색"
          className="pl-8"
        />
      </div>
      {open && results && (results.properties.length > 0 || results.regions.length > 0) && (
        <div className="absolute left-0 right-0 z-40 mt-2 rounded-2xl border border-[var(--color-line)] bg-white p-2 shadow-[var(--shadow-soft)] md:left-auto md:w-80">
          {results.properties.length > 0 && (
            <>
              <p className="px-3 py-1 text-xs font-bold uppercase text-[var(--color-muted)]">단지</p>
              {results.properties.map((p) => (
                <Link
                  key={p.id}
                  href={`/list?q=${encodeURIComponent(p.name)}`}
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]"
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Link>
              ))}
            </>
          )}
          {results.regions.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1 text-xs font-bold uppercase text-[var(--color-muted)]">지역</p>
              {results.regions.map((r) => (
                <Link
                  key={r.code}
                  href={`/list?region=${r.code.slice(0, 5)}`}
                  className="block rounded-lg px-3 py-2 hover:bg-[var(--color-soft)]"
                  onClick={() => setOpen(false)}
                >
                  <p className="text-sm">{r.fullName}</p>
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
