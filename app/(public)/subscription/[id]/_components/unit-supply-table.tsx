import { Card } from '@/components/ui/card';
import { formatBillion, formatPyeong } from '@/lib/format';
import type { SubscriptionUnit } from '@prisma/client';

function area(u: SubscriptionUnit): string {
  return u.area != null ? formatPyeong(Number(u.area)) : '-';
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
            <th className="px-4 py-3 font-semibold">전용면적</th>
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
              <td className="whitespace-nowrap px-4 py-3">{area(u)}</td>
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
              <span>전용 {area(u)}</span>
              <span>일반 {supply(u.generalSupply)}</span>
              <span>특별 {supply(u.specialSupply)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="h-2" />
    </Card>
  );
}
