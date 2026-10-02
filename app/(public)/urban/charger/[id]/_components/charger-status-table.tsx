'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  mergeUnitStatuses,
  type ChargerUnitPlain,
  type ChargerUnitStatus,
} from '@/lib/urban/ev-status-shared';

const STAT_ICON: Record<string, string> = {
  '0': '⚪',
  '1': '🔴',
  '2': '🟢',
  '3': '🔵',
  '4': '🟡',
  '5': '🔧',
};

const CHGER_TYPE_LABELS: Record<string, string> = {
  '01': 'DC차데모',
  '02': 'AC완속',
  '03': 'DC차데모+AC3상',
  '04': 'DC콤보',
  '05': 'DC차데모+DC콤보',
  '06': 'DC차데모+AC3상+DC콤보',
  '07': 'AC3상',
};

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; statuses: ChargerUnitStatus[] }
  | { kind: 'error' };

interface Props {
  units: ChargerUnitPlain[];
  statId: string;
}

/**
 * 충전기 목록은 DB 값으로 바로 보여주고, 실시간 상태는 사용자가 버튼을 누를 때만 조회한다.
 * 렌더 시점 조회는 크롤러 방문마다 외부 API 일일 한도를 소모해 월간 수집을 막았다.
 */
export function ChargerStatusTable({ units, statId }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'idle' });

  async function load() {
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/ev-status?statId=${encodeURIComponent(statId)}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { statuses: ChargerUnitStatus[] };
      setState({ kind: 'loaded', statuses: body.statuses });
    } catch {
      setState({ kind: 'error' });
    }
  }

  const loaded = state.kind === 'loaded' && state.statuses.length > 0;
  const rows = mergeUnitStatuses(units, state.kind === 'loaded' ? state.statuses : []);
  const lastUpdated = state.kind === 'loaded' ? state.statuses.find((s) => s.lastTsdt)?.lastTsdt ?? null : null;
  const fast = units.filter((u) => u.isFast).length;

  return (
    <Card id="status">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">⚡ 충전기 현황</h2>
        {loaded && lastUpdated && (
          <span className="text-xs text-[var(--color-muted)]">업데이트: {lastUpdated}</span>
        )}
      </div>

      <p className="mb-3 text-sm text-[var(--color-text)]">
        충전기 {units.length}기 ({fast}급속 / {units.length - fast}완속)
      </p>

      <ul className="flex flex-col divide-y divide-[var(--color-line)]">
        {rows.map((r) => (
          <li key={r.chgerId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium">
              {r.chgerId}번 · {r.isFast ? '급속' : '완속'}
              <span className="ml-1 text-xs text-[var(--color-muted)]">({CHGER_TYPE_LABELS[r.chgerType] ?? r.chgerType})</span>
              {r.outputKw ? <span className="ml-1 text-xs text-[var(--color-muted)]">{r.outputKw}kW</span> : null}
            </span>
            {loaded && <span>{STAT_ICON[r.stat] ?? STAT_ICON['0']} {r.statLabel}</span>}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {state.kind !== 'loaded' && (
          <button
            type="button"
            onClick={load}
            disabled={state.kind === 'loading'}
            className="rounded-full bg-[var(--color-blue)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-blue-dark)] disabled:opacity-60"
          >
            {state.kind === 'loading' ? '불러오는 중…' : '현재 충전 상태 보기'}
          </button>
        )}
        {state.kind === 'error' && (
          <p className="mt-2 text-sm text-[var(--color-text)]">실시간 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        )}
        {state.kind === 'loaded' && state.statuses.length === 0 && (
          <p className="rounded-xl bg-[var(--color-soft)] px-4 py-3 text-sm text-[var(--color-text)]">
            이 충전소는 실시간 상태 정보를 제공하지 않습니다.
          </p>
        )}
      </div>
    </Card>
  );
}
