import Link from 'next/link';
import { resolveFaq, type FaqCategory, type FaqItem } from '@/lib/faq/data';
import { getFaqStats } from '@/lib/faq/stats';
import { faqSchema, JsonLd } from '@/lib/seo/json-ld';

/** JSON-LD 없이 아코디언만 렌더(통합 /faq 페이지에서 카테고리별 재사용). */
export function FaqList({
  items,
  title = '자주 묻는 질문',
}: {
  items: FaqItem[];
  title?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="mt-12">
      <h2 className="mb-5 text-xl font-bold text-[var(--color-blue-dark)]">{title}</h2>
      <div className="space-y-3">
        {items.map((it) => (
          <details
            key={it.q}
            className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold text-[var(--color-blue-dark)]">
              <span className="break-keep">{it.q}</span>
              <span
                aria-hidden
                className="shrink-0 text-[var(--color-muted)] transition-transform [details[open]_&]:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-text)]">
              <p className="break-keep">{it.a}</p>
              {it.source ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">출처: {it.source}</p>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** 상세 FAQ(페이지 값 문항) 아코디언 + FAQPage JSON-LD. 공통 질문은 /faq로 보낸다. */
export function Faq({
  items,
  title,
  showAllLink = true,
}: {
  items: FaqItem[];
  title?: string;
  showAllLink?: boolean;
}) {
  if (!items.length) return null;
  return (
    <>
      <FaqList items={items} title={title} />
      {showAllLink && (
        <Link href="/faq" prefetch={false} className="mt-3 inline-block text-sm font-semibold hover:underline">
          {/* 전역 a { color: inherit }가 레이어 밖이라 링크 자체의 색 유틸리티를 이긴다 → 안쪽 span에 색 */}
          <span className="text-[var(--color-blue)]">자주 묻는 질문 전체 보기 →</span>
        </Link>
      )}
      <JsonLd data={faqSchema(items)} />
    </>
  );
}

/** 목록(허브) 페이지 공통 FAQ — 임장ON 숫자(하루 캐시)로 채운다. */
export async function CategoryFaq({ category, title }: { category: FaqCategory; title?: string }) {
  const stats = await getFaqStats();
  return <Faq items={resolveFaq(category, stats)} title={title} showAllLink={false} />;
}
