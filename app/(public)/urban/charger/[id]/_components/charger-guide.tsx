import { Card } from '@/components/ui/card';
import { chargerGuideItems, type ChargerGuideRaw } from '@/lib/urban/charger-display';


export function ChargerGuide({
  raw,
  units,
}: {
  raw: ChargerGuideRaw;
  units: { outputKw?: number | null; installYear?: number | null }[];
}) {
  const { tiles, rows: shownRows } = chargerGuideItems(raw, units);
  if (tiles.length === 0 && shownRows.length === 0) return null;

  return (
    <Card id="guide">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">이용 안내</h2>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
              <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
              <p className="mt-1.5 text-base font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
            </div>
          ))}
        </div>
      )}
      {shownRows.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {shownRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-[var(--color-line)] pb-2.5">
              <dt className="shrink-0 text-sm text-[var(--color-muted)]">{k}</dt>
              <dd className="text-right text-sm font-semibold text-[var(--color-text)]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
