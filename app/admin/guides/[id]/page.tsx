import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getGuideForAdmin } from '@/lib/guide/admin';
import { GuideEditor } from './guide-editor';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }>; }

export default async function AdminGuideEditPage({ params }: Params) {
  const { id } = await params;
  let guideId: bigint;
  try {
    guideId = BigInt(id);
  } catch {
    return notFound();
  }
  const guide = await getGuideForAdmin(guideId);
  if (!guide) notFound();

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <Link href="/admin/guides" className="text-sm text-[var(--color-muted)] underline">← 목록</Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-[var(--color-blue-dark)]">가이드 검토</h1>
        <span className="rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">{guide.status}</span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <GuideEditor
          id={String(guide.id)}
          title={guide.title}
          summary={guide.summary}
          body={guide.body}
          category={guide.category}
        />
        <aside className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 text-sm">
          <p className="font-bold text-[var(--color-blue-dark)]">출처</p>
          <p className="mt-2 text-[var(--color-muted)]">{guide.sourceName}</p>
          <p className="mt-1 text-[var(--color-muted)]">기준일: {guide.sourceDate.toISOString().slice(0, 10)}</p>
          <a href={guide.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[var(--color-blue)] underline">{guide.sourceUrl}</a>
          <p className="mt-4 font-bold text-[var(--color-blue-dark)]">출처 발췌</p>
          <p className="mt-2 whitespace-pre-wrap text-[var(--color-text)]">{guide.sourceExcerpt}</p>
        </aside>
      </div>
    </div>
  );
}
