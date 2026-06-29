import Link from 'next/link';
import { listGuidesByStatus } from '@/lib/guide/admin';
import { guideCategoryLabel } from '@/lib/guide/labels';
import type { PostStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TABS: { value: PostStatus; label: string }[] = [
  { value: 'DRAFT', label: '대기' },
  { value: 'PUBLISHED', label: '게시됨' },
  { value: 'REJECTED', label: '반려' },
];

interface Props { searchParams: Promise<{ status?: string }>; }

function isStatus(v: string | undefined): v is PostStatus {
  return v === 'DRAFT' || v === 'PUBLISHED' || v === 'REJECTED';
}

export default async function AdminGuidesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status: PostStatus = isStatus(sp.status) ? sp.status : 'DRAFT';
  const rows = await listGuidesByStatus(status);

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <h1 className="text-2xl font-bold text-[var(--color-blue-dark)]">가이드 관리</h1>

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/guides?status=${t.value}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
              status === t.value ? 'bg-[var(--color-blue)] text-white' : 'border border-[var(--color-line)] text-[var(--color-muted)]'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-[var(--color-muted)]">해당 상태의 가이드가 없습니다.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--color-muted)]">
              <th className="py-2">제목</th><th>카테고리</th><th>출처</th><th>기준일</th><th>생성</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-[var(--color-line)]">
                <td className="py-2">
                  <Link href={`/admin/guides/${r.id}`} className="font-semibold text-[var(--color-blue)] underline">
                    {r.title}
                  </Link>
                </td>
                <td>{guideCategoryLabel(r.category)}</td>
                <td>{r.sourceName}</td>
                <td>{r.sourceDate.toISOString().slice(0, 10)}</td>
                <td>{r.generatedAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
