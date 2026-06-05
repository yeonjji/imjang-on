import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { SubscriptionDetail } from '@/lib/subscription';

function moveIn(ym: string | null): string {
  if (!ym || ym.length !== 6) return '-';
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

export function SubscriptionSidebar({ notice }: { notice: SubscriptionDetail }) {
  const info: { label: string; value: string }[] = [
    { label: '총 공급', value: notice.totalSupply ? `${notice.totalSupply.toLocaleString('ko-KR')}세대` : '-' },
    {
      label: '접수기간',
      value:
        notice.receiptBegin || notice.receiptEnd
          ? `${formatDate(notice.receiptBegin)} ~ ${formatDate(notice.receiptEnd)}`
          : '-',
    },
    { label: '당첨발표', value: formatDate(notice.winnerDate) },
    { label: '입주예정', value: moveIn(notice.moveInYm) },
  ];

  return (
    <div className="sticky top-24 flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">청약 정보</h3>
          <Badge tone="gray">{notice.source === 'LH_PRESUB' ? 'LH' : '청약홈'}</Badge>
        </div>
        <ul className="space-y-2 text-sm">
          {info.map((i) => (
            <li key={i.label} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[var(--color-muted)]">{i.label}</span>
              <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">
                {i.value}
              </span>
            </li>
          ))}
          {notice.tel && (
            <li className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-[var(--color-muted)]">문의</span>
              <span className="break-keep text-right font-semibold text-[var(--color-blue-dark)]">
                {notice.tel}
              </span>
            </li>
          )}
        </ul>
      </Card>

      {(notice.noticeUrl || notice.homepage) && (
        <Card>
          <h3 className="mb-3 text-sm font-bold text-[var(--color-blue-dark)]">공고 바로가기</h3>
          <ul className="flex flex-col gap-2">
            {notice.noticeUrl && (
              <li>
                <a
                  href={notice.noticeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
                >
                  공고문 원문 보기
                </a>
              </li>
            )}
            {notice.homepage && (
              <li>
                <a
                  href={notice.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-[var(--color-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--color-blue-dark)] transition-colors hover:bg-[var(--color-line)]"
                >
                  분양 홈페이지
                </a>
              </li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
