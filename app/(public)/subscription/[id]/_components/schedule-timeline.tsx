import { Card } from '@/components/ui/card';
import { formatDate, formatMoveInYm } from '@/lib/format';
import type { SubscriptionDetail } from '@/lib/subscription';
import { aptSchedule, type RankSchedule } from '@/lib/subscription/apt-detail';

type Step = { label: string; value: string; rank?: RankSchedule };

export function ScheduleTimeline({ notice }: { notice: SubscriptionDetail }) {
  // APT는 접수 시작/마감 두 줄 대신 특별공급·1순위·2순위로 나눠 보여준다(rawJson, lib/subscription/apt-detail.ts).
  // 다른 유형은 세부 일정 필드가 없어 기존 표시 그대로.
  const apt = aptSchedule(notice.category, notice.rawJson);
  const receipt: Step[] = apt
    ? [
        ...(apt.special ? [{ label: '특별공급 접수', value: apt.special }] : []),
        ...(apt.rank1 ? [{ label: '일반공급 1순위', value: apt.rank1.value ?? '', rank: apt.rank1 }] : []),
        ...(apt.rank2 ? [{ label: '일반공급 2순위', value: apt.rank2.value ?? '', rank: apt.rank2 }] : []),
      ]
    : [
        { label: '접수 시작', value: formatDate(notice.receiptBegin) },
        { label: '접수 마감', value: formatDate(notice.receiptEnd) },
      ];

  const steps: Step[] = [
    { label: '모집공고', value: formatDate(notice.noticeDate) },
    ...receipt,
    { label: '당첨자 발표', value: formatDate(notice.winnerDate) },
    {
      label: '계약',
      value:
        notice.contractBegin || notice.contractEnd
          ? `${formatDate(notice.contractBegin)} ~ ${formatDate(notice.contractEnd)}`
          : '-',
    },
    { label: '입주 예정', value: formatMoveInYm(notice.moveInYm) },
  ];

  return (
    <Card id="schedule">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">청약 일정</h2>
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.label} className="flex flex-col gap-2 border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-sm font-semibold text-[var(--color-muted)]">{s.label}</span>
              {s.value && (
                <span className="break-keep text-right text-sm font-bold text-[var(--color-blue-dark)]">{s.value}</span>
              )}
            </div>
            {/* 세부 지역 날짜가 서로 다를 때만 펼친다 — 같으면 위 한 줄로 충분하다. */}
            {s.rank && s.rank.value === null && (
              <ul className="flex flex-col gap-1.5 rounded-xl bg-[var(--color-soft)] px-4 py-2.5">
                {s.rank.areas.map((a) => (
                  <li key={a.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--color-text)]">{a.label}</span>
                    <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">{a.value}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
