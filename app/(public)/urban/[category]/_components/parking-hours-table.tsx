import { Card } from '@/components/ui/card';
import { formatHourRange, hasAnyHours } from '@/lib/urban/parking-hours';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

export function ParkingHoursTable({ row }: { row: ParkingRaw }) {
  const hours = {
    weekdayOpen: row.weekdayOpenHhmm, weekdayClose: row.weekdayCloseHhmm,
    satOpen: row.satOpenHhmm, satClose: row.satCloseHhmm,
    holidayOpen: row.holidayOpenHhmm, holidayClose: row.holidayCloseHhmm,
  };
  if (!hasAnyHours(hours)) return null;

  const rows = [
    { label: '평일',   value: formatHourRange(row.weekdayOpenHhmm, row.weekdayCloseHhmm) ?? '운영 안 함' },
    { label: '토요일', value: formatHourRange(row.satOpenHhmm, row.satCloseHhmm) ?? '운영 안 함' },
    { label: '공휴일', value: formatHourRange(row.holidayOpenHhmm, row.holidayCloseHhmm) ?? '운영 안 함' },
  ];

  return (
    <Card id="hours">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">운영시간</h2>
      {row.operDay && (
        <p className="mb-3 inline-block rounded-full bg-[var(--color-sky-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-blue)]">
          운영 요일: {row.operDay}
        </p>
      )}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-[var(--color-line)] last:border-b-0">
              <th className="w-20 py-2.5 text-left font-normal text-[var(--color-muted)]">{r.label}</th>
              <td className="py-2.5 font-semibold text-[var(--color-blue-dark)]">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
