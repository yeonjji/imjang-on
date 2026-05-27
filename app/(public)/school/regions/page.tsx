import Link from 'next/link';
import { getAllSigungus } from '@/lib/region';
import { getSchoolCountsBySigungu } from '@/lib/school';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '지역별 학교 찾기 — 전국 시군구',
  description: '전국 시·군·구별 초·중·고·특수학교를 지역으로 찾아보세요.',
  alternates: { canonical: '/school/regions' },
};

export const revalidate = 86_400;

export default async function SchoolRegionsPage() {
  const [sigungus, counts] = await Promise.all([
    getAllSigungus().catch(() => []),
    getSchoolCountsBySigungu().catch(() => new Map<string, number>()),
  ]);

  const bySido = new Map<string, typeof sigungus>();
  for (const s of sigungus) {
    if (!s.sigunguCode) continue;
    const arr = bySido.get(s.sido) ?? [];
    arr.push(s);
    bySido.set(s.sido, arr);
  }

  return (
    <section className="mx-auto max-w-[1180px] px-6 py-12">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/">홈</Link><span>›</span>
        <Link href="/life">생활편의</Link><span>›</span>
        <Link href="/school">학교찾기</Link><span>›</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">지역별</span>
      </nav>

      <h1 className="mb-2 text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">지역별 학교 찾기</h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">시·군·구를 선택하면 해당 지역의 학교 목록으로 이동합니다.</p>

      <div className="flex flex-col gap-8">
        {[...bySido.entries()].map(([sido, list]) => (
          <div key={sido}>
            <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">{sido}</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {list.map((sg) => (
                <Link
                  key={sg.sigunguCode}
                  href={`/school/${sg.sigunguCode}`}
                  className="rounded-xl border border-[var(--color-line)] bg-white px-3 py-2.5 text-sm transition hover:border-[var(--color-sky)]"
                >
                  <span className="font-semibold text-[var(--color-blue-dark)]">{sg.sigungu}</span>
                  <span className="ml-1 text-xs text-[var(--color-muted)]">
                    {(counts.get(sg.sigunguCode!) ?? 0).toLocaleString('ko-KR')}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
