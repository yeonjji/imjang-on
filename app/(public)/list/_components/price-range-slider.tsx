'use client';

import { useState, useEffect } from 'react';

interface Props {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
}

function formatManwon(v: number): string {
  if (v === 0) return '0원';
  if (v % 10_000 === 0) return `${v / 10_000}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1)}억`;
  if (v % 1_000 === 0) return `${v / 1_000}천만`;
  return `${v}만`;
}

const THUMB_STYLE =
  'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto ' +
  '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 ' +
  '[&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-white ' +
  '[&::-webkit-slider-thumb]:shadow-md ' +
  '[&::-webkit-slider-thumb]:ring-2 ' +
  '[&::-webkit-slider-thumb]:ring-[var(--color-blue)]';

export function PriceRangeSlider({ min, max, step, valueMin, valueMax, onChange }: Props) {
  const [localMin, setLocalMin] = useState(valueMin);
  const [localMax, setLocalMax] = useState(valueMax);

  useEffect(() => { setLocalMin(valueMin); }, [valueMin]);
  useEffect(() => { setLocalMax(valueMax); }, [valueMax]);

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const leftPct = pct(localMin);
  const widthPct = pct(localMax) - leftPct;
  const isDefault = localMin === min && localMax === max;
  const rangeLabel = isDefault ? '전체' : `${formatManwon(localMin)} ~ ${formatManwon(localMax)}`;

  function commit() {
    onChange(localMin, localMax);
  }

  return (
    <div className="hidden md:block space-y-3">
      <div className="flex justify-between text-xs text-[var(--color-muted)]">
        <span>{formatManwon(min)}</span>
        <span className="font-semibold text-[var(--color-blue-dark)]">{rangeLabel}</span>
        <span>{formatManwon(max)}</span>
      </div>

      <div className="relative h-5">
        {/* 배경 트랙 */}
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-[var(--color-soft)]" />
        {/* 선택 구간 강조 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--color-blue)]"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        {/* 최솟값 핸들 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={(e) => setLocalMin(Math.min(Number(e.target.value), localMax - step))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className={THUMB_STYLE}
        />
        {/* 최댓값 핸들 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={(e) => setLocalMax(Math.max(Number(e.target.value), localMin + step))}
          onMouseUp={commit}
          onTouchEnd={commit}
          className={THUMB_STYLE}
        />
      </div>
    </div>
  );
}
