import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedGuideBySlug, getGuidesByCategory } from '@/lib/guide/queries';
import { guideCategoryLabel } from '@/lib/guide/labels';
import { PostSource } from '@/components/ui/post-source';
import { RelatedGuidesView } from '@/app/(public)/_components/related-guides';
import { BoardDetailCta } from '@/app/(public)/board/[id]/_components/board-detail-cta';
import { JsonLd, guideArticleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import { splitSummary } from '@/lib/board/summary-split';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';
import type { Metadata } from 'next';

export const revalidate = 86_400;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 ISR 캐시. 편집 시 actions.ts가 revalidatePath로 무효화.
export function generateStaticParams() { return []; }

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
  const { summary, rest } = splitSummary(guide.body);

  // 같은 카테고리 관련 가이드(자기 자신 제외, 최대 3건).
  const related = (await getGuidesByCategory(guide.category, 4))
    .filter((g) => g.slug !== guide.slug)
    .slice(0, 3);

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
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{rest}</ReactMarkdown>
      </div>
      {summary && <ArticleSummary markdown={summary} />}
      <PostSource sourceName={guide.sourceName} sourceUrl={guide.sourceUrl} sourceDate={guide.sourceDate} />
      <RelatedGuidesView items={related} className="mt-12" />
      <BoardDetailCta />
    </article>
  );
}
