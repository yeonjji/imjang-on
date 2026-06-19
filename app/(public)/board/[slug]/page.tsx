import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedPostBySlug } from '@/lib/board/post';
import { canViewBoard } from '@/lib/board/visibility';
import { categoryLabel } from '@/lib/board/labels';
import { PostSource } from '@/components/ui/post-source';
import { JsonLd, articleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

export const revalidate = 3_600;

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug).catch(() => null);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/board/${post.slug}` },
  };
}

export default async function BoardDetailPage({ params, searchParams }: Params) {
  const { preview } = await searchParams;
  if (!canViewBoard(preview)) notFound();
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12">
      <JsonLd
        data={[
          articleSchema({
            headline: post.title,
            url: `${SITE_URL}/board/${post.slug}`,
            datePublished: post.publishedAt.toISOString().slice(0, 10),
            description: post.summary,
            image: `${SITE_URL}/board/${post.slug}/thumbnail`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '소식', url: `${SITE_URL}/board` },
            { name: post.title, url: `${SITE_URL}/board/${post.slug}` },
          ]),
        ]}
      />
      <div className="mb-6 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4">
        <p className="text-sm font-black tracking-tight text-[var(--color-blue)]">임장온 소식</p>
        <p className="mt-1 text-xs font-bold text-[var(--color-muted)]">
          {categoryLabel(post.category)} · {post.sourceName}
        </p>
      </div>
      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
        {categoryLabel(post.category)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {post.title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        기준일 {post.sourceDate.toISOString().slice(0, 10)}
      </p>
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{post.body}</ReactMarkdown>
      </div>

      <PostSource
        sourceName={post.sourceName}
        sourceUrl={post.sourceUrl}
        sourceDate={post.sourceDate}
      />
    </article>
  );
}
