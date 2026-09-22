import Link from 'next/link';
import { HeroSearch } from './hero-search';
import type { PopularRegion } from '@/lib/region';
import { TypeIconGrid } from './type-icon-grid';

/**
 * 홈 히어로의 파란 박스. 검색과 보조 탐색만 담는다.
 *
 * 2열 배치(오른쪽 동네 거래 카드와 나란히)는 page.tsx의 래퍼가 정한다. 히어로가
 * 스스로 그리드가 되면 카드가 이 박스의 패딩 안에 들어가고, 그러면 박스 전체가
 * 카드 높이에 끌려 부풀어 왼쪽 아래에 죽은 여백이 남는다(실측 158px).
 */
export function HeroSection({ popularRegions }: { popularRegions: PopularRegion[] }) {
  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-gradient-to-br from-[#eaf2ff] via-[#f3f8ff] to-white p-6 md:p-10">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3.5 py-2 text-xs font-extrabold text-[var(--color-blue-dark)]">
        📍 실거래가·생활권 정보 통합 플랫폼
      </span>
      <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
        어디든, <span className="text-[var(--color-blue)]">임장ON</span>에서 바로 검색하세요
      </h1>

      <HeroSearch popularRegions={popularRegions} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/list"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-blue)] px-6 py-3.5 font-extrabold text-white"
        >
          🔍 실거래가 찾기
        </Link>
        <Link
          href="/subscription"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-6 py-3.5 font-extrabold text-[var(--color-blue-dark)]"
        >
          📅 청약 일정 보기
        </Link>
      </div>

      {/* 아이콘은 보조 탐색 수단이다. 키우지 않는다 — 커지면 검색 영역이 아래로
          길어져 오른쪽 카드와의 높이 균형이 무너진다. */}
      <div className="mt-6">
        <TypeIconGrid />
      </div>
    </section>
  );
}
