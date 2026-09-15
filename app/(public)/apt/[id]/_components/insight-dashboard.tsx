import type { DisplayUnit, Narrative } from '@/lib/insights/shared';

/**
 * 아파트 전용 「한눈에 보기」 대시보드.
 * 값은 모듈이 완성해 넘긴 문자열을 그대로 쓴다 — 여기서 파싱하거나 재계산하지 않는다.
 * 나머지 6종(빌라·오피스텔·어린이집·병원·학교·도시생활)은 components/ui/insight-section.tsx를
 * 계속 쓴다. 그 파일은 건드리지 않는다.
 */
export function InsightDashboard({ narrative }: { narrative: Narrative }) {
  const { sentences, display = [], badges = [] } = narrative;
  if (sentences.length === 0) return null;

  const tiles = display.filter((u): u is Extract<DisplayUnit, { shape: 'tile' }> => u.shape === 'tile');
  const blocks = display.filter((u) => u.shape === 'chips' || u.shape === 'card');
  const alerts = display.filter((u): u is Extract<DisplayUnit, { shape: 'alert' }> => u.shape === 'alert');

  return (
    <section
      aria-label="한눈에 보기"
      className="mt-5 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-soft)] p-5 sm:p-6"
    >
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">한눈에 보기</h2>

      <p className="break-keep text-[15px] leading-relaxed text-[var(--color-text)]">{sentences[0]}</p>

      {badges.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {badges.map((b) => (
            <li
              key={b}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-1 text-xs font-bold text-[var(--color-blue-dark)]"
            >
              {b}
            </li>
          ))}
        </ul>
      )}

      {tiles.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-row">
          {tiles.map((t) => (
            <div
              key={t.key}
              className="flex-1 rounded-[var(--radius-card)] bg-[var(--color-card)] p-4"
            >
              <p className="text-xs text-[var(--color-muted)]">{t.label}</p>
              <p
                className={`mt-1 text-xl font-bold ${
                  t.tone === 'up'
                    ? 'text-[var(--color-red)]'
                    : t.tone === 'down'
                      ? 'text-[var(--color-blue)]'
                      : 'text-[var(--color-blue-dark)]'
                }`}
              >
                {t.value}
              </p>
              {t.sub && <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">{t.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div className="mt-3 flex flex-col gap-3">
          {blocks.map((b) => (
            <div key={b.key} className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-4">
              <p className="text-xs font-bold text-[var(--color-blue-dark)]">{b.label}</p>
              {b.shape === 'chips' ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {b.chips.map((c) => (
                    <li
                      key={c.label}
                      className="rounded-full bg-[var(--color-soft)] px-3 py-1 text-sm text-[var(--color-text)]"
                    >
                      {c.label} {c.value}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="mt-1 text-[17px] font-bold text-[var(--color-blue-dark)]">{b.value}</p>
                  {b.sub && <p className="mt-0.5 break-keep text-xs text-[var(--color-muted)]">{b.sub}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {alerts.map((a) => (
        <div
          key={a.key}
          className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)] p-4"
        >
          <p className="text-xs font-bold text-[var(--color-blue-dark)]">{a.label}</p>
          <p className="mt-1 break-keep text-sm text-[var(--color-text)]">{a.value}</p>
          {a.sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{a.sub}</p>}
        </div>
      ))}
    </section>
  );
}
