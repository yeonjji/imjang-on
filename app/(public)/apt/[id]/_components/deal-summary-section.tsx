import type { Property } from '@prisma/client';
import { formatBillion } from '@/lib/format';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { signedPct, type VolumeCompare, type RentCompare } from '@/lib/apt-region/compare';

const ITEMS = [
  {
    icon: '📌',
    title: '최근 매매가',
    getValue: (p: Property) =>
      p.saleLastPrice
        ? `${formatBillion(p.saleLastPrice)} · 12개월 평균 ${formatBillion(p.saleAvgPrice12m)}`
        : '최근 거래 없음',
  },
  {
    icon: '🔁',
    title: '거래 분위기',
    getValue: (p: Property) =>
      Number(p.txCount12m) > 0
        ? `최근 12개월 ${Number(p.txCount12m)}건 거래 발생`
        : '최근 12개월 거래 없음',
  },
  {
    icon: '🏠',
    title: '전세 흐름',
    getValue: (p: Property) =>
      p.jeonseLastDeposit
        ? `최근 전세 ${formatBillion(p.jeonseLastDeposit)} · 12개월 평균 ${formatBillion(p.jeonseAvgDeposit12m)}`
        : '최근 전세 거래 없음',
  },
  {
    icon: '💬',
    title: '월세 현황',
    getValue: (p: Property) =>
      p.wolseLastDeposit != null
        ? `보증금 ${formatBillion(p.wolseLastDeposit)} / 월 ${Number(p.wolseLastRent ?? 0).toLocaleString('ko-KR')}만원`
        : '최근 월세 거래 없음',
  },
] as const;

// volume(아파트만): 단지 매매 거래량을 직전 12개월과, 같은 기간 시군구 아파트 매매 거래량 변화와 나란히 보여준다.
export function DealSummarySection({
  property,
  id,
  volume,
  rent,
  rentGuide,
}: {
  property: Property;
  id?: string;
  volume?: VolumeCompare | null;
  /** 아파트만: 전월세 계약을 시군구와 비교(갱신계약 5건 미만이면 null). */
  rent?: RentCompare | null;
  rentGuide?: { slug: string; title: string }[];
}) {
  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">실거래가 핵심 요약</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3 rounded-2xl bg-[var(--color-soft)] p-4">
            <span className="text-xl">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-[var(--color-blue-dark)]">{item.title}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{item.getValue(property)}</p>
              {item.title === '거래 분위기' && volume && (
                <p className="mt-1 text-sm font-semibold text-[var(--color-blue-dark)]">
                  매매 {volume.n12}건 · 직전 12개월 {volume.nPrev}건 대비 {signedPct(volume.changePct)}
                  {volume.region && (
                    <span className="font-normal text-[var(--color-muted)]">
                      {' '}({volume.region.label} 아파트 {signedPct(volume.region.changePct)})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {rent && (
        <div className="mt-3 rounded-2xl border border-[var(--color-line)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">전월세 계약, {rent.label}와 비교</h3>
            <span className="text-xs text-[var(--color-muted)]">최근 12개월 전월세 {rent.rent}건</span>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-muted)]">
                <th className="pb-1 font-semibold"><span className="sr-only">항목</span></th>
                <th className="whitespace-nowrap pb-1 text-right font-semibold">이 단지</th>
                <th className="break-keep pb-1 pl-2 text-right font-semibold">{rent.label}</th>
              </tr>
            </thead>
            <tbody>
              {rent.rows.map((r) => (
                <tr key={r.label} className="border-t border-[var(--color-line)]">
                  <th scope="row" className="break-keep py-2 pr-2 text-left font-normal text-[var(--color-text)]">{r.label}</th>
                  <td className="whitespace-nowrap py-2 text-right font-bold text-[var(--color-blue-dark)]">
                    {r.own}
                    {r.ownN != null && <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">({r.ownN}건)</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-2 text-right text-[var(--color-text)]">{r.region ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 break-keep text-sm leading-relaxed text-[var(--color-text)]">{rent.summary}</p>
          {rentGuide?.map((g) => (
            <Link key={g.slug} href={`/guide/${g.slug}`} className="mt-2 block text-sm font-bold text-[var(--color-blue)] hover:underline">
              관련 분석 · {g.title} →
            </Link>
          ))}
          <p className="mt-2 text-xs text-[var(--color-muted)]">출처: 국토교통부 실거래가 공개시스템 · 계약구분·갱신요구권은 신고 항목 기준</p>
        </div>
      )}
    </Card>
  );
}
