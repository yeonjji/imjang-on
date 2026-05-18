import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '데이터 출처',
  alternates: { canonical: '/data-source' },
};

export default function DataSourcePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">데이터 출처 및 면책</h1>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>국토교통부 실거래가 공개 API (apis.data.go.kr/1613000) — 매매·전월세 실거래가</li>
        <li>행정안전부 법정동코드 (data.go.kr 15077871) — 지역 코드 체계</li>
        <li>카카오 로컬 API — 주소 좌표 변환</li>
      </ul>
      <p className="mt-6 text-[var(--color-muted)]">
        본 사이트의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연(통상 30일 이내)으로 인해 최신성·정확성을 100% 보장하지 않습니다.
      </p>
    </article>
  );
}
