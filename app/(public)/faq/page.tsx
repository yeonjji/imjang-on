import type { Metadata } from 'next';
import { FAQ, FAQ_PAGE_ORDER, FAQ_CATEGORY_LABEL } from '@/lib/faq/data';
import { FaqList } from '../_components/faq';
import { faqSchema, breadcrumbSchema, JsonLd } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description:
    '임장ON 부동산 실거래가·청약·생활시설 정보 이용에 대해 자주 묻는 질문을 모았습니다. 공공데이터 기반 정보의 출처와 활용법을 안내합니다.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  const allItems = FAQ_PAGE_ORDER.flatMap((c) => FAQ[c]);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">자주 묻는 질문</h1>
      <p className="mt-3 break-keep text-[var(--color-muted)]">
        임장ON이 제공하는 부동산 실거래가와 생활시설 정보에 대해 자주 묻는 질문을 모았습니다.
      </p>

      {FAQ_PAGE_ORDER.map((c) => (
        <FaqList key={c} items={FAQ[c]} title={FAQ_CATEGORY_LABEL[c]} />
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
