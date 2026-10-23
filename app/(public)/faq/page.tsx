import type { Metadata } from 'next';
import { FAQ_PAGE_ORDER, FAQ_CATEGORY_LABEL, resolveFaq } from '@/lib/faq/data';
import { getFaqStats } from '@/lib/faq/stats';
import { FaqList } from '../_components/faq';
import { faqSchema, breadcrumbSchema, JsonLd } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';

// 답 속 숫자(getFaqStats)는 하루 1회 계산 — 페이지도 하루 주기로 다시 만든다.
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description:
    '임장ON이 실거래가·청약·대출·생활시설 공공데이터를 어디서 언제 받아 어떻게 정리하는지, 무엇은 보여주지 않는지 모았습니다.',
  alternates: { canonical: '/faq' },
};

export default async function FaqPage() {
  const stats = await getFaqStats();
  const sections = FAQ_PAGE_ORDER.map((c) => ({ c, items: resolveFaq(c, stats) }));
  const allItems = sections.flatMap((s) => s.items);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">자주 묻는 질문</h1>
      <p className="mt-3 break-keep text-[var(--color-muted)]">
        임장ON이 다루는 공공데이터를 어디서 받아 어떻게 정리하는지 모았습니다.
      </p>
      {stats && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">답 속 숫자는 매일 새로 계산합니다 · {stats.asOf} 기준</p>
      )}

      {sections.map(({ c, items }) => (
        <FaqList key={c} items={items} title={FAQ_CATEGORY_LABEL[c]} />
      ))}

      <JsonLd
        data={[
          faqSchema(allItems),
          breadcrumbSchema([
            { name: '홈', url: SITE_URL },
            { name: '자주 묻는 질문', url: `${SITE_URL}/faq` },
          ]),
        ]}
      />
    </article>
  );
}
