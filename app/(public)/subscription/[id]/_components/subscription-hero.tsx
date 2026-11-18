import { Badge } from '@/components/ui/badge';
import {
  categoryLabel,
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  type SubscriptionDetail,
} from '@/lib/subscription';
import { aptNoticeBadges } from '@/lib/subscription/apt-detail';

export function SubscriptionHero({ notice }: { notice: SubscriptionDetail }) {
  const st = deriveStatus(notice.receiptBegin, notice.receiptEnd);
  const dday = ddayLabel(st);
  const facts = aptNoticeBadges(notice.category, notice.rawJson);

  return (
    <div className="flex items-center gap-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow-soft)] md:p-7">
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[var(--color-line)] bg-[var(--color-sky-soft)] text-2xl md:h-16 md:w-16 md:text-3xl">📋</div>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="blue" className="whitespace-nowrap">
            {categoryLabel(notice.category)}
          </Badge>
          <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
            {STATUS_LABEL[st.status]}
            {dday ? ` · ${dday}` : ''}
          </Badge>
        </div>
        <h1 className="break-keep text-2xl font-black tracking-tight text-[var(--color-blue-dark)] md:text-3xl">{notice.name}</h1>
        <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
          {notice.regionName ?? '지역 미정'}
          {notice.developer ? ` · 시행 ${notice.developer}` : ''}
        </p>
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed border-[var(--color-line)] pt-3">
            {facts.map((f) => (
              <Badge key={f} tone="gray" className="whitespace-nowrap">
                {f}
              </Badge>
            ))}
            <span className="pl-1 text-xs text-[var(--color-muted)]">청약홈 공고 기준</span>
          </div>
        )}
      </div>
    </div>
  );
}
