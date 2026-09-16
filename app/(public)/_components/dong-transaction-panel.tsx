'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DealType, PropertyType } from '@prisma/client';
import type { DongTransaction } from '@/lib/transaction/dong';
import type { DongOption } from '@/lib/dong-options';
import { formatDongMeta, formatDongPrice } from '@/lib/transaction/dong-format';
import { SourceCaption } from '@/components/ui/source-caption';

const PROPERTY_TYPES: { key: PropertyType; label: string }[] = [
  { key: 'APARTMENT', label: '아파트' },
  { key: 'OFFICETEL', label: '오피스텔' },
  { key: 'MULTIPLEX', label: '다세대' },
  { key: 'ROW_HOUSE', label: '연립' },
];

const DEAL_TABS: { key: DealType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

const DEAL_BADGE: Record<string, string> = {
  SALE: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)]',
  JEONSE: 'bg-[#fee2e2] text-[#b91c1c]',
  WOLSE: 'bg-[#fef3c7] text-[#b45309]',
};
const DEAL_LABEL: Record<string, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

const SLUG: Record<string, string> = {
  APARTMENT: 'apt', OFFICETEL: 'officetel', MULTIPLEX: 'villa', ROW_HOUSE: 'villa',
};

type Status = 'idle' | 'loading' | 'error';

/**
 * 홈 히어로 오른쪽의 동네 거래 패널.
 *
 * 좁은 폭이라 두 줄 압축 형태다. 상세의 표와 데이터·포맷은 공유하지만 배치는 다르다.
 * 0건이어도 패널이 사라지지 않는다 — 필터를 눌렀는데 없어지면 고장으로 읽힌다.
 */
export function DongTransactionPanel({
  initialSido,
  initialSigunguCode,
  initialSigunguName,
  initialUmd,
  initialDongs,
  initialItems,
}: {
  initialSido: string;
  initialSigunguCode: string;
  initialSigunguName: string;
  initialUmd: string;
  initialDongs: DongOption[];
  initialItems: DongTransaction[];
}) {
  const [sigunguCode] = useState(initialSigunguCode);
  const [dongs] = useState<DongOption[]>(initialDongs);
  const [umd, setUmd] = useState(initialUmd);
  const [propertyType, setPropertyType] = useState<PropertyType>('APARTMENT');
  const [deal, setDeal] = useState<DealType | 'ALL'>('ALL');
  const [items, setItems] = useState<DongTransaction[]>(initialItems);
  const [status, setStatus] = useState<Status>('idle');

  // 지역을 빠르게 바꾸면 늦게 온 이전 응답이 최신 결과를 덮을 수 있다.
  // 시퀀스로 최신 것만 반영하고 이전 요청은 취소한다.
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const first = useRef(true);

  useEffect(() => {
    // 서버가 그려 준 초기 결과를 그대로 쓴다. 마운트 직후 중복 조회를 하지 않는다.
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus('loading');

    const qs = new URLSearchParams({ sigunguCode, umd, propertyType });
    if (deal !== 'ALL') qs.set('dealType', deal);

    fetch(`/api/dong-transactions?${qs}`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((rows: DongTransaction[]) => {
        if (mine !== seq.current) return;
        setItems(rows);
        setStatus('idle');
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || mine !== seq.current) return;
        void e;
        setStatus('error');
      });

    return () => ctl.abort();
  }, [sigunguCode, umd, propertyType, deal]);

  return (
    <section
      aria-label="동네별 최근 실거래가"
      className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)] p-5"
    >
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">동네별 최근 실거래가</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">관심 지역의 거래 내역을 확인하세요</p>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
          {initialSido}
        </span>
        <span className="rounded-lg border border-[var(--color-line)] bg-[var(--color-soft)] px-3 py-2">
          {initialSigunguName}
        </span>
        <label className="sr-only" htmlFor="dong-select">읍·면·동·리</label>
        <select
          id="dong-select"
          value={umd}
          onChange={(e) => setUmd(e.target.value)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
        >
          {dongs.map((d) => (
            <option key={d.umd} value={d.umd}>{d.umd}</option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="type-select">건물 유형</label>
        <select
          id="type-select"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as PropertyType)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {DEAL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDeal(t.key)}
              aria-pressed={deal === t.key}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                deal === t.key ? 'bg-white text-[var(--color-blue-dark)]' : 'text-[var(--color-muted)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)]">
        {status === 'loading' && (
          <ul className="divide-y divide-[var(--color-line)]" aria-busy="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i} className="py-3">
                <div className="h-4 w-2/3 rounded bg-[var(--color-soft)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-soft)]" />
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">잠시 후 다시 시도해 주세요</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-blue-dark)]"
            >
              다시 시도
            </button>
          </div>
        )}

        {status === 'idle' && items.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            이 조건에 해당하는 거래가 없습니다
          </p>
        )}

        {status === 'idle' && items.length > 0 && (
          <ul className="divide-y divide-[var(--color-line)]">
            {items.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                    className="block truncate text-sm font-bold text-[var(--color-blue-dark)] hover:underline"
                  >
                    {t.propertyName}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatDongMeta(t)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${DEAL_BADGE[t.dealType]}`}>
                    {DEAL_LABEL[t.dealType]}
                  </span>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
                    {formatDongPrice(t)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SourceCaption ids={['molit-rtms']} />
    </section>
  );
}
