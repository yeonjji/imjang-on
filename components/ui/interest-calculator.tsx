'use client';

import { useId, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { LoanRateSpec } from '@/lib/loan/rate';
import {
  DEFAULT_TERM_YEARS,
  MAX_RATE,
  MIN_RATE,
  QUICK_AMOUNTS_MANWON,
  TERM_OPTIONS,
  addRate,
  bulletInterest,
  formatWonAmount,
  manwonLabel,
  parseAmountInput,
  sanitizeAmountInput,
  sanitizeRateInput,
  validateRate,
} from '@/lib/loan/interest';

export interface InterestCalculatorProps {
  /** loan: 서민금융 상세(상품 금리 자동 적용 가능) · jeonse: 맞춤 전세보증 상세(금리·금액 모두 직접 입력) */
  variant: 'loan' | 'jeonse';
  rate: LoanRateSpec;
  /** 상품 안내 금리 원문(표시용). */
  rateText?: string | null;
  /** 상품 대출한도(만원). 서민금융만 — 전세보증의 보증한도는 넘기지 않는다. */
  limitManwon?: number | null;
  variableRate?: boolean;
  mixedRepayment?: boolean;
  sourceLine?: string | null;
}

const RATE_SHOCKS = [0.5, 1.0] as const;

function initialRate(rate: LoanRateSpec): string {
  if (rate.kind === 'single') return String(rate.value);
  if (rate.kind === 'range') return String(rate.max); // 보수적으로 최고금리
  return '';
}

const chipBase =
  'min-h-[36px] rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sky)] disabled:cursor-not-allowed disabled:opacity-40';
const chipOn = 'border-[var(--color-blue)] bg-[var(--color-blue)] font-semibold text-white';
const chipOff = 'border-[var(--color-line)] bg-white text-[var(--color-muted)] hover:border-[var(--color-sky)]';
const fieldBox =
  'flex min-h-[46px] items-center rounded-xl border border-[var(--color-line)] bg-white px-4 focus-within:border-[var(--color-blue)] focus-within:ring-2 focus-within:ring-[var(--color-sky-soft)]';
const inputCls = 'min-w-0 flex-1 bg-transparent text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-muted)]';

/**
 * 만기일시상환 대출 이자 계산기(공통). 계산은 브라우저에서만 한다 — 서버 요청 없음.
 * 설계: docs/superpowers/specs/2026-11-03-loan-interest-calculator-design.md
 */
export function InterestCalculator({
  variant,
  rate,
  rateText = null,
  limitManwon = null,
  variableRate = false,
  mixedRepayment = false,
  sourceLine = null,
}: InterestCalculatorProps) {
  const id = useId();
  const [amountText, setAmountText] = useState('');
  const [rateInput, setRateInput] = useState(() => initialRate(rate));
  const [years, setYears] = useState<number>(DEFAULT_TERM_YEARS);

  const jeonse = variant === 'jeonse';
  const title = jeonse ? '전세대출 예상 이자 계산기' : '대출 이자 계산기';
  const amount = parseAmountInput(amountText);
  const rateNum = Number(rateInput);
  const rateOk = rateInput !== '' && validateRate(rateNum) === 'ok';
  const overLimit = limitManwon != null && amount > limitManwon;
  const quick = QUICK_AMOUNTS_MANWON.filter((v) => v !== limitManwon);

  let rateHint: string;
  if (jeonse) rateHint = '이 보증상품에는 대출금리가 정해져 있지 않습니다. 은행에서 안내받은 금리를 입력하세요.';
  else if (rate.kind === 'single') rateHint = `상품 안내 금리 ${rateText}를 넣었습니다. 바꿔서 계산할 수 있습니다.`;
  else if (rate.kind === 'range')
    rateHint = `상품 안내 금리 ${rateText} · 실제 금리는 소득·우대조건·은행 심사에 따라 정해집니다.`;
  else if (rateText)
    rateHint = `상품 안내 금리 '${rateText}'는 숫자 하나로 정해지지 않아 자동으로 넣지 않았습니다. 확인한 금리를 입력하세요.`;
  else rateHint = '이 상품은 안내 금리가 없어 자동으로 넣지 않았습니다. 확인한 금리를 입력하세요.';

  const result = amount > 0 && rateOk ? bulletInterest(amount, rateNum, years) : null;

  return (
    <Card id="interest-calculator" className="border border-[var(--color-line)]">
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">{title}</h2>
      <p className="mt-1 break-keep text-sm text-[var(--color-muted)]">
        만기일시상환 기준 · 매달 이자만 내고 원금은 만기에 한 번에 갚는 방식
        {mixedRepayment && (
          <>
            {' '}· 이 상품은 다른 상환방식도 있어{' '}
            <strong className="font-semibold text-[var(--color-text)]">만기일시상환을 고른 경우</strong>로
            계산합니다
          </>
        )}
      </p>

      {/* 대출금액 */}
      <div className="mt-5">
        <label htmlFor={`${id}-amount`} className="mb-1.5 block text-sm font-semibold text-[var(--color-blue-dark)]">
          대출금액
        </label>
        <div className={fieldBox}>
          <input
            id={`${id}-amount`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 10,000"
            value={amountText}
            onChange={(e) => setAmountText((prev) => sanitizeAmountInput(e.target.value, prev))}
            className={inputCls}
            aria-describedby={`${id}-amount-hint`}
          />
          <span className="text-sm text-[var(--color-muted)]">만원</span>
        </div>
        <p id={`${id}-amount-hint`} className="mt-1 min-h-[20px] text-sm text-[var(--color-muted)]">
          {amount > 0 ? manwonLabel(amount) : '최대 100억원(1,000,000만원)까지 입력할 수 있습니다.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="대출금액 빠른 선택">
          {quick.map((v) => (
            <button
              key={v}
              type="button"
              disabled={limitManwon != null && v > limitManwon}
              aria-pressed={amount === v}
              onClick={() => setAmountText(v.toLocaleString('ko-KR'))}
              className={`${chipBase} ${amount === v ? chipOn : chipOff}`}
            >
              {manwonLabel(v).replace(/원$/, '')}
            </button>
          ))}
          {limitManwon != null && (
            <button
              type="button"
              aria-pressed={amount === limitManwon}
              onClick={() => setAmountText(limitManwon.toLocaleString('ko-KR'))}
              className={`${chipBase} ${amount === limitManwon ? chipOn : chipOff}`}
            >
              상품 한도 {manwonLabel(limitManwon).replace(/원$/, '')}
            </button>
          )}
        </div>
        {limitManwon != null && (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            이 상품 대출한도 <strong className="font-semibold text-[var(--color-text)]">{manwonLabel(limitManwon)}</strong>{' '}
            (상품 안내 기준)
          </p>
        )}
        {overLimit && (
          <p
            role="status"
            className="mt-2 break-keep border-l-2 border-[var(--color-red)] pl-2 text-sm font-semibold text-[var(--color-text)]"
          >
            입력한 금액이 이 상품의 대출한도({manwonLabel(limitManwon!)})를 넘습니다. 계산은 보여 드리지만 실제 대출은
            한도 안에서만 가능합니다.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 연 금리 */}
        <div>
          <label htmlFor={`${id}-rate`} className="mb-1.5 block text-sm font-semibold text-[var(--color-blue-dark)]">
            연 금리
          </label>
          <div className={fieldBox}>
            <input
              id={`${id}-rate`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="예: 3.5"
              value={rateInput}
              onChange={(e) => setRateInput((prev) => sanitizeRateInput(e.target.value, prev))}
              className={inputCls}
              aria-describedby={`${id}-rate-hint`}
            />
            <span className="text-sm text-[var(--color-muted)]">%</span>
          </div>
          {rate.kind === 'range' && !jeonse && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="상품 금리 선택">
              {(
                [
                  ['최저', rate.min],
                  ['최고', rate.max],
                ] as const
              ).map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={rateNum === v}
                  onClick={() => setRateInput(String(v))}
                  className={`${chipBase} ${rateNum === v ? chipOn : chipOff}`}
                >
                  {label} {v}%
                </button>
              ))}
            </div>
          )}
          <p id={`${id}-rate-hint`} className="mt-2 break-keep text-sm text-[var(--color-muted)]">
            {rateHint}
          </p>
        </div>

        {/* 대출기간 */}
        <div>
          <label htmlFor={`${id}-term`} className="mb-1.5 block text-sm font-semibold text-[var(--color-blue-dark)]">
            대출기간 <span className="font-normal text-[var(--color-muted)]">(계산을 위한 가정)</span>
          </label>
          <select
            id={`${id}-term`}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="min-h-[46px] w-full rounded-xl border border-[var(--color-line)] bg-white px-3 text-base text-[var(--color-text)] focus:border-[var(--color-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-sky-soft)]"
          >
            {TERM_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <p className="mt-2 break-keep text-sm text-[var(--color-muted)]">
            상품의 실제 대출기간과 관계없이, 같은 금리가 유지된다고 가정해 계산합니다.
          </p>
        </div>
      </div>

      {/* 결과 */}
      <div className="mt-5 rounded-2xl bg-[var(--color-soft)] px-4 py-4 sm:px-5" aria-live="polite">
        {result ? (
          <>
            <p className="text-sm text-[var(--color-muted-on-soft)]">예상 월 이자</p>
            <p className="text-[28px] font-extrabold tracking-tight text-[var(--color-blue-dark)] tabular-nums">
              {formatWonAmount(result.monthly)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-3">
              <div>
                <p className="text-sm text-[var(--color-muted-on-soft)]">연간 예상 이자</p>
                <p className="text-base font-bold text-[var(--color-blue-dark)] tabular-nums">
                  {formatWonAmount(result.annual)}
                </p>
              </div>
              <div>
                <p className="text-sm text-[var(--color-muted-on-soft)]">{years}년간 예상 총이자</p>
                <p className="text-base font-bold text-[var(--color-blue-dark)] tabular-nums">
                  {formatWonAmount(result.total)}
                </p>
              </div>
            </div>
            <details className="mt-3 border-t border-[var(--color-line)] pt-3">
              <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--color-blue-dark)]">
                금리가 오르면 얼마나 늘어날까요?
                <span aria-hidden className="text-[var(--color-muted)] [details[open]_&]:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] text-xs text-[var(--color-muted-on-soft)]">
                      <th scope="col" className="py-2 pr-2 text-left font-semibold">금리</th>
                      <th scope="col" className="px-1 py-2 text-right font-semibold sm:px-2">월 이자</th>
                      <th scope="col" className="py-2 pl-1 text-right font-semibold sm:pl-2">{years}년 총이자</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <tr className="border-b border-[var(--color-line)]">
                      <th scope="row" className="py-2 pr-2 text-left font-semibold">
                        입력 금리 <span className="block text-xs font-normal text-[var(--color-muted-on-soft)]">{rateNum}%</span>
                      </th>
                      <td className="whitespace-nowrap px-1 py-2 text-right sm:px-2">{formatWonAmount(result.monthly)}</td>
                      <td className="whitespace-nowrap py-2 pl-1 text-right sm:pl-2">{formatWonAmount(result.total)}</td>
                    </tr>
                    {RATE_SHOCKS.map((d) => {
                      const r = addRate(rateNum, d);
                      const s = bulletInterest(amount, r, years);
                      return (
                        <tr key={d} className="border-b border-[var(--color-line)] last:border-0">
                          <th scope="row" className="py-2 pr-2 text-left font-semibold">
                            +{d.toFixed(1)}%p{' '}
                            <span className="block text-xs font-normal text-[var(--color-muted-on-soft)]">{r}%</span>
                          </th>
                          <td className="whitespace-nowrap px-1 py-2 text-right sm:px-2">
                            {formatWonAmount(s.monthly)}
                            <span className="block text-xs text-[var(--color-muted-on-soft)]">
                              월 +{formatWonAmount(s.monthly - result.monthly)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2 pl-1 text-right sm:pl-2">
                            {formatWonAmount(s.total)}
                            <span className="block text-xs text-[var(--color-muted-on-soft)]">
                              +{formatWonAmount(s.total - result.total)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="py-1 text-sm text-[var(--color-muted-on-soft)]">
            {rateInput !== '' && !rateOk
              ? `연 금리는 ${MIN_RATE}~${MAX_RATE}% 사이로 입력하세요.`
              : '대출금액과 연 금리를 입력하면 예상 이자를 보여 드립니다.'}
          </p>
        )}
      </div>

      <ul className="mt-4 list-disc space-y-1 border-t border-dashed border-[var(--color-line)] pl-5 pt-3 text-sm text-[var(--color-muted)]">
        <li className="break-keep">
          모든 금액은 <strong className="font-semibold text-[var(--color-text)]">예상 금액</strong>입니다. 실제 이자는
          은행의 일할 계산 방식(대출 일수 기준)과 납입일에 따라 이 금액과 다를 수 있습니다.
        </li>
        {(variableRate || jeonse) && (
          <li className="break-keep">변동금리 대출은 기간 중 금리가 바뀌면 이자도 바뀝니다.</li>
        )}
        <li className="break-keep">
          보증료·인지세 등 부대비용과 우대금리{jeonse ? '·이자지원' : ''}은 반영하지 않았습니다.
        </li>
        {jeonse && (
          <li className="break-keep">
            실제 대출 가능 금액은 보증한도와 별개로 소득·보증금·은행 심사에 따라 정해집니다.
          </li>
        )}
      </ul>
      {sourceLine && <p className="mt-2 text-xs text-[var(--color-muted)]">{sourceLine}</p>}
    </Card>
  );
}
