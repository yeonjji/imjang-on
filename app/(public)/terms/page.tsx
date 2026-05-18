import type { Metadata } from 'next';

export const metadata: Metadata = { title: '이용약관', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">이용약관</h1>
      <p className="mt-4">본 사이트는 공공데이터를 가공해 제공하는 정보 플랫폼으로, 회원가입·결제 기능이 없습니다.</p>
      <p className="mt-3">본 사이트의 정보를 활용한 부동산 거래 의사결정의 결과에 대해 임장온은 책임지지 않습니다.</p>
    </article>
  );
}
