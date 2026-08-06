import { formatHospitalHours } from '@/lib/hospital/utils';
import type { HospitalWithRelations } from '@/lib/hospital';

const DAYS = [
  { label: '월', open: 'openMon', close: 'closeMon' },
  { label: '화', open: 'openTue', close: 'closeTue' },
  { label: '수', open: 'openWed', close: 'closeWed' },
  { label: '목', open: 'openThu', close: 'closeThu' },
  { label: '금', open: 'openFri', close: 'closeFri' },
  { label: '토', open: 'openSat', close: 'closeSat' },
  { label: '일', open: 'openSun', close: 'closeSun' },
] as const;

interface Props {
  detail: HospitalWithRelations['detail'];
  transits: HospitalWithRelations['transits'];
}

export function HospitalTabOperation({ detail, transits }: Props) {
  if (!detail && !transits.length) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">운영·교통 정보가 등록되어 있지 않습니다.</p>;
  }
  // 신뢰할 수 있는 구간이 없는 요일은 생략한다(모순 값을 '휴진'으로 단정하지 않는다).
  const dayHours = detail
    ? DAYS.map(d => ({ label: d.label, hours: formatHospitalHours(detail[d.open], detail[d.close]) }))
        .filter((d): d is typeof d & { hours: string } => d.hours != null)
    : [];
  const hasHourInfo =
    dayHours.length > 0 ||
    !!(detail?.lunchWeekday || detail?.lunchSaturday || detail?.closedSunday || detail?.closedHoliday);
  return (
    <div className="flex flex-col gap-6">
      {detail && (
        <>
          {hasHourInfo && (
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료시간</h3>
              {dayHours.length > 0 && (
                <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
                  {dayHours.map(d => (
                    <div key={d.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="w-6 font-semibold text-[var(--color-blue-dark)]">{d.label}</span>
                      <span className="text-[var(--color-muted)]">{d.hours}</span>
                    </div>
                  ))}
                </div>
              )}
              {detail.lunchWeekday && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">점심(평일): {detail.lunchWeekday}</p>
              )}
              {detail.lunchSaturday && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">점심(토요일): {detail.lunchSaturday}</p>
              )}
              {detail.closedSunday && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">일요일: {detail.closedSunday}</p>
              )}
              {detail.closedHoliday && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">공휴일: {detail.closedHoliday}</p>
              )}
            </section>
          )}

          {(detail.erDayOpen != null || detail.erNightOpen != null) && (
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">응급실</h3>
              <div className="flex flex-col gap-2 text-sm">
                {detail.erDayOpen != null && (
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-[var(--color-muted)]">주간</span>
                    <span className={detail.erDayOpen === 'Y' ? 'font-semibold text-green-600' : 'text-red-500'}>
                      {detail.erDayOpen === 'Y' ? '운영' : '미운영'}
                    </span>
                    {detail.erDayTel1 && <span className="text-[var(--color-muted)]">{detail.erDayTel1}</span>}
                  </div>
                )}
                {detail.erNightOpen != null && (
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-[var(--color-muted)]">야간</span>
                    <span className={detail.erNightOpen === 'Y' ? 'font-semibold text-green-600' : 'text-red-500'}>
                      {detail.erNightOpen === 'Y' ? '운영' : '미운영'}
                    </span>
                    {detail.erNightTel1 && <span className="text-[var(--color-muted)]">{detail.erNightTel1}</span>}
                  </div>
                )}
              </div>
            </section>
          )}

          {detail.parkingCapacity != null && (
            <section>
              <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">주차</h3>
              <p className="text-sm">
                {detail.parkingCapacity.toLocaleString()}대
                {detail.parkingFee != null && ` · ${detail.parkingFee === 'Y' ? '유료' : '무료'}`}
              </p>
              {detail.parkingNote && (
                <p className="mt-1 text-xs text-[var(--color-muted)]">{detail.parkingNote}</p>
              )}
            </section>
          )}
        </>
      )}

      {transits.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">교통편</h3>
          <ul className="divide-y divide-[var(--color-line)]">
            {transits.map(t => (
              <li key={String(t.id)} className="py-2.5 text-sm">
                <p className="font-semibold">
                  {t.transitName}{t.routeNumber ? ` (${t.routeNumber})` : ''}
                </p>
                <p className="text-[var(--color-muted)]">
                  {[t.stopPoint, t.direction, t.distance].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
