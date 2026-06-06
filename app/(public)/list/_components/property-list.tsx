import type { PropertyType } from '@prisma/client';
import { getPropertyList } from '@/lib/property';
import type { DealFilter, AreaRange, SortOption } from '@/lib/property';
import { PropertyListCard } from './property-list-card';
import { PaginationNav } from './pagination-nav';

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
  page: number;
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
  page,
}: Props) {
  const { rows, total, totalPages, perPage } = await getPropertyList({
    types,
    deal,
    priceMin,
    priceMax,
    areaRange,
    sort,
    sigunguCode,
    sido,
    q,
    page,
    perPage: 30,
  });

  return (
    <>
      <div className="mb-4 rounded-[18px] border border-[var(--color-line)] bg-white px-5 py-3 shadow-[var(--shadow)]">
        <p className="text-base font-bold text-[var(--color-blue-dark)]">
          검색 결과 <span className="text-[var(--color-blue)]">{total.toLocaleString('ko-KR')}</span>건
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[var(--color-line)] bg-white p-12 text-center text-[var(--color-muted)]">
          조건에 맞는 매물이 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((p) => (
            <PropertyListCard key={String(p.id)} property={p} deal={deal} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <PaginationNav
            current={page}
            totalPages={totalPages}
            totalItems={total}
            perPage={perPage}
          />
        </div>
      )}
    </>
  );
}
