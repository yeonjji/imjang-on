import type { Metadata } from 'next';
import { dataSourcesByCategory } from '@/lib/data-sources';

export const metadata: Metadata = {
  title: '데이터 출처',
  description: '임장ON 데이터 출처 — 국토교통부 실거래가, 청약홈, 건강보험심사평가원 등 공공데이터 출처 안내.',
  alternates: { canonical: '/data-source' },
};

export default function DataSourcePage() {
  const groups = dataSourcesByCategory();
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">데이터 출처 및 면책</h1>
      <p className="mt-4 text-[var(--color-text)]">
        임장ON은 아래 공공데이터 및 외부 서비스를 가공해 정보를 제공합니다.
      </p>

      <div className="mt-8 space-y-8">
        {groups.map((group) => (
          <section key={group.category}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-muted)]">
              {group.category}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {group.sources.map((s) => (
                <li key={s.id}>
                  <span className="font-semibold text-[var(--color-text)]">{s.provider}</span>
                  {' — '}
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[var(--color-blue-dark)]"
                    >
                      {s.dataset}
                    </a>
                  ) : (
                    s.dataset
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 space-y-3 text-sm text-[var(--color-muted)]">
        <p>
          본 서비스는 공공누리 제1유형(출처표시)에 따라 공공데이터를 이용합니다.
        </p>
        <p>
          본 사이트의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연(통상 30일 이내) 등으로 인해
          최신성·정확성을 100% 보장하지 않습니다. 실제 거래·청약·이용 전 반드시 원 출처 및 관계 기관을 통해
          확인하시기 바랍니다.
        </p>
      </div>
    </article>
  );
}
