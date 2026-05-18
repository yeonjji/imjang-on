import { autocomplete } from '@/lib/search';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '검색 결과',
  robots: { index: false, follow: true },
  alternates: { canonical: '/search' },
};

export const revalidate = 60;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const results = q ? await autocomplete(q) : { properties: [], regions: [] };

  function typeHref(type: string, id: string): string {
    if (type === 'APARTMENT') return `/apt/${id}`;
    if (type === 'OFFICETEL') return `/officetel/${id}`;
    return `/villa/${id}`;
  }

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">&ldquo;{q}&rdquo; 검색 결과</h1>

      {results.properties.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">단지</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {results.properties.map((p) => (
              <Link key={p.id} href={typeHref(p.type, p.id)}>
                <Card>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{p.region}</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {results.regions.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold">지역</h2>
          <ul className="space-y-1">
            {results.regions.map((r) => (
              <li key={r.code}>
                <Link
                  href={`/region/${r.code.slice(0, 5)}`}
                  className="text-[var(--color-blue)] hover:underline"
                >
                  {r.fullName}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.properties.length === 0 && results.regions.length === 0 && q && (
        <p className="mt-8 text-[var(--color-muted)]">결과를 찾지 못했어요.</p>
      )}
    </section>
  );
}
