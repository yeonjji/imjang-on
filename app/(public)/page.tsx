import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전국 아파트·오피스텔·연립다세대 실거래가',
  description: '공공데이터 기반 전국 부동산 실거래가 통합 정보 플랫폼. 매매·전세·월세를 한눈에.',
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <section className="mx-auto max-w-[1180px] px-6 py-16">
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-sky-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-blue-dark)]">
        공공데이터 기반 · 매일 갱신
      </span>
      <h1 className="mt-5 text-4xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-5xl">
        실거래가, 한 번에 보세요
      </h1>
      <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
        아파트·오피스텔·연립다세대 매매와 전월세를 단지 단위로 정리해 보여드립니다.
      </p>
      <p className="mt-12 text-sm text-[var(--color-muted)]">
        Phase 1 placeholder — 실제 콘텐츠는 Task 66에서 채워집니다.
      </p>
    </section>
  );
}
