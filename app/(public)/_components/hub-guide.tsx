import { getHubGuide } from '@/lib/hub-summary/guides';

export function HubGuide({ category }: { category: string }) {
  const text = getHubGuide(category);
  if (!text) return null;
  return (
    <p className="mt-3 max-w-[70ch] border-t border-[var(--color-line)] pt-3 text-sm leading-relaxed text-[var(--color-muted)]">
      {text}
    </p>
  );
}
