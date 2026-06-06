'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import { SUBSCRIPTION_CATEGORIES } from '@/lib/subscription';

interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

interface Props {
  sidoList: SidoItem[];
  params?: URLSearchParams;
  onParamsChange?: (next: URLSearchParams) => void;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수중' },
  { value: 'upcoming', label: '예정' },
  { value: 'closed', label: '마감' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'recent', label: '마감임박순' },
  { value: 'notice', label: '공고일순' },
];

export function SubscriptionFilterPanel({ sidoList, params: externalParams, onParamsChange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const effective = externalParams ?? searchParams;

  const selectedCats = new Set((effective.get('category') ?? '').split(',').filter(Boolean));
  const sido = effective.get('sido') ?? '';
  const status = effective.get('status') ?? 'all';
  const sort = effective.get('sort') ?? 'recent';

  const hasActive = selectedCats.size > 0 || !!sido || status !== 'all' || sort !== 'recent';

  function update(updates: Record<string, string | null>) {
    const next = new URLSearchParams(effective.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    if (onParamsChange) onParamsChange(next);
    else router.push(`/subscription?${next.toString()}`);
  }

  function toggleCategory(slug: string) {
    const next = new Set(selectedCats);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    update({ category: next.size ? [...next].join(',') : null });
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">지역</h3>
        <div className="mt-2">
          <select
            value={sido}
            onChange={(e) => update({ sido: e.target.value || null })}
            className="w-full rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-blue-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
          >
            <option value="">시도 전체</option>
            {sidoList.map((s) => (
              <option key={s.code} value={s.sido}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">청약 유형</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUBSCRIPTION_CATEGORIES.map((c) => (
            <Chip key={c.slug} active={selectedCats.has(c.slug)} onClick={() => toggleCategory(c.slug)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">접수 상태</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              active={status === o.value}
              onClick={() => update({ status: o.value === 'all' ? null : o.value })}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">정렬</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {SORT_OPTIONS.map((o) => (
            <Chip key={o.value} active={sort === o.value} onClick={() => update({ sort: o.value })}>
              {o.label}
            </Chip>
          ))}
        </div>
      </section>

      {hasActive && !onParamsChange && (
        <Button variant="ghost" size="sm" onClick={() => router.push('/subscription')}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
