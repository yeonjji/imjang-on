'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { formatBillion } from '@/lib/format';

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
}

type TypeValue = 'all' | 'apt' | 'officetel' | 'villa';
type DealValue = 'all' | 'sale' | 'jeonse' | 'wolse';
type AreaValue = 'small' | 'medium' | 'large' | 'xlarge';

const TYPE_OPTIONS: { value: TypeValue; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'apt', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '다세대' },
];

const DEAL_OPTIONS: { value: DealValue; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'wolse', label: '월세' },
];

const AREA_OPTIONS: { value: AreaValue; label: string }[] = [
  { value: 'small', label: '~59㎡' },
  { value: 'medium', label: '60~84㎡' },
  { value: 'large', label: '85~114㎡' },
  { value: 'xlarge', label: '115㎡~' },
];

// 만원 단위 금액 프리셋 — 거래유형에 따라 범위가 달라진다.
const PRICE_PRESETS: Record<DealValue, number[]> = {
  sale: [10_000, 20_000, 30_000, 50_000, 70_000, 100_000, 150_000, 200_000],
  jeonse: [5_000, 10_000, 20_000, 30_000, 50_000, 70_000, 100_000],
  wolse: [500, 1_000, 2_000, 3_000, 5_000, 10_000, 20_000],
  all: [10_000, 20_000, 30_000, 50_000, 70_000, 100_000, 150_000, 200_000],
};

export function MainSearchFilter({ sidoList }: Props) {
  const router = useRouter();

  const [type, setType] = useState<TypeValue>('all');
  const [deal, setDeal] = useState<DealValue>('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [area, setArea] = useState<AreaValue | ''>('');
  const [sido, setSido] = useState('');
  const [region, setRegion] = useState('');
  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([]);

  useEffect(() => {
    if (!sido) {
      setSigunguList([]);
      return;
    }
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}`)
      .then((r) => r.json())
      .then((data: SigunguItem[]) => setSigunguList(data))
      .catch(() => setSigunguList([]));
  }, [sido]);

  const pricePresets = PRICE_PRESETS[deal];
  const priceLabel =
    deal === 'jeonse' ? '전세 보증금'
    : deal === 'wolse' ? '월세 보증금'
    : '매매가';

  function handleDealChange(next: DealValue) {
    setDeal((prev) => (prev === next ? 'all' : next));
    // 거래유형이 바뀌면 금액 범위가 달라지므로 기존 금액 선택 초기화
    setPriceMin('');
    setPriceMax('');
  }

  function handleSearch() {
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    if (deal !== 'all') params.set('deal', deal);
    if (priceMin) params.set('price_min', priceMin);
    if (priceMax) params.set('price_max', priceMax);
    if (area) params.set('area', area);
    if (sido) params.set('sido', sido);
    if (region) params.set('region', region);
    const qs = params.toString();
    router.push(qs ? `/list?${qs}` : '/list');
  }

  const selectClass =
    'w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]';

  return (
    <div className="flex h-full flex-col rounded-[26px] border border-[var(--color-line)] bg-white p-6 shadow-[var(--shadow)]">
      <h2 className="mb-4 text-2xl font-black tracking-tight text-[var(--color-blue-dark)]">
        조건으로 실거래가 찾기
      </h2>

      <div className="flex flex-1 flex-col gap-5">
        {/* 유형 */}
        <section>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">유형</h3>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} active={type === o.value} onClick={() => setType(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* 거래유형 */}
        <section>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">거래유형</h3>
          <div className="flex flex-wrap gap-2">
            {DEAL_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                active={deal === o.value}
                onClick={() => (o.value === 'all' ? handleDealChange('all') : handleDealChange(o.value))}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* 금액 */}
        <section>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">
            금액<span className="ml-1 text-xs text-[var(--color-muted)]">{priceLabel} 기준</span>
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className={selectClass}
              aria-label="최소 금액"
            >
              <option value="">최소</option>
              {pricePresets.map((v) => (
                <option key={v} value={v} disabled={!!priceMax && v >= Number(priceMax)}>
                  {formatBillion(v)}
                </option>
              ))}
            </select>
            <span className="text-[var(--color-muted)]">~</span>
            <select
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className={selectClass}
              aria-label="최대 금액"
            >
              <option value="">최대</option>
              {pricePresets.map((v) => (
                <option key={v} value={v} disabled={!!priceMin && v <= Number(priceMin)}>
                  {formatBillion(v)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* 평수 */}
        <section>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">평수</h3>
          <div className="flex flex-wrap gap-2">
            {AREA_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                active={area === o.value}
                onClick={() => setArea((prev) => (prev === o.value ? '' : o.value))}
              >
                {o.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* 지역 */}
        <section>
          <h3 className="mb-2 text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={sido}
              onChange={(e) => {
                setSido(e.target.value);
                setRegion('');
              }}
              className={selectClass}
              aria-label="시도"
            >
              <option value="">시도 전체</option>
              {sidoList.map((s) => (
                <option key={s.code} value={s.sido}>{s.fullName}</option>
              ))}
            </select>
            {sigunguList.length > 0 && (
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className={selectClass}
                aria-label="시군구"
              >
                <option value="">시군구 전체</option>
                {sigunguList.map((sg) => (
                  <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>
                ))}
              </select>
            )}
          </div>
        </section>

        <Button size="lg" onClick={handleSearch} className="w-full">
          🔍 검색
        </Button>
      </div>
    </div>
  );
}
