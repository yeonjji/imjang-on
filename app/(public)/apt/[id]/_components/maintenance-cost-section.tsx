import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import { won, manWon, kstDate, type MaintenanceView, type CostItem } from '@/lib/insights/maintenance-cost';

/**
 * 아파트 상세 · 관리비. UI 확정본: https://claude.ai/artifact/RAyfGp18iJhwWo5ppo24nr
 * 단지 간 비교는 공용관리비 ㎡당만 한다. 장기수선충당금은 숫자만 보여주고 평가하지 않는다.
 */
export function MaintenanceCostSection({ view, id }: { view: MaintenanceView | null; id?: string }) {
  if (!view) return null;
  const v = view;
  const unit = v.perHousehold ? '세대당' : '단지 전체';

  return (
    <Card id={id}>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">관리비</h2>
        <span className="text-[13px] text-[var(--color-muted)]">
          {[`${v.monthLabel} 부과분`, v.heatType, v.households ? `${v.households.toLocaleString('ko-KR')}세대` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {v.commonPerM2 !== null ? (
          <Tile label="공용관리비 ㎡당" value={won(v.commonPerM2)} sub={`${unit} ${won(v.commonAmount)}`} />
        ) : (
          <Tile label={`공용관리비 ${unit}`} value={won(v.commonAmount)} />
        )}
        {v.comparison && (
          <Tile
            label={`${v.comparison.sigunguName} 아파트 중앙값 대비`}
            value={v.comparison.label === '비슷함' ? '비슷함' : `${Math.abs(v.comparison.pct)}% ${v.comparison.label}`}
            sub={`${v.comparison.sampleCount}개 단지 중앙값 ㎡당 ${won(v.comparison.medianPerM2)}`}
          />
        )}
        <div className="col-span-2 sm:col-span-1">
          <Tile label="이 단지 월 관리비 합계" value={`${unit} ${won(v.totalAmount)}`} sub="공용 + 개별사용료 + 장기수선충당금" />
        </div>
      </div>

      <h3 className="mt-6 text-[15px] font-bold text-[var(--color-text)]">
        항목별 내역 <span className="text-[13px] font-normal text-[var(--color-muted)]">{unit} · 0원 항목 제외</span>
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
        <ItemBars title={`공용관리비 ${won(v.commonAmount)}`} items={v.commonItems} max={v.barMax} color="bg-[var(--color-blue)]" />
        <div>
          <ItemBars title={`개별사용료 ${won(v.individualTotal)}`} items={v.individualItems} max={v.barMax} color="bg-[var(--color-blue-dark)]" />
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
            개별사용료는 단지마다 포함 항목이 달라(개별난방·한전 직접 계약 등) 다른 단지와 비교하지 않습니다.
          </p>
        </div>
      </div>

      {v.individualHeating && (
        <p className="mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-3.5 text-sm leading-relaxed">
          <strong className="text-[var(--color-blue-dark)]">개별난방 단지</strong> — 난방비가 관리비에 포함되지 않습니다.
        </p>
      )}

      {(v.trend || v.seasonal) && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {v.trend && (
            <div>
              <h3 className="text-[15px] font-bold">공용관리비 ㎡당 추이</h3>
              <Trend points={v.trend} />
              <p className="mt-1 text-[13px] text-[var(--color-muted)]">단위 원/㎡ · {v.trendRangeLabel}</p>
            </div>
          )}
          {v.seasonal && (
            <div>
              <h3 className="text-[15px] font-bold">
                겨울과 여름 <span className="text-[13px] font-normal text-[var(--color-muted)]">{unit} · {v.heatType}</span>
              </h3>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="text-[13px] text-[var(--color-muted)]">
                    <th className="border-b border-[var(--color-line)] py-2 text-left font-medium">항목</th>
                    <th className="border-b border-[var(--color-line)] py-2 text-right font-medium">{v.seasonal.winterLabel}</th>
                    <th className="border-b border-[var(--color-line)] py-2 text-right font-medium">{v.seasonal.summerLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {v.seasonal.rows.map((r) => (
                    <tr key={r.label}>
                      <td className="border-b border-[var(--color-soft)] py-2.5">{r.label}</td>
                      <td className={`border-b border-[var(--color-soft)] py-2.5 text-right ${r.winter >= r.summer ? 'font-bold text-[var(--color-blue-dark)]' : ''}`}>{won(r.winter)}</td>
                      <td className={`border-b border-[var(--color-soft)] py-2.5 text-right ${r.summer > r.winter ? 'font-bold text-[var(--color-blue-dark)]' : ''}`}>{won(r.summer)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {v.perHousehold && (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-muted)]">
          세대당 금액은 단지 전체 부과액을 세대수로 나눈 평균이라 실제 세대별 고지액과 다릅니다.
        </p>
      )}

      {v.ltr && (
        <div className="mt-6">
          <h3 className="text-[15px] font-bold">장기수선충당금</h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {v.ltr.levy !== null && (
              <Tile
                label="월 부과액 (단지 전체)"
                value={manWon(v.ltr.levy)}
                sub={[
                  v.ltr.levyPerHousehold !== null ? `세대당 ${won(v.ltr.levyPerHousehold)}` : null,
                  v.ltr.levyPerM2 !== null ? `㎡당 ${won(v.ltr.levyPerM2)}` : null,
                  // 적립요율(sPer)은 표시하지 않는다 — 0~189% 분포(2026-10-16 실측)인데 무엇에 대한 비율인지 명세에 정의가 없다.
                ].filter(Boolean).join(' · ') || undefined}
              />
            )}
            {v.ltr.balance !== null && (
              <Tile label="적립 잔액" value={manWon(v.ltr.balance)} sub={`${v.monthLabel} 말 기준`} />
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
            장기수선충당금은 승강기·외벽·배관 같은 큰 수선에 대비해 모으는 돈입니다. 적정 규모는 단지 연식과 장기수선계획에 따라 다릅니다.
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
        <p>
          국토교통부 공동주택관리정보시스템(K-apt) · 단지 관리주체 공개 자료 · {v.monthLabel} 부과분 ·{' '}
          {kstDate(v.fetchedAt)} 조회
        </p>
        <p className="mt-1">
          임장ON 계산:{' '}
          {[
            v.manageArea ? `㎡당 = 공용관리비 ÷ 관리비부과면적(${Math.round(v.manageArea).toLocaleString('ko-KR')}㎡)` : null,
            v.households ? `세대당 = 단지 부과액 ÷ ${v.households.toLocaleString('ko-KR')}세대` : null,
            v.comparison ? `구 중앙값 = 같은 달 ${v.comparison.sigunguName} 공용관리비 ㎡당의 중앙값` : null,
          ].filter(Boolean).join(' · ') || '단지 부과액 합계'}
        </p>
        <SourceCaption ids={['kapt-maintenance-cost']} className="mt-1" />
      </div>
    </Card>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="h-full rounded-2xl bg-[var(--color-soft)] p-4">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold text-[var(--color-blue-dark)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

function ItemBars({ title, items, max, color }: { title: string; items: CostItem[]; max: number; color: string }) {
  return (
    <div>
      <p className="text-[13px] font-bold text-[var(--color-blue-dark)]">{title}</p>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[88px_1fr_80px] items-center gap-2">
            <span>{i.label}</span>
            <span className="h-2 rounded-full bg-[var(--color-sky-soft)]" aria-hidden="true">
              <span className={`block h-2 rounded-full ${color}`} style={{ width: `${Math.max(1, (i.amount / max) * 100)}%` }} />
            </span>
            <span className="text-right">{won(i.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Trend({ points }: { points: { label: string; perM2: number }[] }) {
  const max = Math.max(...points.map((p) => p.perM2));
  return (
    <div className="mt-2">
      <div className="flex h-40 items-end gap-2 border-b border-[var(--color-line)]" role="img" aria-label={points.map((p) => `${p.label} ${p.perM2}원`).join(', ')}>
        {points.map((p, i) => (
          <div key={p.label + i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={`text-xs ${i === points.length - 1 ? 'font-bold text-[var(--color-blue-dark)]' : 'text-[var(--color-muted)]'}`}>{p.perM2.toLocaleString('ko-KR')}</span>
            <div
              className={`w-full rounded-t-md ${i === points.length - 1 ? 'bg-[var(--color-blue)]' : 'bg-[var(--color-sky-soft)]'}`}
              style={{ height: `${Math.round((p.perM2 / max) * 120)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-xs text-[var(--color-muted)]">
        {points.map((p, i) => <span key={p.label + i} className="flex-1 text-center">{p.label}</span>)}
      </div>
    </div>
  );
}
