import type { PropertyType } from '@prisma/client';
import { getPropertyList, serializeProperty } from '@/lib/property';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
import { InfinitePropertyList } from './infinite-property-list';

interface Props {
  types: PropertyType[];
  deal: DealFilter;
  priceMin?: number;
  priceMax?: number;
  areaRange?: AreaRange;
  sort: SortOption;
  sigunguCode?: string;
  sido?: string;
  q?: string;
  query: string;
}

export async function PropertyList({
  types,
  deal,
  priceMin,
  priceMax,
  areaRange,
  sort,
  sigunguCode,
  sido,
  q,
  query,
}: Props) {
  const { rows, total, totalPages } = await getPropertyList({
    types,
    deal,
    priceMin,
    priceMax,
    areaRange,
    sort,
    sigunguCode,
    sido,
    q,
    page: 1,
    perPage: 30,
  });

  const items = rows.map(serializeProperty);

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          검색 결과 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 매물이 없습니다.
        </div>
      ) : (
        <InfinitePropertyList
          key={query}
          initialItems={items}
          totalPages={totalPages}
          deal={deal}
          query={query}
        />
      )}
    </>
  );
}
