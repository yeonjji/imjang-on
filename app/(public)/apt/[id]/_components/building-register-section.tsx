import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type { BuildingView } from '@/lib/insights/building-register';

/**
 * 아파트·오피스텔·빌라 상세 · 건축물 정보(건축물대장). UI 확정본: docs/superpowers/mockups/2026-10-20-building-register.html
 * 원자료를 그대로 보여주고 판단(전입·대출·위법·미적용)은 하지 않는다.
 */
export function BuildingRegisterSection({ view, id }: { view: BuildingView | null; id?: string }) {
  if (!view) return null;
  const v = view;
  return (
    <Card id={id}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">건축물 정보</h2>
        <span className="text-[13px] text-[var(--color-muted)]">건축물대장 기준</span>
      </div>

      {v.tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {v.tiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
              <p className="text-xs text-[var(--color-muted)]">{t.label}</p>
              <p className="mt-1 text-[18px] font-extrabold text-[var(--color-blue-dark)]">{t.value}</p>
              {t.sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{t.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {v.rows.length > 0 && (
        <dl className="mt-4 grid grid-cols-[96px_1fr] border-t border-[var(--color-line)] sm:grid-cols-[120px_1fr]">
          {v.rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="border-b border-[var(--color-soft)] px-0.5 py-2.5 text-sm text-[var(--color-muted)]">{r.label}</dt>
              <dd className="break-keep border-b border-[var(--color-soft)] px-0.5 py-2.5 text-sm leading-relaxed">
                {r.value}
                {r.note && <span className="ml-1 text-[13px] text-[var(--color-muted)]">{r.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {v.neighborhoodNotice && (
        <p className="mt-4 rounded-2xl bg-[var(--color-soft)] px-4 py-3.5 text-sm leading-relaxed">
          건축물대장 표제부에 근린생활시설 용도가 포함되어 있습니다. 실제 계약 대상 호실의 용도와 주거 이용 관련 사항은
          건축물대장 전유부 및 관계 기관을 통해 확인하시기 바랍니다.
        </p>
      )}

      <div className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          국토교통부 건축HUB 건축물대장{v.createdLabel ? ` · 대장 생성일 ${v.createdLabel}` : ''} · {v.fetchedLabel} 조회
        </p>
        {v.formula && <p className="mt-1">임장ON 계산: {v.formula}</p>}
        <SourceCaption ids={['molit-building-register']} className="mt-1" />
      </div>
    </Card>
  );
}
