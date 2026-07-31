import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { guideCategoryForPage } from '@/lib/guide/page-category';
import { getGuidesByCategory, type RelatedGuideItem } from '@/lib/guide/queries';

/**
 * POI/매물 상세 하단 '관련 가이드' 섹션의 순수 표현 뷰.
 * items가 비면 렌더하지 않는다(빈 블록 금지).
 */
export function RelatedGuidesView({
  items,
  className,
}: {
  items: RelatedGuideItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-1">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">관련 가이드</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">실제 절차·개념을 정리한 안내 글</p>
        </div>
        <Link href="/guide" className="text-[13px] font-bold text-[var(--color-blue)] hover:underline">
          전체 보기 →
        </Link>
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <Link
            key={g.slug}
            href={`/guide/${g.slug}`}
            className="flex flex-col rounded-[16px] border border-[var(--color-line)] bg-[var(--color-soft)] p-4 transition hover:border-[var(--color-blue)] hover:bg-[var(--color-sky-soft)]"
          >
            <h3 className="line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-[var(--color-blue-dark)]">
              {g.title}
            </h3>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/**
 * 관련 가이드 블록(async 데이터 래퍼).
 * pageKey가 GuideCategory에 매핑되지 않거나 PUBLISHED 가이드가 없으면 null.
 */
export async function RelatedGuides({
  pageKey,
  className,
  limit = 4,
}: {
  pageKey: string;
  className?: string;
  limit?: number;
}) {
  const category = guideCategoryForPage(pageKey);
  if (!category) return null;
  const items = await getGuidesByCategory(category, limit);
  return <RelatedGuidesView items={items} className={className} />;
}
