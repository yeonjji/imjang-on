import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import { getHubGuide } from '@/lib/hub-summary/guides';
import type { HubSummaryData } from '@/lib/hub-summary/types';

export function HubIntro({ summary, category }: { summary: HubSummaryData | null; category: string }) {
  const lines = summary ? buildHubSummaryLines(summary) : [];
  const guide = getHubGuide(category);
  if (lines.length === 0 && !guide) return null;
  return (
    <div className="mt-3 flex flex-col gap-3 md:flex-row md:gap-6">
      {lines.length > 0 && (
        <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--color-muted)] md:flex-1">
          {lines.join(' ')}
        </p>
      )}
      {guide && (
        <p className="max-w-[70ch] border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)] md:flex-1 md:border-l md:border-t-0 md:pt-0 md:pl-6">
          {guide}
        </p>
      )}
    </div>
  );
}
