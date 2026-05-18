import type { Metadata } from 'next';

export const metadata: Metadata = { title: '서비스 소개', alternates: { canonical: '/about' } };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">임장온 소개</h1>
      <p className="mt-4 text-[var(--color-text)]">
        임장온은 국토교통부 실거래가, 행정안전부 법정동코드 등 공공데이터를 가공해 부동산 실거래가를 통합 제공하는 정보 플랫폼입니다.
      </p>
      <p className="mt-3 text-[var(--color-text)]">
        Phase 1에서는 아파트·오피스텔·연립다세대의 매매·전세·월세 정보를 단지 단위로 제공합니다. Phase 2에서 청약, 생활 인프라(학교·마트·병원), 전세대출 정보 등을 추가할 예정입니다.
      </p>
    </article>
  );
}
