import { notFound, permanentRedirect } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPublishedPostById, getPublishedPostBySlug } from '@/lib/board/post';
import { boardPath } from '@/lib/board/slug';
import { canViewBoard, isBoardPublic } from '@/lib/board/visibility';
import { categoryLabel } from '@/lib/board/labels';
import { canonicalizeSourceName } from '@/lib/board/source-name';
import { PostSource } from '@/components/ui/post-source';
import { BoardDetailCta } from './_components/board-detail-cta';
import { BoardBriefingSection } from '@/app/(public)/_components/board-briefing-section';
import { JsonLd, articleSchema, breadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';
import { splitSummary } from '@/lib/board/summary-split';
import { ArticleSummary } from '@/app/(public)/_components/article-summary';
import type { Metadata } from 'next';

export const revalidate = 3_600;
// 동적 세그먼트는 generateStaticParams가 없으면 revalidate가 무시되고 매 요청 동적 렌더된다.
// 빈 배열 → 프리빌드 없이 첫 요청 시 렌더 후 ISR 캐시. 편집 시 actions.ts가 revalidatePath로 무효화.
export function generateStaticParams() { return []; }

interface Params {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return {};
  const post = await getPublishedPostById(BigInt(id)).catch(() => null);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: boardPath(post.id) },
  };
}

export default async function BoardDetailPage({ params, searchParams }: Params) {
  // 공개 상태(상시)에선 preview가 불필요 → searchParams를 읽지 않아 ISR 정적 렌더를 유지한다.
  // 비공개(런칭 전 토글)일 때만 preview 토큰을 검사한다(이 경우에만 동적 렌더).
  if (!isBoardPublic()) {
    const { preview } = await searchParams;
    if (!canViewBoard(preview)) notFound();
  }
  const { id } = await params;

  // 레거시: 옛 한글 slug URL(`/board/<slug>`) → id 경로로 영구 리다이렉트
  if (!/^\d+$/.test(id)) {
    const legacy = await getPublishedPostBySlug(id).catch(() => null);
    if (!legacy) notFound();
    permanentRedirect(boardPath(legacy.id));
  }

  const post = await getPublishedPostById(BigInt(id));
  if (!post) notFound();
  const { summary, rest } = splitSummary(post.body);

  const url = `${SITE_URL}${boardPath(post.id)}`;

  return (
    <article className="mx-auto max-w-[760px] px-6 py-12">
      <JsonLd
        data={[
          articleSchema({
            headline: post.title,
            url,
            datePublished: post.publishedAt.toISOString().slice(0, 10),
            description: post.summary,
            image: `${SITE_URL}/board/${post.id}/thumbnail`,
          }),
          breadcrumbSchema([
            { name: '홈', url: `${SITE_URL}/` },
            { name: '소식', url: `${SITE_URL}/board` },
            { name: post.title, url },
          ]),
        ]}
      />
      <div className="mb-6 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4">
        <p className="text-sm font-black tracking-tight text-[var(--color-blue)]">임장ON 브리핑</p>
        <p className="mt-1 text-xs font-bold text-[var(--color-muted)]">
          {categoryLabel(post.category)} · {canonicalizeSourceName(post.sourceName)}
        </p>
      </div>
      <span className="inline-block rounded-full bg-[var(--color-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-blue)]">
        {categoryLabel(post.category)}
      </span>
      <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">
        {post.title}
      </h1>
      <div className="mt-2 flex items-center justify-between text-sm text-[var(--color-muted)]">
        <span>임장ON 요약일 {post.generatedAt.toISOString().slice(0, 10)}</span>
        <span>작성자 : 임장ON 편집부</span>
      </div>
      <div className="board-prose mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{rest}</ReactMarkdown>
      </div>
      {summary && <ArticleSummary markdown={summary} />}

      <PostSource
        sourceName={post.sourceName}
        sourceUrl={post.sourceUrl}
        sourceDate={post.sourceDate}
        summarizedAt={post.generatedAt}
        dateLabel="원문 발행일"
      />

      <BoardDetailCta />
      <BoardBriefingSection className="mt-16" heading="다른 브리핑 글" excludeId={post.id} />
    </article>
  );
}
