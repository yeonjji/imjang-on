import { Card } from '@/components/ui/card';
import { formatDate, formatMoveInYm } from '@/lib/format';
import type { SubscriptionDetail } from '@/lib/subscription';

export function ScheduleTimeline({ notice }: { notice: SubscriptionDetail }) {
  const steps: { label: string; value: string }[] = [
    { label: '모집공고', value: formatDate(notice.noticeDate) },
    { label: '접수 시작', value: formatDate(notice.receiptBegin) },
    { label: '접수 마감', value: formatDate(notice.receiptEnd) },
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
          <li key={s.label} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] pb-3 last:border-0 last:pb-0">
            <span className="shrink-0 text-sm font-semibold text-[var(--color-muted)]">{s.label}</span>
            <span className="break-keep text-right text-sm font-bold text-[var(--color-blue-dark)]">
              {s.value}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
