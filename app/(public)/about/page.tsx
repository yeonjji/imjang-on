import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '서비스 소개',
  description: '임장온 서비스 소개 — 공공데이터 기반 부동산 실거래가·생활편의 정보를 제공하는 방식과 운영 안내.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">임장온 소개</h1>

      <p className="mt-5 text-[var(--color-text)]">
        임장온은 국토교통부 실거래가, 한국부동산원 청약홈, 건강보험심사평가원, 교육부, 보건복지부,
        행정안전부, 국가철도공단 등 공공데이터를 가공·통합해 제공하는 비상업 부동산 정보 플랫폼입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">제공하는 정보</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--color-text)]">
        <li>아파트·오피스텔·연립다세대 실거래가(매매·전세·월세)</li>
        <li>청약·분양 일정 정보</li>
        <li>생활 인프라 — 학교·어린이집, 병원·약국, 편의점·마트·카페·전통시장, 공원·주차장·전기차 충전소</li>
        <li>지하철 역세권 및 지역별 시세</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 안내</h2>
      <p className="mt-3 text-[var(--color-text)]">
        임장온은 개인이 운영하는 비상업 정보 서비스이며, 회원가입·결제·중개 기능을 제공하지 않습니다.
        문의는{' '}
        <a href="mailto:contact@imjangon.co.kr" className="underline hover:text-[var(--color-blue-dark)]">
          contact@imjangon.co.kr
        </a>
        으로 받습니다.
      </p>

      <p className="mt-8 text-sm text-[var(--color-muted)]">
        본 서비스의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연 등으로 최신성·정확성을 100%
        보장하지 않습니다. 자세한 내용은{' '}
        <Link href="/data-source" className="underline">데이터 안내</Link>,{' '}
        <Link href="/terms" className="underline">이용약관</Link>,{' '}
        <Link href="/privacy" className="underline">개인정보 처리방침</Link>,{' '}
        <Link href="/contact" className="underline">문의</Link>를 확인하세요.
      </p>
    </article>
  );
}
