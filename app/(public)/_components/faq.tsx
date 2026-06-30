import { FAQ, type FaqCategory, type FaqItem } from '@/lib/faq/data';
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

/** 랜딩 페이지용: 카테고리 FAQ 아코디언 + FAQPage JSON-LD. */
export function Faq({ category, title }: { category: FaqCategory; title?: string }) {
  const items = FAQ[category];
  if (!items?.length) return null;
  return (
    <>
      <FaqList items={items} title={title} />
      <JsonLd data={faqSchema(items)} />
    </>
  );
}
