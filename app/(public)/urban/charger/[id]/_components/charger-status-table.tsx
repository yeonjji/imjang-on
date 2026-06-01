import { Card } from '@/components/ui/card';
import type { EvChargerUnit } from '@prisma/client';
import type { ChargerUnitStatus } from '@/lib/urban/ev-status';

const STAT_ICON: Record<string, string> = {
  '1': '🟢',
  '2': '🔴',
  '3': '⚫',
  '4': '🟡',
  '9': '⚪',
};

const CHGER_TYPE_LABELS: Record<string, string> = {
  '01': 'DC차데모',
  '02': 'AC완속',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
};

interface Props {
  units: EvChargerUnit[];
  statuses: ChargerUnitStatus[];
  lastUpdated: string | null;
}

export function ChargerStatusTable({ units, statuses, lastUpdated }: Props) {
  const statusMap = new Map(statuses.map((s) => [s.chgerId, s]));

  return (
    <Card id="status">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">⚡ 실시간 충전기 현황</h2>
        {lastUpdated && (
          <span className="text-xs text-[var(--color-muted)]">업데이트: {lastUpdated}</span>
        )}
      </div>

      {/* 데스크탑: 테이블 */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
              <th className="pb-2 font-semibold">충전기</th>
              <th className="pb-2 font-semibold">타입</th>
              <th className="pb-2 font-semibold">상태</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => {
              const s = statusMap.get(unit.chgerId);
              const statLabel = s?.statLabel ?? '미확인';
              const icon = STAT_ICON[s?.stat ?? '9'];
              return (
                <tr key={unit.id.toString()} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="py-2.5 font-medium">{unit.chgerId}번</td>
                  <td className="py-2.5 text-[var(--color-muted)]">
                    {unit.isFast ? '급속' : '완속'}
                    <span className="ml-1 text-xs">({CHGER_TYPE_LABELS[unit.chgerType] ?? unit.chgerType})</span>
                  </td>
                  <td className="py-2.5">{icon} {statLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 */}
      <div className="flex flex-col gap-3 md:hidden">
        {units.map((unit) => {
          const s = statusMap.get(unit.chgerId);
          const statLabel = s?.statLabel ?? '미확인';
          const icon = STAT_ICON[s?.stat ?? '9'];
          return (
            <div key={unit.id.toString()} className="rounded-xl border border-[var(--color-line)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--color-blue-dark)]">
                  {unit.chgerId}번 · {unit.isFast ? '급속' : '완속'}
                </span>
                <span className="text-sm">{icon} {statLabel}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {CHGER_TYPE_LABELS[unit.chgerType] ?? unit.chgerType}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
