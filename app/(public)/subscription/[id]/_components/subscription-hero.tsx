import { Badge } from '@/components/ui/badge';
import {
  categoryLabel,
  deriveStatus,
  ddayLabel,
  STATUS_LABEL,
  STATUS_TONE,
  type SubscriptionDetail,
} from '@/lib/subscription';

export function SubscriptionHero({ notice }: { notice: SubscriptionDetail }) {
  const st = deriveStatus(notice.receiptBegin, notice.receiptEnd);
  const dday = ddayLabel(st);

  return (
    <div className="flex min-h-[180px] items-end rounded-[26px] bg-gradient-to-br from-[#1e3a8a] to-[#38bdf8] p-7 text-white sm:p-8">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-block whitespace-nowrap rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            {categoryLabel(notice.category)}
          </span>
          <Badge tone={STATUS_TONE[st.status]} className="whitespace-nowrap">
            {STATUS_LABEL[st.status]}
            {dday ? ` · ${dday}` : ''}
          </Badge>
        </div>
        <h1 className="break-keep text-2xl font-black tracking-tight sm:text-4xl">{notice.name}</h1>
        <p className="mt-2 break-keep text-sm text-white/80">
          {notice.regionName ?? '지역 미정'}
          {notice.developer ? ` · 시행 ${notice.developer}` : ''}
        </p>
      </div>
    </div>
  );
}
