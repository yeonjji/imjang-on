import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPostForAdmin } from '@/lib/board/admin';
import { boardPath } from '@/lib/board/slug';
import { PostEditor } from './post-editor';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ id: string }>; }

export default async function AdminPostEditPage({ params }: Params) {
  const { id } = await params;
  let postId: bigint;
  try {
    postId = BigInt(id);
  } catch {
    return notFound();
  }
  const post = await getPostForAdmin(postId);
  if (!post) notFound();
  const previewToken = process.env.BOARD_PREVIEW_TOKEN;

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <Link href="/admin/posts" className="text-sm text-[var(--color-muted)] underline">← 목록</Link>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-[var(--color-blue-dark)]">초안 검토</h1>
        <span className="rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">{post.status}</span>
        {previewToken && post.status === 'PUBLISHED' && (
          <a
            href={`${boardPath(post.id)}?preview=${previewToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm font-semibold text-[var(--color-blue)] underline"
          >
            공개 미리보기 ↗
          </a>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <PostEditor
          id={String(post.id)}
          title={post.title}
          summary={post.summary}
          body={post.body}
          type={post.type}
          category={post.category}
        />
        <aside className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 text-sm">
          <p className="font-bold text-[var(--color-blue-dark)]">근거 자료</p>
          <p className="mt-2 text-[var(--color-muted)]">출처: {post.sourceName}</p>
          <p className="mt-1 text-[var(--color-muted)]">기준일: {post.sourceDate.toISOString().slice(0, 10)}</p>
          <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-[var(--color-blue)] underline">{post.sourceUrl}</a>
          <p className="mt-4 font-bold text-[var(--color-blue-dark)]">원문 발췌</p>
          <p className="mt-2 whitespace-pre-wrap text-[var(--color-text)]">{post.sourceExcerpt}</p>
        </aside>
      </div>
    </div>
  );
}
