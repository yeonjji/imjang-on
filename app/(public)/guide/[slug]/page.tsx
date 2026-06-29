import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedGuideBySlug } from '@/lib/guide/queries';
import { guideCategoryLabel } from '@/lib/guide/labels';
import { PostSource } from '@/components/ui/post-source';
import { JsonLd, guideArticleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

export const revalidate = 86_400;

interface Params { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getPublishedGuideBySlug(slug).catch(() => null);
  if (!guide) return {};
  return {
    title: `${guide.title} — 임장ON 가이드`,
    description: guide.summary,
    alternates: { canonical: `/guide/${guide.slug}` },
  };
}

export default async function GuideDetailPage({ params }: Params) {
  const { slug } = await params;
  const guide = await getPublishedGuideBySlug(slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guide/${guide.slug}`;
  const published = guide.publishedAt.toISOString().slice(0, 10);

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12">
      <JsonLd
        data={[
          guideArticleSchema({
            headline: guide.title,
            url,
            description: guide.summary,
            datePublished: published,
            dateModified: guide.updatedAt.toISOString().slice(0, 10),
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '가이드', url: `${SITE_URL}/guide` },
            { name: guide.title, url },
          ]),
        ]}
      />
      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
        {guideCategoryLabel(guide.category)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {guide.title}
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">임장ON 가이드 · {guideCategoryLabel(guide.category)}</p>
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{guide.body}</ReactMarkdown>
      </div>
      <PostSource sourceName={guide.sourceName} sourceUrl={guide.sourceUrl} sourceDate={guide.sourceDate} />
    </article>
  );
}
