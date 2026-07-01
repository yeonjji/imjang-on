import { buildHubSummaryLines } from '@/lib/hub-summary/prose';
import { getHubGuide } from '@/lib/hub-summary/guides';
import type { HubSummaryData } from '@/lib/hub-summary/types';

export function HubIntro({ summary, category }: { summary: HubSummaryData | null; category: string }) {
  const lines = summary ? buildHubSummaryLines(summary) : [];
  const guide = getHubGuide(category);
  if (lines.length === 0 && !guide) return null;
  return (
    <div className="mt-3 flex flex-col gap-3">
      {lines.length > 0 && (
        <p className="break-keep text-sm leading-relaxed text-[var(--color-muted)]">
          {lines.join(' ')}
        </p>
      )}
      {guide && (
        <p className="break-keep border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)]">
          {guide}
        </p>
      )}
    </div>
  );
}
