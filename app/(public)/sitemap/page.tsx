import type { Metadata } from 'next';
import Link from 'next/link';
import { LIFE_GROUPS } from '../_components/life-menu';
import { isBoardPublic } from '@/lib/board/visibility';

export const metadata: Metadata = {
  title: '사이트맵',
  description: '임장ON 사이트맵 — 아파트·오피스텔·연립다세대·지역·생활편의 전체 페이지 안내.',
  alternates: { canonical: '/sitemap' },
};

const PRIMARY: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: '실거래가',
    links: [
      { href: '/', label: '홈' },
      { href: '/list', label: '통합 실거래가' },
      { href: '/apt', label: '아파트' },
      { href: '/officetel', label: '오피스텔' },
      { href: '/villa', label: '연립·다세대' },
    ],
  },
  {
    heading: '청약',
    links: [{ href: '/subscription', label: '청약·분양 일정' }],
  },
  {
    heading: '금융정보',
    links: [
      { href: '/finance', label: '서민금융 대출상품' },
      { href: '/jeonse-guarantee', label: '맞춤 전세보증 찾기' },
    ],
  },
  {
    heading: '콘텐츠',
    links: [
      { href: '/guide', label: '가이드' },
      ...(isBoardPublic() ? [{ href: '/board', label: '임장ON 브리핑' }] : []),
    ],
  },
  {
    heading: '안내',
    links: [
      { href: '/about', label: '서비스 소개' },
      { href: '/data-source', label: '데이터 안내' },
      { href: '/terms', label: '이용약관' },
      { href: '/privacy', label: '개인정보 처리방침' },
      { href: '/contact', label: '문의' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">사이트맵</h1>

      <div className="mt-8 space-y-8">
        {PRIMARY.map((group) => (
          <section key={group.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{group.heading}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="underline hover:text-[var(--color-blue-dark)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="text-lg font-bold text-[var(--color-text)]">생활편의</h2>
          <div className="mt-3 space-y-4">
            {LIFE_GROUPS.map((g) => (
              <div key={g.slug}>
                <Link href={g.items[0].href} className="font-semibold underline hover:text-[var(--color-blue-dark)]">
                  {g.label}
                </Link>
                <ul className="mt-2 space-y-2 pl-4">
                  {g.items
                    .filter((item) => item.live)
                    .map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className="underline hover:text-[var(--color-blue-dark)]">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
