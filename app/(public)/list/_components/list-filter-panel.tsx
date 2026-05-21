'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { PriceRangeSlider } from './price-range-slider';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface SigunguItem {
  code: string;
  sigungu: string;
  fullName: string;
  sigunguCode: string;
}

interface Props {
  sidoList: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

export function ListFilterPanel({ sidoList, params: externalParams, onParamsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const effectiveParams = externalParams ?? searchParams;

  const type = effectiveParams.get('type') ?? 'all';
  const deal = effectiveParams.get('deal') ?? 'all';
  const priceMin = effectiveParams.get('price_min');
  const priceMax = effectiveParams.get('price_max');

  const DEAL_SLIDER: Record<string, { max: number; step: number }> = {
    sale:   { max: 200_000, step:  5_000 },
    jeonse: { max: 100_000, step:  5_000 },
    wolse:  { max:  20_000, step:  1_000 },
    all:    { max: 200_000, step:  5_000 },
  };
  const slider = DEAL_SLIDER[deal] ?? DEAL_SLIDER.all;
  const sliderMin = 0;
  const sliderMax = slider.max;
  const sliderStep = slider.step;
  const sliderValMin = Math.min(priceMin ? Number(priceMin) : sliderMin, sliderMax);
  const sliderValMax = Math.min(priceMax ? Number(priceMax) : sliderMax, sliderMax);
  const area = effectiveParams.get('area') ?? null;
  const sort = effectiveParams.get('sort') ?? 'recent';
  const region = effectiveParams.get('region') ?? null;
  const sido = effectiveParams.get('sido') ?? null;

  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);

  useEffect(() => {
    if (!sido) { setSigunguList([]); return; }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((data: SigunguItem[]) => setSigunguList(data));
  }, [sido]);

  const hasActiveFilters =
    type !== 'all' || deal !== 'all' || !!priceMin || !!priceMax || !!area || sort !== 'recent' || !!region || !!sido;

  function updateParams(updates: Record<string, string | null>) {
    const base = externalParams ?? searchParams;
    const next = new URLSearchParams(base.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.delete('page');
    if (onParamsChange) {
      onParamsChange(next);
    } else {
      router.push(`/list?${next.toString()}`);
    }
  }

  const priceLabel =
    deal === 'jeonse' ? '전세 보증금 기준'
    : deal === 'wolse' ? '월세 보증금 기준'
    : '매매가 기준';

  return (
    <div className="flex flex-col gap-6">
      {/* 주거유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주거유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={type === 'all'} onClick={() => updateParams({ type: 'all' })}>전체</Chip>
          <Chip active={type === 'apt'} onClick={() => updateParams({ type: type === 'apt' ? 'all' : 'apt' })}>아파트</Chip>
          <Chip active={type === 'officetel'} onClick={() => updateParams({ type: type === 'officetel' ? 'all' : 'officetel' })}>오피스텔</Chip>
          <Chip active={type === 'villa'} onClick={() => updateParams({ type: type === 'villa' ? 'all' : 'villa' })}>다세대</Chip>
        </div>
      </section>

      {/* 거래유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">거래유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={deal === 'all'} onClick={() => updateParams({ deal: 'all', price_min: null, price_max: null })}>전체</Chip>
          <Chip active={deal === 'sale'} onClick={() => updateParams({ deal: deal === 'sale' ? 'all' : 'sale', price_min: null, price_max: null })}>매매</Chip>
          <Chip active={deal === 'jeonse'} onClick={() => updateParams({ deal: deal === 'jeonse' ? 'all' : 'jeonse', price_min: null, price_max: null })}>전세</Chip>
          <Chip active={deal === 'wolse'} onClick={() => updateParams({ deal: deal === 'wolse' ? 'all' : 'wolse', price_min: null, price_max: null })}>월세</Chip>
        </div>
      </section>

      {/* 지역 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="flex flex-col gap-2 mt-2">
          <select
            value={sido ?? ''}
            onChange={(e) =>
              updateParams({ sido: e.target.value || null, region: null })
            }
            className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            <option value="">시도 전체</option>
            {sidoList.map((s) => (
              <option key={s.code} value={s.sido}>{s.fullName}</option>
            ))}
          </select>
          {sigunguList.length > 0 && (
            <select
              value={region ?? ''}
              onChange={(e) =>
                updateParams({ region: e.target.value || null })
              }
              className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
            >
              <option value="">시군구 전체</option>
              {sigunguList.map((sg) => (
                <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>
              ))}
            </select>
          )}
        </div>
      </section>

      {/* 가격대 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">
          가격대<span className="ml-1 text-xs text-[var(--color-muted)]">{priceLabel}</span>
        </h3>

        {/* 데스크톱: 슬라이더 */}
        <div className="mt-2">
          <PriceRangeSlider
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            valueMin={sliderValMin}
            valueMax={sliderValMax}
            onChange={(min, max) => {
              updateParams({
                price_min: min === sliderMin ? null : String(min),
                price_max: max === sliderMax ? null : String(max),
              });
            }}
          />
        </div>

        {/* 모바일: 기존 칩 */}
        <div className="flex flex-wrap gap-2 mt-2 md:hidden">
          <Chip
            active={!priceMin && !priceMax}
            onClick={() => updateParams({ price_min: null, price_max: null })}
          >전체</Chip>
          <Chip
            active={!priceMin && priceMax === '50000'}
            onClick={() => updateParams({ price_min: null, price_max: '50000' })}
          >5억 이하</Chip>
          <Chip
            active={priceMin === '50000' && priceMax === '100000'}
            onClick={() => updateParams({ price_min: '50000', price_max: '100000' })}
          >5~10억</Chip>
          <Chip
            active={priceMin === '100000' && priceMax === '150000'}
            onClick={() => updateParams({ price_min: '100000', price_max: '150000' })}
          >10~15억</Chip>
          <Chip
            active={priceMin === '150000' && !priceMax}
            onClick={() => updateParams({ price_min: '150000', price_max: null })}
          >15억 이상</Chip>
        </div>
      </section>

      {/* 면적 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">면적</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={area === 'small'} onClick={() => updateParams({ area: area === 'small' ? null : 'small' })}>~59㎡</Chip>
          <Chip active={area === 'medium'} onClick={() => updateParams({ area: area === 'medium' ? null : 'medium' })}>60~84㎡</Chip>
          <Chip active={area === 'large'} onClick={() => updateParams({ area: area === 'large' ? null : 'large' })}>85~114㎡</Chip>
          <Chip active={area === 'xlarge'} onClick={() => updateParams({ area: area === 'xlarge' ? null : 'xlarge' })}>115㎡~</Chip>
        </div>
      </section>

      {/* 정렬 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">정렬</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip active={sort === 'recent'} onClick={() => updateParams({ sort: 'recent' })}>최신거래순</Chip>
          <Chip active={sort === 'volume'} onClick={() => updateParams({ sort: 'volume' })}>거래많은순</Chip>
          <Chip active={sort === 'price_desc'} onClick={() => updateParams({ sort: 'price_desc' })}>가격 높은순</Chip>
          <Chip active={sort === 'price_asc'} onClick={() => updateParams({ sort: 'price_asc' })}>가격 낮은순</Chip>
        </div>
      </section>

      {hasActiveFilters && !onParamsChange && (
        <Button variant="ghost" size="sm" onClick={() => router.push('/list')}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
