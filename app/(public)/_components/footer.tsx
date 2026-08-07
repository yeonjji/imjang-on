import Link from 'next/link';
import { EDITORIAL } from '@/lib/editorial';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)] bg-white">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-12 md:grid-cols-4">
        <div>
          <p className="text-lg font-black text-[var(--color-blue-dark)]">임장ON</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            공공데이터 기반 부동산 실거래가 통합 정보
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">서비스</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <li><Link href="/">홈</Link></li>
            <li><Link href="/list">실거래가</Link></li>
            <li><Link href="/list?type=apt">아파트</Link></li>
            <li><Link href="/list?type=officetel">오피스텔</Link></li>
            <li><Link href="/list?type=villa">연립·다세대</Link></li>
            <li><Link href="/subscription">청약</Link></li>
            <li><Link href="/finance">서민금융 대출</Link></li>
            <li><Link href="/jeonse-guarantee">전세보증</Link></li>
            <li><Link href="/school">교육시설</Link></li>
            <li><Link href="/medical/hospital">의료시설</Link></li>
            <li><Link href="/amenity/convenience">상권·편의</Link></li>
            <li><Link href="/urban/parking">도시인프라</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">데이터 출처</p>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>국토교통부 실거래가</li>
            <li>한국부동산원 청약홈</li>
            <li>건강보험심사평가원·교육부 등</li>
            <li><Link href="/data-source" className="underline">전체 출처 보기</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">법적 안내</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/about">서비스 소개</Link></li>
            <li><Link href="/data-source">데이터 안내</Link></li>
            <li><Link href="/faq">자주 묻는 질문</Link></li>
            <li><Link href="/terms">이용약관</Link></li>
            <li><Link href="/privacy">개인정보 처리방침</Link></li>
            <li><Link href="/contact">문의</Link></li>
            <li><Link href="/sitemap">사이트맵</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--color-line)]">
        <div className="mx-auto max-w-[1180px] px-6 py-4 text-xs text-[var(--color-muted)]">
          <p>
            © 2026 임장ON. 본 사이트는 공공데이터를 가공해 제공합니다. 실거래 신고 지연으로 최신성·정확성이 100% 보장되지 않습니다.
          </p>
          <p className="mt-1">
            문의:{' '}
            <a href={`mailto:${EDITORIAL.email}`} className="underline">
              {EDITORIAL.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
