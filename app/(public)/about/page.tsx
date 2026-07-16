import type { Metadata } from 'next';
import Link from 'next/link';
import { EDITORIAL } from '@/lib/editorial';

export const metadata: Metadata = {
  title: '서비스 소개',
  description: '임장ON 서비스 소개 — 공공데이터 기반 부동산 실거래가·생활편의 정보를 제공하는 방식과 운영 안내.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">임장ON 소개</h1>

      <p className="mt-5 text-[var(--color-text)]">
        임장ON은 국토교통부 실거래가, 한국부동산원 청약홈, 건강보험심사평가원, 교육부, 보건복지부,
        행정안전부, 국가철도공단 등 공공데이터를 자체 수집·정제·결합해 제공하는 부동산 데이터 서비스입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">제공하는 정보</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--color-text)]">
        <li>아파트·오피스텔·연립다세대 실거래가(매매·전세·월세)</li>
        <li>청약·분양 일정 정보</li>
        <li>생활 인프라 — 학교·어린이집, 병원·약국, 편의점·마트·카페·전통시장, 공원·주차장·전기차 충전소</li>
        <li>지하철 역세권 및 지역별 시세</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 주체</h2>
      <p className="mt-3 text-[var(--color-text)]">
        임장ON은 <strong className="font-semibold text-[var(--color-blue-dark)]">{EDITORIAL.name}</strong>
        ({EDITORIAL.role}) 1인이 운영합니다. 서비스는 무료이며 운영·서버 비용은 광고 수익으로 충당합니다.
        회원가입·결제 기능은 제공하지 않으며, 특정 매물을 중개하거나 광고하지 않습니다.
        문의는{' '}
        <a href={`mailto:${EDITORIAL.email}`} className="underline hover:text-[var(--color-blue-dark)]">
          {EDITORIAL.email}
        </a>
        으로 받습니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">데이터 수집·검증 방법</h2>
      <p className="mt-3 text-[var(--color-text)]">
        각 정보는 공공기관의 원본 데이터를 API·공개 파일로 수집해 자체적으로 정제·결합한 뒤,
        페이지마다 출처와 데이터 기준일을 함께 표기합니다. 실거래가처럼 원본이 갱신되는 데이터는
        정기적으로 재수집하며, 신고 지연 등으로 최신성·정확성을 100% 보장하기 어려운 항목은 해당
        페이지에 명시합니다. 사용한 공공데이터 목록과 출처는{' '}
        <Link href="/data-source" className="underline">데이터 안내</Link>에서 확인할 수 있습니다.
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
