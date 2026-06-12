import Link from 'next/link';
import { getAllSigungus } from '@/lib/region';
import { getChildcareCountsBySigungu } from '@/lib/childcare';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '지역별 어린이집',
  description: '전국 시·도·시군구별 어린이집 분포를 보고 우리 동네 국공립·민간·가정 어린이집을 찾아보세요.',
  alternates: { canonical: '/childcare/regions' },
};

export const revalidate = 21_600;

export default async function ChildcareRegionsPage() {
  const [sigungus, counts] = await Promise.all([
    getAllSigungus().catch(() => []),
    getChildcareCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  const bySido = new Map<string, typeof sigungus>();
  for (const sg of sigungus) {
    if (!sg.sigunguCode) continue;
    const arr = bySido.get(sg.sido) ?? [];
    arr.push(sg);
    bySido.set(sg.sido, arr);
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/childcare">어린이집찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">지역별</span>
      </nav>
      <h1 className="mb-6 text-3xl font-black tracking-tight text-[var(--color-blue-dark)]">지역별 어린이집</h1>
      <div className="flex flex-col gap-8">
        {[...bySido.entries()].map(([sido, items]) => (
          <section key={sido}>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{sido}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((it) => (
                <Link
                  key={it.sigunguCode}
                  href={`/childcare/${it.sigunguCode}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-white px-4 py-3 text-sm shadow-[var(--shadow-soft)] hover:border-[var(--color-sky)]"
                >
                  <span className="font-semibold text-[var(--color-blue-dark)]">{it.sigungu}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {(counts.get(it.sigunguCode!) ?? 0).toLocaleString('ko-KR')}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
