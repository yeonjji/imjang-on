import type { HospitalWithRelations } from '@/lib/hospital';
import type { HoursView } from '@/lib/hospital/hours';

interface Props {
  detail: HospitalWithRelations['detail'];
  transits: HospitalWithRelations['transits'];
  /** 진료시간 표시 우선순위(심평원 우선, 없으면 국립중앙의료원) — lib/hospital/hours.ts */
  hours: HoursView | null;
  tel: string | null;
}

// 조회일은 한국 날짜로(수집은 토 19:00 UTC = 일 04:00 KST).
const ymd = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(d));

export function HospitalTabOperation({ detail, transits, hours, tel }: Props) {
  if (!detail && !transits.length && !hours) {
    return <p className="py-8 text-center text-sm text-[var(--color-muted)]">운영·교통 정보가 등록되어 있지 않습니다.</p>;
  }
  // 국립중앙의료원 출처가 아니면 심평원 문구를 그대로 둔다(시간이 아예 없어도 점심·휴진 문구는 기존처럼).
  const hira = hours?.source !== 'nemc';
  const days = hours?.days ?? [];
  // 점심·일요일·공휴일 휴진 문구는 심평원 값이라 심평원 출처일 때만 보인다(출처를 섞지 않는다).
  const hasHourInfo =
    days.length > 0 ||
    !!hours?.note ||
    (hira && !!(detail?.lunchWeekday || detail?.lunchSaturday || detail?.closedSunday || detail?.closedHoliday));
  return (
    <div className="flex flex-col gap-6">
      {hasHourInfo && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">진료시간</h3>
          {days.length > 0 && (
            <div className="divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
              {days.map(d => (
                <div key={d.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-semibold text-[var(--color-blue-dark)]">{d.label}</span>
                  <span className="text-[var(--color-muted)]">{d.hours}</span>
                </div>
              ))}
            </div>
          )}
          {hira && detail?.lunchWeekday && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">점심(평일): {detail.lunchWeekday}</p>
          )}
          {hira && detail?.lunchSaturday && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">점심(토요일): {detail.lunchSaturday}</p>
          )}
          {hira && detail?.closedSunday && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">일요일: {detail.closedSunday}</p>
          )}
          {hira && detail?.closedHoliday && (
            <p className="mt-1 text-xs text-[var(--color-muted)]">공휴일: {detail.closedHoliday}</p>
          )}
          {hours?.source === 'nemc' && (
            <>
              {hours.note && <p className="mt-2 text-sm">안내: {hours.note}</p>}
              <p className="mt-2 break-keep text-xs leading-relaxed text-[var(--color-muted)]">
                출처: 국립중앙의료원 전국 병·의원 찾기{hours.fetchedAt ? ` · ${ymd(hours.fetchedAt)} 조회` : ''}
                <br />
                진료시간은 바뀔 수 있으니 방문 전 {tel ? `전화(${tel})로` : '전화로'} 확인하세요.
              </p>
            </>
          )}
        </section>
      )}

      {detail && (
        <>
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
