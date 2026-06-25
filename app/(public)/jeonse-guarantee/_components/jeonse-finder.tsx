'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  regionRowFor,
  estimateLoanCap,
  targetMatches,
  type JeonseProductLite,
  type RegionLimitLite,
} from '@/lib/jeonse/match';
import { reqTargetLabel, prodKindLabel, formatWon } from '@/lib/jeonse/labels';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}
interface SigunguItem {
  sido: string;
  sigungu: string | null;
  sigunguCode: string | null;
}

interface Row {
  product: JeonseProductLite;
  regionMaxDeposit: number | null;
  within: boolean | null; // 보증금이 지역 한도 이내인가(지역·보증금 모두 입력 시에만)
  estMaxLoanAmt: number | null; // 한도 상한(보증금 입력 시)
}

const inputCls =
  'rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]';

const TARGETS = [
  { value: 'all', label: '전체' },
  { value: 'youth', label: '청년' },
  { value: 'newlywed', label: '신혼부부' },
] as const;

export function JeonseFinder({
  products,
  regions,
  sidoList,
  sigungus,
}: {
  products: JeonseProductLite[];
  regions: RegionLimitLite[];
  sidoList: SidoItem[];
  sigungus: SigunguItem[];
}) {
  const [sidoCode, setSidoCode] = useState('');
  const [sigunguCode, setSigunguCode] = useState('');
  const [depositMan, setDepositMan] = useState('');
  const [target, setTarget] = useState<'all' | 'youth' | 'newlywed'>('all');
  const [query, setQuery] = useState('');

  const sidoFullName = useMemo(() => sidoList.find((s) => s.code === sidoCode)?.fullName ?? '', [sidoList, sidoCode]);
  const sigunguOptions = useMemo(
    () => sigungus.filter((g) => g.sido === sidoFullName && g.sigunguCode),
    [sigungus, sidoFullName],
  );

  const lawdCd = sigunguCode ? `${sigunguCode}00000` : sidoCode;
  const depositWon = (Number(depositMan) || 0) * 10_000;

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    let list = products;
    if (q) list = list.filter((p) => p.rcmdProdNm.includes(q));
    if (target !== 'all') list = list.filter((p) => targetMatches(p.grntReqTrgtDvcd, target));

    let out: Row[];
    if (lawdCd) {
      out = [];
      for (const p of list) {
        const row = regionRowFor(regions, p.grntDvcd, lawdCd);
        if (!row) continue; // 선택 지역에서 제공 안 하는 상품 제외
        out.push({
          product: p,
          regionMaxDeposit: row.maxRentGrntAmt,
          within: depositWon > 0 ? depositWon <= row.maxRentGrntAmt : null,
          estMaxLoanAmt: depositWon > 0 ? estimateLoanCap(depositWon, p) : null,
        });
      }
    } else {
      out = list.map((p) => ({
        product: p,
        regionMaxDeposit: null,
        within: null,
        estMaxLoanAmt: depositWon > 0 ? estimateLoanCap(depositWon, p) : null,
      }));
    }

    const amt = (r: Row) => r.estMaxLoanAmt ?? r.product.maxLoanLmtAmt ?? 0;
    out.sort((a, b) => Number(b.within ?? false) - Number(a.within ?? false) || amt(b) - amt(a));
    return out;
  }, [products, regions, query, target, lawdCd, depositWon]);

  const eligibleCount = rows.filter((r) => r.within === true).length;
  const showRegionDepositHint = lawdCd !== '' && depositWon > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[20px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품명 검색 (예: 청년, 신혼)"
          className={`${inputCls} mb-4 w-full`}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
            지역(시도)
            <select
              value={sidoCode}
              onChange={(e) => {
                setSidoCode(e.target.value);
                setSigunguCode('');
              }}
              className={inputCls}
            >
              <option value="">시도 전체</option>
              {sidoList.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
            시군구(선택)
            <select
              value={sigunguCode}
              onChange={(e) => setSigunguCode(e.target.value)}
              disabled={!sidoCode}
              className={`${inputCls} disabled:opacity-50`}
            >
              <option value="">시군구 전체</option>
              {sigunguOptions.map((g) => (
                <option key={g.sigunguCode!} value={g.sigunguCode!}>
                  {g.sigungu}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
            전세보증금(만원)
            <input
              type="number"
              inputMode="numeric"
              value={depositMan}
              onChange={(e) => setDepositMan(e.target.value)}
              placeholder="예: 20000"
              className={inputCls}
            />
            <span className="text-[11px] font-normal text-[var(--color-muted)]">
              {depositWon > 0 ? formatWon(depositWon) : ' '}
            </span>
          </label>

          <div className="flex flex-col gap-1 text-xs font-semibold text-[var(--color-muted)]">
            대상
            <div className="flex gap-1">
              {TARGETS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTarget(t.value)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${
                    target === t.value
                      ? 'bg-[var(--color-blue)] text-white'
                      : 'border border-[var(--color-line)] text-[var(--color-muted)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-muted)]">
          {showRegionDepositHint ? (
            <>
              신청 가능 <strong className="text-[var(--color-blue-dark)]">{eligibleCount}</strong>개
              {rows.length - eligibleCount > 0 && <> · 보증금 한도 초과 {rows.length - eligibleCount}개</>}
            </>
          ) : (
            <>
              전체 <strong className="text-[var(--color-blue-dark)]">{rows.length}</strong>개 상품
              {lawdCd && ' (선택 지역 제공)'}
            </>
          )}
        </p>

        {rows.length === 0 ? (
          <p className="rounded-[20px] border border-[var(--color-line)] bg-white px-5 py-10 text-center text-sm text-[var(--color-muted)]">
            조건에 맞는 보증상품이 없습니다. 지역·대상 조건을 넓혀 보세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rows.map((r) => (
              <ResultCard key={r.product.grntDvcd} row={r} />
            ))}
          </div>
        )}

        <p className="rounded-xl bg-[var(--color-soft)] px-4 py-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
          한도 상한은 ‘임차보증금 × 상품별 한도비율’로 계산한 <strong>상품 기준 최대치</strong>입니다. 실제 보증·대출
          한도는 소득·부채 등 개인 상황에 따라 낮아질 수 있으며, 정확한 금액은 각 상품 안내(HF)에서 확인하세요.
        </p>
      </div>
    </div>
  );
}

function ResultCard({ row }: { row: Row }) {
  const p = row.product;
  const target = reqTargetLabel(p.grntReqTrgtDvcd);
  const kind = prodKindLabel(p.rcmdGrntProdDvcd);
  const limitLabel = row.estMaxLoanAmt != null ? '한도 상한(상품 기준)' : '상품 최대한도';
  const limitVal =
    row.estMaxLoanAmt != null
      ? formatWon(row.estMaxLoanAmt)
      : p.maxLoanLmtAmt != null
        ? formatWon(p.maxLoanLmtAmt)
        : '—';

  return (
    <Link
      href={`/jeonse-guarantee/${p.grntDvcd}`}
      className="block rounded-[18px] border border-[var(--color-line)] bg-white p-5 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-blue)]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-[var(--color-blue-dark)]">{p.rcmdProdNm}</h3>
        {kind && <Badge>{kind}</Badge>}
        {target && target !== '전체' && <Badge>{target}</Badge>}
        {row.within === true && (
          <span className="ml-auto rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
            신청 가능
          </span>
        )}
        {row.within === false && (
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            지역 한도 초과
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label={limitLabel} value={limitVal} />
        {row.regionMaxDeposit != null && <Metric label="지역 최대 보증금" value={formatWon(row.regionMaxDeposit)} />}
        <Metric label="예상 보증료율" value={p.exptGrfeRateCont ?? '—'} />
      </div>
    </Link>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--color-sky-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-blue)]">
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--color-soft)] px-3 py-2">
      <span className="mb-0.5 block text-[11px] text-[var(--color-muted)]">{label}</span>
      <strong className="block break-keep text-sm font-bold text-[var(--color-blue-dark)]">{value}</strong>
    </div>
  );
}
