import { Card } from '@/components/ui/card';

export function Phase2Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <Card className="!bg-[var(--color-soft)]">
      <p className="text-sm font-semibold text-[var(--color-blue-dark)]">🚧 {title}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>
    </Card>
  );
}
