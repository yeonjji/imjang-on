import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import type { HubSummaryData } from '@/lib/hub-summary/types';

export function HubSummary({ data }: { data: HubSummaryData | null }) {
  if (!data) return null;
  const lines = buildHubSummaryLines(data);
  if (lines.length === 0) return null;
  return (
    <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--color-muted)]">
      {lines.join(' ')}
    </p>
  );
}
