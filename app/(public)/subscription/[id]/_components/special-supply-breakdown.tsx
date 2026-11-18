import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type { SpecialBreakdown } from '@/lib/subscription/apt-detail';

/**
 * 특별공급 유형별 배정 세대수(청약홈 APT 주택형 정보). 데스크톱 전용 —
 * 모바일은 UnitSupplyTable 카드 안에 주택형마다 접어 둔다.
 */
export function SpecialSupplyBreakdown({ data }: { data: SpecialBreakdown | null }) {
  if (!data) return null;
  const cell = 'whitespace-nowrap px-2.5 py-2.5 text-right';

  return (
    <Card id="special-supply" className="!p-0 hidden sm:block">
      <div className="flex items-baseline justify-between gap-3 px-6 pt-6">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">특별공급 유형별 세대수</h2>
        <span className="text-xs text-[var(--color-muted)]">특별공급 합계 {data.total.toLocaleString('ko-KR')}세대</span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-[var(--color-line)] text-xs text-[var(--color-muted)]">
              <th className="px-6 py-3 text-left font-semibold">주택형</th>
              {data.columns.map((c, i) => (
                <th key={c} className={`${cell} font-semibold ${i === data.columns.length - 1 ? 'pr-6' : ''}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.houseType} className="border-b border-[var(--color-line)]">
                <td className="whitespace-nowrap px-6 py-2.5 font-semibold text-[var(--color-blue-dark)]">{r.houseType}</td>
                {r.counts.map((n, i) => (
                  <td key={data.columns[i]} className={`${cell} ${i === r.counts.length - 1 ? 'pr-6' : ''}`}>
                    {n.toLocaleString('ko-KR')}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-[var(--color-soft)] font-bold text-[var(--color-blue-dark)]">
              <td className="px-6 py-2.5">합계</td>
              {data.totals.map((n, i) => (
                <td key={data.columns[i]} className={`${cell} ${i === data.totals.length - 1 ? 'pr-6' : ''}`}>
                  {n.toLocaleString('ko-KR')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-6 pt-3 text-xs text-[var(--color-muted)]">
        청약홈이 공개한 유형별 배정 세대수입니다. 세대수가 0인 유형은 뺐습니다. 미달 물량은 다른 유형이나
        일반공급으로 넘어갈 수 있어, 최종 배정은 공고문을 확인하세요.
      </p>
      <div className="px-6 pb-5">
        <SourceCaption ids={['applyhome']} />
      </div>
    </Card>
  );
}
