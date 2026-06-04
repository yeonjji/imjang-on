'use client';

import Link from 'next/link';
import { HeroSearch } from './hero-search';
import { TypeIconGrid } from './type-icon-grid';

export function HeroSection() {
  function scrollToFilter() {
    document.getElementById('search-filter')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="rounded-[28px] border border-[var(--color-line)] bg-gradient-to-br from-[#eaf2ff] via-[#f3f8ff] to-white p-6 md:grid md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10 md:p-10">
      <div>
        <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3.5 py-2 text-xs font-extrabold text-[var(--color-blue-dark)]">
          📍 실거래가·생활권 정보 통합 플랫폼
        </span>
        <h1 className="text-2xl font-black leading-tight tracking-tight text-[var(--color-blue-dark)] md:text-4xl">
          어디든, <span className="text-[var(--color-blue)]">임장ON</span>에서 바로 검색하세요
        </h1>

        <HeroSearch />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={scrollToFilter}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-blue)] px-6 py-3.5 font-extrabold text-white"
          >
            🔍 실거래가 찾기
          </button>
          <Link
            href="/life"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-line)] bg-white px-6 py-3.5 font-extrabold text-[var(--color-blue-dark)]"
          >
            📍 생활편의 둘러보기
          </Link>
        </div>
      </div>

      <div className="mt-8 md:mt-0">
        <TypeIconGrid />
      </div>
    </section>
  );
}
