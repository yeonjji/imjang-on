import { Card } from '@/components/ui/card';
import { formatBillion, formatPyeong } from '@/lib/format';
import { unitAreaBasis, areaBasisLabel } from '@/lib/subscription/unit-area-basis';
import type { SubscriptionUnit } from '@prisma/client';

// area 컬럼은 어댑터가 SUPLY_AR(공급면적) ?? EXCLUSE_AR(전용면적)로 채워 행마다 기준이 다르다
// (실측: 공급 79.8% · 전용 12.3% · NULL 7.9%). 그래서 "전용면적"으로 일괄 표기하면 거짓이 되고,
// unitAreaBasis()로 판정한 기준을 셀마다 병기한다.
function areaCell(u: SubscriptionUnit): string {
  if (u.area == null) return '-';
  const label = areaBasisLabel(unitAreaBasis(u.rawJson));
  const pyeong = formatPyeong(Number(u.area));
  return label ? `${label} ${pyeong}` : pyeong;
}
function supply(n: number | null): string {
  return n != null && n > 0 ? `${n.toLocaleString('ko-KR')}세대` : '-';
}

export function UnitSupplyTable({ units }: { units: SubscriptionUnit[] }) {
  if (units.length === 0) return null;

  return (
    <Card id="units" className="!p-0">
      <h2 className="px-6 pt-6 text-lg font-bold text-[var(--color-blue-dark)]">주택형별 공급</h2>

      {/* 데스크톱: 테이블 */}
      <table className="mt-4 hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-y border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
            <th className="px-6 py-3 font-semibold">주택형</th>
            <th className="px-4 py-3 font-semibold">면적</th>
            <th className="px-4 py-3 font-semibold">일반공급</th>
            <th className="px-4 py-3 font-semibold">특별공급</th>
            <th className="px-6 py-3 text-right font-semibold">분양가</th>
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={String(u.id)} className="border-b border-[var(--color-line)] last:border-0">
              <td className="whitespace-nowrap px-6 py-3 font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{areaCell(u)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.generalSupply)}</td>
              <td className="whitespace-nowrap px-4 py-3">{supply(u.specialSupply)}</td>
              <td className="whitespace-nowrap px-6 py-3 text-right font-bold text-[var(--color-blue-dark)]">
                {formatBillion(u.topAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 모바일: 카드 리스트 */}
      <ul className="mt-2 divide-y divide-[var(--color-line)] sm:hidden">
        {units.map((u) => (
          <li key={String(u.id)} className="px-6 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="break-keep font-semibold text-[var(--color-blue-dark)]">
                {u.houseType ?? '-'}
              </span>
              <span className="whitespace-nowrap font-bold text-[var(--color-blue-dark)]">
                {formatBillion(u.topAmount)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
              <span>{areaCell(u)}</span>
              <span>일반 {supply(u.generalSupply)}</span>
              <span>특별 {supply(u.specialSupply)}</span>
            </div>
          </li>
        ))}
      </ul>

      {/* 면적 기준(공급/전용)이 주택형마다 달라 셀마다 병기했다는 걸 밝힌다.
          분양가·실거래 비교 시 면적당 단가를 내지 않는 이유이기도 하다(price-comparison.tsx 참고). */}
      <p className="px-6 pb-4 pt-2 text-xs text-[var(--color-muted)]">
        면적은 공고 원자료에 실린 기준(공급 또는 전용)을 그대로 표기합니다. 주택형마다 기준이
        다를 수 있어, 분양가와 실거래를 비교할 때 면적당 단가는 따로 계산하지 않았습니다.
      </p>
      <div className="h-2" />
    </Card>
  );
}
